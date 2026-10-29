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
| §4 AI tools | R-M3b | Planned. Slide-over on Medium, docked panel above; practice takeover; reader Chapters panel |
| §4 Listen | R-M4 | Planned. Two-column Now playing, 680 bimodal, voice/timer/speed popovers |
| §4 Book detail | R-M5 | Planned. Cover left, info right |
| §4 Discover | R-M5 | Planned. Featured card sizes, two-column results, 640 request form |
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
| Offline chat banner wording | R-M3b | Pending |
| Discover Refreshing spinner | R-M5 | Pending |
| Progress ring percentage, one rounded value | R-M2b | ✅ `ProgressRing` |
| No em dashes in any UI copy | R-M2b | ✅ App and marketing site swept |

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

**Chapters ends up in two places.** Listen keeps the chapters it has
today, which get their panel treatment in R-M4. The reader gains its
own Chapters panel in R-M3b, opened by tapping the book title.

**The reader's and Listen's full-screen early returns** (Highlights,
the four AI modes, Chapters) have to become panel content before §3
can present them. That refactor is R-M3b's main body of work, and
Listen's is R-M4's.
