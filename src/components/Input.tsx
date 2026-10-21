import { forwardRef, useState } from 'react';
import {
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  View,
  ViewStyle,
} from 'react-native';
import { tokens } from '~/design/tokens';
import { Icon, IconName } from './Icon';

export type InputSize = 'compact' | 'standard' | 'large';
export type InputState = 'default' | 'error' | 'success';

export type InputProps = Omit<TextInputProps, 'style'> & {
  size?: InputSize;
  state?: InputState;
  label?: string;
  leadingIcon?: IconName;
  trailingIcon?: IconName;
  helperText?: string;
  errorText?: string;
  successText?: string;
  containerStyle?: ViewStyle;
};

export const Input = forwardRef<TextInput, InputProps>(function Input(
  {
    size = 'standard',
    state: stateProp,
    label,
    leadingIcon,
    trailingIcon,
    helperText,
    errorText,
    successText,
    containerStyle,
    editable = true,
    onFocus,
    onBlur,
    ...rest
  },
  ref,
) {
  const [focused, setFocused] = useState(false);

  const state: InputState = errorText
    ? 'error'
    : successText
      ? 'success'
      : (stateProp ?? 'default');

  const helper = errorText ?? successText ?? helperText;
  const helperColor =
    state === 'error'
      ? tokens.colors.error
      : state === 'success'
        ? tokens.colors.success
        : tokens.colors.ink[500];

  const borderColor = !editable
    ? 'transparent'
    : state === 'error'
      ? tokens.colors.error
      : state === 'success'
        ? tokens.colors.success
        : focused
          ? tokens.colors.forest[800]
          : 'transparent';

  const backgroundColor = !editable
    ? tokens.colors.ink[100]
    : state === 'error'
      ? tokens.colors.errorBg
      : tokens.colors.cream[100];

  const textColor = editable ? tokens.colors.ink[900] : tokens.colors.ink[400];

  const ringWidth = tokens.input.focusRingWidth;
  // Error and success already carry their own border colour; stacking a
  // forest halo on top of those would muddy the state.
  const showFocusRing = focused && editable && state === 'default';

  return (
    <View style={containerStyle}>
      {label && <Text style={styles.label}>{label}</Text>}
      {/* Focus ring. `tokens.input.focusRingWidth` has always declared a
          3px ring, but the component only ever recoloured the 1px
          border — the token was dead config (F-5). The ring is drawn
          as an outset halo: the wrapper reserves the 3px with equal
          padding and negative margin at all times and only paints when
          focused, so gaining focus never reflows the field. */}
      <View
        style={[
          styles.focusRing,
          { borderRadius: tokens.input.radius[size] + ringWidth },
          showFocusRing && { backgroundColor: tokens.overlay.focusRing },
        ]}
      >
        <View
          style={[
            styles.wrapper,
            {
              height: tokens.input.height[size],
              borderRadius: tokens.input.radius[size],
              paddingHorizontal: tokens.input.paddingX[size],
              backgroundColor,
              borderColor,
            },
          ]}
        >
        {leadingIcon && (
          <Icon
            name={leadingIcon}
            size={tokens.input.iconSize[size]}
            color={tokens.colors.ink[400]}
          />
        )}
        <TextInput
          ref={ref}
          editable={editable}
          placeholderTextColor={tokens.colors.ink[400]}
          onFocus={(e) => {
            setFocused(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            onBlur?.(e);
          }}
          style={[
            styles.input,
            {
              fontSize: tokens.input.fontSize[size],
              color: textColor,
              marginLeft: leadingIcon ? 8 : 0,
              marginRight: trailingIcon ? 8 : 0,
            },
          ]}
          {...rest}
        />
          {trailingIcon && (
            <Icon
              name={trailingIcon}
              size={tokens.input.iconSize[size]}
              color={tokens.colors.ink[400]}
            />
          )}
        </View>
      </View>
      {helper && (
        <Text style={[styles.helper, { color: helperColor }]}>{helper}</Text>
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  // Reserves the ring's 3px at all times (padding) and pulls it back
  // out of flow (negative margin), so painting it on focus moves
  // nothing. Transparent until focused.
  focusRing: {
    padding: tokens.input.focusRingWidth,
    margin: -tokens.input.focusRingWidth,
    backgroundColor: 'transparent',
  },
  wrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: tokens.borderWidth.default,
  },
  input: {
    flex: 1,
    fontFamily: tokens.fonts.ui,
    fontWeight: '400',
    padding: 0,
    margin: 0,
  },
  label: {
    fontFamily: tokens.fonts.ui,
    fontSize: tokens.fontSizes.ui.xxs,
    fontWeight: '500',
    color: tokens.colors.ink[700],
    marginBottom: 6,
  },
  helper: {
    fontFamily: tokens.fonts.ui,
    fontSize: tokens.fontSizes.ui.xxs,
    marginTop: 6,
  },
});
