# Desktop security review — 28 October 2026

Scope: the desktop application and its build/signing/test workflows, imported as an independent public repository and updated from 1.3.1 to the 1.3.2 security candidate. The production website, account infrastructure, search backend, historical web prototypes, and their private Git history are outside this public repository.

The source review traced navigation and popup creation, local custom protocols and CSP, preload/IPC sender checks, permission requests, download origin/filename/executable controls, reader and export operations, private-session cleanup, update-feed validation, filter-list parsing, Electron fuses, and release-signature gates.

Observed validation:

- `npm test`: 35 tests passed, including URL/protocol policy, exact shell IPC authorization, private authentication-history exclusions, safe download names/chains, filter integrity, Store update behavior, malformed-address timing and bounded file reading during replacement/growth.
- `npm audit --json`: zero known advisories across the locked production and development dependency graph (304 reported dependencies). This is a time-specific registry result, not proof of safety.
- `node --check main.cjs` and `node --check ui/renderer.js`: passed.
- The public source selection excludes environment credentials, private signing material, browser profiles, arbitrary-URL server proxies and private historical source.

CI additionally runs actual Chromium interaction tests, Windows installation and MSIX fixture checks, CodeQL, a redacted Gitleaks scan of all fetched Git history, and dependency audits. Consult the Actions results for the exact revision being assessed; a workflow definition by itself is not evidence that a run succeeded.

CodeQL's first run reported five alerts. A local subprocess confirmed exponential backtracking on a 101-character malformed dotted address; the initial implementation exceeded a one-second timeout. The host-label matcher now uses disjoint dot-separated labels, with regression controls for Unicode hosts, trailing-dot DNS and ports/paths.

Three alerts concerned path-based metadata checks followed by a separate read. A controlled replacement caused the old profile reader to accept over 2 MB despite its size gate. All three JSON/filter callers now open once, inspect that descriptor and bound the bytes actually read, including file growth. Recovery behavior and the original byte limits are preserved. A shared helper is explicitly included in packaged applications.

The remaining alert concerned generated JavaScript in a test-only click helper whose callers supplied fixed IDs; no production injection path was established. The helper now uses a constant script and selects returned point data without generating source from an ID.

The same release also includes session-bounded cosmetic caching and a scoped, isolated YouTube guard; see [Brave research and performance limits](../desktop/BRAVE-RESEARCH.md).

The production Store installation remains 1.3.1 until a new 1.3.2 package is submitted, certified and published. A GitHub merge alone does not update installed applications. Review coverage does not include a fuzzing campaign, an independent penetration test, every upstream Chromium/Electron code path, compromised operating systems, or future dependency vulnerabilities. The project does not claim zero vulnerabilities or guaranteed blocking of every YouTube advertisement.

References: [Electron security checklist](https://www.electronjs.org/docs/latest/tutorial/security), [Chromium security architecture](https://www.chromium.org/Home/chromium-security/security-architecture/), and [GitHub repository security](https://docs.github.com/en/code-security/getting-started/quickstart-for-securing-your-repository).
