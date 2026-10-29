# Bookflow responsive build log (tablet and desktop)

Built directly in Figma from chat. Claude Code implements from this file and the Figma file.

| | |
|---|---|
| File | Bookflow `Rt3gjNC24kBTrncxlnkuPW` |
| Sizes | Medium 820 × 1180 · Expanded 1180 × 820 · Desktop 1440 × 900 |
| Frame naming | `Flow / Screen / State / Medium\|Expanded\|Desktop` |

## Decisions

- Rail stays collapsed (72) on Medium and Expanded; expands (240) from 1280. At 1180 an expanded rail plus a 360 master leaves only 580 for detail.
- Mini player: bar across the content area on Medium and Expanded; card at the rail foot on Desktop.
- Reader has no rail at any size. Page column capped at 680. Panels slide over on Medium, dock on Expanded and Desktop.
- Library on Medium: Library hero card plus a 4-column cover grid that opens the reader. Expanded and Desktop: list + proposed book pane.
- Coverage: every mobile screen now has a Medium, Expanded and Desktop version, except the few left out on purpose (see "Phase 6 (re-run)").
- Hover reuses the Pressed treatment (RN Pressable hover maps to pressed style). Focus-visible = Default + 3px outset halo (`overlay/focus-ring`, spread bound to `border/focus`).

## Phase 1: Layout foundations and components

### Variables: `Layout` collection (`VariableCollectionId:289:2`), 17 variables

All carry WEB code syntax `tokens.layout.*` (lands in code in M1, used by shells in M7).

| Variable | Value | Scope |
|---|---|---|
| layout/breakpoint/medium | 600 | doc only |
| layout/breakpoint/expanded | 1024 | doc only |
| layout/breakpoint/rail-expand | 1280 | doc only |
| layout/rail/collapsed | 72 | width |
| layout/rail/expanded | 240 | width |
| layout/pane/master | 360 | width |
| layout/panel/side | 380 | width |
| layout/popover/width | 340 | width |
| layout/modal/confirm | 440 | width |
| layout/modal/large | 640 | width |
| layout/lane/width | 480 | width |
| layout/reading/measure | 680 | width |
| layout/content/max | 1280 | width |
| layout/gutter/medium | 32 | gap/padding |
| layout/gutter/expanded | 32 | gap/padding |
| layout/gutter/desktop | 40 | gap/padding |
| layout/column-gap | 24 | gap |

Grid styles: `Medium / 820 · 8 col` (margin 32), `Expanded / 1180 · 12 col` (32), `Desktop / 1440 · 12 col` (40), gutter 24.

### Pages

- `Layout` (`292:2`) under FOUNDATIONS: class table, true-size shells (Medium, Expanded, Desktop), reader layouts (Medium, Expanded), transient UI widths, Presenter mapping.
- `Components · Layout` (after Organisms).

### Components

| Component | Node | Variants |
|---|---|---|
| Logomark | `295:5` | arcs cloned verbatim from Lockup, canonical crop |
| Slot | `295:8` | content placeholder for containers |
| Rail item | `295:56` | Size Collapsed/Expanded × State Default/Active/Hover/Focus-visible |
| Rail mini player | `295:98` | Playing/Paused |
| Side rail | `295:493` | Size × Active (Library/Discover/Listen/You), Show mini player |
| Pane header | `296:386` | Close / Back and close |
| Side panel | `296:407` | Docked / Slide-over, Content swap |
| Popover | `296:434` | Arrow None/Top/Bottom/Left/Right, Content swap |
| Modal | `296:443` | Confirm 440 / Large 640, Content swap |
| Menu item | `298:464` | Kind Default/Destructive × State Default/Hover/Focus-visible/Disabled |
| Context menu / Book actions | `298:467` | copy from phone book action sheet |
| Upload drop zone | `298:573` | Idle / Drag over / Uploading |
| Keyboard shortcuts | `298:576` | |

Container pattern: Popover, Side panel and Modal take the phone sheet organism through the `Content` instance swap; the sheet's handle is hidden. Same content component in a different container, which is what `<Presenter>` does in code.

### Interaction states added to existing components

| Component | Added |
|---|---|
| Button `119:434` | 24 variants: Hover, Focus-visible for every Variant × Size (72 total) |
| Icon button `120:179` | Hover, Focus-visible |
| Category chip `198:40` | Hover (inactive on bg/raised), Focus-visible |
| List row `129:314` | 16 variants: Hover, Focus-visible for every Size × Trailing (40 total) |

### Component page arrangement (before Phase 2)

All four component pages (Atoms, Molecules, Organisms, Layout) rebuilt into one structure: a root auto-layout frame `__arranged` holding the page header, then groups by surface, each group a wrapping row of cards. Every card holds the component's title, one-line note (carried over from the old label, or the first sentence of the component description) and the component set itself. Nothing can overlap again because auto layout places everything.

- Fixed: 28 overlapping pairs on Molecules, Status bar over Voice avatar on Atoms, Category chip parked off-canvas.
- Removed: 108 loose label texts (replaced by card headers), a stale "Paywall sheet" label for a deleted component, an empty 1×1 frame on Organisms.
- Groups. Atoms: Actions, Inputs, Display, Feedback and loading, Platform chrome, Illustration. Molecules: Rows and headers, Navigation and search, Library, Reader, Listen, Discover and book detail, You and monetisation, AI and feedback. Organisms: Sheet chrome, Library, Reader, AI tools, Listen, Monetisation, Onboarding, System. Layout: Navigation, Containers, Menus, Web, Brand.
- No component was edited, renamed or re-created, so every instance on the screen pages is unaffected.

## Phase 2: Reader and AI tools (26 frames)

Frames now sit in Figma sections on every flow page (see "Page sections" below); the old row positions and row labels are gone.

### Library additions made first

| Addition | Node | Notes |
|---|---|---|
| Status bar `Device=Tablet` | `308:594`, `308:610` | 24pt iPad bar, time and date. Phone variants renamed `Device=Phone`; instances unaffected |
| Reader page `Long page` boolean | on `155:379` | six more paragraphs of the same chapter, hidden by default, so the 680 column fills a tablet page |
| Panel / Highlights | `308:11815` | built from the phone Highlights screen body |
| Panel / Chapters | `308:11864` | built from the phone Chapters sheet, grabber and header removed |
| Page layout toggle | `311:13116` | Single / Spread, built from Mode toggle pill |
| Popover arrows | `296:434` | arrows now pinned to their edge with constraints so they track content height |

### Reader page (`156:2`), 14 frames

| Frame | Node |
|---|---|
| Reader / Text / Default / Medium | `310:805` |
| Reader / Highlights / Slide-over / Medium | `310:889` |
| Reader / Text / Default / Expanded | `310:1078` |
| Reader / Text / Chrome hidden / Expanded | `310:1162` |
| Reader / Reading options / Popover / Expanded | `310:1200` |
| Reader / Search / Results / Expanded | `310:1353` |
| Reader / Highlights / Panel / Expanded | `311:1339` |
| Reader / Chapters / Panel / Expanded | `311:1486` |
| Reader / Full / PDF single / Expanded | `311:1612` |
| Reader / Full / PDF spread / Expanded | `311:1708` |
| Reader / Full / EPUB / Expanded | `311:1820` |
| Reader / Text / Default / Desktop | `311:1902` |
| Reader / Chapters / Panel / Desktop | `311:1969` |
| Reader / Full / PDF spread / Desktop | `311:2078` |

