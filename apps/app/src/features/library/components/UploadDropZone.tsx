/**
 * UploadDropZone — Figma `Upload drop zone` `298:573`, §4 Library and
 * §5. Desktop and web only.
 *
 * Two of the frame's three states:
 *
 *   idle       dashed subtle border on canvas, a cloud in a surface
 *              circle, the headline, the limit line, and a tertiary
 *              "Choose a file" that opens the ordinary picker.
 *   dragging   accent dashed border on `bgColors.accentMuted`, the
 *              circle fills with `bgColors.accent` and its icon goes
 *              inverse, the headline becomes "Release to add it to
 *              your library".
 *
 * The frame's third state, uploading, is **not** built here. The
 * Library already routes to `ProcessingScreen` for the whole upload,
 * which shows the phase and the per-file progress; a second progress
 * display inside a zone behind it would be two answers to one
 * question. Building the branch anyway would mean shipping code
 * nothing renders.
 *
 * ## Why the picker button is here too
 *
 * Dragging is not discoverable, and it is the only affordance in the
 * frame that says what the zone is for. The button makes the zone
 * useful to someone who never tries a drag, and it is the same
 * `startUpload` the header's plus already calls, so there is one
 * upload path rather than a desktop-only second one.
 *
 * ## Why it is not rendered on touch
 *
 * §8 of the brief leaves the drag-over state out on tablets, because
 * there is no drag source on touch. The gate is the caller's: this
 * component assumes it is only mounted where dragging exists.
 */

import { StyleSheet, View } from 'react-native';
import { Button, Icon, Text } from '~/components';
import { tokens } from '~/design/tokens';
import { useFileDrop } from '~/platform/fileDrop';
import type { PickedFile } from '~/platform/files';

export type UploadDropZoneProps = {
  /** Files were dropped. Receives everything from one gesture. */
  onFiles: (files: PickedFile[]) => void;
  /** "Choose a file" — the same picker the header's plus opens. */
  onChooseFile: () => void;
};

export function UploadDropZone({ onFiles, onChooseFile }: UploadDropZoneProps) {
  const { ref, dragging } = useFileDrop(onFiles);

  return (
    <View ref={ref} style={[styles.zone, dragging && styles.zoneDragging]}>
      <View style={[styles.circle, dragging && styles.circleDragging]}>
        <Icon
          name="CloudUpload"
          size={18}
          color={
            dragging ? tokens.textColors.inverse : tokens.textColors.secondary
          }
        />
      </View>

      <Text
        style={[styles.headline, dragging && styles.headlineDragging]}
        numberOfLines={1}
      >
        {dragging ? 'Release to add it to your library' : 'Drop a PDF or EPUB here'}
      </Text>
      <Text style={styles.sub}>
        {dragging
          ? 'PDF or EPUB · max 50 MB'
          : 'PDF or EPUB from your device · max 50 MB'}
      </Text>

      {/* Hidden rather than unmounted while dragging: the frame has no
          button in that state, and removing it would resize the zone
          under the pointer mid-drag. */}
      {!dragging && (
        <View style={styles.action}>
          <Button
            label="Choose a file"
            variant="tertiary"
            size="standard"
            onPress={onChooseFile}
          />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  zone: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: tokens.space.xl,
    paddingHorizontal: tokens.space.lg,
    borderRadius: tokens.radii.lg,
    borderWidth: tokens.borderWidth.default,
    borderStyle: 'dashed',
    borderColor: tokens.borderColors.subtle,
    backgroundColor: tokens.bgColors.canvas,
    gap: tokens.space.xs,
  },
  zoneDragging: {
    borderColor: tokens.borderColors.accent,
    backgroundColor: tokens.bgColors.accentMuted,
  },

  circle: {
    width: 36,
    height: 36,
    borderRadius: tokens.radii.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: tokens.bgColors.surface,
    marginBottom: tokens.space.xs,
  },
  circleDragging: {
    backgroundColor: tokens.bgColors.accent,
  },

  headline: {
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 16,
    lineHeight: 24,
    color: tokens.textColors.primary,
    textAlign: 'center',
  },
  headlineDragging: {
    color: tokens.textColors.accent,
  },
  sub: {
    fontFamily: tokens.fonts.ui,
    fontSize: 12,
    lineHeight: 18,
    color: tokens.textColors.secondary,
    textAlign: 'center',
  },

  action: {
    marginTop: tokens.space.sm,
  },
});
