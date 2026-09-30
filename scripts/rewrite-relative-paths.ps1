param([string]$Directory = 'dist')

$ErrorActionPreference = 'Stop'
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$targetDirectory = [IO.Path]::GetFullPath((Join-Path $projectRoot $Directory))
$utf8NoBom = [Text.UTF8Encoding]::new($false, $true)

if (-not $targetDirectory.StartsWith($projectRoot, [StringComparison]::OrdinalIgnoreCase)) {
  throw 'The rewrite target must be inside the project root.'
}
if (-not (Test-Path -LiteralPath $targetDirectory -PathType Container)) {
  throw "Static build directory not found: $targetDirectory"
}

function Get-PackageRelativePath([string]$basePath, [string]$targetPath) {
  $baseUri = [Uri]::new(($basePath.TrimEnd('\') + '\'))
  $targetUri = [Uri]::new($targetPath)
  return [Uri]::UnescapeDataString($baseUri.MakeRelativeUri($targetUri).ToString())
}

$rewrittenCount = 0
Get-ChildItem -LiteralPath $targetDirectory -Filter '*.html' -Recurse | ForEach-Object {
  $relativePath = Get-PackageRelativePath $targetDirectory $_.FullName
  $depth = ($relativePath -split '/').Count - 1
  $prefix = if ($depth -eq 0) { './' } else { '../' * $depth }
  $content = [IO.File]::ReadAllText($_.FullName, $utf8NoBom)
  $rewritten = [regex]::Replace($content, '(?<attribute>(?:href|src|data-lightbox-src)=[''\"])/(?!/)', "`${attribute}$prefix")
  if ($rewritten -ne $content) {
    [IO.File]::WriteAllText($_.FullName, $rewritten, $utf8NoBom)
    $rewrittenCount += 1
  }
}

Write-Host "LMS-safe relative paths written to $targetDirectory ($rewrittenCount HTML files updated)."
