# Architecture migration log

Running record of decisions, progress and open questions, so any session can
resume cold. Newest entries at the bottom of each section.

Target: `docs/ARCHITECTURE.md` · Distance to it: `docs/ARCHITECTURE_GAPS.md`

---

## Where we are

| | |
|---|---|
| **Current step** | **M3 merged to `main` 2026-10-28** (fast-forward, 26 commits). Offline queue, the eight-feature decomposition, PDF page fidelity, `pageDisplay`, and the page-fidelity test are in |
| **Branch** | None in flight. `main` at `41c0add`, **26 commits ahead of `origin/main` — not pushed** |
| **`main`** | Carries M1, M2 and M3. tsc 0, eslint 0, deno check clean, 68 tests |
| **Next** | TanStack Query conversion (M3's remaining scope), the 7 routes deferred from M2, and the reader items under "Known, carried past the merge" below |

---

## Decisions

| Date | Decision | Who | Why |
|---|---|---|---|
| 2026-10-22 | `ui-cleanup` fast-forwarded to `main`, carrying `v11-batch`'s 32 commits with the cleanup round's 46 | Austine | Unblocks the migration gate. Both rounds reviewed together rather than separately |
| 2026-10-22 | **The canonical document preserves `pages.id`** | Austine | Seven tables of live user data reference it — `highlights`, `translations`, `practice_questions`, `summaries`, `reading_sessions`, `audio_cache`, `chunk_embeddings`. One is pgvector. New ids would mean a seven-table remap plus re-embedding every book. Now a constraint in §7.2 |
| 2026-10-22 | `ARCHITECTURE.md` adopted into the repo as `docs/ARCHITECTURE.md` | — | With two amendments; see commit `bd36983` |
| 2026-10-22 | **All seven Phase 0 amendments applied** to `ARCHITECTURE.md` | Austine | §7.2 `pages.id`, §7.4 character offsets, §7.5 fourth text surface, §8 clipboard adapter, §9.1 schema size, §9.2 metering already ships, §12/M1 agent-instruction consistency |
| 2026-10-22 | **`jobs` table, not Supabase Queues (pgmq)** | M0 spike 4 | pgmq has no worker, so it saves none of the scheduling work; §9.1 needs `jobs` for progress regardless, and queue messages are opaque. Choosing pgmq means running both |
| 2026-10-22 | **pdf.js is out of the engine; `react-native-pdf` stays permanently** | M0 spike 1 | 42/60 long frames on reading scroll, 3.1 s worst stall, 1,022 MB peak on a 2,473 MB device — measured in the same Chromium build as the device's WebView. The emulator flatters pdf.js, so a failure is binding. §7.6 |
| 2026-10-22 | M0's reader spike runs on an **emulator**, no physical device | Austine | None available. Recorded with its consequence in §13.1: the emulator runs arm64 natively on Apple Silicon, so it over-states CPU performance and cannot throttle. A failure there is conclusive; a pass is not. `react-native-pdf` stays until a real device confirms |
| 2026-10-22 | **npm workspaces**, not pnpm | Austine | Expo supports both and recommends neither. pnpm's isolated installs are exactly what React Native makes you disable (`nodeLinker: hoisted`), leaving pnpm configured to act like npm with an extra config file, a lockfile migration and a new EAS surface to debug. The repo is already npm |
| 2026-10-22 | **RevenueCat Billing** is the web engine, not Stripe Billing or Paddle | — | Stripe Billing adds 0.7% of volume on top of the same transaction fee, and Paddle's merchant-of-record service is not worth paying for unsurveyed. Revisit if VAT handling becomes the binding constraint |
| 2026-10-22 | Marketing site located at `~/bookflow-site`; `contact-notify` moves into `supabase/functions/` with it at M1 | Austine | It is unversioned and shares the app's Supabase project, so consolidating it ends a split-brain link and puts a live edge function under version control for the first time |
| 2026-10-22 | `ListenScreen` becomes **engine text mode with audio sync active**, not a separate mode or a native holdout | Austine | §7.4 already gives the engine word painting, so this is the reading consistent with the rest of the doc. Consequence: word sync's parity bar is `ListenScreen`, and bringing it to the other three modes is new work |

---

## Progress

### Responsive M5b — Discover · 2026-10-29

The rest of Discover: 26 wide frames, the Featured card's Size
property, and the Reading nook illustration. Finishes §4 Discover.

**Nine frames, one gutter pass.** Home, loading, refreshing, error and
slow network are the same screen with a zone swapped in, and every
block spans the content width behind the gutter — so most of this
milestone was moving a dozen literal 20s onto one size-class value,
not building nine layouts.

**Compact keeps 20, and that is written down.** `gutter.compact` is
16, but Discover's mobile frames are drawn at 20. Taking the token
would have shifted the phone 4px across every surface in the flow for
no reason the frames ask for, so `layout.discover.gutterCompact`
records the exception rather than leaving it to read as an oversight.

**Two columns, not a ceiling.** Search results and category lists
measure 330, 510 and 548 against inner widths of 684, 1044 and 1120 —
`(inner − columnGap) / 2` in each case. That is `tileWidth` from
`@bookflow/shared`, already pure and already tested, called with 2.
Deliberately not `BookGrid`: that lays out cover tiles at 2–4 columns,
and these are list rows with a 72-wide cover, which a third column
would squeeze below a readable title.

**The illustration is two drawings, not one scaled.** Wide is 440 × 268
flush right; Medium is the same artwork at 0.86 anchored bottom-right
**with the left sparkle and the squiggle removed**, because at that
scale they sit under the card's text. Both share a viewBox and a cover
slot, so `ReadingNookIllustration` carries one path set with a variant
tail, and the real cover is laid over the slot in RN rather than drawn
into the SVG — which keeps its image-with-fallback behaviour instead
of making a second code path inside an SVG.

**Corrected mid-milestone: Discover's pills were not drift.** The plan
moved them onto `Button`, on the reading that a hand-rolled 28pt
control was wrong against the system's compact 32. The frames say
otherwise — `Add pill` is a Figma component in its own right, used at
28 throughout Discover, and on the Featured card it is amber on
forest. `Button` has no on-dark variant, so the swap rendered a forest
primary on a forest-800 card and the control disappeared on screen.
The pill stays as a component; the real gaps are recorded instead: the
design system has no on-dark button, and `Add pill` is not in it.
Worth noting the premise came from a token comparison rather than from
the frames, which is the wrong way round for this programme.

**The file came down with it.** `DiscoverScreen.tsx` went 3400 → 2986
lines: `CoverBox`, `DiscoverBookRow`, `DiscoverResultList`,
`FeaturedCard`, `RailCard` and `AddPill` moved to
`features/discover/components/`, the screen-side `DiscoverBook` type
moved to `features/discover/types.ts` so those components can name it
without importing the screen, and 30 styles left dead by the move were
removed.

**A near miss worth recording:** one `str.replace` for the request
form's 640 cap silently matched nothing, because the style had a
different first property than the pattern assumed — and unlike the
others it had no assertion. It shipped to the emulator as a form still
at full width. Every edit in the milestone was then re-audited against
the file. Asserting on each replace is the cheap half of this; the
expensive half is that only the device screenshot caught it.

Verified at 360 / 820 / 1180 / 1440. Gate held: 0 errors / **221**
warnings — one below the old baseline, from an import the extraction
left unused — 98 tests; tokens 204 → 214.

### Responsive M5a — Book detail · 2026-10-29

§4 Book detail and §4 Discover are 41 wide frames between them, so M5
splits. M5a is the detail page; M5b is Discover.

**One rule covers all three wide sizes.** The cover is a fixed width —
192 at Medium, 228 above, keeping the phone's 0.68 ratio — and the info
column flexes with a **680 cap**. At Medium that lands on 460 without
being told to; above it the cap bites and the row simply stops short of
the content edge, which is what the frames draw. Reading the three
frames as three layouts would have produced three branches for what is
one behaviour.

**The phone's CTA bar becomes inline actions, and wrapping does the
rest.** At Medium the three in-library buttons total 521 against a 460
column, so "Remove from library" drops to a second line — the Medium
frame draws exactly that, and `flexWrap: 'wrap'` produces it at every
size with no branch.

**"More like this" keeps its own title honest.** There is no
related-books endpoint and inventing one would mean a request per
detail view, so the rail is built from shelves already in memory: the
category the user drilled in from, then subject-tag matches against
everything seen this session, then the popular shelf. The title follows
the content — it says "More like this" only when the books share a
category or a subject, and "Popular fiction" when it has fallen back.
Verified both on device: The Great Gatsby gets tag-matched fiction,
Pride and Prejudice falls back and says so.

**The shell was hiding the rail on a page that is not a takeover.**
`chromeHidden` grouped Discover's drill-ins with the readers and the
foreground player, so the wide book detail ran edge to edge with no
navigation. But §4 says "Book detail is a page in the content area, not
a sheet or panel", and every wide frame draws the rail beside it —
including Desktop, with the rail mini player in place. Split into
`railHidden` (the real takeovers) and `chromeHidden` (those plus the
drill-ins, which still hide the mini player on a phone for focus).

**The reverse-match bug, fixed at the root.** `libraryIds` mapped
`books.source_url` back to a Discover id for five sources;
`handleRemoveFromLibrary` reimplemented the same idea for two. So an
Open Library, Wikisource or DOAB book offered "Remove from library" and
dead-ended in the "Already removed" alert — a designed edge state
reached as the normal outcome for three of five catalogues. Adding
three branches to the short copy would have left two copies, so both
now call one `discoverIdFromSourceUrl` in `discoverApi`, beside the id
construction it inverts.

**Read now needed more than a prop.** `handleStartListening` was
already on the shell, but the reader is a route owned *inside* the
Library stage — the shell only learns about it through
`onReaderOpenChange`. So "Read now" hands a book id across the tab
switch and `LibraryScreen` consumes it once, mirroring the
`pendingUploadAssets` pattern already in that file.

Also: the dead `Play` sample button went, its style with it; the share
button in the header is wired to the system share sheet with the
book's catalogue page URL (derived per source — never a raw EPUB
download dressed up as a page); the `Presenter` + `RemoveBookSheetBody`
block that was copy-pasted into all three view branches is mounted once
behind a single return; and the rail de-duplicates by title and author,
because the same work arrives from two catalogues under two ids.