### AI tools page (`162:2`), 12 frames

| Frame | Node |
|---|---|
| AI tools / Summary / Slide-over / Medium | `314:808` |
| AI tools / Tools list / Panel / Expanded | `314:978` |
| AI tools / Summary / Panel / Expanded | `314:1133` |
| AI tools / Chat / Panel / Expanded | `314:1277` |
| AI tools / Translate / Page panel / Expanded | `314:1405` |
| AI tools / Translate / Word popover / Expanded | `314:14052` |
| AI tools / Practice / Config panel / Expanded | `314:1524` |
| AI tools / Practice / MCQ session / Expanded | `314:14167` |
| AI tools / Practice / Results / Expanded | `314:14264` |
| AI tools / Credits exhausted / Panel / Expanded | `314:1681` |
| AI tools / Summary / Panel / Desktop | `314:1832` |
| AI tools / Practice / MCQ session / Desktop | `314:14341` |

### Decisions taken during Phase 2

- **Search stays inline**, not a side panel. The phone search has no results list: the search header replaces the reader header and matches are highlighted in the page. Inventing a results list would be new UI. Layout page Presenter table updated.
- **Practice runs as a focused two-column session** on Expanded and Desktop: question on the left, the source passage on the right. Config sits in the side panel; Results is a centred single column.
- **Panel titles carry the page**, e.g. "Page summary · Page 42", because the pane header replaces the phone screen header that showed it.
- **Credits exhausted** copies the phone sheet's overrides exactly (used-up copy, error gauge, 50K / 50K).
- **Desktop** gets a keyboard hint under the action bar ("← → turn pages · ? keyboard shortcuts").
- Not drawn: hover states on the reader action bar (the bar is a phone component without interaction states; add when M7 web work starts).

## Audit before Phase 3

Every foundation and component page was checked by hand and by script. What changed, so code can follow:

### Variables

| Change | Detail |
|---|---|
| Removed 14 duplicates | `extra/*` and `Reading/EPUB-Web/*`; every use rebound to the canonical name first (`status/success-border`, `skeleton/from`, `sepia/swatch`, …) |
| Added `forest/400` | #4A7C59, was missing from the ramp |
| Code syntax fixed on ~39 variables | PROVISIONAL paths still to confirm in code: `white/*`, `black/55`, `overlay/focus-ring` |
| Added `border/focus-offset` (2), `border/focus-outer` (4) | keyboard focus ring geometry, `tokens.borderWidth.focusOffset/focusOuter` |
| New collection `Icon tone`, variable `icon/color` | modes Secondary (default), Primary, Muted, Subtle, Inverse, On disabled, Accent, Error. All 70 icons bind their strokes to it. A container sets the mode, like CSS `currentColor`. Code equivalent: `<Icon color={labelColor} />` |

### Rules now enforced in the file

- **Button icons follow the label.** Every Button variant sets the `Icon tone` mode that matches its label colour, so any icon swapped in recolours itself (Primary and Destructive: Inverse; Secondary: Primary; Tertiary: Accent; Disabled: Subtle or On disabled).
- **Loading uses Spinner.** Button Loading shows only the Spinner (Small, Medium on Large; Inverse on filled variants) and hides both icons whatever the props say. Loader icons replaced by Spinner in Book list item, Voice row, Processing screen. Add pill and Credit pack card spinners set to Inverse on filled backgrounds (they were invisible).
- **Keyboard focus ring** (web): 2px `color/border/accent` ring, 2px offset, drawn as a `focus ring` layer on all 26 Focus-visible variants (Button, Icon button, Category chip, List row, Rail item, Menu item). The old 25% halo failed contrast and did not render. Full-width rows use an inset ring so it is never clipped; the collapsed rail item rings the indicator pill. Code: `outline: 2px solid accent; outline-offset: 2px`.
- **Translucent colours restored** where binding had dropped the alpha: Translate word popover (close, divider, Save: `white/12`), Soft warning banner dismiss (`overlay/amber/fill`), progress tracks on forest in Mini player, Plan card and Top-up row (`white/15`).
- **Text never binds a bg token.** "Free" badge label now `forest/100`, Plan card upgrade label `forest/900`.

### Component changes

| Component | Change |
|---|---|
| Spinner | rebuilt to spec: 270° arc on a track, stroke bound to `component/spinner/stroke-width`, Tone Accent / Inverse |
| Avatar | `Kind=Image` shows an illustrated portrait |
| Mode toggle pill, Page layout toggle | bound to `reader/*`, so they follow Light, Sepia and Dark inside the reader header (was a light pill on the dark header) |
| Top-up row | variant property `Theme=Light/Dark` renamed `Surface=Default/On forest`. It was never dark mode; it is the panel on the forest free-plan card. Instances unaffected |
| Stat card | new `Show unit` boolean, off by default (value already carried "3h 12m", unit printed a second "h") |
| Empty state, Credit pack card, Sheet / Remove book, Panel / AI summary, Onboarding / Intent, Onboarding / First book, Sheet / Notification permission | hand-built CTAs replaced with Button instances. Full-width sheet CTAs are Large (52); the code's 48px buttons should move to 52 |
| Sheet / Remove book, Sheet / Notification permission | Cancel / Not now are now Tertiary buttons, matching Sheet / Confirm |
| Side rail (collapsed) | Logomark rescaled so its stroke scales with it |
| List row, Bottom sheet, Avatar, Status bar sets | variants re-gridded |
| Screens | hand-built CTAs replaced with Button on Sort & filter, Listen empty, Edit profile, Crash boundary |

### Decisions confirmed after the audit

- **New Button variant `Upsell`** (18 variants: 3 sizes × Default, Pressed, Disabled, Loading, Hover, Focus-visible). Amber fill for upgrade and purchase prompts only. New tokens: `amber/600` (primitive, pressed), `color/bg/upsell` → amber/500, `color/bg/upsell-pressed` → amber/600, `color/text/on-upsell` → forest/900, and Icon tone mode `On upsell`. Code: add `variant="upsell"` to Button.tsx. The Plan card (Free) "Upgrade to Standard" now uses it at Standard size (44, was a 40px custom button).
- **Sheet and full-width CTAs are 52 (Button Large).** Update the code's 48px sheet buttons to Large.
- **Tracks on forest use `white/15`**, matching the lower-opacity white in code.
- **Add pill, In library state** reads "Added" (fixed label, not driven by the Label property).
- **Wiring bug fixed:** every Hover and Focus-visible variant made in Phase 1 (Button, Icon button, Category chip, List row) had lost its Label / icon property links, so instances switched to those states showed "Button" and dropped icons. All relinked. Loading variants no longer react to the icon properties at all.

