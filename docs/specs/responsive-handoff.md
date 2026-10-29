# Bookflow tablet and desktop: implementation brief

For Claude Code. This brief is the single source for building the responsive layouts. `RESPONSIVE_BUILD_LOG.md` keeps the full history and node tables if you need more detail.

| | |
|---|---|
| Figma file | `Rt3gjNC24kBTrncxlnkuPW` |
| Screens | 10 flow pages. Each has four sections: Mobile, Tablet portrait, Tablet landscape, Desktop |
| Frame naming | `Flow / Screen / State / Medium\|Expanded\|Desktop` (phone frames have no suffix) |
| Prototype | Each flow page has one flow per size, e.g. "Library · Tablet landscape" |
| Related briefs | `docs/specs/PDF_PAGE_STRUCTURE_BRIEF.md` (PDF text mode), `REVENUECAT_PAYWALL_BUILD_SHEET.md` (paywall) |

## 1. Size classes

Use the width of the window, not the device type. All values live in the Figma `Layout` variable collection and should become `tokens.layout.*` in code.

| Class | Width | Frame used in Figma | Gutter |
|---|---|---|---|
| Compact (phone) | under 600 | 393 × 852 | 16 |
| Medium (tablet portrait) | 600 to 1023 | 820 × 1180 | 32 |
| Expanded (tablet landscape) | 1024 to 1279 | 1180 × 820 | 32 |
| Desktop | 1280 and up | 1440 × 900 | 40 |

Width decides the layout. Platform decides web-only traits: no status bar, no splash, no pull to refresh, hover and focus all key off `Platform.OS === 'web'`, not the width class. An iPad Pro at 1366 gets the Desktop layout (240 rail) and keeps its status bar.

Orientation: phones stay portrait-locked. Tablets and web rotate freely. Remove the global `"orientation": "portrait"` from `app.json` and lock phones to portrait at runtime (for example `expo-screen-orientation`, locking only when the device is a phone), otherwise phones start rotating.

| Token | Value |
|---|---|
| `layout/rail/collapsed` · `layout/rail/expanded` | 72 · 240 |
| `layout/pane/master` | 440 (Library and You & Settings master column) |
| `layout/panel/side` | 380 |
| `layout/popover/width` | 340 |
| `layout/modal/alert` · `layout/modal/confirm` · `layout/modal/large` | 400 · 440 · 640 (alert is the desktop web dialog) |
| `layout/lane/width` | 480 (auth, onboarding, crash) |
| `layout/reading/measure` | 680 (reader text, PDF and player columns) |
| `layout/content/max` | 1280 |
| `layout/column-gap` | 24 |
| `layout/gutter/compact` · `medium` · `expanded` · `desktop` | 16 · 32 · 32 · 40 |

## 2. App shell

| | Compact | Medium | Expanded | Desktop |
|---|---|---|---|---|
| Primary nav | Tab bar | Side rail, collapsed (72) | Side rail, collapsed (72) | Side rail, expanded (240) with the Bookflow lockup |
| Mini player | Bar above the tab bar | Bar along the bottom of the content | Bar along the bottom of the content | Card at the foot of the rail |
| Status bar and home indicator | Phone | Tablet variants | Tablet variants | None (web) |
| Reader | No nav | No rail at any size | No rail | No rail |

Component: `Side rail` (`295:493`, Size Collapsed / Expanded, Active Library / Discover / Listen / You).

## 3. Containers: one content, four presentations

Every phone sheet is a component that the larger containers take through a Content swap. Build the content once and present it per size class.

| Phone | Medium | Expanded and Desktop |
|---|---|---|
| Bottom sheet (menu, options, picker) | `Popover` anchored to its trigger. If the pop-over placed with its arrow on the trigger would cross the window gutter, use Arrow=None and align to the gutter | `Popover` anchored, with an arrow |
| Bottom sheet (reader tools, AI tools, highlights, chapters) | `Side panel` Mode=Slide-over over a scrim, 380 wide, from the right | `Side panel` Mode=Docked, 380, pushes the reading area |
| Confirm sheet (remove book, sign out, delete account) | `Modal` Size=Confirm (440) over a scrim | same |
| Full-screen task (upload progress, upload errors, buy credits) | Centred 480 dialog or `Modal` Size=Large (640) over the dimmed screen | same |
| Row long-press menu | `Context menu / Book actions` anchored to the tile | same, opened by the more button or right click |
| iOS alert | iOS alert | iOS alert on tablets. Desktop uses a 400 web dialog: title, one line, primary OK |

