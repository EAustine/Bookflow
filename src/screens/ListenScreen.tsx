import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  GestureResponderEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  Text as RNText,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BottomSheet, type BottomSheetRef, Icon, Text } from '~/components';
import { tokens } from '~/design/tokens';
import type { Book } from '~/types/book';

// ─── Mock content ─────────────────────────────────────────────────────────────

const PARAGRAPHS: string[][] = [
  [
    "Once I wrote down on the empty spaces of a time-table the names of those who came to Gatsby's house that summer.",
    'It is an old time-table now, disintegrating at its folds.',
  ],
  [
    'From East Egg, then, came the Chester Beckers and the Leeches, and a man named Bunsen whom I knew at Yale.',
    'And Doctor Webster Civet, who was drowned last summer up in Maine.',
    'And the Hornbeams and the Willie Voltaires, and a whole clan named Blackbuck who always gathered in a corner and flipped up their noses like goats at whosoever came near.',
  ],
  [
    'From farther out on the Island came the Cheadles and the O. R. P. Schraeders, and the Stonewall Jackson Abrams of Georgia.',
    'Snell was there three days before he went to the penitentiary, so drunk out on the gravel drive that Mrs. Swett\'s automobile ran over his right hand.',
  ],
];

const ACTIVE_PARA = 1;
const ACTIVE_SENTENCE = 2;

const SPEEDS = [0.75, 1, 1.25, 1.5, 2] as const;
type Speed = (typeof SPEEDS)[number];

const TOTAL_SECS = 11 * 60 + 8;

// ─── Voices ───────────────────────────────────────────────────────────────────

type VoiceTier = 'free' | 'pro';

const VOICES: {
  id: string;
  name: string;
  desc: string;
  tier: VoiceTier;
  bg: string;
  fg: string;
}[] = [
  { id: 'sarah', name: 'Sarah', desc: 'Warm · American English', tier: 'free', bg: tokens.colors.forest[100], fg: tokens.colors.forest[800] },
  { id: 'james', name: 'James', desc: 'Deep · British English',   tier: 'pro',  bg: tokens.colors.cream[200],  fg: tokens.colors.ink[700] },
  { id: 'aria',  name: 'Aria',  desc: 'Bright · American English', tier: 'pro', bg: tokens.colors.amber[200],  fg: tokens.colors.ink[700] },
  { id: 'marcus',name: 'Marcus',desc: 'Calm · Australian English',  tier: 'pro', bg: tokens.colors.forest[50],  fg: tokens.colors.forest[700] },
];

// ─── Props ────────────────────────────────────────────────────────────────────

export type ListenScreenProps = {
  book: Book;
  onBack: () => void;
  onMinimize: () => void;
};

// ─── Screen ───────────────────────────────────────────────────────────────────