Still custom (not buttons in the system): Featured card "Add to library" pill, Notifications banner action, Translate popover Play / Save.

Not extended, by design: Input (its Focus state already exists), Toggle (inside a List row the row is the focus target), cards (hover and focus shown at screen level on web frames).

### After the audit (second pass)

- **Add pill** gained `Surface=Default / On forest`. On forest: amber fill, forest-900 label (Add, Adding), forest-100 fill (In library, "Added"). The Featured card now uses `Add pill, Surface=On forest` instead of its hand-built pill; its orphaned "Button label" property was removed.
- **Notifications denied banner** action is now `Button, Secondary, Compact`.
- **Translate word popover** Play and Save stay custom: they sit on the inverted ink surface and no Button variant is built for dark surfaces. Revisit if a second dark surface needs buttons.

## Phase 3: Library and Listen (16 frames)

Placed in the page sections (see "Page sections").

### New components (Components · Layout, group "Library")

| Component | Node | Notes |
|---|---|---|
| Book grid tile | `324:975` | State In progress / Not started / Finished / Processing. Title, Author, Cover label props. 2:3 cover with the cover token, Row progress, status line. Medium grid only |
| Library book pane | `325:993` | State Selected / Empty. Cover, title, author, file meta, Row progress, Continue reading (Primary) + Listen (Secondary), AI tools list rows, Highlights. Left hairline border |
| Panel / Sort & filter | `327:3255` (Organisms) | phone Sort & filter sheet without grabber or Apply; choices apply on tap |

### Library page (`152:2`)

| Frame | Node |
|---|---|
| Library / Populated / Medium | `327:1965` |
| Library / Populated / Expanded | `327:2443` |
| Library / Sort & filter / Popover / Expanded | `327:15469` |
| Library / Add book / Popover / Expanded | `327:15588` |
| Library / Book actions / Context menu / Expanded | `327:15717` |
| Library / Remove book / Modal / Expanded | `327:15953` |
| Library / Empty / Expanded | `327:16870` |
| Library / Populated / Desktop | `327:2837` |
| Library / Empty / Desktop | `327:16959` |
| Library / Upload / Drag over / Desktop | `327:17047` |

### Listen page (`169:2`)

| Frame | Node |
|---|---|
| Listen / Tab / Now playing / Medium | `329:1894` |
| Listen / Mini player / Over library / Medium | `329:3214` |
| Listen / Tab / Now playing / Expanded | `329:2188` |
| Listen / Voice / Popover / Expanded | `329:2927` |
| Listen / Tab / Empty / Expanded | `329:3299` |
| Listen / Tab / Now playing / Desktop | `329:2385` |

### Decisions taken during Phase 3

- **Medium library is a cover grid**: header, Reading stats + Continue card side by side, then 4 columns of Book grid tiles (153 wide at 820, gap `layout/column-gap`).
- **Expanded and Desktop library is master and detail**: 440 master (`layout/pane/master`) with header, stats, section header and Book list items; the selected row uses `color/bg/accent-muted`. The book pane fills the rest. Continue card is dropped there because the pane does the same job.
- **Popovers anchor to their trigger**: Sort & filter and Add book under the header icons, Voice picker beside the voice pill. Remove book is a centred Confirm modal over a scrim. Book actions is the Context menu at the row.
- **Upload drop zone is web and desktop only.** Expanded (touch) empty state keeps the phone Empty state; Desktop shows the drop zone, and dragging a file over a populated library covers the content area with `State=Drag over`.
- **Listen has no mini player on its own tab** (the full player is on screen). Expanded and Desktop use two columns: player and monthly stats left, Recently listened in a surface card right.
- **Mini player on Medium** sits as a full-width bar at the bottom of the content area, beside the rail.
- Sleep timer and Playback speed use the same popover pattern as Voice; not drawn.

## Phase 4: Discover, Book detail, You & Settings (18 frames)

Placed in the page sections. No new components; every frame is built from existing instances and cloned phone content.

### Discover page (`201:2`)

| Frame | Node |
|---|---|
| Discover / Home / Medium | `331:789` |
| Discover / Home / Expanded | `331:1092` |
| Discover / Home / Desktop | `331:1340` |

### Book detail page (`194:2`)

| Frame | Node |
|---|---|
| Book detail / Default / Medium | `331:2466` |
| Book detail / Default / Expanded | `331:2585` |
| Book detail / In library / Expanded | `331:2698` |
| Book detail / In library / Desktop | `331:2844` |

### You & Settings page (`210:2`)

| Frame | Node |
|---|---|
| You / Home / Medium | `331:22356` |
| You / Reading display / Medium | `331:22524` |
| You / Account & subscription / Expanded | `331:5055` |
| You / Settings / Expanded | `331:5473` |
| You / Reading display / Expanded | `331:5813` |
| You / Default voice / Expanded | `331:6143` |
| You / Notifications / Expanded | `331:6472` |
| You / Translation language / Expanded | `331:6793` |
| You / Sign out / Modal / Expanded | `331:22624` |
| You / Reading display / Desktop | `331:7115` |
| You / Delete account / Modal / Desktop | `331:22768` |

### Decisions taken during Phase 4

- **Discover keeps the phone order** (search, category chips, Featured, rails) with gutters bound to `layout/gutter/*`. The search bar caps at `layout/lane/width` (480) on Expanded and Desktop; the Featured card caps at 640. Rails show as many cards as fit (5 on Medium, 8 on Expanded, 9 on Desktop) and still scroll sideways.
- **Book detail is a page in the content area, not a sheet or panel**: cover column left (phone cover scaled), info column right capped at 680, then a "More like this" rail. The phone's bottom CTA bar becomes inline buttons under the meta row: Add to library (Primary Large) or Read now, Listen and Remove from library (Primary, Secondary, Tertiary).
- **You & Settings is master and detail on Expanded and Desktop**: the You home list is the 360 master with the open row on `color/bg/accent-muted`; the drill-in fills the detail column (560 wide, left hairline). The drill's back button is hidden there because the master stays visible. Medium stays single column, 600 wide and centred, and drill-ins push as full pages with their back button.
- **Sign out and Delete account** are Confirm modals (440) over a scrim, using Sheet / Confirm as content, with the phone sheet's copy and buttons.
- Not drawn: Discover search results, category list and the remaining four settings drill-ins (Default playback speed, Help & FAQ, Send feedback, Edit profile). They follow the same patterns.

## Phase 5: Auth, Monetisation, System states (17 frames)

### Component changes made during Phase 5

