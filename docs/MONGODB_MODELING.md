# MongoDB Data Modeling Notes

MongoDB is document-oriented, so the relational Prisma schema does not map 1:1. Guidelines used in
this starter and to follow when porting the rest.

## Embed vs reference
- **Embed** data that is always read/written with its parent and is bounded in size:
  order **lines** are embedded in the order (see `order.model.js`); an address is embedded in a
  customer; settings are embedded in an org.
- **Reference** (store an ObjectId) across independent aggregates or unbounded/large relations:
  an order references its `customerId` and each line references a `productId`; inventory references
  a warehouse. Populate on read when you need the joined data (`.populate('customerId')`).

## Conventions preserved from the relational model
- **`organizationId`** on every document (denormalized), always in the query filter — the tenant
  boundary. Index `{ organizationId: 1, <field>: 1 }` for each hot access pattern.
- **Money** as `{ amountMinor: Int, currency: String }` (the `MoneySchema` sub-document).
- **Soft delete** via `deletedAt` (filter `deletedAt: null`); **timestamps** via the schema option;
  **optimistic concurrency** via `optimisticConcurrency: true` (Mongoose bumps and checks `__v`).
- **Unique constraints** become compound unique indexes, e.g. `{ organizationId: 1, sku: 1 }`.

## Indexing for scale (1M+ products)
- Compound indexes matching filters+sort: `{ organizationId: 1, status: 1, createdAt: -1 }`.
- Use **range queries on `_id`/`createdAt` for cursor pagination** instead of large `skip` values
  (deep `skip` is O(n) in MongoDB just as `OFFSET` is in SQL).
- For append-only collections (logs, events, deliveries), use a **TTL index** on `createdAt` for
  automatic expiry, or time-based collections.
- Consider **sharding** on `organizationId` (or a hashed key) once a single replica set is saturated.

## Transactions
The relational code used DB transactions in a few places (e.g. reserving stock while creating an
order). MongoDB supports multi-document transactions on a replica set:
`const session = await mongoose.startSession(); session.startTransaction(); ...`. Use them where the
original used `$transaction`; for single-document updates, Mongoose atomic operators (`$inc`, `$set`)
are already atomic.

## What does NOT carry over
- Prisma migrations → there is no schema migration step; Mongoose creates collections/indexes on
  demand. Manage index changes with `Model.syncIndexes()` in a maintenance script.
- Prisma relations/joins → do explicit `.populate()` or a second query; denormalize hot read fields
  when joins would be costly at scale.
