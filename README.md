# MCCMS — Node.js + React + MongoDB

The Multi-Channel Commerce Management System in your requested stack:
**Node.js + Express** (no NestJS), **React + Vite** (no Next.js), **MongoDB + Mongoose** (no Prisma).

**All 20 modules are complete** and runnable end to end across both tiers, with the domain logic
verified by executing it — not merely transcribed.

## Porting status

| Module | Backend | Frontend | Notes |
|---|:--:|:--:|---|
| Auth | ✅ | ✅ | bcrypt + JWT, permission sets |
| Products | ✅ | ✅ | CRUD, org-scoped, paginated, soft delete |
| Orders | ✅ | ✅ | lines priced from products, totals in minor units |
| Customers | ✅ | ✅ | notes, LTV/AOV/RFM metrics, fuzzy duplicate detection |
| Inventory | ✅ | ✅ | warehouses, stock levels, atomic reservations (no overselling), movement ledger, demand forecast + reorder report |
| Pricing | ✅ | ✅ | 5 rule strategies, target-margin algebra, marketplace fees, charm rounding, promotions, coupons, bulk repricing, price history |
| Shipping | ✅ | ✅ | multi-carrier rate shopping, dim/billable weight, package selection, carrier rules, labels, tracking normalization |
| Warehouse | ✅ | ✅ | bins, receiving (PO-aware), put-away consolidation, multi-warehouse allocation, serpentine pick paths |
| Listings / Sync | ✅ | ✅ | delta sync, drift detection + conflict policies, **idempotent outbox** (no double-posts), backoff retries, channel price rules |
| **Channels** | ✅ | ✅ | attach eBay / Shopify / Woo / custom stores (encrypted creds), **per-channel target margins**, automatic price propagation, drift detection |
| **Import (CSV)** | ✅ | ✅ | RFC 4180 parser, column auto-mapping, dry-run preview, per-row validation, commit repricing every store |
| **Settings** | ✅ | ✅ | org currency (GBP default), correct minor-unit handling incl. zero-decimal currencies |
| Analytics | ✅ | ✅ | pre-aggregated daily rollups, KPIs w/ period comparison, P&L, Pareto, channel mix, inventory valuation, CSV export |
| Notifications | ✅ | ✅ | templates w/ {{vars}}, preference engine, quiet hours, dedupe, digests, multi-channel fan-out |
| Admin | ✅ | ✅ | API credentials (hash-only), feature flags w/ deterministic % rollout, RBAC wildcards, signed webhooks, redacting audit log |
| Search | ✅ | ✅ | Damerau fuzzy matching, GTIN barcode checksums, weighted scoring, facets, synonyms, highlighting, zero-result analytics |
| Automation | ✅ | ✅ | cron parser, nested rule engine, retry backoff + state machine, workflows, event bus, queue monitoring & alerts |
| Security | ✅ | ✅ | AES-256-GCM field encryption, account lockout (enforced at login), rate limiting, CIDR allowlist, sessions, GDPR, retention, compliance scoring |
| **AI** | ✅ | ✅ | Holt forecasting, elasticity pricing w/ guardrails, MAD anomaly detection, similarity, metered LLM calls, echo provider (no API key) |
| **Developer Platform** | ✅ | ✅ | OAuth2 (client_credentials, auth_code + PKCE, refresh), scoped keys, sandbox/live, signed webhooks + retry, quota tiers, OpenAPI + SDK from one registry, live `/v1` gateway |

## What runs today

- **Auth** — register / login (bcrypt + JWT) / me, with embedded permission sets.
- **Products** — full CRUD, org-scoped, paginated, permission-gated, soft delete.
- **Orders** — create (prices lines from the product catalog, computes totals in integer minor
  units via the pure pricing core), list, status change.