| Change | Detail |
|---|---|
| Progress bar `Value` property | Value 0 / 10 / 25 / 40 / 50 / 65 / 75 / 90 / 100 for every Kind (27 variants). The fill now scales with the bar (constraint Scale), so a stretched bar keeps its percentage. Figma can't resize a layer inside an instance, so this is the only way to show real progress. Existing instances default to 65 |
| Badge `Free`, `Tag`, `Tag compact` | label was not linked to the Label property, so every tag read "Fiction". Linked; the 26 instances that had other text were restored |
| Plan option `334:22767` | Molecules. State Default / Selected; Name, Price, Detail, Show badge |
| Paywall `336:1031` | Organisms. Selected = Yearly / Monthly / Student; Eyebrow, Headline, Subline props. Usage meters, Standard features, three Plan options, Upsell CTA that mirrors the plan, Maybe later, Restore purchases, fine print |

### Auth page (`145:61`)

| Frame | Node |
|---|---|
| Auth / Welcome / Medium | `334:423` |
| Auth / Sign in / Medium | `334:538` |
| Auth / Welcome / Expanded | `334:574` |
| Auth / Sign in / Expanded | `334:623` |
| Auth / Sign in / Check your email / Expanded | `334:658` |
| Auth / Onboarding / Intent / Expanded | `334:22602` |
| Auth / Onboarding / First book / Expanded | `334:22688` |
| Auth / Welcome / Desktop | `334:697` |
| Auth / Sign in / Desktop | `334:728` |

### Monetisation page (`219:2`)

| Frame | Node |
|---|---|
| Monetisation / Paywall / AI credits / Medium | `336:23259` |
| Monetisation / Paywall / AI credits / Expanded | `336:23387` |
| Monetisation / Buy credits / Modal / Expanded | `336:23513` |
| Monetisation / Paywall / AI credits / Desktop | `336:23624` |

### System states page (`225:2`)

| Frame | Node |
|---|---|
| System / Offline / Library / Expanded | `338:1112` |
| System / Loading / Library skeleton / Expanded | `338:1469` |
| System / Toast / Success / Desktop | `338:1860` |
| System / Error / Crash boundary / Desktop | `338:2192` |

### Decisions taken during Phase 5

- **Auth and onboarding sit in the 480 lane** (`layout/lane/width`), centred, no rail. Welcome on Expanded and Desktop splits the screen: a surface-coloured brand panel with the hero illustration and a one-line pitch on the left, the phone welcome content on the right.
- **Paywall is a Modal Large (640) on every class**, over whatever screen triggered it. On Expanded it is taller than the screen, so the modal is capped at screen height minus 48 and scrolls.
- **One paywall, four triggers.** Only the eyebrow, headline and subline change (copy from the MVP scope, Part 6). CTA label follows the selected plan ("Start with Yearly · $79").
- **Prices and caps need confirming.** The paywall uses the MVP scope prices ($9.99 / $79 / $4.99) and the app's live caps (60 min, 5 books, 50K credits). The live Plan card shows $6.99/mo and the scope doc says 90 min and 2 books, so one source is out of date.
- **RevenueCat build sheet**: `REVENUECAT_PAYWALL_BUILD_SHEET.md` maps every paywall layer to a RevenueCat Paywalls component, with per-trigger headers driven by custom variables, the usage block as a Custom component, and hex values.
- **Crash boundary** has no rail (the app shell failed) and sits in the lane. Toast centres over the content area, not the whole window.
- Not drawn: the remaining three paywall triggers (they are the same frame with different copy), Callback screens, Returning user restore.

## Phase 6: QA and coverage

### Checks run on all 77 tablet and desktop frames

| Check | Result |
|---|---|
| Frame size matches its class (820 × 1180, 1180 × 820, 1440 × 900) | 77 / 77 |
| Unbound (raw) colours outside instances | 0 |
| Instances with a missing main component | 0 |
| Layers placed outside their frame | 0 |
| Empty text layers | 0 |
| Text with no text style | 186 on tablet/desktop, 441 across all screen pages before the pass. 39 matched a style exactly and were linked. The rest come from the phone screens and use line heights and tracking taken from the React Native code (for example Geist Medium 11/15 with 0.8% tracking, 104 layers). They need a typography decision, not a blind relink: either add these as styles or move the code to the existing scale |

### Coverage

| Flow | Medium | Expanded | Desktop | Total |
|---|---|---|---|---|
| Auth | 2 | 5 | 2 | 9 |
| Library | 1 | 6 | 3 | 10 |
| Reader | 2 | 9 | 3 | 14 |
| AI tools | 1 | 9 | 2 | 12 |
| Listen | 2 | 3 | 1 | 6 |
| Book detail | 1 | 2 | 1 | 4 |
| Discover | 1 | 1 | 1 | 3 |
| You & Settings | 2 | 7 | 2 | 11 |
| Monetisation | 1 | 2 | 1 | 4 |
| System states | 0 | 2 | 2 | 4 |
| **All** | **13** | **46** | **18** | **77** |

Expanded carries most frames because it is where layouts change most (panels dock, master and detail appear). Medium and Desktop frames show the rules that differ there.

The Index page now has a "Tablet and desktop" section with this table and the list of Proposed items awaiting a decision.

## Decisions after Phase 6

### Pricing and caps follow the MVP scope

Free: 2 books, 90 minutes of audio, 50K AI credits a month. Standard: $9.99 a month or $79 a year. Student: $4.99 a month. Updated in the Plan card (Free meters now 18 / 90 min and 1 / 2 books, Pro renews at $9.99/mo) and in all three Paywall variants (Audio 18 / 90 min, Books 1 / 2). Every screen inherits these. **Code still uses 60 minutes, 5 books and $6.99**: update the usage limits, the store products and the RevenueCat offering. The build sheet copy now says 90 minutes and 2 of 2 books.

### Text moved onto the existing type scale

1,196 unstyled text layers across component and screen pages are now linked to a text style:

| Was | Now |
|---|---|
| Geist Regular 9, 10, 11 | Body/XS |
| Geist Regular 12 | Body/SM |
| Geist Regular 13, 13.5, 14 | Body/MD |
| Geist Regular 15, 16 | Body/LG |
| Geist Medium, all caps, 9 and 10 | Label/SM |
| Geist Medium, all caps, 11 and 12 | Label/MD |
| Geist Medium 13 to 14 | Heading/SM |
| Geist Medium 15 to 17 | Heading/MD |
| Geist Medium 18 | Heading/LG |
| Geist Medium 9 to 12, mixed case | Body/XS or Body/SM (**loses Medium weight**, 178 layers: tab labels, meta lines, small buttons) |
| Fraunces SemiBold 20 to 24 | Display/SM |
| Fraunces SemiBold 26 to 30 | Display/MD |
| Fraunces SemiBold 56 | Display/XL |
| Literata 20 / 22, Lexend 20 | Reading/Standard, Reading/Comfortable, Reading/Font/Lexend |

Ties round up (13 goes to 14) so nothing gets smaller for low-vision readers.

Left unstyled on purpose (143 layers):
- **Fraunces SemiBold 11 to 19** (book titles in rows and cards, sheet titles): there is no serif style below Display/SM 22, and mapping a 13px title to 22px breaks every row. Needs a serif "Title" style or two if these should be on the scale.
- **Fraunces 5 to 10**: titles printed on miniature book covers. They are artwork.
- **Literata at scaled sizes** (13, 14.7, 16, 17.7, 18): text inside rescaled PDF pages and covers.
- **SF Pro**: the iOS native alert. System chrome.
- 6 layers with mixed fonts in one text box.

