# Bookflow — Figma Build Log

Resumable record of the Figma replication. Any later session can pick up cold from this file.

| | |
|---|---|
| **File** | Bookflow — `Rt3gjNC24kBTrncxlnkuPW` |
| **URL** | https://www.figma.com/design/Rt3gjNC24kBTrncxlnkuPW/Bookflow |
| **Role** | **Foundations** (user decision, 2026-10-20). The brief originally called for three separate files; the user chose to use this existing file as Foundations instead. |
| **Team** | The Fusion Studio — `team::1380221155674136965` (Pro tier → max 4 variable modes) |
| **Source** | repo `bookflow`, branch `ui-cleanup` (from `v11-batch`) |
| **MCP session** | `b33f6fe9-6ebe-4f8f-a85f-776414bf7a36` |
| **Inventory** | [`BOOKFLOW_FIGMA_INVENTORY.md`](./BOOKFLOW_FIGMA_INVENTORY.md) |

**Phase status:** Phases 0–4 ✅ **complete** — all ten flows built, audited and covered against the route map. Current round: **UI cleanup** (branch `ui-cleanup`), settling the open questions before the architecture discussion.

**Phase 3 base frame: 393 × 852** (user decision). Android 412 × 917 frames only where behaviour genuinely differs.

**Decisions received 2026-10-20:** Phase 3 frame size = **393 × 852**.

**Decision 2026-10-21 (font):** Fraunces Medium does not exist in Figma and will not. `tokens.fonts.display` moved to **Fraunces SemiBold 600** in code; all 23 text styles are now built and **nothing in the file is a placeholder weight**. See Phase A below.

---

## Pre-existing content — DO NOT TOUCH

`Page 1` (`0:1`) held 9 frames of the user's own work before Phase 1 and was left completely untouched. All Phase 1 output went onto new pages.

| Node ID | Name | Size |
|---|---|---|
| `1:2` | Screen 1 — Library | 1290 × 2796 |
| `3:12` | Screen 2 — Reader (text mode) | 1290 × 2796 |
| `3:30` | Screen 3 — Listen / Now Playing | 1290 × 2796 |
| `3:84` | Screen 4 — AI Tools / Summary | 1290 × 2796 |
| `3:66` | Screen 5 — Discover | 1290 × 2796 |
| `7:419`, `7:1054` | Frame (unnamed) | 680 × 680 |
| `8:1535` | Frame 2 | 1593 × 1391 |
| `8:1587` | Feature Graphic — 1024 × 500 | 1024 × 500 |

> ⚠️ These mockups are **1290 × 2796** = iPhone 15 Pro Max at @3x (430 × 932 logical). Phase 0 proposed **393 × 852** as the Phase 3 base. Unresolved — see Open Questions.

---

## Phase 1 — Foundations

### Variable collections (9 collections · 217 variables)

| Collection | ID | Modes | Vars | Notes |
|---|---|---|---|---|
| `Primitives` | `VariableCollectionId:97:2` | Value (`97:0`) | 82 | scopes `[]`, **all 82 hidden from publishing** |
| `Semantic/Color` | `VariableCollectionId:98:2` | Light | 21 | 100% aliases → Primitives |
| `Reader/Theme` | `VariableCollectionId:98:24` | Light (`98:1`), Sepia (`98:2`), Dark (`98:3`) | 10 | 30/30 values are aliases |
| `Spacing` | `VariableCollectionId:99:2` | Value | 22 | both scales: `space/*` (9) + `spacing/*` (13) |
| `Radius` | `VariableCollectionId:99:25` | Value | 8 | |
| `Border` | `VariableCollectionId:99:34` | Value | 3 | **DERIVED** — no border tokens in code |
| `Elevation` | `VariableCollectionId:99:38` | Value | 12 | **DERIVED** — no elevation tokens in code |
| `Motion` | `VariableCollectionId:99:51` | Value | 13 | |
| `Component` | `VariableCollectionId:99:65` | Value | 46 | button / input / list-row / sheet / icon tokens, added so Phase 2 components bind instead of hardcoding |

**Primitives contents (82):** forest ×7, ink ×7, cream ×3, amber ×3, status ×11, sepia ×6, dark ×7, voice ×12, cover ×12, reading/epub ×7, extra ×7.

**Conventions applied**
- Every variable carries **WEB code syntax** = the real RN token path (e.g. `tokens.colors.forest[800]`). The `var(--x)` convention was deliberately not used: this codebase has **no CSS variables**, so a fabricated custom-property name would be misleading. Recorded as an intentional deviation.
- Every variable has explicit `scopes`. Colour by role (`TEXT_FILL` / `FRAME_FILL`+`SHAPE_FILL` / `STROKE_COLOR`), spacing → `GAP`, radii → `CORNER_RADIUS`, strokes → `STROKE_FLOAT`, shadow numbers → `EFFECT_FLOAT`, Android-elevation and motion values → `[]` (documentation only; Figma has no bindable field).
- Each variable's `description` carries its resolved value plus provenance.

### Text styles (23)

`Display/XL` · `Heading/LG` `Heading/MD` `Heading/SM` · `Body/LG` `Body/MD` `Body/SM` `Body/XS` · `Label/MD` `Label/SM` · `Reading/Standard` `Reading/Comfortable` `Reading/Max readability` `Reading/Font/Sans` `Reading/Font/Lexend` · `Reading/EPUB/Body` `Reading/EPUB/Heading 1` `Reading/EPUB/Heading 2` `Reading/EPUB/Heading 3`

Plus the four that were withheld through Phases 1–4 and are now built: `Display/LG` `Display/MD` `Display/SM` `Reading/EPUB/Spine title`.

> ✅ **Fraunces Medium — resolved 2026-10-21.** Figma offers Fraunces only in Thin, Light, Regular, SemiBold, Bold and Black; there is no Medium face and no variable weight axis, confirmed by `listAvailableFontsAsync` **and** by a `loadFontAsync({family:'Fraunces', style:'Medium'})` that throws with the available-styles list. Rather than hold four styles hostage, **the app moved**: `tokens.fonts.display` is now `Fraunces_600SemiBold`. All four styles are built at SemiBold and every placeholder marking in the file is cleared. See Phase A.

Reader styles use the **real constant leading** (`fontSize × 1.78`), not the presets' declared 1.5 / 1.8 / 2.0 — see open question F-2.

### Effect styles (4 — all DERIVED)

`Elevation/1` 0 1 3 rgba(0,0,0,.12) · `Elevation/2` 0 2 4 rgba(0,0,0,.08) · `Elevation/3` 0 4 12 rgba(0,0,0,.18) · `Elevation/4` 0 6 16 rgba(0,0,0,.20)

Synthesised from ~50 ad-hoc shadows in code. No equivalent exists in `tokens.ts`.

### Grid styles (4)

`Mobile / 393 — 4 col` · `Mobile / 412 — 4 col` · `Grid / 4pt` · `Grid / 8pt`

### Pages and root frames

| Page | Page ID | Root frame | Contents |
|---|---|---|---|
| Cover | `101:6` | `115:2` | identity, index, status, open questions |
| ——— FOUNDATIONS ——— | `101:7` | — | separator |
| Color — Primitives | `101:8` | `104:2` | 82 swatches in 11 groups |
| Color — Semantic | `101:9` | `105:2` | 21 alias rows |
| Color — Reader themes | `101:10` | `106:2` | 3 live mode previews + 10-key table |
| Typography — UI | `101:11` | `107:2` | 10 specimens + blocked-font callout |
| Typography — Reading | `101:12` | `108:2` | presets, fonts, EPUB, 16–28 ramp |
| Scales — Spacing, Radius, Border | `101:13` | `109:2` | true-size bars, radii, borders |
| Elevation & Motion | `101:14` | `110:2` | 4 elevation cards + duration/easing tables |
| Brand | `101:15` | `112:2` | lockup, logomark, auth variant, voice avatars |
| Icons | `101:16` | `103:2` | 68 icon components |

### Brand assets

- **Lockup component** — `112:20`. Imported verbatim from `src/components/Lockup.tsx`; 2 logomark arcs + **7** outlined wordmark paths, viewBox `0 0 196 52`. Three shipped sizes shown as instances with their real echo opacities (large 196×52 / 0.45, medium 127×34 / 0.5, small 98×26 / 0.55).
- Committed SVG extractions (verbatim, no redrawing): `docs/figma/assets/bookflow-lockup.svg`, `bookflow-logomark.svg`, `bookflow-wordmark.svg`, `bookflow-logomark-auth-variant.svg`.
- **Voice avatars** — all 7 (6 voices + fallback) rebuilt from `VoiceAvatar.tsx` on the 52×38 viewBox.

### Icons (68 components)

Geometry extracted verbatim from the installed `@tabler/icons-react-native` **v3.41.1** (MIT) — 59 outline (stroke 1.5) + 9 filled, 175 paths total. Cached at `docs/figma/assets/tabler-icon-paths.json`.

Each component: 24×24, named with the Bookflow `ICON_MAP` name, colour bound to `color/text/secondary`, outline stroke weight bound to `component/icon/stroke-width`. Descriptions record the underlying Tabler glyph.

Sample IDs — `AlertCircle` `103:7` · `AlertTriangle` `103:14` · `Apple` `103:20` · `ArrowLeft` `103:27` · `ArrowRight` `103:34`.

Eight names differ from their Tabler glyph: `Apple`→IconBrandAppleFilled, `BookOpen`→IconBookFilled, `CheckCircle`→IconCircleCheck, `Globe`→IconWorld, `Info`→IconInfoCircle, `Loader`→IconLoader2, `Pause`→IconPlayerPauseFilled, `Play`→IconPlayerPlayFilled. `Apple` is registered but unused in the app (auth is magic-link only).

### Validation (read-only audit, end of Phase 1)

| Check | Result |
|---|---|
| Variables left at `ALL_SCOPES` | **0** |
| Variables missing WEB code syntax | **0** |
| Broken aliases | **0** |
| `Semantic/Color` raw (non-alias) values | **0** of 21 |
| `Reader/Theme` raw values | **0** of 30 |
| Primitives hidden from publishing | **82 of 82** |
| Pre-existing `Page 1` children | **9** (unchanged) |

Visually verified by screenshot: Icons grid, Primitives, Reader themes (all 3 modes resolving), Brand (after two targeted fixes to logomark crop geometry and voice-cell alignment).

---

## Phase 2 — Components

Built into the same file (single-file decision), on `Components — Atoms` (`118:8`), `Components — Molecules` (`118:9`), `Components — Organisms` (`118:10`), under the `——— COMPONENTS ———` separator (`118:7`).

### Tier 1 — Atoms ✅  (12 component sets · 92 variants)

| Set | Node ID | Variants | Properties beyond variant axes | Source |
|---|---|---|---|---|
| Button | `119:434` | 48 (Variant×4 · Size×3 · State×4) | Label (TEXT), Leading/Trailing icon (BOOLEAN), Leading/Trailing icon swap (INSTANCE_SWAP) | `src/components/Button.tsx` |
| Input | `120:166` | 15 (Size×3 · State×5) | Label, Value, Helper (TEXT), Show label, Show helper, Leading/Trailing icon (BOOLEAN + SWAP) | `src/components/Input.tsx` |
| Icon button | `120:179` | 3 (State) | Icon (INSTANCE_SWAP) | `LibraryScreen.CircleIconButton` |
| Toggle | `120:184` | 2 (State) | — | `src/components/ListRow.tsx` |
| Mode toggle pill | `120:205` | 4 (Variant×2 · Mode×2) | — | `src/components/ModeTogglePill.tsx` |
| Badge | `123:30` | 4 (Kind) | Label (TEXT) | YouScreen / PracticeQuestionsScreen |
| Avatar | `123:35` | 2 (Kind) | Initials (TEXT) | `YouScreen.ProfileHeader` |
| Divider | `123:40` | 2 (Kind) | — | AccountScreen / SettingsScreen / HelpFAQScreen |
| Progress bar | `123:47` | 3 (Kind) | — | LibraryScreen / AIToolsScreen / YouScreen |
| Progress ring | `123:57` | 3 (State) | — | `UploadFlowScreen.ProcessingScreen` |
| Skeleton | `123:61` | 3 (Kind) | — | `src/components/Skeleton.tsx` |
| Spinner | `123:71` | 3 (Size) | — | `tokens.button.spinner` |

**Usage demos** (needed because these components are designed for dark surfaces and are unreadable on a light page):
- `Mode toggle pill / on dark` — `125:23`
- `Badge / on dark` — `125:35`

### Tier 2 — Molecules ✅  (13 families · 62 variants)

Page: `Components — Molecules` (`118:9`).

| Set | Node ID | Variants | Props | Source |
|---|---|---|---|---|
| List row | `129:314` | 30 (Size×2 · Trailing×5 · State×3) | 5 | `src/components/ListRow.tsx` |
| Section header | `129:324` | 1 | 3 | `LibraryScreen.SectionHeader` |
| Search bar | `129:349` | 2 (State) | 1 | `LibraryScreen.SearchHeader` |
| Top app bar | `129:359` | 2 (Kind) | 1 | `AccountScreen.SubHeader` / `YouDrillScreens.DrillHeader` |
| Book list item | `130:156` | 6 (State) | 3 | `LibraryScreen.BookListItem` |
| Tab bar | `130:262` | 4 (Active) | — | `src/components/TabBar.tsx` |
| Reader action bar | `130:368` | 3 (Theme) | — | `ReaderScreen.ActionBar` |
| Mini player | `130:400` | 2 (State) | 1 | `ListenScreen.MiniPlayer` |
| Voice row | `130:472` | 4 (State) | 2 | `ListenScreen.VoiceRow` |
| Plan card | `132:286` | 2 (Plan) | — | `YouScreen.PlanCard` / `ProPlanCard` |
| Top-up row | `132:343` | 4 (Theme × Balance) | — | `src/screens/TopupBalanceBlock.tsx` |
| Toast | `132:344` | 1 | 1 | `src/components/ToastHost.tsx` |
| Empty state | `132:349` | 1 | 4 | `LibraryScreen.LibraryEmptyContent` |

Extra: `List row / destructive` (`129:315`) — an instance showing the `destructive` prop (label on `color/text/error`), since a boolean component property cannot change a fill.

**Composition:** both Plan card variants embed a **Top-up row instance** under a "TOP-UP BALANCE" heading, matching the live screens. The real `TopupBalanceBlock` stacks two rows (Audio time + AI credits) with a hairline divider; one is shown to keep the card readable.

**Reader action bar** uses explicit `Reader/Theme` modes per variant, so Light / Sepia / Dark resolve from one layer tree.

### Tier 2 audit

| Check | Result |
|---|---|
| Families / variants | 13 / 62 |
| Sets missing a description | **0** |
| Stray loose components | **0** |
| Variables at `ALL_SCOPES` | **0** of 224 |
| Variables missing WEB code syntax | **0** |

### Fraunces Medium — placeholder-weight register ✅ CLOSED 2026-10-21

Historical. These nodes were built in **Fraunces SemiBold as a marked stand-in** while Medium was expected. The app moved to SemiBold 600 instead, so SemiBold is now simply *correct* — the nodes are unchanged and the ⚠ PLACEHOLDER WEIGHT markers have been stripped from their component descriptions.

| Component | Node | Spec |
|---|---|---|
| Top app bar | title | Fraunces 17 / w500 |
| Book list item | title | Fraunces 13 / w500 (`tokens.fonts.display`) |
| Plan card (Pro) | plan name hero | Fraunces 28 / w500 |
| Top-up row | amount | Fraunces 19 / w500 |
| Mini player | cover text | Fraunces 5 / w500 |
| Empty state | title | Fraunces 22 / w500 |

The 4 text styles that were unbuilt — `Display/LG`, `Display/MD`, `Display/SM`, `Reading/EPUB/Spine title` — now exist at SemiBold.

### Tier 3 — Organisms ✅  (13 families · 17 variants)

Page: `Components — Organisms` (`118:10`).

