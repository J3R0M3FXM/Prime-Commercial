# Prime Commercial — Clean Build Plan

**Build type:** Clean rebuild (new implementation; no legacy runtime carry-over)  
**Repository:** `J3R0M3FXM/Prime-Commercial`  
**Working branch:** `rebuild/telegram-serverless-clean-build`  
**Reference branch:** `migration/telegram-serverless`  
**Production target:** https://app8830494959.tgcloud.ai/  
**Architecture:** GitHub for code · Supabase Storage for files only · Telegram Serverless for app hosting, backend, and operational database.

## 1. Mandate

Build a clean, maintainable Prime Commercial application for Telegram Serverless. Do not treat this as another patch series on top of the legacy application, and do not simply copy the existing Vercel-oriented project and rename its deployment settings.

Create a fresh application structure and implement the required customer-facing and admin functionality against the target architecture. Use the existing repository, prior audit findings, current production behavior, business rules, UI assets, and data structures as **reference material**. Reuse proven business logic or assets selectively only after checking that they are portable and fit the clean architecture.

A clean build does **not** mean deleting production data, abandoning existing features, or changing business rules without authorization. Preserve data, functionality, branding, and established workflows while replacing the legacy implementation.

## 2. Required service boundaries

| Service | Responsibility | Explicit exclusions |
|---|---|---|
| **GitHub** | Source control, code review, issues, versioned build plan, release history | No production runtime or operational data storage |
| **Supabase Storage** | Product images and other approved file/object assets | No Supabase Database, Auth, Edge Functions, Realtime, or application API dependency |
| **Telegram Serverless** | Frontend/Mini App hosting, backend/API handlers, operational database, server-side business rules, and supported jobs | No Vercel dependency and no separately hosted application backend |
| **Telegram** | Mini App entry point and signed identity/init data | Not a substitute for server-side authentication, authorization, or database persistence |

**Database requirement:** all operational application data must live in the database capability provided by the target Telegram Serverless environment. Before implementation, verify its actual database product, query interface, transaction and migration support, persistence guarantees, and limits. Do not assume undocumented capabilities. If a required capability is unavailable, stop that design decision and document the exact platform constraint instead of silently adding an external database.

**Storage requirement:** Supabase is used only to store and serve files. The Telegram Serverless database stores business records and file references/metadata. Privileged Storage credentials must never be exposed in frontend code.

**Hosting requirement:** the production Mini App and application APIs run on Telegram Serverless. GitHub is the code source, not a runtime host. Vercel must not be required for builds, deployment, routing, functions, or application operation.

## 3. Clean-build rules

1. Establish a fresh application source layout on this rebuild branch; do not copy the legacy application wholesale.
2. Keep the legacy/reference branch unchanged while the clean build is developed.
3. Do not inherit Vercel configuration, middleware assumptions, serverless-function conventions, deployment scripts, or stale environment variables unless proven necessary and compatible.
4. Do not retain Supabase database/auth clients or endpoints. Retain only a properly scoped Supabase Storage integration.
5. Keep domain logic, data access, validation, and authorization separate from UI components.
6. Use a documented API contract and shared validation/types so frontend and handlers agree on response shapes.
7. Do not fabricate data to make the UI look functional; connect screens to real Telegram Serverless database operations.
8. Preserve established Prime branding and existing supported workflows unless a change is explicitly required for correctness or approved.
9. Do not migrate, delete, or overwrite production data during initial scaffolding.
10. Do not switch the live URL to an incomplete build.

## 4. Phase A — Requirements and source-of-truth inventory

Use the existing application and previous findings as references, without repeating broad audits unnecessarily.

- Inventory customer and administrator screens, routes, forms, actions, business rules, and current data entities.
- Capture the current behavior and known failures, including account/profile hydration, order-history loading, shopfront data hydration, and admin create/edit flows.
- Identify all existing features that must be preserved: catalog, product variants, inventory, cart, checkout, orders, payment methods, promotions, warehouses, couriers/delivery, customer profiles, loyalty/store credits/referrals where present, receipts/media, support/help content, and administrative workflows.
- Identify brand assets, fonts, logos, reusable static content, and approved image assets.
- Document current data sources, IDs, relations, enums/statuses, storage buckets/paths, and required environment configuration.
- Verify the Telegram Serverless runtime, database, static hosting, API handler, secrets, logging, and scheduler/event capabilities using current platform documentation and the actual project configuration.

**Deliverable:** a concise feature matrix, target data model, verified platform capability list, and acceptance criteria. This is a bounded discovery step, not a reason to delay implementation with repeated audits.

