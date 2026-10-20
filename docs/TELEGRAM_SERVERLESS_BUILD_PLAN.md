# Prime Commercial — Telegram Serverless Build Plan

**Status:** Implementation plan  
**Repository:** `J3R0M3FXM/Prime-Commercial`  
**Target production app:** https://app8830494959.tgcloud.ai/  
**Primary objective:** Restore and operate Prime Commercial without Vercel, using GitHub for source code, Supabase Storage for file/object storage only, and Telegram Serverless for application hosting and the operational database.

## 1. Target architecture and responsibility boundaries

| Service | Sole intended responsibility | Must not become |
|---|---|---|
| **GitHub** | Source code, version history, reviews, issues, and release/change tracking | A production runtime, database, or file-upload service |
| **Supabase Storage** | Object/file storage for product images and other approved media; store object paths/URLs and metadata in the application database | The application's database, authentication provider, API backend, Edge Functions host, or required runtime dependency beyond object storage |
| **Telegram Serverless** | Mini App/frontend hosting, backend/API handlers, operational database, authentication integration, business logic, and supported scheduled/event processing | A thin proxy that still requires Vercel or Supabase database services |
| **Telegram** | Mini App launch surface and Telegram identity/init-data source | A substitute for server-side authorization or business-data persistence |

**Hard boundary:** application records and relational business data live in the Telegram Serverless database. Supabase is used only for Storage. No Supabase Database, Auth, Edge Functions, Realtime, or other Supabase service may be required at runtime. No Vercel deployment, function, routing, environment variable, or build service may be required to serve the production app.

Before implementation depends on a Telegram Serverless feature, confirm that the current project/runtime actually supports it. Do not assume a database engine, transaction model, scheduler, filesystem persistence, or storage integration exists without checking the platform's available capabilities. If a required capability is missing, document the exact blocker and select a supported Telegram Serverless-native implementation; do not quietly add an external backend.

## 2. Goals

1. Restore the existing live Mini App and fix critical customer-facing failures first.
2. Preserve existing business data and all currently implemented features.
3. Make the Telegram Serverless database the single source of truth for application data.
4. Use Supabase Storage only for object/file bytes; keep object references and business metadata in the Telegram Serverless database.
5. Keep all application source code and deployment configuration in GitHub.
6. Remove Vercel from the production build and runtime path.
7. Verify real production behavior instead of treating a successful build as completion.

## 3. Non-goals and prohibited shortcuts

- Do not redesign or rewrite working features just to change hosting.
- Do not delete, truncate, or overwrite production records as a migration shortcut.
- Do not use browser-side secrets or expose database/admin credentials.
- Do not trust Telegram Web App data until its signature/hash and freshness are validated server-side.
- Do not authorize admin actions from UI visibility alone.
- Do not leave API routes pointing at Vercel or Supabase Database/Auth.
- Do not report a migration as complete when only starter endpoints or a static frontend have been deployed.

## 4. Execution sequence

### Phase 0 — Establish a safe baseline

- Continue from the existing `migration/telegram-serverless` branch and reuse previous findings; do not repeat a full audit unless a targeted check is necessary.
- Inspect current source, Telegram Serverless configuration, existing endpoint handlers, schema definitions, deployment commands, environment-variable usage, and the current production URL.
- Identify the latest known working deployment and preserve a rollback path.
- Inventory every runtime dependency and classify it as GitHub/development-only, Telegram Serverless, Supabase Storage, or removable legacy/Vercel/Supabase service.
- Record the current database source, tables, record counts where accessible, storage buckets/paths, and backup/export status before data changes.

**Exit criteria:** a concise dependency map, known production entry point, rollback approach, and verified platform capability list.

### Phase 1 — Restore the live app with minimal changes

- Confirm that the Telegram Serverless app URL serves the expected frontend.
- Check health and existing public endpoints, including catalog, active promotions, and public payment methods.
- Fix only immediate build, startup, routing, configuration, or endpoint failures needed to restore service.
- Avoid broad refactors during restoration.
- Verify the frontend is calling the intended Telegram Serverless API base and not stale Vercel URLs.

**Exit criteria:** app loads, public data endpoints respond, and critical errors are captured with actionable logs.

### Phase 2 — Define the Telegram Serverless operational database

- Confirm the actual native database product, connection/API model, limits, transaction support, migration mechanism, backups, and permission model supplied by the Telegram Serverless project.
- Implement the supported schema and data-access layer for all existing business entities. Derive the final schema from the current application and production data, not from starter examples alone.
- Cover, as applicable to the existing codebase: users/customer profiles, roles and admin access, products/variants, inventory, warehouses, couriers, delivery settings, payment methods, orders, order items, payment records/statuses, promotions, loyalty/points, and audit events.
- Preserve stable IDs, relationships, timestamps, status values, and any historical order snapshots required by the existing behavior.
- Add required indexes, uniqueness rules, foreign-key or equivalent integrity checks, and safe transaction/consistency handling supported by the platform.
- Centralize database access behind server-side repository/service modules; avoid direct client-side access to privileged database interfaces.
- Store Supabase Storage object keys/URLs and relevant media metadata in the Telegram Serverless database. Do not store file bytes in business tables unless the platform explicitly requires a small inline value.

