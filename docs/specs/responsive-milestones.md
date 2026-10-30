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
| §4 Discover | R-M5b | ✅ Gutter pass, Featured card sizes with the Reading nook art, two-column results, 640 request form |
| §4 You & Settings | R-M6 | ✅ 600 centred at Medium; 440 master + 560 detail above; two confirms to 440 modals |
| §4 Monetisation | R-M7 | ✅ Buy credits as a 640 modal, Top-up balance as a You page, the banner into the column. Paywall is RevenueCat's |
| §4 System states | R-M8 | ✅ Skeletons follow the branch, toast over the content area, crash in the 480 lane |
| §5 Components | with the flow that uses each | Library's are done; the rest land with their flow |
| §6 Hover and focus | R-M9 | **Unblocked by M4a** — the web bundle builds and loads. See below |
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
| Free tier, Standard $9.99 / $79, Student $4.99 | **its own piece of work**, split out of R-M7 | Pending. Caps (60 min, 5 books) are in the code; prices are not — they come from the store |
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

**R-M5b — Discover.** ✅

- **One gutter pass covers nine frames.** Every home block spans the
  content width behind the gutter, and loading, error, slow network,
  refreshing and category empty are the same home with a zone swapped
  in, so they inherit it. **Compact keeps 20**, not `gutter.compact`
  (16): the flow's mobile frames are drawn at 20, and the token would
  move the phone 4px for no reason the frames ask for. Recorded as
  `layout.discover.gutterCompact`.
- **Featured card** gained its Size property. Medium and Wide replace
  the cover column with the **Reading nook** illustration anchored
  right — 440 × 268 flush at Expanded and Desktop, the same drawing at
  0.86 (378 × 230) bottom-right at Medium — with the book's real cover
  standing on the stack at 6°. Hand-converted from the two SVGs in
  `assets/illustrations/`, every colour bound to a ramp.
- **Search results and category are two columns** at every wide size:
  330, 510 and 548, which is `tileWidth(inner, columnGap, 2)` from
  `@bookflow/shared`. Two, not a ceiling like the Library grid's four.
- The **no-matches request form** is centred and capped at 640.
- `DiscoverScreen.tsx` went **3400 → 2986 lines**, with `CoverBox`,
  `DiscoverBookRow`, `DiscoverResultList`, `FeaturedCard`, `RailCard`
  and `AddPill` extracted to `features/discover/components/` and 30
  dead styles removed.

**Corrected on the way: Discover's pills are not design-system drift.**
M5b set out to move them onto `Button`, on the reading that a
hand-rolled 28pt control was wrong against the system's compact 32.
The frames say otherwise — `Add pill` is a Figma component in its own
right, used at 28 throughout Discover, and on the Featured card it is
amber on forest, which `Button` has no variant for. Forcing `Button`
there rendered a forest primary on a forest-800 card and the control
vanished. The pill stays; what is actually missing is recorded below.

**Carried from M5b:** the design system has **no on-dark button
variant**, and **`Add pill` is not in the system at all**. The search
bar is still a raw `TextInput` where `Input` exists, and the rail
skeletons are local grey blocks where `Skeleton` exists — neither is a
surface M5b rewrote. Also untouched: seven unused exports in
`discoverApi`, two `console.log`s on the Wikisource fetch, and three
stale comments.

## R-M6 — You & Settings

✅ The last of §4. **43 wide frames that are two containers:** a 600
column centred at Medium, and the 440 master plus a 560 detail column
above it. Every drill-in page inherits one of them, which is why this
stayed one milestone where Listen and Discover split.

- **No gutter pass.** You & Settings already used 16 everywhere and the
  frames draw 16 everywhere — 408 in the 440 master, 568 in the 600
  column, 528 in the 560 detail. Unlike Discover, there was nothing to
  reconcile. The work was containers.
- **The detail column is left aligned, not centred.** The frames put it
  33 from the master edge on Expanded and 41 on Desktop, which is
  `1 + gutter[sizeClass]`: a hairline plus the page gutter. The pane
  keeps whatever is left over. The hairline belongs to the detail, the
  way `LibraryBookPane` carries its own `borderLeft`.
- **Reading display opens on arrival** above Medium. §8 leaves a
  separate wide You home out on purpose because the master is always
  visible, so something has to be open, and the build log's prototype
  flow names it. Resizing up from a Medium home opens it; resizing down
  keeps the open page and gives it back its back button.
- **The rail stays on every You surface.** `railHidden` carried
  `youSubViewOpen`, and the drill-ins are router pushes onto the root
  stack, so a sub-page covered the whole shell. Above Compact the tab
  now renders its pages inside the content column — the same
  components the routes mount, with no `onBack` — and the flag is gone
  from `SignedInShell` and `App.tsx`. It was dead anyway for seven of
  the eight pages, because `view` stayed `'home'` when a route pushed.
