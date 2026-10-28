/**
 * The current size class — §1 of docs/specs/responsive-handoff.md.
 *
 * Width decides the layout; platform decides web-only traits. The two
 * are returned separately on purpose. The brief's §2, §4 and §8 hang
 * several behaviours on "Desktop" that are really about being on the
 * web rather than about being wide — no status bar, no splash, no pull
 * to refresh, hover and focus states — and a tablet can be 1440 wide.
 * Branch on `sizeClass` for layout and on `isWeb` for those.
 *
 * `useWindowDimensions` re-renders on resize and rotation, which is what
 * makes this a hook rather than a module constant: a tablet rotating
 * from 820 to 1180 crosses a class boundary mid-session.
 *
 * `tokens.layout.gutter` is keyed by exactly this union, so the page
 * gutter is `tokens.layout.gutter[sizeClass]` with no lookup table.
 */

import { Platform, useWindowDimensions } from 'react-native';
import { layoutClassFor, type LayoutClass } from '~/design/tokens';

export type SizeClass = LayoutClass;

export type SizeClassInfo = {
  sizeClass: SizeClass;
  /** Window width in dp. Prefer `sizeClass`; this is for fine tuning. */
  width: number;
  /** Web, where hover and keyboard focus exist and OS chrome does not. */
  isWeb: boolean;
  /** Anything with a side rail instead of a tab bar. */
  isWide: boolean;
};

export function useSizeClass(): SizeClassInfo {
  const { width } = useWindowDimensions();
  const sizeClass = layoutClassFor(width);
  return {
    sizeClass,
    width,
    isWeb: Platform.OS === 'web',
    isWide: sizeClass !== 'compact',
  };
}
