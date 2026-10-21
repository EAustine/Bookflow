import { View } from 'react-native';
import Svg, { Rect } from 'react-native-svg';
import { tokens } from '~/design/tokens';

/**
 * Per-voice waveform avatar — a tinted rounded square holding seven bars in
 * a distinct height pattern + colour, so the narration voices are instantly
 * distinguishable at a glance (replaces the old first-initial circle).
 *
 * Keyed by ElevenLabs voice id (matches `aiAudio.VOICE_OPTIONS` and the
 * Listen screen's VOICES roster). Bars are authored against a 52×38 viewBox
 * and scale to whatever `size` the caller asks for.
 */

type Bar = { y: number; h: number; o?: number };
type VoiceVisual = { bg: string; bars: string; pattern: Bar[] };

/** x-offset of each of the 7 bars (width 5, gap 2) within the 52-wide viewBox. */
const BAR_X = [2, 9, 16, 23, 30, 37, 44];

const VOICE_VISUALS: Record<string, VoiceVisual> = {
  // Aria — dramatic centre peak · expressive
  '9BWtsMINqrJLrRacOk9x': {
    bg: '#FDF0ED',
    bars: '#E07060',
    pattern: [
      { y: 12, h: 14 }, { y: 5, h: 28 }, { y: 9, h: 22, o: 0.85 }, { y: 2, h: 34 },
      { y: 7, h: 22, o: 0.75 }, { y: 12, h: 16, o: 0.55 }, { y: 16, h: 10, o: 0.35 },
    ],
  },
  // Brian — dense uniform tall · authority
  'nPczCjzI2devNBz1zQrb': {
    bg: '#EEF2F8',
    bars: '#2C4A5A',
    pattern: [
      { y: 7, h: 24 }, { y: 2, h: 34 }, { y: 4, h: 30, o: 0.9 }, { y: 2, h: 34 },
      { y: 4, h: 30, o: 0.85 }, { y: 7, h: 24, o: 0.65 }, { y: 10, h: 18, o: 0.45 },
    ],
  },
  // George — gentle peak · warm decay
  'JBFqnCBsd6RMkjVDRZzb': {
    bg: '#FDF5E8',
    bars: '#C49010',
    pattern: [
      { y: 14, h: 12 }, { y: 9, h: 20, o: 0.9 }, { y: 5, h: 28 }, { y: 7, h: 24, o: 0.95 },
      { y: 9, h: 20, o: 0.8 }, { y: 13, h: 14, o: 0.6 }, { y: 17, h: 8, o: 0.4 },
    ],
  },
  // Charlie — irregular spike · casual energy
  'IKne3meq5aSn9XLyUdCD': {
    bg: '#EFF4F0',
    bars: '#1B4332',
    pattern: [
      { y: 16, h: 12 }, { y: 7, h: 24, o: 0.9 }, { y: 11, h: 16 }, { y: 2, h: 34 },
      { y: 9, h: 20, o: 0.8 }, { y: 13, h: 12, o: 0.6 }, { y: 17, h: 8, o: 0.45 },
    ],
  },
  // Sarah — even medium arch · gentle
  'EXAVITQu4vr4xnSDxMaL': {
    bg: '#F5EFF8',
    bars: '#7B5EA7',
    pattern: [
      { y: 13, h: 12 }, { y: 8, h: 22, o: 0.9 }, { y: 6, h: 26 }, { y: 8, h: 22, o: 0.9 },
      { y: 11, h: 16, o: 0.75 }, { y: 14, h: 12, o: 0.55 }, { y: 16, h: 8, o: 0.35 },
    ],
  },
  // Lily — symmetric arch · refined
  'pFZP5JQG7iQjIQuC4Bku': {
    bg: '#EAF4F5',
    bars: '#2A8C9A',
    pattern: [
      { y: 16, h: 8, o: 0.45 }, { y: 9, h: 20, o: 0.65 }, { y: 4, h: 30 }, { y: 6, h: 26, o: 0.9 },
      { y: 4, h: 30, o: 0.85 }, { y: 11, h: 16, o: 0.6 }, { y: 16, h: 8, o: 0.4 },
    ],
  },
};

/** Neutral forest waveform for any voice id not in the map (future voices). */
const FALLBACK: VoiceVisual = {
  bg: tokens.colors.forest[50],
  bars: tokens.colors.forest[800],
  pattern: [
    { y: 13, h: 12 }, { y: 8, h: 22, o: 0.9 }, { y: 6, h: 26 }, { y: 8, h: 22, o: 0.9 },
    { y: 11, h: 16, o: 0.75 }, { y: 14, h: 12, o: 0.55 }, { y: 16, h: 8, o: 0.35 },
  ],
};

export function VoiceAvatar({
  voiceId,
  size = 36,
}: {
  voiceId: string;
  size?: number;
}) {
  const v = VOICE_VISUALS[voiceId] ?? FALLBACK;
  // Mockup ratio: a 64px tile holds a ~52px-wide waveform (≈0.8). The
  // viewBox keeps the bars proportional at any size.
  const svgW = Math.round(size * 0.8);
  const svgH = Math.round(svgW * (38 / 52));
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: Math.round(size / 4),
        backgroundColor: v.bg,
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
      }}
    >
      <Svg width={svgW} height={svgH} viewBox="0 0 52 38">
        {v.pattern.map((b, i) => (
          <Rect
            key={i}
            x={BAR_X[i]}
            y={b.y}
            width={5}
            height={b.h}
            rx={2.5}
            fill={v.bars}
            opacity={b.o ?? 1}
          />
        ))}
      </Svg>
    </View>
  );
}
