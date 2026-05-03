/**
 * RetryQuestionsScreen — focused retry-the-missed flow.
 *
 * Per /docs/specs/b4_02_qa_edge_states.html. Intentionally lighter than the
 * full Practice config screen: chapter and count are locked to the original
 * session, only order is adjustable, and there's no credit cost since we
 * reuse existing questions.
 */

import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Icon, Text } from '~/components';
import { tokens } from '~/design/tokens';

// ─── Types ────────────────────────────────────────────────────────────────────

export type RetryFailureType = 'wrong' | 'partial';

export type RetryQuestion = {
  id: string;
  text: string;
  failureType: RetryFailureType;
};

export type RetryOrder = 'sequential' | 'shuffle';

export type RetryQuestionsScreenProps = {
  chapterLabel: string; // e.g. "Ch. 4"
  questions: RetryQuestion[];
  onClose: () => void;
  onStart: (config: { order: RetryOrder; questionIds: string[] }) => void;
};

// ─── Mock data ────────────────────────────────────────────────────────────────

const MOCK_QUESTIONS: RetryQuestion[] = [
  {
    id: 'q1',
    text: 'Who does Gatsby describe as fixing the 1919 World Series?',
    failureType: 'wrong',
  },
  {
    id: 'q2',
    text: 'Why did Gatsby buy his house in West Egg?',
    failureType: 'partial',
  },
  {
    id: 'q3',
    text: "What does Gatsby's guest list reveal about his social world?",
    failureType: 'partial',
  },
];

// Token-system gap: success palette
const SUCCESS_COLOR = '#2D7A4F';
const SUCCESS_BG = '#E8F4ED';
const SUCCESS_BORDER = '#A8D5B9';

const ERROR_COLOR = '#B5453A';
const ERROR_BG = '#FBEAE7';

const WARN_COLOR = '#A0692A';
const WARN_BG = '#FDF3E3';

// ─── Screen ───────────────────────────────────────────────────────────────────

