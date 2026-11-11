# Oracle Cloud staging deployment

This is a **staging template**, not a live deployment. It intentionally leaves production DNS, Telegram webhooks, Supabase schema/data, and Vercel untouched.

## Target

- Run the existing Next.js application on an Ubuntu LTS VM using a pinned Node.js 22.16.0 container image.
- Keep Supabase PostgreSQL, Auth, and Storage as the source of truth.
- Use Caddy for HTTPS and systemd for process supervision.
- Replace Vercel Cron only after staging verification; never run two active schedulers against production simultaneously.

## Before provisioning

1. Confirm the selected Oracle shape, boot volume, and network resources are explicitly marked Always Free in your tenancy. Do not enable paid upgrades.
2. Save SSH private keys only on your device. Never commit or paste private keys, bot tokens, service-role keys, or environment files.
3. Allow inbound TCP 80/443. Restrict SSH to an administrator source IP where practical; do not expose port 3000.
4. Configure a staging-only environment file at `/etc/prime-commercial/prime-commercial.env`, owned by root with mode `0600`.
5. Set `APP_ORIGIN=https://your-hostname` and a high-entropy `CRON_SECRET`, plus all app-required environment values from `.env.example`. Keep `SUPABASE_SERVICE_ROLE_KEY` server-only.

## Build and runtime

1. Run `npm ci`, `npm run lint`, and `npm run build` from a clean checkout. Do not deploy if any fail.
2. Build the Docker image from the repository root. It runs as a non-root user and serves the standalone Next.js output.
3. Install `deploy/oracle/prime-commercial.service` only after adapting the runtime path to the actual release layout.
4. Configure `deploy/oracle/Caddyfile.example` with the real hostname.
5. If replacing Vercel Cron in staging, install the cron runner and schedule only after confirming both endpoints require `Authorization: Bearer <CRON_SECRET>`. Use a single scheduler at cutover.

## Release gates

Before production DNS or webhook changes, verify Telegram authentication, catalog/product details, account hydration, customer order history, order creation, payment proof, admin CRUD for products/payment methods/warehouses/couriers, media access, promotions, loyalty, and both cron endpoints. Verify database backup/restore and reconciliation. Test on staging fixtures, never by generating fake production orders.

## Rollback

Keep the existing Vercel deployment and Supabase project unchanged until the Oracle staging host passes the complete test suite. Do not point production DNS at this VM from this template. At a later approved cutover, record the old DNS target and retain it for rollback; reconcile all writes before switching traffic back.
