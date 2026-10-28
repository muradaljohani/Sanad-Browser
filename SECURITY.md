# Security policy

## Supported versions

Security maintenance targets the current `main` source and the current 1.3.x Microsoft Store release. Historical unsigned previews are not recommended for new installations. Obtain the production installer from [the official download page](https://ip-murad.com/browser/download/).

## Report a vulnerability privately

Use GitHub's **Security → Report a vulnerability** when available, or email **IM_MURAD7@hotmail.com** with the subject `Sanad Browser security report`.

Include the app/Electron/Chromium versions, operating system, affected source path, reproducible steps, expected boundary and observed impact. Use a minimal local fixture. Do not include passwords, session cookies, private browsing records or third-party personal data in a public issue. There is no paid bounty or guaranteed response time.

## Security boundaries

- Remote pages must remain sandboxed, context-isolated and without Node integration, preloads or access to `sanadBrowser`.
- Privileged commands are accepted only from the exact local shell main frame. The shell uses a fixed custom protocol and a restrictive Content Security Policy.
- Production navigation requires HTTPS and rejects executable/local protocols and invalid certificates. Test-mode loopback HTTP is available only in unpackaged test runs.
- Camera/microphone, location and notifications require active-tab consent; unsupported permissions and device grants are denied.
- Downloads require an eligible active tab, approved URL chains and user selection. Executable downloads require confirmation; downloaded files are never launched automatically.
- Private cookies/storage are isolated from regular tabs and discarded when the private session ends. Private mode does not hide network traffic from the network operator.
- Microsoft Store manages Store application signatures and updates. Ordinary EXE release publishing requires verified, timestamped publisher signatures.

## Review requirements

Preserve these boundaries in pull requests. Do not disable TLS verification, sandboxing, origin checks, CSP, signature checks or dependency audits to make a test pass. Never commit tokens, API keys, private certificates, signing passwords, environment files or user profiles. Use repository secrets only in trusted release contexts; fork pull requests must not receive them.

Keep Electron/Chromium and other dependencies current. CI runs CodeQL, a full Git-history secret scan, dependency audits and desktop tests. Review findings before releasing. A successful scan or Store certification is not proof that the browser has no vulnerabilities, nor an independent penetration-test certification.

Fixed YouTube page code is registered using Electron's main-process Debugger transport; it must never open a debugging port, install page bindings, execute downloaded scriptlets, bypass TLS/CSP or expose privileged APIs. Its only page-visible control is a boolean opt-out for local hooks.
