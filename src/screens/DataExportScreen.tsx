import { forwardRef, useCallback, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  BottomSheetBackdrop,
  type BottomSheetBackdropProps,
  BottomSheetModal,
  BottomSheetView,
} from '@gorhom/bottom-sheet';
import { Icon, type IconName, Text } from '~/components';
import { tokens } from '~/design/tokens';

// ─── Props ────────────────────────────────────────────────────────────────────

export type DataExportScreenProps = {
  userEmail: string;
  onBack: () => void;
  onDone: () => void;
};

// ─── What's included ──────────────────────────────────────────────────────────

const INCLUDED_ITEMS: { icon: IconName; title: string; sub: string }[] = [
  { icon: 'User',          title: 'Profile & account',           sub: 'Name, email, account details' },
  { icon: 'Books',         title: 'Library & reading progress',  sub: 'All books, chapter progress, timestamps' },
  { icon: 'Headphones',    title: 'Listening history',           sub: 'Session logs with duration and date' },
  { icon: 'MessageCircle', title: 'AI conversations & summaries',sub: 'All Q&A threads, generated summaries' },
  { icon: 'Notebook',      title: 'Saved vocabulary',            sub: 'Words saved from tap-to-translate' },
];

// ─── Screen ───────────────────────────────────────────────────────────────────

type ExportStep = 'request' | 'success';

export function DataExportScreen({ userEmail, onBack, onDone }: DataExportScreenProps) {
  const [step, setStep] = useState<ExportStep>('request');
  const confirmSheetRef = useRef<BottomSheetModal>(null);

  const handleConfirm = useCallback(() => {
    confirmSheetRef.current?.dismiss();
    setStep('success');
  }, []);

  if (step === 'success') {
    return <ExportSuccessScreen userEmail={userEmail} onDone={onDone} />;
  }

  return (
    <>
      <SafeAreaView style={styles.safe} edges={['top', 'left', 'right', 'bottom']}>
        {/* Header */}
        <View style={styles.header}>
          <Pressable
            style={({ pressed }) => [styles.backBtn, pressed && { opacity: 0.7 }]}
            onPress={onBack}
            hitSlop={8}
            accessibilityLabel="Back"
            accessibilityRole="button"
          >
            <Icon name="ArrowLeft" size={16} color={tokens.textColors.secondary} />
          </Pressable>
          <Text style={styles.headerTitle}>Export my data</Text>
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Icon + intro */}
          <View style={styles.exportIcon}>
            <Icon name="Download" size={28} color={tokens.colors.forest[800]} strokeWidth={1.5} />
          </View>
          <Text style={styles.exportTitle}>Download a copy of your data</Text>
          <Text style={styles.exportSub}>
            You have the right to export everything Bookflow knows about you. We'll prepare a zip
            file with your data and send it to your email within 48 hours.
          </Text>

          {/* What's included */}
          <Text style={styles.includedLabel}>What's included</Text>
          <View style={styles.includedGroup}>
            {INCLUDED_ITEMS.map((item, i) => (
              <View
                key={item.title}
                style={[styles.includedRow, i < INCLUDED_ITEMS.length - 1 && styles.includedRowBorder]}
              >
                <View style={styles.includedIcon}>
                  <Icon name={item.icon} size={14} color={tokens.colors.forest[800]} strokeWidth={1.5} />
                </View>
                <View style={styles.includedText}>
                  <Text style={styles.includedTitle}>{item.title}</Text>
                  <Text style={styles.includedSub}>{item.sub}</Text>
                </View>
              </View>
            ))}
          </View>

          {/* Delivery note */}
          <View style={styles.deliveryNote}>
            <Icon name="Info" size={14} color={tokens.textColors.muted} strokeWidth={1.5} />
            <Text style={styles.deliveryText}>
              Your export will be sent to{' '}
              <Text style={styles.deliveryEmail}>{userEmail}</Text>
              {' '}within 48 hours. The download link expires after 7 days. Format: JSON + CSV in a
              single zip file.
            </Text>
          </View>

          {/* CTA */}
          <Pressable
            style={({ pressed }) => [styles.exportBtn, pressed && { opacity: 0.85 }]}
            onPress={() => confirmSheetRef.current?.present()}
            accessibilityRole="button"
          >
            <Icon name="Download" size={14} color={tokens.colors.cream[50]} strokeWidth={1.5} />
            <Text style={styles.exportBtnLabel}>Request data export</Text>
          </Pressable>
        </ScrollView>
      </SafeAreaView>

      {/* Confirmation sheet */}
      <ExportConfirmSheet
        ref={confirmSheetRef}
        userEmail={userEmail}
        onConfirm={handleConfirm}
        onCancel={() => confirmSheetRef.current?.dismiss()}
      />
    </>
  );
}