| Component | Node ID | Variants | Source |
|---|---|---|---|
| Bottom sheet | `136:16` | 2 (Kind) | `src/components/BottomSheet.tsx` |
| Sheet / Remove book | `136:17` | 1 | `LibraryScreen.RemoveBookSheetContent` |
| Sheet / AI tools | `136:45` | 1 | `AIToolsScreen.AIToolsSheet` |
| Sheet / Reading options | `137:23` | 1 | `ReaderScreen.TypographySheet` |
| Sheet / Reading options (Full mode) | `138:130` | 1 | `EpubFullReaderScreen` / `PdfReaderScreen` |
| Sheet / Buy credits | `137:87` | 1 | `src/screens/BuyCreditsSheet.tsx` |
| Audio player | `138:129` | 2 (State) | `src/screens/ListenNowPlayingScreen.tsx` |
| Panel / AI summary | `138:136` | 1 | `AIToolsScreen.SummaryScreen` |
| Panel / AI chat | `138:182` | 1 | `AIToolsScreen.ChatScreen` |
| Soft warning banner | `141:67` | 1 | `PaywallScreen.SoftWarningBanner` — **the only live paywall surface** |
| Paywall sheet | `141:156` | 3 (Variant) | `src/screens/PaywallSheet.tsx` — ⚠ unreachable in code |
| Onboarding / Intent | `141:160` | 1 | `src/screens/OnboardingIntentScreen.tsx` |
| Onboarding / First book | `142:109` | 1 | `src/screens/OnboardingFirstBookScreen.tsx` |

Plus a documentation block, **`Paywall — where the real one lives`** (`141:157`), stating that all 19 upgrade entry points call RevenueCat's hosted paywall and that its design is outside this repo (open question F-1).

**Scope call on F-13:** of the ~11 unreachable screens, only `PaywallSheet` was built — the brief explicitly asks for paywall layout blocks and it is the sole in-code paywall design. It is labelled unreachable in its description. The other dead screens remain undesigned pending your answer.

**Correction made during Tier 3:** the Audio player transport icons were initially reversed. Verified against `ListenNowPlayingScreen` — `PlayerSkipBack`/`PlayerSkipForward` are the OUTER page controls and `PlayerTrackPrev`/`PlayerTrackNext` the INNER ±15s seeks. Fixed in both variants.

---

## Phase 2 close-out audit

| Check | Result |
|---|---|
| Component families | **38** (12 atoms + 13 molecules + 13 organisms) |
| Total variants | **171** (92 + 62 + 17) |
| Components missing a description | **0** |
| Stray loose components | **0** |
| Detached instances | **0** |
| Variables | 224 across 9 collections |
| Variables at `ALL_SCOPES` | **0** |
| Variables missing WEB code syntax | **0** |
| Broken aliases | **0** |
| Text styles | 19 at the time; **23** after the Phase A font decision |

**Publishing:** the brief's Phase 2 ends with "ask me to publish Components" because it assumed three files needing cross-file library instances. With the single-file decision, components consume local variables directly and **no publish is required** to start Phase 3. Publishing is only needed if you later want these consumed from another file.

### Semantic tokens added during Tier 1 (7)