export function ListenScreen({ book, onBack, onMinimize }: ListenScreenProps) {
  const [isPlaying, setIsPlaying] = useState(true);
  const [speedIdx, setSpeedIdx] = useState(1);
  const [scrubPos, setScrubPos] = useState(0.38);
  const [trackWidth, setTrackWidth] = useState(0);
  const [currentWordIdx, setCurrentWordIdx] = useState(0);
  const [selectedVoiceId, setSelectedVoiceId] = useState('sarah');
  const voiceSheetRef = useRef<BottomSheetRef>(null);

  const activeSentenceWords = useMemo(
    () => PARAGRAPHS[ACTIVE_PARA][ACTIVE_SENTENCE].split(/\s+/),
    [],
  );

  useEffect(() => {
    if (!isPlaying) return;
    const id = setInterval(() => {
      setCurrentWordIdx((p) => (p + 1) % activeSentenceWords.length);
    }, 750);
    return () => clearInterval(id);
  }, [isPlaying, activeSentenceWords.length]);

  const chNum = book.currentChapter?.match(/\d+/)?.[0] ?? '1';
  const speed: Speed = SPEEDS[speedIdx];
  const elapsedSecs = Math.round(scrubPos * TOTAL_SECS);
  const selectedVoice = VOICES.find((v) => v.id === selectedVoiceId) ?? VOICES[0];

  const cycleSpeed = useCallback(() => {
    setSpeedIdx((p) => (p + 1) % SPEEDS.length);
  }, []);

  const handleBack = useCallback(() => {
    if (isPlaying) onMinimize();
    else onBack();
  }, [isPlaying, onMinimize, onBack]);

  const scrubFromX = useCallback(
    (x: number) => {
      if (!trackWidth) return;
      setScrubPos(Math.max(0, Math.min(1, x / trackWidth)));
    },
    [trackWidth],
  );

  const skipBack = useCallback(() => {
    setScrubPos((p) => Math.max(0, p - 15 / TOTAL_SECS));
  }, []);

  const skipForward = useCallback(() => {
    setScrubPos((p) => Math.min(1, p + 15 / TOTAL_SECS));
  }, []);

  return (
    <SafeAreaView
      style={styles.safe}
      edges={['top', 'left', 'right', 'bottom']}
    >
      {/* Header */}
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back"
          onPress={handleBack}
          hitSlop={8}
          style={styles.headerBtn}
        >
          <Icon name="ArrowLeft" size={18} color={tokens.textColors.secondary} />
        </Pressable>

        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {book.title}
          </Text>
          <ListeningPill chNum={chNum} isPlaying={isPlaying} />
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Chapters"
          onPress={() => {}}
          hitSlop={8}
          style={styles.headerBtn}
        >
          <Icon name="ListDetails" size={17} color={tokens.textColors.secondary} />
        </Pressable>
      </View>

      {/* Bimodal text */}
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.chapterLabel}>Chapter four</Text>

        {PARAGRAPHS.map((sentences, pIdx) => (
          <BimodalParagraph
            key={pIdx}
            sentences={sentences}
            isActive={pIdx === ACTIVE_PARA}
            activeSentenceIdx={ACTIVE_SENTENCE}
            currentWordIdx={currentWordIdx}
          />
        ))}
      </ScrollView>

      {/* Audio player */}
      <View style={styles.player}>
        {/* Scrub bar */}
        <View style={styles.scrubRow}>
          <Text style={styles.scrubTime}>{formatTime(elapsedSecs)}</Text>
          <View
            style={styles.scrubTrack}
            onLayout={(e) => setTrackWidth(e.nativeEvent.layout.width)}
            onStartShouldSetResponder={() => true}
            onMoveShouldSetResponder={() => true}
            onResponderGrant={(e: GestureResponderEvent) =>
              scrubFromX(e.nativeEvent.locationX)
            }
            onResponderMove={(e: GestureResponderEvent) =>
              scrubFromX(e.nativeEvent.locationX)
            }
          >
            <View
              style={[styles.scrubFill, { width: `${scrubPos * 100}%` as `${number}%` }]}
            />
            <View
              style={[
                styles.scrubThumb,
                { left: `${scrubPos * 100}%` as `${number}%` },
              ]}
            />
          </View>
          <Text style={styles.scrubTime}>{formatTime(TOTAL_SECS)}</Text>
        </View>

        {/* Transport */}
        <View style={styles.transport}>
          <Pressable style={styles.speedPill} onPress={cycleSpeed}>
            <Text style={styles.speedLabel}>
              {speed === 1 ? '1×' : `${speed}×`}
            </Text>
          </Pressable>

          <View style={styles.skipWrap}>
            <Pressable
              accessibilityRole="button"
              onPress={skipBack}
              style={styles.transportBtn}
            >
              <Icon name="PlayerSkipBack" size={24} color={tokens.textColors.secondary} />
            </Pressable>
            <Text style={styles.skipLabel}>−15s</Text>
          </View>

          <Pressable
            style={styles.playBtn}
            onPress={() => setIsPlaying((p) => !p)}
            accessibilityLabel={isPlaying ? 'Pause' : 'Play'}
          >
            <Icon
              name={isPlaying ? 'Pause' : 'Play'}
              size={20}
              color={tokens.bgColors.canvas}
            />
          </Pressable>

          <View style={styles.skipWrap}>
            <Pressable
              accessibilityRole="button"
              onPress={skipForward}
              style={styles.transportBtn}
            >
              <Icon name="PlayerSkipForward" size={24} color={tokens.textColors.secondary} />
            </Pressable>
            <Text style={styles.skipLabel}>+15s</Text>
          </View>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Sleep timer"
            onPress={() => {}}
            style={styles.transportBtn}
          >
            <Icon name="Moon" size={20} color={tokens.textColors.disabled} />
          </Pressable>
        </View>

        {/* Action pills */}
        <View style={styles.pillsRow}>
          <Pressable
            style={styles.pill}
            onPress={() => voiceSheetRef.current?.present()}
          >
            <Icon name="Headphones" size={12} color={tokens.textColors.muted} />
            <Text style={styles.pillLabel}>{selectedVoice.name}</Text>
          </Pressable>
          <Pressable style={styles.pill} onPress={() => {}}>
            <Icon name="ListDetails" size={12} color={tokens.textColors.muted} />
            <Text style={styles.pillLabel}>Ch. {chNum}</Text>
          </Pressable>
        </View>
      </View>

      {/* Voice picker sheet */}
      <BottomSheet ref={voiceSheetRef}>
        <VoiceSheet
          selectedVoiceId={selectedVoiceId}
          onSelect={(id) => {
            setSelectedVoiceId(id);
            voiceSheetRef.current?.dismiss();
          }}
          onClose={() => voiceSheetRef.current?.dismiss()}
        />
      </BottomSheet>
    </SafeAreaView>
  );
}

