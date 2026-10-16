# Telegram Serverless route parity inventory

Date: 2026-10-17
Source reference: tracked `main` API route tree inspected during the audit
Target branch: `migration/telegram-serverless`
Status: implementation in progress. Target modules are code-only; none of these changes has been deployed or wired into the Mini App.

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


## Route implementation status (2026-10-17)

| Existing route / capability | Target module(s) | Status |
|---|---|---|
| Public catalog `/api/products` | `getCatalog.js` | Partial: active read only; frontend bridge and checkout validation still missing |
| Public payment methods `/api/payment-methods` | `getPublicPaymentMethods.js` | Partial: public allowlist only |
| Public charges `/api/charges` | `getPublicCharges.js` | Partial: read only |
| Courier options / pricing config | `getPublicCouriers.js` | Supporting read endpoint |
| Active promo display / validation | `getActivePromos.js`, `validatePromo.js`, `lib/promos.js`, `lib/fingerprints.js`, `lib/loyalty.js` | Partial: validation preflight only; atomic redemption and server-network fingerprint fallback missing |
| Public video gallery / media content | `getPublicVideos.js`, `getMediaContent.js`, `lib/media.js` | Partial: private owner/admin access implemented; frontend `tgmedia:` decoding and view tracking still missing |
| Delivery fee preview | `getDeliveryQuote.js`, `lib/delivery-fee.js` | Partial: server-calculated estimate only; order creation must recalculate |
| Customer order history | `getMyOrders.js` | Partial: verified Telegram identity, bounded owner-scoped reads |
| Admin product CRUD / reorder | `manageProducts.js` | Backend only; needs target runtime tests and UI adapter |
| Admin promo CRUD | `managePromos.js`, `lib/promos.js` | Backend only; preserves advanced rules stored inside description JSON |
| Admin charges CRUD | `manageCharges.js` | Backend only; needs target runtime tests and UI adapter |
| Admin courier CRUD | `manageCouriers.js` | Backend only; needs target runtime tests and UI adapter |
| Admin warehouse CRUD | `manageWarehouses.js` | Backend only; needs target runtime tests and UI adapter |
| Admin payment method CRUD | `managePaymentMethods.js` | Backend only; secret key never returned; needs target runtime tests and UI adapter |
| Admin video metadata / media mapping | `manageVideos.js`, `manageMediaAssets.js` | Backend only; media upload/mapping scripts exist but are unexecuted; frontend adapter still missing |
| Admin automation settings / flows / chat pause | `manageAutomation.js` | Backend only; needs admin bootstrap and UI adapter |
| Telegram Business automation | `handlers/business_connection.js`, `business_message.js`, `callback_query.js`, `lib/telegram-automation.js` | Code ported; needs BotFather runtime test |
| All other listed routes | — | Not ported yet |

The customer account route remains blocked by confirmed app/live-schema drift (`photo_url`, `has_custom_photo`, `referred_by_name`, `referred_by_username`, and `role` are referenced by current app code but absent from the live customer table). Checkout, payment state transitions, stock reservation, loyalty/referral mutations, receipt upload/privacy, media streaming, Geoapify server-side routes, Maya webhook routes, and both scheduled jobs remain unported. The route inventory is not a declaration of production readiness.

## Completion gates

- [ ] Verify the route list against the latest production commit before implementation.
- [ ] Document request methods, input/output schema, authorization, and errors for every route.
- [ ] Port to the Telegram Serverless-supported runtime; do not copy Next.js handlers directly.
- [ ] Test success, invalid input, unauthorized access, replay/idempotency, and concurrent stock/points changes.
- [ ] Verify scheduler capability and job semantics before replacing cron.
- [ ] Run non-production smoke tests and a backup restore rehearsal before cutover.

## Implementation status update — 2026-10-17

### Public read-only vertical slice

The first public configuration endpoint slice is now implemented in `tgcloud/endpoints/`:

- `getCatalog.js` reads active products only and returns the original array response shape.
- `getPublicPaymentMethods.js` reads active payment methods and preserves the existing public `publicKey` field and array response shape. It deliberately never selects `secretKey` or `webhookUrl`.
- `getPublicCharges.js` provides active charge configuration as an array and is read-only.
- `getActivePromos.js` filters active promos by their start/end window and returns an array; checkout still must independently enforce usage limits, eligibility, and computed discounts.
- `health.js` remains a non-sensitive smoke test.

