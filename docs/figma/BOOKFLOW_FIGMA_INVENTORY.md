# Bookflow — Figma Replication Inventory (Phase 0)

**Status:** Phase 0 complete. No Figma work has been done yet.
**Produced:** 2026-10-20
**Source of truth:** this repository at branch `v11-batch`, HEAD `5cfc5fb`.
**Scope read:** 100 files / ~52,900 LOC under `src/`, plus `App.tsx`, `app.json`, `package.json`, `supabase/functions`, `supabase/migrations`.

> Every value below is quoted from code. Where a screen hard-codes a value that
> differs from `src/design/tokens.ts`, **both** are recorded and the conflict is
> listed in §F. Nothing here is invented; gaps are called out as gaps.

---

## 0. Cross-check of the assumptions in the brief

The brief listed nine things to confirm. Code wins; here is what it actually says.

| # | Claim in brief | Verdict | Evidence |
|---|---|---|---|
| 1 | Auth is magic link only, no Google/Apple OAuth | **Confirmed** | `src/lib/auth.ts` uses `signInWithOtp` only. `src/lib/google-auth.ts` exists but is **imported nowhere** (dead). The `Apple` icon is registered but unused. No `signInWithOAuth`/`signInWithIdToken` anywhere. |
| 2 | Reader + AI summaries are page-based, not chapter-based | **Confirmed** | `page_index` / `last_read_page` / `totalPages` throughout. `AIToolsSheet` renders `Page {n} · {title}`. Legacy `currentChapter` field survives only as a string parsed for a page number in `bookStatusLine`. |
| 3 | The free voice is Aria | **Confirmed** | `aiAudio.ts` `VOICE_OPTIONS`: Aria `tier:'free'`; Brian, George, Charlie, Sarah, Lily `tier:'pro'`. `DEFAULT_VOICE = '9BWtsMINqrJLrRacOk9x'` (Aria). |
| 4 | The Pro plan card has no benefit pills | **Confirmed** | `YouScreen.ProPlanCard` = dark forest hero (eyebrow / plan name / renewal line + Active badge) over a cream meter section. No pills. |
| 5 | "Upgrade to Standard" button is amber, not forest | **Confirmed** | `YouScreen.styles.upgradeBtn`: `backgroundColor: amber[500]`, `height: 40`, `borderRadius: radii.md (8)`; pressed → `amber[200]`; label `forest[900]`; leading `Sparkles` icon @14. |
| 6 | Top-up is a list with consumption tracking, not pill cards | **Confirmed** | `TopupBalanceBlock` = 2 stacked rows (Audio time / AI credits) with purchased total, used-vs-left bar, expiry, and an empty state with a "Buy" link. Pill/`CreditCard` layouts exist only inside `BuyCreditsSheet` (the purchase surface). |
| 7 | A failed upload offers remove only, no retry | **Confirmed** | `LibraryScreen.tsx:1724` — `Upload failed · tap to remove`; trailing glyph is `X`; `handlePress` routes a failed row to `onRemove`. No retry affordance. |
| 8 | The AI-credit metering gauge is hidden | **CONTRADICTED** | The gauge is **present and live** in `AIToolsSheet` (`AIToolsScreen.tsx:224-245`): label `{n}K AI credits left this month` (or `Monthly AI credits used up`), a progress track, and a `{used} / {limit}` count, fed by `useMonthlyAiUsage()`. A second AI-credits meter is on the free plan card in `YouScreen`. **Both must be built.** |
| 9 | (implicit) Pricing/paywall is in-app | **CONTRADICTED** | The live paywall is **RevenueCat's hosted paywall**, opened by `presentPaywall()` from 19 call sites. Its UI is configured in the RevenueCat dashboard and **does not exist in this codebase**. The local `PaywallPlanScreen` is referenced only inside a comment in `App.tsx:95` and is dead. See §F-1. |

---

## A. Tokens

All from `src/design/tokens.ts` unless stated. 452 lines, well-commented, genuinely the single source of truth for the component layer.

### A.1 Colour primitives

**Forest** — primary brand ("literary")
| Token | Hex |
|---|---|
| `forest.900` | `#0E2A21` |
| `forest.800` | `#1B4332` ← primary brand |
| `forest.700` | `#234D38` |
| `forest.600` | `#2D5A3F` |
| `forest.200` | `#B7CCB9` |
| `forest.100` | `#DAE6DC` |
| `forest.50` | `#EFF4F0` |

**Ink** — neutrals for text and chrome
| Token | Hex |
|---|---|
| `ink.900` | `#1A1A1A` ← primary text |
| `ink.700` | `#3D3A36` |
| `ink.500` | `#6B6862` |
| `ink.400` | `#8A8780` |
| `ink.300` | `#B5B2AB` |
| `ink.200` | `#D8D5CC` |
| `ink.100` | `#ECE9E0` |

**Cream** — warm, paper-like backgrounds
| Token | Hex |
|---|---|
| `cream.50` | `#FAF7F2` ← default app background, **not** pure white |
| `cream.100` | `#F5F1E8` |
| `cream.200` | `#ECE5D5` |

**Amber** — the single accent
| Token | Hex | Used for |
|---|---|---|
| `amber.500` | `#D4A574` | bimodal word highlight, upgrade CTA, illustration accent |
| `amber.200` | `#EFD9B5` | pressed upgrade, search-match highlight |
| `amber.50` | `#FAF1E0` | — |

**Status / semantic singletons**
| Token | Hex | Note |
|---|---|---|
| `error` | `#B5453A` | |
| `errorPressed` | `#9C3B30` | |
| `errorBg` | `#FBEAE7` | |
| `success` | `#2D7A4F` | |
| `successBg` | `#E8F4ED` | |
| `warn` | `#A0692A` | usage-limit / paywall trigger |
| `warnBg` | `#FDF3E3` | |
| `warnBorder` | `#EFD9B5` | |
| `offline` | `#4A5568` | slate — deliberately distinct from `warn` |
| `offlineBg` | `#F0F2F5` | |
| `offlineBorder` | `#CBD5E0` | |

**Reader theme: sepia** (`colors.sepia`)
`bg #F5EDD8` · `surface #EDE0C4` · `text #3D2B1F` · `muted #7A5C3E` · `subtle #7A5C3E` · `border #D4C4A0`

**Reader theme: dark** (`colors.dark`) — forest-tinted near-black
`bg #1A1F1B` · `surface #232A24` · `text #E8E5DC` · `muted #8A8780` · `subtle #8A8780` · `border #3D453E` · `accent #4A7C59`

### A.2 Semantic colour aliases

These are the names screens are supposed to use. They map 1:1 onto primitives — ideal for a Figma `Semantic/Color` collection aliasing `Primitives`.

| Alias | → Primitive |
|---|---|
| `textColors.primary` | `ink.900` |
| `textColors.secondary` | `ink.700` |
| `textColors.muted` | `ink.500` |
| `textColors.subtle` | `ink.400` |
| `textColors.disabled` | `ink.300` |
| `textColors.inverse` | `cream.50` |
| `textColors.accent` | `forest.800` |
| `textColors.error` | `error` |
| `textColors.success` | `success` |
| `bgColors.canvas` | `cream.50` |
| `bgColors.surface` | `cream.100` |
| `bgColors.raised` | `cream.200` |
| `bgColors.accent` | `forest.800` |
| `bgColors.accentMuted` | `forest.100` |
| `bgColors.errorMuted` | `errorBg` |
| `bgColors.successMuted` | `successBg` |
| `bgColors.overlay` | `ink.900` |
| `borderColors.subtle` | `ink.200` |
| `borderColors.default` | `ink.300` |
| `borderColors.accent` | `forest.800` |
| `borderColors.error` | `error` |

