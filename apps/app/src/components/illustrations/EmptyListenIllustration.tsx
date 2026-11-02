/**
 * EmptyListenIllustration — Figma "Empty listen" (`352:24524`).
 *
 * The Listen tab with no history
 * (`Listen / Tab / Empty`, 140 at every size).
 *
 * Converted from `apps/app/assets/illustrations/empty_listen.svg`, which stays
 * in the repo as the source of truth. There is no SVG transformer in
 * this project, so an illustration cannot be `import`ed as a component;
 * `EmptyLibraryIllustration` set this pattern and this follows it.
 *
 * The path data is the export's, verbatim. Only the colours changed:
 * each exported hex is bound to its token, so the drawing follows the
 * palette if a ramp ever moves.
 */

import Svg, { Path } from 'react-native-svg';
import { colors as C } from '~/design/tokens';

export type EmptyListenIllustrationProps = {
  /** Rendered width and height. The artwork is square. */
  size?: number;
};

export function EmptyListenIllustration({ size = 200 }: EmptyListenIllustrationProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 200 200">
      <Path d="M58 112 Q100 30 142 112" fill="none" stroke={C.forest[900]} strokeWidth={9} strokeLinejoin="round" strokeLinecap="round" />
      <Path d="M58 112 Q100 30 142 112" fill="none" stroke={C.forest[600]} strokeWidth={4} strokeLinejoin="round" strokeLinecap="round" />
      <Path d="M54 100 H58 Q72 100 72 114 V140 Q72 154 58 154 H54 Q40 154 40 140 V114 Q40 100 54 100 Z" transform="translate(5 5)" fill={C.forest[900]} stroke={C.forest[900]} strokeWidth={3} strokeLinejoin="round" />
      <Path d="M54 100 H58 Q72 100 72 114 V140 Q72 154 58 154 H54 Q40 154 40 140 V114 Q40 100 54 100 Z" fill={C.forest[400]} stroke={C.forest[900]} strokeWidth={3} strokeLinejoin="round" strokeLinecap="round" />
      <Path d="M142 100 H146 Q160 100 160 114 V140 Q160 154 146 154 H142 Q128 154 128 140 V114 Q128 100 142 100 Z" transform="translate(5 5)" fill={C.forest[900]} stroke={C.forest[900]} strokeWidth={3} strokeLinejoin="round" />
      <Path d="M142 100 H146 Q160 100 160 114 V140 Q160 154 146 154 H142 Q128 154 128 140 V114 Q128 100 142 100 Z" fill={C.forest[400]} stroke={C.forest[900]} strokeWidth={3} strokeLinejoin="round" strokeLinecap="round" />
      <Path d="M47 110 L57 107 L57 140 L47 143 Z" fill={C.amber[200]} />
      <Path d="M177.5 113.7 L183.8 108.8" fill="none" stroke={C.forest[900]} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
      <Path d="M178.9 116.8 L188.7 115.0" fill="none" stroke={C.forest[900]} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
      <Path d="M178.7 120.2 L186.3 122.6" fill="none" stroke={C.forest[900]} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
      <Path d="M21.3 120.2 L13.7 122.6" fill="none" stroke={C.forest[900]} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
      <Path d="M21.1 116.8 L11.3 115.0" fill="none" stroke={C.forest[900]} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
      <Path d="M22.5 113.7 L16.2 108.8" fill="none" stroke={C.forest[900]} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
      <Path d="M92 128 L92 160 Q92 170 82 170 Q72 170 72 162 Q72 154 84 154 Q88 154 88 156 L88 124 L116 118 L116 150 Q116 160 106 160 Q96 160 96 152 Q96 144 108 144 L112 146 L112 128 Z" fill={C.amber[500]} stroke={C.forest[900]} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
      <Path d="M100 44 C101.44 50.56 101.44 50.56 108 52 C101.44 53.44 101.44 53.44 100 60 C98.56 53.44 98.56 53.44 92 52 C98.56 50.56 98.56 50.56 100 44 Z" fill={C.forest[900]} />
      <Path d="M168 64 C169.08 68.92 169.08 68.92 174 70 C169.08 71.08 169.08 71.08 168 76 C166.92 71.08 166.92 71.08 162 70 C166.92 68.92 166.92 68.92 168 64 Z" fill={C.forest[900]} />
      <Path d="M30 66 C31.08 70.92 31.08 70.92 36 72 C31.08 73.08 31.08 73.08 30 78 C28.92 73.08 28.92 73.08 24 72 C28.92 70.92 28.92 70.92 30 66 Z" fill={C.forest[900]} />
    </Svg>
  );
}
