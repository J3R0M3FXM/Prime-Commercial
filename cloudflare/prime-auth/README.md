# PRIME native Telegram auth Worker

## Gateway foundation — NOT DEPLOYED

This is a gateway foundation, not a live authentication service. Do not point a
production APK at it yet. The Worker has not been deployed, the custom
domain/BotFather setup is not confirmed, and the APK flow still requires device
testing. Configure `ADMIN_TELEGRAM_USER_IDS` before deployment; users outside
that allowlist cannot exchange a login code.

This Worker is intentionally separate from `prime-media-preview`. It verifies Telegram Login Widget data, stores a single-use 60-second native handoff code in KV, and redirects to `prime://auth/callback`.

## Gateway session contract

Option 1 remains unsupported by TGCloud. Option 2 issues a short-lived signed
gateway session to the APK:

```js
admin|telegram-user-id|issued-unix-seconds|hmac-sha256
```

The APK stores that value in Android Keystore-backed storage. `/session` validates
the signature, expiry, and admin allowlist. This gateway session does **not** yet
authorize TGCloud endpoints; those endpoints still require Telegram `initData`.
The Admin API must be moved behind a gateway proxy or another backend before the
standalone APK can operate without Telegram.

Before deployment:

1. Create a KV namespace and replace `REPLACE_WITH_KV_NAMESPACE_ID` in `wrangler.jsonc`.
2. Set secrets: `wrangler secret put TELEGRAM_BOT_TOKEN` and `wrangler secret put SESSION_SIGNING_KEY` (at least 32 random bytes).
3. Set `ADMIN_TELEGRAM_USER_IDS` to a comma-separated allowlist of Telegram user IDs.
4. Register `auth.codespacelabs.online` with BotFather for `primenetworkphbot`.
5. Confirm the Cloudflare DNS route exists.

The `/exchange` response is consumed by the APK helper and stored only in native
secure storage. Do not deploy this Worker until the gateway backend is ready to
serve the Admin API.
