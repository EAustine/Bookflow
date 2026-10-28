/**
 * LibraryHero — the tablet-portrait hero card. Figma
 * `Library hero (Medium)` `361:2`.
 *
 * One surface card carrying what the phone splits across two: continue
 * reading on the left, a divider, then the reading stats in a 176
 * column. The build log's note on it is blunt about why — the phone's
 * two cards sat side by side on a tablet and did not match each other.
 *
 * Medium only. Expanded and Desktop drop it entirely, because the book
 * pane does the continue-reading job and the stats move into the
 * master column.
 */

import { StyleSheet, View } from 'react-native';
import { Button } from '~/components/Button';
import { Icon } from '~/components/Icon';
import { Text } from '~/components/Text';
import { useDownloadsStore } from '~/stores/downloadsStore';
import type { Book } from '~/types/book';
import { tokens } from '~/design/tokens';
import { BookCover, ProgressBar } from './BookCover';
import { WEEKDAYS, formatDuration, weekdayTodayIndex } from './readingWeek';

/** The build log's measurements for this card. */
const COVER_WIDTH = 100; // 100 × 150 at the 2:3 cover ratio
const STATS_WIDTH = 176;

export type LibraryHeroProps = {
  /** Null when nothing is in progress — the card then shows stats only. */
  book: Book | null;
  stats: { minutesThisWeek: number; minutesToday: number; streakDays: number };
  /** Seven booleans, Mon → Sun, true if the user read that day. */
  weekDays: boolean[];
  isOffline?: boolean;
  onListen: (book: Book) => void;
  onRead: (book: Book) => void;
};

export function LibraryHero({
  book,
  stats,
  weekDays,
  isOffline,
  onListen,
  onRead,
}: LibraryHeroProps) {
  const hasStats = stats.minutesThisWeek > 0 || stats.streakDays > 0;
  // Nothing to say in either half: no card at all, rather than an empty
  // surface taking the top of the screen.
  if (!book && !hasStats) return null;

  return (
    <View style={styles.card}>
      {book && (
        <ContinueHalf
          book={book}
          isOffline={isOffline}
          onListen={onListen}
          onRead={onRead}
        />
      )}
      {book && hasStats && <View style={styles.divider} />}
      {hasStats && <StatsHalf stats={stats} weekDays={weekDays} />}
    </View>
  );
}

function ContinueHalf({
  book,
  isOffline,
  onListen,
  onRead,
}: {
  book: Book;
  isOffline?: boolean;
  onListen: (book: Book) => void;
  onRead: (book: Book) => void;
}) {
  const pageNum = book.currentChapter?.match(/\d+/)?.[0];
  const statusLine = pageNum
    ? `Page ${pageNum} · ${book.progressPercent}% done`
    : `${book.progressPercent}% done`;
  const isDownloaded = useDownloadsStore(
    (s) => s.downloads[book.id]?.status === 'complete',
  );
  // A downloaded book plays from local files, so it stays listenable
  // with no connection — only block Listen when offline AND not
  // downloaded. Same rule as the phone's continue card.
  const audioBlocked = !!isOffline && !isDownloaded;

  return (
    <View style={styles.continue}>
      <Text style={styles.eyebrow}>Continue reading</Text>
      <View style={styles.continueRow}>
        <BookCover book={book} width={COVER_WIDTH} />
        <View style={styles.continueMeta}>
          <Text style={styles.title} numberOfLines={2}>
            {book.title}
          </Text>
          <Text variant="body-sm" color="muted" numberOfLines={1}>
            {book.author}
          </Text>
          <Text variant="body-xs" color="subtle" numberOfLines={1} style={styles.status}>
            {statusLine}
          </Text>
          <View style={styles.progressWrap}>
            <ProgressBar percent={book.progressPercent} height={3} />
          </View>
          <View style={styles.actions}>
            <View style={[styles.listenWrap, audioBlocked && styles.dimmed]}>
              <Button
                label="Listen"
                variant="primary"
                size="compact"
                leadingIcon="Play"
                fullWidth
                disabled={audioBlocked}
                onPress={() => onListen(book)}
              />
            </View>
            <Button
              label="Read"
              variant="secondary"
              size="compact"
              onPress={() => onRead(book)}
            />
          </View>
          {audioBlocked && (
            <View style={styles.offlineNote}>
              <Icon name="AlertTriangle" size={10} color={tokens.textColors.disabled} />
              <Text style={styles.offlineNoteText}>
                Audio streaming unavailable offline
              </Text>
            </View>
          )}
        </View>
      </View>
    </View>
  );
}

