# Next Agent Instructions

Before acting, read this file, `docs/WORKTREE_GOVERNANCE.md`, `docs/PRODUCTION_AUDIT.md` here, and the production checkout audit. The old `docs/PROJECT_CONTINUATION.md` and `docs/SUPPORT_TICKETS.md` references are absent in these clean checkouts; do not assume their contents. Keep this handoff and audit current after material changes.

All implementation belongs in `Prime-TGCloud-Sandbox`. Promote only reviewed, committed, built, and verified changes into `Prime-TGCloud-Checkout`. Do not deploy from a dirty worktree. The outstanding endpoint-parity mismatch is a hard release blocker until reconciled.

The sandbox was synchronized with the production source baseline `d7511ff` on 2026-11-06. This did not authorize deployment. TGCloud status was checked on 2026-11-06: linked app `app8830494959`, local revision 393, webhook in sync, static dist up to date (244 files), and `tgcloud/schema.js` modified. The linked live project and sandbox endpoint inventories differ (61 vs 43 top-level JS modules); this remains a hard deployment blocker.

Current owner request: repair Shopfront product image retrieval and remove the old/new hybrid UI. Preserve the approved non-cropped global heading/footer artwork, 430px portrait shell, and current requested typography: headings/labels Roboto Condensed Semibold 600; body/values MiSans. Never ship preview-mode code.

Implementation state: product media upload/read paths now support validated JPEG/PNG bytes in the existing inline media table, retaining legacy Telegram reads. Existing live references that still have invalid Telegram IDs and no inline bytes cannot be reconstructed from code alone; match and reupload original image bytes before claiming all historical product photos are restored. Repeated Picsum photos were replaced with a clear local unavailable-image placeholder. The stale r325 override stylesheet is removed from the Vite entry, and the requested MiSans/Roboto Condensed typography contract is centralized at the end of the main stylesheet. Focused contract checks, JS syntax checks, `git diff --check`, and the Vite production build passed on 2026-11-06. Build has non-fatal Vite/module/chunk warnings and uses the existing symlinked dependency tree. No visual device verification or deployment occurred. Do not promote until endpoint parity and dirty linked schema are reconciled; no live catalog photos were changed.

Payment logo guidance: checkout tiles are 2:1 in three columns. Recommend transparent 600×300 px artboard with 48 px left/right and 30 px top/bottom padding; QR code is a separate asset.

NEWEST PREVIEW (2026-11-03): Owner requested all tier spending requirements increase by ₱5,000. Preview Serverless and legacy calculators now set Bronze ₱10k, Gold ₱15k, Platinum ₱20k, Titanium ₱25k per anchored 30-day cycle. Promo boundary tests, diff check and preview build passed. This threshold change is **not deployed**; live r346 still has the prior Bronze ₱5k/Gold ₱10k/Platinum ₱15k/Titanium ₱20k thresholds. No customer points/credits/orders changed. Tier-restricted voucher eligibility can shift when eventually deployed. See newest project handoff before promotion; do not overwrite the linked project's backend/schema.

LATEST LIVE (2026-11-03): Owner explicitly authorized the Shopfront tap fix and 1px proprietary footer text increase. Static release **r346** is deployed. Product cards press with a small downward/scale movement, Shopfront buttons get a subtle inset press line, and product/variant popups animate on entry; broad brightness/scale flash rules were removed. Live HTML, JS `index-DdRx_ViC.js` and CSS `index-D79xt5aN.css` match the VITE_UI_PREVIEW=0 build. TGCloud reports webhook synced, linked project clean and 60 files current. Telegram phone feel remains unverified. No backend/schema or live orders/payments changed. Release backup: `/data/data/com.termux/files/usr/tmp/prime-shopfront-tap-release-20261103-cdBgID/`. No other owner-authorized deployment is pending; remaining preview/final differences are listed in the newest project handoff. The r345/r344 entries below are historical.

LATEST LIVE (2026-11-03): Owner said “Deploy to live.” The reviewed Order Management UI was promoted from preview to the retained final checkout and deployed static-only as **r345**. TGCloud reports webhook in sync, clean linked working directory and 60 files current. Served live HTML/main JS `index-Dfq_FXBG.js`/CSS `index-C0CI1R4P.css` match the `VITE_UI_PREVIEW=0` production build byte for byte. Workflow test and diff check passed. No backend/schema or live order/payment mutations. Hold/Resubmit/Cancel and no-link dispatch Override stay disabled in production; their preview simulation remains local only. Phone appearance/taps in Telegram, actual Support customer/Admin exchange and payment gateway opening remain unverified. See the newest handoff section and release backup `/data/data/com.termux/files/usr/tmp/prime-orders-release-20261103-s1mCUN/`.

The r344 and preview-only entries below are historical as of this release.

LATEST LIVE: Product category grouping/dropdown/Add New Category was explicitly authorized and deployed at r344. Final-checkout production build matches served HTML/main assets; clean backend, webhook synced, 60 files current. No backend/schema changes. Prior release r343 below is historical.

NEWEST PREVIEW: Order Action & Control Flow now has six 3D-feel, color-coded buttons, exact-due approval after provider check (no amount input), receipt zoom/pan/download popup, dispatch-link popup with preview-only Override, and Delivery Slip/Order Receipt print choices. Hold/Resubmit/Cancel are visual preview states only; production controls for those and Override are disabled because the live backend has no safe actions for them. Top-up proof uses View Receipt; Modify editor appears only when opened, and overdue expiry is separate. Both preview and production-check builds and the Order Management workflow test pass. Preview local assets: index-ClTZvkhv.js / index-C1oGaNqY.css. No deployment; live remains r344. Read the newest handoff section before changing backend or advertising these controls as live.

