/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 mally
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { ChildProcess, spawn } from "child_process";
import { IpcMainInvokeEvent, type Session, session } from "electron";
import { appendFile, mkdir, rename, stat } from "fs/promises";
import { join } from "path";

const appDataDir = join(process.env.APPDATA ?? join(process.env.USERPROFILE ?? process.cwd(), "AppData", "Roaming"), "DiscordLyrics");
const debugLogPath = join(appDataDir, "debug.log");
const DEBUG_LOG_MAX_BYTES = 1024 * 1024;
const FETCH_TIMEOUT_MS = 10000;

// Requests go through Chromium's network stack (an Electron session), not Node's fetch: Node ignores the Windows
// system proxy, so where LRCLIB/Spicy are blocked and a VPN client works as a system proxy (Clash, v2rayN, ...),
// Discord itself loads but lyrics didn't. The session follows the system proxy like Discord does, or a proxy
// set in the plugin settings.
let netSession: Session | undefined;
let netSessionProxy: string | undefined;

function proxyConfig(proxy: string): Electron.ProxyConfig {
    const value = String(proxy ?? "").trim();
    if (value === "direct") return { mode: "direct" };
    if (/^(https?|socks[45]?):\/\/[\w.-]+:\d{1,5}$/i.test(value)) return { proxyRules: value, proxyBypassRules: "<local>" };
    return { mode: "system" };
}

async function getNetSession(proxy: string) {
    netSession ??= session.fromPartition("discordlyrics-net"); // in-memory: no cache or cookies on disk
    const key = JSON.stringify(proxyConfig(proxy));
    if (key !== netSessionProxy) {
        await netSession.setProxy(proxyConfig(proxy));
        netSessionProxy = key;
    }
    return netSession;
}

async function fetchWithTimeout(url: string, init: RequestInit, proxy: string) {
    const ses = await getNetSession(proxy);
    // Covers the body too (callers read it after this returns); aborting a finished request is a no-op.
    const controller = new AbortController();
    setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS).unref?.();
    return ses.fetch(url, { ...init, signal: controller.signal });
}

export async function fetchJson(_: IpcMainInvokeEvent, url: string, proxy = "") {
    try {
        const parsed = new URL(url);
        if (parsed.origin !== "https://lrclib.net") {
            return { status: 400, data: { error: "Only LRCLIB requests are allowed" } };
        }

        const response = await fetchWithTimeout(parsed.href, {
            headers: {
                Accept: "application/json",
                "User-Agent": "Vencord SpotifyLyricsStatus"
            }
        }, proxy);

        if (response.status === 404) return { status: 404, data: null };

        const text = await response.text();
        return {
            status: response.status,
            data: text ? JSON.parse(text) : null
        };
    } catch (error) {
        return {
            status: -1,
            data: { error: String(error) }
        };
    }
}

// https://developers.spicylyrics.org/docs/reference/get.lyrics — the secret key only ever goes to api.spicylyrics.org.
export async function fetchSpicyLyrics(_: IpcMainInvokeEvent, trackId: string, key: string, proxy = "") {
    if (!/^[A-Za-z0-9]{22}$/.test(String(trackId))) return { status: 400, data: null };
    if (!/^sl_sk_\S+$/.test(String(key))) return { status: 401, data: null };

    try {
        const response = await fetchWithTimeout(`https://api.spicylyrics.org/v1/lyrics/${trackId}`, {
            headers: {
                Accept: "application/json",
                Authorization: `Bearer ${key}`,
                "User-Agent": "DiscordLyrics (https://github.com/sh1guchi/DiscordLyrics)"
            }
        }, proxy);

        const text = await response.text();
        let data: unknown = null;
        try {
            data = text ? JSON.parse(text) : null;
        } catch {
            data = null;
        }

        return {
            status: response.status,
            data,
            retryAfter: Number(response.headers.get("retry-after")) || undefined
        };
    } catch {
        return { status: -1, data: null };
    }
}

function cleanQueryPart(value: string) {
    return String(value || "").replace(/\s+/g, " ").trim();
}

