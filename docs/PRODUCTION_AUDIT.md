# Production Reconstruction Audit

## Checkout notices, payment tiles and header clock — 2026-11-06

- Based on the latest screenshots, restored the earlier three-column/three-row payment tile paging and swipe model (9 methods per page), rather than rendering all methods in one unpaged grid. Existing QR/account detail and secure-payment confirmation behavior are retained.
- Replaced the plain amber receipt strip with a structured neutral receipt notice, emphasized payable-now in a dark high-contrast panel, added a clear payment-method heading, and aligned load/error/receipt/order status notices to one visual system.
- The header clock was present in the component but the 28px fixed-height/overflow-hidden style could clip its date-time row. CSS now allocates explicit line heights for the right-aligned date/time, divider and access label.
- Promoted Sandbox `d3ba126` to Checkout `b51dd8b`; build and Serverless contracts passed. Static-only deployment is TGCloud **r414**, clean working directory, 51 files current. Live HTML references `index-TROudVo4.js` and `index-CNFrQPLF.css`; required release strings/classes were verified in the served assets.
- No backend/schema/payment configuration/order/customer data changed. Phone visual confirmation after refresh remains outstanding.

## Screenshot-led payment and clipping repair — 2026-11-06

- Reviewed the 17:38–17:43 Telegram screenshots. The pre-submit payment renderer only showed method logos and a bare selected-method name; it did not render QR media or bank/e-wallet account details. The shop's fixed header/search wrapper also had no reserved in-flow height, so the first product row could be hidden underneath it.
- Selected QR methods now show the resolved QR image inline with account name/number and copy controls; transfer and wallet details are rendered when provided. Gateway types use the existing confirmation dialog. Order confirmation now has one concise proof-review card rather than repeating the order number/amount/status in multiple cards.
- The fixed header/search wrapper's real height is measured and reserved with a ResizeObserver, including tab/responsive changes. QR dialog is constrained to the portrait app width and scrolls within small viewports.
- Promoted Sandbox `4effa97` to Checkout `96617ab`; production build and Serverless contract suite passed. Static-only TGCloud deploy is **r413**, webhook in sync, clean working directory, 51 static files current. Served HTML references `index-CSQar3uv.js` and `index-4OA0BF_s.css`; live JS contains the new payment and confirmation strings.
- No backend/schema, payment configuration, order, or customer data was changed. Code is live; actual QR scan, transfer copy and product first-row alignment still need owner-device visual confirmation.

## Payment and checkout recovery — 2026-11-06

- Fixed order submission rejecting a populated receiver: `createOrder.js` now parses the payment session's SQLite JSON `request_snapshot`; deployed at r409. Contract regression checks pass.
- Deployed secure payment-link handling and customer projection at r412 by storing the validated HTTPS URL in the existing `payment_methods.public_key` field only for `secured_payment_link` methods. QR wallet address copy support and root-viewport scroll reset for Shop/Continue are included. No new database column or migration.
- Production build, backend syntax checks, Telegram Serverless contracts, and `git diff --check` passed. TGCloud r412 reports webhook in sync, working directory clean, and static up to date (51 files). Live read-only inspection found 10 configured methods (9 QR, 1 secured link), 9 QR image references, and one QR media asset successfully returned as PNG. Sensitive payment values were not printed.
- While preparing this fix, an attempted schema module push included a proposed field; it was promptly reverted by pushing the original schema source. No `tgcloud migrate` command was run and no business data was changed. TGCloud continues to report 48 pre-existing schema/database differences; do not migrate as part of this checkout/UI repair.
- No test orders or payment changes were made. Real customer flow, QR visibility/copy, and mobile clipping are not device-verified; the viewport scroll handling is corrected in source but must be visually checked on the customer's phone.

## R2 production activation — 2026-11-06

