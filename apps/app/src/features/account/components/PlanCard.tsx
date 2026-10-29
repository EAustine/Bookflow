/**
 * PlanCard — the You tab's plan card. Figma `Plan card`.
 *
 * Free users get the dark forest card with three meters and an upgrade
 * CTA; subscribers get `ProPlanCard`, a two-section hero with usage
 * rows and a Manage plan row.
 *
 * Extracted in M6 because the frames render it at three widths — 408
 * in the 440 master, 568 in the 600 Medium column and 528 in the 560
 * detail column — so it had to stop being a block inside one screen.
 * It carries its own 16 horizontal margin, which is the inset every
 * frame uses, and fills whatever width the container gives it.
 *
 * **Not the only plan card in the flow.** `AccountScreen` has its own
 * `FreePlanCard` and `ProPlanCard`: a light `subCard` with an eyebrow
 * stack, an Upgrade pill and a feature list. Figma uses one `Plan card`
 * instance on both surfaces, at 408 and 528, so the two designs are a
 * real divergence — but collapsing them means choosing one and
 * redrawing the other, which is a design call and not a responsive
 * one. Recorded rather than guessed at.
 */

import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import {
  TopupBalanceBlock,
  useProSubscriptionDetails,
  type TopupKind,
} from '~/features/billing';
import { Badge, Icon, Text } from '~/components';
import { tokens } from '~/design/tokens';
import type { YouPlan } from '../types';

export type PlanCardProps = {
  plan: YouPlan;
  onUpgrade: () => void;
  onManage: () => void;
  /** Threaded to the top-up block so the tab hosts one buy modal. */
  onBuy?: (kind: TopupKind) => void;
};

export function PlanCard({ plan, onUpgrade, onManage, onBuy }: PlanCardProps) {
  // Subscribers get the richer two-section card; free users keep the
  // compact meters + upgrade CTA.
  if (plan.name !== 'Free') {
    return <ProPlanCard plan={plan} onManage={onManage} onBuy={onBuy} />;
  }

  const audioPct = pct(plan.meters.audio.used, plan.meters.audio.total);
  const aiPct = pct(plan.meters.aiCredits.used, plan.meters.aiCredits.total);
  const booksPct = pct(plan.meters.books.used, plan.meters.books.total);

  return (
    <View style={styles.planCard}>
      <View style={styles.planHeader}>
        <Text style={styles.planLabel} numberOfLines={1}>
          YOUR PLAN
        </Text>
        <Badge kind="plan" label={plan.name} />
      </View>

      <View style={styles.meters}>
        <Meter
          name="Audio"
          value={`${plan.meters.audio.used} / ${plan.meters.audio.total} min`}
          percent={audioPct}
        />
        <Meter
          name="AI credits"
          value={`${formatTokens(plan.meters.aiCredits.used)} / ${formatTokens(
            plan.meters.aiCredits.total,
          )} tokens`}
          percent={aiPct}
        />
        <Meter
          name="Books"
          value={`${plan.meters.books.used} / ${plan.meters.books.total}`}
          percent={booksPct}
        />
      </View>

      <TopupBalanceBlock balances={plan.balances} onDark onBuy={onBuy} />

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Upgrade to Standard"
        onPress={onUpgrade}
        style={({ pressed }) => [
          styles.upgradeBtn,
          pressed && { backgroundColor: tokens.colors.amber[200] },
        ]}
      >
        <Icon name="Sparkles" size={14} color={tokens.colors.forest[900]} />
        <Text style={styles.upgradeBtnLabel}>Upgrade to Standard</Text>
      </Pressable>
    </View>
  );
}

// ─── Pro plan card — two-section hero design ──────────────────────────────