// ─── Listening pill ───────────────────────────────────────────────────────────

function ListeningPill({
  chNum,
  isPlaying,
}: {
  chNum: string;
  isPlaying: boolean;
}) {
  const opacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!isPlaying) {
      opacity.setValue(1);
      return;
    }
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 0.3,
          duration: 700,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 1,
          duration: 700,
          useNativeDriver: true,
        }),
      ]),
    );
    anim.start();
    return () => anim.stop();
  }, [isPlaying, opacity]);

  return (
    <View style={styles.listeningPill}>
      <Animated.View style={[styles.listeningDot, { opacity }]} />
      <Text style={styles.listeningLabel}>
        {isPlaying ? `Listening · Ch. ${chNum}` : `Paused · Ch. ${chNum}`}
      </Text>
    </View>
  );
}

// ─── Bimodal paragraph ────────────────────────────────────────────────────────

function BimodalParagraph({
  sentences,
  isActive,
  activeSentenceIdx,
  currentWordIdx,
}: {
  sentences: string[];
  isActive: boolean;
  activeSentenceIdx: number;
  currentWordIdx: number;
}) {
  if (!isActive) {
    return (
      <RNText style={[styles.para, styles.paraDim]}>
        {sentences.join(' ')}
      </RNText>
    );
  }

  return (
    <RNText style={[styles.para, styles.paraActive]}>
      {sentences.map((sentence, sIdx) => {
        if (sIdx < activeSentenceIdx) {
          return (
            <RNText key={sIdx} style={styles.priorSentence}>
              {sentence}{' '}
            </RNText>
          );
        }

        if (sIdx === activeSentenceIdx) {
          const words = sentence.split(/\s+/);
          return (
            <RNText key={sIdx} style={styles.activeSentence}>
              {words.map((word, wIdx) => {
                const isCurrentWord = wIdx === currentWordIdx;
                return (
                  <RNText
                    key={wIdx}
                    style={isCurrentWord ? styles.activeWord : undefined}
                  >
                    {wIdx > 0 ? ' ' : ''}
                    {word}
                  </RNText>
                );
              })}
            </RNText>
          );
        }

        return (
          <RNText key={sIdx} style={{ opacity: 0.55 }}>
            {' '}{sentence}
          </RNText>
        );
      })}
    </RNText>
  );
}

// ─── Voice picker sheet ───────────────────────────────────────────────────────

