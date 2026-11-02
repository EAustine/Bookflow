/**
 * ScannedPdfIllustration — Figma "Scanned PDF" (`352:24617`).
 *
 * A PDF that is page images with no text layer
 * (`Library / Upload / Scanned PDF error`, 120).
 *
 * Converted from `apps/app/assets/illustrations/scanned_pdf.svg`, which stays
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

export type ScannedPdfIllustrationProps = {
  /** Rendered width and height. The artwork is square. */
  size?: number;
};

export function ScannedPdfIllustration({ size = 200 }: ScannedPdfIllustrationProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 200 200">
      <Path d="M58 40 H134 Q144 40 144 50 V154 Q144 164 134 164 H58 Q48 164 48 154 V50 Q48 40 58 40 Z" transform="translate(6 6)" fill={C.forest[900]} stroke={C.forest[900]} strokeWidth={3} strokeLinejoin="round" />
      <Path d="M58 40 H134 Q144 40 144 50 V154 Q144 164 134 164 H58 Q48 164 48 154 V50 Q48 40 58 40 Z" fill={C.cream[50]} stroke={C.forest[900]} strokeWidth={3} strokeLinejoin="round" strokeLinecap="round" />
      <Path d="M66 58 H126 Q130 58 130 62 V94 Q130 98 126 98 H66 Q62 98 62 94 V62 Q62 58 66 58 Z" fill={C.forest[100]} stroke={C.forest[900]} strokeWidth={3} strokeLinejoin="round" strokeLinecap="round" />
      <Path d="M66 94 L86 74 L100 88 L110 80 L126 94 Z" fill={C.forest[400]} stroke={C.forest[900]} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
      <Circle cx={112} cy={68} r={5} fill={C.amber[500]} stroke={C.forest[900]} strokeWidth={2} />
      <Path d="M62 114 H128 M62 128 H118 M62 142 H124" fill="none" stroke={C.forest[100]} strokeWidth={3} strokeLinejoin="round" strokeLinecap="round" />
      <Path d="M36 108 H156 V120 H36 Z" fill={C.amber[200]} opacity={0.85} />
      <Path d="M36 108 H156" fill="none" stroke={C.amber[500]} strokeWidth={3} strokeLinejoin="round" strokeLinecap="round" />
      <Path d="M164 36 C165.44 42.56 165.44 42.56 172 44 C165.44 45.44 165.44 45.44 164 52 C162.56 45.44 162.56 45.44 156 44 C162.56 42.56 162.56 42.56 164 36 Z" fill={C.forest[900]} />
      <Path d="M30 144 C31.08 148.92 31.08 148.92 36 150 C31.08 151.08 31.08 151.08 30 156 C28.92 151.08 28.92 151.08 24 150 C28.92 148.92 28.92 148.92 30 144 Z" fill={C.forest[900]} />
      <Path d="M165.3 105.2 L170.9 102.2" fill="none" stroke={C.forest[900]} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
      <Path d="M166.0 108.0 L174.0 108.0" fill="none" stroke={C.forest[900]} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
      <Path d="M165.3 110.8 L170.9 113.8" fill="none" stroke={C.forest[900]} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
    </Svg>
  );
}