function ProPlanCard({
  plan,
  onManage,
  onBuy,
}: {
  plan: YouPlan;
  onManage: () => void;
  onBuy?: (kind: TopupKind) => void;
}) {
  const { renewalLabel, priceLabel } = useProSubscriptionDetails();
  const renewsLine =
    renewalLabel && priceLabel
      ? `Renews ${renewalLabel} · ${priceLabel}`
      : priceLabel
        ? `Active · ${priceLabel}`
        : renewalLabel
          ? `Renews ${renewalLabel}`
          : 'Active subscription';

  const aiUsed = plan.meters.aiCredits.used;
  const aiTotal = plan.meters.aiCredits.total;
  const aiPct =
    aiTotal > 0 && aiTotal !== Infinity
      ? Math.min(100, (aiUsed / aiTotal) * 100)
      : 0;

  return (
    <View style={styles.proCard}>
      {/* Top — dark forest hero */}
      <View style={styles.proTop}>
        <View style={styles.proLabelRow}>
          <Text style={styles.proEyebrow}>Your plan</Text>
          <Badge kind="active" label="Active" />
        </View>
        <Text style={styles.proNameHero}>{plan.name}</Text>
        <Text style={styles.proRenews}>{renewsLine}</Text>
      </View>

      {/* Bottom — cream usage meters */}
      <View style={styles.proBottom}>
        <Text style={styles.proUsageLabel}>This month</Text>

        <View style={styles.proUsageRows}>
          <ProUsageRow
            icon={
              <Icon name="Headphones" size={14} color={tokens.colors.ink[500]} />
            }
            name="Audio"
            unlimited={plan.meters.audio.total === Infinity}
            value={`${plan.meters.audio.used} / ${plan.meters.audio.total} min`}
          />
          <ProUsageRow
            icon={
              <Icon name="Books" size={14} color={tokens.colors.ink[500]} />
            }
            name="Books"
            unlimited={plan.meters.books.total === Infinity}
            value={`${plan.meters.books.used} / ${plan.meters.books.total}`}
          />
          <ProUsageRow
            icon={
              <Icon name="Sparkles" size={14} color={tokens.colors.ink[500]} />
            }
            name="AI credits"
            value={`${formatTokens(aiUsed)} / ${formatTokens(aiTotal)}`}
            percent={aiPct}
            resetLabel={nextResetLabel()}
          />
        </View>

        <TopupBalanceBlock balances={plan.balances} onBuy={onBuy} />

        <View style={styles.proDivider} />

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Manage plan"
          onPress={onManage}
          style={({ pressed }) => [styles.manageRow, pressed && { opacity: 0.6 }]}
        >
          <View style={styles.manageLeft}>
            <Icon name="Settings" size={16} color={tokens.colors.ink[500]} />
            <Text style={styles.manageText}>Manage plan</Text>
          </View>
          <Icon
            name="ChevronRight"
            size={14}
            color={tokens.textColors.subtle}
          />
        </Pressable>
      </View>
    </View>
  );
}

function ProUsageRow({
  icon,
  name,
  value,
  unlimited,
  percent,
  resetLabel,
}: {
  icon: ReactNode;
  name: string;
  value?: string;
  unlimited?: boolean;
  percent?: number;
  resetLabel?: string;
}) {
  return (
    <View style={styles.proUsageRow}>
      <View style={styles.proUsageRowTop}>
        <View style={styles.proUsageName}>
          {icon}
          <Text style={styles.proUsageNameText}>{name}</Text>
        </View>
        {unlimited ? (
          <Badge kind="unlimited" label="Unlimited" />
        ) : (
          <Text style={styles.proUsageValue}>{value}</Text>
        )}
      </View>
      {percent !== undefined && (
        <>
          <View style={styles.proUsageTrack}>
            <View
              style={[
                styles.proUsageFill,
                { width: `${Math.max(0, Math.min(100, percent))}%` },
              ]}
            />
          </View>
          {resetLabel ? (
            <Text style={styles.proUsageTrackLabel}>{resetLabel}</Text>
          ) : null}
        </>
      )}
    </View>
  );
}

/** "Resets Jul 1" — the first of next month, when monthly allowances roll. */
function nextResetLabel(): string {
  try {
    const d = new Date();
    const next = new Date(d.getFullYear(), d.getMonth() + 1, 1);
    return `Resets ${next.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    })}`;
  } catch {
    return 'Resets monthly';
  }
}

function Meter({
  name,
  value,
  percent,
}: {
  name: string;
  value: string;
  percent: number;
}) {
  // Uniform muted-forest fill across every meter (audio / AI / books) so they
  // read as one consistent set, rather than one bar flipping amber at ≥80%.
  const fillColor = tokens.colors.forest[200];
  const clamped = Math.max(0, Math.min(100, percent));

  // There is deliberately no `unlimited` branch here. The free plan card
  // is the only caller and all three of its meters have finite totals;
  // the unlimited treatment belongs to `ProUsageRow`'s
  // Badge kind="unlimited", which is canonical. (F-32.)
  return (
    <View style={styles.meterRow}>
      <View style={styles.meterMeta}>
        <Text style={styles.meterName}>{name}</Text>
        <Text style={styles.meterValue}>{value}</Text>
      </View>
      <View style={styles.meterTrack}>
        <View
          style={[
            styles.meterFill,
            { width: `${clamped}%`, backgroundColor: fillColor },
          ]}
        />
      </View>
    </View>
  );
}

