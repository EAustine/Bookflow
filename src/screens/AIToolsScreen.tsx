import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Clipboard from 'expo-clipboard';
import * as Speech from 'expo-speech';
import { useNetworkState } from '~/hooks/useNetworkState';
import {
  BottomSheetBackdrop,
  type BottomSheetBackdropProps,
  BottomSheetModal,
  BottomSheetView,
} from '@gorhom/bottom-sheet';
import { Icon, Skeleton, Text } from '~/components';
import Animated, {
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
import { useSummary } from '~/lib/aiSummary';
import { useChat, type ChatRecord } from '~/lib/aiChat';
import { FALLBACK_STARTERS, useStarterQuestions } from '~/lib/aiStarters';
import { presentPaywall, ENTITLEMENT_PRO } from '~/lib/revenuecat';

// Offline colour aliases — defer to tokens so the slate palette
// stays consistent with LibraryScreen's offline banner.
const OFFLINE_COLOR = tokens.colors.offline;
const OFFLINE_BG = tokens.colors.offlineBg;
const OFFLINE_BORDER = tokens.colors.offlineBorder;

/**
 * Open the native RevenueCat paywall to upgrade to Pro. Wrapped in a
 * helper so the dozen+ upsell entry points across this screen all
 * trigger the same flow with the same error swallowing — when
 * RevenueCat isn't configured (dev builds without an API key),
 * `presentPaywall` throws and we silently no-op so the buttons
 * still feel responsive rather than blowing up.
 */
function openUpgradePaywall() {
  void presentPaywall({ requiredEntitlement: ENTITLEMENT_PRO }).catch(() => {
    // Configured-but-no-offering or disabled — swallow.
  });
}


type ChatMessage = {
  id: string;
  role: 'ai' | 'user' | 'ai-error' | 'ai-offtopic';
  text: string;
  sources?: string[];
  pivot?: string;
  suggestions?: string[];
  /** When true, the user bubble shows in failed/faded state. */
  failed?: boolean;
};

/**
 * Adapter from the persisted ChatRecord shape (used by the lib) into
 * the legacy ChatMessage shape consumed by the existing bubble + error
 * components. Failed user rows render via the `failed` flag; we don't
 * synthesise a separate ai-error row from the DB because the assistant
 * message either persisted or it didn't.
 */
function recordToMessage(r: ChatRecord): ChatMessage {
  return {
    id: r.id,
    role: r.role === 'assistant' ? 'ai' : 'user',
    text: r.content,
    failed: r.failed,
  };
}

// ─── AI Tools Sheet ───────────────────────────────────────────────────────────

export type AIToolsSheetProps = {
  book: Book;
  /**
   * Live page index the user is currently looking at. Drives the
   * "Page N · {title}" subtitle and is the page the AI tools target
   * by default. Defaults to `book.last_read_page` when omitted —
   * fine for callers that haven't wired the live value yet.
   */
  pageIndex?: number;
  onSummarize: () => void;
  onPractice: () => void;
  onAsk: () => void;
  onTranslate: () => void;
};

export const AIToolsSheet = forwardRef<BottomSheetRef, AIToolsSheetProps>(
  function AIToolsSheet(
    { book, pageIndex, onSummarize, onPractice, onAsk, onTranslate },
    ref,
  ) {
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

    // Live page > persisted last_read_page > 0. Reading
    // `book.currentChapter` (the previous behaviour) showed a stale
    // page label whenever the user had scrolled past the persisted
    // position — so the sheet would say "Page 1" even when the user
    // was deep in the book.
    const livePageIndex =
      pageIndex ??
      (book as { last_read_page?: number }).last_read_page ??
      0;
    const chNum = String(livePageIndex + 1);
    const dismiss = () => modalRef.current?.dismiss();

    const TOOLS: { icon: 'Notebook' | 'HelpCircle' | 'MessageCircle' | 'Globe'; label: string; cost: string; onPress: () => void }[] = [
      { icon: 'Notebook',      label: 'Summarize page',            cost: '~2K AI credits',              onPress: () => { dismiss(); onSummarize(); } },
      { icon: 'HelpCircle',    label: 'Practice questions',        cost: '~3K AI credits',              onPress: () => { dismiss(); onPractice(); } },
      { icon: 'MessageCircle', label: 'Ask about the book',        cost: '~1K AI credits per message',  onPress: () => { dismiss(); onAsk(); } },
      { icon: 'Globe',         label: 'Translate page',            cost: '~5K AI credits',              onPress: () => { dismiss(); onTranslate(); } },
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
              Page {chNum} · {book.title}
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

          {/* Credits footer removed — the real metering pipeline
              (RevenueCat entitlement + per-user credit balance in
              Supabase) isn't wired yet. Showing a hardcoded
              "32K of 50K remaining" gauge that never moved was
              misleading. Bring this back as a real component when
              credit accounting lands. */}
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

/**
 * Map structured error codes from the generate-summary edge function
 * into user-readable copy. The edge function may also return a
 * `message` (the LLM error string) which the UI prefers when present;
 * this fallback keeps codes that don't carry a message readable.
 */
function errorCodeToMessage(code: string): string {
  switch (code) {
    case 'page_not_found':
      return "Couldn't find the page in this book. Try re-processing the book.";
    case 'page_too_short':
      return "This page doesn't have enough text to summarize.";
    case 'server_misconfigured':
      return 'The summary service is temporarily unavailable.';
    case 'llm_failed':
      return 'The model couldn\'t produce a summary. Try again in a moment.';
    case 'request_failed':
    case 'function_failed':
      return 'Network issue talking to the summary service.';
    default:
      return 'Something went wrong generating the summary.';
  }
}

export function SummaryScreen({
  book,
  onBack,
  pageIndex,
}: {
  book: Book;
  onBack: () => void;
  /**
   * 0-based DB page to summarize. Defaults to whatever the book's
   * persisted reading position is — close enough for the EPUB text
   * reader (writes per-page). PDF / EPUB-full callers thread their
   * current page directly so the summary matches what's on screen.
   */
  pageIndex?: number;
}) {
  const [length, setLength] = useState<SummaryLength>('standard');
  const [scope, setScope] = useState<'chapter' | 'whole-book'>('chapter');
  // The whole-book scope is gated on an explicit confirm (credit cost
  // is meaningfully higher). Until the user confirms, useSummary stays
  // idle and we don't burn tokens.
  const [wholeBookConfirmed, setWholeBookConfirmed] = useState(false);
  const wholeBookSheetRef = useRef<BottomSheetModal>(null);
  const resolvedPageIndex =
    pageIndex ?? (book as { last_read_page?: number }).last_read_page ?? 0;

  // Real summary fetch. Single page when scope='chapter'; full-book
  // page index list when scope='whole-book' and the user has confirmed
  // through the credit sheet. The hook re-runs on any of these change.
  //
  // Memoised so the array identity is stable across re-renders — the
  // useSummary hook's dep key includes the indices, and a new array
  // reference every render forced a wasted recompute even when the
  // scope was 'chapter' (the wholeBookIndices wasn't even used). The
  // memo dep is `book.totalPages` since that's the only input.
  const wholeBookIndices = useMemo(
    () =>
      book.totalPages > 0
        ? Array.from({ length: book.totalPages }, (_, i) => i)
        : [0],
    [book.totalPages],
  );
  const summaryState = useSummary(
    scope === 'whole-book'
      ? {
          bookId: book.id,
          pageIndices: wholeBookIndices,
          length,
          enabled: wholeBookConfirmed,
        }
      : {
          bookId: book.id,
          pageIndex: resolvedPageIndex,
          length,
          enabled: true,
        },
  );
  const failed = summaryState.status === 'error';
  const loading = summaryState.status === 'loading';
  const summary = summaryState.status === 'success' ? summaryState.summary : null;
  const errorMessage =
    summaryState.status === 'error'
      ? summaryState.errorMessage ?? errorCodeToMessage(summaryState.errorCode)
      : null;

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
          <Text style={sumStyles.headerTitle}>
            {scope === 'whole-book' ? 'Whole-book summary' : 'Page summary'}
          </Text>
          <Text style={sumStyles.headerSub}>
            {scope === 'whole-book'
              ? `${book.title} · all ${book.totalPages || ''} pages`
              : `${book.title} · Page ${resolvedPageIndex + 1}`}
          </Text>
        </View>
        <Pressable
          // Header Share — only meaningful once a summary has
          // landed. Disabled until then so the icon doesn't tease an
          // empty share sheet during loading / errors.
          onPress={
            summary
              ? () => {
                  void Share.share({
                    title: `Summary: ${book.title}`,
                    message: summary,
                  });
                }
              : undefined
          }
          disabled={!summary}
          style={({ pressed }) => [
            sumStyles.headerBtn,
            !summary && { opacity: 0.4 },
            pressed && { opacity: 0.6 },
          ]}
          hitSlop={8}
          accessibilityLabel="Share summary"
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

      {/* Scope toggle — page vs whole book */}
      {!failed && (
        <View style={sumStyles.scopeRow}>
          <Pressable
            style={[sumStyles.scopeChip, scope === 'chapter' && sumStyles.scopeChipActive]}
            onPress={() => setScope('chapter')}
          >
            <Text style={[sumStyles.scopeChipText, scope === 'chapter' && sumStyles.scopeChipTextActive]}>
              Page
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

      {/* Body — three states drive what shows: loading (skeleton),
          error (recovery card), or success (real summary text + source
          chip + quality rating). The same SummaryStreamingBody design
          serves the loading state since the visual is essentially the
          same: pulsing dots + skeleton lines while we await Anthropic. */}
      {loading ? (
        <SummaryStreamingBody />
      ) : failed ? (
        <View style={sumStyles.errorBody}>
          <View style={sumStyles.errorIconWrap}>
            <Icon name="AlertCircle" size={32} color={tokens.colors.error} strokeWidth={1.5} />
          </View>
          <Text style={sumStyles.errorTitle}>Summary generation failed</Text>
          <Text style={sumStyles.errorSub}>
            {errorMessage ??
              "Claude couldn't generate a summary for this page. This is usually a temporary issue — try again in a moment."}
          </Text>
          <View style={sumStyles.errorActions}>
            <Pressable
              style={({ pressed }) => [sumStyles.retryBtn, pressed && { opacity: 0.85 }]}
              onPress={() => setLength((l) => l)}
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
              <Text style={sumStyles.goBackBtnLabel}>Go back to page</Text>
            </Pressable>
          </View>
        </View>
      ) : summary ? (
        <ScrollView
          style={sumStyles.scroll}
          contentContainerStyle={sumStyles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Summary text — split on blank lines into paragraphs so the
              spacing reads naturally regardless of how the model
              decided to format. */}
          {summary
            .split(/\n{2,}/)
            .map((para) => para.trim())
            .filter(Boolean)
            .map((para, i) => (
              <Text key={i} style={sumStyles.bodyPara}>
                {para}
              </Text>
            ))}

          {/* Source chip — single page for now; multi-page selection
              (Step 5) will fan this out into multiple chips. */}
          <Text style={sumStyles.sourceLabel}>Source</Text>
          <View style={sumStyles.sourceChips}>
            <View style={sumStyles.sourceChip}>
              <Icon name="Book" size={10} color={tokens.textColors.muted} />
              <Text style={sumStyles.sourceChipLabel}>
                Page {resolvedPageIndex + 1}
              </Text>
            </View>
          </View>

          {/* Quality rating — `onRegenerate` triggers a forced refetch
              via useSummary.refresh which bypasses both the local
              memory cache and the server-side `summaries` row. */}
          <QualityRatingCard onRegenerate={summaryState.refresh} />
        </ScrollView>
      ) : null}

      {/* Action bar — Listen / Copy. Hidden while loading or in the
          error state because none of those actions make sense before
          there's a summary on screen. */}
      {!loading && !failed && summary ? (
        <SummaryActionBar
          summary={summary}
          bookTitle={book.title}
        />
      ) : null}

      {/* Whole-book credit confirmation sheet */}
      <WholeBookCreditSheet
        ref={wholeBookSheetRef}
        onConfirm={() => {
          // Flip the gate: useSummary will now fan out the whole-book
          // request. The sheet dismisses; the body shows the loading
          // skeleton until the LLM responds.
          setWholeBookConfirmed(true);
          wholeBookSheetRef.current?.dismiss();
        }}
        onCancel={() => {
          setScope('chapter');
          setWholeBookConfirmed(false);
          wholeBookSheetRef.current?.dismiss();
        }}
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

function QualityRatingCard({
  onRegenerate,
}: {
  /** Called when the user taps "Submit & regenerate" on the negative
   *  feedback flow. Triggers a forced refetch via useSummary. */
  onRegenerate?: () => void;
}) {
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
            // Trigger a forced regenerate. The hook bumps its refresh
            // counter → re-runs the load with `force: true`, which
            // tells the edge function to delete the cached row and
            // produce a fresh summary. The user immediately sees the
            // loading skeleton, then the new output appears.
            //
            // TODO: also persist the selected reasons to a
            // `summary_ratings` table so we can learn what kinds of
            // outputs users reject. For now, in-memory only.
            onPress={() => {
              onRegenerate?.();
              setRating(null);
            }}
          >
            <Icon name="Refresh" size={11} color={tokens.colors.cream[50]} strokeWidth={2} />
            <Text style={sumStyles.negBtnRegenLabel}>Submit &amp; regenerate</Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => [sumStyles.negBtnSubmit, pressed && { opacity: 0.7 }]}
            // Submit-only: acknowledge feedback without regenerating.
            // TODO: persist to `summary_ratings` once the table exists.
            onPress={() => setRating('positive')}
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
          <Pressable
            style={sumStyles.qualityBtn}
            onPress={() => setRating('positive')}
            accessibilityLabel="Mark summary as helpful"
          >
            <Icon
              name="ThumbUp"
              size={16}
              color={tokens.colors.forest[800]}
              strokeWidth={0}
            />
          </Pressable>
          <Pressable
            style={sumStyles.qualityBtn}
            onPress={() => setRating('negative')}
            accessibilityLabel="Mark summary as not helpful"
          >
            <Icon
              name="ThumbDown"
              size={16}
              color={tokens.textColors.muted}
              strokeWidth={0}
            />
          </Pressable>
        </View>
      </View>
    </View>
  );
}

// ─── Summary action bar ───────────────────────────────────────────────────────

function SummaryActionBar({
  summary,
  bookTitle: _bookTitle,
}: {
  summary: string;
  bookTitle: string;
}) {
  // Read aloud — native TTS, instant, no API roundtrip. Tracks
  // isSpeaking so the Listen button can toggle between "Listen" and
  // "Stop" instead of stacking utterances on rapid taps.
  const [isSpeaking, setIsSpeaking] = useState(false);
  // Copy → 1.5s "Copied" confirmation so the user knows the tap took
  // effect (the clipboard write itself is invisible).
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    return () => {
      // Stop any in-flight speech when leaving the summary screen.
      void Speech.stop();
    };
  }, []);
  const handleListen = useCallback(() => {
    if (isSpeaking) {
      void Speech.stop();
      setIsSpeaking(false);
      return;
    }
    setIsSpeaking(true);
    Speech.speak(summary, {
      rate: 0.95,
      onDone: () => setIsSpeaking(false),
      onStopped: () => setIsSpeaking(false),
      onError: () => setIsSpeaking(false),
    });
  }, [isSpeaking, summary]);

  const handleCopy = useCallback(async () => {
    try {
      await Clipboard.setStringAsync(summary);
      setCopied(true);
      // Reset after a moment so the next tap feels live again. Short
      // enough that no one stares at the chip waiting for it to revert.
      setTimeout(() => setCopied(false), 1500);
    } catch (err) {
      // Clipboard failures are basically unheard of, but guard
      // anyway so we never crash on a user tap.
      console.warn('[summary-copy] failed:', err);
    }
  }, [summary]);

  return (
    <View style={sumStyles.actionBar}>
      <Pressable
        style={({ pressed }) => [sumStyles.listenBtn, pressed && { opacity: 0.85 }]}
        onPress={handleListen}
        accessibilityRole="button"
        accessibilityLabel={isSpeaking ? 'Stop summary audio' : 'Listen to summary'}
      >
        <Icon
          name={isSpeaking ? 'Pause' : 'Headphones'}
          size={13}
          color={tokens.colors.cream[50]}
          strokeWidth={1.5}
        />
        <Text style={sumStyles.listenBtnLabel}>
          {isSpeaking ? 'Stop' : 'Listen to summary'}
        </Text>
      </Pressable>
      <Pressable
        style={({ pressed }) => [
          sumStyles.actionIconBtn,
          copied && sumStyles.actionIconBtnCopied,
          pressed && { opacity: 0.7 },
        ]}
        onPress={() => void handleCopy()}
        accessibilityRole="button"
        accessibilityLabel={copied ? 'Summary copied' : 'Copy summary'}
      >
        <Icon
          name={copied ? 'Check' : 'Copy'}
          size={15}
          color={
            copied ? tokens.colors.forest[800] : tokens.textColors.secondary
          }
          strokeWidth={1.5}
        />
      </Pressable>
    </View>
  );
}

// ─── Whole-book credit confirmation sheet ─────────────────────────────────────

const WARN_COLOR = tokens.colors.warn;
const WARN_BG = tokens.colors.warnBg;

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
          A whole-book summary reads every page and weaves them into a single narrative. It uses significantly more AI credits than a page summary.
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
          <Pressable style={wbStyles.upsellBtn} onPress={openUpgradePaywall}>
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

// ─── Summary loading body ─────────────────────────────────────────────────────

/**
 * Loading state shown while `generate-summary` is in flight. The edge
 * function returns the full summary in a single response (we don't
 * stream tokens), so a faux mid-stream cursor would be misleading. The
 * pill + skeleton lines tell the user "we're working on it" without
 * pretending content is already arriving.
 */
function SummaryStreamingBody() {
  const dot1 = useSharedValue(0.3);
  const dot2 = useSharedValue(0.3);
  const dot3 = useSharedValue(0.3);

  useEffect(() => {
    dot1.value = withRepeat(withTiming(1, { duration: 600 }), -1, true);
    dot2.value = withDelay(200, withRepeat(withTiming(1, { duration: 600 }), -1, true));
    dot3.value = withDelay(400, withRepeat(withTiming(1, { duration: 600 }), -1, true));
  }, [dot1, dot2, dot3]);

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

      {/* Skeleton lines stand in for the paragraphs that will land once
          the response resolves. Three blocks reads as "a few paragraphs
          of body copy" without prescribing a specific length. */}
      <View style={sumStyles.streamSkelPara}>
        <Skeleton width="100%" height={13} borderRadius={4} />
        <Skeleton width="92%" height={13} borderRadius={4} />
        <Skeleton width="100%" height={13} borderRadius={4} />
        <Skeleton width="78%" height={13} borderRadius={4} />
      </View>
      <View style={sumStyles.streamSkelPara}>
        <Skeleton width="100%" height={13} borderRadius={4} />
        <Skeleton width="88%" height={13} borderRadius={4} />
        <Skeleton width="100%" height={13} borderRadius={4} />
        <Skeleton width="64%" height={13} borderRadius={4} />
      </View>
      <View style={sumStyles.streamSkelPara}>
        <Skeleton width="96%" height={13} borderRadius={4} />
        <Skeleton width="100%" height={13} borderRadius={4} />
        <Skeleton width="72%" height={13} borderRadius={4} />
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

  // Real chat — useChat handles conversation lookup, history load,
  // optimistic appends, retries, and error mapping. The local state
  // here is just the input field.
  const { messages: chatMessages, loading, sending, errorMessage, send, retry } = useChat(book.id);
  const [inputText, setInputText] = useState('');
  const scrollRef = useRef<ScrollView>(null);
  const hasUserMessage = chatMessages.some((m) => m.role === 'user');

  // Suggested questions (rendered before the user has typed anything).
  // Server-cached on books.suggested_questions so this is a single
  // round-trip per book lifetime; loading state is the skeleton row.
  const startersState = useStarterQuestions(book.id);

  // Adapt the hook's persisted ChatRecord shape to the legacy
  // ChatMessage shape the existing bubble components expect. The
  // failed/pending flags map to ai-error / muted user styling.
  const messages: ChatMessage[] = chatMessages.map(recordToMessage);

  // Auto-scroll on new messages. We watch length + content of the
  // last message so streaming-appended content also keeps the view
  // pinned to the bottom (no streaming yet, but cheap to wire now).
  const lastSig = messages.length + ':' + (messages[messages.length - 1]?.text.length ?? 0);
  useEffect(() => {
    const id = setTimeout(
      () => scrollRef.current?.scrollToEnd({ animated: true }),
      80,
    );
    return () => clearTimeout(id);
  }, [lastSig]);

  const sendMessage = useCallback(() => {
    const text = inputText.trim();
    if (!text) return;
    setInputText('');
    void send(text);
  }, [inputText, send]);

  const retryAiError = useCallback(
    (id: string) => {
      // The "ai-error" bubble in the legacy shape maps to a failed
      // user message in the persisted shape. Find the user message
      // immediately before this error and re-send it.
      const idx = chatMessages.findIndex((m) => m.id === id);
      if (idx <= 0) return;
      const prevUser = chatMessages[idx - 1];
      if (prevUser.role === 'user' && prevUser.failed) {
        void retry(prevUser.id);
      }
    },
    [chatMessages, retry],
  );

  const skipAiError = useCallback(() => {
    // No-op for now: the failed user message lives until the user
    // either retries or sends a new question. We could add a "delete
    // failed message" action later if the UX feels noisy.
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
        {/* Right slot intentionally empty — there's no chat-level
            settings or help surface yet. Keep a width-matched
            spacer so the title stays optically centred between the
            back arrow and the right edge. */}
        <View style={chatStyles.headerBtn} />
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
            Answers come only from {book.title}. I'll cite the pages I pull from.
          </Text>
        </View>
      )}

      {/* Low credits banner removed alongside the AI Tools sheet's
          credits footer — the metering pipeline isn't wired yet, so
          the banner could never fire on a real signal. Re-add when
          per-user credit balance lands. */}

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
              onSuggestionTap={(q) => {
                // Treat the suggested follow-up exactly like the
                // user typed it themselves: fires `send`, optimistic
                // append happens inside useChat.
                void send(q);
              }}
            />
          ))}

          {/* Thinking indicator while we wait on Claude. Renders as
              an empty AI bubble with three pulsing dots, so the user
              has visible feedback that their question landed and the
              app is working — instead of staring at a static screen
              for 2-4 seconds until the response arrives. The actual
              latency is bounded by the LLM round-trip, but perceived
              speed is significantly better with this. */}
          {sending && <ChatThinkingBubble />}

          {/* Send-error banner. The failed user message is rendered
              inline with .failed=true (faded + retry tap target on
              the bubble itself); this card is the supplementary
              "what went wrong" affordance. */}
          {errorMessage && (
            <ChatErrorCard
              isOffline={isOffline}
              onRetry={() => {
                const lastFailed = [...chatMessages]
                  .reverse()
                  .find((m) => m.failed);
                if (lastFailed) void retry(lastFailed.id);
              }}
              onDiscard={() => undefined}
            />
          )}
        </ScrollView>

        {/* Starter questions — only when online and no messages.
            Loading state shows three skeleton rows; success renders the
            book-specific questions returned by `generate-starters`.
            Errors silently hide the section — starters are an
            enhancement, not a blocker for chatting. */}
        {!isOffline && !hasUserMessage && !loading && (
          <StarterQuestions
            state={startersState}
            onPick={(q) => setInputText(q)}
          />
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

// ─── Starter questions ────────────────────────────────────────────────────────

/**
 * Renders the "Suggested questions" block that seeds the chat. Three
 * states map to three layouts:
 *   - loading → three skeleton rows so layout doesn't shift in
 *   - success → tappable chips, one per question, that pre-fill the input
 *   - error   → fall back to generic book-agnostic prompts so the user
 *               always has something to tap; the real per-book questions
 *               take over the moment generate-starters succeeds
 */
function StarterQuestions({
  state,
  onPick,
}: {
  state: import('~/lib/aiStarters').StarterQuestionsState;
  onPick: (q: string) => void;
}) {
  // Surface the underlying failure to the dev console — silent error
  // states make it impossible to tell whether the migration or edge
  // function is missing without reaching for the network panel.
  useEffect(() => {
    if (state.status === 'error') {
      console.warn(
        '[chat] starter questions failed:',
        state.errorCode,
        state.errorMessage ?? '',
      );
    }
  }, [state]);

  const questions =
    state.status === 'success' && state.questions.length > 0
      ? state.questions
      : state.status === 'error'
        ? FALLBACK_STARTERS
        : null;

  return (
    <>
      <Text style={chatStyles.starterLabel}>Suggested questions</Text>
      <View style={chatStyles.starterChips}>
        {state.status === 'loading' ? (
          <>
            <StarterSkeleton widthPct="92%" />
            <StarterSkeleton widthPct="78%" />
            <StarterSkeleton widthPct="84%" />
          </>
        ) : questions ? (
          questions.map((q) => (
            <Pressable
              key={q}
              style={chatStyles.starterChip}
              onPress={() => onPick(q)}
              accessibilityRole="button"
            >
              <Text style={chatStyles.starterChipText}>{q}</Text>
            </Pressable>
          ))
        ) : null}
      </View>
    </>
  );
}

function StarterSkeleton({ widthPct }: { widthPct: `${number}%` }) {
  return (
    <View style={chatStyles.starterChip}>
      <Skeleton width={widthPct} height={14} borderRadius={4} />
    </View>
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
  onSuggestionTap,
}: {
  message: ChatMessage;
  onRetryAiError?: (id: string) => void;
  onSkipAiError?: (id: string) => void;
  /** Tap an off-topic suggested follow-up — should send it as a
   * new user message. Wired by the parent so this bubble doesn't
   * have to reach into the chat hook. */
  onSuggestionTap?: (q: string) => void;
}) {
  if (message.role === 'ai-error') {
    return (
      <AiErrorBubble
        onRetry={() => onRetryAiError?.(message.id)}
        onSkip={() => onSkipAiError?.(message.id)}
      />
    );
  }

  if (message.role === 'ai-offtopic') {
    return (
      <OffTopicBubble message={message} onSuggestionTap={onSuggestionTap} />
    );
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
            // Source chips are read-only for now — jumping to the
            // citing page would need the chat backend to return
            // page indices alongside source labels. Today's payload
            // only carries the human-readable label, so we render
            // it as a non-interactive tag.
            <View key={src} style={chatStyles.sourceChip}>
              <Text style={chatStyles.sourceChipLabel}>{src}</Text>
            </View>
          ))}
        </View>
      )}
      {isAI && <FeedbackRow />}
    </View>
  );
}

