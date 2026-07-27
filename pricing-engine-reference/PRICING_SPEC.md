# Dynamic Pricing Engine — Specification

**Module:** `pricing` (slots into the existing NestJS backend, alongside `catalog` and `listings`)
**Source:** Voice note requirements, 2026-07-25
**Status:** Draft v1 — ready for implementation review

---

## 1. Purpose

Every item imported from a supplier CSV needs its **Website Price** calculated automatically —
never hand-typed, never flat-rated. The price must fully absorb postage so the storefront can
always advertise **"Free Delivery"** while still recovering shipping cost and margin.

## 2. Formula

```
Website Price = (Supplier Cost + Postage + Profit) × (1 + VAT%)
```

| Term | Source | Notes |
|---|---|---|
| Supplier Cost | CSV import (per item) | Raw cost from supplier, unmodified |
| Postage | Postage Tier lookup (per item) | NOT flat — resolved dynamically, see §3 |
| Profit | Margin rule (per item / per category) | Fixed amount or % — see §4 |
| VAT % | Tax config | Applied last, on top of (Cost + Postage + Profit) |

This order matters: VAT is calculated on the **subtotal that already includes postage and
profit**, not just on the raw cost.

## 3. Postage Tiers

- There are **4 standard postage tiers**, driven by item dimensions/weight.
- A **5th "special" tier** exists but is optional — it can be left blank/unset for now and
  wired up later without a schema change.
- **No item may be charged a flat postage fee** (e.g. a blanket £7.00 or £1.50 for everything).
  Every item must resolve to a tier via its dimensions/weight/category — either through a
  mapping table or a rule engine, not a hardcoded constant.

| Tier | Label | Status |
|---|---|---|
| 1 | Standard Small | Active |
| 2 | Standard Medium | Active |
| 3 | Standard Large | Active |
| 4 | Standard Oversized | Active |
| 5 | Special / Custom | Optional — placeholder, no rate required yet |

## 4. Profit Margin

Profit can be modeled as either:
- a **fixed amount per item**, or
- a **percentage of (Cost + Postage)**

The engine supports both; the business decides per-category which mode applies (configurable,
not hardcoded).

## 5. Business Rules (hard constraints)

1. **Free Delivery is always shown to the customer.** Postage is never a separate line item on
   the storefront — it is embedded in the Website Price.
2. **No flat-rate postage or pricing across all inventory.** Every item's price is derived from
   its own cost + its own resolved tier.
3. **VAT is applied last**, over the full subtotal (Cost + Postage + Profit).
4. **Tier 5 is optional** and must not block calculation when unset — items without a tier fall
   back to tier resolution by rule (dimension/weight/category), never to a default flat fee.
5. Every calculation must be **traceable** — given a Website Price, you should be able to see
   which cost, tier, postage rate, profit rule, and VAT rate produced it (for auditing pricing
   complaints/margin checks).

## 6. Open Questions for Implementation

- What determines which of the 4 tiers an item falls into — weight, dimensions, category, or
  a combination? (Needed to build the resolver rule.)
- Is Profit a flat £ amount, a %, or does it vary by category/supplier?
- What is the current VAT rate, and does it ever vary by product category (e.g. reduced-rate
  goods)?
- Should Tier 5 have a rate now, or genuinely stay blank until further notice?
