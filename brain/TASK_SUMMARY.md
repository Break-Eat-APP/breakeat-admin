# BRAT EAT Task Summary

This file must be updated after every implementation task.

---

## [2026-06-01] Codex Audit Phase 5 — P1/P2/P3 Fixes

Task: Address 4 P1 issues + 1 P3 + missing DOCX (P2) from Codex audit of Phase 5.
Date: 2026-06-01

Created:
- backend/prisma/migrations/20260601_phase5_codex_audit/migration.sql
- phases de DEV/PHASE_4_PRODUCTS_CATEGORIES_STOCK.docx
- phases de DEV/PHASE_5_CART_CHECKOUT_STRIPE_ORDERS.docx
- phases de DEV/generate_phase4.js + generate_phase5.js

Modified:
- backend/prisma/schema.prisma (CartItem.priceSnapshotCents added)
- backend/src/modules/cart/cart.service.ts (freeze prices at checkout, use snapshot in computeView)
- backend/src/modules/cart/cart.service.spec.ts (+1 test for price freeze)
- backend/src/modules/orders/orders.service.ts (4 critical fixes — see Why below)
- backend/src/modules/orders/orders.service.spec.ts (+4 audit-guard tests)
- backend/src/modules/payments/stripe.service.ts (P3 comment fix)
- package.json (build → pnpm -r run; turbo kept as build:turbo)
- brain/ENGINEERING_MANUAL.md
- brain/TASK_SUMMARY.md (this file)
- DEVELOPMENT_LOG.md
- CHANGELOG.md

Why (4 P1 + 1 P3):
- P1 #1 — Stock oversell: previous code did `newQty < 0 ? 0 : newQty` which let two concurrent transactions both consume the last unit. Fixed with `tx.stock.updateMany({ where: { id, quantity: { gte: item.quantity } } })` — if the conditional update affects 0 rows, we throw ConflictException and the whole transaction rolls back.
- P1 #2 — Payment/Order amount divergence: cart.checkout used live Product.price for the PaymentIntent, but orders.service recomputed from live price at webhook time. Now CartItem.priceSnapshotCents is set at checkout, and OrdersService uses the snapshot exclusively. Defensive check rejects with ConflictException if subtotal != intent.amount.
- P1 #3 — Failed-then-succeeded webhook crashes: `recordFailedPayment` creates a Payment FAILED row keyed on stripePaymentIntentId. If the customer retries and the SAME PaymentIntent succeeds, `tx.payment.create` would raise P2002 (UNIQUE violation). Replaced with `tx.payment.upsert` keyed on stripePaymentIntentId.
- P1 #4 — Pipeline broken via corepack: `corepack pnpm build` failed because `build` script invoked `turbo` which needs `pnpm` resolvable in PATH from a corepack-wrapped child process. Switched root scripts to `pnpm -r run build/typecheck/lint`. `turbo build` retained as `build:turbo` for local dev caching benefit.
- P3 #7 — Wrong Stripe doc comment: header said "we NEVER mix application_fee_amount with destination charges" but the code does exactly that (which IS the correct standard marketplace pattern). Comment rewritten to describe the actual behaviour.

Architecture decisions:
- Frozen snapshots on CartItem rather than re-derivation at order time — guarantees Order.totalCents == Payment.amountCents
- Defensive ConflictException on subtotal/intent.amount mismatch — refuse to create Order rather than risk financial discrepancy
- Atomic decrement via updateMany + WHERE constraint — race-safe without DB-level SELECT FOR UPDATE
- Payment.upsert preserves the failure history (rawStripeEvent) while transitioning to SUCCEEDED
- Pipeline uses pnpm-r (zero Turbo dependency in scripts that codex must run) — Turbo stays available via build:turbo for local cache

Dependencies added:
- None

Tests (audit guards — 5 new):
- orders.service.spec.ts (+4):
    "refuses when CartItem has no price snapshot (checkout was skipped)"
    "refuses when computed total diverges from PaymentIntent amount (P1 #2 guard)"
    "throws ConflictException when stock is insufficient (P1 #1 oversell guard)"
    "upserts Payment when a FAILED row already exists (P1 #3 retry guard)"
- cart.service.spec.ts (+1):
    "freezes prices on every CartItem before creating the PaymentIntent (P1 #2 guard)"
- Total backend: 94 tests passing (89 before + 5 new)

Engineering manual:
- Updated ENGINEERING_MANUAL.md: section [2026-06-01] Codex Audit P1 added
- Code refs: orders.service.ts (atomic decrement), cart.service.ts (price freeze), payment.upsert

