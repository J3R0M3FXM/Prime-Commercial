# Prime Commercial — Oracle Cloud + Telegram Serverless Migration Assessment

**Assessment date:** 2026-10-18  
**Baseline:** main at 917e44a62a4f0d30ccf2e6a031fb43875032db28  
**Status:** Read-only assessment; no production data, deployment, DNS, payment configuration, Telegram bot configuration, or Supabase schema changed.

## Executive decision

Use a two-stage, non-destructive migration rather than attempting a one-shot cutover:

1. **Oracle Cloud Always Free:** prepare a production-capable host for the existing Next.js application and API routes. Initially keep Supabase PostgreSQL and Storage as the source of truth. This is the lowest-risk way to move the web runtime off Vercel without rewriting all business logic at once.
2. **Telegram Serverless:** continue as a separate, deliberate port of the Mini App and backend endpoints. Do not assume the Next.js server routes or Node packages can run in the restricted V8 runtime. Do not switch the production bot or import live data until schema parity, endpoint parity, backup/restore, and end-to-end tests pass.

This keeps Oracle hosting and Telegram Serverless as distinct targets with different runtime constraints. It avoids treating a static Mini App as a complete migration of the business backend.

## Confirmed repository findings

- The app is a Next.js 15 / React 19 TypeScript application. package.json defines dev, build, start, and lint scripts; no Oracle deployment pipeline or static Vite build is present in main.
- app/api contains approximately 40 route handlers covering account/loyalty, admin CRUD, orders, payment methods, checkout, Maya, media/storage, Geoapify, OCR, Telegram Business webhooks, and scheduled jobs.
- vercel.json configures two scheduled routes: /api/cron/loyalty and /api/cron/orders, both every five minutes. The Oracle target must replace these schedules explicitly (e.g. systemd timers/cron or a separately secured worker) and must prevent public triggering.
- Environment names in .env.example include Supabase URL/key, Telegram bot token, session secret, admin access code/Telegram user ID, Maya environment, Geoapify, OCR, and Telegram storage configuration. The values must be provisioned as server-side secrets; never copy actual values into Git.
- The GitHub branch migration/telegram-serverless is diverged from current main: comparison reports 39 commits ahead and 196 behind. Do not merge or deploy it wholesale. Reconcile its changes against current main selectively after review.
- The existing Telegram Serverless target code is incomplete as a production app: the migration branch still has Next.js scripts and Supabase dependencies, the target schema maps only a subset of live tables/columns, and the static app entry/configuration and frontend endpoint bridge are not complete. Its own audit and migration docs mark it not ready for cutover.

## Live Supabase snapshot

Connected project: pcojgnqyjndplhhadzed (supabase-cinnabar-ridge), region us-east-1, PostgreSQL 17, status ACTIVE_HEALTHY.

Point-in-time public table counts returned by the connected database tool:

| Table | Rows |
| --- | ---: |
| products | 7 |
| customers | 12 |
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
| **Total public rows listed** | **84** |

These counts are a baseline only, not a backup or a migration reconciliation. They exclude Storage objects and non-public schemas. Existing business records must not be reset, overwritten, or imported into production without a verified export and restore rehearsal.

### Schema and data-preservation blockers

- Live schema contains 16 public tables. The initial Telegram Serverless mapping covers 12 and omits telegram_automation_flows, telegram_automation_settings, telegram_automation_chats, and maya_webhook_events.
- Migration-added columns must be included in any mapping. Confirmed examples: customer referral fields; order Maya/payment expiry, inventory release, credits and loyalty fields; warehouse default/coordinates; courier fare fields; promo-redemption fingerprint/release fields.
- PostgreSQL timestamptz, numeric money values, JSONB, nullable fields, defaults, unique constraints, triggers, RPCs, indexes, and idempotency behavior need explicit conversion tests. Telegram Serverless SQLite does not provide PostgreSQL-equivalent behavior in every area and does not enforce foreign keys; a copy of table names is not schema parity.
- Existing schema SQL marks receipt-proofs as publicly readable. Treat payment receipts as sensitive evidence; review and correct access policy as a separately approved security change, not as an accidental side effect of migration.
- The payment_methods table has a secret_key column. Public endpoints must use an explicit public-field allowlist, and admin authorization must be enforced inside every privileged endpoint.
- Supabase security advisors currently report nine RLS-enabled tables with no policies: customers, maya_webhook_events, orders, point_transactions, promo_redemptions, system_settings, telegram_automation_chats, telegram_automation_flows, and telegram_automation_settings. Review actual access paths, grants, and server-role usage before making policy changes; do not add broad policies just to silence the advisory.
- Current row counts and a healthy project status do not prove the customer profile, order history, checkout, admin writes, or payment callbacks work end to end.

## Oracle Always Free compatibility

Official OCI documentation: [Always Free Resources](https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm) and [OCI Free Tier](https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier.htm).

