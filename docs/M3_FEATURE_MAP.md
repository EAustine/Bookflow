# M3 feature map

Which of the 35 screens, 36 lib modules, 7 hooks and 2 stores goes into which
`features/<domain>/`, per §4 of `docs/ARCHITECTURE.md`.

Written before any file moves so the moves are mechanical. The decomposition
is the one refactor in this milestone that `tsc` verifies completely — a broken
import is a build error, not a runtime surprise — which is why it is worth
doing carefully even though nothing post-auth can be run.

---

## The eight domains

§4 names seven (`library reader listen ai discover account billing`). An
eighth, `auth`, is added: the pre-auth screens belong together and are the one
flow that *can* be tested here, so keeping them findable has practical value.

| Feature | Screens |
|---|---|
| **auth** | `WelcomeScreen` `SignInScreen` `SignUpScreen` `AuthCallbackScreen` `SplashScreen` `OnboardingIntentScreen` `OnboardingFirstBookScreen` |
| **library** | `LibraryScreen` `UploadFlowScreen` `BookSearchScreen` |
| **reader** | `ReaderScreen` `PdfReaderScreen` `EpubFullReaderScreen` `InReaderSearchHeader` `HighlightsScreen` `TranslateChapterScreen` `TranslateWordPopover` |
| **listen** | `ListenScreen` `ListenHomeScreen` `ListenNowPlayingScreen` `ListenHistoryScreen` `PlaybackSpeedSheet` |
| **ai** | `AIToolsScreen` `PracticeQuestionsScreen` |
| **discover** | `DiscoverScreen` |
| **account** | `YouScreen` `AccountScreen` `SettingsScreen` `YouDrillScreens` `HelpFAQScreen` `SendFeedbackScreen` |
| **billing** | `BuyCreditsSheet` `TopupBalanceBlock` |

**Not features.** `SkeletonScreens` and `TooltipBubble` are shared UI with no
domain — they go to `src/ui/`. `SendFeedbackScreen` (the standalone, dead one)
is deleted rather than moved; see F-46.

## Lib modules

| Feature | Modules |
|---|---|
| **auth** | `auth.ts` |
| **library** | `uploadBook.ts` `bookCovers.ts` `bookSearch.ts` `reprocessBook.ts` `estimateDownload` |
| **reader** | `useBookChapters.ts` `highlights.ts` `readingSessions.ts` `readingStats.ts` `dictionary.ts` `translateSnippet.ts` `aiTranslate.ts` |
| **listen** | `audioSession.tsx` `aiAudio.ts` `audioDownloads.ts` `voicePreview.ts` |
| **ai** | `aiChat.ts` `aiSummary.ts` `aiPractice.ts` `aiStarters.ts` `aiUsage.ts` |
| **discover** | `discoverApi.ts` `discoverCache.ts` `discoverImport.ts` `discoverSeed.ts` |
| **billing** | `revenuecat.ts` `freePlanUsage.ts` |
| **core** | `supabase.ts` `networkErrors.ts` `toast.ts` `notifications.ts` `installRejectionTracker.ts` `useBackHandler` `useAppFonts` |

## Order of moves

One feature per commit, smallest first, so a broken import is attributable to
one move rather than to a 33,000-line diff:

1. `billing` (2 screens) — smallest, exercises the pattern
2. `discover` (1 screen, 4 lib)
3. `ai` (2 screens, 5 lib)
4. `listen` (5 screens, 4 lib)
5. `auth` (7 screens, 1 lib)
6. `library` (3 screens, 5 lib)
7. `account` (6 screens)
8. `reader` (7 screens, 7 lib) — largest and most entangled, last

## Public API rule

Each feature exposes one `index.ts`. §4 rule 1: a feature imports another
through that file, never its internals. The ESLint boundary added in M1
already enforces it for `features/*` — it has had nothing to act on until now.

Within a feature, relative imports are fine. Across features, `~/features/x`
resolves to the index and nothing deeper.

## What this does not do

It does not convert anything to TanStack Query, and it does not change
behaviour. It is file moves, import rewrites and `index.ts` files. The
no-visual-change rule holds trivially — no component's code changes — and the
evidence is `tsc`, which sees every import.
