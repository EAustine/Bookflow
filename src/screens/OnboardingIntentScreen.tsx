/**
 * OnboardingIntentScreen — Step 1 of 2 onboarding for new users.
 *
 * "Why are you here?" — soft activation, single-select, skippable.
 * Intent is stored on profile (`onboarding_intent`) and emitted to PostHog
 * as `signup_intent_picked`. We don't yet personalize off it — that's
 * Milestone 2-3. The current value is emotional commitment + analytics.
 *
 * Per /Users/completefarmer/Downloads/04_onboarding_intent.html.
 */

import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text as RNText, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button } from '~/components/Button';
import { Icon, type IconName } from '~/components/Icon';
import { Text } from '~/components/Text';
import { tokens } from '~/design/tokens';

export type OnboardingIntent =
  | 'read_for_fun'
  | 'study'
  | 'focus_accessibility'
  | 'listen_on_the_go'
  | 'exploring';

type IntentDef = {
  id: OnboardingIntent;
  icon: IconName;
  label: string;
  sublabel: string;
};

const INTENTS: readonly IntentDef[] = [
  {
    id: 'read_for_fun',
    icon: 'Book',
    label: 'Read more for fun',
    sublabel: 'Books I want to actually finish.',
  },
  {
    id: 'study',
    icon: 'Notebook',
    label: 'Study for school or work',
    sublabel: 'Help me understand and remember what I read.',
  },
  {
    id: 'focus_accessibility',
    icon: 'Brain',
    label: 'Improve focus or accessibility',
    sublabel: 'Reading is hard for me — I want it to be easier.',
  },
  {
    id: 'listen_on_the_go',
    icon: 'Headphones',
    label: 'Listen on the go',
    sublabel: 'I want my books to come with me — commute, walks, gym.',
  },
  {
    id: 'exploring',
    icon: 'Compass',
    label: 'Just exploring',
    sublabel: 'Not sure yet — show me around.',
  },
] as const;

export type OnboardingIntentScreenProps = {
  /** Continue with a selected intent. Caller persists to profile + emits analytics. */
  onContinue: (intent: OnboardingIntent) => void;
  /** Skip without selecting. Caller persists null + emits "skipped". */
  onSkip: () => void;
};

export function OnboardingIntentScreen({ onContinue, onSkip }: OnboardingIntentScreenProps) {
  const [selected, setSelected] = useState<OnboardingIntent | null>(null);

  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
      <View style={styles.content}>
        {/* Top bar — progress (50%, step 1 of 2) + Skip */}
        <View style={styles.topbar}>
          <View style={styles.progressTrack}>
            <View style={styles.progressFill} />
          </View>
          <Pressable onPress={onSkip} hitSlop={8} accessibilityRole="button">
            <RNText style={styles.skipText}>Skip for now</RNText>
          </Pressable>
        </View>

        {/* Title */}
        <View style={styles.titleBlock}>
          <RNText style={styles.title}>What brings you to Bookflow?</RNText>
          <Text variant="body-md" color="muted" style={styles.sub}>
            We'll use this to suggest the right starting point.
          </Text>
        </View>

        {/* Intent options */}
        <ScrollView
          style={styles.list}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
        >
          {INTENTS.map((intent) => (
            <IntentOption
              key={intent.id}
              intent={intent}
              selected={selected === intent.id}
              onPress={() => setSelected(intent.id)}
            />
          ))}
        </ScrollView>

        {/* CTA */}
        <View style={styles.actions}>
          <Button
            label="Continue"
            variant="primary"
            size="large"
            fullWidth
            disabled={!selected}
            onPress={() => selected && onContinue(selected)}
          />
        </View>
      </View>
    </SafeAreaView>
  );
}

// ============================================================================
// Sub-components
// ============================================================================

function IntentOption({
  intent,
  selected,
  onPress,
}: {
  intent: IntentDef;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected, checked: selected }}
      style={[styles.option, selected && styles.optionSelected]}
    >
      <View style={[styles.iconContainer, selected && styles.iconContainerSelected]}>
        <Icon name={intent.icon} size={20} color={tokens.colors.forest[800]} />
      </View>
      <View style={styles.optionTextBlock}>
        <RNText style={styles.optionLabel}>{intent.label}</RNText>
        <RNText style={styles.optionSublabel}>{intent.sublabel}</RNText>
      </View>
      <View style={[styles.radio, selected && styles.radioSelected]} />
    </Pressable>
  );
}

// ============================================================================
// Styles
// ============================================================================

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: tokens.bgColors.canvas,
  },
  content: {
    flex: 1,
    paddingTop: tokens.space.lg,
    paddingHorizontal: tokens.space.xl,
    paddingBottom: tokens.space.xl,
  },

  // Top bar
  topbar: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 32,
    marginBottom: tokens.space['2xl'],
    gap: tokens.space.lg,
  },
  progressTrack: {
    flex: 1,
    maxWidth: 200,
    height: 4,
    backgroundColor: tokens.colors.ink[100],
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: {
    width: '50%',
    height: '100%',
    backgroundColor: tokens.colors.forest[800],
    borderRadius: 2,
  },
  skipText: {
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 13,
    fontWeight: '500',
    color: tokens.textColors.muted,
    paddingVertical: 6,
    paddingHorizontal: 4,
  },

  // Title
  titleBlock: {
    marginBottom: 28,
  },
  title: {
    fontFamily: tokens.fonts.display,
    fontSize: 30,
    fontWeight: '500',
    lineHeight: 34,
    letterSpacing: -0.6,
    color: tokens.textColors.primary,
    marginBottom: tokens.space.sm,
  },
  sub: {
    fontSize: 14,
    lineHeight: 21,
  },

  // List
  list: {
    flex: 1,
  },
  listContent: {
    gap: 10,
    paddingBottom: tokens.space.sm,
  },

  // Option card
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: tokens.space.lg,
    backgroundColor: tokens.bgColors.canvas,
    borderWidth: 1.5,
    borderColor: tokens.colors.ink[200],
    borderRadius: 12,
  },
  optionSelected: {
    backgroundColor: tokens.colors.forest[50],
    borderColor: tokens.colors.forest[800],
  },
  iconContainer: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: tokens.colors.cream[100],
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconContainerSelected: {
    backgroundColor: tokens.colors.forest[100],
  },
  optionTextBlock: {
    flex: 1,
  },
  optionLabel: {
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 14,
    fontWeight: '500',
    lineHeight: 18,
    color: tokens.textColors.primary,
  },
  optionSublabel: {
    fontFamily: tokens.fonts.ui,
    fontSize: 12,
    fontWeight: '400',
    lineHeight: 16,
    color: tokens.textColors.muted,
    marginTop: 2,
  },

  // Radio
  radio: {
    width: 22,
    height: 22,
    borderWidth: 1.5,
    borderColor: tokens.colors.ink[300],
    borderRadius: 11,
    backgroundColor: tokens.bgColors.canvas,
  },
  radioSelected: {
    borderWidth: 6,
    borderColor: tokens.colors.forest[800],
  },

  // CTA
  actions: {
    marginTop: tokens.space.lg,
  },
});
