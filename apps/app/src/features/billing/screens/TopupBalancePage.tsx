/**
 * TopupBalancePage — "Top-up balance" as a page under the You tab.
 * Figma `Monetisation / Top-up balance / *`.
 *
 * Built in M7. There was no such page: "Buy credits" was the only
 * `drillsInto` row in its group that did not drill into anything — it
 * opened a sheet instead — so the chevron promised a page that did not
 * exist. The frames give it one, and it is the same master-and-detail
 * container every other You page uses, which M6 already built.
 *
 * The body is `TopupBalanceBlock` unchanged. The frame's label and card
 * are what that block already draws: an uppercase tracked heading, an
 * 8 gap, then a card of two top-up rows. Buying is the tab's one modal,
 * reached through `onBuy` rather than a sheet of this page's own.
 */

import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, SubHeader } from '~/components';
import { tokens } from '~/design/tokens';
import type { PurchasedBalances } from '~/features/ai';
import { TopupBalanceBlock } from './TopupBalanceBlock';
import type { TopupKind } from '../api/revenuecat';

export type TopupBalancePageProps = {
  balances: PurchasedBalances;
  onBuy: (kind: TopupKind) => void;
  /** Omitted above Medium, where the master is the way back. */
  onBack?: () => void;
};

export function TopupBalancePage({
  balances,
  onBuy,
  onBack,
}: TopupBalancePageProps) {
  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <SubHeader title="Top-up balance" onBack={onBack} />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.body}>
          <TopupBalanceBlock balances={balances} onBuy={onBuy} />
          {/*
            Not in the frames, and added because routing the "Buy
            credits" row here would otherwise strand the people most
            likely to tap it. `Top-up row` only carries a Buy link in
            its empty state — the frame shows one empty row and one
            full — so a reader who already holds both balances lands on
            a page with no way to buy. Before M7 that row opened the
            modal directly, so buying was always one tap; this keeps it
            one tap from the page.
          */}
          {/*
            Wrapped rather than given a `style` prop: `ButtonProps`
            extends `PressableProps`, and `{...rest}` is spread after
            `style` in `Button`, so a caller's `style` replaces the
            whole computed button and it renders as bare text. Found
            on device.
          */}
          <View style={styles.buy}>
            <Button
              variant="secondary"
              size="large"
              fullWidth
              label="Buy more credits"
              onPress={() => onBuy('audio')}
            />
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: tokens.bgColors.canvas },
  scroll: { flex: 1 },
  // The frame puts 20 above the label. The block carries 14 of its own,
  // from sitting inside a plan card, so the page supplies the rest.
  content: { paddingTop: 6, paddingBottom: tokens.space.xl },
  body: { paddingHorizontal: tokens.space.lg },
  buy: { marginTop: tokens.space.xs },
});
