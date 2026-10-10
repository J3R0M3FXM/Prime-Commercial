# Prime Commercial — Telegram Serverless migration

## Status and safety

This branch starts the migration; it does **not** cut over production, import live
records, deploy to a Telegram bot, or change Maya/Supabase webhooks. Those steps
require credentials and a verified backup. The existing production deployment
must remain untouched until all gates below pass.

## Target architecture

- **Mini App UI:** convert the existing Next.js client UI into a static Vite/React
  build hosted by Telegram Serverless. Preserve storefront and admin flows.
- **Backend:** port each Next.js route to a Telegram Serverless endpoint/handler.
  Use platform-validated Telegram identity and re-authorize privileged actions.
- **Database:** migrate PostgreSQL data to Telegram Serverless SQLite, preserving
  identifiers, order numbers, financial values, timestamps, JSON, and statuses.
- **Media:** migrate objects in receipt-proofs, product-images, and media-gallery,
  then verify every reference.
- **Integrations:** Maya, Geoapify, Google GenAI OCR, and Telegram Bot API remain
  external integrations; secrets must stay server-side.

## Source inventory

The starting point is supabase/schema.sql plus every file under
supabase/migrations/. The checked-in base schema has 12 core tables:

| Table | Critical behavior to preserve |
| --- | --- |
| products | stock integrity, images, bundle/tags/gallery JSON |
| customers | Telegram identity, points, credits, referrals, fingerprints |
| orders | totals, payment states, proofs/OCR, delivery |
| payment_methods | secret-bearing configuration; server-only access |
| promos | time windows, caps, usage counts |
| promo_redemptions | per-customer/device limits |
| warehouses | inspect later migrations for coordinates/default columns |
| couriers | delivery fare fields and tracking |
| videos | Telegram file IDs, direct URLs, publication state |
| charges | checkout charge rules |
| point_transactions | loyalty ledger |
| system_settings | JSON settings and sensitive configuration review |

Functions, triggers, indexes, constraints, RLS policies, and migration-added
columns/tables are also part of the app contract. tgcloud/schema.js maps the base
schema only; reconcile it against all applied migrations and live schema first.

## Migration gates

### Gate 0 — baseline and backup
- [ ] Export live PostgreSQL schema, data, functions, triggers, indexes,
      constraints, migration history, and RLS policies.
- [ ] Inventory Storage buckets, object paths, sizes, MIME types, and access.
- [ ] Inventory environment-variable names, cron jobs, and webhook URLs; never
      commit secret values.
- [ ] Compare live schema with repository SQL and all applied migrations.
- [ ] Record row counts and financial reconciliation totals for each table.
- [ ] Verify a restore of the backup before continuing.

### Gate 1 — runtime and UI
- [ ] Scaffold/link the Telegram Serverless project with the official CLI.
- [ ] Convert Next.js-only routing, metadata, and server dependencies to a static
      Vite build. Do not point hosting at a nonexistent dist/ folder.
- [ ] Replace direct Supabase calls with a typed endpoint client.
- [ ] Verify storefront and admin screens on Telegram mobile and desktop.

### Gate 2 — database
- [ ] Reconcile tgcloud/schema.js with all migrations and the live schema.
- [ ] Build a repeatable, resumable data importer/exporter; do not expose a public
      bulk-import endpoint. Freeze writes for final sync.
- [ ] Preserve source IDs; convert timestamps only after validating precision.
- [ ] Preserve JSON and nullability; verify money values and order totals exactly.
- [ ] SQLite does not enforce foreign keys: validate relationships in code and
      during migration reconciliation.
- [ ] Reconcile row counts, unique keys, order totals, points, promo counts, and
      missing references.

### Gate 3 — backend behavior
- [ ] Port catalog and inventory logic, including atomic stock reservation.
- [ ] Port order creation/expiry, payment transitions, and idempotency.
- [ ] Port Maya checkout and callbacks with signature verification and replay
      protection.
- [ ] Port promo redemption and loyalty logic without duplicate point awards.
- [ ] Port customer/referral/fingerprint checks and scheduled jobs.
- [ ] Port delivery pricing, warehouse/courier logic, OCR, and media.
- [ ] Rewrite Node-only APIs, Buffer, npm dependencies, and OCR calls for the
      restricted V8 runtime and supported outbound HTTP.

### Gate 4 — security
- [ ] Derive user identity from validated platform init data, never from a
      caller-supplied user ID.
- [ ] Enforce server-side admin authorization on every admin mutation and
      sensitive read. Do not copy permissive Supabase RLS policies.
- [ ] Never expose payment secret keys, webhook secrets, or service credentials.
- [ ] Validate input, ownership, status transitions, and price/discount math.
- [ ] Verify payment webhook signatures using the provider's documented method.

### Gate 5 — media and integrations
- [ ] Copy all three Storage buckets and verify every referenced object.
- [ ] Preserve old object URLs until references have been verified; protect receipt
      evidence according to the business access policy.
- [ ] Update Mini App URL only after the target build/endpoints pass.
- [ ] Change Maya callback URLs only after signature and replay tests pass.
- [ ] Verify Geoapify, OCR, Telegram notifications, cron jobs, and quotas.

### Gate 6 — rehearsal and cutover
- [ ] Test checkout, admin workflows, promos, points, expiry/refunds, delivery,
      OCR review, and all payment paths.
- [ ] Test duplicate webhooks, concurrent last-item purchases, repeated requests,
      and interrupted imports.
- [ ] Rehearse final delta sync with writes frozen and reconcile totals.
- [ ] Keep the existing deployment and verified backup for rollback.
- [ ] Cut over only after explicit operator approval. Do not dual-write payments
      unless an idempotent strategy has been designed and tested.
- [ ] Define recovery of writes made after cutover before enabling production.

## Runtime constraints

Telegram Serverless modules run in a restricted V8 environment: arbitrary npm
packages and filesystem access are unavailable; outbound requests use the
platform SDK. The static frontend can use normal build-time dependencies, but
server code must be rewritten for the supported runtime. Confirm platform limits,
backup/export options, and availability expectations before production traffic.

## Files added in this branch

- tgcloud/schema.js — initial target schema for the 12 base tables.
- tgcloud/endpoints/health.js — non-sensitive smoke-test endpoint.
- docs/TELEGRAM_SERVERLESS_MIGRATION.md — staged plan and safety gates.

## Next implementation sequence

1. Reconcile every supabase/migrations file and the live schema.
2. Port one vertical slice end-to-end (catalog + authorization) with tests.
3. Port checkout, payments, orders, inventory, loyalty, and integrations.
4. Convert the UI to static hosting; implement data and media migration tooling.
5. Rehearse and cut over only when every gate is green.
