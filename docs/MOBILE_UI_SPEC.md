# Bookflow — Mobile UI Specification

> **Purpose of this document.** A complete, code-accurate map of every screen, component, state, and interaction in the Bookflow mobile app — written so a designer can build the **tablet (large-screen) layout** without reverse-engineering the codebase. Each screen entry ends with a **Tablet adaptation** note, and a dedicated [Tablet Adaptation Strategy](#tablet-adaptation-strategy) section at the end synthesizes those into an overall plan.

**App:** Bookflow — a reading + listening companion. Bring your own EPUB/PDF or pick a free public-domain classic; read it, listen to it (AI narration), summarize it, ask questions about it, get practice quizzes, translate it, and save highlights.
**Stack:** React Native + Expo (SDK 55, New Architecture / Hermes + Fabric). Supabase (auth, Postgres, Storage, Edge Functions). RevenueCat (subscriptions). ElevenLabs (AI narration). Anthropic Claude (summaries / chat / practice / translation).
**Platform focus:** Android first (heading to Google Play Closed Testing); iOS deferred. Current footer reads "Bookflow 0.1.0".
**Navigation model:** No React Navigation — a single root **stage machine** in `App.tsx` swaps full-screen flows; inside the app, a 4-tab shell hosts the main surfaces, with reader/listen overlays and portal-rendered bottom sheets.

---

## Table of Contents

1. [Navigation & Information Architecture](#navigation--information-architecture)
2. [Design System](#design-system)
3. [Screen Inventory](#screen-inventory)
4. [Auth, Onboarding & Splash](#auth-onboarding--splash)
5. [Library & Discover tabs](#library--discover-tabs)
6. [Listen tab & audio playback](#listen-tab--audio-playback)
7. [Reading experience & AI tools](#reading-experience--ai-tools)
8. [You tab, Settings, Account & Paywall](#you-tab-settings-account--paywall)
9. [Shared Components](#shared-components)
10. [Tablet Adaptation Strategy](#tablet-adaptation-strategy)

---

## Navigation & Information Architecture

The app is a **single-component stage machine** (no React Navigation). `App.tsx` holds a `stage` state that swaps full-screen flows:

`splash → welcome → signin / signup → authCallback(/Error) → onboardingIntent → onboardingFirstBook → library`

Auth (Supabase magic-link / OAuth deep links via `expo-linking`), session restore, and RevenueCat (`configureRevenueCat`, `presentPaywall`, `useIsPro`) are wired at the root. Providers nest:
`GestureHandlerRootView → SafeAreaProvider → AudioSessionProvider → BottomSheetModalProvider`
(audio sits above the sheet provider so portal-rendered sheets can read the audio context; `BooksProvider` wraps only the library stage so the books list is fetched once per session).

### Bottom tab bar (`TabBar.tsx`)
Four tabs, fixed order, rendered only in the `library` stage by each tab screen as its last SafeAreaView child:

| Key | Label | Icon (inactive → active) |
|---|---|---|
| `library` | Library | Book → BookOpen (filled) |
| `discover` | Discover | Compass → CompassFilled |
| `listen` | Listen | Headphones → HeadphonesFilled |
| `you` | You | User → UserFilled |

Each item is a flex-1 `Pressable` with a 20px icon over a 10px Geist-Medium label; active = forest-800 + weight 500, inactive = ink-500 + weight 400. Bar is canvas-bg, hairline top border, bottom inset = `max(safeArea, space.sm)`. Active tab is `activeTab` state lifted to `App` (survives re-renders, ready for deep-links); `LibraryStage` conditionally renders one screen per `activeTab`.

### Overlays
- **Reader overlay** — opened from `LibraryScreen`; drives `readerOpen` up to `LibraryStage` (to hide the MiniPlayer). Full-screen with its own chrome (header, `ModeTogglePill` Full/Text switch, bottom action bar: Listen / AI tools / Search / Highlights / Reading options).
- **Foreground Listen overlay** — tapping "Listen" on a book starts the audio session and sets `listenForeground=true`. `LibraryStage` then **returns `<ListenScreen>` instead of the tab shell** (not absolute-positioned), so bottom sheets stack flat above it — this is the bimodal page-text + bottom audio player. `onBack` dismisses and switches `activeTab` to `library`; `onMinimize` dismisses without the tab swap (both keep audio alive). Distinct from the **Listen tab** itself (a companion now-playing dashboard).
- **Global MiniPlayer** — floats in an absolute bottom overlay (`pointerEvents="box-none"`) docked above the TabBar. Shows only when `audio.book` exists AND `!listenForeground && !readerOpen && !youSubViewOpen && !discoverSubViewOpen && activeTab !== 'listen' && activeTab !== 'you'` — effectively only on the Library and Discover-home surfaces. Tapping it expands to the foreground ListenScreen; swipe past ~35% screen width dismisses it (keeps session alive).
- **Sheets / modals** — hosted via `@gorhom/bottom-sheet`'s `BottomSheetModalProvider` at the root; individual sheets render through its portal. No separate modal stack.

### IA tree
```
App (stage machine)
├─ splash
├─ welcome → signin | signup → authCallback → (onboarding | library)
├─ onboardingIntent → onboardingFirstBook → library
└─ library  [BooksProvider]
   ├─ Tab: Library ──(open book)──▶ Reader overlay (Full/Text modes, action bar)
   ├─ Tab: Discover ──▶ category list / book detail (sub-views)
   ├─ Tab: Listen
   │   ├─ ListenHome (now-playing card + recents + stats)
   │   └─ ListenHistory (historyOpen sub-route)
   ├─ Tab: You ──▶ Account / Settings / Notifications (sub-views)
   ├─ Foreground ListenScreen  (replaces tab shell; bimodal player)
   ├─ MiniPlayer  (floats over Library & Discover-home only)
   └─ Bottom-sheet portal  (voice / speed / chapters / sleep / reminder / confirm)
```

---

## Design System

Source of truth: `src/design/tokens.ts`.

### Color palette

**Forest** (primary brand, "literary" feel):
`900 #0E2A21` · `800 #1B4332` (primary brand) · `700 #234D38` · `600 #2D5A3F` · `200 #B7CCB9` · `100 #DAE6DC` · `50 #EFF4F0`

**Ink** (neutrals — text & chrome):
`900 #1A1A1A` (primary text) · `700 #3D3A36` · `500 #6B6862` · `400 #8A8780` · `300 #B5B2AB` · `200 #D8D5CC` · `100 #ECE9E0`

**Cream** (warm, paper-like backgrounds — never pure white):
`50 #FAF7F2` (default app background) · `100 #F5F1E8` · `200 #ECE5D5`

**Amber** (single accent — bimodal word highlight, illustration accent, upgrade CTAs):
`500 #D4A574` · `200 #EFD9B5` · `50 #FAF1E0`

**Sepia** (reader theme): bg `#F5EDD8` · surface `#EDE0C4` · text `#3D2B1F` · muted `#7A5C3E` · border `#D4C4A0`

**Dark** (reader theme — forest-tinted near-black): bg `#1A1F1B` · surface `#232A24` · text `#E8E5DC` · muted `#8A8780` · border `#3D453E` · accent `#4A7C59`

**Semantic singletons:**
- `error #B5453A` · `errorPressed #9C3B30` · `errorBg #FBEAE7`
- `success #2D7A4F` · `successBg #E8F4ED`
- `warn #A0692A` · `warnBg #FDF3E3` · `warnBorder #EFD9B5` (usage-limit / paywall / wrong-answer states)
- `offline #4A5568` · `offlineBg #F0F2F5` · `offlineBorder #CBD5E0` (connectivity banners)

**Semantic role layers** (preferred in screens over raw scales):
- `textColors`: primary=ink900, secondary=ink700, muted=ink500, subtle=ink400, disabled=ink300, inverse=cream50, accent=forest800, error, success
- `bgColors`: canvas=cream50, surface=cream100, raised=cream200, accent=forest800, accentMuted=forest100, errorMuted=errorBg, successMuted=successBg, overlay=ink900
- `borderColors`: subtle=ink200, default=ink300, accent=forest800, error
- Skeleton greys (hardcoded in `Skeleton.tsx`): base `#EAE6DC`, light `#F0EDE5`.

### Typography

Three families, each loaded per-weight (RN does not synthesize weights):
- **Display / serif = Fraunces** — `display` (500 Medium), `displayBold` (600 SemiBold), `displayItalic` (400 Italic). Hero/section/card titles, sheet titles.
- **UI / sans = Geist** — `ui` (400), `uiMedium` (500). Chrome: buttons, inputs, labels, list rows, tab labels.
- **Reading = Literata** — `reading` (400). Reader body text.
- **Dyslexia = Lexend** — `dyslexia` (400). Accessibility reading option.

**Composed `textStyles` presets** (apply via `<Text variant>`; family + size/lineHeight + weight):
- Display (Fraunces): `display-xl` 48/56 600 · `display-lg` 36/44 500 · `display-md` 28/36 500 · `display-sm` 22/30 500
- Heading (Geist Medium): `heading-lg` 20/28 · `heading-md` 16/24 · `heading-sm` 14/20
- Body (Geist): `body-lg` 16/24 · `body-md` 14/20 (default) · `body-sm` 12/18 · `body-xs` 11/16
- Label (Geist Medium, UPPERCASE, letterSpacing 0.5): `label-md` 12/16 · `label-sm` 10/14

### Spacing & radii

- **Numeric `spacing`** (4px base): 0, 1=4, 2=8, 3=12, 4=16, 5=20, 6=24, 7=32, 8=40, 9=48, 10=56, 11=64, 12=80.
- **Named `space`** (preferred): none=0, xs=4, sm=8, md=12, lg=16, xl=24, 2xl=32, 3xl=48, 4xl=64.
- **`radii`:** xs=4, sm=6, md=8, lg=10, xl=12, 2xl=14, 3xl=16, full=9999.
- **Motion:** durations fast=100, normal=120, medium=160, slow=200; standard/decelerate/accelerate cubic-beziers.

### Recurring visual patterns
- **Cards:** cream surface (cream100), radius 12–14, padding 14–16, gap 12. Cover thumbnails are rounded rects (radius 6) with colored-initials fallback.
- **Pills / segmented controls:** rounded-full or radius 10–13 track holding flex halves; active half = raised cream/white capsule with soft shadow/elevation; inactive transparent.
- **Chips:** flex-1 rounded-10 cells, hairline border; active = forest-50 fill + forest-800 border/text.
- **Meters / progress bars:** thin (2–3px) full-width bars; plan meters render `used/total`, `Infinity` shown as "Unlimited"; fill auto-promotes to amber at ≥80% usage.
- **Badges / eyebrows:** small uppercase label (10–11px Geist Medium) often paired with a 6px amber dot.
- **Toggles:** custom 44×26 (or 36×22) pill track (forest-800 on / ink-300 off), cream thumb — used everywhere instead of the native Switch.
- **Bottom sheets:** cream50 surface, top radius 16, 32×4 ink-300 grab handle, 0.4 backdrop, 16px horizontal padding, dynamic sizing, pan-down-to-close.
- **Icon tiles:** square rounded cream100 tiles (28–32px) holding a 16–18px ink-700 icon (list rows); circular 44px forest-800 tile for the primary "Listen" action; 36px circular header buttons.
- **Status banners:** full-width tinted row (warn-amber or offline-slate) with hairline bottom border, leading icon + text + optional retry pill — intentionally clashes with chrome to read as transient.

---

## Screen Inventory

**41 screen files** in `src/screens/` + **16 shared components** in `src/components/`. Grouped by area below. Several files contain multiple sub-views/sheets (noted inline).

| Area | Screens |
|---|---|
| Auth / Onboarding | Splash, Welcome, SignIn, SignUp, AuthCallback, OnboardingIntent, OnboardingFirstBook, ComingSoon |
| Library | Library (+ search, sort/filter sheet, action sheet, remove sheet, empty state), UploadFlow (add sheet, processing, scanned-PDF error) |
| Discover | Discover (home rails, search, category, book detail) |
| Listen / Audio | ListenHome, ListenNowPlaying, ListenScreen (foreground bimodal), ListenHistory, PlaybackSpeedSheet, ChapterSheet, EqBars, MiniPlayer |
| Reader / AI | Reader (text), EpubFullReader, PdfReader, BookSearch, InReaderSearchHeader, Highlights, AITools (sheet + Summary + Chat + WholeBookCredit), PracticeQuestions, RetryQuestions, TranslateChapter, TranslateWordPopover |
| You / Settings | You, Account (+ EditProfile), Settings, YouDrillScreens (ReadingDisplay, PlaybackSpeed, DefaultVoice, TranslationLanguage, Notifications, Help, SendFeedback), HelpFAQ, SendFeedback, StudentVerification, RestorePurchases |
| Paywall / Sheets | PaywallScreen (+ SoftWarningBanner), PaywallSheet, AppRatingSheet, NotificationPermissionSheet, SignOutConfirmSheet |
| Design system / shared | tokens, TabBar, BottomSheet, Text, Button, Input, ListRow, Icon, Lockup, ModeTogglePill, Skeleton, SlowNetworkBanner, RootErrorBoundary, ReminderTimePicker, SkeletonScreens, TooltipBubble |

---

## Auth, Onboarding & Splash

### SplashScreen (`src/screens/SplashScreen.tsx`)
- **Reached from:** App cold-launch entry. Mounts after native splash dismisses; calls `onComplete()` to route onward (Welcome if unauthenticated, into app if authenticated).
- **Purpose:** One-time branded logo-draw animation during the cold-launch hold.
- **Layout (top → bottom):** Full-screen centered single stack: animated SVG logomark (96×96) above the "Bookflow" wordmark. No header/inputs/footer.
- **Key components & visuals:** Background `bgColors.canvas` (cream-50). Logomark = two stacked cubic-curve Paths (main + 40%-opacity echo) stroked in forest-800, strokeWidth 9, round caps. Wordmark Fraunces 36px, weight 600, letterSpacing -0.72. Stack gap `space['2xl']`.
- **States:** Native vs web. Native: animated draw (stroke-dashoffset 110→0 over 1200ms; echo draws+fades; wordmark fades in at 800ms; "breathing" scale pulse looping after 1400ms), 5000ms hold. Web: static logo, fires `onComplete` after 600ms.
- **Interactions:** None — auto-advances via timer; animations cancel on unmount.
- **Data:** None; single `onComplete` callback.
- **Tablet adaptation:** Keep full-bleed and centered; optionally bump logomark/wordmark size on large tablets.

### WelcomeScreen (`src/screens/WelcomeScreen.tsx`)
- **Reached from:** After Splash when NOT authenticated. Routes via `onGetStarted` (→ Sign up) and `onSignIn` (→ Sign in).
- **Purpose:** First-impression marketing screen with value prop + two entry CTAs.
- **Layout (top → bottom):** SafeAreaView. Small `Lockup` top-left; flex-grow hero illustration (open-book SVG with amber "flow" swooshes); headline "Everything you need to *read better*." (italic amber emphasis); subhead "Read, listen, summarize, and ask — for any book you bring or any classic in our library."; two stacked full-width buttons — primary "Get started" (large) + tertiary "I already have an account"; legal microcopy with tappable Terms/Privacy links.
- **Key components & visuals:** `Lockup`, `Button`, `Text`, inline `HeroIllustration` SVG. Canvas bg. Headline Fraunces 32/36, weight 500; emphasis `displayItalic` in accent. Hero ink = forest-800, swooshes = amber-500, max-width 280. Legal text 11px subtle.
- **States:** Static; button variants are the only variation.
- **Interactions:** "Get started" → `onGetStarted`; "I already have an account" → `onSignIn`; Terms/Privacy → `Linking.openURL`.
- **Data:** Legal URL constants only.
- **Tablet adaptation:** Constrain content to a centered max-width (~480px) card, or split two-pane (hero one side, headline+CTAs the other).

### SignInScreen (`src/screens/SignInScreen.tsx`)
- **Reached from:** Welcome "I already have an account" (signin variant). Also the shared component for SignUp. Exits via `onBack`, `onSwitchVariant`, `onComplete`.
- **Purpose:** Passwordless magic-link auth (sign in / sign up via variant).
- **Layout (top → bottom):** SafeAreaView. Header with back button. **Form stage:** title ("Welcome back." / "Create your account.") + subhead; form group — (signup) "Full name" Input, "Email" Input, (signup) marketing-consent checkbox, full-width primary "Send magic link"; (signup) legal microcopy; footer "Don't have an account? Sign up" / "Already have an account? Sign in". **Success stage:** 96px circular forest-50 badge with mail-sparkle icon, "Check your email.", subhead echoing the email, full-width "Resend link", helper "…valid for 15 minutes."
- **Key components & visuals:** `Input`, `Button`, `Icon`, `Text`, inline `Header`/`ConsentRow`/`MailSparkleIcon`. Canvas bg, horizontal padding 28. Titles Fraunces 32px (success 28px). Consent checkbox 18×18, checked fills forest-800. Footer link `uiMedium` accent.
- **States:** Two stages (`form`/`success`). Form: per-field validation, submit loading spinner, autofocus. Success: 30s resend cooldown ("Resend link · {n}s", disabled during cooldown), `resendError` recolors helper. Variant alters fields/copy/consent/footer.
- **Interactions:** Type name/email (return-key chaining); toggle consent; "Send magic link" → validate → `sendMagicLink` → success; back; switch variant; resend; Terms/Privacy. (Note: "Open email app" button intentionally removed for Android.)
- **Data:** `sendMagicLink({ email, variant, marketingConsent, fullName })` (Supabase magic link); legal URLs.
- **Tablet adaptation:** Center form/success in a fixed-width card (~420px); keep back button at the card's top-left.

### SignUpScreen (`src/screens/SignUpScreen.tsx`)
- **Reached from:** Welcome "Get started", or SignIn footer "Sign up". Exits via `onBack`, `onSignIn`, `onComplete`.
- **Purpose:** Thin wrapper rendering `SignInScreen` with `variant="signup"`.
- **Layout / components / states / interactions:** Identical to SignInScreen's signup variant (full name + email + consent + "Send magic link" + legal + "Already have an account? Sign in"). Maps `onSignIn` → `onSwitchVariant`.
- **Data:** Same as SignInScreen (signup variant).
- **Tablet adaptation:** Same centered fixed-width card.

### AuthCallbackScreen (`src/screens/AuthCallbackScreen.tsx`)
- **Reached from:** Opened when a magic link is tapped and the token is verified. Caller controls `state`. Exits via `onRetry`, `onBackToSignIn`.
- **Purpose:** Transient verification screen (progress, or error).
- **Layout (top → bottom):** SafeAreaView. **Verifying:** centered fading-in logomark (56px), "Almost there.", "Verifying your sign-in link…", three staggered pulsing dots. **Error:** 88px circular errorMuted badge with AlertTriangle, per-error title/subhead, full-width primary ("Get a new link" / "Try again") + tertiary "Back to sign in".
- **Key components & visuals:** `Button`, `Icon`, `Text`, inline `Logomark`/`PulseDot`. Canvas bg. Dots 6px crossfading forest-200→forest-800, scale pulse. Error title Fraunces 26px.
- **States:** `verifying` / `error`. Four error variants (`expired`, `used`, `network`, `unknown`) each with title/sub/button label.
- **Interactions:** Verifying: none (auto). Error: primary → `onRetry`; "Back to sign in" → `onBackToSignIn`.
- **Data:** Purely visual — token exchange lives at the call site.
- **Tablet adaptation:** Center both states; cap error illustration + buttons to ~360–400px column.

### OnboardingIntentScreen (`src/screens/OnboardingIntentScreen.tsx`)
- **Reached from:** Step 1 of 2 onboarding (after sign-up). Exits via `onContinue(intent)`, `onSkip`.
- **Purpose:** Single-select "why are you here" (stored to profile + analytics).
- **Layout (top → bottom):** SafeAreaView. Top bar — 50% progress track + "Skip for now". Title "What brings you to Bookflow?" + subhead. Scrollable list of 5 single-select option cards (icon tile + label + sublabel + radio): Read more for fun / Study for school or work / Improve focus or accessibility / Listen on the go / Just exploring. Full-width "Continue" (disabled until a selection).
- **Key components & visuals:** inline `IntentOption`. Cards: 1.5px ink-200 border, radius 12, 36px cream-100 icon tile; selected → forest-50 bg + forest-800 border + forest-100 tile + forest radio. Title Fraunces 30/34.
- **States:** Selection state; Continue disabled until selected.
- **Interactions:** Tap card → select; Continue → `onContinue(selected)`; "Skip for now" → `onSkip`.
- **Data:** Emits `OnboardingIntent`; caller persists `onboarding_intent` + emits `signup_intent_picked`.
- **Tablet adaptation:** Center column (~520px); cards could become a 2-column grid; keep progress/title/CTA centered.

### OnboardingFirstBookScreen (`src/screens/OnboardingFirstBookScreen.tsx`)
- **Reached from:** Step 2 of 2 onboarding. Exits via `onContinue(selection)`, `onSkip`, `onPickFile`.
- **Purpose:** Ensure the user leaves with ≥1 book — pick from a curated grid or upload.
- **Layout (top → bottom):** SafeAreaView. Top bar — 100% progress + "Skip for now". Title "Pick your first book." + subhead. Pill segmented control: "From our library" / "Upload your own". **Library tab:** scrollable 3-column grid of 6 curated book cards (cover + title/author, forest check badge when selected). **Upload tab:** centered dashed dropzone with CloudUpload in a 56px forest-50 circle, "Bring your own book", "Choose file" button, "EPUB, PDF · max 50MB · stays private to you". Full-width CTA.
- **Key components & visuals:** inline `TabButton`/`BookCard`/`BookCoverArt`/`UploadTab`; `CURATED_LIBRARY` data. Segmented on cream-100, active cream-50 + shadow. Covers aspectRatio 2/3, radius 6; selected → forest-800 ring + check badge. Fallback covers use per-book linear gradient. Title Fraunces 30px.
- **States:** Active tab; multi-select Set of ids; CTA label dynamic ("Add to library" / "Add {n} books to library"), disabled unless library tab + ≥1 selected. Cover image load/error → gradient fallback.
- **Interactions:** Switch tabs; toggle book selection; CTA → `onContinue({ source: 'library', books })`; "Choose file" → `onPickFile`; "Skip for now" → `onSkip`.
- **Data:** `CURATED_LIBRARY` + Gutenberg cover fetch; caller copies books + emits `signup_first_book_picked`.
- **Tablet adaptation:** Widen grid to 4–6 columns in a centered container; enlarge the upload dropzone; keep segmented control/title/CTA centered.

### ComingSoonScreen (`src/screens/ComingSoonScreen.tsx`)
- **Reached from:** Placeholder for not-yet-built main tabs (legacy — current Discover/Listen are built). Navigation stays via `onTabChange`.
- **Purpose:** Honest placeholder while keeping tab nav available.
- **Layout (top → bottom):** SafeAreaView. Page header (tab title `display-md`). Centered empty state — 72px rounded surface icon tile (Compass/Headphones) + `heading-md` subtitle + muted paragraph (max-width 320). Persistent bottom `TabBar`.
- **Key components & visuals:** `Icon`, `TabBar`, `Text`. Canvas bg; icon tile bgColors.surface, radius 3xl.
- **States:** Two content variants keyed by `tab`.
- **Interactions:** Only the `TabBar` (`onTabChange`).
- **Data:** Static copy map.
- **Tablet adaptation:** Center the empty-state block; move TabBar to a side rail if adopting sidebar nav.

---

## Library & Discover tabs

### Library (`src/screens/LibraryScreen.tsx`)
- **Reached from:** Default tab on launch; `library` in the `TabBar`.
- **Purpose:** Personal shelf — continue reading, browse/sort/filter owned books, add new ones.
- **Layout (top → bottom):** SafeAreaView over a vertical ScrollView. Optional `OfflineBanner` ("No connection · Reading still works · Streaming unavailable") or `SoftWarningBanner` (free-tier audio low). Inside: **Header** (Fraunces "Library" 28px + three circular icon buttons: Search, Filter, Plus); **ReadingStatsCard** (headline "Xm today/this week", Mon–Sun weekday dots, right-aligned "N day streak" badge); **ContinueCard** under "Continue reading" (hero cover + title/author + "Page N · X% done" + thin progress bar + "Listen" primary + "Read" secondary); **SectionHeader** ("All books · N" + sort toggle with ArrowsSort icon); **BookList** (rows with hairline dividers). Fixed bottom `TabBar`.
- **Key components & visuals:** `BookCover` (colored box with first-initial fallback or signed image; optional forest "downloaded" badge). List rows = 40×60 cover + title (uiMedium) + author (muted xs) + 2px progress bar or status line + ChevronRight. Forest primary buttons, amber accents.
- **States:** Loading → `LibrarySkeleton`. Empty → `LibraryEmptyContent`. Offline → banner + dimmed header icons + disabled "Listen" ("Audio streaming unavailable offline"). Free vs pro → low-audio `SoftWarningBanner` only to non-pro when `audioRemainingMin <= 18`. Per-row processing → spinner "Processing…" / red "Upload failed · tap to remove".
- **Interactions:** Tap row → opens reader (PDF→`PdfReaderScreen`, EPUB→`EpubFullReaderScreen`/`ReaderScreen` by `epubMode`); failed row → remove flow. Long-press (350ms) → action sheet. Header buttons → search/sort-filter/add. Pull-to-refresh. `onReaderOpenChange` hides the mini-player.
- **Data:** `useBooks` (realtime), `useReadingStats`/`useMonthlyListenStats`, `useBookUpload`, `useFreePlanUsage` + `FREE_PLAN_LIMITS`, `useIsPro`/`presentPaywall`, `useNetworkState`, `reprocessBook`, `supabase`, `readerStore`.
- **Tablet adaptation:** Master-detail split — left rail with stats + book list/grid, right pane = selected reader/detail; render "All books" as a multi-column cover grid.

### Library — Search mode (`src/screens/LibraryScreen.tsx`)
- **Reached from:** Search button in the Library header.
- **Purpose:** Find an owned book by title or author.
- **Layout (top → bottom):** `SearchHeader` (back + pill TextInput "Search by title or author" + clear + "Cancel"), then ScrollView: empty → `PreSearchContent` (Recent searches + `DiscoverNudge`); results → `SearchResults` ("N results" + bordered rows + nudge); none → `NoResults`. Bottom `TabBar`.
- **Key components & visuals:** `SearchResultRow` = 36×54 cover + `HighlightedTitle` (matched substring in amber) + author + progress. `DiscoverNudge` = forest-tinted card → Discover.
- **States:** Pre-search / results / no-results. Recents persisted (`@bookflow/recent_searches`, max 5).
- **Interactions:** Live filter; tap recent to refill; tap result → reader; nudge → `onTabChange('discover')`; Cancel saves term + exits.
- **Data:** Local filter over `useBooks`; AsyncStorage recents.
- **Tablet adaptation:** Search as an overlay anchored to header; results in left pane, tapped result in right detail pane.

### Add-book sheet (`src/screens/UploadFlowScreen.tsx`)
- **Reached from:** Plus button, or empty-state "Upload a book".
- **Purpose:** Choose how to add a book.
- **Layout (top → bottom):** `BottomSheet` — header "Add a book" / "Choose how you'd like to add", divider, two `AddOption` rows, "Cancel".
- **Key components & visuals:** Option 1 — forest 48px icon (Upload), "Upload a file" / "PDF or EPUB from your device · max 50 MB". Option 2 — amber icon (BookOpen), "Browse free books" / "200+ public domain classics". ChevronRight each.
- **States:** Static.
- **Interactions:** "Upload a file" → `onUpload` (free-tier gate → picker/paywall); "Browse free books" → Discover; Cancel.
- **Data:** Upload via parent `useBookUpload`.
- **Tablet adaptation:** Centered modal dialog; options side-by-side as larger cards.

### Sort & filter sheet (`src/screens/LibraryScreen.tsx`)
- **Reached from:** Filter header button or the SectionHeader sort toggle.
- **Purpose:** Choose sort order + status filter for "All books".
- **Layout (top → bottom):** `SortFilterSheet` — "Sort & filter" + "Reset"; "Sort by" radios (Recent, Recently added, Title A–Z, Progress); divider; "Filter" radios (All / In progress / Not started / Finished, each with count); full-width "Apply".
- **Key components & visuals:** `RadioDot`; active row `sheetOptionActive`; counts from live totals.
- **States:** Pending vs applied (pending resets on dismiss-without-Apply).
- **Interactions:** Tap radio to stage; Apply commits; Reset → Recent/All; dismiss discards.
- **Data:** `counts` from `useBooks`.
- **Tablet adaptation:** Inline toolbar dropdown or persistent left-sidebar filter panel.

### Book action sheet — long-press (`src/screens/LibraryScreen.tsx`)
- **Reached from:** Long-pressing a row.
- **Purpose:** Per-book actions: highlights, re-process, remove.
- **Layout (top → bottom):** Header (cover + title/author), divider, three `ActionRow`s, "Cancel".
- **Key components & visuals:** amber Notebook "View highlights"; forest Refresh "Re-process chapters"; red Trash "Remove from library" (destructive).
- **States:** Placeholder frame during dismiss.
- **Interactions:** Highlights → `HighlightsScreen`; Re-process → `reprocessBook` + refetch; Remove → remove-confirm sheet (staggered).
- **Data:** `reprocessBook`, `useBooks` refetch.
- **Tablet adaptation:** Popover anchored to the grid item, or contextual action bar in the detail pane.

### Remove-book confirm sheet (`src/screens/LibraryScreen.tsx`)
- **Reached from:** "Remove from library", or tapping a failed-upload row.
- **Purpose:** Confirm destructive deletion.
- **Layout (top → bottom):** `RemoveBookSheetContent` — red Trash + "Remove book?" / "This can't be undone.", book row, warning text, stacked destructive "Remove book" (spinner) + "Cancel".
- **States:** `removing` disables both, swaps label for spinner.
- **Interactions:** Confirm → delete storage + `books` row, dismiss + refetch; errors via Alert.
- **Data:** `supabase.storage` + `books.delete()`.
- **Tablet adaptation:** Centered confirmation modal/alert.

### Library empty state (`src/screens/LibraryScreen.tsx`)
- **Reached from:** Library tab when `books.length === 0` post-load.
- **Purpose:** Onboard adding the first book.
- **Layout (top → bottom):** Header (Search + Plus), greeting ("Good morning/afternoon/evening" + "Welcome, {firstName}."), upload block (hand-drawn BookIllustration + amber dot, "Add your first book", "Upload a PDF or EPUB…", full-width "Upload a book", "EPUB or PDF · max 50 MB"), "Free to read" section ("See all →") with a grid of `CURATED_LIBRARY` gradient covers. Bottom `TabBar`; pull-to-refresh.
- **Key components & visuals:** Curated cards = SVG gradient covers.
- **States:** Shown only after load resolves with zero books.
- **Interactions:** Upload CTA + grid → Add sheet; "See all" → Discover.
- **Data:** `CURATED_LIBRARY`.
- **Tablet adaptation:** Wider curated grid; center upload block beside (not above) the grid.

### Processing screen (`src/screens/UploadFlowScreen.tsx`)
- **Reached from:** Starting an upload, or consuming `pendingUploadAssets` (onboarding / share-extension).
- **Purpose:** Live progress of upload → chapter extraction → audio generation.
- **Layout (top → bottom):** Centered 96px SVG progress ring (cream track + forest arc; "%" or Loader when indeterminate; red + X when failed), title + subtitle, bordered steps list (`StepRow`s with circular state indicators), actions "Continue in background" + "Cancel upload". Batch mode → "Uploading N of M" / "Added N books".
- **Key components & visuals:** `ProcessingStep` trio — "Uploading file", "Extracting chapters", "Generating audio" ("Coming soon", stays pending). Live sublabels with percent + file size.
- **States:** picking/creating/uploading/processing/ready/partial/failed drive ring/title/steps; **failed** = scrollable variant with a green "Text reading is ready now" card + three-tier CTAs (Retry audio / Read without audio / Remove book).
- **Interactions:** Background dismisses (upload continues); Cancel aborts + resets; ready/partial auto-dismiss ~1.5s + refetch.
- **Data:** `useBookUpload` state; `formatNetworkError`.
- **Tablet adaptation:** Centered modal/card over the library (shelf visible behind).

### Scanned-PDF error screen (`src/screens/UploadFlowScreen.tsx`)
- **Reached from:** Upload fails with `failureReason === 'scanned_pdf'`.
- **Purpose:** Explain an image-only PDF can't be read; offer alternatives.
- **Layout (top → bottom):** Header (X + "Can't read this file"), red FileText circle, "This PDF is a scanned image" + explanation, file-info card ("PDF" badge + name + "Scanned · No extractable text"), numbered "What to try instead" (OCR via Acrobat/Smallpdf; find the EPUB; browse free library), CTAs "Try another file" + "Browse free books instead".
- **Key components & visuals:** `NextStepRow` numbered steps; red error-muted accents.
- **States:** Static; falls back to "Your PDF" if no filename.
- **Interactions:** "Try another file"/close → re-open Add sheet; "Browse" → Discover.
- **Data:** `fileName`/`fileSizeLabel` from upload state.
- **Tablet adaptation:** Centered modal; explanation + steps in two columns.

### Discover — Home (`src/screens/DiscoverScreen.tsx`)
- **Reached from:** `discover` tab; also Library nudges, Add sheet "Browse free books", scanned-PDF "Browse".
- **Purpose:** Browse/search a free public-domain catalog; add books to library.
- **Layout (top → bottom):** SafeAreaView + ScrollView. Optional `SlowNetworkBanner`. **Header** (Fraunces "Discover" 28px); pill **search bar** ("Search books…", inline spinner); horizontal **category chips** (For you, Classics, Christianity, Fiction, Mystery, Adventure, Romance, Sci-fi, Philosophy, Poetry, History, Children, Short reads; active = forest fill); then stacked sections: **"Featured this week"** (`FeaturedCard`), and rails "Popular fiction", "Spiritual classics", "Curated classics — From Wikisource", "From the Internet Archive — Via Open Library", "Academic books — From DOAB", "Short reads" (smaller `ShortCard`). Bottom `TabBar`.
- **Key components & visuals:** `FeaturedCard` = forest panel + 90px cover + "✦ Editor's pick" eyebrow + blurb + Add/Adding…/In library button. `RailCard` = ~108px cover (`CoverBox` image/fallback) + forest "in library" Check overlay + title (2 lines) + author. Rails fetch 8 each; rows carry "See all →" or a muted source sub-label.
- **States:** Loading (popular empty) → spinner + "Loading free books…". Error → "Couldn't reach the catalog" + pull-to-refresh hint. Refreshing → `RailSkeletonRow`. Slow network → banner after ~5s. Rails self-hide until they have data (SWR: seed → cache → network). Free vs pro → adding over the book cap presents the paywall.
- **Interactions:** Search (synchronous local typeahead + debounced Gutendex network search, 4s cap, LRU cache); chip/"See all" → category; card/featured → detail; Add → `handleAddToLibrary` (optimistic pending → realtime flips to "in library"); pull-to-refresh; hardware back clears search. `onSubViewOpenChange` hides mini-player on drill-in.
- **Data:** `useBooks` (derive `libraryIds`), `useFreePlanUsage`/`presentPaywall`, `discoverApi` (popularGutenberg, topicGutenberg, searchGutenberg, fetchWikisource, fetchOpenLibrary, fetchDoabRest), `discoverCache` (AsyncStorage SWR), `discoverImport`, `DISCOVER_SEED`, `useSlowOp`, `supabase`.
- **Tablet adaptation:** Keep horizontal rails but more cards per row + larger featured hero; consider a persistent left sidebar for categories instead of the chip rail.

### Discover — Search results (`src/screens/DiscoverScreen.tsx`)
- **Reached from:** Typing in the Discover search bar.
- **Purpose:** Catalog matches for the query.
- **Layout (top → bottom):** Vertical `catBookList` rows (cover + title + author + up to 2 tag pills + `AddPill`), `catDivider` between. Empty → `SearchEmptyState`.
- **Key components & visuals:** `AddPill` (forest "Add" / "Adding…" / muted "In library"). `SearchEmptyState` = "No matches" + three tappable copy cards (support email, "Book request" subject, pre-filled body) with "Copied" confirmation.
- **States:** searching → spinner; `[]` → request surface; populated → list. Local matches paint before network.
- **Interactions:** Tap row → detail; Add/Remove via `AddPill`; tap copy card → clipboard.
- **Data:** `searchCache` + `localMatches`/`searchGutenberg`; `expo-clipboard`; `SUPPORT_EMAIL`.
- **Tablet adaptation:** Multi-column card grid; request-a-book empty state as a centered panel.

### Discover — Category view (`src/screens/DiscoverScreen.tsx`)
- **Reached from:** Tapping a category chip (non-"For you") or a rail's "See all →".
- **Purpose:** Full list of free books for one category.
- **Layout (top → bottom):** Header (back + title + meta "N books · all free" + decorative Filter icon), ScrollView `catBookList` rows (cover + title + author + 2 tags + `AddPill`). Bottom `TabBar`.
- **States:** Books present → list (even cache/seed while "Loading…"); empty + loading → spinner; empty + done → "No books in this category yet".
- **Interactions:** Tap row → detail (`from: 'category'`); Add/Remove; back → home (resets to "For you").
- **Data:** Category SWR (`peekCachedShelf`/`getCachedShelf`/`topicGutenberg`); "For you" reuses popular.
- **Tablet adaptation:** Multi-column grid in the right pane; category list/chips in left sidebar (master-detail).

### Discover — Book detail (`src/screens/DiscoverScreen.tsx`)
- **Reached from:** Tapping any Discover card.
- **Purpose:** Full info + add/remove to library.
- **Layout (top → bottom):** Header (back + "Book details" + decorative share icon), ScrollView: large centered cover, title, author, meta row (Read time, Chapters, green "Free" badge), "About" + blurb, "Topics" tag pills, "Source", optional "If you like this" related rail. Fixed bottom CTA bar: full-width primary cycling "Add to library" / "Adding…" / "Remove from library", plus (in library only) a square "Play" sample button. Bottom `TabBar`.
- **Key components & visuals:** `detailPrimaryBtn` forest vs muted; green `freeBadge`; tag pills; related cards.
- **States:** `pending` disables CTA + spinner; `inLibrary` flips to remove + reveals Play; optional fields conditional.
- **Interactions:** CTA → add/remove (`handleAddToLibrary`/`handleRemoveFromLibrary` with Alert); back → originating view.
- **Data:** `importDiscoverBook`/`importErrorMessage`, `supabase`, `libraryIds`/`pendingIds`.
- **Tablet adaptation:** Two-column detail (cover + meta left, About/Topics/related right) in the right pane; CTA bar docked to that pane.

---

## Listen tab & audio playback

The Listen experience splits into two surfaces: a **tab home** (now-playing dashboard or empty/resume state) and a **foreground listening overlay** (`ListenScreen`) opened on top of any tab. A single global `useAudioSession` store drives all of them plus the floating `MiniPlayer`, so there is exactly one audio source app-wide. Palette: forest greens (hero card, accents, active states), amber (scrub fill, badge dot, Pro upsell), cream (text on dark), ink greys (muted/disabled).

### ListenHomeScreen (`src/screens/ListenHomeScreen.tsx`)
- **Reached from:** The "Listen" bottom tab (tab root; always renders the `TabBar` beneath).
- **Purpose:** Routes the Listen tab to one of three states.
- **Layout (top → bottom):** (1) **Playing/paused** (`isPlaying && nowPlaying`): renders `ListenNowPlayingScreen`. (2) **Resume** (no live session but `lastListenedBook` exists): "Last session" eyebrow, horizontal `resumeCard` (colored cover initial + title + author + thin progress + "Page {n} · {x}% complete" + forest Headphones bubble), secondary "Pick a different book". (3) **First-time empty**: forest-50 icon bubble (Headphones), "Nothing playing", copy, filled forest "Browse library".
- **Key components & visuals:** `Pressable` cards, `Icon`, `Text`, `TabBar`. Play bubble + CTA forest-800 on cream.
- **States:** playing/paused → now-playing; idle-with-history → resume; idle-no-history → empty.
- **Interactions:** Resume card → `onResumeListening(book)`; "Pick a different book"/"Browse library" → `onBrowseLibrary`/`onTabChange('library')`.
- **Data:** Props `isPlaying`, `nowPlaying`, `lastListenedBook`.
- **Tablet adaptation:** Center empty/resume card in a ~480px column; resume card could sit beside a larger library shelf preview.

### ListenNowPlayingScreen (`src/screens/ListenNowPlayingScreen.tsx`)
- **Reached from:** Rendered by `ListenHomeScreen` when a session is active.
- **Purpose:** Now-playing dashboard — hero player card + recently-listened + monthly stats.
- **Layout (top → bottom):** (1) Header "Listen" (Fraunces 28). (2) **Hero card** (forest-800; `#2C3B31` when paused): cover tile + meta (pill badge amber-dot "Now playing" / grey-dot "Paused", title 2-line, author, chapter label); **ScrubBar** (amber fill + white thumb, elapsed left / -remaining right); 5-button transport (Previous page · Rewind 15s · 60px white play/pause · Forward 15s · Next page); pills row (prominent speed `{n}×` + voice name). (3) **Recently listened** ("See all →") — bordered rows (cover + title + meta "Ch. 18 · yesterday" + 32px trailing tile: Play / Pause / animated `EqBars`); active row tints forest-50. (4) **This month** — three `StatCard`s: Listening time, Books started, Audio remaining ("Resets June 1").
- **Key components & visuals:** `ScrubBar` (PanResponder drag, thumb scales 1.25×, fill desaturates when paused), `Pill`, `RecentCover` (cached → async resolve → initials), `EqBars`, `StatCard`. Paused dims the card.
- **States:** `playing` / `paused`. Cover: cached / resolving / failed → placeholder.
- **Interactions:** `onPlayPause`, `onSkipBack`/`onSkipForward` (page), `onRewind15`/`onForward15`, `onScrubTo(percent)`, `onOpenSpeedSheet`, `onOpenVoiceSheet`, `onOpenRecent(id)`, `onSeeAllRecent` (→ history), `onOpenProfile`.
- **Data:** All props; `RecentCover` uses `resolveCoverUrl`/`peekCachedCoverUrl`.
- **Tablet adaptation:** Two-column dashboard — hero card pinned in a left rail, "Recently listened" + "This month" as a right column/stat grid.

### ListenScreen (`src/screens/ListenScreen.tsx`)
- **Reached from:** The foreground bimodal listening overlay, opened over any tab (MiniPlayer expand, or starting Listen from a book). Controller/view over the global session — never mounts its own audio, so navigating away keeps playback alive.
- **Purpose:** Read-along ("bimodal") page text with full transport, voice picker, sleep timer, speed, page nav.
- **Layout (top → bottom):** **Header** = back chevron (minimizes — never stops), centered title + animated `ListeningPill` ("Listening · Page {n}" pulsing dot / "Paused · Page {n}"), Search button (opens `BookSearchScreen`). **Body** = scrollable page text: "PAGE {n}" eyebrow, `BimodalText` (spoken word gets amber background, non-active paragraphs dim; plain text when no alignment). Text-load failure → inline `AlertCircle` "Audio available, text couldn't load". **Player footer** (top-bordered): scrub row (elapsed · draggable track forest fill + thumb · total); optional red audio-error banner; transport (speed pill `{n}×` cycles · Previous page · 60px forest play/pause · Next page · `Moon` sleep timer); action pills (voice pill `Headphones` + name; page pill `ListDetails` + "Page {n}" → page/chapter sheet).
- **Key components & visuals:** `ListeningPill` (opacity pulse), `BimodalText` (`activeWord` = amber bg + forest-900), `ScrubBar` (thumb scales 1.3×), `ChapterSheet` (mode `listen`), `VoiceSheet`/`VoiceRow` in `BottomSheet`, `SleepSheet`. Voice rows: 36px colored avatar (initial) + name + descriptor (e.g. "Gentle female · American") + inline Preview/Stop or "Pro" badge + `Lock`; selected → forest Check.
- **States:** loading (play disabled); playing vs paused (pill + icon + pulse); offline / text-load failure (inline fallback, audio from cache); audio error (red banner + disabled play); free vs pro — `VoiceSheet` splits "Free" (Aria) from "Pro voices" (Brian, George, Charlie, Sarah, Lily); free users see Pro rows greyed + badge/lock + a forest "Unlock all voices / 4 premium voices + faster audio on Standard" upsell with amber "Upgrade".
- **Interactions:** play/pause; tap-or-drag seek; speed cycles `[0.75, 1, 1.25, 1.5, 2]`; prev/next **page** (`audio.setPageIndex`); sleep timer; page/chapter sheet; voice picker with live preview (pauses book audio first, resumes on sheet close); locked voice → `presentPaywall(ENTITLEMENT_PRO)`; search jumps to a page; hardware-back → `onBack`; in-screen back → `onMinimize`. Voice persists via `audio.setVoiceId`.
- **Data:** `useAudioSession`, `usePage`/`usePageList`, `useIsPro`/`presentPaywall`, `voicePreview` singleton, ElevenLabs voice IDs in `aiAudio`.
- **Tablet adaptation:** Side-by-side — page text in a wide left reading column, transport/scrub/pills as a persistent right player rail (or docked bottom bar); voice/sleep sheets become popovers anchored to their pills.

### ListenHistoryScreen (`src/screens/ListenHistoryScreen.tsx`)
- **Reached from:** "See all →" on now-playing "Recently listened".
- **Purpose:** Full list of books by most-recently engaged; tap to start/resume.
- **Layout (top → bottom):** Header (circular back tile + centered "Recently listened"). `FlatList` rows: 44px cover (cached/initials) + title + meta ("Finished" / "Not started" / "Page {n} · {x}% done") + 32px trailing indicator. Active row tints forest-50.
- **Key components & visuals:** `Row` with cover-cache loading, hairline separators inset past the cover, `EqBars`. Trailing: active+playing → `EqBars`; active+paused → Pause; inactive → Play.
- **States:** loading → spinner; empty → Headphones + "No listening history yet"; else list. Active highlight via `activeBookId` + `isPlaying`.
- **Interactions:** Tap row → `onPlay(book)`; back + hardware-back → `onBack`.
- **Data:** `useBooks` (sorted by `lastReadAt`/`addedAt`), `useAudioSession`, `bookCovers`.
- **Tablet adaptation:** Multi-column grid or master-detail (list left, now-playing/preview right).

### PlaybackSpeedSheet (`src/screens/PlaybackSpeedSheet.tsx`)
- **Reached from:** A speed affordance on the listen player (richer Gorhom variant; note `ListenScreen`'s inline speed pill currently just cycles values).
- **Purpose:** Pick from an 8-speed grid; applies immediately.
- **Layout (top → bottom):** Header "Playback speed" + circular X. 2×4 grid (`width: 23%`) — value ("0.5×"…"3×") + uppercase label (Slow…Sprint); active cell forest-800 border + forest-50 fill. Below: Info-icon description box + centered estimate "{chapterLabel} will finish in ~M min SS sec at this speed".
- **Key components & visuals:** `BottomSheetModal` (`enableDynamicSizing`), backdrop press-to-close.
- **States:** Single selected cell; no loading/error.
- **Interactions:** Tap cell → `onChange(speed)`; backdrop/X → `onDismiss`.
- **Data:** Props (`speed`, `chapterRemainingMinAt1x`, `chapterLabel`).
- **Tablet adaptation:** Centered modal/popover anchored to the speed control; 8 cells in a single row.

### ChapterSheet (`src/components/ChapterSheet.tsx`)
- **Reached from:** The page/chapter pill in `ListenScreen` (`mode="listen"`), and the reader (`mode="reader"`).
- **Purpose:** Navigate by chapter or page; jumps the audio session (or reader).
- **Layout (top → bottom):** 75%-snap sheet. Header = title ("Chapters" / "Pages") + subtitle "{book.title} · {total} …" + X; when chapters detected, a segmented "Chapters" / "All pages". `BottomSheetFlatList` of `ChapterRow`s: left accent bar on active, square number badge (forest when active, forest-50 when finished), title (cleaned), meta row with 48px mini progress + status ("{x}% · 0:00 / 0:00" for active, "{x}%", "Finished", "Not started"), trailing "Now" chip / forest Check / ChevronRight.
- **Key components & visuals:** `FilterPill` segmented, `ChapterRow`, Gorhom modal. Real data 0-based `page_index`; legacy fallback = 9 Gatsby chapters (1-based).
- **States:** chapters-only vs all-pages filter; row finished/active/unread.
- **Interactions:** Tap row → `onSelectChapter` then dismiss; filter pills; X/backdrop. In `ListenScreen` calls `audio.setPageIndex(idx)`.
- **Data:** `book`, optional real `chapters`, `currentChapterIndex`, `totalSecs`/`scrubPos`.
- **Tablet adaptation:** Persistent left-hand chapter/page navigator pane alongside the player; filter as a tab strip.

### EqBars (`src/components/EqBars.tsx`)
- **Reached from:** Active "now playing" rows on `ListenNowPlayingScreen` + `ListenHistoryScreen`.
- **Purpose:** Animated "currently playing" indicator — three bouncing bars.
- **Layout:** Bottom-aligned row of three 3px bars in a `height` container (default 16).
- **Key components & visuals:** Three JS-driven `Animated.Value`s on phase-offset 420ms loops (interpolate ~25%–90% of height); color default forest-800.
- **States:** `playing=true` loops; `false` freezes mid-height.
- **Interactions / Data:** None.
- **Tablet adaptation:** No change; accept `height`/`color` to scale up.

### MiniPlayer (global; in `App.tsx`, component in `src/screens/ListenScreen.tsx`)
Floating now-playing bar absolutely above the `TabBar` (`pointerEvents="box-none"`, self-pads to clear the bar). Renders only when `audio.book` exists and on the **Library and Discover-home tabs only** (hidden on Listen/You tabs + drill-ins, foreground ListenScreen, any reader). Forest-800 bar: small cover tile + "{book.title} · Page {n}" with thin amber progress fill + translucent circular play/pause. Tap bar → `onExpand` (foreground ListenScreen); swipe left/right past ~35% → `audio.dismissMiniPlayer()` (hides strip, keeps session). Reads `useAudioSession`. **Tablet adaptation:** dock as a slim persistent bottom or side player rail.

---

## Reading experience & AI tools

Three render modes per book — **Text** (paginated EPUB text), **Full** (publisher HTML in WebView), **PDF** (native render) — selectable via a `ModeTogglePill` ("Full" / "Text") in the top chrome. All three share: fading top chrome (back + title + mode pill), a fading 5-item bottom `ActionBar` (Listen / AI tools / Search / Highlights / Reading options), tap-to-toggle auto-hiding chrome, and the same AI/Highlights/Search takeover screens. Text-mode themes: **Light** (cream), **Sepia** (`#F5EDD8`), **Dark** (near-black forest-tinted). Forest-800 = primary accent; amber = highlight/saved-vocab; Literata serif = reading font.

### ReaderScreen (`src/screens/ReaderScreen.tsx`)
- **Reached from:** Library → opening an EPUB (text mode default), or from `PdfReaderScreen` "Text" toggle.
- **Purpose:** Paginated tappable text reader with dictionary, sentence translate, highlights, AI tools.
- **Layout (top → bottom):** Top chrome — back chevron, left-aligned title, `ModeTogglePill`. Optional `SlowNetworkBanner`. Body — virtualized `FlatList` of `PageSection`s (continuous scroll); each shows an optional centered page-break divider ("Page N", no "of N"), optional chapter label, justified prose at 1.78 line-height. Bottom `ActionBar` (Listen [primary forest], AI tools `Wand`, Search, Highlights `Notebook`, Reading options `Settings`). "Tap to show controls" pill when chrome hidden.
- **Key components & visuals:** `PageSection`, `TappableParagraph` (tap → word, long-press → sentence). `TranslatePopover` (dark ink-900 card above the word: word, phonetic, definitions, Audio / Save word / Done). `SentenceTranslateSheet` (dark sheet: "EN → {LANG}" badges, quoted original italic, translation, Audio / Save / Done). `ChapterImage` renders `[[BOOKFLOW_IMG:path]]`. `TypographySheet` (Presets Standard/Comfortable/Max readability; Text-size slider 16–28; Font chips Serif/Sans/Lexend; Theme chips Light/Sepia/Dark; "Auto-hide controls" Switch; Reset). Highlights: active tap amber-200; saved word `rgba(255,200,80,0.55)`; saved sentence `rgba(255,200,80,0.45)`.
- **States:** Loading → `ReaderSkeleton`, then "Finding your page…" restore overlay. Error → "Could not load book". Empty/`notFound` → "No text available" (FileText) + "Retry processing" (OCR) + optional "Switch to Full mode". Offline → slow-network banner after 5s.
- **Interactions:** Tap shows chrome (auto-hides 3s if enabled); swipe scrolls; tap word → dictionary; long-press sentence → translate sheet; Save → optimistic amber highlight; AI tools/Highlights/Search open as full-screen takeovers (position preserved via `jumpToPage`).
- **Data:** `usePageList` + `useAllPagesContent`, `usePage`, `useBookHighlights`, `saveHighlight`, `persistReadingPosition`, `useReadingSession`; `lookupWord`, `translateSnippet` edge fn, `expo-speech`.
- **Tablet adaptation:** Constrain reading column to ~680–720pt centered with generous margins; freed lateral space hosts a persistent right panel for Highlights/AI tools; dictionary/sentence popovers anchor beside the tapped text.

### EpubFullReaderScreen (`src/screens/EpubFullReaderScreen.tsx`)
- **Reached from:** "Full" on the mode pill (or "Switch to Full mode" CTA from text empty state).
- **Purpose:** Render publisher EPUB HTML (images, headings, blockquotes, lists) in a scrolling WebView.
- **Layout (top → bottom):** Absolute top chrome (back, centered title, `ModeTogglePill`=full). Full-bleed `WebView` (Literata/Fraunces on `#FAF7F2`, spine dividers, resolved inline images). Absolute bottom `ActionBar` (Listen / AI tools / Search / Highlights / Reading options).
- **Key components & visuals:** WebView with injected scroll+tap bridge (`buildScrollBridge`), `ActionItem` (44pt circular), `FullModeReadingOptionsSheet` (placeholder → text mode for typography). No page chevrons/counter.
- **States:** Loading → spinner + "Loading book…" (slow banner after 5s). Empty → "No formatted content" + "Switch to text mode". Error → "Could not load book".
- **Interactions:** Tap (WebView bridge) reveals chrome (auto-hides ~3.5s); scroll restored + persisted; Highlights/Search jumps drop into **text mode** at the matched page (`onRequestTextMode(idx)`); AI tools use a scroll-fraction `livePageIndex`.
- **Data:** One Supabase `pages` query for `html_content`, batched signed-URL image resolution, stitched-HTML cache; `persistReadingPosition`/`touchLastReadAt`, `useReadingSession`.
- **Tablet adaptation:** Inject max-width/centered-column CSS so HTML reads as a book page; optionally two-column paginated WebView in landscape; AI tools in a side panel.

### PdfReaderScreen (`src/screens/PdfReaderScreen.tsx`)
- **Reached from:** Library → opening a PDF.
- **Purpose:** Native PDF rendering with a toggle into the text reader.
- **Layout (top → bottom):** Top chrome (back, left title, Full/Text pill). Full-screen horizontal paged `Pdf`. Thin progress strip above the action bar: forest fill + "Page {currentPage} of {totalPages}". Bottom `ActionBar`.
- **Key components & visuals:** `react-native-pdf` (horizontal paging, annotations off), `ActionItem`, `PdfReadingOptionsSheet` (placeholder → text mode).
- **States:** Loading → spinner + "Loading…". Error → "Could not open this PDF" (X). Text mode swaps in `ReaderScreen` at the proportionally-mapped DB page.
- **Interactions:** Single-tap toggles chrome; swipe/pinch pages; "Text" pill → embedded text reader (back → Library); Highlights/Search jumps map DB page → PDF page (`jumpToPdfPage`); page persisted on 1.5s debounce.
- **Data:** Signed URL on `books` bucket, `persistReadingPosition`, `useReadingSession` (coarse `totalPages × 250` words).
- **Tablet adaptation:** Native-size pages centered with margins, or two-up facing pages in landscape; side rail with page thumbnails/scrubber + AI tools/Highlights.

### BookSearchScreen (`src/screens/BookSearchScreen.tsx`)
- **Reached from:** "Search" in any reader's `ActionBar`.
- **Purpose:** Full-text search across the whole book; jump to the matched page.
- **Layout (top → bottom):** Header — back + pill search field (Search icon, `Search {book.title}…`, autofocus, clear X). Body — empty prompt ("Find anything in this book" + `Type a phrase or quoted "exact phrase". Use - to exclude a word.`), or "N matches" + scroll list of `ResultRow`s.
- **Key components & visuals:** `ResultRow` = surface card with Book icon + "Page N" + snippet (matched substring amber).
- **States:** Idle (<2 chars) → prompt; loading → spinner; error → "Search failed: {error}"; empty → "No matches".
- **Interactions:** Type to query (Postgres FTS, debounced); tap row → `onJumpToPage(pageIndex)`; clear resets.
- **Data:** `useBookSearch` (FTS on `pages.content_tsv`).
- **Tablet adaptation:** Side panel or centered modal alongside the visible reading column; wider multi-line snippets.

### InReaderSearchHeader (`src/screens/InReaderSearchHeader.tsx`)
- **Reached from:** Helper module for in-chapter search (exports `InReaderSearchHeader` + `HighlightedText`). Note: live readers currently route Search through `BookSearchScreen`.
- **Purpose:** In-line find bar scoped to the current chapter with prev/next match nav + inline highlighting.
- **Layout (top → bottom):** Search-field row (forest-bordered "Search this chapter…", autofocus, clear) + "Cancel". Below: results-count nav bar "{n} of {N} · {chapterLabel}" (or "No matches …") + two ChevronDown prev/next (disabled at 0).
- **Key components & visuals:** `HighlightedText` (matches amber-200, active amber-500), `countMatches`.
- **States:** Empty query hides count bar; zero results disables nav.
- **Interactions:** Type to filter; prev/next cycle; clear; Cancel exits.
- **Data:** Client-side string matching — no network.
- **Tablet adaptation:** Compact floating toolbar top-right of the reading column instead of replacing the header.

### HighlightsScreen (`src/screens/HighlightsScreen.tsx`)
- **Reached from:** "Highlights" in any reader's `ActionBar` (also Library long-press action sheet).
- **Purpose:** Per-book list of saved words/sentences, grouped by page.
- **Layout (top → bottom):** Header — back + centered "Highlights" + book-title subtitle. Filter tabs — All / Words / Sentences (each a pill with count; active forest fill). Body — page-grouped sections ("Page N" / "Other") of `HighlightRow`s.
- **Key components & visuals:** `HighlightRow` = kind dot (amber word, forest sentence) + text (words bold 1-line; sentences quoted up to 3 lines) + "Word/Sentence · {relative time}" + trash button. `EmptyState` (Notebook).
- **States:** Loading → spinner; empty → "No highlights yet" / context copy.
- **Interactions:** Tab to filter; tap row → `onJumpToPage(pageIndex)` + close; trash → optimistic delete.
- **Data:** `useBookHighlights`, `deleteHighlight`.
- **Tablet adaptation:** Persistent right-hand side panel alongside the reader; two-column card grid on large screens.

### AIToolsScreen — AIToolsSheet (`src/screens/AIToolsScreen.tsx`)
- **Reached from:** "AI tools" (`Wand`) in any reader's `ActionBar`.
- **Purpose:** Bottom-sheet launcher for the four AI tools, scoped to the current page.
- **Layout (top → bottom):** Cream sheet — "AI tools" + "Page {N} · {book.title}". Four rows (forest-tinted square icon + label + cost + chevron): "Summarize page" (~2K, Notebook), "Practice questions" (~3K, HelpCircle), "Ask about the book" (~1K/msg, MessageCircle), "Translate page" (~5K, Globe). (Credits gauge footer intentionally removed until metering ships.)
- **States:** Always available; page label reflects the live page index.
- **Interactions:** Tap row → dismiss + open the tool.
- **Data:** Delegates to Summary/Practice/Chat/Translate.
- **Tablet adaptation:** Persistent side panel or centered popover anchored to the toolbar button.

### AIToolsScreen — SummaryScreen (`src/screens/AIToolsScreen.tsx`)
- **Reached from:** "Summarize page".
- **Purpose:** AI page/whole-book summary with length + scope controls.
- **Layout (top → bottom):** Header — back, "Page summary" / "Whole-book summary" + subtitle, Share (disabled until a summary exists). Length toggle — TL;DR / Standard / Detailed. Scope chips — "Page" / "Whole book". Body — summary paragraphs + "Source" page chip + `QualityRatingCard`. Bottom — "Listen to summary" (TTS toggle) + Copy.
- **Key components & visuals:** `SummaryStreamingBody` (pulsing dots + skeleton), `QualityRatingCard` (thumbs → reason chips → "Submit & regenerate"/"Submit only"), `WholeBookCreditSheet`.
- **States:** Loading → streaming; error → "Summary generation failed" + Try again/Go back; success → text. Whole-book gated behind credit sheet. Free vs pro: credit sheet shows "High credit use (~15,000 credits)" + 64% gauge; non-Pro see "Standard plan gives you 500K credits / month" + Upgrade.
- **Interactions:** Toggle length/scope (re-runs); confirm whole-book; Listen / Copy; Share; thumbs/regenerate.
- **Data:** `useSummary` (generate-summary edge fn, cached), `presentPaywall`/`useIsPro`, `expo-speech`, `expo-clipboard`, `Share`.
- **Tablet adaptation:** Centered reading-width column or side panel next to the source page; controls + credit sheet inline.

### AIToolsScreen — ChatScreen (`src/screens/AIToolsScreen.tsx`)
- **Reached from:** "Ask about the book".
- **Purpose:** Grounded Q&A that answers only from the book and cites pages.
- **Layout (top → bottom):** Header — back + "Ask about the book" + subtitle. Scope banner ("Answers come only from {book.title}…") or offline bar. Messages scroll — user/AI `ChatBubble`s (AI shows "Sources:" chips + thumbs); `ChatThinkingBubble` while awaiting. "Suggested questions" starter chips. Bottom input bar — multiline ("Ask anything about the book…", 500 max) + forest send.
- **Key components & visuals:** `ChatBubble`, `FeedbackRow`, `StarterQuestions`, `ChatErrorCard`, `AiErrorBubble` ("~800 AI credits refunded" + Try again/Skip), `OffTopicBubble`.
- **States:** Loading history; sending (thinking); error (failed bubble + card); offline (input disabled + banner).
- **Interactions:** Type/send; tap starter/off-topic suggestion; retry; thumbs; auto-scroll.
- **Data:** `useChat` (chat edge fn), `useStarterQuestions`, `useNetworkState`.
- **Tablet adaptation:** Right-hand conversation panel beside the reading column; constrain bubble width; source chips as page-jump links.

### PracticeQuestionsScreen (`src/screens/PracticeQuestionsScreen.tsx`)
- **Reached from:** "Practice questions".
- **Purpose:** Generate + take an AI quiz on a page, with scoring + review.
- **Layout (top → bottom):** **Config** — `PQHeader` (X + "Practice questions" + book title), tappable "Page N — Current page" (opens `PagePickerBody`), segmented controls (Number 5/10/15, Type Mixed/MCQ/Short, Order Sequential/Randomised), "Estimated cost … AI credits", "Generate questions" (Sparkles). **Quiz** — "Question N of M" + subtitle + Skip, `ProgressDots`, question, `MCQBody` (lettered options color green/red + feedback card with Source chip) or `ShortAnswerBody` (input → grading + model answer), "Next"/"See results". **Results** — score hero ("X / N", percent, label), points breakdown, "Review — missed & partial", thumbs card, CTAs "Retry the N you missed" / "Redo all questions" / "Done".
- **Key components & visuals:** `SegGroup` (recommended badges), `PagePickerBody` (selected forest + "Current" badge), `ProgressDots`, `SourceChip`.
- **States:** config / loading ("Generating questions…") / quiz / results / error. Practice-specific error copy.
- **Interactions:** Pick page, configure, generate; answer; skip; navigate; retry-missed/redo-all; thumbs.
- **Data:** `generatePractice` (practice edge fn).
- **Tablet adaptation:** Two-column (question/options left, feedback/explanation or source page right); config + page picker as inline panels.

### RetryQuestionsScreen (`src/screens/RetryQuestionsScreen.tsx`)
- **Reached from:** Focused "retry the missed questions" flow (lighter than full Practice config; live Results currently re-runs misses inline via `retryMissed`).
- **Purpose:** Re-run only missed/partial questions, free of charge.
- **Layout (top → bottom):** Header — X + "Retry the ones you missed". Review card — "{n} questions to retry · {chapterLabel}" + rows badged wrong (red X) / partial (amber dash). Settings — Questions (locked "{n} (fixed)"), Type (locked "Mixed (fixed)"), Order (tappable Sequential ⇄ Shuffle). Green "No additional credits…" note. CTA "Start retry session" (Refresh).
- **Key components & visuals:** Locked setting rows (`Lock`), success-green free note, badge chips.
- **States:** Single static config state; explicitly free.
- **Interactions:** Toggle order; Start → `onStart({ order, questionIds })`; close.
- **Data:** Operates on the passed-in `questions` array.
- **Tablet adaptation:** Review list + settings side by side in a centered modal/panel; two-column question list.

### TranslateChapterScreen (`src/screens/TranslateChapterScreen.tsx`)
- **Reached from:** "Translate page".
- **Purpose:** AI translation of a single page with quick language switching + page nav.
- **Layout (top → bottom):** Header — back + "Page translation" + subtitle, Share (disabled until translated). Horizontal language-chip row (`COMMON_LANGUAGES`; active forest). Body — "Translated to {Language} [· cached]" note (Globe) + translated paragraphs (Literata). Bottom page selector — prev / "Page X of Y" / next (disabled at ends).
- **Key components & visuals:** `LanguageChip` row, reading-font paragraphs.
- **States:** Loading → spinner + "Translating to {Language}…"; error → "Translation failed" + Try again; success → text. Defaults target to the user's setting; ~5K credits shown at launcher.
- **Interactions:** Tap chip (re-runs, client-cached); prev/next; Share; retry.
- **Data:** `useTranslation` (translate edge fn, cached per page+language), `useReaderStore` (translation language).
- **Tablet adaptation:** Side-by-side bilingual — original left, translation right — sharing the language chips + page nav.

### TranslateWordPopover (`src/screens/TranslateWordPopover.tsx`)
- **Reached from:** Presentational tap-to-translate word popover (the live reader uses the dictionary-driven `TranslatePopover` inside `ReaderScreen`; this is the dedicated translate-word variant with a downward caret).
- **Purpose:** Floating card above a tapped word — definition + translation, with audio + save.
- **Layout (top → bottom):** Dark ink-900 card with down caret. Header — "EN → TWI" + close X. Word (large) + italic phonetic. Definition. Translation row (uppercase target label + amber translation). Actions — Play (Music) + Save word (forest).
- **Key components & visuals:** Dark surface, amber accent, positioned caret (`caretOffset`).
- **States:** Props-driven (no internal loading/error).
- **Interactions:** Play, Save word, Dismiss.
- **Data:** Receives word/phonetic/definition/translation as props.
- **Tablet adaptation:** Anchor beside/above the tapped word with the caret pointing at it; allow a slightly wider card.

---

## You tab, Settings, Account & Paywall

### YouScreen (`src/screens/YouScreen.tsx`)
- **Reached from:** The "You" tab. Root of the You stack; other screens are in-component `view` swaps.
- **Purpose:** Profile + plan + settings gateway.
- **Layout (top → bottom):** `PageHeader` ("You", `display-md`) → tappable `ProfileHeader` card (52px forest avatar image-or-initials, name `heading-sm`, email muted, trailing chevron) → `PlanCard` (free meters card OR Pro two-section hero) → three `SettingsSection` groups (eyebrow + bordered list):
  - **Reading:** "Reading display" (TextSize, hint e.g. "Literata · 20px"), "Default voice" (Microphone, voice label), "Translation language" (Globe, language label) — all drill in.
  - **Account:** "Account & subscription" (User), "Settings" (Settings), "Notifications" (Bell), "Sign out" (Logout, destructive).
  - **Support:** "Help & FAQ" (HelpCircle), "Send feedback" (MessageCircle).
  - Footer: centered version string.
- **Key components & visuals:** `ListRow`, `SettingsSection` + `Divider`. Free `PlanCard` = forest-800 card: "YOUR PLAN" eyebrow + plan badge, three `Meter`s (fill amber at ≥80%; "Unlimited" rows show ∞ chip), amber "Upgrade to Standard" (Sparkles).
- **States:** Free → meters + Upgrade. Pro (`plan.name !== 'Free'`) → `ProPlanCard`. Avatar → initials on no-URL/error. Sign-out `signingOut` state.
- **Interactions:** Profile / "Account & subscription" → `account` view; rows drill in; "Sign out" → sheet; Upgrade → `handleUpgrade` (parent `onUpgrade` or fallback `presentPaywall`); "Manage plan" (Pro) → `openManageSubscription`. `onSubViewOpenChange` hides the mini-player.
- **Data:** `useReaderStore` (hint labels), `VOICE_OPTIONS`, `TRANSLATION_LANGUAGE_LABELS`; RevenueCat `presentPaywall`/`openManageSubscription`/`useProSubscriptionDetails`/`ENTITLEMENT_PRO`; props `profile`/`plan`/`onSignOut`.
- **Tablet adaptation:** Two-column master-detail — persistent left rail (profile + section list), right pane renders the selected drill-in; cap profile/plan card width.

#### ProPlanCard (two-section hero, inside YouScreen)
- **Purpose:** Show the active subscription + this month's usage.
- **Layout:** One rounded clipped card, two stacked sections:
  - **Top — dark forest hero** (forest-800): "Your plan" uppercase eyebrow (green `#4A7C59`) left, "Active" pill right (amber dot + amber label on translucent amber). Large cream plan name (`proNameHero` 28px serif), then forest-200 renews line ("Renews {date} · {price}" with "Active · {price}" / "Active subscription" fallbacks).
  - **Bottom — cream usage** (`#F5F1E8`): "THIS MONTH" label, then `ProUsageRow`s for Audio, Books, AI credits. Each: ink icon + name left, value right ("12 / 60 min") OR a light "∞ Unlimited" chip when Infinity. AI credits adds a thin forest track + "Resets {Mon D}". Hairline divider, then "Manage plan" row (Settings + chevron).
- **Interactions:** "Manage plan" → `onManage` (`openManageSubscription`).
- **Data:** `useProSubscriptionDetails()` → `renewalLabel`, `priceLabel`; meter values from `plan.meters`.
- **Tablet adaptation:** Two stacked sections → side-by-side panels (hero left, usage grid right) in a constrained card.

### AccountScreen (`src/screens/AccountScreen.tsx`)
- **Reached from:** YouScreen → profile card or "Account & subscription".
- **Purpose:** Account & subscription home — profile, plan, restore, legal/data, sign out, delete.
- **Layout (top → bottom):** `SubHeader` (back + "Account & subscription") → `ProfileSection` (avatar + name + email + "Edit") → plan card (`ProPlanCard` if Pro, else `FreePlanCard`) → `SectionGroup`s:
  - **Account:** (free only) "Verify student status" (CreditCard, "$4.99/mo"); always "Restore purchases" (Refresh, → "Restoring…").
  - **Privacy & data:** "Privacy policy" (Shield), "Terms of service" (FileText), "Export my data" (Download, → "Preparing export…").
  - Final group: "Sign out" (Logout, destructive) + "Delete account" (Trash, muted).
- **Key components & visuals:** `AccountListRow`. `FreePlanCard`: white header "Your plan / Free / Resets June 1" + forest "Upgrade" over a meters block (`MeterRow` ×3, amber ≥80%). `ProPlanCard` (this file's variant): forest header ("Your plan / {name · period} / Active · {price}") + check chip, optional renewal row, `PRO_FEATURES` checklist ("Unlimited audio streaming & offline downloads", "Unlimited library", "500K AI credits / month", "3 premium AI voices"), split footer "Manage" + "Cancel" (both → `openManageSubscription`).
- **States:** free vs pro card; restoring/exporting/deleting/signingOut labels; sign-out + delete confirmation sheets; avatar → initials on fail.
- **Interactions:** Edit → `EditProfileScreen`; Verify student → prefilled `mailto:` (fallback Alert); Restore → `restorePurchases()` + result Alerts; Privacy/Terms → `Linking.openURL`; Export → `gatherUserData()` JSON via `Share`; Sign out → sheet → `onSignOut`; Delete → sheet → `delete-account` function + sign out.
- **Data:** RevenueCat `useProSubscriptionDetails`/`restorePurchases`/`openManageSubscription`; `supabase` (auth, `delete-account`, export tables); legal URLs; props `profile`/`plan`.
- **Tablet adaptation:** Two-column body (profile + plan left, grouped rows right or as a detail pane); confirmation sheets stay centered modals.

#### EditProfileScreen (inside `AccountScreen.tsx`)
- **Reached from:** AccountScreen → "Edit".
- **Purpose:** Edit display name + photo.
- **Layout (top → bottom):** Sub-header (back + "Edit profile") → centered 96px avatar picker (image/initials + camera badge / spinner) + state hint + "Remove photo" → "Display name" Input → read-only Email field + hint → error text → forest "Save" ("Uploading photo…"/"Saving…"/"Save").
- **Key components & visuals:** Tap-the-circle avatar pattern; forest-100 circle + forest-800 camera badge.
- **States:** picked-unsaved vs saved; uploading/saving/removing; Save disabled unless name non-empty and (name changed OR new photo).
- **Interactions:** Pick avatar (`expo-image-picker` 1:1); Remove (Alert → delete from `avatars` + null DB); Save → upload via `expo-file-system` then `profiles` upsert → `refreshCurrentUser()`.
- **Data:** `supabase` storage `avatars` + `profiles`; `refreshCurrentUser`.
- **Tablet adaptation:** Center the form in a ~480px column.

### SettingsScreen (`src/screens/SettingsScreen.tsx`)
- **Reached from:** YouScreen → Account → "Settings".
- **Purpose:** App preferences — reading/audio, language, notifications, storage.
- **Layout (top → bottom):** `SubHeader` (back + "Settings") → `SectionBlock`s:
  - **Reading & audio:** "Reading display" (TextSize), "Default voice" (Microphone), "Default playback speed" (Clock, e.g. "1.5×"), "Resume after calls" (Phone, "Auto-resume audio after phone calls", Toggle).
  - **Language & translation:** "App language" (Globe, "Only English is supported for now", "English", non-tappable), "Translation target" (Globe, drills in).
  - **Notifications:** when OS permission denied → `NotifDeniedBanner` + dimmed rows (`pointerEvents` none) + italic helper. Rows: "Daily reading reminder" (Bell, "{time} every day", tappable time chip + Toggle), "Usage warnings" (AlertTriangle), "Product updates" (Sparkles).
  - **Storage:** `StorageRow` ("Downloaded audio" / "No audio downloaded yet"), "Clear cache" (Trash, → "Clearing…").
- **Key components & visuals:** `SettingsRow`; custom `Toggle` (44×26 capsule, cream knob, forest-800 on / ink-200 off, `dimmed` variant); warn-palette banner.
- **States:** OS notifications granted vs denied; toggles; clearingCache; per-field store values.
- **Interactions:** Rows drill into ReadingDisplay/DefaultVoice/PlaybackSpeed/TranslationLanguage; notif toggles → `requestOsPermission()` / `NotifPermissionSheet`; time chip → `ReminderTimePicker`; Clear cache → Alert → selective `AsyncStorage.multiRemove`.
- **Data:** `useReaderStore`, `useNotificationPermission`, notif helpers, `AsyncStorage`, `VOICE_OPTIONS`/`TRANSLATION_LANGUAGE_LABELS`.
- **Tablet adaptation:** Settings master-detail — section list left, active drill-in in a right pane; section blocks in a centered max-width column.

### YouDrillScreens (`src/screens/YouDrillScreens.tsx`)
Shared shell `DrillHeader` (back + centered title) + scroll body; shared `Section`, `RadioRow` (radio dot or `Lock` when locked), `ToggleRow`/`CustomToggle`.
- **Reached from:** Pushed from YouScreen and/or SettingsScreen rows.
- **Purpose / Layout per screen:**
  - **ReadingDisplayScreen:** "Font" radios (Literata serif / System sans / Lexend) → "Size" stepper (A− / "{n}px" / A+, 14–28) → "Theme" swatch rows (Light/Sepia/Dark + "Aa" + check) → bordered "Reset to defaults".
  - **PlaybackSpeedScreen:** helper → "Speed" radios for each `PLAYBACK_SPEEDS` ("{n}×" + hint).
  - **DefaultVoiceScreen:** helper → "Free" voices → "Pro voices" (locked rows when not Pro) → free-user upsell card ("Unlock all voices" + forest "Upgrade" → `presentPaywall`).
  - **TranslationLanguageScreen:** helper → "Languages" (English pinned first, then alphabetical radios).
  - **NotificationsScreen:** "Reminders" (Daily reading reminder toggle, "Reminder time" row → `ReminderTimePicker`, Streak warning toggle) → "Library" (Book ready) → "Account" (Usage warnings, Product updates) → permission-dependent footnote.
  - **HelpScreen** (legacy stub; superseded by `HelpFAQScreen`): expandable FAQ rows.
  - **SendFeedbackScreen** (this file's variant): tappable `emailCard` showing `SUPPORT_EMAIL` with "Tap to copy" → "Copied".
- **States:** selected radio per pref; Pro vs free (locked voices, upsell via `useIsPro`); notif toggles gated by OS permission; feedback "copied".
- **Interactions:** Radios write to store; size stepper clamps; Reset → serif/20px/light; upsell/locked → `presentPaywall`; notif toggles request OS permission; reminder-time row → picker; feedback card copies email.
- **Data:** `useReaderStore`, `VOICE_OPTIONS`, `presentPaywall`/`ENTITLEMENT_PRO`/`useIsPro`, `useNotificationPermission` + notif helpers, `SUPPORT_EMAIL`.
- **Tablet adaptation:** Leaf detail panes — render in the right-hand column of the settings master-detail; option lists/swatches in a centered max-width block.

### HelpFAQScreen (`src/screens/HelpFAQScreen.tsx`)
- **Reached from:** YouScreen → Support → "Help & FAQ".
- **Purpose:** Searchable help center with grouped expandable FAQs + support-email card.
- **Layout (top → bottom):** Header (back + "Help & FAQ") → search field ("Search help articles…", clear X) → grouped sections (Getting started, Reading, Listening, AI features, Account & billing, Privacy & support) of expandable rows (question + rotating ChevronDown) → empty state when filtered out → bottom forest-50 contact card ("Still need help?" + email button → "Copied — paste into your mail app").
- **Key components & visuals:** Inline-expanding FAQ rows (chevron rotate 180°), search input, contact card (MessageCircle + forest CTA).
- **States:** query filtering, per-row expanded set, transient `emailCopied`.
- **Interactions:** Type to filter q+a; tap to expand/collapse; clear; contact copies `supportEmail`.
- **Data:** Static `SECTIONS`; `expo-clipboard`.
- **Tablet adaptation:** Two-pane help — section/question list left, selected answer in a reading pane right; search pinned above the list, contact card in a sidebar.

### SendFeedbackScreen (`src/screens/SendFeedbackScreen.tsx`)
- **Reached from:** Help/feedback flows wanting a structured form (distinct from the email-handoff variant in YouDrillScreens). Host owns the submit.
- **Purpose:** Categorized feedback form (category + body + optional screenshot).
- **Layout (top → bottom):** Header (back + "Send feedback") → "What's this about?" → 2-up category chip grid (Bug report / Feature request / AI quality / Other) → "Tell us what happened" multiline (forest border) + "{count} / 500" counter → "Attach a screenshot" row (Eye→CheckCircle, "optional") → forest "Send to Bookflow" (Mail; "Sending…"; disabled until 10–500 chars).
- **Key components & visuals:** Selectable category chips, bordered textarea, attachment row, disabled-state send.
- **States:** selected category; char count vs MIN 10 / MAX 500; attachment present; submitting; `canSubmit`.
- **Interactions:** Pick category; type body; `onPickAttachment`; Send → `onSubmit({category, body, attachmentUri})`.
- **Data:** All I/O via host props.
- **Tablet adaptation:** Centered max-width column; category grid → 4-across on wide screens.

### StudentVerificationScreen (`src/screens/StudentVerificationScreen.tsx`)
- **Reached from:** Student-discount entry points (paywall link, Account "Verify student status"); host owns state.
- **Purpose:** Three-state student-discount verification.
- **Layout (top → bottom):** Header (back + "Student verification") → 3-dot step indicator → state-tinted hero icon (Shield/Mail/CheckCircle) → state content:
  - **entry:** "Get Premium for less" + forest price chip + "School email" field (Mail, "you@school.edu") + amber "Send verification email".
  - **pending:** "Check your inbox" + email + warn notice ("link expires in 30 minutes…") + "Resend email" + "Use a different email".
  - **verified:** "You're verified" + success card ("Premium · Student rate" + price) + amber "Start using Premium" (Sparkles).
- **Key components & visuals:** Step dots, tinted hero, price chip, notice cards, amber CTAs.
- **States:** `entry` / `pending` / `verified`; email validity gating.
- **Interactions:** Edit email; Send; Resend; "Use a different email" → `onBack`; Start Premium.
- **Data:** `state`, `email`, `monthlyPrice` + callbacks (host props).
- **Tablet adaptation:** Center in a ~360–420px card/column.

### RestorePurchasesScreen (`src/screens/RestorePurchasesScreen.tsx`)
- **Reached from:** A "Restore purchases" entry where the host runs the restore (distinct from AccountScreen's inline Alert flow).
- **Purpose:** Three-state restore flow.
- **Layout (top → bottom):** Header (back + "Restore purchases") → per state:
  - **restoring:** spinner + "Checking with the App Store…".
  - **restored:** CheckCircle + "Purchase restored" + optional plan card + forest "Go to library".
  - **nothing:** Refresh circle + "No purchase found" + guidance card + secondary "Contact support".
- **Key components & visuals:** `ActivityIndicator`, tinted icon circles, success plan card, neutral card.
- **States:** `restoring` / `restored` / `nothing`.
- **Interactions:** Go to library; Contact support; back.
- **Data:** `state` + `plan` host props.
- **Tablet adaptation:** Center single-column status content; cap width to a dialog-like block.

### PaywallScreen / PaywallPlanScreen (`src/screens/PaywallScreen.tsx`)
- **Reached from:** Full-screen plan-selection paywall (exports `PaywallPlanScreen` + `SoftWarningBanner`). Static pricing UI; CTA not yet wired to purchase (RevenueCat hosted paywall is the live path).
- **Purpose:** Choose-a-plan screen + reusable usage-warning banner.
- **Layout (top → bottom):** Header (X / "Choose a plan" / "Restore") → "Unlock the full Bookflow" + subhead → bordered plan card group (Yearly $79/yr "Best value" "−34%", Monthly $9.99/mo, Student $4.99/mo; radio + price) → "Everything in Standard" feature list (Check; "500K AI credits / month" + "10× more" badge) → bottom CTA bar (forest button tracking the selection + auto-renew terms).
- **Key components & visuals:** Radio plan cards, badges, feature-check rows, sticky CTA. `SoftWarningBanner`: warn-amber inline ("{n} minutes of audio left this month" + "Tap to see upgrade options…" + dismiss X).
- **States:** selected plan drives card highlight + CTA label + terms copy.
- **Interactions:** Select plan; close; (Restore + CTA inert in this file); banner → `onUpgrade`/`onDismiss`.
- **Data:** Static `PLANS`/`FEATURES`.
- **Tablet adaptation:** Center in a max-width column or large modal; plan cards → side-by-side 3-column comparison with features beneath, CTA pinned.

### PaywallSheet (`src/screens/PaywallSheet.tsx`)
- **Reached from:** Contextual upgrade prompt as a `BottomSheetModal` from limit/gate triggers.
- **Purpose:** Generic upgrade sheet, three contextual variants.
- **Layout (top → bottom):** Tinted icon circle (Book/AlertTriangle/Sparkles) → tinted uppercase eyebrow → display-serif title → subtitle → either a meter card ("used / total {unit}" + bar, for `book-limit`/`ai-tokens`) or a "What you get" feature card (for `feature-gate`) → amber primary ("Upgrade to Premium", Sparkles) → optional "Student? Verify for $4.99/mo →" → "Maybe later".
- **Key components & visuals:** Per-variant `TINTS` (book-limit amber, ai-tokens red, feature-gate forest); meter bar, feature rows, amber CTA.
- **States:** `variant` selects icon/tint/card; meter clamps to 100%.
- **Interactions:** `onUpgrade`, optional `onStudentVerify`, `onLater`/`onDismiss`.
- **Data:** Fully prop-driven.
- **Tablet adaptation:** Centered modal card; constrain content width.

### AppRatingSheet (`src/screens/AppRatingSheet.tsx`)
- **Reached from:** App-rating prompt as a `BottomSheetModal`.
- **Purpose:** Two-step rating that branches positive/negative.
- **Layout (top → bottom):** Amber Star circle → "Enjoying Bookflow?" → body → 5 tappable stars → inline follow-up once rated (positive: review ask; negative: "Tell us what's not working.") → forest CTA ("Choose a rating" → "Rate on App Store" (≥4) / "Send feedback" (1–3)) → "Not now".
- **States:** `rating` 0–5; positive (≥4) vs negative (1–3); CTA disabled at 0.
- **Interactions:** Tap stars; CTA → `onSubmit(rating)`; "Not now"/dismiss.
- **Data:** Prop-driven.
- **Tablet adaptation:** Center as a compact modal.

### NotificationPermissionSheet (`src/screens/NotificationPermissionSheet.tsx`)
- **Reached from:** Notification opt-in moments as a `BottomSheetModal` with `trigger` of `session` / `chapter` / `toggle`.
- **Purpose:** Context-aware pre-permission explainer before the OS prompt.
- **Layout (top → bottom):** Context badge (e.g. "12 minutes just now") → tinted icon circle → title + subtitle (trigger-specific) → notification preview card (forest app icon, "BOOKFLOW", sample body, "Every day at 8:00 PM") → disclosure ("Bookflow will ask iOS for permission next.") → forest primary ("Yes, remind me" / "Grant permission") → secondary ("Not now" / "Cancel").
- **Key components & visuals:** `TriggerConfig`-driven copy/icons/tints, realistic preview card.
- **States:** Three `trigger` variants.
- **Interactions:** `onGrant` (host then calls OS request); `onDismiss`.
- **Data:** Prop-driven.
- **Tablet adaptation:** Center/modal; preview card reads well constrained.

### SignOutConfirmSheet (`src/screens/SignOutConfirmSheet.tsx`)
- **Reached from:** Standalone gorhom sign-out confirmation (richer sibling of inline `SignOutSheetBody`).
- **Purpose:** Confirm sign-out while reassuring about preserved data.
- **Layout (top → bottom):** Error-tinted Logout circle → "Sign out of Bookflow?" → sub → "What's preserved" card (green check rows: cloud-synced books/progress/highlights, saved AI history, downloaded audio stays on device) → full-width error "Sign out" (spinner while loading) → "Cancel".
- **Key components & visuals:** Stacked CTAs, error palette destructive, success-tinted checklist; pan/backdrop disabled while loading.
- **States:** `loading`.
- **Interactions:** `onConfirm`, `onCancel`/`onDismiss`.
- **Data:** Prop-driven (auth call in host).
- **Tablet adaptation:** Center as a modal dialog at constrained width.

> **Cross-cutting facts for the designer:** forest-green primary, amber accent/upgrade, cream surfaces; a custom 44×26 capsule toggle (cream knob, forest-on / ink-off) is reused everywhere instead of the native Switch; meters auto-promote fill to amber at ≥80% usage; confirmation sheets always stack CTAs vertically and destructive actions always route through a confirmation sheet. Two `SendFeedbackScreen` implementations exist (copy-the-email handoff in `YouDrillScreens.tsx` vs the categorized form in `SendFeedbackScreen.tsx`); two sign-out confirmations exist (inline `SignOutSheetBody` vs standalone `SignOutConfirmSheet`).

---

## Shared Components

### Text (`Text.tsx`)
Typography primitive. Props: `variant` (any `textStyles` key, default `body-md`), `color` (any `textColors` key, default `primary`), `align`, + RN `TextProps`. Use instead of raw `RNText` everywhere.

### Button (`Button.tsx`)
"Three sizes × four variants × five states." Props: `label`, `variant` (primary/secondary/tertiary/destructive), `size` (compact 32h / standard 44h / large 52h), `loading`, `disabled`, `fullWidth`, `leadingIcon`, `trailingIcon`. primary=forest-800/cream-50 (pressed forest-900); secondary=transparent + ink-300 border / ink-900 (pressed cream-200); tertiary=transparent / forest-800 (pressed forest-100); destructive=error/cream-50 (pressed errorPressed). Press scales to 0.98 over 120ms; labels never truncate; loading → ActivityIndicator.

### Input (`Input.tsx`)
Text field. Props: `size`, `state` (default/error/success, auto from `errorText`/`successText`), `label`, `leadingIcon`, `trailingIcon`, `helperText`/`errorText`/`successText`, `containerStyle`, + RN `TextInputProps`. Fill cream-100 (error→errorBg, disabled→ink-100); 1px border transparent until focused (forest-800) or state-colored; ink-400 placeholder; optional label + helper. `focusRingWidth: 3`. forwardRef to `TextInput`.

### ListRow (`ListRow.tsx`)
Tappable settings/list row. Props: `label`, `sublabel`, `size` (standard 56 / compact 48), `destructive`, `leadingIcon` (cream-100 rounded tile) or `leadingElement`, `hint`, `drillsInto` (ChevronRight), `toggle` ({value,onChange} → pill Toggle), `selected` (forest-800 Check), `trailingElement`, + Pressable props. Pressed = cream-100; disabled = 0.5 opacity; destructive = error label. `accessibilityRole` flips to `switch` with a toggle.

### Icon (`Icon.tsx`)
Wrapper over `@tabler/icons-react-native` enforcing 1.5px stroke, default size 18, default color ink-700. Props: `name` (registry key), `size`, `color`, `strokeWidth`. Unknown names warn in `__DEV__` + render null. `APPROVED_ICONS` exports the list. Size scale: xs14, sm18 (default), md20, lg24. Available names include: Apple, CompassFilled, HeadphonesFilled, UserFilled, ArrowLeft, ArrowRight, ArrowsSort, Filter, ChevronRight/Left/Down, Compass, X, Plus, Search, Check, Camera, Copy, ThumbUp/Down(+Filled), Book, BookOpen, Books, Brain, CloudUpload, Headphones, Microphone, Notebook, Moon, Play, Pause, PlayerSkipBack/Forward, PlayerTrackPrev/Next, TextSize, Upload, Clock, ListDetails, Music, Wand, MessageCircle, Mail, Bell, Settings, User, Lock, Logout, Eye, Globe, AlertCircle, CheckCircle, AlertTriangle, HelpCircle, Info, Loader, Sparkles, Star, CreditCard, Download, FileText, Phone, Refresh, Shield, Trash, WifiOff.

### BottomSheet (`BottomSheet.tsx`)
Wrapper over `@gorhom/bottom-sheet`'s modal with the Bookflow look. Imperative ref `{ present(), dismiss() }`. Props: `title` (Fraunces display-sm), `children`, `footer`, `onDismiss`, `enablePanDownToClose` (default true). cream-50 surface, top radius 16, ink-300 32×4 handle, 0.4 backdrop, `enableDynamicSizing`.

### Lockup (`Lockup.tsx`)
Brand logomark + "Bookflow" wordmark as SVG (outlined paths, font-independent). Props: `size` (small 98×26 / medium 127×34 default / large 196×52), `color` (logomark, default forest-800), `wordmarkColor` (default ink-900). Use anywhere the brand appears inline.

### ModeTogglePill (`ModeTogglePill.tsx`)
Two-state segmented control for the reader's Full/Text switch. Props: `mode` (full/text), `onChange`, `variant` (light default / dark for PDF headers), `fullLabel`/`textLabel`. Active half = raised capsule + shadow; radius 13 outer / 11 inner, 11px Geist-Medium 600 labels.

### Skeleton (`Skeleton.tsx`)
Animated loading placeholder. Props: `width` (number or %), `height`, `borderRadius` (default 4), `style`. Pulses backgroundColor `#EAE6DC` ↔ `#F0EDE5` on an 800ms reanimated loop.

### SlowNetworkBanner (`SlowNetworkBanner.tsx`)
Transient status line after an op exceeds ~5s. Props: `onRetry` (optional → retry pill), `label` (optional). warn-amber palette, leading WifiOff, two-line text, solid retry button.

### RootErrorBoundary (`RootErrorBoundary.tsx`)
Class error boundary wrapping the whole app (registered in `index.ts`, outside the React tree). Uses raw RN primitives + hardcoded hex (no tokens/Text/Icon) so a broken design system can't break the fallback. Centered card (cream root, white card radius 16) with title, body, monospaced error-detail box, forest-800 "Try again".

### ReminderTimePicker (`ReminderTimePicker.tsx`)
Bottom-sheet body for the daily reminder time, shared by Settings + You→Notifications. Props: `hour` (0–23), `minute` (0–59), `onConfirm(hour24, minute)`. Deliberately scroll-free: AM/PM segmented + wrapping hour/minute steppers (−/+ chevron tiles + big Fraunces value) + quick-pick minute chips (:00 :15 :30 :45) + forest-800 "Set time". Local draft; commits on confirm.

### TooltipBubble (`TooltipBubble.tsx`)
First-run feature-hint bubble. Props: `eyebrow` (default "New"), `title`, `body`, `caret` (down/up/right/none), `caretOffset`/`caretVerticalOffset`, `primaryLabel` (default "Got it"), `onPrimary`, `onDismiss`. Dark ink-900 bubble (radius 14, max-width 280) with 6px amber dot + uppercase amber eyebrow, in-bubble X, Fraunces title, ink-300 body, amber "Got it" + plain "Dismiss".

### SkeletonScreens (`screens/SkeletonScreens.tsx`)
Full-screen loading compositions. `LibrarySkeleton` (header logo + 3 round buttons, "Continue reading" card, all-books rows of varied widths) and `ReaderSkeleton({onBack})` (real back button + skeleton title, chapter label, varied paragraph lines, progress bar, action bar mirroring the real reader's 5 items — live forest Listen + 4 circular placeholders). These document the exact loaded-state layouts the tablet version must match.

---

## Tablet Adaptation Strategy

This section synthesizes the per-screen notes into an overall plan. The mobile app is single-column and overlay-driven; the tablet version should exploit width with **persistent navigation, split views, and constrained reading measures** rather than simply stretching mobile layouts.

### 1. Replace bottom tabs with a persistent left navigation rail
The 4 tabs (Library / Discover / Listen / You) should become a **fixed left sidebar** (icon + label, same active forest-800 treatment). This frees the bottom edge for a persistent player and matches tablet conventions. The rail persists across all main surfaces; the right area becomes the content pane.

### 2. Master-detail (split view) for list-driven surfaces
Adopt a two-pane master-detail wherever the mobile app uses a list → full-screen drill-in:
- **Library:** left = stats + book list/grid; right = selected book's reader or detail. "All books" becomes a multi-column cover grid.
- **Discover:** left = category list (replacing the horizontal chip rail) + search; right = rails / category grid / book detail.
- **Listen history:** left = list; right = now-playing/preview.
- **Settings & You:** left = profile + section list; right = the active drill-in (Reading display, Default voice, Account, Notifications, etc.) instead of full-screen `view` swaps.
- **Highlights:** render as a persistent right-hand panel alongside the reader.

### 3. Reader: constrained measure + side panels
Reading comfort beats edge-to-edge text:
- **Text mode:** cap the column to a comfortable measure (~680–720pt) centered with generous margins. Use the freed lateral space for a **persistent side panel** (Highlights, AI tools, or Search) instead of full-screen takeovers. Dictionary/sentence/translate popovers anchor **beside the tapped text**, not at the bottom.
- **Full (EPUB) mode:** inject max-width/centered-column CSS into the WebView; support **two-column paginated** layout in landscape.
- **PDF:** native-size pages centered, or **two-up facing pages** in landscape; a side rail for page thumbnails/scrubber + AI tools.
- **AI tools (Summary / Chat / Practice / Translate):** dock as **side panels** next to the source page. Summary in a reading-width column; Chat as a right conversation panel; Practice two-column (question left, feedback/source right); Translate as **side-by-side bilingual** (original left, translation right).

### 4. Persistent audio player
The floating MiniPlayer should become a **persistent player rail** (slim bottom bar or right-hand dock) given the room. The foreground `ListenScreen` should run **side-by-side**: wide left reading column (bimodal page text) + a persistent right player rail (scrub, transport, voice/speed/sleep). The Listen tab now-playing dashboard becomes a two-column layout (hero card pinned left, recents + month stats right). Voice/speed/chapter sheets become **popovers anchored to their controls**.

### 5. Bottom sheets → centered modals / popovers
On tablet, edge-to-edge bottom sheets read poorly. Convert:
- **Confirmation sheets** (remove book, sign out, delete account) → centered modal dialogs with stacked CTAs preserved.
- **Pickers** (sort/filter, speed, voice, chapters, reminder time, AI tools launcher) → popovers anchored to the triggering control, or compact centered modals.
- **PaywallSheet / rating / notification-permission** → centered modal cards at constrained width.

### 6. Centered, constrained flows for auth/onboarding/paywall
Splash stays full-bleed centered. Welcome, Sign in/up, AuthCallback, onboarding steps, Student verification, Restore purchases, and the full Paywall should render as **centered fixed-width cards/columns** (≈360–520px) on the tablet canvas — never full-width inputs. Onboarding grids widen (4–6 columns); the full paywall can become a **3-column plan comparison**.

### 7. Grids over single-column lists
Anywhere the mobile app shows a vertical list of books (Library "All books", Discover search/category results, curated grids, listen history), use **multi-column grids** sized to the tablet width. Keep card anatomy (cover + title + author + add/progress affordance) intact.

### 8. Preserve the design language exactly
Tokens, type scale, the custom capsule toggle, amber-at-≥80% meters, forest/amber/cream palette, and the "destructive actions always confirm" rule all carry over unchanged. Skeleton loading layouts (`LibrarySkeleton`, `ReaderSkeleton`) define the exact loaded-state structure each tablet surface must converge to. Scale spacing/radii up modestly but keep the same scale ratios.

### Per-surface quick reference

| Mobile surface | Tablet pattern |
|---|---|
| Bottom tab bar | Left navigation rail |
| Library list | Master-detail: list/grid left, reader/detail right; multi-column grid |
| Discover home/category/detail | Sidebar categories + multi-column rails/grid; detail in right pane |
| Reader (Text) | Constrained column + persistent Highlights/AI side panel; inline-anchored popovers |
| Reader (Full/PDF) | Centered column / two-up pages; side rail for tools |
| AI tools | Side panels (Summary/Chat/Practice); bilingual split for Translate |
| Listen (foreground) | Reading column + persistent player rail |
| Listen tab dashboard | Two-column (hero left, recents + stats right) |
| MiniPlayer | Persistent player rail (bottom/side) |
| Settings / You | Settings master-detail (section list + detail pane) |
| Bottom sheets | Centered modals / anchored popovers |
| Auth / onboarding / paywall | Centered constrained cards; paywall 3-column comparison |
| Confirmation sheets | Centered modal dialogs |

---

*Generated from the current `v11-batch` source (post v20 build). This spec reflects the live mobile implementation, including the redesigned Pro plan card, the updated voice roster, and the free-tier gating across Library/Discover. Two known feature gaps are documented for context but not yet built: **offline audio downloads** (advertised on the paywall) and **real AI-credit metering** (currently mock; the AI-tools credit gauge is intentionally hidden until it ships).*