The Button and Input need colour roles that had no semantic name. Added to `Semantic/Color` (**28** variables after Tier 1's two further additions), all aliases to Primitives:

`color/bg/accent-pressed` → forest/900 · `color/bg/disabled` → ink/300 · `color/bg/error` → status/error · `color/bg/error-pressed` → status/error-pressed · `color/text/on-disabled` → cream/100 · `color/bg/field-disabled` → ink/100 · `color/border/success` → status/success

### Tier 1 notes

- Every geometry value binds to `Component/*`, `Radius/*` or `Border/*`; every colour binds to `Semantic/Color`. No raw values on any component.
- Icon instances inside components are recoloured by rebinding their vector paints to the host component's label colour.
- **Button exceeds the 30-variant guideline (48).** Deliberate: the brief requires variant properties that mirror the RN props, and splitting by size would break that parity.
- **Badge** merges one `Label` TEXT property across all four kinds, so the main set shows a single default. Set Label per instance — noted in the set description.

### New finding — F-17: button and row labels may render Regular, not Medium

`Button.tsx` (`styles.label`) and `ListRow.tsx` (`styles.label`) pair `fontWeight: '500'` with `fontFamily: tokens.fonts.ui`, which is `Geist_400Regular`. `tokens.ts` states in its own comment that *"React Native does NOT synthesize weights from a single family — each weight must reference its own loaded family."* By that rule these labels render **Regular**, while every other 500-weight surface uses `fonts.uiMedium` and renders Medium.

The Figma components are built in **Geist Medium** (the evident intent, and consistent with the rest of the system). If the code is left as-is, Figma and the app will disagree on button and list-row label weight.

**Fix in code:** `fontFamily: tokens.fonts.uiMedium` in both files. Needs your confirmation.

---

## Phase 3 — Screens

### ⚠ Verification caveat — read this before trusting any "matches the app" claim

Ground rule 10 asks for Figma screenshots **side by side with a real app render**. I could not produce real renders, and no screenshots exist in the repo. What I tried:

1. `npm run web` fails to bundle — `react-native-pdf` is native-only and throws at Metro resolve time on web.
2. I added a temporary `metro.config.js` aliasing five native-only packages (`react-native-pdf`, `react-native-purchases`, `react-native-purchases-ui`, `react-native-blob-util`, `expo-share-intent`) to a no-op stub **for `platform === 'web'` only**. The bundle then built successfully (7,402 modules).
3. The app still never mounts: the served bundle hits `Uncaught SyntaxError: Cannot use 'import.meta' outside a module` — an Expo SDK 55 web/Hermes transform issue, separate from the native-module problem.

I removed `metro.config.js`, `web-stubs/` and `.claude/launch.json` again, so **the repo is unchanged**. Say the word if you want the web path pursued properly — it would also give you a browser dev loop.

**What the Figma screens were therefore verified against:** the source code itself (copy strings, token values, layout constants read directly from the screen files), plus Figma screenshots to catch rendering defects. That is weaker than a pixel comparison and I am not claiming pixel fidelity.

### Flow 1 — Auth ✅

Page: `Auth` (`145:61`). Ten screens at **393 × 852**, left to right in user order, plus one annotation.

| # | Frame | Node ID | Source |
|---|---|---|---|
| 1 | `Auth / Splash / Default` | `146:2` | `SplashScreen.tsx` |
| 2 | `Auth / Welcome / Default` | `146:32` | `WelcomeScreen.tsx` |
| 3 | `Auth / Sign up / Form` | `146:121` | `SignInScreen.tsx` (`variant='signup'`) |
| 4 | `Auth / Sign in / Form` | `146:187` | `SignInScreen.tsx` (`variant='signin'`) |
| 5 | `Auth / Sign in / Check your email` | `146:240` | `SignInScreen.SignInSuccess` |
| 6 | `Auth / Callback / Verifying` | `147:161` | `AuthCallbackScreen.Verifying` |
| 7 | `Auth / Callback / Link expired` | `147:201` | `AuthCallbackScreen.ErrorState` |
| 8 | `Auth / Onboarding / Intent` | `147:258` | `OnboardingIntentScreen.tsx` |
| 9 | `Auth / Onboarding / First book` | `147:363` | `OnboardingFirstBookScreen.tsx` |
| 10 | `Auth / Returning user / Session restore` | `147:420` | `App.tsx` session restore |

**Audit:** 44 instances, **0 detached**, **0 stray components** on the page. Safe areas are real: every screen carries a `Status bar` (59pt) and `Home indicator` (34pt) instance.

**Prototype:** 7 connections wiring the main path — Splash → Welcome → Sign up → Check your email → Verifying → Intent → First book, with Sign in → Check your email joining it.

**Library additions needed by this flow** (added before the screens, per the brief):
- `Status bar` (`144:68`) — 2 variants, 393×59
- `Home indicator` (`144:73`) — 2 variants, 393×34
- `Illustration / Welcome hero` (`145:60`) — imported verbatim from `WelcomeScreen.HeroIllustration`

**Notes on fidelity**
- Screen 10 has **no dedicated UI in code**. `App.tsx` restores the session, reads `profiles.onboarding_complete` and routes silently; the user only sees the splash. The frame shows that, with an annotation (`147:450`) describing the routing rather than inventing a screen.
- The error state shows the `expired` copy. The other three variants (`used`, `network`, `unknown`) share the layout and differ only in title/sub/CTA — all four strings are in `ERROR_COPY`.
- The three-dot pulse on Verifying and the splash draw-on animation are static here; Figma frames cannot express them. Timings are recorded on the Motion page.
- The Welcome headline, both form titles, "Check your email.", "Almost there.", "This link has expired." and the onboarding headings are all Fraunces SemiBold — a marked stand-in when this flow was built, and **correct** since the Phase A font decision.

### Flow 2 — Library ✅

Page: `Library`. Twelve screens at **393 × 852**, left to right in user order.

| Frame | Node ID | Links |
|---|---|---|
| `Library / Empty / Default` | `152:3` | 1 |
| `Library / Loading / Skeleton` | `152:118` | 1 |
| `Library / Populated / Default` | `152:212` | 1 |
| `Library / Populated / Processing` | `152:397` | 1 |
| `Library / Populated / Failed upload` | `152:571` | 1 |
| `Library / Populated / Offline` | `152:747` | — |
| `Library / Add book / Sheet over library` | `153:829` | 1 |
| `Library / Remove book / Sheet over library` | `153:896` | 1 |
| `Library / Add book / Sheet (standalone)` | `153:952` | — |
| `Library / Remove book / Sheet (standalone)` | `153:1006` | — |
| `Library / Upload / Uploading` | `153:1054` | 1 |
| `Library / Upload / Failed` | `153:1127` | — |

**Audit:** 254 instances, **0 detached**, **0 stray components**. Both sheets appear over a scrimmed parent (`color/bg/overlay` @ 0.4, matching `tokens.bottomSheet.backdropOpacity`) *and* as standalone frames, per the brief.

**Prototype:** 8 connections — Loading → Populated, Empty/Populated → Add book, Add book → Uploading → Processing row → Populated, and Failed row → Remove book → Populated.

**Library additions needed by this flow** (added before the screens):

| Component | Node ID | Tier | Source |
|---|---|---|---|
| Library header | `150:327` | molecule, 2 states | `LibraryScreen.Header` |
| Reading stats card | `150:328` | molecule | `LibraryScreen.ReadingStatsCard` |
| Continue card | `150:357` | molecule | `LibraryScreen.ContinueCard` |
| Offline banner | `150:397` | molecule | `LibraryScreen.OfflineBanner` |
| Library skeleton | `150:412` | molecule | `SkeletonScreens.LibrarySkeleton` |
| Sheet / Add book | `151:111` | organism | `UploadFlowScreen.AddBookSheet` |
| Processing screen | `151:272` | organism, 2 states | `UploadFlowScreen.ProcessingScreen` |

**Notes on fidelity**
- The stats card **hides entirely** when there is no recorded reading, so it is absent from the Empty screen by design — a fresh install should not show "0m · 0-day streak".
- The offline screen dims all three header buttons (`dimmed={isOffline}`) and uses the slate offline palette, deliberately distinct from the amber warn palette.
- The failed-upload row shows `Upload failed · tap to remove` with an `X` trailing glyph; tapping routes to the Remove sheet. There is **no retry** — matches code.
- The upload-failed screen leads with "Read without audio", not a dead end: the book is still readable when only narration failed.
- ⚠ The `Generating audio` step is shown because `ProcessingScreen` renders it, but audio generation at upload is **not wired** in code (`LibraryScreen` routes the retry back through a plain upload retry).

**Component caveat recorded:** `Book list item`'s Title / Author / Status are TEXT properties merged across all six variants, so the main set shows one default on every row. The flow screens override them per instance; noted in the set description (same pattern as `Badge`).

### Flow 4 — Reader ✅

Page: `Reader`. Ten screens at **393 × 852**.

| Frame | Node ID | Links |
|---|---|---|
| `Reader / Text / Light` | `156:3` | 1 |
| `Reader / Text / Sepia` | `156:98` | 1 |
| `Reader / Text / Dark` | `156:193` | 1 |
| `Reader / Text / Chrome hidden` | `156:288` | 1 |
| `Reader / Full / PDF` | `157:293` | 1 |
| `Reader / Full / EPUB` | `157:382` | 1 |
| `Reader / Reading options / Sheet over reader` | `157:457` | 1 |
| `Reader / Reading options / Full mode placeholder` | `157:530` | — |
| `Reader / Search / Results` | `157:553` | 1 |
| `Reader / Highlights / List` | `157:606` | 1 |

**Audit:** 106 instances, **0 detached**, **0 stray nodes**. 9 prototype links.

**Library additions needed by this flow:**

| Component | Node ID | Notes |
|---|---|---|
| Reader header | `155:354` | 3 Reader/Theme modes |
| Reader page | `155:379` | 3 Reader/Theme modes; body at Standard preset (Literata 20 / 35.6) |
| Reader search header | `155:380` | |
| Highlight row | `155:427` | Word / Sentence |
| Reader progress strip | `155:428` | PDF mode page-position cue |
| Tap hint | `155:434` | auto-hide affordance |

**Notes on fidelity**
- The three text themes are one structure resolved through `Reader/Theme` modes, not three hand-painted screens.
- **Full mode genuinely differs from Text mode.** The EPUB screen uses the injected-CSS type scale (Literata 17 / 28.05, Fraunces Bold headings, blockquote with a `reading/epub/quote-border` rule) — not the 20px reader body. That is why its reading-options sheet is the no-controls placeholder.
- The PDF screen renders a page sheet on `bg/raised` with the light chrome the code actually uses, plus the progress strip.
- Search highlights the active match in `amber/500` and other matches in `amber/200`, matching `InReaderSearchHeader`.
- Chrome-hidden shows the Tap hint 96px from the bottom with no header or action bar, as `TapHint` does by inverting the chrome opacity.

**Correction made during the flow:** the Full-mode screens initially inherited the Reader header's default `Mode=Text` pill. Fixed to `Mode=Full` on all three affected frames.

### New finding — F-18: the ModeTogglePill Dark variant is unused, and its code comment is wrong

`ModeTogglePill.tsx` documents the Dark variant as being for "the PDF reader's black-translucent header". That is **stale**: `PdfReaderScreen.topChrome` uses `tokens.bgColors.canvas` (light), and all three readers — `PdfReaderScreen`, `EpubFullReaderScreen` and `ReaderScreen` — render the pill with its default `variant='light'`. **No caller passes `variant="dark"`.**

The Figma component description has been corrected to say so. Decide whether to delete the Dark variant from code or actually adopt it somewhere.

### Flow 5 — Reader AI tools ✅

Page: `AI tools`. Ten screens at **393 × 852**.

| Frame | Node ID | Links |
|---|---|---|
| `AI tools / Sheet / Over reader` | `162:3` | 1 |
| `AI tools / Summary / Complete` | `162:125` | 1 |
| `AI tools / Chat / Thread` | `162:204` | 1 |
| `AI tools / Practice / Config` | `162:254` | 1 |
| `AI tools / Practice / MCQ answered` | `162:342` | 1 |
| `AI tools / Practice / Short answer` | `162:433` | 1 |
| `AI tools / Practice / Results` | `162:507` | 1 |
| `AI tools / Translate / Word popover` | `162:590` | 1 |
| `AI tools / Translate / Page` | `162:670` | — |
| `AI tools / Credits exhausted` | `162:720` | — |

**Audit:** 86 instances, **0 detached**, **0 stray nodes**. 8 prototype links.

**Library additions needed by this flow:**

| Component | Node ID | Notes |
|---|---|---|
| Panel / AI practice | `160:390` | 4 states — Config, MCQ, Short answer, Results |
| Translate word popover | `161:196` | dark ink-900 card |
| Panel / AI translate | `161:228` | original-above-translation pairs |

**Notes on fidelity**
- **Cost transparency appears twice**: the tools sheet lists each tool's credit cost before launch, and Practice/Config states "Start · ~3K AI credits" on the CTA itself.
- **Traceability appears on every AI surface**: the summary carries a `Page 42` source chip, chat answers cite the pages they came from, and each practice question carries a `Source — Page 42` chip.
- **Quality ratings appear on summary and results** with the six reason chips from `NegativeReason` (missed / inaccurate / too-short / too-long / hard-to-follow / other).
- The `Credits exhausted` screen shows the real exhausted copy — "Monthly AI credits used up", a full error-coloured gauge, `50K / 50K`. In code every tool row then diverts to the hosted RevenueCat paywall (see F-1).
- Short answers are AI-graded with **partial credit**, which is why Results breaks down correct / partial / missed rather than a binary score.
- ⚠ Results offers "Retry the 3 you missed", which maps to `RetryQuestionsScreen` — **built but unreachable in code** (F-13).

**Corrections made during the flow:** a stray line in the panel helper left the Summary and Chat close buttons empty; both were repaired after screenshot review.

---

### Flow 6 — Listen ✅

Page: `Listen` (`169:2`). Ten screens at **393 × 852**, left to right in user order.

| # | Frame | Node ID | Source |
|---|---|---|---|
| 1 | `Listen / Tab / Empty` | `175:1314` | `ListenHomeScreen.tsx` — first-time branch |
| 2 | `Listen / Tab / Resume last session` | `175:1379` | `ListenHomeScreen.tsx` — `lastListenedBook` branch |
| 3 | `Listen / Tab / Now playing` | `180:1315` | `ListenNowPlayingScreen.tsx` + `TabBar` |
| 4 | `Listen / Foreground / Playing` | `169:247` | `ListenScreen.tsx` — bimodal |
| 5 | `Listen / Foreground / Paused` | `169:347` | `ListenScreen.tsx` |
| 6 | `Listen / Voice / Sheet` | `169:445` | `VoiceSheet` over the foreground player |
| 7 | `Listen / Sleep / Sheet` | `169:721` | sleep-timer sheet |
| 8 | `Listen / Speed / Sheet` | `169:765` | playback-speed sheet |
| 9 | `Listen / Mini player / Over library` | `169:823` | `MiniPlayer` docked over `Library / Populated / Default` |
| 10 | `Listen / History / Recently listened` | `175:1452` | `ListenHistoryScreen.tsx` |

**Audit:** 10 frames, **0 detached instances**, **0 stray nodes**, **0 unbound fills**, 10 prototype links.

#### Library additions needed by this flow

| Component | Node ID | Tier | Notes |
|---|---|---|---|
| Voice avatar | `166:99` | Atom | 7 variants; per-voice bar heights/opacity from `VoiceAvatar.tsx` |
| Voice row | `167:459` | Molecule | rebuilt with `Name` / `Description` / `Avatar` (INSTANCE_SWAP) |
| Listening pill | `164:361` | Molecule | Playing / Paused |
| Bimodal text | `164:362` | Molecule | rebuilt — see correction 1 |
| Stat card | `164:368` | Molecule | |
| Listen player bar | `164:464` | Molecule | scrub + 5-item transport + speed/voice/sleep pills |
| **Listen history row** | `174:460` | Molecule | **new** — `ListenHistoryScreen.Row()`; 44×44 cover, 18/10 padding |
| **Recent listen row** | `178:453` | Molecule | **new** — `ListenNowPlayingScreen.recentRow`; 38×38 cover, 14/11 padding |
| Sheet / Voice picker | `165:208` | Organism | |
| Sheet / Sleep timer | `165:341` | Organism | Off, 5 / 15 / 30 / 60 min, End of page |
| Sheet / Playback speed | `165:368` | Organism | 8 speeds with names + descriptions |
| **Audio player** | `177:459` | Organism | **rebuilt from scratch** — see correction 4 |

#### New variables

| Variable | Value | Why |
|---|---|---|
| `base/white` | `#FFFFFF` | the hero card uses `#fff`, not cream-50 |
| `white/10 … white/85` (13 vars) | `rgba(255,255,255,a)` | the `rgba(255,255,255,x)` literals in `ListenNowPlayingScreen` |
| `forest/card-paused` | `#2C3B31` | inline `cardBg` for the paused hero card; absent from `tokens.ts` |

#### Corrections made during this flow

These were all caught by reading the source or by screenshot review, **after** a first pass that was wrong. Recording them because the first pass looked plausible and was not.

1. **Bimodal active word was amber text.** The code is `activeWord: { backgroundColor: amber[500], color: forest[900], fontWeight: '500', borderRadius: 2 }` — an amber **highlight chip**, not amber type. The molecule was rebuilt as a wrapping word-token layout so one token can carry a real background chip mid-sentence. Literata **Medium** exists in Figma, so `fontWeight: '500'` maps exactly.
2. **Screens 1, 2 and 10 were first built from assumption.** `ListenHomeScreen.tsx` and `ListenHistoryScreen.tsx` are separate files I had not read; the empty-state copy, the resume card, and the whole history screen were wrong (invented copy, a play icon where the code uses Headphones, stat cards and a tab bar that do not exist on the history screen). All three were rebuilt against source.
3. **Foreground header was wrong.** It used a ChevronDown and an empty right slot; `ListenScreen` has `ArrowLeft` 18 on the left and `Search` 17 on the right, with `headerCenter` gap 4. Fixed on all five frames that carry it.
4. **The Audio player organism was the wrong surface.** It was a full-bleed forest player with a 190×285 centred cover. The real Listen-tab now-playing surface is a **cream page** with an **inset hero card** (`marginHorizontal: 18`, `borderRadius: 18`, `padding: 20`) whose top row is a 72×100 cover beside a meta column with a "Now playing" status badge. Rebuilt, and the screen rebuilt around it with the header, recently-listened list and "This month" stats.
5. **The paused card used forest-800.** Code uses `#2C3B31` — now a bound variable.
6. **Listening pill corner radius (99) was unbound.** Now bound to `radius/full`.

#### Figma behaviour worth recording

`figma.variables.setBoundVariableForPaint()` **discards the paint's `opacity`**, and a variable-bound paint does not carry paint-level opacity into instances — a fresh instance reported `opacity: 1` with zero overrides while its main component reported `0.15`. Translucent colours must therefore be baked into COLOR variables with an alpha channel (`{r,g,b,a}`), which is why `white/10 … white/85` exist. Worth remembering for any future translucent surface.

#### Off-scale values carried over from code

These are hard-coded in the app and have no token on either spacing scale (`space.*` = 4/8/12/16/24/32/48/64, `spacing[n]` = 0/4/8/12/16/20/24/32/40/48/56/64/80), so they are raw in Figma too. Ground rule 1 says record rather than invent — this is that record.

| Value | Where |
|---|---|
| 88×88, radius 22, marginBottom 22 | `ListenHomeScreen.iconBubble` |
| 320 max-width, marginBottom 26 | `ListenHomeScreen.sub` |
| paddingHorizontal 22 | `ListenHomeScreen.cta`, `.resumeWrap`, `ListenNowPlayingScreen.header`, `.sectionRow` |
| paddingTop 36, gap 18 | `ListenHomeScreen.resumeWrap` |
| padding 14, gap 14, radius 16 | `ListenHomeScreen.resumeCard` |
| 56×80 cover, 38×38 bubble radius 19 | `ListenHomeScreen` resume card |
| 14 / 8 / 10 header padding | `ListenHistoryScreen.header` |
| separator marginLeft 74 (18+44+12) | `ListenHistoryScreen.separator` |
| marginHorizontal 18, radius 18, padding 20 | `ListenNowPlayingScreen.card` |
| 72×100 cover radius 8, topRow gap 16 | `ListenNowPlayingScreen.topRow` |
| 60×60 play button, 40-wide transport buttons | `ListenNowPlayingScreen.controls` |
| pill height 30, radius 15, gap 7 | `ListenNowPlayingScreen.pills` |

#### New findings

- **F-19 — `StatCard` is under-modelled in Figma.** The Figma `Stat card` (`164:368`) exposes `Value` and `Label` only; the code's `StatCard` also takes `unit` and `delta` (with a `mutedDelta` flag). The three "This month" cards on screen 3 therefore show no unit or delta.
- **F-20 — the hero card bypasses the colour tokens.** `ListenNowPlayingScreen` uses `#fff`, `rgba(255,255,255,…)` and `#2C3B31` inline rather than `tokens.colors.cream[50]` / a forest token. Adopt these into `tokens.ts`, or switch the card to cream-50?
- **F-21 — two near-duplicate recently-listened rows.** `ListenHistoryScreen.Row` (44×44 cover, Fraunces 14 / Geist 11, padding 18/10) and `ListenNowPlayingScreen.recentRow` (38×38 cover, Fraunces 13 / Geist 10, padding 14/11) render the same data with different metrics. Both exist in Figma as separate molecules. Intentional size difference, or should they converge?
- **F-22 — transport icon opacity.** The code paints transport icons `rgba(255,255,255,0.85)`; in Figma they are bound to `white/85` on the component, but icon sub-layers inside instances resolve opaque (same binding quirk as above). Cosmetic, flagged rather than hacked around.

#### Fraunces placeholder-weight additions from this flow — ✅ closed 2026-10-21 (SemiBold is now the real weight)

| Component / screen | Node | Spec |
|---|---|---|
| Listen empty title | `Nothing playing` | Fraunces 24 / w500 |
| Resume card title + cover initial | screen 2 | Fraunces 15 / 28 / w500 |
| Now-playing header `Listen` | screen 3 | Fraunces 28 / w500 |
| Audio player title + cover caption | `177:459` | Fraunces 18 / 7 / w500 |
| Listen history row title | `174:460` | Fraunces 14 / w500 |
| Recent listen row title | `178:453` | Fraunces 13 / w500 |
| History header title | screen 10 | Fraunces 16 / w500 |

Fraunces Medium was re-checked at the start of this flow and was still unavailable. It never became available; the app moved to SemiBold 600 in Phase A instead.

---

### Flow 3 — Book detail ✅

Page: `Book detail` (`194:2`). Six screens at **393 × 852**, plus one annotation frame.

**Where this screen actually lives:** there is no `BookDetailScreen.tsx`. Book detail is the `DetailView` sub-view inside `src/screens/DiscoverScreen.tsx` (line ~2333), reached by `setView('detail')` from the Discover home rails or a category list. It carries the Discover tab bar.

| # | Frame | Node ID | State |
|---|---|---|---|
| 1 | `Book detail / Default` | `194:3` | not in library — "Add to library" |
| 2 | `Book detail / Adding` | `194:117` | `pending` — spinner + "Adding…", opacity 0.7 |
| 3 | `Book detail / In library` | `194:214` | "Remove from library" + 48×48 sample Play button |
| 4 | `Book detail / Remove confirm (native alert)` | `194:312` | `Alert.alert` over the detail screen |
| 5 | `Book detail / Already removed (native alert)` | `194:357` | single-OK alert |
| 6 | `Book detail / Optional metadata (unreachable)` | `194:402` | ⚠ documents dead branches |

**Audit:** 6 frames, **0 detached instances**, **0 unbound fills**, 5 prototype links. Instances: Book detail header ×6, meta row ×6, Topic tag ×18, CTA bar ×6, Tab bar ×6, Native alert ×2, Related book card ×3.

#### Library additions needed by this flow

| Component | Node ID | Tier | Notes |
|---|---|---|---|
| Topic tag | `189:36` | Atom | cream-100, radius 6, Geist 11 ink-700 |
| Free badge | `189:38` | Atom | forest-50, radius 4, Geist Medium 11 forest-800 |
| Book detail header | `191:426` | Molecule | centred Fraunces 17 title, leading/trailing INSTANCE_SWAP |
| Book detail meta row | `191:454` | Molecule | `Fields=Free only` / `Fields=All` |
| Related book card | `191:455` | Molecule | 80 wide, 80×116 cover |
| Book detail CTA bar | `191:480` | Molecule | `State=Add / Adding / In library` |
| **Native alert (iOS)** | `195:360` | Organism | **new** — `Buttons=Two / One`, real SF Pro |

#### New variables

`ios/alert-bg`, `ios/separator`, `ios/label`, `ios/tint-blue` (`#007AFF`), `ios/destructive-red` (`#FF3B30`), `ios/alert-scrim`. These are **OS colours, not Bookflow tokens**, and are scoped `[]` so they stay out of the design-system pickers.

SF Pro **is** available in Figma, so the native alert uses the real iOS system font — no substitution.

#### New findings

- **F-23 — `readTime`, `chapters` and `related` are dead UI.** All three are declared on `DiscoverBook` and rendered by `DetailView` behind truthiness checks, but **no construction site ever populates them**. `fromApiBook()` — the only path that builds a `DiscoverBook` from the API — returns `id, title, author, coverColor, coverLabel, coverUrl, epubUrl, tags, about, source, sourceLabel` and nothing else. So in the shipped app the meta row shows **only the Free badge**, and the "If you like this" rail never appears. Screen 6 documents the dead branches. Populate or delete?
- **F-24 — the detail chips duplicate the canonical `Badge` atom.** `Badge` already has `Kind=Source` (radius 4, padding 2/7). `freeBadge` (radius 4, padding 2/6, forest-50/forest-800) and `detailTag` (radius 6, padding 4/10, cream-100/ink-700) are screen-local StyleSheet entries that nearly but don't exactly match. Fold into `Badge` as new kinds?
- **F-25 — the detail CTA is off-system.** It is height **48**, radius **10**, font **14** — matching no canonical Button size (`Standard` 44/8/14, `Large` 52/10/16). CLAUDE.md says use the canonical Button and never reinvent it. Resize to Standard or Large, or add a fourth size?
- **F-26 — destructive confirmation is inconsistent, and breaks a hard rule.** Library removal uses the custom `Sheet / Remove book` bottom sheet; Discover book-detail removal uses a **native `Alert.alert`** with Cancel/Remove. CLAUDE.md hard rule 5: *"Destructive actions always trigger a confirmation bottom sheet."* One of the two paths is wrong — most likely Discover should adopt the sheet.
- **F-27 — the free-book cap has no visual state here.** When `planUsage.books.isExceeded`, `handleAddToLibrary` diverts straight to the RevenueCat **hosted** paywall (F-1) and returns. The Add button itself looks identical, so there is no capped/disabled state to draw. Flagged rather than invented.

#### Off-scale values carried over from code

`detailCoverWrap` marginBottom 18 · title marginBottom 4 · author marginBottom 14 · metaRow marginBottom/paddingBottom 18 · section-label marginBottom 8 · about marginBottom 16 · tags marginBottom 16 · source marginBottom 18 · cover 120×176 radius 8 padding 10 · header padding 16/8 · CTA bar padding 20/12/10 · primary button 48 high radius 10 · sample button 48×48 radius 10 · related cover 80×116 radius 5.

#### Fraunces placeholder-weight additions from this flow — ✅ closed 2026-10-21 (SemiBold is now the real weight)

| Node | Spec |
|---|---|
| Book detail header title | Fraunces 17 / w500 |
| Detail book title | Fraunces 22 / w500 (ls −0.22, lh 26.4) |
| Detail cover caption | Fraunces 9 / w500 |
| Related book card title + cover label | Fraunces 10 / 6 |

---

### Flow 7 — Discover ✅

Page: `Discover` (`201:2`). Nine screens at **393 × 852**.

`DiscoverScreen.tsx` is 3,225 lines holding three views switched by `view: 'home' | 'category' | 'detail'`. `DetailView` was covered in Flow 3; this flow covers `HomeView`, `CategoryView`, `SearchResults` and `SearchEmptyState`.

| # | Frame | Node ID | Source branch |
|---|---|---|---|
| 1 | `Discover / Home / Default` | `201:3` | rails loaded |
| 2 | `Discover / Home / Loading` | `201:170` | `loading` — spinner + "Loading free books…" |
| 3 | `Discover / Home / Refreshing` | `201:241` | `refreshing` — rails swap to skeletons |
| 4 | `Discover / Home / Error` | `201:395` | `error` — "Couldn't reach the catalog" |
| 5 | `Discover / Home / Slow network` | `201:463` | `useSlowOp` fires after 5 s |
| 6 | `Discover / Search / Results` | `201:627` | `SearchResults` with hits |
| 7 | `Discover / Search / No matches` | `201:748` | `SearchEmptyState` copy-to-request |
| 8 | `Discover / Category / List` | `201:829` | `CategoryView` populated |
| 9 | `Discover / Category / Empty` | `201:966` | `CategoryView` empty |

**Audit:** 9 frames, **0 detached instances**, **0 orphan instances**, **0 unbound fills**, **0 stray nodes**, 9 prototype links.

#### Library additions needed by this flow

| Component | Node ID | Tier | Notes |
|---|---|---|---|
| Category chip | `198:40` | Atom | `State=Active / Inactive`, h32 r16 Geist Medium 12 |
| Topic tag | `198:45` | Atom | **rebuilt as a set** — `Size=Detail / Compact` |
| Discover search bar | `199:454` | Molecule | `State=Default / Searching` |
| Add pill | `199:469` | Molecule | `State=Add / Adding / In library` |
| Discover section row | `199:478` | Molecule | `Trailing=None / Sub-label / See all` |
| Rail card | `199:494` | Molecule | `State=Default / In library` (check badge) |
| Rail card skeleton | `199:495` | Molecule | matches Rail card's dimensions |
| Short card | `199:499` | Molecule | 130×90 landscape cover |
| Featured card | `200:486` | Molecule | `State=Default / In library` |
| Discover book row | `200:487` | Molecule | shared by category **and** search |
| Copyable row | `200:518` | Molecule | `State=Default / Copied` |
| Slow network banner | `200:519` | Molecule | `SlowNetworkBanner.tsx` |

#### New variables

`status/warn` (`#A0692A`), `status/warn-bg` (`#FDF3E3`), `status/warn-border` (`#EFD9B5`) — the `tokens.colors.warn*` trio, which had no variables until now.

#### Corrections made during this flow

1. **Content overflow pushed the tab bar off three home screens.** The real screens pin `TabBar` outside the `ScrollView`; my first pass stacked everything in one column so a long rail list shoved the tab bar past 852. Every screen now has a `scroll` child with `layoutSizingVertical='FILL'` and `clipsContent`, with the status bar / slow banner / category header pinned above it and the tab bar + home indicator below.
2. **Add pill labels collapsed to one default** (the merged TEXT-property problem again — see the Badge / Book list item note in the Phase 2 close-out). `swapComponent` carries the old override across, so every row read "Add" regardless of state. Each row's label is now set explicitly after the swap.
3. **Every book showed the component's default tags.** Real per-book tags are now set on the nested `Topic tag` instances, taken from `discoverSeed.ts` (Moby Dick → Fiction/Adventure, Frankenstein → Fiction/Gothic, Alice → Fantasy/Children's literature).

