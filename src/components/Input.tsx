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

  return (
    <View style={containerStyle}>
      {label && <Text style={styles.label}>{label}</Text>}
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
      {helper && (
        <Text style={[styles.helper, { color: helperColor }]}>{helper}</Text>
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  wrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
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
