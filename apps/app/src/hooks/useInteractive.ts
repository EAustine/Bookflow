/**
 * Pointer and keyboard interaction state for §6, as props plus two
 * booleans.
 *
 * ## Why a hook and not `Pressable`'s state callback
 *
 * `Pressable` hands `hovered` and `focused` to its `style` and
 * `children` callbacks, which looks like the obvious source. It is fine
 * for a style, which is one expression. It is not fine for anything
 * that has to reach a *child*: the ring is a child, and §6's card rule
 * lifts the **cover**, not the card. Reaching either from the callback
 * means turning a component's whole JSX body into
 * `{({ hovered, focused }) => (<>…</>)}` and reindenting every line.
 * Done that way, `ListRow` was a 137-line diff for one boolean; this
 * way it is 18.
 *
 * `onFocus`, `onBlur`, `onHoverIn` and `onHoverOut` are all declared on
 * React Native's own `PressableProps` and wired by react-native-web, so
 * the same state is available without restructuring anything: spread
 * `interactiveProps`, use the booleans wherever they are needed.
 *
 * ## Why the modality check is in here
 *
 * So no caller can forget it. `focused` alone is true for a mouse
 * click, and a ring on every clicked row is exactly what §6's
 * "focus-visible" wording rules out. The hook returns `ringVisible`
 * rather than `focused`, so the only value a component can reach is
 * the one that is already correct.
 *
 * On native none of these fire, `hovered` and `ringVisible` stay false,
 * and nothing paints — §6's "touch builds show neither", with no
 * platform branch anywhere in a component.
 */

import { useCallback, useMemo, useState } from 'react';
import type { PressableProps } from 'react-native';
import { isKeyboardModality } from '~/platform/focusVisible';

export type UseInteractiveReturn = {
  /** Spread onto the `Pressable`. */
  interactiveProps: Pick<
    PressableProps,
    'onFocus' | 'onBlur' | 'onHoverIn' | 'onHoverOut'
  >;
  /** Pointer is over it. Always false on native. */
  hovered: boolean;
  /** Pass to `<FocusRing visible={…} />`. Keyboard focus only. */
  ringVisible: boolean;
};

export function useInteractive(): UseInteractiveReturn {
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);

  const onFocus = useCallback(() => setFocused(true), []);
  const onBlur = useCallback(() => setFocused(false), []);
  const onHoverIn = useCallback(() => setHovered(true), []);
  const onHoverOut = useCallback(() => setHovered(false), []);

  const interactiveProps = useMemo(
    () => ({ onFocus, onBlur, onHoverIn, onHoverOut }),
    [onFocus, onBlur, onHoverIn, onHoverOut],
  );

  return {
    interactiveProps,
    hovered,
    // Read at render rather than stored: the modality is already
    // correct by the time focus lands, because the keydown for Tab is
    // dispatched before the focus it causes.
    ringVisible: focused && isKeyboardModality(),
  };
}
