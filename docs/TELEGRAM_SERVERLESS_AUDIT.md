# Prime Commercial — Telegram Serverless Audit

Date: 2026-10-17
Branch: `migration/telegram-serverless`
Scope: read-only inspection of the migration branch and connected Supabase project. No production data, deployment, bot settings, or Supabase schema was changed during this audit.

## Executive status

**Not ready for cutover.** The branch contains a useful starter schema, four public read endpoints, and a migration plan, but it does not yet contain a complete deployable Mini App or a complete mapping of the live database. The actual Telegram Serverless bot/project binding is **not verified**.

## Confirmed repository findings

1. `package.json` remains a Next.js 15 application with Next scripts (`dev`, `build`, `start`, `lint`) and the Supabase JS dependency. It does not yet show a Vite static build or a deployment script for Telegram Serverless.
2. The tracked root has `tgcloud/schema.js`, `tgcloud/endpoints/health.js`, `getCatalog.js`, `getActivePromos.js`, and `getPublicPaymentMethods.js`.
3. A tracked root `tgcloud.jsonc` was not found on this branch. The referenced local `PCMTProBot/tgcloud.jsonc` is not present at that tracked path. The static build source is therefore not configured in the tracked project root.
4. `docs/TELEGRAM_SERVERLESS_MIGRATION.md` correctly describes a staged migration and explicitly says production cutover/data import have not happened.
5. The target schema currently declares 12 tables: products, customers, orders, payment_methods, promos, promo_redemptions, warehouses, couriers, videos, charges, point_transactions, and system_settings.
6. The app still has Next.js route code that imports `next/server`, Node `crypto`, Supabase admin helpers, session-cookie helpers, and fingerprint services. These server routes need deliberate porting; they cannot simply be copied into the restricted Serverless runtime.

## Live database snapshot

Connected project status reported as `ACTIVE_HEALTHY`. The live public schema currently exposes 16 tables with these approximate row counts at audit time:

| Table | Rows |
| --- | ---: |
| products | 7 |
| customers | 11 |
| orders | 23 |
| payment_methods | 5 |
| promos | 3 |
| promo_redemptions | 0 |
| warehouses | 3 |
| couriers | 3 |
| charges | 4 |
| point_transactions | 20 |
| system_settings | 0 |
| videos | 3 |
| telegram_automation_flows | 0 |
| telegram_automation_settings | 1 |
| telegram_automation_chats | 0 |
| maya_webhook_events | 0 |

These are a point-in-time schema tool snapshot, not a backup or final migration reconciliation. Total listed rows: 83. Storage objects and other schemas are not included in this total.

### Schema mismatches confirmed

- Four live tables are absent from the current target schema: `telegram_automation_flows`, `telegram_automation_settings`, `telegram_automation_chats`, and `maya_webhook_events`. Even when empty today, they must be assessed and preserved if the feature/configuration remains in scope.
- At least these live columns are absent from the target mapping:
  - `customers`: `referral_points`, `referred_by_user_id`, `referred_by_member_id`
  - `warehouses`: `is_default`, `latitude`, `longitude`
  - `promo_redemptions`: `released_at`, `hardware_id`, `device_fingerprint_id`, `server_fingerprint_id`
- The target schema uses integer timestamp mode/Unix seconds while PostgreSQL stores `timestamptz`. Conversion must be tested for timezone and precision; timestamps must not be blindly copied.
- Telegram Serverless SQLite does not enforce foreign keys, so relationships and business invariants need explicit validation in importer/tests and endpoint logic.

## Bot and project binding audit

**The exact bot that will be used is not yet confirmed.** The tracked `.env.example` names `TELEGRAM_BOT_TOKEN`, `ADMIN_TELEGRAM_USER_ID`, and `TELEGRAM_STORAGE_CHAT_ID`, but these are environment-variable names/placeholders, not evidence of the actual bot linked to Telegram Serverless. The official CLI's Serverless access token is a separate credential stored locally by `tgcloud login` (normally in ignored `.tgcloud/` state), not something that should be committed to Git.