Risks:
- pnpm db:migrate MUST be run again on every environment to apply the 20260601 migration (column add)
- Existing carts in CHECKOUT_PENDING state without priceSnapshotCents (created before fix) cannot complete — they will fail at order creation with the "no price snapshot" guard. Acceptable for staging; document for prod cutover.
- Stock decrement test (P1 #1) is unit-mocked — true concurrency must be validated in Phase 6 rush testing
- Defensive amount check (P1 #2) blocks Order creation on tiny rounding mismatches — Stripe uses integer cents so this should be exact, but worth monitoring on first prod webhook

Next steps:
- Resume Bloc 6.0 (infrastructure scaffolding ongoing — staging deployment + Storybook + Firebase)
- Then Phase 6.1+ : OrderStatus state machine + Realtime + Outbox

---

## [2026-05-28] Process Update — Visual Validation Contract

Task: Formalize the Visual Control & Product Validation update + Live Preview Access requirements provided by the product owner.
Date: 2026-05-28

Created:
- brain/PRODUCT_VALIDATION.md (contract v1.0.0, mandatory from Phase 6)
- brain/REMINDERS.md (assistant self-notes : Cursor timing, design inputs, infra checkpoints)

Modified:
- brain/ROADMAP.md (Visual Validation Rule added globally; Phase 6 and Phase 8 deliverables enriched)
- brain/TASK_SUMMARY.md (this entry)
- CHANGELOG.md

Why:
- Product owner wants to test, validate and visualize the app continuously, like a real production app
- Storybook, preview builds, QR codes, staging dashboards, fake data and demo mode are now mandatory from Phase 6 onward
- This ensures no feature is validated blindly and demos can run autonomously for investors / clubs

Architecture decisions:
- New brain document `PRODUCT_VALIDATION.md` versioned as v1.0.0 (semver, every change logged)
- Visual validation applies from Phase 6 onward (Phases 1-5 stay validated on technical delivery)
- Phase 6 scope now includes infrastructure setup (staging deployment, EAS Build pipeline, Storybook scaffolding, demo mode toggle, fake event simulator skeleton)
- Phase 8 scope explicitly enriched with the Storybook stories + state previews + 4 demo environments

Dependencies added:
- None (yet — Phase 6 will add Storybook, EAS, deployment configs)

Tests:
- N/A (documentation update only)

Engineering manual:
- Cross-references to PRODUCT_VALIDATION.md will be added in Phase 6 ENGINEERING_MANUAL entries

Risks:
- Phase 6 estimated duration (2 weeks per original ROADMAP) will likely extend to ~2.5 weeks due to added infrastructure work
- Apple Developer account (~99 $/year) and Google Play Console (25 $ one-time) required for Phase 8 mobile previews
- Staging hosting costs to estimate (Vercel + Railway/Render ≈ 20-40 $/month for early stage)
- Decision needed before Phase 6: Expo / EAS Build vs pure React Native CLI builds (Expo simplifies preview pipelines significantly)

Next steps:
- Pending product owner decisions before Phase 6 start:
  1. Confirm Apple Developer + Play Console signup timeline
  2. Choose hosting target (Vercel + Railway recommended) or self-hosted VPS
  3. Confirm Expo / EAS adoption (recommended for preview pipelines) — would require migration of `apps/mobile` from RN CLI to Expo (managed or bare)
  4. Confirm budget for staging infrastructure (~20-40 €/month)
- Then start Phase 6 with the enriched deliverables

---

## [2026-05-27] Phase 5 — Cart, Checkout, Stripe Connect, Orders

Task: Implement the full V1 ordering pipeline — Cart, Stripe Connect onboarding, Checkout (PaymentIntent), Webhook handler, Order creation from successful payment.
Date: 2026-05-27

Created:
- backend/prisma/migrations/20260527_phase5_stripe_connect/migration.sql
- backend/src/modules/payments/stripe.service.ts (Stripe SDK wrapper)
- backend/src/modules/payments/payments.module.ts (@Global)
- backend/src/modules/suppliers/dto/create-onboarding-link.dto.ts
- backend/src/modules/cart/{dto/*, cart.service.ts, cart.controller.ts, cart.module.ts}
- backend/src/modules/cart/cart.service.spec.ts (12 tests)
- backend/src/modules/orders/{orders.service.ts, orders.controller.ts, orders.module.ts}
- backend/src/modules/orders/orders.service.spec.ts (5 tests)
- backend/src/modules/webhooks/{stripe-webhooks.controller.ts, stripe-webhooks.service.ts, webhooks.module.ts}
- backend/src/modules/webhooks/stripe-webhooks.service.spec.ts (4 tests)

Modified:
- backend/package.json (+stripe 17.7.0)
- backend/prisma/schema.prisma (+5 enums, +6 models, Supplier extended)
- backend/src/main.ts (raw body for webhooks, bodyParser disabled, prefix exclude)
- backend/src/config/app.config.ts (stripe.apiVersion, platformFeeBps, connect.*)
- backend/src/app.module.ts (4 new modules wired)
- backend/src/modules/suppliers/suppliers.service.ts (Stripe Connect methods)
- backend/src/modules/suppliers/suppliers.controller.ts (2 new endpoints)
- .env.example (4 Stripe Connect variables)
- brain/ENGINEERING_MANUAL.md
- brain/TASK_SUMMARY.md (this file)
- DEVELOPMENT_LOG.md
- CHANGELOG.md

Why:
- Cart is the customer's editable view before payment — it must persist server-side so the customer can resume on any device
- Stripe Connect (Standard accounts) is mandatory for marketplace payments — funds flow directly to the supplier minus a platform fee
- Webhook is the only trustworthy signal of payment success — never trust the client confirmation alone
- Order creation must be transactional + idempotent — duplicate webhooks must NOT produce duplicate orders
- Snapshots on OrderItem freeze product name + price at order time — historical orders never depend on mutable Product rows

Architecture decisions:
- V1 = ONE supplier per cart/order (multi-vendor flag stays OFF). Simplifies idempotency, refunds, and dashboards.
- PaymentIntent uses destination charges (`transfer_data.destination`) + `application_fee_amount` for platform commission (BPS).
- Cart idempotency key for Stripe = `cart_${cartId}` — two checkouts on the same cart return the SAME PaymentIntent.
- Webhook idempotency = WebhookEvent table with UNIQUE stripeEventId.
- Order creation runs in a single `prisma.$transaction()`: Cart→CONVERTED + Order + Items + Payment + AuditTrail + Stock decrement.
- Public order number = PostgreSQL sequence formatted "BE-XXXXXXXX" (human-readable, monotonically increasing).
- Raw body middleware for /webhooks/stripe registered BEFORE the JSON parser in main.ts — required by Stripe signature verification.
- Suppliers controller exposes `POST /stripe/onboarding-link` (idempotent — creates account if absent, returns fresh URL) and `GET /stripe/status` (live refresh from Stripe).
- StripeAccountStatus mirrors are stored on Supplier (chargesEnabled, payoutsEnabled) — avoids a Stripe round-trip on every checkout.
- Cart stock validation: per-pickup-point first, fall back to global. Cumulative quantity (post-upsert) re-checked against stock.

Dependencies added:
- stripe@17.7.0

Tests (Phase 5 specifically — 21 new):
- cart.service.spec.ts (12): create happy-path, event not ACTIVE, supplier not attached, duplicate OPEN cart, ownership check, cross-supplier product, inactive product, checkout success/PaymentIntent, supplier not Stripe-ACTIVE, no pickup point, checkout idempotency, findOne 404
- orders.service.spec.ts (5): createFromPaymentIntent happy-path (transaction), idempotency (existing Payment→same Order), missing cartId metadata→404, paymentIntent mismatch→Conflict, recordFailedPayment upsert
- stripe-webhooks.service.spec.ts (4): duplicate event skipped, payment_intent.succeeded→OrdersService, payment_intent.payment_failed→recordFailedPayment, account.updated mirrors supplier
- Total backend: 89 tests passing (68 before + 21 new)

Engineering manual:
- Updated ENGINEERING_MANUAL.md: section [2026-05-27] Phase 5 added
- Code refs: stripe.service.ts (SDK wrapper), cart.service.ts:checkout, orders.service.ts:createFromPaymentIntent, stripe-webhooks.service.ts:handleEvent, main.ts (raw body middleware)

Risks:
- pnpm db:migrate MUST be run to apply the Phase 5 migration (orders table requires the order_public_seq sequence)
- STRIPE_SECRET_KEY + STRIPE_WEBHOOK_SECRET must be set in .env before any /checkout call
- Webhook endpoint /webhooks/stripe must be reachable from Stripe (use `stripe listen --forward-to localhost:3000/webhooks/stripe` for local dev)
- A supplier must reach stripeAccountStatus=ACTIVE before customers can checkout against them — the API rejects with 400 otherwise
- Realtime emission (new_order event) is NOT done here — comes in Phase 6 Outbox
- No refund logic in V1 — refunds = Phase 9
- Cart sweeper (auto-expire stale carts) = Phase 9

Next steps:
- Phase 6: Orders state machine + Realtime + Outbox + Operator dashboard reads
  - OrderStatus transitions (PAID→ACCEPTED→PREPARING→READY→PICKED_UP→COMPLETED)
  - Operator endpoints (accept, mark ready, etc.)
  - Realtime outbox + WebSocket emission
  - Dashboard snapshot API

---

## [2026-05-26] Codex Audit Phase 4 — P1/P2/P3

Task: Fix 4 issues found by Codex audit on Phase 4 (2 P1 + 2 P2 + 1 P3)
Date: 2026-05-26

Created:
- backend/src/modules/categories/categories.service.spec.ts (8 tests)

Modified:
- backend/prisma/migrations/20260526_phase4_products_categories_stock/migration.sql (UUID fix)
- backend/src/modules/stock/stock.service.ts (supplier check on pickup point)
- backend/src/modules/stock/stock.service.spec.ts (cross-supplier test)
- backend/src/modules/products/products.service.ts (validateDateWindow)
- backend/src/modules/products/products.service.spec.ts (date window test)
- package.json (typecheck/lint use pnpm -r run)
- brain/ENGINEERING_MANUAL.md
- brain/TASK_SUMMARY.md (this file)
- CHANGELOG.md

Why:
- P1 UUID: all Phase 3 tables use UUID type for PKs; Phase 4 had TEXT — PostgreSQL FK constraints require matching types, so db:migrate would have failed with a type mismatch error
- P1 pipeline: turbo typecheck/lint fails when pnpm isn't in PATH; pnpm -r run works via pnpm's own binary without going through Turbo's binary resolution
- P2 stock: a pickup point scoped to supplier A could receive stock from supplier B — now blocked with BadRequestException
- P2 products: availableFrom/availableUntil were stored without verifying temporal ordering — now validated with BadRequestException
- P3 categories: CRUD + P2003 delete-conflict had no tests — now covered

Architecture decisions:
- Migration fix: UUID type matches Phase 2/3 conventions; gen_random_uuid() on every PK
- Pipeline fix: pnpm -r run runs in parallel across workspaces, no turbo binary lookup required; turbo still used for build (caching benefit) and test
- Stock pickup fix: supplierId=null on pickup point = shared point (any supplier allowed); supplierId set = exclusive point (only that supplier)
- Date window: validation in service (not DTO) because update() must merge existing values before checking

Dependencies added:
- None

Tests:
- categories.service.spec.ts — 8 tests: create (success, Forbidden, supplier 404), findAll, update (success, 404), remove (success, 404, P2003 conflict)
- stock.service.spec.ts — 1 test added: pickup point cross-supplier → BadRequestException
- products.service.spec.ts — 1 test added: availableUntil before availableFrom → BadRequestException
- Total backend: 67 tests expected

Engineering manual:
- Updated ENGINEERING_MANUAL.md: section Codex Audit Phase 4 added
- Code references: migration.sql (UUID), stock.service.ts:requirePickupPointInOrg, products.service.ts:validateDateWindow

Risks:
- pnpm db:migrate MUST be run after correcting the migration file; any partial application of the old (broken) migration on a real DB would need cleanup
- pnpm -r run for typecheck/lint loses Turbo caching — acceptable for dev workflow; build retains Turbo

Next steps:
- Phase 5: Stripe Connect onboarding for Suppliers
  - stripeAccountId population on Supplier (already nullable in schema)
  - Stripe webhook handler
  - Phase 6 will need valid stripeAccountId to process payments

---

## [2026-05-26] Codex Audit P1 — JwtStrategy globalRole + Pipeline corepack

Task: Fix 2 P1 blockers from Codex post-Phase-4 audit
Date: 2026-05-26

Created:
- .npmrc (package-manager-strict=false — resolves Turbo binary lookup with corepack)

Modified:
- backend/src/modules/auth/strategies/jwt.strategy.ts (globalRole added to DB select; return { ...payload, globalRole: user.globalRole })
- backend/src/modules/auth/strategies/jwt.strategy.spec.ts (test updated: asserts DB globalRole overrides JWT globalRole)
- brain/ENGINEERING_MANUAL.md (P1 section added; old JwtStrategy data-flow annotated)
- brain/TASK_SUMMARY.md (this file)
- CHANGELOG.md

Why:
- P1 globalRole: organizations.controller and roles.guard read request.user.globalRole. A user whose platform role was upgraded/revoked after token issuance would carry the wrong role for up to 15 minutes (the JWT TTL). Since validate() already hit the DB for isActive, adding globalRole costs zero extra queries.
- P1 corepack: Turbo v2 resolves the pnpm binary via PATH. On Windows with corepack managing pnpm, `where pnpm` can fail when using `corepack pnpm` as the entry point. .npmrc disables strict enforcement; documentation corrects the invocation.

Architecture decisions:
- validate() returns { ...payload, globalRole: user.globalRole } — all other JWT fields (sub, email, iat, exp) still come from the verified and unexpired token
- The DB is the single source of truth for globalRole — never the JWT payload
- .npmrc is project-wide — affects all workspaces uniformly

Dependencies added:
- None

Tests:
- jwt.strategy.spec.ts — updated test: DB returns globalRole='SUPER_ADMIN', JWT had 'CUSTOMER' → result.globalRole must be 'SUPER_ADMIN'
- All existing 57 tests continue to pass

Engineering manual:
- Updated ENGINEERING_MANUAL.md: section [2026-05-26] Codex Audit P1 added
- Code references: jwt.strategy.ts:44 (select), jwt.strategy.ts:52 (return), jwt.strategy.spec.ts:41 (test)

Risks:
- If a future developer adds a long-lived JWT (> 15 min) the stale-globalRole attack window increases — the DB refresh in validate() is the guard against this
- .npmrc must not be deleted — it enables Turbo to resolve pnpm on non-standard setups

Next steps:
- Phase 5: Stripe Connect onboarding for Suppliers
  - stripeAccountId population on Supplier (already nullable in schema)
  - Stripe webhook handler
  - Phase 6 will need valid stripeAccountId to process payments

---

## [2026-05-26] Phase 4 — Products, Categories, Stock

Task: Prisma Phase 4 schema + 3 NestJS modules + tests
Date: 2026-05-26

Created:
- backend/prisma/migrations/20260526_phase4_products_categories_stock/migration.sql
- backend/src/modules/categories/dto/create-category.dto.ts
- backend/src/modules/categories/dto/update-category.dto.ts
- backend/src/modules/categories/categories.service.ts
- backend/src/modules/categories/categories.controller.ts
- backend/src/modules/categories/categories.module.ts
- backend/src/modules/products/dto/create-product.dto.ts
- backend/src/modules/products/dto/update-product.dto.ts
- backend/src/modules/products/products.service.ts
- backend/src/modules/products/products.service.spec.ts
- backend/src/modules/products/products.controller.ts
- backend/src/modules/products/products.module.ts
- backend/src/modules/stock/dto/create-stock.dto.ts
- backend/src/modules/stock/dto/update-stock.dto.ts
- backend/src/modules/stock/dto/update-stock-availability.dto.ts
- backend/src/modules/stock/stock.service.ts
- backend/src/modules/stock/stock.service.spec.ts
- backend/src/modules/stock/stock.controller.ts
- backend/src/modules/stock/stock.module.ts

Modified:
- backend/prisma/schema.prisma (enums CategoryStatus, ProductStatus ; modèles Category, Product, Stock + relations Supplier/PickupPoint)
- backend/src/app.module.ts (CategoriesModule, ProductsModule, StockModule)
- brain/ENGINEERING_MANUAL.md
- brain/TASK_SUMMARY.md (this file)
- CHANGELOG.md

Why:
- Categories and Products are required before Phase 6 (Orders/Cart) can reference items
- Stock is the inventory layer needed by Phase 6 to block out-of-stock items at checkout
- Price in cents avoids Float precision bugs in financial calculations

Architecture decisions:
- Price stored as Int (cents) — enforced by DTO @Min(0)/@IsInt() and DB CHECK constraint
- Category DELETE blocked if products reference it (ON DELETE RESTRICT) — prevents orphan products
- Product DELETE cascades to Stock (ON DELETE CASCADE) — stock entries have no meaning without product
- Stock global uniqueness enforced by two partial DB indexes: one for (product, NULL), one for (product, pickupPoint)
- isAvailable auto-set to false when quantity = 0 (service-level rule, not DB trigger)
- OPERATOR can only toggle isAvailable — quantity management reserved for MANAGER/ORG_ADMIN
- OPERATOR cannot force isAvailable = true when quantity = 0 (guarded at service level)

Dependencies added:
- None

Tests:
- backend/src/modules/products/products.service.spec.ts — 8 tests
  - create: success, ForbiddenException, supplier 404, category 404, category wrong supplier
  - update: success, category wrong supplier, product 404
- backend/src/modules/stock/stock.service.spec.ts — 9 tests
  - create: global stock, qty=0 auto-unavailable, ConflictException duplicate global, per-pickup-point, product 404
  - update: success, auto-unavailable on qty=0, stock 404
  - updateAvailability: OPERATOR can mark unavailable, cannot force available when qty=0
- Total backend: 57 tests (pnpm test ✅)

Engineering manual:
- Updated ENGINEERING_MANUAL.md: section [2026-05-26] Phase 4 added
- Code references: products.service.ts:requireCategoryForSupplier, stock.service.ts:updateAvailability

Risks:
- pnpm db:migrate required before Phase 4 functionality is usable
- pnpm db:generate already executed (Prisma client up to date)
- Stock decrement on order placement is Phase 6 — current stock.quantity is only for manual management
- availableFrom/availableUntil gates are stored but NOT enforced at API level yet (Phase 6 cart logic)

Next steps:
- Phase 5: Stripe Connect onboarding for Suppliers
  - Stripe webhook handler
  - stripeAccountId population on Supplier
  - Phase 6 will need valid stripeAccountId to process payments

---

## [2026-05-25] Codex Audit Corrections — Phase 2 & 3

Task: Fix 6 security and robustness issues from Codex Phase 2/3 audit
Date: 2026-05-25

Created:
- backend/src/modules/auth/strategies/jwt.strategy.spec.ts (4 tests)
- backend/src/modules/organizations/organizations.service.spec.ts (9 tests)
- backend/src/modules/pickup-points/pickup-points.service.spec.ts (5 tests)

Modified:
- turbo.json (test.dependsOn: ["^build"] → [])
- apps/mobile/package.json (lint: --ext removed, build script added)
- backend/src/common/helpers/require-org-access.ts (SUPER_ADMIN DB query bypass)
- backend/src/modules/organizations/organizations.service.ts (SUPER_ADMIN findById/addMember + targetUser 404)
- backend/src/modules/organizations/organizations.controller.ts (passes user.globalRole)
- backend/src/modules/auth/strategies/jwt.strategy.ts (async validate + DB isActive check)
- backend/src/modules/pickup-points/pickup-points.service.ts (event.venueId === dto.venueId check)
- backend/src/modules/suppliers/suppliers.service.ts (OrgRole.OPERATOR replaces string cast)
- backend/src/modules/events/events.service.spec.ts (user mock added for requireOrgAccess)
- brain/ENGINEERING_MANUAL.md
- brain/TASK_SUMMARY.md (this file)

Why:
- JWT tokens for deactivated accounts were still accepted for up to 15 minutes
- SUPER_ADMIN had no real bypass — they were blocked from org operations like regular users
- addMember could silently create a membership for a non-existent userId (FK error or ghost member)
- PickupPoints could reference a different venue than their event (data inconsistency)
- 'OPERATOR' string cast bypassed TypeScript type checking on OrgRole
- Mobile lint script used --ext flag removed in ESLint 9 — pnpm lint was broken from root

Architecture decisions:
- requireOrgAccess reads globalRole from DB (not JWT) so role revocation is immediate
- JwtStrategy.validate() adds one DB query per authenticated request (acceptable; cache in Phase 10 if needed)
- SUPER_ADMIN bypass in OrganizationsService via callerGlobalRole parameter (explicit, no hidden magic)
- turbo test task has no dependsOn — tests run without a prior build step

Dependencies added:
- None

Tests:
- jwt.strategy.spec.ts — 4 tests (valid user, unknown user 401, inactive user 401, missing sub 401)
- organizations.service.spec.ts — 9 tests (findById member/non-member/SUPER_ADMIN/404, addMember ORG_ADMIN/non-admin/SUPER_ADMIN/targetUser404/conflict)
- pickup-points.service.spec.ts — 5 tests (success, no event, venue mismatch, venue 404, event 404)
- Total backend: 36 tests (20 Phase 2/3 + 16 new)

Engineering manual:
- Updated ENGINEERING_MANUAL.md: section [2026-05-25] Codex Audit Corrections Phase 2 & 3 added
- Code references: require-org-access.ts:36, jwt.strategy.ts:43, organizations.service.ts:findById/addMember

Risks:
- requireOrgAccess now makes an extra DB query per org-scoped request (1 query: SELECT globalRole)
- JwtStrategy.validate() adds 1 DB query per authenticated request — plan Redis cache in Phase 10

Next steps:
- Phase 4: Products, Categories, Stock
  - Add Category, Product, Stock to Prisma schema
  - NestJS modules for each entity
  - Stock availability management per supplier/event

---

## [2026-05-25] Phase 3 — Events, Venues, Suppliers, Pickup Points

Task: Prisma Phase 3 schema + 4 NestJS modules + tests
Date: 2026-05-25

Created:
- backend/prisma/migrations/20260525_phase3_events_venues_suppliers/migration.sql
- backend/src/common/helpers/require-org-access.ts
- backend/src/modules/venues/dto/create-venue.dto.ts
- backend/src/modules/venues/dto/update-venue.dto.ts
- backend/src/modules/venues/venues.service.ts
- backend/src/modules/venues/venues.controller.ts
- backend/src/modules/venues/venues.module.ts
- backend/src/modules/suppliers/dto/create-supplier.dto.ts
- backend/src/modules/suppliers/dto/update-supplier.dto.ts
- backend/src/modules/suppliers/dto/update-supplier-status.dto.ts
- backend/src/modules/suppliers/suppliers.service.ts
- backend/src/modules/suppliers/suppliers.controller.ts
- backend/src/modules/suppliers/suppliers.module.ts
- backend/src/modules/events/dto/create-event.dto.ts
- backend/src/modules/events/dto/update-event.dto.ts
- backend/src/modules/events/dto/update-event-status.dto.ts
- backend/src/modules/events/dto/attach-supplier.dto.ts
- backend/src/modules/events/events.service.ts
- backend/src/modules/events/events.service.spec.ts
- backend/src/modules/events/events.controller.ts
- backend/src/modules/events/events.module.ts
- backend/src/modules/pickup-points/dto/create-pickup-point.dto.ts
- backend/src/modules/pickup-points/dto/update-pickup-point.dto.ts
- backend/src/modules/pickup-points/pickup-points.service.ts
- backend/src/modules/pickup-points/pickup-points.controller.ts
- backend/src/modules/pickup-points/pickup-points.module.ts
- CHANGELOG.md (nouveau fichier de suivi des modifications)

Modified:
- backend/prisma/schema.prisma (enums Phase 3 + Venue, Event, EventSupplier, Supplier, PickupPoint)
- backend/src/app.module.ts (ajout VenuesModule, SuppliersModule, EventsModule, PickupPointsModule)
- brain/ENGINEERING_MANUAL.md
- brain/TASK_SUMMARY.md (this file)
- DEVELOPMENT_LOG.md
- CHANGELOG.md

Why:
- Events = contexte d'activation de toute la logique métier (products, cart, orders)
- Phase 4 et 5 ont besoin d'un Venue + Event + Supplier déjà persistés

Architecture decisions:
- requireOrgAccess() helper extrait pour éviter la duplication dans les 4 services
- MANAGE_ROLES = [ORG_ADMIN, MANAGER] pour les écritures, ALL_ORG_ROLES pour les lectures
- EventStatus machine avec transitions explicites + guard sur états terminaux
- EventSupplier junction table (many-to-many event↔supplier)
- stripeAccountId nullable sur Supplier — sera rempli Phase 5
- Venues liés à l'org via CASCADE — supprimer une org supprime venues, events, suppliers, pickup points

Dependencies added:
- Aucune nouvelle dépendance externe

Tests:
- backend/src/modules/events/events.service.spec.ts — 9 tests
  - create: happy path, ForbiddenException, venue not found, invalid dates
  - updateStatus: DRAFT→ACTIVE, invalid transition, CANCELLED terminal
  - attachSupplier: happy path, ConflictException duplicate
- Total: 20 tests backend (pnpm test ✅)

Engineering manual:
- Updated ENGINEERING_MANUAL.md: section [2026-05-25] Phase 3 ajoutée
- Code references: events.service.ts:247 (guardFinalized), :257 (validateTransition), :163 (attachSupplier)

Risks:
- Migration Phase 3 doit être appliquée après Phase 2 (ordre important)
- pnpm db:generate requis après tout changement schema.prisma
- stripeAccountId vide jusqu'à Phase 5

Next steps:
- Phase 4 : Products, Categories, Stock
  - Ajout Category, Product, Stock au schéma Prisma
  - Modules NestJS correspondants
  - Gestion disponibilité et stock par supplier

---

## [2026-05-25] Codex Audit Corrections

Task: Fix 6 issues from Codex audit before Phase 3
Date: 2026-05-25

Created:
- apps/mobile/src/lib/config/env.ts (typed env config module)
- apps/mobile/src/types/globals.d.ts (minimal process.env ambient declaration)

Modified:
- apps/mobile/src/instrument.ts (uses ENV.* instead of process.env)
- apps/mobile/src/lib/api/api-client.ts (uses ENV.API_URL instead of process.env.API_URL)
- apps/admin/package.json (lint: "eslint src/" replacing next lint)
- apps/operator/package.json (lint: "eslint src/" replacing next lint)
- backend/src/modules/auth/auth.service.ts (removed unused argon2 import)
- backend/src/modules/organizations/dto/add-member.dto.ts (removed unused IsString import)
- brain/ENGINEERING_MANUAL.md (Codex Audit Corrections entry added)
- brain/TASK_SUMMARY.md (this file)

Why:
- Typecheck was failing on mobile due to untyped process.env accesses
- Health route was incorrectly prefixed — /health was at /api/v1/health
- next lint incompatible with ESLint 9 flat config
- Two unused imports causing lint errors in backend
- All builds must pass before Phase 3 starts

Architecture decisions:
- Mobile env vars centralized in src/lib/config/env.ts (no @types/node in RN)
- Minimal process.d.ts declaration avoids polluting RN scope with Node.js types
- ESLint 9 flat config at root is shared via directory traversal — no per-app config needed
- health route exclusion via setGlobalPrefix({ exclude: ['health'] }) is the NestJS official way

Dependencies added:
- None

Tests:
- All 11 existing backend tests pass (pnpm test)
- pnpm typecheck → 4 packages, 0 error
- pnpm lint → 4 packages, 0 error
- apps/admin pnpm build → OK
- apps/operator pnpm build → OK
- apps/mobile pnpm typecheck → OK

Engineering manual:
- Updated ENGINEERING_MANUAL.md: section [2026-05-25] Codex Audit Corrections ajoutée
- Code references: apps/mobile/src/lib/config/env.ts:1, globals.d.ts:1, main.ts:27

Risks:
- Fix 1 (mobile env): process.env is replaced at Metro bundle time — ENVfile is a TS-only type layer
- Fix 4 (eslint): next build still runs its own internal lint pass (shows warning about missing Next.js plugin — non-blocking)

Next steps:
- Phase 3 : Events, Venues, Suppliers
  - Add Venue, Event, Supplier, PickupPoint to Prisma schema
  - NestJS modules for each entity
  - Relations with Organization (already exists from Phase 2)

---

## [2026-05-25] Phase 2 — Auth + Organizations

Task: Prisma setup, JWT auth, Users, Organizations, Roles, Guards
Date: 2026-05-25

Created:
- backend/prisma/schema.prisma (User, Organization, OrganizationMember, RefreshToken)
- backend/prisma/migrations/20260525_phase2_auth_organizations/migration.sql
- backend/src/database/prisma.service.ts
- backend/src/database/prisma.module.ts
- backend/src/common/enums/role.enum.ts
- backend/src/common/decorators/current-user.decorator.ts
- backend/src/common/decorators/roles.decorator.ts
- backend/src/common/guards/jwt-auth.guard.ts
- backend/src/common/guards/roles.guard.ts
- backend/src/modules/users/users.service.ts
- backend/src/modules/users/users.module.ts
- backend/src/modules/auth/dto/register.dto.ts
- backend/src/modules/auth/dto/login.dto.ts
- backend/src/modules/auth/dto/refresh.dto.ts
- backend/src/modules/auth/strategies/jwt.strategy.ts
- backend/src/modules/auth/auth.service.ts
- backend/src/modules/auth/auth.controller.ts
- backend/src/modules/auth/auth.module.ts
- backend/src/modules/auth/auth.service.spec.ts
- backend/src/modules/organizations/dto/create-organization.dto.ts
- backend/src/modules/organizations/dto/add-member.dto.ts
- backend/src/modules/organizations/organizations.service.ts
- backend/src/modules/organizations/organizations.controller.ts
- backend/src/modules/organizations/organizations.module.ts

Modified:
- backend/package.json (ajout argon2, @nestjs/jwt, @nestjs/passport, prisma, class-validator...)
- backend/src/app.module.ts (ajout PrismaModule, AuthModule, UsersModule, OrganizationsModule)
- pnpm-workspace.yaml (allowBuilds pour prisma, argon2, @nestjs/core)
- DEVELOPMENT_LOG.md
- brain/TASK_SUMMARY.md
- brain/ENGINEERING_MANUAL.md

Why:
- Aucune fonctionnalité métier n'est utilisable sans auth et organisations
- Les guards et decorators créés ici sont réutilisés par toutes les phases suivantes

Architecture decisions:
- Prisma choisi pour sa type-safety et ses migrations SQL explicites
- argon2 pour le hachage (résistant GPU, recommandé OWASP)
- Refresh token haché en SHA-256 avant stockage (jamais le token brut en DB)
- Rotation systématique : un refresh token ne peut être utilisé qu'une seule fois
- Login : même message d'erreur email inconnu vs mauvais mot de passe
- Création d'organisation en transaction Prisma (org + membership atomiques)
- PrismaModule @Global() — évite les re-imports dans chaque module
- passwordHash exclu de tous les retours publics (SafeUser type)

Dependencies added:
- @nestjs/jwt, @nestjs/passport, passport, passport-jwt
- argon2
- @prisma/client, prisma (dev)
- class-validator, class-transformer
- @types/passport-jwt (dev)

Tests:
- backend/src/modules/auth/auth.service.spec.ts — 6 tests
  - register: crée user + retourne tokens
  - register: ConflictException si email pris
  - login: retourne tokens si credentials valides
  - login: UnauthorizedException si email inconnu
  - login: UnauthorizedException si mauvais mot de passe
  - login: même message pour email inconnu vs mauvais mot de passe (pas d'énumération)
  - login: UnauthorizedException si compte inactif
  - logout: idempotent

Engineering manual:
- Updated ENGINEERING_MANUAL.md: section [2026-05-25] Phase 2 ajoutée
- Code references: auth.service.ts:94 (login), auth.service.ts:148 (generateTokens), prisma.service.ts:1

Risks:
- Migration SQL à appliquer manuellement : docker-compose up → pnpm db:migrate
- android/ et ios/ mobile toujours vides (inchangé depuis Phase 1)
- Pas de rate limiting sur /auth/login en Phase 2 — à ajouter en Phase 10 (QA)

Next steps:
- Phase 3 : Events, Venues, Suppliers
  - Ajout des entités Venue, Event, Supplier, PickupPoint au schéma Prisma
  - Modules NestJS correspondants
  - Relations avec Organization (déjà créée en Phase 2)

---

## [2026-05-25] Phase 1 — Foundation

Task: Monorepo + backend shell + app shells + Docker + CI
Date: 2026-05-25

Created:
- package.json (root workspace)
- pnpm-workspace.yaml
- turbo.json
- .prettierrc / .prettierignore
- eslint.config.mjs (ESLint 9 flat config)
- .gitignore
- .env.example (toutes les variables documentées)
- docker-compose.yml (PostgreSQL 16 + Redis 7)
- .github/workflows/ci.yml
- DEVELOPMENT_LOG.md (log chronologique complet)
- backend/package.json + tsconfig + nest-cli.json
- backend/src/main.ts
- backend/src/instrument.ts
- backend/src/app.module.ts
- backend/src/config/app.config.ts
- backend/src/health/health.module.ts
- backend/src/health/health.controller.ts
- backend/src/health/health.controller.spec.ts
- apps/admin/ (Next.js 15 shell complet)
- apps/operator/ (Next.js 15 shell + WebSocket stub)
- apps/mobile/ (React Native CLI shell complet)

Modified:
- brain/ENGINEERING_MANUAL.md (Phase 1 entry added)
- brain/TASK_SUMMARY.md (this file)

Why:
- Poser les fondations techniques avant toute logique métier
- S'assurer que tous les packages démarrent, TypeScript passe, CI est vert

Architecture decisions:
- ConfigModule global → aucun module ne lit process.env directement
- Sentry importé avant tout autre module (main.ts + App.tsx)
- WebSocket stub créé en Phase 1 pour stabiliser les chemins d'import dès le départ
- Stores Zustand sans logique métier (setters uniquement, pas de calculs)
- Health endpoint hors prefix /api/v1 (doit répondre sans auth)
- TanStack Query configuré différemment admin vs operator (staleTime 30s vs 10s)

Dependencies added:
- Backend: @nestjs/common, @nestjs/config, @nestjs/core, @nestjs/platform-express, @sentry/nestjs
- Admin/Operator: @tanstack/react-query, next, react, react-dom
- Mobile: @react-navigation/native, @react-navigation/native-stack, zustand, @tanstack/react-query, @sentry/react-native, react-native-screens, react-native-safe-area-context

Tests:
- backend/src/health/health.controller.spec.ts — 3 tests (status, timestamp ISO, environment)

Engineering manual:
- Updated ENGINEERING_MANUAL.md: section [2026-05-25] Phase 1 Foundation ajoutée
- Important code references added: main.ts:1, health.controller.ts:26, app.config.ts, socket-client.ts, query-client.ts, api-client.ts

Risks:
- android/ et ios/ sont vides — setup natif requis localement (Android Studio + Xcode)
- OneDrive peut ralentir node_modules — exclure de la sync OneDrive recommandé

Next steps:
- Phase 2 : Auth + Organizations
  - ORM choice (TypeORM ou Prisma — décision requise)
  - backend/src/modules/auth/ (JWT, guards, stratégies Passport)
  - backend/src/modules/users/
  - backend/src/modules/organizations/
  - Première migration de base de données

---

## Template

```text
Task:
Date:

Created:
- 

Modified:
- 

Why:
- 

Architecture decisions:
- 

Dependencies added:
- 

Tests:
- 

Engineering manual:
- Updated ENGINEERING_MANUAL.md:
- Important code references added:

Risks:
- 

Next steps:
- 
```
