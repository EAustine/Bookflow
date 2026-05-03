/**
 * SignOutConfirmSheet — bottom sheet that confirms a destructive sign-out.
 *
 * Per /docs/specs/b7_01_os_system_states.html. The "What's preserved" card
 * is intentionally prominent — sign-out anxiety is mostly about losing
 * data, and explicitly listing what survives the action removes that
 * worry. Cancel is always a real exit; the destructive button uses the
 * error palette to make weight legible without being aggressive.
 *
 * The host owns the actual `supabase.auth.signOut()` call so navigation
 * back to Welcome happens in one place.
 */

import { forwardRef, useCallback } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import {
  BottomSheetBackdrop,
  type BottomSheetBackdropProps,
  BottomSheetModal,
  BottomSheetView,
} from '@gorhom/bottom-sheet';
import { Icon, Text } from '~/components';
import { tokens } from '~/design/tokens';

export type SignOutConfirmSheetProps = {
  loading?: boolean;
  onConfirm: () => void;
  onCancel?: () => void;
  onDismiss?: () => void;
};

const ERROR_FG = '#B5453A';
const ERROR_BG = '#FBEAE7';
const SUCCESS_FG = '#2D7A4F';
const SUCCESS_BG = '#E8F4ED';

const PRESERVED: string[] = [
  'Your books, progress, and highlights are cloud-synced',
  'AI conversation history is saved to your account',
  'Downloaded audio stays on this device until removed',
];

export const SignOutConfirmSheet = forwardRef<BottomSheetModal, SignOutConfirmSheetProps>(
  function SignOutConfirmSheet({ loading = false, onConfirm, onCancel, onDismiss }, ref) {
    const renderBackdrop = useCallback(
      (props: BottomSheetBackdropProps) => (
        <BottomSheetBackdrop
          {...props}
          appearsOnIndex={0}
          disappearsOnIndex={-1}
          opacity={tokens.bottomSheet.backdropOpacity}
          pressBehavior={loading ? 'none' : 'close'}
        />
      ),
      [loading],
    );

    return (
      <BottomSheetModal
        ref={ref}
        enableDynamicSizing
        enablePanDownToClose={!loading}
        backdropComponent={renderBackdrop}
        backgroundStyle={styles.bg}
        handleIndicatorStyle={styles.handle}
        onDismiss={onDismiss}
      >
        <BottomSheetView style={styles.content}>
          {/* Icon */}
          <View style={[styles.iconWrap, { backgroundColor: ERROR_BG }]}>
            <Icon name="Logout" size={26} color={ERROR_FG} strokeWidth={1.5} />
          </View>

          <Text style={styles.title}>Sign out of Bookflow?</Text>
          <Text style={styles.sub}>
            You'll need to sign in again to access your library and AI features.
          </Text>

          {/* What's preserved card */}
          <View style={styles.preservedCard}>
            <Text style={styles.preservedLabel}>What's preserved</Text>
            {PRESERVED.map((row, i) => (
              <View key={i} style={styles.preservedRow}>
                <View style={styles.preservedCheck}>
                  <Icon name="Check" size={9} color={SUCCESS_FG} strokeWidth={2.5} />
                </View>
                <Text style={styles.preservedText}>{row}</Text>
              </View>
            ))}
          </View>

          {/* CTAs */}
          <Pressable
            onPress={onConfirm}
            disabled={loading}
            style={({ pressed }) => [styles.dangerBtn, pressed && { opacity: 0.85 }]}
            accessibilityRole="button"
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.dangerLabel}>Sign out</Text>
            )}
          </Pressable>

          <Pressable
            onPress={onCancel ?? onDismiss ?? (() => {})}
            disabled={loading}
            style={styles.cancelBtn}
            accessibilityRole="button"
          >
            <Text style={styles.cancelLabel}>Cancel</Text>
          </Pressable>
        </BottomSheetView>
      </BottomSheetModal>
    );
  },
);

const styles = StyleSheet.create({
  bg: { backgroundColor: tokens.bgColors.canvas },
  handle: {
    backgroundColor: tokens.colors.ink[300],
    width: 32,
  },
  content: {
    paddingHorizontal: 22,
    paddingTop: 8,
    paddingBottom: 28,
  },

  iconWrap: {
    width: 56,
    height: 56,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  title: {
    fontFamily: tokens.fonts.display,
    fontSize: 20,
    fontWeight: '500',
    color: tokens.textColors.primary,
    marginBottom: 6,
    letterSpacing: -0.2,
  },
  sub: {
    fontFamily: tokens.fonts.ui,
    fontSize: 13,
    color: tokens.textColors.muted,
    lineHeight: 19,
    marginBottom: 20,
  },

  preservedCard: {
    backgroundColor: tokens.bgColors.surface,
    borderRadius: 10,
    borderWidth: 0.5,
    borderColor: tokens.borderColors.subtle,
    padding: 14,
    marginBottom: 20,
  },
  preservedLabel: {
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 11,
    fontWeight: '500',
    letterSpacing: 0.06,
    textTransform: 'uppercase',
    color: tokens.textColors.subtle,
    marginBottom: 8,
  },
  preservedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  preservedCheck: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: SUCCESS_BG,
    alignItems: 'center',
    justifyContent: 'center',
  },
  preservedText: {
    flex: 1,
    fontFamily: tokens.fonts.ui,
    fontSize: 12,
    color: tokens.textColors.secondary,
    lineHeight: 17,
  },

  dangerBtn: {
    width: '100%',
    height: 50,
    borderRadius: 12,
    backgroundColor: ERROR_FG,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  dangerLabel: {
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 15,
    fontWeight: '500',
    color: '#fff',
  },
  cancelBtn: {
    width: '100%',
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelLabel: {
    fontFamily: tokens.fonts.ui,
    fontSize: 14,
    color: tokens.textColors.muted,
  },
});