- Enabled the R2 media client against `https://prime-media-gateway.pages.dev`, which forwards to the private R2 Worker through the Cloudflare Pages service binding. The Mini App does not call `workers.dev` directly. Source change was reviewed/committed in Sandbox `3013ecd` and promoted to Checkout `57625c9`.
- Production build passed with `VITE_UI_PREVIEW=0`; the gateway origin is present in the emitted bundle. The local Worker test suite passed in Sandbox (Telegram initData auth, signing, privacy, byte ranges), and Telegram Serverless contract checks passed. The clean Checkout lacked the Worker-local `aws4fetch` dependency, so its repeated Worker test invocation could not run there; no Worker code was changed or deployed.
- Before and after deployment, `https://prime-media-gateway.pages.dev/videos` returned HTTP 200 with `[]`; live app-origin CORS preflight returned 204. This read-only check indicates the bucket catalog is currently empty. No R2 uploads or deletions were performed.
- Deployed only `dist/` to `app8830494959`; TGCloud now reports r408, webhook in sync, and 51 static files up to date. Live HTML serves `/assets/index-Dp05_Qw7.js`; downloaded live JS SHA-256 `c132ceceb3a981a46539dabab94142bcddb20cdc1cdadb9ec34e2c745073181d` matches local build and contains the Pages gateway origin. CSS remains `/assets/index-DNrG5qZe.css`.
- R2 is connected in production, but authentic Telegram Admin upload, customer playback, range seeking, and Android rendering remain to be tested on-device. Existing Telegram gallery media is retained alongside R2; no existing media was migrated.

## TGCloud parity and media release — 2026-11-06

- Read-only `tgcloud fetch` from the clean linked Checkout refreshed app8830494959 at revision 406 with 68 modules; webhook remained in sync. Checkout contains 68 modules (43 endpoints, 3 handlers, 21 libraries, and schema). `tgcloud status` reported no backend modules added or missing—only the three intended media changes (`getMediaContent.js`, `manageMediaAssets.js`, `lib/media.js`). `tgcloud diff tgcloud/schema.js` returned no changes. This supersedes the stale 61-vs-43 count and dirty-schema observation; parity is not a blocker for this scoped release.
- Read-only live calls returned 20 active products with image references, six couriers with logos, ten payment methods with logos (nine QR-based), and four active promos. Four representative product/courier/payment-logo/QR images returned bytes through the candidate inline-first reader. No business records were changed.
- Deployed media read/upload handlers lacked inline-byte support and image-upload actions; those three scoped files are prepared for release. Invalid legacy Telegram file IDs without stored bytes still need their original images reattached; no images were fabricated or reassigned.
- Checkout display already resolves `tgmedia:` QR references, but the Download control passed the raw reference to the browser. This release resolves the media before download. Promo validation stays authenticated/read-only; the tier test fixture was corrected to ₱11,000 for Bronze under the current 30-day ₱10k/₱15k/₱20k/₱25k thresholds. Rates remain 5%–7%.

The production reconstruction audit was started during an earlier endpoint/schema mismatch. The fresh r406 snapshot reconciliation below supersedes that initial hold; retain this audit as the source of current release state.

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
- The verified sandbox commit was promoted into this clean checkout for final build and deployment review.
- No deployment has occurred from this checkout.

## Delivery quote and courier selection — 2026-11-06

- Checkout sent destination coordinates only, but `getDeliveryQuote` required `courierId`, returned one quote, and omitted route-time fields expected by the UI. This produced the screenshot's invalid-destination/courier message and empty courier list.
- Source commit `298019f` changes the endpoint to delegate to shared `quoteDelivery`, returning all active courier quotes and route estimate fields. Checkout clears stale selections on destination changes and ignores out-of-order responses.
## Shopfront product media and visual consistency — 2026-11-06

- Confirmed failure: old `tgmedia:` catalog references eventually call `getMediaContent`, which previously unconditionally used Telegram `api.getFileContent(file_id)`; several live product media reads returned Telegram `400 invalid file_id`. The client swallowed those errors and each card displayed the same Picsum fallback.
- Confirmed upload gap: Catalog/Admin client calls `manageMediaAssets` with `uploadPublicImage` / `uploadProductImage`, but the endpoint lacked both actions. New code stores validated JPG/PNG bytes in the existing `media_asset_contents` BLOB table, and media retrieval checks those bytes before the legacy Telegram file path. Legacy Telegram media remains supported.
- UI collision: `index.html` loaded the stale `prime-header-override-r325.css`, while `app/globals.css` applied later Lato-based root selectors after the new MiSans/Roboto rules. The stale link/file was removed, the Vite entry no longer bundles Lato, and one final shared typography/header layer now enforces the approved typography and non-cropped `prime-global-header.jpg` on both Shopfront and Admin.
- Generic repeated Picsum fallback was replaced with an explicit local unavailable-image illustration in Shopfront, product modal, cart, checkout, and order history.
- Verification: `node scripts/check-telegram-serverless-contracts.mjs`, JavaScript syntax checks, and `git diff --check` pass. `npm run build:miniapp` succeeds (2,367 modules transformed); Vite reports existing non-fatal configuration/module-directive/large-chunk warnings. Existing live product photo bytes have not been recovered or reattached. If an old media row has no inline byte record and its Telegram file ID is invalid, the correct original product image must be re-uploaded; no unrelated local image has been assigned.
- Source changes are now merged into this production checkout. Historical invalid Telegram file IDs still require correct original image bytes to be re-uploaded; no live catalog mutation or deployment has occurred.

