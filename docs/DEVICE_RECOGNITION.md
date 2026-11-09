# Device Recognition

The Telegram Serverless app recognizes an account, an installation and a browser environment separately. All account authorization continues to come from platform-verified `ctx.initData.user.id`. Client signals, session identifiers, IP reports and location readings are untrusted telemetry.

## Collected Signals

- Installation UUID: Telegram DeviceStorage on supported clients, with local/session storage and page-memory fallbacks. Native storage read errors do not overwrite an unread native value. Existing `prime_device_id` values are retained for voucher compatibility.
- Session identifier: cryptographically random, scoped to the client account and installation, retained in session storage across reloads. It is not an authentication credential or HMAC.
- Browser fingerprint: bundled `@fingerprintjs/fingerprintjs` 5.3.0 (MIT), with `monitoring: false`. Collection is deferred until after verified login, cached per page and bounded to 2.5 seconds per wait. The package's aggregate identifier is stored; raw canvas images, audio results and font inventories are not uploaded.
- Metadata: browser/OS family and version when detectable, Telegram platform/version, display, language/time zone, available storage and coarse browser connection signals. Unsupported values remain unavailable.

`hardwareId` and `deviceFingerprintId` remain legacy voucher signals. They are not a physical hardware identity. Existing customer fingerprint history is preserved; the Admin label now describes the legacy browser signal accurately.

## Registry and Review Events

`device_registrations`, `device_security_sessions` and `device_security_events` are additive tables declared in `tgcloud/schema.js`. `ensureDeviceSecurityTables` creates only those tables/indexes idempotently on the first verified feature call, matching the application's existing lazy table initialization pattern. Automatic enrollment after verified login triggers this setup; no separate staff action is required. The CLI can run endpoints and handlers, not shared library modules. No existing tables or configuration values are migrated or removed. Do not use a broad schema migration to apply unrelated existing drift.

Registration IDs are SHA-256 identifiers derived on the server from the verified account and installation. Session IDs also include the client session identifier. Repeated calls upsert the same registration/session. Security-event IDs are deterministic to suppress retry duplicates. First/last-seen timestamps come from the server.

New installations, changed fingerprints and signals shared with another account generate review events and a heuristic review score. They do not automatically ban customers, authenticate them, reject orders or change staff-configured voucher restrictions. Shared devices, browser updates and spoofed signals can all produce these events.

Customer requests always use the verified account. Admin dossier/history and runtime diagnostics require `requireAdmin`. The registry never returns another customer's history to a customer.

## IP and Location

Account → Device & Session Security has explicit network and location actions. IP checking uses the already-supported ipify endpoint and is recorded as **Browser-Reported**, never server-attested. There is no automatic IP lookup, enrichment subscription, VPN assertion or IP-based blocking.

The Admin customer dossier exposes **Inspect Runtime**. It returns only names of context/request/metadata fields from a genuine Mini App call. It does not return init data, headers, tokens or IP values. Telegram's current Serverless documentation does not define a trusted client-IP field; the feature reports server IP as unavailable rather than interpreting undocumented fields or forwarded headers as authoritative.

**Verify My Location** uses Telegram LocationManager where available and browser geolocation otherwise. It runs only after the customer's tap, uses one permission channel and does not start background tracking. The endpoint checks numeric coordinate ranges in memory and retains only the server check time, accuracy and source. No precise coordinates are written to the registry, events, customer fingerprints or R2, so there is no location archive or encryption key to configure. A user-shared reading does not prove physical presence. Delivery destination coordinates remain a separate checkout concept.

## Retention

Sessions/events expire after 90 days and inactive installation registrations after 180 days. Per-account session/event histories are capped at 100/200; displayed histories are bounded. Cleanup only targets these new telemetry tables and is enforced on reads/writes. Legacy customer history is not erased.

## Validation and Runtime Limits

Run `node scripts/test-device-security.mjs`, `node scripts/test-device-security-ui.mjs` and `npm run validate:miniapp` in Sandbox. Tests exercise real SQLite ownership/idempotency/retention and rendered consent controls with simulated native APIs. Native DeviceStorage persistence, location permissions and real runtime context shape still require the Telegram client. CLI `run` with no context can check compilation/unauthenticated rejection but cannot supply evidence about a real client's request metadata.

References: [Telegram Mini Apps](https://core.telegram.org/bots/webapps), [Telegram Serverless](https://core.telegram.org/bots/serverless), [FingerprintJS API](https://github.com/fingerprintjs/fingerprintjs/blob/master/docs/api.md).