### A.3 Theme modes — what actually exists

- **No app-level dark mode.** `app.json` sets `"userInterfaceStyle": "light"`; `<StatusBar style="dark" />` is hard-coded in `App.tsx:703`; there is no `useColorScheme` call anywhere in `src/`. `src/design/CLAUDE.md` explicitly says not to add a `theme` prop until dark mode is a deliberate decision.
- **Three reader themes only**, scoped to the reader surfaces: `light` | `sepia` | `dark` (`readerStore.ReaderTheme`), realised by the `THEME` palette map in `ReaderScreen.tsx:73-115`.

**Recommendation for Phase 1:** `Semantic/Color` gets a single `Light` mode. Reader themes become their own collection, `Reader/Theme`, with modes `Light` / `Sepia` / `Dark` and exactly the 10 keys the `THEME` map defines (`bg, surface, text, muted, subtle, border, headerBg, actionBg, primary, primaryIcon`). Modelling reader themes as modes of the global collection would wrongly imply the whole app re-themes.

### A.4 Typography

**Families** (per-weight identifiers from `@expo-google-fonts/*` — RN does not synthesise weights)
| Token | Family |
|---|---|
| `fonts.display` | `Fraunces_500Medium` |
| `fonts.displayBold` | `Fraunces_600SemiBold` |
| `fonts.displayItalic` | `Fraunces_400Regular_Italic` |
| `fonts.ui` | `Geist_400Regular` |
| `fonts.uiMedium` | `Geist_500Medium` |
| `fonts.reading` | `Literata_400Regular` |
| `fonts.dyslexia` | `Lexend_400Regular` |

Loaded in `App.tsx:153-161` — 7 faces across 4 families: **Fraunces** (400 italic, 500, 600), **Geist** (400, 500), **Literata** (400), **Lexend** (400).

**Composed text styles** (`textStyles`) — the canonical set, applied via `<Text variant>`
| Variant | Family | Size | Line height | Weight | Extra |
|---|---|---|---|---|---|
| `display-xl` | Fraunces 600 | 48 | 56 | 600 | |
| `display-lg` | Fraunces 500 | 36 | 44 | 500 | |
| `display-md` | Fraunces 500 | 28 | 36 | 500 | |
| `display-sm` | Fraunces 500 | 22 | 30 | 500 | |
| `heading-lg` | Geist 500 | 20 | 28 | 500 | |
| `heading-md` | Geist 500 | 16 | 24 | 500 | |
| `heading-sm` | Geist 500 | 14 | 20 | 500 | |
| `body-lg` | Geist 400 | 16 | 24 | 400 | |
| `body-md` | Geist 400 | 14 | 20 | 400 | ← component default |
| `body-sm` | Geist 400 | 12 | 18 | 400 | |
| `body-xs` | Geist 400 | 11 | 16 | 400 | |
| `label-md` | Geist 500 | 12 | 16 | 500 | UPPERCASE, tracking 0.5 |
| `label-sm` | Geist 500 | 10 | 14 | 500 | UPPERCASE, tracking 0.5 |

**Raw size scale** (`fontSizes`, used by canonical components)
- `display`: xl 56 · lg 32 · md 22 · sm 18 · xs 16
- `ui`: lg 16 · md 14 · sm 13 · xs 12 · xxs 11 · xxxs 10
- `reading`: lg 18 · md 16 · sm 14

> ⚠️ `fontSizes.display` (56/32/22/18/16) and `textStyles.display-*` (48/36/28/22) are **two different display scales** that disagree. See §F-4.

`fontWeights`: regular 400 · medium 500 · semibold 600.

### A.5 Spacing

Two coexisting scales (the file says so explicitly).

| Numeric | px | | Named | px |
|---|---|---|---|---|
| `spacing.0` | 0 | | `space.none` | 0 |
| `spacing.1` | 4 | | `space.xs` | 4 |
| `spacing.2` | 8 | | `space.sm` | 8 |
| `spacing.3` | 12 | | `space.md` | 12 |
| `spacing.4` | 16 | | `space.lg` | 16 |
| `spacing.5` | 20 | | `space.xl` | 24 |
| `spacing.6` | 24 | | `space.2xl` | 32 |
| `spacing.7` | 32 | | `space.3xl` | 48 |
| `spacing.8` | 40 | | `space.4xl` | 64 |
| `spacing.9` | 48 | | | |
| `spacing.10` | 56 | | | |
| `spacing.11` | 64 | | | |
| `spacing.12` | 80 | | | |

Note the named scale has **no 20px or 40px step**, so `space` cannot express `spacing.5` / `spacing.8`.

### A.6 Radii

`xs 4` · `sm 6` · `md 8` · `lg 10` · `xl 12` · `2xl 14` · `3xl 16` · `full 9999`

### A.7 Border widths

No border-width token group exists. Observed values: `1` (almost everywhere), `StyleSheet.hairlineWidth` (TabBar top border), `3` (`input.focusRingWidth`). A `Border` collection must be **derived** — see §F-6.

### A.8 Elevation / shadows

**No elevation tokens exist in `tokens.ts`.** All shadows are ad-hoc per StyleSheet. Observed distribution:

| iOS props | Android | Count |
|---|---|---|
| `offset 0,1` | — | 13 |
| `radius 3`, `opacity 0.12` | `elevation 2` | 11 (ModeTogglePill etc.) |
| `radius 2 / 4`, `opacity 0.06–0.08` | `elevation 1–4` | ~12 |
| `offset 0,4`, `radius 12`, `opacity 0.18` | `elevation 8` | ~4 |
| `offset 0,6–8`, `radius 14–24`, `opacity 0.2–0.35` | `elevation 12` | ~8 |

A 4-step scale must be **synthesised** for Phase 1. Proposed (to be approved, not from code):
- `elev/1` — 0 1 3 rgba(0,0,0,0.12) / android 2
- `elev/2` — 0 2 4 rgba(0,0,0,0.08) / android 4
- `elev/3` — 0 4 12 rgba(0,0,0,0.18) / android 8
- `elev/4` — 0 6 16 rgba(0,0,0,0.20) / android 12

### A.9 Motion

`motion.fast 100` · `normal 120` · `medium 160` · `slow 200` (ms)
Easings: `standard cubic-bezier(0.4,0,0.2,1)` · `decelerate cubic-bezier(0,0,0.2,1)` · `accelerate cubic-bezier(0.4,0,1,1)`

Bottom sheet motion: enter 320ms decelerate, exit 200ms accelerate; drag dismiss at 25% height or 600 px/s.
Button: 120ms transition, press scale 0.98, spinner 16px / 1.5 stroke / 700ms rotate.
Toast: in 220ms, hold 2800ms, out 200ms (160ms on tap-dismiss), translateY −16→0.
Skeleton: 800ms `inOut(ease)`, infinite reverse, `#EAE6DC` ⇄ `#F0EDE5`.

### A.10 Component tokens

**Button** (`tokens.button`)
| | compact | standard | large |
|---|---|---|---|
| height | 32 | 44 | 52 |
| paddingX | 14 | 20 | 28 |
| fontSize | 12 | 14 | 16 |
| radius | 6 | 8 | 10 |
| minWidth¹ | 64 | 80 | 120 |
| icon size¹ | 14 | 18 | 20 |

¹ from `Button.tsx` `getSizeStyle` / `iconSize`, not from `tokens.button`. gap 8.

**Input** (`tokens.input`)
| | compact | standard | large |
|---|---|---|---|
| height | 32 | 44 | 52 |
| paddingX | 10 | 12 | 14 |
| fontSize | 12 | 14 | 16 |
| radius | 6 | 8 | 10 |
| iconSize | 14 | 18 | 20 |

`focusRingWidth: 3` — **declared but never used**; `Input.tsx` renders a 1px border that changes colour on focus instead. See §F-5.

