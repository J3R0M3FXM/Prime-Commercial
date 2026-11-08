# Prime Media R2 pilot

Current release adds multi-categories, generated selectable thumbnails, duration metadata, stream CORS and publication rechecks on every signed stream. Grants expire after a duration-aware 10–120 minutes. Admin `/health` checks the real bucket/signer configuration. Use `python -B cloudflare/prime-media/update-worker.py` for a read-only binding check; add `--deploy` only from validated clean Checkout. It preserves existing remote secrets and bindings and refuses an unexpected bucket. Do not rerun initial provisioning for an update. The unchanged Pages service-binding gateway needs no redeployment.

The private R2 Worker, exact-origin bucket CORS, and Pages gateway are configured. The production Mini App uses `https://prime-media-gateway.pages.dev`; the gateway forwards to the private Worker through a Cloudflare service binding. Do not point the Mini App directly at `workers.dev`.

The account key was used only to configure Cloudflare. Worker signing uses a key scoped to `prime-media-preview`; secrets remain outside this repository. The public Pages gateway was verified from this environment: `/videos` returns HTTP 200 and the live-origin CORS preflight returns 204. Authenticated upload, playback, and Android behavior still require a real Telegram-device check.

## Cloudflare account setup (completed; retain for recovery)

1. Keep the existing `prime-media-preview` R2 bucket private. Leave public access and its development URL disabled.
2. Create a bucket-scoped R2 API token with **Object Read & Write** for `prime-media-preview` only. Store its Access Key ID and Secret Access Key as Worker secrets named `R2_ACCESS_KEY_ID` and `R2_SECRET_ACCESS_KEY`. Do not put either in Mini App environment variables, source, chat, or screenshots.
3. Create a Worker named `prime-media-preview` and bind the bucket as `MEDIA_BUCKET`. `wrangler.jsonc` describes that binding. This was deployed through the Cloudflare API because Termux Android ARM64 cannot install Cloudflare's `workerd` binary.
4. Set Worker secrets `TELEGRAM_BOT_TOKEN` (the same bot that launches the Mini App), `ADMIN_TELEGRAM_IDS` (comma-separated Telegram IDs permitted to manage videos), and `STREAM_SIGNING_KEY` (a fresh random secret of at least 32 bytes). Set Worker variables `CLOUDFLARE_ACCOUNT_ID` and `ALLOWED_ORIGINS` (comma-separated **exact** Mini App origins). The current TGCloud origin is `https://app8830494959.tgcloud.ai`; add only preview origins actually used for testing. Keep all token values out of Git.
5. Bucket CORS currently permits the live TGCloud origin and local port 4193 preview origin. `PUT`, `Content-Type`, and exposed `ETag` are required for browser multipart uploads. The Worker separately checks `ALLOWED_ORIGINS` for its API.
6. The Mini App client defaults to the verified Pages gateway (`https://prime-media-gateway.pages.dev`). `VITE_R2_MEDIA_ORIGIN` may override it for a controlled test build. Existing Telegram videos remain available alongside R2 videos.

## Pilot check before release

- Open the preview from a real verified Telegram Admin session. Upload a disposable MP4; the browser sends 10 MiB parts directly to R2, keeps completed part ETags locally for retry, and checks the final object size before creating a draft gallery entry.
- Publish the draft, play it from a real Telegram customer account, seek forward to exercise HTTP range, then unpublish and confirm the customer cannot obtain a fresh playback grant. A video link is a ten-minute bearer URL and should not be shared.
- Confirm the Worker logs, bucket object, catalog record, CORS response, and actual Android playback. Delete the disposable video after testing.
- The gateway is reachable and the Admin/customer R2 code paths are integrated. Owner authorized deployment. Do not enable preview mode in the live build. A real authenticated upload and customer playback/range test remains a post-release device check; do not claim that behavior is device-verified until performed.

Local checks: `node cloudflare/prime-media/test-worker.mjs` after `node_modules/.bin/rolldown cloudflare/prime-media/src/index.mjs --platform browser --format esm --file cloudflare/prime-media/dist/worker.mjs`. The test uses a fake R2 bucket and generated local Telegram initData; it does not prove Cloudflare account or device behavior.
