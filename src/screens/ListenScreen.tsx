import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  Text as RNText,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { BottomSheet, ChapterSheet, type BottomSheetRef, Icon, Text } from '~/components';
import { tokens } from '~/design/tokens';
import type { Book } from '~/types/book';
import { type AudioVoice, DEFAULT_VOICE } from '~/lib/aiAudio';
import { useAudioSession } from '~/lib/audioSession';
import { useBackHandler } from '~/lib/useBackHandler';
import { presentPaywall, ENTITLEMENT_PRO } from '~/lib/revenuecat';
import { usePage, usePageList } from '~/lib/useBookChapters';
import { BookSearchScreen } from '~/screens/BookSearchScreen';
import {
  getActivePreviewVoiceId,
  playVoicePreview,
  stopVoicePreview,
  subscribeVoicePreview,
} from '~/lib/voicePreview';

const SPEEDS = [0.75, 1, 1.25, 1.5, 2] as const;
type Speed = (typeof SPEEDS)[number];

// ─── Voices ───────────────────────────────────────────────────────────────────

type VoiceTier = 'free' | 'pro';

// Voices are ElevenLabs default IDs (22-char alphanumeric). 'free'
// tier exposes Rachel; the rest are gated as 'pro' for paywall
// framing — they cost the same on our side, the gating is product
// UX, not technical.
const VOICES: {
  id: AudioVoice;
  name: string;
  desc: string;
  tier: VoiceTier;
  bg: string;
  fg: string;
}[] = [
  { id: '21m00Tcm4TlvDq8ikWAM', name: 'Rachel', desc: 'Calm · American English',       tier: 'free', bg: tokens.colors.forest[100], fg: tokens.colors.forest[800] },
  { id: 'AZnzlk1XvdvUeBnXmlld', name: 'Domi',   desc: 'Confident · American English',  tier: 'pro',  bg: tokens.colors.amber[200],  fg: tokens.colors.ink[700] },
  { id: 'EXAVITQu4vr4xnSDxMaL', name: 'Bella',  desc: 'Soft · American English',       tier: 'pro',  bg: tokens.colors.cream[200],  fg: tokens.colors.ink[700] },
  { id: 'ErXwobaYiN019PkySvjV', name: 'Antoni', desc: 'Well-rounded · American Eng.', tier: 'pro',  bg: tokens.colors.forest[50],  fg: tokens.colors.forest[700] },
  { id: 'pNInz6obpgDQGcFmaJgb', name: 'Adam',   desc: 'Deep · American English',       tier: 'pro',  bg: tokens.colors.ink[100],    fg: tokens.colors.ink[700] },
  { id: 'yoZ06aMxZJJ28mfd3POQ', name: 'Sam',    desc: 'Raspy · American English',      tier: 'pro',  bg: tokens.colors.cream[50],   fg: tokens.colors.ink[700] },
];

// ─── Props ────────────────────────────────────────────────────────────────────

export type ListenScreenProps = {
  book: Book;
  onBack: () => void;
  onMinimize: () => void;
  /** 0-based DB page to play. Defaults to book.last_read_page. */
  pageIndex?: number;
};

// ─── Screen ───────────────────────────────────────────────────────────────────