- **Customers** — CRUD, embedded notes, **LTV / AOV / order-frequency metrics** and **RFM lifecycle
  segmentation** (VIP / ACTIVE / NEW / AT_RISK / LAPSED / PROSPECT), plus **fuzzy duplicate
  detection** using Levenshtein similarity over email, phone, and name. These are the real CRM
  algorithms ported from the original platform, not placeholders.
- **Inventory** — warehouses, per-warehouse stock levels with **derived** `available`/`sellable`
  (never stored), **atomic reservations that cannot oversell** under concurrency, release/fulfill
  transitions, an append-only movement ledger, and **demand forecasting** (avg daily demand, days of
  cover, projected stockout, recommended reorder qty) with a reorder report.
- **Pricing** — a deterministic **calculation engine**: five rule strategies (cost-plus-margin,
  markup, fixed, competitive, margin-floor), **target-margin algebra that solves for price after
  marketplace fees**, min/max guardrails, charm rounding, promotions, and coupons. Every quote
  returns list/final price, a fee breakdown, net proceeds, profit, margin in bps, guardrail flags,
  and a step-by-step audit trail. Plus bulk repricing and an append-only price-change history.
- **Shipping** — **multi-carrier rate shopping** (USPS/UPS/FedEx adapters queried in parallel),
  **dimensional & billable weight**, smallest-package selection, carrier rules that can force a
  carrier/service, label purchase, and **tracking-status normalization** with terminal-state
  handling. Carrier adapters are a documented seam: the defaults are runnable simulations, swap in
  EasyPost/Shippo/UPS APIs without touching anything else.
- **Warehouse** — bin locations with **serpentine pick-path optimization** (the picker snakes down
  one aisle and back up the next), **receiving** that feeds stock through the inventory module's
  guarded adjust (and already understands `PURCHASE_ORDER` sources), **put-away suggestions** that
  consolidate into bins already holding the product, and **multi-warehouse allocation** with three
  strategies (single-warehouse, priority spill, split) that reports shortfalls.
- **Listings & marketplace sync** — the **delta-sync engine**: computes the quantity each channel
  should show (warehouse buffers, priority-fill vs sum-all allocation, selective push %), detects
  **drift** when a marketplace's quantity diverges from what we last pushed, and resolves it by the
  channel's policy (system-wins / marketplace-wins / newest-wins). Every marketplace write goes
  through an **idempotent outbox**, so a retry can never double-post — the gap flagged in the
  original platform review. Transient failures retry with exponential backoff; permanent ones
  dead-letter. Marketplace adapters are a seam (runnable simulations by default).
- **Analytics** — **pre-aggregated daily rollups** so dashboards never scan the orders collection
  (cost is O(days), not O(orders)). KPIs with period-over-period comparison, a revenue timeseries
  that fills empty buckets and overlays the prior period, a **P&L statement** with real COGS from
  the cost basis, revenue-by-channel with share %, **Pareto (80/20)** top products, inventory
  valuation at cost, and CSV export with proper quoting.
- **Notifications** — a real **preference engine**: templates with `{{var}}` interpolation (dotted
  paths, HTML escaping, missing-var reporting), per-(category, channel) opt-outs, **quiet hours**
  that wrap midnight, **dedupe** windows that collapse repeat alerts, and **digests** for deferred
  messages. Two safety properties are enforced: `URGENT` priority and non-suppressible categories
  (`ERROR`, `SYNC_FAILURE`) always break through opt-outs and quiet hours — critical alerts can
  never be silently dropped. Channel adapters (email/SMS/push) are a seam; in-app is real.
- **Admin** — API credentials (only the sha-256 hash is stored; plaintext shown **once**), **feature
  flags** with deterministic hash-bucketed percentage rollouts (sticky per user), **RBAC with
  wildcard permissions** (`orders:*` grants every orders action) validated against a catalog,
  **HMAC-signed webhooks** with replay protection, and an **audit log that redacts secrets**
  (password/token/apiKey/hash fields never reach storage). `writeAudit()` and `dispatchWebhook()`
  are exported for any module to use.
