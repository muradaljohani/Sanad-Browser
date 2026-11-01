# Native profiles and private vault (1.5.0)

The native application owns separate encrypted stores and persistent Chromium sessions for each local profile. The default profile keeps its existing storage and partition. Switching stops both sync engines, removes page views, unloads extensions, clears private storage and transient password/clipboard state, and restores only the selected profile's ordinary tabs. Archive is recoverable and does not delete profile files.

Google is the existing Firebase identity provider, not a source of Chrome Sync data. A first login claims an unclaimed local profile. A different Google UID opens its own profile. OAuth still uses state + PKCE and a one-time authorization code. The destination profile's stable device ID is rebound on the newly issued scoped session before syncing. No bearer appears in the deep link or shell state.

Bookmarks, compatible settings, history and normal tabs have independent sync switches. Disabling a category preserves local records and replaces unsent operations with sequence-only no-ops. Re-enabling reconciles the category without resetting other pending changes. Basic and private vaults have independent queues, revisions and compare-and-swap writes. Passwords and personal data are off by default and require a new desktop-scoped login for old sessions.

## Encryption and trust

The chosen product mode is Google login only. Local secret storage requires the operating system's secure storage; there is no plaintext fallback for the vault/catalog. AES-GCM additional authenticated data binds ciphertext to a profile and purpose. Cloud records use service-managed AES-GCM keys in service-only tables; this is **not end-to-end encryption**. The service can decrypt records. Login expiry is 30 days; there is no invented permanent Google refresh token.

The web client uses only the basic sync endpoint and never fetches the private vault. Desktop scope is a protocol permission, not hardware attestation of a public client. All service access still requires a verified identity and a valid scoped opaque session. Private responses are filtered to requested types. Raw database tables and RPCs are unavailable to anonymous and authenticated client roles.

## Passwords and personal data

The trusted native panel can add, delete, temporarily reveal/copy, and explicitly fill records. Reveal clears after 10 seconds or profile/panel changes. Copied passwords are cleared after 30 seconds only if the clipboard still contains that password. No OS biometric prompt is claimed. The OS-protected vault protects storage at rest, not a compromised signed-in OS session.

A sandboxed page preload exposes no API to page JavaScript. It offers to save only after a genuine same-origin HTTPS form submission in the active main frame, never private tabs. Main-process checks repeat origin/frame/profile validation and require explicit approval. Filling runs in an isolated world on the matching HTTPS origin, skips hidden/new-password/cross-origin forms, and never submits. Addresses require a site confirmation. Payments, cookies and access tokens are not stored in this vault.

## Extensions and import limits

Electron supports only a subset of Chrome extension APIs. The manager loads user-approved local unpacked extensions into that profile's persistent session, reviews permissions and rejects symlinks. It unloads them when the profile is switched. Extension binaries, machine paths and extension state are not synchronized. Chrome Web Store installation is not supported.

Existing optional local Chrome import remains unchanged: bookmarks, bounded history, compatible settings and available tabs. Chrome passwords/cookies are not decrypted. Google sign-in cannot rename the installed Chrome application or grant access to Google's private Chrome Sync service.

## Validation

Node tests cover independent profile vaults, wrong-account/ciphertext rejection, unavailable OS storage, remote-frame/private submission rejection, origin-scoped fill, two-device private sync and lost-response replay. Browser-model tests cover real category selection and no-op sequences. Windows UI tests use actual OS encryption, isolated cookie partitions, explicit credential fill and profile restoration. Existing desktop, installation, MSIX and web checks remain required.
