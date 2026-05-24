/**
 * HelpFAQScreen — searchable help center with grouped FAQs and contact card.
 *
 * Per /docs/specs/b5_01_you_tab_system_flows.html. Three sections:
 * Getting started, AI features, and Account & billing. Rows expand inline
 * with a chevron rotation. Bottom card surfaces the support email.
 */

import { useMemo, useState } from 'react';
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
        a: 'Tap the + button on the Library tab. You can paste a link, upload an EPUB, or pick from our catalog.',
      },
      {
        id: 's2',
        q: 'Can I read offline?',
        a: 'Yes — once a book is opened, it caches locally. AI features need a connection, but reading and listening work offline.',
      },
      {
        id: 's3',
        q: 'How does bimodal mode work?',
        a: 'Bimodal mode reads aloud while highlighting the same text on screen. Tap any word to translate or save it.',
      },
    ],
  },
  {
    id: 'ai',
    title: 'AI features',
    faqs: [
      {
        id: 'a1',
        q: 'What are AI credits?',
        a: 'Credits power summaries, Q&A, and translation. Each plan includes a monthly allowance that resets on your billing date.',
      },
      {
        id: 'a2',
        q: 'Why did the AI refuse my question?',
        a: 'Q&A is scoped to the book you\'re reading. Off-topic questions get a gentle redirect with on-topic suggestions.',
      },
      {
        id: 'a3',
        q: 'Are summaries spoiler-free?',
        a: 'Chapter summaries cover only what you\'ve read. Full-book summaries reveal the ending — we\'ll warn you first.',
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
        a: 'You → Account & subscription → Manage plan. Changes take effect at your next billing cycle.',
      },
      {
        id: 'b2',
        q: 'Can I get a student discount?',
        a: 'Yes — verify your student status from the paywall to get $4.99/mo for a year.',
      },
      {
        id: 'b3',
        q: 'How do I cancel?',
        a: 'Manage your subscription through the App Store or Google Play. Your access continues until the period ends.',
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
            onPress={onContactSupport ?? (() => {})}
            style={({ pressed }) => [styles.contactBtn, pressed && { opacity: 0.85 }]}
            accessibilityRole="button"
          >
            <Icon name="Mail" size={13} color={tokens.colors.cream[50]} strokeWidth={1.75} />
            <Text style={styles.contactBtnLabel}>{supportEmail}</Text>
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
