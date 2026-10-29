/**
 * ReadingNookIllustration — the Featured card's artwork. Figma
 * `Featured card` Size=Wide (`372:51539`) and Size=Medium (`375:30`).
 *
 * Converted by hand from `apps/app/assets/illustrations/reading_nook.svg`
 * and `reading_nook_medium.svg`, which stay in the repo as the source
 * of truth. Same reasoning as the other two illustrations here: there
 * is no SVG transformer in this project, so artwork cannot be
 * `import`ed as a component.
 *
 * Every colour is bound to a token rather than kept as the exported
 * hex, so the drawing follows the palette if a ramp ever moves. All
 * six map exactly — nothing was approximated. The seventh colour in
 * the Figma frame, `#7A6E5C`, is not bound here at all: it is the
 * placeholder standing in for the book cover, and the real cover is
 * rendered into that slot by the caller.
 *
 * The cover is **not** drawn here. The slot is published as
 * `READING_NOOK_COVER_SLOT` and the caller lays a real `CoverBox` over
 * it, so the cover keeps its image-with-fallback behaviour instead of
 * becoming a second code path inside an SVG.
 *
 * The two variants share every path except the decoration at the end.
 * Wide carries a large left sparkle, a small cream one and a squiggle;
 * Medium drops the squiggle and the small sparkle and moves the large
 * one inboard, because at 0.86 scale anchored bottom-right the left of
 * the drawing sits under the card's text.
 */

import Svg, { Circle, G, Path, Rect } from 'react-native-svg';
import { colors as C } from '~/design/tokens';

/** The artwork's own coordinate space. Both variants share it. */
const VIEW_BOX = { width: 440, height: 268 };

/**
 * Where the book cover stands, in viewBox units — from the comment in
 * both SVGs. The caller positions its cover with these, so the slot
 * and the drawing cannot drift apart.
 */
export const READING_NOOK_COVER_SLOT = {
  x: 186,
  y: 28,
  width: 92,
  height: 138,
  rotation: 6,
  radius: 6,
  /** The solid offset depth behind it, same size. */
  shadowOffset: 6,
  viewBox: VIEW_BOX,
} as const;

export type ReadingNookIllustrationProps = {
  /** Rendered size. Defaults to the Wide drawing's own 440 × 268. */
  width?: number;
  height?: number;
  /** Which decoration set to draw. */
  variant?: 'wide' | 'medium';
};

export function ReadingNookIllustration({
  width = VIEW_BOX.width,
  height = VIEW_BOX.height,
  variant = 'wide',
}: ReadingNookIllustrationProps) {
  return (
    <Svg
      width={width}
      height={height}
      viewBox={`0 0 ${VIEW_BOX.width} ${VIEW_BOX.height}`}
      fill="none"
    >
      {/* The forest circle the whole scene sits on. */}
      <Circle cx={250} cy={150} r={128} fill={C.forest[600]} />

      {/* Solid offset depth under the three books — the illustration
          style's substitute for a soft shadow. */}
      <G transform="translate(6 6)" fill={C.forest[900]}>
        <Rect x={120} y={212} width={230} height={30} rx={5} />
        <Rect x={138} y={184} width={196} height={28} rx={5} />
        <Rect x={128} y={158} width={214} height={26} rx={5} />
      </G>

      {/* The stack: amber, cream, forest, bottom to top. */}
      <Rect x={120} y={212} width={230} height={30} rx={5} fill={C.amber[500]} stroke={C.forest[900]} strokeWidth={3} />
      <Rect x={138} y={184} width={196} height={28} rx={5} fill={C.cream[50]} stroke={C.forest[900]} strokeWidth={3} />
      <Rect x={128} y={158} width={214} height={26} rx={5} fill={C.forest[400]} stroke={C.forest[900]} strokeWidth={3} />
      {/* Page edges. */}
      <Path d="M140 227 H 330 M156 198 H 318 M146 171 H 322" stroke={C.forest[900]} strokeWidth={2} strokeLinecap="round" opacity={0.5} />

      {/* Tea mug, with its own offset depth and a handle. */}
      <Path d="M358 166 h34 v-34 h-34 z" fill={C.forest[900]} />
      <Path d="M352 160 h34 v-34 h-34 z" fill={C.amber[200]} stroke={C.forest[900]} strokeWidth={3} strokeLinejoin="round" />
      <Path d="M386 134 c12 0 12 18 0 18" stroke={C.forest[900]} strokeWidth={3} fill="none" />
      {/* Steam. */}
      <Path d="M362 116 c-4 -8 4 -12 0 -20 M374 116 c-4 -8 4 -12 0 -20" stroke={C.cream[50]} strokeWidth={2.5} fill="none" strokeLinecap="round" />

      {/* Decoration. The right sparkle is shared; the rest is per
          variant, because Medium's left edge sits under the text. */}
      <Path
        d="M400 48 C401.4 56.6 401.4 56.6 410 58 C401.4 59.4 401.4 59.4 400 68 C398.6 59.4 398.6 59.4 390 58 C398.6 56.6 398.6 56.6 400 48 Z"
        fill={C.amber[200]}
        stroke={C.forest[900]}
        strokeWidth={2.5}
        strokeLinejoin="round"
      />
      {variant === 'wide' ? (
        <>
          <Path
            d="M118 42 C120.8 59.2 120.8 59.2 138 62 C120.8 64.8 120.8 64.8 118 82 C115.2 64.8 115.2 64.8 98 62 C115.2 59.2 115.2 59.2 118 42 Z"
            fill={C.amber[500]}
            stroke={C.forest[900]}
            strokeWidth={2.5}
            strokeLinejoin="round"
          />
          <Path
            d="M84 133 C84.98 139.02 84.98 139.02 91 140 C84.98 140.98 84.98 140.98 84 147 C83.02 140.98 83.02 140.98 77 140 C83.02 139.02 83.02 139.02 84 133 Z"
            fill={C.cream[50]}
          />
          <Path
            d="M60 236 C 76 210, 92 256, 108 230"
            stroke={C.amber[500]}
            strokeWidth={3}
            fill="none"
            strokeLinecap="round"
          />
        </>
      ) : (
        <Path
          d="M150 56 C151.96 68.04 151.96 68.04 164 70 C151.96 71.96 151.96 71.96 150 84 C148.04 71.96 148.04 71.96 136 70 C148.04 68.04 148.04 68.04 150 56 Z"
          fill={C.amber[500]}
          stroke={C.forest[900]}
          strokeWidth={2.5}
          strokeLinejoin="round"
        />
      )}
    </Svg>
  );
}
