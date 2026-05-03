/**
 * AppRatingSheet — bottom sheet asking the user to rate the app.
 *
 * Per /docs/specs/b5_01_you_tab_system_flows.html. Two-step flow:
 *   1. User selects 1–5 stars.
 *   2a. 4–5 stars → "Rate on App Store" CTA (host wires StoreKit / link).
 *   2b. 1–3 stars → "Send feedback" CTA (host wires email / form).
 *
 * The sheet is intentionally low-friction: tapping a star reveals the
 * follow-up CTA inline rather than navigating away mid-decision.
 */

import { forwardRef, useCallback, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import {
  BottomSheetBackdrop,
  type BottomSheetBackdropProps,
  BottomSheetModal,
  BottomSheetView,
} from '@gorhom/bottom-sheet';
import { Icon, Text } from '~/components';
import { tokens } from '~/design/tokens';

export type AppRatingSheetProps = {
  /** Called with the rating (1-5) when user confirms via primary CTA. */
  onSubmit: (rating: number) => void;
  /** Called when user dismisses without confirming. */
  onDismiss?: () => void;
};

export const AppRatingSheet = forwardRef<BottomSheetModal, AppRatingSheetProps>(
  function AppRatingSheet({ onSubmit, onDismiss }, ref) {
    const [rating, setRating] = useState<number>(0);

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

    const handleDismiss = useCallback(() => {
      setRating(0);
      onDismiss?.();
    }, [onDismiss]);

    const handleSubmit = useCallback(() => {
      if (rating === 0) return;
      onSubmit(rating);
    }, [onSubmit, rating]);

    const isPositive = rating >= 4;
    const isNegative = rating > 0 && rating < 4;
    const ctaLabel = isPositive
      ? 'Rate on App Store'
      : isNegative
        ? 'Send feedback'
        : 'Choose a rating';

    return (
      <BottomSheetModal
        ref={ref}
        enableDynamicSizing
        backdropComponent={renderBackdrop}
        backgroundStyle={styles.bg}
        handleIndicatorStyle={styles.handle}
        onDismiss={handleDismiss}
      >
        <BottomSheetView style={styles.content}>
          <View style={styles.iconWrap}>
            <Icon name="Star" size={22} color={tokens.colors.amber[500]} strokeWidth={1.5} />
          </View>

          <Text style={styles.title}>Enjoying Bookflow?</Text>
          <Text style={styles.body}>
            A quick rating helps other readers discover the app — and tells us
            what to build next.
          </Text>

          {/* Stars */}
          <View style={styles.stars}>
            {[1, 2, 3, 4, 5].map((n) => {
              const filled = n <= rating;
              return (
                <Pressable
                  key={n}
                  onPress={() => setRating(n)}
                  hitSlop={6}
                  accessibilityRole="button"
                  accessibilityLabel={`${n} star${n > 1 ? 's' : ''}`}
                  accessibilityState={{ selected: filled }}
                >
                  <Icon
                    name="Star"
                    size={36}
                    color={filled ? tokens.colors.amber[500] : tokens.colors.ink[200]}
                    strokeWidth={filled ? 2 : 1.5}
                  />
                </Pressable>
              );
            })}
          </View>

          {/* Follow-up note */}
          {rating > 0 && (
            <Text style={[styles.followUp, isNegative && styles.followUpMuted]}>
              {isPositive
                ? "Wonderful — we'd love a quick App Store review."
                : "Sorry to hear that. Tell us what's not working."}
            </Text>
          )}

          {/* CTA */}
          <Pressable
            onPress={handleSubmit}
            disabled={rating === 0}
            style={({ pressed }) => [
              styles.cta,
              rating === 0 && styles.ctaDisabled,
              pressed && rating !== 0 && { opacity: 0.85 },
            ]}
            accessibilityRole="button"
          >
            <Text style={styles.ctaLabel}>{ctaLabel}</Text>
          </Pressable>

          <Pressable onPress={handleDismiss} hitSlop={6}>
            <Text style={styles.notNow}>Not now</Text>
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
    paddingTop: 12,
    paddingBottom: 26,
    alignItems: 'center',
  },
  iconWrap: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#FDF3E3',
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
    textAlign: 'center',
  },
  body: {
    fontFamily: tokens.fonts.ui,
    fontSize: 13,
    color: tokens.textColors.muted,
    lineHeight: 19,
    textAlign: 'center',
    marginBottom: 20,
    maxWidth: 320,
  },

  stars: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 14,
  },
  followUp: {
    fontFamily: tokens.fonts.ui,
    fontSize: 12,
    color: tokens.colors.forest[800],
    textAlign: 'center',
    marginBottom: 16,
    maxWidth: 300,
  },
  followUpMuted: {
    color: '#A0692A',
  },

  cta: {
    width: '100%',
    height: 48,
    borderRadius: 12,
    backgroundColor: tokens.colors.forest[800],
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  ctaDisabled: {
    backgroundColor: tokens.colors.ink[200],
  },
  ctaLabel: {
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 14,
    fontWeight: '500',
    color: tokens.colors.cream[50],
  },
  notNow: {
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 13,
    fontWeight: '500',
    color: tokens.textColors.muted,
    paddingVertical: 6,
  },
});
