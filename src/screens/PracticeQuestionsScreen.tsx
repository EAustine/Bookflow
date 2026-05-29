import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BottomSheet, Icon, Text, type BottomSheetRef } from '~/components';
import { tokens } from '~/design/tokens';
import { formatNetworkError } from '~/lib/networkErrors';
import { useBackHandler } from '~/lib/useBackHandler';
import type { Book } from '~/types/book';
import { generatePractice } from '~/lib/aiPractice';

// ─── Semantic colors not in token set ─────────────────────────────────────────

const C = {
  success: tokens.colors.success,
  successBg: tokens.colors.successBg,
  successBorder: '#B7CCB9',
  error: tokens.colors.error,
  errorBg: tokens.colors.errorBg,
  errorBorder: '#EFC9C6',
  warn: tokens.colors.warn,
  warnBg: tokens.colors.warnBg,
};

// ─── Types ────────────────────────────────────────────────────────────────────

type MCQOption = { letter: string; text: string };

type MCQQuestion = {
  id: string;
  type: 'mcq';
  text: string;
  options: MCQOption[];
  correctIdx: number;
  feedback: string;
  source: string;
};

type ShortQuestion = {
  id: string;
  type: 'short';
  text: string;
  modelAnswer: string;
  feedback: string;
  source: string;
};

type Question = MCQQuestion | ShortQuestion;

function practiceErrorMessage(code: string): string {
  switch (code) {
    case 'page_too_short':
      return "This page doesn't have enough text to make a fair quiz from.";
    case 'page_not_found':
      return "Couldn't find this page in the book. Try re-processing.";
    case 'invalid_llm_output':
      return "The model returned malformed questions. Tap retry to try again.";
    case 'server_misconfigured':
      return 'The practice service is temporarily unavailable.';
    case 'request_failed':
    case 'function_failed':
      return 'Network issue talking to the practice service.';
    default:
      return "Something went wrong generating the quiz.";
  }
}
type Grade = 'correct' | 'partial' | 'incorrect';

type AnswerRecord =
  | { type: 'mcq'; selectedIdx: number; isCorrect: boolean }
  | { type: 'short'; text: string; grade: Grade };

type QuizCount = 5 | 10 | 15;
type QuizType = 'mixed' | 'mcq' | 'short';
type QuizOrder = 'sequential' | 'random';

type QuizConfig = { count: QuizCount; qType: QuizType; order: QuizOrder };

// ─── Helpers ──────────────────────────────────────────────────────────────────

function gradeFor(ans: AnswerRecord | undefined): Grade | 'unanswered' {
  if (!ans) return 'unanswered';
  if (ans.type === 'mcq') return ans.isCorrect ? 'correct' : 'incorrect';
  return ans.grade;
}