export function ListenScreen({ book, onBack, onMinimize, pageIndex }: ListenScreenProps) {
  // The audio session is owned globally (App.tsx wraps everything in
  // AudioSessionProvider). This screen is a controller/view — it never
  // mounts its own useAudio, so navigating away keeps audio playing.
  const audio = useAudioSession();

  // Resolve which page index this screen should display. Caller may
  // override (e.g. when invoked from a specific reader page); otherwise
  // fall back to whatever the session is currently playing, then to the
  // book's persisted last-read.
  const resolvedPageIndex =
    pageIndex ??
    (audio.book?.id === book.id ? audio.pageIndex : undefined) ??
    (book as { last_read_page?: number }).last_read_page ??
    0;
  const selectedVoiceId: AudioVoice =
    audio.book?.id === book.id ? audio.voiceId : DEFAULT_VOICE;
  const setSelectedVoiceId = (v: AudioVoice) => audio.setVoiceId(v);
  const status = {
    isPlaying: audio.isPlaying,
    loading: audio.loading,
    ready: audio.ready,
    positionSeconds: audio.positionSeconds,
    durationSeconds: audio.durationSeconds,
    errorMessage: audio.errorMessage,
  };
  const { play, pause, seekTo } = audio;

  // Page content text — shown while audio plays so the user can
  // follow along visually. We're NOT highlighting the current word
  // (OpenAI tts-1 doesn't expose word timestamps); the original
  // bimodal-paragraph design assumed that and is removed for now.
  const { data: dbPage } = usePage(book.id, resolvedPageIndex);
  // Page list for the picker sheet — small payload (no content), so
  // pulling the full list per book is fine. Empty for mock books.
  const { pages: pageList } = usePageList(book.id);

  const voiceSheetRef = useRef<BottomSheetRef>(null);
  const chapterSheetRef = useRef<BottomSheetRef>(null);
  const sleepSheetRef = useRef<BottomSheetRef>(null);
  // Top-right of the listen header opens a full-text search of the
  // book. Picking a result jumps the audio session to that page (the
  // user's intent is "skip ahead to where this passage is read").
  const [showSearch, setShowSearch] = useState(false);

  // Scrub geometry — captured in screen coordinates (pageX) so the
  // PanResponder math is independent of the responder's own padding.
  // The earlier responder used nativeEvent.locationX which is reported
  // relative to whichever sub-view caught the event; that drifted by
  // exactly the padding amount and made the thumb track inaccurate.
  const trackRef = useRef<View>(null);
  const trackGeomRef = useRef<{ pageX: number; width: number }>({
    pageX: 0,
    width: 0,
  });
  const measureTrack = () => {
    trackRef.current?.measure((_x, _y, width, _height, pageX) => {
      if (width > 0) trackGeomRef.current = { pageX, width };
    });
  };

  const isPlaying = status.isPlaying;
  const positionSec = status.positionSeconds;
  const durationSec = status.durationSeconds || 1;
  const scrubPos = Math.max(0, Math.min(1, positionSec / durationSec));
  const elapsedSecs = Math.round(positionSec);
  const totalSecs = Math.round(durationSec);
  const chNum = String(resolvedPageIndex + 1);
  const selectedVoice = VOICES.find((v) => v.id === selectedVoiceId) ?? VOICES[0];

  // Speed control — cycles through audiobook-typical rates. The audio
  // session owns the rate so it persists across page advances and
  // is shared with the MiniPlayer / now-playing card. Find the closest
  // SPEEDS entry to the current rate so the cycle still works if a
  // future picker sets an off-grid value.
  const speed = (SPEEDS.find((s) => Math.abs(s - audio.playbackRate) < 0.01) ?? 1) as Speed;
  const cycleSpeed = useCallback(() => {
    const idx = SPEEDS.indexOf(speed);
    const next = SPEEDS[(idx + 1) % SPEEDS.length];
    audio.setPlaybackRate(next);
  }, [audio, speed]);

  const togglePlay = useCallback(() => {
    if (status.isPlaying) void pause();
    else void play();
  }, [status.isPlaying, play, pause]);

  // Back always minimises — never stops the session. Stopping cleared
  // the global audio state which made the Listen tab fall back to its
  // empty/resume state instead of keeping the now-playing card
  // visible. The session stays loaded (just paused) and the Listen
  // tab keeps showing the rich UI until the user explicitly clears it.
  const handleBack = useCallback(() => {
    onMinimize();
  }, [onMinimize]);

  // Drag-time override (0..1). When non-null, the track + thumb render
  // from this fraction so the bar tracks the finger smoothly. We commit
  // the seek to audio on release.
  const [dragFraction, setDragFraction] = useState<number | null>(null);

  const fractionFromScreenX = useCallback((screenX: number) => {
    const { pageX, width } = trackGeomRef.current;
    if (width <= 0) return 0;
    return Math.max(0, Math.min(1, (screenX - pageX) / width));
  }, []);

  const scrubPanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (e) => {
        // Re-measure right before the gesture starts; the layout might
        // have shifted (e.g. user opened/closed a sheet earlier).
        measureTrack();
        setDragFraction(fractionFromScreenX(e.nativeEvent.pageX));
      },
      onPanResponderMove: (_e, gestureState) => {
        setDragFraction(fractionFromScreenX(gestureState.moveX));
      },
      onPanResponderRelease: (_e, gestureState) => {
        const final = fractionFromScreenX(gestureState.moveX);
        setDragFraction(null);
        if (durationSecRef.current > 0) {
          void seekTo(final * durationSecRef.current);
        }
      },
      onPanResponderTerminate: () => {
        setDragFraction(null);
      },
    }),
  ).current;

  // Mirror durationSec into a ref so the (stable) PanResponder closure
  // reads the latest duration when committing the seek.
  const durationSecRef = useRef(durationSec);
  durationSecRef.current = durationSec;

  // Page navigation. The transport row's outer buttons (formerly
  // "−15s" / "+15s" seek-within-page) now operate at the page level
  // — rewind goes to the previous page, fast-forward to the next.
  // Pages are the meaningful unit in Bookflow (one page = one TTS
  // track), and per-page navigation matches how users actually
  // think about moving through a book. The 15-second nudge was
  // confusing alongside the page-skip controls and rarely used.
  const totalPages = book.totalPages || 0;
  const canGoPrev = audio.pageIndex > 0;
  const canGoNext = totalPages > 0 && audio.pageIndex < totalPages - 1;
  const goPrevPage = useCallback(() => {
    if (!canGoPrev) return;
    audio.setPageIndex(audio.pageIndex - 1);
  }, [audio, canGoPrev]);
  const goNextPage = useCallback(() => {
    if (!canGoNext) return;
    audio.setPageIndex(audio.pageIndex + 1);
  }, [audio, canGoNext]);

  // Route Android hardware-back through the same path as the
  // in-screen chevron — closes the foreground listening overlay
  // and returns the user to the Library tab (handled by the
  // parent's onBack closure in App.tsx).
  useBackHandler(() => {
    onBack();
    return true;
  });

  // Search overlay — full-text search across the book. Tapping a
  // result calls `audio.setPageIndex` so the listening session jumps
  // to the page the user found, then dismisses.
  if (showSearch) {
    return (
      <BookSearchScreen
        book={book}
        onClose={() => setShowSearch(false)}
        onJumpToPage={(idx) => {
          audio.setPageIndex(idx);
          setShowSearch(false);
        }}
      />
    );
  }

  return (
    <SafeAreaView
      style={styles.safe}
      edges={['top', 'left', 'right', 'bottom']}
    >
      {/* Header */}
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back"
          onPress={handleBack}
          hitSlop={8}
          style={styles.headerBtn}
        >
          <Icon name="ArrowLeft" size={18} color={tokens.textColors.secondary} />
        </Pressable>

        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {book.title}
          </Text>
          <ListeningPill chNum={chNum} isPlaying={isPlaying} />
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Search this book"
          onPress={() => setShowSearch(true)}
          hitSlop={8}
          style={styles.headerBtn}
        >
          <Icon name="Search" size={17} color={tokens.textColors.secondary} />
        </Pressable>
      </View>

      {/* Bimodal text */}
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.chapterLabel}>Page {chNum}</Text>

        {/* Bimodal page text. When we have ElevenLabs alignment, the
            currently-spoken word renders with an amber background;
            other paragraphs dim. Without alignment (older cached
            audio), we fall back to plain static text. */}
        <BimodalText
          content={dbPage?.content ?? ''}
          alignment={audio.alignment}
          currentCharIndex={audio.currentCharIndex}
        />
      </ScrollView>

      {/* Audio player */}
      <View style={styles.player}>
        {/* Scrub bar — drag the thumb (or tap anywhere on the track)
            to seek. Position math runs in screen coordinates against
            the measured track geometry; padding around the track no
            longer offsets the calculation. */}
        <View style={styles.scrubRow}>
          <Text style={styles.scrubTime}>
            {formatTime(
              dragFraction !== null
                ? Math.round(dragFraction * durationSec)
                : elapsedSecs,
            )}
          </Text>
          <View style={styles.scrubHitArea} {...scrubPanResponder.panHandlers}>
            <View
              ref={trackRef}
              style={styles.scrubTrack}
              onLayout={measureTrack}
            >
              <View
                style={[
                  styles.scrubFill,
                  {
                    width: `${(dragFraction ?? scrubPos) * 100}%` as `${number}%`,
                  },
                ]}
              />
              <View
                style={[
                  styles.scrubThumb,
                  {
                    left: `${(dragFraction ?? scrubPos) * 100}%` as `${number}%`,
                  },
                  dragFraction !== null && styles.scrubThumbActive,
                ]}
              />
            </View>
          </View>
          <Text style={styles.scrubTime}>{formatTime(totalSecs)}</Text>
        </View>

        {/* Transport */}
        <View style={styles.transport}>
          <Pressable style={styles.speedPill} onPress={cycleSpeed}>
            <Text style={styles.speedLabel}>
              {speed === 1 ? '1×' : `${speed}×`}
            </Text>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Previous page"
            onPress={goPrevPage}
            disabled={!canGoPrev}
            style={[styles.transportBtn, !canGoPrev && { opacity: 0.35 }]}
          >
            {/* PlayerSkipBack is the |< (bar-then-triangle) glyph,
                matching the page-prev affordance used elsewhere
                (ListenNowPlayingScreen). PlayerTrackPrev was the
                double-triangle "previous track" glyph, which read
                as "skip to start" rather than "previous page". */}
            <Icon name="PlayerSkipBack" size={24} color={tokens.textColors.secondary} />
          </Pressable>

          <Pressable
            style={styles.playBtn}
            onPress={togglePlay}
            accessibilityLabel={isPlaying ? 'Pause' : 'Play'}
            disabled={status.loading || !!status.errorMessage}
          >
            <Icon
              name={isPlaying ? 'Pause' : 'Play'}
              size={20}
              color={tokens.bgColors.canvas}
            />
          </Pressable>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Next page"
            onPress={goNextPage}
            disabled={!canGoNext}
            style={[styles.transportBtn, !canGoNext && { opacity: 0.35 }]}
          >
            {/* PlayerSkipForward is the >| (triangle-then-bar) glyph
                — see the Previous button comment above. */}
            <Icon name="PlayerSkipForward" size={24} color={tokens.textColors.secondary} />
          </Pressable>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel={
              audio.sleepTimer ? 'Sleep timer (active)' : 'Sleep timer'
            }
            onPress={() => sleepSheetRef.current?.present()}
            style={styles.transportBtn}
          >
            {/* When no sleep timer is active, the icon previously rendered
                in the "disabled" text colour, which made it look greyed-
                out and unavailable. The button is fully usable in both
                states — off OR active — so the off state now uses the
                same `secondary` tone as the other transport icons, and
                the active state remains the forest accent so it reads
                as "currently engaged". */}
            <Icon
              name="Moon"
              size={20}
              color={
                audio.sleepTimer
                  ? tokens.colors.forest[800]
                  : tokens.textColors.secondary
              }
            />
          </Pressable>
        </View>

        {/* Action pills */}
        <View style={styles.pillsRow}>
          <Pressable
            style={styles.pill}
            onPress={() => voiceSheetRef.current?.present()}
          >
            <Icon name="Headphones" size={12} color={tokens.textColors.muted} />
            <Text style={styles.pillLabel}>{selectedVoice.name}</Text>
          </Pressable>
          <Pressable style={styles.pill} onPress={() => chapterSheetRef.current?.present()}>
            <Icon name="ListDetails" size={12} color={tokens.textColors.muted} />
            <Text style={styles.pillLabel}>Page {chNum}</Text>
          </Pressable>
        </View>
      </View>

      {/* Page list sheet — switches the audio session to the selected
          page index when the user taps a row. ChapterSheet is named for
          the legacy chapter UX but operates on page rows now. */}
      <ChapterSheet
        ref={chapterSheetRef}
        book={book}
        mode="listen"
        totalSecs={totalSecs}
        scrubPos={scrubPos}
        chapters={pageList}
        currentChapterIndex={resolvedPageIndex}
        onSelectChapter={(idx) => {
          audio.setPageIndex(idx);
          chapterSheetRef.current?.dismiss();
        }}
      />

      {/* Voice picker sheet */}
      <BottomSheet ref={voiceSheetRef}>
        <VoiceSheet
          selectedVoiceId={selectedVoiceId}
          onSelect={(id) => {
            setSelectedVoiceId(id);
            voiceSheetRef.current?.dismiss();
          }}
          onClose={() => voiceSheetRef.current?.dismiss()}
        />
      </BottomSheet>

      {/* Sleep timer sheet */}
      <BottomSheet ref={sleepSheetRef} title="Sleep timer">
        <SleepSheet
          current={audio.sleepTimer}
          onPick={(picked) => {
            audio.setSleepTimer(picked);
            sleepSheetRef.current?.dismiss();
          }}
        />
      </BottomSheet>
    </SafeAreaView>
  );
}