- **`ListRow` gained `active`**, the `bg/accent-muted` fill Figma draws
  as `List row (selected)`. Its existing `selected` is a trailing
  check — a picker answering "is this the chosen value", not a master
  row answering "is this what you are looking at". `LibraryScreen` grew
  its own row rather than use it; now it does not have to.
- **`SubHeader`'s `onBack` is optional**, which is Figma's hidden
  `backBtn` layer. Not a size-class test: it asks whether the master
  offers a way back. **Edit profile is the exception** — it has no
  master row, so it keeps its button at every size, and its back
  returns to Account & subscription rather than You home.
- **Sign out (two copies), Delete account and the notification
  permission sheet** are now `Presenter kind="confirm"` — 440, centred
  over the window with the scrim across the rail. The notification one
  is §4 System states' row, pulled forward rather than left as the only
  bottom sheet on a screen whose Sign out row already opened a modal.
- **`HelpFAQScreen` is on `SubHeader`**, closing the last F-30 holdout.
  It had kept the centred 18px-arrow header the consolidation removed
  everywhere else, because it landed afterwards.

Extracted to `features/account/components/`: `YouHomeBody` (one body
for home, the Medium column and the master), `PlanCard`,
`SettingsSection`, and the shared types to `features/account/types.ts`.

**Two bugs the device found, not the typechecker:**

- **Nested `SafeAreaView` double-applies the inset.** The page
  components each bring their own — they were all top-level screens —
  and `react-native-safe-area-context` does not subtract what a parent
  already applied, so wrapping the stage in one put the Sub header 24
  low. The safe area is now applied per child. `LibraryBookPane` dodges
  this by having none of its own; these pages cannot, because the
  router still mounts them bare on Compact.
- **Android under-measures tracked, weighted text.** "YOUR PLAN" in the
  plan card broke after "YOUR" at 440 and 600 but never on the phone,
  on a card 80dp narrower — it only appears at density 160, which is
  how the tablet widths are tested. Pinned with `flexShrink: 0` and
  `numberOfLines`.

**Carried from M6**, all recorded rather than guessed at:

- **Two plan cards.** Figma uses one `Plan card` instance on both
  surfaces, at 408 in the master and 528 in the detail. The code has
  two different designs — You's dark forest card with meters, and
  `AccountScreen`'s light `subCard` with an eyebrow stack, an Upgrade
  pill and a feature list. Collapsing them means choosing one and
  redrawing the other, which is a design call, not a layout one.
- **Three section cards.** `SettingsSection` (You), `sectionGroup`
  (Account) and `sectionBlock` (Settings) have label sizes 10, 11 and
  12 against Figma's `Label/MD` at 12. The *rhythm* difference is real
  — the frames use 24/4 above the master's labels and 18/10 above the
  detail's — but the three label sizes are drift. Only You's moved,
  because only You's was rebuilt.
- **`ReminderTimePicker` is still a bottom sheet.** It appears in none
  of the 43 frames, so there is no wide container to match it to.
- **`BuyCreditsSheet`** stays a sheet until R-M7, which draws it as a
  Large modal. The native `Alert`s are R-M8's — see that section: the
  count is 30, not five, and the brief keeps them native anyway.
- **`HelpScreen`** in `YouDrillScreens` is implemented, exported and
  imported by nothing; `HelpFAQScreen` replaced it.

**Not verified:** Delete account's confirm path calls the
`delete-account` edge function against production. The modal was opened
and cancelled at 1180; the destructive path was not run. Sign out's was.

## R-M7 — Monetisation

✅ **27 of the 30 frames.** The other three are the Paywall, and
Figma's own annotation on the page says why they are not code:

> Every upgrade path in the app calls `presentPaywall()` →
> `RevenueCatUI.presentPaywallIfNeeded()`. That UI is configured in the
> RevenueCat dashboard and rendered by their SDK, it is not in this
> repo, so there is no source of truth to replicate here.

The code agrees. Both in-app paywalls were deleted in F-34 — 1,622
lines across four files — and `SoftWarningBanner`'s own header calls
itself "the only live paywall surface in the repo". The three frames
are the source for `REVENUECAT_PAYWALL_BUILD_SHEET.md`, now in
`docs/specs/`.

- **Buy credits is a 640 Large modal** above Compact, through
  `Presenter kind="task"` — the size `Modal`'s own header already named
  buying credits as being for. The card row needed no size-class
  branch: `cardBody` is `flex: 1` and `priceCol` does not shrink, so at
  640 the body takes 454, the description stops wrapping and the price
  and Buy stay right, which is what the frame draws.
- **Its ref keeps its own type.** `present(initialKind)` takes the tab
  to open on and `PresenterRef` is `BottomSheetRef`, whose `present`
  takes nothing. The existing `useImperativeHandle` wrapper sets the
  tab and delegates, so the shared contract did not move.