function pct(used: number, total: number): number {
  if (total <= 0) return 0;
  return (used / total) * 100;
}

function formatTokens(n: number): string {
  if (n >= 1000) {
    const k = n / 1000;
    return Number.isInteger(k) ? `${k}K` : `${k.toFixed(1)}K`;
  }
  return String(n);
}

const styles = StyleSheet.create({
  planCard: {
    marginHorizontal: tokens.space.lg,
    marginBottom: tokens.space.xl,
    backgroundColor: tokens.colors.forest[800],
    borderRadius: tokens.radii['2xl'],
    padding: tokens.space.lg,
  },
  planHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: tokens.space.md,
  },
  planLabel: {
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 11,
    lineHeight: 16,
    fontWeight: '500',
    letterSpacing: 0.9,
    color: tokens.colors.forest[200],
    // Android under-measures a tracked, weighted string, so the row
    // hands this Text less width than the glyphs need and "YOUR PLAN"
    // broke after "YOUR". It only showed at density 160, which is how
    // the tablet widths are tested — the phone at 320 was always fine,
    // on a card 80dp narrower. `flexShrink: 0` keeps the row from
    // squeezing it and `numberOfLines` keeps a bad measure from
    // wrapping rather than clipping.
    flexShrink: 0,
  },
  meters: {
    gap: tokens.space.md,
    marginBottom: tokens.space.md,
  },
  meterRow: {
    gap: 5,
  },
  meterMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  meterName: {
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '500',
    color: tokens.colors.forest[200],
  },
  meterValue: {
    fontFamily: tokens.fonts.ui,
    fontSize: 11,
    lineHeight: 16,
    color: tokens.colors.forest[200],
    opacity: 0.75,
  },
  meterTrack: {
    height: 4,
    backgroundColor: tokens.overlay.onDark.track,
    borderRadius: 2,
    overflow: 'hidden',
  },
  meterFill: {
    height: '100%',
    borderRadius: 2,
  },
  upgradeBtn: {
    height: 40,
    borderRadius: tokens.radii.md,
    backgroundColor: tokens.colors.amber[500],
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: tokens.space.xs,
  },
  upgradeBtnLabel: {
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '500',
    color: tokens.colors.forest[900],
  },
  proCard: {
    marginHorizontal: tokens.space.lg,
    marginBottom: tokens.space.xl,
    borderRadius: tokens.radii['2xl'],
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: tokens.colors.ink[200],
  },
  proTop: {
    backgroundColor: tokens.colors.forest[800],
    paddingHorizontal: tokens.space.lg,
    paddingVertical: tokens.space.md,
  },
  proLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  proEyebrow: {
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 10,
    fontWeight: '500',
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: tokens.colors.forest[400],
  },
  proNameHero: {
    fontFamily: tokens.fonts.display,
    fontSize: 28,
    lineHeight: 31,
    letterSpacing: -0.5,
    color: tokens.colors.cream[50],
    marginBottom: 4,
  },
  proRenews: {
    fontFamily: tokens.fonts.ui,
    fontSize: 12,
    lineHeight: 16,
    color: tokens.colors.forest[200],
  },
  proBottom: {
    backgroundColor: tokens.colors.cream[100],
    paddingHorizontal: tokens.space.lg,
    paddingTop: tokens.space.md,
    paddingBottom: 18,
  },
  proUsageLabel: {
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 10,
    fontWeight: '500',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: tokens.colors.ink[400],
    marginBottom: 12,
  },
  proUsageRows: {
    gap: 12,
    marginBottom: 16,
  },
  proUsageRow: {
    gap: 5,
  },
  proUsageRowTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  proUsageName: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  proUsageNameText: {
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 13,
    fontWeight: '500',
    color: tokens.colors.ink[700],
  },
  proUsageValue: {
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 12,
    fontWeight: '500',
    color: tokens.colors.forest[800],
  },
  proUsageTrack: {
    height: 4,
    backgroundColor: tokens.colors.ink[100],
    borderRadius: 2,
    overflow: 'hidden',
  },
  proUsageFill: {
    height: '100%',
    borderRadius: 2,
    backgroundColor: tokens.colors.forest[800],
  },
  proUsageTrackLabel: {
    fontFamily: tokens.fonts.ui,
    fontSize: 10,
    color: tokens.colors.ink[400],
    marginTop: 2,
  },
  proDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: tokens.colors.ink[200],
    marginBottom: 14,
  },
  manageRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  manageLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  manageText: {
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 13,
    fontWeight: '500',
    color: tokens.colors.ink[700],
  },
});
