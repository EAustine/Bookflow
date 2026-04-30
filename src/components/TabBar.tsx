/**
 * TabBar — shared bottom tab navigator chrome.
 *
 * Used by every authenticated tab screen (Library, Discover, Listen, You).
 * The screen renders <TabBar activeTab="…" onChange={…} /> as its last
 * child inside the SafeAreaView; bottom inset is added here via
 * useSafeAreaInsets so the tab bar doesn't collide with the home indicator
 * on devices that have one.
 *
 * Tab order matches /docs/specs/bookflow_design_system.md (and the You-tab
 * mock in /Users/completefarmer/Downloads/you_tab.html).
 */

import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon, type IconName } from './Icon';
import { Text } from './Text';
import { tokens } from '~/design/tokens';

export type TabKey = 'library' | 'discover' | 'listen' | 'you';

type TabSpec = {
  key: TabKey;
  label: string;
  icon: IconName;
  iconActive: IconName;
};

const TABS: readonly TabSpec[] = [
  { key: 'library',  label: 'Library',  icon: 'Book',       iconActive: 'BookOpen'        },
  { key: 'discover', label: 'Discover', icon: 'Compass',    iconActive: 'CompassFilled'   },
  { key: 'listen',   label: 'Listen',   icon: 'Headphones', iconActive: 'HeadphonesFilled'},
  { key: 'you',      label: 'You',      icon: 'User',       iconActive: 'UserFilled'      },
];

export type TabBarProps = {
  activeTab: TabKey;
  onChange: (tab: TabKey) => void;
};

export function TabBar({ activeTab, onChange }: TabBarProps) {
  const insets = useSafeAreaInsets();
  return (
    <View
      style={[
        styles.bar,
        // Bottom inset keeps content above the iOS home indicator. Floor at
        // space.sm so non-notched devices still get a comfortable gutter.
        { paddingBottom: Math.max(insets.bottom, tokens.space.sm) },
      ]}
    >
      {TABS.map((tab) => (
        <TabItem
          key={tab.key}
          active={tab.key === activeTab}
          icon={tab.key === activeTab ? tab.iconActive : tab.icon}
          label={tab.label}
          onPress={() => onChange(tab.key)}
        />
      ))}
    </View>
  );
}

function TabItem({
  icon,
  label,
  active,
  onPress,
}: {
  icon: IconName;
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  const color = active ? tokens.textColors.accent : tokens.textColors.muted;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      accessibilityLabel={label}
      onPress={onPress}
      style={styles.item}
      hitSlop={6}
    >
      <Icon name={icon} size={tokens.iconSize.md} color={color} />
      <Text
        style={[
          styles.label,
          { color, fontWeight: active ? '500' : '400' },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: tokens.borderColors.subtle,
    paddingTop: tokens.space.sm,
    backgroundColor: tokens.bgColors.canvas,
  },
  item: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
    paddingVertical: tokens.space.xs,
  },
  label: {
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 10,
    lineHeight: 14,
  },
});
