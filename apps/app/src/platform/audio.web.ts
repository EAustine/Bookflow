/**
 * Audio playback on web — `HTMLAudioElement` plus the Media Session
 * API, which is §8's web implementation for this row. See `audio.ts`
 * for the contract.
 *
 * A real implementation rather than a deferral, because unlike offline
 * storage the browser already has everything this needs: an element
 * that streams and seeks, and a Media Session that puts title, artist
 * and artwork on the OS media controls — the same place the lock
 * screen shows them on a phone.
 *
 * Three differences from native worth knowing:
 *
 * 1. **`didJustFinish` is an event, not a flag.** Native raises it on
 *    the status update where the track ends. Here `ended` is its own
 *    event, so it is synthesised: one status emission carrying the
 *    flag, exactly once, matching what callers already expect.
 * 2. **Media Session is per-document, not per-player.** The browser
 *    has one, so a second player registering replaces the first rather
 *    than adding to it. That matches how the app behaves anyway — one
 *    book at a time — and `release()` clears it only if this player is
 *    still the one that owns it, so a fast page switch cannot have the
 *    outgoing player wipe the incoming one's controls.
 * 3. **Autoplay may be refused.** `play()` returns a promise the
 *    browser rejects outside a user gesture. Swallowed rather than
 *    thrown: the caller's own play button is a gesture, and the paths
 *    that resume automatically would otherwise fail in a way native
 *    never does.
 */

import type { AudioStatus, LockScreenMetadata } from './audio';

/** The player currently holding the document's Media Session, if any. */
let sessionOwner: object | null = null;

export const configureAudioSession: typeof import('./audio').configureAudioSession =
  async () => {
    // The browser owns the audio session: there is no silent switch to
    // override, no background mode to request, and mixing is the
    // user's business via their own tab controls.
  };

export const createPlayer: typeof import('./audio').createPlayer = (uri) => {
  const element = new Audio(uri);
  element.preload = 'auto';

  const identity = {};
  const listeners = new Set<(status: AudioStatus) => void>();

  const statusNow = (didJustFinish = false): AudioStatus => ({
    playing: !element.paused && !element.ended,
    currentTime: element.currentTime || 0,
    duration:
      Number.isFinite(element.duration) && element.duration > 0
        ? element.duration
        : null,
    didJustFinish,
    // readyState >= HAVE_CURRENT_DATA, i.e. enough to start.
    loaded: element.readyState >= 2,
  });

  const emit = (didJustFinish = false) => {
    const status = statusNow(didJustFinish);
    for (const listener of listeners) listener(status);
  };

  const onEnded = () => emit(true);
  const onUpdate = () => emit();
  const EVENTS = [
    'timeupdate',
    'play',
    'pause',
    'loadedmetadata',
    'canplay',
    'ratechange',
    'seeked',
  ] as const;
  for (const event of EVENTS) element.addEventListener(event, onUpdate);
  element.addEventListener('ended', onEnded);

  const applyMetadata = (metadata: LockScreenMetadata) => {
    const session = navigator.mediaSession;
    if (!session) return;
    session.metadata = new MediaMetadata({
      title: metadata.title,
      artist: metadata.artist,
      artwork: metadata.artworkUrl ? [{ src: metadata.artworkUrl }] : [],
    });
  };

  return {
    play: () => {
      // Rejects outside a user gesture; the caller's button is one, and
      // an automatic resume failing is not worth an unhandled rejection.
      void element.play().catch(() => {});
    },
    pause: () => element.pause(),
    seekTo: async (seconds) => {
      element.currentTime = Math.max(0, seconds);
    },
    setPlaybackRate: (rate) => {
      element.playbackRate = rate;
    },

    onStatus(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    setLockScreen(metadata) {
      const session = navigator.mediaSession;
      if (!session) return;
      if (!metadata) {
        if (sessionOwner === identity) {
          session.metadata = null;
          sessionOwner = null;
        }
        return;
      }
      sessionOwner = identity;
      applyMetadata(metadata);
      session.setActionHandler('play', () => {
        void element.play().catch(() => {});
      });
      session.setActionHandler('pause', () => element.pause());
      session.setActionHandler('seekforward', () => {
        element.currentTime += 15;
      });
      session.setActionHandler('seekbackward', () => {
        element.currentTime = Math.max(0, element.currentTime - 15);
      });
    },

    updateLockScreenMetadata(metadata) {
      if (sessionOwner === identity) applyMetadata(metadata);
    },

    release() {
      element.pause();
      if (sessionOwner === identity && navigator.mediaSession) {
        navigator.mediaSession.metadata = null;
        sessionOwner = null;
      }
      for (const event of EVENTS) element.removeEventListener(event, onUpdate);
      element.removeEventListener('ended', onEnded);
      listeners.clear();
      // Dropping the source is what actually releases the buffer; an
      // element left with a src keeps streaming in some browsers.
      element.removeAttribute('src');
      element.load();
    },
  };
};
