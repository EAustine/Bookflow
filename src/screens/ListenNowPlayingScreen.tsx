/**
 * ListenNowPlayingScreen — the Listen tab while audio is playing or paused.
 *
 * Per /docs/specs/b7_02_listen_tab_now_playing.html. Three sections:
 *
 *   1. Hero card — forest-800 surface with cover, metadata, scrub bar,
 *      transport controls (back-15 / play-pause / forward-15), and a row
 *      of pills (speed / voice / chapters) that open their respective
 *      sheets.
 *   2. Recently listened — three rows max. Active book shows animated EQ
 *      bars instead of a play button; tapping any other row switches audio.
 *   3. This month — three stat cards (listening time, books started, audio
 *      remaining).
 *
 * `state: 'playing' | 'paused'` toggles styling: paused dims the card,
 * desaturates pills, swaps the pause icon for play, and replaces the EQ
 * bars in the active recent row with two static bars.
 *
 * Tab bar is rendered by the host (App.tsx); this screen is only the
 * scrollable content area between the status bar and the tab bar.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Image,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { EqBars, Icon, Text } from '~/components';
import { tokens } from '~/design/tokens';
import { peekCachedCoverUrl, resolveCoverUrl } from '~/lib/bookCovers';
import type { Speed } from '~/screens/PlaybackSpeedSheet';

// ─── Props ────────────────────────────────────────────────────────────────────

export type ListenPlaybackState = 'playing' | 'paused';

export type RecentTrack = {
  id: string;
  bookTitle: string;
  /** e.g. "Ch. 18 · yesterday", "Finished · 3 days ago". */
  meta: string;
  /** Two-letter cover initials. */
  initials: string;
  /** Background colour for the cover. Falls back to amber. */
  coverColor?: string;
  /**
   * Supabase Storage path to the book's cover. When set, the row
   * renders an Image over the colored placeholder (resolved
   * lazily via `resolveCoverUrl` inside the row component). Falls
   * back to the colored initial when the path is null or the
   * signed-URL fetch fails offline.
   */
  coverStoragePath?: string | null;
};

export type MonthStats = {
  listeningHours: number;
  listeningHoursDelta?: string; // e.g. "↑ from 2.8h"
  booksStarted: number;
  booksFinished?: number;
  audioRemainingMin: number;
  audioResetLabel?: string; // e.g. "Resets June 1"
};

export type ListenNowPlayingScreenProps = {
  state: ListenPlaybackState;
  bookTitle: string;
  author: string;
  chapterLabel: string;
  /** 0–100. */
  progressPercent: number;
  /** "M:SS" formatted. */
  elapsed: string;
  /** "-M:SS" formatted. */
  remaining: string;
  speed: Speed;
  voice: string; // e.g. "Sarah"
  recentlyListened: RecentTrack[];
  /** Active row id within recentlyListened. */
  activeRecentId?: string;
  monthStats: MonthStats;

  onPlayPause: () => void;
  /** Page prev (outer left). */
  onSkipBack: () => void;
  /** Page next (outer right). */
  onSkipForward: () => void;
  /** Rewind 15s within the current page (inner left). */
  onRewind15?: () => void;
  /** Forward 15s within the current page (inner right). */
  onForward15?: () => void;
  onScrubTo?: (percent: number) => void;
  onOpenSpeedSheet: () => void;
  onOpenVoiceSheet: () => void;
  onOpenChaptersSheet: () => void;
  onOpenRecent: (id: string) => void;
  onSeeAllRecent?: () => void;
  onOpenProfile?: () => void;
};

// ─── Screen ───────────────────────────────────────────────────────────────────