**Bottom sheet** (`tokens.bottomSheet`)
radius 16 (top corners) · backdrop opacity 0.4 · handle 32×4 with 8 top margin · paddingX 16 · paddingY 16 · footerPaddingBottom 18 · maxHeight 85%

**List row** (`tokens.listRow`)
| | standard | compact |
|---|---|---|
| minHeight | 56 | 48 |
| label size | 14 | 13 |
| label weight | 500 | 400 |
| iconBg size | 32 | 28 |
| icon size | 18 | 16 |
| chevron size | 16 | 14 |

paddingX 14 · gap 12 · sublabel 11 · transition 100ms.

**Icon scale** (`tokens.iconSize`): `xs 14` · `sm 18` (default) · `md 20` (tab nav) · `lg 24` (headers, empty states).
`iconStrokeWidth = 1.5` — the documented hard rule. **Widely overridden in practice** (§F-3).

### A.11 Reader-specific settings

**Presets** — two different definitions, which is the subtlety here.

*Applied values* (`readerStore.PRESET_CONFIGS`) — what actually changes when you tap a preset:
| Preset | fontSize | fontFamily |
|---|---|---|
| `standard` | 20 | serif (Literata) |
| `comfortable` | 22 | serif (Literata) |
| `max` | 24 | lexend (Lexend) |

*Preview-glyph values* (`ReaderScreen.PRESETS`) — only style the "Aa" sample in the sheet:
| Preset | Label | previewSize | lineHeight |
|---|---|---|---|
| `standard` | Standard | 16 | 1.5 |
| `comfortable` | Comfortable | 18 | 1.8 |
| `max` | Max readability | 20 | 2.0 |

> ⚠️ **The preset `lineHeight` is never applied to page text.** Body copy is always `fontSize × 1.78` (`ReaderScreen.tsx:2309`). See §F-2.

**Fonts** (`FONT_OPTIONS` / `FONT_MAP`): `Serif → Literata_400Regular` · `Sans → Geist_400Regular` · `Lexend → Lexend_400Regular`.

**Text size slider:** min 16, max 28, step 1, thumb 18px.

**Theme swatches** (`THEME_OPTIONS`) — note these hard-code values that diverge from `colors.sepia` / `colors.dark`:
| Key | Label | Swatch bg | Dot | Text |
|---|---|---|---|---|
| light | Light | `cream.50` | `cream.200` (border `ink.200`) | `textColors.secondary` |
| sepia | Sepia | `#F5EDD8` (= `sepia.bg`) | `#C4A882` ⚠️ not a token | `#5C4A30` ⚠️ not a token |
| dark | Dark | `ink.900 #1A1A1A` ⚠️ **actual dark bg is `#1A1F1B`** | `ink.700` | `cream.50` |

**Auto-hide chrome:** off by default; copy "Hides header and buttons after 3 seconds of reading".

**Other reader-adjacent prefs** (`readerStore`): `translationLanguage` (default `tw` = Twi), `defaultVoiceId` (Aria), `defaultPlaybackSpeed` (1), `resumeAfterCalls` (true, not yet wired), plus 7 notification flags (`notifReminderOn` true, hour 20, minute 0, `notifStreakWarningOn` false, `notifBookFinishedOn` true, `notifWarningsOn` true, `notifUpdatesOn` true).

**Translation languages** (12): English, Spanish, French, German, Italian, Portuguese, **Twi**, Swahili, Yoruba, Chinese (Simplified), Japanese, Korean.

### A.12 Playback speeds — three disagreeing sets ⚠️

| Source | Set |
|---|---|
| `readerStore.PLAYBACK_SPEEDS` | 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2 |
| `ListenScreen.SPEEDS` | 0.75, 1, 1.25, 1.5, 2 |
| `PlaybackSpeedSheet.Speed` + `SPEEDS` | 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, **3** |
| `App.snapSpeed` allowed | 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 3 |
| `App.onOpenSpeedSheet` cycle | 0.75, 1, 1.25, 1.5, 1.75, 2 |

`PlaybackSpeedSheet` carries a label + description per speed (Slow/Leisurely/Normal/Brisk/Fast/Quick/Rapid/Sprint). See §F-7.

### A.13 Opacity & z-layers

No tokens. Observed: disabled row `0.5`, processing row `0.7`, pressed `0.6`/`0.7`, backdrop `0.4`, ToastHost `zIndex: 9999`. `MiniPlayer` deliberately carries **no** zIndex (comment explains it must lose to the bottom-sheet portal).

---

## B. Assets

### B.1 Logo

The mark is **two cubic Bézier arcs** (an arc plus a smaller "echo" arc), exactly as the brief says — not a book glyph.

- **Source:** `src/components/Lockup.tsx`. There is **no `.svg` file in the repo** — the paths are inline `react-native-svg` `<Path>` elements. Ground rule 7 ("import from the SVG asset in the repo") cannot be followed literally; I will extract the paths from `Lockup.tsx` into `docs/figma/assets/*.svg` and vector-import those, byte-for-byte. See §F-8.
- **viewBox:** `0 0 196 52`, fixed. Only rendered size and echo opacity vary.
- **Logomark paths:**
  - main: `M14 33.4C22 14.2 30 14.2 38 33.4`
  - echo: `M18.8 32.44C23.6 19.64 28.4 19.64 33.2 32.44`
  - both: `strokeWidth 4.32`, `strokeLinecap round`, stroke = `forest.800` by default
- **Wordmark:** 7 outlined `<Path>` fills (font-independent), default `ink.900`. Extracted to `docs/figma/assets/bookflow-wordmark.svg`.
- **Three sizes:** `small 98×26` echo 0.55 · `medium 127×34` echo 0.5 (in-app default) · `large 196×52` echo 0.45 (canonical).
- ⚠️ **A second, geometrically different logomark ships in the app.** `AuthCallbackScreen.tsx:218` draws its own mark on a `0 0 100 100` viewBox with `strokeWidth 9`, echo opacity `0.45`:
  - main: `M 25 80 C 33.5 22 66.5 22 75 80`
  - echo: `M 35 78 C 45 33 55 33 65 78`
  Normalising both to the same arc span, the `Lockup` mark has a height:width ratio of **0.80** with control points at **33%/67%** of the span, while this one is **1.16** with control points at **17%/83%** — a visibly taller, flatter-shouldered curve. These are *not* the same shape at two scales. See §F-8.

**App icons** (raster only, `assets/`): `icon.png`, `adaptive-icon.png`, `splash-icon.png`, `notification-icon.png`, `favicon.png`. Splash bg `#FAF7F2`; Android adaptive bg `#ffffff` ⚠️ (inconsistent with cream-50); notification tint `#2D6A4F` ⚠️ (not a token).

### B.2 Voice avatars

`src/components/VoiceAvatar.tsx` — a tinted rounded square (radius = size/4, default 36px) holding a 7-bar SVG waveform on a `52×38` viewBox; bars width 5, gap 2, `rx 2.5`, x-offsets `[2,9,16,23,30,37,44]`. Each voice has its own bg, bar colour, and height/opacity pattern.

| Voice | ElevenLabs id | bg | bars | Character |
|---|---|---|---|---|
| Aria | `9BWtsMINqrJLrRacOk9x` | `#FDF0ED` | `#E07060` | dramatic centre peak |
| Brian | `nPczCjzI2devNBz1zQrb` | `#EEF2F8` | `#2C4A5A` | dense uniform tall |
| George | `JBFqnCBsd6RMkjVDRZzb` | `#FDF5E8` | `#C49010` | gentle peak, warm decay |
| Charlie | `IKne3meq5aSn9XLyUdCD` | `#EFF4F0` | `#1B4332` | irregular spike |
| Sarah | `EXAVITQu4vr4xnSDxMaL` | `#F5EFF8` | `#7B5EA7` | even medium arch |
| Lily | `pFZP5JQG7iQjIQuC4Bku` | `#EAF4F5` | `#2A8C9A` | symmetric arch |
| *fallback* | any other | `forest.50` | `forest.800` | neutral |

