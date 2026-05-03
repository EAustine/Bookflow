import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNetworkState } from '~/hooks/useNetworkState';

// Offline colour constants (slate palette)
const OFFLINE_COLOR = '#4A5568';
const OFFLINE_BG = '#F0F2F5';
const OFFLINE_BORDER = '#CBD5E0';
import {
  BottomSheetBackdrop,
  type BottomSheetBackdropProps,
  BottomSheetModal,
  BottomSheetView,
} from '@gorhom/bottom-sheet';
import { Icon, Skeleton, Text } from '~/components';
import Animated, {
  Easing,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { tokens } from '~/design/tokens';
import type { Book } from '~/types/book';
import type { BottomSheetRef } from '~/components/BottomSheet';

// ─── Dev flags ────────────────────────────────────────────────────────────────

/**
 * Flip to `true` to preview the summary generation failed state.
 */
const MOCK_SUMMARY_FAILED = false;

/**
 * Flip to `true` to preview mid-stream generation (pulsing dots + partial text + cursor).
 * Takes priority over MOCK_SUMMARY_FAILED.
 */
const MOCK_SUMMARY_STREAMING = false;

/**
 * Flip to `true` to make the next AI response in Q&A render as an error bubble.
 */
const MOCK_AI_ERROR = false;

/**
 * Flip to `true` to seed the chat with an off-topic redirect bubble preview.
 */
const MOCK_OFFTOPIC = false;

/**
 * Flip to `true` to render the low-credits warning banner in the Q&A screen.
 */
const MOCK_LOW_CREDITS = false;

// ─── Mock data ────────────────────────────────────────────────────────────────

const CREDITS_REMAINING = 32000;
const CREDITS_TOTAL = 50000;
const CREDITS_PCT = Math.round((CREDITS_REMAINING / CREDITS_TOTAL) * 100);

const MOCK_SUMMARY = [
  "Chapter 4 opens with Nick cataloguing the many guests who attended Gatsby's lavish parties — a parade of names, professions, and vague misfortunes that underscores how little Gatsby's guests actually know about him.",
  'Gatsby takes Nick to lunch in his ostentatious car, presenting an almost rehearsed version of his past: educated at Oxford, war hero, the son of "wealthy people." He produces a medal from Montenegro and a photograph as proof, though the performance feels strained.',
  'At the restaurant, Nick meets Meyer Wolfsheim — a criminal figure who claims credit for fixing the 1919 World Series — hinting at the corrupt foundations beneath Gatsby\'s wealth.',
  "Jordan then reveals the crucial backstory: Gatsby and Daisy had a romance in Louisville before the war. Daisy almost didn't marry Tom when she received a letter from Gatsby; she eventually went through with it. Gatsby bought his West Egg mansion specifically to be across the bay from her.",
];

const MOCK_SOURCES = ['p. 44', 'p. 48', 'p. 52', 'p. 57'];

type ChatMessage = {
  id: string;
  role: 'ai' | 'user' | 'ai-error' | 'ai-offtopic';
  text: string;
  sources?: string[];
  pivot?: string;
  suggestions?: string[];
};

const BASE_MESSAGES: ChatMessage[] = [
  {
    id: '1',
    role: 'ai',
    text: "What would you like to know about the book? I'll ground every answer in the text and show you where I'm pulling from.",
  },
  {
    id: '2',
    role: 'user',
    text: 'Who is Meyer Wolfsheim and what does he represent?',
  },
  {
    id: '3',
    role: 'ai',
    text: "Meyer Wolfsheim is a business associate of Gatsby's — a shady New York gambler who claims to have fixed the 1919 World Series.¹ He represents the criminal underworld that funded Gatsby's rise, suggesting that the American Dream Gatsby embodies was built on corruption rather than honest work.²",
    sources: ['p. 48', 'p. 51'],
  },
];

const OFFTOPIC_PREVIEW: ChatMessage[] = [
  {
    id: 'ot-u',
    role: 'user',
    text: 'Who invented the Jazz Age? And what was the stock market like in the 1920s?',
  },
  {
    id: 'ot-a',
    role: 'ai-offtopic',
    text: "Those topics aren't covered in The Great Gatsby itself — they're historical context outside the text. I can only answer questions grounded in the book.",
    pivot: 'Something from the book you might want instead:',
    suggestions: [
      'How does Fitzgerald depict the excess and wealth of the 1920s in the novel?',
      "What does Gatsby's parties say about the era's social culture?",
    ],
  },
];

const INITIAL_MESSAGES: ChatMessage[] = MOCK_OFFTOPIC
  ? [BASE_MESSAGES[0]!, ...OFFTOPIC_PREVIEW]
  : BASE_MESSAGES;

const STARTER_QUESTIONS = [
  "Why does Gatsby have so many parties if he never seems to enjoy them?",
  "What does the green light at the end of Daisy's dock symbolize?",
  "How does Nick's narration shape our view of Gatsby?",
];

// ─── AI Tools Sheet ───────────────────────────────────────────────────────────

export type AIToolsSheetProps = {
  book: Book;
  onSummarize: () => void;
  onPractice: () => void;
  onAsk: () => void;
};

export const AIToolsSheet = forwardRef<BottomSheetRef, AIToolsSheetProps>(
  function AIToolsSheet({ book, onSummarize, onPractice, onAsk }, ref) {
    const modalRef = useRef<BottomSheetModal>(null);

    useImperativeHandle(
      ref,
      () => ({
        present: () => modalRef.current?.present(),
        dismiss: () => modalRef.current?.dismiss(),
      }),
      [],
    );

    const renderBackdrop = useCallback(
      (props: BottomSheetBackdropProps) => (
        <BottomSheetBackdrop
          {...props}
          appearsOnIndex={0}
          disappearsOnIndex={-1}
          opacity={tokens.bottomSheet.backdropOpacity}
          pressBehavior="close"
        />
      ),
      [],
    );

    const chNum = book.currentChapter?.match(/\d+/)?.[0] ?? '1';
    const dismiss = () => modalRef.current?.dismiss();

    const TOOLS: { icon: 'Notebook' | 'HelpCircle' | 'MessageCircle' | 'Globe'; label: string; cost: string; onPress: () => void }[] = [
      { icon: 'Notebook',      label: 'Summarize chapter',         cost: '~2K AI credits',              onPress: () => { dismiss(); onSummarize(); } },
      { icon: 'HelpCircle',    label: 'Practice questions',        cost: '~3K AI credits',              onPress: () => { dismiss(); onPractice(); } },
      { icon: 'MessageCircle', label: 'Ask about the book',        cost: '~1K AI credits per message',  onPress: () => { dismiss(); onAsk(); } },
      { icon: 'Globe',         label: 'Translate chapter',         cost: '~5K AI credits · Twi',        onPress: () => { dismiss(); } },
    ];

    return (
      <BottomSheetModal
        ref={modalRef}
        enableDynamicSizing
        backdropComponent={renderBackdrop}
        backgroundStyle={sheetStyles.bg}
        handleIndicatorStyle={sheetStyles.indicator}
        handleStyle={sheetStyles.handle}
      >
        <BottomSheetView>
          {/* Header */}
          <View style={sheetStyles.header}>
            <Text style={sheetStyles.title}>AI tools</Text>
            <Text style={sheetStyles.subtitle}>
              Chapter {chNum} · {book.title}
            </Text>
          </View>

          {/* Tool rows */}
          <View>
            {TOOLS.map((tool, idx) => (
              <Pressable
                key={tool.label}
                style={({ pressed }) => [
                  sheetStyles.row,
                  idx < TOOLS.length - 1 && sheetStyles.rowBorder,
                  pressed && { backgroundColor: tokens.bgColors.surface },
                ]}
                onPress={tool.onPress}
              >
                <View style={sheetStyles.rowIcon}>
                  <Icon name={tool.icon} size={18} color={tokens.colors.forest[800]} />
                </View>
                <View style={sheetStyles.rowContent}>
                  <Text style={sheetStyles.rowTitle}>{tool.label}</Text>
                  <Text style={sheetStyles.rowCost}>{tool.cost}</Text>
                </View>
                <Icon name="ChevronRight" size={14} color={tokens.colors.ink[300]} strokeWidth={1.5} />
              </Pressable>
            ))}
          </View>

          {/* Credits footer */}
          <View style={sheetStyles.creditsFooter}>
            <View style={sheetStyles.creditsBarWrap}>
              <Text style={sheetStyles.creditsLabel}>
                {CREDITS_REMAINING / 1000}K of {CREDITS_TOTAL / 1000}K AI credits remaining this month
              </Text>
              <View style={sheetStyles.creditsTrack}>
                <View
                  style={[
                    sheetStyles.creditsFill,
                    { width: `${CREDITS_PCT}%` as `${number}%` },
                  ]}
                />
              </View>
            </View>
            <Text style={sheetStyles.creditsCount}>{CREDITS_PCT}%</Text>
          </View>
        </BottomSheetView>
      </BottomSheetModal>
    );
  },
);

// ─── Summary Screen ───────────────────────────────────────────────────────────

type SummaryLength = 'tldr' | 'standard' | 'detailed';

const LENGTH_LABELS: Record<SummaryLength, string> = {
  tldr: 'TL;DR',
  standard: 'Standard',
  detailed: 'Detailed',
};

export function SummaryScreen({
  book,
  onBack,
}: {
  book: Book;
  onBack: () => void;
}) {
  const [length, setLength] = useState<SummaryLength>('standard');
  const [scope, setScope] = useState<'chapter' | 'whole-book'>('chapter');
  const [failed] = useState(MOCK_SUMMARY_FAILED);
  const wholeBookSheetRef = useRef<BottomSheetModal>(null);
  const chNum = book.currentChapter?.match(/\d+/)?.[0] ?? '1';

  return (
    <SafeAreaView style={sumStyles.safe} edges={['top', 'left', 'right', 'bottom']}>
      {/* Header */}
      <View style={sumStyles.header}>
        <Pressable
          onPress={onBack}
          style={sumStyles.headerBtn}
          hitSlop={8}
          accessibilityLabel="Back"
        >
          <Icon name="ArrowLeft" size={18} color={tokens.textColors.secondary} />
        </Pressable>
        <View style={sumStyles.headerCenter}>
          <Text style={sumStyles.headerTitle}>Chapter summary</Text>
          <Text style={sumStyles.headerSub}>
            {book.title} · Ch. {chNum}
          </Text>
        </View>
        <Pressable
          onPress={() => {}}
          style={sumStyles.headerBtn}
          hitSlop={8}
          accessibilityLabel="Share"
        >
          <Icon name="Upload" size={17} color={tokens.textColors.secondary} />
        </Pressable>
      </View>

      {/* Length toggle — dimmed when generation failed */}
      <View style={[sumStyles.toggle, failed && { opacity: 0.45 }]}>
        {(['tldr', 'standard', 'detailed'] as SummaryLength[]).map((opt) => (
          <Pressable
            key={opt}
            style={[sumStyles.toggleOpt, length === opt && sumStyles.toggleOptActive]}
            onPress={() => !failed && setLength(opt)}
          >
            <Text
              style={[
                sumStyles.toggleLabel,
                length === opt && sumStyles.toggleLabelActive,
              ]}
            >
              {LENGTH_LABELS[opt]}
            </Text>
          </Pressable>
        ))}
      </View>

      {/* Scope toggle — chapter vs whole book */}
      {!failed && (
        <View style={sumStyles.scopeRow}>
          <Pressable
            style={[sumStyles.scopeChip, scope === 'chapter' && sumStyles.scopeChipActive]}
            onPress={() => setScope('chapter')}
          >
            <Text style={[sumStyles.scopeChipText, scope === 'chapter' && sumStyles.scopeChipTextActive]}>
              Chapter
            </Text>
          </Pressable>
          <Pressable
            style={[sumStyles.scopeChip, scope === 'whole-book' && sumStyles.scopeChipActive]}
            onPress={() => { setScope('whole-book'); wholeBookSheetRef.current?.present(); }}
          >
            <Text style={[sumStyles.scopeChipText, scope === 'whole-book' && sumStyles.scopeChipTextActive]}>
              Whole book
            </Text>
          </Pressable>
        </View>
      )}

      {/* Streaming state */}
      {MOCK_SUMMARY_STREAMING ? (
        <SummaryStreamingBody />
      ) : failed ? (
        <View style={sumStyles.errorBody}>
          <View style={sumStyles.errorIconWrap}>
            <Icon name="AlertCircle" size={32} color={tokens.colors.error} strokeWidth={1.5} />
          </View>
          <Text style={sumStyles.errorTitle}>Summary generation failed</Text>
          <Text style={sumStyles.errorSub}>
            Claude couldn't generate a summary for this chapter. This is usually a temporary issue
            — your credits have been refunded.
          </Text>
          <View style={sumStyles.refundCard}>
            <Icon name="CheckCircle" size={16} color={tokens.colors.success} strokeWidth={1.5} />
            <View style={sumStyles.refundText}>
              <Text style={sumStyles.refundTitle}>2,100 AI credits refunded</Text>
              <Text style={sumStyles.refundSub}>Back in your account immediately</Text>
            </View>
          </View>
          <View style={sumStyles.errorActions}>
            <Pressable
              style={({ pressed }) => [sumStyles.retryBtn, pressed && { opacity: 0.85 }]}
              onPress={() => {}}
              accessibilityRole="button"
            >
              <Icon name="Refresh" size={16} color={tokens.colors.cream[50]} />
              <Text style={sumStyles.retryBtnLabel}>Try again</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [sumStyles.goBackBtn, pressed && { opacity: 0.7 }]}
              onPress={onBack}
              accessibilityRole="button"
            >
              <Text style={sumStyles.goBackBtnLabel}>Go back to chapter</Text>
            </Pressable>
          </View>
        </View>
      ) : (
        /* Scrollable body */
        <ScrollView
          style={sumStyles.scroll}
          contentContainerStyle={sumStyles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Summary text */}
          {MOCK_SUMMARY.map((para, i) => (
            <Text key={i} style={sumStyles.bodyPara}>
              {para}
            </Text>
          ))}

          {/* Source chips */}
          <Text style={sumStyles.sourceLabel}>Sources from this chapter</Text>
          <View style={sumStyles.sourceChips}>
            {MOCK_SOURCES.map((src) => (
              <Pressable key={src} style={sumStyles.sourceChip} onPress={() => {}}>
                <Icon name="Book" size={10} color={tokens.textColors.muted} />
                <Text style={sumStyles.sourceChipLabel}>{src}</Text>
              </Pressable>
            ))}
          </View>

          {/* Quality rating */}
          <QualityRatingCard />
        </ScrollView>
      )}

      {/* Action bar — Listen / Regenerate / Share */}
      {!MOCK_SUMMARY_STREAMING && !failed && <SummaryActionBar />}

      {/* Whole-book credit confirmation sheet */}
      <WholeBookCreditSheet
        ref={wholeBookSheetRef}
        onConfirm={() => wholeBookSheetRef.current?.dismiss()}
        onCancel={() => { setScope('chapter'); wholeBookSheetRef.current?.dismiss(); }}
      />
    </SafeAreaView>
  );
}

