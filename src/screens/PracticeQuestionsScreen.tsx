import { useCallback, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Icon, Text } from '~/components';
import { tokens } from '~/design/tokens';
import type { Book } from '~/types/book';

// ─── Semantic colors not in token set ─────────────────────────────────────────

const C = {
  success: '#2D7A4F',
  successBg: '#E8F4ED',
  successBorder: '#B7CCB9',
  error: '#B5453A',
  errorBg: '#FBEAE7',
  errorBorder: '#EFC9C6',
  warn: '#A0692A',
  warnBg: '#FDF3E3',
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
type Grade = 'correct' | 'partial' | 'incorrect';

type AnswerRecord =
  | { type: 'mcq'; selectedIdx: number; isCorrect: boolean }
  | { type: 'short'; text: string; grade: Grade };

type QuizCount = 5 | 10 | 15;
type QuizType = 'mixed' | 'mcq' | 'short';
type QuizOrder = 'sequential' | 'random';

type QuizConfig = { count: QuizCount; qType: QuizType; order: QuizOrder };

// ─── Mock questions ───────────────────────────────────────────────────────────

const QUESTIONS: Question[] = [
  {
    id: '1', type: 'mcq',
    text: "What does Gatsby show Nick as proof of his time at Oxford?",
    options: [
      { letter: 'A', text: 'A letter from a military general' },
      { letter: 'B', text: 'A cricket photograph and a medal from Montenegro' },
      { letter: 'C', text: 'A diploma certificate from 1919' },
      { letter: 'D', text: 'A newspaper clipping about his war record' },
    ],
    correctIdx: 1,
    feedback: "Gatsby produces a photograph of himself with Oxford cricket players and a medal 'comme souvenir de Montenegro' — his two pieces of proof.",
    source: 'p. 44',
  },
  {
    id: '2', type: 'short',
    text: "How does Nick describe Gatsby's car, and what does it suggest about Gatsby's character?",
    modelAnswer: "Nick calls it a 'death car' — cream colored, monstrous, laden with multi-colored hatboxes. Its ostentatious excess signals that Gatsby performs wealth rather than simply inhabiting it.",
    feedback: "Good start. A complete answer also notes the ominous foreshadowing in Nick calling it a 'death car' — a detail Fitzgerald plants deliberately.",
    source: 'p. 45',
  },
  {
    id: '3', type: 'mcq',
    text: "Who does Gatsby say fixed the 1919 World Series during Nick's lunch?",
    options: [
      { letter: 'A', text: 'Tom Buchanan' },
      { letter: 'B', text: 'Meyer Wolfsheim' },
      { letter: 'C', text: 'Dan Cody' },
      { letter: 'D', text: 'Chester Becker' },
    ],
    correctIdx: 1,
    feedback: "Meyer Wolfsheim is Gatsby's shady associate introduced over lunch. His claim about fixing the World Series hints at the criminal foundations beneath Gatsby's wealth.",
    source: 'p. 48',
  },
  {
    id: '4', type: 'mcq',
    text: "What university does Gatsby claim to have attended?",
    options: [
      { letter: 'A', text: 'Yale' },
      { letter: 'B', text: 'Cambridge' },
      { letter: 'C', text: 'Oxford' },
      { letter: 'D', text: 'Princeton' },
    ],
    correctIdx: 2,
    feedback: "Gatsby tells Nick he was educated at Oxford — 'It was a family tradition.' Nick is skeptical, but Gatsby produces a photograph as proof.",
    source: 'p. 44',
  },
  {
    id: '5', type: 'mcq',
    text: "Who tells Nick about Gatsby and Daisy's past romance?",
    options: [
      { letter: 'A', text: 'Tom Buchanan' },
      { letter: 'B', text: 'Daisy herself' },
      { letter: 'C', text: 'Jordan Baker' },
      { letter: 'D', text: 'Meyer Wolfsheim' },
    ],
    correctIdx: 2,
    feedback: "Jordan Baker reveals to Nick the backstory of Gatsby and Daisy's Louisville romance — she held the full story as a witness.",
    source: 'p. 52',
  },
  {
    id: '6', type: 'mcq',
    text: "What did Daisy do the night before her wedding when she received Gatsby's letter?",
    options: [
      { letter: 'A', text: 'She called off the wedding immediately' },
      { letter: 'B', text: 'She ignored it and burned it' },
      { letter: 'C', text: 'She was found drunk clutching the letter, then married Tom as planned' },
      { letter: 'D', text: 'She sent a reply asking to meet Gatsby' },
    ],
    correctIdx: 2,
    feedback: "Jordan tells Nick that Daisy was found drunk and sobbing, clutching Gatsby's letter — but by the next day she had 'changed her mind' and married Tom.",
    source: 'p. 54',
  },
  {
    id: '7', type: 'short',
    text: "Why did Gatsby buy his house in West Egg?",
    modelAnswer: "Gatsby bought the West Egg mansion specifically to be across the bay from Daisy's East Egg home, able to see her green dock light — a deliberate act of longing and proximity after years apart.",
    feedback: "Good — you identified the core reason. For full marks, include that Gatsby could see Daisy's green light from his dock, which Fitzgerald uses as a symbol of his longing.",
    source: 'p. 57',
  },
  {
    id: '8', type: 'mcq',
    text: "Where is Daisy's house located relative to Gatsby's mansion?",
    options: [
      { letter: 'A', text: 'Just down the street in West Egg' },
      { letter: 'B', text: 'Across the bay in East Egg' },
      { letter: 'C', text: 'In New York City' },
      { letter: 'D', text: 'Louisville, Kentucky' },
    ],
    correctIdx: 1,
    feedback: "Daisy lives in East Egg, directly across the bay from Gatsby's West Egg mansion. He can see the green light at the end of her dock at night.",
    source: 'p. 57',
  },
  {
    id: '9', type: 'short',
    text: "What does the long list of party guests reveal about Gatsby's social world?",
    modelAnswer: "The parade of names — with odd occupations and scattered misfortunes — shows that Gatsby's guests use him without knowing him. His parties attract strangers who accept his hospitality while remaining ignorant of who he truly is, underscoring his deep isolation.",
    feedback: "Good start. A strong answer also notes the irony that so many attend his parties while nobody truly knows him — the list highlights his anonymity amid spectacle.",
    source: 'p. 42',
  },
  {
    id: '10', type: 'mcq',
    text: "Which country awarded Gatsby a military medal that he shows Nick?",
    options: [
      { letter: 'A', text: 'France' },
      { letter: 'B', text: 'Britain' },
      { letter: 'C', text: 'Montenegro' },
      { letter: 'D', text: 'Italy' },
    ],
    correctIdx: 2,
    feedback: "Gatsby shows Nick a medal from 'the little Montenegro' for his service in the war — one of his props for the curated story of his life.",
    source: 'p. 44',
  },
];

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
};

