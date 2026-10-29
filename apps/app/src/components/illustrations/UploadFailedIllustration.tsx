/**
 * UploadFailedIllustration — Figma "Upload failed".
 *
 * Converted by hand from
 * `apps/app/assets/illustrations/upload_failed.svg`, which stays in the
 * repo as the source of truth. Same reasoning as
 * `EmptyLibraryIllustration`: there is no SVG transformer in this
 * project, so an illustration cannot be `import`ed as a component.
 *
 * Every colour is bound to a token rather than kept as the exported
 * hex, so the illustration follows the palette if a ramp ever moves.
 * All five in the source map exactly onto the ramps — nothing was
 * approximated.
 *
 * Shown by `ProcessingScreen` when an upload fails. It replaces what
 * used to be a red ring with an × through it; a ring that is not
 * reporting progress any more should stop looking like one.
 */

import Svg, { Path } from 'react-native-svg';
import { colors as C } from '~/design/tokens';

export type UploadFailedIllustrationProps = {
  /** Rendered width and height. The artwork is square. */
  size?: number;
};

export function UploadFailedIllustration({
  size = 200,
}: UploadFailedIllustrationProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 200 200">
      <Path d="M54 136 Q30 136 30 114 Q30 94 52 92 Q56 62 88 60 Q112 58 124 78 Q132 72 142 74 Q166 78 166 104 Q178 108 176 122 Q174 136 158 136 Z" transform="translate(7 7)" fill={C.forest[900]} stroke={C.forest[900]} strokeWidth={3} strokeLinejoin="round" />
      <Path d="M54 136 Q30 136 30 114 Q30 94 52 92 Q56 62 88 60 Q112 58 124 78 Q132 72 142 74 Q166 78 166 104 Q178 108 176 122 Q174 136 158 136 Z" fill={C.cream[50]} stroke={C.forest[900]} strokeWidth={3} strokeLinejoin="round" strokeLinecap="round" />
      <Path d="M100 128 L100 96 L88 108 M100 96 L112 108" fill={C.forest[400]} stroke={C.forest[900]} strokeWidth={0} strokeLinejoin="round" strokeLinecap="round" />
      <Path d="M100 128 L100 96 M88 108 L100 96 L112 108" fill="none" stroke={C.forest[600]} strokeWidth={5} strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M132 140 A18 18 0 1 0 168 140 A18 18 0 1 0 132 140 Z" transform="translate(4 4)" fill={C.forest[900]} stroke={C.forest[900]} strokeWidth={3} strokeLinejoin="round" />
      <Path d="M132 140 A18 18 0 1 0 168 140 A18 18 0 1 0 132 140 Z" fill={C.amber[500]} stroke={C.forest[900]} strokeWidth={3} strokeLinejoin="round" strokeLinecap="round" />
      <Path d="M143 133 L157 147 M157 133 L143 147" fill="none" stroke={C.forest[900]} strokeWidth={4} strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M40 50 C41.44 56.56 41.44 56.56 48 58 C41.44 59.44 41.44 59.44 40 66 C38.56 59.44 38.56 59.44 32 58 C38.56 56.56 38.56 56.56 40 50 Z" fill={C.forest[900]} />
      <Path d="M176 56 C177.08 60.92 177.08 60.92 182 62 C177.08 63.08 177.08 63.08 176 68 C174.92 63.08 174.92 63.08 170 62 C174.92 60.92 174.92 60.92 176 56 Z" fill={C.forest[900]} />
      <Path d="M30 170 Q48 156 62 166 Q70 176 60 178 Q52 178 56 166 Q64 154 88 160" fill="none" stroke={C.forest[900]} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}