// ─── Confirmation sheet ───────────────────────────────────────────────────────

const ExportConfirmSheet = forwardRef<
  BottomSheetModal,
  { userEmail: string; onConfirm: () => void; onCancel: () => void }
>(function ExportConfirmSheet({ userEmail, onConfirm, onCancel }, ref) {
  const renderBackdrop = useCallback(
    (props: BottomSheetBackdropProps) => (
      <BottomSheetBackdrop
        {...props}
        appearsOnIndex={0}
        disappearsOnIndex={-1}
        opacity={0.45}
        pressBehavior="close"
        onPress={onCancel}
      />
    ),
    [onCancel],
  );

  const CONFIRM_ROWS: { label: string; value: string }[] = [
    { label: 'Sent to',      value: userEmail },
    { label: 'Ready within', value: '48 hours' },
    { label: 'Link expires', value: '7 days after delivery' },
    { label: 'Format',       value: 'JSON + CSV (.zip)' },
  ];

  return (
    <BottomSheetModal
      ref={ref}
      enableDynamicSizing
      backdropComponent={renderBackdrop}
      backgroundStyle={sheetStyles.bg}
      handleIndicatorStyle={sheetStyles.handle}
      handleStyle={sheetStyles.handleWrap}
      onDismiss={onCancel}
    >
      <BottomSheetView style={sheetStyles.content}>
        {/* Icon */}
        <View style={sheetStyles.iconWrap}>
          <Icon name="Download" size={26} color={tokens.colors.forest[800]} strokeWidth={1.5} />
        </View>

        <Text style={sheetStyles.title}>Confirm export request</Text>
        <Text style={sheetStyles.sub}>
          We'll prepare your data export and email you a secure download link when it's ready.
        </Text>

        {/* Summary card */}
        <View style={sheetStyles.summaryCard}>
          {CONFIRM_ROWS.map((row, i) => (
            <View
              key={row.label}
              style={[sheetStyles.summaryRow, i < CONFIRM_ROWS.length - 1 && sheetStyles.summaryRowBorder]}
            >
              <Text style={sheetStyles.summaryLabel}>{row.label}</Text>
              <Text style={sheetStyles.summaryValue} numberOfLines={1}>{row.value}</Text>
            </View>
          ))}
        </View>

        {/* CTAs */}
        <Pressable
          style={({ pressed }) => [sheetStyles.confirmBtn, pressed && { opacity: 0.85 }]}
          onPress={onConfirm}
          accessibilityRole="button"
        >
          <Icon name="Download" size={14} color={tokens.colors.cream[50]} strokeWidth={1.5} />
          <Text style={sheetStyles.confirmBtnLabel}>Confirm &amp; request export</Text>
        </Pressable>
        <Pressable
          style={({ pressed }) => [sheetStyles.cancelBtn, pressed && { opacity: 0.7 }]}
          onPress={onCancel}
          accessibilityRole="button"
        >
          <Text style={sheetStyles.cancelBtnLabel}>Cancel</Text>
        </Pressable>
      </BottomSheetView>
    </BottomSheetModal>
  );
});

// ─── Success screen ───────────────────────────────────────────────────────────