Verified at 360 / 820 / 1180 / 1440. **Not verified:** the 440 remove
modal's confirm path and the happy path of Read now / Listen — both
need a Discover book that genuinely matches a library row, and this
account has none. Adding one would write to production, which is ruled
out. The remove body and its container are unchanged from M2b and
shared with Library. Gate held: 0 errors / 222 warnings, 98 tests;
tokens 197 → 204.

### Responsive M4b — the Listen player · 2026-10-29

The other half of Listen, and the end of §4 Listen: the foreground
player, its three controls, and the Desktop mini player.

**The frames cap the whole player bar, not its contents.** The
instinct was a full-bleed surface with an inner 680 wrapper, so the
hairline and fill would still run edge to edge. The frames say
otherwise — `Listen player bar` is 680 wide with `top: 1` and a
cream-50 fill, while `header` keeps the full frame width with
`bottom: 1` and no fill. Since the bar's fill is the page's own
canvas, what the cap actually changes is where the hairline stops.
The bimodal text takes its cap on the scroll *content container*: a
ScrollView sized to 680 would scroll a 680 viewport, so the gesture
would only work over the text.

**The popovers needed almost no new plumbing.** `VoiceSheet` and
`SleepSheet` were never sheets — they are plain bodies with the
`BottomSheet` at the call site — so converting them to
`Presenter kind="menu"` was one line each, and Compact keeps its sheet
for free.

What did need something: the frames centre the sleep and speed
popovers over the bar and draw no arrow. **Anchoring on the bar rather
than on the buttons is what produces that** — a card centred on a
centred anchor, flipped above it because there is no room below.
Anchoring on the buttons, which is where the triggers actually are,
throws both cards hard left. `Popover` gained `arrow={false}` for it,
because an arrow aimed at the midpoint of a 680-wide element points at
nothing, and `offset` for the frames' 12.

**The speed cycle is gone.** Tapping the pill used to step through the
set in place, in three separate implementations — `ListenScreen`,
`SignedInShell` and `App.tsx` — so the same control behaved one way on
the tab and another on the player, and never showed what the options
were. Both surfaces now open a picker: `PlaybackSpeedPicker`, one body
with a `compact` flag, giving the popover the one-line list and the
phone the descriptions and the time estimate. It replaces
`PlaybackSpeedSheet`, which was built, never wired, and had only its
`Speed` type imported.

**Closing the mini player stops playback now.** The code called
`dismissMiniPlayer()`, which only hid the strip, while a comment forty
lines below claimed it called `stop()` "because closing means closing,
not hiding". The comment was the intended behaviour. With the code
moved to `stop()`, nothing could set `miniPlayerHidden` any more, so
the flag, its setter, its two context entries and the reset effect
that went with it came out too — a hide mechanism nothing can trigger
is worse than none.

**Found, not fixed: popovers that flip above a trigger sit about 24px
too high on Android.** The sleep and speed cards were given
`offset: 12` and land about 36 above the bar; the tab's speed card
drops below its pill and overlaps it by a similar amount. 24 is the
status-bar height, which is consistent with `measureInWindow` and
`useWindowDimensions` disagreeing about whether it counts. This is
app-wide and predates M4b — every popover since M2a has it — so it is
recorded rather than fixed inside a layout milestone.

Verified on the emulator at 360 / 820 / 1180 / 1440: the bar's
hairline stops at 680 while the header's runs edge to edge, the three
popovers land at 340, the phone keeps its descriptive sheet, the rail
card replaces the bottom bar on Desktop only, and a swipe-dismiss
drops the Listen tab back to its resume state. Gate held: 0 errors /
222 warnings, 98 tests.

### Responsive M4a — the Listen tab · 2026-10-29

§4 gives Listen one sentence, but the build log's Listen flow is eight
screens across three sizes. R-M4 split: **M4a is the tab** (Now
playing, Empty, Resume, History), **M4b is the player** (foreground at
680, the voice / sleep / speed popovers, the rail mini player).

**Nothing in `features/listen/` was size-class aware.** The one
`useSizeClass` call in the whole feature lived inside `MiniPlayer`, not
inside any screen, so all four surfaces rendered phone-width content
stretched across 1440.

