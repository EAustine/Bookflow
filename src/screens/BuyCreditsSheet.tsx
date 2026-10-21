import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, View } from 'react-native';
import type { PurchasesPackage } from 'react-native-purchases';
import { BottomSheet, type BottomSheetRef, Icon, Text } from '~/components';
import { tokens } from '~/design/tokens';
import { toast } from '~/lib/toast';
import {
  getTopupPackages,
  purchaseTopup,
  topupMetaFor,
  type TopupKind,
  type TopupMeta,
} from '~/lib/revenuecat';

/**
 * "Buy credits" bottom sheet — lists the consumable top-up packs from the
 * RevenueCat `topups` offering, split into Audio / AI tabs. Packages come live
 * from RevenueCat (titles, localised prices); the catalog in revenuecat.ts maps
 * each product id to its unit count so the sheet can compute a per-unit price
 * and a "Best value" badge honestly — only flagging savings that actually exist
 * (AI's larger pack is cheaper per credit; audio's packs are flat per minute,
 * so no false badge).
 *
 * Credits are granted server-side by the RevenueCat webhook (idempotent), so
 * they land on the balance a few seconds after a successful purchase. Available
 * to free + Pro users; reachable from the You-tab plan card.
 */

type CardItem = {
  pkg: PurchasesPackage;
  meta: TopupMeta;
  /** price / units — numeric, for comparing value within a tab. */
  perUnitRaw: number;
  /** Display string, e.g. "$0.07/min" or "$0.01/1K". null when unknown. */
  perUnitLabel: string | null;
  isBestValue: boolean;
  savingsPct: number;
  savingsVsLabel: string;
};
type Group = { kind: TopupKind; items: CardItem[]; defaultId?: string };

const KIND_ORDER: TopupKind[] = ['audio', 'ai'];
const KIND_TAB: Record<TopupKind, { label: string; icon: 'Music' | 'Sparkles' }> = {
  audio: { label: 'Audio time', icon: 'Music' },
  ai: { label: 'AI credits', icon: 'Sparkles' },
};

function fmtCurrency(n: number, currency: string, maxFraction: number): string | null {
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: maxFraction,
    }).format(n);
  } catch {
    return null;
  }
}

/** Per-unit price: "/min" for audio, "/1K" (per 1,000 credits) for AI so the
 * number isn't microscopic. null when price or currency is unknown. */
function formatPerUnit(
  meta: TopupMeta,
  price: number,
  currency: string | undefined | null,
): string | null {
  if (!currency || price <= 0 || meta.units <= 0) return null;
  if (meta.kind === 'audio') {
    const s = fmtCurrency(price / meta.units, currency, 2);
    return s ? `${s}/min` : null;
  }
  const s = fmtCurrency(price / (meta.units / 1000), currency, 2);
  return s ? `${s}/1K` : null;
}

function shortLabel(meta: TopupMeta): string {
  if (meta.kind === 'audio') return `${Math.round(meta.units / 60)}hr pack`;
  return `${meta.units >= 1000 ? `${Math.round(meta.units / 1000)}K` : meta.units} pack`;
}

export type BuyCreditsSheetRef = {
  /** Open the sheet, optionally to a specific tab ('audio' | 'ai'). */
  present: (initialKind?: TopupKind) => void;
  dismiss: () => void;
};

export type BuyCreditsSheetProps = {
  /** Fired after a successful purchase, so the parent can refresh its balance. */
  onPurchased?: () => void;
};

