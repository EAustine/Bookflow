/**
 * Whether the shell is currently drawing its side rail.
 *
 * `ToastHost` is mounted at the window root, deliberately — it sits
 * outside `BottomSheetModalProvider` so toasts paint above bottom
 * sheets — which means it cannot see the shell's own `railHidden`.
 * §4 asks the toast to centre over the *content area*, so it needs to
 * know, and the size class alone is not enough: the reader and the
 * foreground player are wide surfaces with no rail, and a toast
 * offset by 240 there would sit off-centre the other way.
 *
 * One boolean, written by `SignedInShell` and read by the toast.
 * Deliberately not part of the toast store: it describes the shell,
 * and anything else that has to clear the rail can read it too.
 */

import { create } from 'zustand';

type ShellChromeState = {
  /** True only when the rail is actually on screen. */
  railVisible: boolean;
  setRailVisible: (visible: boolean) => void;
};

export const useShellChromeStore = create<ShellChromeState>((set) => ({
  railVisible: false,
  setRailVisible: (railVisible) =>
    set((s) => (s.railVisible === railVisible ? s : { railVisible })),
}));