function scoreLabel(pct: number): string {
  if (pct >= 90) return 'Excellent mastery';
  if (pct >= 70) return 'Strong understanding';
  if (pct >= 50) return 'Good progress';
  return 'Keep practising';
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export type PracticeQuestionsScreenProps = {
  book: Book;
  onBack: () => void;
  /**
   * 0-based page to generate questions from. The reader threads its
   * current page; defaults to the persisted last_read_page if unset.
   */
  pageIndex?: number;
};

export function PracticeQuestionsScreen({ book, onBack, pageIndex }: PracticeQuestionsScreenProps) {
  // Hardware-back routes to the reader (clears aiMode in the parent)
  // rather than falling through to the reader's own useBackHandler,
  // which would otherwise take the user out to Library.
  useBackHandler(() => {
    onBack();
    return true;
  });
  const [phase, setPhase] = useState<'config' | 'loading' | 'quiz' | 'results' | 'error'>(
    'config',
  );
  const [config, setConfig] = useState<QuizConfig>({ count: 5, qType: 'mcq', order: 'sequential' });
  const [activeQuestions, setActiveQuestions] = useState<Question[]>([]);
  // The full original question set, separate from `activeQuestions`
  // (which can be a missed-only subset after a "Retry missed" tap).
  // Lets the Results screen offer a "Redo all questions" CTA that
  // restores the original set even after the user has already
  // narrowed down to the misses.
  const [originalQuestions, setOriginalQuestions] = useState<Question[]>([]);
  const [questionIdx, setQuestionIdx] = useState(0);
  const [answers, setAnswers] = useState<Map<string, AnswerRecord>>(new Map());
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Resolved page index — initially seeded from the prop (or persisted
  // last-read), but the user can override via the page picker on the
  // config screen. Tracked as state so a fresh selection re-runs
  // generation against the new page.
  const initialPageIndex =
    pageIndex ?? (book as { last_read_page?: number }).last_read_page ?? 0;
  const [resolvedPageIndex, setResolvedPageIndex] = useState(initialPageIndex);
  const defaultPageIndex = initialPageIndex;

  const startQuiz = useCallback(async () => {
    setPhase('loading');
    setErrorMessage(null);

    // The edge function only emits MCQ today. The "short" / "mixed"
    // options in the config UI fall back to MCQ until we wire a
    // separate short-answer flow (would need open-ended grading).
    const requestedCount = (
      [3, 5, 10] as const
    ).includes(config.count as 3 | 5 | 10)
      ? (config.count as 3 | 5 | 10)
      : 5;

    const result = await generatePractice({
      bookId: book.id,
      pageIndex: resolvedPageIndex,
      count: requestedCount,
    });

    if (!result.ok) {
      // Error-message priority (mirrors AIToolsScreen / Summary):
      //   1. If raw message looks network-shaped → friendly offline /
      //      timeout copy is more actionable than the domain mapper.
      //   2. Otherwise prefer practiceErrorMessage code mapping —
      //      it handles practice-specific cases (page_too_short etc).
      //   3. Last resort: run the raw message through the network
      //      formatter so we never leak stack-trace-shaped text.
      const raw = result.message;
      if (raw && /network request failed|network error|failed to fetch|abort|timeout/i.test(raw)) {
        setErrorMessage(formatNetworkError(raw, 'generating practice questions'));
      } else if (result.error) {
        setErrorMessage(practiceErrorMessage(result.error));
      } else if (raw) {
        setErrorMessage(formatNetworkError(raw, 'generating practice questions'));
      } else {
        setErrorMessage('Something went wrong. Try again in a moment.');
      }
      setPhase('error');
      return;
    }

    // Map the API shape (correctIndex / options strings) onto the
    // internal Question shape (correctIdx / option objects with
    // letters). The legacy `feedback` and `source` fields map from the
    // model's `explanation` and a synthetic page reference.
    let qs: Question[] = result.data.questions.map((q, i) => ({
      id: `g${i}`,
      type: 'mcq' as const,
      text: q.question,
      options: q.options.map((text, idx) => ({
        letter: String.fromCharCode(65 + idx) as MCQOption['letter'],
        text,
      })),
      correctIdx: q.correctIndex,
      feedback: q.explanation,
      source: `p. ${resolvedPageIndex + 1}`,
    }));

    if (config.order === 'random') qs = [...qs].sort(() => Math.random() - 0.5);
    qs = qs.slice(0, config.count);
    setActiveQuestions(qs);
    // Snapshot the original generated set so the Results screen's
    // "Redo all questions" CTA can restore it after the user has
    // narrowed to the missed-only subset via "Retry missed".
    setOriginalQuestions(qs);
    setAnswers(new Map());
    setQuestionIdx(0);
    setPhase('quiz');
  }, [book.id, config.count, config.order, resolvedPageIndex]);

  const recordAnswer = useCallback(
    (record: AnswerRecord) => {
      const q = activeQuestions[questionIdx];
      setAnswers((prev) => new Map(prev).set(q.id, record));
    },
    [activeQuestions, questionIdx],
  );

  const advance = useCallback(() => {
    if (questionIdx < activeQuestions.length - 1) {
      setQuestionIdx((p) => p + 1);
    } else {
      setPhase('results');
    }
  }, [questionIdx, activeQuestions.length]);

  // Re-run the FULL original question set. Uses originalQuestions
  // (snapshot from startQuiz) so this still works after a previous
  // "Retry missed" tap that narrowed activeQuestions down.
  const retryAll = useCallback(() => {
    if (originalQuestions.length > 0) setActiveQuestions(originalQuestions);
    setAnswers(new Map());
    setQuestionIdx(0);
    setPhase('quiz');
  }, [originalQuestions]);

  // Re-run ONLY the questions the user got wrong (incorrect + partial).
  // Backed by the Results screen's `missed` array — we receive it
  // through the onRetryMissed callback so the slicing logic lives
  // alongside the grading.
  const retryMissed = useCallback((missedQuestions: Question[]) => {
    if (missedQuestions.length === 0) return;
    setActiveQuestions(missedQuestions);
    setAnswers(new Map());
    setQuestionIdx(0);
    setPhase('quiz');
  }, []);

  if (phase === 'config') {
    return (
      <ConfigScreen
        book={book}
        pageIndex={resolvedPageIndex}
        defaultPageIndex={defaultPageIndex}
        onPageIndexChange={setResolvedPageIndex}
        config={config}
        onConfig={setConfig}
        onGenerate={startQuiz}
        onClose={onBack}
      />
    );
  }

  if (phase === 'loading') {
    return (
      <SafeAreaView style={styles.safe} edges={['top', 'left', 'right', 'bottom']}>
        <View style={styles.loadingWrap}>
          <Text style={styles.loadingTitle}>Generating questions…</Text>
          <Text style={styles.loadingBody}>
            Reading page {resolvedPageIndex + 1} and writing {config.count} questions.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  if (phase === 'error') {
    return (
      <SafeAreaView style={styles.safe} edges={['top', 'left', 'right', 'bottom']}>
        <View style={styles.loadingWrap}>
          <Icon name="AlertCircle" size={28} color={tokens.colors.error} strokeWidth={1.5} />
          <Text style={styles.loadingTitle}>Couldn't generate questions</Text>
          <Text style={styles.loadingBody}>
            {errorMessage ?? 'The model couldn\'t produce a quiz for this page. Try again in a moment.'}
          </Text>
          <Pressable
            style={({ pressed }) => [styles.errorRetry, pressed && { opacity: 0.85 }]}
            onPress={() => void startQuiz()}
          >
            <Icon name="Refresh" size={14} color={tokens.colors.cream[50]} />
            <Text style={styles.errorRetryLabel}>Try again</Text>
          </Pressable>
          <Pressable onPress={() => setPhase('config')} style={styles.errorBack}>
            <Text style={styles.errorBackLabel}>Back to options</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  if (phase === 'quiz') {
    const question = activeQuestions[questionIdx];
    return (
      <QuestionScreen
        key={question.id}
        book={book}
        pageIndex={resolvedPageIndex}
        question={question}
        questionIdx={questionIdx}
        total={activeQuestions.length}
        answer={answers.get(question.id)}
        answers={answers}
        activeQuestions={activeQuestions}
        onAnswer={recordAnswer}
        onNext={advance}
        onClose={onBack}
      />
    );
  }

  // Results
  let correct = 0, partial = 0, incorrect = 0;
  const missed: Question[] = [];
  for (const q of activeQuestions) {
    const g = gradeFor(answers.get(q.id));
    if (g === 'correct') correct++;
    else if (g === 'partial') { partial++; missed.push(q); }
    else { incorrect++; missed.push(q); }
  }
  const rawScore = correct * 1.0 + partial * 0.5;
  const displayScore = Math.round(rawScore);
  const total = activeQuestions.length;
  const pct = Math.round((rawScore / total) * 100);

  return (
    <ResultsScreen
      book={book}
      pageIndex={resolvedPageIndex}
      correct={correct}
      partial={partial}
      incorrect={incorrect}
      rawScore={rawScore}
      displayScore={displayScore}
      total={total}
      pct={pct}
      label={scoreLabel(pct)}
      missed={missed}
      missedCount={missed.length}
      onRetryMissed={() => retryMissed(missed)}
      onRetryAll={retryAll}
      onDone={onBack}
    />
  );
}

// ─── Config screen ────────────────────────────────────────────────────────────

const COST_MAP: Record<QuizCount, string> = { 5: '~1.5K', 10: '~3K', 15: '~4.5K' };

function ConfigScreen({
  book,
  pageIndex,
  defaultPageIndex,
  onPageIndexChange,
  config,
  onConfig,
  onGenerate,
  onClose,
}: {
  book: Book;
  pageIndex: number;
  /** Persisted "current page" used to label the row when the user hasn't overridden it. */
  defaultPageIndex: number;
  onPageIndexChange: (idx: number) => void;
  config: QuizConfig;
  onConfig: React.Dispatch<React.SetStateAction<QuizConfig>>;
  onGenerate: () => void;
  onClose: () => void;
}) {
  const pageNum = pageIndex + 1;
  const isCurrentPage = pageIndex === defaultPageIndex;
  const totalPages = Math.max(1, book.totalPages || 1);
  const pickerRef = useRef<BottomSheetRef>(null);

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right', 'bottom']}>
      <PQHeader
        title="Practice questions"
        sub={book.title}
        onClose={onClose}
        right={<View style={{ width: 30 }} />}
      />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.configBody}
        showsVerticalScrollIndicator={false}
      >
        {/* Page */}
        <SectionBlock label="Page">
          <Pressable
            style={styles.chapterRow}
            onPress={() => pickerRef.current?.present()}
            accessibilityRole="button"
            accessibilityLabel={`Selected page ${pageNum} of ${totalPages}. Tap to change.`}
          >
            <View style={{ flex: 1 }}>
              <Text style={styles.chapterTitle}>
                Page {pageNum}
                {isCurrentPage ? ' — Current page' : ''}
              </Text>
              <Text style={styles.chapterSub}>
                Tap to change · {totalPages} pages total
              </Text>
            </View>
            <Icon name="ChevronDown" size={14} color={tokens.textColors.muted} strokeWidth={1.5} />
          </Pressable>
        </SectionBlock>

        {/* Count */}
        <SectionBlock label="Number of questions">
          <SegGroup
            options={[
              { value: 5, label: '5' },
              { value: 10, label: '10', badge: 'recommended' },
              { value: 15, label: '15' },
            ]}
            value={config.count}
            onChange={(v) => onConfig((c) => ({ ...c, count: v as QuizCount }))}
          />
        </SectionBlock>

        {/* Type */}
        <SectionBlock label="Question type">
          <SegGroup
            options={[
              { value: 'mixed', label: 'Mixed', badge: 'recommended' },
              { value: 'mcq', label: 'MCQ' },
              { value: 'short', label: 'Short' },
            ]}
            value={config.qType}
            onChange={(v) => onConfig((c) => ({ ...c, qType: v as QuizType }))}
          />
        </SectionBlock>

        {/* Order */}
        <SectionBlock label="Question order">
          <SegGroup
            options={[
              { value: 'sequential', label: 'Sequential', badge: 'recommended' },
              { value: 'random', label: 'Randomised' },
            ]}
            value={config.order}
            onChange={(v) => onConfig((c) => ({ ...c, order: v as QuizOrder }))}
          />
        </SectionBlock>

        {/* Cost */}
        <View style={styles.costRow}>
          <Text style={styles.costLabel}>Estimated cost</Text>
          <Text style={styles.costValue}>{COST_MAP[config.count]} AI credits</Text>
        </View>
      </ScrollView>

      <View style={styles.configFooter}>
        <Pressable style={styles.generateBtn} onPress={onGenerate}>
          <Icon name="Sparkles" size={15} color={tokens.colors.cream[50]} />
          <Text style={styles.generateBtnLabel}>Generate questions</Text>
        </Pressable>
      </View>

      <BottomSheet ref={pickerRef} title="Pick a page">
        <PagePickerBody
          totalPages={totalPages}
          selectedIndex={pageIndex}
          defaultIndex={defaultPageIndex}
          onSelect={(idx) => {
            onPageIndexChange(idx);
            pickerRef.current?.dismiss();
          }}
        />
      </BottomSheet>
    </SafeAreaView>
  );
}

// ─── Page picker body ─────────────────────────────────────────────────────────

/**
 * Vertical list of all pages in the book. Each row is tappable; the
 * currently-selected one is highlighted in forest, the persisted
 * "current page" gets a badge so the user knows which one matches their
 * read position. Auto-scrolls to the selected page when first opened.
 */
function PagePickerBody({
  totalPages,
  selectedIndex,
  defaultIndex,
  onSelect,
}: {
  totalPages: number;
  selectedIndex: number;
  defaultIndex: number;
  onSelect: (idx: number) => void;
}) {
  const ROW_HEIGHT = 44;
  const scrollRef = useRef<ScrollView>(null);

  // Center the selection on first render so the user lands on context,
  // not at page 1. Subsequent re-renders (e.g. after onSelect) leave the
  // sheet alone — the dismiss + re-present happens after selection.
  useEffect(() => {
    requestAnimationFrame(() => {
      const offset = Math.max(0, selectedIndex * ROW_HEIGHT - ROW_HEIGHT * 2);
      scrollRef.current?.scrollTo({ y: offset, animated: false });
    });
  }, [selectedIndex]);

  return (
    <ScrollView
      ref={scrollRef}
      style={pickerStyles.list}
      contentContainerStyle={pickerStyles.listContent}
      showsVerticalScrollIndicator={false}
      // Cap the picker height so it never eats the whole sheet on a long book.
      // BottomSheet enableDynamicSizing fits to children, so this gives it
      // a definite ceiling.
      nestedScrollEnabled
    >
      {Array.from({ length: totalPages }, (_, i) => {
        const isSelected = i === selectedIndex;
        const isDefault = i === defaultIndex;
        return (
          <Pressable
            key={i}
            onPress={() => onSelect(i)}
            style={[pickerStyles.row, isSelected && pickerStyles.rowSelected]}
            accessibilityRole="button"
            accessibilityState={{ selected: isSelected }}
          >
            <Text
              style={[pickerStyles.rowLabel, isSelected && pickerStyles.rowLabelSelected]}
            >
              Page {i + 1}
            </Text>
            {isDefault && (
              <Text
                style={[
                  pickerStyles.currentBadge,
                  isSelected && pickerStyles.currentBadgeOnSelected,
                ]}
              >
                Current
              </Text>
            )}
            {isSelected && (
              <Icon
                name="Check"
                size={16}
                color={tokens.colors.cream[50]}
                strokeWidth={2.5}
              />
            )}
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

// ─── Question screen (MCQ + short answer) ─────────────────────────────────────

function QuestionScreen({
  book,
  pageIndex,
  question,
  questionIdx,
  total,
  answer,
  answers,
  activeQuestions,
  onAnswer,
  onNext,
  onClose,
}: {
  book: Book;
  pageIndex: number;
  question: Question;
  questionIdx: number;
  total: number;
  answer: AnswerRecord | undefined;
  answers: Map<string, AnswerRecord>;
  activeQuestions: Question[];
  onAnswer: (r: AnswerRecord) => void;
  onNext: () => void;
  onClose: () => void;
}) {
  const isLast = questionIdx === total - 1;
  const isAnswered = !!answer;

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right', 'bottom']}>
      <PQHeader
        title={`Question ${questionIdx + 1} of ${total}`}
        sub={`${book.title} · Page ${pageIndex + 1}`}
        onClose={onClose}
        right={
          !isAnswered ? (
            <Pressable onPress={onNext} hitSlop={8}>
              <Text style={styles.skipBtn}>Skip</Text>
            </Pressable>
          ) : (
            <View style={{ width: 30 }} />
          )
        }
      />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.questionBody}
        showsVerticalScrollIndicator={false}
      >
        <ProgressDots
          current={questionIdx}
          total={total}
          answers={answers}
          questions={activeQuestions}
        />

        <Text style={styles.questionText}>{question.text}</Text>

        {question.type === 'mcq' ? (
          <MCQBody
            question={question}
            answer={answer?.type === 'mcq' ? answer : undefined}
            onAnswer={onAnswer}
          />
        ) : (
          <ShortAnswerBody
            question={question}
            answer={answer?.type === 'short' ? answer : undefined}
            onAnswer={onAnswer}
          />
        )}

        {isAnswered && (
          <Pressable style={styles.nextBtn} onPress={onNext}>
            <Text style={styles.nextBtnLabel}>
              {isLast ? 'See results' : 'Next question'} →
            </Text>
          </Pressable>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── MCQ body ─────────────────────────────────────────────────────────────────

function MCQBody({
  question,
  answer,
  onAnswer,
}: {
  question: MCQQuestion;
  answer: { type: 'mcq'; selectedIdx: number; isCorrect: boolean } | undefined;
  onAnswer: (r: AnswerRecord) => void;
}) {
  const isAnswered = !!answer;

  const optionStyle = (idx: number) => {
    if (!isAnswered) return styles.option;
    if (idx === question.correctIdx) return [styles.option, styles.optionCorrect];
    if (idx === answer?.selectedIdx) return [styles.option, styles.optionWrong];
    return [styles.option, styles.optionDim];
  };

  const letterStyle = (idx: number) => {
    if (!isAnswered) return styles.optionLetter;
    if (idx === question.correctIdx) return [styles.optionLetter, styles.optionLetterCorrect];
    if (idx === answer?.selectedIdx) return [styles.optionLetter, styles.optionLetterWrong];
    return styles.optionLetter;
  };

  // Letter glyph color flips to cream when the badge has a coloured fill, so
  // it stays legible on green/red. Default state uses the muted grey text.
  const letterTextStyle = (idx: number) => {
    if (!isAnswered) return styles.optionLetterText;
    if (idx === question.correctIdx || idx === answer?.selectedIdx) {
      return [styles.optionLetterText, styles.optionLetterTextOnFill];
    }
    return styles.optionLetterText;
  };

  const textStyle = (idx: number) => {
    if (!isAnswered) return styles.optionText;
    if (idx === question.correctIdx) return [styles.optionText, styles.optionTextCorrect];
    if (idx === answer?.selectedIdx) return [styles.optionText, styles.optionTextWrong];
    return styles.optionText;
  };

  return (
    <>
      <View style={styles.options}>
        {question.options.map((opt, idx) => (
          <Pressable
            key={opt.letter}
            style={optionStyle(idx)}
            onPress={() => {
              if (isAnswered) return;
              onAnswer({ type: 'mcq', selectedIdx: idx, isCorrect: idx === question.correctIdx });
            }}
            disabled={isAnswered}
          >
            <View style={letterStyle(idx)}>
              <Text style={letterTextStyle(idx)}>{opt.letter}</Text>
            </View>
            <Text style={textStyle(idx)} numberOfLines={3}>
              {opt.text}
            </Text>
          </Pressable>
        ))}
      </View>

      {isAnswered && (
        <View
          style={[
            styles.feedbackCard,
            answer?.isCorrect ? styles.feedbackCardCorrect : styles.feedbackCardWrong,
          ]}
        >
          <View style={styles.feedbackVerdict}>
            <Icon
              name={answer?.isCorrect ? 'Check' : 'AlertCircle'}
              size={14}
              color={answer?.isCorrect ? C.success : C.error}
              strokeWidth={2}
            />
            <Text
              style={[
                styles.feedbackVerdictText,
                { color: answer?.isCorrect ? C.success : C.error },
              ]}
            >
              {answer?.isCorrect
                ? 'Correct!'
                : `Incorrect — the answer is ${question.options[question.correctIdx].letter}`}
            </Text>
          </View>
          <Text style={styles.feedbackBody}>{question.feedback}</Text>
          <SourceChip source={question.source} />
        </View>
      )}
    </>
  );
}

// ─── Short answer body ────────────────────────────────────────────────────────

function ShortAnswerBody({
  question,
  answer,
  onAnswer,
}: {
  question: ShortQuestion;
  answer: { type: 'short'; text: string; grade: Grade } | undefined;
  onAnswer: (r: AnswerRecord) => void;
}) {
  const [inputText, setInputText] = useState('');
  const isSubmitted = !!answer;

  const submit = () => {
    if (!inputText.trim()) return;
    onAnswer({ type: 'short', text: inputText.trim(), grade: 'partial' });
  };

  const borderColor = isSubmitted
    ? answer?.grade === 'correct'
      ? C.success
      : answer?.grade === 'incorrect'
        ? C.error
        : tokens.colors.amber[500]
    : tokens.colors.forest[800];

  return (
    <>
      {isSubmitted ? (
        <View style={[styles.saAnswerDisplay, { borderColor }]}>
          <Text style={styles.saAnswerText}>{answer.text}</Text>
        </View>
      ) : (
        <TextInput
          style={[styles.saInput, { borderColor }]}
          placeholder="Write your answer…"
          placeholderTextColor={tokens.textColors.disabled}
          value={inputText}
          onChangeText={setInputText}
          multiline
          textAlignVertical="top"
        />
      )}

      {!isSubmitted && (
        <Pressable
          style={[styles.submitBtn, !inputText.trim() && styles.submitBtnDisabled]}
          onPress={submit}
          disabled={!inputText.trim()}
        >
          <Text style={styles.submitBtnLabel}>Submit answer</Text>
        </Pressable>
      )}

      {isSubmitted && (
        <View style={styles.gradingCard}>
          {/* Verdict */}
          <View style={styles.gradingHeader}>
            <View style={[styles.gradingIcon, { backgroundColor: tokens.colors.amber[500] }]}>
              <Icon name="Check" size={11} color={tokens.colors.cream[50]} strokeWidth={2.5} />
            </View>
            <Text style={[styles.gradingVerdict, { color: C.warn }]}>
              Mostly correct — partial credit
            </Text>
          </View>

          {/* Quoted answer */}
          <View style={styles.gradingQuotedWrap}>
            <Text style={styles.gradingQuoted}>"{answer.text}"</Text>
          </View>

          {/* Feedback */}
          <Text style={styles.gradingFeedback}>{question.feedback}</Text>

          {/* Model answer */}
          <Text style={styles.modelAnswerLabel}>Model answer</Text>
          <Text style={styles.modelAnswerText}>{question.modelAnswer}</Text>

          <SourceChip source={question.source} />
        </View>
      )}
    </>
  );
}

// ─── Results screen ───────────────────────────────────────────────────────────

function ResultsScreen({
  book,
  pageIndex,
  correct,
  partial,
  incorrect,
  rawScore,
  displayScore,
  total,
  pct,
  label,
  missed,
  missedCount,
  onRetryMissed,
  onRetryAll,
  onDone,
}: {
  book: Book;
  pageIndex: number;
  correct: number;
  partial: number;
  incorrect: number;
  rawScore: number;
  displayScore: number;
  total: number;
  pct: number;
  label: string;
  missed: Question[];
  missedCount: number;
  /** Primary CTA — runs JUST the missed/partial questions. */
  onRetryMissed: () => void;
  /** Secondary CTA — runs the original generated set again. */
  onRetryAll: () => void;
  onDone: () => void;
}) {
  // Quality rating state. Tapping a thumb is exclusive — a second
  // tap on the same thumb clears the rating. The current value is
  // intentionally not persisted yet (server schema is TBD); we
  // capture it locally so the icons show the user's last choice
  // while the results screen is up.
  const [quality, setQuality] = useState<'up' | 'down' | null>(null);
  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right', 'bottom']}>
      {/* Results header */}
      <View style={styles.resultsHeader}>
        <Pressable style={styles.resultsClose} onPress={onDone} hitSlop={8}>
          <Icon name="X" size={14} color={tokens.textColors.secondary} />
        </Pressable>
        <Text style={styles.resultsHeaderTitle}>Results — Page {pageIndex + 1}</Text>
        <View style={{ width: 30 }} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.resultsBody}
        showsVerticalScrollIndicator={false}
      >
        {/* Score hero */}
        <View style={styles.scoreHero}>
          <Text style={styles.scoreNumber}>
            {displayScore}{' '}
            <Text style={styles.scoreTotal}>/ {total}</Text>
          </Text>
          <Text style={styles.scoreRaw}>
            {pct}% · {rawScore} of {total} raw
          </Text>
          <View style={styles.scoreLabel}>
            <Text style={styles.scoreLabelText}>{label}</Text>
          </View>
        </View>

        {/* Breakdown */}
        <View style={styles.breakdownCard}>
          {[
            { dot: C.success, label: 'Correct', value: `${correct} × 1.0 = ${correct.toFixed(1)} pts` },
            { dot: tokens.colors.amber[500], label: 'Partial', value: `${partial} × 0.5 = ${(partial * 0.5).toFixed(1)} pts` },
            { dot: C.error, label: 'Incorrect', value: `${incorrect} × 0 = 0 pts` },
          ].map((row) => (
            <View key={row.label} style={styles.breakdownRow}>
              <View style={styles.breakdownLabelRow}>
                <View style={[styles.breakdownDot, { backgroundColor: row.dot }]} />
                <Text style={styles.breakdownLabel}>{row.label}</Text>
              </View>
              <Text style={styles.breakdownValue}>{row.value}</Text>
            </View>
          ))}
          <View style={[styles.breakdownRow, styles.breakdownRowTotal]}>
            <Text style={styles.breakdownLabelTotal}>Total</Text>
            <Text style={styles.breakdownValueTotal}>
              {rawScore} → {displayScore} / {total}
            </Text>
          </View>
        </View>

        {/* Review list */}
        {missed.length > 0 && (
          <>
            <Text style={styles.reviewLabel}>Review — missed &amp; partial</Text>
            <View style={styles.reviewList}>
              {missed.map((q) => {
                const g = q.type === 'short' ? 'partial' : 'incorrect';
                return (
                  <View key={q.id} style={styles.reviewRow}>
                    <View
                      style={[
                        styles.reviewStatus,
                        { backgroundColor: g === 'incorrect' ? C.errorBg : C.warnBg },
                      ]}
                    >
                      {g === 'incorrect' ? (
                        <Icon name="X" size={10} color={C.error} strokeWidth={2.5} />
                      ) : (
                        <Text style={[styles.reviewStatusText, { color: C.warn }]}>~</Text>
                      )}
                    </View>
                    <Text style={styles.reviewQ} numberOfLines={2}>
                      {q.text}
                    </Text>
                  </View>
                );
              })}
            </View>
          </>
        )}

        {/* Quality rating — interactive Tabler icons replace the
            non-interactive emoji that earlier builds rendered.
            Filled state on the selected thumb makes the choice
            visually unambiguous; tapping the same thumb again
            clears the rating. */}
        <View style={styles.qualityCard}>
          <Text style={styles.qualityLabel}>Were these questions useful?</Text>
          <View style={styles.qualityBtns}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Mark as useful"
              accessibilityState={{ selected: quality === 'up' }}
              hitSlop={6}
              style={[
                styles.qualityBtn,
                quality === 'up' && styles.qualityBtnActive,
              ]}
              onPress={() => setQuality((q) => (q === 'up' ? null : 'up'))}
            >
              <Icon
                name={quality === 'up' ? 'ThumbUpFilled' : 'ThumbUp'}
                size={22}
                color={
                  quality === 'up'
                    ? tokens.colors.forest[800]
                    : tokens.textColors.secondary
                }
                strokeWidth={1.75}
              />
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Mark as not useful"
              accessibilityState={{ selected: quality === 'down' }}
              hitSlop={6}
              style={[
                styles.qualityBtn,
                quality === 'down' && styles.qualityBtnActive,
              ]}
              onPress={() => setQuality((q) => (q === 'down' ? null : 'down'))}
            >
              <Icon
                name={quality === 'down' ? 'ThumbDownFilled' : 'ThumbDown'}
                size={22}
                color={
                  quality === 'down'
                    ? tokens.colors.error
                    : tokens.textColors.secondary
                }
                strokeWidth={1.75}
              />
            </Pressable>
          </View>
        </View>

        {/* CTAs.
            Primary: "Retry the N you missed" — only the missed
            subset, mounted whenever the user missed at least one.
            Secondary: "Redo all questions" — re-runs the original
            generated set. Always present so the user can repeat the
            full session even when they got everything right.
            Tertiary: "Done" — exit the practice flow.
            Order: primary → secondary → done. */}
        {missedCount > 0 && (
          <Pressable style={styles.retryBtn} onPress={onRetryMissed}>
            <Icon
              name="PlayerSkipBack"
              size={14}
              color={tokens.colors.cream[50]}
              strokeWidth={1.5}
            />
            <Text style={styles.retryBtnLabel}>
              Retry the {missedCount} you missed
            </Text>
          </Pressable>
        )}
        <Pressable style={styles.redoAllBtn} onPress={onRetryAll}>
          <Icon
            name="Refresh"
            size={14}
            color={tokens.colors.forest[800]}
            strokeWidth={1.75}
          />
          <Text style={styles.redoAllBtnLabel}>Redo all questions</Text>
        </Pressable>
        <Pressable style={styles.doneBtn} onPress={onDone}>
          <Text style={styles.doneBtnLabel}>Done</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Shared sub-components ────────────────────────────────────────────────────

function PQHeader({
  title,
  sub,
  onClose,
  right,
}: {
  title: string;
  sub: string;
  onClose: () => void;
  right: React.ReactNode;
}) {
  return (
    <View style={styles.header}>
      <Pressable style={styles.closeBtn} onPress={onClose} hitSlop={8}>
        <Icon name="X" size={12} color={tokens.textColors.secondary} strokeWidth={2} />
      </Pressable>
      <View style={styles.headerCenter}>
        <Text style={styles.headerTitle}>{title}</Text>
        {/* Truncate to one line — long book titles otherwise wrap
            to 3+ lines and push the rest of the layout down.
            Single-line + tail ellipsis keeps the header compact. */}
        <Text style={styles.headerSub} numberOfLines={1} ellipsizeMode="tail">
          {sub}
        </Text>
      </View>
      {right}
    </View>
  );
}

function ProgressDots({
  current,
  total,
  answers,
  questions,
}: {
  current: number;
  total: number;
  answers: Map<string, AnswerRecord>;
  questions: Question[];
}) {
  return (
    <View style={styles.dots}>
      {Array.from({ length: total }, (_, i) => {
        const q = questions[i];
        const g = q ? gradeFor(answers.get(q.id)) : 'unanswered';
        const isCurrent = i === current;

        let bg: string = tokens.colors.cream[200];
        if (g === 'correct') bg = C.success;
        else if (g === 'incorrect') bg = C.error;
        else if (g === 'partial') bg = tokens.colors.amber[500];
        else if (isCurrent) bg = tokens.colors.forest[800];

        return (
          <View
            key={i}
            style={[
              styles.dot,
              { backgroundColor: bg, width: isCurrent && g === 'unanswered' ? 18 : 7 },
            ]}
          />
        );
      })}
    </View>
  );
}

function SectionBlock({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <View>
      <Text style={styles.sectionLabel}>{label}</Text>
      {children}
    </View>
  );
}

type SegOpt = { value: string | number; label: string; badge?: string };

function SegGroup({
  options,
  value,
  onChange,
}: {
  options: SegOpt[];
  value: string | number;
  onChange: (v: string | number) => void;
}) {
  return (
    <View style={styles.segGroup}>
      {options.map((opt) => {
        const isActive = opt.value === value;
        return (
          <Pressable
            key={String(opt.value)}
            style={[styles.segOpt, isActive && styles.segOptActive]}
            onPress={() => onChange(opt.value)}
          >
            <Text style={[styles.segLabel, isActive && styles.segLabelActive]}>
              {opt.label}
            </Text>
            {opt.badge && (
              <Text style={styles.segBadge}>{opt.badge}</Text>
            )}
          </Pressable>
        );
      })}
    </View>
  );
}

function SourceChip({ source }: { source: string }) {
  return (
    <View style={styles.sourceChip}>
      <Icon name="Book" size={9} color={tokens.colors.forest[700]} />
      <Text style={styles.sourceChipLabel}>Source — {source}</Text>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: tokens.bgColors.canvas,
  },
  scroll: { flex: 1 },

  // Loading + error overlays
  loadingWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    gap: 10,
  },
  loadingTitle: {
    fontFamily: tokens.fonts.display,
    fontSize: 17,
    fontWeight: '500',
    color: tokens.textColors.primary,
    textAlign: 'center',
  },
  loadingBody: {
    fontFamily: tokens.fonts.ui,
    fontSize: 13,
    lineHeight: 19,
    color: tokens.textColors.muted,
    textAlign: 'center',
  },
  errorRetry: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: tokens.colors.forest[800],
    marginTop: 18,
  },
  errorRetryLabel: {
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 14,
    fontWeight: '500',
    color: tokens.colors.cream[50],
  },
  errorBack: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginTop: 4,
  },
  errorBackLabel: {
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 13,
    color: tokens.textColors.muted,
  },

  // Shared header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: 0.5,
    borderBottomColor: tokens.borderColors.subtle,
    backgroundColor: tokens.bgColors.canvas,
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
  headerCenter: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 8,
  },
  headerTitle: {
    fontFamily: tokens.fonts.display,
    fontSize: 13,
    fontWeight: '500',
    color: tokens.textColors.primary,
  },
  headerSub: {
    fontFamily: tokens.fonts.ui,
    fontSize: 10,
    color: tokens.textColors.muted,
    marginTop: 1,
  },
  skipBtn: {
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 12,
    fontWeight: '500',
    color: tokens.colors.forest[800],
  },

  // Config
  configBody: {
    padding: 18,
    gap: 18,
  },
  configFooter: {
    paddingHorizontal: 18,
    paddingBottom: 24,
    paddingTop: 8,
  },
  sectionLabel: {
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 10,
    fontWeight: '500',
    letterSpacing: 0.08,
    textTransform: 'uppercase',
    color: tokens.textColors.disabled,
    marginBottom: 8,
  },
  chapterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 14,
    backgroundColor: tokens.bgColors.surface,
    borderRadius: 10,
    borderWidth: 0.5,
    borderColor: tokens.borderColors.subtle,
  },
  chapterTitle: {
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 13,
    fontWeight: '500',
    color: tokens.textColors.primary,
    marginBottom: 2,
  },
  chapterSub: {
    fontFamily: tokens.fonts.ui,
    fontSize: 10,
    color: tokens.textColors.muted,
  },
  segGroup: {
    flexDirection: 'row',
    backgroundColor: tokens.bgColors.surface,
    borderRadius: 8,
    padding: 3,
    gap: 2,
  },
  segOpt: {
    flex: 1,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
  },
  segOptActive: {
    backgroundColor: tokens.bgColors.canvas,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
    elevation: 2,
  },
  segLabel: {
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 12,
    fontWeight: '500',
    color: tokens.textColors.muted,
  },
  segLabelActive: {
    color: tokens.textColors.primary,
  },
  segBadge: {
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 9,
    fontWeight: '500',
    color: tokens.colors.forest[800],
  },
  costRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    paddingHorizontal: 14,
    backgroundColor: tokens.colors.forest[50],
    borderRadius: 8,
    borderWidth: 0.5,
    borderColor: tokens.colors.forest[100],
  },
  costLabel: {
    fontFamily: tokens.fonts.ui,
    fontSize: 12,
    color: tokens.colors.forest[800],
  },
  costValue: {
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 12,
    fontWeight: '500',
    color: tokens.colors.forest[800],
  },
  generateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 48,
    borderRadius: 10,
    backgroundColor: tokens.colors.forest[800],
  },
  generateBtnLabel: {
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 14,
    fontWeight: '500',
    color: tokens.colors.cream[50],
  },

  // Question body
  questionBody: {
    paddingHorizontal: 18,
    paddingTop: 14,
    paddingBottom: 24,
  },

  // Progress dots
  dots: {
    flexDirection: 'row',
    gap: 5,
    justifyContent: 'center',
    marginBottom: 20,
  },
  dot: {
    height: 7,
    borderRadius: 4,
  },

  // Question text
  questionText: {
    fontFamily: tokens.fonts.reading,
    fontSize: 16,
    lineHeight: 16 * 1.65,
    color: tokens.textColors.primary,
    marginBottom: 20,
  },

  // MCQ options
  options: {
    gap: 8,
    marginBottom: 16,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: tokens.borderColors.subtle,
    backgroundColor: tokens.bgColors.canvas,
  },
  optionCorrect: {
    borderColor: C.success,
    backgroundColor: C.successBg,
  },
  optionWrong: {
    borderColor: C.error,
    backgroundColor: C.errorBg,
  },
  optionDim: {
    opacity: 0.45,
  },
  optionLetter: {
    width: 26,
    height: 26,
    borderRadius: 7,
    backgroundColor: tokens.bgColors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  optionLetterCorrect: {
    backgroundColor: C.success,
  },
  optionLetterWrong: {
    backgroundColor: C.error,
  },
  optionLetterText: {
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 12,
    fontWeight: '500',
    color: tokens.textColors.muted,
  },
  optionLetterTextOnFill: {
    color: tokens.colors.cream[50],
  },
  optionText: {
    flex: 1,
    fontFamily: tokens.fonts.ui,
    fontSize: 13,
    color: tokens.textColors.primary,
    lineHeight: 18,
  },
  optionTextCorrect: {
    color: C.success,
    fontWeight: '500',
  },
  optionTextWrong: {
    color: C.error,
  },

  // Feedback card (MCQ)
  feedbackCard: {
    borderRadius: 10,
    padding: 12,
    marginBottom: 14,
  },
  feedbackCardCorrect: {
    backgroundColor: C.successBg,
    borderWidth: 0.5,
    borderColor: C.successBorder,
  },
  feedbackCardWrong: {
    backgroundColor: C.errorBg,
    borderWidth: 0.5,
    borderColor: C.errorBorder,
  },
  feedbackVerdict: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
  },
  feedbackVerdictText: {
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 12,
    fontWeight: '500',
  },
  feedbackBody: {
    fontFamily: tokens.fonts.ui,
    fontSize: 12,
    color: tokens.textColors.secondary,
    lineHeight: 18,
    marginBottom: 8,
  },
  sourceChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
    backgroundColor: tokens.colors.forest[50],
    borderRadius: 4,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  sourceChipLabel: {
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 10,
    fontWeight: '500',
    color: tokens.colors.forest[800],
  },

  // Short answer
  saInput: {
    backgroundColor: tokens.bgColors.surface,
    borderRadius: 10,
    borderWidth: 1.5,
    padding: 12,
    fontFamily: tokens.fonts.ui,
    fontSize: 14,
    color: tokens.textColors.primary,
    lineHeight: 22,
    minHeight: 100,
    marginBottom: 14,
  },
  saAnswerDisplay: {
    backgroundColor: tokens.bgColors.canvas,
    borderRadius: 10,
    borderWidth: 1.5,
    padding: 12,
    minHeight: 60,
    marginBottom: 14,
  },
  saAnswerText: {
    fontFamily: tokens.fonts.ui,
    fontSize: 14,
    color: tokens.textColors.primary,
    lineHeight: 22,
  },
  submitBtn: {
    height: 44,
    borderRadius: 10,
    backgroundColor: tokens.colors.forest[800],
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  submitBtnDisabled: {
    opacity: 0.4,
  },
  submitBtnLabel: {
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 14,
    fontWeight: '500',
    color: tokens.colors.cream[50],
  },

  // Grading card (short answer)
  gradingCard: {
    backgroundColor: C.warnBg,
    borderRadius: 10,
    borderWidth: 0.5,
    borderColor: tokens.colors.amber[200],
    padding: 14,
    marginBottom: 14,
  },
  gradingHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    marginBottom: 8,
  },
  gradingIcon: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  gradingVerdict: {
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 12,
    fontWeight: '500',
  },
  gradingQuotedWrap: {
    borderLeftWidth: 2,
    borderLeftColor: tokens.colors.amber[500],
    paddingLeft: 8,
    marginBottom: 8,
  },
  gradingQuoted: {
    fontFamily: tokens.fonts.ui,
    fontSize: 11,
    fontStyle: 'italic',
    color: tokens.textColors.muted,
    lineHeight: 16,
  },
  gradingFeedback: {
    fontFamily: tokens.fonts.ui,
    fontSize: 12,
    color: tokens.textColors.secondary,
    lineHeight: 18,
    marginBottom: 10,
  },
  modelAnswerLabel: {
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 10,
    fontWeight: '500',
    letterSpacing: 0.06,
    textTransform: 'uppercase',
    color: tokens.textColors.disabled,
    marginBottom: 6,
  },
  modelAnswerText: {
    fontFamily: tokens.fonts.reading,
    fontSize: 13,
    color: tokens.textColors.secondary,
    lineHeight: 21,
    marginBottom: 8,
  },

  // Next button
  nextBtn: {
    height: 46,
    borderRadius: 10,
    backgroundColor: tokens.colors.forest[800],
    alignItems: 'center',
    justifyContent: 'center',
  },
  nextBtnLabel: {
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 14,
    fontWeight: '500',
    color: tokens.colors.cream[50],
  },

  // Results
  resultsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: 0.5,
    borderBottomColor: tokens.borderColors.subtle,
    backgroundColor: tokens.bgColors.canvas,
  },
  resultsClose: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: tokens.bgColors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  resultsHeaderTitle: {
    flex: 1,
    textAlign: 'center',
    fontFamily: tokens.fonts.display,
    fontSize: 14,
    fontWeight: '500',
    color: tokens.textColors.primary,
  },
  resultsBody: {
    padding: 18,
    gap: 14,
  },
  scoreHero: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  scoreNumber: {
    fontFamily: tokens.fonts.display,
    fontSize: 56,
    fontWeight: '600',
    color: tokens.textColors.primary,
    letterSpacing: -1.5,
    lineHeight: 64,
    marginBottom: 4,
  },
  scoreTotal: {
    fontFamily: tokens.fonts.display,
    fontSize: 28,
    color: tokens.colors.ink[300],
    fontWeight: '600',
  },
  scoreRaw: {
    fontFamily: tokens.fonts.ui,
    fontSize: 12,
    color: tokens.textColors.disabled,
    marginBottom: 8,
  },
  scoreLabel: {
    backgroundColor: tokens.colors.forest[50],
    borderRadius: 99,
    paddingHorizontal: 14,
    paddingVertical: 5,
  },
  scoreLabelText: {
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 13,
    fontWeight: '500',
    color: tokens.colors.forest[800],
  },
  breakdownCard: {
    backgroundColor: tokens.bgColors.surface,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 4,
  },
  breakdownRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 0.5,
    borderBottomColor: tokens.borderColors.subtle,
  },
  breakdownRowTotal: {
    borderBottomWidth: 0,
  },
  breakdownLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  breakdownDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  breakdownLabel: {
    fontFamily: tokens.fonts.ui,
    fontSize: 12,
    color: tokens.textColors.secondary,
  },
  breakdownLabelTotal: {
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 12,
    fontWeight: '500',
    color: tokens.textColors.primary,
  },
  breakdownValue: {
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 12,
    fontWeight: '500',
    color: tokens.textColors.primary,
  },
  breakdownValueTotal: {
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 12,
    fontWeight: '500',
    color: tokens.textColors.primary,
  },
  reviewLabel: {
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 10,
    fontWeight: '500',
    letterSpacing: 0.08,
    textTransform: 'uppercase',
    color: tokens.textColors.disabled,
  },
  reviewList: {
    gap: 6,
    marginTop: -6,
  },
  reviewRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    padding: 10,
    paddingHorizontal: 12,
    backgroundColor: tokens.bgColors.surface,
    borderRadius: 9,
    borderWidth: 0.5,
    borderColor: tokens.borderColors.subtle,
  },
  reviewStatus: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    marginTop: 1,
  },
  reviewStatusText: {
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 14,
  },
  reviewQ: {
    flex: 1,
    fontFamily: tokens.fonts.ui,
    fontSize: 12,
    color: tokens.textColors.secondary,
    lineHeight: 17,
  },
  qualityCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: tokens.bgColors.surface,
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  qualityLabel: {
    fontFamily: tokens.fonts.ui,
    fontSize: 12,
    color: tokens.textColors.secondary,
  },
  qualityBtns: {
    flexDirection: 'row',
    gap: 6,
  },
  qualityBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: tokens.bgColors.canvas,
    borderWidth: 0.5,
    borderColor: tokens.borderColors.subtle,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qualityBtnActive: {
    backgroundColor: tokens.bgColors.surface,
    borderColor: tokens.borderColors.default,
  },
  retryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 48,
    borderRadius: 10,
    backgroundColor: tokens.colors.forest[800],
  },
  retryBtnLabel: {
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 14,
    fontWeight: '500',
    color: tokens.colors.cream[50],
  },
  redoAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 44,
    marginTop: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: tokens.colors.forest[800],
    backgroundColor: 'transparent',
  },
  redoAllBtnLabel: {
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 13,
    fontWeight: '500',
    color: tokens.colors.forest[800],
  },
  doneBtn: {
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  doneBtnLabel: {
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 13,
    fontWeight: '500',
    color: tokens.textColors.muted,
  },
});

// ─── Page picker styles ───────────────────────────────────────────────────────

const pickerStyles = StyleSheet.create({
  list: {
    // Cap the inner scroller so books with hundreds of pages don't push
    // the bottom sheet to fullscreen. enableDynamicSizing on the sheet
    // honours this height.
    maxHeight: 360,
  },
  listContent: {
    paddingBottom: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 44,
    paddingHorizontal: 16,
    borderRadius: 10,
    gap: 10,
  },
  rowSelected: {
    backgroundColor: tokens.colors.forest[800],
  },
  rowLabel: {
    flex: 1,
    fontFamily: tokens.fonts.ui,
    fontSize: 14,
    color: tokens.textColors.primary,
  },
  rowLabelSelected: {
    color: tokens.colors.cream[50],
    fontFamily: tokens.fonts.uiMedium,
    fontWeight: '500',
  },
  currentBadge: {
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 10,
    fontWeight: '500',
    letterSpacing: 0.06,
    textTransform: 'uppercase',
    color: tokens.colors.forest[800],
    backgroundColor: tokens.colors.forest[50],
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  currentBadgeOnSelected: {
    color: tokens.colors.cream[50],
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
  },
});
