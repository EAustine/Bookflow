/**
 * RemoveBookSheetBody — the destructive confirmation for removing a
 * book from the library. Figma `Sheet / Remove book` `136:17`, which is
 * also the Confirm modal's content above Compact.
 *
 * CLAUDE.md hard rule 5: destructive actions always trigger a
 * confirmation, never a native alert and never straight off the tap.
 * Hard rule 2: confirmation surfaces use stacked CTAs, destructive on
 * top, tertiary below.
 *
 * It lived inside `LibraryScreen` while Discover's book detail used an
 * `Alert.alert` for the same action, so the same destruction looked
 * like two different products depending on which screen you reached it
 * from. Extracted here so both use this one. (F-26.)
 *
 * **§7 cut this down.** It used to carry a trash icon chip, a "This
 * can't be undone." subtitle, a row showing the book's cover, title and
 * author, and a paragraph naming everything that would be lost. The
 * title now carries the book's name and one line says what goes, which
 * is the same information in the space it deserved. That removed the
 * `cover` prop — the only reason this component had a slot at all was
 * that Library and Discover hold different book shapes, so both call
 * sites are now just a title.
 *
 * The line still names what is lost rather than asking "are you sure".
 * A user who understands the cost can decide; one who doesn't will tap
 * through either way.
 */
import { StyleSheet, View } from 'react-native';
import { Button } from './Button';
import { Text } from './Text';
import { tokens } from '~/design/tokens';

export type RemoveBookSheetBodyProps = {
  /** The book's title. Goes into the heading: "Remove {title}?". */
  title: string;
  removing: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

export function RemoveBookSheetBody({
  title,
  removing,
  onConfirm,
  onCancel,
}: RemoveBookSheetBodyProps) {
  return (
    <View style={styles.body}>
      <Text style={styles.title}>Remove {title}?</Text>
      <Text style={styles.line}>
        This deletes the file and your reading progress.
      </Text>

      {/*
        Stacked, destructive on top, never side by side (hard rule 2).
        These were hand-rolled Pressables before — `Button`'s
        `destructive` variant exists for exactly this stacked
        confirmation pattern, and brings hard rule 9's Spinner with it.
      */}
      <View style={styles.footer}>
        <Button
          label="Remove book"
          variant="destructive"
          fullWidth
          loading={removing}
          onPress={onConfirm}
        />
        <Button
          label="Cancel"
          variant="tertiary"
          fullWidth
          disabled={removing}
          onPress={onCancel}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  body: {
    paddingHorizontal: tokens.space.lg,
    paddingTop: tokens.space.lg,
  },
  title: {
    fontFamily: tokens.fonts.display,
    fontSize: tokens.fontSizes.display.sm,
    color: tokens.textColors.primary,
    marginBottom: tokens.space.xs,
  },
  line: {
    fontFamily: tokens.fonts.ui,
    fontSize: tokens.fontSizes.ui.sm,
    lineHeight: 20,
    color: tokens.textColors.muted,
  },
  footer: {
    paddingTop: tokens.space.lg,
    paddingBottom: tokens.space.xl,
    gap: tokens.space.sm,
  },
});
