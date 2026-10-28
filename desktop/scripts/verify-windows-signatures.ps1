param(
  [Parameter(Mandatory=$true)][string[]]$Paths,
  [Parameter(Mandatory=$true)][AllowEmptyString()][string]$ExpectedThumbprint,
  [string]$ReportPath
)
$ErrorActionPreference = 'Stop'
$expected = ($ExpectedThumbprint -replace '\s', '').ToUpperInvariant()
if ($expected -notmatch '^[A-F0-9]{40}$') { throw 'A pinned publisher certificate thumbprint is required.' }
if ($Paths.Count -eq 0) { throw 'No files were supplied for signature verification.' }
$records = @()
foreach ($path in $Paths) {
  if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { throw "Signed file is missing: $path" }
  $signature = Get-AuthenticodeSignature -LiteralPath $path
  if ($signature.Status.ToString() -ne 'Valid') { throw "Untrusted or missing Authenticode signature: $path ($($signature.Status))" }
  $certificate = $signature.SignerCertificate
  if (-not $certificate -or $certificate.Thumbprint.ToUpperInvariant() -ne $expected) { throw "Unexpected publisher certificate: $path" }
  $codeSigning = $false
  foreach ($extension in $certificate.Extensions) {
    if ($extension -is [System.Security.Cryptography.X509Certificates.X509EnhancedKeyUsageExtension]) {
      foreach ($oid in $extension.EnhancedKeyUsages) {
        if ($oid.Value -eq '1.3.6.1.5.5.7.3.3') { $codeSigning = $true }
      }
    }
  }
  if (-not $codeSigning) { throw "Certificate is not approved for code signing: $path" }
  if (-not $signature.TimeStamperCertificate) { throw "A trusted signing timestamp is required: $path" }
  $records += [ordered]@{
    file = [System.IO.Path]::GetFileName($path)
    bytes = (Get-Item -LiteralPath $path).Length
    sha256 = (Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash.ToLowerInvariant()
    status = 'Valid'
    signerThumbprint = $certificate.Thumbprint.ToUpperInvariant()
    publisher = $certificate.Subject
    timestamped = $true
  }
}
$report = [ordered]@{ schema=1; trustedPublisherVerified=$true; files=@($records) }
if ($ReportPath) {
  $parent = Split-Path -Parent $ReportPath
  if ($parent) { New-Item -ItemType Directory -Force -Path $parent | Out-Null }
  $report | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $ReportPath -Encoding utf8
}
$report