// ─── Listening pill ───────────────────────────────────────────────────────────

function ListeningPill({
  chNum,
  isPlaying,
}: {
  chNum: string;
  isPlaying: boolean;
}) {
  const opacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!isPlaying) {
      opacity.setValue(1);
      return;
    }
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 0.3,
          duration: 700,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 1,
          duration: 700,
          useNativeDriver: true,
        }),
      ]),
    );
    anim.start();
    return () => anim.stop();
  }, [isPlaying, opacity]);

  return (
    <View style={styles.listeningPill}>
      <Animated.View style={[styles.listeningDot, { opacity }]} />
      <Text style={styles.listeningLabel}>
        {isPlaying ? `Listening · Page ${chNum}` : `Paused · Page ${chNum}`}
      </Text>
    </View>
  );
}

// ─── Bimodal text (audio-synced page render) ─────────────────────────────────

type WordSpan = { text: string; start: number; end: number };
type Paragraph = { words: WordSpan[]; paragraphStart: number };

/**
 * Build a paragraph + word layout from the raw page content. Each word
 * carries its absolute character offset in the joined text, which we
 * compare against ElevenLabs' character alignment to identify the
 * currently-spoken word. Built once per page (memoised in the parent).
 */
function buildLayout(content: string): Paragraph[] {
  const out: Paragraph[] = [];
  // Track the absolute offset as we walk through the text. We use the
  // raw content (not a pre-normalised version) because alignment data
  // is keyed against the same string we pass to ElevenLabs, which is
  // page.content.trim(). Trimming front whitespace is captured below.
  let cursor = 0;
  const trimmed = content;
  // Split on blank-line boundaries — same paragraph rule the reader
  // uses everywhere else, keeps "ch4 ¶1 / ¶2" visually separable.
  const paragraphs = trimmed.split(/\n{2,}/);
  for (const para of paragraphs) {
    if (!para.trim()) {
      cursor += para.length + 2; // account for the consumed \n\n
      continue;
    }
    // Locate this paragraph's start in the raw text (cursor may
    // include leading whitespace; .indexOf finds the first non-space
    // character so word offsets line up with what ElevenLabs spoke).
    const localStart = trimmed.indexOf(para, cursor);
    const paragraphStart = localStart >= 0 ? localStart : cursor;

    // Tokenise into words. Match contiguous non-whitespace runs so
    // punctuation glues to its word ("world." stays one token —
    // ElevenLabs' alignment character index will fall within
    // somewhere in this span and we still highlight correctly).
    const words: WordSpan[] = [];
    const wordRe = /\S+/g;
    let m: RegExpExecArray | null;
    while ((m = wordRe.exec(para)) !== null) {
      const start = paragraphStart + m.index;
      words.push({
        text: m[0],
        start,
        end: start + m[0].length,
      });
    }
    out.push({ words, paragraphStart });
    cursor = paragraphStart + para.length;
  }
  return out;
}

