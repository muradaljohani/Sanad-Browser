# Kiwi Sync architecture review

Reviewed `kiwibrowser/sync` at immutable commit `fd200b9ce3cd9d708087607db68d176d5f23eb4d` on 2026-11-01 through the GitHub connector. Repository metadata marks it archived; code is GPL-2.0. No code, credentials, Firebase configuration or service endpoints were copied.

The README and manifest describe a Manifest V2 extension, not native Chromium Google-account integration. `background.js` reads the local bookmark tree with chrome.bookmarks, subscribes to onCreated/onChanged/onRemoved, and publishes per-device records to its own Firestore collection. Firestore onSnapshot delivers remote changes. It does not grant access to Google Chrome Sync. Its identity is derived from a shared passphrase and a custom-token service, deliberately avoiding Google SSO. The main implemented data type is bookmarks; the manifest description does not establish full password/history/settings synchronization.

Useful patterns retained in Sanad: changes are queued locally, device identifiers disambiguate writes, batches bound work, initial reconciliation precedes uploads, and reconnect resumes outstanding work. Sanad additionally listens for web online/focus and native online/window-focus events so queued changes resume immediately when the app becomes available, while the existing periodic pull reconciles other devices. This is event-triggered recovery plus polling, not a claim of Firestore-style realtime push. The replay-safe per-device sequence ledger and atomic revision merge remain in place.

Sanad keeps its existing Google-verified identity and scoped, revocable tokens. The Kiwi sample's public generateToken accepts a caller-provided UID; that authentication pattern is not adopted. Its AES-CBC example is not copied; Sanad retains owner-bound authenticated AES-GCM. Sanad currently has server-managed encryption keys, unlike Kiwi's passphrase-derived local key; do not describe Sanad's current encryption as E2EE.

No extension is added to Sanad's required flow. Direct Google sign-in starts disclosed Sanad sync automatically, with history optional before sign-in. Importing pre-existing Chrome data is a separate native local operation. Google's private Chrome Sync APIs remain restricted: https://new.chromium.org/developers/how-tos/api-keys/ .

Sources: https://github.com/kiwibrowser/sync/blob/fd200b9ce3cd9d708087607db68d176d5f23eb4d/README.md ; manifest.json; background.js; crypto.js; serverside/index.js; serverside/firestore_security_rules.
