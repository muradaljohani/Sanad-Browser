$ErrorActionPreference = 'Stop'
$verify = Join-Path $PSScriptRoot 'verify-windows-signatures.ps1'
$work = Join-Path $env:RUNNER_TEMP ('sanad-signature-test-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $work | Out-Null
$certificate = $null
function Expect-Rejected([scriptblock]$Action, [string]$Reason) {
  $rejected = $false
  try { $null = & $Action } catch { $rejected = $true }
  if (-not $rejected) { throw "Signature policy accepted $Reason" }
  Write-Output "Rejected $Reason"
}
try {
  $fixture = Join-Path $work 'unsigned.ps1'
  'Write-Output "Signature policy fixture; never executed"' | Set-Content -LiteralPath $fixture
  Expect-Rejected { & $verify -Paths @($fixture) -ExpectedThumbprint '' } 'a missing approved publisher'
  Expect-Rejected { & $verify -Paths @($fixture) -ExpectedThumbprint ('0' * 40) } 'an unsigned file'
  $certificate = New-SelfSignedCertificate -Type CodeSigningCert -Subject 'CN=Sanad CI untrusted fixture' -CertStoreLocation 'Cert:\CurrentUser\My'
  $null = Set-AuthenticodeSignature -FilePath $fixture -Certificate $certificate -HashAlgorithm SHA256
  if ((Get-AuthenticodeSignature -LiteralPath $fixture).Status.ToString() -eq 'Valid') { throw 'Test certificate unexpectedly has public trust.' }
  Expect-Rejected { & $verify -Paths @($fixture) -ExpectedThumbprint $certificate.Thumbprint } 'an untrusted self-signed certificate'
  # Use the runner's existing signed Microsoft binary only as a verification
  # fixture. No certificate is installed into Trusted Root or Trusted Publishers.
  $signed = Join-Path $PSHOME 'pwsh.exe'
  $signature = Get-AuthenticodeSignature -LiteralPath $signed
  if ($signature.Status.ToString() -ne 'Valid' -or -not $signature.TimeStamperCertificate) { throw 'Runner PowerShell must have a valid timestamped Microsoft signature for the positive fixture.' }
  $report = & $verify -Paths @($signed) -ExpectedThumbprint $signature.SignerCertificate.Thumbprint
  if (-not $report.trustedPublisherVerified) { throw 'Valid signed fixture was rejected.' }
  Expect-Rejected { & $verify -Paths @($signed) -ExpectedThumbprint ('0' * 40) } 'a trusted file signed by the wrong publisher'
  $tampered = Join-Path $work 'tampered.exe'
  $bytes = [System.IO.File]::ReadAllBytes($signed)
  $bytes[1024] = $bytes[1024] -bxor 1
  [System.IO.File]::WriteAllBytes($tampered, $bytes)
  Expect-Rejected { & $verify -Paths @($tampered) -ExpectedThumbprint $signature.SignerCertificate.Thumbprint } 'a modified signed executable'
  Write-Output 'Signature policy tests passed; production publisher signing is a separate requirement.'
} finally {
  if ($certificate) { Remove-Item -LiteralPath ('Cert:\CurrentUser\My\' + $certificate.Thumbprint) -Force }
  Remove-Item -LiteralPath $work -Recurse -Force
}
