import { forwardRef, useCallback, useImperativeHandle, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  BottomSheetBackdrop,
  type BottomSheetBackdropProps,
  BottomSheetModal,
  BottomSheetView,
} from '@gorhom/bottom-sheet';
import { Icon, Text } from '~/components';
import { tokens } from '~/design/tokens';
import type { BottomSheetRef } from '~/components/BottomSheet';

// ─── Local color constants ────────────────────────────────────────────────────

const WARN = '#A0692A';
const WARN_BG = '#FDF3E3';

// ─── Mock usage data ──────────────────────────────────────────────────────────

const USAGE = {
  audioMin: 90,
  audioLimitMin: 90,
  aiCredits: 18000,
  aiLimitCredits: 50000,
  booksUsed: 1,
  booksLimit: 2,
};

// ─── Paywall trigger sheet ────────────────────────────────────────────────────

export type PaywallTriggerSheetProps = {
  onUpgrade: () => void;
  onDismiss: () => void;
};

export const PaywallTriggerSheet = forwardRef<BottomSheetRef, PaywallTriggerSheetProps>(
  function PaywallTriggerSheet({ onUpgrade, onDismiss }, ref) {
    const modalRef = useRef<BottomSheetModal>(null);

    useImperativeHandle(ref, () => ({
      present: () => modalRef.current?.present(),
      dismiss: () => modalRef.current?.dismiss(),
    }), []);

    const renderBackdrop = useCallback(
      (props: BottomSheetBackdropProps) => (
        <BottomSheetBackdrop
          {...props}
          appearsOnIndex={0}
          disappearsOnIndex={-1}
          opacity={tokens.bottomSheet.backdropOpacity}
          pressBehavior="close"
        />
      ),
      [],
    );

    const dismiss = () => modalRef.current?.dismiss();
    const aiPct = Math.round((USAGE.aiCredits / USAGE.aiLimitCredits) * 100);
    const booksPct = Math.round((USAGE.booksUsed / USAGE.booksLimit) * 100);

    return (
      <BottomSheetModal
        ref={modalRef}
        enableDynamicSizing
        backdropComponent={renderBackdrop}
        backgroundStyle={s.sheetBg}
        handleIndicatorStyle={s.sheetIndicator}
        handleStyle={s.sheetHandle}
      >
        <BottomSheetView>
          {/* Icon + headline */}
          <View style={s.triggerIconRow}>
            <View style={s.triggerIconBox}>
              <Icon name="Music" size={22} color={WARN} strokeWidth={1.5} />
            </View>
            <View style={s.triggerTextCol}>
              <Text style={s.triggerEyebrow}>Free limit reached</Text>
              <Text style={s.triggerHeadline}>
                You've used your 90 minutes of audio this month
              </Text>
            </View>
          </View>

          {/* Subline */}
          <Text style={s.triggerSub}>
            Upgrade to keep listening, or come back next month for a fresh 90 minutes.
          </Text>

          {/* Usage meters */}
          <Text style={s.metersLabel}>Your usage this month</Text>
          <View style={s.metersBlock}>
            <MeterRow
              label="Audio"
              value="90 / 90 min · limit reached"
              valueWarn
              fillColor={WARN}
              fillPct={100}
            />
            <MeterRow
              label="AI credits"
              value="18K / 50K used"
              fillColor={tokens.colors.forest[800]}
              fillPct={aiPct}
            />
            <MeterRow
              label="Books"
              value="1 / 2"
              fillColor={tokens.colors.forest[800]}
              fillPct={booksPct}
            />
          </View>

          {/* CTAs */}
          <View style={s.triggerCTAs}>
            <Pressable
              style={s.triggerPrimary}
              onPress={() => { dismiss(); onUpgrade(); }}
            >
              <Text style={s.triggerPrimaryText}>See upgrade options</Text>
            </Pressable>
            <Pressable
              style={s.triggerSecondary}
              onPress={() => { dismiss(); onDismiss(); }}
            >
              <Text style={s.triggerSecondaryText}>Maybe later</Text>
            </Pressable>
          </View>
        </BottomSheetView>
      </BottomSheetModal>
    );
  },
);

function MeterRow({
  label, value, valueWarn, fillColor, fillPct,
}: {
  label: string;
  value: string;
  valueWarn?: boolean;
  fillColor: string;
  fillPct: number;
}) {
  return (
    <View style={s.meterRow}>
      <View style={s.meterMeta}>
        <Text style={s.meterName}>{label}</Text>
        <Text style={[s.meterVal, valueWarn && s.meterValWarn]}>{value}</Text>
      </View>
      <View style={s.meterTrack}>
        <View
          style={[
            s.meterFill,
            { width: `${fillPct}%` as `${number}%`, backgroundColor: fillColor },
          ]}
        />
      </View>
    </View>
  );
}

