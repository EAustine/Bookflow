/**
 * Presenter — one content, four presentations (§3 of
 * docs/specs/responsive-handoff.md).
 *
 * Every phone sheet becomes a different container above Compact. Rather
 * than teach each of the thirty-two call sites which container it wants
 * at which width, they declare what *kind* of thing they are and this
 * picks:
 *
 * | kind      | Compact     | Medium                | Expanded / Desktop |
 * |-----------|-------------|-----------------------|--------------------|
 * | `menu`    | BottomSheet | Popover, anchored     | Popover, anchored  |
 * | `panel`   | BottomSheet | SidePanel slide-over  | SidePanel (see below) |
 * | `confirm` | BottomSheet | Modal, Confirm 440    | same               |
 * | `task`    | BottomSheet | Modal, Large 640      | same               |
 *
 * On Compact it delegates to the existing `BottomSheet` untouched, which
 * is what keeps the phone unchanged while the rest of this lands.
 *
 * The imperative `present()` / `dismiss()` ref is deliberately the same
 * shape `BottomSheet` already exposes, because all thirty-two existing
 * mount sites hold a ref and call it. Converting one is renaming the
 * component and, for a menu, passing `anchorRef` — not restructuring the
 * call site's state.
 *
 * §3 docks the panel on Expanded and Desktop. A docked panel pushes the
 * reading area, so it is a layout decision belonging to the host screen,
 * not an overlay this can render; no screen yields that width yet, so
 * every wide class gets the slide-over for now and `SidePanel` carries
 * the `docked` mode ready for the reader milestone.
 */

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import type { View } from 'react-native';
import { BottomSheet, type BottomSheetProps, type BottomSheetRef } from './BottomSheet';
import { Popover, type AnchorRect } from './Popover';
import { SidePanel } from './SidePanel';
import { Modal } from './Modal';
import { useSizeClass } from '~/hooks/useSizeClass';

export type PresenterKind = 'menu' | 'panel' | 'confirm' | 'task';

/** Same contract as `BottomSheetRef`, so call sites do not change shape. */
export type PresenterRef = BottomSheetRef;

export type PresenterProps = BottomSheetProps & {
  kind: PresenterKind;
  /**
   * The trigger a `menu` anchors its popover to, above Compact. Without
   * one the popover centres itself, which is correct but rarely what a
   * menu wants — pass the ref of the button that opened it.
   */
  anchorRef?: React.RefObject<View | null>;
  /**
   * Card width for a `menu`. Defaults to the popover's 340; a context
   * menu passes `layout/menu/width` (280). It reaches the placement
   * maths, so the edge rule answers for the card being drawn rather
   * than for a notional one.
   */
  width?: number;
  /**
   * Draw the popover's arrow. Default true. False when the anchor is
   * too wide to point at usefully — see `Popover`.
   */
  arrow?: boolean;
  /** Gap between the trigger and the card. Defaults to 8. */
  offset?: number;
};

export const Presenter = forwardRef<PresenterRef, PresenterProps>(
  function Presenter(
    {
      kind,
      anchorRef,
      width,
      arrow,
      offset,
      title,
      children,
      footer,
      onDismiss,
      enablePanDownToClose,
    },
    ref,
  ) {
    const { isWide } = useSizeClass();
    const sheetRef = useRef<BottomSheetRef>(null);
    const [open, setOpen] = useState(false);
    const [anchor, setAnchor] = useState<AnchorRect | null>(null);

    const close = useCallback(() => {
      setOpen(false);
      onDismiss?.();
    }, [onDismiss]);

    useImperativeHandle(
      ref,
      () => ({
        present: () => {
          if (!isWide) {
            sheetRef.current?.present();
            return;
          }
          const node = anchorRef?.current;
          if (kind === 'menu' && node) {
            // Measure at open time, not at mount: the trigger may have
            // moved (a scrolled list, a rotated tablet) since it last
            // laid out.
            // Named apart from the `width` prop above: the measured
            // width here is the trigger's, not the card's.
            node.measureInWindow((ax, ay, aw, ah) => {
              setAnchor({ x: ax, y: ay, width: aw, height: ah });
              setOpen(true);
            });
            return;
          }
          setAnchor(null);
          setOpen(true);
        },
        dismiss: () => {
          if (!isWide) {
            sheetRef.current?.dismiss();
            return;
          }
          close();
        },
      }),
      [isWide, kind, anchorRef, close],
    );

    // Crossing a size-class boundary while something is open would leave
    // the old container's state behind — a popover anchored to a
    // coordinate that no longer means anything, or a sheet whose wide
    // twin is also showing. Close instead; re-opening is one tap.
    useEffect(() => {
      setOpen(false);
      sheetRef.current?.dismiss();
    }, [isWide]);

    if (!isWide) {
      return (
        <BottomSheet
          ref={sheetRef}
          title={title}
          footer={footer}
          onDismiss={onDismiss}
          enablePanDownToClose={enablePanDownToClose}
        >
          {children}
        </BottomSheet>
      );
    }

    if (kind === 'menu') {
      return (
        <Popover
          visible={open}
          anchor={anchor}
          width={width}
          arrow={arrow}
          offset={offset}
          onDismiss={close}
          title={title}
          footer={footer}
        >
          {children}
        </Popover>
      );
    }

    if (kind === 'panel') {
      return (
        <SidePanel visible={open} onDismiss={close} title={title} footer={footer}>
          {children}
        </SidePanel>
      );
    }

    return (
      <Modal
        visible={open}
        size={kind === 'task' ? 'large' : 'confirm'}
        onDismiss={close}
        title={title}
        footer={footer}
        // A confirm sheet that cannot be panned down is one the caller
        // wants to insist on (signing out mid-flight, a delete in
        // progress). Honour the same intent on the scrim.
        dismissOnScrimPress={enablePanDownToClose !== false}
      >
        {children}
      </Modal>
    );
  },
);