**The two columns are not both fixed.** The left is a fixed width per
size class and the right takes what is left — which is why Recently
listened measures 460 inside Expanded's 1044 and 476 inside Desktop's
1120, numbers that look arbitrary until you see they are a remainder.
`layout.listen` therefore stores only the fixed side (560 / 620) and
the 24 gap; the card is `flex: 1`. Reading them off scaled renders had
given 559 / 462 and 619 / 477 — close enough to look like four fixed
widths and wrong enough to encode the wrong model. The frame values
came through the Figma connector instead, which is now the rule for
this programme.

`columns` is `alignItems: 'flex-start'`: the frames show the card
hugging its rows at 380 tall beside a 466 left column, not stretching.

**Each block used to carry its own horizontal inset** — 18 on the
cards, 22 on the section rows, so section titles never lined up with
the cards under them. One container padding now: 18 on Compact, the
gutter above it. The phone's section rows move 4px and gain that
alignment.

**History is 720 centred at every wide size**, including Medium, where
the frame draws it at 720 inside a 748 content — 14 either side, inside
the 32 gutter. Capping the list without a gutter lands on exactly that.

Fixed on the way:

- **`onOpenChaptersSheet` was dead.** Declared and destructured in
  `ListenNowPlayingScreen`, never referenced, and its only producer was
  an empty closure in `SignedInShell`. Dead since the chapters pill came
  off, because pages are the navigation unit.
- **The empty state's title clipped its descenders.** Fraunces 24 with
  no `lineHeight`, so "Nothing playing" lost the tails of its g and y on
  Android — the same bug the Now playing header already carries a
  comment and a fix for.

The idle states also gain the "Listen" title at wide sizes. Every wide
Empty and Resume frame has it, and without it the idle tab read as a
different screen from the playing one.

Verified on the emulator at 360 / 820 / 1180 / 1440. The two idle
states needed throwaway forced-state builds, since the test device has
a live audio session and forcing beats generating TTS against real
data. Gate held: 0 errors / 222 warnings, 98 tests; tokens 190 → 197.

### Responsive M3c — the practice takeover · 2026-10-29

The last piece of the Reader. §4: "A practice session takes over the
screen: on Medium the question sits above the source passage; on
Expanded and Desktop they are two columns."

**The source passage was new data, not a layout change.**
`PracticeQuestion` is `{ question, options, correctIndex, explanation }`
— no source text, no per-question page. `generate-practice` reads the
page content, feeds it to the model and returns none of it. So the
passage is fetched client-side with `usePage`, one page, matching the
one page the questions came from. There was no precedent for showing
source *text* anywhere in the app; every other traceability affordance
is a page-label chip.

That chip was itself inconsistent: practice synthesised `p. N` and
ignored printed page labels, while Summary went through
`pageDisplayText` + `usePageLabels`. A book whose publisher numbers
its pages was cited two different ways depending on which AI tool you
were in. Practice is on the shared helpers now.

**Two defects the device found.**

The session rendered **inside the 380 panel** and overflowed it. M3b
routed practice into the panel and M3c changed only its internal
layout, so nothing ever took the screen over. The session phases now
escape into a full-screen modal.

Then at Medium that broke differently: a slide-over panel is *also* a
modal, and two do not compose — the session came up under the panel's
scrim with an empty panel on top. So while a session runs the panel
presents **docked** whatever the size class, because docked is plain
inline content a takeover simply covers. Switching `mode` rather than
swapping the wrapper is deliberate: practice keeps its questions and
answers in its own state, and changing the element type around it
would remount it and lose them.

**The word pop-over was never anchored.** It was
`left: 0, right: 0, bottom: 148` — a full-bleed bar above the action
bar — while this file's own note claimed it "sits ON TOP of the word".
It now goes through `placePopover`, in a modal so the coordinates mean
the window. It does **not** use `Popover` itself: this card is
`ink[900]`, and a dark card inside a cream one is not the design.

The anchor is the touch point rather than the word's frame — a ref per
token would be the alternative, and the point is already on the word.
It lives in state of its own, because `TappableParagraph`'s memo
compares `tappedWord` by identity and an object there would re-render
every paragraph on every tap. Narrowing the card from the window's
width to 340 also broke the part-of-speech gutter, which wrapped
"NOUN" to two lines at `width: 28`.

Verified at 360, 820, 1180 and 1440. The session measures **520 / 40 /
440** centred at 1180 and **600 / 40 / 520** centred at 1440, matching
the new `layout.practice` tokens; at 820 it stacks full width with 32
down each side and no panel in the way; the phone is unchanged. The
pop-over opens over the tapped word, 340 wide, centred on the tap.
M3b's practice-config item is also closed: it renders in the panel
with its Generate button pinned.

Still unverified on device: the Results phase, Highlights in a panel,
and the chat composer.

### Responsive M3b — the reader's panels · 2026-10-29

The five overlays that were whole-tree early returns become
`SidePanel` content: slide-over on Medium, **docked** on Expanded and
Desktop. First use of docking at all — M1 built the mode and left
`Presenter` presenting every wide class as a slide-over "until the
reader".

**`useReaderPanel` is a hook, not a component**, because a docked
panel is a layout sibling: nothing can render it *over* the reader, so
the host has to place it. All three readers had their own `aiMode` +
`showHighlights` and their own copies of the same five early returns;
they share one definition now. The reader already carried three
separate copies of its action bar, which is what that duplication
looks like when it is left alone.

**The panel has one level of its own navigation.** The AI tools list
is its root and the four tools open inside it, so `PanelView`
replaced the separate flags — they could not express "open, showing a
tool, with a way back to the list".

**Four things the exploration found that the brief does not show.**
`SidePanel` already wrapped children in a `ScrollView`, so every
conversion was a nested-scroller bug as written; its body has no
`flex: 1`, so a flexed child collapses the way `scanStyles.embedded`
documents; Chat's `KeyboardAvoidingView` + flex-1 transcript + pinned
composer cannot live in a content container at all; and
`closeOverlayPreservingPosition` is now Compact-only, because above
Compact nothing unmounts.

So `SidePanel` gained **`bare`** — same name and meaning as the
`bare` M2b gave `Modal` — and every view that owns a scroller and
pins something under it uses it. Only the two plain lists are
scrolled by the panel.

**The page list is a page list.** Figma `308:11864` is pages with
their status and a Now tag, chapter titles only as section headings.
That agrees with the schema migration that made pages the navigation
unit, rather than reversing the decision `ListenNowPlayingScreen`
recorded when it dropped its chapters pill. It also means no empty
state: a book always has pages, including the one M3a found with no
chapter titles at all.

**Three defects the device found that reading would not have.** The
credits count rendered as "0 /" — `{a} / {b}` across a JSX line break
lost the second expression, and a template string fixed it. Opening a
tool left no way back to the list, because the hosted screen's own
back button is suppressed with its header and the panel header had
only a close; `SidePanel` gained `onBack`. And the Full-mode readers
opened the sheet instead of the panel, because the condition asked
whether a panel was already open rather than whether the screen was
wide.

Verified on the emulator at 360, 820, 1180 and 1440. The phone is
unchanged: full screens for the tools, a sheet for the list. At 820
the panel slides over a scrim and the reader keeps its width. At 1180
it docks at 380 and the reading column shrinks to fit what is left; at
1440 it docks and the column keeps the full 680. The tools list opens
a tool and comes back. The Pages panel tracks the reader live —
jumping to page 5 moved the Now tag and turned 1 to 4 Finished with
the panel still open, which is the point of docking.