Rebuilding `Topic tag` as a component set orphaned the 18 instances on the Book detail page; those were repointed at `Size=Detail` in the same session and re-verified (0 orphans on both pages).

#### Notes on fidelity

- **"For you" is rendered active but is inert** — `onPress` is `cat !== 'For you' ? onCategory(cat) : undefined`, so the chip that looks selected does nothing. Worth a second look (F-28).
- **The featured card holds the only amber CTA in Discover**, consistent with the amber-upgrade convention from the Phase 0 cross-check.
- **Six of the seven home rails are network-fed** (Gutenberg, Wikisource, Open Library, DOAB); only *The Holy Bible* is baked in from `BIBLE_VERSIONS`, which is why it never empties. The rails render only when `refreshing || rail.length > 0`, so a cold start with one slow source shows a shorter page rather than empty headings.
- **Search results and the category list render identical markup** — one `Discover book row` molecule serves both.
- **The search empty state is deliberately not a mailto.** Three tap-to-copy rows exist because a `mailto:` handoff failed for Android testers with no native mail app; the row flips Copy → Check for 1.8 s.
- **`AddPill` icons use `strokeWidth={2.5}`**, overriding the global 1.5 — more evidence for F-3.

#### Off-scale values carried over from code

home header 20/14 padding · search bar h40 r9999 pH14 · chip h32 pH14 r16 · sectionRow pH20 mb10 · rail cards 108×158 r7 pad8 · short cards 130×90 r8 · featured card r14, cover col 90 wide, info padding 14/12, add button h28 r14 pH12 · category header 16/10/12 · book row cover 72×104 r6 pad7 · divider marginVertical 14 · copy card r10 pH14 pV12 · banner pH14 pV10.

#### Fraunces placeholder-weight additions from this flow — ✅ closed 2026-10-21 (SemiBold is now the real weight)

`Discover` title (28/w500) · error + empty titles (18/w500) · category header title (20/w500) · rail card title (12) · short card title (11) · featured title (15) · book row title (14) · all cover captions (6.5–8).

---

### Flow 8 — You / Settings ✅

Page: `You & Settings` (`210:2`). Ten screens at **393 × 852**.

The largest flow by source volume — 7,332 lines across nine files. Surfaces are reached by in-component `view` state, not a router: `YouScreen` swaps to `AccountScreen`, `SettingsScreen`, and the `YouDrillScreens` exports; `SettingsScreen` swaps again into the same drill screens.

| # | Frame | Node ID | Source |
|---|---|---|---|
| 1 | `You / Home / Free plan` | `210:3` | `YouScreen` + `PlanCard` (Free) |
| 2 | `You / Home / Pro plan` | `210:329` | `YouScreen` + `ProPlanCard` |
| 3 | `You / Sign out / Sheet` | `210:663` | `YouScreen.SignOutSheetBody` |
| 4 | `You / Account & subscription` | `210:735` | `AccountScreen` |
| 5 | `You / Settings` | `210:973` | `SettingsScreen` |
| 6 | `You / Settings / Notifications denied` | `210:1216` | `SettingsScreen` + `NotifDeniedBanner` |
| 7 | `You / Reading display` | `212:1319` | `YouDrillScreens.ReadingDisplayScreen` |
| 8 | `You / Default voice` | `212:1475` | `YouDrillScreens.DefaultVoiceScreen` |
| 9 | `You / Notifications` | `210:1644` | `YouDrillScreens.NotificationsScreen` |
| 10 | `You / Help & FAQ` | `210:1698` | `YouDrillScreens.HelpScreen` |

**Audit:** 10 frames, **0 detached**, **0 orphan instances**, **0 unbound fills**, **0 stray nodes**, 10 prototype links. 30 `List row` + 27 `Settings row` instances.

#### Library additions needed by this flow

| Component | Node ID | Tier | Notes |
|---|---|---|---|
| Settings toggle | `207:40` | Atom | **44×26** — distinct from the canonical 36×22 `Toggle` |
| Profile header card | `208:470` | Molecule | 52×52 avatar, name/email, chevron circle |
| Settings row | `208:537` | Molecule | `Trailing=None / Hint / Toggle / Hint + chevron` |
| Radio row | `211:554` | Molecule | `State=Default / Selected / Locked` + optional 36px leading avatar |
| Drill header | `208:558` | Molecule | centred title (YouDrillScreens) |
| Sub header | `208:566` | Molecule | left-aligned title (Settings / Account) |
| Notifications denied banner | `208:573` | Molecule | warn-palette permission banner |

Reused as-is: `Plan card` (Free + Pro, already built in Tier 2 from this screen), `List row`, `Top-up row`, `Voice avatar`, `Bottom sheet`.

#### Corrections made during this flow

1. **The sign-out scrim rendered fully opaque**, hiding the screen beneath. `color/bg/overlay` carries no alpha, and paint-level opacity is reset on binding (the Flow 6 finding). Fixed with node opacity 0.4 — the same approach the Listen sheets use.
2. **The Default voice screen was missing most of its content.** First pass had one flat "VOICE" section with no avatars. The real screen has helper copy, a **Free** section and a **Pro voices** section, a 36px `VoiceAvatar` leading every row, and an "Unlock all voices" upsell card. `Radio row` was rebuilt with `Show leading` + `Leading swap` and the screen redone; the Reading display screen was rebuilt against the new set in the same pass (0 orphans after).

#### New findings

- **F-29 — the app ships two different toggles.** `src/components/ListRow.tsx` exports a **36×22** switch (canonical, used by `List row`); `SettingsScreen.Toggle` and `YouDrillScreens.CustomToggle` are both **44×26** with a shadowed knob. The You tab home uses the small one and Settings uses the large one, on adjacent screens. `CustomToggle`'s own comment says it exists because "the native iOS `Switch` looked out of place" — but it diverged from the canonical ListRow toggle rather than reusing it. Which is canonical?
- **F-30 — three row patterns and two header patterns coexist.** Rows: `ListRow` (canonical, 56/48 high, full state matrix) on the You home; `SettingsScreen.SettingsRow` (30×30 icon tile, 13/14 padding, no states) on Settings and Account; `YouDrillScreens.RadioRow` on the drill screens. Headers: the **centred** `DrillHeader` (YouDrillScreens) vs the **left-aligned** `SubHeader` (Settings, Account). A user moving You → Settings → Reading display crosses all of them.
- **F-31 — the redesigned Pro plan card bypasses the token system more than any other surface.** `ProPlanCard` hard-codes `#D8D5CC` (border), `#4A7C59` (eyebrow), `#F5F1E8` (bottom panel), `#8A8780` (labels), `#3D3A36` (text), `#ECE9E0` (track), plus `rgba(212,165,116,0.15/0.4)` for the Active badge and `rgba(255,255,255,0.14)` for the unlimited chip. None are in `tokens.ts`. This is the most recently redesigned component in the app, so the drift is new.
- **F-32 — `Meter` has a dead `unlimited` branch on the free card.** `YouScreen.Meter` renders an "∞ Unlimited" chip when `unlimited` is passed, but the free `PlanCard` never passes it (all three meters have finite totals), and the Pro card uses a separate `ProUsageRow` with its own `unlimitedChipLight`. So two unlimited-chip treatments exist and the dark one is unreachable from the free card.

#### Off-scale values carried over from code

profile avatar 52×52 r26 · chevron circle 32×32 · plan badge radius `radii.sm` with 3px vertical padding · upgrade button h40 · Pro hero paddings 16/12, name 28/31, `proBottom` 16/12/18 · settings row 14/13 padding, 30×30 icon tile r8 · settings toggle 44×26, knob 20 inset 3 · drill header 16/10 with a 36px spacer · sub header back button 30×30 r15 · radio dot 20×20 border 1.5, inner 10 · size button 14/8 r10 · upsell card r12 pad14, button 14/8 r10 · notif banner r10 pad 14/12, CTA h30 r7.

#### Fraunces placeholder-weight additions from this flow — ✅ closed 2026-10-21 (SemiBold is now the real weight)

`You` title (28/w500) · profile name (16/w500) · Pro plan name hero (28/w500) · sub header title (16/w500) · drill header title (17/w500) · sign-out sheet title (20/w500) · upsell card title (14/w500).

---

### Flow 9 — Monetisation ✅

Page: `Monetisation` (`219:2`). Ten screens at **393 × 852**, plus one annotation.

**This flow answers F-1.** The question was whether to export, skip, or rebuild the retired paywall. The answer from the code: there is nothing to replicate, and most of the local paywall code is unreachable.

| # | Frame | Node ID | Source |
|---|---|---|---|
| 1 | `Monetisation / Buy credits / Audio time` | `219:3` | `BuyCreditsSheet` |
| 2 | `Monetisation / Buy credits / AI credits` | `219:215` | |
| 3 | `Monetisation / Buy credits / Loading` | `219:388` | `packages === null` |
| 4 | `Monetisation / Buy credits / Unavailable` | `219:456` | no packages for either kind |
| 5 | `Monetisation / Buy credits / Purchasing` | `219:519` | `buyingId === pkg.identifier` |
| 6 | `Monetisation / Top-up balance` | `219:649` | `TopupBalanceBlock` (light theme) |
| 7 | `Monetisation / Soft warning banner` | `219:722` | `PaywallScreen.SoftWarningBanner` over Library |
| 8 | `Monetisation / Upgrade coming soon (native alert)` | `219:866` | `presentPaywall()` when RC is disabled |
| 9 | `Monetisation / No purchases found (native alert)` | `219:889` | `AccountScreen.handleRestorePurchases` |
| 10 | `Monetisation / Hosted paywall (not in repo)` | `219:912` | annotated marker |

**Audit:** 10 frames, **0 detached**, **0 orphan instances**, **0 unbound fills**, 8 prototype links.

#### Library additions

| Component | Node ID | Tier | Notes |
|---|---|---|---|
| Credit tabs | `217:532` | Molecule | `Active=Audio time / AI credits` |
| Credit pack card | `217:610` | Molecule | `State=Idle / Selected / Buying` |
| Sheet / Buy credits | `218:541` | Organism | **rebuilt** — now 4 states |

#### ⚠ Correction — the Buy credits copy had reversed meaning

The previous `Sheet / Buy credits` (`137:87`, built in Tier 3) carried the subtitle **"Top-ups never expire while your plan is active."** The shipped code now reads:

> "Top up your audio time or AI credits. Top-ups stack on your monthly allowance and **expire 12 months after purchase**."

with the footer "Top-ups expire 12 months after purchase · non-refundable". Never-expire → 12-month expiry is a substantive change to a commercial promise, not a wording tweak. The sheet was rebuilt; the old component is gone.

#### New findings

- **F-33 — prices are not in the repo.** `TOPUP_META` supplies pack `name`, `description` and `units`; every price string comes from the store at runtime via RevenueCat (`pkg.product.priceString`), as do the per-unit and savings calculations. The prices in Figma ($4.99 / $11.99 / $2.99 / $9.99) are **placeholders**. The only price literal anywhere in the code is the `"$4.99/mo"` hint on the Account student-verification row.
- **F-34 — ~1,600 lines of unreachable monetisation UI.** Verified by import search across `src/` and `App.tsx`:
  - `PaywallSheet.tsx` (376 lines) — imported nowhere. The existing `Paywall sheet` component (`141:156`, 3 variants) was built from it, so it documents dead code.
  - `PaywallScreen.tsx` (506 lines) — only `SoftWarningBanner` is imported (by `LibraryScreen`); the paywall screen itself is unreachable.
  - `RestorePurchasesScreen.tsx` (284 lines) — imported nowhere. `AccountScreen` has its own inline Restore row calling `restorePurchases()` and reporting through native alerts.
  - `StudentVerificationScreen.tsx` (463 lines) — imported nowhere. `AccountScreen`'s "Verify student status" row opens a `mailto:` to support@getbookflow.co, falling back to an alert.
  
  Delete, or wire up? This also explains why Flow 8 left Student verification and Restore purchases unbuilt — they are not reachable surfaces.
- **F-35 — the upgrade path has no in-repo UI at all.** Every entry point (free-plan "Upgrade to Standard", Discover add past the book cap, the Default voice upsell, AI-credit exhaustion, the audio generation cap) calls `presentPaywall()` → `RevenueCatUI.presentPaywallIfNeeded()`, configured in the RevenueCat dashboard. The one branch that *is* in the repo is the disabled fallback: a native alert reading "Upgrade coming soon / Pro subscriptions are being set up…". Screen 10 marks the boundary rather than inventing a paywall.

#### Resolution of F-1

**F-1 is answered: there is nothing to export or rebuild.** The hosted paywall is dashboard-configured and renders from RevenueCat's SDK. Screen 10 documents the boundary and lists every entry point; screen 8 draws the only in-repo upgrade surface. If you want a Bookflow-designed paywall instead of the hosted one, that is a new design task, not a replication task — flag it and I will treat it as such.

#### Off-scale values carried over from code

sheet header 6/14 · card radius 14 with a 1.5 border · 46×46 icon tile r12 · best-value badge 7/2 · savings pill 10/3 · buy button h36 r9 pH18 minWidth 72 · tab track r10 pad 3, tab h34 r8 · soft warning r10 border 0.5 pad 12/10 · dismiss 24×24 on `rgba(0,0,0,0.06)`.

#### Fraunces placeholder-weight additions from this flow — ✅ closed 2026-10-21 (SemiBold is now the real weight)

Buy credits title (22/w500) · pack name (15/w500) · price (17/w500) · hosted-paywall marker heading (18).

---

### Flow 10 — System states ✅

Page: `System states` (`225:2`). Nine screens at **393 × 852**, plus one annotation. **Phase 3 complete.**

| # | Frame | Node ID | Source |
|---|---|---|---|
| 1 | `System / Loading / Library skeleton` | `225:3` | `SkeletonScreens.LibrarySkeleton` |
| 2 | `System / Loading / Reader skeleton` | `225:108` | `SkeletonScreens.ReaderSkeleton` |
| 3 | `System / Offline / Library` | `225:181` | `LibraryScreen.OfflineBanner` |
| 4 | `System / Offline / AI chat` | `225:330` | `AIToolsScreen` offline branch |
| 5 | `System / Toast / Success` | `225:403` | `ToastHost` |
| 6 | `System / Slow network / Discover` | `225:429` | `SlowNetworkBanner` + `useSlowOp` |
| 7 | `System / Permission / Notifications` | `225:610` | `SettingsScreen.NotifPermissionSheet` |
| 8 | `System / Error / Generic alert` | `225:664` | `formatNetworkError` via `Alert.alert` |
| 9 | `System / Online / AI chat (scope banner)` | `225:693` | connected counterpart of #4 |

**Audit:** 9 frames, **0 detached**, **0 orphan instances**, **0 unbound fills**, 8 prototype links.

#### Library additions

| Component | Node ID | Tier | Notes |
|---|---|---|---|
| Chat status bar | `222:549` | Molecule | `Kind=Scope / Offline` — mutually exclusive |
| Chat error card | `222:550` | Molecule | dashed outline, Try again / Discard |
| Reader skeleton | `223:466` | Organism | Listen rendered live, other four skeletal |
| Sheet / Notification permission | `223:517` | Organism | pre-permission priming sheet |

Reused: `Library skeleton`, `Offline banner`, `Toast`, `Slow network banner`, `Native alert (iOS)`, `Skeleton`.

#### Notes on fidelity