- **Search** — a working search engine: **Damerau-Levenshtein fuzzy matching** with Elasticsearch-style
  AUTO fuzziness (a transposition costs one edit, so "keyborad" finds "keyboard"), **field-weighted
  relevance** (an SKU hit outranks a title hit outranks a description hit), facets, structured
  filters, synonym expansion, `<mark>` highlighting with snippets, and autocomplete + "did you mean".
  **Barcode scanning short-circuits to exact lookup** with real GTIN mod-10 checksum validation
  (EAN-8/13, UPC-A, GTIN-14). Search analytics surface **zero-result queries** — the catalog gaps.
  The in-memory engine is the default and fully functional; the OpenSearch adapter is a seam.
- **Automation** — a real job engine: a **5-field cron parser** (lists, ranges, steps), a **nested
  rule engine** (`all`/`any`/`not` trees with 11 comparators over dotted paths), **retry policies**
  (fixed/linear/exponential with cap and jitter) driven by a **guarded state machine** that refuses
  illegal transitions, **multi-step workflows** with `{{trigger.x}}` interpolation and per-step
  conditions, an **event bus** other modules emit to, and queue monitoring with threshold alerts.
  Built-in handlers reuse existing services (sync listings, drain outbox, rebuild rollups, reindex,
  reorder check, notify). The in-memory queue is functional; BullMQ/Redis is the documented seam.
- **Security** — **AES-256-GCM field encryption** (tampering throws, thanks to the GCM auth tag),
  **account lockout enforced in the real login path** (checked *before* the password, so a locked
  account leaks no timing signal), IP-CIDR allowlisting, **fixed-window rate limiting applied to
  `/auth`**, session management (token hashes only, concurrent-session cap), brute-force detection
  and 0–100 risk scoring, upload validation (magic bytes, double extensions, **path traversal**),
  GDPR subject-access exports and erasure with a dry-run plan, data-retention policies, and
  compliance scoring that excludes N/A controls from the denominator.
- **AI** — the guiding principle is **the model narrates; it never calculates**. Holt's linear-trend
  forecasting, safety stock (z·σ·√leadTime), reorder points, elasticity-based price suggestions,
  Jaccard+trigram similarity, and MAD-based anomaly detection are all computed deterministically in
  code; the LLM is only asked to *explain* the figures — so a hallucinated number is structurally
  impossible. Every call is **metered** (tokens, cost in minor units, latency, errors) and
  rate-limited per user. The **ECHO provider is the default and fully functional** — every AI feature
  works with no API key and zero cost; OpenAI and Anthropic adapters need only a key.
- **Channels (multi-store commerce)** — attach your **eBay account(s)**, **Shopify / WooCommerce
  site**, or a custom website. Credentials are **AES-256-GCM encrypted** at rest and never returned
  by the API. You set a **target margin per store, not a markup**: because eBay takes ~12.9% and your
  own site only pays ~2.9% payment processing, the engine *solves* for the list price that nets your
  margin on each — so a $10-cost item lists at **$16.99 on eBay (25% target)** and **$19.99 on the
  brand website (45% target)**. A **margin floor** is a hard clamp nothing can cross. Change a cost
  or a price anywhere in the platform and every connected store is **repriced automatically** through
  the idempotent outbox (a delta gate means an unchanged price costs zero API calls; a retried push
  can never double-post). **Drift detection** catches prices edited directly in the eBay UI.
- **Developer platform** — a real public API, not just a console. **OAuth 2.0** (client_credentials,
  authorization_code with **PKCE**, refresh-token rotation; codes are single-use), scoped platform
  keys where **the key prefix *is* the environment** (`dk_test_` can read and simulate but can never
  cause an external side effect; `dk_live_` can), **signed webhooks** (`HMAC-SHA256(timestamp.body)`)
  with exponential-backoff retry and dead-lettering, monthly **quota tiers**, and API versioning.
  The **OpenAPI document, the SDK plan, and the live `/api/v1/*` routes are all generated from one
  endpoint registry**, so they cannot drift. An API-gateway middleware authenticates external callers
  by key or token, resolves their version, enforces their quota, checks scopes, and meters every request.
