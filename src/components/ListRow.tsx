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

export type ListRowSize = 'standard' | 'compact';

export type ListRowToggle = {
  value: boolean;
  onChange: (next: boolean) => void;
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
  trailingElement?: React.ReactNode;
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
  trailingElement,
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

  const labelWeight = (
    tokens.listRow.fontWeight.label[size] as '400' | '500'
  );

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
              fontSize: tokens.listRow.fontSize.label[size],
              fontWeight: labelWeight,
              color: labelColor,
            },
          ]}
          numberOfLines={1}
        >
          {label}
        </Text>
        {sublabel && (
          <Text style={styles.sublabel} numberOfLines={1}>
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
          {toggle && <Toggle value={toggle.value} />}
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

function Toggle({ value }: { value: boolean }) {
  return (
    <View
      style={[
        styles.toggleTrack,
        {
          backgroundColor: value
            ? tokens.colors.forest[800]
            : tokens.colors.ink[300],
        },
      ]}
    >
      <View
        style={[
          styles.toggleThumb,
          { transform: [{ translateX: value ? 14 : 0 }] },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.listRow.gap,
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
  toggleTrack: {
    width: 36,
    height: 22,
    borderRadius: tokens.radii.full,
    padding: 2,
    justifyContent: 'center',
  },
  toggleThumb: {
    width: 18,
    height: 18,
    borderRadius: tokens.radii.full,
    backgroundColor: tokens.colors.cream[50],
  },
});
