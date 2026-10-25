/**
 * RecentListenRow — one book in a "recently listened" list.
 *
 * Two surfaces render this list and they used to each own a copy:
 * `ListenHistoryScreen.Row` and `ListenNowPlayingScreen.recentRow`.
 * Same data, same three trailing states, different metrics — 44 vs 38
 * cover, 14 vs 13 title, 11 vs 10 meta, 18/10 vs 14/11 padding. The
 * difference is real (the now-playing list is a dense inset block, the
 * history screen is a full page) but it is a *size*, not a different
 * component. (F-21.)
 *
 *   size="regular"  → the history screen
 *   size="compact"  → the now-playing recently-listened block
 *
 * Props are primitives rather than a `Book`, because the two callers
 * hold different shapes: the history screen has a `Book` row from the
 * database, the now-playing screen has a lighter `track` projection.
 *
 * Trailing indicator, three states, all inside the same 32×32 circle so
 * they line up vertically across rows:
 *   active + playing → animated EQ bars
 *   active + paused  → Pause
 *   inactive         → Play
 */
import { useEffect, useState } from 'react';
import { Image, Pressable, StyleSheet, View } from 'react-native';
import { EqBars } from './EqBars';
import { Icon } from './Icon';
import { Text } from './Text';
import { tokens } from '~/design/tokens';
import { peekCachedCoverUrl, resolveCoverUrl } from '~/features/library';

export type RecentListenRowSize = 'compact' | 'regular';

export type RecentListenRowProps = {
  title: string;
  meta: string;
  /** Two-letter fallback shown when there is no cover image. */
  initials: string;
  coverStoragePath: string | null;
  /** Shows through any margin on the image, and is the whole cover
   *  when no image resolves. */
  coverColor: string;
  /** This row is the current listening session. */
  isActive: boolean;
  /** True only when this row is active AND audio is audible. */
  isPlaying: boolean;
  size?: RecentListenRowSize;
  /** Hairline under the row — the dense now-playing block separates
   *  rows itself; the history screen draws its own inset separator. */
  showDivider?: boolean;
  /** Dim the cover — the now-playing block dims the active row's cover
   *  while paused. */
  dimCover?: boolean;
  onPress: () => void;
};

const METRICS = {
  compact: {
    cover: 38,
    titleSize: 13,
    metaSize: 10,
    metaMarginTop: 0,
    paddingHorizontal: 14,
    paddingVertical: 11,
    eqHeight: undefined as number | undefined,
  },
  regular: {
    cover: 44,
    titleSize: 14,
    metaSize: 11,
    metaMarginTop: 2,
    paddingHorizontal: 18,
    paddingVertical: 10,
    eqHeight: 14 as number | undefined,
  },
} as const;

export function RecentListenRow({
  title,
  meta,
  initials,
  coverStoragePath,
  coverColor,
  isActive,
  isPlaying,
  size = 'regular',
  showDivider = false,
  dimCover = false,
  onPress,
}: RecentListenRowProps) {
  const m = METRICS[size];

  // Resolve through the shared bookCovers cache, so a cover already
  // seen on Library or Now Playing paints instantly here.
  const [url, setUrl] = useState<string | null>(() =>
    coverStoragePath ? peekCachedCoverUrl(coverStoragePath) : null,
  );
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!coverStoragePath) {
      setUrl(null);
      return;
    }
    if (url) return; // resolved synchronously from the cache
    let cancelled = false;
    void resolveCoverUrl(coverStoragePath)
      .then((resolved) => {
        if (!cancelled) setUrl(resolved);
      })
      .catch((err) => {
        // Silent on offline — the coloured placeholder is a graceful
        // fallback. Metro-only log for debugging.
        if (!cancelled) {
          console.warn('[RecentListenRow] cover resolve failed:', err);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [coverStoragePath, url]);

  const showImage = !!url && !failed;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [
        styles.row,
        {
          paddingHorizontal: m.paddingHorizontal,
          paddingVertical: m.paddingVertical,
        },
        isActive && styles.rowActive,
        showDivider && styles.rowDivider,
        pressed && { backgroundColor: tokens.bgColors.raised },
      ]}
    >
      <View
        style={[
          styles.cover,
          { width: m.cover, height: m.cover, backgroundColor: coverColor },
          dimCover && { opacity: 0.6 },
        ]}
      >
        {showImage ? (
          <Image
            source={{ uri: url! }}
            style={StyleSheet.absoluteFill}
            resizeMode="cover"
            onError={() => setFailed(true)}
          />
        ) : (
          <Text style={styles.coverText}>{initials}</Text>
        )}
      </View>

      <View style={styles.info}>
        <Text
          numberOfLines={1}
          style={[
            styles.title,
            { fontSize: m.titleSize },
            isActive && { color: tokens.colors.forest[800] },
          ]}
        >
          {title}
        </Text>
        <Text
          numberOfLines={1}
          style={[
            styles.meta,
            { fontSize: m.metaSize, marginTop: m.metaMarginTop },
            isActive && { color: tokens.colors.forest[700] },
          ]}
        >
          {meta}
        </Text>
      </View>

      <View style={[styles.trailing, isActive && styles.trailingActive]}>
        {isActive && isPlaying ? (
          <EqBars playing height={m.eqHeight} color={tokens.colors.forest[800]} />
        ) : isActive ? (
          <Icon
            name="Pause"
            size={12}
            color={tokens.colors.forest[800]}
            strokeWidth={0}
          />
        ) : (
          <Icon
            name="Play"
            size={12}
            color={tokens.textColors.secondary}
            strokeWidth={0}
          />
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  rowActive: {
    backgroundColor: tokens.colors.forest[50],
  },
  rowDivider: {
    borderBottomWidth: tokens.borderWidth.hairline,
    borderBottomColor: tokens.borderColors.subtle,
  },
  cover: {
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  coverText: {
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 12,
    color: tokens.colors.cream[50],
    letterSpacing: 0.04,
  },
  info: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    fontFamily: tokens.fonts.display,
    color: tokens.textColors.primary,
  },
  meta: {
    fontFamily: tokens.fonts.ui,
    color: tokens.textColors.muted,
  },
  trailing: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: tokens.bgColors.surface,
  },
  trailingActive: {
    backgroundColor: tokens.colors.forest[50],
  },
});