- **Frontend** — login, products, orders, customers (insights + duplicates), inventory (live stock,
  adjustments, reorder suggestions), pricing (quote explorer with margin, fees, flags, and the
  engine's calculation steps), shipping (carrier rate comparison + tracking), warehouse (receiving,
  put-away suggestions, serpentine pick lists, bin map), listings (sync status, health, outbox with
  idempotency keys, conflicts log), analytics (KPI tiles, revenue-vs-prior chart, P&L, channel mix,
  top products, inventory valuation), notifications (bell menu with unread badge, inbox with
  per-channel delivery status, preferences, template tester, provider outbox), and admin
  (credentials, flag rollout sliders, role editor with wildcards, webhook tester, audit trail), and
  search (omnibox with highlighting, suggestions, barcode detection, index status, synonyms,
  zero-result analytics), and automation (queue monitoring with live alerts, run history with retry
  attempts, cron schedules, rule dry-runs, workflow runner), and security (event dashboard with
  severity + risk, session control, IP allowlist, GDPR requests with dry-run erasure, compliance
  readiness with prioritized gaps), and AI (forecast with computed figures + narration, catalog copy
  and keyword generation, price suggestions showing when a guardrail fired, and a usage/cost meter),
  and the developer console (keys with one-time reveal, OAuth clients, webhook subscriptions with a
  live delivery log, usage/quota, and an API reference generated from the registry).

## Run it

### 1. MongoDB
Local install, or Docker: `docker run -d -p 27017:27017 --name mccms-mongo mongo:7`

### 2. Backend
```
cd backend
cp .env.example .env          # set MONGODB_URI + JWT_SECRET
npm install
npm run seed                  # admin@mccms.test / password123 + sample products & customers
npm run dev                   # http://localhost:4000  (health: /api/health)
```

### 3. Frontend
```
cd frontend
npm install
npm run dev                   # http://localhost:5173  (proxies /api to :4000)
```
Log in with **admin@mccms.test / password123**. The seed includes a deliberate near-duplicate
customer so the duplicates panel has something to show.

## API surface (current)