function StatsHalf({
  stats,
  weekDays,
}: {
  stats: { minutesThisWeek: number; minutesToday: number; streakDays: number };
  weekDays: boolean[];
}) {
  const todayIndex = weekdayTodayIndex();
  const headline =
    stats.minutesToday > 0
      ? `${formatDuration(stats.minutesToday)} today`
      : `${formatDuration(stats.minutesThisWeek)} this week`;
  const subline =
    stats.minutesToday > 0
      ? `${formatDuration(stats.minutesThisWeek)} this week`
      : 'No reading yet today';

  return (
    <View style={styles.stats}>
      <Text style={styles.statsHeadline}>{headline}</Text>
      <Text style={styles.statsSubline}>{subline}</Text>
      <View style={styles.dots}>
        {WEEKDAYS.map((day, i) => {
          const filled = weekDays[i];
          const isToday = i === todayIndex;
          return (
            <View key={day.id} style={styles.dotColumn}>
              <View
                style={[
                  styles.dot,
                  filled && styles.dotFilled,
                  isToday && (filled ? styles.dotToday : styles.dotTodayEmpty),
                ]}
              />
              <Text style={[styles.dotLabel, isToday && styles.dotLabelToday]}>
                {day.label}
              </Text>
            </View>
          );
        })}
      </View>
      {stats.streakDays > 0 && (
        <View style={styles.streak}>
          <Text style={styles.streakValue}>{stats.streakDays}</Text>
          <Text style={styles.streakLabel}>day streak</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'stretch',
    backgroundColor: tokens.bgColors.surface,
    borderRadius: tokens.radii.xl,
    padding: tokens.space.xl,
    gap: tokens.space.xl,
  },
  divider: {
    width: StyleSheet.hairlineWidth,
    backgroundColor: tokens.borderColors.subtle,
  },
  continue: {
    flex: 1,
    gap: tokens.space.md,
  },
  eyebrow: {
    fontFamily: tokens.fonts.uiMedium,
    fontSize: tokens.fontSizes.ui.xxs,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    color: tokens.textColors.muted,
  },
  continueRow: {
    flexDirection: 'row',
    gap: tokens.space.lg,
  },
  continueMeta: {
    flex: 1,
    minWidth: 0,
    justifyContent: 'center',
    gap: 2,
  },
  title: {
    fontFamily: tokens.fonts.display,
    fontSize: tokens.fontSizes.display.sm,
    lineHeight: 24,
    color: tokens.textColors.primary,
  },
  status: {
    paddingTop: tokens.space.xs,
  },
  progressWrap: {
    paddingTop: tokens.space.xs,
    paddingBottom: tokens.space.md,
  },
  actions: {
    flexDirection: 'row',
    gap: tokens.space.sm,
  },
  listenWrap: {
    flex: 1,
  },
  dimmed: {
    opacity: 0.4,
  },
  offlineNote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingTop: tokens.space.xs,
  },
  offlineNoteText: {
    fontFamily: tokens.fonts.ui,
    fontSize: tokens.fontSizes.ui.xxxs,
    color: tokens.textColors.disabled,
  },
  stats: {
    width: STATS_WIDTH,
    justifyContent: 'center',
    gap: 2,
  },
  statsHeadline: {
    fontFamily: tokens.fonts.display,
    fontSize: tokens.fontSizes.display.md,
    color: tokens.textColors.primary,
  },
  statsSubline: {
    fontFamily: tokens.fonts.ui,
    fontSize: tokens.fontSizes.ui.sm,
    color: tokens.textColors.muted,
  },
  dots: {
    flexDirection: 'row',
    gap: tokens.space.sm,
    paddingTop: tokens.space.md,
  },
  dotColumn: {
    alignItems: 'center',
    gap: 4,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: tokens.colors.cream[200],
  },
  dotFilled: {
    backgroundColor: tokens.colors.amber[500],
  },
  dotToday: {
    backgroundColor: tokens.colors.amber[500],
  },
  dotTodayEmpty: {
    borderWidth: 1,
    borderColor: tokens.colors.amber[500],
  },
  dotLabel: {
    fontFamily: tokens.fonts.ui,
    fontSize: tokens.fontSizes.ui.xxxs,
    color: tokens.textColors.disabled,
  },
  dotLabelToday: {
    color: tokens.textColors.primary,
    fontFamily: tokens.fonts.uiMedium,
  },
  streak: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingTop: tokens.space.lg,
  },
  streakValue: {
    fontFamily: tokens.fonts.display,
    fontSize: tokens.fontSizes.display.md,
    color: tokens.colors.amber[500],
  },
  streakLabel: {
    fontFamily: tokens.fonts.ui,
    fontSize: tokens.fontSizes.ui.xs,
    color: tokens.textColors.muted,
  },
});
