/**
 * @name DiscordLyrics
 * @author mally (personal build)
 * @description Sets your Discord custom status to the current synced lyric from Spotify, or a pause status when playback stops.
 * @version 1.0.6-personal.1
 * @source https://github.com/MallyDev2/DiscordLyrics
 */

const { spawn } = require("child_process");

const DEFAULT_SETTINGS = {
    pausedPrefix: "⏸ Pause - ",
    noLyricsPrefix: "♫ ",
    lyricOffsetMs: 0,
    windowsMediaFallback: true
};

const CONFIG = {
    tickMs: 1000,
    statusMinIntervalMs: 1000,
    statusResyncMs: 30000,
    statusErrorBackoffMs: 5000,
    maxStatusLength: 128,
    lyricsFetchTimeoutMs: 15000,
    lyricsCacheSize: 50,
    windowsTrackFreshMs: 5000,
    windowsProcessGraceMs: 15000,
    windowsWatcherIdleMs: 60000,
    windowsWatcherWarmupMs: 5000,
    lastKnownTrackMs: 30 * 60 * 1000
};

// Long-lived watcher: one PowerShell process that prints the Spotify media session as a JSON line every second,
// instead of spawning a fresh PowerShell every poll. The position is extrapolated from LastUpdatedTime because
// Spotify only refreshes the timeline every few seconds.
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