Not verified on device: Highlights in a panel (the test book has
none), the practice config phase, and the chat composer. They compile
and follow the same `embedded` shape as the three that were checked.

### Responsive M3a — the Reader · 2026-10-29

§4 Reader's layout and chrome. M3b takes the panel system: the four
`aiMode` returns and Highlights refactored into `SidePanel` content,
docked above Compact, plus a reader Chapters panel and the practice
takeover.

**The reader was entirely width-unaware** — no `useSizeClass`, no
`useWindowDimensions`, no breakpoint anywhere across its three
screens — and `tokens.layout.reading.measure` had zero call sites in
the repo. It now caps one node per screen: the text reader's FlatList
*content container* (not `pagerWrap`, which would box the scroll
indicator and the restore overlay), the PDF's inline style width, and
the EPUB's `webviewWrap`. Measured 680 centred at 820 and 1180 in
both text and PDF.

The action bar's **row** is capped too, while its surface stays
full-bleed. §4 only caps the page column, but `space-around` across
five items at full window width strands them at 1440 while the text
they act on is 680 wide. Measured at 820 and 1180, the five items land
exactly where `space-around` in a 680 column puts them.

**Two things the PDF needed that were not obvious.** `<Pdf>` was never
passed `fitPolicy`, so it inherited the library default `2` ("fit
both") — fine against a view sized to the whole window, but once that
view is 680 on a wide screen, "fit both" letterboxes to height and the
page stops filling the column. It now passes `fitPolicy={0}`. And the
screen read `Dimensions.get('window')` once per render and fed it to a
memo keyed on that non-reactive value, so a PDF kept its pre-rotation
size until something else re-rendered the screen. Harmless while every
device was portrait-locked; **M1 made tablets rotate.** Now
`useWindowDimensions`.

**Inline search was already written and wired to nothing.**
`InReaderSearchHeader` — a header that replaces the reader header, a
results-count nav bar, and a `HighlightedText` that paints matches in
amber-200 with the active one in amber-500 — arrived with the M1
workspaces commit, moved in M3's decomposition, and had never been
imported. §4 describes it exactly. So this milestone wired it rather
than built it: chapter scope from the derived page title, a match
model that gives each page the count preceding it, and prev/next that
jumps to the match's page.

It renders **instead of** `TappableParagraph` while a query is live.
The two cannot compose — the paragraph already splits into per-word
spans for the dictionary, and threading a second span layer through it
would mean reworking the hottest memo in the reader. Swapping is also
the honest behaviour: mid-search you are navigating, not looking words
up.

Text mode's whole-book `BookSearchScreen` route had no caller left
once Search opened the header, so that branch and its state are gone.
Full-mode PDF and EPUB still open it, because neither can paint a
highlight into its own content.

**Found by verifying, not by reading:** a book whose pages carry no
chapter title gives every page the same empty title, so "this chapter"
silently became the whole book and the count bar read "2 of 59 ·" with
a dangling separator. The scope now labels itself "Whole book" when
there is no chapter, and the separator only appears when there is
something to separate.

`BookSearchScreen` and its `bookSearch` api **moved from the library
feature to the reader**, where their only callers are. That removed
three cross-feature imports, and `ListenScreen` — which already
imported from `~/features/reader` on the line above — lost its
`features/library` edge entirely.

Verified on the emulator at 360, 820 and 1180 dp. The phone is
unchanged. The action bar reads Listen / AI tools / Search /
Highlights / Display, one line each, matching `130:368` in all three
themes. Reading options opens as a 340 popover anchored to Display,
opening upward, with the full sheet fitting and its title still
"Reading options". Inline search steps matches across the chapter and
highlights them in place.

Deferred: the Full-mode PDF **single/spread toggle**.
`react-native-pdf` 7.0.4 has no dual-page capability and the engine is
pinned by CLAUDE.md, so Full mode ships single-page at every size.
Recorded in `responsive-milestones.md` beside the drop zone and §6.

### Responsive M2b — Library overlays, upload dialog, §7 copy · 2026-10-28

The rest of §4 Library. M2a gave the screen its layouts; this gives it
its containers. Mostly conversion rather than new surface: four sheets
become popovers, menus and modals through M1's `Presenter`, and the
two upload screens become a 480 dialog above Compact.

**The popover edge rule changed, and it is the load-bearing change.**
`placePopover` used to ask whether the *anchor* sat within 24 of the
window edge. The right question is about the *card*: if the popover
placed with its arrow on the trigger would cross the window gutter,
drop the arrow and align to the gutter. The Library's `+` on a Medium
tablet is exactly the case that separates them — it sits 32 from the
edge, so the old rule kept the arrow and then clamped the card anyway,
leaving an arrow pointing at nothing. Two tests pin it, including one
where a 340 popover and a 280 menu on the *same* trigger answer
differently, which a fixed anchor threshold cannot express. §3 and §10
of the brief were reworded to match.

**§7 cut the two Library sheets down.** Remove book is now a title and
one line, which deleted `RemoveBookSheetBody`'s `cover` slot — the prop
that existed only because Library and Discover hold different book
shapes. Both callers are now just a title, and Discover's cover styles
went with it. Book actions lost its subtitles, cover, author, icon
chips and chevrons; the chevrons were a standing hard-rule-3 violation
(a chevron means "drills into more", and none of those rows do). The
leading icons stay. Offline download is now genuinely disabled with a
trailing "Soon" rather than tappable-with-a-toast, which is how a
disabled row explains itself once sub-labels are gone (hard rule 4).

**Discover's remove sheet was converted too**, which is wider than
Library. Not scope creep: converting only Library's would have put the
same destructive action behind two different containers at the same
window width, which is the split F-26 extracted the shared body to
close in the first place.

**The progress ring's real defect was not the missing percentage** —
it already had one. The arc was drawn from the raw fraction while the
label was rounded, so 0.666 drew a 66.6% arc beside the text "67%".
`ProgressRing` rounds once and feeds both. It also stopped defaulting
to `0.65` when progress is unknown, which had been drawing a confident
65% for an upload nobody was measuring. The failed state is now the
`upload_failed` illustration rather than a red arc at a hardcoded 90%
with an × through it; a ring that has stopped reporting progress
should stop looking like one. `ProgressRing` keeps a `failed` state as
a component state.

`Modal` gained `bare` so it can host a screen that already brings its
own padding and scrolling — `ProcessingScreen`'s failed branch *is* a
ScrollView and would otherwise have nested inside the modal's. Worth
recording that `padding: 0` does **not** clear it: React Native
resolves `paddingTop` over the `padding` shorthand whichever order the
styles flatten in, so the keys are zeroed individually.

**The lint count was not the check I thought it was.** The warning
total came back at exactly the 233 baseline while `BottomSheet`,
`dlStatus`, `dlPct`, `BookDownload` and a `downloads` subscription had
all gone dead — new dead code happening to offset other removals.
Reading the per-file output, not the total, is what found them. It
ends at 230.

**The brief-section → milestone table is now in the repo**, as
`docs/specs/responsive-milestones.md`. It was asked for during M1 so
nothing would be lost after it, was written into the M1 plan file
rather than the repo, and the plan file was overwritten by M2a's —
losing exactly what it existed to protect.

Deferred: the desktop **Upload drop zone**. It is web and desktop only
and the web bundle does not resolve at HEAD (`react-native-pdf`,
`react-native-webview`, `react-native-purchases-ui` at module load via
the feature barrels; `spikes/web-boot/export-1.log` records it). It
waits for the architecture migration's M4. §6's hover and focus states
are blocked behind the same thing.

### Responsive M2a — Library layout · 2026-10-28

§4 Library of the responsive brief, layout half. M2b carries the
overlays, the upload refactor and §7's copy changes.

**Medium** gets `LibraryHero` (one card replacing the separate stats and
continue cards) and a 4-column `BookGrid`. The brief's tile width only
resolves with the rail included — `820 − 72 − 2×32 = 684`, less `3×24`
of gaps, over four, is 153 — so that arithmetic lives in
`@bookflow/shared` with a test rather than in a stylesheet. Four is a
ceiling, not a constant: Medium starts at 600, where four columns would
be 98px wide, so the grid drops a column rather than render a cover too
small to read.

**Expanded and Desktop** get a 440 master plus `LibraryBookPane`. The
master column is `layout/pane/master`, which matches the Figma frames —
an earlier note in this log claiming the frames were drawn at 360 was
wrong; all 57 masters are bound to the variable.

The load-bearing change is that **selecting a row is not opening a
book**. `selectedBook` is a route: setting it swaps the whole tree for a
reader and tells the shell to hide the rail and mini player. A master
selection must do neither, so the pane reads a separate `paneBook`, and
the pane's own CTA is what sets `selectedBook`. Search follows the same
logic — on wide it replaces the master's content and the pane keeps its
book, so it is a branch inside the column rather than the whole-screen
early return it stays at Compact.

**Illustrations now exist.** The redrawn set landed at
`apps/app/assets/illustrations/`. There is no SVG transformer in this
project (no metro.config.js at all), so an illustration cannot be
imported as a component; `EmptyLibraryIllustration` is converted by
hand with every colour bound to a token, following `Logomark` and
`Lockup`. The raw SVGs stay in the repo as the source for the rest.

**Four duplicates collapsed on the way through.** `BookCover`,
`ProgressBar`, `bookStatusLine` and the weekday strip moved into
`features/library/components/` so the row, the tile and the pane share
one definition — the search result row and the list row had already
drifted apart from exactly this. `formatRelativeTime` turned out to be
byte-identical to the tested one in `@bookflow/shared` and now uses it.

**One trap worth recording:** `formatMinutes` exists in both
`@bookflow/shared` and LibraryScreen and they mean different things —
"381 min" for a quota, "6h 21m" for time spent reading. The reading one
is now `formatDuration`, so the two cannot be confused again.

The five unmemoised full-array passes per render are memoised. They were
survivable when only this screen's own state re-rendered it; `useSizeClass`
now re-renders on every resize, and the grid puts four times as many rows
on screen.

Verified on the emulator at 360, 820, 1180 and 1440 dp: the phone is
unchanged; the Medium tile measures 153 with a 24 gap; the master
measures 440; selecting a row fills the pane without opening the reader
or hiding the rail; the pane's CTA does open it, full-bleed with no
rail; search replaces the master while the pane holds its book; a
long-press on a tile opens the actions sheet.

### Responsive M1 — tokens, size class, shell, presenter · 2026-10-28

The foundation for the tablet and desktop layouts in
`docs/specs/responsive-handoff.md` (§9 steps 1-3). Nothing about the
phone changes; the flow layouts are M2 onward.

**Layout tokens.** `breakpoints.ts` already existed from M1 with three
classes and was dead code; it gains `desktop: 1280` and a fourth class.
The brief's §1 listed Expanded and Desktop as overlapping ("1024 and up"
for both), which width alone cannot resolve — the rule that does is "the
rail expands from 1280", so Desktop starts there, and the traits that are
really about the web (no status bar, no splash, no pull to refresh,
hover) key off `Platform.OS` instead. A new `tokens.layout.*` group
carries the rail, pane, panel, popover, modal, lane, reading, content,
gutter and column-gap widths.

