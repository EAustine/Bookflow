import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  DEFAULT_VOICE,
  useAudio,
  type AudioAlignment,
  type AudioVoice,
} from '~/lib/aiAudio';
import { persistReadingPosition } from '~/lib/useBookChapters';
import { peekCachedCoverUrl, resolveCoverUrl } from '~/lib/bookCovers';
import type { Book } from '~/types/book';
import { useReaderStore } from '~/stores/readerStore';

/**
 * Generate a placeholder artwork URL for a book that has no cover
 * image — the same visual pattern Library / Listen-history use in
 * the app (a solid square of `coverColor` with the title's first
 * letter inverse on top), only rendered server-side by placehold.co
 * so we can hand a real URL to the MediaSession's artwork slot.
 *
 * Why a URL at all (vs. omitting artworkUrl entirely): Android's
 * media notification bitmap-caches by URL. When two consecutive
 * books both have no cover, omitting the URL makes the system
 * keep showing the previous book's cached bitmap — the user sees
 * the wrong art and assumes the notification didn't update. A
 * per-book URL (different color + letter → different URL) busts
 * the cache and the right artwork shows up every time.
 *
 * Why placehold.co specifically: free, no-auth, stable, and the
 * URL is fully self-describing — change the color in the URL,
 * change the rendered image. No CDN setup, no asset bundling.
 * If it ever goes down, swap the host in this one place.
 */
function buildPlaceholderArtworkUrl(book: Book): string {
  // Normalise the hex color: drop the leading "#" and expand
  // 3-digit shorthand (#a44 → aa4444) so placehold.co's parser
  // gets a clean 6-char hex string.
  const rawHex = (book.coverColor || '#888').replace('#', '');
  const hex =
    rawHex.length === 3
      ? rawHex
          .split('')
          .map((c) => c + c)
          .join('')
      : rawHex.padEnd(6, '8').slice(0, 6);
  const letter = encodeURIComponent(
    (book.title || 'B').charAt(0).toUpperCase(),
  );
  return `https://placehold.co/512x512/${hex}/ffffff/png?text=${letter}`;
}

/**
 * AsyncStorage key for the most-recently-listened-to book ID. Reads
 * are cheap (one shot, no parsing) and survive cold starts, so the
 * Listen tab's "Last session" resume card stays visible even when
 * the books-table `last_read_at` hasn't caught up. Source of truth
 * is whatever the user last hit Listen on.
 */
const LAST_LISTENED_BOOK_KEY = '@bookflow/audio/last-listened-book-id';

/**
 * Read the persisted last-listened-to book id, or null on miss.
 * Resolves quickly enough that the Listen tab can paint the resume
 * card on its first render after a cold start.
 */
export async function readLastListenedBookId(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(LAST_LISTENED_BOOK_KEY);
  } catch {
    return null;
  }
}

/**
 * Drop the persisted last-listened pointer. Called on sign-out so
 * the next account to sign in on this device doesn't see the
 * previous account's book auto-restore on first Listen-tab visit.
 */
export async function clearLastListenedBookId(): Promise<void> {
  try {
    await AsyncStorage.removeItem(LAST_LISTENED_BOOK_KEY);
  } catch {
    // Non-fatal — the pointer will eventually get overwritten by
    // the next start() call.
  }
}

/**
 * Global audio session.
 *
 * Why this exists: each call site (`ListenScreen`, `MiniPlayer`) used to
 * mount its own `useAudio` hook, which means each mount creates a new
 * `expo-audio` AudioPlayer instance. Two mounts → two players → audio
 * literally dueling. The fix is a single hook instance owned by a
 * provider at the app root; both surfaces consume it via context.
 *
 * Lifecycle:
 *   1. User taps "Listen" anywhere (Library, Reader, etc) → `start(book)`
 *      sets the active book + page; the underlying `useAudio` re-loads.
 *   2. User opens the full ListenScreen → reads playback state and
 *      controls from this context, never mounts its own `useAudio`.
 *   3. User backs out of ListenScreen but doesn't stop → the provider
 *      stays alive at the App root, audio keeps playing, the MiniPlayer
 *      bar surfaces over other tabs.
 *   4. User explicitly stops → `stop()` clears the book, the inner
 *      hook disables, audio releases.
 *
 * The book + page + voice are state on the provider rather than props on
 * the inner hook so changing them (page-flip, voice swap) re-runs
 * `useAudio` exactly once and the new audio loads cleanly.
 */

