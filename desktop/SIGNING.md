# Trusted Windows publisher signing

Windows release publication requires a publicly trusted Authenticode identity. A self-signed certificate, an HTTPS certificate, a GitHub commit signature, an artifact attestation or a file checksum does not satisfy this requirement.

## Obtain the publisher identity

Use an accredited code-signing CA/service that supports the publisher's country and legal status, and complete its identity verification. The certificate's publisher is the validated legal person/entity; writing a brand name in package.json cannot create that identity. Most current public code-signing certificates keep private keys on a hardware token or cloud HSM. Microsoft Artifact Signing has geographic onboarding restrictions; check the official eligibility requirements before paying for a service.

Do not send private keys, certificate passwords, API tokens or identity documents in chat or commit them. Enter credentials only through the signing provider and the repository's secure secret settings. Provider account creation, paid orders and legal identity verification remain outstanding until the owner supplies/selects a supported signing identity.

## Repository setup

- Set repository variable `WIN_SIGNING_CERT_SHA1` to the approved certificate's 40 hexadecimal character thumbprint. This public certificate identifier pins the publisher; executable signatures use SHA-256, not SHA-1.
- The existing certificate-file integration uses secrets `WIN_CSC_LINK` and `WIN_CSC_KEY_PASSWORD` only in the Windows packaging step on trusted main-branch push/manual runs. Never use a self-signed certificate here. A non-exportable hardware/cloud key needs its provider-specific signing integration instead; do not export it or assume a PFX password can replace that integration.
- Secrets are not passed to pull-request builds, Linux builds or signature tests. A configured certificate without the approved publisher thumbprint fails packaging.
- Packaging with the configured identity requires `forceCodeSigning`. The generated Setup, Portable and unpacked app must have valid Windows trust, the exact approved certificate, the code-signing EKU and a timestamp before installation testing.
- The installed program and NSIS uninstaller are checked against the same identity. Proof records the actual file hashes and certificate thumbprint.
- Release publication runs on Windows and independently rechecks both distributable signatures and matching installation proof. Missing publisher configuration blocks publication while unsigned CI test artifacts can still be generated for tests. CI artifacts are not signed releases.

The timestamp and trust status are checked with Windows `Get-AuthenticodeSignature`. No custom certificate is added to a trusted root or trusted publisher store. Signing does not certify that software has no vulnerabilities or promise that SmartScreen will never show a warning.

## First signed version

The already published 1.3.0 preview remains unsigned. Do not relabel its metadata as signed, overwrite its immutable files, or change only the displayed signature status. After a real signing identity is configured, build a new version (for example 1.3.1), pass the native and signature gates, upload its new immutable bytes to the download store, then update the website's pinned hashes, sizes, version and actual signature state together. The public download can continue to use ip-murad.com; visitors do not need GitHub accounts.

## Policy validation

`scripts/test-signature-policy.ps1` tests real unsigned and untrusted self-signed fixtures, a valid timestamped Microsoft-signed runner binary, the wrong approved thumbprint and a tampered copy. The Microsoft fixture exercises the verifier; it is not the Sanad publisher certificate and never signs the application.

Official references:

- https://learn.microsoft.com/windows/apps/package-and-deploy/code-signing-options
- https://learn.microsoft.com/azure/artifact-signing/quickstart
- https://www.electron.build/v26/docs/win/
- https://www.ssl.com/products/software-integrity/code-signing/