Code follows the same map: replace the raw `fontSize` / `lineHeight` / `letterSpacing` values in components with `tokens.typography.*`.

### Book pane

The Library book pane stays Proposed until reviewed. Frames: Library / Populated / Expanded (`327:2443`), Library / Populated / Desktop (`327:2837`); component `325:993`.

## Illustration collection (redrawn)

Direction chosen from a reference: chunky outlined objects with a solid offset depth, flat fills, sparkles, motion ticks and a loop squiggle, recoloured to Bookflow (forest where the reference uses blue, amber where it uses peach). This replaces the thin-line set in `bookflow_illustrations_complete.html`.

17 components on Components · Atoms, group Illustration. All colours bound to primitives (forest/900, forest/600, forest/400, forest/100, cream/50, amber/200, amber/500). Spec and overview: the **Illustrations** page (after Brand).

| Component | Node | Used in |
|---|---|---|
| Welcome hero (280 × 240) | `145:60` | Welcome, Auth brand panel |
| Check email (96) | `316:14675` | Check your email |
| Link expired (80) | `316:14685` | Link expired |
| Empty library | `350:142` | Empty state (Library empty, phone and tablet), Library book pane Empty, Library / Empty / Desktop, Discover / Category / Empty |
| Empty listen | `350:200` | Listen / Tab / Empty (phone, Expanded) |
| No results | `350:253` | Library / Search / No results, Discover / Search / No matches |
| No highlights | `351:74` | ready for the Highlights empty state |
| Processing | `351:125` | ready (Processing screen keeps its live ring) |
| Upload failed | `351:175` | Processing screen, State=Failed (replaces the red ring) |
| Scanned PDF | `351:220` | Library / Upload / Scanned PDF error |
| Offline | `351:269` | Discover / Home / Error (catalog unreachable) |
| Something went wrong | `351:318` | Crash boundary (phone, Desktop), Sheet / Buy credits, State=Unavailable |
| Ask the book | `352:74` | ready for the AI chat empty state |
| Practice | `352:125` | ready |
| Translate | `352:178` | ready |
| Out of credits | `352:228` | ready |
| Notifications | `352:277` | Sheet / Notification permission |

Rules: 200 × 200 canvas (hero 320 × 240), 24px margin; outline forest-900 3px at 200; depth = solid forest-900 copy offset 5 to 8px down-right; one amber area per scene; 2 or 3 sparkles, one set of motion ticks, at most one squiggle. Place at 120 to 160 in screens, never below 80; scale instances with Scale (K) so the outline thins with them.

Code: export each component as SVG from Figma (or from the source files) into `assets/illustrations/` and render with `react-native-svg`. Colours are literal hex in the SVG; if illustrations ever need theming, swap them for `currentColor` and props.

## Copy pass: em dashes removed

Every em dash in the file is gone, without rewording. App copy was fixed line by line (110 text layers in total, plus 81 component, 3 variable and 9 style descriptions):

| Screen or component | Now reads |
|---|---|
| Slow network banner | Loading is taking longer than usual. Check your connection. |
| Processing screen | You can leave this screen. We’ll notify you when it’s ready. |
| Processing screen, Failed | …is ready to read. Only the narration failed. |
| Playback speed sheet | Half speed. Useful for… / Fast pace. Best for… |
| Playback speed sheet | Natural narration speed, exactly how… |
| Playback speed sheet | Demanding to follow. Use for skimming… |
| Onboarding / Intent | Reading is hard for me. I want it to be easier. |
| Onboarding / Intent | …come with me: commute, walks, gym. |
| Onboarding / Intent | Not sure yet. Show me around. |
| Notification permission sheet | We only send what you allow: daily reminder… |
| Welcome | Read, listen, summarize, and ask. For any book… |
| Sign in | Enter the email you used to sign up. We'll send you a magic link. |
| Scanned PDF error | …scanned pages: photos of text… |
| Scanned PDF error | Convert online: / Browse our free library: |
| Scanned PDF error | Find the EPUB: search for “…”. Publishers… |
| Send feedback | Help us make Bookflow better: bug reports… |
| Offline AI chat | You’re offline · Q&A unavailable |

Sample AI answers in the chat and practice frames use a comma or colon in place of the dash. Page names now use a middle dot: `Components · Atoms`, `Color · Primitives`, and so on. **Code should get the same copy changes** (search the repo for the em dash character, U+2014).

## Auth welcome, Expanded and Desktop (revised)

The brand panel (now 459 wide on Expanded, 552 on Desktop) carries the pitch and the illustration, so the right side no longer repeats it.

- **Logo** moved into the brand panel, pinned top-left (40 / 32 on Expanded, 48 / 40 on Desktop).
- **Right side** is a single 360-wide column, centred: "Welcome to Bookflow" (Display/MD), one line on how sign-in works (Body/MD, secondary), then Get started (Primary Large) and I already have an account (Secondary Large, was a text link). Same width buttons, stacked.
- **Terms line** pinned to the bottom of the right side, centred.
- New copy on this screen only: "Welcome to Bookflow" and "Start free with your email. We’ll send you a magic link, so there’s no password to remember." The phone welcome keeps its original headline.

Frames: Auth / Welcome / Expanded `334:574`, Auth / Welcome / Desktop `334:697`.


## Page sections

Every flow page (Auth, Library, Reader, AI tools, Listen, Book detail, Discover, You & Settings, Monetisation, System states) is split into Figma sections, stacked top to bottom:

| Section | Frame size |
|---|---|
| Mobile · 393 × 852 | phone frames, plus annotations and notes |
| Tablet portrait · 820 × 1180 | `/ Medium` frames |
| Tablet landscape · 1180 × 820 | `/ Expanded` frames |
| Desktop · 1440 × 900 | `/ Desktop` frames |

System states has no tablet portrait frames, so it has no tablet portrait section.

## Minimal sheets, menus and the tablet hero

| Change | Node | Notes |
|---|---|---|
| Sheet / Remove book | `136:17` | Header icon, "This can't be undone.", the book card and the long warning are gone. Now: title (text property `Title`, default "Remove Pride and Prejudice?"), one line "This deletes the file and your reading progress.", Destructive Large "Remove book", Tertiary "Cancel". Flows into the phone sheets, the Book detail sheet and every `Modal / Size=Confirm` that shows it. |
| Sheet / Book actions (new) | `360:3010` | Replaces the hand-built sheet in `Library / Book actions / Sheet`. Book title only (no cover, no author), then List rows with no sublabels and no icon tiles: View highlights, Re-process chapters, Offline download (Disabled, hint "Soon"), divider, Remove from library (error text, icon tone Error). Bottom padding 34 for the home indicator. |
| Context menu / Book actions | `298:467` | Header and its Title/Author properties removed (the row already shows the book). Menu items have Show sub off. Same order as the sheet. |
| Library hero (Medium) (new) | `361:2` | Tablet portrait only. One surface card: Continue reading (cover 100 × 150, title, author, progress, Listen and Read) on the left, a divider, then reading stats (24m today, 1h 48m this week, week dots, 4 day streak) in a 176 column. Replaces the two mismatched cards in `Library / Populated / Medium` and `Listen / Mini player / Over library / Medium`. Text properties: Title, Author, Status, Headline, Subline, Streak. |
| Panel / Sort & filter | `327:3255` | Padding top 4 → 20, bottom 8 → 12, so the header and the last option no longer touch the popover edges. |