export const BuyCreditsSheet = forwardRef<BuyCreditsSheetRef, BuyCreditsSheetProps>(
  function BuyCreditsSheet({ onPurchased }, ref) {
  const innerRef = useRef<BottomSheetRef>(null);
  useImperativeHandle(
    ref,
    () => ({
      present: (initialKind?: TopupKind) => {
        // Open straight to the requested tab (e.g. the audio "Buy" link opens
        // the audio packs). If that kind has no packages, the tab effect below
        // falls back to whatever's available.
        if (initialKind) setTab(initialKind);
        innerRef.current?.present();
      },
      dismiss: () => innerRef.current?.dismiss(),
    }),
    [],
  );

  // null = still loading; [] = none available.
  const [packages, setPackages] = useState<PurchasesPackage[] | null>(null);
  const [tab, setTab] = useState<TopupKind>('audio');
  const [selected, setSelected] = useState<Partial<Record<TopupKind, string>>>({});
  const [buyingId, setBuyingId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const pkgs = await getTopupPackages();
      if (!cancelled) setPackages(pkgs);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Group packages into Audio / AI, sort by size, then compute per-unit price
  // and (only where it's real) the best-value pack + its savings vs the others.
  const groups = useMemo<Record<TopupKind, Group>>(() => {
    const buckets: Record<TopupKind, CardItem[]> = { audio: [], ai: [] };
    for (const pkg of packages ?? []) {
      const meta = topupMetaFor(pkg.product?.identifier);
      if (!meta) continue;
      buckets[meta.kind].push({
        pkg,
        meta,
        perUnitRaw: 0,
        perUnitLabel: null,
        isBestValue: false,
        savingsPct: 0,
        savingsVsLabel: '',
      });
    }
    const out = {} as Record<TopupKind, Group>;
    for (const kind of KIND_ORDER) {
      const items = buckets[kind].sort((a, b) => a.meta.units - b.meta.units);
      for (const it of items) {
        const price = it.pkg.product?.price ?? 0;
        it.perUnitRaw = it.meta.units > 0 && price > 0 ? price / it.meta.units : 0;
        it.perUnitLabel = formatPerUnit(it.meta, price, it.pkg.product?.currencyCode);
      }
      const valid = items.filter((it) => it.perUnitRaw > 0);
      if (valid.length > 1) {
        const minPer = Math.min(...valid.map((i) => i.perUnitRaw));
        const maxPer = Math.max(...valid.map((i) => i.perUnitRaw));
        // Only call something "best value" when it's at least 5% cheaper per
        // unit — flat-priced audio packs won't get a meaningless badge.
        if (maxPer > 0 && 1 - minPer / maxPer >= 0.05) {
          const refItem = valid.find((i) => i.perUnitRaw === maxPer);
          for (const it of items) {
            if (it.perUnitRaw === minPer) {
              it.isBestValue = true;
              it.savingsPct = Math.round((1 - minPer / maxPer) * 100);
              it.savingsVsLabel = refItem ? shortLabel(refItem.meta) : '';
            }
          }
        }
      }
      const best = items.find((i) => i.isBestValue);
      const largest = items[items.length - 1];
      out[kind] = { kind, items, defaultId: (best ?? largest)?.pkg.identifier };
    }
    return out;
  }, [packages]);

  const availableKinds = useMemo(
    () => KIND_ORDER.filter((k) => groups[k].items.length > 0),
    [groups],
  );

  // Keep the active tab valid once packages resolve (e.g. only AI exists).
  useEffect(() => {
    if (availableKinds.length && !availableKinds.includes(tab)) {
      setTab(availableKinds[0]);
    }
  }, [availableKinds, tab]);

  const buy = useCallback(async (pkg: PurchasesPackage) => {
    setBuyingId(pkg.identifier);
    const res = await purchaseTopup(pkg);
    setBuyingId(null);
    if (res.ok) {
      innerRef.current?.dismiss();
      onPurchased?.();
      toast.show('Purchase complete — your credits are on the way');
    } else if (!res.cancelled) {
      Alert.alert('Purchase failed', res.error ?? 'Please try again.');
    }
  }, [onPurchased]);

  const group = groups[tab];
  const selectedId = selected[tab] ?? group?.defaultId;

  return (
    <BottomSheet ref={innerRef}>
      <View style={styles.header}>
        <Text style={styles.title}>Buy credits</Text>
        <Text style={styles.sub}>
          Top up your audio time or AI credits. Top-ups stack on your monthly
          allowance and expire 12 months after purchase.
        </Text>
      </View>

      {packages === null ? (
        <View style={styles.center}>
          <ActivityIndicator color={tokens.colors.forest[800]} />
        </View>
      ) : availableKinds.length === 0 ? (
        <Text style={styles.empty}>
          Credit packs aren't available right now. Please try again later.
        </Text>
      ) : (
        <>
          {availableKinds.length > 1 ? (
            <View style={styles.tabRow}>
              {availableKinds.map((k) => {
                const active = k === tab;
                return (
                  <Pressable
                    key={k}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    onPress={() => setTab(k)}
                    style={[styles.tabBtn, active && styles.tabBtnActive]}
                  >
                    <Icon
                      name={KIND_TAB[k].icon}
                      size={14}
                      color={active ? tokens.colors.ink[900] : tokens.colors.ink[400]}
                    />
                    <Text style={[styles.tabLabel, active && styles.tabLabelActive]}>
                      {KIND_TAB[k].label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          ) : null}

          <View style={styles.cards}>
            {group.items.map((item) => (
              <CreditCard
                key={item.pkg.identifier}
                item={item}
                selected={item.pkg.identifier === selectedId}
                busy={buyingId === item.pkg.identifier}
                disabled={buyingId !== null}
                onSelect={() =>
                  setSelected((s) => ({ ...s, [tab]: item.pkg.identifier }))
                }
                onBuy={() => void buy(item.pkg)}
              />
            ))}
          </View>

          <Text style={styles.footer}>
            Top-ups expire 12 months after purchase · non-refundable
          </Text>
        </>
      )}
    </BottomSheet>
  );
});

function CreditCard({
  item,
  selected,
  busy,
  disabled,
  onSelect,
  onBuy,
}: {
  item: CardItem;
  selected: boolean;
  busy: boolean;
  disabled: boolean;
  onSelect: () => void;
  onBuy: () => void;
}) {
  const { pkg, meta } = item;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onSelect}
      style={[styles.card, selected && styles.cardSelected]}
    >
      <View style={styles.cardInner}>
        <View
          style={[
            styles.cardIcon,
            selected ? styles.cardIconSelected : styles.cardIconIdle,
          ]}
        >
          <Icon
            name={meta.kind === 'audio' ? 'Music' : 'Sparkles'}
            size={22}
            color={selected ? tokens.colors.forest[800] : tokens.colors.ink[500]}
          />
        </View>
        <View style={styles.cardBody}>
          {item.isBestValue ? (
            <View style={styles.badgeRow}>
              <View style={styles.bestBadge}>
                <Text style={styles.bestBadgeText}>Best value</Text>
              </View>
            </View>
          ) : null}
          <Text style={styles.cardName} numberOfLines={1}>
            {meta.name}
          </Text>
          <Text style={styles.cardDesc} numberOfLines={2}>
            {meta.description}
          </Text>
        </View>
        <View style={styles.priceCol}>
          <Text style={styles.price} numberOfLines={1}>
            {pkg.product?.priceString ?? ''}
          </Text>
          {item.perUnitLabel ? (
            <Text style={styles.pricePer} numberOfLines={1}>
              {item.perUnitLabel}
            </Text>
          ) : null}
        </View>
      </View>

      {selected ? (
        <>
          <View style={styles.divider} />
          <View style={styles.cardFooter}>
            {item.savingsPct >= 5 ? (
              <View style={styles.savingsPill}>
                <Text style={styles.savingsText}>
                  Save {item.savingsPct}%
                  {item.savingsVsLabel ? ` vs ${item.savingsVsLabel}` : ''}
                </Text>
              </View>
            ) : (
              <View />
            )}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Buy ${meta.name}`}
              disabled={disabled}
              onPress={onBuy}
              style={[styles.buyBtn, disabled && !busy && { opacity: 0.5 }]}
            >
              {busy ? (
                <ActivityIndicator size="small" color={tokens.colors.cream[50]} />
              ) : (
                <>
                  <Text style={styles.buyText}>Buy</Text>
                  <Icon
                    name="ArrowRight"
                    size={14}
                    color={tokens.colors.cream[50]}
                  />
                </>
              )}
            </Pressable>
          </View>
        </>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  header: { paddingTop: 6, paddingBottom: 14 },
  title: {
    fontFamily: tokens.fonts.display,
    fontSize: 22,
    fontWeight: '500',
    color: tokens.colors.ink[900],
    letterSpacing: -0.2,
    marginBottom: 5,
  },
  sub: {
    fontFamily: tokens.fonts.ui,
    fontSize: 13,
    lineHeight: 19,
    color: tokens.colors.ink[500],
  },
  center: { paddingVertical: 40, alignItems: 'center' },
  empty: {
    fontFamily: tokens.fonts.ui,
    fontSize: 13,
    color: tokens.colors.ink[500],
    paddingVertical: 28,
    textAlign: 'center',
  },

  // Tab switcher
  tabRow: {
    flexDirection: 'row',
    backgroundColor: tokens.colors.cream[100],
    borderRadius: 10,
    padding: 3,
    marginBottom: 16,
  },
  tabBtn: {
    flex: 1,
    height: 34,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  tabBtnActive: {
    backgroundColor: tokens.colors.cream[50],
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 2,
  },
  tabLabel: {
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 13,
    color: tokens.colors.ink[400],
  },
  tabLabelActive: { color: tokens.colors.ink[900] },

  // Cards
  cards: { gap: 10 },
  card: {
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: tokens.colors.ink[100],
    backgroundColor: tokens.colors.cream[50],
    overflow: 'hidden',
  },
  cardSelected: { borderColor: tokens.colors.forest[800] },
  cardInner: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 14 },
  cardIcon: {
    width: 46,
    height: 46,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  cardIconIdle: { backgroundColor: tokens.colors.cream[100] },
  cardIconSelected: { backgroundColor: tokens.colors.forest[50] },
  cardBody: { flex: 1, minWidth: 0 },
  badgeRow: { flexDirection: 'row', marginBottom: 5 },
  bestBadge: {
    backgroundColor: tokens.colors.forest[800],
    borderRadius: tokens.radii.full,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  bestBadgeText: {
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 9,
    letterSpacing: 0.3,
    color: tokens.colors.cream[50],
  },
  cardName: {
    fontFamily: tokens.fonts.display,
    fontSize: 15,
    fontWeight: '500',
    color: tokens.colors.ink[900],
    marginBottom: 3,
  },
  cardDesc: {
    fontFamily: tokens.fonts.ui,
    fontSize: 12,
    lineHeight: 16,
    color: tokens.colors.ink[500],
  },
  priceCol: { alignItems: 'flex-end', flexShrink: 0 },
  price: {
    fontFamily: tokens.fonts.display,
    fontSize: 17,
    fontWeight: '500',
    color: tokens.colors.ink[900],
    marginBottom: 2,
  },
  pricePer: { fontFamily: tokens.fonts.ui, fontSize: 10, color: tokens.colors.ink[400] },

  // Selected-card footer
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: tokens.colors.ink[100],
    marginHorizontal: 14,
  },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 14,
    gap: 12,
  },
  savingsPill: {
    backgroundColor: tokens.colors.forest[50],
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: tokens.colors.forest[200],
    borderRadius: tokens.radii.full,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  savingsText: {
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 11,
    color: tokens.colors.forest[800],
  },
  buyBtn: {
    minWidth: 72,
    height: 36,
    paddingHorizontal: 18,
    borderRadius: 9,
    backgroundColor: tokens.colors.forest[800],
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  buyText: {
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 13,
    color: tokens.colors.cream[50],
  },

  footer: {
    textAlign: 'center',
    fontFamily: tokens.fonts.ui,
    fontSize: 11,
    lineHeight: 16,
    color: tokens.colors.ink[400],
    paddingTop: 14,
    paddingBottom: 2,
  },
});
