# Production Reconstruction Audit

## Latest live update — 2026-11-06

- The delivery checkout incident fix has been deployed from the clean production checkout to app8830494959 at TGCloud revision 400. Scope was `tgcloud/endpoints/getDeliveryQuote.js` plus the production `dist/`; no schema or unrelated backend modules were deployed.
- Live HTML references `index-gxU3U0s4.js` / `index-DNrG5qZe.css`, and fetched assets matched the built files byte-for-byte. Customer-device verification of courier loading and Continue is still pending.
- The unrelated endpoint inventory/schema mismatch remains unresolved and blocks future releases; it was not resolved by this scoped incident deployment.

## Secretary repeat-welcome fix — 2026-11-06

- Live revision 401 includes the narrow shared-library fix from sandbox commit `927de3e` / checkout commit `dd9d9ff`: generic message matching now skips the configured welcome flow, preventing its blank trigger from bypassing the 12-hour cooldown. Only `tgcloud/lib/telegram-automation.js` was deployed; static assets were unchanged.
- Syntax/contract checks passed. Customer-chat behavior still needs real Telegram verification. Secretary configurator wording still says “sent after 24 hours” and is queued for a UI correction.

The production reconstruction audit is maintained in the sibling `Prime-TGCloud-Checkout/docs/PRODUCTION_AUDIT.md`. Read it before modifying this sandbox. The initial audit found a mismatch between locally deleted Serverless handlers and handlers still present in the deployed TGCloud snapshot; no deployment is safe until that mismatch is resolved.

## Sandbox progress — 2026-11-06

- Restored payment/session/order/account handlers and supporting checkout, credit, inventory, expiry, lifecycle, promo, and notification libraries into the sandbox for audit.
- Checkout now reads the account through `getMyAccount`, validates charges/promos through TGCloud, refreshes orders through `getMyOrders`, and blocks retired `/api/*` fallbacks in the main customer flow.
- Secretary welcome logic now uses `lastBotMessageAt` as the only welcome throttle. The previous human-takeover suppression no longer gates automation.
- JavaScript syntax checks and `git diff --check` pass.
- Vite production build passes with the known-good dependency tree: 2,379 modules transformed and the production bundle emitted successfully. Remaining Vite output is non-fatal warnings only.
- The source audit still finds dormant Next/Supabase `/api/*` routes and legacy admin components. They are not part of the Vite build path, but active admin screens still reference several of them; do not delete or promote those paths until their TGCloud replacements are mapped and verified.
- Unreferenced legacy cron, webhook, Maya checkout/webhook, download-proxy, and Telegram business-webhook routes were isolated outside the sandbox under `/data/data/com.termux/files/usr/tmp/prime-tgcloud-legacy-routes-20261106`. The OCR route was retained because the admin screen still calls it.
- The obsolete Gemini-based OCR route was then removed. The admin OCR action now clearly reports manual review required, and stale Taggun controls/references were removed from the active UI and preview response. Receipt analysis remains client-side file/pixel fingerprinting only; OCR.space is planned but not connected.
- Native-browser/access-code Admin authentication was retired. `/admin` now accepts only a verified Telegram Serverless admin session and redirects unauthenticated browser visits to the shopfront. The remaining legacy admin data functions are unreachable in Telegram Admin mode and are the next cleanup target.
- Replaced the large legacy `app/admin/page.tsx` with a clean Telegram-only Admin shell that launches the existing TGCloud panels directly. Removed the unused legacy diagnostics and order-modification UI files; the Secretary configurator remains because it is still the active Secretary panel and needs its internal fallback branch audited separately.
- Secretary configurator now rejects non-Serverless use and routes all automation operations through `manageAutomation`; its old `/api/admin/automation` fallback was removed. The Admin source now has no `/api/*`, Supabase, or Vercel references in the active Admin shell/panels.
- The Maya return screen no longer queries `/api/orders`; it resolves the returning order through `getMyOrders`. The active Vite client now has no legacy `/api/*` request reference outside intentionally archived Next routes.
- No promotion or deployment has occurred from this sandbox.
- Production baseline d7511ff was merged into this sandbox on 2026-11-06 for parity. This does not resolve the historical endpoint mismatch or authorize deployment.

## Shopfront product media and visual consistency — 2026-11-06

