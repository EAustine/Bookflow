/**
 * WelcomeScreen — first-impression marketing screen for unauthenticated users.
 *
 * Shown after splash only when the user is NOT authenticated. Authenticated
 * users skip this entirely. Single screen (not a carousel), two stacked CTAs,
 * legal microcopy below. Per /Users/completefarmer/Downloads/02_welcome.html.
 */

import { Linking, StyleSheet, Text as RNText, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { G, Line, Path } from 'react-native-svg';
import { Button } from '~/components/Button';
import { Lockup } from '~/components/Lockup';
import { Text } from '~/components/Text';
import { tokens } from '~/design/tokens';

export type WelcomeScreenProps = {
  onGetStarted: () => void;
  onSignIn: () => void;
};

export function WelcomeScreen({ onGetStarted, onSignIn }: WelcomeScreenProps) {
  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
      <View style={styles.content}>
        <View style={styles.topMark}>
          <Lockup size="small" />
        </View>

        <View style={styles.hero}>
          <HeroIllustration />
        </View>

        <View style={styles.welcomeText}>
          <RNText style={styles.headline}>
            Everything you need to <RNText style={styles.headlineEm}>read better</RNText>.
          </RNText>
          <Text variant="body-lg" color="muted" align="center" style={styles.sub}>
            Read, listen, summarize, and ask — for any book you bring or any classic in our library.
          </Text>
        </View>

        <View style={styles.actions}>
          <Button
            label="Get started"
            variant="primary"
            size="large"
            fullWidth
            onPress={onGetStarted}
          />
          <Button
            label="I already have an account"
            variant="tertiary"
            size="standard"
            fullWidth
            onPress={onSignIn}
          />
        </View>

        <RNText style={styles.legal}>
          By continuing, you agree to our{' '}
          <RNText
            style={styles.legalLink}
            onPress={() => Linking.openURL('https://bookflow.app/terms')}
          >
            Terms
          </RNText>{' '}
          and{' '}
          <RNText
            style={styles.legalLink}
            onPress={() => Linking.openURL('https://bookflow.app/privacy')}
          >
            Privacy Policy
          </RNText>
          .
        </RNText>
      </View>
    </SafeAreaView>
  );
}

function HeroIllustration() {
  const ink = tokens.colors.forest[800];
  const accent = tokens.colors.amber[500];
  return (
    <Svg style={styles.heroSvg} viewBox="0 0 280 240" preserveAspectRatio="xMidYMid meet">
      <G stroke={ink} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" fill="none">
        <Path d="M 140 90 L 140 200" />
        <Path d="M 140 90 Q 100 92 60 100 L 60 200 Q 100 202 140 200" />
        <Path d="M 140 90 Q 180 92 220 100 L 220 200 Q 180 202 140 200" />
        <Path d="M 60 100 Q 100 105 140 102" strokeWidth={1} opacity={0.5} />
        <Path d="M 60 200 Q 100 198 140 200" strokeWidth={1} opacity={0.5} />
        <Line x1={75} y1={120} x2={125} y2={118} strokeWidth={1.2} />
        <Line x1={75} y1={135} x2={130} y2={133} strokeWidth={1.2} />
        <Line x1={75} y1={150} x2={120} y2={148} strokeWidth={1.2} />
        <Line x1={75} y1={165} x2={125} y2={163} strokeWidth={1.2} />
        <Line x1={75} y1={180} x2={115} y2={178} strokeWidth={1.2} />
        <Line x1={155} y1={120} x2={205} y2={120} strokeWidth={1.2} />
        <Line x1={155} y1={135} x2={210} y2={135} strokeWidth={1.2} />
        <Line x1={155} y1={150} x2={200} y2={150} strokeWidth={1.2} />
        <Line x1={155} y1={165} x2={205} y2={165} strokeWidth={1.2} />
        <Line x1={155} y1={180} x2={195} y2={180} strokeWidth={1.2} />
      </G>
      <G stroke={accent} strokeWidth={2} strokeLinecap="round" fill="none">
        <Path d="M 30 60 Q 45 50 30 40" opacity={0.4} />
        <Path d="M 50 65 Q 75 50 50 35" opacity={0.6} />
        <Path d="M 90 70 Q 130 45 90 20" opacity={0.85} />
        <Path d="M 250 60 Q 235 50 250 40" opacity={0.4} />
        <Path d="M 230 65 Q 205 50 230 35" opacity={0.6} />
        <Path d="M 190 70 Q 150 45 190 20" opacity={0.85} />
      </G>
    </Svg>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: tokens.bgColors.canvas,
  },
  content: {
    flex: 1,
    paddingTop: 22,
    paddingHorizontal: tokens.space['2xl'],
    paddingBottom: tokens.space.xl,
  },

  // Top brand mark
  topMark: {
    marginBottom: tokens.space['2xl'],
  },

  // Hero illustration
  hero: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: tokens.space.xl,
  },
  heroSvg: {
    width: '100%',
    maxWidth: 280,
    aspectRatio: 280 / 240,
  },

  // Headline + subhead
  welcomeText: {
    marginBottom: 28,
    alignItems: 'center',
  },
  headline: {
    fontFamily: tokens.fonts.display,
    fontSize: 32,
    fontWeight: '500',
    lineHeight: 36,
    letterSpacing: -0.64,
    color: tokens.textColors.primary,
    textAlign: 'center',
    marginBottom: tokens.space.md,
  },
  headlineEm: {
    fontFamily: tokens.fonts.displayItalic,
    fontWeight: '400',
    fontStyle: 'italic',
    color: tokens.textColors.accent,
  },
  sub: {
    fontSize: 15,
    lineHeight: 22,
    maxWidth: 280,
  },

  // CTAs
  actions: {
    gap: tokens.space.xs / 2 + 4, // 6px per spec
  },

  // Legal
  legal: {
    fontFamily: tokens.fonts.ui,
    fontSize: 11,
    lineHeight: 16,
    color: tokens.textColors.subtle,
    textAlign: 'center',
    marginTop: tokens.space.md,
    paddingHorizontal: tokens.space.lg,
  },
  legalLink: {
    color: tokens.textColors.muted,
    textDecorationLine: 'underline',
  },
});
