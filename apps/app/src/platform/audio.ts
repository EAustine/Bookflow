/**
 * Audio playback — the §8 `audio` adapter over `expo-audio`.
 *
 * Why `expo-audio` and not `expo-av`: `expo-av@16` has a header-import
 * bug on the new architecture, and Expo is deprecating it for new work
 * anyway. That decision predates this file; the adapter inherits it.
 *
 * ## The handle owns its listeners
 *
 * `expo-audio` allocates a player per source and returns subscriptions
 * the caller has to remember to remove. The call site remembered by
 * assigning a `_bookflowCleanup` function onto the player object and
 * reading it back at unmount — a field on someone else's class, which
 * worked and was never going to survive a second implementation.
 *
 * Here the handle keeps its own subscriptions and `release()` drops
 * them, so there is one teardown call and nothing to attach.
 *
 * ## `release()` pauses first, deliberately
 *
 * Freeing a player does not stop its decoder immediately: audio can
 * keep draining for 100–300ms after the call returns. If the user has
 * started another page in that window, both play at once. Pausing
 * first stops output synchronously. This ordering is load-bearing and
 * lives here now rather than being re-remembered at each call site.
 */

import {
  createAudioPlayer,
  setAudioModeAsync,
  type AudioPlayer,
  type AudioStatus as ExpoAudioStatus,
} from 'expo-audio';

export type AudioStatus = {
  playing: boolean;
  currentTime: number;
  /** Null until the source reports one. */
  duration: number | null;
  /** True only on the update where the track reached its end. */
  didJustFinish: boolean;
  /** False until the source has loaded enough to play. */
  loaded: boolean;
};

/** What the OS shows on the lock screen and in the media notification. */
export type LockScreenMetadata = {
  title: string;
  artist?: string;
  artworkUrl?: string;
};

export type AudioSessionOptions = {
  /**
   * Keep playing with the screen locked or the app backgrounded. On
   * Android this is what promotes playback to a foreground service,
   * which the manifest declares with FOREGROUND_SERVICE_MEDIA_PLAYBACK.
   */
  playInBackground?: boolean;
  /**
   * Pause other apps' audio on start, rather than mixing with it —
   * we are a media-playback app, not a notification chime.
   */
  exclusive?: boolean;
};

export type AudioPlayerHandle = {
  play(): void;
  pause(): void;
  seekTo(seconds: number): Promise<void>;
  setPlaybackRate(rate: number): void;
  /** Subscribe to status updates. Returns the unsubscribe. */
  onStatus(listener: (status: AudioStatus) => void): () => void;
  /**
   * Show OS transport controls for this player, or pass null to drop
   * them. Dropping before release matters: otherwise the notification
   * can orphan and the next one attach with stale metadata.
   */
  setLockScreen(metadata: LockScreenMetadata | null): void;
  /** Update the controls already shown, without re-registering. */
  updateLockScreenMetadata(metadata: LockScreenMetadata): void;
  /** Stop, drop the controls and listeners, and free the player. */
  release(): void;
};

/**
 * Configure the device's audio session. Non-fatal by contract: callers
 * attempt playback regardless, because a mode failure should not be
 * the reason a book does not play.
 */
export async function configureAudioSession({
  playInBackground = false,
  exclusive = false,
}: AudioSessionOptions = {}): Promise<void> {
  try {
    await setAudioModeAsync({
      allowsRecording: false,
      // Respecting the iOS silent switch would mean a reading app that
      // is silent for anyone who leaves the switch on, which is most
      // people. A book is content the user asked to hear.
      playsInSilentMode: true,
      shouldRouteThroughEarpiece: false,
      shouldPlayInBackground: playInBackground,
      interruptionMode: exclusive ? 'doNotMix' : 'mixWithOthers',
    });
  } catch {
    // Non-fatal; continue and attempt playback.
  }
}

function toStatus(status: ExpoAudioStatus): AudioStatus {
  const loose = status as ExpoAudioStatus & {
    didJustFinish?: boolean;
    isLoaded?: boolean;
  };
  return {
    playing: status.playing,
    currentTime: status.currentTime ?? 0,
    duration:
      typeof status.duration === 'number' && status.duration > 0
        ? status.duration
        : null,
    didJustFinish: loose.didJustFinish === true,
    loaded: loose.isLoaded !== false,
  };
}

export function createPlayer(uri: string): AudioPlayerHandle {
  const player: AudioPlayer = createAudioPlayer({ uri });
  const subscriptions: { remove(): void }[] = [];

  return {
    play: () => player.play(),
    pause: () => player.pause(),
    seekTo: (seconds) => player.seekTo(Math.max(0, seconds)),
    // `setPlaybackRate(rate, pitchCorrection?)`. Pitch correction is
    // left at the default: a narrated book at 1.5x should still sound
    // like the narrator.
    setPlaybackRate: (rate) => player.setPlaybackRate(rate),

    onStatus(listener) {
      const subscription = player.addListener(
        'playbackStatusUpdate',
        (status: ExpoAudioStatus) => listener(toStatus(status)),
      );
      subscriptions.push(subscription);
      return () => {
        subscription.remove();
        const index = subscriptions.indexOf(subscription);
        if (index >= 0) subscriptions.splice(index, 1);
      };
    },

    setLockScreen(metadata) {
      try {
        if (!metadata) {
          player.clearLockScreenControls();
          return;
        }
        player.setActiveForLockScreen(true, metadata, {
          showSeekForward: true,
          showSeekBackward: true,
        });
      } catch (err) {
        // Non-fatal: audio plays on, just without a notification. Logged
        // so the device-logs trail makes it diagnosable.
        console.warn('[audio] lock-screen controls failed:', err);
      }
    },

    updateLockScreenMetadata(metadata) {
      try {
        player.updateLockScreenMetadata(metadata);
      } catch (err) {
        console.warn('[audio] lock-screen metadata update failed:', err);
      }
    },

    release() {
      // Order matters — see the note at the top of this file.
      try {
        player.pause();
      } catch {
        // Already paused or released.
      }
      try {
        player.clearLockScreenControls();
      } catch {
        // Never registered, or already cleared.
      }
      for (const subscription of subscriptions.splice(0)) {
        try {
          subscription.remove();
        } catch {
          // Already removed.
        }
      }
      try {
        player.remove();
      } catch {
        // Already released.
      }
    },
  };
}
