# Oracle Cloud Always Free deployment

This is the alternative runtime path for Prime Commercial while the existing Vercel team is blocked by its resource/fair-use limit. It keeps Supabase PostgreSQL as the system of record; it does not migrate, copy, or reset database data.

## What is prepared in this repository

- `Dockerfile`: builds and runs the Next.js app as a production container.
- `docker-compose.oci.yml`: runs the container with a host-managed `.env.production` file and a health check.
- `.github/workflows/container-publish.yml`: builds and publishes AMD64 and ARM64 container images to GitHub Container Registry (GHCR) when `main` changes, or when manually dispatched.
- `scripts/security-smoke-check.mjs`: CI check for unauthenticated API paths and production preview-auth rejection.

## Infrastructure still required

The OCI tenancy is approved, but this repository has no OCI compute instance, reserved public IP, firewall/security-list configuration, or deploy credentials yet. Do not point the production domain at OCI until the container has been deployed and smoke-tested.

Create one OCI Ampere A1 Compute VM only if it is available within your Always Free allocation. The published image is multi-architecture and supports the A1 VM's ARM64 architecture. Install Docker Engine and the Docker Compose plugin. Allow inbound TCP 80/443 at the OCI network security layer; keep port 3000 private to the VM or reverse proxy. Use a domain you own, point its DNS A record to the OCI VM's public IP, and use a reverse proxy with HTTPS (for example, Caddy) before exposing the app publicly. The existing `*.vercel.app` alias cannot simply be repointed to OCI. `deploy/oci/Caddyfile.example` is the reverse-proxy template; set `PRIME_DOMAIN` to the domain you control. Do not expose SSH to the entire internet.

## GitHub Container Registry

The workflow publishes:
- `ghcr.io/j3r0m3fxm/prime-commercial:main`
- `ghcr.io/j3r0m3fxm/prime-commercial:sha-<commit>`

Set repository Actions variables `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` before publishing so client bundles receive the correct public Supabase configuration. These are public client settings, not admin secrets.

If the GHCR package is private, create a dedicated GitHub token with read-only `read:packages` scope and log in on the OCI VM. Never put that token in this repository, a Docker image, or a public workflow log. Keep the package private unless public image distribution is explicitly desired.

## Runtime environment

Create `.env.production` on the OCI VM with the exact runtime variables listed in the repository's `.env.example` that are required for production. At minimum, verify the Supabase project URL and server-only secret key, Telegram bot token, a random `SESSION_SECRET` of at least 32 characters, `ADMIN_ACCESS_CODE`, `CRON_SECRET`, `TELEGRAM_WEBHOOK_SECRET`, and any enabled Geoapify/Maya integration secrets. Configure Telegram's webhook with the matching secret token. The Maya webhook IP allowlist on OCI relies on the reverse proxy setting a trustworthy `X-Real-IP` header. Use the current approved values; do not copy secrets into GitHub source files. Do not set `ALLOW_PREVIEW_AUTH=true` in production.

Start and inspect:

```sh
docker compose -f docker-compose.oci.yml pull
docker compose -f docker-compose.oci.yml up -d
docker compose -f docker-compose.oci.yml ps
docker compose -f docker-compose.oci.yml logs --tail=200 prime-commercial
```

The health check expects the unauthenticated Telegram validation endpoint to return HTTP 401. It does not test authenticated account or order workflows.

## Safe release and rollback

1. Publish the container from a reviewed, green `main` commit.
2. Deploy by pinning the compose image to the immutable `sha-<commit>` tag, not only `main`, by exporting `IMAGE_TAG=sha-<commit>` before running Compose.
3. Verify health, Telegram login, customer profile, order history, points, fingerprint history, public payment-method filtering, warehouse/courier selection, charges, and admin CRUD using authorized test accounts.
4. Confirm a read-only Supabase count/integrity snapshot matches the pre-deploy snapshot.
5. For rollback, change the image tag to the previous known-good `sha-<commit>`, then run `docker compose -f docker-compose.oci.yml pull && docker compose -f docker-compose.oci.yml up -d`.

No Supabase migrations or database writes are part of the container deployment. Do not switch DNS or production traffic until the full smoke test succeeds.