function ExportSuccessScreen({ userEmail, onDone }: { userEmail: string; onDone: () => void }) {
  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right', 'bottom']}>
      <View style={successStyles.container}>
        {/* Ring */}
        <View style={successStyles.ring}>
          <Icon name="Download" size={36} color={tokens.colors.success} strokeWidth={1.5} />
        </View>

        <Text style={successStyles.title}>Export requested</Text>
        <Text style={successStyles.sub}>
          We're preparing your data. You'll receive an email at{' '}
          <Text style={successStyles.subEmail}>{userEmail}</Text> within 48 hours with a secure
          download link.
        </Text>

        {/* Email preview card */}
        <View style={successStyles.emailCard}>
          {/* Email header */}
          <View style={successStyles.emailHeader}>
            <View style={successStyles.emailHeaderIcon}>
              <Icon name="Mail" size={16} color={tokens.colors.cream[50]} strokeWidth={1.5} />
            </View>
            <View style={successStyles.emailHeaderText}>
              <Text style={successStyles.emailFrom}>FROM: no-reply@bookflow.app</Text>
              <Text style={successStyles.emailSubject}>Your Bookflow data export is ready</Text>
            </View>
          </View>
          {/* Email body */}
          <View style={successStyles.emailBody}>
            <Text style={successStyles.emailGreeting}>Hi there,</Text>
            <Text style={successStyles.emailText}>
              Your data export is ready. The zip file includes your profile, library, reading
              progress, listening history, AI conversations, and saved vocabulary in JSON and CSV
              formats.
            </Text>
            <Pressable
              style={({ pressed }) => [successStyles.downloadBtn, pressed && { opacity: 0.85 }]}
              onPress={() => {}}
              accessibilityRole="button"
            >
              <Icon name="Download" size={12} color={tokens.colors.cream[50]} strokeWidth={1.5} />
              <Text style={successStyles.downloadBtnLabel}>Download export (.zip · 2.1 MB)</Text>
            </Pressable>
            <Text style={successStyles.emailExpires}>Link expires in 7 days</Text>
          </View>
        </View>

        {/* Done */}
        <Pressable
          style={({ pressed }) => [successStyles.doneBtn, pressed && { opacity: 0.8 }]}
          onPress={onDone}
          accessibilityRole="button"
        >
          <Text style={successStyles.doneBtnLabel}>Done</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: tokens.bgColors.canvas,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderBottomWidth: 0.5,
    borderBottomColor: tokens.borderColors.subtle,
  },
  backBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: tokens.bgColors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  headerTitle: {
    fontFamily: tokens.fonts.display,
    fontSize: 16,
    fontWeight: '500',
    color: tokens.textColors.primary,
  },
  scroll: { flex: 1 },
  scrollContent: {
    padding: 22,
    paddingBottom: 40,
  },

  // Export intro
  exportIcon: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: tokens.colors.forest[50],
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 18,
  },
  exportTitle: {
    fontFamily: tokens.fonts.display,
    fontSize: 20,
    fontWeight: '500',
    color: tokens.textColors.primary,
    lineHeight: 26,
    marginBottom: 6,
  },
  exportSub: {
    fontFamily: tokens.fonts.ui,
    fontSize: 13,
    color: tokens.textColors.muted,
    lineHeight: 21,
    marginBottom: 22,
  },

  // Included list
  includedLabel: {
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 11,
    fontWeight: '500',
    letterSpacing: 0.07,
    textTransform: 'uppercase',
    color: tokens.textColors.disabled,
    marginBottom: 10,
  },
  includedGroup: {
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 0.5,
    borderColor: tokens.borderColors.subtle,
    marginBottom: 22,
  },
  includedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 11,
    paddingHorizontal: 14,
    backgroundColor: tokens.bgColors.canvas,
  },
  includedRowBorder: {
    borderBottomWidth: 0.5,
    borderBottomColor: tokens.borderColors.subtle,
  },
  includedIcon: {
    width: 28,
    height: 28,
    borderRadius: 7,
    backgroundColor: tokens.colors.forest[50],
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  includedText: { flex: 1 },
  includedTitle: {
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 13,
    fontWeight: '500',
    color: tokens.textColors.primary,
  },
  includedSub: {
    fontFamily: tokens.fonts.ui,
    fontSize: 11,
    color: tokens.textColors.muted,
    marginTop: 1,
  },

  // Delivery note
  deliveryNote: {
    flexDirection: 'row',
    gap: 10,
    backgroundColor: tokens.bgColors.surface,
    borderRadius: 10,
    padding: 12,
    paddingHorizontal: 14,
    marginBottom: 24,
    borderWidth: 0.5,
    borderColor: tokens.borderColors.subtle,
    alignItems: 'flex-start',
  },
  deliveryText: {
    flex: 1,
    fontFamily: tokens.fonts.ui,
    fontSize: 12,
    color: tokens.textColors.secondary,
    lineHeight: 19,
  },
  deliveryEmail: {
    fontFamily: tokens.fonts.uiMedium,
    fontWeight: '500',
    color: tokens.textColors.primary,
  },

  // Export CTA
  exportBtn: {
    height: 50,
    borderRadius: 12,
    backgroundColor: tokens.colors.forest[800],
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  exportBtnLabel: {
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 15,
    fontWeight: '500',
    color: tokens.colors.cream[50],
  },
});

