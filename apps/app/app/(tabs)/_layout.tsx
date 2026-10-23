/**
 * Tab layout.
 *
 * Uses the app's own `TabBar` as `tabBar`, not the stock one. The
 * design system has a specific bar — 4 tabs, Tabler icons at
 * `tokens.iconStrokeWidth`, filled variants for the active state — and
 * restyling the default to match would be a reimplementation with worse
 * fidelity. M2's rule is no visual change, and this is the literal same
 * component the stage machine rendered.
 *
 * The side rail for Medium/Expanded (§3) comes in M7 from these same
 * route definitions. Nothing here needs to change for it.
 */
import { Tabs } from 'expo-router';
import { TabBar, type TabKey } from '~/components';

const ORDER: TabKey[] = ['library', 'discover', 'listen', 'you'];

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{ headerShown: false }}
      tabBar={({ state, navigation }) => (
        <TabBar
          activeTab={(state.routeNames[state.index] ?? 'library') as TabKey}
          onChange={(tab) => navigation.navigate(tab)}
        />
      )}
    >
      {ORDER.map((name) => (
        <Tabs.Screen key={name} name={name} />
      ))}
    </Tabs>
  );
}
