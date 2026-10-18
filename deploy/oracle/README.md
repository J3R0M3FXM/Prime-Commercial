# Oracle Cloud staging deployment templates

These are **templates only**. They do not deploy anything or change production. Use them only after an OCI VM is provisioned and reachable, and start with a staging hostname.

## Required safety conditions

- Keep Supabase as the source of truth during the initial hosting move.
- Do not point production DNS or Telegram webhooks at the VM until acceptance tests pass and an operator explicitly approves cutover.
- Do not copy credentials into this repository. Populate /etc/prime-commerce/prime-commerce.env directly on the VM and restrict it to root and the service group. Include the exact environment variables required by the current .env.example, plus a strong CRON_SECRET if the cron endpoints will be used. Never place a service-role key in any NEXT_PUBLIC_* variable.
- Allow inbound 80/443 only as required; restrict SSH to a trusted source IP or OCI bastion. Keep port 3000 bound to loopback.
- Confirm VM architecture before installing Node. Current GitHub build workflow targets Node 20; use a supported Node release and validate native dependencies on the chosen OCI shape before pinning production.

## Initial staging setup (Ubuntu example)

1. Provision an Always Free eligible VM in your approved home region. Record shape, architecture, boot-volume size, public IP, and quota in the operations record. Availability is not guaranteed.
2. Configure an OCI security list/network security group and OS firewall. Permit SSH only from a trusted source; permit HTTP/HTTPS as needed. Do not open database ports.
3. Install security updates, Git, Node.js/npm, Nginx, and Certbot (or use Caddy for TLS). Create a dedicated primecommerce user with no interactive login.
4. Clone the reviewed GitHub commit to /opt/prime-commerce/releases/<commit-sha>. Do not deploy a moving branch name. Run npm install --no-audit --no-fund and npm run build; save logs. The repository currently has no npm lockfile, so installs are not deterministic; resolve that before production rollout.
5. Create /opt/prime-commerce/current as a symlink to the selected release and /opt/prime-commerce/shared for writable runtime files, if any. Ensure the service account can read the release but cannot modify application code.
6. Create /etc/prime-commerce/prime-commerce.env with mode 0640, owned by root:primecommerce. Populate secrets using a secure terminal session; do not paste them into GitHub issues, PR comments, or chat.
7. Review prime-commerce.service.example, adapt if the selected Node/npm paths differ, then install as /etc/systemd/system/prime-commerce.service. Enable and start it only on staging.
8. Adapt the Nginx example with the actual staging domain, validate with nginx -t, and configure HTTPS. Keep the upstream bound to 127.0.0.1:3000.
9. Verify service status, recent journal logs, TLS, /api health behavior, customer account/profile hydration, order history, product catalog, and admin CRUD. Do not treat HTTP 200 alone as proof that business workflows work.

## Scheduled jobs: explicit port required

vercel.json currently schedules /api/cron/loyalty and /api/cron/orders every five minutes. Both endpoints require Authorization: Bearer <CRON_SECRET>. Do not simply expose them to the public internet or add an unprotected cron. Before enabling equivalent systemd timers, inspect the endpoints' side effects, ensure duplicate execution is safe, and use a root-owned helper script that reads the secret from the protected environment file without logging it. Verify the database RPCs and notifications on staging first.

## Release acceptance checklist

- [ ] Build and type checks succeed on the target architecture.
- [ ] HTTPS and renewal are verified; application port is not publicly reachable.
- [ ] Account profile and order history hydrate for legacy and current customer records.
- [ ] Product/payment-method/warehouse/courier admin CRUD works with least-privilege authorization.
- [ ] Checkout inventory reservation and order expiry are idempotent under retries.
- [ ] Maya test-mode callbacks and webhook replay handling are verified.
- [ ] Telegram Business/webhook flows and notifications are tested.
- [ ] Media upload/read works and payment receipts are not publicly exposed unintentionally.
- [ ] Both scheduled jobs run successfully and cannot be invoked without the secret.
- [ ] Backup restore and reconciliation procedure has been rehearsed.
- [ ] Rollback and handling of writes created after cutover are documented.

No production cutover should occur until every required item is signed off.