These endpoints are code-only; no production bot has been pushed and no database migration has been run. Public endpoint code is not a replacement for checkout validation or authorization on sensitive mutations.

### Contract checks

Added `scripts/check-telegram-serverless-contracts.mjs` and expanded the schema-check workflow to validate the 16 target table exports, expected public endpoint modules, read-only constraints, active-row filters, response shape, and the public payment-field allowlist. The schema syntax check had passed on commit `d79ad24f`; the new contract workflow and latest endpoint commits still require their own completed CI results.

### Current parity remaining

The target still does not implement the 43 route handlers, authenticated Telegram initData/session validation, admin CRUD, atomic checkout/inventory/loyalty operations, private receipt handling, video streaming, or the scheduled expiry/referral jobs. Do not treat the public read-only slice as app migration completion. Production cutover remains blocked on verified bot identity, CLI schema diff, export/import/restore rehearsal, authorization and concurrency tests, and end-to-end checks.

### Admin configurator vertical slice — code only

Added a fail-closed authorization helper at `tgcloud/lib/auth.js`. It relies on Telegram Serverless's verified `ctx.initData.user` and compares that identity against the server-side `system_settings.admin_telegram_user_id` allowlist. A missing, malformed, or mismatched allowlist denies access; the Mini App cannot submit its own admin flag. Added admin-only CRUD endpoint modules for charges, couriers, warehouses, and payment methods. The handlers use field allowlists, validate numeric/boolean inputs, preserve sorting, and never return raw payment `secret_key` values. Warehouse CRUD rejects setting a second default rather than silently creating conflicting defaults.

**Activation prerequisite:** live `system_settings` was empty at the last read. Therefore these admin endpoints intentionally fail closed until a controlled, non-secret-leaking bootstrap step imports the configured administrator Telegram user ID into the target's `system_settings` JSON value. Do not place the ID or any bot/payment credentials in Git. The source admin access-code flow and its credential handling still need an explicit migration design; these endpoints are not yet connected to the admin UI.

The contract-check script now checks admin guards, explicit field allowlists, and create/update/delete coverage. The latest schema-check and build runs for these additions are still running/queued; only completed workflow results count as verification.

### Admin configurator implementation extension

The target now has admin-only CRUD endpoints for `products`, `charges`, `couriers`, `warehouses`, and `payment_methods`, all behind the shared fail-closed `requireAdmin(ctx)` guard. Product reorder explicitly changes only each row's `sort_order`; it never replaces or deletes the collection. Product writes validate non-negative price/stock and, when bundle variants exist, require non-negative integer variant stock whose sum equals parent stock. Payment method writes preserve an existing secret when the masked secret field is blank, and responses expose only `secretKeyConfigured`, never the raw secret. Warehouse writes reject a second default rather than silently introducing duplicate defaults.

These are backend modules only. The current Next.js Admin Panel has not yet been connected to `Telegram.WebApp.Serverless.call`, and the `admin_telegram_user_id` setting must be bootstrapped into the target's `system_settings` before any admin endpoint can authorize a user. The live table was empty at last inspection, so access correctly remains denied until that secure setup is done. Product, warehouse, and payment-method behaviors still need runtime tests against the target SDK before use with real data.

### Telegram Business secretary port — code-only

Added Serverless handlers for `business_connection`, `business_message`, and `callback_query`, plus `tgcloud/lib/telegram-automation.js`. The port covers persisted business connection details, active flow priority/matching, welcome and fallback responses, template variables, per-chat 24-hour human takeover, explicit bot-pause preservation, inline keyboards, compact/legacy Secretary callback parsing, and text/media/caption/markup/flow edit actions. Added the admin-only `manageAutomation` endpoint for settings, flow CRUD, chat listing, and pause toggles.

The shared automation chat upsert deliberately leaves `botPaused` unchanged unless the admin explicitly changes it, so a customer message cannot silently unpause a conversation. These handlers use Telegram Serverless's platform-routed updates and `api` rather than a second custom webhook receiver.

Runtime tests are still required for Telegram Business permissions, callback/edit payload compatibility, timestamp conversion, and concurrent composite-key upserts. The existing admin UI is not yet wired to `manageAutomation`; its allowlist bootstrap remains required. No handler has been pushed to a bot or activated in production.

