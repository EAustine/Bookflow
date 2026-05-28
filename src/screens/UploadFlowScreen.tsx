import type React from 'react';
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { Animated, Easing, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Circle as SvgCircle } from 'react-native-svg';
import { BottomSheet, type BottomSheetRef, Icon, Text } from '~/components';
import { tokens } from '~/design/tokens';

// ─── Add book sheet ───────────────────────────────────────────────────────────

export type AddBookSheetProps = {
  onUpload: () => void;
  onBrowse: () => void;
};

export const AddBookSheet = forwardRef<BottomSheetRef, AddBookSheetProps>(
  function AddBookSheet({ onUpload, onBrowse }, ref) {
    const sheetRef = useRef<BottomSheetRef>(null);

    useImperativeHandle(ref, () => ({
      present: () => sheetRef.current?.present(),
      dismiss: () => sheetRef.current?.dismiss(),
    }));

    return (
      <BottomSheet ref={sheetRef}>
        <View style={styles.addHeader}>
          <Text style={styles.addTitle}>Add a book</Text>
          <Text style={styles.addSub}>Choose how you'd like to add</Text>
        </View>

        <View style={styles.addDivider} />

        <AddOption
          iconBg={tokens.colors.forest[50]}
          iconName="Upload"
          iconColor={tokens.colors.forest[800]}
          title="Upload a file"
          desc="PDF or EPUB from your device · max 50 MB"
          onPress={() => {
            sheetRef.current?.dismiss();
            onUpload();
          }}
        />

        <AddOption
          iconBg={tokens.colors.amber[200]}
          iconName="BookOpen"
          iconColor={tokens.colors.ink[700]}
          title="Browse free books"
          desc="200+ public domain classics, ready to read"
          onPress={() => {
            sheetRef.current?.dismiss();
            onBrowse();
          }}
        />

        <View style={styles.addFooter}>
          <Pressable
            accessibilityRole="button"
            onPress={() => sheetRef.current?.dismiss()}
            style={({ pressed }) => [styles.cancelBtn, pressed && { opacity: 0.7 }]}
          >
            <Text style={styles.cancelLabel}>Cancel</Text>
          </Pressable>
        </View>
      </BottomSheet>
    );
  },
);

function AddOption({
  iconBg,
  iconName,
  iconColor,
  title,
  desc,
  onPress,
}: {
  iconBg: string;
  iconName: 'Upload' | 'BookOpen';
  iconColor: string;
  title: string;
  desc: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.addOption,
        pressed && { backgroundColor: tokens.bgColors.raised },
      ]}
    >
      <View style={[styles.addOptionIcon, { backgroundColor: iconBg }]}>
        <Icon name={iconName} size={22} color={iconColor} />
      </View>
      <View style={styles.addOptionText}>
        <Text style={styles.addOptionTitle}>{title}</Text>
        <Text style={styles.addOptionDesc}>{desc}</Text>
      </View>
      <Icon name="ChevronRight" size={16} color={tokens.colors.ink[300]} />
    </Pressable>
  );
}

// ─── Processing screen ────────────────────────────────────────────────────────

export type ProcessingStepState = 'done' | 'active' | 'pending' | 'failed';

export type ProcessingStep = {
  state: ProcessingStepState;
  label: string;
  sublabel: string;
};

export type ProcessingScreenProps = {
  onBackground: () => void;
  onCancel: () => void;
  onRetryAudio?: () => void;
  onReadWithoutAudio?: () => void;
  onRemoveBook?: () => void;
  /** When provided, drives the UI dynamically instead of generic copy. */
  title?: string;
  subtitle?: string;
  /** Book title used in the failed-state body copy and the "Read
   * without audio" card. Defaults to "this book" so the copy still
   * reads cleanly if the caller doesn't have a title at hand. */
  bookTitle?: string;
  /** Pretty file size for the file-uploaded step (e.g. "1.2 MB"). */
  fileSizeLabel?: string;
  /** 0..1 — drives the ring. Pass undefined to show an indeterminate ring. */
  progress?: number;
  steps?: ProcessingStep[];
  failed?: boolean;
};

