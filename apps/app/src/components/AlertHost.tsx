/**
 * AlertHost — the web dialog behind `platform/alert`.
 *
 * Mounted once at the root, beside `ToastHost`, and for the same
 * reason: something raised from a catch block has no tree of its own to
 * render into. On native it subscribes to a stub that never fires and
 * renders nothing, because the OS draws the alert itself — so there is
 * no platform branch in here.
 *
 * ## The dialog
 *
 * `System / Error / Generic alert / Desktop` is 400 x 178: 24 padding,
 * the title, 6, the message, then a right-aligned button row. `Modal`
 * already owns the 400 (`layout.modal.alert`), the scrim, the centring
 * and the clamp that keeps the card inside the gutters on a window
 * narrower than it, so what is left here is the row and the mapping
 * from RN's button styles onto the design system's variants.
 *
 * **The row is deliberately horizontal.** Hard rule 2 asks for stacked
 * CTAs and it is about confirmation *bottom sheets*; a desktop dialog
 * puts its actions on one line at the right, which is what the frame
 * draws. Please do not "fix" it to stacked.
 */

import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Button } from './Button';
import { Modal } from './Modal';
import { Text } from './Text';
import { tokens } from '~/design/tokens';
import { subscribeToAlerts, type AlertRequest } from '~/platform/alert';

export function AlertHost() {
  const [queue, setQueue] = useState<AlertRequest[]>([]);

  useEffect(
    () => subscribeToAlerts((request) => setQueue((q) => [...q, request])),
    [],
  );

  const current = queue[0];
  if (!current) return null;

  const close = (onPress?: () => void) => {
    setQueue((q) => q.slice(1));
    onPress?.();
  };

  const cancel = current.buttons.find((b) => b.style === 'cancel');

  // Only the LAST non-cancel action is primary. Hard rule 8 allows one
  // per surface, and RN's convention puts the confirming action last.
  const primaryIndex = current.buttons.reduce(
    (last, b, i) => (b.style === 'cancel' ? last : i),
    -1,
  );

  return (
    <Modal
      visible
      size="alert"
      title={current.title}
      // Tapping outside means cancel, and only where cancelling is one
      // of the answers on offer. A one-button alert has to be read.
      dismissOnScrimPress={cancel !== undefined}
      onDismiss={() => close(cancel?.onPress)}
      footer={
        <View style={styles.actions}>
          {current.buttons.map((button, i) => (
            <Button
              key={`${button.text}-${i}`}
              label={button.text}
              variant={
                button.style === 'destructive'
                  ? 'destructive'
                  : button.style === 'cancel'
                    ? 'tertiary'
                    : i === primaryIndex
                      ? 'primary'
                      : 'secondary'
              }
              onPress={() => close(button.onPress)}
            />
          ))}
        </View>
      }
    >
      {current.message ? (
        <Text variant="body-md" color="secondary">
          {current.message}
        </Text>
      ) : null}
    </Modal>
  );
}

const styles = StyleSheet.create({
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: tokens.space.sm,
  },
});
