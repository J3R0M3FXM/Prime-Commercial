# PRIME native Telegram auth Worker

## PARKED — NOT DEPLOYED

This is an incomplete scaffold, not a live authentication service. Do not present
standalone APK Telegram login as implemented, do not promote this directory to
Checkout, and do not point the production APK at it. The Worker has not been
deployed, the custom domain/BotFather setup is not confirmed, and the APK does
not yet consume the `/exchange` response. Resume only after those prerequisites
are deliberately completed and device-tested.

This Worker is intentionally separate from `prime-media-preview`. It verifies Telegram Login Widget data, stores a single-use 60-second native handoff code in KV, and redirects to `prime://auth/callback`.

## Admin native-session contract

Option 1 requires TGCloud to attach a platform-verified claim to endpoint context before endpoint code runs:

```js
ctx.nativeAdminSession = {
  verified: true,
  role: 'admin',
  staffId: 'stable-native-staff-id',
  authMethod: 'native_session',
};
```

`tgcloud/lib/auth.js` accepts this claim through `verifiedNativeAdmin`; it does not accept a token, access code, or `role` supplied in endpoint input. Until the Serverless runtime provides this trusted context, all Admin endpoints continue to require Telegram `initData`.

Before deployment:

1. Create a KV namespace and replace `REPLACE_WITH_KV_NAMESPACE_ID` in `wrangler.jsonc`.
2. Set secrets: `wrangler secret put TELEGRAM_BOT_TOKEN` and `wrangler secret put SESSION_SIGNING_KEY` (at least 32 random bytes).
3. Register `auth.codespacelabs.online` with BotFather for `primenetworkphbot`.
4. Confirm the Cloudflare DNS route exists.

The `/exchange` response is a contract for the APK integration; the app must consume the code once and store the returned session only in native secure storage. Do not deploy this Worker until the backend accepts the signed native session format.
