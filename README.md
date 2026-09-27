# DiscordLyrics

Плагин ставит в статус Discord текущую строчку песни из Spotify (тексты с LRCLIB, в Vencord-версии
по желанию ещё и из [Spicy Lyrics](#25-spicy-lyrics-необязательно-только-vencordequicord)).
Это форк [MallyDev2/DiscordLyrics](https://github.com/MallyDev2/DiscordLyrics) 1.0.6 с исправлениями
и оптимизациями — полный список в [CHANGES.md](CHANGES.md).

Есть две версии, выбери под свой клиент:

| | BetterDiscord | Vencord / Equicord |
|---|---|---|
| Файл | `SpotifyLyricsStatus.plugin.js` | папка `vencord-userplugin/spotifyLyricsStatus` |
| Установка | скопировать один файл | нужна сборка клиента из исходников |
| Возможности | строчка текста / пауза | + Rich Presence с обложкой, шрифты, точки в проигрышах, подкасты |

> Автообновление из оригинала убрано специально: иначе оно скачало бы версию автора поверх этой.
> Обновлять — вручную (см. «Обновление»).

---

## Вариант 1. BetterDiscord

1. Поставь [BetterDiscord](https://betterdiscord.app), если ещё нет, и запусти Discord.
2. Открой PowerShell в папке с этим README и выполни:

   ```powershell
   powershell -ExecutionPolicy Bypass -File .\install.ps1 -Target BetterDiscord
   ```

   Или просто скопируй `SpotifyLyricsStatus.plugin.js` в `%APPDATA%\BetterDiscord\plugins`
   (Discord → Настройки → Plugins → «Open Plugins Folder»).
3. Discord → Настройки → **Plugins** → включи **DiscordLyrics**.

Шестерёнка у плагина открывает настройки: префикс паузы, префикс «нет текста», сдвиг текста в мс и
чтение Spotify через Windows.

> `-ExecutionPolicy Bypass` действует только на этот один запуск и ничего в системе не меняет.

---

## Вариант 2. Vencord (или Equicord)

Сторонние плагины в Vencord ставятся только в **сборку из исходников** — обычный установщик Vencord
так не умеет. Это разовая настройка на ~10 минут.

### 2.1. Что нужно установить один раз

- **Git** — <https://git-scm.com/download/win>
- **Node.js LTS** (22 или новее) — <https://nodejs.org>
- **pnpm** — в PowerShell после установки Node:

  ```powershell
  npm install -g pnpm
  ```

### 2.2. Скачать исходники клиента

Выбери папку, где они будут жить постоянно (например, `C:\dev`):

```powershell
cd C:\dev
git clone https://github.com/Vendicated/Vencord
```

Для Equicord: `git clone https://github.com/Equicord/Equicord`.

### 2.3. Поставить плагин

Из папки с этим README:

```powershell
powershell -ExecutionPolicy Bypass -File .\install.ps1 -Target Vencord -SourcePath C:\dev\Vencord
```

Скрипт:
1. скопирует плагин в `C:\dev\Vencord\src\userplugins\spotifyLyricsStatus`;
2. выполнит `pnpm install --frozen-lockfile` и `pnpm build`;
3. спросит, запустить ли `pnpm inject`. При **первой** установке ответь `y`, но сначала **полностью
   закрой Discord** (и из трея). Инжектор спросит, в какой Discord ставить (Stable/PTB/Canary) — выбери свой.

<details>
<summary>То же самое вручную, без скрипта</summary>

```powershell
Copy-Item -Recurse .\vencord-userplugin\spotifyLyricsStatus C:\dev\Vencord\src\userplugins\
cd C:\dev\Vencord
pnpm install --frozen-lockfile
pnpm build
pnpm inject
```
</details>

### 2.4. Включить

Запусти Discord → Настройки → **Vencord** (или Equicord) → **Plugins** → найди **DiscordLyrics** → включи.
Он сам включит нужный ему `SpotifyControls`. После включения перезапусти Discord полностью.

В настройках плагина: стиль шрифта, тексты для загрузки/паузы/«нет текста», Rich Presence,
чтение Spotify через Windows, ключ Spicy Lyrics и отладочный лог.

### 2.5. Spicy Lyrics (необязательно, только Vencord/Equicord)

[Spicy Lyrics](https://developers.spicylyrics.org) даёт тексты из своей базы (синхронизации от сообщества),
Apple Music и Spotify, часто с синхронизацией по словам: длинные строки тогда листаются ровно в момент,
когда поётся следующий кусок.

1. Зайди на <https://developers.spicylyrics.org>, создай приложение (Project URL — ссылка на свой форк
   или этот репозиторий) и сохрани ключ `sl_sk_...`. Ключ показывают один раз.
2. Discord → Настройки → Vencord → Plugins → DiscordLyrics → вставь ключ в **spicyLyricsKey**.

Как это работает:
- Сначала запрос в Spicy Lyrics, если его нет — LRCLIB, как раньше. Без ключа всё как раньше.
- Нужен Spotify, привязанный к Discord (нужен ID трека). В режиме «через Windows» используется только LRCLIB.
- **Нужен включённый Rich Presence.** Правила Spicy требуют указывать источник рядом с текстом, поэтому
  в заголовке карточки пишется «lyrics: Spicy Lyrics / Apple Music / Spotify», а для синхронизаций от
  сообщества — кнопки со ссылками на автора. Свои кнопки Discord тебе не показывает, другие их видят.
  Если Rich Presence выключен, плагин Spicy не использует.
- Если ключ неверный — одно уведомление и дальше LRCLIB; при превышении лимита Spicy на время
  пропускается. Ключ уходит только на `api.spicylyrics.org` и не пишется в лог.
- Ключ хранится в настройках Vencord на твоём ПК. Не выкладывай свой `settings.json` и не делись ключом —
  по правилам Spicy у каждого должен быть свой.

---

## Откуда плагин знает, что играет

1. **Интеграция Spotify в Discord** (Настройки → Интеграции → Spotify). Основной и самый точный источник.
2. **Медиа-панель Windows** — если Spotify не привязан к аккаунту. Запускается один фоновый процесс
   PowerShell (~40 МБ ОЗУ, почти 0% CPU), только пока он нужен; сам закрывается через минуту, если
   Discord снова видит Spotify. Можно отключить в настройках плагина.

---

## Обновление

- **Плагин:** замени файлы на новые и повтори шаг установки. Для Vencord — снова `install.ps1`
  (без `inject`, достаточно ответить `n`) и полностью перезапусти Discord.
- **Сам Vencord:** встроенный апдейтер Vencord для git-сборки делает `git pull` и пересобирает клиент;
  папка `src\userplugins` при этом не трогается. Если что-то сломалось — `git pull`, `pnpm install`,
  `pnpm build` вручную.

## Удаление

- BetterDiscord: удалить `%APPDATA%\BetterDiscord\plugins\SpotifyLyricsStatus.plugin.js`.
- Vencord: удалить папку `src\userplugins\spotifyLyricsStatus` и выполнить `pnpm build`.
  Вернуться на обычный Vencord: `pnpm uninject`, затем официальный установщик.

---

## Если что-то не так

| Симптом | Что проверить |
|---|---|
| Статус не меняется вообще | Плагин включён? Для Vencord — был ли полный перезапуск Discord после сборки. |
| Пишет «no synced lyrics» / «♫ Название - Исполнитель» | На LRCLIB нет синхронизированного текста для трека. Для Vencord можно включить «Use unsynced lyrics» (менее точно). |
| Текст опережает или отстаёт | Настрой сдвиг: в BD — «Lyric offset (ms)», в Vencord значение по умолчанию уже +650 мс. |
| Spotify не привязан, ничего не видно | Включена ли опция «Windows media» в настройках плагина. Spotify должен быть десктопным приложением. |
| Строчки меняются с задержкой до секунды | Так задумано: Discord получает не больше одного обновления статуса в секунду (см. ниже). |
| Нужен лог (Vencord) | Включи «debugLogging», лог в `%APPDATA%\DiscordLyrics\debug.log` (не больше 1 МБ). |
| BD: ошибки | Ctrl+Shift+I → Console, строки с `[DiscordLyrics]`. |
| `pnpm install`: `codeload.github.com ... forcibly closed` / `tls handshake eof` | Провайдер режет соединение с GitHub. Повтори с включённым VPN. Скачанные пакеты кэшируются, поэтому достаточно одного удачного раза. |
| `pnpm inject`: `fetch failed`, `host: 'github.com'` | Скрипт не может скачать установщик. Скачай `VencordInstallerCli.exe` из [релизов Vencord/Installer](https://github.com/Vencord/Installer/releases/latest) в `dist\Installer\`, затем в папке Vencord: `$env:VENCORD_USER_DATA_DIR=(Get-Location).Path; $env:VENCORD_DEV_INSTALL="1"; .\dist\Installer\VencordInstallerCli.exe --install` |
| `pnpm build`: `git rev-parse` / `not a git repository` | Исходники скачаны архивом, а не через `git clone`. `install.ps1` это обходит сам; при ручной сборке сначала выполни `$env:VENCORD_HASH="local"`. |

## Важно про аккаунт

Автоматическая смена статуса — это автоматизация пользовательского аккаунта, формально это против правил
Discord. Эта версия отправляет максимум 1 запрос в секунду и один запрос на строчку (оригинал слал до
трёх, а на паузе — раз в секунду бесконечно), но нулевым риск не бывает. Используй на свой страх.

## Лицензия

GPL-3.0, как у оригинала (файл `LICENSE`). Для личного использования ничего делать не нужно; если
будешь выкладывать — исходники должны оставаться открытыми под той же лицензией.
