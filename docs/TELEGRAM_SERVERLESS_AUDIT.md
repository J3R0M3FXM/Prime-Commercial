# Prime Commercial — Telegram Serverless Audit (Initial)

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

