/**
 * NoResultsIllustration — Figma "No results" (`352:24546`).
 *
 * A search that matched nothing. Two slots, both 120:
 * `Library / Search / No results` and `Discover / Search / No matches`.
 *
 * Converted from `apps/app/assets/illustrations/no_results.svg`, which stays
 * in the repo as the source of truth. There is no SVG transformer in
 * this project, so an illustration cannot be `import`ed as a component;
 * `EmptyLibraryIllustration` set this pattern and this follows it.
 *
 * The path data is the export's, verbatim. Only the colours changed:
 * each exported hex is bound to its token, so the drawing follows the
 * palette if a ramp ever moves.
 */

import Svg, { G, Path } from 'react-native-svg';
import { colors as C } from '~/design/tokens';

export type NoResultsIllustrationProps = {
  /** Rendered width and height. The artwork is square. */
  size?: number;
};

export function NoResultsIllustration({ size = 200 }: NoResultsIllustrationProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 200 200">
      <G transform="rotate(-6 90 104)">
        <Path d="M50 40 H126 Q136 40 136 50 V154 Q136 164 126 164 H50 Q40 164 40 154 V50 Q40 40 50 40 Z" transform="translate(6 6)" fill={C.forest[900]} stroke={C.forest[900]} strokeWidth={3} strokeLinejoin="round" />
        <Path d="M50 40 H126 Q136 40 136 50 V154 Q136 164 126 164 H50 Q40 164 40 154 V50 Q40 40 50 40 Z" fill={C.cream[50]} stroke={C.forest[900]} strokeWidth={3} strokeLinejoin="round" strokeLinecap="round" />
        <Path d="M56 64 H118 M56 78 H110 M56 92 H116" fill="none" stroke={C.forest[100]} strokeWidth={3} strokeLinejoin="round" strokeLinecap="round" />
      </G>
      <Path d="M84 112 A34 34 0 1 0 152 112 A34 34 0 1 0 84 112 Z" transform="translate(6 6)" fill={C.forest[900]} stroke={C.forest[900]} strokeWidth={3} strokeLinejoin="round" />
      <Path d="M84 112 A34 34 0 1 0 152 112 A34 34 0 1 0 84 112 Z" fill={C.forest[100]} stroke={C.forest[900]} strokeWidth={3} strokeLinejoin="round" strokeLinecap="round" />
      <Path d="M104 86 L120 80 L96 134 L88 124 Z" fill={C.amber[200]} />
      <Path d="M84 112 A34 34 0 1 0 152 112 A34 34 0 1 0 84 112 Z" fill="none" stroke={C.forest[900]} strokeWidth={3} strokeLinejoin="round" strokeLinecap="round" />
      <Path d="M140 136 L150 130 L176 160 Q180 166 174 170 Q168 174 164 168 Z" transform="translate(4 4)" fill={C.forest[900]} stroke={C.forest[900]} strokeWidth={3} strokeLinejoin="round" />
      <Path d="M140 136 L150 130 L176 160 Q180 166 174 170 Q168 174 164 168 Z" fill={C.forest[400]} stroke={C.forest[900]} strokeWidth={3} strokeLinejoin="round" strokeLinecap="round" />
      <Path d="M160 44 C161.44 50.56 161.44 50.56 168 52 C161.44 53.44 161.44 53.44 160 60 C158.56 53.44 158.56 53.44 152 52 C158.56 50.56 158.56 50.56 160 44 Z" fill={C.forest[900]} />
      <Path d="M176 77 C176.9 81.1 176.9 81.1 181 82 C176.9 82.9 176.9 82.9 176 87 C175.1 82.9 175.1 82.9 171 82 C175.1 81.1 175.1 81.1 176 77 Z" fill={C.forest[900]} />
      <Path d="M28 178 Q44 164 58 174 Q66 182 56 184 Q48 184 52 174 Q60 162 82 168" fill="none" stroke={C.forest[900]} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
    </Svg>
  );
}
