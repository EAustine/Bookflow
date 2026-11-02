/**
 * The §6 component gallery — one page holding every interactive
 * component whose hover and focus states R-M9 wired, so a real browser
 * with a real Tab key can be pointed at them.
 *
 * ## Why this exists
 *
 * §10 asks that "keyboard tabbing on web shows the focus ring on every
 * interactive row, card and button". R-M9 wired thirteen components and
 * could verify exactly one of them, Button, because the other twelve
 * sit behind a signed-in session and there is no test account this
 * session may use. A source audit can prove the three lines are there;
 * it cannot prove the ring is *visible*, and the card shapes are where
 * that distinction bites: `FocusRing shape="card"` outsets 4px, so any
 * ancestor that clips its overflow hides the ring completely while the
 * code reads as correct.
 *
 * So: the six components that are importable render here with fixed
 * mock props, `e2e/focus-ring.spec.ts` tabs through them in CI, and the
 * claim stops depending on anyone remembering to check.
 *
 * It carries the illustration set too, added in the R-M10 sign-off
 * pass. Those are not interactive and add no tab stops; they are here
 * for the same reason the components are, which is that the screens
 * that use them need a session and this does not.
 *
 * ## What it deliberately is not
 *
 * Not a screen harness. Seven of the thirteen components are local to
 * four screens (`CircleIconButton`, `BookListItem`, `ActionRow`,
 * `RadioRow`, `CategoryChip`, `ShortCard`, `ActionBarItem`) and are
 * private on purpose; reaching them means rendering their screens,
 * which means a session and a database. They are audited in
 * `docs/evidence/r-m10/README.md` instead, and the record says so.
 *
 * Not a route. It renders in place of `<Slot />` from the root layout,
 * which keeps it out of the router entirely: no entry in the route map,
 * no interaction with the boot hand-off, and no second tab order from a
 * screen sitting underneath it.
 *
 * ## Getting to it
 *
 * `?gallery=1`, on a bundle exported with `EXPO_PUBLIC_UI_GALLERY=1`.
 * Both, so a production export ignores the parameter.
 */

import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRef } from 'react';
import {
  Button,
  Input,
  ListRow,
  Presenter,
  RecentListenRow,
  Text,
  type BottomSheetRef,
} from '~/components';
import { CheckEmailIllustration } from '~/components/illustrations/CheckEmailIllustration';
import { EmptyLibraryIllustration } from '~/components/illustrations/EmptyLibraryIllustration';
import { EmptyListenIllustration } from '~/components/illustrations/EmptyListenIllustration';
import { LinkExpiredIllustration } from '~/components/illustrations/LinkExpiredIllustration';
import { NoResultsIllustration } from '~/components/illustrations/NoResultsIllustration';
import { ScannedPdfIllustration } from '~/components/illustrations/ScannedPdfIllustration';
import { SomethingWentWrongIllustration } from '~/components/illustrations/SomethingWentWrongIllustration';
import { UploadFailedIllustration } from '~/components/illustrations/UploadFailedIllustration';
import { WelcomeHeroIllustration } from '~/components/illustrations/WelcomeHeroIllustration';
import {
  DiscoverBookRow,
  RailCard,
  type DiscoverBookRowProps,
} from '~/features/discover';
import { BookGridTile } from '~/features/library';
import { TranslateWordPopover } from '~/features/reader';
import { alert } from '~/platform/alert';
import type { Book } from '~/types/book';
import { tokens } from '~/design/tokens';

export const uiGalleryRequested: typeof import('./uiGallery').uiGalleryRequested =
  typeof window !== 'undefined' &&
  new URLSearchParams(window.location.search).get('gallery') === '1' &&
  process.env.EXPO_PUBLIC_UI_GALLERY === '1';

/**
 * A library book, fixed. Not from the database and not random: the
 * spec asserts against what it reads, and a tile whose content moves
 * between runs makes a failure impossible to tell from a flake.
 */
const BOOK: Book = {
  id: 'gallery-book',
  title: 'The Count of Monte Cristo',
  author: 'Alexandre Dumas',
  type: 'epub',
  totalPages: 1243,
  currentPage: 418,
  progressPercent: 34,
  lastReadAt: new Date('2026-10-30T09:00:00Z'),
  addedAt: new Date('2026-09-01T09:00:00Z'),
  coverColor: tokens.colors.forest[700],
  processingStatus: 'ready',
  coverStoragePath: null,
};