- **One buy modal per tab, not five.** `TopupBalanceBlock` mounted its
  own at each of its four call sites and `YouScreen` mounted another,
  so a free You tab held five at once and the detail pane added two
  more. It takes an `onBuy` now and falls back to its own sheet only
  where no host offers one.
- **Top-up balance is a You page**, the container M6 built. There was
  none: "Buy credits" was the only `drillsInto` row in its group that
  did not drill into anything, so its chevron promised a page that did
  not exist. Figma draws the page at every size, phone included, so the
  row now opens it everywhere and the modal is reached from inside.
- **The soft warning banner moved into the column.**
  `LibraryScreen.tsx` claimed "the wide branch renders its own copy,
  inside the column" — it did not. There was one unguarded mount
  outside every size-class branch, where `OfflineBanner` on the next
  line was correctly gated, so on wide classes it spanned the whole
  shell and on the phone it sat *above* the Library header, where every
  frame including the phone's own puts it below. It renders per branch
  now, between the header and the stats card.

**One addition the frames do not draw.** `Top-up row` carries a Buy
link only in its empty state — the frame shows one empty row and one
full — so routing "Buy credits" to the page would strand anyone who
already holds both balances on a page with no way to buy. Before M7
that row opened the modal directly, so buying was always one tap. The
page gets a "Buy more credits" button to keep it one tap. Confined to
the new surface, so the four plan-card mounts stay exactly as drawn.

**Found on device:** `Button` spreads `{...rest}` after its `style`
prop, and `ButtonProps` extends `PressableProps`, so a caller passing
`style` replaces the whole computed button and it renders as bare text.
Wrapped in a `View` instead. Worth a guard on the component.

**Carried from M7:**

- **`Modal`'s height cap is `winH − gutter*2`** — 64 at Expanded, 80 at
  Desktop — where every modal frame draws a flat **24 top and bottom**.
  At Desktop that would scroll a modal the frames show fitting. The one
  surface that reaches the cap is the Paywall, which is RevenueCat's,
  so this is measured and written down rather than changed on the
  strength of a frame that cannot be exercised here.
- **The Desktop 400 web dialog** for "Upgrade coming soon" and "No
  purchases found". Native keeps `Alert.alert` at every size, which is
  what the 270 frames draw for Medium and Expanded. The Desktop
  treatment is web-only and waits for R-M9.
- **The card list at 640 was verified in a throwaway forced build.**
  The `topups` offering is not configured in the dashboard, so
  `getTopupPackages()` returns `[]` and the modal shows its unavailable
  state — which did get verified live, at 640. No purchase was run.

## R-M8 — System states

✅ **30 wide frames, but only four surfaces.** Six of the ten rows had
already shipped with the flow that owned them — offline Library (M2a),
offline AI chat and the scope banner (M3b), slow-network Discover
(M5b), and the notification permission dialog, which M7 pulled forward
to a 440 modal. What was left: the two skeletons, the toast and the
crash boundary.

**The Library skeleton now follows the branch.** It took no props and
drew one full-width list at every size, returned *above* the screen's
own `compact / medium / wide` ladder. So at Medium it drew rows where a
cover grid was coming, at 20 where the gutter is 32; above Medium it
drew one bleed column where a 440 master and a book pane were coming;
and even on the phone it was stale, missing the stats card entirely and
rendering no tab bar, so the bottom nav vanished for the length of the
load. It reads the size class itself now, so the call sites did not
move:

- **Medium** — a 684 × 194 hero block, the "All books" bar, then the
  4-column tile grid at 153 wide with a 24 gap. Measured on device.
- **Expanded and Desktop** — the 440 master (113 stats block, label,
  76-tall row skeletons) beside a **pane skeleton**: a 240 × 360 cover,
  the 80 / 280 / 140 / 220 bars, two buttons at 160 and 110, and three
  588 × 56 rows. The pane is a skeleton, not its "Pick a book" empty
  state — nothing failed to be selected, the library has not arrived.

**The Reader skeleton got the measure and a back button.** Its body was
`paddingHorizontal: 22` with no cap, so at 1440 the paragraphs ran
about 1400 wide and snapped to 680 when real text landed. And `onBack`
was destructured and never used: the comment claimed "back button is
real", the code drew a bare 32 × 32 `Skeleton` in a non-pressable
`View`, so a cold reader open had no way out. Both fixed.

**The toast moved off the window.** It is mounted at the window root
and that is deliberate — the comment above the mount records that it
sits outside `BottomSheetModalProvider` so toasts paint above bottom
sheets — so it stayed there and offsets instead. Two things followed
from the frames:

- Horizontally it centres on the **content area**. It reads a new
  `railVisible` flag the shell publishes, not the size class, because
  the reader and the foreground player are wide surfaces with no rail;
  verified both ways on device.
