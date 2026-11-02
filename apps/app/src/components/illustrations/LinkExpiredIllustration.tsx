/**
 * LinkExpiredIllustration — Figma "Link expired" (`352:24467`).
 *
 * The expired or already-used magic link
 * (`Auth / Callback / Link expired`, 80 at every size).
 *
 * Converted from `apps/app/assets/illustrations/link_expired.svg`, which stays
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

export type LinkExpiredIllustrationProps = {
  /** Rendered width and height. The artwork is square. */
  size?: number;
};

export function LinkExpiredIllustration({ size = 200 }: LinkExpiredIllustrationProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 200 200">
      <Path d="M40 104 A56 56 0 1 0 152 104 A56 56 0 1 0 40 104 Z" transform="translate(8 8)" fill={C.forest[900]} stroke={C.forest[900]} strokeWidth={3} strokeLinejoin="round" />
      <Path d="M40 104 A56 56 0 1 0 152 104 A56 56 0 1 0 40 104 Z" fill={C.cream[50]} stroke={C.forest[900]} strokeWidth={3} strokeLinejoin="round" strokeLinecap="round" />
      <Path d="M54 104 A42 42 0 1 0 138 104 A42 42 0 1 0 54 104 Z" fill={C.forest[400]} stroke={C.forest[900]} strokeWidth={3} strokeLinejoin="round" strokeLinecap="round" />
      <Path d="M130.0 104.0 L126.0 104.0" fill="none" stroke={C.cream[50]} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
      <Path d="M125.4 121.0 L128.9 123.0" fill="none" stroke={C.cream[50]} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
      <Path d="M113.0 133.4 L115.0 136.9" fill="none" stroke={C.cream[50]} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
      <Path d="M96.0 138.0 L96.0 134.0" fill="none" stroke={C.cream[50]} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
      <Path d="M79.0 133.4 L77.0 136.9" fill="none" stroke={C.cream[50]} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
      <Path d="M66.6 121.0 L63.1 123.0" fill="none" stroke={C.cream[50]} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
      <Path d="M62.0 104.0 L66.0 104.0" fill="none" stroke={C.cream[50]} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
      <Path d="M66.6 87.0 L63.1 85.0" fill="none" stroke={C.cream[50]} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
      <Path d="M79.0 74.6 L77.0 71.1" fill="none" stroke={C.cream[50]} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
      <Path d="M96.0 70.0 L96.0 74.0" fill="none" stroke={C.cream[50]} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
      <Path d="M113.0 74.6 L115.0 71.1" fill="none" stroke={C.cream[50]} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
      <Path d="M125.4 87.0 L128.9 85.0" fill="none" stroke={C.cream[50]} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
      <Path d="M96 104 L96 80" fill="none" stroke={C.cream[50]} strokeWidth={4} strokeLinejoin="round" strokeLinecap="round" />
      <Path d="M96 104 L112 112" fill="none" stroke={C.cream[50]} strokeWidth={4} strokeLinejoin="round" strokeLinecap="round" />
      <Circle cx={96} cy={104} r={4} fill={C.cream[50]} stroke={C.forest[900]} strokeWidth={2} />
      <Path d="M128 62 A18 18 0 1 0 164 62 A18 18 0 1 0 128 62 Z" transform="translate(4 4)" fill={C.forest[900]} stroke={C.forest[900]} strokeWidth={3} strokeLinejoin="round" />
      <Path d="M128 62 A18 18 0 1 0 164 62 A18 18 0 1 0 128 62 Z" fill={C.amber[500]} stroke={C.forest[900]} strokeWidth={3} strokeLinejoin="round" strokeLinecap="round" />
      <Path d="M146 52 V64" fill="none" stroke={C.forest[900]} strokeWidth={4} strokeLinejoin="round" strokeLinecap="round" />
      <Circle cx={146} cy={72} r={2.5} fill={C.forest[900]} />
      <Path d="M36 44 C37.44 50.56 37.44 50.56 44 52 C37.44 53.44 37.44 53.44 36 60 C34.56 53.44 34.56 53.44 28 52 C34.56 50.56 34.56 50.56 36 44 Z" fill={C.forest[900]} />
      <Path d="M160 153 C161.26 158.74 161.26 158.74 167 160 C161.26 161.26 161.26 161.26 160 167 C158.74 161.26 158.74 161.26 153 160 C158.74 158.74 158.74 158.74 160 153 Z" fill={C.forest[900]} />
      <Path d="M150 110 Q170 96 178 112 Q182 124 170 122 Q162 118 170 106 Q178 94 188 100" fill="none" stroke={C.forest[900]} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
    </Svg>
  );
}