module.exports = class DiscordLyrics {
    constructor(meta) {
        this.name = "DiscordLyrics";
        this.version = meta?.version || "1.0.6-personal.1";
        this.settings = { ...DEFAULT_SETTINGS, ...(BdApi.Data.load(this.name, "settings") || {}) };
        this.lyricsCache = new Map();
        this.shutdownHandler = () => this.clearStatusForShutdown();
        this.resetState();
    }

    resetState() {
        this.interval = null;
        this.tickRunning = false;
        this.spotifyState = null;
        this.spotifyStateListener = null;
        this.lastTrackKey = null;
        this.lyrics = [];
        this.fetchController = null;
        this.lastStatus = null;
        this.lastStatusSentAt = 0;
        this.statusCooldownUntil = 0;
        this.statusInFlight = false;
        this.lastKnownTrack = null;
        this.lastKnownTrackAt = 0;
        this.windows = {
            child: null,
            startedAt: 0,
            track: null,
            receivedAt: 0,
            processRunning: false,
            processSeenAt: 0,
            wantedAt: 0,
            restarts: 0,
            restartTimer: null
        };
    }

    start() {
        this.findModules();
        this.subscribeSpotifyState();
        window.addEventListener("beforeunload", this.shutdownHandler);
        window.addEventListener("pagehide", this.shutdownHandler);
        this.interval = setInterval(() => this.tick(), CONFIG.tickMs);
        this.tick();
        BdApi.showToast("DiscordLyrics started", { type: "success" });
    }

    stop() {
        clearInterval(this.interval);
        this.fetchController?.abort();
        this.unsubscribeSpotifyState();
        this.stopWindowsWatcher();
        window.removeEventListener("beforeunload", this.shutdownHandler);
        window.removeEventListener("pagehide", this.shutdownHandler);
        this.clearStatusForShutdown();
        this.resetState();
        BdApi.showToast("DiscordLyrics stopped", { type: "info" });
    }

    clearStatusForShutdown() {
        void this.setCustomStatus("", true).catch(() => void 0);
    }

    saveSettings() {
        BdApi.Data.save(this.name, "settings", this.settings);
    }

    findModules() {
        const wp = BdApi.Webpack;
        this.PresenceStore = wp.getStore?.("PresenceStore")
            || wp.getModule(m => m?.getLocalPresence && m?.getState);
        this.HTTP = wp.getModule(wp.Filters.byProps("patch", "get", "post"));
        this.FluxDispatcher = wp.getModule(wp.Filters.byProps("subscribe", "unsubscribe", "dispatch"));
    }

    subscribeSpotifyState() {
        if (!this.FluxDispatcher?.subscribe || this.spotifyStateListener) return;

        this.spotifyStateListener = event => {
            this.spotifyState = event?.track ? {
                track: event.track,
                isPlaying: Boolean(event.isPlaying),
                position: Number(event.position || 0),
                updatedAt: Date.now()
            } : null;
            void this.tick();
        };

        this.FluxDispatcher.subscribe("SPOTIFY_PLAYER_STATE", this.spotifyStateListener);
    }

    unsubscribeSpotifyState() {
        if (!this.FluxDispatcher?.unsubscribe || !this.spotifyStateListener) return;
        this.FluxDispatcher.unsubscribe("SPOTIFY_PLAYER_STATE", this.spotifyStateListener);
        this.spotifyStateListener = null;
    }

    async tick() {
        if (this.tickRunning) return;
        this.tickRunning = true;

        try {
            this.stopIdleWindowsWatcher();
            const track = this.getCurrentTrack();

            if (track === undefined) return; // Windows watcher is still warming up; keep the current status.
            if (!track) {
                this.lastTrackKey = null;
                this.lyrics = [];
                await this.setCustomStatus("");
            } else if (!track.isPlaying) {
                await this.setCustomStatus(`${this.settings.pausedPrefix}${track.title}`);
            } else {
                await this.handlePlayingTrack(track);
            }
        } catch (error) {
            console.error("[DiscordLyrics]", error);
        } finally {
            this.tickRunning = false;
        }
    }

    // Returns a track, null when nothing is playing, or undefined when the answer isn't known yet.
    getCurrentTrack() {
        const stateTrack = this.trackFromSpotifyState();
        if (stateTrack) return this.rememberTrack(stateTrack);

        const activity = this.getSpotifyActivity();
        if (activity) {
            const track = this.trackFromActivity(activity);
            if (track.title && track.artist) return this.rememberTrack(track);
        }

        if (process.platform !== "win32" || !this.settings.windowsMediaFallback) return null;

        const windowsTrack = this.getWindowsTrack();
        if (windowsTrack) return windowsTrack;
        if (this.isWindowsWatcherWarmingUp()) return undefined;

        const spotifyRunning = this.windows.processRunning
            || Date.now() - this.windows.processSeenAt < CONFIG.windowsProcessGraceMs;
        if (spotifyRunning && this.lastKnownTrack && Date.now() - this.lastKnownTrackAt < CONFIG.lastKnownTrackMs) {
            return { ...this.lastKnownTrack, isPlaying: false };
        }

        return null;
    }

    async handlePlayingTrack(track) {
        const trackKey = this.getTrackKey(track);

        if (trackKey !== this.lastTrackKey) {
            this.lastTrackKey = trackKey;
            this.lyrics = [];
            void this.loadLyrics(track, trackKey);
        }

        const line = this.getCurrentLyric(track.progressMs + Number(this.settings.lyricOffsetMs || 0));
        const status = line || `${this.settings.noLyricsPrefix}${track.title} - ${track.artist}`;
        await this.setCustomStatus(status);
    }

    getSpotifyActivity() {
        const activities = this.getLocalPresence()?.activities || [];
        return activities.find(activity => activity?.type === 2 && (
            String(activity.name || "").toLowerCase() === "spotify"
            || String(activity.party?.id || "").startsWith("spotify:")
        ));
    }

    getLocalPresence() {
        try {
            return this.PresenceStore?.getLocalPresence?.()
                || this.PresenceStore?.getState?.()?.localPresence;
        } catch {
            return null;
        }
    }

    trackFromSpotifyState() {
        if (!this.spotifyState?.track) return null;

        const { track, isPlaying, position, updatedAt } = this.spotifyState;
        const artist = Array.isArray(track.artists)
            ? track.artists.map(item => item?.name).filter(Boolean).join(", ")
            : "";
        const durationMs = this.normalizeDurationMs(track.duration_ms ?? track.duration);
        const progressMs = position + (isPlaying ? Date.now() - updatedAt : 0);

        // Discord stopped sending updates long ago; the extrapolated position ran past the end of the song.
        if (isPlaying && durationMs && progressMs > durationMs + 10000) return null;

        return {
            title: this.cleanText(track.name),
            artist: this.cleanText(artist),
            album: this.cleanText(track.album?.name),
            durationMs,
            progressMs: Math.max(0, progressMs),
            isPlaying
        };
    }

    trackFromActivity(activity) {
        const startedAt = activity.timestamps?.start || null;
        const endsAt = activity.timestamps?.end || null;

        return {
            title: this.cleanText(activity.details || activity.name),
            artist: this.cleanText(activity.state),
            album: this.cleanText(activity.assets?.large_text),
            durationMs: this.normalizeDurationMs(startedAt && endsAt ? Math.max(0, endsAt - startedAt) : 0),
            progressMs: startedAt ? Math.max(0, Date.now() - startedAt) : 0,
            isPlaying: true
        };
    }

    rememberTrack(track) {
        if (!track?.title) return track;
        this.lastKnownTrack = track;
        this.lastKnownTrackAt = Date.now();
        return track;
    }

    findLastKnownTrack(title, artist) {
        if (!this.lastKnownTrack) return null;

        const mediaTitle = this.comparable(title);
        if (!mediaTitle || mediaTitle !== this.comparable(this.lastKnownTrack.title)) return null;

        const mediaArtist = this.comparable(this.firstArtist(artist));
        const knownArtist = this.comparable(this.firstArtist(this.lastKnownTrack.artist));
        if (mediaArtist && knownArtist && mediaArtist !== knownArtist) return null;

        return this.lastKnownTrack;
    }

    // ---- Windows media fallback ----

    getWindowsTrack() {
        const w = this.windows;
        w.wantedAt = Date.now();
        this.ensureWindowsWatcher();

        if (!w.track || Date.now() - w.receivedAt > CONFIG.windowsTrackFreshMs) return null;

        const elapsed = w.track.isPlaying ? Date.now() - w.receivedAt : 0;
        const progressMs = w.track.progressMs + elapsed;
        return {
            ...w.track,
            progressMs: w.track.durationMs ? Math.min(progressMs, w.track.durationMs) : progressMs
        };
    }

    isWindowsWatcherWarmingUp() {
        const w = this.windows;
        return Boolean(w.child) && !w.receivedAt && Date.now() - w.startedAt < CONFIG.windowsWatcherWarmupMs;
    }

    ensureWindowsWatcher() {
        const w = this.windows;
        if (w.child || w.restartTimer) return;

        let child;
        try {
            child = spawn("powershell.exe", [
                "-NoLogo", "-NoProfile", "-NonInteractive",
                "-EncodedCommand", Buffer.from(WINDOWS_MEDIA_SCRIPT, "utf16le").toString("base64")
            ], {
                windowsHide: true,
                stdio: ["ignore", "pipe", "ignore"]
            });
        } catch (error) {
            console.warn("[DiscordLyrics] Could not start Windows media watcher", error);
            this.scheduleWindowsWatcherRestart();
            return;
        }

        w.child = child;
        w.startedAt = Date.now();
        w.receivedAt = 0;

        let buffer = "";
        child.stdout.setEncoding("utf8");
        child.stdout.on("data", chunk => {
            buffer += chunk;
            let index;
            while ((index = buffer.indexOf("\n")) >= 0) {
                const line = buffer.slice(0, index).replace(/^\uFEFF/, "").trim();
                buffer = buffer.slice(index + 1);
                if (line) this.onWindowsMediaState(line);
            }
            if (buffer.length > 64 * 1024) buffer = "";
        });

        const onGone = () => {
            if (w.child !== child) return;
            w.child = null;
            this.scheduleWindowsWatcherRestart();
        };
        child.on("exit", onGone);
        child.on("error", onGone);
    }

    scheduleWindowsWatcherRestart() {
        const w = this.windows;
        if (w.restartTimer || !this.interval) return;
        const delay = Math.min(60000, 2000 * 2 ** Math.min(w.restarts, 5));
        w.restarts++;
        w.restartTimer = setTimeout(() => {
            w.restartTimer = null;
            if (Date.now() - w.wantedAt < CONFIG.windowsWatcherIdleMs) this.ensureWindowsWatcher();
        }, delay);
    }

    stopIdleWindowsWatcher() {
        if (this.windows.child && Date.now() - this.windows.wantedAt > CONFIG.windowsWatcherIdleMs) {
            this.stopWindowsWatcher();
        }
    }

    stopWindowsWatcher() {
        const w = this.windows;
        clearTimeout(w.restartTimer);
        w.restartTimer = null;
        const child = w.child;
        w.child = null;
        w.track = null;
        w.receivedAt = 0;
        try {
            child?.kill();
        } catch {
            void 0;
        }
    }

    onWindowsMediaState(line) {
        let state;
        try {
            state = JSON.parse(line);
        } catch {
            return;
        }

        const w = this.windows;
        const now = Date.now();
        w.restarts = 0;
        w.receivedAt = now;
        w.processRunning = Boolean(state?.processRunning);
        if (w.processRunning) w.processSeenAt = now;
        w.track = this.normalizeWindowsTrack(state?.track);
    }

    normalizeWindowsTrack(media) {
        const title = this.cleanText(media?.title);
        if (!title) return null;

        const artist = this.cleanText(media?.artist);
        const fallback = this.findLastKnownTrack(title, artist);
        return this.rememberTrack({
            title,
            artist,
            album: this.cleanText(media?.album) || fallback?.album || "",
            durationMs: this.normalizeDurationMs(media?.durationMs) || fallback?.durationMs || 0,
            progressMs: Math.max(0, Number(media?.positionMs || 0)),
            isPlaying: this.cleanText(media?.status).toLowerCase() === "playing"
        });
    }

    // ---- Lyrics ----

    async loadLyrics(track, trackKey) {
        this.fetchController?.abort();
        this.fetchController = null;

        const cached = this.lyricsCache.get(trackKey);
        if (cached) {
            this.lyricsCache.delete(trackKey);
            this.lyricsCache.set(trackKey, cached);
            this.lyrics = cached;
            return;
        }

        const controller = new AbortController();
        this.fetchController = controller;
        const timeout = setTimeout(() => controller.abort(), CONFIG.lyricsFetchTimeoutMs);

        try {
            const lyrics = await this.fetchLyrics(track, controller.signal);
            this.lyricsCache.set(trackKey, lyrics);
            if (this.lyricsCache.size > CONFIG.lyricsCacheSize) {
                this.lyricsCache.delete(this.lyricsCache.keys().next().value);
            }
            if (this.lastTrackKey === trackKey) this.lyrics = lyrics;
        } catch (error) {
            if (error?.name !== "AbortError") console.warn("[DiscordLyrics] Could not load synced lyrics", error);
        } finally {
            clearTimeout(timeout);
            if (this.fetchController === controller) this.fetchController = null;
        }
    }

    async fetchLyrics(track, signal) {
        const params = new URLSearchParams({ track_name: track.title, artist_name: track.artist });
        if (track.album) params.set("album_name", track.album);
        if (track.durationMs) params.set("duration", String(Math.round(track.durationMs / 1000)));

        const exact = await this.fetchLrclib(`https://lrclib.net/api/get?${params}`, signal);
        const exactLyrics = this.parseSyncedLyrics(exact?.syncedLyrics || "");
        if (exactLyrics.length) return exactLyrics;

        // No exact match: fall back to LRCLIB search with progressively looser queries.
        const title = this.stripFeatureText(track.title);
        const queries = [...new Set([
            `${track.title} ${track.artist}`,
            `${title} ${this.firstArtist(track.artist)}`,
            `${title} ${track.artist}`
        ])];

        for (const q of queries) {
            const results = await this.fetchLrclib(`https://lrclib.net/api/search?${new URLSearchParams({ q })}`, signal);
            if (!Array.isArray(results)) continue;

            const best = results
                .filter(result => result?.syncedLyrics)
                .map(result => ({ result, score: this.scoreLyricsResult(result, track) }))
                .sort((a, b) => b.score - a.score)[0];

            // Needs a title match plus artist/duration evidence, so another song by the same artist isn't picked.
            if (best && best.score >= 8) return this.parseSyncedLyrics(best.result.syncedLyrics);
        }

        return [];
    }

    async fetchLrclib(url, signal) {
        const response = await fetch(url, { signal, headers: { Accept: "application/json" } });
        if (response.status === 404) return null;
        if (!response.ok) throw new Error(`LRCLIB returned ${response.status}`);
        return response.json();
    }

    scoreLyricsResult(result, track) {
        let score = 0;
        const title = this.comparable(this.stripFeatureText(track.title));
        const resultTitle = this.comparable(this.stripFeatureText(result.trackName));
        const artist = this.comparable(this.firstArtist(track.artist));
        const resultArtist = this.comparable(result.artistName);

        if (title && resultTitle === title) score += 8;
        else if (title && resultTitle && (resultTitle.includes(title) || title.includes(resultTitle))) score += 4;
        else return 0;

        if (artist && resultArtist.includes(artist)) score += 4;
        if (track.album && this.comparable(result.albumName) === this.comparable(track.album)) score += 2;

        if (track.durationMs && result.duration) {
            const diff = Math.abs(result.duration - Math.round(track.durationMs / 1000));
            if (diff <= 2) score += 4;
            else if (diff <= 8) score += 2;
        }

        return score;
    }

    parseSyncedLyrics(raw) {
        const lines = [];

        for (const line of String(raw || "").split(/\r?\n/)) {
            // A line can carry several leading timestamps: [00:12.00][01:30.50] text
            const match = /^((?:\[\d{1,3}:\d{2}(?:[.:]\d{1,3})?\]\s*)+)(.*)$/.exec(line.trim());
            if (!match) continue;

            const text = this.cleanLyric(match[2]);
            for (const stamp of match[1].matchAll(/\[(\d{1,3}):(\d{2})(?:[.:](\d{1,3}))?\]/g)) {
                const millis = Number((stamp[3] || "0").padEnd(3, "0").slice(0, 3));
                lines.push({ timeMs: Number(stamp[1]) * 60000 + Number(stamp[2]) * 1000 + millis, text });
            }
        }

        return lines.sort((a, b) => a.timeMs - b.timeMs);
    }

    getCurrentLyric(progressMs) {
        let low = 0;
        let high = this.lyrics.length - 1;
        let current = -1;

        while (low <= high) {
            const mid = (low + high) >> 1;
            if (this.lyrics[mid].timeMs <= progressMs) {
                current = mid;
                low = mid + 1;
            } else {
                high = mid - 1;
            }
        }

        return current >= 0 ? this.lyrics[current].text : "";
    }

    // ---- Custom status ----

    getCurrentCustomStatusText() {
        const presence = this.getLocalPresence();
        if (!presence) return null;

        const custom = presence.activities?.find(activity => activity?.type === 4);
        if (custom) return this.cleanText(custom.state);
        if (presence.customStatus || presence.custom_status) {
            return this.cleanText(presence.customStatus?.text || presence.custom_status?.text);
        }
        return Array.isArray(presence.activities) ? "" : null;
    }

    async setCustomStatus(text, force = false) {
        const status = this.trimStatus(text);
        const now = Date.now();

        if (!force) {
            if (this.statusInFlight) return;

            if (status === this.lastStatus) {
                // Same status as last time: only re-send if Discord shows something else, and at most every 30 s.
                if (now - this.lastStatusSentAt < CONFIG.statusResyncMs) return;
                const actual = this.getCurrentCustomStatusText();
                if (actual === null || actual === status) {
                    this.lastStatusSentAt = now;
                    return;
                }
            }

            if (now < this.statusCooldownUntil) return;
        }

        if (!this.HTTP?.patch) throw new Error("Could not find Discord HTTP module.");

        this.statusInFlight = true;
        this.lastStatus = status;
        this.lastStatusSentAt = now;
        this.statusCooldownUntil = now + CONFIG.statusMinIntervalMs;

        try {
            await this.HTTP.patch({
                url: "/users/@me/settings",
                body: { custom_status: status ? { text: status, expires_at: null } : null }
            });
        } catch (error) {
            const retryAfter = Number(error?.body?.retry_after ?? error?.retryAfter);
            this.statusCooldownUntil = Date.now() + (retryAfter > 0 ? Math.ceil(retryAfter * 1000) : CONFIG.statusErrorBackoffMs);
            this.lastStatus = null; // retry on a later tick
            console.warn("[DiscordLyrics] Discord rejected the status update", error);
        } finally {
            this.statusInFlight = false;
        }
    }

    // ---- Settings ----

    getSettingsPanel() {
        const panel = document.createElement("div");
        Object.assign(panel.style, {
            display: "grid",
            gap: "12px",
            padding: "12px",
            color: "var(--text-normal)"
        });

        const field = (label, key, type, hint) => {
            const row = document.createElement("label");
            Object.assign(row.style, { display: "grid", gap: "4px", fontSize: "14px" });

            const input = document.createElement("input");
            input.type = type;
            if (type === "checkbox") {
                input.checked = Boolean(this.settings[key]);
                Object.assign(row.style, { display: "flex", alignItems: "center", gap: "8px" });
            } else {
                input.value = String(this.settings[key]);
                Object.assign(input.style, {
                    padding: "6px 8px",
                    borderRadius: "4px",
                    border: "1px solid var(--background-modifier-accent)",
                    background: "var(--input-background, var(--background-tertiary))",
                    color: "var(--text-normal)"
                });
            }

            input.addEventListener("change", () => {
                if (type === "checkbox") this.settings[key] = input.checked;
                else if (type === "number") this.settings[key] = Number(input.value) || 0;
                else this.settings[key] = input.value;
                this.saveSettings();
                if (key === "windowsMediaFallback" && !input.checked) this.stopWindowsWatcher();
                this.lastStatus = null;
            });

            const caption = document.createElement("span");
            caption.textContent = label;
            if (type === "checkbox") row.append(input, caption);
            else row.append(caption, input);

            if (hint) {
                const note = document.createElement("span");
                note.textContent = hint;
                Object.assign(note.style, { fontSize: "12px", color: "var(--text-muted)" });
                row.append(note);
            }
            return row;
        };

        const version = document.createElement("div");
        version.textContent = `Version ${this.version}`;
        Object.assign(version.style, { fontSize: "12px", color: "var(--text-muted)" });

        panel.append(
            field("Pause prefix", "pausedPrefix", "text"),
            field("No-lyrics prefix", "noLyricsPrefix", "text"),
            field("Lyric offset (ms)", "lyricOffsetMs", "number", "Positive shows lines earlier, negative later."),
            field("Use Windows media info when Discord has no Spotify data", "windowsMediaFallback", "checkbox"),
            version
        );
        return panel;
    }

    // ---- Helpers ----

    getTrackKey(track) {
        // Source-independent, so switching between Discord and Windows data doesn't refetch lyrics.
        return `${this.comparable(track.title)}|${this.comparable(this.firstArtist(track.artist))}`;
    }

    normalizeDurationMs(duration) {
        const value = Number(duration || 0);
        if (!Number.isFinite(value) || value <= 0) return 0;
        return value < 10000 ? Math.round(value * 1000) : Math.round(value);
    }

    comparable(value) {
        return this.cleanText(value).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
    }

    firstArtist(value) {
        return this.cleanText(value).split(/,|&| x | feat\.?| ft\.?/i)[0]?.trim() || "";
    }

    stripFeatureText(value) {
        // "with" only inside brackets, so titles like "Song - With You" keep their words.
        return this.cleanText(value)
            .replace(/\s*[([]\s*(feat\.?|ft\.?|with)\s+[^)\]]*[)\]]/ig, "")
            .replace(/\s*-\s*(feat\.?|ft\.?)\s.*$/i, "")
            .replace(/\s*\([^)]*(remaster|sped up|slowed|nightcore|version)[^)]*\)/ig, "")
            .replace(/\s*-\s*[^-]*(remaster|sped up|slowed|nightcore)[^-]*$/i, "")
            .trim();
    }

    cleanLyric(value) {
        const text = this.cleanText(value)
            .replace(/\s*\[[^\]]+\]\s*/g, " ")
            .replace(/\s*\([^)]*instrumental[^)]*\)\s*/ig, " ")
            .trim();

        return text || "♪";
    }

    cleanText(value) {
        return String(value || "").replace(/\s+/g, " ").trim();
    }

    trimStatus(value) {
        const chars = [...this.cleanText(value)];
        if (chars.length <= CONFIG.maxStatusLength) return chars.join("");
        return `${chars.slice(0, CONFIG.maxStatusLength - 3).join("").trim()}...`;
    }
};