Containers: `Popover` `296:434`, `Side panel` `296:407`, `Modal` `296:443`, `Pane header` `296:386`.

Not every row above is a container swap in the current code. Highlights and the upload progress and error screens are full-screen early returns, and Chapters is a Listen sheet. These have to be refactored into panel or dialog content in their flow milestone before they can be presented this way.

## 4. Layout per flow

**Auth.** Centred 480 lane on every size. Welcome on Expanded and Desktop is a split: a brand panel on the left with the lockup at top left, and the lane on the right, which holds only the heading, one line, two buttons and the terms at the bottom. Desktop has no Splash or Session restore (the web loads straight in). On wide screens First book shows four covers in one row (grid gap 10).

**Library.**
- Medium: `Library hero (Medium)` (`361:2`), Continue reading and stats on one card, then a 4-column `Book grid tile` grid. A tile opens the reader, and a long press opens the book actions menu.
- Expanded and Desktop: a 440 master list (`Book list item`) plus `Library book pane` (`325:993`). Selecting a row fills the pane, and the Empty state uses the Empty library illustration.
- Search replaces the master content (or the full width on Medium). The book pane keeps the selected book.
- The offline banner sits at the top of the content (Medium) or the master (Expanded, Desktop), and `Library header` switches to State=Offline.
- Upload drag and drop is desktop only (`Upload drop zone` `298:573`).

**Reader.**
- The page column is capped at 680 and centred.
- Search stays inline: the search header replaces the reader header, and matches highlight in the page.
- Full mode PDF: single page on Medium (scaled to fit the width); single and spread toggle on Expanded and Desktop (`Page layout toggle` `311:13116`).
- Reader themes come from the `Reader/Theme` variable modes (Light, Sepia, Dark).
- The action bar uses `Reader action` (`390:8888`). Labels are Listen, AI tools, Search, Highlights, Display, each on one line.

**AI tools.** Medium uses a slide-over panel and Expanded and Desktop a docked panel, for the tools list, summary, chat, practice setup, translate page and out of credits. A practice session takes over the screen: on Medium the question sits above the source passage; on Expanded and Desktop they are two columns. Offline and scope banners live inside the chat panel (`Panel / AI chat (Offline)` `372:51744`, `(Scope banner)` `372:51783`).

**Listen.** The Now playing tab: Medium is one column; Expanded and Desktop put the player and stats on the left and Recently listened on the right. Foreground playing uses the bimodal text and the player bar, both at 680 and centred. Voice, sleep timer and speed open as popovers. Speed uses `Panel / Playback speed (compact)` (`372:448`): one line per speed, with no descriptions.

**Book detail.** The cover column sits on the left and the info on the right on every wide size. On Medium the In library actions wrap, so Remove from library drops to a second line. Adding shows the primary button in its Loading state at the normal button width.

**Discover.**
- Wide screens use `Featured card` Size=Wide (Expanded, Desktop) or Size=Medium (tablet portrait). The book cover stands on an illustrated stack of books on the right.
- Search results and category lists are a two-column grid.
- The no matches request form is capped at 640.
- Pull to refresh is tablet only.

**You & Settings.** Medium is a single pane: You home, then each page full width with a back button. Expanded and Desktop are master and detail: the You column (440) on the left, the page on the right, and the matching row selected.

**Monetisation.** Buy credits opens as a Large modal. The paywall is `Paywall` (`336:1031`) with `Plan option` (`334:22767`). It is the web paywall, and the source for the RevenueCat build sheet.

**System states.** Skeletons match each layout, using `color/bg/surface` blocks. The toast centres over the content area, and the crash screen sits in the 480 lane with no rail.

## 5. New or changed components

