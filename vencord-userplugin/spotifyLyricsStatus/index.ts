/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 mally
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { definePluginSettings } from "@api/Settings";
import { UserSettings } from "@api/UserSettings";
import { SpotifyStore } from "@plugins/spotifyControls/SpotifyStore";
import definePlugin, { OptionType, type PluginNative } from "@utils/types";
import type { Activity } from "@vencord/discord-types";
import { ActivityFlags, ActivityStatusDisplayType, ActivityType } from "@vencord/discord-types/enums";
import { ApplicationAssetUtils, Button, FluxDispatcher, React, showToast, Toasts, UserStore } from "@webpack/common";

const Native = (VencordNative.pluginHelpers.DiscordLyrics ?? VencordNative.pluginHelpers.SpotifyLyricsStatus) as PluginNative<typeof import("./native")>;

const DEFAULT_SETTINGS = {
    lyricOffsetMs: 650,
    updateIntervalMs: 250,
    gapThresholdMs: 4000,
    maxStatusLength: 128,
    fontStyle: "normal",
    showWaitingDots: true,
    loadingText: "loading lyrics...",
    noLyricsText: "no synced lyrics",
    pausedPrefix: "Pause - ",
    usePlainLyricsFallback: false,
    enableRpc: true,
    rpcName: "Spotify",
    rpcShowWhenPaused: true,
    rpcShowAlbumArt: true,
    rpcShowPluginButton: false,
    windowsMediaFallback: true,
    debugLogging: false
} as const;

const RELEASE_VERSION = "1.0.6-personal.10";

type FontStyleId =
    | "normal"
    | "title"
    | "uppercase"
    | "lowercase"
    | "wide"
    | "fullwidth"
    | "mono"
    | "bold"
    | "italic"
    | "boldItalic"
    | "sans"
    | "sansItalic"
    | "sansBold"
    | "sansBoldItalic"
    | "serifBold"
    | "serifItalic"
    | "serifBoldItalic"
    | "script"
    | "scriptBold"
    | "fraktur"
    | "frakturBold"
    | "doubleStruck"
    | "smallCaps";

const FONT_OPTIONS: Array<{ label: string; value: FontStyleId; }> = [
    { label: "Normal", value: "normal" },
    { label: "Title Case", value: "title" },
    { label: "UPPERCASE", value: "uppercase" },
    { label: "Lowercase", value: "lowercase" },
    { label: "W i d e  S p a c i n g", value: "wide" },
    { label: "\u{ff26}\u{ff55}\u{ff4c}\u{ff4c}\u{ff57}\u{ff49}\u{ff44}\u{ff54}\u{ff48}", value: "fullwidth" },
    { label: "\u{1d67c}\u{1d698}\u{1d697}\u{1d698}\u{1d69c}\u{1d699}\u{1d68a}\u{1d68c}\u{1d68e}", value: "mono" },
    { label: "\u{1d401}\u{1d428}\u{1d425}\u{1d41d}", value: "bold" },
    { label: "\u{1d43c}\u{1d461}\u{1d44e}\u{1d459}\u{1d456}\u{1d450}", value: "italic" },
    { label: "\u{1d469}\u{1d490}\u{1d48d}\u{1d485} \u{1d470}\u{1d495}\u{1d482}\u{1d48d}\u{1d48a}\u{1d484}", value: "boldItalic" },
    { label: "\u{1d5b2}\u{1d5ba}\u{1d5c7}\u{1d5cc}", value: "sans" },
    { label: "\u{1d61a}\u{1d622}\u{1d62f}\u{1d634} \u{1d610}\u{1d635}\u{1d622}\u{1d62d}\u{1d62a}\u{1d624}", value: "sansItalic" },
    { label: "\u{1d5e6}\u{1d5ee}\u{1d5fb}\u{1d600} \u{1d5d5}\u{1d5fc}\u{1d5f9}\u{1d5f1}", value: "sansBold" },
    { label: "\u{1d64e}\u{1d656}\u{1d663}\u{1d668} \u{1d63d}\u{1d664}\u{1d661}\u{1d659} \u{1d644}\u{1d669}\u{1d656}\u{1d661}\u{1d65e}\u{1d658}", value: "sansBoldItalic" },
    { label: "\u{1d412}\u{1d41e}\u{1d42b}\u{1d422}\u{1d41f} \u{1d401}\u{1d428}\u{1d425}\u{1d41d}", value: "serifBold" },
    { label: "\u{1d446}\u{1d452}\u{1d45f}\u{1d456}\u{1d453} \u{1d43c}\u{1d461}\u{1d44e}\u{1d459}\u{1d456}\u{1d450}", value: "serifItalic" },
    { label: "\u{1d47a}\u{1d486}\u{1d493}\u{1d48a}\u{1d487} \u{1d469}\u{1d490}\u{1d48d}\u{1d485} \u{1d470}\u{1d495}\u{1d482}\u{1d48d}\u{1d48a}\u{1d484}", value: "serifBoldItalic" },
    { label: "\u{1d4d2}\u{1d4fe}\u{1d4fb}\u{1d4fc}\u{1d4f2}\u{1d4ff}\u{1d4ee}", value: "script" },
    { label: "\u{1d4d2}\u{1d4fe}\u{1d4fb}\u{1d4fc}\u{1d4f2}\u{1d4ff}\u{1d4ee} \u{1d4d1}\u{1d4f8}\u{1d4f5}\u{1d4ed}", value: "scriptBold" },
    { label: "\u{1d509}\u{1d52f}\u{1d51e}\u{1d528}\u{1d531}\u{1d532}\u{1d52f}", value: "fraktur" },
    { label: "\u{1d575}\u{1d597}\u{1d586}\u{1d590}\u{1d599}\u{1d59a}\u{1d597} \u{1d56d}\u{1d594}\u{1d591}\u{1d589}", value: "frakturBold" },
    { label: "\u{1d53b}\u{1d560}\u{1d566}\u{1d553}\u{1d55d}\u{1d556}-\u{1d54a}\u{1d565}\u{1d563}\u{1d566}\u{1d554}\u{1d55c}", value: "doubleStruck" },
    { label: "\u{a731}\u{1d0d}\u{1d00}\u{029f}\u{029f} \u{1d04}\u{1d00}\u{1d18}\u{a731}", value: "smallCaps" }
];

interface SpotifyArtist {
    name: string;
}

interface SpotifyAlbum {
    name: string;
    image?: {
        url?: string;
    };
    images?: Array<{
        url?: string;
    }>;
}

interface SpotifyShow {
    name?: string;
    publisher?: string;
    images?: Array<{
        url?: string;
    }>;
}

interface SpotifyTrack {
    id: string | null;
    name: string;
    duration: number;
    duration_ms?: number;
    type?: string;
    publisher?: string;
    description?: string;
    html_description?: string;
    images?: Array<{
        url?: string;
    }>;
    album?: SpotifyAlbum;
    artists?: SpotifyArtist[];
    show?: SpotifyShow;
}

interface SpotifyStateEvent {
    track: SpotifyTrack | null;
    isPlaying: boolean;
    position: number;
    receivedAt?: number;
}

interface NormalizedTrack {
    id: string;
    title: string;
    artist: string;
    album: string;
    albumImage: string;
    contentType: string;
    description: string;
    durationMs: number;
    progressMs: number;
    isPlaying: boolean;
}

interface LyricLine {
    timeMs: number;
    text: string;
    // Start time of every word in text.split(" ") order, when the source has word-level sync.
    wordTimesMs?: number[];
    // When each of those words has finished being sung.
    wordEndTimesMs?: number[];
}

// Who to credit for the lyrics on screen (Spicy Lyrics API terms, section 6).
interface LyricsAttribution {
    provider: string;
    uploader?: { username: string; url?: string; };
    maker?: { username: string; url?: string; };
}

interface LoadedLyrics {
    lines: LyricLine[];
    attribution?: LyricsAttribution;
}

interface SpicyPerson {
    username?: string;
    url?: string;
}

interface SpicyBody {
    Type?: string;
    source?: string;
    Content?: Array<{
        Text?: string;
        StartTime?: number;
        Lead?: {
            StartTime?: number;
            Syllables?: Array<{ Text?: string; StartTime?: number; EndTime?: number; IsPartOfWord?: boolean; }>;
        };
    }>;
    Lines?: Array<{ Text?: string; }>;
    UploadAttribution?: { Uploader?: SpicyPerson; Maker?: SpicyPerson; };
}

interface ActiveLyricLine extends LyricLine {
    nextTimeMs?: number;
}

interface LrcLibResult {
    trackName?: string;
    artistName?: string;
    albumName?: string;
    duration?: number;
    plainLyrics?: string | null;
    syncedLyrics?: string | null;
    synced_lyrics?: string | null;
}

interface WindowsSpotifyState {
    ready?: boolean;
    ageMs?: number;
    processRunning?: boolean;
    track?: {
        title?: string;
        artist?: string;
        album?: string;
        status?: string;
        positionMs?: number;
        durationMs?: number;
    } | null;
}

let interval: ReturnType<typeof setInterval> | undefined;
let spotifyState: SpotifyStateEvent | undefined;
let windowsSpotifyTrack: NormalizedTrack | undefined;
let windowsSpotifyTrackReceivedAt = 0;
let windowsSpotifyProcessRunning = false;
let windowsSpotifyProcessSeenAt = 0;
let lastWindowsSpotifyPollAt = 0;
let windowsSpotifyPollInFlight = false;
let lastKnownSpotifyTrack: NormalizedTrack | undefined;
let lastKnownSpotifyTrackAt = 0;
const fallbackAlbumImageCache = new Map<string, string | undefined>();
const fallbackAlbumImageRequests = new Map<string, Promise<string | undefined>>();
let fetchController: AbortController | undefined;
let lyrics: LyricLine[] = [];
let lyricsAttribution: LyricsAttribution | undefined;
let spicyMutedUntil = 0;
let spicyRejectedKey = "";
let lastTrackKey = "";
let loadingTrackKey = "";
let lastStatusText = "";
let lastRemoteStatusText: string | undefined;
let pendingRemoteStatusText = "";
let remoteStatusInFlight = false;
let remoteStatusTimer: ReturnType<typeof setTimeout> | undefined;
let nextRemoteStatusAt = 0;
let lastRpcKey = "";
let lastRpcStartedAt = 0;
let lastSpotifyPollAt = 0;
let spotifyPollInFlight = false;
let lastPlaybackPlaying: boolean | undefined;
let spotifyUnavailableAt = 0;
let spotifyPollMutedUntil = 0;
let statusExpiryCleared = false;

