import { forwardRef, useCallback, useImperativeHandle, useRef, useState } from 'react';
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
import {
  BottomSheetBackdrop,
  type BottomSheetBackdropProps,
  BottomSheetModal,
  BottomSheetView,
} from '@gorhom/bottom-sheet';
import { Icon, Text } from '~/components';
import { tokens } from '~/design/tokens';
import type { Book } from '~/types/book';
import type { BottomSheetRef } from '~/components/BottomSheet';

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
  role: 'ai' | 'user';
  text: string;
  sources?: string[];
};

const INITIAL_MESSAGES: ChatMessage[] = [
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

      {/* Length toggle */}
      <View style={sumStyles.toggle}>
        {(['tldr', 'standard', 'detailed'] as SummaryLength[]).map((opt) => (
          <Pressable
            key={opt}
            style={[sumStyles.toggleOpt, length === opt && sumStyles.toggleOptActive]}
            onPress={() => setLength(opt)}
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

      {/* Scrollable body */}
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
        <View style={sumStyles.qualityRow}>
          <Text style={sumStyles.qualityLabel}>Was this summary helpful?</Text>
          <View style={sumStyles.qualityBtns}>
            <Pressable style={sumStyles.qualityBtn} onPress={() => {}}>
              <Text style={sumStyles.qualityEmoji}>👍</Text>
            </Pressable>
            <Pressable style={sumStyles.qualityBtn} onPress={() => {}}>
              <Text style={sumStyles.qualityEmoji}>👎</Text>
            </Pressable>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Chat Screen ──────────────────────────────────────────────────────────────

export function ChatScreen({
  book,
  onBack,
}: {
  book: Book;
  onBack: () => void;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>(INITIAL_MESSAGES);
  const [inputText, setInputText] = useState('');
  const scrollRef = useRef<ScrollView>(null);
  const hasUserMessage = messages.some((m) => m.role === 'user');

  const sendMessage = useCallback(() => {
    const text = inputText.trim();
    if (!text) return;
    const userMsg: ChatMessage = { id: String(Date.now()), role: 'user', text };
    const aiMsg: ChatMessage = {
      id: String(Date.now() + 1),
      role: 'ai',
      text: "I'm looking through the text for you — this is a mock response. In the real app, every answer is grounded in the book's content with cited pages.",
    };
    setMessages((prev) => [...prev, userMsg, aiMsg]);
    setInputText('');
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
  }, [inputText]);

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

      {/* Scope banner */}
      <View style={chatStyles.scopeBanner}>
        <Icon name="Info" size={14} color={tokens.colors.forest[700]} />
        <Text style={chatStyles.scopeText}>
          Answers come only from{' '}
          <Text style={chatStyles.scopeBookTitle}>{book.title}</Text>. I'll cite
          the pages I pull from.
        </Text>
      </View>

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
            <ChatBubble key={msg.id} message={msg} />
          ))}
        </ScrollView>

        {/* Starter questions */}
        {!hasUserMessage && (
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
            style={chatStyles.inputField}
            placeholder="Ask anything about the book…"
            placeholderTextColor={tokens.textColors.disabled}
            value={inputText}
            onChangeText={setInputText}
            multiline
            maxLength={500}
            returnKeyType="send"
            onSubmitEditing={sendMessage}
          />
          <Pressable
            style={[
              chatStyles.sendBtn,
              !inputText.trim() && chatStyles.sendBtnDisabled,
            ]}
            onPress={sendMessage}
            disabled={!inputText.trim()}
          >
            <Icon
              name="ArrowRight"
              size={16}
              color={
                inputText.trim()
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

// ─── Chat bubble ──────────────────────────────────────────────────────────────

function ChatBubble({ message }: { message: ChatMessage }) {
  const isAI = message.role === 'ai';
  const [thumbed, setThumbed] = useState<'up' | 'down' | null>(null);

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
});