/**
 * A Discover book in the *screen* shape, which is not the API's shape:
 * `features/discover/types` adds `coverColor` and `coverLabel` and
 * spells its source ids without hyphens, and `DiscoverScreen`'s
 * `fromApiBook` translates at that one boundary. The type is reached
 * through the row's own props rather than by widening the barrel with
 * a second `DiscoverBook`.
 */
const DISCOVER_BOOK: DiscoverBookRowProps['book'] = {
  id: 'gutenberg:1342',
  title: 'Pride and Prejudice',
  author: 'Jane Austen',
  coverColor: tokens.colors.forest[800],
  coverLabel: 'Pride and Prejudice',
  coverUrl: null,
  epubUrl: null,
  tags: ['Fiction', 'Romance'],
  about: 'Public-domain title from Project Gutenberg, free to read in your library.',
  source: 'gutenberg',
  sourceLabel: 'Project Gutenberg',
};

/** Frozen so the grid tile's "last read" line cannot drift mid-run. */
const NOW = new Date('2026-11-02T09:00:00Z');

const noop = () => {};

export const UiGallery: typeof import('./uiGallery').UiGallery = function UiGallery() {
  // Presented exactly as the Listen tab presents it: a `Presenter`
  // with an anchor ref, which does the measuring for its callers.
  const sideAnchorRef = useRef<View>(null);
  const sideRef = useRef<BottomSheetRef>(null);
  return (
    <SafeAreaView style={styles.root} testID="ui-gallery">
      <ScrollView contentContainerStyle={styles.content}>
        <Text variant="display-sm" style={styles.heading}>
          Interaction gallery
        </Text>
        <Text variant="body-sm" color="muted" style={styles.blurb}>
          Every component R-M9 gave a hover and a focus-visible state,
          with fixed props. Tab through it: each stop should show a 2px
          accent ring, and a mouse click should show none.
        </Text>

        <Stop id="button-primary" label="Button, primary">
          <Button label="Get started" onPress={noop} />
        </Stop>

        <Stop id="button-secondary" label="Button, secondary">
          <Button label="Browse the library" variant="secondary" onPress={noop} />
        </Stop>

        <Stop id="button-tertiary" label="Button, tertiary">
          <Button label="Not now" variant="tertiary" onPress={noop} />
        </Stop>

        <Stop id="input" label="Input">
          <Input label="Email" placeholder="you@example.com" />
        </Stop>

        <Stop id="list-row" label="List row, drills into">
          <ListRow label="Reading display" sublabel="Serif, 18pt" drillsInto onPress={noop} />
        </Stop>

        <Stop id="list-row-toggle" label="List row, toggle">
          <ListRow
            label="Daily reading reminder"
            sublabel="Every day at 20:00"
            toggle={{ value: true, onChange: noop }}
          />
        </Stop>

        <Stop id="recent-listen-row" label="Recent listen row">
          <RecentListenRow
            title="Pride and Prejudice"
            meta="Chapter 12 · 18 min left"
            initials="PP"
            coverStoragePath={null}
            coverColor={tokens.colors.forest[600]}
            isActive={false}
            isPlaying={false}
            onPress={noop}
          />
        </Stop>

        <Stop id="discover-book-row" label="Discover book row">
          <DiscoverBookRow
            book={DISCOVER_BOOK}
            inLibrary={false}
            pending={false}
            onPress={noop}
            onAdd={noop}
          />
        </Stop>

        {/* The two card shapes. Their ring outsets, so these are the
            stops that prove nothing above them clips it. */}
        <Stop id="rail-card" label="Rail card (card ring)">
          <RailCard book={DISCOVER_BOOK} inLibrary={false} onPress={noop} />
        </Stop>

        <Stop id="book-grid-tile" label="Book grid tile (card ring)">
          <BookGridTile book={BOOK} width={150} now={NOW} onPress={noop} />
        </Stop>

        <Text variant="display-sm" style={styles.heading}>
          Popovers
        </Text>
        <Text variant="body-sm" color="muted" style={styles.blurb}>
          Every popover in the app drops below its trigger. The Listen
          tab's voice pill is the one that sits beside it, so this is
          `placePopover`'s side axis with the arrow on the card's own
          left edge.
        </Text>

        <Stop id="popover-side" label="Side axis">
          <View ref={sideAnchorRef} collapsable={false}>
            <Button
              label="Open beside me"
              variant="secondary"
              onPress={() => sideRef.current?.present()}
            />
          </View>
          <Presenter
            kind="menu"
            axis="side"
            anchorRef={sideAnchorRef}
            ref={sideRef}
            title="Voice"
          >
            <Text variant="body-sm" color="muted">
              Beside the trigger, top aligned with it, arrow pointing
              back at it.
            </Text>
          </Presenter>
        </Stop>

        <Stop id="translate-word-popover" label="Translate word popover, 260">
          <View style={styles.translateCard}>
            <TranslateWordPopover
              word="acknowledged"
              phonetic="/əkˈnɒlɪdʒd/"
              definition="Accepted or admitted to be true."
              translation="agye tom"
              toLang="TWI"
              saved={false}
              onPlayAudio={noop}
              onSave={noop}
              onDismiss={noop}
            />
          </View>
        </Stop>

        <Text variant="display-sm" style={styles.heading}>
          Alerts
        </Text>
        <Text variant="body-sm" color="muted" style={styles.blurb}>
          `Alert.alert` draws nothing on web, so these raise the real
          thing through `platform/alert` and `AlertHost` answers. The
          second queues two, because two failures in one handler are two
          things to read.
        </Text>

        <Stop id="alert-one-button" label="One button">
          <Button
            label="Raise a one-button alert"
            variant="secondary"
            onPress={() =>
              alert(
                'Could not add book',
                'We could not reach the server. Check your connection and try again.',
              )
            }
          />
        </Stop>

        <Stop id="alert-two-buttons" label="Cancel and a destructive action">
          <Button
            label="Raise two alerts"
            variant="secondary"
            onPress={() => {
              alert('Remove this book?', 'It will leave your library.', [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Remove', style: 'destructive' },
              ]);
              alert('And one behind it', 'The queue holds them in order.');
            }}
          />
        </Stop>

        <Text variant="display-sm" style={styles.heading}>
          Illustrations
        </Text>
        <Text variant="body-sm" color="muted" style={styles.blurb}>
          Each at the size its screen's frame draws it. They are not
          interactive and add no tab stops; they are here because the
          screens that use them need a session and this does not.
        </Text>

        <Specimen label="Welcome hero, 280">
          <WelcomeHeroIllustration width={280} />
        </Specimen>
        <Specimen label="Check email, 96">
          <CheckEmailIllustration size={96} />
        </Specimen>
        <Specimen label="Link expired, 80">
          <LinkExpiredIllustration size={80} />
        </Specimen>
        <Specimen label="Empty library, 140">
          <EmptyLibraryIllustration size={140} />
        </Specimen>
        <Specimen label="Empty listen, 140">
          <EmptyListenIllustration size={140} />
        </Specimen>
        <Specimen label="No results, 120">
          <NoResultsIllustration size={120} />
        </Specimen>
        <Specimen label="Scanned PDF, 120">
          <ScannedPdfIllustration size={120} />
        </Specimen>
        <Specimen label="Something went wrong, 120">
          <SomethingWentWrongIllustration size={120} />
        </Specimen>
        <Specimen label="Upload failed, 120">
          <UploadFailedIllustration size={120} />
        </Specimen>
      </ScrollView>
    </SafeAreaView>
  );
};