const STATUS_SOCKET_ID = "SpotifyLyricsStatus";
const RPC_SOCKET_ID = "SpotifyLyricsStatusRpc";
// Each remote status change is a request to Discord; lines that change faster than this are coalesced.
const MIN_REMOTE_STATUS_INTERVAL_MS = 1000;
// Discord already pushes SPOTIFY_PLAYER_STATE over its socket; polling the Web API is only drift correction.
const SPOTIFY_POLL_INTERVAL_MS = 5000;
const SPOTIFY_POLL_ERROR_MUTE_MS = 30000;
const WINDOWS_SPOTIFY_POLL_INTERVAL_MS = 1000;
const SPOTIFY_STATE_FRESH_MS = 15000;
const WINDOWS_SPOTIFY_STATE_FRESH_MS = 5000;
const WINDOWS_SPOTIFY_PROCESS_GRACE_MS = 15000;
const SPOTIFY_UNAVAILABLE_GRACE_MS = 5000;
const LAST_KNOWN_SPOTIFY_TRACK_MS = 30 * 60 * 1000;
const CACHE_LIMIT = 200;
const LYRICS_CACHE_LIMIT = 50;
const albumAssetCache = new Map<string, Promise<string | undefined>>();
const albumAssetResolved = new Map<string, string | undefined>();
const lyricsCache = new Map<string, LoadedLyrics>();
const statusSettingCache = new Map<string, ReturnType<typeof findStatusSetting>>();
const pluginAuthor = { name: "mally", id: 0n };

function setBounded<K, V>(map: Map<K, V>, key: K, value: V, limit = CACHE_LIMIT) {
    map.delete(key);
    map.set(key, value);
    while (map.size > limit) map.delete(map.keys().next().value as K);
}

function updatePluginAuthor() {
    try {
        pluginAuthor.id = BigInt(UserStore.getCurrentUser()?.id ?? "0");
    } catch {
        pluginAuthor.id = 0n;
    }
}

function debugLog(message: string) {
    if (!settings.store.debugLogging) return;
    const promise = Native?.logDebug?.(message) as Promise<void> | undefined;
    void promise?.catch(() => void 0);
}

function logStatusUserSettings() {
    if (!settings.store.debugLogging) return;
    try {
        const statusSettings = Object.values(UserSettings ?? {})
            .filter(setting => setting?.userSettingsAPIGroup === "status")
            .map(setting => {
                let value: unknown;
                try {
                    value = setting.getSetting();
                } catch (error) {
                    value = stringifyError(error);
                }

                return {
                    name: setting.userSettingsAPIName,
                    value
                };
            });

        debugLog(`status user settings ${JSON.stringify(statusSettings)}`);
    } catch (error) {
        debugLog(`status user settings failed ${stringifyError(error)}`);
    }
}

function findStatusSetting(name: string) {
    return Object.values(UserSettings ?? {})
        .find(setting => setting?.userSettingsAPIGroup === "status" && setting.userSettingsAPIName === name);
}

// Called several times per tick; the lookup scans every user setting, so remember the result.
function getStatusSetting(name: string) {
    let setting = statusSettingCache.get(name);
    if (!setting) {
        setting = findStatusSetting(name);
        if (setting) statusSettingCache.set(name, setting);
    }
    return setting;
}

function resetPluginDefaults() {
    Object.entries(DEFAULT_SETTINGS).forEach(([key, value]) => {
        (settings.store as Record<string, unknown>)[key] = value;
    });

    restartTimer();
    tick();
    showToast("DiscordLyrics settings reset", Toasts.Type.SUCCESS);
}

const settings = definePluginSettings({
    fontStyle: {
        type: OptionType.SELECT,
        description: "Readable Discord-safe text style for lyric statuses.",
        options: FONT_OPTIONS.map(option => ({
            ...option,
            default: option.value === DEFAULT_SETTINGS.fontStyle
        }))
    },
    showWaitingDots: {
        type: OptionType.BOOLEAN,
        description: "Show dots during intros and long lyric gaps.",
        default: DEFAULT_SETTINGS.showWaitingDots
    },
    loadingText: {
        type: OptionType.STRING,
        description: "Text shown while lyrics load.",
        default: DEFAULT_SETTINGS.loadingText
    },
    noLyricsText: {
        type: OptionType.STRING,
        description: "Text shown when synced lyrics are not found.",
        default: DEFAULT_SETTINGS.noLyricsText
    },
    pausedPrefix: {
        type: OptionType.STRING,
        description: "Text before the song title while Spotify is paused.",
        default: DEFAULT_SETTINGS.pausedPrefix
    },
    usePlainLyricsFallback: {
        type: OptionType.BOOLEAN,
        description: "Use unsynced lyrics if synced lyrics are missing. This is less accurate.",
        default: DEFAULT_SETTINGS.usePlainLyricsFallback
    },
    // Deliberately not in DEFAULT_SETTINGS, so "Reset defaults" keeps the key.
    spicyLyricsKey: {
        type: OptionType.STRING,
        description: "Spicy Lyrics API secret key (sl_sk_...) from developers.spicylyrics.org. Used first, LRCLIB stays as fallback. Needs Rich Presence on (the source is credited there) and Spotify linked to Discord. Empty = LRCLIB only.",
        default: "",
        onChange: () => {
            spicyRejectedKey = "";
            spicyMutedUntil = 0;
        }
    },
    enableRpc: {
        type: OptionType.BOOLEAN,
        description: "Show a Rich Presence card for the current Spotify song.",
        default: DEFAULT_SETTINGS.enableRpc
    },
    // Not in DEFAULT_SETTINGS, so "Reset defaults" keeps it.
    rpcAppId: {
        type: OptionType.STRING,
        description: "Discord application ID for the Rich Presence card (discord.com/developers/applications → New Application → Application ID). Discord hides cards without a real application. Empty = built-in ID, if this build has one.",
        default: "",
        onChange: () => {
            warnedMissingAppId = false;
            lastRpcKey = "";
        }
    },
    rpcName: {
        type: OptionType.STRING,
        description: "Rich Presence app name.",
        default: DEFAULT_SETTINGS.rpcName
    },
    rpcShowWhenPaused: {
        type: OptionType.BOOLEAN,
        description: "Keep the Rich Presence card visible while Spotify is paused.",
        default: DEFAULT_SETTINGS.rpcShowWhenPaused
    },
    rpcShowAlbumArt: {
        type: OptionType.BOOLEAN,
        description: "Show the song cover on Rich Presence.",
        default: DEFAULT_SETTINGS.rpcShowAlbumArt
    },
    rpcShowPluginButton: {
        type: OptionType.BOOLEAN,
        description: "Add a \"Using DiscordLyrics\" button linking to the plugin's GitHub. Discord allows 2 buttons and Spicy Lyrics credits come first, so it is skipped when both are taken. Others see it; Discord hides your own buttons from you.",
        default: DEFAULT_SETTINGS.rpcShowPluginButton
    },
    windowsMediaFallback: {
        type: OptionType.BOOLEAN,
        description: "Read Spotify from Windows media controls when Discord has no Spotify data (e.g. account not linked).",
        default: DEFAULT_SETTINGS.windowsMediaFallback
    },
    lyricsProxy: {
        type: OptionType.STRING,
        description: "Proxy for lyrics requests. Empty = Windows system proxy, same as Discord (works with Clash, v2rayN etc. in system proxy mode). Or http://127.0.0.1:7890, socks5://127.0.0.1:1080, or \"direct\".",
        default: ""
    },
    debugLogging: {
        type: OptionType.BOOLEAN,
        description: "Write a debug log to %APPDATA%\\DiscordLyrics\\debug.log (capped at 1 MB).",
        default: DEFAULT_SETTINGS.debugLogging
    },
    activitySharingNotice: {
        type: OptionType.COMPONENT,
        component: ActivitySharingNotice
    },
    version: {
        type: OptionType.COMPONENT,
        component: () => React.createElement("div", {
            style: { color: "var(--text-muted)", fontSize: "12px" }
        }, `DiscordLyrics ${RELEASE_VERSION}`)
    },
    resetToDefaults: {
        type: OptionType.COMPONENT,
        component: () => React.createElement(Button, {
            color: Button.Colors.RED,
            onClick: resetPluginDefaults
        }, "Reset DiscordLyrics Defaults")
    }
});

function cleanText(value: unknown) {
    return String(value ?? "").replace(/\s+/g, " ").trim();
}

function getLyricsProxy() {
    return cleanText(settings.store.lyricsProxy);
}

// Discord → Settings → Activity Privacy → "Share your activity". When it's off, every Rich Presence card is visible
// only to yourself (CustomRPC warns about the same thing).
function isActivitySharingOn() {
    try {
        return getStatusSetting("showCurrentGame")?.getSetting() !== false;
    } catch {
        return true;
    }
}

function ActivitySharingNotice() {
    const setting = getStatusSetting("showCurrentGame");
    const enabled = setting?.useSetting() !== false;
    if (!setting || enabled || !settings.store.enableRpc) return null;

    return React.createElement("div", {
        style: {
            display: "grid",
            gap: "8px",
            padding: "12px",
            borderRadius: "8px",
            border: "1px solid var(--status-danger)",
            color: "var(--text-normal)"
        }
    },
        React.createElement("div", null, "Activity Sharing is off in Discord's privacy settings, so nobody but you sees the Rich Presence card, its buttons or the lyrics credits. Spicy Lyrics stays off until it's enabled."),
        React.createElement(Button, { onClick: () => void setting.updateSetting(true) }, "Enable Activity Sharing")
    );
}

let warnedActivitySharingOff = false;