⚠️ `ListenScreen.VOICES` defines a **second, different** avatar palette for the same six voices (`forest.100/ink.100/forest.50/amber.200/cream.200/cream.50`). Two visual systems for one concept — §F-9.

### B.3 Illustrations (all inline SVG, no asset files)

| Name | Location | Note |
|---|---|---|
| `BookIllustration` | `LibraryScreen.tsx` (~2446) | library empty state; amber-500 dot accent |
| `HeroIllustration` | `WelcomeScreen.tsx:83` | accent = `amber.500` |
| `MailSparkleIcon` | `SignInScreen.tsx:428` | amber-500 strokes @1.4 |
| `BookCoverArt` | `OnboardingFirstBookScreen.tsx:281` | per-book generated cover |
| `CoverBox` / `BookCover` | `DiscoverScreen.tsx:2061`, `LibraryScreen.tsx:2174` | gradient-filled placeholder covers |
| `PulseDot` | `AuthCallbackScreen.tsx:128` | staggered loading dots |
| `EqBars` | `src/components/EqBars.tsx` | playing-state equaliser |
| `ProgressDots` | `PracticeQuestionsScreen.tsx:1098` | quiz progress |

**Cover placeholder palettes** (not tokenised): `useBooksImpl.ts` (`#1A3325, #4A5D4E, #5B6B58, #5D4E47, #7A6E5C, #C7986E`), `curatedLibrary.ts` (incl. `#B8895A`), `DiscoverScreen.tsx` (`#2A6B6E, #5A3D6E, #5A6E3D, #5C4A3A, #7C3A2A`).

### B.4 Icon set

**Library: `@tabler/icons-react-native` v3.41.1 — NOT Lucide.** (Root `CLAUDE.md` says `lucide-react-native`; that is stale. §F-10.)

`src/components/Icon.tsx` registers **68** names in `ICON_MAP`; **67 are used**. Only `Apple` is dead (consistent with magic-link-only auth). Defaults: size `18`, colour `ink.700`, strokeWidth `1.5`.

Full registry, grouped as the file groups them:

- **Brand:** Apple *(unused)*
- **Tab filled:** CompassFilled, HeadphonesFilled, UserFilled
- **Navigation:** ArrowLeft, ArrowRight, ArrowsSort, Filter, ChevronRight, ChevronLeft, ChevronDown, Compass, X
- **Actions:** Plus, Search, Check, Camera, Copy, ThumbUp, ThumbDown, ThumbUpFilled, ThumbDownFilled
- **Reading & audio:** Book, BookOpen *(→ IconBookFilled)*, Books, Brain, CloudUpload, Headphones, Microphone, Notebook, Moon, Play *(filled)*, Pause *(filled)*, PlayerSkipBack, PlayerSkipForward, PlayerTrackPrev, PlayerTrackNext, TextSize, Upload, Clock, ListDetails, Music, Wand
- **Communication:** MessageCircle, Mail, Bell
- **System:** Settings, User, Lock, Logout, Eye, Globe *(→ IconWorld)*
- **States:** AlertCircle, CheckCircle *(→ IconCircleCheck)*, AlertTriangle, HelpCircle, Info *(→ IconInfoCircle)*, Loader *(→ IconLoader2)*, Sparkles, Star, CreditCard, Download, FileText, Phone, Refresh, Shield, Trash, WifiOff

Note three names are aliases whose Tabler glyph differs from the name (`BookOpen`→BookFilled, `Globe`→World, `Info`→InfoCircle) — Figma components should keep the **Bookflow** name and record the Tabler glyph in the description.

---

## C. Components

### C.1 Canonical library (`src/components/`, exported from `index.ts`)

| Component | Variant axes | States / notes |
|---|---|---|
| **Button** | `variant` primary/secondary/tertiary/destructive × `size` compact/standard/large | default, pressed, disabled, loading; booleans `fullWidth`, `leadingIcon`, `trailingIcon`. Loading swaps label for `ActivityIndicator` ⚠️ (spec says a 16px/1.5/700ms spinner — §F-11). `ellipsizeMode="clip"` + `numberOfLines={1}` enforces never-truncate. |
| **Input** | `size` compact/standard/large × `state` default/error/success | + focused, disabled(`editable=false`). Optional `label`, `leadingIcon`, `trailingIcon`, `helperText`/`errorText`/`successText`. Border transparent→`forest.800` on focus; bg `cream.100`, `errorBg` on error, `ink.100` when disabled. |
| **Icon** | 68 names | size + colour + strokeWidth props |
| **ListRow** | `size` standard/compact | `destructive`, `disabled`, `selected`, `drillsInto` (chevron), `toggle`, `hint`, `sublabel`, `leadingIcon`/`leadingElement`, `trailingElement`. Pressed bg `cream.100`; disabled `opacity 0.5`. Built-in `Toggle`: track 36×22 radius-full, thumb 18×18, translateX 14, on `forest.800` / off `ink.300`. |
| **BottomSheet** | — | Wraps `@gorhom/bottom-sheet` `BottomSheetModal`. `enableDynamicSizing`, backdrop 0.4 `pressBehavior="close"`, handle `ink.300` 32×4, bg `cream.50`, top radius 16, title = Fraunces `display.sm` (18). Optional `footer` (gap `space.sm`). |
| **Text** | `variant` (13 textStyles) × `color` (9) × `align` | default `body-md` / `primary` |
| **TabBar** | 4 tabs | Library/Discover/Listen/You; inactive→active icon swap (Book→BookOpen, Compass→CompassFilled, Headphones→HeadphonesFilled, User→UserFilled); icon 20, label Geist-500 10/14; active `forest.800`, inactive `ink.500`; hairline top border; `paddingBottom = max(safeArea.bottom, 8)` |
| **ModeTogglePill** | `variant` light/dark × `mode` full/text | Two-half segmented control. Pill radius 13, padding 2; half radius 11, 10×5 padding, minWidth 40. Light: track `ink.200`, active `cream.50` + shadow; Dark: track `rgba(255,255,255,0.10)`, active `rgba(255,255,255,0.85)`. Label Geist-500 11/600. |
| **Skeleton** | width/height/radius props | 800ms shimmer `#EAE6DC`⇄`#F0EDE5` |
| **ChapterSheet** | — | 665 LOC; chapter/page list sheet |
| **ReminderTimePicker** | — | 360 LOC; hour/minute picker |
| **EqBars** | — | playing equaliser |
| **ToastHost** *(not in index.ts)* | — | Forest-800 card, radius `xl` 12, amber-500 22px circle with 3-stroke Check, Geist-500 13.5/18 cream-50 text, maxWidth 460, shadow 0/6/14/0.18 + elevation 8, top = safeArea.top + 8 |
| **VoiceAvatar** *(not in index.ts)* | 6 voices + fallback | see §B.2 |
| **SlowNetworkBanner** *(not in index.ts)* | — | driven by `useSlowOp` |
| **RootErrorBoundary** *(not in index.ts)* | — | ⚠️ **never mounted** — dead |

### C.2 Screen-level reusable molecules (defined inside screens, not extracted)

These are used on multiple surfaces or are complex enough to belong in the Figma library even though code keeps them local.

