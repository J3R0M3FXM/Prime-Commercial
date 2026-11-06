# Production Reconstruction Audit

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
- The linked local `schema.js` differs from checkout: it lacks `media_asset_contents` and `inventory_reservations` declarations (and the `blob` import), while linked media/order handlers reference those tables. Do not push schema or depend on a migration until reconciled against the actual cloud database.
- Endpoint inventory is 43 in checkout vs 61 linked (18 linked-only). The unmatched set includes scheduled notification dispatch/maintenance, active support-ticket routes, legacy Supabase storefront routes, Taggun-capable receipt analysis, old storefront/geocoding/profile/media upload routes, and settings utilities. Several are policy-incompatible or potentially active; they must not be copied/deleted in bulk.
- Checkout Secretary code uses the bot-send 12-hour throttle and does not suppress on human takeover. The linked handler still calls `recordHumanTakeover`, so that deployed behavior remains out of sync.
- CLI supports scoped pushes, but the governance gate remains until each unmatched handler and dirty schema are reconciled. No deployment was attempted.

## Delivery checkout incident release — 2026-11-06

- The latest customer screenshot showed delivery checkout unable to continue. The previously deployed `getDeliveryQuote` implementation required a courier ID even though the client must first request the available courier list with destination coordinates. This produced the visible “A valid destination and courier are required” error and an empty courier list.
- Released the committed fix from `Prime-TGCloud-Checkout` with a narrowly scoped `tgcloud push tgcloud/endpoints/getDeliveryQuote.js dist/`. No schema or unrelated backend modules were pushed. TGCloud reports app `app8830494959`, revision 400, webhook in sync, and static up to date (51 files).
- Live HTML references `index-gxU3U0s4.js` and `index-DNrG5qZe.css`; downloaded live assets match the built assets byte-for-byte (SHA-256 JS `8636ff1adef44c8e04828c9927ad57e38c0b0f77676a474d580344ec3da777c6`; CSS `223097d126b6bfb7d2034fd84270247b8feec75f1ffffe8525cf84bae75d7d21`). The focused Telegram Serverless contract test passed before release.
- Deployment/build verification is complete, but customer-device verification of courier loading, quote display, and Continue remains outstanding. The unrelated linked-only endpoint and schema mismatch remains a future release gate; this narrowly scoped incident release did not reconcile it.

## Secretary repeat-welcome incident release — 2026-11-06

- The 12-hour check correctly suppressed the welcome response, but the generic message matcher could select the same welcome flow again when its message trigger was blank (blank message triggers match any customer message). This bypassed the configured welcome cooldown.
- Commit `dd9d9ff` excludes the configured welcome-flow ID from generic message matching while retaining independent keyword-triggered flows. `node --check tgcloud/lib/telegram-automation.js`, the Telegram Serverless contract suite, and `git diff --check` passed.
- Pushed only `tgcloud/lib/telegram-automation.js`. TGCloud now reports revision 401, webhook synced, static unchanged/up-to-date. Module SHA-256: `f3ef192b255458e982174c9482eb40f0d78d00dfe2d111924804ee1285b262db`. Actual customer-chat behavior is not yet device-verified.

## Checkout charge and payment-session fixes — pending source promotion — 2026-11-06

- Sandbox fixed charge hydration: public JSON maps saved `rate` to `amount`/`value` and decodes schedule/default metadata from description JSON.
- Sandbox fixed payment retries: preserve valid proof sessions; issue a new session after expiry; recover consumed sessions through the original idempotency key; verify conditional proof writes.
- Focused contracts, endpoint syntax checks, diff check, and production Mini App build pass. Source promotion is pending; nothing is live yet.
- Promotion/deployment remains blocked by unreconciled linked-only endpoint modules and modified linked schema. No live order/payment/credit/customer data changed.
