param([switch]$SkipBuild)

$ErrorActionPreference = 'Stop'

$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$distDirectory = Join-Path $projectRoot 'dist'
$stagingDirectory = Join-Path $projectRoot '.scorm-staging'
$artifactDirectory = Join-Path $projectRoot 'artifacts'
$zipPath = Join-Path $artifactDirectory 'regulatory-pre-appointment-readiness-scorm-1.2.zip'
$utf8NoBom = [Text.UTF8Encoding]::new($false, $true)

function Get-PackageRelativePath([string]$basePath, [string]$targetPath) {
  $baseUri = [Uri]::new(($basePath.TrimEnd('\') + '\'))
  $targetUri = [Uri]::new($targetPath)
  return [Uri]::UnescapeDataString($baseUri.MakeRelativeUri($targetUri).ToString())
}

if (-not $SkipBuild) {
  & npm.cmd run build
  if ($LASTEXITCODE -ne 0) { throw 'Astro production build failed.' }
}

$resolvedStagingParent = [IO.Path]::GetFullPath((Split-Path $stagingDirectory -Parent))
if ($resolvedStagingParent -ne $projectRoot) { throw 'SCORM staging directory is outside the project root.' }
if (Test-Path -LiteralPath $stagingDirectory) { Remove-Item -LiteralPath $stagingDirectory -Recurse -Force }
New-Item -ItemType Directory -Path $stagingDirectory | Out-Null
Copy-Item -Path (Join-Path $distDirectory '*') -Destination $stagingDirectory -Recurse -Force

Get-ChildItem -LiteralPath $stagingDirectory -Filter '*.html' -Recurse | ForEach-Object {
  $relativePath = Get-PackageRelativePath $stagingDirectory $_.FullName
  $depth = ($relativePath -split '/').Count - 1
  $prefix = if ($depth -eq 0) { './' } else { '../' * $depth }
  $content = [IO.File]::ReadAllText($_.FullName, $utf8NoBom)
  $content = [regex]::Replace($content, '(?<attribute>(?:href|src|data-lightbox-src)=[''\"])/', "`${attribute}$prefix")
  [IO.File]::WriteAllText($_.FullName, $content, $utf8NoBom)
}

$fileEntries = Get-ChildItem -LiteralPath $stagingDirectory -File -Recurse |
  Sort-Object FullName |
  ForEach-Object {
    $href = Get-PackageRelativePath $stagingDirectory $_.FullName
    "      <file href=`"$([Security.SecurityElement]::Escape($href))`" />"
  }

$manifest = @"
<?xml version="1.0" encoding="UTF-8"?>
<manifest identifier="TFG_REGULATORY_PREAPPOINTMENT_READINESS" version="1.0"
  xmlns="http://www.imsproject.org/xsd/imscp_rootv1p1p2"
  xmlns:adlcp="http://www.adlnet.org/xsd/adlcp_rootv1p2"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xsi:schemaLocation="http://www.imsproject.org/xsd/imscp_rootv1p1p2 imscp_rootv1p1p2.xsd http://www.adlnet.org/xsd/adlcp_rootv1p2 adlcp_rootv1p2.xsd">
  <metadata>
    <schema>ADL SCORM</schema>
    <schemaversion>1.2</schemaversion>
  </metadata>
  <organizations default="TFG_ORG">
    <organization identifier="TFG_ORG">
      <title>Content</title>
      <item identifier="TFG_ITEM" identifierref="TFG_SCO" isvisible="true">
        <title>Content</title>
      </item>
    </organization>
  </organizations>
  <resources>
    <resource identifier="TFG_SCO" type="webcontent" adlcp:scormtype="sco" href="index.html">
$($fileEntries -join "`r`n")
    </resource>
  </resources>
</manifest>
"@
[IO.File]::WriteAllText((Join-Path $stagingDirectory 'imsmanifest.xml'), $manifest, $utf8NoBom)

New-Item -ItemType Directory -Force -Path $artifactDirectory | Out-Null
if (Test-Path -LiteralPath $zipPath) { Remove-Item -LiteralPath $zipPath -Force }
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
$archive = [IO.Compression.ZipFile]::Open($zipPath, [IO.Compression.ZipArchiveMode]::Create)
try {
  Get-ChildItem -LiteralPath $stagingDirectory -File -Recurse | ForEach-Object {
    $entryName = Get-PackageRelativePath $stagingDirectory $_.FullName
    [IO.Compression.ZipFileExtensions]::CreateEntryFromFile($archive, $_.FullName, $entryName, [IO.Compression.CompressionLevel]::Optimal) | Out-Null
  }
} finally {
  $archive.Dispose()
}
Remove-Item -LiteralPath $stagingDirectory -Recurse -Force

$artifact = Get-Item -LiteralPath $zipPath
Write-Host "SCORM package created: $($artifact.FullName) ($([math]::Round($artifact.Length / 1MB, 2)) MB)"