```
GET    /api/health
POST   /api/auth/register        POST /api/auth/login        GET /api/auth/me
GET    /api/products             POST /api/products
GET    /api/products/:id         PUT  /api/products/:id      DELETE /api/products/:id
GET    /api/orders               POST /api/orders
GET    /api/orders/:id           PATCH /api/orders/:id/status
GET    /api/customers            POST /api/customers
GET    /api/customers/duplicates
GET    /api/customers/:id        PUT  /api/customers/:id     DELETE /api/customers/:id
GET    /api/customers/:id/metrics
POST   /api/customers/:id/notes
GET    /api/inventory/warehouses          POST /api/inventory/warehouses
GET    /api/inventory/levels              GET  /api/inventory/history
GET    /api/inventory/reorder-report      GET  /api/inventory/forecast/:productId
POST   /api/inventory/adjust              POST /api/inventory/reserve
POST   /api/inventory/reservations/:id/release
POST   /api/inventory/reservations/:id/fulfill
GET    /api/pricing/rules                 POST /api/pricing/rules      DELETE /api/pricing/rules/:id
GET    /api/pricing/promotions            POST /api/pricing/promotions
GET    /api/pricing/coupons               POST /api/pricing/coupons
POST   /api/pricing/coupons/validate      POST /api/pricing/coupons/redeem
GET    /api/pricing/history               POST /api/pricing/bulk-apply
GET    /api/pricing/quote/:productId      POST /api/pricing/quote/:productId/apply
GET    /api/pricing/:productId            PUT  /api/pricing/:productId
GET    /api/shipping/packages             POST /api/shipping/packages
GET    /api/shipping/rules                POST /api/shipping/rules   DELETE /api/shipping/rules/:id
POST   /api/shipping/rates                POST /api/shipping/tracking/webhook
GET    /api/shipping/shipments            POST /api/shipping/shipments
GET    /api/shipping/shipments/:id        POST /api/shipping/shipments/:id/refresh
GET    /api/warehouse/bins                POST /api/warehouse/bins
GET    /api/warehouse/bin-contents        GET  /api/warehouse/allocate/:orderId
GET    /api/warehouse/receipts            POST /api/warehouse/receipts
POST   /api/warehouse/receipts/:id/receive
GET    /api/warehouse/receipts/:id/putaway-suggestions
POST   /api/warehouse/receipts/:id/putaway
GET    /api/warehouse/pick-lists          POST /api/warehouse/pick-lists
GET    /api/warehouse/pick-lists/:id      POST /api/warehouse/pick-lists/:id/pick
GET    /api/channels/platforms            GET  /api/channels/connections
POST   /api/channels/connections          POST /api/channels/connections/:id/test
GET    /api/channels/connections/:id/credentials   (masked)
PUT    /api/channels/connections/:id/credentials
GET    /api/channels/profiles             PUT  /api/channels/profiles
POST   /api/channels/profiles/preview     GET  /api/channels/price-matrix/:productId
POST   /api/channels/listings/publish     POST /api/channels/listings/:id/refresh
POST   /api/channels/propagate/:productId POST /api/channels/propagate-all
POST   /api/channels/drain

GET    /api/listings                      POST /api/listings/publish
GET    /api/listings/channels             POST /api/listings/channels
GET    /api/listings/outbox               GET  /api/listings/conflicts
POST   /api/listings/sync-all             POST /api/listings/drain
POST   /api/listings/:id/sync
GET    /api/analytics/dashboard           GET  /api/analytics/pnl
GET    /api/analytics/by-channel          GET  /api/analytics/top-products
GET    /api/analytics/inventory-valuation GET  /api/analytics/export/:type
POST   /api/analytics/rollups/rebuild
GET    /api/analytics/saved-reports       POST /api/analytics/saved-reports
DELETE /api/analytics/saved-reports/:id
GET    /api/notifications                 POST /api/notifications/read-all
GET    /api/notifications/settings        PUT  /api/notifications/settings
GET    /api/notifications/templates       POST /api/notifications/templates
POST   /api/notifications/templates/:key/preview
POST   /api/notifications/emit            POST /api/notifications/broadcast
GET    /api/notifications/digest          POST /api/notifications/digest/send
GET    /api/notifications/provider-outbox POST /api/notifications/:id/read
GET    /api/admin/settings                PUT  /api/admin/settings
GET    /api/admin/audit                   GET  /api/admin/permissions
GET    /api/admin/credentials             POST /api/admin/credentials
DELETE /api/admin/credentials/:id
GET    /api/admin/webhooks                POST /api/admin/webhooks
POST   /api/admin/webhooks/test           DELETE /api/admin/webhooks/:id
GET    /api/admin/flags                   PUT  /api/admin/flags
GET    /api/admin/flags/evaluate
GET    /api/admin/roles                   PUT  /api/admin/roles
DELETE /api/admin/roles/:id
GET    /api/admin/users                   PUT  /api/admin/users/:id
GET    /api/admin/users/:id/permissions
POST   /api/admin/security/check-password
GET    /api/search                        GET  /api/search/:entity
GET    /api/search/suggest                GET  /api/search/analytics
GET    /api/search/index/status           POST /api/search/index/rebuild
GET    /api/search/synonyms               POST /api/search/synonyms
DELETE /api/search/synonyms/:id
GET    /api/search/saved                  POST /api/search/saved
GET    /api/automation/monitoring         GET  /api/automation/handlers
GET    /api/automation/jobs               PUT  /api/automation/jobs
POST   /api/automation/jobs/enqueue       POST /api/automation/queue/pause|resume
GET    /api/automation/runs               POST /api/automation/runs/:id/retry
GET    /api/automation/schedules          PUT  /api/automation/schedules
POST   /api/automation/schedules/tick     DELETE /api/automation/schedules/:id
GET    /api/automation/rules              PUT  /api/automation/rules
POST   /api/automation/rules/emit         POST /api/automation/rules/:id/test
GET    /api/automation/workflows          PUT  /api/automation/workflows
POST   /api/automation/workflows/:id/run  GET  /api/automation/workflow-runs
GET    /api/security/dashboard            GET  /api/security/events
GET    /api/security/login-history        GET  /api/security/lock-status
POST   /api/security/clear-lockout
GET    /api/security/sessions             DELETE /api/security/sessions/:id
POST   /api/security/sessions/revoke-all
GET    /api/security/ip-allowlist         POST /api/security/ip-allowlist
GET    /api/security/retention            POST /api/security/retention/run
GET    /api/security/gdpr                 POST /api/security/gdpr
POST   /api/security/gdpr/:id/access      POST /api/security/gdpr/:id/erasure
GET    /api/security/compliance/controls  GET  /api/security/compliance/:framework
GET    /api/ai/providers                  GET  /api/ai/usage
GET    /api/ai/calls                      GET  /api/ai/prompts
PUT    /api/ai/prompts                    POST /api/ai/prompts/:key/run
GET    /api/ai/insights                   POST /api/ai/image/check
POST   /api/ai/products/:id/description   POST /api/ai/products/:id/keywords
GET    /api/ai/products/:id/duplicates    GET  /api/ai/products/:id/forecast
GET    /api/ai/products/:id/price
POST   /api/developer/oauth/token         POST /api/developer/oauth/authorize   (public)
POST   /api/developer/oauth/introspect    POST /api/developer/oauth/revoke
GET    /api/developer/keys                POST /api/developer/keys
GET    /api/developer/clients             POST /api/developer/clients
GET    /api/developer/subscriptions       POST /api/developer/subscriptions
GET    /api/developer/deliveries          POST /api/developer/deliveries/drain
GET    /api/developer/usage/summary       GET  /api/developer/usage/quota
GET    /api/developer/versions            GET  /api/developer/reference/openapi
GET    /api/developer/reference/sdk       GET  /api/developer/reference/events

-- the PUBLIC API (platform key or OAuth token, not the console JWT) --
GET    /api/v1/products                   GET  /api/v1/products/:id
GET    /api/v1/orders                     GET  /api/v1/orders/:id
GET    /api/v1/inventory                  GET  /api/v1/customers
POST   /api/v1/shipments                  (blocked for sandbox keys)
```