| Component | Fit | Conditions / caveats |
| --- | --- | --- |
| Existing Next.js Node runtime | **Likely compatible** on Ubuntu/Oracle Linux ARM64 or AMD64; verify dependencies and native modules on the selected image | Build and run a staging copy first. Keep Node version pinned and test all routes. |
| Reverse proxy + HTTPS | Compatible using Nginx/Caddy and certificates | Configure TLS renewal, health checks, request size limits, and safe proxy headers. |
| Scheduled jobs | Compatible via systemd timers/cron or a worker | Add locking/idempotency; do not expose cron endpoints publicly. |
| Supabase PostgreSQL | Keep as current database in phase 1 | This does not remove the Supabase dependency; it reduces the Vercel runtime dependency. |
| Media | Keep existing Supabase Storage in phase 1 | Inventory buckets and object access before any move; receipts need privacy review. |
| Oracle Always Free compute | Official allowance includes up to 2 OCPUs and 12 GB RAM total for Ampere A1, subject to home-region eligibility and tenancy capacity | Confirm available capacity and actual tenancy limits in Console. OCI warns idle Always Free compute may be reclaimed. |
| Disk and backups | 200 GB total Always Free block-volume capacity and five backups per current OCI docs | Boot volumes count toward the total; size and backup retention need planning. |
| Network | Official allowance includes 10 TB/month outbound transfer and one 10 Mbps flexible load balancer for eligible newer tenancies | Check current tenancy quotas and region availability. Inbound ports must be restricted; SSH should not be open to the world. |
| Database self-hosting on the same VM | **Not recommended as phase 1** | Increases operational and recovery risk. Supabase uses PostgreSQL plus Auth, Storage, API, and related services; replacing only PostgreSQL would not replace those services. |
| Telegram Serverless runtime | Separate target, not an Oracle deployment mode | Restricted runtime requires endpoint-by-endpoint porting and validated Telegram identity. |

Always Free is a resource allowance, not a service-level guarantee. Capacity, home-region restrictions, idle reclamation, storage allocation, and tenancy quotas must be checked in the Oracle Console before relying on it for production.

## Target architecture for the first safe move

- **Web UI + existing API routes:** Oracle VM running the existing Next.js app under a process supervisor, behind HTTPS reverse proxy.
- **Database/Auth/Storage:** continue using the current Supabase project unchanged until a separate database replacement is designed, tested, and explicitly approved.
- **Source control and CI:** GitHub remains the canonical source. Add a repeatable build/deploy workflow that deploys only a reviewed commit to staging first.
- **Scheduled jobs:** replace Vercel Cron with private systemd timers or a worker; verify locking, retry behavior, idempotency, and alerting.
- **Telegram bot integrations:** retain current bot/webhook configuration during phase 1. In parallel, port Telegram Serverless capabilities on a non-production project/bot where possible.
- **Secrets:** use root-owned environment files or a secret manager; do not commit .env, print secret values in logs, or expose server secrets as NEXT_PUBLIC_*.

## Phased implementation and release gates

### Phase 0 — Freeze baseline and recovery
- [ ] Export schema, data, functions, triggers, indexes, constraints, RLS policies, and migration history.
- [ ] Inventory all Storage buckets, objects, MIME types, sizes, and access rules.
- [ ] Verify a restore into a separate non-production database before any data migration.
- [ ] Record per-table row counts and reconciliation totals for orders, payment amounts, points/credits, promo counts, and inventory.
- [ ] Snapshot current GitHub main, Vercel environment-variable names (not values), cron schedules, domain aliases, webhook URLs, and external integrations.
- **Gate:** do not proceed until the backup is restorable and the baseline is recorded.

### Phase 1 — Oracle staging host (no cutover)
- [ ] Confirm OCI home region, Always Free eligible shape, quota, and available capacity.
- [ ] Provision a staging VM with least-privilege SSH, restricted ingress, OS updates, firewall, and HTTPS.
- [ ] Install pinned Node.js version; build the current main commit; run under systemd or another process supervisor.
- [ ] Configure server-side environment secrets and health checks without exposing values.
- [ ] Replace scheduled jobs in staging with locked/idempotent timers; test manual and scheduled runs.
- [ ] Test account hydration, order history, catalog, checkout, Maya test-mode callbacks, admin CRUD (products/payment methods/warehouses/couriers), media upload/read, loyalty, promos, and delivery pricing.
- **Gate:** no production DNS/webhook changes until all tests pass.

### Phase 2 — Controlled Oracle cutover
- [ ] Use a brief maintenance/write-freeze window and record final reconciliation totals.
- [ ] Deploy a known, reviewed commit; verify HTTPS, logs, health checks, scheduled jobs, and Telegram webhook behavior.
- [ ] Change routing only after explicit operator approval; preserve the old deployment as a temporary rollback reference where available.
- [ ] Define how to reconcile writes made after cutover before enabling rollback. Never simply switch back to an old writer if it would lose new orders/payments.
- **Gate:** verify real customer and admin journeys and payment event idempotency before declaring success.

### Phase 3 — Telegram Serverless parity
- [ ] Start from current main and selectively reapply/review migration work; do not deploy the 39-ahead/196-behind branch wholesale.
- [ ] Reconcile the target schema against all live tables/columns/functions/constraints and storage references.
- [ ] Build the static frontend and endpoint bridge; add explicit server-side auth for every admin read/write.
- [ ] Port and test every route in docs/TELEGRAM_SERVERLESS_ROUTE_INVENTORY.md, including payment state machine, stock reservation, order expiry, promos, points, Maya callbacks, media, OCR, delivery, and automation.
- [ ] Build a resumable importer/exporter and perform restore/reconciliation in a non-production target.
- [ ] Verify the intended bot/project binding and admin identity without sharing tokens. Test duplicate webhooks, replay, concurrent last-item checkout, interrupted imports, and retry behavior.
- **Gate:** explicit approval required before final data sync, production bot linkage, webhook changes, or customer cutover.

## Rollback principles

- Keep Supabase as the source of truth during Oracle phase 1; Oracle host rollback should not require data rollback if both versions use the same database safely.
- For any later SQLite/data migration, maintain an immutable verified source backup and define reverse-sync/recovery for post-cutover writes before enabling production writes.
- Do not dual-write orders/payments to two databases without tested idempotency and reconciliation.
- Do not pause/delete Supabase, delete media, rotate payment credentials, change Maya callbacks, or change DNS as part of assessment-only work.

## Current decision

**Proceed with Oracle staging first while keeping Supabase unchanged; continue Telegram Serverless as a separate parity project.** Do not declare either migration complete until the stated release gates are verified.
