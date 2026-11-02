/**
 * SomethingWentWrongIllustration — Figma "Something went wrong" (`352:24653`).
 *
 * The generic failure. `Discover / Home / Error` draws it at 120.
 *
 * `System / Error / Crash boundary` draws it at 120 too and does NOT
 * get it. That screen's contract is that it survives "a bad import,
 * missing env var, native module failure" — and `react-native-svg` is
 * a native module, so rendering this inside the fallback would put the
 * suspect back on the stand. It stays text only; see the comment at
 * the top of `RootErrorBoundary`.
 *
 * Converted from `apps/app/assets/illustrations/error.svg`, which stays
 * in the repo as the source of truth. There is no SVG transformer in
 * this project, so an illustration cannot be `import`ed as a component;
 * `EmptyLibraryIllustration` set this pattern and this follows it.
 *
 * The path data is the export's, verbatim. Only the colours changed:
 * each exported hex is bound to its token, so the drawing follows the
 * palette if a ramp ever moves.
 */

import Svg, { Circle, Path } from 'react-native-svg';
import { colors as C } from '~/design/tokens';

export type SomethingWentWrongIllustrationProps = {
  /** Rendered width and height. The artwork is square. */
  size?: number;
};

export function SomethingWentWrongIllustration({ size = 200 }: SomethingWentWrongIllustrationProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 200 200">
      <Path d="M100 40 Q106 40 110 46 L164 140 Q168 150 158 152 L42 152 Q32 150 36 140 L90 46 Q94 40 100 40 Z" transform="translate(8 8)" fill={C.forest[900]} stroke={C.forest[900]} strokeWidth={3} strokeLinejoin="round" />
      <Path d="M100 40 Q106 40 110 46 L164 140 Q168 150 158 152 L42 152 Q32 150 36 140 L90 46 Q94 40 100 40 Z" fill={C.amber[200]} stroke={C.forest[900]} strokeWidth={3} strokeLinejoin="round" strokeLinecap="round" />
      <Path d="M100 78 V116" fill="none" stroke={C.forest[900]} strokeWidth={8} strokeLinejoin="round" strokeLinecap="round" />
      <Circle cx={100} cy={134} r={6} fill={C.forest[900]} />
      <Path d="M162 45 C163.26 50.74 163.26 50.74 169 52 C163.26 53.26 163.26 53.26 162 59 C160.74 53.26 160.74 53.26 155 52 C160.74 50.74 160.74 50.74 162 45 Z" fill={C.forest[900]} />
      <Path d="M40 54 C41.44 60.56 41.44 60.56 48 62 C41.44 63.44 41.44 63.44 40 70 C38.56 63.44 38.56 63.44 32 62 C38.56 60.56 38.56 60.56 40 54 Z" fill={C.forest[900]} />
      <Path d="M175.5 103.7 L181.8 98.8" fill="none" stroke={C.forest[900]} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
      <Path d="M176.9 106.8 L186.7 105.0" fill="none" stroke={C.forest[900]} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
      <Path d="M176.7 110.2 L184.3 112.6" fill="none" stroke={C.forest[900]} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
      <Path d="M30 182 Q50 166 64 178 Q72 188 60 190 Q52 188 58 176 Q66 164 92 172" fill="none" stroke={C.forest[900]} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
    </Svg>
  );
}
