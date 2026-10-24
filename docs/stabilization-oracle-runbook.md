# Prime Commercial: Stabilization and Oracle deployment runbook

Status: preparation branch only. No production traffic, DNS, database schema, secrets, or customer records are changed by this runbook.

## Findings verified on 2026-10-19

- Supabase project `pcojgnqyjndplhhadzed` reports `ACTIVE_HEALTHY`.
- The database reports existing products and orders; preserve PostgreSQL as the source of truth.
- Current branch's `package.json` and `package-lock.json` are materially out of sync. The package manifest declares Next 15 / React 19, while the lockfile root still declares Next 14 / React 18, Firebase and a different dependency set. Do not run `npm ci`, deploy a Docker image, or claim reproducibility until the lockfile is regenerated from the reviewed manifest and committed.
- `app/api/orders/route.ts` returns `cacheStore.orders` from its GET catch path. This cache is process-local and not customer-scoped in that catch block. It must not be used as a fallback for a customer's order-history request after an authenticated database failure: that can return stale or incorrectly scoped order data. Fix this by returning a no-store 500 response and logging the failure; never return shared order cache to a customer.
- Order history calls `/api/orders` with a stored customer ID, but the server correctly derives identity from the verified Telegram session. Do not weaken that server-side ownership check to accommodate stale browser storage.
- `/api/cron/orders` and `/api/cron/loyalty` both require `Authorization: Bearer <CRON_SECRET>`. Host cron must preserve this authentication and record failed HTTP responses.
- The Supabase advisors report nine RLS-enabled tables without policies. Because the application uses server-side service-role access, this may be intentional for tables accessed only by trusted server routes, but it requires a table-by-table access review. Do not add blanket public policies.
- The performance advisor flags 18 unused indexes. Do not drop indexes based on this alone; current traffic is small and production query plans should be checked first.

## Immediate stabilization order

1. Keep production on the current known database. Do not migrate data to SQLite or replace Supabase as part of hosting migration.
2. Fix the order-history catch fallback described above, with an explicit no-store 500 response.
3. Add regression tests for: authenticated customer's orders, empty history, unauthorized request, database error, and ensuring no other customer's orders can appear on error.
4. Diagnose the account unit-data issue from the actual `/api/account` JSON shape and the frontend field renderer. Never coerce arbitrary object/array values into a displayed number. Log field names and types only; never log personal/order/payment data.
5. Regenerate and commit `package-lock.json` using the exact reviewed `package.json`; remove `latest` version ranges and use exact versions for direct dependencies. Run `npm ci`, lint, typecheck, build, and tests in CI.
6. Add health checks, process supervision, TLS, and scheduled jobs to Oracle.
7. Test against staging with anonymized/fixture data before DNS cutover.

## Oracle target

- Ubuntu LTS VM in Oracle Cloud Always Free (if capacity and eligibility permit).
- Node.js LTS pinned to an exact major/minor/patch in the build image; exact npm version recorded.
- Next.js standalone build output served by a non-root systemd service.
- Caddy terminates HTTPS and renews certificates automatically once the domain points to the VM and ports 80/443 are reachable.
- Host cron calls the two existing protected cron endpoints every five minutes using a root-readable environment file; do not place secrets in the crontab line or logs.
- Supabase PostgreSQL remains external and authoritative. Use a least-privilege server credential and keep all secrets out of Git.
- Oracle security list/NSG exposes only 80/443 publicly; SSH restricted to the administrator's IP where practical. Do not expose port 3000 publicly.
- Enable OS security updates, log rotation, disk monitoring, uptime monitoring, and tested backups.

## Deployment readiness gate

Do not switch production DNS until all are true:
- `npm ci`, lint, typecheck, unit/integration tests and `npm run build` pass from a clean checkout.
- Health endpoint returns 200 and fails readiness when required environment configuration is absent.
- Telegram authentication works in the actual Telegram Mini App.
- Product list, product details, account, order history, order creation, payment proof, admin product/payment/warehouse/courier edits, and both cron jobs are verified.
- Database restore procedure has been tested.
- Load test reaches 500 concurrent users, then 800, with measured latency/error/resource results and no duplicate/lost orders.
- DNS rollback instructions and the previous deployment remain available.

## Required secrets (set only on the VM)

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` (public key only; never a service-role key)
- `SUPABASE_SERVICE_ROLE_KEY` (server only)
- `TELEGRAM_BOT_TOKEN`
- `ADMIN_TELEGRAM_USER_ID`
- `SESSION_SECRET` (at least 32 random characters)
- `CRON_SECRET` (high-entropy random value)
- Other required environment variables discovered by scanning route handlers and `.env.example`.

Do not paste any secret into chat or commit it to Git.