/**
 * Warehouse domain logic — pure, ported from the original platform's bin-location,
 * pick-path, allocation, and putaway cores. No I/O; deterministic and unit-testable.
 */

/* ----------------------------- bin locations ----------------------------- */
/** Parse an "A-12-3" style bin code into aisle / bay / level. */
export function parseBinCode(code) {
  const m = /^([A-Za-z]+)[-_ ]?(\d+)[-_ ]?(\d+)?$/.exec(String(code).trim());
  if (!m) return { aisle: String(code).trim().toUpperCase(), bay: 0, level: 0 };
  return { aisle: m[1].toUpperCase(), bay: Number(m[2] ?? 0), level: Number(m[3] ?? 0) };
}

/**
 * Serpentine sort key: even aisles ascend by bay, odd aisles descend, so a picker snakes
 * down one aisle and back up the next instead of walking each aisle from the start.
 * Encodes aisle/bay/level into a single sortable integer.
 */
export function serpentineSortKey(code, maxBay = 100) {
  const { aisle, bay, level } = parseBinCode(code);
  const aisleIndex = aisle.split('').reduce((acc, c) => acc * 27 + (c.charCodeAt(0) - 64), 0);
  const bayOrder = aisleIndex % 2 === 0 ? bay : (maxBay - bay);
  return aisleIndex * 100000 + bayOrder * 100 + level;
}

/** Compare two bins by serpentine order. */
export function compareBins(a, b) {
  const ka = a.sortKey ?? serpentineSortKey(a.code);
  const kb = b.sortKey ?? serpentineSortKey(b.code);
  return ka - kb;
}

/* ------------------------------- pick path ------------------------------- */
/** Order pick items along an efficient serpentine path; unbinned items go last. */
export function sequencePicks(items) {
  return [...items].sort((a, b) => {
    if (a.bin && b.bin) return compareBins(a.bin, b.bin);
    if (a.bin) return -1;
    if (b.bin) return 1;
    return 0;
  });
}

/** Assign a numeric sortKey to each pick item (for persistence). */
export function withSortKeys(items) {
  return sequencePicks(items).map((it, idx) => ({
    ...it,
    sortKey: it.bin?.sortKey ?? (it.bin ? serpentineSortKey(it.bin.code) : 1_000_000 + idx),
  }));
}

/* ------------------------------- allocation ------------------------------ */
/**
 * Allocate order lines to warehouses given available stock.
 *  - SINGLE_WAREHOUSE: prefer one warehouse that can fill the whole order; else best-effort.
 *  - PRIORITY: fill each line from the highest-priority warehouse first, spilling onward.
 *  - SPLIT: same as PRIORITY but freely splits a line across warehouses.
 * `available` is decremented as we go so two lines never double-book the same units.
 */
export function allocate(lines, stock, strategy = 'PRIORITY') {
  const warehouses = [...stock].sort((a, b) => b.priority - a.priority).map((w) => ({ ...w, available: { ...w.available } }));
  const allocations = [];
  const shortfalls = [];

  if (strategy === 'SINGLE_WAREHOUSE') {
    const whole = warehouses.find((w) => lines.every((l) => (w.available[l.productId] ?? 0) >= l.quantity));
    if (whole) {
      for (const l of lines) {
        allocations.push({ orderItemId: l.orderItemId, productId: l.productId, warehouseId: whole.warehouseId, quantity: l.quantity });
        whole.available[l.productId] -= l.quantity;
      }
      return { allocations, shortfalls };
    }
    // fall through to best-effort priority fill
  }

  for (const l of lines) {
    let remaining = l.quantity;
    for (const w of warehouses) {
      if (remaining <= 0) break;
      const have = w.available[l.productId] ?? 0;
      if (have <= 0) continue;
      const take = Math.min(have, remaining);
      allocations.push({ orderItemId: l.orderItemId, productId: l.productId, warehouseId: w.warehouseId, quantity: take });
      w.available[l.productId] = have - take;
      remaining -= take;
    }
    if (remaining > 0) shortfalls.push({ orderItemId: l.orderItemId, productId: l.productId, quantity: remaining });
  }
  return { allocations, shortfalls };
}

/* -------------------------------- put-away ------------------------------- */
/**
 * Suggest a put-away bin per line: prefer a STORAGE bin that already holds the same
 * product (consolidation) with spare capacity, else the emptiest pickable STORAGE bin
 * that can hold the quantity. Capacity is decremented as suggestions are made.
 */
export function suggestPutaway(lines, bins) {
  const pool = bins.map((b) => ({ ...b }));
  const out = [];
  for (const line of lines) {
    const fits = (b) => b.isPickable && b.zoneType === 'STORAGE' && (b.maxUnits == null || b.currentUnits + line.quantity <= b.maxUnits);
    const consolidate = pool.filter((b) => b.hasSameProduct && fits(b)).sort((a, b) => a.currentUnits - b.currentUnits)[0];
    const empty = pool.filter((b) => fits(b)).sort((a, b) => a.currentUnits - b.currentUnits)[0];
    const chosen = consolidate ?? empty;
    if (chosen) {
      out.push({ productId: line.productId, binId: chosen.id, binCode: chosen.code, quantity: line.quantity });
      chosen.currentUnits += line.quantity;
    } else {
      out.push({ productId: line.productId, binId: null, binCode: null, quantity: line.quantity });
    }
  }
  return out;
}