// ─── Plan selection screen ────────────────────────────────────────────────────

type PlanKey = 'yearly' | 'monthly' | 'student';

const PLANS: {
  key: PlanKey; name: string; price: string; sub: string; desc: string; ctaLabel: string;
}[] = [
  {
    key: 'yearly', name: 'Yearly', price: '$79', sub: 'per year',
    desc: '$6.58 / month · billed as $79 once a year',
    ctaLabel: 'Start with Yearly — $79',
  },
  {
    key: 'monthly', name: 'Monthly', price: '$9.99', sub: 'per month',
    desc: 'Flexible · cancel any time',
    ctaLabel: 'Start with Monthly — $9.99/mo',
  },
  {
    key: 'student', name: 'Student', price: '$4.99', sub: 'per month',
    desc: 'Requires .edu email · same features',
    ctaLabel: 'Start with Student — $4.99/mo',
  },
];

const FEATURES: { text: string; badge?: string }[] = [
  { text: 'Unlimited audio streaming + offline downloads' },
  { text: 'Unlimited books in your library' },
  { text: '500K AI credits / month', badge: '10× more' },
  { text: '3 premium AI voices' },
  { text: 'Practice questions + conversational Q&A' },
  { text: 'Full chapter translation' },
];

export type PaywallPlanScreenProps = {
  onClose: () => void;
};

export function PaywallPlanScreen({ onClose }: PaywallPlanScreenProps) {
  const [selected, setSelected] = useState<PlanKey>('yearly');
  const plan = PLANS.find((p) => p.key === selected)!;

  return (
    <SafeAreaView style={s.planSafe} edges={['top', 'left', 'right', 'bottom']}>
      {/* Header */}
      <View style={s.planHeader}>
        <Pressable onPress={onClose} style={s.planCloseBtn} hitSlop={8}>
          <Icon name="X" size={13} color={tokens.colors.ink[700]} strokeWidth={2} />
        </Pressable>
        <Text style={s.planHeaderTitle}>Choose a plan</Text>
        <Pressable hitSlop={8}>
          <Text style={s.planRestore}>Restore</Text>
        </Pressable>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.planScroll}>
        <Text style={s.planHeadline}>Unlock the full Bookflow</Text>
        <Text style={s.planSubhead}>
          Unlimited audio, 10× more AI credits, all voices, offline downloads.
        </Text>

        {/* Plan cards */}
        <View style={s.planCards}>
          {PLANS.map((p, i) => {
            const isSelected = selected === p.key;
            const isYearly = p.key === 'yearly';
            const isLast = i === PLANS.length - 1;
            return (
              <Pressable
                key={p.key}
                onPress={() => setSelected(p.key)}
                style={[
                  s.planCard,
                  !isLast && s.planCardBorder,
                  isSelected && isYearly && s.planCardYearly,
                ]}
              >
                <View style={[s.radio, isSelected && s.radioSelected]}>
                  {isSelected && <View style={s.radioDot} />}
                </View>
                <View style={s.planCardInfo}>
                  <View style={s.planCardNameRow}>
                    <Text
                      style={[
                        s.planCardName,
                        isSelected && isYearly && { color: tokens.colors.forest[800] },
                      ]}
                    >
                      {p.name}
                    </Text>
                    {isYearly && (
                      <>
                        <View style={s.planBadge}>
                          <Text style={s.planBadgeText}>Best value</Text>
                        </View>
                        <View style={s.planSaveBadge}>
                          <Text style={s.planSaveBadgeText}>−34%</Text>
                        </View>
                      </>
                    )}
                  </View>
                  <Text
                    style={[
                      s.planCardDesc,
                      isSelected && isYearly && { color: tokens.colors.forest[700] },
                    ]}
                  >
                    {p.desc}
                  </Text>
                </View>
                <View style={s.planCardPrice}>
                  <Text
                    style={[
                      s.planPriceMain,
                      isSelected && isYearly && { color: tokens.colors.forest[800] },
                    ]}
                  >
                    {p.price}
                  </Text>
                  <Text
                    style={[
                      s.planPriceSub,
                      isSelected && isYearly && { color: tokens.colors.forest[700] },
                    ]}
                  >
                    {p.sub}
                  </Text>
                </View>
              </Pressable>
            );
          })}
        </View>

        {/* Feature list */}
        <View style={s.featuresSection}>
          <Text style={s.featuresLabel}>Everything in Standard</Text>
          <View style={s.featureRows}>
            {FEATURES.map((feat) => (
              <View key={feat.text} style={s.featureRow}>
                <View style={s.featureCheck}>
                  <Icon name="Check" size={10} color={tokens.colors.forest[800]} strokeWidth={2.5} />
                </View>
                <Text style={s.featureText}>{feat.text}</Text>
                {feat.badge && (
                  <View style={s.featureBadge}>
                    <Text style={s.featureBadgeText}>{feat.badge}</Text>
                  </View>
                )}
              </View>
            ))}
          </View>
        </View>
      </ScrollView>

      {/* CTA bar */}
      <View style={s.planCTABar}>
        <Pressable style={s.planCTA}>
          <Text style={s.planCTAText}>{plan.ctaLabel}</Text>
        </Pressable>
        <Text style={s.planTerms}>
          Auto-renews {selected === 'yearly' ? 'annually' : 'monthly'}. Cancel any time in
          Settings. By continuing you agree to our Terms and Privacy Policy.
        </Text>
      </View>
    </SafeAreaView>
  );
}