function VoiceSheet({
  selectedVoiceId,
  onSelect,
  onClose,
}: {
  selectedVoiceId: string;
  onSelect: (id: string) => void;
  onClose: () => void;
}) {
  const freeVoices = VOICES.filter((v) => v.tier === 'free');
  const proVoices = VOICES.filter((v) => v.tier === 'pro');

  return (
    <View>
      <View style={styles.sheetTitleRow}>
        <Text style={styles.sheetTitle}>Choose a voice</Text>
        <Pressable
          onPress={onClose}
          style={styles.sheetClose}
          hitSlop={8}
          accessibilityLabel="Close"
        >
          <Icon name="X" size={14} color={tokens.textColors.muted} />
        </Pressable>
      </View>

      {/* Free voices */}
      <Text style={styles.voiceSectionLabel}>Free</Text>
      <View style={styles.voiceGroup}>
        {freeVoices.map((voice, idx) => (
          <VoiceRow
            key={voice.id}
            voice={voice}
            isSelected={voice.id === selectedVoiceId}
            isLast={idx === freeVoices.length - 1}
            onPress={() => onSelect(voice.id)}
          />
        ))}
      </View>

      {/* Pro voices */}
      <Text style={styles.voiceSectionLabel}>Pro voices</Text>
      <View style={styles.voiceGroup}>
        {proVoices.map((voice, idx) => (
          <VoiceRow
            key={voice.id}
            voice={voice}
            isSelected={false}
            isLast={idx === proVoices.length - 1}
            locked
            onPress={() => {}}
          />
        ))}
      </View>

      {/* Pro upsell */}
      <View style={styles.proUpsell}>
        <View style={{ flex: 1 }}>
          <Text style={styles.upsellTitle}>Unlock all voices</Text>
          <Text style={styles.upsellSub}>
            4 premium voices + faster audio on Standard
          </Text>
        </View>
        <Pressable style={styles.upsellBtn} onPress={() => {}}>
          <Text style={styles.upsellBtnLabel}>Upgrade</Text>
        </Pressable>
      </View>
    </View>
  );
}

function VoiceRow({
  voice,
  isSelected,
  isLast,
  locked,
  onPress,
}: {
  voice: (typeof VOICES)[number];
  isSelected: boolean;
  isLast: boolean;
  locked?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.voiceRow,
        !isLast && styles.voiceRowBorder,
        locked && styles.voiceRowLocked,
        pressed && !locked && { backgroundColor: tokens.bgColors.raised },
      ]}
    >
      <View
        style={[
          styles.voiceAvatar,
          { backgroundColor: voice.bg },
        ]}
      >
        <Text style={[styles.voiceAvatarText, { color: voice.fg }]}>
          {voice.name[0]}
        </Text>
      </View>

      <View style={styles.voiceInfo}>
        <Text style={styles.voiceName}>{voice.name}</Text>
        <Text style={styles.voiceMeta}>{voice.desc}</Text>
      </View>

      <View style={styles.voiceTrailing}>
        {locked ? (
          <>
            <View style={styles.proBadge}>
              <Text style={styles.proBadgeLabel}>Pro</Text>
            </View>
            <Icon name="Lock" size={14} color={tokens.textColors.disabled} />
          </>
        ) : (
          <>
            {isSelected ? (
              <Icon name="Check" size={16} color={tokens.colors.forest[800]} strokeWidth={2} />
            ) : null}
          </>
        )}
      </View>
    </Pressable>
  );
}

// ─── Mini player (rendered in LibraryScreen above tab bar) ───────────────────

export type MiniPlayerProps = {
  book: Book;
  onExpand: () => void;
};