function comparableQueryPart(value: string) {
    // \p{L}\p{N} instead of a-z0-9: otherwise Cyrillic/Japanese/etc. titles become "" and every result ties.
    return cleanQueryPart(value).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

function scoreAlbumImageResult(result: { trackName?: string; artistName?: string; collectionName?: string; }, track: { title: string; artist: string; album: string; }) {
    let score = 0;
    const title = comparableQueryPart(track.title);
    const artist = comparableQueryPart(track.artist.split(",")[0] || track.artist);
    const album = comparableQueryPart(track.album);
    const resultTitle = comparableQueryPart(result.trackName || "");
    const resultArtist = comparableQueryPart(result.artistName || "");
    const resultAlbum = comparableQueryPart(result.collectionName || "");

    if (title && resultTitle === title) score += 4;
    else if (title && resultTitle.includes(title)) score += 2;

    if (artist && resultArtist === artist) score += 4;
    else if (artist && resultArtist.includes(artist)) score += 2;

    if (album && resultAlbum === album) score += 2;

    return score;
}

export async function searchAlbumImage(_: IpcMainInvokeEvent, title: string, artist: string, album: string, proxy = "") {
    const query = [cleanQueryPart(title), cleanQueryPart(artist.split(",")[0] || artist), cleanQueryPart(album)].filter(Boolean).join(" ");
    if (!query) return "";

    try {
        const response = await fetchWithTimeout(`https://itunes.apple.com/search?${new URLSearchParams({
            term: query,
            media: "music",
            entity: "song",
            limit: "8"
        })}`, {
            headers: {
                Accept: "application/json",
                "User-Agent": "DiscordLyrics"
            }
        }, proxy);
        if (!response.ok) return "";

        const data = await response.json() as {
            results?: Array<{
                trackName?: string;
                artistName?: string;
                collectionName?: string;
                artworkUrl100?: string;
            }>;
        };
        const track = { title, artist, album };
        const best = data.results
            ?.filter(result => result.artworkUrl100)
            .map(result => ({ result, score: scoreAlbumImageResult(result, track) }))
            .sort((a, b) => b.score - a.score)[0];

        // Without at least a title or artist match the cover would belong to a random song.
        if (!best || best.score < 4) return "";
        return best.result.artworkUrl100?.replace(/\/\d+x\d+bb\./, "/600x600bb.") || "";
    } catch {
        return "";
    }
}

// ---- Windows media watcher ----
// One long-lived PowerShell process prints the Spotify media session as a JSON line every second, instead of
// spawning a fresh PowerShell every poll. The position is extrapolated from LastUpdatedTime because Spotify only
// refreshes the timeline every few seconds.

const WINDOWS_MEDIA_SCRIPT = String.raw`
$ErrorActionPreference = "SilentlyContinue"
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding $false
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$asTaskGeneric = [System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq "AsTask" -and $_.GetParameters().Count -eq 1 -and $_.IsGenericMethod } | Select-Object -First 1
function Await($Operation, [Type]$ResultType) {
  $asTaskGeneric.MakeGenericMethod($ResultType).Invoke($null, @($Operation)).GetAwaiter().GetResult()
}
$managerType = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager, Windows.Media.Control, ContentType = WindowsRuntime]
$propsType = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties, Windows.Media.Control, ContentType = WindowsRuntime]
$manager = $null
try { $manager = Await ($managerType::RequestAsync()) $managerType } catch {}
while ($true) {
  $track = $null
  if ($manager) {
    try {
      foreach ($session in $manager.GetSessions()) {
        if (($session.SourceAppUserModelId -as [string]) -notmatch "Spotify") { continue }
        $props = Await ($session.TryGetMediaPropertiesAsync()) $propsType
        if (-not $props.Title) { continue }
        $timeline = $session.GetTimelineProperties()
        $status = $session.GetPlaybackInfo().PlaybackStatus.ToString()
        $position = $timeline.Position.TotalMilliseconds
        if ($status -eq "Playing" -and $timeline.LastUpdatedTime.Year -gt 2000) {
          $position += ([DateTimeOffset]::UtcNow - $timeline.LastUpdatedTime).TotalMilliseconds
        }
        $duration = $timeline.EndTime.TotalMilliseconds
        if ($duration -gt 0 -and $position -gt $duration) { $position = $duration }
        $track = [ordered]@{
          title = $props.Title
          artist = $props.Artist
          album = $props.AlbumTitle
          status = $status
          positionMs = [int64][math]::Max(0, $position)
          durationMs = [int64][math]::Max(0, $duration)
        }
        break
      }
    } catch {}
  }
  $running = [bool]$track
  if (-not $running) { $running = [bool](Get-Process -Name Spotify -ErrorAction SilentlyContinue | Select-Object -First 1) }
  $json = [ordered]@{ processRunning = $running; track = $track } | ConvertTo-Json -Compress
  try { [Console]::Out.WriteLine($json); [Console]::Out.Flush() } catch { exit }
  Start-Sleep -Milliseconds 1000
}
`;

const WATCHER_IDLE_MS = 60000;

interface WatcherState {
    processRunning: boolean;
    track: unknown;
}

let watcher: ChildProcess | undefined;
let watcherState: WatcherState | undefined;
let watcherStateAt = 0;
let watcherWantedAt = 0;
let watcherRestarts = 0;
let watcherRestartTimer: ReturnType<typeof setTimeout> | undefined;
let watcherIdleTimer: ReturnType<typeof setInterval> | undefined;

function startWatcher() {
    if (watcher || watcherRestartTimer || process.platform !== "win32") return;

    let child: ChildProcess;
    try {
        child = spawn("powershell.exe", [
            "-NoLogo", "-NoProfile", "-NonInteractive",
            "-EncodedCommand", Buffer.from(WINDOWS_MEDIA_SCRIPT, "utf16le").toString("base64")
        ], {
            windowsHide: true,
            stdio: ["ignore", "pipe", "ignore"]
        });
    } catch {
        scheduleWatcherRestart();
        return;
    }

    watcher = child;
    watcherState = undefined;
    watcherStateAt = 0;

    let buffer = "";
    child.stdout!.setEncoding("utf8");
    child.stdout!.on("data", (chunk: string) => {
        buffer += chunk;
        let index: number;
        while ((index = buffer.indexOf("\n")) >= 0) {
            const line = buffer.slice(0, index).replace(/^\uFEFF/, "").trim();
            buffer = buffer.slice(index + 1);
            if (!line) continue;
            try {
                watcherState = JSON.parse(line);
                watcherStateAt = Date.now();
                watcherRestarts = 0;
            } catch {
                void 0;
            }
        }
        if (buffer.length > 64 * 1024) buffer = "";
    });

    const onGone = () => {
        if (watcher !== child) return;
        watcher = undefined;
        scheduleWatcherRestart();
    };
    child.on("exit", onGone);
    child.on("error", onGone);

    watcherIdleTimer ??= setInterval(() => {
        if (Date.now() - watcherWantedAt > WATCHER_IDLE_MS) stopWindowsSpotifyWatcher();
    }, 10000);
}

function scheduleWatcherRestart() {
    if (watcherRestartTimer || Date.now() - watcherWantedAt > WATCHER_IDLE_MS) return;
    const delay = Math.min(60000, 2000 * 2 ** Math.min(watcherRestarts, 5));
    watcherRestarts++;
    watcherRestartTimer = setTimeout(() => {
        watcherRestartTimer = undefined;
        if (Date.now() - watcherWantedAt < WATCHER_IDLE_MS) startWatcher();
    }, delay);
}

export function stopWindowsSpotifyWatcher() {
    if (watcherIdleTimer) clearInterval(watcherIdleTimer);
    if (watcherRestartTimer) clearTimeout(watcherRestartTimer);
    watcherIdleTimer = undefined;
    watcherRestartTimer = undefined;

    const child = watcher;
    watcher = undefined;
    watcherState = undefined;
    watcherStateAt = 0;
    try {
        child?.kill();
    } catch {
        void 0;
    }
}

export function getWindowsSpotifyState() {
    if (process.platform !== "win32") return { ready: true, ageMs: 0, processRunning: false, track: null };

    watcherWantedAt = Date.now();
    startWatcher();

    if (!watcherState) return { ready: false };
    return { ready: true, ageMs: Date.now() - watcherStateAt, ...watcherState };
}

// ---- Debug log (only called when the "debugLogging" setting is on) ----

let logDirReady = false;

export async function logDebug(_: IpcMainInvokeEvent, message: string) {
    if (!logDirReady) {
        await mkdir(appDataDir, { recursive: true });
        logDirReady = true;
    }

    const size = await stat(debugLogPath).then(info => info.size, () => 0);
    if (size > DEBUG_LOG_MAX_BYTES) await rename(debugLogPath, `${debugLogPath}.old`).catch(() => void 0);

    await appendFile(debugLogPath, `${new Date().toISOString()} ${message}\n`, "utf8");
}
