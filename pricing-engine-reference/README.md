# Pricing Engine — Reference Files (NOT wired into the app)

## ⚠️ Read this before using anything in this folder

These `.ts` files were generated **before** I had access to your actual codebase, based only
on the voice-note requirements. They target **NestJS + TypeScript + Prisma**.

**Your actual backend is Node/Express/Mongoose (plain JS)** — a completely different stack.
These files will not compile or run inside `mccms-node/backend` as-is. They are included here
only because you asked for them to be merged in; they are not imported or referenced by any
part of the running application.

## You almost certainly don't need these

Your backend **already implements the voice note's exact requirement**, more rigorously than
these reference files do:

| Voice note requirement | Where it already lives |
|---|---|
| Cost (from CSV) → Postage → VAT → Profit → Website Price | `backend/src/core/retail-pricing.js` → `buildRetailPrice()` |
| 4 dynamic postage tiers, no flat rate | `DEFAULT_POSTAGE_BANDS` in the same file (£1.50/£2.10/£3.29/£7.00, weight-banded) |
| Optional 5th "special" tier, can stay blank | `ChannelPricingProfile.postageBands` is an array — just don't add a 5th entry yet |
| Free delivery, postage embedded in price | Postage is added into `landed` cost before profit/VAT, never a separate checkout line |
| CSV → per-item dynamic pricing | `core/csv.js` maps `cost`/`unitcost`/`wholesale` columns → `VariantPricing.cost` |
| API access | `GET /retail-matrix/:productId`, `POST /what-if` in `modules/channels/` |

The real implementation also handles something these reference files (and the original voice
note formula) get wrong: **VAT is added on top of the price, but marketplace fees (eBay,
card processors) are deducted from what you receive** — treating a fee as a markup
understates the price. See the comment block at the top of `retail-pricing.js` for the
full explanation, and `sheetMode: true` if you want it to reproduce the simpler
merchant-sheet arithmetic exactly instead.

## If you still want to use these files

They're self-contained and could be adapted into a standalone NestJS microservice if you
ever split pricing out of the monolith. You'd need to: add a `package.json` with
`@nestjs/common`, `@nestjs/core`, `class-validator`, `class-transformer`; wire
`PricingModule` into a Nest `AppModule`; and replace the Prisma-flavored assumptions in
`pricing.service.ts` with calls into your Mongoose models instead. Treat it as a spec/prototype,
not production code.
