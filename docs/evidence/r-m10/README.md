# R-M10 — the §10 sign-off pass

§10 of `docs/specs/responsive-handoff.md` is six bullets. This is where
each one stands, what was used to decide it, and what was found on the
way. Three of the six are closable from the code and the token set; two
need a browser with a signed-in session and are blocked on that; one is
blocked on a piece of work that has not started.

| § | Bullet | State |
|---|---|---|
| 10.1 | Every Figma frame has a matching screen at its size class | **Signed off**, 2 frames deliberately unbuilt |
| 10.2 | 820 / 1180 / 1440 screenshots match the frames | **Blocked** past Auth — needs a session |
| 10.3 | No container runs off screen; pop-over falls back to the gutter | **Signed off**, 1 finding fixed, 1 recorded |
| 10.4 | Keyboard tabbing shows the focus ring on every row, card and button | **Partly** — 7 of 13 proven with real input, 5 findings fixed |
| 10.5 | Reader text, PDF and player columns never exceed 680 | **Signed off** by audit; runtime proof shares 10.2's blocker |
| 10.6 | Prices and caps match §7 | **Blocked** on the pricing-and-caps work item |

Nothing here was signed off because it looked right. Each line below
says what was actually run.

---

## 10.3 — no container runs off screen

Two halves, and they are proved differently.

**The pop-over fallback** is `packages/shared/src/popoverPlacement.ts`,
which is pure arithmetic with 12 tests, including the two cases §10
words directly: "drops the arrow and right-aligns to the gutter near the
edge" and "turns on whether the CARD crosses the gutter, not where the
anchor is". Nothing to add.

**Everything else** is a question about fixed widths, and it had no
guard at all. Every fixed width in `layout` is a measurement from a
Figma frame, and each class's frames were drawn at one width — 820,
1180, 1440 — while the classes start lower, at 600, 1024 and 1280. A
composition can be exactly right in Figma and overflow at the bottom of
its own class.

`packages/tokens/src/layoutFits.test.ts` is that arithmetic, 10 tests
over every fixed composition at both its class floor and its frame
width. It was probe-verified by breaking two tokens (`pane.master` to
900, the practice columns to 400/300): both relevant tests failed and
named the case.

### Finding — the practice session is 12px too wide on an iPad Pro

`practice.expanded` is question 520 + gap 40 + source 440, and the
session's own padding is 18 either side: **1036 in a 1024 window**. The
frames are drawn at 1180, where it fits; the Expanded class starts at
1024, and an iPad Pro 12.9 in portrait is exactly 1024. The session
escapes its side panel into a full-screen modal, so it is measured
against the window, and the row sits in a *vertical* ScrollView — which
cannot scroll sideways, so the overflow is simply clipped off the source
column.

Fixed by letting both columns shrink below the width they were drawn at
(`sessionCol`: `flexShrink: 1`, `minWidth: 0`), rather than by retuning
the tokens, which are right at 1180. The test asserts the inequality
that makes the shrink load-bearing, so retuning either width later tells
whoever does it that the shrink was doing something.

Not rendered-verified: the practice session needs a book, generated
questions and a session. The arithmetic is, and the fix is flexbox doing
what flexbox does.

### Recorded — `layout.content.max` is not implemented

§1 gives the content area a 1280 ceiling "however wide the window". The
token exists; **it has no call site**, and the literal 1280 appears
nowhere in `apps/app/src`. `SignedInShell`'s content column is
`flex: 1`. So above about 1600 the content area keeps growing with the
window.

Left as found, deliberately: no frame exercises it (the widest is 1440,
where the rail and gutters already keep the content under 1280), so
implementing it would be a change with no drawn target. It is a decision
about very wide windows, not a bug with a right answer. `layoutFits`
models content width without the cap, because that is what the code
does, and says where the cap would go.

---

## 10.4 — the focus ring

R-M9 wired thirteen components and could verify one of them, because the
other twelve are behind a signed-in session. This pass built a surface
that does not need one.

`apps/app/src/gallery/uiGallery.web.tsx` renders the six importable
components with fixed props. It is not a route: the root layout renders
it in place of `<Slot />` when the URL carries `?gallery=1` **and** the
bundle was exported with `EXPO_PUBLIC_UI_GALLERY=1`. That keeps it out
of the route map, out of the boot hand-off, and — because an app
rendered underneath an opaque overlay still contributes its own tab
stops — out of the measurement. On native it resolves to a stub: the
Android export contains none of it (checked by string, with a
known-present string as the control).