**Exit criteria:** all required entities are represented, constraints are documented, and server-side read/write paths work against the Telegram Serverless database.

### Phase 3 — Migrate and verify existing data

- Take a recoverable export/backup of the source data before writes or cutover.
- Create an explicit source-to-target mapping, including enum/status mapping, IDs, nullable fields, timestamps, relationships, and media references.
- Migrate in repeatable, idempotent batches where supported; log failed rows and provide safe retries.
- Reconcile record counts and key relationships for each entity. Compare important order totals, customer ownership, inventory quantities, payment states, and promotion data.
- Keep the old source intact until verification and production acceptance are complete.
- Plan cutover to prevent split-brain writes. If a short write freeze or a controlled final delta sync is required, document and schedule it.
- Test rollback before removing old credentials or services.

**Exit criteria:** migration reconciliation passes, sampled records match, no unexplained orphaned relationships remain, and rollback is available.

### Phase 4 — Configure Supabase Storage only

- Inventory existing buckets, object paths, access policies, upload flows, and media URLs.
- Retain or configure only Supabase Storage for product imagery and other explicitly approved files.
- Use least-privilege access. Keep service-role keys and any signing credentials server-side; never embed privileged keys in the Mini App bundle.
- Implement uploads/downloads through a supported secure pattern: short-lived signed URLs or a server-authorized upload flow, as appropriate to the existing bucket policies.
- Validate file type, size, ownership, and allowed destination before accepting uploads.
- Keep storage object references and business metadata in the Telegram Serverless database.
- Migrate files only if necessary; verify object existence and access before updating references.
- Remove dependencies on Supabase Database, Supabase Auth, Supabase Functions, and other non-storage Supabase services.

**Exit criteria:** images/files load and authorized uploads work; application data reads and writes continue to work if Supabase's database/auth/functions are unavailable.

### Phase 5 — Complete backend and API handlers on Telegram Serverless

- Consolidate existing handlers and endpoint modules using the platform's supported handler format.
- Implement server-side services for catalog, promotions, public payment methods, customer accounts, order history, checkout/order creation, order updates, inventory, admin CRUD, warehouse and courier management, and other existing features discovered in the repository.
- Standardize request validation, response schemas, error responses, pagination, and status codes.
- Keep business rules server-side, including price calculation, stock validation/reservation, order totals, delivery fees, promotion eligibility, payment state transitions, and expiry behavior.
- Use idempotency or equivalent duplicate-submission protection for order creation and payment callbacks where supported.
- Validate Telegram Mini App init data server-side; map Telegram identity to the internal user record. Enforce role checks and resource ownership on every protected request.
- Implement rate limiting, safe logging, and secrets handling using supported platform facilities.
- Use Telegram Serverless-native scheduling/events only where supported. If expiry or background work needs a scheduler, verify that capability before designing around it.

**Exit criteria:** no required backend route depends on Vercel, Supabase Database/Auth/Functions, or an unverified external runtime.

### Phase 6 — Repair frontend hydration and admin workflows

- Trace each affected UI operation from component to API request to server handler to database and back.
- Fix expected/actual response-shape mismatches and consistent loading, empty, and error states.
- Repair account/profile data hydration and order-history loading, including authenticated customer scoping.
- Verify catalog/product detail, promotions, cart, checkout, order status, payment-method display, and any existing loyalty flows.
- Restore admin create/edit/list operations for products, payment methods, warehouses, couriers, inventory, promotions, orders, and other implemented modules.
- Verify admin permissions at the API boundary, not just through hidden buttons or routes.
- Preserve the existing design and working behavior unless a change is required for compatibility or correctness.

**Exit criteria:** customer data renders after launch/refresh, order history loads, and authorized administrators can successfully create, update, and retrieve each supported entity.

### Phase 7 — Deploy through Telegram Serverless

- Use the repository's actual supported Telegram Serverless CLI/configuration and documented build artifact format.
- Ensure the frontend build output is published using the configured Mini App static hosting mechanism and backend handlers are deployed to their supported locations.
- Configure production environment variables/secrets in Telegram Serverless; do not commit credentials.
- Confirm API base paths, CORS/origin behavior if applicable, Telegram launch configuration, and media URLs.
- Deploy a versioned release from GitHub and retain the prior working release for rollback where the platform supports it.
- Confirm the deployed artifact and handlers match the intended commit.

**Exit criteria:** the live Telegram Serverless URL serves the intended release and all required runtime components are available there.

### Phase 8 — Focused verification and cutover

Run tests against the deployed app, not just local mocks:

