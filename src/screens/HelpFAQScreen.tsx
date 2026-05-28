/**
 * HelpFAQScreen — searchable help center with grouped FAQs and contact card.
 *
 * Per /docs/specs/b5_01_you_tab_system_flows.html. Three sections:
 * Getting started, AI features, and Account & billing. Rows expand inline
 * with a chevron rotation. Bottom card surfaces the support email.
 */

import { useCallback, useMemo, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Icon, Text } from '~/components';
import { tokens } from '~/design/tokens';
import { useBackHandler } from '~/lib/useBackHandler';

type FAQ = { id: string; q: string; a: string };
type FAQSection = { id: string; title: string; faqs: FAQ[] };

const SECTIONS: FAQSection[] = [
  {
    id: 'start',
    title: 'Getting started',
    faqs: [
      {
        id: 's1',
        q: 'How do I add a book?',
        a: 'Tap the + button on the Library tab. You have three options: pick a free classic from our built-in catalog, paste a download link from sites like Project Gutenberg or Standard Ebooks, or upload an EPUB or PDF from your device.',
      },
      {
        id: 's2',
        q: 'What file types are supported?',
        a: 'EPUB and PDF. EPUBs look best — text reflows to your screen and font size — while PDFs render exactly as in the original file. Both work with highlights, the dictionary, and every AI tool.',
      },
      {
        id: 's3',
        q: 'How big can my upload be?',
        a: 'Up to 50 MB per book. That covers almost every novel and most reference books. If you hit the limit on a large textbook, try splitting it or email us — we\'ll help.',
      },
      {
        id: 's4',
        q: 'Why is my book stuck on "Processing"?',
        a: 'We extract and prepare the text in the background. Most books are ready in 10–60 seconds; PDFs with lots of images take longer. If a book hasn\'t finished after 5 minutes, long-press it in your library and tap "Re-process". Still stuck? Email support@getbookflow.co.',
      },
      {
        id: 's5',
        q: 'Can I read offline?',
        a: 'Yes — once a book is open, it caches locally so you can keep reading on a plane or with no signal. AI tools and audio narration both need a connection because they\'re generated on the fly.',
      },
    ],
  },
  {
    id: 'read',
    title: 'Reading',
    faqs: [
      {
        id: 'r1',
        q: 'How do I change the font, size, or theme?',
        a: 'While reading, tap once to show the toolbar, then tap "Reading options" at the bottom. You can pick a typeface, adjust font size, switch between light, sepia, and dark themes, and toggle the auto-hiding controls.',
      },
      {
        id: 'r2',
        q: 'How do I look up a word?',
        a: 'Tap any word once. A definition pops up. Tap "Save" to add it to your vocabulary list so you can review it later.',
      },
      {
        id: 'r3',
        q: 'How do I save a highlight?',
        a: 'Long-press a sentence. An action sheet appears — tap "Highlight" to save it. All your highlights for a book live in the Highlights screen, reachable from the bottom toolbar in the reader.',
      },
      {
        id: 'r4',
        q: 'What\'s the difference between Text mode and Full mode?',
        a: 'Text mode renders the book in our typography so you can tap words, save highlights, and use AI tools on the page. Full mode shows the publisher\'s original layout with images and styling — useful for poetry, illustrated books, or anything where the original design matters. Toggle between them with the Aa / Full pill at the top of the reader.',
      },
      {
        id: 'r5',
        q: 'Can I search inside a book?',
        a: 'Yes. In the reader\'s bottom toolbar, tap "Search". Type a phrase and you\'ll see every page that matches, with a snippet of context. Tap a result to jump there.',
      },
    ],
  },
  {
    id: 'listen',
    title: 'Listening',
    faqs: [
      {
        id: 'l1',
        q: 'How do I start listening to a book?',
        a: 'Open any book and tap the Listen button in the bottom toolbar. Or from your library, tap the headphones icon on a book row. We narrate the page using AI text-to-speech.',
      },
      {
        id: 'l2',
        q: 'Can I change the voice?',
        a: 'Yes. While listening, tap the microphone icon to open the voice picker. Free tier includes a default voice; Pro unlocks the full set, including more natural-sounding voices.',
      },
      {
        id: 'l3',
        q: 'Does audio keep playing when the screen is off?',
        a: 'Yes. Lock your device or switch apps — narration continues. A media notification appears on your lock screen so you can pause, play, or skip pages without opening the app.',
      },
      {
        id: 'l4',
        q: 'How do I set a sleep timer?',
        a: 'In the Listen screen, tap the moon icon. Pick a duration in minutes, or "End of page" to pause once the current page finishes reading. The timer cancels playback automatically when it runs out.',
      },
      {
        id: 'l5',
        q: 'What is bimodal mode?',
        a: 'Bimodal mode reads aloud while highlighting the matching text on screen — great for language learning, focus, or following along with complex passages. Tap any highlighted word to look it up or save it.',
      },
    ],
  },
  {
    id: 'ai',
    title: 'AI features',
    faqs: [
      {
        id: 'a1',
        q: 'What can the AI do for me?',
        a: 'Four tools, all scoped to the book you\'re reading: Summary (chapter or whole-book), Ask about the book (chat with the book as context), Practice questions (quiz yourself on what you\'ve read), and Translate (any page into a dozen languages).',
      },
      {
        id: 'a2',
        q: 'Why did the AI refuse my question?',
        a: 'Chat is scoped to the book you\'re reading, so general questions (like asking about a different book, or a fact unrelated to the current one) get a gentle redirect with on-topic suggestions. This keeps responses grounded in the actual text instead of making things up.',
      },
      {
        id: 'a3',
        q: 'Are summaries spoiler-free?',
        a: 'Chapter summaries only cover what you\'ve read up to. Whole-book summaries do reveal the ending — we show a warning before generating one so you can choose.',
      },
      {
        id: 'a4',
        q: 'What languages can I translate to?',
        a: 'Twi, Spanish, French, German, Italian, Portuguese, Japanese, Mandarin, Korean, Arabic, Swahili, and Yoruba. Translations are cached per page + language, so flipping back to a language you\'ve already used is instant.',
      },
      {
        id: 'a5',
        q: 'Can the AI be wrong?',
        a: 'Yes. AI models occasionally misinterpret or hallucinate. We ground responses in the book\'s actual text and cite the pages we used where possible, but for anything important — facts you\'d quote in an essay, instructions you\'d act on — double-check against the original passage.',
      },
      {
        id: 'a6',
        q: 'What are AI credits?',
        a: 'Credits power summaries, chat, practice, and translation. Each plan includes a monthly allowance that resets on your billing date. The current usage shows in You → Account & subscription.',
      },
    ],
  },
  {
    id: 'acct',
    title: 'Account & billing',
    faqs: [
      {
        id: 'b1',
        q: 'How do I change plans?',
        a: 'Go to You → Account & subscription → Manage plan. Changes take effect at your next billing cycle.',
      },
      {
        id: 'b2',
        q: 'Can I get a student discount?',
        a: 'Yes. Tap "Verify student" on the paywall to confirm your status, and you\'ll get a discounted rate for a year. We re-verify annually.',
      },
      {
        id: 'b3',
        q: 'How do I cancel my subscription?',
        a: 'Because billing is handled by Apple App Store and Google Play, you cancel through your platform: App Store → Apple ID → Subscriptions on iOS, or Play Store → Profile → Payments & subscriptions on Android. Your Pro access continues until the end of the current billing period.',
      },
      {
        id: 'b4',
        q: 'How do I delete my account?',
        a: 'You → Account & subscription → Delete account. This permanently removes your profile, books, highlights, and reading history within 30 days. The action is irreversible — back up anything you want to keep first.',
      },
      {
        id: 'b5',
        q: 'Will I lose my books if I cancel Pro?',
        a: 'No. Your library, highlights, and notes stay with you on the free tier. Some Pro-only features (premium voices, higher AI usage limits) become unavailable, but your reading itself continues uninterrupted.',
      },
    ],
  },
  {
    id: 'privacy',
    title: 'Privacy & support',
    faqs: [
      {
        id: 'p1',
        q: 'What data do you collect?',
        a: 'Your account email, your library, highlights, notes, and basic usage analytics (which features you use, anonymised). We don\'t share data with advertisers and we never sell it. Full details are in our Privacy Policy at getbookflow.co/privacy.',
      },
      {
        id: 'p2',
        q: 'Who can see what I read?',
        a: 'Only you. We don\'t share your library, highlights, or reading history with friends, ad networks, publishers, or anyone else. The AI tools send the relevant book text to Anthropic to generate responses, but those requests aren\'t used to train models.',
      },
      {
        id: 'p3',
        q: 'My magic-link sign-in email never arrived — what do I do?',
        a: 'First, check your Spam folder — new sender domains often land there on the first email. If you find it, mark it as "Not spam" so future emails go straight to your inbox. Still nothing after 5 minutes? Try requesting another link. If that fails too, email support@getbookflow.co with the address you\'re trying to sign in with.',
      },
      {
        id: 'p4',
        q: 'How do I report a bug or request a feature?',
        a: 'Go to You → Send feedback. The screen shows our support address — tap to copy it, then send us anything: bug reports, feature requests, or just a hello. We read every message and reply within a couple of days.',
      },
    ],
  },
];