## Architecture (carried over from the original)

- **Money** as integer minor units + ISO currency (never floats).
- **Multi-tenant** — every document carries `organizationId`; every query is org-scoped.
- **Soft delete** (`deletedAt`) + optimistic concurrency (Mongoose `optimisticConcurrency`).
- **`{ success, data, meta }`** response envelope; the frontend `unwrap`s it.
- **Granular `resource:action` permissions** enforced by `requirePermission` middleware and the
  `RequirePermission` React component. Wildcards (`*`, `orders:*`) are honoured via the admin core.
- **Pure cores** — domain logic (`core/pricing.js`, `core/customer-metrics.js`,
  `core/duplicate-detection.js`, `core/inventory.js`, `core/pricing-engine.js`, `core/shipping.js`, `core/warehouse.js`, `core/sync.js`, `core/analytics.js`, `core/notifications.js`, `core/admin.js`, `core/search.js`, `core/automation.js`, `core/security.js`, `core/ai.js`, `core/devplatform.js`, `core/channels.js`) is free of I/O and unit-testable. These port from the original
  almost unchanged, which is why business logic survives the stack change intact.
- **Module structure** — backend `modules/<name>/{service,controller,routes}`; frontend
  `features/<name>/{api,hooks,Screen}`. Adding a module means adding one router line in
  `src/routes.js` and one `<Route>` in `App.jsx`.