| Component | Defined in | States |
|---|---|---|
| **BookListItem** | `LibraryScreen:1653` | not-started / in-progress / finished / **processing** (spinner + "Processing…", opacity 0.7, tap no-op, no trailing icon) / **failed** ("Upload failed · tap to remove", error colour, trailing `X`, tap → remove) / **downloading audio** (spinner + "Downloading audio… n%") |
| **BookCover** | `LibraryScreen:2174` | sizes incl. `sm`; signed-URL resolve with gradient-placeholder fallback |
| **ContinueCard** | `LibraryScreen:1516` | resume-reading hero |
| **ReadingStatsCard** | `LibraryScreen:1428` | 7 streak dots: filled / hollow / today-filled / today-empty (amber) |
| **OfflineBanner** | `LibraryScreen:1338` | ⚠️ Retry button wired to `() => {}` — §F-12 |
| **SectionHeader / SearchHeader / PreSearchContent / SearchResults / SearchResultRow / HighlightedTitle / NoResults / DiscoverNudge / CircleIconButton / SortFilterSheet / RadioDot / BookActionSheetContent / ActionRow / RemoveBookSheetContent** | `LibraryScreen` | |
| **FeaturedCard / RailCard / RailCardSkeleton / RailSkeletonRow / ShortCard / CoverBox / AddPill / CopyableRow / SearchEmptyState** | `DiscoverScreen` | `AddPill`: Add / pending / "In library" |
| **PlanCard / ProPlanCard / Meter / ProUsageRow / ProfileHeader / SettingsSection / Divider / SignOutSheetBody** | `YouScreen` | `Meter` has a normal (track+fill `forest.200`) and an **unlimited** state (∞ chip, no track) |
| **FreePlanCard / ProPlanCard / MeterRow / SectionGroup / RowDivider / AccountListRow / ProfileSection / SignOutBody / DeleteAccountBody / SubHeader / EditProfileScreen** | `AccountScreen` | |
| **TopupBalanceBlock / TopupRow** | `TopupBalanceBlock.tsx` | `onDark` (forest-700 panel) vs light (cream-100 panel); per row: has-balance (total + used/left bar + expiry) or empty ("No audio time" + Buy link) |
| **CreditCard** | `BuyCreditsSheet:285` | best-value badge, savings %, per-unit price, selected state |
| **StepRow** | `UploadFlowScreen:395` | `done` / `active` / `pending` / `failed` |
| **MiniPlayer** | `ListenScreen:1186` | docks above TabBar; hidden on Listen/You tabs, in readers, and under any drill-in |
| **ScrubBar / RecentCover / Pill / StatCard** | `ListenNowPlayingScreen` | |
| **VoiceRow** | `ListenScreen:931` | free / pro-locked / selected / previewing |
| **ChatBubble / ChatThinkingBubble / AiErrorBubble / OffTopicBubble / ChatErrorCard / FeedbackRow / StarterQuestions / StarterSkeleton / QualityRatingCard / SummaryActionBar / SummaryStreamingBody** | `AIToolsScreen` | `QualityRatingCard`: 👍/👎 + 6 negative-reason chips (missed, inaccurate, too-short, too-long, hard-to-follow, other) |
| **MCQBody / ShortAnswerBody / ProgressDots / SegGroup / SourceChip / SectionBlock / PQHeader / PagePickerBody** | `PracticeQuestionsScreen` | grades: correct / partial / incorrect |
| **FilterTab / HighlightRow / EmptyState** | `HighlightsScreen` | filters: all / word / sentence |
| **InReaderSearchHeader / HighlightedText** | `InReaderSearchHeader.tsx` | match highlight `amber.200`, active match `amber.500` |
| **ActionBar** | `ReaderScreen:2390` | the 5-item bar — see §C.3 |
| **TypographySheet / SizeSlider / TranslatePopover / ReaderHeader / ChapterImage / TappableParagraph / TapHint** | `ReaderScreen` | |

### C.3 The reader action bar (5 items)

`ReaderScreen.ActionBar` — order and icons are exact:

| # | Icon | Label | Primary? |
|---|---|---|---|
| 1 | `Headphones` | Listen | **yes** (filled `palette.primary`) |
| 2 | `Wand` | AI tools | no (`palette.surface`) |
| 3 | `Search` | Search | no |
| 4 | `Notebook` | Highlights | no |
| 5 | `Settings` | Reading options | no |

Icons @18; label colour `palette.muted`; bar has a top border `palette.border` and bg `palette.actionBg`. One primary only — satisfies hard rule 8.

### C.4 Three distinct "Reading options" sheets ⚠️

| Reader | Sheet | Content |
|---|---|---|
| Text mode (`ReaderScreen`) | `TypographySheet` | Full controls: Presets (3 cards) · Text size slider 16–28 · Font (3) · Theme (3) · Auto-hide toggle · Reset |
| EPUB Full (`EpubFullReaderScreen`) | `FullModeReadingOptionsSheet` | **Explanatory text only, no controls** — "Full mode renders the EPUB with its publisher's own typography. Tap *Text*…" |
| PDF (`PdfReaderScreen`) | `PdfReadingOptionsSheet` | Same placeholder pattern |

---

## D. Screens and flows

### D.1 Navigation architecture — important

There is **no router**. `App.tsx` is a hand-rolled state machine:

- `stage`: `splash` → `welcome` → `signin` | `signup` → `authCallback` → `authCallbackError` → `onboardingIntent` → `onboardingFirstBook` → `library`
- `activeTab` within `library`: `library` | `discover` | `listen` | `you`
- Sub-views are **local booleans**, not routes: `historyOpen`, `listenForeground`, `readerOpen`, `youSubViewOpen`, `discoverSubViewOpen`, plus per-screen `selectedBook` / drill-in state.

⚠️ Root `CLAUDE.md` claims Expo Router with an `src/app/` tree. **No `src/app/` directory exists** and `expo-router` is not a dependency. §F-10.

Android hardware back: per-screen `BackHandler` subscriptions (LIFO); the root handler shows a "Press back again to exit" `ToastAndroid` and exits on a second press within 2s.

### D.2 Full route map

**Flow 1 — Boot & auth**
| Screen | File | States |
|---|---|---|
| Splash | `SplashScreen.tsx` | animated → `onComplete` |
| Welcome | `WelcomeScreen.tsx` | hero illustration, Get started / Sign in |
| Sign in | `SignInScreen.tsx` (`variant='signin'`) | `form` → `success`; email field, "Send magic link", consent row |
| Sign up | `SignUpScreen.tsx` → `SignInScreen` (`variant='signup'`) | adds full-name field |
| Check your email | `SignInScreen.SignInSuccess` | "We sent a magic link to {email}", Resend, Back |
| Verifying | `AuthCallbackScreen` `state='verifying'` | 3 staggered `PulseDot`s + Logomark |
| Link error | `AuthCallbackScreen` `state='error'` | `AuthCallbackError` union — see D.3 |

**Flow 2 — Onboarding**
| Screen | File | States |
|---|---|---|
| Intent capture | `OnboardingIntentScreen.tsx` | 5 options + Skip: Read more for fun (Book) · Study for school or work (Notebook) · Improve focus or accessibility (Brain) · Listen on the go (Headphones) · Just exploring (Compass) |
| First book | `OnboardingFirstBookScreen.tsx` | tabs `library` / `upload`; library tab = curated picker (multi-select); upload tab = "Choose file" → OS picker; Skip |
| Returning-user routing | `App.tsx` | session restore reads `profiles.onboarding_complete` → `library` or `onboardingIntent` |