// ─── Soft warning banner ──────────────────────────────────────────────────────

export type SoftWarningBannerProps = {
  minutesLeft: number;
  onUpgrade: () => void;
  onDismiss: () => void;
};

export function SoftWarningBanner({ minutesLeft, onUpgrade, onDismiss }: SoftWarningBannerProps) {
  return (
    <Pressable onPress={onUpgrade} style={s.softWarning}>
      <Icon name="AlertTriangle" size={16} color={WARN} strokeWidth={1.5} />
      <View style={s.warnTextCol}>
        <Text style={s.warnTitle}>{minutesLeft} minutes of audio left this month</Text>
        <Text style={s.warnSub}>Tap to see upgrade options before you hit the limit.</Text>
      </View>
      <Pressable
        onPress={(e) => { e.stopPropagation?.(); onDismiss(); }}
        style={s.warnDismissBtn}
        hitSlop={8}
      >
        <Icon name="X" size={10} color={tokens.colors.ink[500]} strokeWidth={2.5} />
      </Pressable>
    </Pressable>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  // Sheet chrome
  sheetBg: { backgroundColor: tokens.bgColors.canvas },
  sheetIndicator: { backgroundColor: tokens.colors.ink[300] },
  sheetHandle: { paddingTop: 14, paddingBottom: 0 },

  // Trigger sheet
  triggerIconRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 20,
    paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: tokens.colors.ink[200],
    marginBottom: 14,
  },
  triggerIconBox: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: WARN_BG,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  triggerTextCol: { flex: 1 },
  triggerEyebrow: {
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 10,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: WARN,
    marginBottom: 3,
  },
  triggerHeadline: {
    fontFamily: tokens.fonts.display,
    fontSize: 15,
    color: tokens.colors.ink[900],
    lineHeight: 18.75,
  },
  triggerSub: {
    fontFamily: tokens.fonts.ui,
    fontSize: 12,
    color: tokens.colors.ink[500],
    lineHeight: 18.6,
    paddingHorizontal: 20,
    paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: tokens.colors.ink[200],
    marginBottom: 14,
  },
  metersLabel: {
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 10,
    letterSpacing: 0.7,
    textTransform: 'uppercase',
    color: tokens.colors.ink[400],
    paddingHorizontal: 20,
    marginBottom: 10,
  },
  metersBlock: {
    paddingHorizontal: 20,
    paddingBottom: 16,
    gap: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: tokens.colors.ink[200],
    marginBottom: 16,
  },
  meterRow: { gap: 4 },
  meterMeta: { flexDirection: 'row', justifyContent: 'space-between' },
  meterName: { fontFamily: tokens.fonts.uiMedium, fontSize: 12, color: tokens.colors.ink[700] },
  meterVal: { fontFamily: tokens.fonts.ui, fontSize: 11, color: tokens.colors.ink[400] },
  meterValWarn: { color: WARN, fontFamily: tokens.fonts.uiMedium },
  meterTrack: {
    height: 4,
    backgroundColor: tokens.colors.cream[200],
    borderRadius: 2,
    overflow: 'hidden',
  },
  meterFill: { height: 4, borderRadius: 2 },
  triggerCTAs: { paddingHorizontal: 20, paddingBottom: 28, gap: 8 },
  triggerPrimary: {
    height: 50,
    borderRadius: 10,
    backgroundColor: tokens.colors.forest[800],
    alignItems: 'center',
    justifyContent: 'center',
  },
  triggerPrimaryText: {
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 15,
    color: tokens.colors.cream[50],
  },
  triggerSecondary: { height: 44, alignItems: 'center', justifyContent: 'center' },
  triggerSecondaryText: {
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 14,
    color: tokens.colors.ink[500],
  },

  // Plan screen
  planSafe: { flex: 1, backgroundColor: tokens.bgColors.canvas },
  planHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: tokens.colors.ink[200],
  },
  planCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: tokens.colors.cream[100],
    alignItems: 'center',
    justifyContent: 'center',
  },
  planHeaderTitle: {
    fontFamily: tokens.fonts.display,
    fontSize: 16,
    color: tokens.colors.ink[900],
  },
  planRestore: { fontFamily: tokens.fonts.ui, fontSize: 12, color: tokens.colors.forest[800] },
  planScroll: { padding: 20, paddingTop: 18 },
  planHeadline: {
    fontFamily: tokens.fonts.display,
    fontSize: 20,
    color: tokens.colors.ink[900],
    letterSpacing: -0.2,
    lineHeight: 24,
    textAlign: 'center',
    marginBottom: 6,
  },
  planSubhead: {
    fontFamily: tokens.fonts.ui,
    fontSize: 13,
    color: tokens.colors.ink[500],
    textAlign: 'center',
    lineHeight: 19.5,
    marginBottom: 20,
  },
  planCards: {
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: tokens.colors.ink[200],
    marginBottom: 22,
    backgroundColor: tokens.bgColors.canvas,
  },
  planCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  planCardBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: tokens.colors.ink[200],
  },
  planCardYearly: { backgroundColor: tokens.colors.forest[50] },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: tokens.colors.ink[300],
    backgroundColor: tokens.colors.cream[50],
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  radioSelected: {
    borderColor: tokens.colors.forest[800],
    backgroundColor: tokens.colors.forest[800],
  },
  radioDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: tokens.colors.cream[50],
  },
  planCardInfo: { flex: 1, minWidth: 0 },
  planCardNameRow: { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 2 },
  planCardName: { fontFamily: tokens.fonts.uiMedium, fontSize: 14, color: tokens.colors.ink[900] },
  planBadge: {
    backgroundColor: tokens.colors.forest[800],
    borderRadius: 99,
    paddingHorizontal: 7,
    paddingVertical: 2,
    flexShrink: 0,
  },
  planBadgeText: {
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 9,
    letterSpacing: 0.4,
    color: tokens.colors.cream[50],
  },
  planSaveBadge: {
    backgroundColor: tokens.colors.amber[200],
    borderRadius: 4,
    paddingHorizontal: 7,
    paddingVertical: 2,
    flexShrink: 0,
  },
  planSaveBadgeText: { fontFamily: tokens.fonts.uiMedium, fontSize: 9, color: WARN },
  planCardDesc: { fontFamily: tokens.fonts.ui, fontSize: 11, color: tokens.colors.ink[400], lineHeight: 15.4 },
  planCardPrice: { flexShrink: 0, alignItems: 'flex-end' },
  planPriceMain: {
    fontFamily: tokens.fonts.display,
    fontSize: 15,
    color: tokens.colors.ink[900],
    lineHeight: 16.5,
  },
  planPriceSub: { fontFamily: tokens.fonts.ui, fontSize: 10, color: tokens.colors.ink[400], marginTop: 1 },
  featuresSection: { marginBottom: 16 },
  featuresLabel: {
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 10,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: tokens.colors.ink[400],
    marginBottom: 10,
  },
  featureRows: { gap: 8 },
  featureRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  featureCheck: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: tokens.colors.forest[50],
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  featureText: { fontFamily: tokens.fonts.ui, fontSize: 12, color: tokens.colors.ink[700], flex: 1 },
  featureBadge: {
    backgroundColor: tokens.colors.amber[50],
    borderRadius: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    flexShrink: 0,
  },
  featureBadgeText: { fontFamily: tokens.fonts.uiMedium, fontSize: 9, color: WARN },
  planCTABar: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 28,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: tokens.colors.ink[200],
    backgroundColor: tokens.bgColors.canvas,
  },
  planCTA: {
    height: 52,
    borderRadius: 12,
    backgroundColor: tokens.colors.forest[800],
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  planCTAText: { fontFamily: tokens.fonts.uiMedium, fontSize: 15, color: tokens.colors.cream[50] },
  planTerms: {
    fontFamily: tokens.fonts.ui,
    fontSize: 10,
    color: tokens.colors.ink[400],
    textAlign: 'center',
    lineHeight: 15,
  },

  // Soft warning banner
  softWarning: {
    marginHorizontal: 20,
    marginTop: 10,
    backgroundColor: WARN_BG,
    borderRadius: 10,
    borderWidth: 0.5,
    borderColor: tokens.colors.amber[200],
    paddingVertical: 10,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  warnTextCol: { flex: 1 },
  warnTitle: { fontFamily: tokens.fonts.uiMedium, fontSize: 12, color: WARN, marginBottom: 1 },
  warnSub: { fontFamily: tokens.fonts.ui, fontSize: 11, color: tokens.colors.ink[500] },
  warnDismissBtn: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
});