export function ListenNowPlayingScreen({
  state,
  bookTitle,
  author,
  chapterLabel,
  progressPercent,
  elapsed,
  remaining,
  speed,
  voice,
  recentlyListened,
  activeRecentId,
  monthStats,
  onPlayPause,
  onSkipBack,
  onSkipForward,
  onRewind15,
  onForward15,
  onScrubTo,
  onOpenSpeedSheet,
  onOpenVoiceSheet,
  onOpenChaptersSheet,
  onOpenRecent,
  onSeeAllRecent,
  onOpenProfile,
}: ListenNowPlayingScreenProps) {
  const paused = state === 'paused';
  const cardBg = paused ? '#2C3B31' : tokens.colors.forest[800];
  const dimOpacity = paused ? 0.6 : 1;

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Header — title only. Profile lives in the You tab, no need
            to surface a duplicate avatar here. */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Listen</Text>
        </View>

        {/* Hero card */}
        <View style={[styles.card, { backgroundColor: cardBg }]}>
          {/* Top row: cover + meta */}
          <View style={styles.topRow}>
            <View style={[styles.cover, paused && { opacity: 0.7 }]}>
              <Text style={styles.coverText} numberOfLines={3}>
                {bookTitle}
              </Text>
            </View>
            <View style={styles.metaCol}>
              <View
                style={[
                  styles.badge,
                  paused && { backgroundColor: 'rgba(255,255,255,0.1)' },
                ]}
              >
                <View
                  style={[
                    styles.badgeDot,
                    paused && {
                      backgroundColor: 'rgba(255,255,255,0.4)',
                    },
                  ]}
                />
                <Text
                  style={[
                    styles.badgeLabel,
                    paused && { color: 'rgba(255,255,255,0.5)' },
                  ]}
                >
                  {paused ? 'Paused' : 'Now playing'}
                </Text>
              </View>
              {/* Long titles (e.g. multi-volume commentaries like
               *  "Expositions of Holy Scripture / Second Corinthians,
               *  Galatians, and Philippians Chapters / I to End…")
               *  used to swallow the entire hero card. Cap at 2 lines
               *  with `numberOfLines + ellipsizeMode='tail'` so the
               *  scrub bar and transport stay visible above the fold. */}
              <Text
                style={styles.title}
                numberOfLines={2}
                ellipsizeMode="tail"
              >
                {bookTitle}
              </Text>
              <Text style={styles.author} numberOfLines={1}>
                {author}
              </Text>
              <Text style={styles.chapter} numberOfLines={1}>
                {chapterLabel}
              </Text>
            </View>
          </View>

          {/* Scrub bar — draggable. While the user is dragging, we show a
              live preview percentage so the thumb tracks their finger,
              then commit to the audio session on release via onScrubTo.
              The actual audio.positionSeconds is the source of truth at
              rest; the local override only applies during a drag gesture. */}
          <ScrubBar
            progressPercent={progressPercent}
            paused={paused}
            elapsed={elapsed}
            remaining={remaining}
            onScrubTo={onScrubTo}
          />

          {/* Transport controls — Audible-style 5-button row:
              | page prev | -15s | play/pause | +15s | page next |
              Outer buttons jump pages; inner buttons nudge 15 seconds
              within the current page; centre is play/pause. */}
          <View style={styles.controls}>
            <Pressable
              onPress={onSkipBack}
              style={[styles.skipBtn, paused && { opacity: 0.5 }]}
              hitSlop={6}
              accessibilityLabel="Previous page"
            >
              {/* Curved-arrow "skip" icon for page prev — matches the
                  "this is a chunky jump" feel users expect from a
                  page-skip control. */}
              <Icon
                name="PlayerSkipBack"
                size={24}
                color="rgba(255,255,255,0.85)"
                strokeWidth={1.5}
              />
            </Pressable>

            <Pressable
              onPress={onRewind15}
              style={[styles.nudgeBtn, paused && { opacity: 0.5 }]}
              hitSlop={6}
              accessibilityLabel="Rewind 15 seconds"
            >
              {/* Triangle+bar "track" icon for the 15-second nudge —
                  the textual "15" badge is gone (icon-only matches
                  the page-skip controls and keeps the row visually
                  aligned). The screen-reader label still
                  communicates the 15-second step. */}
              <Icon
                name="PlayerTrackPrev"
                size={22}
                color="rgba(255,255,255,0.85)"
                strokeWidth={1.5}
              />
            </Pressable>

            <Pressable
              onPress={onPlayPause}
              style={[
                styles.playBtn,
                paused && { backgroundColor: 'rgba(255,255,255,0.85)' },
              ]}
              accessibilityRole="button"
              accessibilityLabel={paused ? 'Play' : 'Pause'}
            >
              <Icon
                name={paused ? 'Play' : 'Pause'}
                size={22}
                color={tokens.colors.forest[900]}
                strokeWidth={0}
              />
            </Pressable>

            <Pressable
              onPress={onForward15}
              style={[styles.nudgeBtn, paused && { opacity: 0.5 }]}
              hitSlop={6}
              accessibilityLabel="Forward 15 seconds"
            >
              <Icon
                name="PlayerTrackNext"
                size={22}
                color="rgba(255,255,255,0.85)"
                strokeWidth={1.5}
              />
            </Pressable>

            <Pressable
              onPress={onSkipForward}
              style={[styles.skipBtn, paused && { opacity: 0.5 }]}
              hitSlop={6}
              accessibilityLabel="Next page"
            >
              <Icon
                name="PlayerSkipForward"
                size={24}
                color="rgba(255,255,255,0.85)"
                strokeWidth={1.5}
              />
            </Pressable>
          </View>

          {/* Pills — speed + voice. Chapters pill removed: pages are the
              navigation unit (not chapters), and the prev/next page
              buttons above already cover that. */}
          <View style={styles.pills}>
            <Pill
              icon="ArrowsSort"
              label={`${formatSpeed(speed)}×`}
              prominent
              onPress={onOpenSpeedSheet}
              opacity={dimOpacity}
            />
            <Pill icon="Microphone" label={voice} onPress={onOpenVoiceSheet} opacity={dimOpacity} />
          </View>
        </View>

        {/* Recently listened */}
        <View style={styles.sectionRow}>
          <Text style={styles.sectionTitle}>Recently listened</Text>
          {onSeeAllRecent && (
            <Pressable onPress={onSeeAllRecent} hitSlop={6}>
              <Text style={styles.seeAll}>See all →</Text>
            </Pressable>
          )}
        </View>
        <View style={styles.recentList}>
          {recentlyListened.map((track, i) => {
            const isActive = track.id === activeRecentId;
            const isLast = i === recentlyListened.length - 1;
            return (
              <Pressable
                key={track.id}
                onPress={() => onOpenRecent(track.id)}
                style={[
                  styles.recentRow,
                  isActive && { backgroundColor: tokens.colors.forest[50] },
                  !isLast && styles.recentRowDivider,
                ]}
                accessibilityRole="button"
              >
                <RecentCover
                  storagePath={track.coverStoragePath ?? null}
                  fallbackColor={
                    isActive
                      ? tokens.colors.forest[800]
                      : (track.coverColor ?? tokens.colors.amber[500])
                  }
                  initials={track.initials}
                  dimmed={paused && isActive}
                />
                <View style={styles.recentInfo}>
                  <Text
                    style={[
                      styles.recentTitle,
                      isActive && { color: tokens.colors.forest[800] },
                    ]}
                    numberOfLines={1}
                  >
                    {track.bookTitle}
                  </Text>
                  <Text
                    style={[
                      styles.recentMeta,
                      isActive && { color: tokens.colors.forest[700] },
                    ]}
                    numberOfLines={1}
                  >
                    {track.meta}
                  </Text>
                </View>

                {/* Right-side affordance — always inside the same
                    circular tile so the three icon states (play /
                    paused / playing) line up vertically with each
                    other across rows. Before, paused + playing used
                    a free-floating pair of bars or an equaliser
                    which sat at a different baseline than the
                    play-button circles in the inactive rows. */}
                <View style={styles.recentAction}>
                  {isActive ? (
                    paused ? (
                      <Icon
                        name="Pause"
                        size={12}
                        color={tokens.colors.forest[800]}
                        strokeWidth={0}
                      />
                    ) : (
                      <EqBars />
                    )
                  ) : (
                    <Icon
                      name="Play"
                      size={12}
                      color={tokens.textColors.secondary}
                      strokeWidth={0}
                    />
                  )}
                </View>
              </Pressable>
            );
          })}
        </View>

        {/* This month */}
        <View style={styles.sectionRow}>
          <Text style={styles.sectionTitle}>This month</Text>
        </View>
        <View style={styles.statsGrid}>
          <StatCard
            value={`${monthStats.listeningHours}`}
            unit="h"
            label="Listening time"
            delta={monthStats.listeningHoursDelta}
          />
          <StatCard
            value={`${monthStats.booksStarted}`}
            label="Books started"
            delta={
              monthStats.booksFinished !== undefined
                ? `${monthStats.booksFinished} finished`
                : undefined
            }
          />
          <StatCard
            value={`${monthStats.audioRemainingMin}`}
            unit="m"
            label="Audio remaining"
            delta={monthStats.audioResetLabel}
            mutedDelta
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Sub-components ──────────────────────────────────────────────────────────

/**
 * Cover thumbnail for a recently-listened row. Loads the book's
 * real cover via `resolveCoverUrl` (cached, signed Supabase Storage
 * URL) and falls back to the colored initial placeholder when:
 *   - no storagePath is set (book was never uploaded with a cover)
 *   - the resolve hasn't completed yet (first paint after mount)
 *   - the resolve failed (offline → cover-resolve rejects)
 *   - the Image's onError fires (signed URL expired mid-render)
 *
 * Mirrors audioSession's cover-resolution pattern: synchronous
 * peek first so warm caches paint immediately without an Image
 * flash, async fetch second.
 */
function RecentCover({
  storagePath,
  fallbackColor,
  initials,
  dimmed,
}: {
  storagePath: string | null;
  fallbackColor: string;
  initials: string;
  dimmed?: boolean;
}) {
  const initial = storagePath ? peekCachedCoverUrl(storagePath) : null;
  const [url, setUrl] = useState<string | null>(initial);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!storagePath) {
      setUrl(null);
      return;
    }
    if (url) return; // already resolved synchronously or by a prior pass
    let cancelled = false;
    void resolveCoverUrl(storagePath)
      .then((resolved) => {
        if (!cancelled) setUrl(resolved);
      })
      .catch((err) => {
        // Silent on offline — colored placeholder is a graceful
        // fallback. Metro-only log for debugging.
        if (!cancelled) console.warn('[ListenRecent] cover resolve failed:', err);
      });
    return () => {
      cancelled = true;
    };
  }, [storagePath, url]);

  const showImage = !!url && !failed;
  return (
    <View
      style={[
        styles.recentCover,
        { backgroundColor: fallbackColor },
        dimmed && { opacity: 0.6 },
      ]}
    >
      {showImage ? (
        <Image
          source={{ uri: url! }}
          style={StyleSheet.absoluteFill}
          resizeMode="cover"
          onError={() => setFailed(true)}
        />
      ) : (
        <Text style={styles.recentCoverText}>{initials}</Text>
      )}
    </View>
  );
}