- Confirmed failure: old `tgmedia:` catalog references eventually call `getMediaContent`, which previously unconditionally used Telegram `api.getFileContent(file_id)`; several live product media reads returned Telegram `400 invalid file_id`. The client swallowed those errors and each card displayed the same Picsum fallback.
- Confirmed upload gap: Catalog/Admin client calls `manageMediaAssets` with `uploadPublicImage` / `uploadProductImage`, but the endpoint lacked both actions. New code stores validated JPG/PNG bytes in the existing `media_asset_contents` BLOB table, and media retrieval checks those bytes before the legacy Telegram file path. Legacy Telegram media remains supported.
- UI collision: `index.html` loaded the stale `prime-header-override-r325.css`, while `app/globals.css` applied later Lato-based root selectors after the new MiSans/Roboto rules. The stale link/file was removed, the Vite entry no longer bundles Lato, and one final shared typography/header layer now enforces the approved typography and non-cropped `prime-global-header.jpg` on both Shopfront and Admin.
- Generic repeated Picsum fallback was replaced with an explicit local unavailable-image illustration in Shopfront, product modal, cart, checkout, and order history.
- Verification: `node scripts/check-telegram-serverless-contracts.mjs`, JavaScript syntax checks, and `git diff --check` pass. `npm run build:miniapp` succeeds (2,367 modules transformed); Vite reports existing non-fatal configuration/module-directive/large-chunk warnings. Existing live product photo bytes have not been recovered or reattached. If an old media row has no inline byte record and its Telegram file ID is invalid, the correct original product image must be re-uploaded; no unrelated local image has been assigned.
- Release remains blocked: linked TGCloud status reports app `app8830494959`, revision 393, webhook in sync, 244 static files up to date, and a modified `tgcloud/schema.js`. The linked backend has 61 top-level endpoint modules versus 43 in this sandbox, with 18 linked-only names. No deployment or live catalog mutation has occurred. No browser/device visual verification has occurred.

## Delivery quote and courier selection — 2026-11-06

- The screenshot's red error came from a request/handler mismatch: checkout sent only destination coordinates, while `getDeliveryQuote` required `courierId`. The handler also returned one quote, while checkout expects all active couriers; displayed travel-time fields were absent.
- The handler now delegates to shared `quoteDelivery`, which supports destination-only requests, returns all active courier quotes and route time, and retains server-side fee calculation and fallback distance estimation. The client clears courier/payment selection when the destination changes and ignores out-of-order quote responses.
- `node --check` for the endpoint/core, `node scripts/check-telegram-serverless-contracts.mjs`, `git diff --check`, and `npm run build:miniapp` pass. Build retains existing non-fatal Vite warnings. Source is promoted into the clean production checkout; no live deployment/device verification occurred. Existing endpoint inventory and dirty linked schema remain hard release blockers.

## Checkout charge hydration and payment-session retry repair — 2026-11-06

- Root cause of zero configured base charges: `getPublicCharges` returned `rate`, while the Shopfront TypeScript normalizer reads `amount`/`value`; it also omitted schedule/default fields encoded in JSON `description`. The endpoint now returns amount/value aliases and decodes `schedules`/`isDefault`, preserving overnight, weekday, date, and time rules.
- Root cause of the immediate “payment session expired” false report: `createPaymentSession` used a deterministic ID and silently skipped consumed rows on conflict while still returning success. Valid sessions/proof are preserved for retries; expired/consumed sessions get a fresh ID. Before validating that retry session, `createOrder` checks for an existing operation under the authenticated customer's idempotency key and recovers that original immutable order snapshot; it rejects prior failed attempts rather than replaying them. Proof uploads return success only when their conditional update actually succeeds. No frontend change is required for this recovery path.
- Added contract assertions for complete charge-field mapping and payment-session lifecycle. Endpoint syntax checks, `node scripts/check-telegram-serverless-contracts.mjs`, `git diff --check`, and `npm run build:miniapp` pass. Build has existing non-fatal Vite warnings.
- Deployed narrowly: `getPublicCharges.js` at revision 402; payment retry handlers at r403; explicit payment-session SQL aliases in `uploadPaymentProof.js` and `createOrder.js` at r404. The 14:36 PHT screenshot showed missing receiver details followed by a terminal failure because the corrected retry reused an operation key whose failed state had completed compensation. At r405, `createPaymentSession` issues a fresh server-generated operation key and unique session only for that definitive failed state; in-progress/complete/ambiguous operations retain their original key. `createOrder` scopes the session to the authenticated customer and uses its effective key. Only `createPaymentSession.js` and `createOrder.js` were pushed; webhook is synced and deployed diffs are clean. No frontend/static/schema/media or live order/payment/customer data was modified. Syntax/contracts/diff checks passed. A successful Telegram-device retry remains unverified.

## Delivery pricing and whole-peso display — 2026-11-06

- The customer-visible courier editor included `timeBasedFeePerMinute`, but `manageCouriers` rejected the field and `couriers` schema lacked its column. The quote calculated a diagnostic time fee but omitted it from the actual delivery total.
- Added the rate as an additive runtime `REAL NOT NULL DEFAULT 0` column (existing courier configurations are preserved), made the Admin endpoint accept/store it via raw SQL, and use it in the shared fee formula only when routing returned a valid travel-time estimate. The quote and `createOrder` recomputation call the same calculator. The declarative schema is intentionally unchanged to avoid pushing its unrelated 47-change database diff.
- Fee is rounded once after all components to the nearest whole Philippine peso; delivery-only labels now render whole pesos too. Product prices and other charges retain the existing two-decimal currency format.
- Delivery fee regression tests, Serverless contract checks, JS syntax checks, diff check, and `npm run build:miniapp` pass. Follow-up now removes the schema-file change and uses only scoped endpoint/library changes plus a one-column additive migration at runtime; this avoids the unrelated global migration. No courier rates, product images, orders, or live configuration changed. Re-promote this follow-up before a scoped deployment; no live/device verification yet.
