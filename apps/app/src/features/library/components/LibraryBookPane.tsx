/**
 * LibraryBookPane — the detail half of the wide Library. Figma
 * `Library book pane` `325:993`, States Selected / Empty.
 *
 * Expanded and Desktop only. Selecting a row in the 440 master fills
 * this; it is also why the Continue card is dropped at those sizes, per
 * the build log — the pane already says what the card said, for
 * whichever book you are looking at rather than just the latest one.
 *
 * Selecting a row must NOT open the reader. That distinction is the
 * whole point of master and detail, and it is why the screen keeps
 * `paneBook` separate from `selectedBook`: the latter is a route that
 * replaces the tree and tells the shell to hide its chrome.
 */

import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Button } from '~/components/Button';
import { Icon, type IconName } from '~/components/Icon';
import { Text } from '~/components/Text';
import { EmptyLibraryIllustration } from '~/components/illustrations/EmptyLibraryIllustration';
import { useDownloadsStore } from '~/stores/downloadsStore';
import type { Book } from '~/types/book';
import { tokens } from '~/design/tokens';
import { BookCover, ProgressBar } from './BookCover';
import { bookState, bookStatusLine } from './bookStatus';

const COVER_WIDTH = 132;

export type LibraryBookPaneProps = {
  /** Null renders the Empty state. */
  book: Book | null;
  now: Date;
  isOffline?: boolean;
  onRead: (book: Book) => void;
  onListen: (book: Book) => void;
  onViewHighlights: (book: Book) => void;
  onOpenAiTools?: (book: Book) => void;
};

export function LibraryBookPane({
  book,
  now,
  isOffline,
  onRead,
  onListen,
  onViewHighlights,
  onOpenAiTools,
}: LibraryBookPaneProps) {
  if (!book) {
    return (
      <View style={[styles.pane, styles.emptyPane]}>
        <EmptyLibraryIllustration size={180} />
        <Text style={styles.emptyTitle}>Nothing selected</Text>
        <Text variant="body-sm" color="muted" style={styles.emptyBody}>
          Pick a book from the list to see its progress, pick up where you
          left off, or jump into the AI tools.
        </Text>
      </View>
    );
  }

  return (
    <PaneContent
      book={book}
      now={now}
      isOffline={isOffline}
      onRead={onRead}
      onListen={onListen}
      onViewHighlights={onViewHighlights}
      onOpenAiTools={onOpenAiTools}
    />
  );
}

function PaneContent({
  book,
  now,
  isOffline,
  onRead,
  onListen,
  onViewHighlights,
  onOpenAiTools,
}: LibraryBookPaneProps & { book: Book }) {
  const state = bookState(book);
  const unreadable = state === 'processing' || state === 'failed';
  const isDownloaded = useDownloadsStore(
    (s) => s.downloads[book.id]?.status === 'complete',
  );
  const audioBlocked = (!!isOffline && !isDownloaded) || unreadable;

  return (
    <ScrollView
      style={styles.pane}
      contentContainerStyle={styles.paneContent}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.header}>
        <BookCover book={book} width={COVER_WIDTH} />
        <View style={styles.headerMeta}>
          <Text style={styles.title}>{book.title}</Text>
          <Text variant="body-sm" color="muted" numberOfLines={2}>
            {book.author}
          </Text>
          <Text variant="body-xs" color="subtle" style={styles.meta}>
            {`${book.type.toUpperCase()} · ${book.totalPages} pages`}
          </Text>
          <Text variant="body-xs" color="subtle">
            {bookStatusLine(book, now)}
          </Text>
        </View>
      </View>

      {state !== 'not-started' && !unreadable && (
        <View style={styles.progressWrap}>
          <ProgressBar percent={book.progressPercent} height={3} />
        </View>
      )}

      <View style={styles.actions}>
        <Button
          label={state === 'not-started' ? 'Start reading' : 'Continue reading'}
          variant="primary"
          size="standard"
          fullWidth
          disabled={unreadable}
          onPress={() => onRead(book)}
        />
        <View style={audioBlocked ? styles.dimmed : undefined}>
          <Button
            label="Listen"
            variant="secondary"
            size="standard"
            leadingIcon="Play"
            fullWidth
            disabled={audioBlocked}
            onPress={() => onListen(book)}
          />
        </View>
      </View>

      {unreadable && (
        <View style={styles.note}>
          <Icon name="AlertTriangle" size={12} color={tokens.textColors.disabled} />
          <Text variant="body-xs" color="disabled">
            {state === 'processing'
              ? 'Still processing. This book will open once its chapters are ready.'
              : 'This upload failed, so there is nothing to open yet.'}
          </Text>
        </View>
      )}

      <View style={styles.rows}>
        <PaneRow
          icon="Notebook"
          label="Highlights"
          onPress={() => onViewHighlights(book)}
          disabled={unreadable}
        />
        {onOpenAiTools && (
          <PaneRow
            icon="Sparkles"
            label="AI tools"
            onPress={() => onOpenAiTools(book)}
            disabled={unreadable}
          />
        )}
      </View>
    </ScrollView>
  );
}

function PaneRow({
  icon,
  label,
  onPress,
  disabled,
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      // Hard rule 6: the tap target is the whole row, not the label.
      style={({ pressed }) => [
        styles.row,
        disabled && styles.dimmed,
        pressed && !disabled && styles.rowPressed,
      ]}
    >
      <Icon
        name={icon}
        size={tokens.iconSize.sm}
        color={disabled ? tokens.textColors.disabled : tokens.textColors.secondary}
      />
      <Text
        variant="body-md"
        color={disabled ? 'disabled' : 'primary'}
        style={styles.rowLabel}
      >
        {label}
      </Text>
      <Icon name="ChevronRight" size={16} color={tokens.textColors.disabled} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pane: {
    flex: 1,
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderLeftColor: tokens.borderColors.subtle,
    backgroundColor: tokens.bgColors.canvas,
  },
  paneContent: {
    padding: tokens.space.xl,
    gap: tokens.space.lg,
  },
  emptyPane: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: tokens.space['3xl'],
    gap: tokens.space.md,
  },
  emptyTitle: {
    fontFamily: tokens.fonts.display,
    fontSize: tokens.fontSizes.display.sm,
    color: tokens.textColors.primary,
    paddingTop: tokens.space.md,
  },
  emptyBody: {
    textAlign: 'center',
    maxWidth: 320,
  },
  header: {
    flexDirection: 'row',
    gap: tokens.space.lg,
  },
  headerMeta: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  title: {
    fontFamily: tokens.fonts.display,
    fontSize: tokens.fontSizes.display.md,
    lineHeight: 30,
    color: tokens.textColors.primary,
  },
  meta: {
    paddingTop: tokens.space.sm,
  },
  progressWrap: {
    paddingTop: tokens.space.xs,
  },
  actions: {
    gap: tokens.space.sm,
  },
  dimmed: {
    opacity: 0.4,
  },
  note: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: tokens.space.xs,
  },
  rows: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: tokens.borderColors.subtle,
    paddingTop: tokens.space.md,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.space.md,
    paddingVertical: tokens.space.md,
  },
  rowLabel: {
    flex: 1,
  },
  rowPressed: {
    backgroundColor: tokens.bgColors.surface,
  },
});