## The port is complete

All 17 modules are in. `docs/CONVERSION_GUIDE.md` (NestJS/Prisma/Next → Express/Mongoose/React) and
`docs/MONGODB_MODELING.md` (embed-vs-reference, indexing, transactions) remain useful references for
extending the codebase. The original monorepo (`mccms-platform-complete.zip`) is the historical
reference for business logic.

### Bugs found and fixed during the port

Porting meant *running* the logic, not just transcribing it. That surfaced four real defects in the
original TypeScript:

1. **Tracking status** — `"out for delivery"` matched `/deliver/` before the `out for delivery`
   branch, marking in-flight packages **DELIVERED** (a terminal state that stops polling).
2. **Upload validation** — `../../etc/passwd` returned `ok: true`; the filename was sanitized but no
   issue was raised, so a caller trusting `ok` and using the original name was exploitable.
3. **Price elasticity** — the markup formula `1/(1 + 1/e)` has a pole at `e = -1`; at `e = -1.05` it
   suggested a **21× markup** ($210 for a $10-cost item). Now clamped, with a ±25% move cap.
4. **Anomaly detection** — mean/σ z-scores suffer from *masking*: on `[10,10,10,50,10]` the outlier
   inflates σ enough to hide itself, returning **no anomalies**. Replaced with median/MAD.

Two more were caught in code written during the port: an illegal `ACTIVE → DEAD` job-state jump that
the state machine itself rejected, and a retry path that bypassed the transition guard.

---

## Multi-store pricing: how it works

The `channels` module answers three questions the rest of the platform could not:

**1. "Attach my eBay store and my brand website."**
`ChannelConnection` holds one connected store — platform, account, and credentials encrypted with
AES-256-GCM (the key is derived from `JWT_SECRET`; swap in a KMS key for production). You can attach
several eBay accounts *and* a Shopify site simultaneously. `POST /channels/connections/:id/test`
verifies the credentials really work before anything is published.

**2. "Set different margins for the website and eBay."**
Each connection gets a `ChannelPricingProfile` with a **target margin**, a **margin floor**, that
store's **fee schedule**, and optional handling/absorbed-shipping costs. The engine inverts the fee
structure to solve for the list price:

```
margin = (price − fees(price) − landedCost) / price
⇒ price = (landedCost + fixedFees) / (1 − variableFeeRate − targetMargin)
```

So the *same* 30% target yields **$17.99 on eBay** but **$14.99 on your own site**, because eBay's
12.9% commission has to be earned back. Set them independently — 25% on eBay to stay competitive,
45% on the site where you keep the margin. A per-product profile overrides the channel default, so a
loss-leader on eBay doesn't disturb anything else. Infeasible targets (95% margin against 12.9% fees)
are **reported, not faked**, and the floor is a clamp no rounding or promotion can cross.

**3. "Change the price here and it reflects everywhere."**
Editing a product's price, or its cost, triggers `propagatePrice` automatically:

```
cost/price change
  → per-channel margin solve
  → delta gate      (unchanged price ⇒ zero API calls)
  → idempotent outbox (a retried push cannot double-post)
  → drain → store adapter → live on eBay + the website
```

Store adapters (`adapters/store.registry.js`) are the seam. The defaults are **runnable simulations**
with an in-memory remote, so the entire connect → publish → reprice → drift flow works with no
credentials; each method carries the real eBay/Shopify request it would send. Replace one adapter's
body to go live — nothing else changes.

**Drift** — someone editing the price directly in the eBay admin — is detected by `refreshRemote`
and flags the listing `CONFLICT` rather than silently overwriting.

---

## Currency

The platform runs in **GBP by default**. Set `CURRENCY=GBP|USD|EUR|JPY|AUD|CAD|INR` in
`backend/.env`, or change it per-organization in **Admin → General**.

