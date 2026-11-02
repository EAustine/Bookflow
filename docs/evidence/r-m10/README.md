# R-M10 — the §10 sign-off pass

§10 of `docs/specs/responsive-handoff.md` is six bullets. This is where
each one stands, what was used to decide it, and what was found on the
way. Three of the six are closable from the code and the token set; two
need a browser with a signed-in session and are blocked on that; one is
blocked on a piece of work that has not started.

| § | Bullet | State |
|---|---|---|
| 10.1 | Every Figma frame has a matching screen at its size class | **Not started** |
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

## 10.1, 10.2 and 10.6 — not closable here

**10.1, frame coverage.** Not started. It is an inventory of every frame
in the Figma file against the screen that renders it, minus §8's
intentional gaps and the carried items in
`docs/specs/responsive-milestones.md`. It needs a frame list, not a
browser, so it is the next thing this pass can do unaided.

**10.2, screenshots at three widths.** Auth is reachable without a
session and R-M9 measured Welcome and sign-in at 820, 1180 and 1440.
Everything else is behind sign-in. Magic-link auth needs an inbox, so
this waits on a test account rather than on anything in the code.

**10.6, prices and caps.** §7's first row was split out of R-M7 into its
own piece of work and has not started: prices come from the store, but
the caps are scattered across three client copies, the edge functions'
own fallbacks and two stale SQL `coalesce`s. Until that lands there is
nothing to check this against.