export type AudioSessionContextValue = {
  /** Active book, or null when there's no session. */
  book: Book | null;
  pageIndex: number;
  voiceId: AudioVoice;
  /** 0.5–2.0. Persists across page advances so the user's chosen speed
   * sticks for the whole session. */
  playbackRate: number;
  /** Sleep timer state. `null` means no timer. `'end-of-page'` pauses
   * when the current page finishes; numeric values are minutes from now. */
  sleepTimer:
    | null
    | { kind: 'end-of-page' }
    | { kind: 'minutes'; remainingSeconds: number };

  // Playback status
  isPlaying: boolean;
  loading: boolean;
  ready: boolean;
  positionSeconds: number;
  durationSeconds: number;
  errorMessage: string | null;
  /** ElevenLabs alignment data for the current page, or null if the
   * page's audio doesn't have alignment (older cache rows). */
  alignment: AudioAlignment | null;
  /** Index into `alignment.characters` of the character ElevenLabs is
   * currently speaking, or -1 if no alignment / before audio starts.
   * Updates on every status tick (~250-500ms). */
  currentCharIndex: number;

  /** Begin a new session for `book`. Pass an explicit `pageIndex` to override
   * the persisted last-read; otherwise we read it from the book row.
   * `autoplay` defaults to true — set false to load the session in a
   * paused state (e.g. cold-start restore of the last-listened book
   * where we want the Listen tab to render the now-playing UI without
   * actually starting playback). */
  start: (
    book: Book,
    opts?: { pageIndex?: number; voiceId?: AudioVoice; autoplay?: boolean },
  ) => void;
  /** Tear down the session entirely. The MiniPlayer disappears. */
  stop: () => void;
  /**
   * `true` after the user swipe-dismisses the floating MiniPlayer.
   * The audio session itself stays alive (book + position + playback
   * are all preserved) — only the overlay strip gets hidden. The
   * Listen tab continues to render the now-playing card so the user
   * can resume from there. Cleared automatically when `start()` is
   * called for a different book.
   */
  miniPlayerHidden: boolean;
  /**
   * Hide the floating MiniPlayer without stopping audio. The Listen
   * tab still shows the active session and the user can tap into it
   * to keep listening. To un-hide, call `start()` with any book or
   * change the active book.
   */
  dismissMiniPlayer: () => void;
  /** Resume / pause without changing the loaded book. */
  play: () => void;
  pause: () => void;
  seekTo: (seconds: number) => Promise<void>;
  setPageIndex: (idx: number) => void;
  setVoiceId: (voice: AudioVoice) => void;
  setPlaybackRate: (rate: number) => void;
  /** Set or clear the sleep timer. Pass `null` to cancel; pass minutes
   * (1, 5, 15, 30, 60) for a timed pause; pass `'end-of-page'` to stop
   * after the current page finishes. */
  setSleepTimer: (timer: AudioSessionContextValue['sleepTimer'] | { kind: 'minutes'; minutes: number }) => void;
};

const AudioSessionContext = createContext<AudioSessionContextValue | null>(null);

/**
 * Stable / static slice of the audio-session API. Holds everything
 * that DOES NOT change at the playback tick rate — book selection,
 * page index, voice, playback rate, sleep timer, and the imperative
 * setters. Consumers that only need these (e.g. the App shell's
 * mini-player gate or the Listen tab's "last session" lookup)
 * subscribe via `useAudioStable()` instead of `useAudioSession()`
 * and avoid re-rendering 3–4× per second while audio is playing.
 *
 * The full `useAudioSession()` continues to return everything so
 * existing surfaces (MiniPlayer scrub bar, ListenScreen transport
 * controls, bimodal highlight) don't have to migrate — they
 * legitimately need the live position values.
 */