**Verified in a browser, with real keys and a real pointer:**

| Stop | Ring |
|---|---|
| Button primary / secondary / tertiary | 1 each |
| Input | 0 — it reserves a 3px halo in padding instead |
| ListRow, drills-into and toggle | 1 each |
| RecentListenRow | 1 |
| DiscoverBookRow | 1 |
| AddPill, inside that row | 1 (after the fix below) |
| RailCard, BookGridTile (card rings) | 1 each |

Plus the two rules either side of the ring: hovering a ListRow took its
background from `rgba(0,0,0,0)` to `rgb(245,241,232)`, which is
`bgColors.surface`; clicking it focused the row and showed **no** ring,
and the next Tab brought the ring back.

`e2e/focus-ring.spec.ts` is that walk, in CI. Probe-verified by breaking
three things at once — Button's ring back to inset, AddPill's ring
removed, modality forced true — and rebuilding: all three tests failed,
each naming its own breakage.

### Finding — the Add pill had no hover or focus state at all

Tabbing a Discover result row stops **twice**: the row, then the Add
pill inside it. The pill was bare. It is a button by every definition
§10 uses, it appears in every result row and on the Featured card, and
it was missed twice over: it is not in the build log's Phase 7 table of
components that gained an Interaction property, and R-M9 wired the row
around it rather than the control inside it.

### Finding — the ring was invisible on every filled control

`FocusRing` is `border/accent`, which is forest-800. The primary Button
is *filled* forest-800. R-M9 drew the ring on the row geometry, inset 2
— so the app's primary call to action had a focus ring in the DOM,
forest on forest, that no one could see. The DOM assertion was green;
the screen was blank.

Figma settles it. `Button / Variant=Primary, Size=Large,
State=Focus-visible` (`298:696`) has a `focus ring` layer at **-4, -4,
128 x 60 around a 120 x 52 button**: a 2px `border/accent` stroke
**outset 4**, radius 14, which is the button's own 10 plus the outset.
Every variant in the set draws it the same way, so there is no
filled-or-not branch. Fixed on Button, and on the two controls with the
same shape and the same problem: AddPill (forest-800 fill) and
Discover's category chip (forest-800 when active).

The spec now asserts the geometry — ring 4px outside the button on all
four sides — which is the only assertion that can tell an invisible ring
from a visible one without reading pixels.

### Finding — the reader's ring was a rumour on the dark theme

The reader action bar sits on a page the user has themed. `FocusRing`
took a fixed `border/accent`, #1B4332, and the dark theme's page is
#1A1F1B: about **1.4:1**, which is not a ring. `FocusRing` gained an
optional `color`, and `ActionBarItem` passes the theme's own accent —
which on Light resolves to forest-800, so nothing changes there.

### Finding — the reader's primary chip had no hover

The build log's Phase 7 gives the primary action "88% opacity on hover".
R-M9 wrote that into the component's doc comment and did not implement
it: the fill branch returned `palette.primary` whether hovered or not,
so Listen was the one action in the bar with no hover state. Fixed, and
the 88% is now `tokens.hover.filledOpacity`, shared with AddPill.

### Recorded — the browser draws its own outline too

On a focused control the browser's UA outline paints as well as ours
(observed as `outline: rgb(229,151,0) auto 1px`, the colour following
the OS accent). Two rings is not what the frames draw, and suppressing
the UA one is a one-line change — but it is also the only indicator on
anything whose own ring is missing, so it is left for a decision rather
than taken silently.

### Still unverified — seven components

`CircleIconButton`, `BookListItem`, `ActionRow`, `RadioRow`,
`CategoryChip`, `ShortCard` and `ActionBarItem` are local to four
screens and private on purpose. Reaching them means rendering those
screens, which means a session and a database. Each one was read and
each spreads `interactiveProps` and renders a `FocusRing` — but that is
exactly the check that passed on the invisible Button ring, so it is
reported as an audit, not as a sign-off. Two of the five findings above
were in this group and were found by reasoning about their fills, not by
looking at them.

---

## 10.5 — the 680 reading measure