/**
 * Find the word that contains the given character offset. Returns
 * `{ paragraphIdx, wordIdx }` or null when no word matches. We use
 * "largest word whose start <= offset" semantics so inter-word
 * spaces (gaps) keep the previous word highlighted instead of
 * flickering off.
 */
function findActiveWord(
  layout: Paragraph[],
  charIndex: number,
): { paragraphIdx: number; wordIdx: number } | null {
  if (charIndex < 0) return null;
  let last: { paragraphIdx: number; wordIdx: number } | null = null;
  for (let p = 0; p < layout.length; p++) {
    const para = layout[p]!;
    for (let w = 0; w < para.words.length; w++) {
      const word = para.words[w]!;
      if (word.start <= charIndex) {
        last = { paragraphIdx: p, wordIdx: w };
      } else {
        // words are in offset-ascending order; once we pass the index
        // there are no more candidates
        return last;
      }
    }
  }
  return last;
}

function BimodalText({
  content,
  alignment,
  currentCharIndex,
}: {
  content: string;
  alignment: import('~/lib/aiAudio').AudioAlignment | null;
  currentCharIndex: number;
}) {
  const layout = useMemo(() => buildLayout(content), [content]);
  // Active word is null when alignment is missing (older cached audio)
  // or before audio has started — fall through to plain rendering then.
  const active = useMemo(
    () =>
      alignment && currentCharIndex >= 0
        ? findActiveWord(layout, currentCharIndex)
        : null,
    [alignment, currentCharIndex, layout],
  );

  if (layout.length === 0) {
    return null;
  }

  return (
    <View>
      {layout.map((para, pIdx) => {
        const isActiveParagraph = active?.paragraphIdx === pIdx;
        // No alignment yet → render plain (no dimming, no highlight).
        // With alignment → dim non-active paragraphs, highlight word.
        const dim = active !== null && !isActiveParagraph;
        return (
          <RNText
            key={pIdx}
            style={[
              styles.paragraph,
              dim && styles.paragraphDim,
            ]}
          >
            {para.words.map((word, wIdx) => {
              const isCurrentWord =
                isActiveParagraph && active?.wordIdx === wIdx;
              return (
                <RNText
                  key={wIdx}
                  style={isCurrentWord ? styles.activeWord : undefined}
                >
                  {wIdx > 0 ? ' ' : ''}
                  {word.text}
                </RNText>
              );
            })}
          </RNText>
        );
      })}
    </View>
  );
}

// ─── Voice picker sheet ───────────────────────────────────────────────────────

function VoiceSheet({
  selectedVoiceId,
  onSelect,
  onClose,
}: {
  selectedVoiceId: string;
  onSelect: (id: string) => void;
  onClose: () => void;
}) {
  const freeVoices = VOICES.filter((v) => v.tier === 'free');
  const proVoices = VOICES.filter((v) => v.tier === 'pro');

  // We pause any currently-playing book audio before starting a
  // preview — otherwise two voices overlap. We DON'T auto-resume
  // afterwards; the user is in voice-picking mode and likely about
  // to switch voices anyway, so leaving the session paused is the
  // least surprising default.
  const audio = useAudioSession();

  // Voice-preview lifecycle. Subscribed to the module-scope singleton
  // in voicePreview.ts so any preview started here also reflects in
  // other VoiceRows (only one preview plays at a time across the app).
  // `pendingId` covers the brief moment between the user tapping
  // Preview and audio actually starting — without it the button would
  // look frozen during the URL fetch.
  const [activeVoiceId, setActiveVoiceId] = useState<string | null>(
    getActivePreviewVoiceId(),
  );
  const [pendingVoiceId, setPendingVoiceId] = useState<string | null>(null);
  useEffect(() => {
    const unsub = subscribeVoicePreview(() => {
      setActiveVoiceId(getActivePreviewVoiceId());
    });
    // Always stop preview when the sheet unmounts — otherwise a
    // half-played sample keeps playing under the closed sheet.
    return () => {
      unsub();
      stopVoicePreview();
    };
  }, []);
  const handlePreview = useCallback(
    async (voiceId: string) => {
      // Tap again to stop (matches user expectation; Preview button
      // becomes a toggle once playback is live).
      if (getActivePreviewVoiceId() === voiceId) {
        stopVoicePreview();
        return;
      }
      // Yield the audio focus by pausing the book session first.
      if (audio.isPlaying) {
        try {
          audio.pause();
        } catch {
          // Audio session may not be loaded yet — that's fine,
          // there's nothing to silence.
        }
      }
      setPendingVoiceId(voiceId);
      try {
        await playVoicePreview(voiceId);
      } catch (err) {
        // Surface enough info for the user to know it failed — the
        // sheet's existing layout doesn't have a toast slot, so we
        // just bail; the button will return to idle and the user can
        // retry. The error is logged for debug.
        console.warn(
          '[voice-preview] play failed:',
          err instanceof Error ? err.message : err,
        );
      } finally {
        setPendingVoiceId(null);
      }
    },
    [audio],
  );

  return (
    <View>
      <View style={styles.sheetTitleRow}>
        <Text style={styles.sheetTitle}>Choose a voice</Text>
        <Pressable
          onPress={() => {
            stopVoicePreview();
            onClose();
          }}
          style={styles.sheetClose}
          hitSlop={8}
          accessibilityLabel="Close"
        >
          <Icon name="X" size={14} color={tokens.textColors.muted} />
        </Pressable>
      </View>

      {/* Free voices */}
      <Text style={styles.voiceSectionLabel}>Free</Text>
      <View style={styles.voiceGroup}>
        {freeVoices.map((voice, idx) => (
          <VoiceRow
            key={voice.id}
            voice={voice}
            isSelected={voice.id === selectedVoiceId}
            isLast={idx === freeVoices.length - 1}
            previewState={
              pendingVoiceId === voice.id
                ? 'loading'
                : activeVoiceId === voice.id
                  ? 'playing'
                  : 'idle'
            }
            onPreview={() => void handlePreview(voice.id)}
            onPress={() => onSelect(voice.id)}
          />
        ))}
      </View>

      {/* Pro voices */}
      <Text style={styles.voiceSectionLabel}>Pro voices</Text>
      <View style={styles.voiceGroup}>
        {proVoices.map((voice, idx) => (
          <VoiceRow
            key={voice.id}
            voice={voice}
            isSelected={false}
            isLast={idx === proVoices.length - 1}
            locked
            previewState="idle"
            // Tapping a locked Pro voice opens the paywall — same
            // surface the Upgrade button below this list uses. Better
            // UX than a silent reject; users frequently try the
            // voice they want first, then find the Upgrade button.
            onPress={() => {
              void presentPaywall({
                requiredEntitlement: ENTITLEMENT_PRO,
              }).catch(() => {});
            }}
          />
        ))}
      </View>

      {/* Pro upsell */}
      <View style={styles.proUpsell}>
        <View style={{ flex: 1 }}>
          <Text style={styles.upsellTitle}>Unlock all voices</Text>
          <Text style={styles.upsellSub}>
            4 premium voices + faster audio on Standard
          </Text>
        </View>
        <Pressable
          style={styles.upsellBtn}
          onPress={() => {
            void presentPaywall({
              requiredEntitlement: ENTITLEMENT_PRO,
            }).catch(() => {
              // Swallow when RevenueCat isn't configured — the
              // button still feels responsive instead of crashing.
            });
          }}
        >
          <Text style={styles.upsellBtnLabel}>Upgrade</Text>
        </Pressable>
      </View>
    </View>
  );
}

