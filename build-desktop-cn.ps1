#Requires -Version 5.1

$ErrorActionPreference = "Stop"
$env:PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD = "1"
if (-not $env:ELECTRON_MIRROR) {
  $env:ELECTRON_MIRROR = "https://npmmirror.com/mirrors/electron/"
}
if (-not $env:ELECTRON_BUILDER_BINARIES_MIRROR) {
  $env:ELECTRON_BUILDER_BINARIES_MIRROR = "https://gh-proxy.com/https://github.com/electron-userland/electron-builder-binaries/releases/download/"
}

Push-Location $PSScriptRoot
try {
  & node scripts/audit-zh-translations.mjs
  if ($LASTEXITCODE -ne 0) { throw "Chinese translation audit failed" }

  & corepack yarn install --immutable
  if ($LASTEXITCODE -ne 0) { throw "Yarn dependency install failed" }

  & corepack yarn web:build:prod
  if ($LASTEXITCODE -ne 0) { throw "Production web build failed" }

  & npm --prefix desktop-cn ci --no-audit --no-fund
  if ($LASTEXITCODE -ne 0) { throw "Desktop dependency install failed" }

  & npm --prefix desktop-cn run dist:win:x64
  if ($LASTEXITCODE -ne 0) { throw "Windows x64 packaging failed" }
}
finally {
  Pop-Location
}