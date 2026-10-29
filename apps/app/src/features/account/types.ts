/**
 * Shared types for the You & Settings flow.
 *
 * `YouProfile` and `YouPlan` lived in `YouScreen` and are re-exported
 * from there, so no call site changed. They moved here in M6 because
 * the extracted components under `components/` need them and importing
 * back up into the screen would be a cycle.
 */

import type { PurchasedBalances } from '~/features/ai';

export type YouProfile = {
  name: string;
  email: string;
  /** Resolved public URL of the user's profile picture (from the
   *  `avatars` bucket). Null when the user hasn't uploaded one;
   *  UI falls back to the colored-initials chip in that case. */
  avatarUrl?: string | null;
};

export type YouPlanName = 'Free' | 'Standard' | 'Premium';

export type YouPlan = {
  name: YouPlanName;
  meters: {
    audio: { used: number; total: number }; // minutes
    aiCredits: { used: number; total: number }; // tokens
    books: { used: number; total: number };
  };
  /** Purchased top-up balances, shown below the meters. */
  balances: PurchasedBalances;
};

/**
 * Which page the You tab is showing.
 *
 * On Compact this stays `'home'` and the shell's router handlers push
 * the pages instead. Above Compact the tab renders them itself — full
 * width on Medium, in the detail pane beside the master above it — so
 * this is the live state there. `'home'` is not reachable above Medium:
 * §8 leaves a separate wide You home out on purpose, because the master
 * is always visible.
 */
export type YouPage =
  | 'home'
  | 'account'
  | 'settings'
  | 'reading'
  | 'voice'
  | 'language'
  | 'notifications'
  | 'help'
  | 'feedback';

/**
 * The page that opens on arrival above Medium, since there is no wide
 * You home. It is also the first row in the master, which is what the
 * Desktop frame shows selected.
 */
export const YOU_DEFAULT_PAGE: YouPage = 'reading';
