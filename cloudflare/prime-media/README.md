# Prime Media R2 pilot

The private R2 Worker and exact-origin bucket CORS were configured on 2026-11-04. **The Mini App R2 integration remains preview only; TGCloud live was not changed.** The existing Telegram Media Gallery remains the live path. Worker URL: `https://prime-media-preview.jerome-businessplatform.workers.dev`.

The account key was used only to configure Cloudflare. Worker signing uses a new key scoped to `prime-media-preview`; its only local copy is `/data/data/com.termux/files/home/.config/prime-commercial/prime-media-preview-secrets.json` (mode 600). No secret belongs in this repository. Termux cannot establish TCP connections to `workers.dev` from the current network, so real Worker runtime and device playback still need verification before Mini App release.

## Cloudflare account setup (completed; retain for recovery)

1. Keep the existing `prime-media-preview` R2 bucket private. Leave public access and its development URL disabled.
2. Create a bucket-scoped R2 API token with **Object Read & Write** for `prime-media-preview` only. Store its Access Key ID and Secret Access Key as Worker secrets named `R2_ACCESS_KEY_ID` and `R2_SECRET_ACCESS_KEY`. Do not put either in Mini App environment variables, source, chat, or screenshots.
3. Create a Worker named `prime-media-preview` and bind the bucket as `MEDIA_BUCKET`. `wrangler.jsonc` describes that binding. This was deployed through the Cloudflare API because Termux Android ARM64 cannot install Cloudflare's `workerd` binary.
4. Set Worker secrets `TELEGRAM_BOT_TOKEN` (the same bot that launches the Mini App), `ADMIN_TELEGRAM_IDS` (comma-separated Telegram IDs permitted to manage videos), and `STREAM_SIGNING_KEY` (a fresh random secret of at least 32 bytes). Set Worker variables `CLOUDFLARE_ACCOUNT_ID` and `ALLOWED_ORIGINS` (comma-separated **exact** Mini App origins). The current TGCloud origin is `https://app8830494959.tgcloud.ai`; add only preview origins actually used for testing. Keep all token values out of Git.
5. Bucket CORS currently permits the live TGCloud origin and local port 4193 preview origin. `PUT`, `Content-Type`, and exposed `ETag` are required for browser multipart uploads. The Worker separately checks `ALLOWED_ORIGINS` for its API.
6. The retained preview was built with `VITE_R2_MEDIA_ORIGIN=https://prime-media-preview.jerome-businessplatform.workers.dev` and `VITE_UI_PREVIEW=1`. This public origin is not a secret. The R2 option appears in Admin Media Gallery only when this variable is set. Existing Telegram videos remain available.

## Pilot check before release

- Open the preview from a real verified Telegram Admin session. Upload a disposable MP4; the browser sends 10 MiB parts directly to R2, keeps completed part ETags locally for retry, and checks the final object size before creating a draft gallery entry.
- Publish the draft, play it from a real Telegram customer account, seek forward to exercise HTTP range, then unpublish and confirm the customer cannot obtain a fresh playback grant. A video link is a ten-minute bearer URL and should not be shared.
- Confirm the Worker logs, bucket object, catalog record, CORS response, and actual Android playback. Delete the disposable video after testing.
- Owner authorized TGCloud deployment once setup is complete. First verify Worker reachability and authentic Telegram upload/playback, then review and promote a scoped production build. Do not enable preview mode in the live build.

Local checks: `node cloudflare/prime-media/test-worker.mjs` after `node_modules/.bin/rolldown cloudflare/prime-media/src/index.mjs --platform browser --format esm --file cloudflare/prime-media/dist/worker.mjs`. The test uses a fake R2 bucket and generated local Telegram initData; it does not prove Cloudflare account or device behavior.