Required before linking/deploying:
1. Inspect the local CLI status and identify the public app ID/bot identity without exposing any token.
2. Confirm in BotFather that Serverless is enabled on the intended production bot.
3. Confirm the app URL and Mini App entry point belong to that same intended bot.
4. Confirm the admin Telegram ID through an owner-controlled verification step; do not trust the example default in `.env.example`.
5. Confirm the intended storage channel/group and bot permissions separately.
6. Never paste bot tokens or CLI access tokens into chat or commit them.

The GitHub branch alone cannot prove which bot is currently selected in the local CLI or BotFather. No bot has been linked or changed as part of this audit.

## Security and data-preservation findings

- The base Supabase schema defines `receipt-proofs` as publicly readable. Payment receipts/customer uploads need a deliberate privacy review before migration; do not blindly reproduce public access in the new system.
- `payment_methods` includes a `secret_key` field. The existing public endpoint correctly selects only public payment instructions, but all future admin/read endpoints must enforce server-side authorization and must never return secret values.
- The live project contains order, payment, loyalty, and configuration records. Do not import over live data, change production traffic, pause Supabase, or delete source records before a verified export and restore test.
- No backup restore was performed during this read-only audit. The current table counts are not a substitute for a backup.

## Next work sequence

1. Inspect the complete tracked migration set and reconcile all live columns/tables/functions/indexes/constraints with the target schema.
2. Establish a repeatable export and verified restore path, including Storage object inventory and access policy.
3. Confirm the intended Telegram bot/project binding using local CLI status/BotFather; do not deploy yet.
4. Add the missing schema and data mapping before importer work.
5. Create the static frontend build/configuration and port a single read-only vertical slice.
6. Add tests for identity authorization, admin access, order ownership, exact financial values, inventory concurrency, and media references.
7. Only proceed to a staged data import after the schema and backup gates pass.

## Audit conclusion

The migration branch is an initial scaffold, not a completed migration. The immediate blockers are the missing tracked Telegram Serverless project config/static build, incomplete live-schema mapping, unverified bot binding, and absence of a verified data/media backup and restore rehearsal. Production remains untouched.


## Additional live infrastructure findings (read-only)

### Supabase Storage snapshot

The live Storage bucket query returned 19 objects totalling approximately 5,692,799 bytes (about 5.43 MiB), excluding metadata overhead:

| Bucket | Public | Objects | Total bytes |
| --- | --- | ---: | ---: |
| product-images | yes | 13 | 2,161,510 |
| receipt-proofs | yes | 6 | 3,530,289 |
| media-gallery | yes | 0 | 0 |

The receipt bucket is currently configured as public. Treat that as a privacy risk to review before copying receipts into Telegram channel storage or another target. Inventory exact object paths, MIME types, sizes, and references before transfer; confirm all migrated URLs resolve before changing product/order records.

### Scheduled work and database functions

- One active Supabase Cron job was found: `prime-loyalty-referral-maturity`, scheduled every 5 minutes, invoking `public.process_matured_referrals()`.
- Twelve public database functions were listed, including order creation/inventory, loyalty awards, point conversion, referral maturity, payment expiry, promo-redemption release, fingerprint enforcement, and product inventory validation.
- These are business logic, not optional infrastructure details. The migration must preserve their observable behavior and idempotency. Because the immediate plan is to defer Maya/GCash webhook changes, do not implement new webhook plumbing as part of the first vertical slice; still preserve existing schema/data and document which payment behaviors remain active.
- The five-minute referral task is a concrete migration requirement. Do not replace it with frequent client polling. First check whether Telegram Serverless offers a supported scheduled-task mechanism for the selected bot; otherwise design an event-driven/on-demand alternative that preserves maturation timing and does not double-award points.



## Expanded reconciliation findings — 2026-10-17

### Live schema versus target mapping