- App startup and Telegram Mini App launch.
- Public health, catalog, promotions, and payment-method endpoints.
- Telegram init-data validation, customer session resolution, and admin authorization.
- Customer profile/account hydration.
- Order history and ownership isolation.
- Product, inventory, warehouse, courier, and payment-method admin CRUD.
- Order creation, duplicate submission protection, stock consistency, totals, and status transitions.
- Supabase Storage image reads and authorized upload flow.
- Data reconciliation and critical historical order checks.
- Failure behavior when an endpoint, object, or configuration value is unavailable.
- Confirmation that the deployed frontend and backend do not call Vercel or Supabase non-storage services.

Use targeted tests based on changed code and previous known failures. Do not repeat unrelated audits or delay restoring the application for low-priority cleanup.

**Exit criteria:** all critical flows pass, no data-loss discrepancy is unresolved, and runtime dependency checks meet the target architecture.

### Phase 9 — Remove legacy dependencies and document operations

- Remove obsolete Vercel configuration, scripts, aliases, environment variables, and deployment workflows once verified unused.
- Remove Supabase Database/Auth/Functions client packages and code only after confirming no active path requires them.
- Retain Supabase Storage integration and its documented secure configuration.
- Update `README.md`, environment examples, deployment instructions, operational troubleshooting, backup/restore, and rollback documentation.
- Add a concise dependency checklist to prevent future accidental reintroduction of Vercel or non-storage Supabase services.

**Exit criteria:** clean deployment instructions, documented recovery process, and no unintended legacy runtime dependency.

## 5. Environment and secrets policy

Use placeholders in tracked documentation only. Actual values belong in the appropriate Telegram Serverless or storage-provider secret configuration.

Expected configuration categories (adapt names to the actual platform and code):

- Telegram bot/app identifiers and server-side validation secret/token.
- Telegram Serverless database connection/configuration required by the platform.
- Supabase project URL and narrowly scoped Storage access configuration.
- Supabase service-role or signing credentials only if the chosen secure server-side Storage workflow requires them.
- Public app/API configuration safe to expose to the browser.

Never commit real secrets to GitHub, logs, issue comments, or the frontend bundle. Rotate any credential previously exposed in source control.

## 6. Data safety, observability, and rollback

- Back up source data before migration and document restore steps.
- Make migration scripts repeatable and record batch results.
- Log request correlation IDs and actionable errors without recording secrets, full payment credentials, or unnecessary personal data.
- Monitor endpoint failures, database errors, upload failures, and order-processing failures using capabilities actually available on Telegram Serverless.
- Preserve the previous production deployment and source data until post-cutover verification is complete.
- Roll back application release and/or data writes using a documented plan if critical order or data-integrity failures occur.
- Do not perform destructive cleanup as part of the initial restoration.

## 7. Work priorities

1. **P0:** Live app loads; core endpoints and production configuration work.
2. **P0:** Customer account data and order history load correctly.
3. **P0:** Telegram Serverless database read/write paths and authentication/authorization are correct.
4. **P1:** Admin CRUD for products, payment methods, warehouses, couriers, inventory, and orders works.
5. **P1:** Supabase Storage works independently of all Supabase non-storage services.
6. **P1:** Data migration/reconciliation and rollback are verified.
7. **P2:** Remove unused legacy code and polish documentation after critical flows are stable.

## 8. Definition of done

The build is complete only when all of the following are true:

- [ ] GitHub contains the source code and deployment instructions.
- [ ] The production frontend is hosted by Telegram Serverless.
- [ ] Backend handlers and APIs run on Telegram Serverless.
- [ ] The Telegram Serverless database is the only operational application database.
- [ ] Supabase is used for Storage only.
- [ ] No Vercel runtime, hosting, functions, or deployment dependency remains.
- [ ] No Supabase Database, Auth, Functions, or other non-storage service is required at runtime.
- [ ] Existing records and relationships are migrated and reconciled.
- [ ] Customer profile and order history hydrate correctly.
- [ ] Critical ordering, inventory, payment, and admin workflows pass production smoke tests.
- [ ] Secrets are server-side and authorization is enforced on every protected operation.
- [ ] Backup, rollback, and deployment steps are documented.
- [ ] The live URL is tested and the deployed version is traceable to a GitHub commit.

## 9. Implementation reporting

Report only concrete results:

- Files changed and commit SHA.
- Deployment version/URL and whether the deployment was confirmed.
- Tests run and pass/fail results.
- Data migration counts and discrepancies, if a migration was performed.
- Remaining blockers tied to a specific platform capability or failing workflow.

Do not claim that a service has been removed, data migrated, or a workflow fixed without verification.

---

**Guiding principle:** GitHub is the code source; Supabase Storage holds files; Telegram Serverless hosts the Mini App and backend and owns the operational database. Keep the change focused on restoring the application and completing this architecture without unnecessary repeated audits or feature rewrites.
