/**
 * SignInScreen / SignUpScreen — magic-link primary, OAuth secondary, no passwords.
 *
 * Single component, two variants. Per /Users/completefarmer/Downloads/03_signin.html
 * and /Users/completefarmer/Downloads/03b_signup.html.
 *
 * Two states (each variant):
 *   - 'form'    · email field, Send magic link, divider, Google + Apple, footer
 *   - 'success' · mail icon, "Check your email", Open email app, Resend (30s)
 *
 * Sign-up adds: marketing consent checkbox (default unchecked, GDPR), legal
 * microcopy, footer link reversed to "Already have an account? Sign in".
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  Text as RNText,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { G, Path, Rect } from 'react-native-svg';
import { Button } from '~/components/Button';
import { Icon } from '~/components/Icon';
import { Input } from '~/components/Input';
import { Text } from '~/components/Text';
import { tokens } from '~/design/tokens';
import { sendMagicLink, type SendMagicLinkResult } from '~/lib/auth';
import { useGoogleSignIn } from '~/lib/google-auth';

const RESEND_COOLDOWN_S = 30;

export type AuthVariant = 'signin' | 'signup';

export type SignInScreenProps = {
  variant?: AuthVariant;
  onBack: () => void;
  /** Pressed when user taps the inverse footer link (e.g. "Sign up" on signin, "Sign in" on signup). */
  onSwitchVariant: () => void;
  onComplete: () => void;
  /** Called when Google OAuth succeeds — caller handles routing. */
  onGoogleSignIn: () => void;
};

export function SignInScreen({
  variant = 'signin',
  onBack,
  onSwitchVariant,
  onComplete,
  onGoogleSignIn,
}: SignInScreenProps) {
  const [stage, setStage] = useState<'form' | 'success'>('form');
  const [email, setEmail] = useState('');
  const [marketingConsent, setMarketingConsent] = useState(false);

  const { promptAsync: promptGoogle, loading: googleLoading, ready: googleReady } = useGoogleSignIn(
    useCallback((result) => {
      if (result.ok) onGoogleSignIn();
    }, [onGoogleSignIn]),
  );

  /**
   * Single source of truth for sending. Called from the form's primary CTA
   * and from the success-state Resend button. Returns the typed result so
   * each caller decides how to render success/error.
   */
  const submit = useCallback(
    () => sendMagicLink({ email, variant, marketingConsent }),
    [email, variant, marketingConsent],
  );

  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
      {stage === 'form' ? (
        <SignInForm
          variant={variant}
          email={email}
          onEmailChange={setEmail}
          marketingConsent={marketingConsent}
          onMarketingConsentChange={setMarketingConsent}
          onBack={onBack}
          onSwitchVariant={onSwitchVariant}
          onSubmit={submit}
          onSent={() => setStage('success')}
          onGooglePress={promptGoogle}
          googleLoading={googleLoading}
          googleReady={googleReady}
        />
      ) : (
        <SignInSuccess
          variant={variant}
          email={email}
          onBack={onBack}
          onComplete={onComplete}
          onResend={submit}
        />
      )}
    </SafeAreaView>
  );
}

// ============================================================================
// Form state
// ============================================================================

type SignInFormProps = {
  variant: AuthVariant;
  email: string;
  onEmailChange: (value: string) => void;
  marketingConsent: boolean;
  onMarketingConsentChange: (value: boolean) => void;
  onBack: () => void;
  onSwitchVariant: () => void;
  onSubmit: () => Promise<SendMagicLinkResult>;
  onSent: () => void;
  onGooglePress: () => void;
  googleLoading: boolean;
  googleReady: boolean;
};

