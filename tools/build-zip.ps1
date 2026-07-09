# Rebuilds korpanoff-planet-generator-datapack.zip from datapack/.
# Uses System.IO.Compression directly (not Compress-Archive, which mangles
# paths in a way Minecraft's datapack loader rejects) and normalizes entry
# names to forward slashes.
#
# pack.mcmeta and data/ sit at the ZIP ROOT (no "datapack/" wrapper folder)
# on purpose: Minecraft can load a datapack straight from a .zip dropped into
# datapacks/ as long as pack.mcmeta is at the top level of that zip. Nesting
# everything under a wrapper folder (the previous behavior) silently breaks
# that — Minecraft looks for pack.mcmeta at the zip root, doesn't find it one
# level down, and the pack just never shows up with no error.

$root = Split-Path -Parent $PSScriptRoot
$src = Join-Path $root "datapack"
$zipPath = Join-Path $root "korpanoff-planet-generator-datapack.zip"

if (Test-Path $zipPath) { Remove-Item $zipPath -Force }

Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem

$zip = [System.IO.Compression.ZipArchive]::new([System.IO.File]::Open($zipPath, [System.IO.FileMode]::Create), [System.IO.Compression.ZipArchiveMode]::Create)
$srcDir = Get-Item $src
Get-ChildItem -Path $src -Recurse -File | ForEach-Object {
  $entryName = $_.FullName.Substring($srcDir.FullName.Length + 1).Replace('\', '/')
  [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, $_.FullName, $entryName) | Out-Null
}
$zip.Dispose()

Write-Host "Built $zipPath ($((Get-Item $zipPath).Length) bytes)"