`breakpoints` was a named export that had never been added to the
aggregate `tokens` object, so `tokens.breakpoints` was `undefined`
despite ARCHITECTURE.md §3 promising it. Both groups are on the
aggregate now, and `build-css.mjs` emits them (180 custom properties, up
from 163).

**`useSizeClass()`** returns the width class plus a separate `isWeb`,
for the reason above. The repo's first width-reactive code.

**Orientation.** Phones stay portrait, tablets and web rotate. `app.json`
goes to `"orientation": "default"`; iOS splits it declaratively with
`UISupportedInterfaceOrientations` and the `~ipad` variant, which the OS
enforces before JS starts. Android has no per-idiom manifest key, so
`src/platform/orientation.ts` locks at runtime via
`expo-screen-orientation` (**new dependency**) when the shortest side of
`Dimensions.get('screen')` is under 600 — *screen* so an iPad in split
view is not mistaken for a phone, *shortest side* so the answer does not
flip when the device rotates. First occupant of `src/platform/*`.

**Shell.** `TabBar` returns `null` above Compact and `SignedInShell`
renders the rail once, so all eleven `TabBar` call sites are untouched.
The rail is suppressed by the same four flags that already hide the mini
player, which is what gives the reader no rail at any size for free.

Two tab-bar spacing problems, one of them latent: `ListenScreen`
hardcoded `56 + inset` to lift the mini player over the tab bar, which on
a tablet left an empty strip under it; and `miniPlayerOverlay` was
`left: 0, right: 0` on the shell root, so once that became a row the bar
would have run under the rail. Both fixed by moving the overlay into the
content column, which is also §2's "bar along the bottom of the content".

