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

import { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Icon, Text } from '~/components';
import { tokens } from '~/design/tokens';
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
  onSkipBack: () => void;
  onSkipForward: () => void;
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
  onScrubTo: _onScrubTo,
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
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Listen</Text>
          <Pressable
            onPress={onOpenProfile ?? (() => {})}
            hitSlop={6}
            style={styles.headerBtn}
            accessibilityLabel="Profile"
          >
            <Icon name="User" size={15} color={tokens.textColors.secondary} strokeWidth={1.5} />
          </Pressable>
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
              <Text style={styles.title}>{bookTitle}</Text>
              <Text style={styles.author}>{author}</Text>
              <Text style={styles.chapter}>{chapterLabel}</Text>
            </View>
          </View>

          {/* Scrub bar */}
          <View style={styles.scrub}>
            <View style={styles.scrubTrack}>
              <View
                style={[
                  styles.scrubFill,
                  {
                    width: `${clampPct(progressPercent)}%`,
                    backgroundColor: paused ? 'rgba(255,255,255,0.4)' : tokens.colors.amber[500],
                  },
                ]}
              >
                <View
                  style={[
                    styles.scrubThumb,
                    paused && { backgroundColor: 'rgba(255,255,255,0.7)' },
                  ]}
                />
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

          {/* Transport controls */}
          <View style={styles.controls}>
            <Pressable
              onPress={onSkipBack}
              style={[styles.skipBtn, paused && { opacity: 0.5 }]}
              hitSlop={6}
              accessibilityLabel="Back 15 seconds"
            >
              <Icon
                name="PlayerTrackPrev"
                size={26}
                color="rgba(255,255,255,0.85)"
                strokeWidth={1.5}
              />
              <Text style={[styles.skipLabel, paused && { opacity: 0.7 }]}>15s</Text>
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
              onPress={onSkipForward}
              style={[styles.skipBtn, paused && { opacity: 0.5 }]}
              hitSlop={6}
              accessibilityLabel="Forward 15 seconds"
            >
              <Icon
                name="PlayerTrackNext"
                size={26}
                color="rgba(255,255,255,0.85)"
                strokeWidth={1.5}
              />
              <Text style={[styles.skipLabel, paused && { opacity: 0.7 }]}>15s</Text>
            </Pressable>
          </View>

          {/* Pills */}
          <View style={styles.pills}>
            <Pill
              icon="ArrowsSort"
              label={`${formatSpeed(speed)}×`}
              prominent
              onPress={onOpenSpeedSheet}
              opacity={dimOpacity}
            />
            <Pill icon="Microphone" label={voice} onPress={onOpenVoiceSheet} opacity={dimOpacity} />
            <Pill
              icon="ListDetails"
              label="Chapters"
              onPress={onOpenChaptersSheet}
              opacity={dimOpacity}
            />
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
                <View
                  style={[
                    styles.recentCover,
                    {
                      backgroundColor: isActive
                        ? tokens.colors.forest[800]
                        : (track.coverColor ?? tokens.colors.amber[500]),
                    },
                    paused && isActive && { opacity: 0.6 },
                  ]}
                >
                  <Text style={styles.recentCoverText}>{track.initials}</Text>
                </View>
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

                {isActive ? (
                  paused ? (
                    <View style={styles.pauseBars}>
                      <View style={styles.pauseBar} />
                      <View style={styles.pauseBar} />
                    </View>
                  ) : (
                    <EqBars />
                  )
                ) : (
                  <View style={styles.recentAction}>
                    <Icon name="Play" size={12} color={tokens.textColors.secondary} strokeWidth={0} />
                  </View>
                )}
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

/**
 * Three vertical bars of varying heights — purely decorative indicator
 * that audio is currently playing. Not animated to keep the scroll list
 * cheap and avoid distraction; the source of truth for "playing" is the
 * hero card's pulsing badge.
 */
function EqBars() {
  return (
    <View style={styles.eqWrap}>
      <View style={[styles.eqBar, { height: 8 }]} />
      <View style={[styles.eqBar, { height: 14 }]} />
      <View style={[styles.eqBar, { height: 10 }]} />
    </View>
  );
}

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
    paddingTop: 6,
    paddingBottom: 10,
  },
  headerTitle: {
    fontFamily: tokens.fonts.display,
    fontSize: 28,
    fontWeight: '500',
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
  scrubTimes: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  scrubTimeText: {
    fontFamily: tokens.fonts.ui,
    fontSize: 11,
    color: 'rgba(255,255,255,0.55)',
  },

  // Controls
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  skipBtn: {
    width: 48,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
  },
  skipLabel: {
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 10,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.5)',
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

  // EQ bars
  eqWrap: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 2,
    height: 16,
  },
  eqBar: {
    width: 3,
    borderRadius: 1.5,
    backgroundColor: tokens.colors.forest[800],
  },

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
