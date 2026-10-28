import { useCallback, useRef } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Icon, type IconName, Text } from '~/components';
import { tokens } from '~/design/tokens';
import {
  pollBalanceAfterPurchase,
  type PurchasedBalances,
  type TopupLine,
} from '~/features/ai';
import type { TopupKind } from '../api/revenuecat';
import { BuyCreditsSheet, type BuyCreditsSheetRef } from './BuyCreditsSheet';

/**
 * Purchased top-up balance, shown on the plan card below the monthly-allowance
 * meters. One row per pack type (audio / AI): each shows the purchased total, a
 * usage bar (used vs left), and the expiry. Rows with no live balance show an
 * empty state with a "Buy" shortcut. Always visible so the upsell is
 * discoverable. Mounts its own Buy Credits sheet so the "Buy" links work
 * wherever it's placed.
 *
 * Two themes via `onDark`: a dark forest panel for the dark free plan card
 * (You tab), and a light green panel for cream surfaces (Pro card bottom +
 * Account & subscription) so it blends with those pages.
 */

type TopupTheme = {
  heading: string;
  panelBg: string;
  panelBorder: string;
  divider: string;
  chipBg: string;
  chipIcon: string;
  title: string;
  amount: string;
  muted: string;
  track: string;
  dash: string;
  buy: string;
};

function themeColors(onDark: boolean): TopupTheme {
  if (onDark) {
    return {
      heading: tokens.colors.forest[200],
      panelBg: tokens.colors.forest[700],
      panelBorder: 'rgba(255,255,255,0.08)',
      divider: 'rgba(255,255,255,0.08)',
      chipBg: tokens.colors.forest[600],
      chipIcon: tokens.colors.forest[100],
      title: tokens.colors.cream[50],
      amount: tokens.colors.cream[50],
      muted: 'rgba(220,230,221,0.55)',
      track: 'rgba(255,255,255,0.13)',
      dash: 'rgba(183,204,185,0.45)',
      buy: tokens.colors.amber[500],
    };
  }
  return {
    heading: tokens.colors.forest[700],
    // Warm beige (matches the page/card background) instead of light green —
    // with a neutral border/divider so it doesn't carry a green outline.
    panelBg: tokens.colors.cream[100],
    panelBorder: tokens.borderColors.subtle,
    divider: tokens.colors.ink[100],
    chipBg: tokens.colors.cream[50],
    chipIcon: tokens.colors.forest[800],
    title: tokens.colors.ink[900],
    amount: tokens.colors.ink[900],
    muted: tokens.colors.ink[400],
    track: tokens.colors.ink[100],
    dash: tokens.colors.ink[300],
    buy: tokens.colors.forest[800],
  };
}