**Flow 3 — Library**
| Surface | File | States |
|---|---|---|
| Library home | `LibraryScreen.tsx` | **empty** (greeting + "Add your first book" + "Upload a PDF or EPUB, or choose something from our free library below." + `Upload a book` large button + "EPUB or PDF · max 50 MB" + free-library section) · **loading** (`LibrarySkeleton`) · **populated** (Header, ReadingStatsCard, ContinueCard, section headers, BookList) · **offline** (OfflineBanner) · **soft warning** (`SoftWarningBanner`) |
| Search | `SearchHeader` + `PreSearchContent` / `SearchResults` / `NoResults` / `DiscoverNudge` | |
| Sort & filter sheet | `SortFilterSheet` | sort: Recent, Recently added, Title A–Z, Progress · filter: All, In progress, Not started, Finished |
| Book action sheet | `BookActionSheetContent` | per-book actions |
| Remove book confirm | `RemoveBookSheetContent` | stacked CTAs |
| Add book sheet | `UploadFlowScreen.AddBookSheet` | upload vs browse options |
| Processing | `UploadFlowScreen.ProcessingScreen` | ring (determinate/indeterminate) + 3 `StepRow`s: *File uploaded* (`{size} · completed`) → *Extracting text* ("In progress…") → *Generating audio* ("Starts after text is ready"); `failed` variant adds Read-without-audio / Retry-audio / Remove-book cards |
| Scanned-PDF error | `UploadFlowScreen.ScannedPdfErrorScreen` | + `NextStepRow`s |

**Flow 4 — Readers** (three separate screens, chosen by `book.type`)
| Book type | Screen | Modes |
|---|---|---|
| `pdf` | `PdfReaderScreen.tsx` | Full (native `react-native-pdf`) ⇄ Text; dark `ModeTogglePill` on translucent header |
| `epub` | `EpubFullReaderScreen.tsx` | Full (WebView + injected CSS) ⇄ Text; light pill |
| text mode (both) | `ReaderScreen.tsx` | paginated extracted text, word-tap, sentence translate, save highlight, 3 themes, auto-hide chrome |

Reader sub-surfaces: `ReaderHeader` (back + title + mode pill), `ActionBar` (5 items), `TypographySheet`, `BookSearchScreen`, `HighlightsScreen` (filters all/word/sentence), `TranslatePopover` / `TranslateWordPopover`, `TranslateChapterScreen`, `ChapterSheet`, `TapHint`, `ChapterImage`, `ReaderSkeleton`.

**Flow 5 — AI tools** (all page-scoped)
| Surface | File | States |
|---|---|---|
| AI tools sheet | `AIToolsScreen.AIToolsSheet` | header "AI tools" / "Page {n} · {title}"; 4 rows with cost: Summarize page `~2K AI credits` · Practice questions `~3K` · Ask about the book `~1K per message` · Translate page `~5K`; **live credit gauge footer**; credit-exhausted → hosted paywall |
| Page summary | `AIToolsScreen.SummaryScreen` | length `tldr`/`standard`/`detailed`; streaming body; `QualityRatingCard` (👍/👎 + 6 reasons); `SummaryActionBar` (Listen / Copy) |
| Chat | `AIToolsScreen.ChatScreen` | starters + skeleton, user/assistant bubbles, thinking bubble, error bubble (Retry/Skip), off-topic bubble, failed-message list, feedback row |
| Practice questions | `PracticeQuestionsScreen.tsx` | `ConfigScreen` (count 5/10/15 · type mixed/mcq/short · order sequential/random · page picker) → `QuestionScreen` (MCQ / short answer) → `ResultsScreen`; grades correct/partial/incorrect; `SourceChip` for traceability |
| Retry questions | `RetryQuestionsScreen.tsx` | ⚠️ **unreachable** |
| Translate | `TranslateChapterScreen.tsx`, `TranslateWordPopover.tsx` | `LanguageChip`, 12 languages |

**Flow 6 — Listen**
| Surface | File | Notes |
|---|---|---|
| Listen tab home | `ListenHomeScreen.tsx` | empty / resume card / now-playing companion |
| Now playing | `ListenNowPlayingScreen.tsx` | `ScrubBar`, transport (page-prev / −15s / play-pause / +15s / page-next), speed pill, voice pill, recently-listened rows, `StatCard`s (listening hours, books started/finished, audio remaining) |
| Foreground listen | `ListenScreen.tsx` | bimodal page text with word-level highlight (`BimodalText`, `WordSpan`), `ListeningPill`, replaces the whole tab shell |
| Mini player | `ListenScreen.MiniPlayer` | floats above TabBar on Library/Discover-home only |
| Voice sheet | `ListenScreen.VoiceSheet` | 6 voices, free/pro split, preview, upsell |
| Sleep sheet | `ListenScreen.SleepSheet` | Off · 5 minutes · 15 minutes · 30 minutes · 1 hour · End of page; active row shows "{n} left" + Check; re-tap clears |
| Speed sheet | `PlaybackSpeedSheet.tsx` | 8 speeds with label + description |
| History | `ListenHistoryScreen.tsx` | recently-listened list |

**Flow 7 — Discover**
`DiscoverScreen.tsx` — `HomeView` with 8 sections: **Featured this week · The Holy Bible · Popular fiction · Spiritual classics · Curated classics · From the Internet Archive · Academic books · Short reads**. 13 categories: For you, Classics, Christianity, Fiction, Mystery, Adventure, Romance, Sci-fi, Philosophy, Poetry, History, Children, Short reads. Sub-views: `CategoryView`, `DetailView`, `SearchResults`, `SearchEmptyState`. Rails from 5 sources (Gutendex, Standard Ebooks, Wikisource, Open Library, DOAB) via 5 edge functions; skeleton rails while loading; `SlowNetworkBanner`.

**Flow 8 — You / Settings**
| Surface | Rows |
|---|---|
| You home (`YouScreen`) | `ProfileHeader` + `PlanCard`/`ProPlanCard` + **Reading**: Reading display, Default voice, Translation language · **Account**: Account & subscription, Buy credits (`AI + audio top-ups`), Settings, Notifications, Sign out · **Support**: Help & FAQ, Send feedback. Footer `Bookflow 0.1.0 · Build 1` |
| Account & subscription (`AccountScreen`) | Plan card + **Account**: Verify student status `$4.99/mo` *(free only)*, Restore purchases · **Privacy & data**: Privacy policy, Terms of service, Sign out, Delete account. Also `EditProfileScreen` |
| Settings (`SettingsScreen`) | **Reading & audio**: Reading display, Default voice, Default playback speed, Resume after calls *(toggle)* · **Language & translation**: App language (`English`, "Only English is supported for now"), Translation target · **Notifications**: Daily reading reminder (+`ReminderTimePicker`), Usage warnings, Product updates · **Storage**: clear-cache row ("Resets cached library + Discover lists. Books and progress stay.") + `NotifDeniedBanner` |
| Drill-ins (`YouDrillScreens`) | ReadingDisplay, PlaybackSpeed, DefaultVoice, TranslationLanguage, Notifications, Help, SendFeedback |
| Help & FAQ | `HelpFAQScreen` — sectioned FAQ accordion |
| Send feedback | `SendFeedbackScreen` — categories bug / feature / ai-quality / other + attachment |

**Flow 9 — Monetisation**
| Surface | Status |
|---|---|
| **Paywall** | **RevenueCat hosted** via `presentPaywall()`, 19 call sites. **Not in this codebase.** §F-1 |
| Soft warning banner | `PaywallScreen.SoftWarningBanner` — live, used by `LibraryScreen` |
| `PaywallPlanScreen` | dead (comment-only reference) — plans yearly/monthly/student |
| `PaywallSheet` | dead — variants `book-limit` (warn tint) / `ai-tokens` (error tint) / `feature-gate` (forest tint), with meter or feature list |
| Plan cards | live in `YouScreen` + `AccountScreen` |
| Buy Credits sheet | `BuyCreditsSheet` — tabs Audio time / AI credits; 4 products: `bookflow_audio_300min` "5 hours audio", `bookflow_audio_900min` "15 hours audio", `bookflow_ai_100k` "100K AI credits", `bookflow_ai_500k` "500K AI credits". ⚠️ **Prices come from RevenueCat at runtime — not in code.** |
| Top-up balance | `TopupBalanceBlock` — see §C.2 |