export function PracticeQuestionsScreen({ book, onBack }: PracticeQuestionsScreenProps) {
  const [phase, setPhase] = useState<'config' | 'quiz' | 'results'>('config');
  const [config, setConfig] = useState<QuizConfig>({ count: 10, qType: 'mixed', order: 'sequential' });
  const [activeQuestions, setActiveQuestions] = useState<Question[]>([]);
  const [questionIdx, setQuestionIdx] = useState(0);
  const [answers, setAnswers] = useState<Map<string, AnswerRecord>>(new Map());

  const startQuiz = useCallback(() => {
    let qs = [...QUESTIONS];
    if (config.qType === 'mcq') qs = qs.filter((q) => q.type === 'mcq');
    if (config.qType === 'short') qs = qs.filter((q) => q.type === 'short');
    if (config.order === 'random') qs = [...qs].sort(() => Math.random() - 0.5);
    qs = qs.slice(0, config.count);
    setActiveQuestions(qs);
    setAnswers(new Map());
    setQuestionIdx(0);
    setPhase('quiz');
  }, [config]);

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

  const retry = useCallback(() => {
    setAnswers(new Map());
    setQuestionIdx(0);
    setPhase('quiz');
  }, []);

  if (phase === 'config') {
    return (
      <ConfigScreen
        book={book}
        config={config}
        onConfig={setConfig}
        onGenerate={startQuiz}
        onClose={onBack}
      />
    );
  }

  if (phase === 'quiz') {
    const question = activeQuestions[questionIdx];
    return (
      <QuestionScreen
        key={question.id}
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
      onRetry={retry}
      onDone={onBack}
    />
  );
}

// ─── Config screen ────────────────────────────────────────────────────────────

const COST_MAP: Record<QuizCount, string> = { 5: '~1.5K', 10: '~3K', 15: '~4.5K' };

function ConfigScreen({
  book,
  config,
  onConfig,
  onGenerate,
  onClose,
}: {
  book: Book;
  config: QuizConfig;
  onConfig: React.Dispatch<React.SetStateAction<QuizConfig>>;
  onGenerate: () => void;
  onClose: () => void;
}) {
  const chNum = book.currentChapter?.match(/\d+/)?.[0] ?? '1';

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
        {/* Chapter */}
        <SectionBlock label="Chapter">
          <Pressable style={styles.chapterRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.chapterTitle}>
                Chapter {chNum} — Current chapter
              </Text>
              <Text style={styles.chapterSub}>Tap to change</Text>
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
    </SafeAreaView>
  );
}

// ─── Question screen (MCQ + short answer) ─────────────────────────────────────

function QuestionScreen({
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
        sub={`Ch. ${activeQuestions[0] ? '' : ''}The Great Gatsby`}
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
              <Text style={styles.optionLetterText}>{opt.letter}</Text>
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
  onRetry,
  onDone,
}: {
  book: Book;
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
  onRetry: () => void;
  onDone: () => void;
}) {
  const chNum = book.currentChapter?.match(/\d+/)?.[0] ?? '1';

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right', 'bottom']}>
      {/* Results header */}
      <View style={styles.resultsHeader}>
        <Pressable style={styles.resultsClose} onPress={onDone} hitSlop={8}>
          <Icon name="X" size={14} color={tokens.textColors.secondary} />
        </Pressable>
        <Text style={styles.resultsHeaderTitle}>Results — Ch. {chNum}</Text>
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

        {/* Quality rating */}
        <View style={styles.qualityCard}>
          <Text style={styles.qualityLabel}>Were these questions useful?</Text>
          <View style={styles.qualityBtns}>
            <Pressable style={styles.qualityBtn}>
              <Text>👍</Text>
            </Pressable>
            <Pressable style={styles.qualityBtn}>
              <Text>👎</Text>
            </Pressable>
          </View>
        </View>

        {/* CTAs */}
        {missedCount > 0 && (
          <Pressable style={styles.retryBtn} onPress={onRetry}>
            <Icon name="PlayerSkipBack" size={14} color={tokens.colors.cream[50]} strokeWidth={1.5} />
            <Text style={styles.retryBtnLabel}>
              Retry the {missedCount} you missed
            </Text>
          </Pressable>
        )}
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
        <Text style={styles.headerSub}>{sub}</Text>
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
    height: 32,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 2,
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
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: tokens.bgColors.canvas,
    borderWidth: 0.5,
    borderColor: tokens.borderColors.subtle,
    alignItems: 'center',
    justifyContent: 'center',
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