/** "450K" / "1.2M" / "8,000" — compact credit count. */
function formatCredits(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)}M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}K`;
  return n.toLocaleString();
}

function formatMinutes(n: number): string {
  return `${n.toLocaleString()} min`;
}

export function TopupBalanceBlock({
  balances,
  onDark = false,
}: {
  balances: PurchasedBalances;
  /** True on a dark surface (the dark free plan card) → dark forest panel;
   * false on cream cards (Pro card bottom, Account) → light green panel. */
  onDark?: boolean;
}) {
  const buyRef = useRef<BuyCreditsSheetRef>(null);
  const openBuy = useCallback((kind: TopupKind) => buyRef.current?.present(kind), []);
  const c = themeColors(onDark);

  return (
    <View style={styles.wrap}>
      <Text style={[styles.heading, { color: c.heading }]}>Top-up balance</Text>
      <View style={[styles.card, { backgroundColor: c.panelBg, borderColor: c.panelBorder }]}>
        <TopupRow
          icon="Music"
          label="Audio time"
          emptyLabel="No audio time"
          line={balances.audio}
          fmt={formatMinutes}
          onBuy={() => openBuy('audio')}
          c={c}
        />
        <View style={[styles.divider, { backgroundColor: c.divider }]} />
        <TopupRow
          icon="Sparkles"
          label="AI credits"
          emptyLabel="No AI credits"
          line={balances.ai}
          fmt={formatCredits}
          onBuy={() => openBuy('ai')}
          c={c}
        />
      </View>
      <BuyCreditsSheet
        ref={buyRef}
        onPurchased={() => pollBalanceAfterPurchase(balances.refresh)}
      />
    </View>
  );
}

function TopupRow({
  icon,
  label,
  emptyLabel,
  line,
  fmt,
  onBuy,
  c,
}: {
  icon: IconName;
  label: string;
  emptyLabel: string;
  line: TopupLine;
  fmt: (n: number) => string;
  onBuy: () => void;
  c: TopupTheme;
}) {
  if (line.total <= 0) {
    return (
      <View style={styles.row}>
        <View style={styles.rowTop}>
          <View style={[styles.chipEmpty, { borderColor: c.dash }]}>
            <Icon name="Plus" size={16} color={c.muted} />
          </View>
          <Text style={[styles.emptyLabel, { color: c.muted }]}>{emptyLabel}</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Buy ${label}`}
            onPress={onBuy}
            hitSlop={8}
            style={({ pressed }) => [styles.buyLink, pressed && { opacity: 0.6 }]}
          >
            <Text style={[styles.buyText, { color: c.buy }]}>Buy</Text>
            <Icon name="ArrowRight" size={13} color={c.buy} />
          </Pressable>
        </View>
      </View>
    );
  }

  const pct =
    line.total > 0 ? Math.min(100, Math.round((line.used / line.total) * 100)) : 0;

  return (
    <View style={styles.row}>
      <View style={styles.rowTop}>
        <View style={[styles.chip, { backgroundColor: c.chipBg }]}>
          <Icon name={icon} size={16} color={c.chipIcon} />
        </View>
        <View style={styles.rowInfo}>
          <Text style={[styles.title, { color: c.title }]}>{label}</Text>
          {line.expiresLabel ? (
            <Text style={[styles.expiry, { color: c.muted }]}>{line.expiresLabel}</Text>
          ) : null}
        </View>
        <Text style={[styles.amount, { color: c.amount }]}>{fmt(line.total)}</Text>
      </View>
      <View style={[styles.track, { backgroundColor: c.track }]}>
        <View style={[styles.fill, { width: `${pct}%` }]} />
      </View>
      <View style={styles.usageRow}>
        <Text style={[styles.usageText, { color: c.muted }]}>{fmt(line.used)} used</Text>
        <Text style={[styles.usageText, { color: c.muted }]}>{fmt(line.left)} left</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: 14, marginBottom: tokens.space.lg, gap: 8 },
  heading: {
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 11,
    letterSpacing: 0.9,
    textTransform: 'uppercase',
  },
  card: {
    borderRadius: tokens.radii['3xl'],
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 14,
  },
  divider: { height: StyleSheet.hairlineWidth },
  row: { paddingVertical: 14, gap: 10 },
  rowTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  chip: {
    width: 36,
    height: 36,
    borderRadius: tokens.radii.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipEmpty: {
    width: 36,
    height: 36,
    borderRadius: tokens.radii.lg,
    borderWidth: 1,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowInfo: { flex: 1, minWidth: 0, gap: 1 },
  title: { fontFamily: tokens.fonts.uiMedium, fontSize: 15 },
  expiry: { fontFamily: tokens.fonts.ui, fontSize: 12 },
  amount: { fontFamily: tokens.fonts.display, fontSize: 19, flexShrink: 0 },
  track: {
    height: 5,
    borderRadius: tokens.radii.full,
    overflow: 'hidden',
  },
  fill: {
    height: 5,
    borderRadius: tokens.radii.full,
    backgroundColor: tokens.colors.amber[500],
  },
  usageRow: { flexDirection: 'row', justifyContent: 'space-between' },
  usageText: { fontFamily: tokens.fonts.ui, fontSize: 12 },
  emptyLabel: { flex: 1, fontFamily: tokens.fonts.uiMedium, fontSize: 15 },
  buyLink: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  buyText: { fontFamily: tokens.fonts.uiMedium, fontSize: 14 },
});
