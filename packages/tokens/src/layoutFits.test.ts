import { describe, expect, it } from 'vitest';
import { breakpoints, type LayoutClass } from './breakpoints';
import { layout } from './tokens';

/**
 * §10: "No container runs off screen."
 *
 * Every fixed width in `layout` is a measurement taken from a Figma
 * frame, and every frame was drawn at one width per size class — 820,
 * 1180, 1440. The classes those frames represent start lower: Medium at
 * 600, Expanded at 1024, Desktop at 1280. So a composition can be
 * exactly right in Figma and overflow on a real device that sits at the
 * bottom of the same class, and nothing in the build catches it. An
 * iPad Pro 12.9 in portrait is exactly 1024; iPad mini landscape is
 * 1133; a half-screen browser window is whatever the user dragged.
 *
 * This is that arithmetic, written down. It is not a substitute for
 * looking at the screens — it cannot see a layout, only the numbers the
 * layout is built from — but it is the half of §10 that can be proved
 * mechanically, and it is the half that keeps being wrong by 12px in a
 * band nobody opens a window at.
 *
 * **The content model is the code's, not the brief's.** Content width
 * is `window - rail - 2 × gutter`, with no 1280 ceiling, because
 * `layout.content.max` has no call site in the app —
 * `SignedInShell`'s content column is `flex: 1`. If that cap is ever
 * implemented, `contentWidth` is where it goes.
 *
 * Caps are out of scope on purpose. `reading.measure`, `lane.width`,
 * `you.*`, `listen.empty/resume/history`, `practice.results`,
 * `discover.requestForm` and `bookDetail.info` are all applied as
 * `maxWidth` over a `width: '100%'`, so they shrink with the window and
 * cannot overflow by construction. Only fixed widths can.
 */

/** The rail eats into the content area before any screen sees it. */
const RAIL: Record<LayoutClass, number> = {
  // Phone has a bottom tab bar instead.
  compact: 0,
  medium: layout.rail.collapsed,
  expanded: layout.rail.collapsed,
  // Desktop is where the rail expands to 240 with the lockup — which
  // is the definition of the class (see `breakpoints.ts`).
  desktop: layout.rail.expanded,
};

/** §1's frame widths: the one window per class the designs were drawn at. */
const FRAME: Record<LayoutClass, number> = {
  compact: 393,
  medium: 820,
  expanded: 1180,
  desktop: 1440,
};

/**
 * The two windows worth testing per class: the narrowest one the class
 * can be in, and the one its frames were drawn at. Everything between
 * is wider than the floor, so a composition that fits the floor fits
 * all of it.
 */
function windowsFor(cls: LayoutClass): { label: string; width: number }[] {
  return [
    { label: `${cls} floor`, width: breakpoints[cls] },
    { label: `${cls} frame`, width: FRAME[cls] },
  ];
}

function contentWidth(cls: LayoutClass, windowWidth: number): number {
  return windowWidth - RAIL[cls] - layout.gutter[cls] * 2;
}

const MASTER_DETAIL = ['expanded', 'desktop'] as const;
const WIDE = ['medium', 'expanded', 'desktop'] as const;