Plan limits: free = 60 audio min/mo, 50,000 AI credits/mo, 5 books. Pro = unlimited audio, 500,000 credits, unlimited books. Entitlement id `Bookflow Pro`; top-up offering id `topups`.

**Flow 10 — System states**
Offline (`OfflineBanner`, `useNetworkState`), slow network (`SlowNetworkBanner`), skeletons (`LibrarySkeleton`, `ReaderSkeleton`, rail skeletons, starter skeletons), toast (`ToastHost`), **33 native `Alert.alert` dialogs** (AccountScreen 12, LibraryScreen 6, SettingsScreen 5, DiscoverScreen 5, revenuecat 3, ReaderScreen 1, BuyCreditsSheet 1), Android exit toast, notification-permission sheet *(dead)*.

### D.3 Error / edge-state enums

- `AuthCallbackError` (`AuthCallbackScreen:40`) and `AuthExchangeErrorKind` (`lib/auth.ts`) — link expired / already used / unknown etc.
- `BookProcessingStatus`: `pending` | `processing` | `ready` | `partial` | `failed` | `failed:*` (e.g. `failed:scanned_pdf`) | `null`
- `ProcessingStepState`: `done` | `active` | `pending` | `failed`
- `RestoreState`: `restoring` | `restored` | `nothing`
- `StudentVerificationState`: `entry` | `pending` | `verified` *(screen dead)*

### D.4 Platform differences

| Concern | iOS | Android |
|---|---|---|
| Safe areas | `useSafeAreaInsets`; TabBar `paddingBottom = max(bottom, 8)`; sheet footer 18 | same hook |
| Back | gesture only | hardware back via LIFO `BackHandler`; root = double-press-to-exit `ToastAndroid`; `predictiveBackGestureEnabled: false` |
| Status bar | `style="dark"` fixed | same |
| Shadows | `shadow*` props | `elevation` |
| Share-in | Share Extension "Save to Bookflow", max 10 files | intent filters `application/epub+zip`, `application/pdf` |
| Store copy | — | restore-purchases copy says "Google account" ⚠️ (Android-specific wording on a cross-platform screen) |
| Background audio | `UIBackgroundModes: ["audio"]` | — |
| Adaptive icon | — | bg `#ffffff` ⚠️ |

### D.5 Dead surfaces — scoping decision needed

Built but **unreachable** (no import outside their own file):

`PaywallSheet` · `PaywallPlanScreen` (comment-only) · `ComingSoonScreen` · `RestorePurchasesScreen` · `StudentVerificationScreen` · `AppRatingSheet` · `TooltipBubble` · `RetryQuestionsScreen` · `NotificationPermissionSheet` · `SignOutConfirmSheet` · `RootErrorBoundary` · `src/lib/google-auth.ts`

That is **~11 screens/sheets and 1 lib** — a material slice of Phase 2/3 effort. §F-13.

---

## E. Proposed Figma structure

### E.1 Frame sizes

Agreeing with the brief's default:
- **Base: 393 × 852** (iPhone 14/15/16 Pro) for every screen.
- **412 × 917** (Android) only where behaviour genuinely differs: Library (back-to-exit toast), any screen with a hardware-back affordance, Processing (share-intent entry), Restore purchases ("Google account" copy), and the three reader headers (status-bar treatment).

Nothing in the code suggests other sizes — `supportsTablet: true` is set in `app.json` but **no tablet-specific layout code exists**, so I propose no tablet frames. Confirm.

### E.2 File / page plan

**File 1 — Bookflow / Foundations**
1. Cover
2. `Primitives` spec (Forest / Ink / Cream / Amber scales + status singletons)
3. `Semantic / Color` spec (the 21 aliases, each showing alias → primitive → hex)
4. `Reader / Theme` spec (Light / Sepia / Dark × 10 keys)
5. Typography specimen (13 `textStyles` + the raw `fontSizes` scale, flagged)
6. Reading typography (3 presets × 3 fonts, slider range 16–28, constant 1.78 leading)
7. Spacing & radius scales (both spacing scales, side by side)
8. Elevation samples (4 derived steps, marked as derived)
9. Motion reference
10. Brand (logomark, wordmark, lockup × 3 sizes, app icons)
11. Voice avatars (6 + fallback)
12. Icons (68 Tabler components @24, stroke bound to a variable)
13. Cover-placeholder palettes
14. Layout grids

**File 2 — Bookflow / Components**
1. Cover · 2. Atoms · 3. Molecules · 4. Organisms (sheets) · 5. Organisms (players & AI panels) · 6. Deprecated / unreachable *(if we build them)*

**File 3 — Bookflow / Mobile App**
Cover · Index · then one page per flow, matching §D.2: 1 Auth · 2 Onboarding · 3 Library & Upload · 4 Readers · 5 AI tools · 6 Listen · 7 Discover · 8 You & Settings · 9 Monetisation · 10 System states.

Naming: `Flow / Screen / State` (e.g. `Reader / Text / Sepia`, `Library / Book row / Failed`).

### E.3 Variable collections

| Collection | Type | Modes | Publish |
|---|---|---|---|
| `Primitives` | colour + number | 1 | hidden |
| `Semantic / Color` | colour (alias) | `Light` | yes |
| `Reader / Theme` | colour (alias) | `Light`, `Sepia`, `Dark` | yes |
| `Spacing` | number | 1 | yes |
| `Radius` | number | 1 | yes |
| `Border` | number | 1 | yes *(derived)* |
| `Elevation` | number | 1 | yes *(derived)* |
| `Motion` | number | 1 | yes |

Code syntax on every variable, matching the real RN path — e.g. `tokens.colors.forest[800]`, `tokens.space.lg`, `tokens.radii['2xl']`, `tokens.textColors.muted`. Scopes: spacing → gap/padding only; radius → corner radius only; colour vars scoped by role (text / fill / stroke).

---

## F. Open questions and code-vs-design mismatches

Ordered by how much they block Phase 1–3. **1–3 and 13 need your answer before I start Phase 1.**

### F-1 🔴 The paywall UI does not exist in the codebase — *blocking*
The live paywall is RevenueCat's **hosted** paywall (`presentPaywall()`, 19 call sites); its design lives in the RevenueCat dashboard. Phase 3 item 9 asks me to replicate "the paywall". I cannot derive it from code.
**Options:** (a) you export/screenshot the hosted paywall and I trace it as a documentation frame; (b) I build only the in-app monetisation surfaces that *are* in code (SoftWarningBanner, plan cards, Buy Credits, top-up) and mark the paywall "external"; (c) I build the dead `PaywallPlanScreen`/`PaywallSheet` mockups and label them "retired".
**My recommendation: (b) + (a) if you can get the export.**

### F-2 🔴 Reader presets don't change line height — *blocking a foundation decision*
`PRESETS` declare `lineHeight` 1.5 / 1.8 / 2.0, but body text is **always** `fontSize × 1.78` (`ReaderScreen.tsx:2309`). The declared values only size the "Aa" preview glyph.
**Question:** is the constant 1.78 the intended behaviour (and the preset `lineHeight` field vestigial), or is this a bug? It changes whether Figma gets 1 reading text style per font or 3 per preset.

### F-3 🔴 The "icons always use strokeWidth 1.5" rule is widely broken — *blocking component modelling*
On `<Icon>` elements: **65** use 1.5, **79** override it — `1.75` ×27, `2` ×23, `2.5` ×20, `0` ×5 (deliberate, for filled glyphs), `3` ×3, `2.25` ×1. 29 files override.
**Question:** should the Figma icon components expose a stroke-width property (default 1.5) and I document real usage, or do you want 1.5 enforced and the overrides treated as debt to fix in code? I will not silently normalise to 1.5 — it would make Figma disagree with the app on ~80 instances.