- **Offline uses a deliberately neutral slate**, not the amber warn palette: `tokens.colors.offline` `#4A5568` / `offlineBg` `#F0F2F5` / `offlineBorder` `#CBD5E0`. Offline is a state, not a warning — the amber palette is reserved for approaching limits and slow operations.
- **The offline banner is honest about what still works**: "No connection · Reading still works · Streaming unavailable", with a Retry affordance. That is the "honest empty/edge states" principle doing real work, and it matches the local-first reading promise.
- **The chat composer degrades rather than disappearing**: the field stays visible with the placeholder swapped to "You're offline — Q&A unavailable", the field recoloured to the offline palette, and the send button disabled. The failed message keeps its dashed error card with "Try again" dimmed to 50% while offline.
- **The scope banner and the offline bar are the same slot.** Online it reads "Answers come only from {book}. I'll cite the pages I pull from" — source traceability stated up front, before any answer appears.
- **The reader skeleton keeps Listen live.** The other four action-bar items are skeletons sized to their final label widths so nothing shifts on load; Listen is a real forest-800 button because it is tappable while the page loads.
- **The permission sheet primes before the OS prompt**, showing a realistic preview of the notification and stating explicitly that iOS will ask next and only allowed categories are sent. Stacked CTAs, per the bottom-sheet hard rule.

#### New finding

- **F-36 — three more unreachable screens.** Verified by import search: `NotificationPermissionSheet.tsx` (349 lines), `ComingSoonScreen.tsx` (98 lines) and `AppRatingSheet.tsx` (223 lines) are imported nowhere. The reachable permission sheet is `SettingsScreen`'s own `NotifPermissionSheet`, which is what screen 7 is built from. **Together with F-34's four monetisation files, that is ~2,270 lines of unreachable UI** — the concrete answer to F-13 from the Phase 0 inventory.

#### Off-scale values carried over from code

offline banner 10/16 padding, 8px dot, retry h26 r6 pH10 · chat offline bar 8/16 · scope banner 10/16 · error card r10 dashed 1.5 pad 12 · toast r`xl` pad 14/12, 22×22 amber check circle · reader skeleton header 16/10, body 20/24, action bar 44×44 · permission sheet 56×56 icon r28, preview card r14 pad 12, CTAs h48 r10.

---

## Phase 3 complete — all ten flows built

Counts **as at the end of Phase 3**. Phase 4 then added 12 more surfaces — see §4.3 for the current state of the file.

| Flow | Page | Frames | Node |
|---|---|---|---|
| 1 Auth | `Auth` | 10 | `145:61` |
| 2 Library | `Library` | 12 | `152:2` |
| 3 Book detail | `Book detail` | 6 | `194:2` |
| 4 Reader | `Reader` | 10 | `156:2` |
| 5 Reader AI tools | `AI tools` | 10 | — |
| 6 Listen | `Listen` | 10 | `169:2` |
| 7 Discover | `Discover` | 9 | `201:2` |
| 8 You / Settings | `You & Settings` | 10 | `210:2` |
| 9 Monetisation | `Monetisation` | 10 | `219:2` |
| 10 System states | `System states` | 9 | `225:2` |

**96 screen frames**, 0 detached instances and 0 unbound fills across every page.

---

## Phase 4 — Final QA and handoff ✅

### 4.1 Cross-file audit

Every page was walked node by node. Any raw `SOLID` paint whose colour exactly matched an existing variable was auto-bound; anything with no match was reported rather than guessed.

| Page | Raw fills bound | Unmatched | Detached | Orphan instances |
|---|---|---|---|---|
| Auth | 15 | 0 | 0 | 0 |
| Library | 0 | 0 | 0 | 0 |
| Reader | 4 | 0 | 0 | 0 |
| AI tools | 0 | 0 | 0 | 0 |
| Listen, Book detail, Discover, You, Monetisation, System | 0 | 0 | 0 | 0 |
| Components — Atoms | 54 | 0 | — | — |
| Components — Molecules | 40 | 0 | — | — |
| Components — Organisms | 37 | 0 | — | — |
| **Total** | **150** | **0** | **0** | **0** |

**One auto-match was wrong and was corrected by hand.** The reader `Tap hint` is `rgba(0,0,0,0.55)`; it had been built as opaque black, so the matcher bound it to `ios/label` — right value, wrong meaning. Fixed by adding `black/55` and `white/90` (alpha baked in, as paint-level opacity does not survive variable binding) and rebinding at component level. The matcher now **excludes `ios/*` from auto-matching** so OS colours can never be pulled into Bookflow surfaces by coincidence.

**All 98 component sets carry a description with their source file path.** 0 missing.

`Page 1` was checked and **left untouched** — it holds your own 9 pre-existing mockups at 1290 × 2796.

### 4.2 Coverage against the Phase 0 route map

Twelve reachable surfaces from the route map were missing after Phase 3. All twelve were built in Phase 4 rather than reported as gaps.

| Route-map surface | Figma frame | Node | Status |
|---|---|---|---|
| **Flow 1 — Boot & auth** | | | |
| Splash | `Auth / Splash / Default` | `146:2` | ✅ |
| Welcome | `Auth / Welcome / Default` | `146:32` | ✅ |
| Sign in | `Auth / Sign in / Form` | `146:187` | ✅ |
| Sign up | `Auth / Sign up / Form` | `146:121` | ✅ |
| Check your email | `Auth / Sign in / Check your email` | `146:240` | ✅ |
| Verifying | `Auth / Callback / Verifying` | `147:161` | ✅ |
| Link error | `Auth / Callback / Link expired` | `147:201` | ✅ |
| **Flow 2 — Onboarding** | | | |
| Intent capture | `Auth / Onboarding / Intent` | `147:258` | ✅ |
| First book | `Auth / Onboarding / First book` | `147:363` | ✅ |
| Returning-user routing | `Auth / Returning user / Session restore` | `147:420` | ✅ |
| **Flow 3 — Library** | | | |
| Home — empty / loading / populated / offline | 4 frames | `152:3`, `152:118`, `152:212`, `152:747` | ✅ |
| Home — processing / failed upload | 2 frames | `152:397`, `152:571` | ✅ |
| Soft warning banner | `Monetisation / Soft warning banner` | `219:722` | ✅ |
| **Search — pre-search / results / no results** | 3 frames | `231:1434`, `231:1527`, `231:1617` | ✅ **added P4** |
| **Sort & filter sheet** | `Library / Sort & filter / Sheet` | `231:1682` | ✅ **added P4** |
| **Book action sheet** | `Library / Book actions / Sheet` | `231:1745` | ✅ **added P4** |
| Remove book confirm | 2 frames (over + standalone) | `153:896`, `153:1006` | ✅ |
| Add book sheet | 2 frames (over + standalone) | `153:829`, `153:952` | ✅ |
| Processing / upload | 2 frames | `153:1054`, `153:1127` | ✅ |
| **Scanned-PDF error** | `Library / Upload / Scanned PDF error` | `231:1816` | ✅ **added P4** |
| **Flow 4 — Readers** | | | |
| Text mode — 3 themes + chrome hidden | 4 frames | `156:3`, `156:98`, `156:193`, `156:288` | ✅ |
| Full — PDF / EPUB | 2 frames | `157:293`, `157:382` | ✅ |
| Reading options — text + Full placeholder | 2 frames | `157:457`, `157:530` | ✅ |
| Search / Highlights | 2 frames | `157:553`, `157:606` | ✅ |
| **ChapterSheet** | `Reader / Chapters / Sheet` | `232:726` | ✅ **added P4** |
| ReaderSkeleton | `System / Loading / Reader skeleton` | `225:108` | ✅ |
| **Flow 5 — AI tools** | all 10 surfaces | `162:3` … `162:720` | ✅ |
| Retry questions | — | — | ⚠️ unreachable (F-13) |
| **Flow 6 — Listen** | all 10 surfaces | `169:2` page | ✅ |
| **Flow 7 — Discover** | Home (5 states), Category (2), Search (2) | `201:2` page | ✅ |
| Detail view | covered by Flow 3 — Book detail | `194:2` page | ✅ |
| **Flow 8 — You / Settings** | | | |
| You home — Free / Pro | 2 frames | `210:3`, `210:329` | ✅ |
| Sign out sheet | `You / Sign out / Sheet` | `210:663` | ✅ |
| Account & subscription | `You / Account & subscription` | `210:735` | ✅ |
| **Edit profile** | `You / Edit profile` | `233:1783` | ✅ **added P4** |
| **Delete account sheet** | `You / Delete account / Sheet` | `233:1845` | ✅ **added P4** |
| Settings — normal / notifications denied | 2 frames | `210:973`, `210:1216` | ✅ |
| Drill: Reading display | `You / Reading display` | `212:1319` | ✅ |
| Drill: Default voice | `You / Default voice` | `212:1475` | ✅ |
| **Drill: Playback speed** | `You / Default playback speed` | `233:1379` | ✅ **added P4** |
| **Drill: Translation language** | `You / Translation language` | `233:1533` | ✅ **added P4** |
| Drill: Notifications | `You / Notifications` | `210:1644` | ✅ |
| Drill: Help & FAQ | `You / Help & FAQ` | `210:1698` | ✅ |
| **Drill: Send feedback** | `You / Send feedback` | `233:1741` | ✅ **added P4** |
| **Flow 9 — Monetisation** | | | |
| Buy Credits — 5 states | 5 frames | `219:3` … `219:519` | ✅ |
| Top-up balance | `Monetisation / Top-up balance` | `219:649` | ✅ |
| Soft warning banner | `Monetisation / Soft warning banner` | `219:722` | ✅ |
| "Upgrade coming soon" alert | `Monetisation / Upgrade coming soon` | `219:866` | ✅ |
| Restore-purchases alert | `Monetisation / No purchases found` | `219:889` | ✅ |
| Hosted paywall | `Monetisation / Hosted paywall (not in repo)` | `219:912` | ⚠️ marker — nothing to replicate (F-1) |
| `PaywallSheet` / `PaywallPlanScreen` | `Paywall sheet` component `141:156` | — | ⚠️ dead code, documented (F-34) |
| **Flow 10 — System states** | all 9 surfaces | `225:2` page | ✅ |
| Notification permission sheet | `System / Permission / Notifications` | `225:610` | ✅ (built from the reachable in-Settings version — F-36) |

**Not built, and why** — every one is unreachable in the shipped app, verified by import search:

| Surface | Lines | Reason |
|---|---|---|
| `RetryQuestionsScreen` | — | unreachable (F-13) |
| `PaywallSheet.tsx` | 376 | imported nowhere (F-34) |
| `PaywallScreen.tsx` (minus `SoftWarningBanner`) | 506 | only one export is imported (F-34) |
| `RestorePurchasesScreen.tsx` | 284 | imported nowhere (F-34) |
| `StudentVerificationScreen.tsx` | 463 | imported nowhere (F-34) |
| `NotificationPermissionSheet.tsx` | 349 | imported nowhere (F-36) |
| `ComingSoonScreen.tsx` | 98 | imported nowhere (F-36) |
| `AppRatingSheet.tsx` | 223 | imported nowhere (F-36) |

### 4.3 Final counts

| | |
|---|---|
| Screen frames | **108** across 10 flow pages |
| Component sets | **98** (20 atoms · 54 molecules · 24 organisms) |
| Variables | **263** across 9 collections |
| Text styles | **23** · Effect styles 4 |
| Detached instances | **0** |
| Orphan instances | **0** |
| Unbound fills | **0** |
| Components without a description | **0** |

| Flow | Page | Screens |
|---|---|---|
| 1 Auth | `Auth` `145:61` | 10 |
| 2 Library | `Library` `152:2` | 18 |
| 3 Book detail | `Book detail` `194:2` | 6 |
| 4 Reader | `Reader` `156:2` | 11 |
| 5 Reader AI tools | `AI tools` `162:2` | 10 |
| 6 Listen | `Listen` `169:2` | 10 |
| 7 Discover | `Discover` `201:2` | 9 |
| 8 You / Settings | `You & Settings` `210:2` | 15 |
| 9 Monetisation | `Monetisation` `219:2` | 10 |
| 10 System states | `System states` `225:2` | 9 |

### 4.4 Navigation

- **`Index` page** (`230:2`) — every flow, component page and foundation page as a clickable node link, with screen counts and a one-line description each. 23 links, all verified.
- Page order is now `Cover · Index · Page 1 · ——— FOUNDATIONS ——— · … · ——— COMPONENTS ——— · … · ——— SCREENS ——— · 10 flow pages`.

### 4.5 What is still outstanding

1. ~~**Fraunces Medium.**~~ **Resolved in Phase A (2026-10-21)** — the font does not exist in Figma, so the app moved to SemiBold 600. All 23 text styles built, every placeholder marking cleared.
2. **Open questions** — the table below, now pruned to genuinely open items. Several are real consistency bugs in the app, not design decisions.
3. **Ground rule 10 (visual verification against a real app render) was never satisfied** — see the caveat at the head of Phase 3. Screens are verified against source code and Figma screenshots only.

---

## Post-Phase-4 code fixes

Two of the open questions were consistency bugs with a clear right answer, so they were fixed in the app rather than left on the list.

### F-29 — one toggle, not three ✅

The app shipped **three** switch implementations: `ListRow`'s at 36×22, and two copies at 44×26 in `SettingsScreen.Toggle` and `YouDrillScreens.CustomToggle`. The You tab put two different sizes one tap apart. The off-state colour disagreed too — `ink[300]` in ListRow, `ink[200]` in the other two.

**The spec settles it.** `docs/specs/bookflow_list_row_system.html` says *"Toggle (36×22, forest-800 when on)"* — ListRow was right and the other two had drifted.

| Change | File |
|---|---|
| New canonical component | `src/components/Toggle.tsx` |
| Exported | `src/components/index.ts` |
| Private toggle + styles removed, now imports the shared one | `src/components/ListRow.tsx` |
| Local 44×26 `Toggle` removed, now imports | `src/screens/SettingsScreen.tsx` |
| `CustomToggle` removed, now imports | `src/screens/YouDrillScreens.tsx` |

The component takes two shapes on purpose: **without** `onChange` it renders display-only, because inside a `ListRow` the whole row is the tap target (hard rule 6) and the switch must not swallow the press; **with** `onChange` it is its own `Pressable`, for the Settings and drill rows that aren't built on `ListRow`. `dimmed` greys it to 50% and forces the off track, for the notification rows while the OS permission is denied.

Two deliberate behaviour changes, both toward the canonical:
- **Off track is now `ink[300]` everywhere** (was `ink[200]` in Settings and the drills) — matches ListRow, the spec-derived Figma atom, and reads more clearly as "off".
- **The knob keeps its soft shadow**, carried over from the Settings version. The spec fixes size and colour, not elevation, and the shadow is what makes a cream thumb legible on the light off track. ListRow rows gain it.

**Figma reconciled in the same pass** so the library doesn't document a bug that no longer exists: the `Settings toggle` (44×26) set was deleted, its 8 instances repointed at the canonical `Toggle`, and the `Toggle` description updated. Atoms: 20 → 19 sets. 0 orphan instances after.

### F-31 — the Pro card uses the tokens that already existed ✅

`ProPlanCard` hard-coded 13 colour values. The interesting part: **ten of them already existed in `tokens.ts`** — this was a bypassed token system, not a missing one.

| Literal | Now |
|---|---|
| `#D8D5CC` ×2 | `colors.ink[200]` |
| `#ECE9E0` | `colors.ink[100]` |
| `#8A8780` ×2 | `colors.ink[400]` |
| `#3D3A36` ×2 | `colors.ink[700]` |
| `#F5F1E8` | `colors.cream[100]` |
| `#4A7C59` | `colors.forest[400]` — **added** |
| `rgba(255,255,255,0.12)` | `overlay.onDark.track` — **added** |
| `rgba(255,255,255,0.14)` | `overlay.onDark.chip` — **added** |
| `rgba(212,165,116,0.15)` | `overlay.amber.fill` — **added** |
| `rgba(212,165,116,0.4)` | `overlay.amber.border` — **added** |

Two additions to `tokens.ts`:
- **`forest[400]` = `#4A7C59`** — a genuinely missing step. It reads on forest-800 where 600 is too close and 200 too pale. The same value already lived as `dark.accent` for the reader theme; the comment cross-references it.
- **`tokens.overlay`** — translucent overlays for dark surfaces, with the alpha baked into the string because React Native has no colour-mix at the style layer. That is precisely why these kept being retyped inline per screen.

