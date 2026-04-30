import {
  Text as RNText,
  TextProps as RNTextProps,
  StyleProp,
  TextStyle,
} from 'react-native';
import { tokens } from '~/design/tokens';
import type { TextVariant, TextColor } from '~/design/tokens';

export type TextAlign = 'left' | 'center' | 'right';

export type TextProps = Omit<RNTextProps, 'style'> & {
  variant?: TextVariant;
  color?: TextColor;
  align?: TextAlign;
  style?: StyleProp<TextStyle>;
};

export function Text({
  variant = 'body-md',
  color = 'primary',
  align,
  style,
  ...rest
}: TextProps) {
  return (
    <RNText
      style={[
        tokens.textStyles[variant],
        { color: tokens.textColors[color] },
        align && { textAlign: align },
        style,
      ]}
      {...rest}
    />
  );
}
