/**
 * CheckEmailIllustration — Figma "Check email" (`352:24449`).
 *
 * The "check your email" state after a magic link is sent
 * (`Auth / Sign in / Check your email`, 96 at every size).
 *
 * Converted from `apps/app/assets/illustrations/check_email.svg`, which stays
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

export type CheckEmailIllustrationProps = {
  /** Rendered width and height. The artwork is square. */
  size?: number;
};

export function CheckEmailIllustration({ size = 200 }: CheckEmailIllustrationProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 200 200">
      <Path d="M44 84 L100 46 L156 84 Z" fill={C.forest[900]} stroke={C.forest[900]} strokeWidth={3} strokeLinejoin="round" strokeLinecap="round" />
      <Path d="M68 56 H132 Q138 56 138 62 V114 Q138 120 132 120 H68 Q62 120 62 114 V62 Q62 56 68 56 Z" fill={C.cream[50]} stroke={C.forest[900]} strokeWidth={3} strokeLinejoin="round" strokeLinecap="round" />
      <Path d="M74 82 H112 V90 H74 Z" fill={C.amber[200]} />
      <Path d="M74 70 H100" fill="none" stroke={C.forest[100]} strokeWidth={3} strokeLinejoin="round" strokeLinecap="round" />
      <Path d="M112 70 L118 76 L128 64" fill="none" stroke={C.forest[900]} strokeWidth={3.5} strokeLinejoin="round" strokeLinecap="round" />
      <Path d="M40 84 L100 124 L160 84 L160 154 Q160 160 154 160 L46 160 Q40 160 40 154 Z" transform="translate(6 6)" fill={C.forest[900]} stroke={C.forest[900]} strokeWidth={3} strokeLinejoin="round" />
      <Path d="M40 84 L100 124 L160 84 L160 154 Q160 160 154 160 L46 160 Q40 160 40 154 Z" fill={C.forest[400]} stroke={C.forest[900]} strokeWidth={3} strokeLinejoin="round" strokeLinecap="round" />
      <Path d="M40 154 L88 118 M160 154 L112 118" fill="none" stroke={C.forest[900]} strokeWidth={3} strokeLinejoin="round" strokeLinecap="round" />
      <Path d="M38 43 C39.62 50.38 39.62 50.38 47 52 C39.62 53.62 39.62 53.62 38 61 C36.38 53.62 36.38 53.62 29 52 C36.38 50.38 36.38 50.38 38 43 Z" fill={C.forest[900]} />
      <Path d="M52 29 C52.9 33.1 52.9 33.1 57 34 C52.9 34.9 52.9 34.9 52 39 C51.1 34.9 51.1 34.9 47 34 C51.1 33.1 51.1 33.1 52 29 Z" fill={C.forest[900]} />
      <Path d="M175.1 123.2 L181.0 117.8" fill="none" stroke={C.forest[900]} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
      <Path d="M176.8 126.2 L186.4 123.6" fill="none" stroke={C.forest[900]} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
      <Path d="M176.8 129.6 L184.6 131.4" fill="none" stroke={C.forest[900]} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
    </Svg>
  );
}
