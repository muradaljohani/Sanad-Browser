# Desktop security review — 28 October 2026

Scope: the 1.3.1 desktop application and its build/signing/test workflows, imported as an independent public repository. The production website, account infrastructure, search backend, historical web prototypes, and their private Git history are outside this public repository.

The source review traced navigation and popup creation, local custom protocols and CSP, preload/IPC sender checks, permission requests, download origin/filename/executable controls, reader and export operations, private-session cleanup, update-feed validation, filter-list parsing, Electron fuses, and release-signature gates.

Observed baseline validation:

- `npm test`: 25 tests passed, including URL/protocol policy, exact shell IPC authorization, private authentication-history exclusions, safe download names/chains, filter integrity and Store update behavior.
- `npm audit --json`: zero known advisories across the locked production and development dependency graph (304 reported dependencies). This is a time-specific registry result, not proof of safety.
- `node --check main.cjs` and `node --check ui/renderer.js`: passed.
- The public source selection excludes environment credentials, private signing material, browser profiles, arbitrary-URL server proxies and private historical source.

CI additionally runs actual Chromium interaction tests, Windows installation and MSIX fixture checks, CodeQL, a redacted Gitleaks scan of all fetched Git history, and dependency audits. Consult the Actions results for the exact revision being assessed; a workflow definition by itself is not evidence that a run succeeded.

No new exploitable vulnerability was established in the desktop paths reviewed. Review coverage does not include a fuzzing campaign, an independent penetration test, every upstream Chromium/Electron code path, compromised operating systems, or future dependency vulnerabilities. The project does not claim zero vulnerabilities or guaranteed blocking of every YouTube advertisement.

References: [Electron security checklist](https://www.electronjs.org/docs/latest/tutorial/security), [Chromium security architecture](https://www.chromium.org/Home/chromium-security/security-architecture/), and [GitHub repository security](https://docs.github.com/en/code-security/getting-started/quickstart-for-securing-your-repository).