`npx tsc --noEmit` reports **0 errors in `src/` and `App.tsx`**. (The ~90 remaining errors are all pre-existing Deno edge-function errors in `supabase/functions/`, which the RN tsconfig was never meant to cover.) The repo has no test suite, so there was nothing to run beyond the type check.

---

## Open questions F-1 … F-16 — answered and actioned

All sixteen Phase 0 questions were decided. Most turned out to be fixable in the app rather than design calls, so the work landed in code and Figma was reconciled to match.

| # | Decision | What changed |
|---|---|---|
| **F-1** | Paywall stays in RevenueCat — don't draw it | Nothing to build. `Monetisation / Hosted paywall (not in repo)` already marks the boundary and lists all five entry points. ✅ |
| **F-2** | Figma mirrors what the app renders | Already correct — all three reader presets use ×1.78 because that is what `ReaderScreen` lays out; the declared 1.5/1.8/2.0 only size the "Aa" preview glyph. Recorded on the three text styles. ✅ |
| **F-3** | Stroke width is **1.0** | `tokens.iconStrokeWidth` 1.5 → **1.0**; **143 of 148** `<Icon strokeWidth>` overrides removed across 38 files. The 5 kept are `strokeWidth={0}` on Tabler `*Filled` glyphs, which paint from `fill`. 161 Figma icon vectors set to 1.0, variable updated, CLAUDE.md hard rule 7 rewritten. ✅ |
| **F-4** | Publish `textStyles` only | Already the case — the 19 Figma text styles all come from `textStyles`. `fontSizes.display` stays a legacy raw scale, unpublished. ✅ |
| **F-5** | Build what the token implies | `input.focusRingWidth: 3` was dead config. The 3px ring now renders in **both** code and Figma, drawn as an outset halo (the field reserves 3px permanently via padding + negative margin, painted only on focus) so focus never reflows the field. Error/success keep their own border. ✅ |
| **F-6** | Add the tokens to code | `tokens.borderWidth` (hairline/default/focus) and `tokens.elevation[1-4]` added — each elevation step carries both iOS shadow props and Android `elevation`. The Figma Border and Elevation collections are no longer "derived". ✅ |
| **F-7** | Real bug — fix it | Four disagreeing speed sets collapsed to one. `readerStore.PLAYBACK_SPEEDS` is now the single source; `ListenScreen`, `PlaybackSpeedSheet`, `App.snapSpeed` and the pill cycle all derive from it. **3× is gone** — the sheet offered a speed the store rejected, so picking it produced a value that could not be saved as a default. A compile-time check now fails the build if the catalog and the store drift again. ✅ |
| **F-8** | Lockup geometry is canonical — fix the other in code | SVGs were already extracted in Phase 1. The reconciliation is now done too: **one definition** in `src/components/Logomark.tsx`. See below — there turned out to be **three** marks, not two. ✅ |
| **F-9** | `VoiceAvatar` is canonical | No change — it is already the Figma component, with the Listen-screen palette recorded as the variant. ✅ |
| **F-10** | Fix CLAUDE.md | Six stale claims corrected: Tabler not Lucide, no router (hand-rolled `stage` machine), `StyleSheet` + tokens not NativeWind, `expo-audio` not `expo-av`/track-player, WebView+`react-native-pdf` not `epubjs`, TanStack installed but mostly bespoke hooks, PostHog/Sentry/Resend absent. File tree and hard rules 7 and 9 rewritten. ✅ |
| **F-11** | Match the spec, real loading component | New `src/components/Spinner.tsx` built to `tokens.button.spinner` (16px / 1.5 stroke / 700ms, native-driver rotation). `Button` uses it instead of `ActivityIndicator`. ✅ |
| **F-12** | Make Retry work | `useNetworkState` now returns `refresh()`, which re-probes connectivity and updates state. The Library offline banner calls it instead of `() => {}`. ✅ |
| **F-13** | Paywall out, the rest in | New page **`Unreachable (built in code)`** with 7 frames: ComingSoon ×2, RestorePurchases ×2, StudentVerification, AppRating, RootErrorBoundary. Paywall surfaces deliberately excluded. Kept off the flow pages so those stay an honest map. ✅ |
| **F-14** | Include it | `tokens.epubWeb` added in code (the WebView cannot consume RN tokens, so the values are serialised into injected CSS), plus a `Reading / EPUB-Web/` variable group of 7 in Figma. The representative frame already exists: `Reader / Full / EPUB`. ✅ |
| **F-15** | Tokenise them in code | Added `successBorder`, `errorBorder`, `skeletonFrom`, `skeletonTo`, `notificationTint`, `cardPaused`, `sepiaSwatch`, `sepiaSwatchText`, `white`, `shadow` to `tokens.colors`, and the 7 EPUB-Web values. Mirrored as Figma variables. ✅ |
| **F-16** | Fix with the correct info | Six fixes — see below. ✅ |

### F-8 resolved — there were three logomarks, not two

The lockup geometry is canonical. Correcting the auth mark surfaced a third copy of the same wrong shape.

| Where | Geometry | Status |
|---|---|---|
| `Lockup.tsx` | `M14 33.4 C22 14.2 30 14.2 38 33.4` + echo, stroke 4.32, controls at 33% / 67% | **canonical** |
| `AuthCallbackScreen.Logomark` | `M 25 80 C 33.5 22 66.5 22 75 80` + echo, stroke 9, controls at 17% / 83% | replaced |
| `SplashScreen` — animated **and** web-static branches | same wrong geometry, twice more | replaced |

So the mark on the very first screen of the app, and on the magic-link screen, was not the mark used everywhere else.

**The fix is one definition, not three corrected copies.** `src/components/Logomark.tsx` now owns the artwork and exports it:

- `LOGOMARK_MAIN` / `LOGOMARK_ECHO` — the path data, lifted verbatim from the lockup
- `LOGOMARK_STROKE` = 4.32
- `LOGOMARK_VIEWBOX` = `11.84 16.84 28.32 18.72` — cropped to the mark's own bounds including the 2.16 stroke half-width, so the mark can be sized standalone
- `<Logomark width={n} />` — height derived from the fixed 28.32 : 18.72 aspect, so it can never be stretched

`Lockup.tsx` renders the same constants against its own `0 0 196 52` viewBox. `AuthCallbackScreen` renders `<Logomark width={64} />`. `SplashScreen` uses the component for its web branch and the same constants inline for the animated branch, because the draw-on animates `strokeDashoffset` per path.

**The draw-on animation needed its numbers recomputed.** `MAIN_DASH` / `ECHO_DASH` were 110 / 80 — rounded-up lengths of the *old* curves (107.16 / 76.51). The canonical arcs measure 39.25 and 25.12 in the cropped viewBox, so those constants are now **40 / 26**. Left unchanged, the splash would have drawn its stroke and then sat with a visible offset.

Figma reconciled: the Brand page's "⚠ Second logomark — pending reconciliation" section is now "✅ resolved", the retired shape dimmed to 45% and labelled *RETIRED — no longer rendered anywhere*.

Verified: `grep` for the old control points returns **nothing** across `src/` and `App.tsx`.

### F-16 in detail

| Finding | Fix |
|---|---|
| Voice fallback was `'Rachel'`, not one of the six voices | → `'Aria'`, the actual free voice |
| `ListenScreen` comment said the free tier exposes Rachel | → Aria |
| Android adaptive-icon background was `#ffffff` | → `#FAF7F2` (cream-50), matching the app |
| `space` had no 20 or 40 step, so `spacing[5]`/`spacing[8]` were unreachable by semantic name | Added `ml: 20`; ladder renumbered to 4·8·12·16·20·24·32·40·48·64, now matching `spacing`. Verified no consumers of the renamed steps first |
| Upload step 3 promised "Generating audio — starts after text is ready", which never runs at upload | → "When you first tap Listen", which is when it actually happens |
| `ChapterSheet` named for chapters in a page-based reader | Documented rather than renamed: it genuinely handles both (Chapters/Pages filter when metadata exists, pages otherwise) and the header label already derives from the real unit. A rename touches five files for no behaviour change |

**Not fixed, deliberately:** the three coexisting sign-out confirmations (`YouScreen.SignOutSheetBody`, `AccountScreen.SignOutBody`, dead `SignOutConfirmSheet`). Consolidating them is a real refactor across two live screens, and it was not in scope for a round of question-answering — flagged as the obvious next cleanup.

### Verification

`npx tsc --noEmit` → **0 errors in `src/` and `App.tsx`** after every change. The remaining ~90 errors are pre-existing Deno edge-function errors in `supabase/functions/`, outside the RN tsconfig. **The repo has no test suite**, so the type check plus Figma screenshot review is the whole automated signal — the app was not run.

---

## Deviations from the brief (and why)

1. **Single file, not three.** User decision: use this existing file as Foundations.
2. **`Component` collection added** beyond the brief's list (Spacing / Radius / Border / Elevation). Phase 2 components must bind to variables rather than raw numbers (ground rule 2), and foundations must exist before dependents.
3. **WEB code syntax is the RN token path, not `var(--x)`.** No CSS variables exist in this codebase.
4. **Reader themes are a separate collection, not modes of `Semantic/Color`.** Modelling them as global modes would wrongly imply the whole app re-themes; it does not (`app.json` → `userInterfaceStyle: "light"`, no `useColorScheme` anywhere).
5. **`Border` and `Elevation` are derived**, and labelled as such in every description. Code has no such tokens.
6. ~~**4 text styles withheld**~~ — the deviation is gone. Ground rule 6 held (no silent substitution); the question went back to code and `tokens.fonts.display` moved to SemiBold 600, so all 23 styles are built at a weight both sides genuinely have.

---

## Open questions — still genuinely open

Answered items are **not** kept here; they live in §"Open questions F-1 … F-16", §"Post-Phase-4 code fixes" and the Phase A/B sections. This table is only what is still undecided.

| ID | Question | Blocks |
|---|---|---|
| ~~**F-42**~~ | ~~Every brand asset still carries the retired logomark~~ — **FIXED.** All four regenerated with composition preserved; verified on device, splash now renders at **0.662**. | ✅ done |
| ~~**F-41**~~ | ~~Native splash ships the retired logomark~~ — **FIXED.** Asset regenerated from the canonical path data; ink ratio 0.895 → **0.659** against a canonical 0.661, and sized/placed so the handoff to the JS splash no longer jumps. | ✅ done |
| ~~**F-40**~~ | ~~`List row` can show a hint OR a chevron, not both~~ — **FIXED.** `Hint` is independent of `Trailing` now; 49 instances moved, the Hint axis value retired, 30 → 24 variants. | ✅ done |
| ~~**F-43**~~ | ~~`AccountListRow` is a fourth row pattern with chevrons on action rows~~ — **FIXED.** Migrated to `ListRow`; 5 wrong chevrons removed, 2 treatments corrected against the spec. | ✅ done |
| **F-39** | Discover home shows "Couldn't reach the catalog" while other sources returned 748 books. Observed on device. | Phase D |
| **F-38** | The EPUB WebView renders fallback fonts, not the brand faces — both Fraunces and Literata resolve to Georgia. Measured, not assumed. | architecture discussion |
| **F-17** | `Button.tsx` and `ListRow.tsx` pair `fontWeight: '500'` with `fonts.ui` (Geist **Regular**), so their labels render Regular while Figma shows Medium. | Phase B |
| **F-18** | `ModeTogglePill`'s `variant="dark"` is passed by no caller, and its code comment describing the PDF header as black-translucent is stale. | Phase B |
| **F-19** | Figma `Stat card` exposes Value/Label only; code's `StatCard` also has `unit` and `delta`. Extend the component? | Phase 4 |
| **F-20** | Now-playing hero card uses `#fff` / `rgba(255,255,255,…)` / `#2C3B31` inline instead of tokens. Adopt into `tokens.ts`? | Phase 4 |
| **F-21** | Two near-duplicate recently-listened rows with different metrics (`ListenHistoryScreen.Row` vs `ListenNowPlayingScreen.recentRow`). Converge? | Phase 4 |
| **F-22** | Transport icon opacity resolves opaque inside instances (Figma binding quirk). Cosmetic. | Phase 4 |
| **F-23** | `readTime` / `chapters` / `related` are rendered but never populated — dead UI on book detail. Populate or delete? | Phase 4 |
| **F-24** | Book-detail `Free badge` and `Topic tag` duplicate the canonical `Badge` atom. Fold in? | Phase 4 |
| **F-25** | Book-detail CTA is 48/10/14 — matches no canonical Button size. Resize or add a size? | Phase 4 |
| **F-26** | Destructive confirmation differs by entry point: Library uses the bottom sheet, Discover uses a native alert. Breaks CLAUDE.md hard rule 5. | Phase 4 |
| **F-27** | Free-book cap diverts to the hosted paywall with no visual state on the Add button. | Phase 4 |
| **F-28** | The Discover "For you" chip renders in the active style but its onPress is a no-op. Make it filter, or restyle it? | Phase 4 |
| **F-30** | Three row patterns (ListRow / SettingsRow / RadioRow) and two header patterns (centred DrillHeader vs left-aligned SubHeader) coexist in one flow. | Phase 4 |
| **F-32** | `YouScreen.Meter`'s `unlimited` branch is never reached from the free card; the Pro card uses a second, different unlimited chip. | Phase 4 |
| **F-33** | Top-up prices live in the store, not the repo — Figma prices are placeholders. Confirm the real price points? | Phase 4 |
| **F-34** | ~1,600 lines of unreachable monetisation UI (PaywallSheet, PaywallScreen, RestorePurchasesScreen, StudentVerificationScreen). Delete or wire up? | Phase 4 |
| **F-35** | No in-repo upgrade UI at all — every path goes to the hosted paywall. Design a Bookflow paywall, or stay hosted? | Phase 4 |
| **F-36** | Three more unreachable screens (NotificationPermissionSheet, ComingSoonScreen, AppRatingSheet). With F-34 that is ~2,270 lines of dead UI — the concrete answer to F-13. | Phase 4 |

---

## Resume protocol

> "Continuing the Bookflow Figma build. File `Rt3gjNC24kBTrncxlnkuPW`. Load the `figma-use` and `figma-generate-library` skills, read `docs/figma/FIGMA_BUILD_LOG.md` and `docs/figma/BOOKFLOW_FIGMA_INVENTORY.md`, then pick up from the open-questions table — Phases 0–4 are complete."

**Phases 0–4 are COMPLETE.** 108 screen frames across 10 flows, 98 component sets, 248 variables. 0 detached instances, 0 orphan instances, 0 unbound fills, 0 components without a description. The 12 route-map surfaces missing after Phase 3 were built in Phase 4 rather than reported as gaps.

**Still outstanding:** the open questions below, and ground rule 10 — now **partially** satisfied: the app has been run on an iPhone 17 Pro simulator and the splash is the first surface ever compared against a real render (see the addendum at the end of this log). The other 107 frames remain uncompared.

**Phase 4 is done.** What remains is not build work: answer the open questions, add Fraunces Medium and run the one switch-over pass, and decide what to do about the ~2,270 lines of unreachable UI (F-34, F-36).

**Lesson that cost the most rework:** read the actual screen file before building a screen. Flow 6 had three screens built from a plausible-looking assumption; `ListenHomeScreen.tsx` and `ListenHistoryScreen.tsx` are separate files from `ListenScreen.tsx`, and all three screens had to be rebuilt. Check `src/screens/` for sibling files before starting any flow.


---

## Addendum — 2026-10-21 · first real app render (ground rule 10)

Ground rule 10 ("compare against a real app render") was unsatisfiable for all of Phases 0–4. It no longer is: the iOS dev client now builds and runs.

**Three environment blockers, all artefacts of the machine's home directory having previously been `/Users/completefarmer`:**

| Blocker | Fix |
|---|---|
| CocoaPods crashed with `Encoding::CompatibilityError` under Ruby 4.0.3 | `LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 RUBYOPT="-E UTF-8" pod install` |
| Xcode module cache compiled under the old home path | cleared `ModuleCache.noindex` + project DerivedData |
| Hermes/RNDeps build scripts died on `/Users/completefarmer/.nvm/.../node: No such file` | repointed `ios/.xcode.env.local` (gitignored; `.bak` kept) |

**A fourth blocker was Metro, not the build.** The dev client reported `Failed to load app from http://127.0.0.1:8081`. Metro served the 27 MB bundle fine (HTTP 200 in 1.3 s), but the **manifest** endpoint returned HTTP 500:

```
{"error":"UnexpectedServerData: Unexpected server error: No returned query result"}
```