function SignInForm({
  variant,
  email,
  onEmailChange,
  marketingConsent,
  onMarketingConsentChange,
  onBack,
  onSwitchVariant,
  onSubmit,
  onSent,
  onGooglePress,
  googleLoading,
  googleReady,
}: SignInFormProps) {
  const inputRef = useRef<TextInput>(null);
  const [submitting, setSubmitting] = useState(false);
  const [errorText, setErrorText] = useState<string | undefined>();

  useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus(), 200);
    return () => clearTimeout(t);
  }, []);

  const isSignup = variant === 'signup';

  const handleSend = async () => {
    if (!isValidEmail(email)) {
      setErrorText('Enter a valid email address.');
      return;
    }
    setErrorText(undefined);
    setSubmitting(true);
    try {
      const result = await onSubmit();
      if (result.ok) {
        onSent();
      } else {
        setErrorText(result.message);
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={styles.content}>
      <Header onBack={onBack} />

      <View style={styles.titleBlock}>
        <RNText style={styles.title}>
          {isSignup ? 'Create your account.' : 'Welcome back.'}
        </RNText>
        <Text variant="body-md" color="muted" style={styles.sub}>
          {isSignup
            ? "We'll send a magic link to set things up. No password needed."
            : "Enter the email you used to sign up — we'll send you a magic link."}
        </Text>
      </View>

      <View style={styles.form}>
        <Input
          ref={inputRef}
          size="large"
          label="Email"
          placeholder="you@example.com"
          value={email}
          onChangeText={(v) => {
            onEmailChange(v);
            if (errorText) setErrorText(undefined);
          }}
          onBlur={() => {
            if (email && !isValidEmail(email)) {
              setErrorText('Enter a valid email address.');
            }
          }}
          errorText={errorText}
          keyboardType="email-address"
          autoCapitalize="none"
          autoComplete="email"
          textContentType="emailAddress"
          returnKeyType="send"
          onSubmitEditing={handleSend}
        />

        {isSignup && (
          <ConsentRow
            checked={marketingConsent}
            onChange={onMarketingConsentChange}
            label="Send me occasional product updates and reading tips. You can unsubscribe anytime."
          />
        )}

        <Button
          label="Send magic link"
          variant="primary"
          size="large"
          fullWidth
          loading={submitting}
          onPress={handleSend}
        />
      </View>

      <Divider />

      <View style={styles.oauthList}>
        <OAuthButton
          label={isSignup ? 'Sign up with Google' : 'Continue with Google'}
          logo={<GoogleLogo />}
          onPress={onGooglePress}
          loading={googleLoading}
          disabled={!googleReady || googleLoading}
        />
        <OAuthButton
          label={isSignup ? 'Sign up with Apple' : 'Continue with Apple'}
          logo={<Icon name="Apple" size={18} color={tokens.colors.ink[900]} />}
          onPress={() => {}}
        />
      </View>

      {isSignup && (
        <RNText style={styles.legal}>
          By creating an account, you agree to our{' '}
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
      )}

      <View style={styles.footer}>
        <RNText style={styles.footerText}>
          {isSignup ? 'Already have an account? ' : "Don't have an account? "}
        </RNText>
        <Pressable onPress={onSwitchVariant} hitSlop={8}>
          <RNText style={styles.footerLink}>{isSignup ? 'Sign in' : 'Sign up'}</RNText>
        </Pressable>
      </View>
    </View>
  );
}

// ============================================================================
// Success state
// ============================================================================

type SignInSuccessProps = {
  variant: AuthVariant;
  email: string;
  onBack: () => void;
  onComplete: () => void;
  onResend: () => Promise<SendMagicLinkResult>;
};

function SignInSuccess({ variant, email, onBack, onComplete, onResend }: SignInSuccessProps) {
  const [secondsLeft, setSecondsLeft] = useState(RESEND_COOLDOWN_S);
  const [resending, setResending] = useState(false);
  const [resendError, setResendError] = useState<string | undefined>();

  useEffect(() => {
    if (secondsLeft <= 0) return;
    const id = setInterval(() => setSecondsLeft((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(id);
  }, [secondsLeft]);

  const handleResend = async () => {
    if (secondsLeft > 0 || resending) return;
    setResending(true);
    setResendError(undefined);
    try {
      const result = await onResend();
      if (result.ok) {
        setSecondsLeft(RESEND_COOLDOWN_S);
      } else {
        setResendError(result.message);
      }
    } finally {
      setResending(false);
    }
  };

  const handleOpenEmail = () => {
    if (Platform.OS === 'ios') Linking.openURL('message://');
    else Linking.openURL('mailto:');
    onComplete();
  };

  return (
    <View style={styles.content}>
      <Header onBack={onBack} />

      <View style={styles.successIllustration}>
        <View style={styles.successIcon}>
          <MailSparkleIcon />
        </View>
        <View style={styles.successTextBlock}>
          <RNText style={styles.successTitle}>Check your email.</RNText>
          <Text variant="body-md" color="muted" align="center" style={styles.successSub}>
            We sent a magic link to{' '}
            <RNText style={styles.successEmail}>{email || 'you@example.com'}</RNText>. Tap the link
            to {variant === 'signup' ? 'finish creating your account' : 'sign in'}.
          </Text>
        </View>
      </View>

      <View style={styles.successActions}>
        <Button
          label="Open email app"
          variant="primary"
          size="large"
          fullWidth
          onPress={handleOpenEmail}
        />
        <Button
          label={secondsLeft > 0 ? `Resend link · ${secondsLeft}s` : 'Resend link'}
          variant="tertiary"
          size="standard"
          fullWidth
          loading={resending}
          disabled={secondsLeft > 0 || resending}
          onPress={handleResend}
        />
      </View>

      {resendError ? (
        <Text variant="body-sm" align="center" color="error" style={styles.successHelp}>
          {resendError}
        </Text>
      ) : (
        <Text variant="body-sm" align="center" color="subtle" style={styles.successHelp}>
          Didn't get it? Check your spam folder. The link is valid for 15 minutes.
        </Text>
      )}
    </View>
  );
}

// ============================================================================
// Sub-components
// ============================================================================

function Header({ onBack }: { onBack: () => void }) {
  return (
    <View style={styles.header}>
      <Pressable
        onPress={onBack}
        accessibilityRole="button"
        accessibilityLabel="Go back"
        hitSlop={8}
        style={({ pressed }) => [
          styles.backBtn,
          pressed && { backgroundColor: tokens.colors.cream[100] },
        ]}
      >
        <Icon name="ArrowLeft" size={20} color={tokens.colors.ink[900]} />
      </Pressable>
    </View>
  );
}

function Divider() {
  return (
    <View style={styles.divider}>
      <View style={styles.dividerLine} />
      <RNText style={styles.dividerText}>or</RNText>
      <View style={styles.dividerLine} />
    </View>
  );
}

function ConsentRow({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
}) {
  return (
    <Pressable
      onPress={() => onChange(!checked)}
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      style={styles.consentRow}
      hitSlop={4}
    >
      <View style={[styles.consentCheckbox, checked && styles.consentCheckboxChecked]}>
        {checked && (
          <Svg width={12} height={12} viewBox="0 0 12 12">
            <Path
              d="M2.5 6.2L5 8.7l4.5-5"
              stroke={tokens.colors.cream[50]}
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            />
          </Svg>
        )}
      </View>
      <RNText style={styles.consentText}>{label}</RNText>
    </Pressable>
  );
}

function OAuthButton({
  label,
  logo,
  onPress,
  loading = false,
  disabled = false,
}: {
  label: string;
  logo: React.ReactNode;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      style={({ pressed }) => [
        styles.oauthBtn,
        pressed && !disabled && { backgroundColor: tokens.colors.cream[100] },
        disabled && { opacity: 0.5 },
      ]}
    >
      {loading ? (
        <Icon name="Loader" size={18} color={tokens.colors.ink[500]} />
      ) : (
        logo
      )}
      <RNText style={styles.oauthLabel}>{label}</RNText>
    </Pressable>
  );
}

function GoogleLogo() {
  return (
    <Svg width={18} height={18} viewBox="0 0 18 18">
      <Path
        d="M16.51 8.18c0-.55-.04-1.07-.13-1.57H9v3.04h4.2c-.18 1.05-.86 1.94-1.83 2.55v2.13h2.97c1.74-1.6 2.74-3.94 2.74-6.15z"
        fill="#4285F4"
      />
      <Path
        d="M9 17c2.48 0 4.55-.83 6.07-2.23l-2.97-2.13c-.82.55-1.86.88-3.1.88-2.39 0-4.41-1.61-5.13-3.78H.81v2.2C2.32 14.73 5.42 17 9 17z"
        fill="#34A853"
      />
      <Path
        d="M3.87 9.74c-.18-.55-.29-1.13-.29-1.74s.11-1.19.29-1.74V4.06H.81C.21 5.21 0 6.55 0 8s.21 2.79.81 3.94l3.06-2.2z"
        fill="#FBBC05"
      />
      <Path
        d="M9 3.48c1.34 0 2.55.46 3.5 1.36l2.62-2.62C13.55.86 11.48 0 9 0 5.42 0 2.32 2.27.81 5.56l3.06 2.2C4.59 5.09 6.61 3.48 9 3.48z"
        fill="#EA4335"
      />
    </Svg>
  );
}


function MailSparkleIcon() {
  return (
    <Svg width={44} height={44} viewBox="0 0 44 44" fill="none">
      <Rect
        x={6}
        y={11}
        width={32}
        height={22}
        rx={3}
        stroke={tokens.colors.forest[800]}
        strokeWidth={2}
        fill={tokens.colors.cream[50]}
      />
      <Path
        d="M7 13l15 11 15-11"
        stroke={tokens.colors.forest[800]}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <G stroke={tokens.colors.amber[500]} strokeWidth={1.4} strokeLinecap="round">
        <Path d="M34 7l1.5 3" />
        <Path d="M37 8.5l-3 1.5" />
      </G>
    </Svg>
  );
}

// ============================================================================
// Helpers
// ============================================================================

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
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
    paddingTop: 12,
    paddingHorizontal: 28,
    paddingBottom: tokens.space.lg,
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 32,
    marginBottom: 40,
  },
  backBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: -6,
  },

  // Title block
  titleBlock: {
    marginBottom: tokens.space['2xl'],
  },
  title: {
    fontFamily: tokens.fonts.display,
    fontSize: 32,
    fontWeight: '500',
    lineHeight: 36,
    letterSpacing: -0.64,
    color: tokens.textColors.primary,
    marginBottom: tokens.space.sm,
  },
  sub: {
    fontSize: 14,
    lineHeight: 21,
  },

  // Form
  form: {
    gap: tokens.space.lg,
    marginBottom: tokens.space.xl,
  },

  // Marketing consent (signup only)
  consentRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    paddingVertical: 4,
    paddingHorizontal: 2,
  },
  consentCheckbox: {
    width: 18,
    height: 18,
    borderWidth: 1.5,
    borderColor: tokens.colors.ink[300],
    borderRadius: 4,
    backgroundColor: tokens.bgColors.canvas,
    flexShrink: 0,
    marginTop: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  consentCheckboxChecked: {
    backgroundColor: tokens.colors.forest[800],
    borderColor: tokens.colors.forest[800],
  },
  consentText: {
    flex: 1,
    fontFamily: tokens.fonts.ui,
    fontSize: 13,
    lineHeight: 19,
    color: tokens.textColors.secondary,
  },

  // Legal (signup only)
  legal: {
    fontFamily: tokens.fonts.ui,
    fontSize: 11,
    lineHeight: 16,
    color: tokens.textColors.subtle,
    textAlign: 'center',
    marginTop: tokens.space.lg,
    paddingHorizontal: tokens.space.md,
  },
  legalLink: {
    color: tokens.textColors.muted,
    textDecorationLine: 'underline',
  },

  // Divider
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.space.md,
    marginVertical: tokens.space.sm,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: tokens.colors.ink[200],
  },
  dividerText: {
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 11,
    fontWeight: '500',
    color: tokens.textColors.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.88,
  },

  // OAuth
  oauthList: {
    gap: tokens.space.sm,
    marginTop: tokens.space.sm,
  },
  oauthBtn: {
    height: 48,
    borderWidth: 1.5,
    borderColor: tokens.colors.ink[200],
    borderRadius: 10,
    backgroundColor: tokens.bgColors.canvas,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  oauthLabel: {
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 14,
    fontWeight: '500',
    color: tokens.textColors.primary,
  },

  // Footer
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 'auto',
    paddingTop: tokens.space.xl,
  },
  footerText: {
    fontFamily: tokens.fonts.ui,
    fontSize: 13,
    color: tokens.textColors.muted,
  },
  footerLink: {
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 13,
    fontWeight: '500',
    color: tokens.textColors.accent,
  },

  // Success state
  successIllustration: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: tokens.space['2xl'],
    paddingBottom: 40,
  },
  successIcon: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: tokens.colors.forest[50],
    alignItems: 'center',
    justifyContent: 'center',
  },
  successTextBlock: {
    alignItems: 'center',
    maxWidth: 280,
  },
  successTitle: {
    fontFamily: tokens.fonts.display,
    fontSize: 28,
    fontWeight: '500',
    lineHeight: 32,
    letterSpacing: -0.56,
    color: tokens.textColors.primary,
    textAlign: 'center',
    marginBottom: tokens.space.md,
  },
  successSub: {
    fontSize: 14,
    lineHeight: 22,
  },
  successEmail: {
    color: tokens.textColors.primary,
    fontFamily: tokens.fonts.uiMedium,
    fontWeight: '500',
  },
  successActions: {
    gap: 6,
  },
  successHelp: {
    marginTop: tokens.space.lg,
    paddingHorizontal: tokens.space.lg,
  },
});
