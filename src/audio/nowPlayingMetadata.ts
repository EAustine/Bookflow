/**
 * nowPlayingMetadata — helper that produces the payload for the iOS lock
 * screen / Control Center / CarPlay now-playing widget.
 *
 * Per /docs/specs/b7_01_os_system_states.html, the lock-screen widget is
 * system-rendered: iOS pulls its content from `MPNowPlayingInfoCenter` and
 * the transport buttons fire callbacks registered on `MPRemoteCommandCenter`.
 * Bookflow only owns the metadata. `react-native-track-player` accepts a
 * `Track` object whose fields it forwards to those iOS APIs automatically,
 * so all we need is a single source of truth for shape + formatting.
 *
 * This module exports:
 *   - `NowPlayingMeta` — the canonical track metadata our app passes around.
 *   - `toTrackPlayerTrack(meta)` — converts to RN Track Player's Track shape.
 *
 * Keeping the conversion isolated means the swap to a different audio
 * library later is a single-file change, and unit tests can assert the
 * exact payload without booting native modules.
 */

export type NowPlayingMeta = {
  /** Unique track id — used for queue management and analytics. */
  id: string;
  /** Audio URL — HLS or progressive download. */
  url: string;
  /** Book title — shown as the lock screen "title" line. */
  bookTitle: string;
  /** Chapter label — shown as the lock screen "artist" line. */
  chapterLabel: string;
  /** Author — shown as the album line. Optional but recommended. */
  author?: string;
  /** Cover artwork URL (square preferred). */
  artworkUrl?: string;
  /** Total duration in seconds. */
  durationSec: number;
};

/**
 * The minimal shape that `react-native-track-player`'s `add()` method
 * accepts. We re-declare it locally so this module has zero runtime deps
 * on the audio library — useful for tests and for previewing on web.
 */
export type RNTrack = {
  id: string;
  url: string;
  title: string;
  artist: string;
  album?: string;
  artwork?: string;
  duration: number;
};

export function toTrackPlayerTrack(meta: NowPlayingMeta): RNTrack {
  return {
    id: meta.id,
    url: meta.url,
    title: meta.bookTitle,
    artist: meta.chapterLabel,
    ...(meta.author ? { album: meta.author } : {}),
    ...(meta.artworkUrl ? { artwork: meta.artworkUrl } : {}),
    duration: meta.durationSec,
  };
}

/**
 * Formats elapsed/remaining seconds as the lock screen widget displays them
 * (e.g. "4:12" and "-6:56"). Useful for the in-app preview surfaces.
 */
export function formatLockTimes(positionSec: number, durationSec: number) {
  const elapsed = clampSec(positionSec, 0, durationSec);
  const remaining = Math.max(0, durationSec - elapsed);
  return {
    elapsed: formatMMSS(elapsed),
    remaining: `-${formatMMSS(remaining)}`,
  };
}

function clampSec(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function formatMMSS(totalSec: number): string {
  const t = Math.floor(totalSec);
  const m = Math.floor(t / 60);
  const s = t % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}