`npx expo whoami` fails with the same error from `UserQuery.currentUserAsync` — the stored Expo session token is stale, and the manifest middleware calls the Expo GraphQL API before it will stamp a manifest. **Workaround: `npx expo start --offline`**, which skips every API call; the manifest then returns 200 and the app loads. The real fix is `npx expo login`.

**Splash draw-on — measured, not assumed.** Captured with `simctl io recordVideo` (600 fps timebase, 334 frames), frames extracted and the logo region measured pixel-by-pixel.

- The mark renders at exactly **96 × 63 pt** — bounding box x 153–248, y 370–432. That is `LOGO_W` × `LOGO_H` to the pixel, which independently confirms `LOGOMARK_VIEWBOX` crops to the mark's true bounds with no dead margin.
- The main arc sweeps the **full** 96 pt width (ink reaches x = 247 of a 248 right edge) — **no gap, no early stop.** The F-8 dash fix (110 → 40, 80 → 26) is correct on device, not just in the browser harness.
- Main arc saturates ~1.0 s after first ink, echo ~1.15 s; normalised progress 0 / .16 / .65 / .92 / 1.0 at 0 / 250 / 500 / 750 / 1000 ms — the S-curve of `Easing.bezier(0.4, 0, 0.2, 1)`.

**F-37 — found, then fixed.** The splash was replaced at **~1.25 s**, not 5 s. `App.tsx`'s session-restore effect flipped `stage` off `'splash'` as soon as `getSession()` + the `profiles` query resolved, so for a returning signed-in user the 5 s hold never happened and the breathing pulse — scheduled at `DRAW_DURATION_MS` = 1400 ms specifically so a 5 s hold would not read as frozen — **never ran at all**.

Fixed by splitting the hand-off: session restore decides *where* to go and parks the answer in `postSplashStage`; the splash's own timer decides *when*, via `splashDone`. Both must land before `stage` moves. If restore is slower than the splash the splash simply stays up and keeps breathing (`withRepeat(-1)`), which is an honest "still working" state rather than a frozen logo. Every restore branch now sets a destination, the `profiles` query is capped at 4 s (the `Promise.race` pattern already used in `aiAudio.estimateDownload`), and an 8 s ceiling degrades to Welcome if some unanticipated boot path answers with nothing. The deep-link handler still wins outright — a magic link tapped during the splash goes straight to the verifying screen.

**Re-measured on device after the fix.** First with the original
`TOTAL_DURATION_MS` = 5000 (567 frames), then at **3100** — one breath
instead of two, the shipped value (589 frames):

| | before the fix | 5000 (two breaths) | **3100 (shipped)** | expected at 3100 |
|---|---|---|---|---|
| Splash visible | 1250 ms | 5053 ms | **3133 ms** | 3100 ms |
| Draw complete | ~1000 ms | ~1018 ms | **~1050 ms** | 1200 ms tween, saturates earlier |
| Breath peak | never ran | 2217 ms | **2247 ms** | 2250 ms |
| Back to ×1.00 | never ran | 3017 ms | **3097 ms** | 3100 ms |
| Second breath | never ran | 3933 / 4733 ms | — | n/a |
| Pulse amplitude | — | +6.4 % w, +6.5 % h | **+6.4 % w, +6.5 % h** | ×1.06 |

At 3100 the logo settles back to ×1.00 at 3097 ms and the splash leaves
at 3133 ms — the hand-off lands on the end of the breath, 36 ms later,
then a clean cut to the Library skeleton. Two breaths cost ~1.9 s more on
every cold start for a second identical cycle, which is not a trade worth
making for Ama on a bus; `TOTAL_DURATION_MS` stays the single knob if that
ever changes (4800 restores two).

---

## UI cleanup round — Phase A (2026-10-21)

Branch `ui-cleanup`, cut from `v11-batch`. One commit per finding so any single decision can be reverted on its own.

### A1 — build-log cleanup

The log had drifted out of agreement with itself. Fixed:

| Was | Now |
|---|---|
| Phase status showed Flows 3 and 6–10 pending | Phases 0–4 complete |
| Open-questions table still listed Fonts, Frame size, F-1, F-2, F-3, F-6, F-8, F-13, F-29, F-31, F-37 — all answered | 11 answered rows removed; the table now holds only genuinely open items, and gained F-17 and F-18, which had been raised in prose but never tracked |
| §"Phase 3 complete" said Library 11, Reader 11 — both wrong, and the total did not reach its own stated 96 | Library **12**, Reader **10**; the table is now labelled as the end-of-Phase-3 snapshot and points at §4.3 for the current file |
| §4.3 said 248 variables, 19 text styles | **263** variables, **23** text styles — counted in the file, not carried forward |
| Resume protocol still asked for a Phase 2 publish decision | removed — it was answered in the Phase 2 close-out |
| Source line pinned to `v11-batch` HEAD `5cfc5fb` | branch `ui-cleanup` |

### A2 — the font is settled

**Fraunces Medium does not exist in Figma**, checked twice: `listAvailableFontsAsync` returns Thin / Light / Regular / SemiBold / Bold / Black (+ italics) and no variable weight axis, and a direct `loadFontAsync({ family: 'Fraunces', style: 'Medium' })` throws with that same list. The user offered to install the static Fraunces Medium locally first; it is not there, so this is the second path.

**The app moved to the weight both sides have.** `tokens.fonts.display`: `Fraunces_500Medium` → `Fraunces_600SemiBold`. The `Fraunces_500Medium` import and `useFonts` entry are gone — nothing else referenced it. 125 call sites pick the change up through the token.

| Then built at SemiBold | Spec |
|---|---|
| `Display/LG` | 36 / 44 |
| `Display/MD` | 28 / 36 |
| `Display/SM` | 22 / 30 (also the BottomSheet title) |
| `Reading/EPUB/Spine title` | 25.5 / 31.875, tracking −0.255 |

Text styles 19 → **23**. Every placeholder marking cleared: 4 callout texts rewritten (Cover `115:76`, Index `230:179`, Typography — UI `107:7` and `107:8`) and the ⚠ PLACEHOLDER WEIGHT sentence stripped from **18** component descriptions. The nodes themselves did not change — they were already SemiBold; SemiBold just stopped being a stand-in.

> A line-based filter emptied two single-line descriptions (`Book detail header` `191:426`, `Drill header` `208:558`) before they were restored by hand. A follow-up sweep confirms **0 of 166** documentable components are missing a description.

#### Three things this surfaced — none fixed, all need your call

1. **`displayBold` now collides with `display`.** Both resolve to `Fraunces_600SemiBold`. The splash wordmark (36px) and the onboarding fake-cover title (11px) ask for `displayBold` by intent but no longer render heavier than anything else. Promote `displayBold` to `Fraunces_700Bold` to restore the contrast, or collapse the two token names.
2. **102 of the 125 `fonts.display` sites still declare `fontWeight: '500'`.** Inert — Expo Google Fonts registers each weight as its own family, so the declaration has nothing to select — but it is now stale documentation sitting next to a SemiBold family, the same class of noise as F-17.
3. **The EPUB spine title still declares `font-weight: 500`** in `EpubFullReaderScreen.tsx`'s injected CSS. That is a WebView surface with no Fraunces webfont loaded, so it renders the Georgia fallback; changing it to 600 is a visible change to a reading surface and was not made unasked.

#### Weight change — where to look on device

Every Fraunces surface in the app gets one step heavier (500 → 600). The largest type carries it most visibly, so check these first: the **Welcome headline**, the **Library / Discover / Listen / You tab titles** (all 28px), the **book detail title** (22px), **sheet titles** (17–20px), and the **reader chapter title** (20px). The small cover captions (6–9px) are where a heavier face is most likely to look muddy rather than crisper.

---

### F-38 — the EPUB WebView renders fallback fonts, not the brand faces

Measured on the iPhone 17 Pro simulator with a temporary probe injected into
`EpubFullReaderScreen`'s existing scroll bridge (installed, read, reverted —
`git status` clean afterwards). Canvas text-width of `"Handgloves MWmw"` at 40px:

| Stack measured | Width | Reading |
|---|---|---|
| `serif` (generic) | 334.39 | baseline |
| `Georgia` | **359.71** | resolves — a real, distinct face |
| `'Literata', serif` | 334.39 | **identical to generic** → did not resolve |
| `'Fraunces', serif` | 334.39 | **identical to generic** → did not resolve |
| `'NoSuchFontXYZ', serif` | 334.39 | control — same as both brand faces |

The control is what makes this conclusive: a deliberately nonexistent family
measures exactly what Literata and Fraunces measure.

`document.fonts.check('17px Literata')` returned **true** for both, which is a
false positive — the API answers "available or loadable", not "will render".
The width measurement with a control is the reliable signal.

**What the reader actually shows.** The injected CSS stacks are
`'Literata', 'Georgia', 'Times New Roman', serif` for body and
`'Fraunces', 'Georgia', serif` for headings. Neither brand face resolves, so
both fall through to **Georgia** — the same face for both. Full-mode EPUB
therefore has no typographic distinction between its display serif and its
reading serif; the two collapse into one, separated only by size and weight.

**Cause.** There is no `@font-face` anywhere in the document, and the app's
fonts are registered at runtime by `expo-font` into the RN process. WKWebView
runs its content in a separate process and does not inherit them. The code
comment at `buildDocument` already half-knew this — *"font-family falls back
through serifs the device is likely to have"*.

**Android confirmed, and it diverges from iOS.** Checked directly on the
`bookflow_pixel9` emulator (API 35):

- `/system/fonts` contains **no** Literata and **no** Fraunces.
- It contains no Georgia either. The two files that match the string —
  `NotoSansGeorgian-VF.ttf` and `NotoSerifGeorgian-VF.ttf` — are the Georgian
  *script*, not the typeface.
- `/system/etc/fonts.xml` carries `<alias name="georgia" to="serif" />`, and
  `serif` maps to `NotoSerif-Regular.ttf`.

So the body chain `'Literata', 'Georgia', 'Times New Roman', serif` resolves to
**Noto Serif** on Android, and the heading chain `'Fraunces', 'Georgia', serif`
resolves to **Noto Serif** as well.

| Platform | Body renders | Headings render |
|---|---|---|
| iOS | Georgia | Georgia |
| Android | Noto Serif | Noto Serif |

Two different fallback faces across the two platforms, and on each platform the
display serif and the reading serif collapse into one. Ama and David are not
reading the same book in the same typeface.

**Deferred to the architecture discussion**, per decision. The fix is to serve
the two faces to the WebView as base64 `@font-face` rules or from a local
asset server — which is a loading-strategy decision, not a UI cleanup.

**Figma:** `Reader / Full / EPUB` (`157:382`) stays as the *intended* design and
is marked as **not matching the app pending F-38**, rather than being redrawn in
Georgia to copy the shortfall. Per the verification rule — do not change Figma
to match a bug.

---

### Decision 2 verified on both platforms — `fontWeight` removal is a no-op

The concern was Android, where `fontFamily` + `fontWeight` resolution differs
from iOS. Measured by reverting `393d41f` in place, letting Metro fast-refresh,
capturing, then restoring the tree.

| Platform | Screen | Region | Pixels differing |
|---|---|---|---|
| iOS (iPhone 17 Pro) | Library — Fraunces at 28 / 20 / 15 / 13 | full content band | **0 of 1,591,920** |
| Android (Pixel 9 class, 411×923 dp) | Welcome — Fraunces headline + italic emphasis | headline only | **0 of 378,000** |
| Android | Welcome | headline + body + CTA | **0 of 756,000** |

The only pixels that moved anywhere on the Android screen were a 184×89 block
at the top right — the dev-client's floating tools button, which animates.
Excluding it, the screens are identical.

Conclusion: Expo Google Fonts registers each weight as its own family on both
platforms, so a `fontWeight` beside a fully-qualified family name has nothing to
select. Removing 107 of them changed nothing — which is the point: they were
documentation that had gone false, not instructions.

---

### F-39 — Discover shows total failure while most sources succeeded

Observed on the iPhone 17 Pro simulator, 2026-10-21, while verifying F-25.

The Discover home rendered its full-page error state — *"Couldn't reach the
catalog / Something went wrong reaching the catalog…"* — with no rails at all.
The Metro log for the same load:

```
WARN  [Discover] DOAB rail fetch FAILED: DOAB returned 403
LOG   [Discover] Wikisource rail fetch ok, books: 24
LOG   [Discover] Wikisource search pool fetch ok, books: 200
LOG   [Discover] Open Library rail fetch ok, books: 24
LOG   [Discover] Open Library search pool fetch ok, books: 500
```

**748 books came back** across two sources, and the user was shown nothing.

This contradicts the product principle the rest of the app follows carefully —
*honest empty/edge states: explain what still works*. The offline banner does
this well (*"No connection · Reading still works · Streaming unavailable"*); the
Discover error state does the opposite, hiding working content behind a blanket
failure.

**Not yet diagnosed.** The Gutenberg rail logged nothing either way, so it
either failed silently or was never attempted, and the home `error` state looks
to be driven by it alone rather than by whether *any* rail has content. The
build log's own Flow 7 note claims the opposite behaviour — *"a cold start with
one slow source shows a shorter page rather than empty headings"* — so either
the note or the code is wrong. Needs a read of the home fetch orchestration.

Recorded rather than fixed: this is a code bug surfaced by running the app, not
a Figma reconciliation, and it was found mid-F-25. Figma's
`Discover / Home / Error` frame (`201:395`) is a faithful drawing of the state
as built, so it stays — the question is when the state should be *entered*.

**Side effect for Phase D:** book detail is unreachable from Discover while the
catalog is failing, so F-25's CTA bar could not be visually confirmed on device.
It is type-checked and structurally simple, but it is **not** visually verified.

---

## UI cleanup round — Phase B (code) and Phase C (Figma)

### Phase B — 16 commits, one per finding

| ID | Commit | Outcome |
|---|---|---|
| F-17 | `71a2680` | Button + ListRow labels render Medium. ListRow's weight is per size, so `listRow.fontWeight.label` became `listRow.labelFont` carrying the family |
| F-18 | `2cc1399` | **Premise was wrong.** `variant="dark"` IS passed, by `ReaderScreen` on the Dark theme. Comment fixed, variant kept |
| F-19 | Phase C | Figma-only |
| F-20 | `75ce5d6` | 28 literals → tokens; 12 new `overlay.onDark.alpha[NN]` steps |
| F-21 | `be07f31` | One `RecentListenRow` with `size="regular"/"compact"` |
| F-23 | `c786b90` | Dead book-detail metadata removed (−98 lines) |
| F-24 | `be07f31` | New `Badge`. **No Badge existed in code** — Figma's atom was built from screen styles |
| F-25 | `af30289` | CTA → canonical Button at Large; sample button 48→52 |
| F-26 | `e0fd47b` | `RemoveBookSheetBody` shared by Library and Discover |
| F-28 | `72462a8` | "For you" scrolls to top |
| F-30 | `e97689d`, `87674c2` | One `SubHeader`, one row. Two hard rules fixed on the way |
| F-32 | `84f322b` | Dead unlimited branch removed |
| F-13 | `aede37c` | `RetryQuestionsScreen` deleted — retry already worked in place |
| F-34 | `1af5823` | −1,622 lines; `SoftWarningBanner` extracted to components |
| F-36 | `29c2be1` | −668 lines |
| sign-out | `caa76b7` | One `ConfirmSheetBody` replacing four near-identical bodies |

**2,635 lines of unreachable UI deleted.** `npx tsc --noEmit` clean in `src/` after every commit.

Two hard rules were fixed inside F-30 rather than as findings of their own:

- **Rule 3 — chevrons mean "drills into more".** `SettingsRow` drew one on any row with an `onPress`, which put a chevron on **Clear cache**. Only the four real drill-ins carry `drillsInto` now.
- **Rule 6 — the tap target is the whole row.** The three toggle rows passed a live `<Toggle>` as trailing content, so only the switch was tappable. They use `ListRow`'s `toggle` prop now, which renders a display-only switch and lets the row own the press.

A regression caught on device and fixed in the same phase: `ListRow` clamps sub-labels to one line where `SettingsRow` wrapped them, so Clear cache's explanation truncated at *"Books and progr…"*. `sublabelLines` added.

### Phase C — Figma reconciliation

