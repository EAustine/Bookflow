/**
 * WelcomeHeroIllustration — Figma "Welcome hero" (`352:24417`).
 *
 * The Welcome screen hero (`Auth / Welcome`), 280 wide stacked and
 * 336 in the split layout. The only one of the set that is not square:
 * 320 x 240, so height follows width rather than being passed.
 *
 * Converted from `apps/app/assets/illustrations/welcome_hero.svg`, which stays
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

export type WelcomeHeroIllustrationProps = {
  /** Rendered width. Height follows the 320 x 240 artwork. */
  width?: number;
};

export function WelcomeHeroIllustration({ width = 320 }: WelcomeHeroIllustrationProps) {
  return (
    <Svg width={width} height={(width * 240) / 320} viewBox="0 0 320 240">
      <Path d="M62 110 L160.0 116 L258 110 L258 206 Q205.0 198 160.0 208 Q115.0 198 62 206 Z" transform="translate(6 6)" fill={C.forest[900]} stroke={C.forest[900]} strokeWidth={3} strokeLinejoin="round" />
      <Path d="M62 110 L160.0 116 L258 110 L258 206 Q205.0 198 160.0 208 Q115.0 198 62 206 Z" fill={C.forest[400]} stroke={C.forest[900]} strokeWidth={3} strokeLinejoin="round" strokeLinecap="round" />
      <Path d="M70 104 Q115.0 92 160.0 106 Q205.0 92 250 104 L250 196 Q205.0 184 160.0 198 Q115.0 184 70 196 Z" transform="translate(6 6)" fill={C.forest[900]} stroke={C.forest[900]} strokeWidth={3} strokeLinejoin="round" />
      <Path d="M70 104 Q115.0 92 160.0 106 Q205.0 92 250 104 L250 196 Q205.0 184 160.0 198 Q115.0 184 70 196 Z" fill={C.cream[50]} stroke={C.forest[900]} strokeWidth={3} strokeLinejoin="round" strokeLinecap="round" />
      <Path d="M160.0 106 L160.0 198" fill="none" stroke={C.forest[900]} strokeWidth={3} strokeLinejoin="round" strokeLinecap="round" />
      <Path d="M94 140 L142 136 L142 146 L94 150 Z" fill={C.amber[200]} />
      <Path d="M88 122 Q115 117 145 121" fill="none" stroke={C.forest[600]} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
      <Path d="M88 138 Q115 133 145 137" fill="none" stroke={C.forest[600]} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
      <Path d="M88 154 Q115 149 145 153" fill="none" stroke={C.forest[600]} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
      <Path d="M88 170 Q115 165 145 169" fill="none" stroke={C.forest[600]} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
      <Path d="M172 120 Q190 114 204 118" fill="none" stroke={C.forest[600]} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
      <Path d="M172 136 Q186 130 196 134 Q206 122 216 136 Q226 150 236 128" fill="none" stroke={C.forest[400]} strokeWidth={4} strokeLinejoin="round" strokeLinecap="round" />
      <Path d="M172 152 Q190 146 210 150" fill="none" stroke={C.forest[600]} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
      <Path d="M118 84 Q160 22 202 84" fill="none" stroke={C.forest[900]} strokeWidth={7} strokeLinejoin="round" strokeLinecap="round" />
      <Path d="M118 84 Q160 22 202 84" fill="none" stroke={C.forest[600]} strokeWidth={3} strokeLinejoin="round" strokeLinecap="round" />
      <Path d="M114 72 H118 Q128 72 128 82 V98 Q128 108 118 108 H114 Q104 108 104 98 V82 Q104 72 114 72 Z" transform="translate(4 4)" fill={C.forest[900]} stroke={C.forest[900]} strokeWidth={3} strokeLinejoin="round" />
      <Path d="M114 72 H118 Q128 72 128 82 V98 Q128 108 118 108 H114 Q104 108 104 98 V82 Q104 72 114 72 Z" fill={C.forest[400]} stroke={C.forest[900]} strokeWidth={3} strokeLinejoin="round" strokeLinecap="round" />
      <Path d="M202 72 H206 Q216 72 216 82 V98 Q216 108 206 108 H202 Q192 108 192 98 V82 Q192 72 202 72 Z" transform="translate(4 4)" fill={C.forest[900]} stroke={C.forest[900]} strokeWidth={3} strokeLinejoin="round" />
      <Path d="M202 72 H206 Q216 72 216 82 V98 Q216 108 206 108 H202 Q192 108 192 98 V82 Q192 72 202 72 Z" fill={C.forest[400]} stroke={C.forest[900]} strokeWidth={3} strokeLinejoin="round" strokeLinecap="round" />
      <Path d="M110 80 L118 78 L118 100 L110 102 Z" fill={C.amber[200]} />
      <Path d="M236.7 78.8 L242.0 72.9" fill="none" stroke={C.forest[900]} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
      <Path d="M238.6 81.6 L248.0 78.2" fill="none" stroke={C.forest[900]} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
      <Path d="M238.9 85.0 L246.9 86.1" fill="none" stroke={C.forest[900]} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
      <Path d="M62 65 C63.62 72.38 63.62 72.38 71 74 C63.62 75.62 63.62 75.62 62 83 C60.38 75.62 60.38 75.62 53 74 C60.38 72.38 60.38 72.38 62 65 Z" fill={C.forest[900]} />
      <Path d="M252 45 C253.26 50.74 253.26 50.74 259 52 C253.26 53.26 253.26 53.26 252 59 C250.74 53.26 250.74 53.26 245 52 C250.74 50.74 250.74 50.74 252 45 Z" fill={C.forest[900]} />
      <Path d="M270 164 C271.08 168.92 271.08 168.92 276 170 C271.08 171.08 271.08 171.08 270 176 C268.92 171.08 268.92 171.08 264 170 C268.92 168.92 268.92 168.92 270 164 Z" fill={C.forest[900]} />
      <Path d="M40 206 Q60 190 76 204 Q86 216 74 218 Q64 218 70 204 Q80 190 104 196" fill="none" stroke={C.forest[900]} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
    </Svg>
  );
}
