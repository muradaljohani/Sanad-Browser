$ErrorActionPreference = 'Stop'
$package = Get-Content -LiteralPath (Join-Path $PSScriptRoot '../package.json') -Raw | ConvertFrom-Json
$output = Join-Path $PSScriptRoot '../test-results'
New-Item -ItemType Directory -Force -Path $output | Out-Null
$installer = Get-ChildItem -Path (Join-Path $PSScriptRoot '../dist/*-x64-Setup.exe') | Select-Object -First 1
if (-not $installer) { throw 'Windows Setup installer is missing.' }
$installPath = Join-Path $env:RUNNER_TEMP ('sanad-install-' + [guid]::NewGuid().ToString('N'))
$install = Start-Process -FilePath $installer.FullName -ArgumentList @('/S', ('/D=' + $installPath)) -Wait -PassThru
if ($install.ExitCode -ne 0) { throw "Installer failed with exit code $($install.ExitCode)." }
$executable = Join-Path $installPath 'Sanad Browser.exe'
if (-not (Test-Path -LiteralPath $executable)) { throw 'Installer did not create the executable.' }
& node (Join-Path $PSScriptRoot 'verify-package.cjs') $executable
if ($LASTEXITCODE -ne 0) { throw 'Installed executable failed fuse verification.' }
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName System.Windows.Forms
function Save-WindowProof($Root) {
  $rect = $Root.Current.BoundingRectangle
  $windowRect = [System.Drawing.Rectangle]::new([int]$rect.X, [int]$rect.Y, [int]$rect.Width, [int]$rect.Height)
  $captureRect = [System.Drawing.Rectangle]::Intersect($windowRect, [System.Windows.Forms.SystemInformation]::VirtualScreen)
  if ($captureRect.Width -lt 1 -or $captureRect.Height -lt 1) { throw 'Installed browser window is outside the display.' }
  $bitmap = [System.Drawing.Bitmap]::new($captureRect.Width, $captureRect.Height)
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  try { $graphics.CopyFromScreen($captureRect.X, $captureRect.Y, 0, 0, $bitmap.Size); $bitmap.Save((Join-Path $output 'installed-windows.png'), [System.Drawing.Imaging.ImageFormat]::Png) }
  finally { $graphics.Dispose(); $bitmap.Dispose() }
}
$process = $null
try {
  $process = Start-Process -FilePath $executable -ArgumentList '--force-renderer-accessibility=complete' -PassThru
  $deadline = (Get-Date).AddSeconds(35)
  do {
    Start-Sleep -Milliseconds 300
    $process.Refresh()
    if ($process.HasExited) { throw "Installed browser exited unexpectedly: $($process.ExitCode)." }
  } while ($process.MainWindowHandle -eq [IntPtr]::Zero -and (Get-Date) -lt $deadline)
  if ($process.MainWindowHandle -eq [IntPtr]::Zero) { throw 'Installed browser did not create a window.' }
  $root = [System.Windows.Automation.AutomationElement]::FromHandle($process.MainWindowHandle)
  function Find-Control([string]$Name) {
    $condition = [System.Windows.Automation.PropertyCondition]::new([System.Windows.Automation.AutomationElement]::NameProperty, $Name)
    $until = (Get-Date).AddSeconds(20)
    do {
      $element = $root.FindFirst([System.Windows.Automation.TreeScope]::Descendants, $condition)
      if ($element) { return $element }
      Start-Sleep -Milliseconds 250
    } while ((Get-Date) -lt $until)
    $all = $root.FindAll([System.Windows.Automation.TreeScope]::Descendants, [System.Windows.Automation.Condition]::TrueCondition)
    $names = foreach ($entry in $all) { if ($entry.Current.Name) { $entry.Current.Name } }
    $names | Select-Object -First 250 | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $output 'installed-accessibility.json') -Encoding utf8
    Save-WindowProof $root
    throw "Installed UI control missing: $Name"
  }
  $menu = Find-Control 'أدوات المتصفح'
  $menu.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern).Invoke()
  $about = Find-Control 'حول Sanad'
  $about.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern).Invoke()
  $null = Find-Control ("الإصدار $($package.version) · نسخة تجريبية")
  $null = Find-Control $package.devDependencies.electron
  $null = Find-Control 'السجل والمفضلة والإعدادات مشفّرة على هذا الجهاز، والمفتاح محمي بخزنة النظام.'
  Save-WindowProof $root
  $renderers = @(Get-CimInstance Win32_Process | Where-Object { $_.ParentProcessId -eq $process.Id -and $_.CommandLine -match '--type=renderer' })
  if ($renderers.Count -eq 0) { throw 'No renderer process was found.' }
  if ($renderers | Where-Object { $_.CommandLine -match '--no-sandbox|--disable-web-security' }) { throw 'Installed renderer disabled the sandbox or web security.' }
  $signature = (Get-AuthenticodeSignature -LiteralPath $installer.FullName).Status.ToString()
  $trustedPublisherVerified = $false
  if ($env:WIN_SIGNING_CERT_SHA1) {
    $uninstaller = Join-Path $installPath 'Uninstall Sanad Browser.exe'
    $null = & (Join-Path $PSScriptRoot 'verify-windows-signatures.ps1') -Paths @($installer.FullName, $executable, $uninstaller) -ExpectedThumbprint $env:WIN_SIGNING_CERT_SHA1 -ReportPath (Join-Path $output 'installed-signatures.json')
    $trustedPublisherVerified = $true
  }
  $report = [ordered]@{ version=$package.version; electron=$package.devDependencies.electron; installed=$true; windowOpened=$true; aboutVerified=$true; localEncryption='AES-256-GCM with OS-protected key'; rendererSandboxSwitchesChecked=$true; fuseVerification=$true; signature=$signature; trustedPublisherVerified=$trustedPublisherVerified; signerThumbprint=$env:WIN_SIGNING_CERT_SHA1; setupSha256=(Get-FileHash -LiteralPath $installer.FullName -Algorithm SHA256).Hash.ToLowerInvariant(); exeSha256=(Get-FileHash -LiteralPath $executable -Algorithm SHA256).Hash.ToLowerInvariant() }
  $report | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $output 'installed-windows.json') -Encoding utf8
  $process.CloseMainWindow() | Out-Null
  if (-not $process.WaitForExit(15000)) { throw 'Installed browser did not exit cleanly.' }
  if ($process.ExitCode -ne 0) { throw "Installed browser exit code: $($process.ExitCode)" }
  foreach ($flag in @('--no-sandbox', '--remote-debugging-port=0')) {
    $unsafe = Start-Process -FilePath $executable -ArgumentList $flag -PassThru
    if (-not $unsafe.WaitForExit(12000)) { $unsafe.Kill(); throw "Unsafe startup flag was accepted: $flag" }
    if ($unsafe.ExitCode -eq 0) { throw "Unsafe startup was not rejected: $flag" }
  }
  Write-Output 'Actual Windows installer, installed UI, engine version, fuse configuration, renderer security, clean exit and unsafe flag rejection passed.'
} finally { if ($process -and -not $process.HasExited) { $process.Kill() } }
