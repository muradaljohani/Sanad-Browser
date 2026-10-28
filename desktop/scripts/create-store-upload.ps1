$ErrorActionPreference = 'Stop'
$out = Join-Path $PSScriptRoot '../dist-store'
$packages = @(Get-ChildItem -LiteralPath $out -Filter '*-Store.msix')
if ($packages.Count -ne 1) { throw 'Exactly one submission MSIX must be built with the reserved Partner Center identity.' }
$package = $packages[0]
$target = Join-Path $out ($package.BaseName + '.msixupload')
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
$archive = [System.IO.Compression.ZipFile]::Open($target, [System.IO.Compression.ZipArchiveMode]::Create)
try { $null = [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($archive,$package.FullName,$package.Name,[System.IO.Compression.CompressionLevel]::Optimal) }
finally { $archive.Dispose() }
$check = [System.IO.Compression.ZipFile]::OpenRead($target)
try { if ($check.Entries.Count -ne 1 -or $check.Entries[0].FullName -ne $package.Name) { throw 'Invalid Store upload archive.' } }
finally { $check.Dispose() }
Get-FileHash -LiteralPath $package.FullName,$target -Algorithm SHA256 | ForEach-Object { "$($_.Hash.ToLowerInvariant()) *$([System.IO.Path]::GetFileName($_.Path))" } | Set-Content -LiteralPath (Join-Path $out 'SHA256-store.txt') -Encoding utf8