describe('fixed columns inside the content area', () => {
  it('leaves a detail pane beside the 440 master', () => {
    // `LibraryScreen`'s `styles.master` and `YouScreen`'s, both
    // `width: pane.master`, both mounted only on Expanded and Desktop.
    // The detail flexes into what is left, so the test is that there is
    // something left.
    for (const cls of MASTER_DETAIL) {
      for (const { label, width } of windowsFor(cls)) {
        const left =
          contentWidth(cls, width) - layout.pane.master - layout.columnGap;
        expect(left, `master + gap at ${label}`).toBeGreaterThan(0);
      }
    }
  });

  it('leaves a reader column beside the 380 docked panel', () => {
    // `useReaderPanel` docks on Expanded and Desktop; Medium gets a
    // slide-over, which is an overlay and takes no width. The one
    // exception is a Medium practice session, which docks — and then
    // escapes into a full-screen modal, so nothing is looking at the
    // squeezed column underneath.
    for (const cls of MASTER_DETAIL) {
      for (const { label, width } of windowsFor(cls)) {
        const left =
          contentWidth(cls, width) - layout.panel.side - layout.columnGap;
        expect(left, `panel + gap at ${label}`).toBeGreaterThan(0);
      }
    }
  });

  it('leaves a Recently listened column beside the Listen player', () => {
    // `ListenNowPlayingScreen`: a fixed left per class, the right one
    // flexible. §4 gives the right column 460 at Expanded and 476 at
    // Desktop, which is what the frame widths produce; the floors give
    // less and it still has to be a column.
    for (const cls of MASTER_DETAIL) {
      const col = layout.listen[cls];
      for (const { label, width } of windowsFor(cls)) {
        const left = contentWidth(cls, width) - col.left - col.gap;
        expect(left, `listen left + gap at ${label}`).toBeGreaterThan(0);
      }
    }
  });

  it('leaves an info column beside the Book detail cover', () => {
    for (const cls of MASTER_DETAIL) {
      for (const { label, width } of windowsFor(cls)) {
        const left =
          contentWidth(cls, width) -
          layout.bookDetail.cover.wide.width -
          layout.bookDetail.gap.wide;
        expect(left, `cover + gap at ${label}`).toBeGreaterThan(0);
      }
    }
    for (const { label, width } of windowsFor('medium')) {
      const left =
        contentWidth('medium', width) -
        layout.bookDetail.cover.medium.width -
        layout.bookDetail.gap.medium;
      expect(left, `cover + gap at ${label}`).toBeGreaterThan(0);
    }
  });

  it('fits the Discover featured art', () => {
    // The card spans the content width and the art is a fixed drawing
    // inside it, so the art alone has to fit.
    for (const cls of MASTER_DETAIL) {
      for (const { label, width } of windowsFor(cls)) {
        expect(
          layout.discover.featured.artWide.width,
          `featured art at ${label}`,
        ).toBeLessThanOrEqual(contentWidth(cls, width));
      }
    }
    for (const { label, width } of windowsFor('medium')) {
      expect(
        layout.discover.featured.artMedium.width,
        `featured art at ${label}`,
      ).toBeLessThanOrEqual(contentWidth('medium', width));
    }
  });

  it('fits the 680 reading measure without the rail pushing it off', () => {
    // At Medium the measure is wider than the content area and simply
    // flexes — it is a cap. From Expanded up it should be the real
    // width of the column, rail and gutters included.
    for (const cls of MASTER_DETAIL) {
      for (const { label, width } of windowsFor(cls)) {
        expect(
          layout.reading.measure,
          `reading measure at ${label}`,
        ).toBeLessThanOrEqual(contentWidth(cls, width));
      }
    }
  });
});

describe('containers measured against the window, not the content area', () => {
  it('fits a popover and a context menu inside the gutters', () => {
    // `placePopover` clamps to the gutter, so this is about the
    // clamp having somewhere to put the card rather than about
    // overflow: below `width + 2 × gutter` the clamp inverts and
    // `popoverPlacement`'s own test takes over.
    for (const cls of WIDE) {
      for (const { label, width } of windowsFor(cls)) {
        const room = width - layout.gutter[cls] * 2;
        expect(layout.popover.width, `popover at ${label}`).toBeLessThanOrEqual(
          room,
        );
        expect(layout.menu.width, `menu at ${label}`).toBeLessThanOrEqual(room);
      }
    }
  });

  it('leaves a brand panel beside the Welcome split lane', () => {
    // `WelcomeScreen`'s `splitLaneWrap` is the one fixed width in Auth:
    // the lane plus a Desktop gutter either side, so the illustration
    // side takes the slack as the window grows.
    const wrap = layout.lane.width + layout.gutter.desktop * 2;
    for (const cls of MASTER_DETAIL) {
      for (const { label, width } of windowsFor(cls)) {
        expect(width - wrap, `split lane at ${label}`).toBeGreaterThan(0);
      }
    }
  });

  it('fits the Desktop practice session at the Desktop floor', () => {
    // The session escapes its panel into a full-screen modal, so it is
    // measured against the window.
    const { question, source, gap } = layout.practice.desktop;
    const needed = question + gap + source + layout.practice.paddingX * 2;
    expect(needed).toBeLessThanOrEqual(breakpoints.desktop);
  });

  it('does NOT fit the Expanded practice session at the Expanded floor', () => {
    // 520 + 40 + 440 + 36 = 1036 in a 1024 window. This inequality is
    // the reason `PracticeQuestionsScreen`'s `sessionCol` carries
    // `flexShrink: 1` — the frame numbers are right at 1180 and have to
    // give way below it. Asserted rather than left implicit so that
    // retuning either width tells whoever did it that the shrink was
    // load-bearing, instead of letting it rot into dead style.
    const { question, source, gap } = layout.practice.expanded;
    const needed = question + gap + source + layout.practice.paddingX * 2;
    expect(needed).toBeGreaterThan(breakpoints.expanded);
    // And it does fit at the width it was drawn at.
    expect(needed).toBeLessThanOrEqual(FRAME.expanded);
  });
});