New frames:

| Frame | Node |
|---|---|
| Library / Book actions / Context menu / Desktop | `360:6616` |
| Library / Remove book / Modal / Desktop | `360:6963` |
| Library / Sort & filter / Popover / Desktop | `361:8276` |
| Library / Sort & filter / Popover / Medium | `361:8159` (Arrow=None, right aligned to the 24 gutter, since the filter button sits too close to the edge for the arrow) |
| Library / Book actions / Context menu / Medium | `361:8400` (opens from a long press on a grid tile) |
| Library / Remove book / Modal / Medium | `361:8641` |

## Complete flows: Auth and Library

Every mobile screen on these two pages now has a tablet portrait, tablet landscape and desktop version, except where noted. Frames in each section are ordered by flow.

### Auth

| Screen | Medium | Expanded | Desktop |
|---|---|---|---|
| Splash | new | new | skipped: the web app has no launch screen |
| Welcome | existing | existing | existing |
| Sign up | new | new | new |
| Sign in | existing | existing | existing |
| Check your email | new | existing | new |
| Callback / Verifying | new | new | new |
| Callback / Link expired | new | new | new |
| Onboarding / Intent | new | existing | new |
| Onboarding / First book | new | existing | new |
| Returning user / Session restore | new | new | skipped: on the web the session check happens while the page loads |

Built from the Sign in frames: same status bar, home indicator and 480 lane, with the mobile content placed in the lane and the flexible spacers turned into fixed gaps.

Fixes found on the way:
- The back button on every Check your email frame, mobile included, had lost its arrow icon. Restored.
- Onboarding / First book wrapped to three covers plus one on wide screens. The grid gap in the wide instances is now 10, so the four covers sit in one row.

### Library

| Screen | Medium | Expanded | Desktop |
|---|---|---|---|
| Empty | new | existing | existing |
| Loading / Skeleton | new | new | new |
| Populated | existing | existing | existing |
| Populated / Processing | covered by Populated (a processing book is already in the grid and list) | same | same |
| Populated / Failed upload | new | new | new |
| Populated / Offline | new | new | new |
| Add book | new popover (Arrow None, right aligned) | existing popover | new popover |
| Upload / Drag over | not needed on touch | not needed on touch | existing |
| Upload / Uploading | new dialog | new dialog | new dialog |
| Upload / Failed (audio) | new dialog | new dialog | new dialog |
| Upload / Scanned PDF error | new dialog | new dialog | new dialog |
| Search / Pre-search, Results, No results | new, full width | new, in the master pane | new, in the master pane |
| Sort & filter, Book actions, Remove book | existing | existing | existing |

Decisions:
- Upload progress and upload errors open as a 480 dialog over the dimmed library on tablet and desktop instead of a full screen. The dialog holds the same Processing screen instance as mobile. The scanned PDF dialog uses a close (X) icon instead of back.
- Search on Expanded and Desktop replaces the master pane content (search bar, recents or results, Discover nudge). The book pane stays on the selected book.
- Offline adds the Offline banner at the top of the content (Medium) or the master pane (Expanded, Desktop) and switches Library header to State=Offline.
- Skeletons use `color/bg/surface` blocks. On desktop the side rail hides the mini player while loading.
- Book grid tile `324:975` has a new State=Failed: white scrim, error AlertCircle, status "Upload failed · tap to remove" in error red.

## Complete flows: Reader and AI tools

Every mobile screen on these pages now has a tablet portrait, tablet landscape and desktop version. Frames in each section are ordered by flow.

### Reader (11 Medium, 12 Expanded, 12 Desktop)

| Screen | Medium | Expanded | Desktop |
|---|---|---|---|
| Text / Default | existing | existing | existing |
| Text / Sepia, Text / Dark | new | new | new |
| Text / Chrome hidden | new | existing | new |
| Reading options | new popover | existing popover | new popover |
| Search / Results | new | existing | new |
| Highlights | existing slide-over | existing panel | new panel |
| Chapters | new slide-over | existing panel | existing panel |
| Full / PDF | new (single page, scaled to fit the portrait width) | existing single and spread | new single, existing spread |
| Full / EPUB | new | existing | new |
| Reading options / Full mode | new popover | new popover | new popover |

- Theme frames set the reader variable mode on the frame (Light 98:1, Sepia 98:2, Dark 98:3) and Theme on Reader header, Reader page and Reader action bar. Dark also switches the status bar and home indicator to Content=Light.
- Reading options on Medium sits right aligned to the 32 gutter with Arrow=None, because the anchored position would run off the screen.
- Full mode reading options uses the Popover with `Sheet / Reading options (Full mode)` as its content.

### AI tools (10 per size)

| Screen | Medium | Expanded | Desktop |
|---|---|---|---|
| Tools list | new slide-over | existing panel | new panel |
| Summary | existing slide-over | existing panel | existing panel |
| Chat | new slide-over | existing panel | new panel |
| Practice / Config | new slide-over | existing panel | new panel |
| Practice / MCQ session | new, stacked | existing | existing |
| Practice / Short answer | new, stacked | new | new |
| Practice / Results | new | existing | new |
| Translate / Word popover | new | existing | new |
| Translate / Page | new slide-over | existing panel | new panel |
| Credits exhausted | new slide-over | existing panel | new panel |

- Panel frames copy the Expanded Side panel instance (with its overrides, e.g. the credits exhausted state) and set Mode to Slide-over on Medium or Docked on Desktop.
- On tablet portrait the practice session stacks the question above the source passage, since the two columns do not fit in 820.

## Reader action bar label

`Reader action bar` (`130:368`): "Reading options" became "Display" in all three themes, so every label fits on one line. All five labels are set to one line with truncation. The popover and sheet titles still say "Reading options".

## Complete flows: Listen, Book detail, Discover, You & Settings

Every mobile screen on these pages now has a tablet portrait, tablet landscape and desktop version. Frames in each section are ordered by flow.

### Listen (10 per size)

| Screen | Medium | Expanded | Desktop |
|---|---|---|---|
| Tab / Empty | new | existing | new |
| Tab / Resume last session | new | new | new |
| Tab / Now playing | existing | existing | existing |
| Foreground / Playing, Paused | new | new | new |
| Voice | new popover | existing popover | new popover |
| Sleep timer, Speed | new popovers | new popovers | new popovers |
| Mini player over library | existing | new (bar along the bottom of the content) | new (mini player in the side rail) |
| History / Recently listened | new | new | new |

