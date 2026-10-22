/**
 * ConfirmSheetBody — the body of a confirmation bottom sheet.
 *
 * Icon tile → title → explanation → stacked CTAs. Per
 * /docs/specs/bookflow_bottom_sheet_system.html and CLAUDE.md hard rule
 * 2: confirmation sheets stack their buttons, primary on top and
 * tertiary below. Never side by side.
 *
 * Three sign-out confirmations shipped at once — `YouScreen`'s and
 * `AccountScreen`'s, byte-identical apart from where the copy wrapped,
 * and a third in a `SignOutConfirmSheet.tsx` that nothing imported.
 * Account carried a second, near-identical body for delete-account on
 * top of that. One component now, with the icon, copy and CTA label as
 * props. (F-30 follow-up.)
 */
import { StyleSheet, View } from 'react-native';
import { Button } from './Button';
import { Icon, type IconName } from './Icon';
import { Text } from './Text';
import { tokens } from '~/design/tokens';

export type ConfirmSheetBodyProps = {
  icon: IconName;
  title: string;
  body: string;
  /** Label for the confirming action. */
  confirmLabel: string;
  /** Tint for the icon and its tile. Defaults to the error palette. */
  tone?: 'error';
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

export function ConfirmSheetBody({
  icon,
  title,
  body,
  confirmLabel,
  loading = false,
  onConfirm,
  onCancel,
}: ConfirmSheetBodyProps) {
  return (
    <View>
      <View style={styles.iconWrap}>
        <Icon name={icon} size={22} color={tokens.colors.error} />
      </View>
      <Text variant="display-sm" style={styles.title}>
        {title}
      </Text>
      <Text variant="body-sm" color="muted" style={styles.body}>
        {body}
      </Text>
      <View style={styles.actions}>
        <Button
          label={confirmLabel}
          variant="destructive"
          size="large"
          fullWidth
          loading={loading}
          onPress={onConfirm}
        />
        <Button
          label="Cancel"
          variant="tertiary"
          size="standard"
          fullWidth
          disabled={loading}
          onPress={onCancel}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  iconWrap: {
    width: 48,
    height: 48,
    borderRadius: tokens.radii['2xl'],
    backgroundColor: tokens.bgColors.errorMuted,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: tokens.space.md,
  },
  title: {
    marginBottom: tokens.space.xs,
  },
  body: {
    marginBottom: tokens.space.xl,
  },
  actions: {
    gap: tokens.space.sm,
  },
});