## Delivery quote and courier selection — 2026-11-06

- The screenshot's red error came from a request/handler mismatch: checkout sent only destination coordinates, while `getDeliveryQuote` required `courierId`. The handler also returned one quote, while checkout expects all active couriers; displayed travel-time fields were absent.
- The handler now delegates to shared `quoteDelivery`, which supports destination-only requests, returns all active courier quotes and route time, and retains server-side fee calculation and fallback distance estimation. The client clears courier/payment selection when the destination changes and ignores out-of-order quote responses.
- Endpoint syntax checks, contract suite, diff check, and Vite builds pass in the updated checkout. No live deployment/device verification occurred.

## Live-linked endpoint parity — 2026-11-06

- TGCloud status reports app `app8830494959`, revision 393, webhook synced, static dist 244 files current, and a modified linked `tgcloud/schema.js`.
- Historical note: schema and endpoint inventory appeared mismatched at r393. The fresh r406 snapshot above found 68 matching modules and a clean schema diff; no bulk copy/deletion was performed.
- Checkout Secretary code uses the bot-send 12-hour throttle and does not suppress on human takeover. The linked handler still calls `recordHumanTakeover`, so that deployed behavior remains out of sync.
- CLI supports scoped pushes, but the governance gate remains until each unmatched handler and dirty schema are reconciled. No deployment was attempted.

## Delivery checkout incident release — 2026-11-06

- The latest customer screenshot showed delivery checkout unable to continue. The previously deployed `getDeliveryQuote` implementation required a courier ID even though the client must first request the available courier list with destination coordinates. This produced the visible “A valid destination and courier are required” error and an empty courier list.
- Released the committed fix from `Prime-TGCloud-Checkout` with a narrowly scoped `tgcloud push tgcloud/endpoints/getDeliveryQuote.js dist/`. No schema or unrelated backend modules were pushed. TGCloud reports app `app8830494959`, revision 400, webhook in sync, and static up to date (51 files).
- Live HTML references `index-gxU3U0s4.js` and `index-DNrG5qZe.css`; downloaded live assets match the built assets byte-for-byte (SHA-256 JS `8636ff1adef44c8e04828c9927ad57e38c0b0f77676a474d580344ec3da777c6`; CSS `223097d126b6bfb7d2034fd84270247b8feec75f1ffffe8525cf84bae75d7d21`). The focused Telegram Serverless contract test passed before release.
- Deployment/build verification is complete, but customer-device verification of courier loading, quote display, and Continue remains outstanding. At r400 the later r406 endpoint/schema parity check had not yet occurred; see the reconciliation above.

## Secretary repeat-welcome incident release — 2026-11-06

- The 12-hour check correctly suppressed the welcome response, but the generic message matcher could select the same welcome flow again when its message trigger was blank (blank message triggers match any customer message). This bypassed the configured welcome cooldown.
- Commit `dd9d9ff` excludes the configured welcome-flow ID from generic message matching while retaining independent keyword-triggered flows. `node --check tgcloud/lib/telegram-automation.js`, the Telegram Serverless contract suite, and `git diff --check` passed.
- Pushed only `tgcloud/lib/telegram-automation.js`. TGCloud now reports revision 401, webhook synced, static unchanged/up-to-date. Module SHA-256: `f3ef192b255458e982174c9482eb40f0d78d00dfe2d111924804ee1285b262db`. Actual customer-chat behavior is not yet device-verified.

## Checkout charge and payment-session fixes — deployed — 2026-11-06

