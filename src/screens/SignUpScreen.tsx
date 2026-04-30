/**
 * SignUpScreen — thin wrapper around SignInScreen with variant="signup".
 *
 * Per the design system spec, sign-in and sign-up share a single component
 * (`<SignInScreen />`) with a `variant` prop. This file exists so screen-level
 * routing reads naturally — App.tsx renders <SignUpScreen /> for the signup
 * stage and <SignInScreen /> for the signin stage.
 *
 * Per /Users/completefarmer/Downloads/03b_signup.html.
 */

import { SignInScreen } from '~/screens/SignInScreen';

export type SignUpScreenProps = {
  onBack: () => void;
  /** Pressed when user taps "Sign in" link in footer. */
  onSignIn: () => void;
  onComplete: () => void;
  onGoogleSignIn: () => void;
};

export function SignUpScreen({ onBack, onSignIn, onComplete, onGoogleSignIn }: SignUpScreenProps) {
  return (
    <SignInScreen
      variant="signup"
      onBack={onBack}
      onSwitchVariant={onSignIn}
      onComplete={onComplete}
      onGoogleSignIn={onGoogleSignIn}
    />
  );
}
