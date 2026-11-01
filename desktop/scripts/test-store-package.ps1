param([Parameter(Mandatory=$true)][string]$PackagePath)
$ErrorActionPreference = 'Stop'
if ($env:GITHUB_ACTIONS -ne 'true' -or $env:RUNNER_OS -ne 'Windows') { throw 'This installation test is restricted to a disposable Windows GitHub Actions runner.' }
$work = Join-Path $env:RUNNER_TEMP ('sanad-msix-ci-' + [guid]::NewGuid().ToString('N'))
$proof = Join-Path $PSScriptRoot '../test-results/store'
New-Item -ItemType Directory -Force -Path $work, $proof | Out-Null
$sdkRoot = Join-Path ${env:ProgramFiles(x86)} 'Windows Kits/10/bin'
$sdk = Get-ChildItem -LiteralPath $sdkRoot -Directory | Sort-Object Name -Descending | Where-Object { Test-Path (Join-Path $_.FullName 'x64/makeappx.exe') } | Select-Object -First 1
if (-not $sdk) { throw 'Windows SDK packaging tools are required.' }
$makeappx = Join-Path $sdk.FullName 'x64/makeappx.exe'
$signtool = Join-Path $sdk.FullName 'x64/signtool.exe'
$certificate = $null; $installed = $null; $process = $null; $trustPath = $null
$originalResolution = $null; $displayChanged = $false
try {
  Add-Type -AssemblyName System.Windows.Forms
  $originalResolution = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
  if ($originalResolution.Width -lt 1700 -or $originalResolution.Height -lt 1000) {
    # Only the disposable CI desktop is resized. No display setting is part
    # of the shipped app, and the runner's original mode is restored below.
    & powershell.exe -NoProfile -NonInteractive -Command 'Set-DisplayResolution -Width 1920 -Height 1080 -Force'
    if ($LASTEXITCODE -ne 0) { throw 'Could not prepare the CI display for real Store screenshots.' }
    $displayChanged = $true
  }
  & $makeappx unpack /p ([System.IO.Path]::GetFullPath($PackagePath)) /d (Join-Path $work 'unpacked') /o
  if ($LASTEXITCODE -ne 0) { throw 'Windows SDK rejected the MSIX package.' }
  [xml]$manifest = Get-Content -LiteralPath (Join-Path $work 'unpacked/AppxManifest.xml') -Raw
  if ($manifest.Package.Identity.Name -ne 'SanadAlHaramain.CI' -or $manifest.Package.Identity.Publisher -ne 'CN=Sanad Store CI') { throw 'The installation test refuses non-CI identities.' }
  if ($manifest.Package.Applications.Application.Executable -ne 'app\Sanad Browser.exe') { throw 'Unexpected packaged application executable.' }
  $capabilities = @($manifest.Package.Capabilities.ChildNodes | ForEach-Object { $_.GetAttribute('Name') })
  if (@($capabilities | Where-Object { $_ -notin @('internetClient', 'runFullTrust') }).Count -gt 0) { throw 'Unexpected package capability.' }
  if (-not ($capabilities -contains 'runFullTrust')) { throw 'The desktop capability is missing.' }
  if ($manifest.OuterXml -match 'windows.startupTask|broadFileSystemAccess|allowElevation') { throw 'Unexpected startup or privileged package configuration.' }
  Copy-Item -LiteralPath (Join-Path $work 'unpacked/AppxManifest.xml') -Destination (Join-Path $proof 'AppxManifest.xml')
  $package = Get-Content -LiteralPath (Join-Path $PSScriptRoot '../package.json') -Raw | ConvertFrom-Json
  if ($manifest.Package.Identity.Version -ne "$($package.version).0") { throw 'The MSIX version must match the app with a zero Store revision.' }
  $signed = Join-Path $work 'CI-ONLY.msix'
  Copy-Item -LiteralPath $PackagePath -Destination $signed
  # Test certificate only. It is never a production publisher, never exported
  # with a private key, and never uploaded with a submission artifact.
  $certificate = New-SelfSignedCertificate -Type CodeSigningCert -Subject 'CN=Sanad Store CI' -CertStoreLocation 'Cert:\CurrentUser\My' -NotAfter (Get-Date).AddHours(2)
  & $signtool sign /fd SHA256 /sha1 $certificate.Thumbprint /s My $signed
  if ($LASTEXITCODE -ne 0) { throw 'Could not sign the isolated CI installation fixture.' }
  $publicCertificate = Join-Path $work 'CI-ONLY.cer'
  $null = Export-Certificate -Cert $certificate -FilePath $publicCertificate
  $trustPath = 'Cert:\LocalMachine\TrustedPeople\' + $certificate.Thumbprint
  $null = Import-Certificate -FilePath $publicCertificate -CertStoreLocation 'Cert:\LocalMachine\TrustedPeople'
  Add-AppxPackage -Path $signed
  $installed = Get-AppxPackage -Name 'SanadAlHaramain.CI'
  if (-not $installed) { throw 'The CI package was not registered.' }
  $exe = Join-Path $installed.InstallLocation 'app/Sanad Browser.exe'
  & node (Join-Path $PSScriptRoot 'verify-package.cjs') $exe
  if ($LASTEXITCODE -ne 0) { throw 'MSIX installed app failed fuse verification.' }
  Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
[ComImport, Guid("2e941141-7f97-4756-ba1d-9decde894a3d"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface ISanadActivationManager {
  [PreserveSig] int ActivateApplication([MarshalAs(UnmanagedType.LPWStr)] string id, [MarshalAs(UnmanagedType.LPWStr)] string args, uint options, out uint processId);
}
[ComImport, Guid("45BA127D-10A8-46EA-8AB7-56EA9078943C")]
class SanadActivationManager {}
public static class SanadPackageActivation {
  [StructLayout(LayoutKind.Sequential)]
  struct VisibleRectangle { public int Left, Top, Right, Bottom; }
  [DllImport("dwmapi.dll")]
  static extern int DwmGetWindowAttribute(IntPtr window, int attribute, out VisibleRectangle rectangle, int size);
  [DllImport("user32.dll", SetLastError=true)]
  static extern bool SetWindowPos(IntPtr window, IntPtr after, int x, int y, int width, int height, uint flags);
  [DllImport("user32.dll")]
  static extern bool SetForegroundWindow(IntPtr window);
  [DllImport("user32.dll")]
  static extern bool SetCursorPos(int x, int y);
  [DllImport("user32.dll")]
  static extern void mouse_event(uint flags, uint x, uint y, uint data, UIntPtr extra);
  public static void Click(int x, int y) {
    if (!SetCursorPos(x, y)) throw new InvalidOperationException("Could not position the CI pointer.");
    mouse_event(0x0002, 0, 0, 0, UIntPtr.Zero);
    mouse_event(0x0004, 0, 0, 0, UIntPtr.Zero);
  }
  public static int[] VisibleBounds(IntPtr window) {
    VisibleRectangle rectangle;
    Marshal.ThrowExceptionForHR(DwmGetWindowAttribute(window, 9, out rectangle, Marshal.SizeOf<VisibleRectangle>()));
    return new int[] { rectangle.Left, rectangle.Top, rectangle.Right - rectangle.Left, rectangle.Bottom - rectangle.Top };
  }
  public static void PrepareScreenshotWindow(IntPtr window) {
    if (!SetWindowPos(window, IntPtr.Zero, 20, 20, 1616, 908, 0x0040))
      throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error());
    SetForegroundWindow(window);
  }
  public static uint Start(string id) {
    var manager = (ISanadActivationManager)new SanadActivationManager();
    uint processId;
    Marshal.ThrowExceptionForHR(manager.ActivateApplication(id, "--force-renderer-accessibility=complete", 0, out processId));
    return processId;
  }
}
'@
  $activatedId = [SanadPackageActivation]::Start("$($installed.PackageFamilyName)!SanadBrowser")
  $until = (Get-Date).AddSeconds(45)
  do {
    Start-Sleep -Milliseconds 300
    $candidate = Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'Sanad Browser.exe' -and $_.ExecutablePath -eq $exe -and $_.CommandLine -notmatch '--type=' } | Select-Object -First 1
    if ($candidate) { $process = Get-Process -Id $candidate.ProcessId; $process.Refresh() }
  } while ((-not $process -or $process.MainWindowHandle -eq [IntPtr]::Zero) -and (Get-Date) -lt $until)
  if (-not $process -or $process.MainWindowHandle -eq [IntPtr]::Zero) { throw 'The installed MSIX application did not create a window.' }
  Add-Type -AssemblyName UIAutomationClient
  Add-Type -AssemblyName UIAutomationTypes
  Add-Type -AssemblyName System.Drawing
  Add-Type -AssemblyName System.Windows.Forms
  [SanadPackageActivation]::PrepareScreenshotWindow($process.MainWindowHandle)
  $root = [System.Windows.Automation.AutomationElement]::FromHandle($process.MainWindowHandle)
  function Find-Control([string]$Name, [switch]$Button) {
    $condition = [System.Windows.Automation.PropertyCondition]::new([System.Windows.Automation.AutomationElement]::NameProperty, $Name)
    if ($Button) {
      $buttonType = [System.Windows.Automation.PropertyCondition]::new([System.Windows.Automation.AutomationElement]::ControlTypeProperty, [System.Windows.Automation.ControlType]::Button)
      $condition = [System.Windows.Automation.AndCondition]::new($condition, $buttonType)
    }
    $deadline = (Get-Date).AddSeconds(20)
    do {
      $element = $root.FindFirst([System.Windows.Automation.TreeScope]::Descendants, $condition)
      if ($element) { return $element }
      Start-Sleep -Milliseconds 250
    } while ((Get-Date) -lt $deadline)
    throw "MSIX UI control missing: $Name"
  }
  function Click-Control([string]$Name) {
    Write-Output "Click installed app button: $Name"
    $button = Find-Control $Name -Button
    # Chromium does not expose InvokePattern for every dialog control.
    # Click the actual accessibility-provided point instead of synthesizing
    # app state or assuming screen coordinates.
    $scrollItem = $null
    if ($button.TryGetCurrentPattern([System.Windows.Automation.ScrollItemPattern]::Pattern, [ref]$scrollItem)) { $scrollItem.ScrollIntoView() }
    try {
      $point = $button.GetClickablePoint()
      [SanadPackageActivation]::Click([int]$point.X, [int]$point.Y)
    } catch {
      $invoke = $null
      if ($button.TryGetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern, [ref]$invoke)) { $invoke.Invoke() }
      else { throw }
    }
    Start-Sleep -Milliseconds 250
  }
  function Save-StoreScreenshot([string]$Name) {
    Start-Sleep -Milliseconds 600
    $rect = [SanadPackageActivation]::VisibleBounds($process.MainWindowHandle)
    $windowRect = [System.Drawing.Rectangle]::new($rect[0],$rect[1],$rect[2],$rect[3])
    $capture = [System.Drawing.Rectangle]::Intersect($windowRect, [System.Windows.Forms.SystemInformation]::VirtualScreen)
    if ($capture.Width -lt 1366 -or $capture.Height -lt 768 -or $capture -ne $windowRect) { throw 'Store screenshots must contain the complete real app window at the required resolution.' }
    $bitmap = [System.Drawing.Bitmap]::new($capture.Width, $capture.Height)
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    try { $graphics.CopyFromScreen($capture.X,$capture.Y,0,0,$bitmap.Size); $bitmap.Save((Join-Path $proof $Name),[System.Drawing.Imaging.ImageFormat]::Png) }
    finally { $graphics.Dispose(); $bitmap.Dispose() }
  }
  Click-Control 'أدوات المتصفح'
  Click-Control 'حول Sanad'
  $null = Find-Control ("الإصدار $($package.version) · Microsoft Store")
  $null = Find-Control 'تُدار التحديثات بواسطة Microsoft Store'
  $null = Find-Control 'فتح تحديثات Microsoft Store'
  $null = Find-Control 'يتولى Microsoft Store تثبيت تحديثات هذه النسخة وفق إعدادات المتجر.'
  $renderers = @(Get-CimInstance Win32_Process | Where-Object { $_.ParentProcessId -eq $process.Id -and $_.CommandLine -match '--type=renderer' })
  if ($renderers.Count -eq 0 -or ($renderers | Where-Object { $_.CommandLine -match '--no-sandbox|--disable-web-security' })) { throw 'Packaged renderer security was not preserved.' }
  Save-StoreScreenshot 'installed-msix.png'
  Save-StoreScreenshot 'store-about.png'
  Click-Control 'إغلاق'
  Click-Control 'حماية الخصوصية'
  $null = Find-Control 'حجب متتبعات وإعلانات من القوائم'
  Save-StoreScreenshot 'store-privacy.png'
  Click-Control 'إغلاق'
  Click-Control 'أدوات المتصفح'
  $null = Find-Control 'حفظ الصفحة PDF'
  Save-StoreScreenshot 'store-tools.png'
  Click-Control 'إغلاق'
  Save-StoreScreenshot 'store-home.png'
  [ordered]@{version=$package.version; packaging='MSIX'; installed=$true; launched=$true; windowsStoreDetected=$true; storeManagedUpdates=$true; rendererSandboxVerified=$true; fuseVerification=$true; signingPurpose='temporary-ci-test-only'; microsoftStoreSigned=$false; submissionReady=$false} | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $proof 'installed-msix.json') -Encoding utf8
  # Get-Process by PID does not retain an OS handle until requested. Keep it
  # open before closing so .NET can read the real exit code after termination.
  $null = $process.Handle
  $closed = $process.CloseMainWindow()
  $exited = $process.WaitForExit(15000)
  [ordered]@{ closeRequested=$closed; exited=$exited; exitCode=$process.ExitCode } | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $proof 'exit-status.json') -Encoding utf8
  if (-not $exited -or $process.ExitCode -ne 0) { throw "MSIX application did not exit cleanly (exited=$exited, code=$($process.ExitCode))." }
  Write-Output 'MSIX package installation, launch, Store detection, update routing and sandbox verification passed.'
} finally {
  if ($process -and -not $process.HasExited) { $process.Kill(); $process.WaitForExit(5000) | Out-Null }
  try { if ($installed) { Remove-AppxPackage -Package $installed.PackageFullName } }
  finally {
    if ($trustPath -and (Test-Path -LiteralPath $trustPath)) { Remove-Item -LiteralPath $trustPath -Force }
    if ($certificate) { Remove-Item -LiteralPath ('Cert:\CurrentUser\My\' + $certificate.Thumbprint) -Force }
    if ($displayChanged -and $originalResolution) {
      & powershell.exe -NoProfile -NonInteractive -Command "Set-DisplayResolution -Width $($originalResolution.Width) -Height $($originalResolution.Height) -Force"
      if ($LASTEXITCODE -ne 0) { Write-Warning 'The disposable runner could not restore its original display mode.' }
    }
    Remove-Item -LiteralPath $work -Recurse -Force
  }
}