- Vertically it is **top on Compact, bottom above it** — 30 above the
  bottom safe area. The phone keeps the top because it has a tab bar
  there; the tablet frames all put it at the bottom, which is free once
  the tab bar becomes a rail.

**The crash boundary went 420 → 480.** It was already right about the
hard part — no rail, no chrome, centred — and the number was wrong. It
does **not** import `layout.lane.width`: its own comment explains that
it uses raw primitives and hex so a broken design system cannot bring
the crash screen down with the app, and a boundary that imports what
may have just crashed is not a boundary. The literal changed and gained
a comment naming the token it mirrors.

**One hole filled:** Medium had **no offline banner at all**. The
Compact mount is gated `!isWide` and the wide one lives inside the
master, so that branch fell between them. The row above says Library
offline shipped complete in R-M2a; it did not.

**Carried from M8:**

- **The 30 `Alert.alert` sites stay native.** The brief's row is "iOS
  alert on tablets, web dialog on desktop", so on native they are
  already correct at every size M8 covers, and the Desktop 400 dialog
  is web-only and waits for R-M9 with the Monetisation pair. Worth
  writing down because this doc had assigned "the five native `Alert`s"
  to R-M8 and the real count is **30 across 8 files**, 12 of them in
  `AccountScreen`. `Presenter` has no `'alert'` kind, so the one
  existing non-native case — Discover's "Already removed", from M5a —
  hand-rolls a bare `Modal`.
- **`Skeleton`'s shimmer is two hex literals**, `#EAE6DC` → `#F0EDE5`,
  where §4 says skeletons use `color/bg/surface`. Neither is on the
  cream ramp (`surface` is `#F5F1E8`, `cream.200` is `#ECE5D5`), so
  binding them changes how every skeleton in the app looks. **For the
  sign-off pass (R-M10).**
- React error boundaries do not catch throws from event handlers, only
  render-phase ones — worth knowing before anyone tries to test this
  boundary the quick way.

## Pricing and caps — split out of R-M7

Not a layout change, so it is its own piece of work. What it has to
cover, from the M7 census:

**Prices are not in the code.** Every subscription and top-up price is
read from the store through `product.priceString`. Changing what the
app charges is App Store Connect, Play Console and RevenueCat offering
work, and the app will show it the moment the store does. The only
hardcoded price is a dead `$4.99/mo` hint on the student row, which
opens a support email and has no product behind it.

**The caps are the real job, and they are scattered.** "60 min / 5
books / 50K credits" is not one constant: the client holds three copies
of 60 and two of 50K, the edge functions hold their own fallbacks, and
the SQL carries both the defaults and two stale `coalesce`s — including
a `coalesce(audio_seconds_limit, 5400)` in `record_audio_usage` still
carrying the retired 90-minute default, three migrations after 0025
lowered it to 3600. The canonical `FREE_PLAN_LIMITS` is not even
imported by the shell that feeds the plan meters, which keeps its own
copy.

**Decided, so it is not lost:** existing free users already over the
new 2-book cap **keep their books** and simply cannot add more until
they are under it, and **the book limit needs a server check**. Today
it is the one cap with no server authority at all — two client-side
gates and nothing in the edge functions or the schema, so a patched
client or the share-extension path is unbounded.

**Also found, worth fixing while in there:** Pro audio has three
different answers in three layers — `Infinity` on the meter, 3000
minutes in `readingStats`, and 180,000 seconds in `generate-audio`. A
Pro user who reached 50 hours would see "Unlimited" and a hard 402.

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

**Upload drop zone** (`298:573`, §4 Library, §5). Web and desktop only.
The web bundle now resolves — architecture M4a — but this one needs the
`files` adapter, so it unblocks after **M4b**, not M4a. The original
reason it was held: `react-native-pdf`,
`react-native-webview` and `react-native-purchases-ui` are imported at
module load through the `export *` feature barrels, and
`spikes/web-boot/export-1.log` records the failure. CI exports Android
only and says so in a comment. It is held for the milestone that
unblocks web, which is the architecture migration's M4 (native-only
imports behind `src/platform/*`), not a responsive milestone.

**§6 hover and focus** was blocked by the same thing for the same
reason: they are web traits, and there was no web build to show them
on. **Architecture M4a cleared that** — `npm run build:web` exports and
`npm run test:web` proves the page loads, both in CI. R-M9 can start.

Two things it should know before it does. The **Upload drop zone**
still waits for M4b's `files` adapter, not M4a. And **Auth has never
had a responsive milestone** — Welcome renders at 1440 as a stretched
phone layout, one column with a full-width CTA, where the build log's
Phase 5 describes a split screen with a brand panel on the left. §4's
frame set has nine Auth frames and no milestone in this table covers
them, which R-M9 will notice immediately since Welcome is the first
page it can look at.

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