- Fixed: the "Listen" page title wrapped to two lines ("Lis / ten") on every wide Listen frame.
- Foreground: phone header, Bimodal text at 680 and Listen player bar at 680, centred.
- Sleep timer and Speed open as arrowless popovers centred above the player bar.

### Book detail (5 per size)

Default, Adding (primary button State=Loading at the default button width), In library, Remove book modal, Already removed.
- Tablet portrait In library: the three actions wrap so "Remove from library" drops to a second line.
- Already removed uses the iOS alert on tablets and a small web dialog (title, line, OK) on desktop.

### Discover (8 Medium, 8 Expanded, 7 Desktop)

Loading, Refreshing (tablets only, since pull to refresh does not exist on the web), Error, Slow network, Search results, No matches, Category list, Category empty.
- Search results and category lists are a two-column grid on wide screens.
- The No matches request form is capped at 640 wide.
- The mobile Refreshing frame had no visible refresh state. It now has a small Spinner at the top of the scroll, as do the tablet versions.

### You & Settings (15 Medium, 14 Expanded, 14 Desktop)

- Tablet portrait is a single pane: You home, then each settings page full width with the Sub header back button.
- Tablet landscape and desktop are master and detail: the You home column on the left, and the page on the right. The matching master row carries the selected fill (Settings also covers Notifications denied and Default playback speed; Edit profile has no row).
- The free You home is the master on every landscape and desktop frame, so "Home / Pro plan" swaps only the plan card.
- Sign out and Delete account open as modals.

## Playback speed popover and wide featured card

- New `Panel / Playback speed (compact)` (`372:448`) in Organisms: title plus one line per speed (speed, then its name in muted text), selected row tinted accent-muted with a Check. Used as the Popover content in `Listen / Speed / Popover` on Medium, Expanded and Desktop. The phone sheet `Sheet / Playback speed` keeps its descriptions.
- `Featured card` (`200:486`) now has a Size property: Compact (the phone card) and Wide (`372:51539`, `372:51554`). Wide fills the row: inset cover 120 × 180 with a soft shadow, Fraunces 28 title, author, blurb capped at 520, Add pill, and a sparkle and squiggle decoration on the right in amber and forest. Every tablet and desktop Discover home uses Wide.

## Complete flows: Monetisation and System states

### Monetisation (10 per size)

Paywall (existing), Buy credits in Audio time, AI credits, Loading, Unavailable and Purchasing states (Large modal over Account & subscription; Purchasing sets the Buy button to Loading), Top-up balance (You detail page), Soft warning banner (under the Library header), Upgrade coming soon and No purchases found (iOS alert on tablets, web dialog on desktop). The hosted paywall placeholder is covered by the Paywall frames.

### System states (10 per size)

Library skeleton, Reader skeleton (680 lane), Offline library, Offline AI chat, Toast, Slow network Discover, Notification permission (the sheet in a 440 dialog), Generic alert (iOS alert on tablets, web dialog on desktop), AI chat scope banner, Crash boundary. The page now has a Tablet portrait section.

- New `Panel / AI chat (Offline)` (`372:51744`) and `Panel / AI chat (Scope banner)` (`372:51783`) put the Chat status bar inside the chat panel, so the docked and slide-over panels can show it.
- Fixed: the offline Chat status bar on mobile said "Answers come only from Pride and Prejudice…". It now reads "You’re offline. Chat needs an internet connection."

## Featured card: Reading nook (replaces the sparkle Wide card)

Three concepts were drawn on Components · Organisms in "Featured card · wide concepts" (A Arch stage, B Reading nook, C Sunburst split). B was chosen.

- `Featured card` now has Size = Compact (phone), Medium (tablet portrait, 684 × 268, `375:30` / `375:111`) and Wide (tablet landscape and desktop, 268 tall, `372:51539` / `372:51554`).
- Wide: text block on the left (48 padding), and on the right a 440 × 268 illustration anchored to the right edge. It shows a stack of three books (amber, cream, forest) on a forest-600 circle, a tea mug with steam, sparkles and a squiggle, all in the illustration style (forest-900 3px outline, solid offset depth). The real cover frame stands on the stack, tilted 6°, with a 3px outline and an offset shadow.
- Medium: same illustration without the left sparkle and squiggle, scaled to 0.86 and anchored bottom right. The text area keeps 300 of right padding.
- Applied to every tablet and desktop Discover home and to the System slow network frames.

## QA pass after the full-flow work

Checked across every frame on the ten flow pages:

| Check | Result |
|---|---|
| Em dashes in visible text | 0 |
| Text sticking out of its screen or its auto-layout parent | 0 |
| Short labels wrapping to a second line (the "Lis / ten" kind) | 0. The only multi-line short texts are book titles on covers and tiles, which wrap by design. |
| Solid fills not bound to a variable (outside illustrations, covers and instances) | 0 |
| Pop-overs, dialogs, toasts and modals running outside their screen | 0 |
| Frames missing a size suffix | 0 (only the two mobile annotation notes) |
| Unstyled text | only SF Pro (iOS alerts, intentional) and 3 Lexend samples (the dyslexia font option in Reading options) |

Screen counts per page (Mobile / Tablet portrait / Tablet landscape / Desktop):

| Page | Counts | Intentional gaps |
|---|---|---|
| Auth | 11 / 10 / 10 / 8 | Desktop has no Splash or Session restore |
| Library | 18 / 15 / 15 / 16 | Processing is covered by Populated; Drag over is desktop only; Add book standalone is phone only |
| Reader | 11 / 11 / 12 / 12 | PDF spread is landscape and desktop only |
| AI tools | 10 / 10 / 10 / 10 | none |
| Listen | 10 / 10 / 10 / 10 | none |
| Book detail | 5 / 5 / 5 / 5 | none |
| Discover | 9 / 9 / 9 / 8 | Desktop has no pull to refresh |
| You & Settings | 15 / 15 / 14 / 14 | Landscape and desktop show the free You home as the left column on every frame |
| Monetisation | 11 / 10 / 10 / 10 | Hosted paywall placeholder is covered by the Paywall frames |
| System states | 11 / 10 / 10 / 10 | none |


## Phase 6 (re-run): QA and coverage on the complete flows

The first Phase 6 covered 77 tablet and desktop frames. This re-run covers all 313.

| Check | Result |
|---|---|
| Frame size matches its class | 313 / 313 |
| Instances with a missing main component | 0 |
| Empty visible text layers | 0 |
| Unbound solid colours outside illustrations, covers and instances | 0 |
| Em dashes | 0 |
| Text outside its screen or its auto-layout parent | 0 |
| Overlays (pop-overs, dialogs, modals, toasts) outside their screen | 0 |
| Text with no text style (outside instances) | 66, all intentional: Fraunces cover lettering and cover-size titles (left unstyled since the type pass), the simulated PDF pages (Literata scaled with the page) and the EPUB web view (publisher typography at 27.2) |

