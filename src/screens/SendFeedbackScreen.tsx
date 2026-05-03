/**
 * SendFeedbackScreen — categorised feedback form.
 *
 * Per /docs/specs/b7_01_os_system_states.html. The host owns the network
 * call (POST /api/feedback → forwards via Resend). This screen handles
 * category selection, free-text body (10–500 char), an optional screenshot
 * attachment, and the Send CTA. On success the host shows a thank-you toast
 * and pops the screen — no separate success view.
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
import { Icon, Text, type IconName } from '~/components';
import { tokens } from '~/design/tokens';

// ─── Categories ──────────────────────────────────────────────────────────────

export type FeedbackCategory = 'bug' | 'feature' | 'ai-quality' | 'other';

type CategoryDef = {
  id: FeedbackCategory;
  label: string;
  icon: IconName;
};

const CATEGORIES: CategoryDef[] = [
  { id: 'bug',        label: 'Bug report',     icon: 'AlertCircle' },
  { id: 'feature',    label: 'Feature request', icon: 'Plus' },
  { id: 'ai-quality', label: 'AI quality',     icon: 'Wand' },
  { id: 'other',      label: 'Other',          icon: 'HelpCircle' },
];

const MIN_LEN = 10;
const MAX_LEN = 500;

// ─── Props ───────────────────────────────────────────────────────────────────

export type FeedbackSubmission = {
  category: FeedbackCategory;
  body: string;
  attachmentUri?: string;
};

export type SendFeedbackScreenProps = {
  onBack: () => void;
  onSubmit: (submission: FeedbackSubmission) => Promise<void> | void;
  /** Host-owned image picker. Returns the selected URI or null on cancel. */
  onPickAttachment?: () => Promise<string | null>;
  initialCategory?: FeedbackCategory;
};

// ─── Screen ──────────────────────────────────────────────────────────────────