LATEST REFINEMENT: six controls are three per row with matte natural colors and gray locked state. Stage locks were implemented and tested: after approval/Processing Hold locks; held Pending locks approval; Ready locks Hold/Modify; Dispatched locks Hold/Modify/Cancel; Completed/Expired lock all except available View Receipt. Successful progression clears the local Hold/Resubmit simulation. Local preview assets are now index-Ddm6Enf-.js / index-ZpA7JWuO.css. Build and workflow test pass. Still preview only; phone appearance is unverified.

CURRENT PREVIEW: Order Management revision 2 now incorporates the owner's 2026-11-03 Order Details PNG references: summary/status/total card, five-stage progress rail, pale blue section bands and tabular item amounts, all adapted to 430px portrait. Existing provider and backend workflow gates remain. Inspect http://127.0.0.1:4192/admin?orders-preview=2 on this phone. Build and workflow test passed; phone visual review is pending. This work is NOT promoted/deployed. Live remains r344.

NEWEST PREVIEW PASS: After four phone screenshots, Delivery and Payment & Customer use two short-field columns; absent tracking/identity fields are omitted; Modify Order controls stack; entirely empty Technical Evidence is summarized. The compact list is the default view at the same URL. Preview build/workflow test/diff check pass and served JS/CSS match the build (`index-DC_GfiNi.js` / `index-C3Tx5EMZ.css`). Phone review is pending; no deployment.

The phone IP changes; localhost and current mobile IP 6.79.52.9 both returned HTTP 200. On this same phone, use http://127.0.0.1:4192/admin?orders-preview=2 while Termux keeps Vite running.

LATEST CONTINUATION CHECK: Order Management test and diff check pass after the 2026-11-03 reference adaptation. Local served assets are index-C3etVYNf.js / index-Dcxn9uT7.css. The previous Admin logo inversion correction remains. TGCloud last reported r344 and 60 static files current; a fresh live HTTPS byte comparison was not repeated. Phone visual behavior remains unverified. No deployment or live order/payment mutation occurred.

Owner explicitly said "Deploy them." on 2026-11-02. Release completed: app8830494959 / @primenetworkphbot, revision 343, webhook in sync, 60 static files current. Live HTML/main JS/CSS/header override were fetched and matched the final-checkout production build byte for byte. Database/schema in sync.

Released: Secretary/Product configurator rebuilds and normalized type; fixed global Admin header/queue; light lock and logo shadow; payment/courier selector parity and secured payment link; customer/Admin Support ticket UI, endpoints and additive database table/indexes.

Support migration requires its declaration inline in root schema: schema re-exports fail in the platform migration runner. Never replace the linked project's newer schema with the older preview schema. Tests assert the isolated support descriptor matches the inline declaration.

Pending: actual Telegram customer/Admin ticket exchange, phone visual verification, and external payment-provider opening. Missing-identity customer/Admin requests were rejected in the cloud; no identity was forged or paid transaction initiated. Support is text-only, with no proactive Telegram/email alerts or attachments.

EDIT HERE:
`/data/data/com.termux/files/home/Prime-Commercial-header-preview`

Retained final: `/data/data/com.termux/files/home/Prime-Serverless-Final`.
Linked CLI: `/data/data/com.termux/files/home/primenetworkphbot`.
Use only `npm exec --yes --package=@tgcloud/cli -- tgcloud` for this bot.
Release build: `/data/data/com.termux/files/usr/tmp/prime-final-release-20261102`.
Backup: `/data/data/com.termux/files/usr/tmp/prime-release-backup-20261102-8GDKKr`.

Keep editing in preview, build immediately after UI edits, and preserve all dirty files. Do not restart accepted designs or create extra worktrees. Future unrelated releases still require authorization. Visual preview mode must never ship to live.

Secretary/Product share configurator-ui.css. Preserve white Admin, compact collapsible cards, three-column short fields, blank new numeric inputs and the recorded typography/layout contract. Read the latest user instructions if they change that contract.

Current local visual links are recorded in the handoff; recheck IP/server before quoting them. Use Vite preview, not Next dev hosting. Update project docs and Android Downloads snapshots after material changes. Never present a build/deployment as actual phone verification.

## Mandatory clean-checkout policy

Read `docs/WORKTREE_GOVERNANCE.md` and `docs/PRODUCTION_AUDIT.md` before any action. All future work belongs in `Prime-TGCloud-Sandbox`; promotion and deployment occur only from a committed, verified `Prime-TGCloud-Checkout`. Never deploy from either legacy dirty worktree.
LATEST CHECKOUT SOURCE (2026-11-06): Product-media/UI repair (`d4fb029`) and delivery quote repair (`298019f`) are merged into this checkout. Delivery quotes now accept destination-only requests and return all active couriers; address changes invalidate stale choices/responses. Product images use inline bytes where available, repeated unrelated fallback imagery and stale r325 stylesheet are removed. Contract suite, syntax checks, diff check, and Vite build pass. Checkout Secretary source follows the 12-hour bot-send-only rule; linked live code still calls `recordHumanTakeover`. Nothing has been deployed or device-verified. Reconcile the 18 linked-only endpoints and schema drift before release; do not bulk-push.
