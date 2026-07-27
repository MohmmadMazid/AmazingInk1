# Conversion Guide — NestJS/Prisma/Next → Express/Mongoose/React

Use this to port each remaining feature module from the original platform into this stack. Work one
module at a time; each is independent.

## Concept mapping

| Original (NestJS / Prisma / Next.js) | This stack (Express / Mongoose / React) |
|---|---|
| `@Controller()` class + method decorators | `<module>.routes.js` (Express Router) + `<module>.controller.js` |
| `@Get()/@Post()/@Put()/@Delete()` | `router.get/post/put/delete(path, ...handlers)` |
| `@Injectable()` service (DI) | plain functions in `<module>.service.js` (import directly) |
| `@UseGuards(JwtAuthGuard)` | `requireAuth` middleware |
| `@RequirePermissions(Permission.X)` | `requirePermission('x:y')` middleware |
| `@CurrentUser()` → `AuthenticatedUser` | `req.user` (set by `requireAuth`) |
| DTO + class-validator | `zod` schema `.parse(req.body)` in the controller |
| Prisma model | Mongoose schema in `models/<name>.model.js` |
| `prisma.model.findMany({ where })` | `Model.find(query)` |
| `findUnique({ where: { id } })` | `Model.findById(id)` / `findOne(query)` |
| `create({ data })` | `Model.create(doc)` |
| `update({ where, data })` | `Model.findOneAndUpdate(query, { $set }, { new: true })` |
| soft delete `update deletedAt` | `findOneAndUpdate(..., { $set: { deletedAt: new Date() } })` |
| `count({ where })` | `Model.countDocuments(query)` |
| pagination `skip/take` | `.skip(skip).limit(limit)` + `pageParams()` |
| injection-token `PORT` + adapter | a plain module exporting the default impl; swap by import |
| NestJS `Module` wiring | add the router in `src/routes.js` |
| Response `{success,data,meta}` | `ok()/created()/paginated()` from `utils/envelope.js` |
| Next.js App Router page | React Router `<Route>` in `App.jsx` + a `Screen` component |
| `features/<x>/hooks.ts` (TanStack) | identical — TanStack Query works the same in Vite |
| `RequirePermission` component | identical — provided in `auth/RequirePermission.jsx` |

## Step-by-step: port a module (e.g. `inventory`)

1. **Model** — open the original `prisma/deltas/*.prisma` for the module. For each model, create a
   Mongoose schema in `models/`. Apply the rules in `MONGODB_MODELING.md` (embed vs reference).
2. **Pure cores** — copy the module's `core/*.ts` files to `core/` and strip the TypeScript types
   (or keep `.ts` and add a build step). These contain the real business logic and rarely change.
3. **Service** — translate each service method: replace Prisma calls per the table above, keep the
   same logic, always scope by `req.user.orgId`.
4. **Controller** — one function per endpoint; validate input with a `zod` schema; return via the
   envelope helpers.
5. **Routes** — wire the endpoints with `requireAuth` + `requirePermission('<perm>')`, then register
   the router in `src/routes.js`.
6. **Frontend** — copy the original `features/<x>/{types,format,api,hooks,components,screens}`; change
   the api client import to `../../lib/api.js`, adjust `unwrap`/`rawResponse`, and mount the Page as
   a `<Route>` in `App.jsx`. MUI + TanStack Query components port with almost no change.
7. **Permissions** — add the module's `resource:action` strings to the seeded admin (`permissions`)
   and to any role definitions.

## Ports & seams
The original's injection-token ports (queue, search, storage, secrets, etc.) become simple modules
that export a default implementation. Start with an in-process/no-op default (as the original did),
then swap the import for a real client (BullMQ, an OpenSearch client, the S3 SDK) when wiring infra.

## Recommended porting order
auth ✅ → products ✅ → orders ✅ → customers → inventory → pricing → shipping → warehouse →
listings/sync (marketplace) → analytics → notifications → admin → search → automation → security →
developer platform. Do the commerce spine first; the cross-cutting modules (security, automation,
developer) depend on it.