export function MiniPlayer({ book, onExpand }: MiniPlayerProps) {
  const [isPlaying, setIsPlaying] = useState(true);

  return (
    <Pressable
      style={styles.mini}
      onPress={onExpand}
      accessibilityLabel="Expand player"
    >
      {/* Cover initial */}
      <View style={styles.miniCover}>
        <Text style={styles.miniCoverText} numberOfLines={2}>
          {book.title}
        </Text>
      </View>

      {/* Info */}
      <View style={styles.miniInfo}>
        <Text style={styles.miniTitle} numberOfLines={1}>
          {book.title} · Ch. {book.currentChapter?.match(/\d+/)?.[0] ?? '1'}
        </Text>
        <View style={styles.miniProgressTrack}>
          <View
            style={[
              styles.miniProgressFill,
              { width: `${book.progressPercent}%` as `${number}%` },
            ]}
          />
        </View>
      </View>

      {/* Controls — stop propagation so taps on buttons don't expand */}
      <View style={styles.miniControls}>
        <Pressable
          onPress={(e) => {
            e.stopPropagation();
            /* skip back */
          }}
          style={styles.miniBtn}
          hitSlop={8}
        >
          <Icon name="PlayerSkipBack" size={18} color={tokens.colors.cream[50]} />
        </Pressable>
        <Pressable
          onPress={(e) => {
            e.stopPropagation();
            setIsPlaying((p) => !p);
          }}
          style={styles.miniPlayBtn}
          hitSlop={4}
        >
          <Icon
            name={isPlaying ? 'Pause' : 'Play'}
            size={14}
            color={tokens.colors.cream[50]}
          />
        </Pressable>
      </View>
    </Pressable>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatTime(secs: number): string {
  return `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: tokens.bgColors.canvas,
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: tokens.space.lg,
    paddingVertical: 10,
    borderBottomWidth: 0.5,
    borderBottomColor: tokens.borderColors.subtle,
    backgroundColor: tokens.bgColors.canvas,
  },
  headerBtn: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: tokens.space.sm,
    gap: 4,
  },
  headerTitle: {
    fontFamily: tokens.fonts.display,
    fontSize: 13,
    fontWeight: '500',
    color: tokens.textColors.primary,
  },

  // Listening pill
  listeningPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: tokens.colors.forest[50],
    borderRadius: 99,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  listeningDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: tokens.colors.forest[800],
  },
  listeningLabel: {
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 10,
    fontWeight: '500',
    color: tokens.colors.forest[800],
    letterSpacing: 0.2,
  },

  // Bimodal scroll
  scroll: { flex: 1 },
  scrollContent: {
    paddingHorizontal: 22,
    paddingTop: tokens.space.lg,
    paddingBottom: tokens.space.lg,
  },
  chapterLabel: {
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 10,
    fontWeight: '500',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: tokens.colors.ink[300],
    marginBottom: tokens.space.lg,
  },

  // Paragraphs
  para: {
    fontFamily: tokens.fonts.reading,
    fontSize: 16,
    lineHeight: 16 * 1.78,
    marginBottom: 18,
  },
  paraDim: {
    color: tokens.colors.ink[300],
  },
  paraActive: {
    color: tokens.textColors.primary,
  },
  priorSentence: {
    color: tokens.textColors.primary,
  },
  activeSentence: {
    color: tokens.colors.ink[700],
  },
  activeWord: {
    backgroundColor: tokens.colors.amber[500],
    color: tokens.colors.forest[900],
    fontWeight: '500',
    borderRadius: 2,
  },

  // Player
  player: {
    backgroundColor: tokens.bgColors.canvas,
    borderTopWidth: 0.5,
    borderTopColor: tokens.borderColors.subtle,
    paddingTop: 12,
    paddingHorizontal: 20,
  },

  // Scrub
  scrubRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 10,
  },
  scrubTime: {
    fontFamily: tokens.fonts.ui,
    fontSize: 10,
    color: tokens.textColors.disabled,
    minWidth: 28,
    textAlign: 'center',
    flexShrink: 0,
  },
  scrubTrack: {
    flex: 1,
    height: 4,
    backgroundColor: tokens.colors.cream[200],
    borderRadius: 2,
    position: 'relative',
    justifyContent: 'center',
  },
  scrubFill: {
    position: 'absolute',
    left: 0,
    top: 0,
    height: '100%',
    backgroundColor: tokens.colors.forest[800],
    borderRadius: 2,
  },
  scrubThumb: {
    position: 'absolute',
    top: '50%',
    marginTop: -6,
    marginLeft: -6,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: tokens.colors.forest[800],
    borderWidth: 2,
    borderColor: tokens.bgColors.canvas,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
    elevation: 2,
  },

  // Transport
  transport: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 20,
    marginBottom: 12,
  },
  speedPill: {
    height: 28,
    paddingHorizontal: 10,
    borderRadius: 14,
    backgroundColor: tokens.bgColors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  speedLabel: {
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 12,
    fontWeight: '500',
    color: tokens.textColors.secondary,
  },
  skipWrap: {
    alignItems: 'center',
    gap: 0,
  },
  transportBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  skipLabel: {
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 8,
    fontWeight: '500',
    color: tokens.textColors.disabled,
    marginTop: -4,
  },
  playBtn: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: tokens.colors.forest[800],
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: tokens.colors.forest[800],
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 4,
  },

  // Pills
  pillsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    paddingBottom: 24,
  },
  pill: {
    height: 30,
    paddingHorizontal: 12,
    borderRadius: 15,
    backgroundColor: tokens.bgColors.surface,
    borderWidth: 0.5,
    borderColor: tokens.borderColors.subtle,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  pillLabel: {
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 11,
    fontWeight: '500',
    color: tokens.textColors.secondary,
  },

  // Voice sheet
  sheetTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: tokens.space.md,
  },
  sheetTitle: {
    fontFamily: tokens.fonts.display,
    fontSize: 16,
    fontWeight: '500',
    color: tokens.textColors.primary,
  },
  sheetClose: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: tokens.bgColors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  voiceSectionLabel: {
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 10,
    fontWeight: '500',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: tokens.textColors.disabled,
    marginBottom: 8,
  },
  voiceGroup: {
    borderRadius: tokens.radii.xl,
    overflow: 'hidden',
    borderWidth: 0.5,
    borderColor: tokens.borderColors.subtle,
    marginBottom: tokens.space.lg,
  },
  voiceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    backgroundColor: tokens.bgColors.canvas,
    minHeight: 60,
  },
  voiceRowBorder: {
    borderBottomWidth: 0.5,
    borderBottomColor: tokens.borderColors.subtle,
  },
  voiceRowLocked: {
    opacity: 0.6,
  },
  voiceAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  voiceAvatarText: {
    fontFamily: tokens.fonts.display,
    fontSize: 14,
    fontWeight: '500',
  },
  voiceInfo: { flex: 1 },
  voiceName: {
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 14,
    fontWeight: '500',
    color: tokens.textColors.primary,
    marginBottom: 2,
  },
  voiceMeta: {
    fontFamily: tokens.fonts.ui,
    fontSize: 11,
    color: tokens.textColors.muted,
  },
  voiceTrailing: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexShrink: 0,
  },
  proBadge: {
    backgroundColor: tokens.colors.amber[200],
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  proBadgeLabel: {
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 10,
    fontWeight: '500',
    color: tokens.textColors.secondary,
  },
  proUpsell: {
    backgroundColor: tokens.colors.forest[800],
    borderRadius: tokens.radii.xl,
    padding: tokens.space.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  upsellTitle: {
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 13,
    fontWeight: '500',
    color: tokens.colors.cream[50],
    marginBottom: 2,
  },
  upsellSub: {
    fontFamily: tokens.fonts.ui,
    fontSize: 11,
    color: tokens.colors.forest[200],
    lineHeight: 16,
  },
  upsellBtn: {
    height: 32,
    paddingHorizontal: 14,
    borderRadius: tokens.radii.md,
    backgroundColor: tokens.colors.amber[500],
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  upsellBtnLabel: {
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 12,
    fontWeight: '500',
    color: tokens.colors.forest[900],
  },

  // Mini player
  mini: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: tokens.colors.forest[800],
    paddingVertical: 10,
    paddingHorizontal: tokens.space.lg,
    borderTopWidth: 0.5,
    borderTopColor: tokens.colors.forest[700],
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 8,
  },
  miniCover: {
    width: 36,
    height: 36,
    borderRadius: 5,
    backgroundColor: tokens.colors.forest[700],
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    padding: 4,
  },
  miniCoverText: {
    fontFamily: tokens.fonts.display,
    fontSize: 5,
    color: tokens.colors.cream[50],
    textAlign: 'center',
    lineHeight: 7,
  },
  miniInfo: { flex: 1, minWidth: 0 },
  miniTitle: {
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 12,
    fontWeight: '500',
    color: tokens.colors.cream[50],
    marginBottom: 4,
  },
  miniProgressTrack: {
    height: 2,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 1,
    overflow: 'hidden',
  },
  miniProgressFill: {
    height: '100%',
    backgroundColor: tokens.colors.amber[500],
    borderRadius: 1,
  },
  miniControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexShrink: 0,
  },
  miniBtn: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  miniPlayBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
