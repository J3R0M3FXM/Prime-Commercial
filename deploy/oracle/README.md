# Oracle Cloud + Cloudflare setup

This directory is a deployment template. It is not a live deployment. Do not point production DNS here until the release gates in `docs/stabilization-oracle-runbook.md` pass.

## What you need to do in Oracle Cloud

1. In Oracle Cloud Console, open your Always Free tenancy and create an Ubuntu LTS VM in a region with available Always Free capacity. Start with the smallest eligible Ampere A1 shape that fits the allowance; do not enable paid upgrades or paid support.
2. Save the SSH private key securely on your device. Never upload it to GitHub or paste it into ChatGPT.
3. Assign a reserved public IPv4 address if available at no charge under your tenancy allowance. Record the public IP.
4. Configure the VCN security list/NSG to allow inbound TCP 80 and 443 from the internet. Restrict TCP 22 to your current public IP where practical. Do not open port 3000.
5. Verify the tenancy's cost/usage page and set any available budget alerts before creating resources. Always Free does not mean unlimited and idle/public IP rules can change; verify current eligibility in the console.
6. Send me only the non-secret facts needed to tailor commands: Ubuntu version, architecture (ARM64/Ampere or AMD64), public IP, and the domain/subdomain you want to use. Do not send private keys, passwords, tokens, or environment files.

## What you need to do in Cloudflare

1. Add the domain to Cloudflare only if you control the registrar account and are comfortable changing authoritative nameservers. If DNS is already managed elsewhere, tell me before changing anything.
2. Create a DNS `A` record for the chosen subdomain pointing to the Oracle public IP. Initially set it to **DNS only** (grey cloud) while validating Caddy's certificate issuance and origin connectivity.
3. Once HTTPS works directly at the origin and the application passes validation, we can decide whether to enable Cloudflare proxying. Keep SSL/TLS encryption mode at **Full (strict)** when proxied; never use Flexible mode for this application.
4. Do not change MX, TXT, or other existing DNS records unless we have inventoried them. This avoids breaking email, Telegram verification, or other domain services.

## Oracle deployment order

1. Fix the manifest/lockfile mismatch and pass a clean `npm ci` + build in CI.
2. Install Node.js at the exact version recorded by the Docker image (or use the pinned Docker image if the VM can run it). Keep app files under `/opt/prime-commercial/releases/<commit>` and switch a `current` symlink atomically.
3. Install the systemd unit as `/etc/systemd/system/prime-commercial.service`; create a dedicated `prime` user; keep `/etc/prime-commercial/prime-commercial.env` root-owned with mode `0600`.
4. Configure Caddy from `Caddyfile.example` with the actual hostname.
5. Install `prime-commercial-cron.sh` as `/usr/local/sbin/prime-commercial-cron.sh` with mode `0750`; install the cron file as `/etc/cron.d/prime-commercial` with mode `0644`. Ensure `curl` and `flock` are installed.
6. The environment file must define `APP_ORIGIN=https://your-hostname` and `CRON_SECRET`, plus the app's server environment variables. Keep the service-role key server-only; never prefix it with `NEXT_PUBLIC_`.
7. Test `/api/health`, Telegram authentication, product listing, account, order history, order placement, payment proof, admin editing, and both scheduled jobs.
8. Run stepped load tests at 100, 250, 500 and 800 concurrent virtual users, with realistic think time and read/write mix. Do not load-test production order creation with real customers; use a staging project or isolated test fixtures.

## Cloudflare DNS cutover and rollback

- Before cutover, export or record all current DNS records.
- Lower the target record TTL in advance if the current DNS provider supports it.
- Switch only the application hostname's record; leave unrelated records untouched.
- Keep the old deployment and previous DNS value recorded until the Oracle origin passes the full smoke suite.
- Roll back by restoring the prior DNS value. DNS caches mean rollback is not instant everywhere.

No secrets should ever be stored in this repository. This setup is designed to stay within free allowances where possible, but no provider can guarantee zero charges or unlimited capacity. Check Oracle's cost page and Cloudflare plan limits before enabling optional services.
