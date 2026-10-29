import {
  Pressable,
  PressableProps,
  StyleSheet,
  Text,
  View,
  ViewStyle,
} from 'react-native';
import { tokens } from '~/design/tokens';
import { Icon, IconName } from './Icon';
import { Toggle } from './Toggle';

export type ListRowSize = 'standard' | 'compact';

export type ListRowToggle = {
  value: boolean;
  onChange: (next: boolean) => void;
  /**
   * Present but not actionable — the notification rows while the OS
   * permission is denied. Dims the switch and forces the off track, so
   * it doesn't imply a setting that cannot take effect. The row itself
   * is gated by its caller. (F-30.)
   */
  dimmed?: boolean;
};

export type ListRowProps = Omit<PressableProps, 'children' | 'style'> & {
  label: string;
  sublabel?: string;
  size?: ListRowSize;
  destructive?: boolean;
  leadingIcon?: IconName;
  leadingElement?: React.ReactNode;
  hint?: string;
  drillsInto?: boolean;
  toggle?: ListRowToggle;
  selected?: boolean;
  /**
   * The row whose page the detail pane is showing — Figma's
   * `List row (selected)`, a `bg/accent-muted` fill across the row.
   *
   * **Not `selected`**, which draws a trailing check: that is a picker
   * answering "is this the chosen value", and this answers "is this
   * what you are looking at". A master row needs the second and the
   * two are not interchangeable, which is why `LibraryScreen` grew its
   * own row rather than use this one. Added in M6 so You's master
   * could stay on the canonical component.
   *
   * Composites under `pressed`, so pressing an active row still gives
   * feedback. Passing the fill through `containerStyle` instead does
   * not, because that prop lands last in the style array.
   */
  active?: boolean;
  trailingElement?: React.ReactNode;
  /**
   * Sub-label line clamp. One by default so rows stay a predictable
   * height. Raise it where the sub-label carries a real explanation
   * that must not be cut — hard rule 4 asks disabled rows to say why,
   * and a truncated reason is no reason. (F-30.)
   */
  sublabelLines?: number;
  containerStyle?: ViewStyle;
};

export function ListRow({
  label,
  sublabel,
  size = 'standard',
  destructive = false,
  leadingIcon,
  leadingElement,
  hint,
  drillsInto = false,
  toggle,
  selected,
  active = false,
  trailingElement,
  sublabelLines = 1,
  containerStyle,
  disabled,
  onPress,
  ...rest
}: ListRowProps) {
  const handlePress: PressableProps['onPress'] = (e) => {
    if (toggle) toggle.onChange(!toggle.value);
    onPress?.(e);
  };

  const labelColor = disabled
    ? tokens.colors.ink[400]
    : destructive
      ? tokens.colors.error
      : tokens.colors.ink[900];


  return (
    <Pressable
      accessibilityRole={toggle ? 'switch' : 'button'}
      accessibilityState={{
        disabled: disabled ?? false,
        ...(toggle ? { checked: toggle.value } : {}),
      }}
      onPress={handlePress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.row,
        {
          minHeight: tokens.listRow.minHeight[size],
          paddingHorizontal: tokens.listRow.paddingX,
        },
        active && styles.active,
        pressed && !disabled && styles.pressed,
        disabled && styles.disabled,
        containerStyle,
      ]}
      {...rest}
    >
      {leadingElement ??
        (leadingIcon && (
          <View
            style={[
              styles.iconBg,
              {
                width: tokens.listRow.iconBgSize[size],
                height: tokens.listRow.iconBgSize[size],
              },
            ]}
          >
            <Icon
              name={leadingIcon}
              size={tokens.listRow.iconSize[size]}
              color={tokens.colors.ink[700]}
            />
          </View>
        ))}

      <View style={styles.content}>
        <Text
          style={[
            styles.label,
            {
              fontFamily: tokens.listRow.labelFont[size],
              fontSize: tokens.listRow.fontSize.label[size],
              color: labelColor,
            },
          ]}
          numberOfLines={1}
        >
          {label}
        </Text>
        {sublabel && (
          <Text style={styles.sublabel} numberOfLines={sublabelLines}>
            {sublabel}
          </Text>
        )}
      </View>

      {trailingElement ?? (
        <View style={styles.trailing}>
          {hint && <Text style={styles.hint}>{hint}</Text>}
          {selected && (
            <Icon
              name="Check"
              size={tokens.listRow.chevronSize[size] + 2}
              color={tokens.colors.forest[800]}
            />
          )}
          {toggle && <Toggle value={toggle.value} dimmed={toggle.dimmed} />}
          {drillsInto && (
            <Icon
              name="ChevronRight"
              size={tokens.listRow.chevronSize[size]}
              color={tokens.colors.ink[300]}
            />
          )}
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.listRow.gap,
  },
  active: {
    backgroundColor: tokens.bgColors.accentMuted,
  },
  pressed: {
    backgroundColor: tokens.colors.cream[100],
  },
  disabled: {
    opacity: 0.5,
  },
  iconBg: {
    backgroundColor: tokens.colors.cream[100],
    borderRadius: tokens.radii.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    flex: 1,
    minWidth: 0,
  },
  label: {
    // Family is set per size at the call site — see `listRow.labelFont`.
    fontFamily: tokens.fonts.ui,
  },
  sublabel: {
    fontFamily: tokens.fonts.ui,
    fontSize: tokens.listRow.fontSize.sublabel,
    color: tokens.colors.ink[500],
    marginTop: 2,
  },
  trailing: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  hint: {
    fontFamily: tokens.fonts.ui,
    fontSize: tokens.fontSizes.ui.xs,
    color: tokens.colors.ink[500],
  },
});