- Charge hydration fix deployed alone at revision 402. `tgcloud run getPublicCharges` returned three active rows with compatible values and schedule metadata: Discreet Packaging ₱45 (default), Platform ₱2 (default), Late Night Hazard ₱50 (overnight/non-default). No charge data was modified; the endpoint read configuration only.
- Payment retry fix promoted from sandbox (`3812aeb`, following initial reviewed charge/session implementation `ac05a40`) as checkout `362d96d` and deployed at revision 403. Scope was only `createPaymentSession.js`, `uploadPaymentProof.js`, and `createOrder.js`; no schema, static bundle, or media endpoints were pushed. Live `createOrder.js` and its `checkout-operations.js` dependency matched the reviewed baseline before deployment.
- The stable operation key now resolves an existing customer-scoped order operation before a retry's new proof session is validated. A committed order therefore returns/recoveries from its immutable original operation rather than falsely expiring or creating a second order. Expired/consumed payment sessions receive a unique new ID; proof upload verifies its conditional database write before reporting success. Failed prior operations are not replayed with the same key.
- `tgcloud status` reports revision 403 and webhook in sync. Only unrelated media handlers remain modified relative to the linked snapshot; static bundle remains intentionally undeployed. Contract checks, syntax checks, `git diff --check`, and production Mini App build passed. The connected Telegram device must still test a successful charge display and a same-order retry; no real order/payment was created for verification.

## Payment retry dialog follow-up — revision 404 — 2026-11-06

- A new screenshot taken after r403 still showed `This payment session expired. Start checkout again.` This confirms the earlier retry release had not resolved the visible failure.
- Removed reliance on implicit key conversion from raw `SELECT *` rows: `uploadPaymentProof` and `createOrder` now explicitly alias `customer_id`, `expires_at`, request snapshot, proof, and method columns to the property names their checks consume.
- Contract assertions and endpoint syntax checks passed. Deployed only `uploadPaymentProof.js` and `createOrder.js`; TGCloud reports revision 404, webhook in sync, and both handlers match the deployed snapshot (`tgcloud diff`: no changes). No static bundle/schema/media modules or customer/order/payment records changed.
- Screenshot timestamp is 14:24 PHT, before the r404 push. This is a code-level correction, not yet a device-verified resolution; do not claim the dialog is gone until a Telegram retry confirms it.

## Terminal failed checkout retry — revision 405 — 2026-11-06

- The newer 14:36 PHT screenshot showed `This checkout attempt could not be completed. Start a new checkout to try again.` Earlier screenshot in the same sequence showed missing receiver name/phone. The missing receiver data caused the server operation to fail and complete compensation; subsequent corrected submissions reused the same browser operation key, which is permanently terminal by design.
- `createPaymentSession` now detects only a definitively `failed` prior customer-scoped operation (written after compensation completes), issues a new server-generated operation key and unique payment-session ID, and records that effective key. In-progress, complete, and ambiguous operations retain the original key for safe recovery/idempotency. `createOrder` scopes the payment-session lookup to the authenticated customer and uses the session's effective key.
- Contract tests, endpoint syntax checks, and `git diff --check` passed. Deployed only `createPaymentSession.js` and `createOrder.js`; TGCloud reports revision 405, webhook in sync, and both handlers match (`tgcloud diff`: no changes). No static bundle, schema, media handlers, or customer/order/payment records changed. TGCloud's remaining listed local static/media differences were left untouched.
- The screenshot predates r405. This fixes the identified terminal-key retry path in code; a successful corrected retry on the Telegram device is still unverified.

## Delivery pricing and whole-peso display — 2026-11-06

- The customer-visible courier editor included `timeBasedFeePerMinute`, but `manageCouriers` rejected the field. The quote calculated a diagnostic time fee but omitted it from the actual delivery total. A live read-only quote confirmed the existing database already has this column and configured rates.
- Made the Admin endpoint read/save the rate via raw SQL and include it in the shared fee formula only when routing returned a valid travel-time estimate. The quote and `createOrder` recomputation call the same calculator. The declarative schema is intentionally unchanged to avoid pushing its unrelated 47-change database diff.
- Fee is rounded once after all components to the nearest whole Philippine peso; delivery-only labels now render whole pesos too. Product prices and other charges retain the existing two-decimal currency format.
- Delivery fee regression tests, Serverless contract checks, JS syntax checks, diff check, and production Mini App build pass. Deployed only `manageCouriers.js`, `delivery.js`, `delivery-fee.js`, and `ensure-courier-time-rate.js` at TGCloud r406; no schema, global migration, static, media, courier configuration, or order data was changed. Webhook synced and all four target diffs are clean. A read-only live sample quote returned TomTom 20.94 km/75 min and calculated the configured Lalamove Standard fee as ₱311.96 → ₱312 (base 45 + first distance 35 + excess distance 156.96 + time 75). This verifies server-side computation and rounding, not actual carrier pricing or device display.