/**
 * Thumbs-up / thumbs-down rating control rendered under AI responses.
 *
 * Self-contained state — each bubble owns its own rating. Real
 * persistence (writing to a `chat_message_ratings` table) lands when
 * we have the metering pipeline in place; until then this is a
 * client-only signal that lets the user feel heard.
 *
 * Iconography: the Tabler `ThumbUp` / `ThumbDown` glyphs (mapped in
 * Icon.tsx to the *Filled* variants) replace the previous emoji
 * `👍 👎`. The filled glyph reads as "this is a tappable button"
 * better than an emoji does, and the colour shifts on selection to
 * mirror the existing `feedbackBtnActive` background highlight.
 */
function FeedbackRow() {
  const [thumbed, setThumbed] = useState<'up' | 'down' | null>(null);
  const colorFor = (which: 'up' | 'down') =>
    thumbed === which ? tokens.colors.forest[800] : tokens.textColors.muted;
  return (
    <View style={chatStyles.feedbackRow}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Mark response as helpful"
        accessibilityState={{ selected: thumbed === 'up' }}
        style={[
          chatStyles.feedbackBtn,
          thumbed === 'up' && chatStyles.feedbackBtnActive,
        ]}
        onPress={() => setThumbed((p) => (p === 'up' ? null : 'up'))}
      >
        <Icon name="ThumbUp" size={14} color={colorFor('up')} strokeWidth={0} />
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Mark response as not helpful"
        accessibilityState={{ selected: thumbed === 'down' }}
        style={[
          chatStyles.feedbackBtn,
          thumbed === 'down' && chatStyles.feedbackBtnActive,
        ]}
        onPress={() => setThumbed((p) => (p === 'down' ? null : 'down'))}
      >
        <Icon name="ThumbDown" size={14} color={colorFor('down')} strokeWidth={0} />
      </Pressable>
    </View>
  );
}

