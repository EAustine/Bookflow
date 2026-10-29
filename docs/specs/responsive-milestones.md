# Responsive milestones — what delivers each section of the brief

Every section of `responsive-handoff.md` mapped to the milestone that
delivers it, so nothing is lost between them. M1, M2a and M2b are
done and describe what shipped; the rest is the plan and will move as
the work meets the code.

Note that these numbers are the **responsive** milestones. They are not
the architecture migration's M1-M11 in `ARCHITECTURE_LOG.md`, which run
on their own track; where the two have to talk to each other it is
spelled out below.

| Brief | Milestone | State |
|---|---|---|
| §1 Size classes | R-M1 | ✅ `breakpoints.ts`, `tokens.layout.*`, `useSizeClass()` |
| §2 App shell | R-M1 | ✅ Side rail, content column, mini player placement |
| §3 Containers | R-M1 | ✅ `Presenter` → sheet / popover / side panel / modal |
| §4 Library (layout) | R-M2a | ✅ Medium hero + grid, 440 master + book pane, search, offline banner |
| §4 Library (overlays) | R-M2b | ✅ Add popover, book actions menu, remove modal, 480 upload dialog |
| §4 Reader | R-M3a | ✅ 680 measure, inline search, action bar, Reading options popover. PDF spread deferred, see below |
| §4 AI tools | R-M3b, R-M3c | ✅ Panels in M3b; the practice session takeover and the anchored word pop-over in M3c |
| §4 Listen | R-M4a, R-M4b | ✅ The tab in M4a; the player in M4b. Split below |
| §4 Book detail | R-M5a | ✅ Cover left, info capped at 680, inline wrapping actions, More like this |
| §4 Discover | R-M5b | Planned. Featured card sizes, two-column results, 640 request form |
| §4 You & Settings | R-M6 | Planned. 440 You column as master |
| §4 Monetisation | R-M7 | Planned. Buy credits Large modal, paywall |
| §4 System states | R-M8 | Planned. Skeletons per layout, toast over content, crash in the lane |
| §5 Components | with the flow that uses each | Library's are done; the rest land with their flow |
| §6 Hover and focus | R-M9 | **Blocked on the web bundle.** See below |
| §7 Copy and product | R-M2b (Library), R-M10 (rest) | Partly done. See the table below |
| §8 Left out on purpose | — | Nothing to build |
| §9 Build order | — | This table is it |
| §10 Done when | R-M10 | The sign-off pass |

## §7, row by row

§7 is a table of eight changes, and they do not all belong to one
milestone. Three are Library's and shipped with R-M2b; the rest sit
with the flow that owns them.

| Change | Milestone | State |
|---|---|---|
| Free tier, Standard $9.99 / $79, Student $4.99 | R-M7 | Pending. Code still has 60 min, 5 books, $6.99 |
| "Reading options" → "Display" on the action bar | R-M3a | ✅ Bar only; the sheet keeps its title |
| Remove book: "Remove {title}?" + one line | R-M2b | ✅ `RemoveBookSheetBody`, both callers |
| Book actions: no subtitles, cover or author | R-M2b | ✅ |
| Offline chat banner wording | R-M3b | ✅ |
| Discover Refreshing spinner | R-M5b | ✅ already shipped — `onPullToRefresh` holds `refreshing` for 2s so the rail skeletons are perceptible. The row was stale |
| Progress ring percentage, one rounded value | R-M2b | ✅ `ProgressRing` |
| No em dashes in any UI copy | R-M2b | ✅ App and marketing site swept |

## R-M4 is two milestones

The brief's §4 Listen is one sentence, but the build log's Listen flow
is eight screens across three sizes — the tab's four states, the
foreground player, three popovers, the mini player and History. That is
roughly twice R-M3b, so it splits the way R-M3 did.

**R-M4a — the Listen tab.** ✅ Now playing as two columns above Medium
(a fixed left of 560 / 620 and a flexible Recently listened card), one
684 column at Medium, the Empty (440), Resume (560) and History (720)
states centred, and the "Listen" title held to one line.
`layout.listen` carries the frame widths.

**R-M4b — the player.** ✅

- The foreground player at **680**, centred. The frames cap the whole
  bar — fill, top hairline and all — not a full-bleed surface with
  capped contents; the header is the one that stays full width. The
  bimodal text takes the cap on its scroll *content container*, since a
  ScrollView sized to 680 would only scroll over the text.
- **Voice, sleep timer and speed as popovers** above Compact, through
  `Presenter kind="menu"`. `VoiceSheet` and `SleepSheet` were already
  plain bodies with the `BottomSheet` at the call site, so each
  conversion was one line.
  Sleep and speed anchor on the **bar**, not on their buttons: the
  frames centre both over the 680 bar and draw no arrow, and a
  bar-shaped anchor is what produces that. `Popover` gained
  `arrow={false}` for it — an arrow aimed at the midpoint of a 680
  element says nothing — and `offset`, for the frames' 12.
- **`Panel / Playback speed (compact)`** (`372:448`) as the popover
  content and `Sheet / Playback speed` on the phone, both from one
  `PlaybackSpeedPicker` body with a `compact` flag. `SPEED_CATALOG` in
  `@bookflow/shared` already carries `{ value, display, label,
  description }`, so the difference is whether the description and the
  time estimate render.