// ─── Quality rating card ──────────────────────────────────────────────────────

type QualityRating = null | 'positive' | 'negative';
type NegativeReason = 'missed' | 'inaccurate' | 'too-short' | 'too-long' | 'hard-to-follow' | 'other';

const REASON_LABELS: Record<NegativeReason, string> = {
  missed: 'Missed key points',
  inaccurate: 'Inaccurate',
  'too-short': 'Too short',
  'too-long': 'Too long',
  'hard-to-follow': 'Hard to follow',
  other: 'Other',
};

function QualityRatingCard() {
  const [rating, setRating] = useState<QualityRating>(null);
  const [selectedReasons, setSelectedReasons] = useState<Set<NegativeReason>>(new Set());

  const toggleReason = (r: NegativeReason) => {
    setSelectedReasons((prev) => {
      const next = new Set(prev);
      if (next.has(r)) next.delete(r); else next.add(r);
      return next;
    });
  };

  if (rating === 'positive') {
    return (
      <View style={[sumStyles.qualityCard, sumStyles.qualityCardSuccess]}>
        <View style={sumStyles.qualitySuccessRow}>
          <Icon name="CheckCircle" size={14} color={tokens.colors.success} strokeWidth={2} />
          <Text style={sumStyles.qualitySuccessText}>Thanks for the feedback</Text>
        </View>
      </View>
    );
  }

  if (rating === 'negative') {
    return (
      <View style={sumStyles.qualityCard}>
        <View style={sumStyles.qualityNegHeader}>
          <Text style={sumStyles.qualityNegLabel}>What could be better?</Text>
          <Pressable style={sumStyles.qualityNegClose} onPress={() => setRating(null)} hitSlop={8}>
            <Icon name="X" size={10} color={tokens.textColors.muted} strokeWidth={2.5} />
          </Pressable>
        </View>
        <View style={sumStyles.reasonChips}>
          {(Object.keys(REASON_LABELS) as NegativeReason[]).map((r) => (
            <Pressable
              key={r}
              style={[sumStyles.reasonChip, selectedReasons.has(r) && sumStyles.reasonChipSelected]}
              onPress={() => toggleReason(r)}
            >
              <Text style={[sumStyles.reasonChipText, selectedReasons.has(r) && sumStyles.reasonChipTextSelected]}>
                {REASON_LABELS[r]}
              </Text>
            </Pressable>
          ))}
        </View>
        <View style={sumStyles.qualityNegActions}>
          <Pressable
            style={({ pressed }) => [sumStyles.negBtnRegen, pressed && { opacity: 0.85 }]}
            onPress={() => {}}
          >
            <Icon name="Refresh" size={11} color={tokens.colors.cream[50]} strokeWidth={2} />
            <Text style={sumStyles.negBtnRegenLabel}>Submit &amp; regenerate</Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => [sumStyles.negBtnSubmit, pressed && { opacity: 0.7 }]}
            onPress={() => {}}
          >
            <Text style={sumStyles.negBtnSubmitLabel}>Submit only</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={sumStyles.qualityCard}>
      <View style={sumStyles.qualityCardRow}>
        <Text style={sumStyles.qualityLabel}>Was this summary helpful?</Text>
        <View style={sumStyles.qualityBtns}>
          <Pressable style={sumStyles.qualityBtn} onPress={() => setRating('positive')}>
            <Text style={sumStyles.qualityEmoji}>👍</Text>
          </Pressable>
          <Pressable style={sumStyles.qualityBtn} onPress={() => setRating('negative')}>
            <Text style={sumStyles.qualityEmoji}>👎</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

// ─── Summary action bar ───────────────────────────────────────────────────────

function SummaryActionBar() {
  return (
    <View style={sumStyles.actionBar}>
      <Pressable
        style={({ pressed }) => [sumStyles.listenBtn, pressed && { opacity: 0.85 }]}
        onPress={() => {}}
        accessibilityRole="button"
        accessibilityLabel="Listen to summary"
      >
        <Icon name="Headphones" size={13} color={tokens.colors.cream[50]} strokeWidth={1.5} />
        <Text style={sumStyles.listenBtnLabel}>Listen to summary</Text>
      </Pressable>
      <Pressable
        style={({ pressed }) => [sumStyles.actionIconBtn, pressed && { opacity: 0.7 }]}
        onPress={() => {}}
        accessibilityRole="button"
        accessibilityLabel="Regenerate summary"
      >
        <Icon name="Refresh" size={15} color={tokens.textColors.secondary} strokeWidth={1.5} />
      </Pressable>
      <Pressable
        style={({ pressed }) => [sumStyles.actionIconBtn, pressed && { opacity: 0.7 }]}
        onPress={() => {}}
        accessibilityRole="button"
        accessibilityLabel="Share"
      >
        <Icon name="Upload" size={15} color={tokens.textColors.secondary} strokeWidth={1.5} />
      </Pressable>
    </View>
  );
}

// ─── Whole-book credit confirmation sheet ─────────────────────────────────────

const WARN_COLOR = '#A0692A';
const WARN_BG = '#FDF3E3';

const WholeBookCreditSheet = forwardRef<BottomSheetModal, {
  onConfirm: () => void;
  onCancel: () => void;
}>(function WholeBookCreditSheet({ onConfirm, onCancel }, ref) {
  const renderBackdrop = useCallback(
    (props: BottomSheetBackdropProps) => (
      <BottomSheetBackdrop
        {...props}
        appearsOnIndex={0}
        disappearsOnIndex={-1}
        opacity={0.45}
        pressBehavior="close"
        onPress={onCancel}
      />
    ),
    [onCancel],
  );

  return (
    <BottomSheetModal
      ref={ref}
      enableDynamicSizing
      backdropComponent={renderBackdrop}
      backgroundStyle={wbStyles.bg}
      handleIndicatorStyle={wbStyles.handle}
      handleStyle={wbStyles.handleWrap}
      onDismiss={onCancel}
    >
      <BottomSheetView style={wbStyles.content}>
        {/* Warning eyebrow */}
        <Text style={wbStyles.eyebrow}>High credit use</Text>
        <Text style={wbStyles.title}>This will use about 30% of your monthly credits</Text>
        <Text style={wbStyles.sub}>
          A whole-book summary reads all 9 chapters and weaves them into a single narrative. It uses significantly more AI credits than a chapter summary.
        </Text>

        {/* Cost breakdown card */}
        <View style={wbStyles.costCard}>
          <View style={wbStyles.costRow}>
            <Text style={wbStyles.costLabel}>Estimated cost</Text>
            <Text style={wbStyles.costValueWarn}>~15,000 credits</Text>
          </View>
          <View style={wbStyles.costRow}>
            <Text style={wbStyles.costLabel}>Available this month</Text>
            <View style={wbStyles.costProgressMini}>
              <View style={wbStyles.costBar}>
                <View style={[wbStyles.costBarFill, { width: '64%' }]} />
              </View>
              <Text style={wbStyles.costValue}>32,000</Text>
            </View>
          </View>
          <View style={[wbStyles.costRow, { borderBottomWidth: 0 }]}>
            <Text style={wbStyles.costLabel}>After this summary</Text>
            <Text style={wbStyles.costValue}>~17,000 remaining</Text>
          </View>
        </View>

        {/* Soft pro upsell strip */}
        <View style={wbStyles.upsellStrip}>
          <Icon name="Moon" size={14} color={tokens.colors.forest[800]} strokeWidth={1.5} />
          <Text style={wbStyles.upsellText}>
            Standard plan gives you 500K credits / month — enough for summaries every day.
          </Text>
          <Pressable style={wbStyles.upsellBtn} onPress={() => {}}>
            <Text style={wbStyles.upsellBtnLabel}>Upgrade</Text>
          </Pressable>
        </View>

        {/* CTAs */}
        <View style={wbStyles.ctas}>
          <Pressable
            style={({ pressed }) => [wbStyles.generateBtn, pressed && { opacity: 0.85 }]}
            onPress={onConfirm}
            accessibilityRole="button"
          >
            <Icon name="Wand" size={13} color={tokens.colors.cream[50]} strokeWidth={1.5} />
            <Text style={wbStyles.generateBtnLabel}>Generate summary · ~15K credits</Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => [wbStyles.cancelBtn, pressed && { opacity: 0.7 }]}
            onPress={onCancel}
            accessibilityRole="button"
          >
            <Text style={wbStyles.cancelBtnLabel}>Cancel</Text>
          </Pressable>
        </View>
      </BottomSheetView>
    </BottomSheetModal>
  );
});

// ─── Summary streaming body ───────────────────────────────────────────────────

const STREAMED_PARTIAL = [
  "Chapter 4 opens with Nick cataloguing the many guests who attended Gatsby's lavish parties — a parade of names, professions, and vague misfortunes that underscores how little Gatsby's guests actually know about him.",
  'Gatsby takes Nick to lunch in his ostentatious car, presenting an almost rehearsed version of his past: educated at Oxford, war hero, the son of "wealthy people." He produces a medal from Montenegro and a',
];

function SummaryStreamingBody() {
  const cursorOpacity = useSharedValue(1);
  const dot1 = useSharedValue(0.3);
  const dot2 = useSharedValue(0.3);
  const dot3 = useSharedValue(0.3);

  useEffect(() => {
    cursorOpacity.value = withRepeat(
      withTiming(0, { duration: 450, easing: Easing.steps(1) }),
      -1,
      true,
    );
    dot1.value = withRepeat(withTiming(1, { duration: 600 }), -1, true);
    dot2.value = withDelay(200, withRepeat(withTiming(1, { duration: 600 }), -1, true));
    dot3.value = withDelay(400, withRepeat(withTiming(1, { duration: 600 }), -1, true));
  }, [cursorOpacity, dot1, dot2, dot3]);

  const cursorStyle = useAnimatedStyle(() => ({ opacity: cursorOpacity.value }));
  const dot1Style = useAnimatedStyle(() => ({ opacity: interpolate(dot1.value, [0, 1], [0.3, 1]) }));
  const dot2Style = useAnimatedStyle(() => ({ opacity: interpolate(dot2.value, [0, 1], [0.3, 1]) }));
  const dot3Style = useAnimatedStyle(() => ({ opacity: interpolate(dot3.value, [0, 1], [0.3, 1]) }));

  return (
    <ScrollView
      style={sumStyles.scroll}
      contentContainerStyle={sumStyles.scrollContent}
      showsVerticalScrollIndicator={false}
    >
      {/* Pulsing dots — "Generating…" */}
      <View style={sumStyles.streamingIndicator}>
        <View style={sumStyles.streamingDots}>
          <Animated.View style={[sumStyles.streamingDot, dot1Style]} />
          <Animated.View style={[sumStyles.streamingDot, dot2Style]} />
          <Animated.View style={[sumStyles.streamingDot, dot3Style]} />
        </View>
        <Text style={sumStyles.streamingLabel}>Generating…</Text>
      </View>

      {/* Already-streamed paragraphs */}
      {STREAMED_PARTIAL.map((para, i) => {
        const isLast = i === STREAMED_PARTIAL.length - 1;
        return (
          <Text key={i} style={sumStyles.bodyPara}>
            {para}
            {isLast && <Animated.View style={[sumStyles.streamCursor, cursorStyle]} />}
          </Text>
        );
      })}

      {/* Skeleton lines for upcoming paragraphs */}
      <View style={sumStyles.streamSkelPara}>
        <Skeleton width="100%" height={13} borderRadius={4} />
        <Skeleton width="88%" height={13} borderRadius={4} />
        <Skeleton width="100%" height={13} borderRadius={4} />
        <Skeleton width="72%" height={13} borderRadius={4} />
      </View>
      <View style={sumStyles.streamSkelPara}>
        <Skeleton width="100%" height={13} borderRadius={4} />
        <Skeleton width="94%" height={13} borderRadius={4} />
        <Skeleton width="65%" height={13} borderRadius={4} />
      </View>
    </ScrollView>
  );
}

// ─── Chat Screen ──────────────────────────────────────────────────────────────

type FailedMessage = { id: string; text: string };

export function ChatScreen({
  book,
  onBack,
}: {
  book: Book;
  onBack: () => void;
}) {
  const { isConnected } = useNetworkState();
  const isOffline = !isConnected;

  const [messages, setMessages] = useState<ChatMessage[]>(INITIAL_MESSAGES);
  const [inputText, setInputText] = useState('');
  const [failedMessage, setFailedMessage] = useState<FailedMessage | null>(null);
  const [lowCreditsDismissed, setLowCreditsDismissed] = useState(false);
  const scrollRef = useRef<ScrollView>(null);
  const hasUserMessage = messages.some((m) => m.role === 'user');

  const sendMessage = useCallback(() => {
    const text = inputText.trim();
    if (!text) return;
    setInputText('');

    if (isOffline) {
      // Queue as failed — don't add to messages yet
      setFailedMessage({ id: String(Date.now()), text });
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
      return;
    }

    const userMsg: ChatMessage = { id: String(Date.now()), role: 'user', text };
    const aiMsg: ChatMessage = MOCK_AI_ERROR
      ? { id: String(Date.now() + 1), role: 'ai-error', text: '' }
      : {
          id: String(Date.now() + 1),
          role: 'ai',
          text: "I'm looking through the text for you — this is a mock response. In the real app, every answer is grounded in the book's content with cited pages.",
        };
    setMessages((prev) => [...prev, userMsg, aiMsg]);
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
  }, [inputText, isOffline]);

  const retryFailed = useCallback(() => {
    if (!failedMessage || isOffline) return;
    const userMsg: ChatMessage = { id: failedMessage.id, role: 'user', text: failedMessage.text };
    const aiMsg: ChatMessage = {
      id: String(Date.now()),
      role: 'ai',
      text: "I'm looking through the text for you — this is a mock response.",
    };
    setMessages((prev) => [...prev, userMsg, aiMsg]);
    setFailedMessage(null);
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
  }, [failedMessage, isOffline]);

  const retryAiError = useCallback((id: string) => {
    setMessages((prev) =>
      prev.map((m) =>
        m.id === id
          ? {
              ...m,
              role: 'ai' as const,
              text: "I'm looking through the text for you — this is a mock response.",
            }
          : m,
      ),
    );
  }, []);

  const skipAiError = useCallback((id: string) => {
    setMessages((prev) => prev.filter((m) => m.id !== id));
  }, []);

  return (
    <SafeAreaView style={chatStyles.safe} edges={['top', 'left', 'right', 'bottom']}>
      {/* Header */}
      <View style={chatStyles.header}>
        <Pressable
          onPress={onBack}
          style={chatStyles.headerBtn}
          hitSlop={8}
          accessibilityLabel="Back"
        >
          <Icon name="ArrowLeft" size={18} color={tokens.textColors.secondary} />
        </Pressable>
        <View style={chatStyles.headerCenter}>
          <Text style={chatStyles.headerTitle}>Ask about the book</Text>
          <Text style={chatStyles.headerSub}>{book.title}</Text>
        </View>
        <Pressable
          onPress={() => {}}
          style={chatStyles.headerBtn}
          hitSlop={8}
          accessibilityLabel="Info"
        >
          <Icon name="Info" size={17} color={tokens.textColors.muted} />
        </Pressable>
      </View>

      {/* Offline bar — replaces scope banner when offline */}
      {isOffline ? (
        <View style={chatStyles.offlineBar}>
          <Icon name="WifiOff" size={14} color={OFFLINE_COLOR} strokeWidth={1.5} />
          <Text style={chatStyles.offlineBarText}>No connection · Q&A unavailable</Text>
        </View>
      ) : (
        <View style={chatStyles.scopeBanner}>
          <Icon name="Info" size={14} color={tokens.colors.forest[700]} />
          <Text style={chatStyles.scopeText}>
            Answers come only from{' '}
            <Text style={chatStyles.scopeBookTitle}>{book.title}</Text>. I'll cite
            the pages I pull from.
          </Text>
        </View>
      )}

      {/* Low credits banner — fires at <20% remaining */}
      {!isOffline && MOCK_LOW_CREDITS && !lowCreditsDismissed && (
        <LowCreditsBanner onDismiss={() => setLowCreditsDismissed(true)} onUpgrade={() => {}} />
      )}

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        {/* Messages */}
        <ScrollView
          ref={scrollRef}
          style={chatStyles.messages}
          contentContainerStyle={chatStyles.messagesContent}
          showsVerticalScrollIndicator={false}
        >
          {messages.map((msg) => (
            <ChatBubble
              key={msg.id}
              message={msg}
              onRetryAiError={retryAiError}
              onSkipAiError={skipAiError}
            />
          ))}

          {/* Failed message + error card */}
          {failedMessage && (
            <>
              <View style={[chatStyles.bubbleWrap, chatStyles.bubbleWrapUser, { opacity: 0.45 }]}>
                <View style={[chatStyles.bubble, chatStyles.bubbleUser]}>
                  <Text style={[chatStyles.bubbleText, chatStyles.bubbleTextUser]}>
                    {failedMessage.text}
                  </Text>
                </View>
              </View>
              <ChatErrorCard
                isOffline={isOffline}
                onRetry={retryFailed}
                onDiscard={() => setFailedMessage(null)}
              />
            </>
          )}
        </ScrollView>

        {/* Starter questions — only when online and no messages */}
        {!isOffline && !hasUserMessage && !failedMessage && (
          <>
            <Text style={chatStyles.starterLabel}>Suggested questions</Text>
            <View style={chatStyles.starterChips}>
              {STARTER_QUESTIONS.map((q) => (
                <Pressable
                  key={q}
                  style={chatStyles.starterChip}
                  onPress={() => setInputText(q)}
                >
                  <Text style={chatStyles.starterChipText}>{q}</Text>
                </Pressable>
              ))}
            </View>
          </>
        )}

        {/* Input bar */}
        <View style={chatStyles.inputBar}>
          <TextInput
            style={[chatStyles.inputField, isOffline && chatStyles.inputFieldDisabled]}
            placeholder={
              isOffline ? "You're offline — Q&A unavailable" : 'Ask anything about the book…'
            }
            placeholderTextColor={isOffline ? OFFLINE_COLOR : tokens.textColors.disabled}
            value={inputText}
            onChangeText={setInputText}
            multiline
            maxLength={500}
            returnKeyType="send"
            onSubmitEditing={sendMessage}
            editable={!isOffline}
          />
          <Pressable
            style={[
              chatStyles.sendBtn,
              (!inputText.trim() || isOffline) && chatStyles.sendBtnDisabled,
            ]}
            onPress={sendMessage}
            disabled={!inputText.trim() || isOffline}
          >
            <Icon
              name="ArrowRight"
              size={16}
              color={
                inputText.trim() && !isOffline
                  ? tokens.colors.cream[50]
                  : tokens.textColors.disabled
              }
            />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ─── Chat error card ──────────────────────────────────────────────────────────

function ChatErrorCard({
  isOffline,
  onRetry,
  onDiscard,
}: {
  isOffline: boolean;
  onRetry: () => void;
  onDiscard: () => void;
}) {
  return (
    <View style={chatStyles.errorCard}>
      <View style={chatStyles.errorCardHeader}>
        <Icon name="AlertTriangle" size={14} color={tokens.textColors.muted} strokeWidth={1.5} />
        <Text style={chatStyles.errorCardLabel}>Couldn't send</Text>
      </View>
      <Text style={chatStyles.errorCardBody}>
        Your message was saved but not sent — Q&A needs a connection to reach Claude.
      </Text>
      <View style={chatStyles.errorCardActions}>
        <Pressable
          style={({ pressed }) => [
            chatStyles.errorCardBtn,
            chatStyles.errorCardBtnRetry,
            pressed && { opacity: 0.8 },
            isOffline && { opacity: 0.5 },
          ]}
          onPress={onRetry}
          disabled={isOffline}
          accessibilityRole="button"
        >
          <Icon name="Refresh" size={11} color={tokens.textColors.secondary} />
          <Text style={chatStyles.errorCardBtnRetryLabel}>Try again</Text>
        </Pressable>
        <Pressable
          style={({ pressed }) => [chatStyles.errorCardBtn, pressed && { opacity: 0.7 }]}
          onPress={onDiscard}
          accessibilityRole="button"
        >
          <Text style={chatStyles.errorCardBtnDiscardLabel}>Discard</Text>
        </Pressable>
      </View>
    </View>
  );
}

// ─── Chat bubble ──────────────────────────────────────────────────────────────

function ChatBubble({
  message,
  onRetryAiError,
  onSkipAiError,
}: {
  message: ChatMessage;
  onRetryAiError?: (id: string) => void;
  onSkipAiError?: (id: string) => void;
}) {
  const [thumbed, setThumbed] = useState<'up' | 'down' | null>(null);

  if (message.role === 'ai-error') {
    return (
      <AiErrorBubble
        onRetry={() => onRetryAiError?.(message.id)}
        onSkip={() => onSkipAiError?.(message.id)}
      />
    );
  }

  if (message.role === 'ai-offtopic') {
    return <OffTopicBubble message={message} />;
  }

  const isAI = message.role === 'ai';

  return (
    <View style={[chatStyles.bubbleWrap, isAI ? chatStyles.bubbleWrapAI : chatStyles.bubbleWrapUser]}>
      <View style={[chatStyles.bubble, isAI ? chatStyles.bubbleAI : chatStyles.bubbleUser]}>
        <Text
          style={[
            chatStyles.bubbleText,
            isAI ? chatStyles.bubbleTextAI : chatStyles.bubbleTextUser,
          ]}
        >
          {message.text}
        </Text>
      </View>
      {isAI && message.sources && (
        <View style={chatStyles.sourcesRow}>
          <Icon name="Book" size={10} color={tokens.textColors.disabled} />
          <Text style={chatStyles.sourcesLabel}>Sources:</Text>
          {message.sources.map((src) => (
            <Pressable key={src} style={chatStyles.sourceChip} onPress={() => {}}>
              <Text style={chatStyles.sourceChipLabel}>{src}</Text>
            </Pressable>
          ))}
        </View>
      )}
      {isAI && (
        <View style={chatStyles.feedbackRow}>
          <Pressable
            style={[chatStyles.feedbackBtn, thumbed === 'up' && chatStyles.feedbackBtnActive]}
            onPress={() => setThumbed((p) => (p === 'up' ? null : 'up'))}
          >
            <Text>👍</Text>
          </Pressable>
          <Pressable
            style={[chatStyles.feedbackBtn, thumbed === 'down' && chatStyles.feedbackBtnActive]}
            onPress={() => setThumbed((p) => (p === 'down' ? null : 'down'))}
          >
            <Text>👎</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

// ─── AI error bubble ──────────────────────────────────────────────────────────

function AiErrorBubble({ onRetry, onSkip }: { onRetry: () => void; onSkip: () => void }) {
  const [thumbed, setThumbed] = useState<'up' | 'down' | null>(null);

  return (
    <View style={chatStyles.bubbleWrapAI}>
      <View style={chatStyles.aiErrorBubble}>
        {/* Header */}
        <View style={chatStyles.aiErrorHeader}>
          <Icon name="AlertCircle" size={14} color={tokens.colors.error} strokeWidth={1.5} />
          <Text style={chatStyles.aiErrorLabel}>Couldn't generate a response</Text>
        </View>
        {/* Body */}
        <Text style={chatStyles.aiErrorBody}>
          Claude hit an error processing your question. This is temporary — your question wasn't
          lost.
        </Text>
        {/* Inline credits chip */}
        <View style={chatStyles.inlineRefundChip}>
          <Icon name="CheckCircle" size={11} color={tokens.colors.success} strokeWidth={1.5} />
          <Text style={chatStyles.inlineRefundText}>~800 AI credits refunded</Text>
        </View>
        {/* Actions */}
        <View style={chatStyles.aiErrorActions}>
          <Pressable
            style={({ pressed }) => [
              chatStyles.aiErrorBtn,
              chatStyles.aiErrorBtnRetry,
              pressed && { opacity: 0.8 },
            ]}
            onPress={onRetry}
            accessibilityRole="button"
          >
            <Icon name="Refresh" size={11} color={tokens.textColors.secondary} />
            <Text style={chatStyles.aiErrorBtnRetryLabel}>Try again</Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => [chatStyles.aiErrorBtn, pressed && { opacity: 0.7 }]}
            onPress={onSkip}
            accessibilityRole="button"
          >
            <Text style={chatStyles.aiErrorBtnSkipLabel}>Skip</Text>
          </Pressable>
        </View>
      </View>
      {/* Feedback row — even errors deserve quality signal */}
      <View style={chatStyles.feedbackRow}>
        <Pressable
          style={[chatStyles.feedbackBtn, thumbed === 'up' && chatStyles.feedbackBtnActive]}
          onPress={() => setThumbed((p) => (p === 'up' ? null : 'up'))}
        >
          <Text>👍</Text>
        </Pressable>
        <Pressable
          style={[chatStyles.feedbackBtn, thumbed === 'down' && chatStyles.feedbackBtnActive]}
          onPress={() => setThumbed((p) => (p === 'down' ? null : 'down'))}
        >
          <Text>👎</Text>
        </Pressable>
      </View>
    </View>
  );
}

// ─── Off-topic bubble ─────────────────────────────────────────────────────────

function OffTopicBubble({ message }: { message: ChatMessage }) {
  return (
    <View style={chatStyles.bubbleWrapAI}>
      <View style={chatStyles.offtopicBubble}>
        <View style={chatStyles.offtopicHeader}>
          <Icon name="Info" size={12} color={tokens.textColors.muted} strokeWidth={1.5} />
          <Text style={chatStyles.offtopicLabel}>Out of scope</Text>
        </View>
        <Text style={chatStyles.offtopicBody}>{message.text}</Text>
        {message.pivot && <Text style={chatStyles.offtopicPivot}>{message.pivot}</Text>}
        {message.suggestions && message.suggestions.length > 0 && (
          <View style={chatStyles.offtopicSuggestions}>
            {message.suggestions.map((q) => (
              <Pressable key={q} style={chatStyles.offtopicSuggestion} onPress={() => {}}>
                <Text style={chatStyles.offtopicSuggestionText}>{q}</Text>
              </Pressable>
            ))}
          </View>
        )}
      </View>
    </View>
  );
}

// ─── Low credits banner ───────────────────────────────────────────────────────

function LowCreditsBanner({
  onDismiss,
  onUpgrade,
}: {
  onDismiss: () => void;
  onUpgrade: () => void;
}) {
  return (
    <View style={chatStyles.lowCreditsBanner}>
      <Icon name="AlertTriangle" size={13} color={WARN_COLOR} strokeWidth={1.5} />
      <Text style={chatStyles.lowCreditsText}>~9,800 AI credits left — about 12 questions</Text>
      <Pressable
        style={({ pressed }) => [chatStyles.lowCreditsUpgrade, pressed && { opacity: 0.85 }]}
        onPress={onUpgrade}
        accessibilityRole="button"
      >
        <Text style={chatStyles.lowCreditsUpgradeLabel}>Upgrade</Text>
      </Pressable>
      <Pressable
        style={({ pressed }) => [chatStyles.lowCreditsDismiss, pressed && { opacity: 0.7 }]}
        onPress={onDismiss}
        hitSlop={8}
        accessibilityLabel="Dismiss"
      >
        <Icon name="X" size={9} color={WARN_COLOR} strokeWidth={2.5} />
      </Pressable>
    </View>
  );
}

// ─── Sheet styles ─────────────────────────────────────────────────────────────

const sheetStyles = StyleSheet.create({
  bg: {
    backgroundColor: tokens.colors.cream[50],
    borderTopLeftRadius: tokens.bottomSheet.radius,
    borderTopRightRadius: tokens.bottomSheet.radius,
  },
  handle: {
    paddingTop: tokens.bottomSheet.handle.topMargin,
    paddingBottom: 4,
  },
  indicator: {
    backgroundColor: tokens.colors.ink[300],
    width: tokens.bottomSheet.handle.width,
    height: tokens.bottomSheet.handle.height,
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 12,
    borderBottomWidth: 0.5,
    borderBottomColor: tokens.colors.ink[200],
  },
  title: {
    fontFamily: tokens.fonts.display,
    fontSize: 16,
    fontWeight: '500',
    color: tokens.textColors.primary,
  },
  subtitle: {
    fontFamily: tokens.fonts.ui,
    fontSize: 11,
    color: tokens.textColors.muted,
    marginTop: 2,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 14,
    paddingHorizontal: 20,
  },
  rowBorder: {
    borderBottomWidth: 0.5,
    borderBottomColor: tokens.colors.ink[200],
  },
  rowIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: tokens.colors.forest[50],
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  rowContent: { flex: 1 },
  rowTitle: {
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 14,
    fontWeight: '500',
    color: tokens.textColors.primary,
    marginBottom: 2,
  },
  rowCost: {
    fontFamily: tokens.fonts.ui,
    fontSize: 11,
    color: tokens.colors.ink[400],
  },
  creditsFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 28,
    borderTopWidth: 0.5,
    borderTopColor: tokens.colors.ink[200],
  },
  creditsBarWrap: { flex: 1 },
  creditsLabel: {
    fontFamily: tokens.fonts.ui,
    fontSize: 11,
    color: tokens.textColors.muted,
    marginBottom: 5,
  },
  creditsTrack: {
    height: 3,
    backgroundColor: tokens.colors.cream[200],
    borderRadius: 2,
    overflow: 'hidden',
  },
  creditsFill: {
    height: '100%',
    backgroundColor: tokens.colors.forest[800],
    borderRadius: 2,
  },
  creditsCount: {
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 11,
    fontWeight: '500',
    color: tokens.textColors.secondary,
  },
});

// ─── Summary styles ───────────────────────────────────────────────────────────

const sumStyles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: tokens.bgColors.canvas,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: tokens.space.lg,
    paddingVertical: 10,
    borderBottomWidth: 0.5,
    borderBottomColor: tokens.borderColors.subtle,
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
    paddingHorizontal: 8,
  },
  headerTitle: {
    fontFamily: tokens.fonts.display,
    fontSize: 14,
    fontWeight: '500',
    color: tokens.textColors.primary,
    marginBottom: 1,
  },
  headerSub: {
    fontFamily: tokens.fonts.ui,
    fontSize: 10,
    color: tokens.textColors.muted,
  },
  toggle: {
    flexDirection: 'row',
    margin: 12,
    marginHorizontal: 20,
    backgroundColor: tokens.bgColors.surface,
    borderRadius: 8,
    padding: 3,
  },
  toggleOpt: {
    flex: 1,
    height: 30,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toggleOptActive: {
    backgroundColor: tokens.bgColors.canvas,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
    elevation: 2,
  },
  toggleLabel: {
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 12,
    fontWeight: '500',
    color: tokens.textColors.muted,
  },
  toggleLabelActive: {
    color: tokens.textColors.primary,
  },
  scroll: { flex: 1 },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 4,
    paddingBottom: 32,
  },
  bodyPara: {
    fontFamily: tokens.fonts.reading,
    fontSize: 15,
    lineHeight: 15 * 1.75,
    color: tokens.textColors.primary,
    marginBottom: 16,
  },
  sourceLabel: {
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 10,
    fontWeight: '500',
    letterSpacing: 0.08,
    textTransform: 'uppercase',
    color: tokens.textColors.disabled,
    marginBottom: 8,
    marginTop: 4,
  },
  sourceChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 20,
  },
  sourceChip: {
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
  sourceChipLabel: {
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 11,
    fontWeight: '500',
    color: tokens.textColors.secondary,
  },
  // Scope toggle
  scopeRow: {
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 20,
    paddingBottom: 8,
  },
  scopeChip: {
    height: 28,
    paddingHorizontal: 14,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: tokens.borderColors.subtle,
    backgroundColor: tokens.bgColors.canvas,
  },
  scopeChipActive: {
    borderColor: tokens.colors.forest[800],
    backgroundColor: tokens.colors.forest[50],
  },
  scopeChipText: {
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 12,
    fontWeight: '500',
    color: tokens.textColors.muted,
  },
  scopeChipTextActive: {
    color: tokens.colors.forest[800],
  },

  // Quality rating card (shared container)
  qualityCard: {
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderWidth: 0.5,
    borderColor: tokens.borderColors.subtle,
    backgroundColor: tokens.bgColors.surface,
  },
  qualityCardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  qualityCardSuccess: {
    backgroundColor: tokens.bgColors.successMuted,
    borderColor: '#A8D5B9',
  },
  qualitySuccessRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  qualitySuccessText: {
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 12,
    fontWeight: '500',
    color: tokens.colors.success,
  },
  qualityNegHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  qualityNegLabel: {
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 12,
    fontWeight: '500',
    color: tokens.textColors.primary,
  },
  qualityNegClose: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: tokens.bgColors.canvas,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reasonChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 12,
  },
  reasonChip: {
    height: 30,
    paddingHorizontal: 12,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: tokens.borderColors.subtle,
    backgroundColor: tokens.bgColors.canvas,
  },
  reasonChipSelected: {
    borderColor: tokens.colors.forest[800],
    backgroundColor: tokens.colors.forest[50],
  },
  reasonChipText: {
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 11,
    fontWeight: '500',
    color: tokens.textColors.secondary,
  },
  reasonChipTextSelected: {
    color: tokens.colors.forest[800],
  },
  qualityNegActions: {
    gap: 6,
  },
  negBtnRegen: {
    height: 38,
    borderRadius: 9,
    backgroundColor: tokens.colors.forest[800],
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
  },
  negBtnRegenLabel: {
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 12,
    fontWeight: '500',
    color: tokens.colors.cream[50],
  },
  negBtnSubmit: {
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  negBtnSubmitLabel: {
    fontFamily: tokens.fonts.ui,
    fontSize: 12,
    color: tokens.textColors.muted,
  },

  // Legacy names used in JSX — keep for backward compat
  qualityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: tokens.bgColors.surface,
    borderRadius: 10,
  },
  qualityLabel: {
    fontFamily: tokens.fonts.ui,
    fontSize: 12,
    color: tokens.textColors.secondary,
  },
  qualityBtns: {
    flexDirection: 'row',
    gap: 8,
  },
  qualityBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: tokens.bgColors.canvas,
    borderWidth: 0.5,
    borderColor: tokens.borderColors.subtle,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qualityEmoji: {
    fontSize: 16,
    lineHeight: 20,
  },

  // Summary action bar
  actionBar: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 28,
    borderTopWidth: 0.5,
    borderTopColor: tokens.borderColors.subtle,
    backgroundColor: tokens.bgColors.canvas,
  },
  listenBtn: {
    flex: 1,
    height: 44,
    borderRadius: 10,
    backgroundColor: tokens.colors.forest[800],
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
  },
  listenBtnLabel: {
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 13,
    fontWeight: '500',
    color: tokens.colors.cream[50],
  },
  actionIconBtn: {
    width: 44,
    height: 44,
    borderRadius: 10,
    backgroundColor: tokens.bgColors.surface,
    borderWidth: 0.5,
    borderColor: tokens.borderColors.subtle,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Failed state
  errorBody: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
    paddingBottom: 16,
  },
  errorIconWrap: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: tokens.bgColors.errorMuted,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  errorTitle: {
    fontFamily: tokens.fonts.display,
    fontSize: 20,
    fontWeight: '500',
    color: tokens.textColors.primary,
    textAlign: 'center',
    lineHeight: 26,
    marginBottom: 8,
  },
  errorSub: {
    fontFamily: tokens.fonts.ui,
    fontSize: 13,
    color: tokens.textColors.muted,
    lineHeight: 21,
    textAlign: 'center',
    marginBottom: 24,
    maxWidth: 260,
  },
  refundCard: {
    width: '100%',
    backgroundColor: tokens.bgColors.successMuted,
    borderRadius: 10,
    padding: 12,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 24,
    borderWidth: 0.5,
    borderColor: '#A8D5B9',
  },
  refundText: { flex: 1 },
  refundTitle: {
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 12,
    fontWeight: '500',
    color: tokens.colors.success,
    marginBottom: 1,
  },
  refundSub: {
    fontFamily: tokens.fonts.ui,
    fontSize: 11,
    color: tokens.textColors.muted,
  },
  errorActions: {
    width: '100%',
    gap: 8,
  },
  retryBtn: {
    height: 50,
    borderRadius: 12,
    backgroundColor: tokens.colors.forest[800],
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  retryBtnLabel: {
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 15,
    fontWeight: '500',
    color: tokens.colors.cream[50],
  },
  goBackBtn: {
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  goBackBtnLabel: {
    fontFamily: tokens.fonts.ui,
    fontSize: 14,
    color: tokens.textColors.muted,
  },

  // Streaming state
  streamingIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: tokens.colors.forest[50],
    borderRadius: 8,
    marginBottom: 16,
  },
  streamingDots: {
    flexDirection: 'row',
    gap: 4,
  },
  streamingDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: tokens.colors.forest[800],
  },
  streamingLabel: {
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 11,
    fontWeight: '500',
    color: tokens.colors.forest[800],
  },
  streamCursor: {
    width: 2,
    height: 16,
    backgroundColor: tokens.colors.forest[800],
    marginLeft: 1,
    borderRadius: 1,
  },
  streamSkelPara: {
    gap: 8,
    marginBottom: 14,
  },
});