// ─── AI error bubble ──────────────────────────────────────────────────────────

/**
 * "Thinking…" placeholder bubble shown between when the user sends a
 * question and when Claude's response lands. Visual feedback that the
 * app is doing something — perceived latency drops sharply even
 * though the actual LLM round-trip (~2-4s) is unchanged.
 *
 * Three dots pulse with staggered timing, reusing the same animation
 * pattern as `SummaryStreamingBody` (Reanimated shared values +
 * withRepeat). Wrapped in the standard AI bubble chrome so it sits
 * in the conversation flow naturally — looks like an AI message
 * that's mid-typing, not a separate spinner.
 */
function ChatThinkingBubble() {
  const dot1 = useSharedValue(0.3);
  const dot2 = useSharedValue(0.3);
  const dot3 = useSharedValue(0.3);

  useEffect(() => {
    dot1.value = withRepeat(withTiming(1, { duration: 600 }), -1, true);
    dot2.value = withDelay(200, withRepeat(withTiming(1, { duration: 600 }), -1, true));
    dot3.value = withDelay(400, withRepeat(withTiming(1, { duration: 600 }), -1, true));
  }, [dot1, dot2, dot3]);

  const dot1Style = useAnimatedStyle(() => ({
    opacity: interpolate(dot1.value, [0, 1], [0.3, 1]),
  }));
  const dot2Style = useAnimatedStyle(() => ({
    opacity: interpolate(dot2.value, [0, 1], [0.3, 1]),
  }));
  const dot3Style = useAnimatedStyle(() => ({
    opacity: interpolate(dot3.value, [0, 1], [0.3, 1]),
  }));

  return (
    <View style={[chatStyles.bubbleWrap, chatStyles.bubbleWrapAI]}>
      <View
        style={[chatStyles.bubble, chatStyles.bubbleAI, chatStyles.thinkingBubble]}
        accessibilityLabel="Thinking"
        accessibilityLiveRegion="polite"
      >
        <Animated.View style={[chatStyles.thinkingDot, dot1Style]} />
        <Animated.View style={[chatStyles.thinkingDot, dot2Style]} />
        <Animated.View style={[chatStyles.thinkingDot, dot3Style]} />
      </View>
    </View>
  );
}