A second pass inspected all live column names, the full target schema declaration, the live migration history, active database triggers, and RLS policies. The target schema still needs a proper reconciliation before it can be treated as import-ready.

**Critical missing target fields:**

- `customers`: `referral_points`, `referred_by_user_id`, `referred_by_member_id`.
- `orders`: `maya_payment_id`, `maya_request_reference_number`, `maya_receipt_number`, `maya_payment_scheme`, `maya_fund_source_type`, `maya_last_webhook_status`, `maya_last_webhook_at`, `store_credits_used`, `promo_shipping_subsidy`, `cashback_points_amount`, `cashback_points_awarded_at`, `cashback_points_reversed_at`, `purchasing_points_amount`, `purchasing_points_awarded_at`, `purchasing_points_reversed_at`, `customer_aggregate_updated_at`, `delivered_at`, `referred_by_user_id`, `referred_by_member_id`, `referral_points_status`, `referral_points_credit_after`, `referral_points_credited_at`, `referral_points_amount`, `payment_deadline_at`, `payment_proof_submitted_at`, `expired_at`, `inventory_released_at`, `inventory_release_error`, `store_credits_released_at`.
- `promo_redemptions`: `released_at`, `hardware_id`, `device_fingerprint_id`, `server_fingerprint_id`.
- `warehouses`: `is_default`, `latitude`, `longitude`.
- Four additional tables remain absent from the target: `telegram_automation_flows`, `telegram_automation_settings`, `telegram_automation_chats`, and `maya_webhook_events`.

The target's `created_at` / `updated_at` helpers are intended timestamp mappings, not additional business fields; however, conversion still needs a tested UTC/precision rule. The order-column gap is especially important because it includes payment references, expiry, inventory release, credits, cashback, purchasing points, and referral maturity state. These cannot be silently dropped, even if the initial cutover keeps provider webhook work deferred.

### Live migration history is not fully reproducible from this branch

Supabase reports **17 applied migration records** from 2026-09-20 through 2026-09-23. Some migration SQL files can be fetched from the branch, but several applied-history names were not found at their expected paths (including the runtime alignment and payment-expiry/receipt-flow migration filenames). Therefore the migration branch's checked-in SQL is not yet proven to be a complete reproducible record of the live database. Resolve this discrepancy by locating the canonical migration files or safely exporting the live schema/functions/policies; do not fabricate replacement migrations from filenames alone.

### Database functions and triggers that must be ported

The live project has 12 public functions:

- `create_order_with_inventory`, `create_order_with_loyalty`: order creation and stock/loyalty path.
- `validate_product_inventory`: rejects negative stock and requires bundle variant stock to be integral, nonnegative, and sum to the parent stock.
- `set_order_payment_deadline`: initializes a one-hour deadline for pending unpaid orders.
- `expire_unpaid_orders`: expiry processing.
- `award_order_loyalty`, `handle_order_loyalty_status`: completion/delivery loyalty behavior.
- `process_matured_referrals`: credits eligible referral rewards after the configured delay.
- `release_promo_redemptions_for_order`, `enforce_promo_device_fingerprint`: active redemption release and device-fraud controls.
- `convert_points_to_store_credits`, `current_customer_tier`: customer rewards/tier logic.

Four non-internal triggers were confirmed: promo fingerprint enforcement before redemption insert; loyalty status handling after order insert/status update; payment-deadline assignment before order insert or relevant updates; and product/bundle stock validation before stock/bundle changes. The equivalent Serverless endpoints must preserve transaction boundaries, locking/idempotency semantics, and rejection conditions rather than merely matching table columns.

### RLS policy risk — do not copy policies as-is

RLS is enabled on the live tables, but the current policy inventory includes broad policies granted to `public`, including:

- `customers`: `Allow Public Customers Upsert` (`ALL`, `USING true`)
- `orders`: `Allow Public Orders Select` and `Allow Public Orders Update` (`UPDATE`, `USING true`)
- `point_transactions`: `Allow Public Point Transactions` (`ALL`, `USING true`)
- `promo_redemptions`: `Allow Public Redemptions` (`ALL`, `USING true`)