`layout.reading.measure` has nine style call sites and the literal 680
appears in no style anywhere in `apps/app/src` — only in comments.

| Surface | Site |
|---|---|
| Reader text column | `ReaderScreen` `pagerContent` |
| Reader action bar | `ReaderScreen` `actionBarRow` |
| PDF page | `PdfReaderScreen` `pdfWidth` (`Math.min(screen.width, measure)`) |
| PDF action bar | `PdfReaderScreen` `actionBarRow` |
| EPUB full-mode WebView | `EpubFullReaderScreen` `webviewWrap` |
| EPUB full-mode action bar | `EpubFullReaderScreen` `actionBarRow` |
| Bimodal text | `ListenScreen`, on the scroll *content container* |
| Player bar | `ListenScreen`, the whole bar including its hairline |
| Reader skeleton | `SkeletonScreens` |

Each is `maxWidth` over `width: '100%'` with `alignSelf: 'center'`, so
the column cannot exceed 680 and shrinks below it. `layoutFits` also
checks the measure fits inside the content area once the rail and
gutters are taken out, at both wide floors.

What this is not: a rendered measurement. Proving 680 on screen means
opening a book, which means 10.2's blocker.

---

## 10.1 — frame coverage

The ten screen pages hold **424 frames**: 111 Compact, 105 Medium, 105
Expanded, 103 Desktop. The three wide bands total 313, which is exactly
the count the build log's Phase 7 gives for "every component used on the
313 tablet and desktop frames" — an independent check that the inventory
is the whole file and not a slice of it.

Merging each screen's size variants gives **154 distinct screens**. Four
of the 424 are not screens at all and are excluded: `note /
returning-user routing`, the two `⚠ Annotation` frames on Monetisation
and System states, and `Monetisation / Hosted paywall (not in repo)`,
which says so in its own name.

**Every remaining screen has code**, at every size class the file draws
it at, with one exception:

- **`Reader / Full / PDF spread`, Expanded and Desktop.** Two frames,
  permanently unbuilt. `react-native-pdf` 7.0.4 has no dual-page
  capability and CLAUDE.md pins that engine after M0 spike 1 measured
  pdf.js at 42 dropped frames in 60. Already recorded under "Carried,
  with a reason" in `responsive-milestones.md`.

Two apparent gaps were my own search terms rather than missing code:
`Buy credits / Loading` and `Buy credits / Purchasing` are
`packages === null` and `buyingId` in `BuyCreditsSheet`, which its own
comment spells out ("null = still loading; [] = none available").
Checked rather than counted, because a grep that reports zero is a
hypothesis, not a finding.

**Gaps in the file itself**, where no frame exists so there is nothing
to build against. Worth knowing before anyone reads a missing screen as
a missing implementation:

| Screen | Missing |
|---|---|
| `Discover / Home / Refreshing` | Desktop |
| `Monetisation / Buy credits / Audio time` | Expanded |
| `You / Home / Free plan` | every wide class (only Pro is drawn wide) |

`Auth / Splash` and `Auth / Returning user / Session restore` also stop
at Expanded, but that one is deliberate and implemented: §4 says
"Desktop has no Splash or Session restore", and `splashDone` starts
`true` on web.

**What this does not prove.** Existence, not fidelity. A screen that
renders at the right size class can still look nothing like its frame,
and the illustration audit below is exactly that case. Fidelity is 10.2.

## The illustrations

Checked because the set is large, finished, and barely used.

The `Illustrations` page carries **17 components** with their own rules
page: 200 x 200 canvas, forest-900 outline at 3px, a solid offset depth
copy 5 to 8px down and right, forest-400 fills, one amber area per
scene. `apps/app/assets/illustrations/` tracks 19 SVGs: those 17, plus
`reading_nook` and `reading_nook_medium`, which are Discover's Featured
card art and do not belong to the set.

`apps/app/assets/svg/` and `apps/app/assets/illustrations.zip` are
untracked and are a byte-identical copy of 17 of the 19 (`cmp` on every
file). They are leftovers from the original export and nothing reads
them.

### Only 3 of the 17 are wired in Figma

Across all 424 screen frames there are **11 illustration slots on 10
screens**. Three are real instances of the components, all in Auth. The
other eight are unnamed 120 or 140 placeholder frames called
`Illustration`, so the design file has not finished this either.