/**
 * Draggable scrub bar. Two display modes:
 *   - At rest: position reflects the live `progressPercent` from the
 *     audio session.
 *   - While the user drags: a local override drives the thumb, so the
 *     bar tracks the finger smoothly without waiting for round-trip
 *     audio updates. On release we commit via `onScrubTo`.
 *
 * We use PanResponder (built-in) rather than the gesture-handler library
 * so this stays a leaf component with no extra setup. The track grabs
 * the responder on press-down too, so a tap-to-seek (rather than just
 * drag) also works.
 */
function ScrubBar({
  progressPercent,
  paused,
  elapsed,
  remaining,
  onScrubTo,
}: {
  progressPercent: number;
  paused: boolean;
  elapsed: string;
  remaining: string;
  onScrubTo?: (percent: number) => void;
}) {
  // Drag-time override percent. null when not dragging — the bar then
  // reflects the live `progressPercent` driven by audio updates.
  const [dragPct, setDragPct] = useState<number | null>(null);
  // Track geometry, captured in screen coordinates. We measure the track
  // (not the surrounding hit area) so the percent maps to the actual
  // amber line, not to the padding around it.
  const trackRef = useRef<View>(null);
  const trackGeomRef = useRef<{ pageX: number; width: number }>({
    pageX: 0,
    width: 0,
  });

  const measureTrack = () => {
    trackRef.current?.measure((_x, _y, width, _height, pageX) => {
      // measure() may report 0 transiently while the layout is still
      // settling; ignore those reads so we don't divide by zero.
      if (width > 0) {
        trackGeomRef.current = { pageX, width };
      }
    });
  };

  // Re-measure on layout — covers initial mount, rotation, and any
  // resize. Measurement on grant covers the case where the parent has
  // scrolled the bar to a different on-screen position since last layout.
  const onTrackLayout = () => measureTrack();

  // Convert an absolute screen X (e.g. gestureState.moveX) into a 0–100
  // percent within the track. Clamps at the edges so dragging past the
  // track still pins the thumb to 0% / 100%.
  const computePctFromScreenX = (screenX: number) => {
    const { pageX, width } = trackGeomRef.current;
    if (width <= 0) return 0;
    const ratio = (screenX - pageX) / width;
    return clampPct(ratio * 100);
  };

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,

      onPanResponderGrant: (e) => {
        // Re-measure right before we start so a stale geometry from a
        // previous layout cycle doesn't throw the math off.
        measureTrack();
        setDragPct(computePctFromScreenX(e.nativeEvent.pageX));
      },
      onPanResponderMove: (_e, gestureState) => {
        // gestureState.moveX is the current finger position in screen
        // coords; matches the basis we measured the track in. Using
        // nativeEvent.locationX here (RN's earlier API) reports
        // responder-relative X which drifts when the responder is
        // padded — that was the source of the inaccuracy.
        setDragPct(computePctFromScreenX(gestureState.moveX));
      },
      onPanResponderRelease: (_e, gestureState) => {
        const final = computePctFromScreenX(gestureState.moveX);
        setDragPct(null);
        onScrubTo?.(final);
      },
      onPanResponderTerminate: () => {
        setDragPct(null);
      },
    }),
  ).current;

  const displayPct = dragPct ?? clampPct(progressPercent);

  return (
    <View style={styles.scrub}>
      {/* Tall hit area around the 4px-tall track so the gesture is easy
          to grab even when the line is thin. The track itself is what we
          measure for the percent calculation — the hit area's padding
          must NOT factor in. */}
      <View style={styles.scrubHitArea} {...panResponder.panHandlers}>
        <View
          ref={trackRef}
          style={styles.scrubTrack}
          onLayout={onTrackLayout}
        >
          <View
            style={[
              styles.scrubFill,
              {
                width: `${displayPct}%`,
                backgroundColor: paused ? 'rgba(255,255,255,0.4)' : tokens.colors.amber[500],
              },
            ]}
          >
            <View
              style={[
                styles.scrubThumb,
                paused && { backgroundColor: 'rgba(255,255,255,0.7)' },
                dragPct !== null && styles.scrubThumbActive,
              ]}
            />
          </View>
        </View>
      </View>
      <View style={styles.scrubTimes}>
        <Text style={[styles.scrubTimeText, paused && { color: 'rgba(255,255,255,0.35)' }]}>
          {elapsed}
        </Text>
        <Text style={[styles.scrubTimeText, paused && { color: 'rgba(255,255,255,0.35)' }]}>
          {remaining}
        </Text>
      </View>
    </View>
  );
}

