/**
 * CSV parsing and import planning — pure, deterministic, no I/O.
 *
 * A real supplier CSV is not `text.split(',')`. It contains quoted fields with embedded
 * commas and newlines, doubled quotes as escapes, a UTF-8 BOM, CRLF line endings, and
 * semicolon delimiters from European Excel. This parser handles all of that.
 *
 * The import is always planned as a DRY RUN first: every row is validated and classified
 * (create / update / skip / error) before a single document is written.
 */
import { parseMoney } from './money.js';

/* -------------------------------- parsing -------------------------------- */
/** Guess the delimiter from the header line: comma, semicolon, or tab. */
export function detectDelimiter(text) {
  const firstLine = String(text).split(/\r?\n/)[0] ?? '';
  const counts = { ',': 0, ';': 0, '\t': 0 };
  let inQuotes = false;
  for (const ch of firstLine) {
    if (ch === '"') inQuotes = !inQuotes;
    else if (!inQuotes && ch in counts) counts[ch]++;
  }
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][1] > 0
    ? Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0]
    : ',';
}

/**
 * RFC 4180 parser. Returns rows of raw string cells.
 * Handles: quoted fields, "" escapes, embedded delimiters/newlines, CRLF, BOM.
 */
export function parseCsv(text, delimiter) {
  let s = String(text).replace(/^\uFEFF/, '');   // strip BOM
  const d = delimiter ?? detectDelimiter(s);

  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < s.length; i++) {
    const ch = s[i];

    if (inQuotes) {
      if (ch === '"') {
        if (s[i + 1] === '"') { field += '"'; i++; }   // "" -> literal quote
        else inQuotes = false;
      } else field += ch;
      continue;
    }

    if (ch === '"') { inQuotes = true; continue; }
    if (ch === d) { row.push(field); field = ''; continue; }
    if (ch === '\r') continue;
    if (ch === '\n') { row.push(field); rows.push(row); row = []; field = ''; continue; }
    field += ch;
  }
  // Trailing field/row (file may not end with a newline).
  if (field !== '' || row.length) { row.push(field); rows.push(row); }

  return rows.filter((r) => r.some((c) => c.trim() !== ''));   // drop blank lines
}

/** Normalize a header cell: "Unit Cost (£)" -> "unitcost". */
export const normalizeHeader = (h) => String(h).toLowerCase().replace(/[^a-z0-9]/g, '');

/** Parse into objects keyed by normalized header, keeping the original header for display. */
export function parseCsvObjects(text) {
  const rows = parseCsv(text);
  if (!rows.length) return { headers: [], rows: [] };
  const rawHeaders = rows[0];
  const headers = rawHeaders.map(normalizeHeader);
  const objects = rows.slice(1).map((cells, idx) => {
    const obj = { __line: idx + 2 };   // line number in the original file (1-based, +header)
    headers.forEach((h, i) => { obj[h] = (cells[i] ?? '').trim(); });
    return obj;
  });
  return { headers, rawHeaders, rows: objects };
}

/* ------------------------------ column mapping --------------------------- */
/**
 * Map a CSV's headers onto our fields. Aliases cover what suppliers actually send —
 * "SKU", "sku", "Item Number", "Product Code" all mean the same thing.
 */
export const PRODUCT_COLUMNS = {
  sku: { aliases: ['sku', 'skucode', 'itemnumber', 'productcode', 'code'], required: true },
  title: { aliases: ['title', 'name', 'productname', 'description1', 'itemname'], required: false },
  description: { aliases: ['description', 'longdescription', 'details'], required: false },
  barcode: { aliases: ['barcode', 'ean', 'upc', 'gtin'], required: false },
  cost: { aliases: ['cost', 'unitcost', 'costprice', 'buyprice', 'wholesale'], required: false, money: true },
  price: { aliases: ['price', 'sellprice', 'retailprice', 'rrp', 'listprice'], required: false, money: true },
  quantity: { aliases: ['quantity', 'qty', 'stock', 'onhand', 'available'], required: false, integer: true },
  status: { aliases: ['status', 'state'], required: false },
  weightgrams: { aliases: ['weightgrams', 'weight', 'weightg'], required: false, integer: true },
};

/**
 * "Supply price list" mode — the merchant's *Only import: SKU, Price, Quantity*.
 * A supplier file often has dozens of columns you do NOT want overwriting your catalogue
 * (their titles, their descriptions). This restricts the import to three fields, so a
 * price list updates prices and stock and touches nothing else.
 */
export const SUPPLY_LIST_COLUMNS = {
  sku: PRODUCT_COLUMNS.sku,
  price: PRODUCT_COLUMNS.price,
  quantity: PRODUCT_COLUMNS.quantity,
};

