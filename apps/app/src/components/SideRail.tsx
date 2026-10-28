/**
 * SideRail — primary navigation above the Compact size class.
 *
 * Figma `Side rail` `295:493`, `Rail item` `295:56`. §2 of
 * docs/specs/responsive-handoff.md: collapsed to 72 on Medium and
 * Expanded, expanded to 240 on Desktop with the Bookflow lockup.
 *
 * Deliberately the same `activeTab` / `onChange` contract as `TabBar`,
 * so the two are interchangeable and the shell can pick one by size
 * class without either knowing about the other. Tab order matches
 * `TabBar` and the design system.
 *
 * Hover and Focus-visible states are in the Figma component but are not
 * built here — they are §6, and they arrive with the rest of the web
 * interaction states.
 */

import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon, type IconName } from './Icon';
import { Text } from './Text';
import { Lockup } from './Lockup';
import { Logomark } from './Logomark';
import type { TabKey } from './TabBar';
import { tokens } from '~/design/tokens';

type RailSpec = {
  key: TabKey;
  label: string;
  icon: IconName;
  iconActive: IconName;
};

const ITEMS: readonly RailSpec[] = [
  { key: 'library',  label: 'Library',  icon: 'Book',       iconActive: 'BookOpen'         },
  { key: 'discover', label: 'Discover', icon: 'Compass',    iconActive: 'CompassFilled'    },
  { key: 'listen',   label: 'Listen',   icon: 'Headphones', iconActive: 'HeadphonesFilled' },
  { key: 'you',      label: 'You',      icon: 'User',       iconActive: 'UserFilled'       },
];

export type SideRailProps = {
  activeTab: TabKey;
  onChange: (tab: TabKey) => void;
  /** Desktop. Widens to 240 and swaps the logomark for the full lockup. */
  expanded?: boolean;
};

export function SideRail({ activeTab, onChange, expanded = false }: SideRailProps) {
  const insets = useSafeAreaInsets();
  return (
    <View
      style={[
        styles.rail,
        {
          width: expanded
            ? tokens.layout.rail.expanded
            : tokens.layout.rail.collapsed,
          // The rail runs the full height of the window, so it owns both
          // insets itself — the status bar on a tablet and the home
          // indicator underneath.
          paddingTop: insets.top + tokens.space.lg,
          paddingBottom: Math.max(insets.bottom, tokens.space.sm),
        },
      ]}
    >
      <View style={[styles.brand, expanded ? styles.brandExpanded : styles.brandCollapsed]}>
        {expanded ? <Lockup size="small" /> : <Logomark width={28} />}
      </View>

      <View style={styles.items}>
        {ITEMS.map((item) => (
          <RailItem
            key={item.key}
            active={item.key === activeTab}
            icon={item.key === activeTab ? item.iconActive : item.icon}
            label={item.label}
            expanded={expanded}
            onPress={() => onChange(item.key)}
          />
        ))}
      </View>
    </View>
  );
}

function RailItem({
  icon,
  label,
  active,
  expanded,
  onPress,
}: {
  icon: IconName;
  label: string;
  active: boolean;
  expanded: boolean;
  onPress: () => void;
}) {
  const color = active ? tokens.textColors.accent : tokens.textColors.muted;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      accessibilityLabel={label}
      onPress={onPress}
      style={[
        styles.item,
        expanded ? styles.itemExpanded : styles.itemCollapsed,
        active && styles.itemActive,
      ]}
      hitSlop={4}
    >
      <Icon name={icon} size={tokens.iconSize.md} color={color} />
      <Text
        style={[
          expanded ? styles.labelExpanded : styles.labelCollapsed,
          { color, fontWeight: active ? '500' : '400' },
        ]}
        numberOfLines={1}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  rail: {
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: tokens.borderColors.subtle,
    backgroundColor: tokens.bgColors.canvas,
  },
  brand: {
    paddingBottom: tokens.space.xl,
  },
  brandCollapsed: {
    alignItems: 'center',
  },
  brandExpanded: {
    paddingHorizontal: tokens.space.lg,
  },
  items: {
    gap: tokens.space.xs,
    paddingHorizontal: tokens.space.sm,
  },
  item: {
    borderRadius: tokens.radii.md,
  },
  itemCollapsed: {
    alignItems: 'center',
    gap: 4,
    paddingVertical: tokens.space.sm,
  },
  itemExpanded: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.space.md,
    paddingVertical: tokens.space.md,
    paddingHorizontal: tokens.space.md,
  },
  /** The selected-row fill, same treatment the master lists use. */
  itemActive: {
    backgroundColor: tokens.bgColors.accentMuted,
  },
  labelCollapsed: {
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 10,
    lineHeight: 14,
  },
  labelExpanded: {
    fontFamily: tokens.fonts.uiMedium,
    fontSize: tokens.fontSizes.ui.md,
    lineHeight: 20,
  },
});
