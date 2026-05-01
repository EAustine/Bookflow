/**
 * Button — canonical button component.
 *
 * Implements the full Bookflow button system per /docs/specs/bookflow_button_system.html.
 *
 * Three sizes × four variants × five states. Use this for every button
 * in the app — never roll your own.
 */

import { useRef } from 'react';
import {
  ActivityIndicator,
  Animated,
  Pressable,
  PressableProps,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { tokens } from '~/design/tokens';
import { Icon, IconName } from './Icon';

// ============================================================================
// TYPES
// ============================================================================

export type ButtonSize = 'compact' | 'standard' | 'large';
export type ButtonVariant = 'primary' | 'secondary' | 'tertiary' | 'destructive';

export type ButtonProps = Omit<PressableProps, 'children'> & {
  label: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
  leadingIcon?: IconName;
  trailingIcon?: IconName;
};

// ============================================================================
// COMPONENT
// ============================================================================

export function Button({
  label,
  variant = 'primary',
  size = 'standard',
  loading = false,
  disabled = false,
  fullWidth = false,
  leadingIcon,
  trailingIcon,
  onPressIn,
  onPressOut,
  ...rest
}: ButtonProps) {
  const scale = useRef(new Animated.Value(1)).current;

  const handlePressIn: PressableProps['onPressIn'] = (e) => {
    Animated.timing(scale, {
      toValue: tokens.button.pressScale,
      duration: tokens.button.transitionMs,
      useNativeDriver: true,
    }).start();
    onPressIn?.(e);
  };

  const handlePressOut: PressableProps['onPressOut'] = (e) => {
    Animated.timing(scale, {
      toValue: 1,
      duration: tokens.button.transitionMs,
      useNativeDriver: true,
    }).start();
    onPressOut?.(e);
  };

  const isDisabled = disabled || loading;
  const variantStyle = getVariantStyle(variant, isDisabled);
  const sizeStyle = getSizeStyle(size);
  const labelColor = getLabelColor(variant, isDisabled);
  const iconSize = size === 'compact' ? 14 : size === 'large' ? 20 : 18;

  return (
    <Animated.View
      style={[
        { transform: [{ scale }] },
        fullWidth && styles.fullWidth,
      ]}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled: isDisabled, busy: loading }}
        disabled={isDisabled}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        style={({ pressed }) => [
          styles.base,
          sizeStyle,
          variantStyle,
          pressed && !isDisabled && getPressedStyle(variant),
          fullWidth && styles.fullWidth,
        ]}
        {...rest}
      >
        {loading ? (
          <ActivityIndicator
            size="small"
            color={labelColor}
          />
        ) : (
          <View style={styles.content}>
            {leadingIcon && (
              <Icon name={leadingIcon} size={iconSize} color={labelColor} />
            )}
            <Text
              style={[
                styles.label,
                { color: labelColor, fontSize: tokens.button.fontSize[size] },
              ]}
              numberOfLines={1}
              // Per design rule: buttons NEVER truncate.
              // If label doesn't fit, the layout is wrong, not the label.
              ellipsizeMode="clip"
            >
              {label}
            </Text>
            {trailingIcon && (
              <Icon name={trailingIcon} size={iconSize} color={labelColor} />
            )}
          </View>
        )}
      </Pressable>
    </Animated.View>
  );
}

// ============================================================================
// STYLE HELPERS
// ============================================================================

function getSizeStyle(size: ButtonSize) {
  return {
    height: tokens.button.height[size],
    paddingHorizontal: tokens.button.paddingX[size],
    borderRadius: tokens.button.radius[size],
    minWidth: size === 'compact' ? 64 : size === 'large' ? 120 : 80,
  };
}

function getVariantStyle(variant: ButtonVariant, disabled: boolean) {
  if (disabled) {
    if (variant === 'primary' || variant === 'destructive') {
      return { backgroundColor: tokens.colors.ink[300] };
    }
    if (variant === 'secondary') {
      return {
        backgroundColor: 'transparent',
        borderWidth: 1,
        borderColor: tokens.colors.ink[200],
      };
    }
    return { backgroundColor: 'transparent' };
  }

  switch (variant) {
    case 'primary':
      return { backgroundColor: tokens.colors.forest[800] };
    case 'secondary':
      return {
        backgroundColor: 'transparent',
        borderWidth: 1,
        borderColor: tokens.colors.ink[300],
      };
    case 'tertiary':
      return { backgroundColor: 'transparent' };
    case 'destructive':
      // Solid-filled destructive primary, used for confirmation-sheet
      // Sign out / Delete CTAs (per bookflow_button_system.html and the
      // /docs/specs/bookflow_bottom_sheet_system.html stacked-CTA pattern).
      return { backgroundColor: tokens.colors.error };
  }
}

function getPressedStyle(variant: ButtonVariant) {
  switch (variant) {
    case 'primary':
      return { backgroundColor: tokens.colors.forest[900] };
    case 'secondary':
      return { backgroundColor: tokens.colors.cream[200] };
    case 'tertiary':
      return { backgroundColor: tokens.colors.forest[100] };
    case 'destructive':
      // Slight darken on press — keeps the affordance honest without flashing.
      return { backgroundColor: tokens.colors.errorPressed };
  }
}

function getLabelColor(variant: ButtonVariant, disabled: boolean): string {
  if (disabled) {
    return variant === 'primary' || variant === 'destructive'
      ? tokens.colors.cream[100]
      : tokens.colors.ink[400];
  }
  switch (variant) {
    case 'primary':
      return tokens.colors.cream[50];
    case 'secondary':
      return tokens.colors.ink[900];
    case 'tertiary':
      return tokens.colors.forest[800];
    case 'destructive':
      return tokens.colors.cream[50];
  }
}

// ============================================================================
// STYLES
// ============================================================================

const styles = StyleSheet.create({
  base: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.button.gap,
  },
  label: {
    fontFamily: tokens.fonts.ui,
    fontWeight: '500',
  },
  fullWidth: {
    width: '100%',
    alignSelf: 'stretch',
  },
});