function AiErrorBubble({ onRetry, onSkip }: { onRetry: () => void; onSkip: () => void }) {
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
      <FeedbackRow />
    </View>
  );
}

// ─── Off-topic bubble ─────────────────────────────────────────────────────────

function OffTopicBubble({
  message,
  onSuggestionTap,
}: {
  message: ChatMessage;
  onSuggestionTap?: (q: string) => void;
}) {
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
              <Pressable
                key={q}
                style={chatStyles.offtopicSuggestion}
                onPress={() => onSuggestionTap?.(q)}
              >
                <Text style={chatStyles.offtopicSuggestionText}>{q}</Text>
              </Pressable>
            ))}
          </View>
        )}
      </View>
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
  // qualityEmoji removed — replaced with Icon name="ThumbUp" /
  // "ThumbDown" filled glyphs from the Tabler set. Padding now lives
  // on `qualityBtn` itself (the icon centers naturally).

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
  // Subtle confirmation styling when the user just copied. Brand
  // tint pulses for ~1.5s, then the chip resets to its default.
  actionIconBtnCopied: {
    backgroundColor: tokens.colors.forest[50],
    borderColor: tokens.colors.forest[200],
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

  // Thinking bubble — three pulsing dots arranged horizontally
  // inside the standard AI bubble shape. Overrides the default
  // padding so the dot row looks intentional, not text-with-no-text.
  thinkingBubble: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 12,
  },
  thinkingDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: tokens.colors.forest[800],
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