export function ProcessingScreen({
  onBackground,
  onCancel,
  onRetryAudio,
  onReadWithoutAudio,
  onRemoveBook,
  title: titleProp,
  subtitle: subtitleProp,
  bookTitle,
  fileSizeLabel,
  progress: progressProp,
  steps: stepsProp,
  failed: failedProp,
}: ProcessingScreenProps) {
  const failed = failedProp ?? false;
  // Display name for the failed-state copy. Falls back to "this book"
  // so we never render "We couldn't generate audio for undefined".
  const displayTitle = bookTitle?.trim() || 'this book';
  const sizeText = fileSizeLabel?.trim() || 'File';
  const spinAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (failed) return;
    const loop = Animated.loop(
      Animated.timing(spinAnim, {
        toValue: 1,
        duration: 900,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [spinAnim, failed]);

  const rotate = spinAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  const RADIUS = 40;
  const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

  if (failed) {
    const FAILED_DASH_OFFSET = 25;
    return (
      <ScrollView
        style={styles.processingScreenScroll}
        contentContainerStyle={styles.processingScreenScrollContent}
        showsVerticalScrollIndicator={false}
        alwaysBounceVertical={false}
      >
        {/* Failed ring — red arc ~90% filled, × icon center */}
        <View style={styles.ringWrap}>
          <Svg width={96} height={96} viewBox="0 0 96 96">
            <SvgCircle
              cx={48}
              cy={48}
              r={RADIUS}
              fill="none"
              stroke={tokens.colors.cream[200]}
              strokeWidth={6}
            />
            <SvgCircle
              cx={48}
              cy={48}
              r={RADIUS}
              fill="none"
              stroke={tokens.colors.error}
              strokeWidth={6}
              strokeLinecap="round"
              strokeDasharray={CIRCUMFERENCE}
              strokeDashoffset={FAILED_DASH_OFFSET}
              rotation={-90}
              origin="48, 48"
            />
          </Svg>
          <View style={styles.ringLabelAbsolute}>
            <Icon name="X" size={22} color={tokens.colors.error} strokeWidth={2} />
          </View>
        </View>

        <Text style={styles.processingTitle}>Audio generation failed</Text>
        <Text style={styles.processingSub}>
          We couldn't generate audio for {displayTitle}. The file was uploaded and chapters were
          extracted successfully.
        </Text>

        {/* Steps — first two done, third failed. If the caller passed
            explicit `steps`, use those; otherwise fall back to a
            generic "uploaded / extracted / audio failed" trio with
            the real file size from the upload state. */}
        <View style={styles.stepsList}>
          {stepsProp ? (
            stepsProp.map((step, i) => (
              <StepRow
                key={`${step.label}-${i}`}
                state={step.state}
                label={step.label}
                sublabel={step.sublabel}
                isLast={i === stepsProp.length - 1}
              />
            ))
          ) : (
            <>
              <StepRow
                state="done"
                label="File uploaded"
                sublabel={`${sizeText} · completed`}
              />
              <StepRow
                state="done"
                label="Chapters extracted"
                sublabel="completed"
              />
              <StepRow
                state="failed"
                label="Generating audio"
                sublabel="Failed"
                isLast
              />
            </>
          )}
        </View>

        {/* What was saved */}
        <View style={styles.savedCard}>
          <Icon name="CheckCircle" size={16} color={tokens.colors.success} strokeWidth={1.5} />
          <View style={styles.savedCardText}>
            <Text style={styles.savedCardTitle}>Text reading is ready now</Text>
            <Text style={styles.savedCardSub}>
              You can read {displayTitle} immediately. Audio can be generated separately.
            </Text>
          </View>
        </View>

        {/* Three-tier CTAs */}
        <View style={styles.failedActions}>
          <Pressable
            accessibilityRole="button"
            onPress={onRetryAudio}
            style={({ pressed }) => [styles.failedBtnPrimary, pressed && { opacity: 0.85 }]}
          >
            <Icon name="Refresh" size={16} color={tokens.colors.cream[50]} />
            <Text style={styles.failedBtnPrimaryLabel}>Retry audio generation</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={onReadWithoutAudio}
            style={({ pressed }) => [styles.failedBtnSecondary, pressed && { opacity: 0.8 }]}
          >
            <Text style={styles.failedBtnSecondaryLabel}>Read without audio</Text>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={onRemoveBook} hitSlop={8}>
            <Text style={styles.failedBtnTertiary}>Remove book</Text>
          </Pressable>
        </View>
      </ScrollView>
    );
  }

  const PROGRESS = progressProp ?? 0.65;
  const indeterminate = progressProp == null;
  const DASH_OFFSET = CIRCUMFERENCE * (1 - PROGRESS);
  const ringPercent = Math.round(PROGRESS * 100);

  const titleText = titleProp ?? `Preparing ${displayTitle}`;
  const subtitleText =
    subtitleProp ?? 'Reading the file and getting it ready for you.';

  // Default steps cover the typical upload phases without claiming a
  // chapter count we don't yet know. When LibraryScreen passes
  // real `steps`, those win.
  const defaultSteps: ProcessingStep[] = [
    { state: 'done', label: 'File uploaded', sublabel: `${sizeText} · completed` },
    { state: 'active', label: 'Extracting text', sublabel: 'In progress…' },
    {
      state: 'pending',
      label: 'Generating audio',
      sublabel: 'Starts after text is ready',
    },
  ];
  const stepsToRender = stepsProp ?? defaultSteps;

  return (
    <View style={styles.processingScreen}>
      <View style={styles.ringWrap}>
        <Svg width={96} height={96} viewBox="0 0 96 96">
          <SvgCircle
            cx={48}
            cy={48}
            r={RADIUS}
            fill="none"
            stroke={tokens.colors.cream[200]}
            strokeWidth={6}
          />
          {!indeterminate && (
            <SvgCircle
              cx={48}
              cy={48}
              r={RADIUS}
              fill="none"
              stroke={tokens.colors.forest[800]}
              strokeWidth={6}
              strokeLinecap="round"
              strokeDasharray={CIRCUMFERENCE}
              strokeDashoffset={DASH_OFFSET}
              rotation={-90}
              origin="48, 48"
            />
          )}
        </Svg>
        <View style={styles.ringLabelAbsolute}>
          {indeterminate ? (
            <Animated.View style={{ transform: [{ rotate }] }}>
              <Icon name="Loader" size={28} color={tokens.colors.forest[800]} />
            </Animated.View>
          ) : (
            <Text style={styles.ringLabelText}>{ringPercent}%</Text>
          )}
        </View>
      </View>

      <Text style={styles.processingTitle}>{titleText}</Text>
      <Text style={styles.processingSub}>{subtitleText}</Text>

      <View style={styles.stepsList}>
        {stepsToRender.map((step, i) => (
          <StepRow
            key={`${step.label}-${i}`}
            state={step.state}
            label={step.label}
            sublabel={step.sublabel}
            spinAnim={step.state === 'active' ? rotate : undefined}
            isLast={i === stepsToRender.length - 1}
          />
        ))}
      </View>

      <View style={styles.processingActions}>
        <Pressable
          accessibilityRole="button"
          onPress={onBackground}
          style={({ pressed }) => [styles.backgroundBtn, pressed && { opacity: 0.8 }]}
        >
          <Icon name="ArrowRight" size={14} color={tokens.colors.forest[800]} />
          <Text style={styles.backgroundBtnLabel}>Continue in background</Text>
        </Pressable>
        <Pressable accessibilityRole="button" onPress={onCancel} hitSlop={8}>
          <Text style={styles.cancelUploadLabel}>Cancel upload</Text>
        </Pressable>
      </View>
    </View>
  );
}

function StepRow({
  state,
  label,
  sublabel,
  spinAnim,
  isLast,
}: {
  state: 'done' | 'active' | 'pending' | 'failed';
  label: string;
  sublabel: string;
  spinAnim?: Animated.AnimatedInterpolation<string>;
  isLast?: boolean;
}) {
  const indicatorBg =
    state === 'done'
      ? tokens.colors.success
      : state === 'active'
      ? tokens.colors.forest[800]
      : state === 'failed'
      ? tokens.colors.error
      : tokens.colors.cream[200];

  return (
    <View style={[styles.stepRow, !isLast && styles.stepRowBorder]}>
      <View style={[styles.stepIndicator, { backgroundColor: indicatorBg }]}>
        {state === 'done' && <Icon name="Check" size={11} color="#fff" strokeWidth={2.5} />}
        {state === 'active' && spinAnim && (
          <Animated.View style={{ transform: [{ rotate: spinAnim }] }}>
            <Icon name="Loader" size={12} color={tokens.colors.cream[50]} />
          </Animated.View>
        )}
        {state === 'failed' && <Icon name="X" size={11} color="#fff" strokeWidth={2.5} />}
        {state === 'pending' && (
          <Icon name="Clock" size={11} color={tokens.colors.ink[400]} />
        )}
      </View>
      <View style={styles.stepText}>
        <Text
          style={[
            styles.stepLabel,
            state === 'pending' && styles.stepLabelPending,
            state === 'failed' && styles.stepLabelFailed,
          ]}
        >
          {label}
        </Text>
        <Text
          style={[
            styles.stepSublabel,
            state === 'active' && styles.stepSublabelActive,
            state === 'failed' && styles.stepSublabelFailed,
          ]}
        >
          {sublabel}
        </Text>
      </View>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  // Add sheet
  addHeader: {
    paddingHorizontal: tokens.space.lg,
    paddingTop: tokens.space.md,
    paddingBottom: tokens.space.sm,
  },
  addTitle: {
    fontFamily: tokens.fonts.display,
    fontSize: 17,
    fontWeight: '500',
    color: tokens.textColors.primary,
    marginBottom: 2,
  },
  addSub: {
    fontFamily: tokens.fonts.ui,
    fontSize: 12,
    color: tokens.textColors.muted,
  },
  addDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: tokens.borderColors.subtle,
  },
  addOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 18,
    paddingHorizontal: tokens.space.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: tokens.colors.ink[100],
  },
  addOptionIcon: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  addOptionText: {
    flex: 1,
  },
  addOptionTitle: {
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 15,
    fontWeight: '500',
    color: tokens.textColors.primary,
    marginBottom: 3,
  },
  addOptionDesc: {
    fontFamily: tokens.fonts.ui,
    fontSize: 12,
    color: tokens.textColors.muted,
    lineHeight: 17,
  },
  addFooter: {
    paddingHorizontal: tokens.space.lg,
    paddingTop: tokens.space.sm,
    paddingBottom: tokens.space.xl,
  },
  cancelBtn: {
    height: 44,
    borderRadius: 10,
    backgroundColor: tokens.bgColors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelLabel: {
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 14,
    fontWeight: '500',
    color: tokens.textColors.muted,
  },

  // Confirm sheet
  confirmHeaderPad: {
    paddingHorizontal: tokens.space.lg,
    paddingTop: 14,
    paddingBottom: 4,
  },
  confirmTitle: {
    fontFamily: tokens.fonts.display,
    fontSize: 17,
    fontWeight: '500',
    color: tokens.textColors.primary,
    marginBottom: 2,
  },
  confirmSub: {
    fontFamily: tokens.fonts.ui,
    fontSize: 12,
    color: tokens.textColors.muted,
  },
  confirmPreview: {
    margin: tokens.space.lg,
    marginTop: tokens.space.md,
    backgroundColor: tokens.bgColors.surface,
    borderRadius: tokens.radii.xl,
    padding: 14,
    flexDirection: 'row',
    gap: 14,
  },
  confirmCover: {
    width: 64,
    height: 92,
    borderRadius: 6,
    flexShrink: 0,
    alignItems: 'flex-start',
    justifyContent: 'flex-end',
    padding: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
  },
  confirmCoverLabel: {
    fontFamily: tokens.fonts.display,
    fontSize: 6,
    fontWeight: '500',
    color: tokens.colors.cream[50],
    lineHeight: 9,
  },
  confirmInfo: {
    flex: 1,
    minWidth: 0,
    justifyContent: 'center',
    gap: 5,
  },
  confirmBookTitle: {
    fontFamily: tokens.fonts.display,
    fontSize: 15,
    fontWeight: '500',
    color: tokens.textColors.primary,
    lineHeight: 20,
  },
  confirmBookAuthor: {
    fontFamily: tokens.fonts.ui,
    fontSize: 12,
    color: tokens.textColors.muted,
  },
  confirmChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  chip: {
    height: 22,
    paddingHorizontal: 8,
    borderRadius: 11,
    backgroundColor: tokens.bgColors.canvas,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: tokens.borderColors.subtle,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipLabel: {
    fontFamily: tokens.fonts.ui,
    fontSize: 10,
    color: tokens.textColors.muted,
  },
  detailRows: {
    marginHorizontal: tokens.space.lg,
    marginBottom: tokens.space.md,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: tokens.borderColors.subtle,
    overflow: 'hidden',
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 11,
    paddingHorizontal: 14,
    backgroundColor: tokens.bgColors.canvas,
  },
  detailRowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: tokens.borderColors.subtle,
  },
  detailLabel: {
    fontFamily: tokens.fonts.ui,
    fontSize: 12,
    color: tokens.textColors.muted,
  },
  detailValue: {
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 12,
    fontWeight: '500',
  },
  confirmCtas: {
    paddingHorizontal: tokens.space.lg,
    paddingBottom: tokens.space.xl,
    gap: 8,
  },
  confirmPrimary: {
    height: 50,
    borderRadius: 12,
    backgroundColor: tokens.colors.forest[800],
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmPrimaryLabel: {
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 15,
    fontWeight: '500',
    color: tokens.colors.cream[50],
  },
  confirmSecondary: {
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmSecondaryLabel: {
    fontFamily: tokens.fonts.ui,
    fontSize: 14,
    color: tokens.textColors.muted,
  },

  // Processing screen
  processingScreen: {
    flex: 1,
    backgroundColor: tokens.bgColors.canvas,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
  },
  ringWrap: {
    width: 96,
    height: 96,
    marginBottom: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringLabelAbsolute: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringLabelText: {
    fontFamily: tokens.fonts.display,
    fontSize: 22,
    fontWeight: '500',
    color: tokens.textColors.primary,
  },
  processingTitle: {
    fontFamily: tokens.fonts.display,
    fontSize: 20,
    fontWeight: '500',
    color: tokens.textColors.primary,
    textAlign: 'center',
    letterSpacing: -0.2,
    lineHeight: 26,
    marginBottom: 6,
  },
  processingSub: {
    fontFamily: tokens.fonts.ui,
    fontSize: 13,
    color: tokens.textColors.muted,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 32,
    maxWidth: 260,
  },
  stepsList: {
    width: '100%',
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: tokens.borderColors.subtle,
    overflow: 'hidden',
    marginBottom: 24,
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    backgroundColor: tokens.bgColors.canvas,
  },
  stepRowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: tokens.borderColors.subtle,
  },
  stepIndicator: {
    width: 24,
    height: 24,
    borderRadius: 12,
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepText: {
    flex: 1,
  },
  stepLabel: {
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 13,
    fontWeight: '500',
    color: tokens.textColors.primary,
  },
  stepLabelPending: {
    fontFamily: tokens.fonts.ui,
    fontWeight: '400',
    color: tokens.textColors.disabled,
  },
  stepSublabel: {
    fontFamily: tokens.fonts.ui,
    fontSize: 10,
    color: tokens.textColors.disabled,
    marginTop: 1,
  },
  stepSublabelActive: {
    color: tokens.colors.forest[700],
  },
  processingActions: {
    alignItems: 'center',
    gap: 10,
  },
  backgroundBtn: {
    height: 44,
    paddingHorizontal: 20,
    borderRadius: 10,
    backgroundColor: tokens.bgColors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: tokens.borderColors.subtle,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  backgroundBtnLabel: {
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 13,
    fontWeight: '500',
    color: tokens.colors.forest[800],
  },
  cancelUploadLabel: {
    fontFamily: tokens.fonts.ui,
    fontSize: 13,
    color: tokens.textColors.disabled,
  },

  // Processing failed state
  processingScreenScroll: {
    flex: 1,
    backgroundColor: tokens.bgColors.canvas,
  },
  processingScreenScrollContent: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
    paddingVertical: 40,
    flexGrow: 1,
  },
  stepLabelFailed: {
    fontFamily: tokens.fonts.uiMedium,
    fontWeight: '500',
    color: tokens.colors.error,
  },
  stepSublabelFailed: {
    color: tokens.colors.error,
    opacity: 0.8,
  },
  savedCard: {
    width: '100%',
    backgroundColor: tokens.bgColors.successMuted,
    borderRadius: 10,
    padding: 12,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginBottom: 20,
    borderWidth: 0.5,
    borderColor: '#A8D5B9',
  },
  savedCardText: { flex: 1 },
  savedCardTitle: {
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 12,
    fontWeight: '500',
    color: tokens.colors.success,
    marginBottom: 3,
  },
  savedCardSub: {
    fontFamily: tokens.fonts.ui,
    fontSize: 11,
    color: tokens.textColors.muted,
    lineHeight: 17,
  },
  failedActions: {
    width: '100%',
    gap: 8,
    alignItems: 'center',
  },
  failedBtnPrimary: {
    width: '100%',
    height: 50,
    borderRadius: 12,
    backgroundColor: tokens.colors.forest[800],
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  failedBtnPrimaryLabel: {
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 15,
    fontWeight: '500',
    color: tokens.colors.cream[50],
  },
  failedBtnSecondary: {
    width: '100%',
    height: 44,
    borderRadius: 12,
    backgroundColor: tokens.bgColors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 0.5,
    borderColor: tokens.borderColors.subtle,
  },
  failedBtnSecondaryLabel: {
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 14,
    fontWeight: '500',
    color: tokens.textColors.secondary,
  },
  failedBtnTertiary: {
    fontFamily: tokens.fonts.ui,
    fontSize: 13,
    color: tokens.textColors.muted,
    paddingVertical: 4,
  },
});

// ─── Scanned PDF error screen ─────────────────────────────────────────────────

export type ScannedPdfErrorScreenProps = {
  /** Re-opens the file picker to try a different file. */
  onTryAnother: () => void;
  /** Navigates to Discover as an alternative path. */
  onBrowse: () => void;
  /** The PDF the user just tried to upload. Drives the file-info
   * card; falls back to a generic "Your PDF" label if the caller
   * doesn't have these (e.g. opened via deep-link). */
  fileName?: string;
  fileSizeLabel?: string;
};

export function ScannedPdfErrorScreen({
  onTryAnother,
  onBrowse,
  fileName,
  fileSizeLabel,
}: ScannedPdfErrorScreenProps) {
  const displayName = fileName?.trim() || 'Your PDF';
  const displaySize = fileSizeLabel?.trim();
  return (
    <SafeAreaView style={scanStyles.safe} edges={['top', 'left', 'right', 'bottom']}>
      {/* Header */}
      <View style={scanStyles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close"
          onPress={onTryAnother}
          style={({ pressed }) => [scanStyles.closeBtn, pressed && { opacity: 0.7 }]}
          hitSlop={8}
        >
          <Icon name="X" size={14} color={tokens.textColors.secondary} strokeWidth={2} />
        </Pressable>
        <Text style={scanStyles.headerTitle}>Can't read this file</Text>
        <View style={scanStyles.headerSpacer} />
      </View>

      <ScrollView
        style={scanStyles.scroll}
        contentContainerStyle={scanStyles.scrollContent}
        showsVerticalScrollIndicator={false}
        alwaysBounceVertical={false}
      >
        {/* Error icon */}
        <View style={scanStyles.iconCircle}>
          <Icon name="FileText" size={34} color={tokens.colors.error} strokeWidth={1.5} />
        </View>

        <Text style={scanStyles.errorTitle}>This PDF is a scanned image</Text>
        <Text style={scanStyles.errorSub}>
          Bookflow reads text from PDFs, but this file contains scanned pages — photos of text
          that we can't extract. This is common with older or printed books.
        </Text>

        {/* File info card */}
        <View style={scanStyles.fileCard}>
          <View style={scanStyles.fileIconWrap}>
            <Text style={scanStyles.fileIconLabel}>PDF</Text>
          </View>
          <View style={scanStyles.fileInfo}>
            <Text style={scanStyles.fileName} numberOfLines={1}>
              {displayName}
            </Text>
            <Text style={scanStyles.fileMeta}>
              {displaySize ? `${displaySize} · ` : ''}Scanned · No extractable text
            </Text>
          </View>
        </View>

        {/* Next steps */}
        <View style={scanStyles.nextSteps}>
          <Text style={scanStyles.nextStepsHeader}>What to try instead</Text>
          <NextStepRow
            num={1}
            text={
              <>
                <Text style={scanStyles.stepTextPlain}>Convert online — paste the PDF into </Text>
                <Text style={scanStyles.stepTextBold}>Adobe Acrobat</Text>
                <Text style={scanStyles.stepTextPlain}> or </Text>
                <Text style={scanStyles.stepTextBold}>Smallpdf</Text>
                <Text style={scanStyles.stepTextPlain}>
                  {' '}to run OCR and download a text-readable version.
                </Text>
              </>
            }
          />
          <NextStepRow
            num={2}
            text={
              <>
                <Text style={scanStyles.stepTextPlain}>Find the EPUB — search for </Text>
                <Text style={scanStyles.stepTextBold}>"Things Fall Apart epub"</Text>
                <Text style={scanStyles.stepTextPlain}>
                  {' '}— publishers often offer a digital version with selectable text.
                </Text>
              </>
            }
          />
          <NextStepRow
            num={3}
            text={
              <Text style={scanStyles.stepTextPlain}>
                Browse our free library — 200+ books are already formatted and ready to read
                with no upload needed.
              </Text>
            }
            isLast
          />
        </View>

        {/* CTAs */}
        <View style={scanStyles.ctas}>
          <Pressable
            accessibilityRole="button"
            onPress={onTryAnother}
            style={({ pressed }) => [scanStyles.primaryBtn, pressed && { opacity: 0.85 }]}
          >
            <Text style={scanStyles.primaryBtnLabel}>Try another file</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={onBrowse}
            style={({ pressed }) => [scanStyles.secondaryBtn, pressed && { opacity: 0.7 }]}
          >
            <Text style={scanStyles.secondaryBtnLabel}>Browse free books instead</Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function NextStepRow({
  num,
  text,
  isLast,
}: {
  num: number;
  text: React.ReactNode;
  isLast?: boolean;
}) {
  return (
    <View style={[scanStyles.stepRow, !isLast && scanStyles.stepRowBorder]}>
      <View style={scanStyles.stepNum}>
        <Text style={scanStyles.stepNumText}>{num}</Text>
      </View>
      <Text style={scanStyles.stepText}>{text}</Text>
    </View>
  );
}

const scanStyles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: tokens.bgColors.canvas,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: tokens.space.lg,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: tokens.borderColors.subtle,
  },
  closeBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: tokens.bgColors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontFamily: tokens.fonts.display,
    fontSize: 16,
    fontWeight: '500',
    color: tokens.textColors.primary,
  },
  headerSpacer: {
    width: 30,
    flexShrink: 0,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingTop: 28,
    paddingBottom: 32,
    alignItems: 'center',
  },

  // Error icon
  iconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: tokens.bgColors.errorMuted,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 22,
  },
  errorTitle: {
    fontFamily: tokens.fonts.display,
    fontSize: 22,
    fontWeight: '500',
    color: tokens.textColors.primary,
    letterSpacing: -0.2,
    lineHeight: 28,
    textAlign: 'center',
    marginBottom: 8,
  },
  errorSub: {
    fontFamily: tokens.fonts.ui,
    fontSize: 13,
    color: tokens.textColors.muted,
    lineHeight: 21,
    textAlign: 'center',
    marginBottom: 24,
    maxWidth: 300,
  },

  // File info card
  fileCard: {
    width: '100%',
    backgroundColor: tokens.bgColors.surface,
    borderRadius: 12,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 20,
  },
  fileIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 10,
    backgroundColor: tokens.bgColors.errorMuted,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  fileIconLabel: {
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 11,
    fontWeight: '700',
    color: tokens.colors.error,
  },
  fileInfo: {
    flex: 1,
    minWidth: 0,
  },
  fileName: {
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 13,
    fontWeight: '500',
    color: tokens.textColors.primary,
    marginBottom: 2,
  },
  fileMeta: {
    fontFamily: tokens.fonts.ui,
    fontSize: 11,
    color: tokens.textColors.muted,
  },

  // Next steps card
  nextSteps: {
    width: '100%',
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: tokens.borderColors.subtle,
    overflow: 'hidden',
    marginBottom: 24,
    backgroundColor: tokens.bgColors.canvas,
  },
  nextStepsHeader: {
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 10,
    fontWeight: '500',
    letterSpacing: 0.06,
    textTransform: 'uppercase',
    color: tokens.textColors.subtle,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: tokens.borderColors.subtle,
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  stepRowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: tokens.borderColors.subtle,
  },
  stepNum: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: tokens.bgColors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    marginTop: 1,
  },
  stepNumText: {
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 11,
    fontWeight: '500',
    color: tokens.textColors.muted,
  },
  stepText: {
    flex: 1,
    fontFamily: tokens.fonts.ui,
    fontSize: 12,
    color: tokens.textColors.secondary,
    lineHeight: 18,
  },
  stepTextPlain: {
    fontFamily: tokens.fonts.ui,
    fontSize: 12,
    color: tokens.textColors.secondary,
    lineHeight: 18,
  },
  stepTextBold: {
    fontFamily: tokens.fonts.uiMedium,
    fontWeight: '500',
    fontSize: 12,
    color: tokens.textColors.primary,
    lineHeight: 18,
  },

  // CTAs
  ctas: {
    width: '100%',
    gap: 8,
  },
  primaryBtn: {
    height: 50,
    borderRadius: 12,
    backgroundColor: tokens.colors.forest[800],
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryBtnLabel: {
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 15,
    fontWeight: '500',
    color: tokens.colors.cream[50],
  },
  secondaryBtn: {
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryBtnLabel: {
    fontFamily: tokens.fonts.ui,
    fontSize: 14,
    color: tokens.textColors.muted,
  },
});
