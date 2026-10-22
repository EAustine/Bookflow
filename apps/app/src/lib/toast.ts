import { create } from 'zustand';

/**
 * App-wide toast state. A single message at a time; `nonce` bumps on every
 * `show` so the host re-triggers its slide-in animation even when the same
 * message fires twice in a row. Rendered by <ToastHost /> at the app root.
 */
type ToastState = {
  message: string | null;
  nonce: number;
  show: (message: string) => void;
  hide: () => void;
};

export const useToastStore = create<ToastState>((set) => ({
  message: null,
  nonce: 0,
  show: (message) => set((s) => ({ message, nonce: s.nonce + 1 })),
  hide: () => set({ message: null }),
}));

/** Imperative helper so non-component code can fire a toast. */
export const toast = {
  show: (message: string) => useToastStore.getState().show(message),
};