function cleanDescription(value: unknown) {
    return cleanText(String(value ?? "")
        .replace(/<br\s*\/?>/gi, " ")
        .replace(/<[^>]+>/g, " ")
        .replace(/&amp;/g, "&")
        .replace(/&quot;/g, "\"")
        .replace(/&#39;/g, "'")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">"));
}

function getStoredNumber(key: keyof typeof DEFAULT_SETTINGS, fallback: number) {
    const value = Number((settings.store as Record<string, unknown>)[key] ?? fallback);
    return Number.isFinite(value) ? value : fallback;
}

function truncateStatus(value: string, fitBubble = true) {
    const statusLimit = Math.max(1, getStoredNumber("maxStatusLength", DEFAULT_SETTINGS.maxStatusLength));
    const maxLength = fitBubble ? Math.min(getStatusBubbleLimit(), statusLimit) : statusLimit;
    const text = cleanText(value);
    return shortenToWords(text, maxLength);
}

function getStatusBubbleLimit() {
    switch (settings.store.fontStyle as FontStyleId) {
        case "wide":
        case "fullwidth":
            return 24;
        case "script":
        case "scriptBold":
        case "fraktur":
        case "frakturBold":
        case "doubleStruck":
        case "serifBoldItalic":
        case "sansBoldItalic":
            return 34;
        case "mono":
        case "bold":
        case "boldItalic":
        case "sansBold":
        case "serifBold":
            return 38;
        case "uppercase":
            return 42;
        case "smallCaps":
        case "italic":
        case "sans":
        case "sansItalic":
        case "serifItalic":
        case "title":
        case "lowercase":
        case "normal":
        default:
            return 46;
    }
}

function shortenToWords(text: string, maxLength: number) {
    const chars = [...text];
    if (chars.length <= maxLength) return text;

    const suffix = "...";
    const limit = Math.max(1, maxLength - suffix.length);
    const cut = chars.slice(0, limit).join("").trimEnd();
    const wordCut = cut.replace(/\s+\S*$/, "").trimEnd();
    const shortened = wordCut.length >= Math.floor(limit * 0.55) ? wordCut : cut;

    return `${shortened.replace(/[,.!?;:-]+$/, "")}${suffix}`;
}

const FONT_RANGES = {
    fullwidth: { upper: 0xff21, lower: 0xff41, digit: 0xff10 },
    mono: { upper: 0x1d670, lower: 0x1d68a, digit: 0x1d7f6 },
    bold: { upper: 0x1d400, lower: 0x1d41a, digit: 0x1d7ce },
    italic: { upper: 0x1d434, lower: 0x1d44e },
    boldItalic: { upper: 0x1d468, lower: 0x1d482 },
    sans: { upper: 0x1d5a0, lower: 0x1d5ba, digit: 0x1d7e2 },
    sansItalic: { upper: 0x1d608, lower: 0x1d622 },
    sansBold: { upper: 0x1d5d4, lower: 0x1d5ee, digit: 0x1d7ec },
    sansBoldItalic: { upper: 0x1d63c, lower: 0x1d656 },
    serifBold: { upper: 0x1d400, lower: 0x1d41a, digit: 0x1d7ce },
    serifItalic: { upper: 0x1d434, lower: 0x1d44e },
    serifBoldItalic: { upper: 0x1d468, lower: 0x1d482 },
    script: { upper: 0x1d49c, lower: 0x1d4b6 },
    scriptBold: { upper: 0x1d4d0, lower: 0x1d4ea },
    fraktur: { upper: 0x1d504, lower: 0x1d51e },
    frakturBold: { upper: 0x1d56c, lower: 0x1d586 },
    doubleStruck: { upper: 0x1d538, lower: 0x1d552, digit: 0x1d7d8 }
} as const;

const FONT_EXCEPTIONS: Partial<Record<keyof typeof FONT_RANGES, Record<string, string>>> = {
    script: {
        B: "\u{212c}", E: "\u{2130}", F: "\u{2131}", H: "\u{210b}", I: "\u{2110}", L: "\u{2112}", M: "\u{2133}", R: "\u{211b}",
        e: "\u{212f}", g: "\u{210a}", o: "\u{2134}"
    },
    fraktur: {
        C: "\u{212d}", H: "\u{210c}", I: "\u{2111}", R: "\u{211c}", Z: "\u{2128}"
    },
    doubleStruck: {
        C: "\u{2102}", H: "\u{210d}", N: "\u{2115}", P: "\u{2119}", Q: "\u{211a}", R: "\u{211d}", Z: "\u{2124}"
    }
};

function styleAlphabet(value: string, style: keyof typeof FONT_RANGES) {
    const ranges = FONT_RANGES[style];
    const exceptions = FONT_EXCEPTIONS[style] ?? {};

    return [...value].map(char => {
        if (exceptions[char]) return exceptions[char];

        const code = char.charCodeAt(0);
        if (code >= 65 && code <= 90) return String.fromCodePoint(ranges.upper + code - 65);
        if (code >= 97 && code <= 122) return String.fromCodePoint(ranges.lower + code - 97);
        if ("digit" in ranges && code >= 48 && code <= 57) return String.fromCodePoint(ranges.digit + code - 48);
        if (style === "fullwidth" && char === " ") return " ";
        return char;
    }).join("");
}

function styleSmallCaps(value: string) {
    const letters: Record<string, string> = {
        a: "\u{1d00}", b: "\u{0299}", c: "\u{1d04}", d: "\u{1d05}", e: "\u{1d07}", f: "\u{a730}", g: "\u{0262}", h: "\u{029c}", i: "\u{026a}", j: "\u{1d0a}",
        k: "\u{1d0b}", l: "\u{029f}", m: "\u{1d0d}", n: "\u{0274}", o: "\u{1d0f}", p: "\u{1d18}", q: "\u{01eb}", r: "\u{0280}", s: "\u{a731}", t: "\u{1d1b}",
        u: "\u{1d1c}", v: "\u{1d20}", w: "\u{1d21}", x: "x", y: "\u{028f}", z: "\u{1d22}"
    };

    return [...value.toLowerCase()].map(char => letters[char] ?? char).join("");
}

function applyFontStyle(value: string) {
    const text = cleanText(value);
    switch (settings.store.fontStyle as FontStyleId) {
        case "uppercase": return text.toUpperCase();
        case "lowercase": return text.toLowerCase();
        case "title": return text.toLowerCase().replace(/(^|[\s"'(-])(\p{L})/gu, (_, before, char) => before + char.toUpperCase());
        case "wide": return [...text].join(" ");
        case "fullwidth": return styleAlphabet(text, "fullwidth");
        case "mono": return styleAlphabet(text, "mono");
        case "bold": return styleAlphabet(text, "bold");
        case "italic": return styleAlphabet(text, "italic");
        case "boldItalic": return styleAlphabet(text, "boldItalic");
        case "sans": return styleAlphabet(text, "sans");
        case "sansItalic": return styleAlphabet(text, "sansItalic");
        case "sansBold": return styleAlphabet(text, "sansBold");
        case "sansBoldItalic": return styleAlphabet(text, "sansBoldItalic");
        case "serifBold": return styleAlphabet(text, "serifBold");
        case "serifItalic": return styleAlphabet(text, "serifItalic");
        case "serifBoldItalic": return styleAlphabet(text, "serifBoldItalic");
        case "script": return styleAlphabet(text, "script");
        case "scriptBold": return styleAlphabet(text, "scriptBold");
        case "fraktur": return styleAlphabet(text, "fraktur");
        case "frakturBold": return styleAlphabet(text, "frakturBold");
        case "doubleStruck": return styleAlphabet(text, "doubleStruck");
        case "smallCaps": return styleSmallCaps(text);
        case "normal":
        default: return text;
    }
}

// fitBubble=false keeps up to Discord's 128-char limit instead of the ~46 chars the profile bubble fits;
// used for lines too fast to page through, where cutting them would lose the end of the line.
function formatStatus(value: string, styled = true, fitBubble = true) {
    return truncateStatus(styled ? applyFontStyle(value) : value, fitBubble);
}

function getTickMs() {
    return Math.max(150, getStoredNumber("updateIntervalMs", DEFAULT_SETTINGS.updateIntervalMs));
}

function restartTimer() {
    if (interval) clearInterval(interval);
    interval = setInterval(tick, getTickMs());
}

function getWaitingStatus() {
    return ".".repeat(Math.floor(Date.now() / 700) % 3 + 1);
}

function isWaitingStatus(status: string) {
    return /^\.{1,3}$/.test(status) || status === settings.store.loadingText || status === settings.store.noLyricsText;
}

function getCurrentCustomStatusText() {
    try {
        const value = getStatusSetting("customStatus")?.getSetting() as { text?: unknown; } | undefined;
        return cleanText(value?.text);
    } catch {
        return "";
    }
}

function forceRemoteStatus(status: string, reason: string) {
    if (!status || isWaitingStatus(status)) return;

    debugLog(`custom status force "${status}" ${reason}`);
    lastRemoteStatusText = undefined;
    setRemoteStatus(status, true);
}

let lastStatusResyncCheckAt = 0;

function ensureRemoteStatusMatches(status: string) {
    if (!status || isWaitingStatus(status)) return;
    // Runs every tick; checking (and possibly re-sending) at most every 30 s is plenty.
    if (Date.now() - lastStatusResyncCheckAt < 30000) return;
    lastStatusResyncCheckAt = Date.now();

    const currentStatus = getCurrentCustomStatusText();
    if (currentStatus !== status) {
        forceRemoteStatus(status, `actual="${currentStatus}"`);
        return;
    }
}

function setProfileStatus(text: string) {
    // Callers pass text already sized by formatStatus(); only enforce Discord's hard limit here.
    const status = truncateStatus(text, false);
    const waitingStatus = isWaitingStatus(status);

    if (status === lastStatusText) {
        ensureRemoteStatusMatches(status);
        return;
    }
    lastStatusText = status;
    debugLog(`local status "${status}"`);

    if (waitingStatus) {
        clearPendingWaitingRemoteStatus();
    } else if (getCurrentCustomStatusText() !== status && lastRemoteStatusText === status) {
        forceRemoteStatus(status, "cache-mismatch");
    } else {
        setRemoteStatus(status, true);
    }

    FluxDispatcher.dispatch({
        type: "LOCAL_ACTIVITY_UPDATE",
        activity: status ? {
            id: "custom",
            name: "Custom Status",
            state: status,
            type: ActivityType.CUSTOM_STATUS,
            flags: ActivityFlags.INSTANCE,
            created_at: Date.now()
        } satisfies Activity : null,
        socketId: STATUS_SOCKET_ID,
    });
}

function clearPendingWaitingRemoteStatus() {
    if (!isWaitingStatus(pendingRemoteStatusText)) return;

    pendingRemoteStatusText = lastRemoteStatusText ?? "";
    if (remoteStatusTimer) {
        clearTimeout(remoteStatusTimer);
        remoteStatusTimer = undefined;
    }
}

function setRemoteStatus(status: string, _urgent = false) {
    pendingRemoteStatusText = status;
    scheduleRemoteStatusFlush();
}

// Sends immediately when allowed, otherwise once when the rate limit window ends, with whatever
// status is pending at that moment. (The original reset the limit on "urgent" updates, so fast
// lyric changes bypassed it on every other line.)
function scheduleRemoteStatusFlush() {
    if (remoteStatusInFlight || remoteStatusTimer) return;

    const delay = Math.max(0, nextRemoteStatusAt - Date.now());
    if (delay === 0) {
        void flushRemoteStatus();
        return;
    }

    remoteStatusTimer = setTimeout(() => void flushRemoteStatus(), delay);
}

async function flushRemoteStatus() {
    if (remoteStatusInFlight) return;
    if (remoteStatusTimer) {
        clearTimeout(remoteStatusTimer);
        remoteStatusTimer = undefined;
    }

    const status = pendingRemoteStatusText;
    if (status === lastRemoteStatusText) return;

    remoteStatusInFlight = true;
    debugLog(`custom status update start "${status}"`);
    try {
        const customStatus = getStatusSetting("customStatus");
        if (!customStatus) throw new Error("status.customStatus setting was not found");

        const wasEmpty = !lastRemoteStatusText;
        await customStatus.updateSetting(status ? { text: status } : undefined);

        // Expiry and creation time only need to be written once, not with every lyric line (3 requests -> 1).
        if (status && !statusExpiryCleared) {
            await getStatusSetting("statusExpiresAtMs")?.updateSetting("0");
            statusExpiryCleared = true;
        }

        if (status && wasEmpty) {
            await getStatusSetting("statusCreatedAtMs")?.updateSetting({ value: String(Date.now()) });
        }

        lastRemoteStatusText = status;
        nextRemoteStatusAt = Date.now() + MIN_REMOTE_STATUS_INTERVAL_MS;
        debugLog(`custom status update ok "${status}"`);
    } catch (error) {
        nextRemoteStatusAt = Date.now() + getRetryAfterMs(error);
        debugLog(`custom status update failed "${status}" ${stringifyError(error)}`);
        console.warn("[SpotifyLyricsStatus] Discord rejected custom status update", error);
    } finally {
        remoteStatusInFlight = false;
        if (pendingRemoteStatusText !== lastRemoteStatusText) scheduleRemoteStatusFlush();
    }
}

function stringifyError(error: unknown) {
    if (error instanceof Error) return `${error.name}: ${error.message}`;

    const maybeError = error as { message?: unknown; status?: unknown; text?: unknown; body?: unknown; };
    if (maybeError?.message || maybeError?.status || maybeError?.text) {
        return `${String(maybeError.message ?? error)} status=${String(maybeError.status ?? "")} text=${String(maybeError.text ?? "")}`;
    }

    try {
        return JSON.stringify(error);
    } catch {
        return String(error);
    }
}

function getRetryAfterMs(error: unknown) {
    const maybeError = error as { retryAfter?: unknown; body?: { retry_after?: unknown; }; };
    const retryAfterSeconds = Number(maybeError.retryAfter ?? maybeError.body?.retry_after);
    return Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0
        ? Math.ceil(retryAfterSeconds * 1000)
        : MIN_REMOTE_STATUS_INTERVAL_MS;
}

function clearRpc() {
    if (!lastRpcKey) return;
    lastRpcKey = "";
    lastRpcStartedAt = 0;
    FluxDispatcher.dispatch({
        type: "LOCAL_ACTIVITY_UPDATE",
        activity: null,
        socketId: RPC_SOCKET_ID,
    });
}

function normalizeDurationMs(duration: unknown) {
    const value = Number(duration || 0);
    if (!Number.isFinite(value) || value <= 0) return 0;
    return value < 10000 ? Math.round(value * 1000) : Math.round(value);
}

function rawSpotifyTrackKey(track: SpotifyTrack | null | undefined) {
    if (!track?.name) return "";

    const artists = track.artists?.map(artist => artist.name).filter(Boolean).join(", ") ?? "";
    return [
        cleanText(track.type || (track.show ? "episode" : "track")).toLowerCase(),
        track.id ?? "",
        cleanText(track.name).toLowerCase(),
        cleanText(artists || track.show?.publisher || track.publisher).toLowerCase(),
        Math.round(normalizeDurationMs(track.duration_ms ?? track.duration) / 1000)
    ].join("|");
}

// Discord drops Rich Presence activities that don't belong to a real application: the original plugin sent
// application_id "0" (and Spotify-only "spotify:" image keys), so the card never reached anyone, you included.
// Every Vencord plugin whose activity is visible (CustomRPC, MusicRichPresence) uses a real application ID.
const BUILTIN_RPC_APP_ID = "";

function getRpcAppId() {
    const custom = cleanText(settings.store.rpcAppId);
    if (/^\d{16,21}$/.test(custom)) return custom;
    return /^\d{16,21}$/.test(BUILTIN_RPC_APP_ID) ? BUILTIN_RPC_APP_ID : "";
}

// Album art as an external asset of our application (mp:external/...), like MusicRichPresence does.
function getAlbumAsset(track: NormalizedTrack, appId: string) {
    if (!settings.store.rpcShowAlbumArt || !track.albumImage) return undefined;

    const cacheKey = `${appId}|${track.albumImage}`;
    if (albumAssetResolved.has(cacheKey)) return albumAssetResolved.get(cacheKey);

    if (!albumAssetCache.has(cacheKey)) {
        setBounded(albumAssetCache, cacheKey, ApplicationAssetUtils.fetchAssetIds(appId, [track.albumImage])
            .then(ids => {
                const asset = ids[0];
                setBounded(albumAssetResolved, cacheKey, asset);
                debugLog(`album art resolved "${track.albumImage}" -> "${asset ?? ""}"`);
                const current = getCurrentTrack();
                if (current && trackKey(current) === trackKey(track)) tick();
                return asset;
            })
            .catch(error => {
                console.warn("[SpotifyLyricsStatus] Could not fetch album art", error);
                setBounded(albumAssetResolved, cacheKey, undefined);
                return undefined;
            }));
    }

    return undefined;
}

let warnedMissingAppId = false;

function updateRpc(track: NormalizedTrack, paused = false) {
    if (!settings.store.enableRpc || (paused && !settings.store.rpcShowWhenPaused)) {
        clearRpc();
        return;
    }

    const appId = getRpcAppId();
    if (!appId) {
        if (!warnedMissingAppId) {
            warnedMissingAppId = true;
            debugLog("rich presence skipped: no Discord application ID (rpcAppId)");
        }
        clearRpc();
        return;
    }

    if (!isActivitySharingOn() && !warnedActivitySharingOff) {
        warnedActivitySharingOff = true;
        showToast("DiscordLyrics: Activity Sharing is off, only you can see the Rich Presence card", Toasts.Type.FAILURE);
        debugLog("activity sharing (status.showCurrentGame) is off: rich presence is local-only");
    }

    const fallbackImage = !track.albumImage ? requestFallbackAlbumImage(track, paused) : undefined;
    const rpcTrack = fallbackImage ? {
        ...track,
        albumImage: fallbackImage
    } : track;
    const largeImage = getAlbumAsset(rpcTrack, appId);
    const duration = normalizeDurationMs(rpcTrack.durationMs);
    const progress = Math.max(0, duration ? Math.min(track.progressMs, duration) : track.progressMs);
    const now = Date.now();
    const startedAt = paused || !duration ? 0 : now - progress;
    const credit = getLyricsCredit(Boolean(largeImage));
    const buttons = getRpcButtons(credit?.buttons ?? []);
    const key = `${appId}|${trackKey(rpcTrack)}|${paused}|${largeImage ?? ""}|${duration}|${credit?.provider ?? ""}|${credit?.coverUrl ?? ""}|${buttons.map(button => `${button.label}>${button.url}`).join("|")}`;
    const timingDrift = startedAt && lastRpcStartedAt ? Math.abs(startedAt - lastRpcStartedAt) : 0;
    if (key === lastRpcKey && (!startedAt || timingDrift < 5000)) return;
    lastRpcKey = key;
    lastRpcStartedAt = startedAt;

    const rpcName = settings.store.rpcName === "Spotify Lyrics"
        ? DEFAULT_SETTINGS.rpcName
        : settings.store.rpcName || DEFAULT_SETTINGS.rpcName;
    const activity: Activity = {
        application_id: appId,
        name: credit ? `${rpcName} · lyrics: ${credit.provider}` : rpcName,
        ...(buttons.length ? {
            buttons: buttons.map(button => button.label),
            metadata: { button_urls: buttons.map(button => button.url) }
        } : {}),
        details: paused ? `${settings.store.pausedPrefix}${rpcTrack.title}` : rpcTrack.title,
        state: getTrackSubtitle(rpcTrack),
        type: ActivityType.LISTENING,
        timestamps: paused || !duration ? undefined : {
            start: startedAt,
            end: startedAt + duration
        },
        assets: largeImage ? {
            large_image: largeImage,
            large_text: rpcTrack.album || rpcTrack.title,
            ...(credit?.coverUrl ? { large_url: credit.coverUrl } : {})
        } : undefined,
        status_display_type: ActivityStatusDisplayType.DETAILS,
        flags: ActivityFlags.INSTANCE
    };

    FluxDispatcher.dispatch({
        type: "LOCAL_ACTIVITY_UPDATE",
        activity,
        socketId: RPC_SOCKET_ID,
    });
    debugLog(`rpc update ${paused ? "paused" : "playing"} "${track.title}" progress=${Math.round(progress)}ms duration=${duration}ms start=${startedAt || ""} image=${largeImage ?? ""}`);
}

// Credit for the lyrics in the status, shown on the Rich Presence card (Spicy Lyrics terms: always name the provider;
// for community syncs also link the uploader and the maker). The header is visible to everyone including you; Discord
// hides your own activity buttons from you, but everyone else sees them.
function getLyricsCredit(hasCover: boolean) {
    const attribution = lyricsAttribution;
    if (!attribution) return undefined;

    const fitLabel = (text: string) => [...text].length <= 32 ? text : `${[...text].slice(0, 31).join("")}…`;
    const people = [
        attribution.uploader && { role: "Uploaded by", ...attribution.uploader },
        attribution.maker && { role: "Synced by", ...attribution.maker }
    ].filter(Boolean) as Array<{ role: string; username: string; url?: string; }>;
    const unique = people.filter((person, index) => people.findIndex(other => other.username === person.username) === index);

    // Two different people: name both on one button (linked to the uploader) and make the cover link to the maker,
    // which leaves the second button free. Only when both names fit and the maker's link has somewhere to go;
    // otherwise one button each, so nobody loses their credit or link.
    if (unique.length === 2) {
        const [uploader, maker] = unique;
        const combined = `Sync: @${uploader.username} & @${maker.username}`;
        if ([...combined].length <= 32 && (hasCover || !maker.url)) {
            return {
                provider: attribution.provider,
                buttons: [{ label: combined, url: uploader.url ?? "https://spicylyrics.org" }],
                coverUrl: maker.url
            };
        }
    }

    const buttons = unique.map(person => ({
        // Same person uploaded and synced: one button covers both.
        label: fitLabel(unique.length < people.length ? `Synced by @${person.username}` : `${person.role} @${person.username}`),
        url: person.url ?? "https://spicylyrics.org"
    }));

    return { provider: attribution.provider, buttons, coverUrl: undefined as string | undefined };
}

const PLUGIN_URL = "https://github.com/sh1guchi/DiscordLyrics";
const MAX_ACTIVITY_BUTTONS = 2; // Discord's limit

// Required lyrics credits always get their slots; the optional plugin link only takes a free one.
// When both are shown, the plugin link goes on top and the credit below it.
function getRpcButtons(creditButtons: Array<{ label: string; url: string; }>) {
    const credits = creditButtons.slice(0, MAX_ACTIVITY_BUTTONS);
    if (settings.store.rpcShowPluginButton && credits.length < MAX_ACTIVITY_BUTTONS) {
        return [{ label: "Using DiscordLyrics", url: PLUGIN_URL }, ...credits];
    }
    return credits;
}

function getTrackSubtitle(track: NormalizedTrack) {
    if (track.album && track.artist) return `${track.artist} - ${track.album}`;
    return track.artist || track.album || spotifyContentLabel(track);
}

function fallbackAlbumImageKey(track: NormalizedTrack) {
    return `${comparableMediaText(track.title)}|${comparableMediaText(firstArtist(track.artist))}|${comparableMediaText(track.album)}`;
}

async function lookupFallbackAlbumImage(track: NormalizedTrack) {
    const key = fallbackAlbumImageKey(track);
    if (!key.replace(/\|/g, "")) return undefined;
    if (fallbackAlbumImageCache.has(key)) return fallbackAlbumImageCache.get(key);
    if (fallbackAlbumImageRequests.has(key)) return fallbackAlbumImageRequests.get(key);

    const request = (async () => {
        try {
            const searchAlbumImage = Native?.searchAlbumImage as ((title: string, artist: string, album: string, proxy: string) => Promise<string>) | undefined;
            const url = searchAlbumImage ? cleanText(await searchAlbumImage(track.title, track.artist, track.album, getLyricsProxy())) : undefined;
            setBounded(fallbackAlbumImageCache, key, url);
            return url;
        } catch (error) {
            debugLog(`fallback album art failed ${stringifyError(error)}`);
            setBounded(fallbackAlbumImageCache, key, undefined);
            return undefined;
        } finally {
            fallbackAlbumImageRequests.delete(key);
        }
    })();

    fallbackAlbumImageRequests.set(key, request);
    return request;
}

function requestFallbackAlbumImage(track: NormalizedTrack, paused: boolean) {
    const key = fallbackAlbumImageKey(track);
    const cached = fallbackAlbumImageCache.get(key);
    if (cached) return cached;

    void lookupFallbackAlbumImage(track).then(url => {
        if (!url) return;

        const enriched = rememberSpotifyTrack({
            ...track,
            albumImage: url
        });
        if (windowsSpotifyTrack && trackKey(windowsSpotifyTrack) === trackKey(track)) {
            windowsSpotifyTrack = enriched;
            windowsSpotifyTrackReceivedAt = Date.now();
        }

        lastRpcKey = "";
        updateRpc(enriched, paused);
    });

    return undefined;
}

function normalizeWindowsSpotifyTrack(state: WindowsSpotifyState): NormalizedTrack | undefined {
    const media = state.track;
    const title = cleanText(media?.title);
    if (!title) return undefined;

    const status = cleanText(media?.status).toLowerCase();
    const progressMs = Number(media?.positionMs ?? 0) + getStoredNumber("lyricOffsetMs", DEFAULT_SETTINGS.lyricOffsetMs);

    const fallback = findLastKnownTrackForMedia(title, cleanText(media?.artist));

    return {
        id: "",
        title,
        artist: cleanText(media?.artist),
        album: cleanText(media?.album) || fallback?.album || "",
        albumImage: fallback?.albumImage || "",
        contentType: "track",
        description: "",
        durationMs: normalizeDurationMs(media?.durationMs) || fallback?.durationMs || 0,
        progressMs: Math.max(0, progressMs),
        isPlaying: status === "playing"
    };
}

function comparableMediaText(value: string) {
    return cleanComparable(value || "");
}

function findLastKnownTrackForMedia(title: string, artist: string) {
    if (!lastKnownSpotifyTrack) return undefined;

    const mediaTitle = comparableMediaText(title);
    const knownTitle = comparableMediaText(lastKnownSpotifyTrack.title);
    if (!mediaTitle || !knownTitle || mediaTitle !== knownTitle) return undefined;

    const mediaArtist = firstArtist(artist);
    const knownArtist = firstArtist(lastKnownSpotifyTrack.artist);
    if (mediaArtist && knownArtist && comparableMediaText(mediaArtist) !== comparableMediaText(knownArtist)) return undefined;

    return lastKnownSpotifyTrack;
}

function rememberSpotifyTrack(track: NormalizedTrack) {
    if (!track.albumImage && lastKnownSpotifyTrack) {
        const fallback = findLastKnownTrackForMedia(track.title, track.artist);
        if (fallback?.albumImage) {
            track = {
                ...track,
                id: track.id || fallback.id,
                album: track.album || fallback.album,
                albumImage: fallback.albumImage,
                durationMs: normalizeDurationMs(track.durationMs) || fallback.durationMs
            };
        }
    }

    lastKnownSpotifyTrack = track;
    lastKnownSpotifyTrackAt = Date.now();
    return track;
}

function discordHasSpotifyData() {
    if (SpotifyStore.track?.name) return true;
    return Boolean(spotifyState?.track && spotifyState.receivedAt && Date.now() - spotifyState.receivedAt < SPOTIFY_STATE_FRESH_MS);
}

// The native side keeps one long-lived PowerShell watcher and answers from memory, so this IPC call is cheap.
// The watcher stops by itself a minute after the last call, i.e. while Discord's own Spotify data is available.
async function pollWindowsSpotifyState(force = false) {
    if (!settings.store.windowsMediaFallback) return;

    const now = Date.now();
    if (windowsSpotifyPollInFlight || (!force && now - lastWindowsSpotifyPollAt < WINDOWS_SPOTIFY_POLL_INTERVAL_MS)) return;

    const getWindowsSpotifyState = Native?.getWindowsSpotifyState as (() => Promise<WindowsSpotifyState>) | undefined;
    if (!getWindowsSpotifyState) return;

    windowsSpotifyPollInFlight = true;
    lastWindowsSpotifyPollAt = now;

    try {
        const state = await getWindowsSpotifyState();
        if (!state?.ready) return; // watcher still starting up
        const receivedAt = Date.now() - Math.max(0, Number(state.ageMs) || 0);

        windowsSpotifyProcessRunning = Boolean(state.processRunning);
        if (windowsSpotifyProcessRunning) windowsSpotifyProcessSeenAt = receivedAt;
        const track = normalizeWindowsSpotifyTrack(state);

        if (track) {
            windowsSpotifyTrack = rememberSpotifyTrack(track);
            windowsSpotifyTrackReceivedAt = receivedAt;
            spotifyUnavailableAt = 0;
            debugLog(`windows spotify ${windowsSpotifyTrack.isPlaying ? "playing" : "paused"} "${windowsSpotifyTrack.title}" ${Math.round(windowsSpotifyTrack.progressMs)}ms`);
            tick();
            return;
        }

        if (!windowsSpotifyProcessRunning && Date.now() - windowsSpotifyProcessSeenAt > WINDOWS_SPOTIFY_PROCESS_GRACE_MS) {
            windowsSpotifyTrack = undefined;
            windowsSpotifyTrackReceivedAt = 0;
        }
    } catch (error) {
        debugLog(`windows spotify check failed ${stringifyError(error)}`);
    } finally {
        windowsSpotifyPollInFlight = false;
    }
}

function getCurrentTrack(): NormalizedTrack | undefined {
    const stateAge = spotifyState?.receivedAt ? Date.now() - spotifyState.receivedAt : Number.POSITIVE_INFINITY;
    const recentlyUnavailable = spotifyUnavailableAt > 0 && Date.now() - spotifyUnavailableAt < SPOTIFY_UNAVAILABLE_GRACE_MS;
    const stateTrack = spotifyState?.track ?? null;
    const storeTrack = SpotifyStore.track ?? null;
    const storePosition = Number(SpotifyStore.position ?? NaN);
    const storeHasPosition = Number.isFinite(storePosition) && storePosition >= 0;
    const storeRawKey = rawSpotifyTrackKey(storeTrack);
    const storeHasTrack = Boolean(storeTrack?.name)
        && (!recentlyUnavailable || Boolean(SpotifyStore.isPlaying) || (storeRawKey && storeRawKey !== lastTrackKey));
    const storeChangedTrack = storeHasTrack
        && Boolean(stateTrack?.name)
        && storeRawKey !== rawSpotifyTrackKey(stateTrack);
    const useState = Boolean(stateTrack && stateAge < SPOTIFY_STATE_FRESH_MS && !storeChangedTrack);
    const useStore = !useState && storeHasTrack;
    const track: SpotifyTrack | null = useStore ? storeTrack : useState ? stateTrack : null;
    if (!track) {
        if (windowsSpotifyTrack && Date.now() - windowsSpotifyTrackReceivedAt < WINDOWS_SPOTIFY_STATE_FRESH_MS) {
            // Advance the position between polls instead of freezing it at the last sample.
            const elapsed = windowsSpotifyTrack.isPlaying ? Date.now() - windowsSpotifyTrackReceivedAt : 0;
            const progressMs = windowsSpotifyTrack.progressMs + elapsed;
            return {
                ...windowsSpotifyTrack,
                progressMs: windowsSpotifyTrack.durationMs ? Math.min(progressMs, windowsSpotifyTrack.durationMs) : progressMs
            };
        }

        if (
            (windowsSpotifyProcessRunning || Date.now() - windowsSpotifyProcessSeenAt < WINDOWS_SPOTIFY_PROCESS_GRACE_MS)
            && lastKnownSpotifyTrack
            && Date.now() - lastKnownSpotifyTrackAt < LAST_KNOWN_SPOTIFY_TRACK_MS
        ) {
            return {
                ...lastKnownSpotifyTrack,
                isPlaying: false
            };
        }

        return undefined;
    }

    const isPlaying = useStore ? Boolean(SpotifyStore.isPlaying) : Boolean(spotifyState!.isPlaying);
    const statePosition = Number(spotifyState?.position || 0) + (isPlaying && spotifyState?.receivedAt ? Math.max(0, stateAge) : 0);
    const rawPosition = useStore && storeHasPosition ? storePosition : statePosition;
    const position = rawPosition + getStoredNumber("lyricOffsetMs", DEFAULT_SETTINGS.lyricOffsetMs);
    const artists = track.artists?.map(artist => artist.name).filter(Boolean).join(", ") ?? "";
    const contentType = cleanText(track.type || (track.show ? "episode" : "track")).toLowerCase();
    const creator = artists || cleanText(track.show?.publisher || track.publisher);
    const collection = cleanText(track.album?.name || track.show?.name);
    const albumImage = cleanText(
        track.album?.image?.url
        || track.album?.images?.[0]?.url
        || track.show?.images?.[0]?.url
        || track.images?.[0]?.url
    );
    const description = cleanDescription(track.description || track.html_description);

    const normalized = {
        id: track.id ?? "",
        title: cleanText(track.name),
        artist: creator,
        album: collection,
        albumImage,
        contentType,
        description,
        durationMs: normalizeDurationMs(track.duration_ms ?? track.duration),
        progressMs: Math.max(0, position),
        isPlaying
    };

    rememberSpotifyTrack(normalized);
    return normalized;
}

async function pollSpotifyPlayer(force = false) {
    const now = Date.now();
    if (!force && now < spotifyPollMutedUntil) return;
    if (spotifyPollInFlight || (!force && now - lastSpotifyPollAt < SPOTIFY_POLL_INTERVAL_MS)) return;

    const request = (SpotifyStore as unknown as {
        _req?: (method: "get", route: string) => Promise<{
            is_playing?: boolean;
            progress_ms?: number;
            item?: {
                id?: string;
                name?: string;
                duration_ms?: number;
                type?: string;
                publisher?: string;
                description?: string;
                html_description?: string;
                images?: Array<{ url?: string; height?: number; width?: number; }>;
                album?: {
                    name?: string;
                    images?: Array<{ url?: string; height?: number; width?: number; }>;
                };
                artists?: Array<{ name?: string; }>;
                show?: SpotifyShow;
            } | null;
        } | null>;
    })._req;

    if (!request) return;

    spotifyPollInFlight = true;
    lastSpotifyPollAt = now;

    try {
        const player = await request.call(SpotifyStore, "get", "/currently-playing");
        if (!player?.item) {
            const stateAge = spotifyState?.receivedAt ? Date.now() - spotifyState.receivedAt : Number.POSITIVE_INFINITY;
            if ((spotifyState?.track && stateAge < SPOTIFY_STATE_FRESH_MS) || SpotifyStore.track?.name) {
                return;
            }

            spotifyState = undefined;
            spotifyUnavailableAt = Date.now();
            tick();
            return;
        }

        const image = player.item.album?.images?.[0];
        spotifyUnavailableAt = 0;
        spotifyState = {
            track: {
                id: player.item.id ?? null,
                name: player.item.name ?? "",
                duration: Number(player.item.duration_ms || 0),
                duration_ms: Number(player.item.duration_ms || 0),
                type: player.item.type,
                publisher: player.item.publisher,
                description: player.item.description,
                html_description: player.item.html_description,
                album: {
                    name: player.item.album?.name ?? "",
                    image: image ? { url: image.url } : undefined,
                    images: player.item.album?.images
                },
                artists: player.item.artists?.map(artist => ({ name: artist.name ?? "" })) ?? [],
                show: player.item.show,
                images: player.item.images
            },
            isPlaying: Boolean(player.is_playing),
            position: Number(player.progress_ms || 0),
            receivedAt: Date.now()
        };

        debugLog(`spotify poll ${spotifyState.isPlaying ? "playing" : "paused"} "${spotifyState.track?.name ?? ""}" ${spotifyState.position}ms`);
        tick();
    } catch (error) {
        debugLog(`spotify poll failed ${stringifyError(error)}`);
        spotifyPollMutedUntil = Date.now() + SPOTIFY_POLL_ERROR_MUTE_MS;
    } finally {
        spotifyPollInFlight = false;
    }
}

function trackKey(track: NormalizedTrack) {
    return [
        track.contentType,
        track.id,
        track.title.toLowerCase(),
        track.artist.toLowerCase(),
        Math.round(track.durationMs / 1000)
    ].join("|");
}

function supportsSyncedLyrics(track: NormalizedTrack) {
    return !track.contentType || track.contentType === "track" || track.contentType === "song";
}

function clearProfileStatusForTrackChange() {
    lastStatusText = "";
    setRemoteStatus("", true);
    FluxDispatcher.dispatch({
        type: "LOCAL_ACTIVITY_UPDATE",
        activity: null,
        socketId: STATUS_SOCKET_ID,
    });
}

function prepareTrack(track: NormalizedTrack) {
    const key = trackKey(track);
    if (key === lastTrackKey) return false;

    debugLog(`track change "${track.title}"`);
    lastTrackKey = key;
    applyLoadedLyrics({ lines: [] });
    clearProfileStatusForTrackChange();

    if (supportsSyncedLyrics(track)) {
        loadingTrackKey = key;
        void loadLyrics(track);
    } else {
        loadingTrackKey = "";
    }

    return true;
}

function spotifyContentLabel(track: NormalizedTrack) {
    switch (track.contentType) {
        case "episode": return "Podcast";
        case "show": return "Podcast";
        case "audiobook": return "Audiobook";
        case "chapter": return "Audiobook";
        default: return "Spotify";
    }
}

function nonSongStatus(track: NormalizedTrack) {
    if (track.description) {
        const chunks = splitLyricChunks(track.description);
        const chunkMs = Math.max(3500, Math.min(8000, Math.floor((track.durationMs || chunks.length * 5000) / chunks.length)));
        const index = Math.min(chunks.length - 1, Math.floor(track.progressMs / chunkMs));
        return formatStatus(chunks[index]);
    }

    const label = spotifyContentLabel(track);
    return track.artist ? `${label} - ${track.title}` : `${label} - ${track.title}`;
}

function parseSyncedLyrics(raw: string): LyricLine[] {
    return raw
        .split(/\r?\n/)
        .map(line => {
            const match = line.match(/^\[(\d{1,2}):(\d{2})(?:\.(\d{1,3}))?\]\s*(.*)$/);
            if (!match) return null;

            const minutes = Number(match[1]);
            const seconds = Number(match[2]);
            const millis = Number((match[3] || "0").padEnd(3, "0").slice(0, 3));
            const text = cleanText(match[4]).replace(/\s*\[[^\]]+\]\s*/g, " ");
            return text ? { timeMs: minutes * 60000 + seconds * 1000 + millis, text } : null;
        })
        .filter(Boolean)
        .sort((a, b) => a!.timeMs - b!.timeMs) as LyricLine[];
}

function parsePlainLyrics(raw: string, durationMs: number): LyricLine[] {
    const lines = raw.split(/\r?\n/).map(cleanText).filter(Boolean);
    if (!lines.length) return [];

    const usableDuration = Math.max(30000, durationMs || lines.length * 3500);
    const introMs = Math.min(16000, Math.max(8000, Math.round(usableDuration * 0.05)));
    const stepMs = Math.max(1800, Math.round((usableDuration - introMs) / lines.length));

    return lines.map((text, index) => ({
        timeMs: introMs + index * stepMs,
        text
    }));
}

async function nativeFetchJson<T>(url: string): Promise<{ status: number; data: T | null; }> {
    if (Native?.fetchJson) return await Native.fetchJson(url, getLyricsProxy()) as { status: number; data: T | null; };

    const response = await fetch(url, {
        signal: fetchController?.signal,
        headers: { Accept: "application/json" }
    });

    return {
        status: response.status,
        data: response.status === 404 ? null : await response.json()
    };
}

async function fetchLyrics(url: string): Promise<LrcLibResult | null> {
    const response = await nativeFetchJson<LrcLibResult>(url);
    if (response.status === 404) return null;
    if (response.status < 200 || response.status >= 300) throw new Error(`LRCLIB returned ${response.status}`);
    return response.data;
}

async function searchLyrics(track: NormalizedTrack): Promise<LrcLibResult | null> {
    const queries = [
        `${track.title} ${track.artist}`,
        `${stripFeatureText(track.title)} ${firstArtist(track.artist)}`,
        `${stripFeatureText(track.title)} ${track.artist}`
    ];

    for (const query of queries) {
        const params = new URLSearchParams({ q: query });
        const response = await nativeFetchJson<LrcLibResult[]>(`https://lrclib.net/api/search?${params}`);
        if (response.status < 200 || response.status >= 300 || !Array.isArray(response.data)) continue;

        const best = response.data
            .filter(result => result.syncedLyrics || result.synced_lyrics || (settings.store.usePlainLyricsFallback && result.plainLyrics))
            .map(result => ({ result, score: scoreLyricsResult(result, track) }))
            .sort((a, b) => b.score - a.score)[0];

        // Needs a title match plus artist/duration evidence, so another song by the same artist isn't picked.
        if (best && best.score >= 8) return best.result;
    }

    return null;
}

// ---- Spicy Lyrics (https://developers.spicylyrics.org) ----

const SPICY_PROVIDERS: Record<string, string> = {
    spicy_lyrics: "Spicy Lyrics",
    apple_music: "Apple Music",
    spotify: "Spotify"
};

function getSpicyKey() {
    const key = cleanText(settings.store.spicyLyricsKey);
    return /^sl_sk_\S+$/.test(key) ? key : "";
}

// Spicy's terms require crediting the source next to the lyrics; this plugin does that on the Rich Presence card,
// so without a card others can actually see (Rich Presence on + a real application ID) Spicy isn't used at all.
function canUseSpicy(track: NormalizedTrack) {
    const key = getSpicyKey();
    return Boolean(key)
        && key !== spicyRejectedKey
        && settings.store.enableRpc
        && Boolean(getRpcAppId())
        && isActivitySharingOn()
        && /^[A-Za-z0-9]{22}$/.test(track.id)
        && Date.now() >= spicyMutedUntil;
}

function spicyPerson(person: SpicyPerson | undefined) {
    const username = cleanText(person?.username);
    if (!username) return undefined;
    const url = cleanText(person?.url);
    return { username, url: /^https:\/\//.test(url) ? url : undefined };
}

function parseSpicyLines(body: SpicyBody): { lines: LyricLine[]; synced: boolean; } {
    if (body.Type === "Syllable") {
        const lines: LyricLine[] = [];
        for (const entry of body.Content ?? []) {
            // IsPartOfWord = this syllable joins the next one without a space.
            const words: Array<{ text: string; startMs: number; endMs: number; }> = [];
            let current: { text: string; startMs: number; endMs: number; } | undefined;
            for (const syllable of entry.Lead?.Syllables ?? []) {
                current ??= { text: "", startMs: Number(syllable.StartTime ?? 0) * 1000, endMs: 0 };
                current.text += String(syllable.Text ?? "");
                current.endMs = Number(syllable.EndTime ?? 0) * 1000; // a word ends with its last syllable
                if (!syllable.IsPartOfWord) {
                    words.push(current);
                    current = undefined;
                }
            }
            if (current) words.push(current);

            const flat = words.flatMap(word => cleanText(word.text).split(" ").filter(Boolean).map(text => ({ text, startMs: word.startMs, endMs: word.endMs })));
            if (!flat.length) continue;
            lines.push({
                timeMs: Number(entry.Lead?.StartTime ?? flat[0].startMs / 1000) * 1000,
                text: flat.map(word => word.text).join(" "),
                wordTimesMs: flat.map(word => word.startMs),
                // Missing/invalid end time: assume the word lasts until the next one starts.
                wordEndTimesMs: flat.map((word, i) => word.endMs > word.startMs ? word.endMs : (flat[i + 1]?.startMs ?? word.startMs))
            });
        }
        return { lines: lines.sort((a, b) => a.timeMs - b.timeMs), synced: true };
    }

    if (body.Type === "Line") {
        const lines = (body.Content ?? [])
            .map(entry => ({ timeMs: Number(entry.StartTime ?? 0) * 1000, text: cleanText(entry.Text) }))
            .filter(line => line.text)
            .sort((a, b) => a.timeMs - b.timeMs);
        return { lines, synced: true };
    }

    // "Static": text without timings.
    const lines = (body.Lines ?? []).map(line => ({ timeMs: 0, text: cleanText(line.Text) })).filter(line => line.text);
    return { lines, synced: false };
}

async function fetchSpicyLyrics(track: NormalizedTrack): Promise<LoadedLyrics | null> {
    const fetchNative = Native?.fetchSpicyLyrics as ((trackId: string, key: string, proxy: string) => Promise<{ status: number; data: { Body?: SpicyBody; } | null; retryAfter?: number; }>) | undefined;
    if (!fetchNative) return null;

    const key = getSpicyKey();
    const response = await fetchNative(track.id, key, getLyricsProxy());

    if (response.status === 401 || response.status === 403) {
        spicyRejectedKey = key;
        showToast("DiscordLyrics: Spicy Lyrics rejected the API key, using LRCLIB", Toasts.Type.FAILURE);
        return null;
    }
    if (response.status === 429 || response.status >= 500 || response.status < 0) {
        const retryAfterMs = Number(response.retryAfter) > 0 ? Number(response.retryAfter) * 1000 : 0;
        spicyMutedUntil = Date.now() + Math.max(retryAfterMs, response.status === 429 ? 60000 : 30000);
        debugLog(`spicy lyrics unavailable status=${response.status}, muted for ${Math.round((spicyMutedUntil - Date.now()) / 1000)}s`);
        return null;
    }
    const body = response.data?.Body;
    if (response.status !== 200 || !body) return null;

    const attribution: LyricsAttribution = {
        provider: SPICY_PROVIDERS[cleanText(body.source)] ?? "unknown source",
        ...(body.source === "spicy_lyrics" ? {
            uploader: spicyPerson(body.UploadAttribution?.Uploader),
            maker: spicyPerson(body.UploadAttribution?.Maker)
        } : {})
    };
    // Unsynced ("Static") answers fall through to LRCLIB, which has its own plain-lyrics fallback.
    const { lines, synced } = parseSpicyLines(body);
    if (!lines.length || !synced) return null;
    return { lines, attribution };
}

async function fetchLrclibLyrics(track: NormalizedTrack): Promise<LoadedLyrics> {
    const params = new URLSearchParams({
        track_name: track.title,
        artist_name: track.artist
    });

    if (track.album) params.set("album_name", track.album);
    if (track.durationMs) params.set("duration", String(Math.round(track.durationMs / 1000)));

    const exact = await fetchLyrics(`https://lrclib.net/api/get?${params}`);
    const exactSynced = parseSyncedLyrics(exact?.syncedLyrics ?? exact?.synced_lyrics ?? "");
    if (exactSynced.length) return { lines: exactSynced };

    const found = await searchLyrics(track) ?? exact;
    const synced = parseSyncedLyrics(found?.syncedLyrics ?? found?.synced_lyrics ?? "");
    if (synced.length || !settings.store.usePlainLyricsFallback) return { lines: synced };

    return { lines: parsePlainLyrics(found?.plainLyrics ?? "", track.durationMs) };
}

function lyricsCacheKey(track: NormalizedTrack) {
    // Source-independent (Discord vs Windows data differ in id/duration) and aware of the settings that change the result.
    const spicy = canUseSpicy(track) ? `spicy:${track.id}` : "lrclib";
    return `${cleanComparable(track.title)}|${cleanComparable(firstArtist(track.artist))}|${settings.store.usePlainLyricsFallback ? "plain" : "synced"}|${spicy}`;
}

function applyLoadedLyrics(loaded: LoadedLyrics) {
    lyrics = loaded.lines;
    lyricsAttribution = loaded.lines.length ? loaded.attribution : undefined;
}

async function loadLyrics(track: NormalizedTrack) {
    fetchController?.abort();
    fetchController = new AbortController();

    const key = trackKey(track);
    const cacheKey = lyricsCacheKey(track);
    const cached = lyricsCache.get(cacheKey);
    if (cached) {
        setBounded(lyricsCache, cacheKey, cached, LYRICS_CACHE_LIMIT);
        // Called synchronously from prepareTrack(); the caller's tick picks the lyrics up right away.
        if (loadingTrackKey === key && key === lastTrackKey) {
            applyLoadedLyrics(cached);
            loadingTrackKey = "";
        }
        return;
    }

    try {
        let loaded: LoadedLyrics | null = null;

        if (canUseSpicy(track)) {
            try {
                loaded = await fetchSpicyLyrics(track);
            } catch (error) {
                debugLog(`spicy lyrics failed ${stringifyError(error)}`);
            }
        }

        loaded ??= await fetchLrclibLyrics(track);

        // Session-only memory cache, well inside Spicy's 30-day storage limit.
        setBounded(lyricsCache, cacheKey, loaded, LYRICS_CACHE_LIMIT);
        if (loadingTrackKey !== key || key !== lastTrackKey) return;

        applyLoadedLyrics(loaded);
        loadingTrackKey = "";
        tick();
    } catch (error) {
        if ((error as Error).name === "AbortError") return;
        console.warn("[SpotifyLyricsStatus] Could not load lyrics", error);
        if (loadingTrackKey === key && key === lastTrackKey) {
            applyLoadedLyrics({ lines: [] });
            loadingTrackKey = "";
            tick();
        }
    }
}

function scoreLyricsResult(result: LrcLibResult, track: NormalizedTrack) {
    let score = 0;
    const resultTitle = cleanComparable(result.trackName);
    const resultArtist = cleanComparable(result.artistName);
    const resultAlbum = cleanComparable(result.albumName);
    const title = cleanComparable(track.title);
    // firstArtist must run before cleanComparable, which strips the "," and "&" it splits on.
    const artist = cleanComparable(firstArtist(track.artist));
    const album = cleanComparable(track.album);

    if (title && resultTitle === title) score += 8;
    else if (title && resultTitle && (resultTitle.includes(title) || title.includes(resultTitle))) score += 4;
    else return 0;

    if (artist && resultArtist.includes(artist)) score += 4;
    if (album && resultAlbum === album) score += 2;

    if (track.durationMs && result.duration) {
        const diff = Math.abs(result.duration - Math.round(track.durationMs / 1000));
        if (diff <= 2) score += 4;
        else if (diff <= 8) score += 2;
    }

    return score;
}

function stripFeatureText(value: string) {
    // "with" only inside brackets, so titles like "Song - With You" keep their words.
    return value
        .replace(/\s*[([]\s*(feat\.?|ft\.?|with)\s+[^)\]]*[)\]]/ig, "")
        .replace(/\s*-\s*(feat\.?|ft\.?)\s.*$/i, "")
        .replace(/\s*\([^)]*(remaster|sped up|slowed|nightcore|version)[^)]*\)/ig, "")
        .replace(/\s*-\s*[^-]*(remaster|sped up|slowed|nightcore)[^-]*$/i, "")
        .trim();
}

function firstArtist(value: string) {
    return cleanText(value).split(/,|&| x | feat\.?| ft\.?/i)[0]?.trim() ?? "";
}

function cleanComparable(value: unknown) {
    return stripFeatureText(cleanText(value))
        .toLowerCase()
        .replace(/[^\p{L}\p{N}\s]/gu, "")
        .replace(/\s+/g, " ")
        .trim();
}

function getLyricChunkLimit() {
    switch (settings.store.fontStyle as FontStyleId) {
        case "wide":
            return 13;
        case "fullwidth":
            return 20;
        default:
            return getStatusBubbleLimit();
    }
}

// Each page stays at least this long, so it survives the 1 s remote status rate limit and can be read.
const MIN_PAGE_MS = 1200;
const DISCORD_STATUS_MAX_LENGTH = 128;

// The same line is split several times per tick (4 ticks/s); cache the last result.
let lastChunkSplit: { text: string; maxLength: number; maxPages: number; chunks: string[]; } | undefined;

// Splits a line into pages of roughly equal length ("40 + 7 chars" becomes "24 + 23"), so the tail isn't a
// lone word. With maxPages, pages may grow past the bubble limit (up to 128) to fit in fewer pages.
function splitLyricChunks(text: string, maxPages = Infinity) {
    const maxLength = Math.max(8, getLyricChunkLimit());
    if (lastChunkSplit?.text === text && lastChunkSplit.maxLength === maxLength && lastChunkSplit.maxPages === maxPages) {
        return lastChunkSplit.chunks;
    }

    let chunks = computeLyricChunks(text, maxLength);
    if (chunks.length > 1) {
        const pages = Math.max(1, Math.min(chunks.length, maxPages));
        const widest = pages < chunks.length ? DISCORD_STATUS_MAX_LENGTH : maxLength;
        const totalLength = [...cleanText(text)].length;
        for (let width = Math.ceil(totalLength / pages); width <= widest; width++) {
            const candidate = computeLyricChunks(text, width);
            if (candidate.length <= pages) {
                chunks = candidate;
                break;
            }
        }
    }

    lastChunkSplit = { text, maxLength, maxPages, chunks };
    return chunks;
}

function computeLyricChunks(text: string, maxLength: number) {
    const words = cleanText(text).split(" ").filter(Boolean);
    const chunks: string[] = [];
    let current = "";

    for (const word of words) {
        const candidate = current ? `${current} ${word}` : word;
        if ([...candidate].length <= maxLength) {
            current = candidate;
            continue;
        }

        if (current) chunks.push(current);

        if ([...word].length <= maxLength) {
            current = word;
            continue;
        }

        const letters = [...word];
        for (let index = 0; index < letters.length; index += maxLength) {
            chunks.push(letters.slice(index, index + maxLength).join(""));
        }
        current = "";
    }

    if (current) chunks.push(current);
    return chunks.length ? chunks : [cleanText(text)];
}

function getGapThresholdMs() {
    return Math.max(3000, getStoredNumber("gapThresholdMs", DEFAULT_SETTINGS.gapThresholdMs));
}

function estimatedPageCount(text: string) {
    return Math.max(1, Math.ceil([...cleanText(text)].length / Math.max(8, getLyricChunkLimit())));
}

// Before a long instrumental gap the line is replaced by waiting dots; keep it up long enough to page through.
function waitingDotsAfterMs(text: string, gapMs: number) {
    return Math.min(gapMs - 250, Math.max(2600, estimatedPageCount(text) * (MIN_PAGE_MS + 400)));
}

// How long the line is actually on screen: until the next line, or until waiting dots take over.
function lineDisplayMs(line: ActiveLyricLine) {
    if (line.nextTimeMs === undefined) return Math.max(3000, estimatedPageCount(line.text) * 2200);

    const gapMs = line.nextTimeMs - line.timeMs;
    if (settings.store.showWaitingDots && gapMs >= getGapThresholdMs()) return waitingDotsAfterMs(line.text, gapMs);
    return gapMs;
}

interface PagePlan {
    chunks: string[];
    // When each page appears, relative to the line start (in progress time, which includes lyricOffsetMs).
    starts: number[];
    fitsBubble: boolean;
}

// lyricAt() hands out a fresh object every tick, so cache by content rather than identity.
let lastPagePlan: { key: string; plan: PagePlan; } | undefined;

function lyricPageForStatus(line: ActiveLyricLine, progressMs: number) {
    const { chunks, starts, fitsBubble } = planPages(line);

    // progressMs already includes lyricOffsetMs, and so does the moment the line appeared, so time on screen is
    // simply progress - line start. (The original also subtracted the offset here, which cut the last 650 ms of
    // every line's page schedule; together with weight-based timing that pushed the last page into that cut.)
    const elapsedMs = Math.max(0, progressMs - line.timeMs);
    let index = 0;
    for (let page = 1; page < chunks.length; page++) {
        if (elapsedMs >= starts[page]) index = page;
    }
    return formatStatus(chunks[index], true, fitsBubble);
}

function planPages(line: ActiveLyricLine): PagePlan {
    const displayMs = lineDisplayMs(line);
    const limit = Math.max(8, getLyricChunkLimit());
    const offsetMs = Math.max(0, getStoredNumber("lyricOffsetMs", DEFAULT_SETTINGS.lyricOffsetMs));
    const key = `${line.timeMs}|${line.nextTimeMs}|${displayMs}|${limit}|${offsetMs}|${line.text}`;
    if (lastPagePlan?.key === key) return lastPagePlan.plan;

    // Most pages that fit the time; with word sync, fewer (wider) pages when waiting for words to finish would
    // leave a page on screen for less than MIN_PAGE_MS. One page always works.
    let plan: PagePlan | undefined;
    for (let pages = Math.max(1, Math.floor(displayMs / MIN_PAGE_MS)); pages >= 1 && !plan; pages--) {
        const chunks = splitLyricChunks(line.text, pages);
        const starts = pageStartTimes(line, chunks, displayMs, offsetMs);
        if (starts) plan = { chunks, starts, fitsBubble: chunks.every(chunk => [...chunk].length <= limit) };
    }
    plan ??= { chunks: [line.text], starts: [0], fitsBubble: [...line.text].length <= limit };

    lastPagePlan = { key, plan };
    return plan;
}

// Page start times relative to the line start, or null if this split doesn't work.
// With word-level sync a page appears when its first word is sung, but never before the last word of the previous
// page has finished (in real song time, i.e. without the lyricOffsetMs head start), and every page has to stay up
// at least MIN_PAGE_MS. Without word sync, pages share the time equally.
function pageStartTimes(line: ActiveLyricLine, chunks: string[], displayMs: number, offsetMs: number): number[] | null {
    const count = chunks.length;
    const wordsPerChunk = chunks.map(chunk => chunk.split(" ").length);
    const starts = [0];
    const words = line.wordTimesMs;
    const wordSynced = Boolean(words) && wordsPerChunk.reduce((sum, n) => sum + n, 0) === words!.length;

    if (!wordSynced) {
        for (let page = 1; page < count; page++) {
            const earliest = starts[page - 1] + MIN_PAGE_MS;
            const latest = displayMs - (count - page) * MIN_PAGE_MS;
            starts.push(Math.min(Math.max(page * displayMs / count, earliest), latest));
        }
        return starts;
    }

    const ends = line.wordEndTimesMs;
    let firstWord = 0;
    for (let page = 1; page < count; page++) {
        firstWord += wordsPerChunk[page - 1];
        const firstWordSung = words![firstWord] - line.timeMs;
        const previousWordDone = (ends?.[firstWord - 1] ?? words![firstWord]) - line.timeMs + offsetMs;
        starts.push(Math.max(firstWordSung, previousWordDone));
    }

    for (let page = 0; page < count; page++) {
        if ((starts[page + 1] ?? displayMs) - starts[page] < MIN_PAGE_MS) return null;
    }
    return starts;
}

function lyricAt(progressMs: number): ActiveLyricLine | undefined {
    if (!lyrics.length) return undefined;

    if (progressMs < lyrics[0].timeMs) return undefined;

    let low = 0;
    let high = lyrics.length - 1;
    let current = -1;

    while (low <= high) {
        const mid = Math.floor((low + high) / 2);
        if (lyrics[mid].timeMs <= progressMs) {
            current = mid;
            low = mid + 1;
        } else {
            high = mid - 1;
        }
    }

    if (current < 0) return undefined;

    const line = lyrics[current];
    const nextLine = lyrics[current + 1];
    if (settings.store.showWaitingDots && nextLine) {
        const gapMs = nextLine.timeMs - line.timeMs;
        if (gapMs >= getGapThresholdMs() && progressMs >= line.timeMs + waitingDotsAfterMs(line.text, gapMs)) {
            return undefined;
        }
    }

    return {
        ...line,
        nextTimeMs: nextLine?.timeMs
    };
}

function tick() {
    void pollSpotifyPlayer();
    if (!discordHasSpotifyData()) void pollWindowsSpotifyState();

    const track = getCurrentTrack();

    if (!track) {
        lastPlaybackPlaying = undefined;
        if (!windowsSpotifyProcessRunning && Date.now() - windowsSpotifyProcessSeenAt > WINDOWS_SPOTIFY_PROCESS_GRACE_MS) {
            lastTrackKey = "";
            loadingTrackKey = "";
            applyLoadedLyrics({ lines: [] });
            lastKnownSpotifyTrack = undefined;
            lastKnownSpotifyTrackAt = 0;
        }
        setProfileStatus("");
        clearRpc();
        return;
    }

    if (!track.isPlaying) {
        lastPlaybackPlaying = false;
        const pausedText = `${settings.store.pausedPrefix}${track.title}`;
        setProfileStatus(formatStatus(pausedText, false));
        updateRpc(track, true);
        return;
    }

    const resumedFromPause = lastPlaybackPlaying === false;
    lastPlaybackPlaying = true;

    const key = trackKey(track);
    if (key !== lastTrackKey) prepareTrack(track);

    updateRpc(track);

    if (!supportsSyncedLyrics(track)) {
        setProfileStatus(formatStatus(nonSongStatus(track)));
        return;
    }

    const lyric = lyricAt(track.progressMs);
    if (lyric) {
        setProfileStatus(lyricPageForStatus(lyric, track.progressMs));
        return;
    }

    if (settings.store.showWaitingDots) {
        if (resumedFromPause) {
            debugLog("play resumed before next lyric; clearing remote pause status");
            setRemoteStatus("", true);
        }
        setProfileStatus(getWaitingStatus());
    } else if (lastTrackKey === loadingTrackKey) {
        if (resumedFromPause) {
            debugLog("play resumed while loading lyrics; clearing remote pause status");
            setRemoteStatus("", true);
        }
        setProfileStatus(formatStatus(settings.store.loadingText, false));
    } else {
        if (resumedFromPause) {
            debugLog("play resumed with no lyric; clearing remote pause status");
            setRemoteStatus("", true);
        }
        setProfileStatus(formatStatus(settings.store.noLyricsText, false));
    }
}

function onSpotifyPlayerState(event: SpotifyStateEvent) {
    if (!event?.track) {
        spotifyState = undefined;
        spotifyUnavailableAt = Date.now();
        debugLog("spotify event cleared");
        void pollWindowsSpotifyState(true).then(() => tick());
        return;
    }

    spotifyUnavailableAt = 0;
    spotifyState = { ...event, receivedAt: Date.now() };
    debugLog(`spotify event ${event.isPlaying ? "playing" : "paused"} "${event.track?.name ?? ""}" ${event.position}ms`);
    const track = getCurrentTrack();
    if (track) rememberSpotifyTrack(track);
    if (track?.isPlaying) prepareTrack(track);
    tick();
}

function clearStatusForShutdown() {
    pendingRemoteStatusText = "";
    lastStatusText = "";
    setProfileStatus("");
    void flushRemoteStatus();
    clearRpc();
}

updatePluginAuthor();

export default definePlugin({
    name: "DiscordLyrics",
    description: "Sets your profile status to synced Spotify lyrics and shows a Spotify song RPC.",
    authors: [pluginAuthor],
    tags: ["Media"],
    dependencies: ["SpotifyControls", "UserSettingsAPI"],
    settings,

    start() {
        updatePluginAuthor();
        FluxDispatcher.subscribe("SPOTIFY_PLAYER_STATE", onSpotifyPlayerState);
        window.addEventListener("beforeunload", clearStatusForShutdown);
        window.addEventListener("pagehide", clearStatusForShutdown);
        restartTimer();
        logStatusUserSettings();
        setRemoteStatus("");
        void pollSpotifyPlayer(true);
        tick();
        showToast("DiscordLyrics started", Toasts.Type.SUCCESS);
    },

    stop() {
        if (interval) clearInterval(interval);
        if (remoteStatusTimer) clearTimeout(remoteStatusTimer);
        interval = undefined;
        remoteStatusTimer = undefined;
        FluxDispatcher.unsubscribe("SPOTIFY_PLAYER_STATE", onSpotifyPlayerState);
        window.removeEventListener("beforeunload", clearStatusForShutdown);
        window.removeEventListener("pagehide", clearStatusForShutdown);
        fetchController?.abort();
        fetchController = undefined;
        void (Native?.stopWindowsSpotifyWatcher?.() as Promise<void> | undefined)?.catch(() => void 0);
        statusSettingCache.clear();
        statusExpiryCleared = false;
        spotifyState = undefined;
        windowsSpotifyTrack = undefined;
        windowsSpotifyTrackReceivedAt = 0;
        windowsSpotifyProcessRunning = false;
        lastKnownSpotifyTrack = undefined;
        lastKnownSpotifyTrackAt = 0;
        applyLoadedLyrics({ lines: [] });
        lastTrackKey = "";
        loadingTrackKey = "";
        lastPlaybackPlaying = undefined;
        clearStatusForShutdown();
    }
});