- **The cycle is gone from both surfaces.** Speed used to cycle in
  place in `ListenScreen`, `SignedInShell` and `App.tsx`, which meant
  the same control behaved differently depending on where you tapped it
  and never showed what the options were. The tab hosts its own
  `Presenter` beside the pill, so `onOpenSpeedSheet` became
  `onSpeedChange`.
- **The Desktop mini player in the side rail** (`Rail mini player`
  `295:98`, 208 × 138). `SideRail` gained a `footer` slot the shell
  fills, so the rail stays a dumb nav component that knows nothing
  about audio. Desktop only: the rail is only `expanded` there, and the
  build log keeps Expanded on the bottom bar.

**Carried from M4b:** Figma's **Voice popover on the Now playing tab**
(`329:2927` and its Medium and Desktop twins). It is side-anchored
beside the pill with a left-pointing arrow, and `placePopover` does
above and below only. The tab's voice pill still expands to the
foreground, where the picker lives. Building it means teaching the
shared module side placement for the one popover in the app that wants
it.

## R-M5 is two milestones

§4 Book detail and §4 Discover are 41 wide frames between them,
roughly three times R-M4b, so they split.

**R-M5a — Book detail.** ✅ One rule covers all three wide sizes: the
cover is a fixed width (192 at Medium, 228 above) and the info column
flexes with a **680 cap**, which lands on 460 at Medium by itself. The
row is left-aligned, so above Medium it stops short of the content
edge — that is what the frames draw. The phone's bottom CTA bar
becomes inline actions under the meta row, wrapping, so at Medium the
three in-library buttons put "Remove from library" on a second line
with no size-class branch. Remove is the 440 `Presenter kind="confirm"`
that already existed; "Already removed" is the native alert up to
Expanded and the **400** `modal/alert` dialog at Desktop.

New on wide: the **More like this** rail, built from shelves already in
memory — the category drilled in from, then subject-tag matches against
everything seen this session, then the popular shelf. **The title
follows the content**: it only claims kinship when the books share a
category or subject, and says "Popular fiction" when it has fallen back.

**R-M5b — Discover.** Planned: home, loading, refreshing, error, slow
network, search results, no matches (request form capped at 640),
category list and category empty, at three sizes. Plus the `Featured
card` Size property — Compact (phone), Medium (684 × 268, `375:30`) and
Wide (`372:51539`) — including the Reading nook illustration, to be
hand-converted to a token-bound RN SVG the way `UploadFailedIllustration`
was in M2b.

Discover's file is the obstacle: `DiscoverScreen.tsx` is 3158 lines and
owns the home, search, category and detail views with no `components/`
folder, every card a module-local function, and ~12 literal 20pt
gutters. M5a added the first `useSizeClass` in the feature.

## Follow-up: translate word pop-over content

R-M3c **anchored** the word pop-over over the tapped word, which is
what the responsive brief asks for. Its *content* is still the
dictionary lookup the app has always shown.

Figma `314:14052` shows something different: an `EN → TWI` header, the
word, its phonetic, the definition, the **translation**, and Play /
Save, at **260** wide. That is also the prop shape of
`features/reader/screens/TranslateWordPopover.tsx`, which is exported
from the barrel and **has no call sites** — the live component is a
separate, module-local `TranslatePopover` inside `ReaderScreen`.

So the follow-up is: move the pop-over to that content, driven by the
existing translation service, and delete whichever of the two
components loses. Held separate from R-M3c because it is a content and
data change — the pop-over would need a translation as well as a
definition — and nothing in §7 asks for one.

## Carried, with a reason

**Upload drop zone** (`298:573`, §4 Library, §5). Web and desktop only,
and the web bundle does not resolve at HEAD: `react-native-pdf`,
`react-native-webview` and `react-native-purchases-ui` are imported at
module load through the `export *` feature barrels, and
`spikes/web-boot/export-1.log` records the failure. CI exports Android
only and says so in a comment. It is held for the milestone that
unblocks web, which is the architecture migration's M4 (native-only
imports behind `src/platform/*`), not a responsive milestone.

**§6 hover and focus** is blocked by the same thing for the same
reason: they are web traits, and there is no web build to show them on.

**Full-mode PDF single/spread toggle** (`Page layout toggle`
`311:13116`, §4 Reader). `react-native-pdf` 7.0.4 has no dual-page
capability — its props are `scale`, `horizontal`, `enablePaging`,
`singlePage` and `fitPolicy`, and nothing else — and CLAUDE.md pins
that engine permanently after M0 spike 1 ruled out pdf.js at 42
dropped frames in 60. Full-mode PDF ships single-page, scaled to fit
the width, at every size. Delivering the toggle means either a second
PDF renderer mounted beside the first, which doubles the cost on the
low-end Android the product targets, or a different engine, which is a
decision well outside a layout milestone.

**The reader's panel is a page list, not a chapter list.** Figma
`308:11864` is a list of pages with their status and a Now tag, with
chapter titles only as section headings where a book has them. That
agrees with the schema migration that made pages the navigation unit,
and with `ListenNowPlayingScreen` dropping its chapters pill for the
same reason. Listen's own chapters are still R-M4's.

**Listen's full-screen early returns** still have to become panel
content before §3 can present them. The reader's were R-M3b's main
body of work; Listen's are R-M4b's.