/** Cost-only supplier list: SKU + cost (+ optional qty). */
export const COST_LIST_COLUMNS = {
  sku: PRODUCT_COLUMNS.sku,
  cost: PRODUCT_COLUMNS.cost,
  quantity: PRODUCT_COLUMNS.quantity,
};

export const COLUMN_SETS = {
  FULL: PRODUCT_COLUMNS,
  SUPPLY_LIST: SUPPLY_LIST_COLUMNS,
  COST_LIST: COST_LIST_COLUMNS,
};

/** Auto-map headers to fields; returns { mapping, unmapped, missingRequired }. */
export function autoMap(headers, columns = PRODUCT_COLUMNS) {
  const mapping = {};
  const used = new Set();
  for (const [field, spec] of Object.entries(columns)) {
    const hit = headers.find((h) => spec.aliases.includes(h) && !used.has(h));
    if (hit) { mapping[field] = hit; used.add(hit); }
  }
  return {
    mapping,
    unmapped: headers.filter((h) => !used.has(h)),
    missingRequired: Object.entries(columns).filter(([f, s]) => s.required && !mapping[f]).map(([f]) => f),
  };
}

/* ------------------------------ row validation --------------------------- */
/** Validate and coerce one row. Returns { value, errors } — never throws, never guesses. */
export function validateRow(row, mapping, currency, columns = PRODUCT_COLUMNS) {
  const errors = [];
  const value = { __line: row.__line };

  for (const [field, spec] of Object.entries(columns)) {
    const header = mapping[field];
    if (!header) continue;
    const raw = row[header];

    if (raw == null || raw === '') {
      if (spec.required) errors.push(`${field} is required`);
      continue;
    }

    if (spec.money) {
      const minor = parseMoney(raw, currency);
      if (minor == null) { errors.push(`${field}: "${raw}" is not a valid amount`); continue; }
      if (minor < 0) { errors.push(`${field}: cannot be negative`); continue; }
      value[field] = minor;
    } else if (spec.integer) {
      const n = Number(String(raw).replace(/[\s,]/g, ''));
      if (!Number.isFinite(n) || !Number.isInteger(n)) { errors.push(`${field}: "${raw}" is not a whole number`); continue; }
      if (n < 0) { errors.push(`${field}: cannot be negative`); continue; }
      value[field] = n;
    } else {
      value[field] = String(raw).trim();
    }
  }

  // Cross-field sanity: selling below cost is almost always a typo.
  if (value.cost != null && value.price != null && value.price < value.cost) {
    errors.push(`price ${value.price} is below cost ${value.cost}`);
  }
  if (value.sku && !/^[\w.-]+$/.test(value.sku)) {
    errors.push(`sku "${value.sku}" contains unsupported characters`);
  }

  return { value, errors };
}

/**
 * Build the import plan: classify each row against what already exists.
 *
 *   create  — SKU not in the database
 *   update  — SKU exists and at least one mapped field differs
 *   skip    — SKU exists and nothing changed (so we write nothing)
 *   error   — the row failed validation
 *
 * Duplicate SKUs *within the file* are an error, not a silent last-one-wins.
 */
export function buildImportPlan(rows, mapping, existingBySku, currency, columns = PRODUCT_COLUMNS) {
  const plan = [];
  const seen = new Map();

  for (const row of rows) {
    const { value, errors } = validateRow(row, mapping, currency, columns);

    if (value.sku) {
      if (seen.has(value.sku)) errors.push(`duplicate SKU in file (also on line ${seen.get(value.sku)})`);
      else seen.set(value.sku, value.__line);
    }

    if (errors.length) { plan.push({ line: value.__line, sku: value.sku, action: 'error', errors, value }); continue; }

    const existing = existingBySku.get(value.sku);
    if (!existing) { plan.push({ line: value.__line, sku: value.sku, action: 'create', value }); continue; }

    const changes = {};
    for (const field of Object.keys(mapping)) {
      if (field === 'sku' || value[field] == null) continue;
      if (existing[field] !== value[field]) changes[field] = { from: existing[field], to: value[field] };
    }

    plan.push(
      Object.keys(changes).length
        ? { line: value.__line, sku: value.sku, action: 'update', value, changes }
        : { line: value.__line, sku: value.sku, action: 'skip', value },
    );
  }
  return plan;
}

/** Headline counts for the preview screen. */
export function summarizePlan(plan) {
  const count = (a) => plan.filter((p) => p.action === a).length;
  return {
    total: plan.length,
    create: count('create'),
    update: count('update'),
    skip: count('skip'),
    error: count('error'),
    valid: plan.length - count('error'),
  };
}
