<#
    Установка личной версии DiscordLyrics.

    BetterDiscord:      .\install.ps1 -Target BetterDiscord
    Vencord / Equicord: .\install.ps1 -Target Vencord -SourcePath C:\path\to\Vencord

    Скрипт ничего не скачивает из интернета сам (кроме зависимостей Vencord через pnpm),
    не убивает Discord и не трогает app.asar. Для Vencord/Equicord он только копирует плагин
    в src\userplugins, собирает клиент и по желанию запускает штатный `pnpm inject`.
#>
param(
    [ValidateSet("BetterDiscord", "Vencord", "Equicord")]
    [string]$Target,
    [string]$SourcePath
)

$ErrorActionPreference = "Stop"
$Root = $PSScriptRoot

function Fail($Message) {
    Write-Host ""
    Write-Host "Ошибка: $Message" -ForegroundColor Red
    exit 1
}

function Step($Message) {
    Write-Host ""
    Write-Host "==> $Message" -ForegroundColor Cyan
}

if (-not $Target) {
    Write-Host "Куда ставить DiscordLyrics?"
    Write-Host "  1) BetterDiscord"
    Write-Host "  2) Vencord (сборка из исходников)"
    Write-Host "  3) Equicord (сборка из исходников)"
    switch ((Read-Host "Номер").Trim()) {
        "1" { $Target = "BetterDiscord" }
        "2" { $Target = "Vencord" }
        "3" { $Target = "Equicord" }
        default { Fail "нужно ввести 1, 2 или 3." }
    }
}

if ($Target -eq "BetterDiscord") {
    $pluginFile = Join-Path $Root "SpotifyLyricsStatus.plugin.js"
    $pluginsDir = Join-Path $env:APPDATA "BetterDiscord\plugins"

    if (-not (Test-Path -LiteralPath $pluginFile)) { Fail "не найден $pluginFile" }
    if (-not (Test-Path -LiteralPath $pluginsDir)) {
        Fail "папка $pluginsDir не найдена. Сначала установи BetterDiscord (betterdiscord.app) и запусти Discord хотя бы раз."
    }

    Step "Копирую плагин в $pluginsDir"
    Copy-Item -LiteralPath $pluginFile -Destination $pluginsDir -Force

    Write-Host ""
    Write-Host "Готово." -ForegroundColor Green
    Write-Host "BetterDiscord подхватит файл сам. Включи DiscordLyrics в Настройки -> Plugins."
    exit 0
}

# ---- Vencord / Equicord ----

$pluginDir = Join-Path $Root "vencord-userplugin\spotifyLyricsStatus"
if (-not (Test-Path -LiteralPath (Join-Path $pluginDir "index.ts"))) { Fail "не найдена папка плагина $pluginDir" }

if (-not $SourcePath) {
    $SourcePath = (Read-Host "Путь к папке с исходниками $Target (где лежит package.json)").Trim().Trim('"')
}
if (-not $SourcePath -or -not (Test-Path -LiteralPath (Join-Path $SourcePath "package.json"))) {
    Fail "в '$SourcePath' нет package.json. Нужна папка, куда ты клонировал $Target (см. README)."
}
if (-not (Test-Path -LiteralPath (Join-Path $SourcePath "src\plugins"))) {
    Fail "'$SourcePath' не похожа на исходники Vencord/Equicord (нет src\plugins)."
}
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { Fail "не найден Node.js. Поставь LTS с nodejs.org." }
if (-not (Get-Command pnpm -ErrorAction SilentlyContinue)) { Fail "не найден pnpm. Выполни: npm install -g pnpm" }

$userPlugins = Join-Path $SourcePath "src\userplugins"
$destination = Join-Path $userPlugins "spotifyLyricsStatus"

Step "Копирую плагин в $destination"
New-Item -ItemType Directory -Force -Path $userPlugins | Out-Null
if (Test-Path -LiteralPath $destination) { Remove-Item -LiteralPath $destination -Recurse -Force }
Copy-Item -LiteralPath $pluginDir -Destination $userPlugins -Recurse -Force

Push-Location -LiteralPath $SourcePath
try {
    Step "pnpm install --frozen-lockfile"
    & pnpm install --frozen-lockfile
    if ($LASTEXITCODE -ne 0) { Fail "pnpm install завершился с кодом $LASTEXITCODE (см. вывод выше)." }

    # Сборка Vencord берёт хеш коммита через git; у исходников из zip-архива его нет.
    if (-not (Test-Path -LiteralPath (Join-Path $SourcePath ".git")) -and -not $env:VENCORD_HASH) {
        $env:VENCORD_HASH = "local"
    }

    Step "pnpm build"
    & pnpm build
    if ($LASTEXITCODE -ne 0) { Fail "pnpm build завершился с кодом $LASTEXITCODE (см. вывод выше)." }

    Write-Host ""
    Write-Host "Сборка готова." -ForegroundColor Green
    Write-Host "Если $Target из этой папки уже внедрён в Discord, достаточно полностью перезапустить Discord"
    Write-Host "(выйти из трея, не Ctrl+R: у плагина есть нативная часть)."
    Write-Host ""
    $answer = (Read-Host "Запустить pnpm inject сейчас? Нужно при первой установке. Закрой Discord перед этим. [y/N]").Trim()
    if ($answer -match '^(y|д)') {
        & pnpm inject
        if ($LASTEXITCODE -ne 0) { Fail "pnpm inject завершился с кодом $LASTEXITCODE." }
    }
}
finally {
    Pop-Location
}

Write-Host ""
Write-Host "Дальше: запусти Discord -> Настройки -> Vencord/Equicord -> Plugins -> включи DiscordLyrics." -ForegroundColor Green