export type HelpFAQScreenProps = {
  onBack: () => void;
  onContactSupport?: () => void;
  supportEmail?: string;
};

export function HelpFAQScreen({
  onBack,
  onContactSupport,
  supportEmail = 'support@getbookflow.co',
}: HelpFAQScreenProps) {
  // Route Android hardware-back to the in-screen back affordance so
  // pressing back doesn't skip past this screen and exit the app.
  useBackHandler(() => {
    onBack();
    return true;
  });
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  // Footer "support email" button: tapping it copies the address to
  // the clipboard so the user can paste it into Gmail / Outlook /
  // web mail without needing a native mail app registered. Same
  // pattern as the Send feedback screen so the affordance reads
  // consistently across the app.
  const [emailCopied, setEmailCopied] = useState(false);
  const handleContactPress = useCallback(async () => {
    // Honour the legacy `onContactSupport` prop if the parent wired
    // one (e.g. some future flow that opens a structured help form);
    // otherwise default to the copy-to-clipboard affordance.
    if (onContactSupport) {
      onContactSupport();
      return;
    }
    try {
      await Clipboard.setStringAsync(supportEmail);
      setEmailCopied(true);
      setTimeout(() => setEmailCopied(false), 1800);
    } catch {
      // Clipboard set is essentially infallible on modern Android /
      // iOS; if it ever fails the user can long-press the visible
      // address to select + copy manually.
    }
  }, [onContactSupport, supportEmail]);

  const filtered = useMemo(() => {
    if (!query.trim()) return SECTIONS;
    const q = query.trim().toLowerCase();
    return SECTIONS.map((s) => ({
      ...s,
      faqs: s.faqs.filter(
        (f) => f.q.toLowerCase().includes(q) || f.a.toLowerCase().includes(q),
      ),
    })).filter((s) => s.faqs.length > 0);
  }, [query]);

  const toggle = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={onBack} hitSlop={8} style={styles.backBtn} accessibilityLabel="Back">
          <Icon name="ArrowLeft" size={18} color={tokens.textColors.primary} strokeWidth={1.75} />
        </Pressable>
        <Text style={styles.headerTitle}>Help & FAQ</Text>
        <View style={styles.backBtn} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Search */}
        <View style={styles.searchWrap}>
          <Icon name="Search" size={14} color={tokens.textColors.muted} strokeWidth={1.5} />
          <TextInput
            style={styles.searchField}
            value={query}
            onChangeText={setQuery}
            placeholder="Search help articles…"
            placeholderTextColor={tokens.textColors.disabled}
            returnKeyType="search"
          />
          {query.length > 0 && (
            <Pressable
              onPress={() => setQuery('')}
              hitSlop={8}
              accessibilityLabel="Clear"
            >
              <Icon name="X" size={12} color={tokens.textColors.muted} strokeWidth={2} />
            </Pressable>
          )}
        </View>

        {/* Sections */}
        {filtered.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyText}>
              No articles match "{query}". Try a different search or contact us
              below.
            </Text>
          </View>
        ) : (
          filtered.map((section) => (
            <View key={section.id} style={styles.section}>
              <Text style={styles.sectionLabel}>{section.title}</Text>
              <View style={styles.sectionGroup}>
                {section.faqs.map((faq, idx) => {
                  const open = expanded.has(faq.id);
                  return (
                    <View key={faq.id}>
                      {idx > 0 && <View style={styles.divider} />}
                      <Pressable
                        onPress={() => toggle(faq.id)}
                        style={styles.row}
                        accessibilityRole="button"
                        accessibilityState={{ expanded: open }}
                      >
                        <Text style={styles.rowQ}>{faq.q}</Text>
                        <View style={[styles.chev, open && styles.chevOpen]}>
                          <Icon
                            name="ChevronDown"
                            size={14}
                            color={tokens.textColors.muted}
                            strokeWidth={1.75}
                          />
                        </View>
                      </Pressable>
                      {open && (
                        <View style={styles.answerWrap}>
                          <Text style={styles.answer}>{faq.a}</Text>
                        </View>
                      )}
                    </View>
                  );
                })}
              </View>
            </View>
          ))
        )}

        {/* Contact card */}
        <View style={styles.contactCard}>
          <View style={styles.contactIcon}>
            <Icon name="MessageCircle" size={18} color={tokens.colors.forest[800]} strokeWidth={1.5} />
          </View>
          <Text style={styles.contactTitle}>Still need help?</Text>
          <Text style={styles.contactBody}>
            Email our support team — we usually respond within a day.
          </Text>
          <Pressable
            onPress={handleContactPress}
            style={({ pressed }) => [styles.contactBtn, pressed && { opacity: 0.85 }]}
            accessibilityRole="button"
            accessibilityLabel={
              emailCopied
                ? `${supportEmail} copied to clipboard`
                : `Copy ${supportEmail} to clipboard`
            }
          >
            <Icon
              name={emailCopied ? 'Check' : 'Mail'}
              size={13}
              color={tokens.colors.cream[50]}
              strokeWidth={1.75}
            />
            <Text style={styles.contactBtnLabel}>
              {emailCopied ? 'Copied — paste into your mail app' : supportEmail}
            </Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: tokens.bgColors.canvas },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 0.5,
    borderBottomColor: tokens.borderColors.subtle,
  },
  backBtn: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontFamily: tokens.fonts.display,
    fontSize: 16,
    fontWeight: '500',
    color: tokens.textColors.primary,
  },

  scroll: { flex: 1 },
  scrollContent: { paddingBottom: 32 },

  // Search
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 18,
    marginTop: 14,
    marginBottom: 18,
    height: 38,
    paddingHorizontal: 12,
    backgroundColor: tokens.bgColors.surface,
    borderRadius: 9,
    borderWidth: 0.5,
    borderColor: tokens.borderColors.subtle,
  },
  searchField: {
    flex: 1,
    fontFamily: tokens.fonts.ui,
    fontSize: 13,
    color: tokens.textColors.primary,
    padding: 0,
  },

  // Section
  section: { marginBottom: 18 },
  sectionLabel: {
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 11,
    fontWeight: '500',
    letterSpacing: 0.06,
    textTransform: 'uppercase',
    color: tokens.textColors.subtle,
    paddingHorizontal: 18,
    marginBottom: 8,
  },
  sectionGroup: {
    marginHorizontal: 18,
    backgroundColor: tokens.bgColors.canvas,
    borderRadius: 12,
    borderWidth: 0.5,
    borderColor: tokens.borderColors.subtle,
    overflow: 'hidden',
  },
  divider: {
    height: 0.5,
    backgroundColor: tokens.borderColors.subtle,
    marginLeft: 16,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  rowQ: {
    flex: 1,
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 13,
    fontWeight: '500',
    color: tokens.textColors.primary,
  },
  chev: {
    width: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chevOpen: {
    transform: [{ rotate: '180deg' }],
  },
  answerWrap: {
    paddingHorizontal: 16,
    paddingBottom: 14,
    paddingTop: 0,
    marginTop: -4,
  },
  answer: {
    fontFamily: tokens.fonts.ui,
    fontSize: 12,
    lineHeight: 18,
    color: tokens.textColors.secondary,
  },

  // Empty
  empty: {
    marginHorizontal: 18,
    paddingVertical: 28,
    alignItems: 'center',
  },
  emptyText: {
    fontFamily: tokens.fonts.ui,
    fontSize: 13,
    color: tokens.textColors.muted,
    textAlign: 'center',
    maxWidth: 280,
  },

  // Contact card
  contactCard: {
    marginHorizontal: 18,
    marginTop: 8,
    padding: 18,
    borderRadius: 14,
    backgroundColor: tokens.colors.forest[50],
    alignItems: 'center',
  },
  contactIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: tokens.bgColors.canvas,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  contactTitle: {
    fontFamily: tokens.fonts.display,
    fontSize: 15,
    fontWeight: '500',
    color: tokens.textColors.primary,
    marginBottom: 4,
  },
  contactBody: {
    fontFamily: tokens.fonts.ui,
    fontSize: 12,
    color: tokens.colors.forest[800],
    textAlign: 'center',
    marginBottom: 14,
    maxWidth: 260,
    lineHeight: 17,
  },
  contactBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 36,
    paddingHorizontal: 14,
    borderRadius: 9,
    backgroundColor: tokens.colors.forest[800],
  },
  contactBtnLabel: {
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 12,
    fontWeight: '500',
    color: tokens.colors.cream[50],
  },
});