### F-4 🟡 Two disagreeing display type scales
`fontSizes.display` = 56/32/22/18/16 vs `textStyles.display-*` = 48/36/28/22. `BottomSheet` title uses `fontSizes.display.sm` (18); most screens use `textStyles`. **Which is canonical?** I propose publishing only `textStyles` as Figma text styles and recording `fontSizes` as a legacy raw scale.

### F-5 🟡 `input.focusRingWidth: 3` is declared but never rendered
`Input.tsx` uses a 1px border that changes colour on focus. **Build the focus state as it renders (1px colour change) or as the token implies (3px ring)?** I will build what renders unless you say otherwise.

### F-6 🟡 No Border or Elevation tokens exist in code
Phase 1 asks for collections "with names matching the code's token names" — there are none. I will **derive** the 4-step elevation scale in §A.8 and a `border/hairline | border/default (1) | border/focus (3)` set, and mark both as *derived, not from code*. Confirm, or add the tokens to `tokens.ts` first (which I'd prefer — then design and code genuinely match).

### F-7 🟡 Three different playback-speed sets
See §A.12. Listen screen offers 5, the speed sheet 8 (incl. 3×), the store 7. **Which is canonical?** I'll build all three surfaces as they are and note it, but this looks like a real bug.

### F-8 🔴 Two different logomarks ship, and there is no SVG file for either — *blocking brand setup*
Two problems behind one ground rule.

**(a) No SVG asset exists.** Ground rule 7 says import the mark from the repo's SVG; the paths live only inline in `Lockup.tsx`. **Proposal:** extract them verbatim into `docs/figma/assets/` (`bookflow-logomark.svg`, `-wordmark.svg`, `-lockup.svg`), commit those, and vector-import them. No redrawing, no approximation.

**(b) The two marks disagree.** `Lockup.tsx` and `AuthCallbackScreen.Logomark` draw different curves — see §B.1 for the path data and the normalised comparison (0.80 vs 1.16 height:width; control points at 33%/67% vs 17%/83%). Both are live: the lockup appears in-app, the other on the auth-verifying screen.
**Question:** which is canonical? I will not pick one silently — whichever you choose, the other should be corrected in code so there is a single mark. Until you decide I'll build the `Lockup` geometry as `Brand / Logomark` and park the second as `Brand / Logomark (auth variant — pending reconciliation)`.

### F-9 🟡 Two voice-avatar colour systems
`VoiceAvatar.tsx` (12 bespoke hexes) vs `ListenScreen.VOICES` (token-based bg/fg). Both ship. **Which is canonical for the voice rows?** I'll build `VoiceAvatar` as the component and record the Listen-screen palette as a variant unless told otherwise.

### F-10 🟡 Root `CLAUDE.md` is stale in five ways
Not a design issue, but it misled the brief, so worth fixing:
| `CLAUDE.md` says | Reality |
|---|---|
| `lucide-react-native` icons | `@tabler/icons-react-native` v3.41.1 |
| Expo Router, `src/app/` tree | no router, no `src/app/`; hand-rolled `stage` machine in `App.tsx`; screens in `src/screens/` |
| NativeWind for styling | NativeWind installed but **0 `className` usages** and no `tailwind.config`; everything is `StyleSheet.create` + tokens |
| `epubjs` for EPUB, `expo-av`/`react-native-track-player` for audio | `react-native-webview` + `react-native-pdf`; `expo-audio` |
| TanStack Query for server state | installed; state is mostly bespoke hooks + Zustand |
| PostHog / Sentry / Resend | not in `package.json` |
I can prepare that `CLAUDE.md` patch separately — say the word.

### F-11 🟢 Button loading state doesn't match its spec
Spec (and `tokens.button.spinner`: 16px / 1.5 stroke / 700ms) says a custom spinner; `Button.tsx` renders `<ActivityIndicator size="small">`. I'll build the token-specified spinner and note the divergence.

### F-12 🟢 `OfflineBanner` Retry is a no-op
`LibraryScreen.tsx:975` passes `onRetry={() => {}}`. The button renders and does nothing. Design-wise I'll build it as enabled; flagging because it's a live UX bug.

### F-13 🔴 ~11 unreachable screens/sheets — *blocking Phase 2/3 scope*
See §D.5. **Do you want these in Figma?**
**My recommendation:** build `PaywallSheet` and `SignOutConfirmSheet` (they have real design value and near-duplicates are already live), skip the other nine, and list them in the coverage table as "built in code, unreachable, not designed". Your call.

### F-14 🟢 EPUB Full mode is a WebView with its own CSS design system
`EpubFullReaderScreen.tsx:785-860` injects a stylesheet that bypasses `tokens.ts` entirely: body Literata 17px/1.65 `#2A2620`; headings Fraunces `#1F1B16`; links `#2D6A4F`; rules/table borders `#DDD7CB`; code bg `#EDE7DD`; blockquote border `#C9C2B5` text `#4A443B`. Reader font/size/theme controls **do not apply** here (by design — the sheet says so).
**Question:** include a `Reading / EPUB-Web` token group and one representative frame, or document it as out-of-system? I lean toward including it — it's a surface users actually see.

### F-15 🟢 37 hex values used in code but absent from `tokens.ts`
149 raw hex occurrences outside `tokens.ts`; most duplicate existing token values (`#FAF7F2`, `#1A1A1A`, …) but **37 are genuinely undefined**. Beyond the voice/cover/EPUB sets already covered: `#A8D5B9` (5 files — consistently the **success border**, paired with `successBg`/`#E8F4ED`, so it is a missing `successBorder` token), `#EFC9C6` (2 — the matching error border), `#EAE6DC`/`#F0EDE5` (skeleton shimmer), `#2D6A4F` (notification tint, also EPUB links), `#C4A882`/`#5C4A30` (sepia swatch), `#2C3B31`, `#FFFFFF`, `#000` ×24 (shadow colour).
**Proposal:** add `Primitives/Extended` in Figma for these and open a follow-up to tokenise them in code.

### F-16 🟢 Smaller inconsistencies worth recording
- `App.buildNowPlayingProps` voice-label fallback is `'Rachel'` — not one of the six voices (dead fallback).
- `ListenScreen.VOICES` comment says "'free' tier exposes Rachel"; the free voice is Aria.
- "Verify student status" → `mailto:support@getbookflow.co` + OS Alert, **not** `StudentVerificationScreen`. "Restore purchases" → OS Alert, not `RestorePurchasesScreen`.
- Three sign-out confirmations coexist: `YouScreen.SignOutSheetBody`, `AccountScreen.SignOutBody`, and the dead `SignOutConfirmSheet`.
- `space` scale has no 20px/40px step, so `spacing.5`/`spacing.8` are unreachable via semantic names.
- Android adaptive-icon background is `#ffffff`, not `cream.50`.
- Upload step 3 "Generating audio" is shown, but audio generation at upload isn't wired (`LibraryScreen.tsx:892-894`).
- `ChapterSheet` is still named for chapters in a page-based reader.

---

## Next step

Phase 0 is done and awaiting approval. Before Phase 1 I need decisions on **F-1, F-2, F-3, F-8, F-13** (and ideally F-4, F-6, F-14).

One extra thing not in the brief: you gave me an existing Figma file, `Rt3gjNC24kBTrncxlnkuPW` ("Bookflow"), but the brief says to create three new files. I have not touched it. Tell me whether to (a) create the three new files as written, (b) use that file as one of the three, or (c) treat it as reference.