export function SendFeedbackScreen({
  onBack,
  onSubmit,
  onPickAttachment,
  initialCategory = 'bug',
}: SendFeedbackScreenProps) {
  const [category, setCategory] = useState<FeedbackCategory>(initialCategory);
  const [body, setBody] = useState('');
  const [attachmentUri, setAttachmentUri] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const charCount = body.length;
  const canSubmit = useMemo(
    () => charCount >= MIN_LEN && charCount <= MAX_LEN && !submitting,
    [charCount, submitting],
  );

  const handlePickAttachment = async () => {
    if (!onPickAttachment) return;
    const uri = await onPickAttachment();
    if (uri) setAttachmentUri(uri);
  };

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      await onSubmit({
        category,
        body: body.trim(),
        attachmentUri: attachmentUri ?? undefined,
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={onBack} hitSlop={8} style={styles.iconBtn} accessibilityLabel="Back">
          <Icon name="ArrowLeft" size={16} color={tokens.textColors.primary} strokeWidth={1.75} />
        </Pressable>
        <Text style={styles.headerTitle}>Send feedback</Text>
        <View style={styles.iconBtn} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Category */}
        <Text style={styles.sectionLabel}>What's this about?</Text>
        <View style={styles.categoryGrid}>
          {CATEGORIES.map((c) => {
            const active = c.id === category;
            return (
              <Pressable
                key={c.id}
                onPress={() => setCategory(c.id)}
                style={[styles.categoryChip, active && styles.categoryChipActive]}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
              >
                <Icon
                  name={c.icon}
                  size={13}
                  color={active ? tokens.colors.forest[800] : tokens.textColors.secondary}
                  strokeWidth={1.5}
                />
                <Text
                  style={[
                    styles.categoryLabel,
                    active && { color: tokens.colors.forest[800] },
                  ]}
                >
                  {c.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {/* Body */}
        <Text style={[styles.sectionLabel, { marginTop: 18 }]}>Tell us what happened</Text>
        <TextInput
          style={styles.textarea}
          value={body}
          onChangeText={(v) => setBody(v.slice(0, MAX_LEN))}
          placeholder="Describe the issue or your idea in as much detail as you like…"
          placeholderTextColor={tokens.textColors.disabled}
          multiline
          textAlignVertical="top"
          autoCapitalize="sentences"
        />
        <Text
          style={[
            styles.charCount,
            charCount > 0 && charCount < MIN_LEN && { color: '#A0692A' },
          ]}
        >
          {charCount} / {MAX_LEN}
          {charCount > 0 && charCount < MIN_LEN ? `  ·  ${MIN_LEN - charCount} more to send` : ''}
        </Text>

        {/* Attachment */}
        <Text style={[styles.sectionLabel, { marginTop: 14 }]}>Attach a screenshot</Text>
        <Pressable
          onPress={handlePickAttachment}
          style={({ pressed }) => [styles.attachmentRow, pressed && { opacity: 0.85 }]}
          accessibilityRole="button"
        >
          <View style={styles.attachmentIcon}>
            <Icon
              name={attachmentUri ? 'CheckCircle' : 'Eye'}
              size={15}
              color={attachmentUri ? tokens.colors.forest[800] : tokens.textColors.muted}
              strokeWidth={1.5}
            />
          </View>
          <View style={styles.attachmentText}>
            <Text style={styles.attachmentLabel}>
              {attachmentUri ? 'Screenshot attached' : 'Add a screenshot'}
            </Text>
            <Text style={styles.attachmentSub}>
              {attachmentUri
                ? 'Tap to replace'
                : 'From your photo library or current screen'}
            </Text>
          </View>
          <View style={styles.attachmentTag}>
            <Text style={styles.attachmentTagText}>optional</Text>
          </View>
        </Pressable>

        {/* Send */}
        <Pressable
          onPress={handleSubmit}
          disabled={!canSubmit}
          style={({ pressed }) => [
            styles.sendBtn,
            !canSubmit && styles.sendBtnDisabled,
            pressed && canSubmit && { opacity: 0.85 },
          ]}
          accessibilityRole="button"
        >
          <Icon name="Mail" size={14} color={tokens.colors.cream[50]} strokeWidth={1.75} />
          <Text style={styles.sendLabel}>
            {submitting ? 'Sending…' : 'Send to Bookflow'}
          </Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

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
  iconBtn: {
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
  scrollContent: {
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 28,
  },

  sectionLabel: {
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 11,
    fontWeight: '500',
    letterSpacing: 0.07,
    textTransform: 'uppercase',
    color: tokens.textColors.subtle,
    marginBottom: 8,
  },

  // Category chips
  categoryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  categoryChip: {
    width: '49%',
    height: 38,
    borderRadius: 9,
    borderWidth: 1.5,
    borderColor: tokens.colors.ink[200],
    backgroundColor: tokens.bgColors.canvas,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  categoryChipActive: {
    borderColor: tokens.colors.forest[800],
    backgroundColor: tokens.colors.forest[50],
  },
  categoryLabel: {
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 12,
    fontWeight: '500',
    color: tokens.textColors.secondary,
  },

  // Textarea
  textarea: {
    minHeight: 120,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: tokens.colors.forest[800],
    backgroundColor: tokens.bgColors.canvas,
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 12,
    fontFamily: tokens.fonts.ui,
    fontSize: 14,
    color: tokens.textColors.primary,
    lineHeight: 20,
  },
  charCount: {
    fontFamily: tokens.fonts.ui,
    fontSize: 10,
    color: tokens.textColors.muted,
    textAlign: 'right',
    marginTop: 4,
  },

  // Attachment
  attachmentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: tokens.bgColors.surface,
    borderRadius: 10,
    borderWidth: 0.5,
    borderColor: tokens.borderColors.subtle,
  },
  attachmentIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: tokens.bgColors.canvas,
    borderWidth: 0.5,
    borderColor: tokens.borderColors.subtle,
    alignItems: 'center',
    justifyContent: 'center',
  },
  attachmentText: { flex: 1 },
  attachmentLabel: {
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 13,
    fontWeight: '500',
    color: tokens.textColors.primary,
  },
  attachmentSub: {
    fontFamily: tokens.fonts.ui,
    fontSize: 11,
    color: tokens.textColors.muted,
  },
  attachmentTag: {
    backgroundColor: '#ECE5D5',
    borderRadius: 4,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  attachmentTagText: {
    fontFamily: tokens.fonts.ui,
    fontSize: 10,
    color: tokens.textColors.muted,
  },

  // Send
  sendBtn: {
    marginTop: 22,
    width: '100%',
    height: 50,
    borderRadius: 12,
    backgroundColor: tokens.colors.forest[800],
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  sendBtnDisabled: {
    backgroundColor: tokens.colors.ink[200],
  },
  sendLabel: {
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 15,
    fontWeight: '500',
    color: tokens.colors.cream[50],
  },
});