function Pill({
  icon,
  label,
  prominent = false,
  onPress,
  opacity = 1,
}: {
  icon: 'ArrowsSort' | 'Microphone' | 'ListDetails';
  label: string;
  prominent?: boolean;
  onPress: () => void;
  opacity?: number;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.pill,
        prominent && { backgroundColor: 'rgba(255,255,255,0.18)' },
        { opacity },
      ]}
      accessibilityRole="button"
    >
      <Icon name={icon} size={11} color="rgba(255,255,255,0.75)" strokeWidth={1.5} />
      <Text style={styles.pillLabel}>{label}</Text>
    </Pressable>
  );
}

// EqBars moved to `~/components/EqBars` so the recently-listened
// row in ListenHistoryScreen can share the same animation while
// also exposing a paused state.

function StatCard({
  value,
  unit,
  label,
  delta,
  mutedDelta = false,
}: {
  value: string;
  unit?: string;
  label: string;
  delta?: string;
  mutedDelta?: boolean;
}) {
  return (
    <View style={styles.statCard}>
      <Text style={styles.statValue}>
        {value}
        {unit && <Text style={styles.statUnit}>{unit}</Text>}
      </Text>
      <Text style={styles.statLabel}>{label}</Text>
      {delta && (
        <Text style={[styles.statDelta, mutedDelta && { color: tokens.textColors.muted }]}>
          {delta}
        </Text>
      )}
    </View>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function clampPct(n: number) {
  return Math.max(0, Math.min(100, n));
}

function formatSpeed(s: Speed): string {
  return Number.isInteger(s) ? `${s}` : `${s}`;
}

// Placate the unused-var linter for the imported useMemo (kept for future
// memoised stats reshaping).
useMemo;

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: tokens.bgColors.canvas },
  scroll: { flex: 1 },
  scrollContent: { paddingBottom: 28 },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 22,
    paddingTop: 14,
    paddingBottom: 10,
  },
  headerTitle: {
    fontFamily: tokens.fonts.display,
    fontSize: 28,
    fontWeight: '500',
    // Fraunces' display variant has tall ascenders; without an explicit
    // lineHeight, RN's auto-line-height clips the top of the cap on iOS.
    // 36 gives the glyphs comfortable breathing room without bloating the
    // header.
    lineHeight: 36,
    color: tokens.textColors.primary,
    letterSpacing: -0.5,
  },
  headerBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: tokens.bgColors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Hero card
  card: {
    marginHorizontal: 18,
    marginBottom: 22,
    borderRadius: 18,
    padding: 20,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 16,
    marginBottom: 20,
  },
  cover: {
    width: 72,
    height: 100,
    borderRadius: 8,
    backgroundColor: tokens.colors.forest[700],
    padding: 6,
    justifyContent: 'flex-end',
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  coverText: {
    fontFamily: tokens.fonts.display,
    fontSize: 7,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.6)',
    lineHeight: 9,
  },

  metaCol: { flex: 1, paddingTop: 2 },
  badge: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 99,
    paddingHorizontal: 10,
    paddingVertical: 3,
    marginBottom: 10,
  },
  badgeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: tokens.colors.amber[500],
  },
  badgeLabel: {
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 10,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.85)',
    letterSpacing: 0.04,
  },
  title: {
    fontFamily: tokens.fonts.display,
    fontSize: 18,
    fontWeight: '500',
    color: '#fff',
    letterSpacing: -0.18,
    marginBottom: 4,
  },
  author: {
    fontFamily: tokens.fonts.ui,
    fontSize: 12,
    color: tokens.colors.forest[200],
    marginBottom: 6,
  },
  chapter: {
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 12,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.7)',
  },

  // Scrub
  scrub: { marginBottom: 16 },
  // Tall transparent hit area around the visible track so the drag
  // gesture is easy to grab on a 4px-tall line.
  scrubHitArea: {
    paddingVertical: 10,
    marginVertical: -10,
    justifyContent: 'center',
  },
  scrubTrack: {
    height: 4,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 2,
    marginBottom: 6,
  },
  scrubFill: {
    height: '100%',
    borderRadius: 2,
    position: 'relative',
  },
  scrubThumb: {
    position: 'absolute',
    right: -7,
    top: -5,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 2,
  },
  // Slight enlargement during drag so the user feels the engagement.
  scrubThumbActive: {
    transform: [{ scale: 1.25 }],
    shadowOpacity: 0.45,
  },
  scrubTimes: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  scrubTimeText: {
    fontFamily: tokens.fonts.ui,
    fontSize: 11,
    color: 'rgba(255,255,255,0.55)',
  },

  // Controls — `space-between` so the outer buttons sit flush with the
  // card's left and right edges, matching the scrub bar and timecode
  // row that span the same width. Gives the transport row a solid
  // anchor to the card's content rails instead of floating mid-card.
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  skipBtn: {
    width: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  skipLabel: {
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 10,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.5)',
  },
  // Inner nudge buttons (-15s / +15s). Slightly different shape than
  // skipBtn — they carry a "15" badge under/beside the icon to signal
  // "fifteen seconds" instead of "previous/next page".
  nudgeBtn: {
    width: 40,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 1,
  },
  nudgeLabel: {
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 9,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.5)',
    letterSpacing: 0.04,
  },
  playBtn: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },

  // Pills
  pills: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7,
  },
  pill: {
    height: 30,
    paddingHorizontal: 12,
    borderRadius: 15,
    backgroundColor: 'rgba(255,255,255,0.12)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  pillLabel: {
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 11,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.85)',
  },

  // Section rows
  sectionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 22,
    marginBottom: 10,
  },
  sectionTitle: {
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 13,
    fontWeight: '500',
    color: tokens.textColors.primary,
  },
  seeAll: {
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 12,
    fontWeight: '500',
    color: tokens.colors.forest[800],
  },

  // Recent list
  recentList: {
    marginHorizontal: 18,
    marginBottom: 22,
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 0.5,
    borderColor: tokens.borderColors.subtle,
    backgroundColor: tokens.bgColors.canvas,
  },
  recentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
  recentRowDivider: {
    borderBottomWidth: 0.5,
    borderBottomColor: tokens.borderColors.subtle,
  },
  recentCover: {
    width: 38,
    height: 38,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  recentCoverText: {
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 12,
    fontWeight: '500',
    color: tokens.colors.cream[50],
  },
  recentInfo: { flex: 1, minWidth: 0 },
  recentTitle: {
    fontFamily: tokens.fonts.display,
    fontSize: 13,
    fontWeight: '500',
    color: tokens.textColors.primary,
  },
  recentMeta: {
    fontFamily: tokens.fonts.ui,
    fontSize: 10,
    color: tokens.textColors.muted,
  },
  recentAction: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: tokens.bgColors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // EQ-bar styles moved into the shared `~/components/EqBars` component.

  // Pause bars
  pauseBars: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  pauseBar: {
    width: 3,
    height: 10,
    borderRadius: 1.5,
    backgroundColor: tokens.colors.forest[800],
    opacity: 0.5,
  },

  // Stats
  statsGrid: {
    flexDirection: 'row',
    gap: 10,
    marginHorizontal: 18,
  },
  statCard: {
    flex: 1,
    backgroundColor: tokens.bgColors.surface,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 14,
  },
  statValue: {
    fontFamily: tokens.fonts.display,
    fontSize: 22,
    fontWeight: '500',
    color: tokens.textColors.primary,
    letterSpacing: -0.4,
    marginBottom: 3,
  },
  statUnit: {
    fontSize: 14,
    color: tokens.textColors.muted,
  },
  statLabel: {
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 10,
    fontWeight: '500',
    color: tokens.textColors.muted,
    lineHeight: 14,
  },
  statDelta: {
    fontFamily: tokens.fonts.ui,
    fontSize: 9,
    color: tokens.colors.forest[800],
    marginTop: 3,
  },
});
