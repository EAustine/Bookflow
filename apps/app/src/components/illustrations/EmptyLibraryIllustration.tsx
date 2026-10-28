/**
 * EmptyLibraryIllustration — Figma "Empty library" (`350:142`).
 *
 * Converted by hand from `apps/app/assets/illustrations/empty_library.svg`,
 * which stays in the repo as the source of truth. There is no SVG
 * transformer in this project (no metro.config.js at all), so an
 * illustration cannot be `import`ed as a component — the existing
 * `Logomark` and `Lockup` take the same approach of inlining the paths.
 *
 * Every colour is bound to a token rather than kept as the exported hex,
 * so the illustration follows the palette if a ramp ever moves. The
 * drawing is square; pass `size` and it scales as a unit.
 *
 * Used by the Library's wide empty state and the book pane's Empty
 * state. The rest of the set is in the same assets folder, waiting for
 * the milestones that need them.
 */

import Svg, { G, Path } from 'react-native-svg';
import { colors as C } from '~/design/tokens';

export type EmptyLibraryIllustrationProps = {
  /** Rendered width and height. The artwork is square. */
  size?: number;
};

export function EmptyLibraryIllustration({
  size = 200,
}: EmptyLibraryIllustrationProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 200 200">
      <Path d="M34 138 H166 Q170 138 170 142 V146 Q170 150 166 150 H34 Q30 150 30 146 V142 Q30 138 34 138 Z" transform="translate(5 5)" fill={C.forest[900]} stroke={C.forest[900]} strokeWidth={3} strokeLinejoin="round" />
      <Path d="M34 138 H166 Q170 138 170 142 V146 Q170 150 166 150 H34 Q30 150 30 146 V142 Q30 138 34 138 Z" fill={C.forest[600]} stroke={C.forest[900]} strokeWidth={3} strokeLinejoin="round" strokeLinecap="round" />
      <Path d="M46 74 H64 Q68 74 68 78 V134 Q68 138 64 138 H46 Q42 138 42 134 V78 Q42 74 46 74 Z" transform="translate(5 5)" fill={C.forest[900]} stroke={C.forest[900]} strokeWidth={3} strokeLinejoin="round" />
      <Path d="M46 74 H64 Q68 74 68 78 V134 Q68 138 64 138 H46 Q42 138 42 134 V78 Q42 74 46 74 Z" fill={C.forest[400]} stroke={C.forest[900]} strokeWidth={3} strokeLinejoin="round" strokeLinecap="round" />
      <Path d="M48 88 H62 M48 94 H62" fill="none" stroke={C.cream[50]} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M76 90 H90 Q94 90 94 94 V134 Q94 138 90 138 H76 Q72 138 72 134 V94 Q72 90 76 90 Z" transform="translate(5 5)" fill={C.forest[900]} stroke={C.forest[900]} strokeWidth={3} strokeLinejoin="round" />
      <Path d="M76 90 H90 Q94 90 94 94 V134 Q94 138 90 138 H76 Q72 138 72 134 V94 Q72 90 76 90 Z" fill={C.amber[500]} stroke={C.forest[900]} strokeWidth={3} strokeLinejoin="round" strokeLinecap="round" />
      <Path d="M77 102 H89" fill="none" stroke={C.cream[50]} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
      <G transform="rotate(14 112 138)">
        <Path d="M102 80 H114 Q118 80 118 84 V134 Q118 138 114 138 H102 Q98 138 98 134 V84 Q98 80 102 80 Z" transform="translate(5 5)" fill={C.forest[900]} stroke={C.forest[900]} strokeWidth={3} strokeLinejoin="round" />
        <Path d="M102 80 H114 Q118 80 118 84 V134 Q118 138 114 138 H102 Q98 138 98 134 V84 Q98 80 102 80 Z" fill={C.cream[50]} stroke={C.forest[900]} strokeWidth={3} strokeLinejoin="round" strokeLinecap="round" />
        <Path d="M103 94 H113" fill="none" stroke={C.forest[600]} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
      </G>
      <Path d="M131 86 H157 Q162 86 162 91 V133 Q162 138 157 138 H131 Q126 138 126 133 V91 Q126 86 131 86 Z" fill="none" stroke={C.forest[600]} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" strokeDasharray="5 6" />
      <Path d="M128 58 A16 16 0 1 0 160 58 A16 16 0 1 0 128 58 Z" transform="translate(4 4)" fill={C.forest[900]} stroke={C.forest[900]} strokeWidth={3} strokeLinejoin="round" />
      <Path d="M128 58 A16 16 0 1 0 160 58 A16 16 0 1 0 128 58 Z" fill={C.amber[200]} stroke={C.forest[900]} strokeWidth={3} strokeLinejoin="round" strokeLinecap="round" />
      <Path d="M144 50 V66 M136 58 H152" fill="none" stroke={C.forest[900]} strokeWidth={3.5} strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M32 40 C33.44 46.56 33.44 46.56 40 48 C33.44 49.44 33.44 49.44 32 56 C30.56 49.44 30.56 49.44 24 48 C30.56 46.56 30.56 46.56 32 40 Z" fill={C.forest[900]} />
      <Path d="M176 94 C177.08 98.92 177.08 98.92 182 100 C177.08 101.08 177.08 101.08 176 106 C174.92 101.08 174.92 101.08 170 100 C174.92 98.92 174.92 98.92 176 94 Z" fill={C.forest[900]} />
      <Path d="M168.7 34.7 L171.6 29.0" fill="none" stroke={C.forest[900]} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M170.9 36.6 L177.5 32.0" fill="none" stroke={C.forest[900]} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M172.0 39.3 L178.3 38.5" fill="none" stroke={C.forest[900]} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M30 176 Q50 160 64 172 Q72 182 62 184 Q54 184 58 172 Q66 160 90 166" fill="none" stroke={C.forest[900]} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}