Money is stored as an **integer count of minor units** — `1299` means £12.99. The number of
minor units is *not* always 100: JPY has none (`1299` = ¥1,299), so the code looks the exponent
up rather than dividing by 100. The frontend fetches the currency once at login and every screen
formats through `lib/money.js`.

**Switching currency does not convert stored amounts.** No exchange rate is applied — `1299`
simply renders as £12.99 or $12.99 depending on the setting. Change it on a fresh dataset, or
convert your data first. The Admin screen warns about this.

## CSV import

**Commerce → Import products (CSV)**, or `POST /api/imports/preview` then `/commit`.

- **Real CSV parsing** (RFC 4180): quoted fields containing commas and newlines, `""` escapes,
  UTF-8 BOM, CRLF, and semicolon/tab delimiters from European Excel — all handled.
- **Column auto-mapping.** `Product Code`, `Item Name`, `Unit Cost (£)`, `RRP`, `Qty`, `EAN` map
  to `sku`, `title`, `cost`, `price`, `quantity`, `barcode` automatically. Override any of them.
- **Money parsing that survives reality:** `£12.99`, `12.99`, `1,299.00`, `12.99 GBP`, `(4.50)`.
  Anything unparseable is **reported per row, never guessed**.
- **Dry run first.** Every row is classified `create` / `update` / `skip` / `error` — with the
  exact field-level diff for updates — and **nothing is written until you approve it**. Duplicate
  SKUs within the file, and prices below cost, are errors rather than silent corruption.
- **Importing a supplier cost list reprices every connected store.** Costs flow through the pricing
  service, which triggers channel propagation — so a new cost list updates eBay and your website
  automatically, each holding its own margin.
- Round-trips: **Export current catalogue** produces a CSV the importer accepts unchanged.

Files are read in the browser (`FileReader`) and posted as text — no multipart upload, no `multer`.
Limits: 5 MB, 10,000 rows, 10 imports per minute per user.

---

## Retail price build-up (VAT, postage bands, fixed profit)

`core/retail-pricing.js` implements the merchant's pricing sheet:

```
Cost + Postage  →  + Profit  →  + VAT  =  Live display price
```

**The distinction this gets right:** a shelf price is moved by two kinds of percentage that
work in *opposite* directions.

- **Tax (VAT 20%) is ADDED.** The customer pays it; HMRC takes it out of the gross.
- **Fees (eBay 12.9%, card 2.5%) are DEDUCTED from receipts.** To still clear £1 after a
  12.9% cut you must charge `÷ (1 − 0.129)`, **not** `× 1.129`.

Lumping them into one "22.5%" multiplier is close enough at 2.5%, but on eBay it under-prices
every listing. Measured on a £10 product targeting £1 profit:

| | shelf price | real profit |
|---|---|---|
| combined-multiplier arithmetic | £16.61 | **£0.20** |
| modelled correctly | £17.75 | **£1.00** |

That is **£1.14 under-charged on every eBay sale**. `sheetMode: true` reproduces the original
arithmetic exactly (£14.08 from cost 10 + postage 1.50 at 22.5%) for continuity; the default
computes true economics and always reports the profit that actually reaches the bank.

Also included: **weight-banded postage** (£1.50 / £2.10 / £3.29 / £7.00), **fixed-amount profit**
(£1/unit, for low-value consumables where a % margin is meaningless), a **minimum-profit floor**,
and a reverse calculator — *"if I charge £12.99 on eBay, what do I make?"* — which flags
loss-making prices before they go live.

**Endpoints:** `GET /api/channels/retail-matrix/:productId` (the full sheet for every store) and
`POST /api/channels/what-if`.

## Restricted CSV imports

`COLUMN_SETS` in `core/csv.js`:
- **`FULL`** — the whole catalogue.
- **`SUPPLY_LIST`** — *only* SKU, Price, Quantity. A supplier file usually carries their titles
  and descriptions; this stops those overwriting yours.
- **`COST_LIST`** — SKU + cost. Importing one reprices every connected store automatically.
