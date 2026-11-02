/**
 * WelcomeScreen — first-impression marketing screen for unauthenticated users.
 *
 * Shown after splash only when the user is NOT authenticated. Authenticated
 * users skip this entirely. Single screen (not a carousel), two stacked CTAs,
 * legal microcopy below.
 *
 * ## Two layouts (§4 Auth, R-M9)
 *
 * Auth is "a centred 480 lane on every size", and Welcome alone gets a
 * split on Expanded and Desktop: "a brand panel on the left with the
 * lockup at top left, and the lane on the right, which holds only the
 * heading, one line, two buttons and the terms at the bottom".
 *
 * So the hero illustration is the one piece that moves. Stacked, it
 * sits above the copy; split, it *is* the brand panel, which is why
 * the right lane's contents are enumerated in the brief and the
 * illustration is not among them.
 *
 * Until R-M9 this screen had no size-class branch at all and rendered
 * at 1440 as a stretched phone: one column, a full-width CTA and a
 * 280px illustration adrift in the middle of a very wide page.
 */

import { Linking, StyleSheet, Text as RNText, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { G, Line, Path } from 'react-native-svg';
import { Button } from '~/components/Button';
import { Lockup } from '~/components/Lockup';
import { Text } from '~/components/Text';
import { tokens } from '~/design/tokens';
import { useSizeClass } from '~/hooks/useSizeClass';
import { PRIVACY_POLICY_URL, TERMS_OF_SERVICE_URL } from '~/lib/legalUrls';

export type WelcomeScreenProps = {
  onGetStarted: () => void;
  onSignIn: () => void;
};

export function WelcomeScreen({ onGetStarted, onSignIn }: WelcomeScreenProps) {
  const { sizeClass } = useSizeClass();
  const split = sizeClass === 'expanded' || sizeClass === 'desktop';

  if (split) {
    return (
      <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
        <View style={styles.split}>
          <View style={styles.brandPanel}>
            {/* Top left, per the brief. The stacked layout's lockup is
                also top left, so this is the same mark in the same
                place — the panel grew around it. */}
            <Lockup size="small" />
            <View style={styles.brandHero}>
              <HeroIllustration />
            </View>
          </View>

          <View style={styles.splitLaneWrap}>
            <View style={styles.splitLane}>
              <WelcomeCopy />
              <WelcomeActions
                onGetStarted={onGetStarted}
                onSignIn={onSignIn}
              />
              <LegalLine />
            </View>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
      {/* The lane is centred at every size. On a phone it is simply
          wider than the window, so this costs nothing there and stops
          the column stretching on a Medium tablet. */}
      <View style={styles.content}>
        <View style={styles.topMark}>
          <Lockup size="small" />
        </View>

        <View style={styles.hero}>
          <HeroIllustration />
        </View>

        <WelcomeCopy />
        <WelcomeActions onGetStarted={onGetStarted} onSignIn={onSignIn} />
        <LegalLine />
      </View>
    </SafeAreaView>
  );
}

/**
 * The heading and its one line. Shared rather than duplicated: the
 * brief gives the split lane "the heading, one line, two buttons and
 * the terms", which is the stacked layout's lower half exactly.
 */
function WelcomeCopy() {
  return (
    <View style={styles.welcomeText}>
      <RNText style={styles.headline}>
        Everything you need to <RNText style={styles.headlineEm}>read better</RNText>.
      </RNText>
      <Text variant="body-lg" color="muted" align="center" style={styles.sub}>
        Read, listen, summarize, and ask questions about any book you bring or any classic in our library.
      </Text>
    </View>
  );
}

function WelcomeActions({
  onGetStarted,
  onSignIn,
}: Pick<WelcomeScreenProps, 'onGetStarted' | 'onSignIn'>) {
  return (
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
  );
}

function LegalLine() {
  return (
    <RNText style={styles.legal}>
      By continuing, you agree to our{' '}
      <RNText
        style={styles.legalLink}
        onPress={() => Linking.openURL(TERMS_OF_SERVICE_URL)}
      >
        Terms
      </RNText>{' '}
      and{' '}
      <RNText
        style={styles.legalLink}
        onPress={() => Linking.openURL(PRIVACY_POLICY_URL)}
      >
        Privacy Policy
      </RNText>
      .
    </RNText>
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

  // Stacked (Compact, Medium): one centred lane.
  content: {
    flex: 1,
    width: '100%',
    maxWidth: tokens.layout.lane.width,
    alignSelf: 'center',
    paddingTop: 22,
    paddingHorizontal: tokens.space['2xl'],
    paddingBottom: tokens.space.xl,
  },

  // Split (Expanded, Desktop): brand panel + lane.
  split: {
    flex: 1,
    flexDirection: 'row',
  },
  brandPanel: {
    flex: 1,
    backgroundColor: tokens.bgColors.surface,
    paddingHorizontal: tokens.layout.gutter.desktop,
    paddingVertical: tokens.space['2xl'],
  },
  brandHero: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  splitLaneWrap: {
    // The lane keeps its 480 and sits centred in whatever is left, so
    // the illustration side takes the slack as the window grows rather
    // than the reading column stretching.
    width: tokens.layout.lane.width + tokens.layout.gutter.desktop * 2,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: tokens.layout.gutter.desktop,
  },
  splitLane: {
    width: '100%',
    maxWidth: tokens.layout.lane.width,
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
    lineHeight: 36,
    letterSpacing: -0.64,
    color: tokens.textColors.primary,
    textAlign: 'center',
    marginBottom: tokens.space.md,
  },
  headlineEm: {
    fontFamily: tokens.fonts.displayItalic,
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