function VoiceRow({
  voice,
  isSelected,
  isLast,
  locked,
  previewState,
  onPreview,
  onPress,
}: {
  voice: (typeof VOICES)[number];
  isSelected: boolean;
  isLast: boolean;
  locked?: boolean;
  /**
   * Current state of the inline Preview button. `loading` covers the
   * brief window between tap and audio starting (URL fetch); `playing`
   * means the sample is currently audible; `idle` is the default.
   * Pro/locked rows always pass 'idle' since they don't preview.
   */
  previewState: 'idle' | 'loading' | 'playing';
  onPreview?: () => void;
  onPress: () => void;
}) {
  const isPlaying = previewState === 'playing';
  const isLoading = previewState === 'loading';
  // Pause icon → tappable to stop. Play icon → tappable to start.
  // Loading state shows the play icon with reduced opacity so the
  // tap target stays the same width and doesn't jitter.
  const previewIcon = isPlaying ? 'Pause' : 'Play';
  const previewLabel = isPlaying ? 'Stop' : 'Preview';

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.voiceRow,
        !isLast && styles.voiceRowBorder,
        locked && styles.voiceRowLocked,
        pressed && !locked && { backgroundColor: tokens.bgColors.raised },
      ]}
    >
      <View
        style={[
          styles.voiceAvatar,
          { backgroundColor: voice.bg },
        ]}
      >
        <Text style={[styles.voiceAvatarText, { color: voice.fg }]}>
          {voice.name[0]}
        </Text>
      </View>

      <View style={styles.voiceInfo}>
        <Text style={styles.voiceName}>{voice.name}</Text>
        <Text style={styles.voiceMeta}>{voice.desc}</Text>
      </View>

      <View style={styles.voiceTrailing}>
        {locked ? (
          <>
            <View style={styles.proBadge}>
              <Text style={styles.proBadgeLabel}>Pro</Text>
            </View>
            <Icon name="Lock" size={14} color={tokens.textColors.disabled} />
          </>
        ) : (
          <>
            <Pressable
              onPress={(e) => {
                e.stopPropagation();
                onPreview?.();
              }}
              style={[
                styles.previewBtn,
                isPlaying && styles.previewBtnActive,
                isLoading && { opacity: 0.6 },
              ]}
              hitSlop={4}
              disabled={isLoading}
              accessibilityLabel={
                isPlaying ? `Stop ${voice.name} preview` : `Preview ${voice.name}`
              }
            >
              <Icon
                name={previewIcon}
                size={9}
                color={
                  isPlaying
                    ? tokens.colors.forest[800]
                    : tokens.textColors.muted
                }
              />
              <Text
                style={[
                  styles.previewBtnLabel,
                  isPlaying && styles.previewBtnLabelActive,
                ]}
              >
                {previewLabel}
              </Text>
            </Pressable>
            {isSelected && (
              <Icon name="Check" size={16} color={tokens.colors.forest[800]} strokeWidth={2} />
            )}
          </>
        )}
      </View>
    </Pressable>
  );
}

// ─── Sleep timer sheet ────────────────────────────────────────────────────────

type SleepPick =
  | null
  | { kind: 'end-of-page' }
  | { kind: 'minutes'; minutes: number };

/**
 * Sleep timer options. Five common audiobook intervals + "End of page"
 * (same idea as Apple Books' "End of chapter" — pause when the current
 * audio page finishes naturally). The active row gets a forest dot;
 * tapping the active row again clears the timer.
 */
