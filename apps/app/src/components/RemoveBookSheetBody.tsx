/**
 * RemoveBookSheetBody — the destructive confirmation for removing a
 * book from the library.
 *
 * CLAUDE.md hard rule 5: destructive actions always trigger a
 * confirmation bottom sheet, never a native alert and never straight
 * off the tap. Hard rule 2: confirmation sheets use stacked CTAs,
 * destructive on top, tertiary below.
 *
 * It lived inside `LibraryScreen` while Discover's book detail used an
 * `Alert.alert` for the same action, so the same destruction looked
 * like two different products depending on which screen you reached it
 * from. Extracted here so both use this one. (F-26.)
 *
 * The cover is a slot rather than a `Book`, because the two callers
 * hold different shapes: Library has a database row and renders its own
 * `BookCover`; Discover has a `DiscoverBook` with a colour and an
 * optional remote URL.
 *
 * The warning names exactly what is lost — the file, the extracted
 * chapters, the reading progress — rather than a generic "are you
 * sure". A user who understands the cost can decide; one who doesn't
 * will tap through either way.
 */
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Icon } from './Icon';
import { Spinner } from './Spinner';
import { Text } from './Text';
import { tokens } from '~/design/tokens';

export type RemoveBookSheetBodyProps = {
  title: string;
  author?: string | null;
  /** Rendered in the book row. Each screen supplies its own. */
  cover: ReactNode;
  removing: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

export function RemoveBookSheetBody({
  title,
  author,
  cover,
  removing,
  onConfirm,
  onCancel,
}: RemoveBookSheetBodyProps) {
  return (
    <View>
      <View style={styles.header}>
        <View style={styles.icon}>
          <Icon name="Trash" size={18} color={tokens.colors.error} />
        </View>
        <View style={styles.headerText}>
          <Text style={styles.title}>Remove book?</Text>
          <Text style={styles.subtitle}>This can't be undone.</Text>
        </View>
      </View>

      <View style={styles.bookRow}>
        {cover}
        <View style={styles.bookText}>
          <Text style={styles.bookTitle} numberOfLines={2}>
            {title}
          </Text>
          {author ? (
            <Text style={styles.bookAuthor} numberOfLines={1}>
              {author}
            </Text>
          ) : null}
        </View>
      </View>

      <View style={styles.warning}>
        <Text style={styles.warningText}>
          Removing this book deletes the original file, all extracted
          chapters, and your reading progress.
        </Text>
      </View>

      {/* Stacked, destructive on top. Never side by side. */}
      <View style={styles.footer}>
        <Pressable
          accessibilityRole="button"
          disabled={removing}
          onPress={onConfirm}
          style={({ pressed }) => [
            styles.destructive,
            pressed && { backgroundColor: tokens.colors.errorPressed },
            removing && { opacity: 0.7 },
          ]}
        >
          {removing ? (
            // tokens.button.spinner, per hard rule 9. Was an
            // ActivityIndicator before the extraction.
            <Spinner color={tokens.colors.cream[50]} />
          ) : (
            <>
              <Icon name="Trash" size={14} color={tokens.colors.cream[50]} />
              <Text style={styles.destructiveLabel}>Remove book</Text>
            </>
          )}
        </Pressable>
        <Pressable
          accessibilityRole="button"
          disabled={removing}
          onPress={onCancel}
          style={({ pressed }) => [styles.cancel, pressed && { opacity: 0.7 }]}
        >
          <Text style={styles.cancelLabel}>Cancel</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: tokens.space.lg,
    paddingTop: tokens.space.lg,
    paddingBottom: tokens.space.sm,
  },
  icon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: tokens.colors.errorBg,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  headerText: { flex: 1 },
  title: {
    fontFamily: tokens.fonts.display,
    fontSize: 17,
    color: tokens.textColors.primary,
    marginBottom: 2,
  },
  subtitle: {
    fontFamily: tokens.fonts.ui,
    fontSize: 12,
    color: tokens.textColors.muted,
  },
  bookRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.space.md,
    backgroundColor: tokens.bgColors.surface,
    borderRadius: tokens.radii.lg,
    paddingVertical: tokens.space.md,
    paddingHorizontal: tokens.space.md,
    marginHorizontal: tokens.space.lg,
    marginTop: tokens.space.sm,
  },
  bookText: { flex: 1 },
  bookTitle: {
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 14,
    color: tokens.textColors.primary,
    marginBottom: 2,
  },
  bookAuthor: {
    fontFamily: tokens.fonts.ui,
    fontSize: 12,
    color: tokens.textColors.muted,
  },
  warning: {
    paddingHorizontal: tokens.space.lg,
    paddingTop: tokens.space.md,
    paddingBottom: tokens.space.lg,
  },
  warningText: {
    fontFamily: tokens.fonts.ui,
    fontSize: 13,
    lineHeight: 19,
    color: tokens.textColors.muted,
  },
  footer: {
    paddingHorizontal: tokens.space.lg,
    paddingBottom: tokens.space.xl,
    gap: tokens.space.sm,
  },
  destructive: {
    height: 48,
    borderRadius: 12,
    backgroundColor: tokens.colors.error,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  destructiveLabel: {
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 15,
    color: tokens.colors.cream[50],
  },
  cancel: {
    height: 48,
    borderRadius: 12,
    backgroundColor: tokens.bgColors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelLabel: {
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 15,
    color: tokens.textColors.muted,
  },
});
