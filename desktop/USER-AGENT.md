# Sanad Browser identity

The main entry is `desktop/main.cjs`. Before creating sessions or windows, it sets `app.userAgentFallback` to the normalized runtime User-Agent. `prepareSession` applies the same identity to persistent browsing and temporary private sessions before any page is created. This also covers native popup tabs through their session and the global fallback.

`user-agent.cjs` removes the Electron product token and old Sanad/package product tokens, preserves Chromium's actual platform and engine tokens, and appends one `SanadBrowser/<app version>` product token. It is idempotent and contains no fixed Chrome version, account identifier, private-mode marker or browser-specific workaround for a service.

For illustration, a runtime Windows identity ending in:

```text
Chrome/156.0.8078.49 Safari/537.36 sanad-browser-desktop/1.3.4 Electron/45.1.0
```

becomes:

```text
Chrome/156.0.8078.49 Safari/537.36 SanadBrowser/1.3.5
```

The Chrome version is an example, not an override; actual versions continue to come from the installed runtime. User-Agent Client Hints are left to Chromium. The About page and bundled technology/license notices continue to identify the actual engine and dependencies.

## Detection services and authentication

This changes the HTTP User-Agent and `navigator.userAgent`. A diagnostic site's display name depends on its own detection logic and product database; a custom token cannot force every service to show an exact product label.

This is product branding, not an implementation of a Google authentication workaround. Google's OAuth policies separately prohibit authorization in developer-controlled embedded user-agents. Native authentication integrations should use the provider-supported system-browser authorization flow, appropriate registered client and PKCE/callback handling. Changing a User-Agent is not a guarantee of acceptance and does not implement that flow or move cookies between browsers. Existing login/navigation code is unchanged.

Sources matched to the runtime:

- https://github.com/electron/electron/blob/v45.1.0/docs/api/app.md#appuseragentfallback
- https://github.com/electron/electron/blob/v45.1.0/docs/api/session.md#sessetuseragentuseragent-acceptlanguages
- https://developers.google.com/identity/protocols/oauth2/policies#use-secure-browsers
- https://developers.google.com/identity/protocols/oauth2/native-app

Unit tests cover product replacement, duplicate removal, platform/engine preservation and malformed input. The live Electron suite checks the actual network header, page navigator, global fallback, persistent session, private session and popup identity, and records actual Client Hints without modifying them. Existing browser security, encryption, packaging and signature checks remain enabled.

Installed copies receive this behavior only through a new desktop/Store release. Editing a website cannot alter the User-Agent of an already installed application.
