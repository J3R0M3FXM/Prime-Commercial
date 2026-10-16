# Telegram Serverless route parity inventory

Date: 2026-10-17
Source reference: tracked `main` API route tree inspected during the audit
Target branch: `migration/telegram-serverless`
Status: planning inventory only. No endpoints or production behavior changed.

A target capability below is a required migration work item, not a claim that a target endpoint already exists. Every endpoint must enforce authorization itself; Next.js middleware will not protect Telegram Serverless handlers.

| Existing Next.js route | Target capability | Key porting requirements |
|---|---|---|
| `app/api/account/points/convert/route.ts` | Loyalty points conversion | Atomic balance checks; idempotency; ledger integrity |
| `app/api/account/points/transfer/route.ts` | Loyalty points transfer | Verify sender/recipient identity; prevent replay and double-spend |
| `app/api/account/route.ts` | Customer account | Validated Telegram identity; customer can only read/update their own data |
| `app/api/admin/auth/route.ts` | Admin authentication | Secure server-side credential validation and expiring session; no preview bypass |
| `app/api/admin/automation/route.ts` | Automation configuration | Admin-only writes; preserve flows, settings, and chat state |
| `app/api/admin/charges/route.ts` | Charges CRUD | Admin-only mutations; validate charge rules |
| `app/api/admin/couriers/route.ts` | Courier CRUD | Admin-only mutations; preserve logistics config |
| `app/api/admin/customers/route.ts` | Customer administration | Admin-only access; protect customer PII |
| `app/api/admin/diagnostics/route.ts` | Admin diagnostics | Admin-only; redact secrets and personal data |
| `app/api/admin/media/status/route.ts` | Media diagnostics | Admin-only; never expose credentials |
| `app/api/admin/media/upload/route.ts` | Admin media upload | Admin-only; MIME/size checks; correct public/private access |
| `app/api/admin/orders/route.ts` | Admin order operations | Admin-only; preserve status/payment invariants and auditability |
| `app/api/admin/payment-methods/route.ts` | Payment method CRUD | Never return secret keys/webhook secrets to clients |
| `app/api/admin/payments/route.ts` | Payment operations | Admin-only; retain audit trail; prevent invalid state transitions |
| `app/api/admin/products/route.ts` | Product CRUD/reordering | Admin-only; preserve records and ordering; no catalog content edits during infrastructure migration |
| `app/api/admin/promos/route.ts` | Promo CRUD | Admin-only; preserve limits, eligibility, redemptions |
| `app/api/admin/warehouses/route.ts` | Warehouse CRUD | Admin-only; preserve default/coordinates and logistics fields |
| `app/api/auth/telegram/validate/route.ts` | Telegram authentication/session | Validate signed initData; production must fail closed without bot configuration |
| `app/api/charges/route.ts` | Public charges read | Expose only public fields; validate client assumptions server-side |
| `app/api/checkout/delivery-fee/route.ts` | Delivery fee calculation | Server-authoritative charges and logistics calculation |
| `app/api/cron/loyalty/route.ts` | Mature referral/loyalty job | Confirm scheduler support; private trigger; idempotent crediting |
| `app/api/cron/orders/route.ts` | Unpaid order expiry | Confirm scheduler support; idempotent stock/credit release and notifications |
| `app/api/download/route.ts` | File download | Authorization and content-type checks; no exposed private receipt URLs |
| `app/api/geoapify/autocomplete/route.ts` | Address autocomplete | Keep API key server-side; validate/rate-limit requests |
| `app/api/geoapify/reverse/route.ts` | Reverse geocoding | Keep API key server-side; validate/rate-limit requests |
| `app/api/geoapify/routing/route.ts` | Route/distance calculation | Keep API key server-side; preserve fare calculation inputs |
| `app/api/geoapify/validate/route.ts` | Address validation | Keep API key server-side; validate/rate-limit requests |
| `app/api/maya/checkout/route.ts` | Maya checkout | Preserve existing scope; secrets server-side; do not redesign provider flow in initial migration |
| `app/api/media/stream/[fileId]/route.ts` | Telegram media stream | Telegram file_id is not a browser URL; enforce access and stream safely |
| `app/api/media/videos/[id]/route.ts` | Video metadata/access | Preserve publication state and references |
| `app/api/media/videos/[id]/view/route.ts` | Video view tracking | Preserve view semantics; prevent arbitrary ID access |
| `app/api/media/videos/route.ts` | Video gallery | Public reads only for published media; admin-only management |
| `app/api/ocr/analyze-receipt/route.ts` | Receipt OCR | OCR is advisory only; never auto-confirm payment from OCR alone |
| `app/api/orders/route.ts` | Customer order lifecycle | Ownership checks, server-computed totals, atomic stock reservation, idempotency |
| `app/api/payment-methods/route.ts` | Public payment instructions | Allowlist public fields; never expose secret_key or webhook secrets |
| `app/api/products/route.ts` | Public catalog | Read-only; server rechecks price/stock at checkout; preserve current records |
| `app/api/promos/validate/route.ts` | Promo validation | Server-side limits/eligibility; fingerprint controls; atomic redemption |
| `app/api/referral/validate/route.ts` | Referral validation | Identity and anti-abuse checks; preserve referral relationships |
| `app/api/storage/upload/route.ts` | Receipt upload | Restrict file type/size; keep receipts private or access-controlled |
| `app/api/telegram/business/webhook/route.ts` | Telegram Business automation | Verify webhook source; preserve secretary callbacks, automation settings/chat state |
| `app/api/webhooks/maya/card/route.ts` | Maya card webhook | Verify provider authenticity and replay/idempotency; redesign deferred |
| `app/api/webhooks/maya/route.ts` | Maya webhook router | Preserve payment state machine and event audit trail; redesign deferred |
| `app/api/webhooks/maya/wallet/route.ts` | Maya wallet webhook | Verify provider authenticity and replay/idempotency; redesign deferred |

## Completion gates

- [ ] Verify the route list against the latest production commit before implementation.
- [ ] Document request methods, input/output schema, authorization, and errors for every route.
- [ ] Port to the Telegram Serverless-supported runtime; do not copy Next.js handlers directly.
- [ ] Test success, invalid input, unauthorized access, replay/idempotency, and concurrent stock/points changes.
- [ ] Verify scheduler capability and job semantics before replacing cron.
- [ ] Run non-production smoke tests and a backup restore rehearsal before cutover.