// ─── Whole-book credit sheet styles ──────────────────────────────────────────

const wbStyles = StyleSheet.create({
  bg: { backgroundColor: tokens.bgColors.canvas },
  handle: {
    backgroundColor: tokens.colors.ink[300],
    width: 32,
  },
  handleWrap: { paddingBottom: 0 },
  content: {
    paddingHorizontal: 20,
    paddingBottom: 28,
    paddingTop: 4,
  },
  eyebrow: {
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 10,
    fontWeight: '500',
    letterSpacing: 0.08,
    textTransform: 'uppercase',
    color: WARN_COLOR,
    marginBottom: 6,
  },
  title: {
    fontFamily: tokens.fonts.display,
    fontSize: 18,
    fontWeight: '500',
    color: tokens.textColors.primary,
    lineHeight: 24,
    marginBottom: 6,
  },
  sub: {
    fontFamily: tokens.fonts.ui,
    fontSize: 12,
    color: tokens.textColors.muted,
    lineHeight: 19,
    marginBottom: 16,
  },
  costCard: {
    backgroundColor: tokens.bgColors.surface,
    borderRadius: 10,
    overflow: 'hidden',
    marginBottom: 14,
    borderWidth: 0.5,
    borderColor: tokens.borderColors.subtle,
  },
  costRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderBottomWidth: 0.5,
    borderBottomColor: tokens.borderColors.subtle,
  },
  costLabel: {
    fontFamily: tokens.fonts.ui,
    fontSize: 12,
    color: tokens.textColors.secondary,
  },
  costValue: {
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 12,
    fontWeight: '500',
    color: tokens.textColors.primary,
  },
  costValueWarn: {
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 12,
    fontWeight: '500',
    color: WARN_COLOR,
  },
  costProgressMini: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  costBar: {
    width: 60,
    height: 4,
    backgroundColor: tokens.colors.cream[200],
    borderRadius: 2,
    overflow: 'hidden',
  },
  costBarFill: {
    height: '100%',
    borderRadius: 2,
    backgroundColor: tokens.colors.forest[800],
  },
  upsellStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: tokens.colors.forest[50],
    borderRadius: 8,
    marginBottom: 14,
  },
  upsellText: {
    flex: 1,
    fontFamily: tokens.fonts.ui,
    fontSize: 11,
    color: tokens.colors.forest[800],
    lineHeight: 16,
  },
  upsellBtn: {
    height: 28,
    paddingHorizontal: 10,
    borderRadius: 7,
    backgroundColor: tokens.colors.forest[800],
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  upsellBtnLabel: {
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 11,
    fontWeight: '500',
    color: tokens.colors.cream[50],
  },
  ctas: { gap: 8 },
  generateBtn: {
    height: 50,
    borderRadius: 12,
    backgroundColor: tokens.colors.forest[800],
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  generateBtnLabel: {
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 14,
    fontWeight: '500',
    color: tokens.colors.cream[50],
  },
  cancelBtn: {
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelBtnLabel: {
    fontFamily: tokens.fonts.ui,
    fontSize: 13,
    color: tokens.textColors.muted,
  },
});

// ─── Chat styles ──────────────────────────────────────────────────────────────

const chatStyles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: tokens.bgColors.canvas,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: tokens.space.lg,
    paddingVertical: 10,
    borderBottomWidth: 0.5,
    borderBottomColor: tokens.borderColors.subtle,
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
    paddingHorizontal: 8,
  },
  headerTitle: {
    fontFamily: tokens.fonts.display,
    fontSize: 14,
    fontWeight: '500',
    color: tokens.textColors.primary,
    marginBottom: 1,
  },
  headerSub: {
    fontFamily: tokens.fonts.ui,
    fontSize: 10,
    color: tokens.textColors.muted,
  },
  scopeBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
    margin: 10,
    marginHorizontal: 16,
    backgroundColor: tokens.colors.forest[50],
    borderRadius: 8,
    borderWidth: 0.5,
    borderColor: tokens.colors.forest[100],
  },
  scopeText: {
    flex: 1,
    fontFamily: tokens.fonts.ui,
    fontSize: 11,
    color: tokens.colors.forest[800],
    lineHeight: 16,
  },
  scopeBookTitle: {
    fontFamily: tokens.fonts.uiMedium,
    fontWeight: '500',
  },
  messages: { flex: 1 },
  messagesContent: {
    padding: 16,
    gap: 14,
  },
  starterLabel: {
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 10,
    fontWeight: '500',
    letterSpacing: 0.06,
    textTransform: 'uppercase',
    color: tokens.textColors.disabled,
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  starterChips: {
    gap: 6,
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  starterChip: {
    paddingVertical: 9,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: tokens.bgColors.surface,
    borderWidth: 0.5,
    borderColor: tokens.borderColors.subtle,
  },
  starterChipText: {
    fontFamily: tokens.fonts.ui,
    fontSize: 12,
    color: tokens.textColors.secondary,
    lineHeight: 18,
  },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 28,
    backgroundColor: tokens.bgColors.canvas,
    borderTopWidth: 0.5,
    borderTopColor: tokens.borderColors.subtle,
  },
  inputField: {
    flex: 1,
    minHeight: 40,
    maxHeight: 100,
    backgroundColor: tokens.bgColors.surface,
    borderRadius: 20,
    borderWidth: 0.5,
    borderColor: tokens.borderColors.subtle,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontFamily: tokens.fonts.ui,
    fontSize: 14,
    color: tokens.textColors.primary,
  },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: tokens.colors.forest[800],
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  sendBtnDisabled: {
    backgroundColor: tokens.colors.cream[200],
  },
  bubbleWrap: {
    maxWidth: '86%',
  },
  bubbleWrapAI: {
    alignSelf: 'flex-start',
  },
  bubbleWrapUser: {
    alignSelf: 'flex-end',
  },
  bubble: {
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  bubbleAI: {
    backgroundColor: tokens.bgColors.surface,
    borderTopLeftRadius: 4,
    borderTopRightRadius: 14,
    borderBottomRightRadius: 14,
    borderBottomLeftRadius: 14,
  },
  bubbleUser: {
    backgroundColor: tokens.colors.forest[800],
    borderTopLeftRadius: 14,
    borderTopRightRadius: 14,
    borderBottomRightRadius: 4,
    borderBottomLeftRadius: 14,
  },
  bubbleText: {
    fontSize: 13,
    lineHeight: 20,
  },
  bubbleTextAI: {
    fontFamily: tokens.fonts.ui,
    color: tokens.textColors.primary,
  },
  bubbleTextUser: {
    fontFamily: tokens.fonts.ui,
    color: tokens.colors.cream[50],
  },
  sourcesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 6,
    flexWrap: 'wrap',
  },
  sourcesLabel: {
    fontFamily: tokens.fonts.ui,
    fontSize: 10,
    color: tokens.textColors.disabled,
  },
  sourceChip: {
    backgroundColor: tokens.colors.cream[200],
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  sourceChipLabel: {
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 10,
    fontWeight: '500',
    color: tokens.textColors.secondary,
  },
  feedbackRow: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 6,
  },
  feedbackBtn: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: tokens.bgColors.surface,
    borderWidth: 0.5,
    borderColor: tokens.borderColors.subtle,
    alignItems: 'center',
    justifyContent: 'center',
  },
  feedbackBtnActive: {
    backgroundColor: tokens.colors.forest[50],
    borderColor: tokens.colors.forest[200],
  },

  // Offline bar
  offlineBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: tokens.space.lg,
    paddingVertical: 8,
    backgroundColor: OFFLINE_BG,
    borderBottomWidth: 0.5,
    borderBottomColor: OFFLINE_BORDER,
  },
  offlineBarText: {
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 11,
    fontWeight: '500',
    color: OFFLINE_COLOR,
  },

  // Disabled input
  inputFieldDisabled: {
    opacity: 0.6,
    color: OFFLINE_COLOR,
  },

  // Error card (failed message)
  errorCard: {
    alignSelf: 'flex-start',
    maxWidth: '92%',
    borderWidth: 1.5,
    borderColor: tokens.borderColors.default,
    borderStyle: 'dashed',
    borderRadius: 10,
    padding: 12,
    gap: 8,
    marginTop: 4,
  },
  errorCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  errorCardLabel: {
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 12,
    fontWeight: '500',
    color: tokens.textColors.secondary,
  },
  errorCardBody: {
    fontFamily: tokens.fonts.ui,
    fontSize: 12,
    color: tokens.textColors.muted,
    lineHeight: 18,
  },
  errorCardActions: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  errorCardBtn: {
    height: 28,
    paddingHorizontal: 12,
    borderRadius: 7,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  errorCardBtnRetry: {
    backgroundColor: tokens.bgColors.surface,
    borderWidth: 0.5,
    borderColor: tokens.borderColors.subtle,
  },
  errorCardBtnRetryLabel: {
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 12,
    fontWeight: '500',
    color: tokens.textColors.secondary,
  },
  errorCardBtnDiscardLabel: {
    fontFamily: tokens.fonts.ui,
    fontSize: 12,
    color: tokens.textColors.subtle,
  },

  // AI error bubble (inline chat error response)
  aiErrorBubble: {
    maxWidth: '92%',
    backgroundColor: tokens.bgColors.errorMuted,
    borderWidth: 0.5,
    borderColor: '#EFC9C6',
    borderTopLeftRadius: 4,
    borderTopRightRadius: 14,
    borderBottomRightRadius: 14,
    borderBottomLeftRadius: 14,
    padding: 12,
    paddingHorizontal: 14,
    gap: 8,
  },
  aiErrorHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  aiErrorLabel: {
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 12,
    fontWeight: '500',
    color: tokens.colors.error,
  },
  aiErrorBody: {
    fontFamily: tokens.fonts.ui,
    fontSize: 12,
    color: tokens.textColors.secondary,
    lineHeight: 18,
  },
  inlineRefundChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    alignSelf: 'flex-start',
    backgroundColor: tokens.bgColors.successMuted,
    borderRadius: 6,
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  inlineRefundText: {
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 11,
    fontWeight: '500',
    color: tokens.colors.success,
  },
  aiErrorActions: {
    flexDirection: 'row',
    gap: 7,
    alignItems: 'center',
  },
  aiErrorBtn: {
    height: 28,
    paddingHorizontal: 12,
    borderRadius: 7,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  aiErrorBtnRetry: {
    backgroundColor: tokens.bgColors.canvas,
    borderWidth: 0.5,
    borderColor: tokens.colors.ink[200],
  },
  aiErrorBtnRetryLabel: {
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 11,
    fontWeight: '500',
    color: tokens.textColors.secondary,
  },
  aiErrorBtnSkipLabel: {
    fontFamily: tokens.fonts.ui,
    fontSize: 11,
    color: tokens.textColors.muted,
  },

  // ─── Off-topic bubble ───
  offtopicBubble: {
    maxWidth: '92%',
    backgroundColor: tokens.bgColors.canvas,
    borderWidth: 0.5,
    borderColor: tokens.colors.ink[200],
    borderLeftWidth: 3,
    borderLeftColor: tokens.colors.ink[300],
    borderTopLeftRadius: 4,
    borderTopRightRadius: 14,
    borderBottomRightRadius: 14,
    borderBottomLeftRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  offtopicHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
  },
  offtopicLabel: {
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 11,
    fontWeight: '500',
    letterSpacing: 0.03,
    color: tokens.textColors.muted,
  },
  offtopicBody: {
    fontFamily: tokens.fonts.ui,
    fontSize: 12,
    color: tokens.textColors.secondary,
    lineHeight: 19,
    marginBottom: 10,
  },
  offtopicPivot: {
    fontFamily: tokens.fonts.ui,
    fontSize: 12,
    color: tokens.textColors.muted,
    marginBottom: 8,
  },
  offtopicSuggestions: {
    gap: 5,
  },
  offtopicSuggestion: {
    backgroundColor: tokens.bgColors.surface,
    borderWidth: 0.5,
    borderColor: tokens.colors.ink[200],
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  offtopicSuggestionText: {
    fontFamily: tokens.fonts.ui,
    fontSize: 11,
    color: tokens.textColors.secondary,
    lineHeight: 15,
  },

  // ─── Low credits banner ───
  lowCreditsBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 7,
    paddingHorizontal: 12,
    marginHorizontal: 16,
    marginTop: 6,
    backgroundColor: WARN_BG,
    borderRadius: 8,
    borderWidth: 0.5,
    borderColor: tokens.colors.amber[200],
  },
  lowCreditsText: {
    flex: 1,
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 11,
    fontWeight: '500',
    color: WARN_COLOR,
  },
  lowCreditsUpgrade: {
    height: 24,
    paddingHorizontal: 10,
    borderRadius: 6,
    backgroundColor: WARN_COLOR,
    alignItems: 'center',
    justifyContent: 'center',
  },
  lowCreditsUpgradeLabel: {
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 10,
    fontWeight: '500',
    color: tokens.colors.cream[50],
  },
  lowCreditsDismiss: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: 'rgba(0,0,0,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
