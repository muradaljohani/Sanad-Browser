$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$source = [System.Drawing.Image]::FromFile((Join-Path $PSScriptRoot '../assets/mark.png'))
$destination = Join-Path $PSScriptRoot '../assets/appx'
New-Item -ItemType Directory -Force -Path $destination | Out-Null
try {
  foreach ($asset in @(@('StoreLogo.png',50,50), @('Square44x44Logo.png',44,44), @('Square150x150Logo.png',150,150), @('Wide310x150Logo.png',310,150))) {
    $bitmap = [System.Drawing.Bitmap]::new([int]$asset[1], [int]$asset[2])
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    try {
      $graphics.Clear([System.Drawing.ColorTranslator]::FromHtml('#071a16'))
      $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
      $size = [int]([Math]::Min([int]$asset[1], [int]$asset[2]) * 0.84)
      $ratio = [Math]::Min($size / $source.Width, $size / $source.Height)
      $width = [int]($source.Width * $ratio); $height = [int]($source.Height * $ratio)
      $graphics.DrawImage($source, [int](([int]$asset[1] - $width)/2), [int](([int]$asset[2] - $height)/2), $width, $height)
      $bitmap.Save((Join-Path $destination $asset[0]), [System.Drawing.Imaging.ImageFormat]::Png)
    } finally { $graphics.Dispose(); $bitmap.Dispose() }
  }
} finally { $source.Dispose() }