function SleepSheet({
  current,
  onPick,
}: {
  current:
    | null
    | { kind: 'end-of-page' }
    | { kind: 'minutes'; remainingSeconds: number };
  onPick: (next: SleepPick) => void;
}) {
  const options: Array<{ key: string; label: string; pick: SleepPick }> = [
    { key: 'off', label: 'Off', pick: null },
    { key: '5', label: '5 minutes', pick: { kind: 'minutes', minutes: 5 } },
    { key: '15', label: '15 minutes', pick: { kind: 'minutes', minutes: 15 } },
    { key: '30', label: '30 minutes', pick: { kind: 'minutes', minutes: 30 } },
    { key: '60', label: '1 hour', pick: { kind: 'minutes', minutes: 60 } },
    { key: 'eop', label: 'End of page', pick: { kind: 'end-of-page' } },
  ];

  const isActive = (pick: SleepPick): boolean => {
    if (pick === null) return current === null;
    if (!current) return false;
    if (pick.kind === 'end-of-page') return current.kind === 'end-of-page';
    if (pick.kind === 'minutes') {
      // Approximate match — consider it active if remaining time is
      // within 60s of the picked total (covers natural drift right
      // after pick).
      if (current.kind !== 'minutes') return false;
      const total = pick.minutes * 60;
      return Math.abs(current.remainingSeconds - total) < 60;
    }
    return false;
  };

  return (
    <View style={sleepStyles.list}>
      {options.map((opt) => {
        const active = isActive(opt.pick);
        const subtitle =
          opt.key === '5' ||
          opt.key === '15' ||
          opt.key === '30' ||
          opt.key === '60'
            ? active && current?.kind === 'minutes'
              ? `${formatRemaining(current.remainingSeconds)} left`
              : null
            : null;
        return (
          <Pressable
            key={opt.key}
            onPress={() => onPick(active ? null : opt.pick)}
            style={({ pressed }) => [
              sleepStyles.row,
              pressed && { backgroundColor: tokens.bgColors.raised },
            ]}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
          >
            <Text style={[sleepStyles.label, active && sleepStyles.labelActive]}>
              {opt.label}
            </Text>
            <View style={sleepStyles.trailing}>
              {subtitle && (
                <Text style={sleepStyles.subtitle}>{subtitle}</Text>
              )}
              {active && (
                <Icon
                  name="Check"
                  size={16}
                  color={tokens.colors.forest[800]}
                  strokeWidth={2}
                />
              )}
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

function formatRemaining(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m === 0) return `${s}s`;
  if (s === 0) return `${m} min`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

const sleepStyles = StyleSheet.create({
  list: {
    paddingHorizontal: 4,
    paddingBottom: 4,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: 48,
    paddingHorizontal: 12,
    borderRadius: 10,
  },
  label: {
    fontFamily: tokens.fonts.ui,
    fontSize: 15,
    color: tokens.textColors.primary,
  },
  labelActive: {
    fontFamily: tokens.fonts.uiMedium,
    fontWeight: '500',
    color: tokens.colors.forest[800],
  },
  trailing: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  subtitle: {
    fontFamily: tokens.fonts.ui,
    fontSize: 12,
    color: tokens.textColors.muted,
  },
});

// ─── Mini player (rendered in LibraryScreen above tab bar) ───────────────────

export type MiniPlayerProps = {
  /** Tap the mini bar to open the full ListenScreen (route to Listen tab). */
  onExpand: () => void;
};

/**
 * Compact playback bar shown above the TabBar on Library/Discover/You
 * tabs whenever a session is active. Reads from `useAudioSession` so it
 * shares state with the full ListenScreen — there's exactly one audio
 * source in the app.
 *
 * Returns `null` when no session is active so callers can render
 * unconditionally without writing the gate themselves.
 */
export function MiniPlayer({ onExpand }: MiniPlayerProps) {
  const audio = useAudioSession();
  const insets = useSafeAreaInsets();
  // Swipe-to-dismiss state. translateX drives the bar's horizontal
  // offset; opacity fades it as it leaves the screen. Both are
  // Animated.Values so the gesture stays on the UI thread via
  // useNativeDriver. Refs so we don't re-create them on every render.
  const translateX = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(1)).current;
  // Captures the dismiss decision inside the PanResponder closure so
  // we can call dismissMiniPlayer() after the slide-off animation
  // finishes. Without this, calling dismissMiniPlayer() unmounts
  // MiniPlayer mid-anim and the slide-off never plays out.
  const dismissingRef = useRef(false);

  // PanResponder captures clear horizontal drags (right OR left) and
  // dismisses the mini player when the user has dragged either far
  // enough or with enough velocity. A simple tap bubbles past the
  // responder and reaches the Pressable below, so `onExpand` still
  // fires normally on tap.
  const panResponder = useRef(
    PanResponder.create({
      // Don't fight scrolling. We only become the responder once the
      // gesture is clearly horizontal AND moved past a few px.
      onMoveShouldSetPanResponder: (_, g) =>
        Math.abs(g.dx) > 6 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5,
      onPanResponderGrant: () => {
        translateX.stopAnimation();
        opacity.stopAnimation();
      },
      onPanResponderMove: (_, g) => {
        translateX.setValue(g.dx);
        // Fade as the bar exits — starts at 1, hits ~0.3 by the time
        // it's halfway off-screen. Keeps the gesture feeling reactive.
        const screenW = Dimensions.get('window').width || 375;
        const dist = Math.min(1, Math.abs(g.dx) / screenW);
        opacity.setValue(Math.max(0.35, 1 - dist));
      },
      onPanResponderRelease: (_, g) => {
        const screenW = Dimensions.get('window').width || 375;
        // Dismiss if dragged past 35% of screen width OR with enough
        // velocity (matches iOS standard swipe-to-dismiss thresholds).
        const past = Math.abs(g.dx) > screenW * 0.35 || Math.abs(g.vx) > 0.5;
        if (past) {
          dismissingRef.current = true;
          const direction = g.dx >= 0 ? 1 : -1;
          Animated.parallel([
            Animated.timing(translateX, {
              toValue: direction * screenW * 1.1,
              duration: 180,
              useNativeDriver: true,
            }),
            Animated.timing(opacity, {
              toValue: 0,
              duration: 180,
              useNativeDriver: true,
            }),
          ]).start(({ finished }) => {
            if (finished && dismissingRef.current) {
              // Hide the overlay but keep the audio session alive
              // so the Listen tab still shows the now-playing card.
              // The user can resume from there or tap a different
              // book to start a new session (which un-hides the
              // overlay automatically).
              audio.dismissMiniPlayer();
            }
          });
        } else {
          // Snap back to center.
          Animated.parallel([
            Animated.spring(translateX, {
              toValue: 0,
              useNativeDriver: true,
              bounciness: 0,
            }),
            Animated.spring(opacity, {
              toValue: 1,
              useNativeDriver: true,
              bounciness: 0,
            }),
          ]).start();
        }
      },
      onPanResponderTerminate: () => {
        Animated.parallel([
          Animated.spring(translateX, {
            toValue: 0,
            useNativeDriver: true,
            bounciness: 0,
          }),
          Animated.spring(opacity, {
            toValue: 1,
            useNativeDriver: true,
            bounciness: 0,
          }),
        ]).start();
      },
    }),
  ).current;

  // When a new session un-hides the overlay (book change resets
  // `miniPlayerHidden`), the Animated values still hold the off-screen
  // state from the previous dismiss. Snap them back to center so the
  // bar reappears in-place rather than animating in from nowhere.
  useEffect(() => {
    if (!audio.miniPlayerHidden) {
      translateX.setValue(0);
      opacity.setValue(1);
      dismissingRef.current = false;
    }
  }, [audio.miniPlayerHidden, translateX, opacity]);

  // Early return AFTER hooks (refs + effects above) to keep hook
  // order stable across mounts.
  const book = audio.book;
  if (!book) return null;
  // The user explicitly swiped the overlay away. Audio session is
  // still alive (Listen tab will render the now-playing card); we
  // just hide the floating preview strip on other tabs.
  if (audio.miniPlayerHidden) return null;

  // The mini bar floats absolutely from App.tsx and needs to sit above
  // the TabBar. TabBar = paddingTop(8) + content(~40) + paddingBottom
  // (max(safeInset, 8)). 56 covers the inner content; safeInset covers
  // the home-indicator area on notched devices.
  const tabBarOffset = 56 + Math.max(insets.bottom, 8);

  const isPlaying = audio.isPlaying;
  const pageIndex = audio.pageIndex;
  const scrubPos =
    audio.durationSeconds > 0
      ? Math.max(0, Math.min(1, audio.positionSeconds / audio.durationSeconds))
      : 0;

  const handlePlayPause = (e: { stopPropagation: () => void }) => {
    e.stopPropagation();
    if (audio.isPlaying) audio.pause();
    else audio.play();
  };

  // The session can still be torn down via swipe-to-dismiss (left or
  // right). When dismissed we call `audio.stop()` so the cold-start
  // auto-restore doesn't immediately revive the bar — closing means
  // closing, not hiding.

  return (
    <View style={{ marginBottom: tabBarOffset }} pointerEvents="box-none">
      <Animated.View
        style={{ transform: [{ translateX }], opacity }}
        {...panResponder.panHandlers}
      >
        <Pressable
          style={styles.mini}
          onPress={onExpand}
          accessibilityLabel="Expand player"
          accessibilityHint="Swipe left or right to close"
        >
          <View style={styles.miniCover}>
            <Text style={styles.miniCoverText} numberOfLines={2}>
              {book.title}
            </Text>
          </View>

          <View style={styles.miniInfo}>
            <Text style={styles.miniTitle} numberOfLines={1}>
              {book.title} · Page {pageIndex + 1}
            </Text>
            <View style={styles.miniProgressTrack}>
              <View
                style={[
                  styles.miniProgressFill,
                  { width: `${scrubPos * 100}%` as `${number}%` },
                ]}
              />
            </View>
          </View>

          <View style={styles.miniControls}>
            <Pressable onPress={handlePlayPause} style={styles.miniPlayBtn} hitSlop={4}>
              <Icon
                name={isPlaying ? 'Pause' : 'Play'}
                size={14}
                color={tokens.colors.cream[50]}
              />
            </Pressable>
          </View>
        </Pressable>
      </Animated.View>
    </View>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatTime(secs: number): string {
  return `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: tokens.bgColors.canvas,
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: tokens.space.lg,
    paddingVertical: 10,
    borderBottomWidth: 0.5,
    borderBottomColor: tokens.borderColors.subtle,
    backgroundColor: tokens.bgColors.canvas,
  },
  headerBtn: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: tokens.space.sm,
    gap: 4,
  },
  headerTitle: {
    fontFamily: tokens.fonts.display,
    fontSize: 13,
    fontWeight: '500',
    color: tokens.textColors.primary,
  },

  // Listening pill
  listeningPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: tokens.colors.forest[50],
    borderRadius: 99,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  listeningDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: tokens.colors.forest[800],
  },
  listeningLabel: {
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 10,
    fontWeight: '500',
    color: tokens.colors.forest[800],
    letterSpacing: 0.2,
  },

  // Bimodal scroll
  scroll: { flex: 1 },
  scrollContent: {
    paddingHorizontal: 22,
    paddingTop: tokens.space.lg,
    paddingBottom: tokens.space.lg,
  },
  chapterLabel: {
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 10,
    fontWeight: '500',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: tokens.colors.ink[300],
    marginBottom: tokens.space.lg,
  },
  paragraph: {
    fontFamily: 'Literata_400Regular',
    fontSize: 16,
    lineHeight: 16 * 1.7,
    color: tokens.textColors.primary,
    marginBottom: 16,
  },
  // Bimodal mode: paragraphs not currently being narrated dim to ink-300.
  // Same dim treatment as the original design spec (10_listen.html).
  paragraphDim: {
    color: tokens.colors.ink[300],
  },

  // Paragraphs
  para: {
    fontFamily: tokens.fonts.reading,
    fontSize: 20,
    lineHeight: 20 * 1.78,
    marginBottom: 18,
  },
  paraDim: {
    color: tokens.colors.ink[300],
  },
  paraActive: {
    color: tokens.textColors.primary,
  },
  priorSentence: {
    color: tokens.textColors.primary,
  },
  activeSentence: {
    color: tokens.colors.ink[700],
  },
  activeWord: {
    backgroundColor: tokens.colors.amber[500],
    color: tokens.colors.forest[900],
    fontWeight: '500',
    borderRadius: 2,
  },

  // Player
  player: {
    backgroundColor: tokens.bgColors.canvas,
    borderTopWidth: 0.5,
    borderTopColor: tokens.borderColors.subtle,
    paddingTop: 12,
    paddingHorizontal: 20,
  },

  // Scrub
  scrubRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 10,
  },
  scrubTime: {
    fontFamily: tokens.fonts.ui,
    fontSize: 10,
    color: tokens.textColors.disabled,
    minWidth: 28,
    textAlign: 'center',
    flexShrink: 0,
  },
  // Larger transparent hit area around the 4px track so the gesture
  // is comfortable to grab. The track itself is what we measure for
  // the percent calculation — padding here doesn't factor in.
  scrubHitArea: {
    flex: 1,
    paddingVertical: 12,
    marginVertical: -12,
    justifyContent: 'center',
  },
  scrubTrack: {
    height: 4,
    backgroundColor: tokens.colors.cream[200],
    borderRadius: 2,
    position: 'relative',
    justifyContent: 'center',
  },
  scrubFill: {
    position: 'absolute',
    left: 0,
    top: 0,
    height: '100%',
    backgroundColor: tokens.colors.forest[800],
    borderRadius: 2,
  },
  scrubThumb: {
    position: 'absolute',
    top: '50%',
    marginTop: -6,
    marginLeft: -6,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: tokens.colors.forest[800],
    borderWidth: 2,
    borderColor: tokens.bgColors.canvas,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
    elevation: 2,
  },
  // Slight scale-up while the user is dragging for tactile feedback.
  scrubThumbActive: {
    transform: [{ scale: 1.3 }],
    shadowOpacity: 0.35,
  },

  // Transport
  transport: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    marginBottom: 12,
  },
  speedPill: {
    height: 32,
    paddingHorizontal: 12,
    borderRadius: 16,
    backgroundColor: tokens.bgColors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 44,
  },
  speedLabel: {
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 12,
    fontWeight: '500',
    color: tokens.textColors.secondary,
  },
  skipWrap: {
    alignItems: 'center',
  },
  transportBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  skipLabel: {
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 8,
    fontWeight: '500',
    color: tokens.textColors.disabled,
    marginTop: -4,
  },
  playBtn: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: tokens.colors.forest[800],
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: tokens.colors.forest[800],
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 4,
  },

  // Pills
  pillsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
    paddingHorizontal: 8,
    paddingBottom: 24,
  },
  pill: {
    flex: 1,
    height: 32,
    paddingHorizontal: 12,
    borderRadius: 16,
    backgroundColor: tokens.bgColors.surface,
    borderWidth: 0.5,
    borderColor: tokens.borderColors.subtle,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
  },
  pillLabel: {
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 11,
    fontWeight: '500',
    color: tokens.textColors.secondary,
  },

  // Voice sheet
  sheetTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: tokens.space.md,
  },
  sheetTitle: {
    fontFamily: tokens.fonts.display,
    fontSize: 16,
    fontWeight: '500',
    color: tokens.textColors.primary,
  },
  sheetClose: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: tokens.bgColors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  voiceSectionLabel: {
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 10,
    fontWeight: '500',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: tokens.textColors.disabled,
    marginBottom: 8,
  },
  voiceGroup: {
    borderRadius: tokens.radii.xl,
    overflow: 'hidden',
    borderWidth: 0.5,
    borderColor: tokens.borderColors.subtle,
    marginBottom: tokens.space.lg,
  },
  voiceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    backgroundColor: tokens.bgColors.canvas,
    minHeight: 60,
  },
  voiceRowBorder: {
    borderBottomWidth: 0.5,
    borderBottomColor: tokens.borderColors.subtle,
  },
  voiceRowLocked: {
    opacity: 0.6,
  },
  voiceAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  voiceAvatarText: {
    fontFamily: tokens.fonts.display,
    fontSize: 14,
    fontWeight: '500',
  },
  voiceInfo: { flex: 1 },
  voiceName: {
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 14,
    fontWeight: '500',
    color: tokens.textColors.primary,
    marginBottom: 2,
  },
  voiceMeta: {
    fontFamily: tokens.fonts.ui,
    fontSize: 11,
    color: tokens.textColors.muted,
  },
  voiceTrailing: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexShrink: 0,
  },
  previewBtn: {
    height: 26,
    paddingHorizontal: 10,
    borderRadius: 13,
    backgroundColor: tokens.bgColors.surface,
    borderWidth: 0.5,
    borderColor: tokens.borderColors.subtle,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  previewBtnActive: {
    // While playing, swap the chip into the brand accent so the user
    // can spot which voice is the source of the audio at a glance
    // even when scrolling through other rows.
    backgroundColor: tokens.colors.forest[50],
    borderColor: tokens.colors.forest[200],
  },
  previewBtnLabel: {
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 11,
    fontWeight: '500',
    color: tokens.textColors.muted,
  },
  previewBtnLabelActive: {
    color: tokens.colors.forest[800],
  },
  proBadge: {
    backgroundColor: tokens.colors.amber[200],
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  proBadgeLabel: {
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 10,
    fontWeight: '500',
    color: tokens.textColors.secondary,
  },
  proUpsell: {
    backgroundColor: tokens.colors.forest[800],
    borderRadius: tokens.radii.xl,
    padding: tokens.space.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  upsellTitle: {
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 13,
    fontWeight: '500',
    color: tokens.colors.cream[50],
    marginBottom: 2,
  },
  upsellSub: {
    fontFamily: tokens.fonts.ui,
    fontSize: 11,
    color: tokens.colors.forest[200],
    lineHeight: 16,
  },
  upsellBtn: {
    height: 32,
    paddingHorizontal: 14,
    borderRadius: tokens.radii.md,
    backgroundColor: tokens.colors.amber[500],
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  upsellBtnLabel: {
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 12,
    fontWeight: '500',
    color: tokens.colors.forest[900],
  },

  // Mini player
  mini: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: tokens.colors.forest[800],
    paddingVertical: 10,
    paddingHorizontal: tokens.space.lg,
    borderTopWidth: 0.5,
    borderTopColor: tokens.colors.forest[700],
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 8,
  },
  miniCover: {
    width: 36,
    height: 36,
    borderRadius: 5,
    backgroundColor: tokens.colors.forest[700],
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    padding: 4,
  },
  miniCoverText: {
    fontFamily: tokens.fonts.display,
    fontSize: 5,
    color: tokens.colors.cream[50],
    textAlign: 'center',
    lineHeight: 7,
  },
  miniInfo: { flex: 1, minWidth: 0 },
  miniTitle: {
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 12,
    fontWeight: '500',
    color: tokens.colors.cream[50],
    marginBottom: 4,
  },
  miniProgressTrack: {
    height: 2,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 1,
    overflow: 'hidden',
  },
  miniProgressFill: {
    height: '100%',
    backgroundColor: tokens.colors.amber[500],
    borderRadius: 1,
  },
  miniControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexShrink: 0,
  },
  miniBtn: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  miniPlayBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