/**
 * One specimen, wrapped so the spec can ask which stop the focus landed
 * in and whether the ring is inside that same stop. The padding is the
 * card ring's outset plus a little, so an outset ring is not clipped by
 * the stop itself — that would be the harness hiding the bug it is
 * here to find.
 */
/** A drawing with its label. No wrapper id: nothing here is focusable. */
function Specimen({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={styles.stop}>
      <Text variant="label-sm" color="muted">
        {label}
      </Text>
      {children}
    </View>
  );
}

function Stop({
  id,
  label,
  children,
}: {
  id: string;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.stop}>
      <Text variant="label-sm" color="muted">
        {label}
      </Text>
      <View style={styles.specimen} testID={`stop-${id}`}>
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: tokens.bgColors.canvas,
  },
  content: {
    padding: tokens.layout.gutter.desktop,
    gap: tokens.space.lg,
    maxWidth: tokens.layout.lane.width + tokens.layout.gutter.desktop * 2,
  },
  heading: {
    marginBottom: tokens.space.xs,
  },
  blurb: {
    marginBottom: tokens.space.lg,
  },
  stop: {
    gap: tokens.space.xs,
  },
  specimen: {
    padding: tokens.focusRing.card.outset + tokens.focusRing.width,
  },
  translateCard: {
    width: tokens.layout.popover.word,
  },
});