**Presenter.** One component picks BottomSheet, Popover, SidePanel or
Modal by size class, keeping the imperative `present()`/`dismiss()` ref
all 32 existing mount sites already use. The wide containers render in an
RN `Modal` rather than in place: `position: 'absolute'` in React Native
is relative to the direct parent, so an in-place overlay would be
confined to whatever container the call site declared it in. One pilot
converted (Library's Sort & filter).

The popover's placement maths moved to `@bookflow/shared` so the edge
rules are testable — the near-edge fallback cannot be reached by tapping,
because no trigger in the app currently sits within 24 of the window
edge. The tests caught a real bug on the way in: right-aligning bypassed
the clamp, so in a window narrower than the card plus its gutters the
card ran off the *left* edge.

Verified on the emulator at 360, 820, 1180 and 1440 dp: phone unchanged
with the sheet still a sheet and the mini player flush to the tab bar;
rail collapsed at 820 and 1180, expanded with the lockup at 1440; no
empty strip under the mini player and no bar under the rail; popover
anchored with an arrow at both wide sizes. Orientation checked both ways
— at 360 the app requests portrait (`mLastOrientation=1`) with the
manifest at `unspecified`, at 820 it requests nothing.

**Found while verifying:** the checked-in `android/` is a gitignored
prebuild artifact and still had `android:screenOrientation="portrait"`
baked in from an older `app.json`. It silently invalidated the first
rotation test and would have locked tablets to portrait as well.
`expo prebuild` regenerates it correctly from the committed `app.json`.

### Reader — long jumps land · `fix/search-jump-landing` 2026-10-28

Two independent bugs sat behind "a search result jumps to the wrong page".

**1. The page list stopped at 1,000 rows.** Three queries in
`useBookChapters.ts` and one in `audioDownloads.ts` asked for
`.range(0, 9999)` on the belief that it lifted PostgREST's row cap. It
does not — `db-max-rows` is a server setting and the response is
truncated to it whatever range the client asks for. Measured on
"Expositions of Holy Scripture" (1,570 pages): `pageList.length` came
back as exactly 1000, so 570 pages were invisible to the text reader and
an offline download saved two thirds of the book. Now one shared helper,
`~/core/pageRows.ts`, pages through in chunks, stepping by rows actually
returned rather than rows requested — the cap may be lower than the
chunk and nothing in the response reveals it.

**2. A vertical list cannot scroll to a row it has not measured.** With
the page present, the jump still landed on page 50. Instrumented, the
mechanism was unambiguous: the computed offset was right (~1.4M px, rows
averaging 931px) but the list had measured only 50 rows, so the scroll
clamped to the bottom of that content. `highestMeasuredFrameIndex`
advanced four rows per attempt (`maxToRenderPerBatch` 2), which puts row
1511 about 378 attempts — near a minute — away. Retrying harder was never
going to work.

So the list renders a **window** of `pageList` rather than all of it, and
a jump moves the window so the destination is `WINDOW_LEAD` (12) rows
from its top. The short hop the old retry loop was written for is now the
only hop there is. `pageList` itself stays the whole book: page counts,
chapter lookup and the PDF page total all read it, and `localIndexRef` is
the single bridge between `page_index` and list index. A book of 300
pages or fewer never windows, so normal-length books render exactly as
before.

The same fix makes the saved-page restore land — it was failing for the
same reason, opening a book saved at page 1512 on chapter one.

Verified on the emulator against the 1,570-page book: a jump forward to
page 1512 lands on `PAGE 1512` with the matched sentence as its first
line; a jump backward from ~1506 to page 62 lands on `PAGE 62`; scrolling
up across the window start stays continuous (1512 → 1490). Sit-Walk-Stand
(20 pages) scrolls both ways unchanged with its dividers in order.

Not exercised by hand: forward reading across the window **end**. It is
the mirror of the start edge, which was exercised.

### M3 — features and data · ✅ merged to `main` 2026-10-28

Merged at Austine's call with these reader issues open and understood,
not forgotten:

**Known, carried past the merge**

- **A search jump does not land on the exact page it names.** It leaves
  the saved position and lands in the right region; a "page 20" hit put
  the reader near page 5. Row heights vary and there is no
  `getItemLayout`, so the saved-page restore converges on an averaged
  guess rather than an exact offset.
- **Exact jumps and vertical nested scrolling pull against each other.**
  Precise jumps want fixed row heights; fixed row heights want a
  per-page scroller; a vertical per-page scroller fights the vertical
  list it sits in — measured as the tail of one page frozen at the top
  of the screen while the next scrolled underneath, on 2 of 9
  reading-sized swipes. Horizontal paging is the one arrangement where
  all three hold; it was built, tried and reverted because it changes
  how a page is turned. That is a product decision, still open.
- **No sticky page indicator.** It was built and removed for naming
  pages that were not on screen. It becomes feasible the moment page
  offsets are exact.
- **Go to page** exists as tested logic in `@bookflow/shared`
  (`resolvePageQuery`) with no UI; its first home was wrong and it was
  pulled rather than left somewhere arbitrary.
- **EPUB Full↔Text keeps its place only approximately** — scroll
  fraction, so an image-heavy book can be a page or two out.

**What the freeze taught**, worth keeping because it cost most of a
day: whole-frame screenshot hashes prove that *something* changed, not
that the page moved as one. They passed while the screen showed two
pages with the top one frozen. Comparing a top strip against a bottom
strip per frame found it in one run, and a screen recording from
Austine found it before either.

### M3 — features and data · original scope

`src/screens` is gone; eight features own their own screens and api. The
offline write queue is in `packages/shared` with 22 tests, wired through the
write call sites, draining on reconnect and foreground.

**2026-10-28 — the decomposition shipped a crash, and running the app found
it in seconds.** The move script repointed every intra-feature import at the
feature's own barrel (`../index`), which re-exports those same files. A cycle
resolves to `undefined` on one side at module-eval time, and the app died on
launch:

    FATAL EXCEPTION: mqt_v_native
    TypeError: Cannot read property 'map' of undefined  (metroRequire)

59 imports, 29 files, all 8 features. **tsc, the bundler and the test suite
were all green** — types resolve through a cycle, so nothing in CI could see
it. It surfaced the first time anything executed the app since the M2
cutover, which is the real lesson: this branch had been verified by reading
and typechecking, never by running.

The script was not the root cause on its own. `eslint.config.js` restricted
`../*/!(index)`, which from `features/<name>/screens/` also matches
`../api/<file>` — a *same-feature* import. The rule meant to stop a feature
reaching into another feature and instead pushed intra-feature imports onto
the barrel; the script implemented the rule as written. Both are fixed, and
`import/no-cycle` now guards relative edges — verified by reintroducing a
cycle and watching both rules fire. It immediately found a second,
pre-existing cycle (`aiAudio` ↔ `audioDownloads`) that is genuinely safe and
is now annotated rather than silently tolerated.

**2026-10-28 — a second M1 regression, found the same way.** With the crash
fixed, the app launched but sign-in failed with "Couldn't reach our servers".
Not the network: `.env` has lived at the repo root since June, and Expo reads
it from the *project* root, which M1 moved to `apps/app/`. Every
`EXPO_PUBLIC_*` var had been undefined in local builds since then, so the app
fell back to `https://invalid.bookflow.local`. The app logs this loudly at
startup; nobody had read the log because nobody had run the app. Fixed with
`apps/app/.env -> ../../.env` (both paths gitignored) and documented in
`.env.example`. EAS builds were never affected — they use `eas env`.

Worth noting what did *not* find either bug: tsc, the bundler, the test suite,
and a static grep of the built bundle, which gave a false negative on Hermes
bytecode. Both were found by running the app and reading logcat.

The same commit also corrected a §4 layering mistake from the decomposition:
`bookCovers.ts` was moved into `features/library/api/`, but `ui/
RecentListenRow` renders covers too and ui must not import a feature. It is
signed-URL infrastructure over Supabase Storage, so it now lives in `core/`.
That had been an ESLint error on the branch since `9bdf6ee`, meaning **lint
was red and reported green** — corrected here.

### Production deploy · 2026-10-28

Austine approved a full catch-up after the PDF page-fidelity work turned
out not to be live at all.

**Why text mode still looked word-sliced after a re-process:** `process-book`
on production was version 29, deployed **2026-05-28** — five months before the
fix was written. Migrations `0026`–`0029` were all unapplied. The code was
correct and simply had never shipped. Nothing in the repo surfaces this; the
only way to see it is to ask the project what is actually deployed.

Applied `0026`→`0029` and deployed `process-book` (v29→30), `generate-summary`
(14→15), `chat-message` (11→12) and `discover-doab` (7→8). Verified: all four
migrations now report local **and** remote; the deployed DOAB function answers
200 with 24 usable books in 0.9 s.

Two things the push exposed:

- **The schema had drifted from the ledger.** `0026` reported *"column
  ai_credits_balance_total already exists, skipping"* — production already
  had those columns without the migration being recorded, so someone had
  applied them by hand. The `if not exists` guards absorbed it.
- **`public.chapters` really was free to create.** `0010` did
  `alter table public.chapters rename to pages`, so the 0001-era table had
  not existed under that name since. Confirmed from the push output itself:
  `create table if not exists` emits a *"relation already exists, skipping"*
  notice when it skips, and none appeared for `chapters` — unlike 0026's
  columns, which did. 0010 also renamed the dependent FK columns
  (`chapter_id` → `page_id`), so the new `chapters` table collides with
  nothing.

**17 edge functions remain stale**, in two groups that matter:

| Commit | Functions | What is undeployed |
|---|---|---|
| `7a117d1` | 13 | The `deno check` fixes — 22 real type errors, including the PostgREST embedded-array bug that silently dropped the chapter name from every AI page marker |
| `ea34369` | 4 | The whole credits / metering feature — `generate-audio`, `generate-practice`, `generate-translation`, `revenuecat-webhook` — while its migrations `0026`/`0027` are now applied |

The DB side of `0026`/`0027` is self-contained (the RPCs keep their
signatures, so June-era callers get the new behaviour), so this is drift
rather than breakage. It still wants closing.

### M2 — routing · ✅ merged to `main`

Expo Router is the entry point; the `stage` machine no longer drives
navigation. Auth, onboarding and the four tabs are routes. 8 of 15 drill-ins
landed; **7 deferred to M3** because each needs fetch-by-id, which is what M3
builds — doing them now meant building them twice.

**The duplication finding is resolved.** Reading display, default voice and
translation language are one canonical route each instead of existing twice
with a copy of the state in each parent. The migration was additive:
`YouScreen` already had optional handler props falling back to internal `view`
state and `SettingsScreen` gained the same, so the fallbacks go dead rather
than being deleted — the cheapest revert while nothing can be verified.

`(tabs)/_layout.tsx` is deliberately not `<Tabs>`: the shell owns the audio
session and mini player and must stay mounted across tab changes, which
`<Tabs>` would prevent by putting each screen in its own navigator subtree.
The shell itself moved out of `App.tsx` unmodified, and stays router-free so
it remains a reviewable move of code that cannot be run here.

**Evidence: 4 of 5 auth screens pixel-identical**, the fifth off by 3 pixels
the same build reproduces against itself — the caret, same signature as M1.
Two emulator artifacts first reported it as a 7.5% regression: the IME toolbar
returns after an app reinstall, and an Android clipboard popup rendered text
from the working session into a screenshot.

**Two latent crashes found and fixed**, both from the cutover dropping
providers `App.tsx` had mounted: `BooksProvider` (every signed-in launch would
have crashed on `useBooks`) and `ToastHost` (toasts silently gone). Neither is
visible to the type checker; neither is reachable without an account. They are
the clearest measure of what the missing test account costs — two bugs in
roughly twenty routes of unverifiable work.

**F-46.** Two components are named `SendFeedbackScreen`. The standalone
380-line compose form is imported by nothing; the app ships the
`YouDrillScreens` version, which hands off to the user's mail app. A new route
picked the dead one by name and only a missing required prop caught it.

**Blocked for sign-off:** the Maestro flow the brief asks for needs the test
account, and iOS Universal Link verification needs a physical device (§13.1).
The Apple Team ID and Play signing fingerprint are also outstanding —
`docs/M2_DEEP_LINKS.md`.

### M1 — foundation · ✅ 2026-10-22 (merged)

npm workspaces: `apps/app`, `apps/site`, `packages/tokens`, `packages/shared`.
124 files moved as detected renames. Supabase and docs stay at the root.

`packages/tokens` holds `tokens.ts` byte for byte, adds the breakpoints §3 and
§11 called for, and generates `tokens.css` — 163 custom properties.
`apps/app/src/design/tokens.ts` re-exports it, so the 59 modules importing
`~/design/tokens` never changed.

`packages/shared` holds the generated DB types plus three functions that were
private to screens and therefore untestable. 14 Vitest tests. One pins existing
behaviour rather than fixing it: `formatCredits(1500)` is `"2K"`, overstating a
balance by 500 credits — a product decision, left alone.

ESLint turns §4's boundaries from prose into enforcement. Rule 4 is a warning,
not an error: 19 call sites violate it and M4 is where they move. CI runs
typecheck, lint, tests, token drift and a native bundle; it deliberately does
not build web until M4's adapters exist.

The marketing site moved in from `~/bookflow-site`, and its `contact-notify`
edge function joined the other twenty.

**Evidence: all five reachable screens pixel-identical.** 5.5M pixels, 0
differing, release builds both sides. `docs/evidence/m1/README.md` records the
method — in particular that the noise floor was measured before the result was
believed, which is what exposed a 165-pixel "regression" as a blinking caret.

Two things bit on the way and are worth remembering. Packages emit **CommonJS**,
not ESM: tsc emits relative specifiers verbatim, so ESM needed `'./format.js'`
in source and Metro then looked for a literal `format.js` that does not exist.
And the package tsconfigs do **not** extend `expo/tsconfig.base` — it sets
`customConditions`, which is incompatible with CommonJS resolution.

**Deferred: Sentry and PostHog.** Austine's call, 2026-10-22 — the keys were
not to hand and nothing else in M1 depended on them. Still M1 scope, not
dropped scope. They belong before M2 ships: replacing the navigation layer
without crash reporting is the worst moment to be blind. Open question 4.

### M0 — spikes · ✅ complete

**Spike 1, reader engine · ✅ 2026-10-22 · `docs/spikes/m0-1-reader-engine.md`**

Built `bookflow_lowend` (2 cores, 2,473 MB, 720×1600) and measured a DOM engine
against real books in Chrome 124.0.6367.219 — the same build as the device's
system WebView, which is what makes the numbers transferable.

Text mode: 1,806 ms first paint, **5 long frames in 60** on reading scroll.
`content-visibility` alone carries 351 pages, so the engine does not need its
own virtualisation. EPUB similar.

pdf.js: **42 long frames in 60**, 3.1 s worst stall, 1,022 MB peak. No-go.
`react-native-pdf` stays and §7 loses a mode.

Word sync p50 37.8 ms but p95 313 ms under memory pressure, missing the 250 ms
budget — caused by building all 130,161 word spans up front. Lazy per-page
spans for M6.

Five method bugs are recorded in §5 of the write-up with the wrong numbers they
each produced first, including a 3,232 MB reading on a 2,473 MB device.

**Spike 2, web boot · ✅ 2026-10-22 · `docs/spikes/m0-2-web-boot.md`**

The app boots on web. Welcome screen renders, zero console errors, **no app
code changed** — both blockers were configuration or dependency.

Ten native-only packages need stubs (the §8 adapter list, plus `expo-clipboard`
which §8 lacked until Phase 0). The second blocker is the `import.meta` one the
brief predicted, and it is nastier than expected: **bundling succeeds** and the
failure is at runtime, because Expo serves the web bundle as a classic script.
Green CI, blank app. Traced to one occurrence in 8.5 MB — Zustand's `devtools`
middleware, which we never use but which rides in on the `zustand/middleware`
barrel. Fixed with a web-only Babel rewrite of `import.meta` rather than by
chasing the import, so the next dependency cannot re-break it the same way.

Two things for later: M4's CI must **load** the page, not just build it, or
this class of failure ships silently. And 8.5 MB is too big for Ama — mostly
fonts bundled at every weight including unused italics.

**Spike 4, job queue · ✅ 2026-10-22 · `docs/spikes/m0-4-job-queue.md`**

**`jobs` table, not Supabase Queues.** pgmq has no worker and no scheduler, so
adopting it still needs `pg_cron` + `pg_net` + a consumer function — it saves
none of the work that does not exist today. Meanwhile §9.1 already requires
`jobs` for the progress the Library reads, and a queue message is opaque, so
choosing pgmq means running both and keeping them consistent. Retry policy
becomes three columns rather than a gap pgmq leaves open. Research only, no
prototype.

**Spike 3, RevenueCat Web · ◑ PARTIAL 2026-10-22 · `docs/spikes/m0-3-revenuecat-web.md`**

Status and fees answered (§10.1). The sandbox purchase is blocked on RevenueCat
dashboard access and Stripe test keys — **do not hand those over to be used
here**; it is a purchase flow against a real account, so run the plan in §3 of
the write-up yourself.

What was possible without credentials mattered more than expected: **the
identity precondition §10 rests on is already implemented**, and verifiable
from code. `auth.ts:367` calls `Purchases.logIn(session.user.id)` on sign-in and
session restore; the webhook maps `event.app_user_id` straight to `profiles.id`.
The webhook also already handles top-ups via the `grant_credits` RPC, which §9.2
does not credit it with. So the sandbox test would confirm the model rather than
discover it, and it is not on M0's critical path — nothing in M1–M4 depends on
it and web purchases ship at M8.

Three risks found while reading: the `configure()` → `logIn()` window is
unenforced ordering rather than guaranteed; web has no equivalent auth sync yet
(M4's `billing` adapter); and `profiles.plan` is the de facto source of truth
only because there is currently one writer.

### Phase 0 — gap analysis · ✅ 2026-10-22

Wrote `docs/ARCHITECTURE_GAPS.md`. Everything in it measured from the tree at
`cfa7f3e`, not carried over from existing docs.

Three findings that move work between milestones:

1. **M5 shrinks and gets riskier.** Three of §9.1's five "new" tables already
   exist in substance — `audio_cache` is `narration_segments`,
   `ai_usage_events` + `credit_grants` are `credit_ledger`, and
   `profiles.plan` + a live `revenuecat-webhook` are `entitlements`. What is
   left is a reshape of live paying users' data. §9.2's transactional
   check-and-debit already ships via the `record_ai_usage` RPC.
2. **M6 has a fourth reader.** `ListenScreen.tsx` (1,935 lines) renders
   word-synced text and is the only place word-level sync works today. §7.5
   maps three surfaces and misses it. 7,852 lines of text rendering in total.
3. **`CLAUDE.md` and `AGENTS.md` contradict each other** on routing and data,
   and both document `npx jest` when no test runner is installed.

Corrections made to the doc on the way in: the schema is 13 tables over 27
migrations, not ten.

---

## Open questions

### Needs Austine

| # | Question | Blocks |
|---|---|---|
| 1 | ~~Approve the gap analysis and the proposed `ARCHITECTURE.md` changes~~ — **done 2026-10-22**, all seven applied | ✅ |
| 2 | ~~Where does the marketing site live?~~ — **answered 2026-10-22**: `~/bookflow-site`. Not a git repo, pure static, own Vercel project, and it shares the app's Supabase project plus a 21st edge function. See `ARCHITECTURE_GAPS.md` risk 9 | ✅ |
| 3 | ~~Is pnpm deliberate?~~ — **decided 2026-10-22: npm workspaces**, §4 of the architecture doc | ✅ |
| 4 | **Sentry and PostHog keys.** Deferred from M1 by Austine on 2026-10-22, not dropped. Worth closing before M2 lands: replacing the navigation layer without crash reporting is the worst moment to be blind | before M2 ships |
| 5 | App domain for universal links and App Links | M2 |
| 6 | ~~Is a physical budget Android phone available?~~ — **no, decided 2026-10-22**: emulator only. See §13.1 — this makes M0's pdf.js verdict provisional, not binding | ✅ |
| 7 | Should M3's file moves come *before* M2's routing, to avoid two passes over 33,203 lines? | M2 |
| 8 | ~~RevenueCat Web Billing: GA or beta, and current fees~~ — **confirmed 2026-10-22**, §10.1 of the architecture doc. Neither label is used; fees are 1% RevenueCat + Stripe 2.9%+30¢ | ✅ |
| 9 | Real top-up prices (F-33, carried over from the Figma round) | M5 |

### Needs investigation

| # | Question | When |
|---|---|---|
| 10 | What actually hides the credit gauge? Not metering — that is already server-side and transactional. §9.2 now says so, and this is an open item in §14 | before M5 |
| 11 | ~~Does the canonical document preserve character offsets?~~ — **settled**: §7.4 now requires it. Still needs *proving* in the M0 canonical-document spike | M0 |
| 12 | `listen_sessions.chapter_id` is a leftover from `0010_chapters_to_pages.sql`. Reconcile or drop while the schema is open | M5 |
| 15 | **F-46 — two components named `SendFeedbackScreen`.** The standalone 380-line form is dead; the app ships the mail hand-off. Delete the dead one, or wire it and delete the stub | M3 |
| 13 | **Can Ghanaian customers actually pay?** Web Billing is Stripe-only, card-only, and its purchase links cannot be localised. The persona the web app most helps is the one least served by that checkout. Needs a direct answer from RevenueCat or Stripe | before M8 |
| 16 | **A real import cycle between the reader and listen barrels.** `reader/api/useBookChapters` → `~/features/listen` → `ListenScreen` → `~/features/reader` → back. `import/no-cycle` reports it when that one file is linted and misses it on a whole-tree run, so the gate is green on a cycle that exists. Harmless today only because every crossing is called from inside a function, never at module load — the same shape that crashed the M3 launch. `getCachedPages` is shared by both features, so the `bookCovers` fix applies: move it to `~/core/` | M4 |
| ~~14~~ | ~~Real-device confirmation for pdf.js~~ — **closed by the result, 2026-10-22.** The spike failed, and a failure on flattering hardware is conclusive. Successor: confirm **text/EPUB** on a real device before M6 ships, since a *pass* is the case needing confirmation | before M6 |

---

## Carried over from the Figma round

Still open, recorded in `docs/figma/FIGMA_BUILD_LOG.md`:

- **F-27** — free-book cap jumps to the hosted paywall with no button state. Tied to F-35.
- **F-33** — top-up prices are placeholders in Figma.
- **F-35** — no in-repo upgrade UI. Answered in part by §10, but native stays hosted.
- **F-38** — EPUB WebView renders fallback fonts. **§7.1 retires this** by bundling the brand fonts in the engine. Closes at M6.
- **F-39** — Discover total-failure state while 748 books loaded. Needs a repro.
- **F-22** — cosmetic Figma-only opacity quirk.

`docs/RELEASE_QA_CHECKLIST.md` (67 checks) still has to be run on a physical
Android device before anything ships, and roughly a third of it needs a
signed-in test account that does not exist yet.