export function RetryQuestionsScreen({
  chapterLabel = 'Ch. 4',
  questions = MOCK_QUESTIONS,
  onClose,
  onStart,
}: Partial<RetryQuestionsScreenProps> & Pick<RetryQuestionsScreenProps, 'onClose' | 'onStart'>) {
  const [order, setOrder] = useState<RetryOrder>('sequential');

  const cycleOrder = () =>
    setOrder((o) => (o === 'sequential' ? 'shuffle' : 'sequential'));

  const handleStart = () => {
    onStart({ order, questionIds: questions.map((q) => q.id) });
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right', 'bottom']}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable
          onPress={onClose}
          style={styles.headerBtn}
          hitSlop={8}
          accessibilityLabel="Close"
        >
          <Icon name="X" size={14} color={tokens.textColors.secondary} strokeWidth={2} />
        </Pressable>
        <Text style={styles.headerTitle}>Retry the ones you missed</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Review card — which questions are being retried */}
        <View style={styles.reviewCard}>
          <Text style={styles.reviewLabel}>
            {questions.length} questions to retry · {chapterLabel}
          </Text>
          <View style={styles.questionList}>
            {questions.map((q) => (
              <View key={q.id} style={styles.questionRow}>
                <View
                  style={[
                    styles.questionBadge,
                    q.failureType === 'wrong' ? styles.badgeWrong : styles.badgePartial,
                  ]}
                >
                  {q.failureType === 'wrong' ? (
                    <Icon name="X" size={9} color={ERROR_COLOR} strokeWidth={2.5} />
                  ) : (
                    <Text style={[styles.partialDash, { color: WARN_COLOR }]}>—</Text>
                  )}
                </View>
                <Text style={styles.questionText}>{q.text}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Settings — minimal config */}
        <View style={styles.settings}>
          <View style={styles.settingRow}>
            <Text style={styles.settingLabel}>Questions</Text>
            <View style={styles.settingLocked}>
              <Icon name="Lock" size={11} color={tokens.textColors.disabled} strokeWidth={1.5} />
              <Text style={styles.settingValue}>{questions.length} (fixed)</Text>
            </View>
          </View>

          <View style={styles.settingRow}>
            <Text style={styles.settingLabel}>Question type</Text>
            <View style={styles.settingLocked}>
              <Icon name="Lock" size={11} color={tokens.textColors.disabled} strokeWidth={1.5} />
              <Text style={styles.settingValue}>Mixed (fixed)</Text>
            </View>
          </View>

          <Pressable
            style={({ pressed }) => [styles.settingRow, pressed && { opacity: 0.7 }]}
            onPress={cycleOrder}
            accessibilityRole="button"
          >
            <Text style={styles.settingLabel}>Question order</Text>
            <View style={styles.settingTrailing}>
              <Text style={styles.settingValue}>
                {order === 'sequential' ? 'Sequential' : 'Shuffle'}
              </Text>
              <Icon
                name="ChevronDown"
                size={12}
                color={tokens.textColors.disabled}
                strokeWidth={1.5}
              />
            </View>
          </Pressable>
        </View>

        {/* Free note */}
        <View style={styles.freeNote}>
          <Icon name="Check" size={14} color={SUCCESS_COLOR} strokeWidth={1.5} />
          <Text style={styles.freeNoteText}>
            No additional credits — using your existing questions
          </Text>
        </View>
      </ScrollView>

      {/* CTA */}
      <View style={styles.ctaBar}>
        <Pressable
          style={({ pressed }) => [styles.startBtn, pressed && { opacity: 0.9 }]}
          onPress={handleStart}
          accessibilityRole="button"
        >
          <Icon name="Refresh" size={14} color={tokens.colors.cream[50]} strokeWidth={1.5} />
          <Text style={styles.startBtnLabel}>Start retry session</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: tokens.bgColors.canvas },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderBottomWidth: 0.5,
    borderBottomColor: tokens.borderColors.subtle,
  },
  headerBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: tokens.bgColors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontFamily: tokens.fonts.display,
    fontSize: 14,
    fontWeight: '500',
    color: tokens.textColors.primary,
  },
  headerSpacer: { width: 28 },

  // Body
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 18, paddingTop: 20, paddingBottom: 16 },

  // Review card
  reviewCard: {
    backgroundColor: tokens.bgColors.surface,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: 20,
    borderWidth: 0.5,
    borderColor: tokens.colors.ink[200],
  },
  reviewLabel: {
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 10,
    fontWeight: '500',
    letterSpacing: 0.07,
    textTransform: 'uppercase',
    color: tokens.textColors.disabled,
    marginBottom: 10,
  },
  questionList: { gap: 8 },
  questionRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  questionBadge: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  badgeWrong: { backgroundColor: ERROR_BG },
  badgePartial: { backgroundColor: WARN_BG },
  partialDash: {
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 12,
  },
  questionText: {
    flex: 1,
    fontFamily: tokens.fonts.ui,
    fontSize: 12,
    lineHeight: 17,
    color: tokens.textColors.secondary,
  },

  // Settings
  settings: { gap: 10, marginBottom: 24 },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 11,
    backgroundColor: tokens.bgColors.canvas,
    borderRadius: 10,
    borderWidth: 0.5,
    borderColor: tokens.colors.ink[200],
  },
  settingLabel: {
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 13,
    fontWeight: '500',
    color: tokens.textColors.primary,
  },
  settingLocked: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  settingValue: {
    fontFamily: tokens.fonts.ui,
    fontSize: 13,
    color: tokens.textColors.muted,
  },
  settingTrailing: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },

  // Free note
  freeNote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: SUCCESS_BG,
    borderRadius: 9,
    borderWidth: 0.5,
    borderColor: SUCCESS_BORDER,
    marginBottom: 20,
  },
  freeNoteText: {
    fontFamily: tokens.fonts.ui,
    fontSize: 12,
    color: SUCCESS_COLOR,
  },

  // CTA
  ctaBar: {
    paddingHorizontal: 18,
    paddingTop: 8,
    paddingBottom: 20,
    backgroundColor: tokens.bgColors.canvas,
    borderTopWidth: 0.5,
    borderTopColor: tokens.borderColors.subtle,
  },
  startBtn: {
    height: 50,
    borderRadius: 12,
    backgroundColor: tokens.colors.forest[800],
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  startBtnLabel: {
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 15,
    fontWeight: '500',
    color: tokens.colors.cream[50],
  },
});
