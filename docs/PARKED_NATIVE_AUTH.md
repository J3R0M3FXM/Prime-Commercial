# Parked native APK authentication

The Cloudflare native-auth work is intentionally parked.

- Sandbox-only scaffold: `cloudflare/prime-auth/`
- Current scaffold commit: `51c50c5` (plus this status clarification)
- No Worker deployment, DNS route, KV namespace, or BotFather domain approval has been confirmed.
- The APK receives a `prime://auth/callback` handoff, but does not yet exchange the code or use a native session for backend calls.
- Existing Telegram Mini App authentication remains the authoritative production path.
- Do not promote this scaffold to Checkout or describe standalone APK login as complete.

Resume only as a dedicated, explicitly validated task. Require Worker health, signature/replay tests, APK exchange integration, and a real Android login test before any production promotion.