Eight of the seventeen drawings have no slot on any screen: No
highlights, Processing, Upload failed, Offline, Ask the book, Practice,
Out of credits, Notifications.

### 2 of the 11 slots matched, before this pass

| Figma slot | Slot | Was | Now |
|---|---|---|---|
| `Auth / Welcome` | 280 / 336 | its own line drawing | `WelcomeHeroIllustration` |
| `Auth / Sign in / Check your email` | 96 | an inline 44px envelope | `CheckEmailIllustration` |
| `Auth / Callback / Link expired` | 80 | Tabler `AlertTriangle` at 36 | `LinkExpiredIllustration` |
| `Library / Empty` | 140 | `EmptyLibraryIllustration` | unchanged |
| `Library / Search / No results` | 120 | nothing, text only | `NoResultsIllustration` |
| `Library / Upload / Scanned PDF error` | 120 | Tabler `FileText` at 34 | `ScannedPdfIllustration` |
| `Listen / Tab / Empty` | 140 | Tabler `Headphones` at 36 in a bubble | `EmptyListenIllustration` |
| `Discover / Home / Error` | 120 | nothing, text only | `SomethingWentWrongIllustration` |
| `Discover / Search / No matches` | 120 | nothing, the request form | `NoResultsIllustration` |
| `Discover / Category / Empty` | 120 | nothing, text only | still nothing, see below |
| `System / Error / Crash boundary` | 120 | nothing, text only | still nothing, see below |

The second match is `Library / Upload / Failed`, which renders
`UploadFailedIllustration` **where Figma has no slot at all** — the
inverse mistake, and the reason the count is 2 of 11 rather than 1.

The three components that do exist are faithful conversions, checked
path for path: `empty_library.svg` is 200 x 200 with 21 paths and
`EmptyLibraryIllustration` is 200 x 200 with 21 `Path`s carrying the
same `d` data and the same `translate(5 5)` depth copies;
`upload_failed` matches 10 for 10.

**The Welcome hero is the one that looks right and is not.**
`welcome_hero.svg` is 320 x 240, 27 filled paths, forest-400 on
forest-900 with the offset depth copy, exactly as the rules page
describes. `WelcomeScreen`'s `HeroIllustration` is 280 x 240 line art:
`fill="none"` throughout, 1.6px strokes, amber arcs. Two different
drawings in two different styles, and the one on screen is not the one
in the file.

### Wired, after the audit

Nine of the ten mismatched slots had an unambiguous answer in the set,
using seven drawings. Eight of them are now wired; `UploadFailed` and
`EmptyLibrary` were already.

`svg2tsx` in the session scratchpad did the conversion rather than a
hand transcription, so the only judgement in each component is the
hex-to-token lookup. Verified by diffing every `d` attribute against
its source: **113 paths and 4 circles, all identical**, across the
seven new components. Each renders in the gallery at the size its
frame draws it at.

Two slots are still empty on purpose:

- **`Discover / Category / Empty`** has no answer in the set. There is
  no "empty category" drawing and the placeholder frame is unnamed.
- **`System / Error / Crash boundary`** will not get one.
  `RootErrorBoundary`'s own contract is that it survives "a bad import,
  missing env var, **native module failure**", and `react-native-svg`
  is a native module. Rendering an `Svg` inside the fallback would put
  the suspect back on the stand. It stays text only, and the
  illustration component says so.

Still unresolved, and not a code question: **eight of the seventeen
drawings have no slot on any screen** (No highlights, Processing,
Upload failed, Offline, Ask the book, Practice, Out of credits,
Notifications), and `Library / Upload / Failed` renders one where the
file asks for none. That is a Figma decision, not an implementation
one.

## 10.2 and 10.6 — not closable here

**10.2, screenshots at three widths.** Auth is reachable without a
session and R-M9 measured Welcome and sign-in at 820, 1180 and 1440.
Everything else is behind sign-in. Magic-link auth needs an inbox, so
this waits on a test account rather than on anything in the code.

**10.6, prices and caps.** §7's first row was split out of R-M7 into its
own piece of work and has not started: prices come from the store, but
the caps are scattered across three client copies, the edge functions'
own fallbacks and two stale SQL `coalesce`s. Until that lands there is
nothing to check this against.