// Confirmation sheet styles
const sheetStyles = StyleSheet.create({
  bg: { backgroundColor: tokens.bgColors.canvas },
  handle: {
    backgroundColor: tokens.colors.ink[300],
    width: 32,
  },
  handleWrap: { paddingBottom: 0 },
  content: {
    paddingHorizontal: 22,
    paddingBottom: 28,
    paddingTop: 4,
  },
  iconWrap: {
    width: 56,
    height: 56,
    borderRadius: 16,
    backgroundColor: tokens.colors.forest[50],
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  title: {
    fontFamily: tokens.fonts.display,
    fontSize: 19,
    fontWeight: '500',
    color: tokens.textColors.primary,
    lineHeight: 25,
    marginBottom: 6,
  },
  sub: {
    fontFamily: tokens.fonts.ui,
    fontSize: 13,
    color: tokens.textColors.muted,
    lineHeight: 21,
    marginBottom: 18,
  },
  summaryCard: {
    backgroundColor: tokens.bgColors.surface,
    borderRadius: 10,
    overflow: 'hidden',
    marginBottom: 18,
    borderWidth: 0.5,
    borderColor: tokens.borderColors.subtle,
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  summaryRowBorder: {
    borderBottomWidth: 0.5,
    borderBottomColor: tokens.borderColors.subtle,
  },
  summaryLabel: {
    fontFamily: tokens.fonts.ui,
    fontSize: 12,
    color: tokens.textColors.muted,
  },
  summaryValue: {
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 12,
    fontWeight: '500',
    color: tokens.textColors.primary,
    maxWidth: '55%',
    textAlign: 'right',
  },
  confirmBtn: {
    height: 50,
    borderRadius: 12,
    backgroundColor: tokens.colors.forest[800],
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 8,
  },
  confirmBtnLabel: {
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 15,
    fontWeight: '500',
    color: tokens.colors.cream[50],
  },
  cancelBtn: {
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelBtnLabel: {
    fontFamily: tokens.fonts.ui,
    fontSize: 14,
    color: tokens.textColors.muted,
  },
});

// Success screen styles
const successStyles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
    paddingBottom: 40,
  },
  ring: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: tokens.bgColors.successMuted,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 22,
  },
  title: {
    fontFamily: tokens.fonts.display,
    fontSize: 22,
    fontWeight: '500',
    color: tokens.textColors.primary,
    lineHeight: 28,
    marginBottom: 6,
    textAlign: 'center',
  },
  sub: {
    fontFamily: tokens.fonts.ui,
    fontSize: 13,
    color: tokens.textColors.muted,
    lineHeight: 21,
    textAlign: 'center',
    marginBottom: 28,
    maxWidth: 280,
  },
  subEmail: {
    fontFamily: tokens.fonts.uiMedium,
    fontWeight: '500',
    color: tokens.textColors.secondary,
  },

  // Email preview
  emailCard: {
    width: '100%',
    backgroundColor: tokens.bgColors.surface,
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 0.5,
    borderColor: tokens.borderColors.subtle,
    marginBottom: 28,
  },
  emailHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 14,
    paddingHorizontal: 16,
    backgroundColor: tokens.colors.forest[800],
  },
  emailHeaderIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  emailHeaderText: { flex: 1 },
  emailFrom: {
    fontFamily: tokens.fonts.ui,
    fontSize: 10,
    color: tokens.colors.forest[200],
    marginBottom: 2,
  },
  emailSubject: {
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 13,
    fontWeight: '500',
    color: tokens.colors.cream[50],
  },
  emailBody: {
    padding: 14,
    paddingHorizontal: 16,
  },
  emailGreeting: {
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 13,
    fontWeight: '500',
    color: tokens.textColors.primary,
    marginBottom: 6,
  },
  emailText: {
    fontFamily: tokens.fonts.ui,
    fontSize: 12,
    color: tokens.textColors.secondary,
    lineHeight: 19,
    marginBottom: 14,
  },
  downloadBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    height: 36,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: tokens.colors.forest[800],
    marginBottom: 8,
  },
  downloadBtnLabel: {
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 12,
    fontWeight: '500',
    color: tokens.colors.cream[50],
  },
  emailExpires: {
    fontFamily: tokens.fonts.ui,
    fontSize: 10,
    color: tokens.textColors.disabled,
  },

  // Done button
  doneBtn: {
    width: '100%',
    height: 50,
    borderRadius: 12,
    backgroundColor: tokens.bgColors.surface,
    borderWidth: 0.5,
    borderColor: tokens.borderColors.subtle,
    alignItems: 'center',
    justifyContent: 'center',
  },
  doneBtnLabel: {
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 15,
    fontWeight: '500',
    color: tokens.textColors.secondary,
  },
});
