# PRIME owner-phone SMS bridge

Separate native Android 8+ app. Build with `python android-sms-bridge/build.py` in Termux. Android 35 classes are required; resource linking uses the installed framework resource APK by default (`ANDROID_RESOURCES` overrides it). The signing identity stays outside the repository under `~/.config/prime-commercial/sms-bridge-signing/`; retain it for upgrades.

Pair with a ten-minute admin code, allow SMS and notification permissions, then enable forwarding. An ongoing low-priority notification identifies the active listener and provides Pause. A non-exported sticky foreground service uses the declared special-use type for owner payment capture. Boot restores it when Android allows; the system SMS receiver also works independently of the Activity. No SMS history or SMS sending permission is requested. Only matching MayaBiz payment confirmations enter the encrypted queue. JobScheduler handles network retries.

The signed APK is approximately 590 KB, including fonts.

No indefinite CPU wake lock is held. The notification keeps the listening service visible without keeping the CPU awake all day. Force-stop, denied/revoked permissions, Android's Stop control, and manufacturer restrictions can still prevent listening; reopen and enable the app after force-stop. Allow notifications and set battery use to Unrestricted on the payment phone. Screen-off reception, restart behavior, offline retries and real delivery must be validated on the target phone before relying on it.

The server pairing, ingestion and admin reconciliation deployment must be completed before the APK is operational. A local APK build alone does not establish end-to-end payment verification. No SMS match automatically approves an order.


## Version 1.1: blocked-message recovery

Install over version 1.0 with the same signing identity; do not uninstall or disconnect to retain the existing pairing, encryption key and queued evidence. The queue upgrades in place with an optional rejection-reason column. Existing blocked messages display an older-version notice until explicitly retried. Retry blocked messages resubmits their original encrypted content and timestamps unchanged. The server returns separate format/time/authentication reason codes while retaining the same validation rules. Generic transport/HTML errors stay queued rather than being treated as revoked pairing or permanent rejection. Opening the enabled app restores its foreground listener.

Focused checks: build the APK, run `python android-sms-bridge/tests/test-queue-upgrade.py`, compile the two Java tests against `build/classes`, run `PaymentFilterTest` and `DeliveryDecisionTest`, then run `node cloudflare/prime-media/test-sms-bridge.mjs`.