| Change | Result |
|---|---|
| Badge gains Free / Tag / Tag compact | 7 kinds; 19 instances swapped off `Free badge` and `Topic tag`, both deleted |
| `Size=Compact` | Does **not** map cleanly — it is a denser variant (radius, padding, size *and* ink), so it became `Kind=Tag compact` |
| Listen rows merged | One `Recent listen row` set, `Size=Regular/Compact` × 3 states; 3 instances repointed, old set deleted |
| Settings row → List row | **44 instances** swapped, 0 failures; `Settings row` deleted |
| Drill header → Sub header | 7 instances swapped; `Drill header` deleted |
| `List row` gains `Hint` | The 17 hint rows would have lost their text — the set had no Hint property |
| Stat card | Now a set: `Unit`, `Delta`, `Show delta`, `Show unit`, `Delta tone=Default/Muted` |
| CTA bar | Rebuilt from Button instances at Large; sample button 52×52 |
| Remove confirm | Native-alert frame replaced with the sheet over the detail screen |
| Dead code | `Paywall sheet` + doc block, `Related book card`, the unreachable-metadata frame, and the whole **Unreachable** page deleted. `RootErrorBoundary` moved to System states as a crash boundary **is** reachable |
| Descriptions | 3 named deleted files; repointed. Both dead-code annotations rewritten to past tense |
| Index | The link to the deleted page removed |

### Phase C audit

| Check | Result |
|---|---|
| Detached instances | **0** |
| Orphan instances | **0** |
| Components without a description | **0** of 159 |
| Descriptions naming a deleted file | **0** |
| Dead Index links | **0** |
| Variables at `ALL_SCOPES` | **0** of 263 |
| Variables missing WEB code syntax | **0** |
| Unbound fills — 10 screen pages | **0** |
| Unbound fills — 3 component pages | **0** |
| Unbound fills — foundation/specimen pages | **1,144** — see below |

> The 1,144 are all on Cover, Brand, Icons and the colour / typography / scale specimen sheets: swatch chips, type samples and scale bars painted as raw values. Phase 4's "0 unbound fills" was scoped to screens and components, which still holds. Whether a swatch *demonstrating* `forest/800` should itself bind to `forest/800` is a real question — it would make the sheets self-updating — but it is a new decision, not a regression.

### New counts

| | Before | After |
|---|---|---|
| Screen frames | 108 | **108** (−1 Book detail metadata, +1 crash boundary) |
| Pages | 29 | **28** (Unreachable deleted) |
| Component sets | 55 | **52** |
| Standalone components | 110 | **107** (68 are icons) |
| Sets + non-icon components | 98 | **91** |
| Variables | 263 | **263** |
| Text styles | 19 | **23** |
| Effect styles | 4 | **4** |

### Still outstanding in Phase C

1. ~~**No `Sheet / Sign out` organism.**~~ **Built** as `Sheet / Confirm`
   (`273:2`), named for what the code component actually is —
   `ConfirmSheetBody` backs sign-out *and* delete-account, so naming it
   "Sign out" would have described one of its two uses. Both screen sheets are
   instances of it now. See the section at the end of this log.

2. **F-28 has no prototype link**, deliberately. Scroll-to-top is not a navigation; it is recorded on the Category chip's description instead.
3. **Pages were not re-screenshotted wholesale.** `You / Settings` and the new Book detail remove frame were checked; the rest of You & Settings was verified structurally (0 orphans, 0 detached) but not visually.

### F-40 — List row cannot show a hint and a chevron together

Found by putting the Figma Settings frame beside the device screenshot after the Phase C swap.

`List row` models `Trailing` as a single choice: `None | Chevron | Toggle | Check | Hint`. The app renders `hint` and the `drillsInto` chevron **independently**, and every Settings drill-in shows both — *"Reading display    Literata · 20px    ›"*. Figma can show one or the other.

The old `Settings row` had a `Trailing=Hint + chevron` option, which is why the model worked before; it had zero instances, so the Figma screens were already showing hint-only against an app showing hint-plus-chevron. The swap did not cause this, it exposed it.

**Fix:** make `Hint` independent of `Trailing` — a `Show hint` boolean plus a hint node in every variant — and drop `Trailing=Hint`. That is surgery on a 30-variant set, so it is recorded rather than attempted mid-reconciliation.

Two smaller drifts spotted in the same comparison, for Phase D: the hint values differ (Figma *"Literata · M"* / *"1.25×"* against the app's *"Literata · 20px"* / *"1×"*).

---

### F-41 — the native splash still ships the retired logomark

Found on the first frame of Phase D, launching the Android build cold.

F-8 established that the lockup geometry is canonical and replaced three code
copies of a wrong mark — `AuthCallbackScreen`, and the splash's animated and
web-static branches. It did not touch **`assets/splash-icon.png`**, which is
what `app.json`'s `splash.image` points at and therefore the very first thing
every user sees on a cold start, on both platforms.

Measured from the asset's own ink bounding box:

| | height / width |
|---|---|
| `assets/splash-icon.png` | **0.895** |
| Retired auth-variant geometry | ~0.87 |
| Canonical `Logomark` (28.32 : 18.72) | **0.661** |

It is the retired shape. The echo is also a flat grey-green rather than
forest-800 at 0.45 opacity, and there is no wordmark.

**What the user actually sees on a cold start:** the retired, too-tall mark
(native splash) → then the canonical, shallower mark draws itself on (JS
splash). The logo visibly changes shape during the handoff, which is the exact
failure the native splash is supposed to prevent.

**Fixed** (`d675836`). Rasterised from the canonical path data in
`src/components/Logomark.tsx`. With no SVG renderer on the machine the stroke is
drawn as a **distance field** — per-pixel distance to the curve's centre line,
thresholded at the stroke half-width — which gives exact round caps and joins,
because that is what `stroke-linecap="round"` means, plus analytic antialiasing
from the distance itself (226 distinct alpha values, transparent background
preserved).

| | ink ratio |
|---|---|
| Before | 0.895 |
| **After** | **0.659** |
| Canonical | 0.661 |

Two choices beyond the geometry, to make the handoff seamless rather than merely
correctly-shaped:

- **Size.** 245px in the 1024 canvas, so `resizeMode: contain` renders it at
  ~96dp — what the JS splash draws. The old asset was 438px → ~176dp, then
  jumped to 96.
- **Position.** 92px above canvas centre. The JS splash centres a
  logomark+wordmark stack, putting the logomark 36dp above screen centre; this
  lands in the same place. The old asset sat 58px *below* centre.

**⚠ Fixing the splash asset does not change what Android users see.** Verified
on the emulator after a clean uninstall, reinstall and Metro cache clear: the
splash still renders the retired mark at ratio 0.895.

The reason is in `android/app/src/main/res/values/styles.xml` —
`Theme.App.SplashScreen` sets only `windowBackground` and no
`windowSplashScreenAnimatedIcon`, so **Android 12+ falls back to the launcher
icon**. The canonical `splashscreen_logo.png` drawables are in the APK and
unused. Confirmed by elimination: the installed APK contains **zero** images
with the retired ratio, yet the screen shows one — and the launcher icon's
ratio (0.894) matches the on-screen mark (0.895) exactly.

### F-42 — every brand asset still carries the retired logomark

Measured from each asset's own ink bounding box:

| Asset | Used for | ink ratio |
|---|---|---|
| `assets/icon.png` | iOS app icon, App Store | **0.893** |
| `assets/adaptive-icon.png` | Android launcher **and the Android 12+ splash** | **0.894** |
| `assets/favicon.png` | web | **0.906** |
| `assets/notification-icon.png` | notification small icon | **0.906** |
| `assets/splash-icon.png` | native splash (iOS; unused on Android 12+) | 0.659 ✅ fixed |
| Canonical `Logomark` | — | **0.661** |

F-8 corrected the mark in code. It never reached a single shipped brand asset.
The icon on both stores, the launcher icon, the favicon and the notification
icon are all the retired shape.

**Fixed** (`25bb718`), with each composition preserved exactly — same canvas,
same background, same ink colours, same mark width and the same mark centre.
Only the curve geometry changed.

| asset | before | after | mark |
|---|---|---|---|
| `icon.png` | 0.893 | **0.663** | 450px @ (511.5, 572.5), cream on forest-800 |
| `adaptive-icon.png` | 0.894 | **0.663** | 388px @ (511.5, 564.0), forest on transparent |
| `favicon.png` | 0.906 | **0.667** | 32px @ (31.5, 36.0) |
| `notification-icon.png` | 0.906 | **0.662** | 194px @ (127.5, 127.5), monochrome white |

**Width** is held constant rather than height: in a square icon the horizontal
extent sets how large the logo reads, and holding it means nothing can overflow
a safe area that previously fit. The canonical mark is shorter, so each sits a
little lower in its optical box than the taller retired one did; the centre is
unchanged.

Echo opacity preserved per asset — 0.45 on the icon, adaptive icon and favicon
(cream-50 at 0.45 over forest-800 resolves to exactly the `(127,147,136)` the
old icon used), and fully opaque on the notification icon, which Android
requires to be monochrome.

**Verified on device.** Clean uninstall, reinstall and relaunch on the Pixel 9
emulator: the Android splash now renders the mark at ratio **0.662** against the
canonical 0.661. It was 0.895. Capture in
`docs/figma/verification/android/01-splash.png`.

### Android now uses the logomark, not the launcher icon

With the icon set corrected the splash looked right, but only by accident — it
was still rendering the *launcher icon*. `plugins/withAndroidSplashIcon.js`
(`22f8336`) adds the three platform attributes Expo's legacy splash path leaves
out, so the system splash uses `@drawable/splashscreen_logo` as intended. It is
a config plugin because `android/` is regenerated; a hand-edit would not
survive prebuild. The `android:`-prefixed platform attribute names are required
here, since the generated theme inherits `AppTheme` rather than
`Theme.SplashScreen`.

**That exposed a second problem.** Android draws the splash icon inside a fixed
container, not full-screen, so the shared `splash-icon.png` — whose mark is 24%
of its canvas, correct for iOS's `contain` — rendered at **48dp** against the JS
splash's 96. Android now has its own crop, `assets/splash-icon-android.png`, at
48% of canvas and offset 184px up; iOS keeps the top-level `splash`.

Final measurement, Pixel 9 emulator:

| | before | after | JS splash draws |
|---|---|---|---|
| shape (ink ratio) | 0.895 | **0.663** | 0.661 |
| width | 109 dp | **96 dp** | 96 dp |
| centre vs screen centre | — | **−36 dp** | −36 dp |

Shape, size and position all match, so the native → JS handoff no longer moves.

`/ios` and `/android` are gitignored and regenerate from these files, so the
committed fix is the asset alone. `npx expo prebuild` confirmed the pipeline
picks it up: the generated Android drawables went from ratio 0.895 to
**0.660–0.667** across the density buckets.

**Figma note:** `Auth / Splash / Default` (`146:2`) draws the wordmark as a
**Lockup instance** — outlined vector paths at 196×52. The app draws a 96pt
logomark SVG and a live 36px `<Text>` wordmark, 32pt apart. Different
construction and different proportions; not reconciled, because which one is
*intended* is a design decision.

---

### `Sheet / Confirm` — the confirmation organism (`273:2`)

The brief asked Figma to keep one `Sheet / Sign out` organism. There was none:
both the sign-out and delete-account sheets were drawn by hand on the You &
Settings page. Built now from `src/components/ConfirmSheetBody.tsx`, and named
`Sheet / Confirm` rather than `Sheet / Sign out` because that component backs
both confirmations — naming it for one would have described half its job.

Properties: `Title`, `Body`, `Icon` (swap). The CTA labels are nested properties
on the Button instances inside it.

**What the hand-built sheets had wrong.** Rebuilding from code surfaced five
divergences that had been sitting in the file since Flow 8:

| | Figma had | Code says |
|---|---|---|
| Icon tile | *absent entirely* | 48×48, radius 14, bg `error-muted`, glyph 22 in `text/error` |
| Title | Fraunces 20 | `Display/SM` — Fraunces 22 / 30 |
| Body | Geist 14 | `Body/SM` — Geist 12 / 18, muted |
| Body copy | "Your books and progress stay saved…" | "You'll need to sign back in to access your library and reading progress. Your data stays safe." |
| Buttons | both 48 high, radius 10, label 15 — matching no canonical size | Button **Destructive/Large** (52/10/16) over **Tertiary/Standard** (44/8/14) |

All five are corrected by the organism, and both screens inherit them.
Spacing follows the code exactly: icon → 12, title → 4, body → 24, CTA gap 8.

**Audit after:** 0 orphan instances, 0 components without a description, 0
descriptions naming deleted code. Counts unchanged except Organisms +1 —
**52 component sets, 39 non-icon standalone components**, 108 screen frames,
263 variables, 23 text styles.

---

### F-40 fixed — `List row` carries a hint and a chevron

`Trailing` was a single choice — `None | Chevron | Toggle | Check | Hint` — so a
row could show a value or a chevron, never both. Every Settings drill-in in the
app shows both: *"Reading display · Literata · 20px · ›"*.

`Hint` is now independent of `Trailing`, paired with a `Show hint` boolean and a
hint node in all 24 remaining variants. `Trailing=Hint` is retired.

| | before | after |
|---|---|---|
| Variants | 30 (Size×2 · Trailing×5 · State×3) | **24** (Trailing×4) |
| Trailing options | None, Chevron, Toggle, Check, **Hint** | None, Chevron, Toggle, Check |
| Can show hint + chevron | no | **yes** |

**49 instances moved, 0 failures.** Which trailing each one got was decided from
the code rather than by pattern: 46 went to `Chevron` because their rows pass
`drillsInto` (or are `AccountListRow`, which always draws one), and 3 went to
`None` — all of them **App language**, the one hint row with no `onPress`.
`Show hint` defaults to **false**, so none of the other 76 List row instances
changed.

Also corrected a hint that was never a shape the app produces: `"Literata · M"`
→ `"Literata · 20px"` on 3 instances and the component default. `readingHint`
is built as `` `${family} · ${fontSize}px` ``.

**Audit:** 0 orphans, 0 detached, 0 components without a description. 24
variants, 125 List row instances, 49 showing a hint.

> One cosmetic consequence at 393 wide: on `You / Settings`, the Translation
> target sub-label now truncates, because hint + chevron takes more of the row
> than hint alone. The app has 411dp and does not truncate. Left as-is — it is
> the frame width, not a defect.

### F-43 — a fourth row pattern, found while fixing F-40

F-30 said `ListRow` is canonical and migrated `SettingsScreen.SettingsRow` to
it. It missed **`AccountScreen.AccountListRow`** — 7 call sites, its own icon
tile, label, hint and chevron.

Worse than being a duplicate, it draws a chevron on **every** non-destructive,
non-muted row:

```
{!destructive && !muted && (
  <Icon name="ChevronRight" size={13} color={tokens.colors.ink[300]} />
)}
```

So "Verify student status", which opens a `mailto:`, gets a chevron — the same
hard-rule-3 violation F-30 fixed on Clear cache. Figma matches the app here,
per the verification rule: do not change Figma to hide a bug.

Migrating it is the same shape of work as F-30's row migration and was not in
F-40's scope.

---

### F-43 fixed — the fourth row pattern is gone

`AccountScreen.AccountListRow` had 7 call sites with its own icon tile, label,
hint and chevron. All seven are `ListRow` now, and the component is deleted.
`RadioRow` is the only other row pattern left, kept deliberately in F-30.

**Five wrong chevrons removed.** It drew one on every non-destructive,
non-muted row — so Verify student status (opens a `mailto:`), Restore
purchases, Privacy policy, Terms of service and Export my data all had one.
None of the seven rows drills into anything; two leave the app entirely. Hard
rule 3, the same violation F-30 fixed on Clear cache.

**Two treatments corrected against the spec rather than preserved.** The
temptation was to add a `muted` prop to `ListRow` so the migration changed
nothing visually. `bookflow_list_row_system.html` says otherwise:

| | AccountListRow did | Spec says |
|---|---|---|
| Destructive rows | icon tile `error-muted`, glyph red, label red | `.bf-row-label--destructive { color: var(--error); }` — **label only** |
| Delete account | `muted` grey | listed as `--destructive`, same as Sign out |

So Sign out on Account now matches Sign out on the You tab, which it did not
before, and **Delete account is red** — the most visible change, flagged in the
QA checklist.

**Figma followed, and the comparison found more.** Only one Account row still
had a chevron in the file (Verify student status, moved there by F-40 on the
since-corrected assumption that AccountListRow always drew one). But checking
the destructive labels showed **every Sign out row in the file was
`color/text/primary`** — black — against an app rendering them red. Seven
instances across You home (Free and Pro), the Sign out sheet, Account, and the
Delete account sheet. All rebound to `color/text/error`.

**Audit:** 0 orphans, 0 detached, 0 components without a description, **0
chevrons left on any action row** across the whole file.