| Component | Node | Notes |
|---|---|---|
| Side rail | `295:493` | Collapsed 72, Expanded 240 |
| Library hero (Medium) | `361:2` | Text properties Title, Author, Status, Headline, Subline, Streak |
| Book grid tile | `324:975` | State In progress / Not started / Finished / Processing / Failed × Interaction |
| Library book pane | `325:993` | State Selected / Empty |
| Sheet / Book actions | `360:3010` | Phone. Title and four actions; Offline download disabled with "Soon" |
| Context menu / Book actions | `298:467` | Wide. No header; same four actions |
| Sheet / Remove book | `136:17` | Title "Remove {book}?", one line, Remove book, Cancel. Also used as the Confirm modal content |
| Panel / Sort & filter | `327:3255` | Popover content, with top and bottom padding 20 / 12 |
| Featured card | `200:486` | Size Compact / Medium / Wide × State Default / In library |
| Panel / Playback speed (compact) | `372:448` | Popover only. The phone sheet keeps its descriptions |
| Reader action | `390:8888` | Kind Default / Primary × Interaction; properties Label, Icon |
| Panel / AI chat (Offline), (Scope banner) | `372:51744`, `372:51783` | Chat status bar inside the panel |
| Paywall, Plan option | `336:1031`, `334:22767` | Approved |
| Upload drop zone, Keyboard shortcuts | `298:573`, `298:576` | Web and desktop only. Approved |
| Progress ring | `123:57` | Percentage label in the centre; Value and Show value properties |

## 6. Hover and focus (web and desktop)

These components have `Interaction = Default / Hover / Focus-visible`: Book list item, Recent listen row, Radio row, Book grid tile, Rail card, Short card, Discover book row and Reader action. List row, Button, Category chip, Menu item, Icon button and Input already had them.

- Hover on rows: a `color/bg/surface` fill. Hover on cards: the cover lifts with `Elevation/2`. Hover on Reader action: the chip goes to `reader/border` and the label to `reader/text`.
- Focus-visible: a 2px `color/border/accent` ring, inset 2 with radius 8 on rows, outset 4 with radius 12 on cards.
- Map Hover to `Pressable` hover state on web and Focus-visible to keyboard focus. Touch builds show neither.

## 7. Product and copy changes the code must pick up

| Change | Where |
|---|---|
| Free: 2 books, 90 min audio, 50K AI credits a month. Standard $9.99 a month or $79 a year. Student $4.99 a month | The code still uses 60 min, 5 books and $6.99. Update the usage limits, store products and RevenueCat offering |
| Reader action bar label "Reading options" is now "Display" | Action bar only. The sheet and popover titles stay "Reading options" |
| Remove book confirm: "Remove {title}?" and "This deletes the file and your reading progress." | Phone sheet and every modal |
| Book actions: no subtitles, no cover, no author | Sheet and context menu |
| Offline chat banner: "You’re offline. Chat needs an internet connection." | Chat status bar Kind=Offline |
| Discover Refreshing shows a small spinner at the top of the scroll | Phone and tablets |
| Progress ring shows the percentage in the centre (Fraunces SemiBold 24, error red when failed, none when indeterminate). Arc and label come from the same rounded value | Uploading screen, all sizes (`Progress ring` `123:57`, properties Value and Show value) |
| No em dashes in any UI copy | All |

## 8. Left out on purpose

| Not built | Why |
|---|---|
| Splash and Session restore on desktop | The web app has no launch screen |
| Pull to refresh on desktop | Not a web pattern |
| Library drag-over state on tablets | No drag source on touch |
| PDF spread on tablet portrait | Too narrow |
| A separate You home on Expanded and Desktop | The You column is always visible as the master |

## 9. Suggested build order

1. Layout tokens and a `useSizeClass()` hook (Compact, Medium, Expanded, Desktop) driven by window width.
2. Shells: Side rail, the content area, and mini player placement per class.
3. Presenter: one API (`present(content, { anchor, kind })`) that renders a bottom sheet, popover, side panel or modal by size class (section 3).
4. Library (Medium grid with the hero; master list and book pane), then Reader and AI tools panels, then Listen, Book detail, Discover, You & Settings, Monetisation and System states.
5. Hover and focus states for web.
6. Product and copy changes (section 7).

## 10. Done when

- Every frame in Figma has a matching screen at its size class, apart from the gaps in section 8.
- At 820, 1180 and 1440 wide, side-by-side screenshots match the Figma frames.
- No container runs off screen; a pop-over that cannot be centred on its trigger without crossing the gutter falls back to gutter-aligned without an arrow.
- Keyboard tabbing on web shows the focus ring on every interactive row, card and button.
- Reader text, the PDF and the player columns never exceed 680.
- Prices and caps match section 7 everywhere they appear.
