import Svg, { Path } from 'react-native-svg';
import { tokens } from '~/design/tokens';

/**
 * Logomark — the Bookflow mark on its own, without the wordmark.
 *
 * Two cubic arcs: a main curve and a lighter echo nested inside it.
 * It is **not** a book icon, and it must never be redrawn by hand.
 *
 * The path data here is lifted verbatim from `Lockup.tsx`, which is the
 * canonical artwork. The only difference is the viewBox, which is
 * cropped to the mark's own bounds (including the 2.16 stroke
 * half-width on each side) so the component can be sized on its own:
 *
 *   x  14 → 38      minus/plus 2.16  →  11.84 … 40.16   (28.32 wide)
 *   y  19 → 33.4    minus/plus 2.16  →  16.84 … 35.56   (18.72 tall)
 *
 * (y = 19 is the curve's apex at t = 0.5, not the control-point y.)
 *
 * Aspect is fixed at 28.32 : 18.72. Pass `width`; height is derived, so
 * the mark can never be stretched.
 *
 * ── Why this component exists ────────────────────────────────────────
 * The app used to ship two different logomarks. `AuthCallbackScreen`
 * drew its own pair of arcs with control points at 17% / 83% and a far
 * taller curve (0.87 height:width against the canonical 0.66), so the
 * mark on the magic-link screen was visibly not the mark everywhere
 * else. The lockup geometry is canonical; this is now the single
 * definition and both surfaces render it. See F-8.
 */

/** Intrinsic aspect ratio of the cropped viewBox. */
const ASPECT = 28.32 / 18.72;

/**
 * The canonical path data. Exported so `Lockup.tsx` renders the exact
 * same curves against its own 0 0 196 52 viewBox — one definition, two
 * framings, no chance of the two marks drifting apart again.
 */
export const LOGOMARK_MAIN = 'M14 33.4C22 14.2 30 14.2 38 33.4';
export const LOGOMARK_ECHO = 'M18.8 32.44C23.6 19.64 28.4 19.64 33.2 32.44';
export const LOGOMARK_STROKE = 4.32;
/** Cropped to the mark's own bounds, stroke half-width included. */
export const LOGOMARK_VIEWBOX = '11.84 16.84 28.32 18.72';

export type LogomarkProps = {
  /** Rendered width in px. Height is derived to preserve the aspect. */
  width: number;
  /** Stroke colour. Defaults to forest-800. */
  color?: string;
  /**
   * Opacity of the inner echo arc. Matches the lockup's size ramp —
   * 0.45 at large, 0.5 medium, 0.55 small.
   */
  echoOpacity?: number;
};

export function Logomark({
  width,
  color = tokens.colors.forest[800],
  echoOpacity = 0.45,
}: LogomarkProps) {
  return (
    <Svg
      width={width}
      height={width / ASPECT}
      viewBox={LOGOMARK_VIEWBOX}
      fill="none"
    >
      {/* Main curve */}
      <Path
        d={LOGOMARK_MAIN}
        stroke={color}
        strokeWidth={LOGOMARK_STROKE}
        strokeLinecap="round"
      />
      {/* Echo curve */}
      <Path
        opacity={echoOpacity}
        d={LOGOMARK_ECHO}
        stroke={color}
        strokeWidth={LOGOMARK_STROKE}
        strokeLinecap="round"
      />
    </Svg>
  );
}