| Flow | Medium | Expanded | Desktop | Total |
|---|---|---|---|---|
| Auth | 10 | 10 | 8 | 28 |
| Library | 15 | 15 | 16 | 46 |
| Reader | 11 | 12 | 12 | 35 |
| AI tools | 10 | 10 | 10 | 30 |
| Listen | 10 | 10 | 10 | 30 |
| Book detail | 5 | 5 | 5 | 15 |
| Discover | 9 | 9 | 8 | 26 |
| You & Settings | 15 | 14 | 14 | 43 |
| Monetisation | 10 | 10 | 10 | 30 |
| System states | 10 | 10 | 10 | 30 |
| **All** | **105** | **105** | **103** | **313** |

The Index page's "Tablet and desktop" section now shows this table and explains the section layout. The "Proposed, awaiting your decision" list is unchanged: Library book pane, Book grid tile, Paywall and Plan option, Upload drop zone and Keyboard shortcuts.

## Decision: the four proposed patterns are approved

Kept as designed: Library book pane, Book grid tile, Paywall with Plan option, and Upload drop zone with Keyboard shortcuts.

- "(Proposed)" removed from the component names, their descriptions and their 169 instance layer names. Component names in this log are updated to match.
- On Components · Layout, the "Proposed" tags on Upload drop zone and Keyboard shortcuts now read "Web and desktop", and the page note explains that tag.
- On the Index page, "Proposed, awaiting your decision" is now "Approved new patterns".
- Claude Code should build them as normal components: `LibraryBookPane`, `BookGridTile`, `Paywall` and `PlanOption` (web, and the source for the RevenueCat paywall), `UploadDropZone` and `KeyboardShortcuts` (web and desktop only).

## Prototype flows

Figma only links frames on the same page, so each flow page carries its own journeys, with one named flow starting point per size ("Library · Tablet landscape" and so on). Transitions are a 200 to 250 ms dissolve. Every link stays inside its own size.

| Page | Start | What is wired |
|---|---|---|
| Auth | Splash (Welcome on desktop) | Splash, Check your email and Verifying advance on a timer; Welcome to Sign up or Sign in; Send magic link to Check your email; Sign up and Sign in footers swap; Intent Continue or Skip to First book; Link expired back to Sign in; back buttons |
| Library | Populated | Header search, filter and add buttons; second book opens Book actions; Remove from library to the remove sheet or modal, Cancel and Remove book back; Upload a file to Uploading, Continue in background back; recent search "pride" to Results; search back arrow; tapping outside a sheet, pop-over or menu closes it |
| Reader | Text default | Action bar Search, Highlights and Display; Text and Full switch; book title opens Chapters; tapping the page hides the chrome and tapping again brings it back; search Cancel; panel close buttons and scrims; Full mode Display opens the full-mode note; back buttons on mobile |
| AI tools | Tools list | Each tool opens its screen; Practice runs Config, MCQ, Short answer, Results and back to the list; close buttons return to the list |
| Listen | Now playing | First recent row and the resume card open the playing view; See all opens History; play and pause toggle; speed and sleep chips open their sheet or pop-over, the voice chip opens Voice; tapping outside closes |
| Book detail | Default | Add to library, Adding (timer), In library; Remove opens the sheet or modal; Cancel and Remove book; Already removed OK |
| Discover | Home | Search field to Results, clear back; See all and a category chip to Category list, back to Home |
| You & Settings | You home (Reading display on landscape and desktop) | Every settings row opens its page on every master; profile opens Edit profile; Settings to Default playback speed; Account to Delete account; Sign out; Cancel and scrims close; Sub header back on mobile and tablet portrait |
| Monetisation | Buy credits, Audio time | Audio time and AI credits tabs; Buy to Purchasing, then a timer to Top-up balance |

System states are stand-alone states and are not linked.

## Phase 7: Hover and focus states for web and desktop

An audit of every component used on the 313 tablet and desktop frames found eight clickable components with no hover or keyboard focus state. List row, Button, Category chip, Menu item, Icon button and Input already had them.

The same treatment as List row is used everywhere: **Hover** tints the row with `color/bg/surface` (rows), or lifts the cover with `Elevation/2` (cards). **Focus-visible** adds a "focus ring" rectangle: a 2px `color/border/accent` stroke, inset 2 with radius 8 on rows, outset 4 with radius 12 on cards. Existing variants were renamed with `Interaction=Default`, so every instance on the screens is unchanged.

| Component | Node | New property | Variants |
|---|---|---|---|
| Book list item | `130:156` | Interaction: Default, Hover, Focus-visible | 18 |
| Recent listen row | `174:460` | Interaction | 18 |
| Radio row | `211:554` | Interaction | 9 |
| Book grid tile | `324:975` | Interaction (cover lift on hover, outset ring) | 15 |
| Rail card | `199:494` | Interaction (cover lift, outset ring) | 6 |
| Short card | `390:1020` (was a single component) | Interaction (cover lift, outset ring) | 3 |
| Discover book row | `390:1032` (was a single component) | Interaction | 3 |
| Reader action (new) | `390:8888` | Kind: Default, Primary × Interaction: Default, Hover, Focus-visible; text property Label, swap property Icon | 6 |

- **Reader action bar** (`130:368`) now uses Reader action instances in all three themes instead of plain frames. Hover darkens the chip (`reader/border`) and the label (`reader/text`). Primary (Listen) hover lowers the chip to 88% opacity. Icon strokes are bound to `reader/text` and `reader/primary-icon`, so the icons follow Light, Sepia and Dark.
- Fixed on the way: the compact Recent listen row variants had never been linked to the Title, Meta and Initials properties. All 27 text layers are now linked.
- The hovered row on `Library / Book actions / Context menu / Expanded` and `/ Desktop` now uses `Interaction=Hover`, not a hand-painted fill.

For code: map Hover to `Pressable` hover (web) and Focus-visible to `:focus-visible` / keyboard focus. Touch builds ignore both.

## Phase 8: Developer handoff brief

`RESPONSIVE_HANDOFF_BRIEF.md` (project: `docs/specs/responsive_handoff_brief.md`) is the single implementation brief for Claude Code. It covers size classes and tokens, the app shell per class, the container mapping (sheet, popover, side panel, modal), layout rules per flow, new and changed components with node ids, hover and focus, product and copy changes, intentional gaps, build order and acceptance checks.

Found while checking the brief against the file:
- `layout/pane/master` is 440, not 360, and all 57 master columns are bound to it. The variable description said 360; it now says 440. The book actions context menus on Expanded and Desktop were re-anchored to the wider row.
- The three page dividers used em dash characters as their lines. They now use box-drawing lines ("─── FOUNDATIONS ───").

## Progress ring percentage

`Progress ring` (`123:57`) now shows the percentage in the centre: Fraunces SemiBold 24/28 in `color/text/primary` (Determinate) or `color/text/error` (Failed). New properties: `Value` (text, default "59%") and `Show value` (boolean, default on). Indeterminate has no number. The Determinate arc now matches 59%. It appears on every Uploading screen through the Processing screen, on mobile, tablet and desktop. In code, round to whole percent and update the arc and the label from the same value.