Other public read policies exist for product/configuration tables. This is a significant authorization risk: RLS being enabled does not itself mean access is restricted. The new backend must enforce validated Telegram identity, order/customer ownership, and admin role checks on every sensitive read and mutation. Do not port these permissive policies or expose direct write access from the Mini App. Payment secret fields must remain server-only.

### Backup and cutover gates remain closed

- No verified export/restore rehearsal has been performed.
- No storage objects or database rows have been imported into Telegram Serverless.
- No production bot binding, deployment, payment configuration, or Supabase schema has been changed.
- Maya/GCash webhook redesign remains outside the initial slice, as requested; existing payment/order state and audit records must still be preserved.
- The current evidence supports continuing with schema/security reconciliation and migration tooling, not production cutover.


## Application surface and runtime-port audit

The current Next.js application tree contains **43 API route handlers**. The Telegram Serverless branch currently has only four public/read endpoints plus a health check, so backend parity is still very early. Route families that must be explicitly accounted for include:

- Customer account, points conversion/transfer, Telegram authentication/session, referral validation.
- Orders, checkout/delivery fees, promo validation, product/payment-method/charge reads.
- Admin authentication and CRUD for products, promos, customers, orders, payments, payment methods, charges, warehouses, couriers, automation, diagnostics, and media.
- Receipt upload and OCR, video gallery/view/stream/download, Geoapify address/routing services.
- Scheduled unpaid-order expiry and loyalty/referral work.
- Telegram Business secretary/automation webhook and Maya checkout/webhook endpoints.

The current app's `next.config.mjs` does not configure static export, and `package.json` still builds/runs Next.js server routes. The migration cannot be completed by merely adding `static.source: "dist"` or copying the current API files: the frontend needs a real static build, while the 43 server handlers need a route-by-route replacement using the Serverless SDK/runtime constraints. Preserve one canonical mapping table from each current route to its target endpoint and its authorization/tests.

### High-priority porting notes

- The current admin CRUD handlers often rely on Next middleware for session gating rather than enforcing authorization within the handler. Serverless endpoint equivalents must be safe independently and must not assume Next middleware will run.
- The current Telegram auth handler contains a preview fallback when init data or the bot token is missing. A production Serverless build must fail closed if its intended bot configuration is absent; preview identities must never become a production authentication path.
- The current unpaid-order expiry endpoint is protected by `CRON_SECRET` and calls `expire_unpaid_orders`; the referral-maturity cron calls `process_matured_referrals`. Both behaviors need a supported trigger strategy in the new runtime, with no public unauthenticated trigger and no duplicate credit/stock release.
- Media requires separate handling for public product imagery versus private payment receipts and Telegram-hosted videos. A Telegram `file_id` is not itself a browser-ready URL; verify the serving/download path and access checks rather than storing it directly as an image URL.
- Do not include changes to product records/catalog content in this audit or migration tooling; preserve existing catalog data byte-for-byte/semantically and keep UI/content edits separate from the infrastructure migration.

The route inventory is based on the tracked `main` application tree used as the current feature reference. Before implementation, compare it against the latest production branch/commit and the migration branch to ensure no newer admin or secretary work is omitted.


### Migration-history filename reconciliation correction

A direct directory listing confirms the migration branch contains 18 checked-in SQL migration files. The live Supabase history reports 17 applied migrations, but the history version/name pairs do not directly match the filenames in the branch (for example, live version `20260920172105_runtime_schema_alignment_20260921` versus checked-in `20260921000100_runtime_schema_alignment.sql`). Therefore this finding is **version/name mismatch and incomplete direct traceability**, not proof that SQL content is absent. The next safe check is a semantic migration-by-migration comparison of the live records against checked-in files and live schema; no replacement SQL should be invented solely to align filenames.