## 5. Phase B — Bootstrap the clean application

- Create a new, minimal frontend entry point using only the framework and build format supported by Telegram Serverless.
- Create a clean server-side API/handler layer in the documented Telegram Serverless format.
- Create a platform-compatible configuration and a reproducible build/deploy command.
- Establish consistent linting, type checking, formatting, and targeted tests supported by the repository toolchain.
- Separate public configuration from server-only secrets.
- Add a health endpoint and a minimal diagnostic path that does not expose credentials or personal data.
- Remove inherited Vercel runtime assumptions from the new implementation.

**Acceptance:** clean install/build succeeds, the app shell runs in the target environment, and health diagnostics work on Telegram Serverless.

## 6. Phase C — Data model and safe migration

- Confirm the native Telegram Serverless database interface before selecting schema syntax or database-specific features.
- Implement the schema for all required entities discovered in Phase A, including the existing equivalents of customers/profiles, roles/admin access, products/variants, inventory, warehouses, couriers, delivery settings, payment methods, orders/order items, payment state, promotions, loyalty/store-credit records, receipts/file references, and audit events as applicable.
- Preserve stable IDs, historical order details, relationships, statuses, timestamps, and business-critical values.
- Add supported indexes, uniqueness/integrity constraints, ownership rules, and transactional protections.
- Keep privileged database access server-side.
- Export and back up the existing source data before migration.
- Create repeatable migration scripts with explicit source-to-target mappings and error reporting.
- Reconcile counts and sample records for each entity; verify customer ownership, order totals/statuses, inventory quantities, and file references.
- Keep the source intact until the new app is verified. Plan a controlled final sync/cutover to avoid split-brain writes.
- Document and test rollback before production cutover.

**Acceptance:** data is migrated and reconciled, critical relationships are intact, and rollback is available. Do not claim success from row counts alone.

## 7. Phase D — Backend and security

Implement server-side endpoints/services for every feature in the Phase A matrix, including:

- Health and public catalog/product details.
- Active promotions and public payment methods.
- Customer profile/account reads and updates.
- Customer-scoped order history and order details.
- Cart/checkout/order creation and supported status transitions.
- Inventory/stock checks and safe order stock handling.
- Payment methods and payment-state handling.
- Admin CRUD for products, variants, payment methods, warehouses, couriers, inventory, promotions, orders, and other existing modules.
- Media metadata and secure Supabase Storage upload/read authorization.
- Existing support, loyalty, referral, receipt, and notification flows where present.

Security requirements:

- Validate Telegram Mini App init data and freshness server-side before trusting identity.
- Map Telegram identity to an internal user record and enforce authorization at each protected API.
- Verify order ownership and admin roles on the server, not just in UI navigation.
- Validate all inputs and calculate prices, discounts, delivery fees, and totals on the server.
- Prevent duplicate order submissions and unsafe stock changes using supported idempotency/transaction mechanisms.
- Keep secrets out of source control, client bundles, and logs.
- Apply appropriate rate limits, safe errors, and audit logging using supported runtime features.

**Acceptance:** all implemented endpoints use the Telegram Serverless database and have explicit authentication, authorization, validation, and response contracts.

## 8. Phase E — Clean customer frontend

Build the customer Mini App from the clean source structure and connect every screen to live APIs.

- Preserve the established Prime brand identity and approved assets.
- Implement launch/session initialization and clear loading, empty, success, and failure states.
- Implement catalog, product details, variants, promotions, cart, checkout, payment-method selection, delivery information, order confirmation, account/profile, order history/details, receipts, and other required existing customer features.
- Ensure profile and order data hydrate correctly on initial launch, refresh, and return navigation.
- Avoid local mock data in production paths.
- Ensure request/response schemas match the backend contract.
- Verify mobile/Telegram WebView behavior, touch controls, navigation, and media loading.

**Acceptance:** the customer app uses live Telegram Serverless data end-to-end and does not rely on legacy APIs.

## 9. Phase F — Clean admin frontend

Build a reliable admin experience using the same documented API contracts.

- Implement authentication gates and role-aware navigation.
- Support list, create, view, edit, validation, save, and actionable error states for each supported admin entity.
- Prioritize products/variants, payment methods, warehouses, couriers, inventory, promotions, and order management.
- Ensure modal, form, and touch interactions work in Telegram's mobile WebView.
- Verify successful writes are reflected in subsequent reads from the Telegram Serverless database.
- Do not expose administrative controls as authorized merely because they are visible.

**Acceptance:** authorized administrators can complete the required CRUD workflows, and unauthorized users are rejected server-side.