export type AudioSessionStableValue = Pick<
  AudioSessionContextValue,
  | 'book'
  | 'pageIndex'
  | 'voiceId'
  | 'playbackRate'
  | 'sleepTimer'
  | 'miniPlayerHidden'
  | 'start'
  | 'stop'
  | 'play'
  | 'pause'
  | 'seekTo'
  | 'setPageIndex'
  | 'setVoiceId'
  | 'setPlaybackRate'
  | 'setSleepTimer'
  | 'dismissMiniPlayer'
>;

const AudioSessionStableContext = createContext<AudioSessionStableValue | null>(
  null,
);

export function AudioSessionProvider({ children }: { children: ReactNode }) {
  const [book, setBook] = useState<Book | null>(null);
  const [pageIndex, setPageIndexInternal] = useState(0);
  // Initial voice respects the user's chosen default from the You tab
  // (Default voice screen). Reading the store imperatively here avoids
  // re-rendering the whole provider when the user changes their default
  // voice mid-app — only new sessions pick up the change.
  const [voiceId, setVoiceId] = useState<AudioVoice>(
    () => useReaderStore.getState().defaultVoiceId || DEFAULT_VOICE,
  );
  // Initial playback speed honours the user's default from the You /
  // Settings screens. Same imperative-read pattern as voiceId above —
  // we only need the value at mount; later changes to the store don't
  // retroactively bump the active session.
  const [playbackRate, setPlaybackRateInternal] = useState(
    () => useReaderStore.getState().defaultPlaybackSpeed || 1,
  );
  const [sleepTimer, setSleepTimerInternal] = useState<
    AudioSessionContextValue['sleepTimer']
  >(null);
  // True after the user swipes the MiniPlayer overlay away. The audio
  // session stays alive so the Listen tab can still render the
  // now-playing card — we just hide the floating preview strip on
  // every other tab. Resets to false whenever `start()` runs with a
  // different book (a new session implies "show me the overlay").
  const [miniPlayerHidden, setMiniPlayerHidden] = useState(false);

  // User intent — "should the next loaded page autoplay?". True when:
  //   - the user just tapped Listen on a book (start)
  //   - the user advanced a page mid-playback (manual or auto)
  //   - the user is currently playing and we're loading a new page
  // Set to false when the user explicitly taps pause.
  // Stored as a ref so the load effect inside useAudio doesn't re-run
  // on intent changes (only on bookId / pageIndex / voiceId).
  const wantsPlayingRef = useRef(false);
  const bookRef = useRef<Book | null>(null);
  const pageIndexRef = useRef(0);

  // Forward declared so callbacks below can reference the latest play().
  const playRef = useRef<() => void>(() => {});

  // Mirrored sleep-timer state into a ref so handleComplete (a stable
  // callback) reads the latest value. Without this, the closure would
  // pin to whatever sleepTimer was when it was first created.
  const sleepTimerRef = useRef(sleepTimer);
  sleepTimerRef.current = sleepTimer;

  const handleComplete = useCallback(() => {
    // Track finished. Three cases:
    //   1. Sleep timer is set to 'end-of-page' → pause here, clear timer.
    //   2. Next page exists → advance + autoplay.
    //   3. End of book → keep the session loaded but pause; user decides.
    if (sleepTimerRef.current?.kind === 'end-of-page') {
      wantsPlayingRef.current = false;
      setSleepTimerInternal(null);
      return;
    }
    const currentBook = bookRef.current;
    if (!currentBook) return;
    const total = Math.max(0, currentBook.totalPages || 0);
    const next = pageIndexRef.current + 1;
    if (total > 0 && next >= total) {
      wantsPlayingRef.current = false;
      return;
    }
    wantsPlayingRef.current = true;
    pageIndexRef.current = next;
    setPageIndexInternal(next);
  }, []);

  const handleLoaded = useCallback(() => {
    if (wantsPlayingRef.current) {
      // Tiny defer so expo-audio finishes wiring its listeners before we
      // call play() — without this, the very first play() right after a
      // fresh mount sometimes no-ops on iOS.
      requestAnimationFrame(() => playRef.current());
    }
  }, []);

  // ── Cover URL for lock-screen artwork ─────────────────────────────────
  // The Book row carries a private storage path; the MediaSession
  // wants a publicly fetchable URL. resolveCoverUrl signs the path
  // through Supabase Storage with a 60-minute cache. We resolve when
  // the book changes (cheap — hits the shared bookCovers cache that
  // Library + Listen-history already populate), then pass the URL
  // through to useAudio as part of the metadata bundle.
  //
  // Switching between books: we INITIALISE from the cache via
  // peekCachedCoverUrl so the metadata doesn't briefly include the
  // previous book's URL during the resolve window. When the path
  // changes between two un-cached covers, we reset to null and
  // re-fetch — the placeholder takes over for the ~100ms gap.
  const [coverUrl, setCoverUrl] = useState<string | null>(null);
  useEffect(() => {
    const path = book?.coverStoragePath;
    if (!path) {
      // No path on this book (uploaded without a cover, or a built-in
      // catalog entry without art). Drop any cached URL from the
      // previous book — the placeholder builder kicks in below.
      setCoverUrl(null);
      return;
    }
    // Synchronous cache peek. If the Library or Listen-history screen
    // already signed this path, hand it to MediaSession instantly
    // instead of flashing the placeholder during the round-trip.
    const cached = peekCachedCoverUrl(path);
    setCoverUrl(cached);
    if (cached) return; // already resolved — nothing async to do
    let cancelled = false;
    // `.catch` guard. resolveCoverUrl hits Supabase Storage which
    // throws "TypeError: Network request failed" when offline. The
    // raw `void promise.then(...)` form had no rejection handler,
    // which propagated to React Native's LogBox as a red error
    // toast on the Listen screen any time the user opened it
    // without a network. The cover is non-essential here (we have
    // a colored placeholder fallback), so a silent catch + Metro
    // warn is the right behaviour.
    void resolveCoverUrl(path)
      .then((url) => {
        if (!cancelled) setCoverUrl(url);
      })
      .catch((err) => {
        if (!cancelled) {
          console.warn('[audioSession] resolveCoverUrl failed:', err);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [book?.coverStoragePath]);

  // ── MediaSession metadata bundle ──────────────────────────────────────
  // Rebuilt whenever the book, page, or cover URL changes. useAudio
  // mirrors this into a ref so changes here don't force a player
  // teardown — late-arriving artwork is patched in via
  // updateLockScreenMetadata.
  //
  // Artwork resolution priority:
  //   1. The book's real signed cover URL (when coverStoragePath was
  //      resolvable via Supabase Storage)
  //   2. A per-book placeholder URL keyed off coverColor + first
  //      letter, matching the in-app Library / Listen-history look
  //
  // We never leave artworkUrl undefined when a book is active —
  // omitting it makes Android's MediaSession keep displaying the
  // previous book's cached bitmap, which looks like our update
  // didn't fire.
  const metadata = useMemo(() => {
    if (!book) return undefined;
    const totalPages = book.totalPages || 0;
    const pageLabel =
      totalPages > 0 ? ` · Page ${pageIndex + 1} of ${totalPages}` : '';
    return {
      title: book.title,
      artist: `${book.author}${pageLabel}`,
      artworkUrl: coverUrl ?? buildPlaceholderArtworkUrl(book),
    };
  }, [book, pageIndex, coverUrl]);

  const { status, play, pause, seekTo } = useAudio({
    bookId: book?.id ?? '',
    pageIndex,
    voiceId,
    enabled: book !== null,
    playbackRate,
    onComplete: handleComplete,
    onLoaded: handleLoaded,
    metadata,
  });

  // ── Alignment data (bimodal highlight) ────────────────────────────────
  // Fetch the alignment JSON whenever the audio status reports a new
  // URL. We key the fetch by URL (not page index) because the audio
  // hook owns the URL identity — this avoids racing the page-load
  // effect when the user flips pages mid-fetch.
  const [alignment, setAlignment] = useState<AudioAlignment | null>(null);
  const alignmentUrlRef = useRef<string | null>(null);
  useEffect(() => {
    const url = status.alignmentUrl;
    if (!url) {
      setAlignment(null);
      alignmentUrlRef.current = null;
      return;
    }
    if (url === alignmentUrlRef.current) return; // already fetching/fetched
    alignmentUrlRef.current = url;
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(url);
        if (cancelled) return;
        if (!res.ok) {
          // Non-fatal — the audio still works. Just no highlight.
          console.warn('[audioSession] alignment fetch non-2xx:', res.status);
          setAlignment(null);
          return;
        }
        const data = (await res.json()) as AudioAlignment;
        if (
          cancelled ||
          alignmentUrlRef.current !== url || // stale (page changed)
          !Array.isArray(data?.characters) ||
          !Array.isArray(data?.character_start_times_seconds)
        ) {
          if (!cancelled) setAlignment(null);
          return;
        }
        setAlignment(data);
      } catch (err) {
        if (!cancelled) {
          console.warn('[audioSession] alignment fetch threw:', err);
          setAlignment(null);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [status.alignmentUrl]);

  // Derive the current character index from positionSeconds. We don't
  // re-render on every status tick if the resulting index hasn't
  // changed — useState + a stable ref-tracked last value suppresses
  // the noise. Binary search keeps this O(log n) which matters for
  // pages with thousands of characters at high playback rates.
  const [currentCharIndex, setCurrentCharIndex] = useState(-1);
  useEffect(() => {
    if (!alignment) {
      setCurrentCharIndex(-1);
      return;
    }
    const starts = alignment.character_start_times_seconds;
    const ends = alignment.character_end_times_seconds;
    const t = status.positionSeconds;
    if (!starts.length) {
      setCurrentCharIndex(-1);
      return;
    }
    // Binary search for the largest start time <= t. The
    // corresponding character is the one being spoken.
    let lo = 0;
    let hi = starts.length - 1;
    let pick = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >>> 1;
      if (starts[mid]! <= t) {
        pick = mid;
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }
    if (pick === -1) {
      setCurrentCharIndex(-1);
      return;
    }
    // If the picked character has already ended, we're between words —
    // return the most recently-completed character so the highlight
    // doesn't flicker off in inter-word gaps.
    const end = ends[pick];
    if (typeof end === 'number' && end < t && pick + 1 < starts.length) {
      // Audio has moved past this char's end; if the next char hasn't
      // started yet (gap), keep the previous highlight visible.
      const nextStart = starts[pick + 1];
      if (typeof nextStart === 'number' && nextStart > t) {
        // Stay on `pick` — between-word silence.
      }
    }
    setCurrentCharIndex((prev) => (prev === pick ? prev : pick));
  }, [alignment, status.positionSeconds]);

  // Public setter — clamps rate to a sensible audiobook range.
  const setPlaybackRate = useCallback((rate: number) => {
    const clamped = Math.max(0.5, Math.min(2, rate));
    setPlaybackRateInternal(clamped);
  }, []);

  // Sleep-timer setter — accepts 'minutes'-shape with `minutes` for
  // ergonomic external API and converts to remaining-seconds for the
  // tick loop.
  const setSleepTimer: AudioSessionContextValue['setSleepTimer'] =
    useCallback((next) => {
      if (next === null) {
        setSleepTimerInternal(null);
        return;
      }
      if (next.kind === 'end-of-page') {
        setSleepTimerInternal({ kind: 'end-of-page' });
        return;
      }
      // Coerce either external shape ({minutes}) or internal shape
      // ({remainingSeconds}) into the canonical internal one.
      if ('minutes' in next) {
        setSleepTimerInternal({
          kind: 'minutes',
          remainingSeconds: Math.max(0, Math.round(next.minutes * 60)),
        });
      } else {
        setSleepTimerInternal(next);
      }
    }, []);

  // Tick the minutes-based sleep timer once a second. When it hits 0,
  // pause playback and clear the timer. Timer ref so the auto-pause
  // happens via the latest pause closure even after re-renders.
  const pauseRef = useRef<() => void>(pause);
  pauseRef.current = pause;
  useEffect(() => {
    if (!sleepTimer || sleepTimer.kind !== 'minutes') return;
    const id = setInterval(() => {
      setSleepTimerInternal((prev) => {
        if (!prev || prev.kind !== 'minutes') return prev;
        const remaining = prev.remainingSeconds - 1;
        if (remaining <= 0) {
          // Fire pause via ref so we don't capture a stale closure.
          pauseRef.current();
          wantsPlayingRef.current = false;
          return null;
        }
        return { kind: 'minutes', remainingSeconds: remaining };
      });
    }, 1000);
    return () => clearInterval(id);
  }, [sleepTimer]);

  // Keep the play ref pointing at the latest closure so handleLoaded
  // (which is stable) always calls into the live player handle.
  playRef.current = play;

  // Persist `last_read_page` + `last_read_at` whenever the active
  // session's page advances (manual skip, auto-advance on track end,
  // search/highlight jump). This is what powers the Listen tab's
  // "Last session" resume card after a user has only ever listened
  // to a book — without it, audio listens never bumped books.last_read_*
  // and the resume card never appeared.
  //
  // Deps key on `book.id` (a stable string) rather than `book` (the
  // whole object) — `useBooks` rebuilds Book objects on every
  // realtime tick of `public.books`, which used to fire this effect
  // up to once per second during heavy realtime traffic. Persisting
  // the same page-index 4× a second is wasteful and amplifies
  // realtime fan-out further.
  useEffect(() => {
    if (!book) return;
    // .catch guard — persistReadingPosition writes to Supabase
    // and the promise rejects offline with "TypeError: Network
    // request failed". The result is best-effort progress
    // tracking; failing silently is correct behaviour. Without
    // the .catch the rejection propagated to LogBox as a red
    // toast on the Listen screen whenever the user changed page
    // while offline. Position will sync next time we're online.
    void persistReadingPosition({
      bookId: book.id,
      pageIndex,
      position: 0,
    }).catch((err) => {
      console.warn('[audioSession] persistReadingPosition failed:', err);
    });
  }, [book?.id, pageIndex]);

  const start = useCallback(
    (
      nextBook: Book,
      opts?: { pageIndex?: number; voiceId?: AudioVoice; autoplay?: boolean },
    ) => {
      const persisted =
        (nextBook as { last_read_page?: number }).last_read_page ?? 0;
      const targetPage = opts?.pageIndex ?? persisted;
      const autoplay = opts?.autoplay ?? true;
      bookRef.current = nextBook;
      pageIndexRef.current = targetPage;
      wantsPlayingRef.current = autoplay;
      setBook(nextBook);
      setPageIndexInternal(targetPage);
      // Voice resolution priority: explicit override > user's chosen
      // default in the You tab > library default. Reading the store
      // imperatively avoids subscribing the whole provider to it.
      const preferredVoice =
        opts?.voiceId ??
        useReaderStore.getState().defaultVoiceId ??
        DEFAULT_VOICE;
      setVoiceId(preferredVoice);
      // A fresh start() reveals the MiniPlayer overlay again. If the
      // user previously dismissed it via swipe, this implicitly resets
      // that — starting a new book is an explicit "I want to listen"
      // signal and the overlay shouldn't stay hidden under it.
      setMiniPlayerHidden(false);
      // Mark this book as touched (last_read_page + last_read_at) so
      // it shows up in the Listen tab's "Last session" resume card
      // even if the user has never opened it in the reader. Without
      // this, listening alone wouldn't bump the timestamps and the
      // resume card stayed empty after audio-only sessions.
      // .catch — see useEffect above for the LogBox-quiet rationale.
      void persistReadingPosition({
        bookId: nextBook.id,
        pageIndex: targetPage,
        position: 0,
      }).catch((err) => {
        console.warn('[audioSession] start persist failed:', err);
      });
      // AsyncStorage-backed fallback for the resume card. The books
      // table update above is the canonical signal, but a cache /
      // realtime delay between write and read can briefly leave the
      // card empty. This key is read synchronously by the Listen tab
      // and is always exactly "the last book the user tapped Listen on".
      void AsyncStorage.setItem(LAST_LISTENED_BOOK_KEY, nextBook.id).catch(
        () => {},
      );
    },
    [],
  );

  const stop = useCallback(() => {
    wantsPlayingRef.current = false;
    bookRef.current = null;
    pageIndexRef.current = 0;
    setBook(null);
    setPageIndexInternal(0);
    // A real stop clears the dismissed flag too — there's no session
    // to be dismissed against, so the next start() begins fresh.
    setMiniPlayerHidden(false);
  }, []);

  const dismissMiniPlayer = useCallback(() => {
    // Hide the floating overlay but keep the session intact. The
    // Listen tab continues to render the now-playing card so the
    // user can resume from there.
    setMiniPlayerHidden(true);
  }, []);

  // Wrap play/pause so we can mirror user intent. Auto-advance can then
  // honour "the user wanted this playing" across page reloads.
  const playWithIntent = useCallback(() => {
    wantsPlayingRef.current = true;
    play();
  }, [play]);

  const pauseWithIntent = useCallback(() => {
    wantsPlayingRef.current = false;
    pause();
  }, [pause]);

  // Public setPageIndex preserves "I was playing" intent so changing
  // pages via prev/next picks up playback on the new page automatically.
  const setPageIndexPublic = useCallback((idx: number) => {
    pageIndexRef.current = idx;
    // If audio is currently playing, keep it playing on the new page.
    // (wantsPlayingRef may already be true; setting it explicitly here
    // covers the case where intent was paused but the user manually
    // skips — in which case we DON'T want to autoplay. Hence: only flip
    // the intent if it's already true.)
    setPageIndexInternal(idx);
  }, []);

  // Stable slice — rebuilt only when the listed fields actually
  // change. Notably excludes `status`, `alignment`, and
  // `currentCharIndex`, which churn on the audio tick. Consumers
  // that subscribe via `useAudioStable()` re-render only on user-
  // initiated events (book selection, voice change, page advance,
  // sleep timer flip), not on playback progress.
  const stableValue = useMemo<AudioSessionStableValue>(
    () => ({
      book,
      pageIndex,
      voiceId,
      playbackRate,
      sleepTimer,
      miniPlayerHidden,
      start,
      stop,
      play: playWithIntent,
      pause: pauseWithIntent,
      seekTo,
      setPageIndex: setPageIndexPublic,
      setVoiceId,
      setPlaybackRate,
      setSleepTimer,
      dismissMiniPlayer,
    }),
    [
      book,
      pageIndex,
      voiceId,
      playbackRate,
      sleepTimer,
      miniPlayerHidden,
      playWithIntent,
      pauseWithIntent,
      seekTo,
      start,
      stop,
      setPageIndexPublic,
      setPlaybackRate,
      setSleepTimer,
      dismissMiniPlayer,
    ],
  );

  // Full value — spreads the stable slice + tacks on the live
  // playback fields. Consumers via `useAudioSession()` still get
  // the same API as before. This value DOES rebuild per tick;
  // that's intentional for surfaces that render the scrub bar /
  // timecode and would otherwise miss updates.
  const value = useMemo<AudioSessionContextValue>(
    () => ({
      ...stableValue,
      isPlaying: status.isPlaying,
      loading: status.loading,
      ready: status.ready,
      positionSeconds: status.positionSeconds,
      durationSeconds: status.durationSeconds,
      errorMessage: status.errorMessage,
      alignment,
      currentCharIndex,
    }),
    [stableValue, status, alignment, currentCharIndex],
  );

  return (
    <AudioSessionStableContext.Provider value={stableValue}>
      <AudioSessionContext.Provider value={value}>
        {children}
      </AudioSessionContext.Provider>
    </AudioSessionStableContext.Provider>
  );
}

export function useAudioSession(): AudioSessionContextValue {
  const ctx = useContext(AudioSessionContext);
  if (!ctx) {
    throw new Error('useAudioSession must be used inside <AudioSessionProvider>');
  }
  return ctx;
}

/**
 * Subscribe to only the stable / static slice of the audio session
 * — book, pageIndex, voice, playbackRate, sleepTimer, and the
 * imperative setters. Consumers via this hook do NOT re-render on
 * playback progress (positionSeconds, currentCharIndex, isPlaying).
 *
 * Use this for surfaces that just need to know "is there a session
 * and which book is it" without caring about the scrub bar — e.g.
 * the App shell deciding whether to show the mini player, or the
 * Listen tab's last-session resume lookup.
 */
export function useAudioStable(): AudioSessionStableValue {
  const ctx = useContext(AudioSessionStableContext);
  if (!ctx) {
    throw new Error('useAudioStable must be used inside <AudioSessionProvider>');
  }
  return ctx;
}
