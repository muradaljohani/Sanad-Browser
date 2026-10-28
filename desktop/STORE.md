# Microsoft Store distribution

The Store channel uses an MSIX package, not the EXE URL submission route. Microsoft signs MSIX/AppX packages after certification; this does not retroactively sign the existing NSIS/Portable downloads. Store admission, identity verification and the developer agreement are separate owner actions. A generated unsigned submission archive is not a Microsoft-signed public installer.

## Account and exact identity

Start the free onboarding flow at https://storedeveloper.microsoft.com/. Complete the owner's identity verification directly with Microsoft and reserve the application name in Partner Center. Do not send ID photographs, selfies, credentials or one-time codes to a chat or repository.

From the reserved application's Product identity page, copy these non-secret values into repository variables:

| Variable | Partner Center field |
| --- | --- |
| `SANAD_STORE_IDENTITY_NAME` | Package/Identity/Name |
| `SANAD_STORE_PUBLISHER` | Package/Identity/Publisher (the exact CN value) |
| `SANAD_STORE_PUBLISHER_DISPLAY_NAME` | Package/Properties/PublisherDisplayName |
| `SANAD_STORE_DISPLAY_NAME` | The reserved display name for this application |

`npm run dist:store` refuses missing/placeholder identities. Run `scripts/prepare-store-assets.ps1` before packaging on Windows. It creates the required tile sizes from the application's existing Sanad icon. The pinned electron-builder 26.17.0 AppX target invokes Windows MakeAppx and produces the modern `.msix` container with the supplied manifest; no builder/toolchain major upgrade is required.

The Store package keeps the existing renderer sandbox, context isolation, disabled remote Node integration and Electron/ASAR hardening fuses. Only `internetClient` and the desktop `runFullTrust` capability are requested. There is no startup task, elevation capability or broad filesystem capability. MSIX package integrity enforcement is enabled. Full trust is needed for a normal Electron desktop browser and must be justified in Partner Center's restricted-capability notes.

## Build and validation

`.github/workflows/store.yml` always builds and installs a separate CI-only identity on a disposable Windows runner, then checks actual launch, the MSIX runtime identity, Store-managed update UI, renderer switches, hardening fuses and clean exit. A short-lived test certificate is temporarily trusted in that runner's Trusted People store only and removed with the package afterward. It is never a public publisher identity, never placed in Trusted Root, never exported with its private key and never included in the submission artifact. The test script refuses to run outside Windows GitHub Actions.

The actual `windows-store-submission` artifact is generated only on trusted main-branch runs with every real Partner Center identity variable. It contains the unsigned `.msix`, a `.msixupload` archive and SHA-256 checksums. No signing credential or Microsoft submission API credential is needed to build it. The Store handles final signing after acceptance.

`windows-store-proof` is test evidence, not a distributable package or a signing certificate. With no reserved identity, CI may pass, but no actual submission artifact is produced.

## Runtime updates

Electron's `process.windowsStore` detects MSIX/AppX identity. These installations show that Microsoft Store manages updates, do not query the standalone EXE release feed, and open the fixed Store updates page on an explicit user click. Direct installations retain their existing manual update flow. Installation/user data is managed through Windows' package context; user downloads still remain where the user saves them.

## Submission materials and remaining owner steps

Draft Arabic/English descriptions and certification notes are in `store-listing.md`. Use actual screenshots from the application and accurate capability/privacy information. Confirm the public browser privacy page and contact details before submitting. Complete age/content ratings truthfully for a general web browser and identify the current Chromium engine. The desktop browser does not support Xbox; list PC/x64 only.

Upload the actual identity-bound `.msixupload` to the reserved product in Partner Center. Review the final name, screenshots, price (free), capabilities and privacy disclosures before submitting for certification. Never upload the CI identity or substitute a guessed publisher. Final account agreements and identity documents are handled by the owner. Microsoft acceptance and publication are not guaranteed by passing CI.

After the Store listing is live, obtain its real Product ID and replace the website's primary download action with the verified Store link. Do not invent a listing URL or describe the old unsigned EXE as Store-signed.

References:

- https://learn.microsoft.com/windows/apps/package-and-deploy/code-signing-options
- https://learn.microsoft.com/windows/apps/publish/view-app-identity-details
- https://learn.microsoft.com/windows/apps/publish/store-policies
- https://www.electron.build/v26/docs/appx/