## 10. Phase G — Supabase Storage integration

- Use existing approved buckets and object paths where appropriate; do not move/delete assets without a migration plan.
- Keep only Storage integration code and configuration.
- Prefer short-lived signed URLs or a server-authorized upload flow that matches the bucket's policies.
- Validate content type, size, destination, and user/admin permission.
- Store file paths/URLs and associated business metadata in the Telegram Serverless database.
- Test product image delivery and authorized uploads from the deployed app.
- Verify that disabling Supabase Database/Auth/Functions does not break application data access or authentication.

**Acceptance:** Supabase is a file/object store only.

## 11. Phase H — Build, deploy, and production cutover

- Build from the clean rebuild branch using the actual Telegram Serverless toolchain.
- Publish frontend assets through Telegram Serverless's supported hosting configuration.
- Deploy backend handlers and database schema/migrations through supported platform mechanisms.
- Configure production secrets in the platform's secret/configuration facility.
- Deploy first to a non-production/staging target if supported; otherwise use a safe, isolated test configuration.
- Keep the current production release available until acceptance passes.
- Verify the deployed artifact maps to a specific GitHub commit.
- Switch the live Mini App only after database migration, core flows, security, and rollback have passed.

**Acceptance:** the live Telegram Serverless URL serves the clean build, and all required runtime paths operate within the agreed architecture.

## 12. Phase I — Targeted acceptance tests

Run automated tests where practical plus deployed end-to-end smoke tests:

- [ ] App launches inside Telegram and the target URL loads.
- [ ] Health endpoint and public catalog/promotions/payment methods respond.
- [ ] Telegram identity validation and session initialization succeed.
- [ ] Account/profile data loads correctly after launch and refresh.
- [ ] Order history and order details load only for the correct customer.
- [ ] Product/variant/inventory operations preserve stock consistency.
- [ ] Cart, checkout, totals, delivery fees, and order creation work.
- [ ] Duplicate order submissions are safely handled.
- [ ] Payment state and expiry workflows work where implemented and supported.
- [ ] Admin product, payment-method, warehouse, courier, inventory, promotion, and order CRUD works.
- [ ] Unauthorized admin requests and cross-customer data requests are rejected.
- [ ] Supabase Storage images load and authorized uploads work.
- [ ] Existing data reconciliation and sampled historical orders pass.
- [ ] No required production path calls Vercel or Supabase non-storage services.
- [ ] Failure states are understandable and logs are useful without exposing secrets.
- [ ] Rollback procedure is documented and viable.

Fix failures by priority: app unavailable, data/auth/order integrity, core customer workflows, admin CRUD, then non-blocking polish. Avoid broad repeated audits.

## 13. Cutover and cleanup policy

- Do not delete the reference branch or old source during clean-build development.
- Do not point production traffic to an incomplete build.
- Do not delete old data, credentials, buckets, or deployments until the new system is verified and rollback is no longer required.
- After acceptance, remove unused Vercel and Supabase non-storage configuration from the clean application.
- Document backup/restore, environment setup, deployment, health checks, known platform limits, and rollback.
- Keep the legacy application available as a reference until feature parity and data acceptance are signed off.

## 14. Definition of done

- [ ] Clean source structure and deployable build exist on `rebuild/telegram-serverless-clean-build`.
- [ ] Existing required features and Prime branding are preserved.
- [ ] GitHub remains the source-of-truth for code and release history.
- [ ] Telegram Serverless hosts the frontend and backend.
- [ ] Telegram Serverless's native database is the only operational application database.
- [ ] Supabase is used for Storage only.
- [ ] No Vercel runtime/build/deployment dependency remains in the clean production path.
- [ ] Data migration is backed up, reconciled, and recoverable.
- [ ] Account hydration, order history, checkout, inventory, and required admin CRUD pass.
- [ ] Authentication, authorization, and secrets handling are verified.
- [ ] Deployed smoke tests pass at the target URL.
- [ ] Rollback and operational instructions are documented.

## 15. Progress reporting

Each implementation update should state only:
1. What was implemented and which files changed.
2. The Git commit/branch.
3. Build/test/deployment results that were actually observed.
4. Data migration/reconciliation results, if performed.
5. Specific blockers and the next concrete action.

Do not equate writing this plan, scaffolding the app, or passing a build with completing the migration.

---

**Target outcome:** a genuinely clean Prime Commercial implementation—not a patched Vercel application—using GitHub for code, Supabase Storage for files, and Telegram Serverless for app hosting, backend, and the operational database.
