# Bookflow — Project Context for Claude Code

This file is read automatically at the start of every Claude Code session. It contains the opinionated decisions that have already been made — Claude Code should follow these unless the user explicitly says otherwise. Don't propose alternative libraries or patterns that contradict these decisions; they were made deliberately.

---

## What Bookflow is

Bookflow is a mobile reading app that combines reading + listening + AI summarization + Q&A + translation into one experience. Users upload PDFs/EPUBs or pick from a public domain library, then can read them, listen to them as audio (with synced word-level highlighting in "bimodal" mode), get AI-generated chapter summaries, ask questions about the book content, and translate words inline.

Two primary user personas drive every product decision:
- **Ama** — 20yo Ghanaian Business undergrad, ESL, Android user, $3-5/mo budget
- **David** — 34yo project manager with dyslexia, premium-willing, $10-15/mo

If a feature decision feels ambiguous, ask: "would Ama use this?" and "would David trust this?" If either answer is no, reconsider.

The full product scope, personas, MVP features, pricing, and beta plan are in `/docs/specs/bookflow_mvp_scope.md`. Read it when implementing anything that involves product decisions, feature scope, or pricing.

---

> **This file is kept in step with `/docs/ARCHITECTURE.md`.** Where the two
> disagree, the architecture document wins and this file is the bug. The app is
> mid-migration (see `/docs/ARCHITECTURE_LOG.md` for which milestone is live),
> so some code still follows patterns this file no longer describes; that is
> leftover to be replaced, not a precedent to copy.

## Tech stack — these are decided, not suggestions

**Core:**
- React Native + Expo (managed workflow)
- TypeScript with strict mode enabled (non-negotiable)
- **Expo Router**, file-based, in `apps/app/app/`. Typed routes on. It replaced a hand-rolled `stage` state machine in `App.tsx` during migration milestone M2 — if you find code still switching on `stage` or on per-tab `view` state, that is leftover, not the pattern. The route map is `/docs/M2_ROUTE_MAP.md`.
- **`StyleSheet.create` + `tokens.ts` for styling.** NativeWind is installed but unused (0 `className` usages, no `tailwind.config`). Don't introduce Tailwind classes; follow the surrounding `StyleSheet` + tokens pattern.
- Zustand for global state (not Redux, not Context for everything)
- **TanStack Query** for all server state, with query keys per feature. Bespoke hooks over Supabase (`useBooks`, `useBooksImpl`, `useCurrentUser`) are the old pattern and are being replaced in M3 — match Query in new code, and do not add another bespoke hook. Zustand stays for client state.

**Backend & services:**
- Supabase for auth, database (Postgres), storage, edge functions, pgvector for RAG
- RevenueCat for subscription management (handles App Store + Play Store)
- Anthropic API for LLM features (Claude Sonnet 4.5 for hard tasks, Haiku 4.5 for cheap tasks)
- ElevenLabs API for TTS (Turbo v2.5 model, supports streaming + word-level timestamps)
- Resend for transactional email *(planned — not yet in `package.json`)*
- Analytics and crash reporting are **not wired yet** — PostHog and Sentry are planned but absent from `package.json`. Don't import them.

**Specific libraries:**
- `@tabler/icons-react-native` for icons (with `react-native-svg`), wrapped by `src/components/Icon.tsx` — **never import Tabler directly**. The wrapper applies `tokens.iconStrokeWidth` (1.0); don't pass `strokeWidth` at all. The one exception is `strokeWidth={0}` on Tabler's `*Filled` glyphs (Play, Pause, ThumbUpFilled), which paint from `fill`.
- `@gorhom/bottom-sheet` for bottom sheets (don't roll our own)
- `expo-audio` for audio playback (not `expo-av` or `react-native-track-player`)
- `react-native-webview` + injected CSS for EPUB Full mode (not `epubjs`); **`react-native-pdf` for PDF Full mode, permanently** — M0 spike 1 measured pdf.js in a WebView at 42 dropped frames in 60 during ordinary reading scroll on a low-end device, so it is ruled out of the unified reader engine. See `/docs/ARCHITECTURE.md` §7.6. Both are reached through `~/platform/readerHost`, not imported directly.
- **Native-only packages live behind `~/platform/*`** (`audio`, `clipboard`, `fileCache`, `files`, `imagePicker`, `notifications`, `readerHost`, `shareIntent`, `speech`), each a module with a `.web.ts` sibling Metro resolves for the web bundle. Never import `expo-audio`, `expo-clipboard`, `expo-file-system`, `expo-document-picker`, `expo-image-picker`, `expo-notifications`, `expo-share-intent`, `expo-speech`, `react-native-pdf` or `react-native-webview` from a screen — same rule as Tabler icons, and for the same reason: the wrapper is where the platform differences are decided. An adapter exposes what the app needs rather than re-exporting its package. `react-native-purchases` is the last holdout, moving once the current release soaks. See `/docs/ARCHITECTURE.md` §8.
- Read `/docs/specs/bookflow_engineering_scoping.md` for the full rationale on each choice

**Don't suggest alternatives** like "have you considered Flutter?" or "we should use Redux instead." These were debated; the answers are above. If a genuinely new constraint emerges, then revisit — but don't second-guess proactively.

---

## Project conventions

### File structure

```
apps/app/                 # The Expo app. Routes in app/, everything else in src/.
apps/site/                # Marketing site (static), deployed to Vercel.
packages/tokens/          # Design tokens -> RN theme + tokens.css.
packages/shared/          # Types and pure logic. No platform imports.
supabase/                 # Migrations and 21 edge functions. Repo root.

apps/app/app/             # Expo Router routes (file-based), M2 onward.
├── _layout.tsx           # Root: session restore, splash, boot hand-off
├── index.tsx
├── (auth)/ (onboarding)/ (tabs)/
└── auth/ settings/ you/
                          # Route map: /docs/M2_ROUTE_MAP.md

apps/app/src/
├── features/            # The app, by feature (M3). Eight of them.
│   ├── account/ ai/ auth/ billing/
│   ├── discover/ library/ listen/ reader/
│   └── <name>/
│       ├── api/         # Data + side effects for this feature
│       ├── components/  # Private to the feature
│       ├── hooks/       # (where a feature needs them)
│       ├── screens/     # LibraryScreen.tsx, ReaderScreen.tsx, …
│       └── index.ts     # The feature's public face. Import ANOTHER
│                        # feature through this; never import your OWN
│                        # feature's index — it re-exports you, and the
│                        # cycle resolves to undefined at module load.
├── shell/               # SignedInShell + useShellSession. What wraps
│                        # the tabs: share intent, paywall, billing sync.
├── platform/            # Native-only packages (§8). One module per
│   │                    # adapter with a .web.ts sibling Metro picks
│   │                    # for the web bundle.
│   ├── audio.ts / audio.web.ts
│   ├── readerHost.tsx / readerHost.web.tsx
│   └── clipboard / fileCache / files / imagePicker /
│       notifications / orientation / shareIntent / speech
├── core/                # Shared by more than one feature, owned by
│                        # none. Where a cross-feature helper goes
│                        # instead of creating an import cycle.
├── components/          # Reusable components (34). The design system.
│   ├── Button.tsx       # Canonical button — use, don't reinvent
│   ├── Input.tsx
│   ├── Icon.tsx         # Tabler wrapper — never import Tabler directly
│   ├── ListRow.tsx
│   ├── BottomSheet.tsx
│   └── ...
├── ui/                  # Presentational odds and ends. Must NOT import
│                        # from features/ or screens/ — the dependency
│                        # runs the other way.
├── design/              # Design system tokens
│   ├── tokens.ts        # All colors, spacing, typography
│   └── CLAUDE.md        # Nested instructions for design work
├── lib/                 # Service integrations
│   ├── supabase.ts
│   ├── anthropic.ts
│   ├── elevenlabs.ts
│   └── revenuecat.ts
├── audio/               # Now-playing metadata
├── data/                # Static content (the curated library)
├── hooks/               # Cross-feature React hooks
├── stores/              # Zustand stores
└── types/               # TypeScript type definitions

docs/
├── ARCHITECTURE.md       # The target. Wins over this file.
├── ARCHITECTURE_LOG.md   # Which milestone is live, and why
├── ARCHITECTURE_GAPS.md  # Distance between the two
├── M2_ROUTE_MAP.md / M2_DEEP_LINKS.md / M3_FEATURE_MAP.md
├── MOBILE_UI_SPEC.md / RELEASE_QA_CHECKLIST.md
└── specs/               # Design system + product specs
    ├── bookflow_mvp_scope.md
    ├── bookflow_design_system.md
    ├── bookflow_button_system.html
    ├── bookflow_input_system.html
    ├── bookflow_bottom_sheet_system.html
    ├── bookflow_list_row_system.html
    ├── bookflow_engineering_scoping.md
    └── responsive-handoff.md / responsive-milestones.md
```

There is **no `src/screens/`** and no `src/utils/`. Screens live in the
feature that owns them. If you find a reference to either, it predates
M3 and is the bug.

### Naming conventions

- **Components**: PascalCase, single component per file. `Button.tsx`, `BookCard.tsx`.
- **Hooks**: camelCase prefixed with `use`. `useBookProgress.ts`, `useAudio.ts`.
- **Utils**: camelCase verbs. `formatReadingTime.ts`, `parseEpub.ts`.
- **Types**: PascalCase, suffixed appropriately. `Book`, `BookCardProps`, `UseAudioReturn`.
- **Screens**: PascalCase, suffixed `Screen` or `Sheet`. `LibraryScreen.tsx`, `BuyCreditsSheet.tsx`.

### Imports

- Use `~/` as the root alias mapped to `src/`. Configured via `paths` in `tsconfig.json`; Metro picks them up at runtime via the `experiments.tsconfigPaths` flag in `app.json` (no `babel-plugin-module-resolver` needed).
- Order: React → external libraries → `~/` internal → relative `./`.
- Always use named imports for components and types.
- Icons: always `import { Icon } from '~/components'` and pass a name. Never import from `@tabler/icons-react-native` in a screen.

### Styling rules

- `StyleSheet.create` for everything, with every value from `~/design/tokens.ts`. Never hardcode a hex or a raw spacing number.
- Reach for the semantic names first (`textColors.muted`, `bgColors.canvas`, `space.lg`, `textStyles['body-md']`), then the raw scales (`colors.ink[500]`, `spacing[4]`).
- Translucent values live in `tokens.overlay`; shadows in `tokens.elevation[1-4]` (spread them: `...tokens.elevation[2]`).
- Cream-50 (`#FAF7F2`) is the default background. NOT pure white.

---

## The design system — use it, don't reinvent it

Bookflow has a complete component system. Use the canonical components for everything; don't build new buttons or inputs from scratch.

### Components and their canonical specs

| Component | Spec location | Built from |
|---|---|---|
| Button | `/docs/specs/bookflow_button_system.html` | `src/components/Button.tsx` |
| Input | `/docs/specs/bookflow_input_system.html` | `src/components/Input.tsx` |
| Icon | `/docs/specs/bookflow_input_system.html` (icon library section) | `src/components/Icon.tsx` |
| BottomSheet | `/docs/specs/bookflow_bottom_sheet_system.html` | `src/components/BottomSheet.tsx` (wraps `@gorhom/bottom-sheet`) |
| ListRow | `/docs/specs/bookflow_list_row_system.html` | `src/components/ListRow.tsx` |

### Hard rules

These come from explicit decisions in the design system. Violating any creates inconsistency:

1. **Buttons never truncate text.** If a button label doesn't fit, switch to stacked layout (primary on top, tertiary below) rather than shortening text or truncating.
2. **Confirmation bottom sheets always use stacked CTAs**, never side-by-side. Primary on top, tertiary below.
3. **Chevrons mean "drills into more"**, not generic "tappable." Don't put chevrons on action rows.
4. **Disabled rows must explain why** in a sub-label. Never just dim something without context.
5. **Destructive actions always trigger a confirmation bottom sheet**, never fire on tap.
6. **Tap target is the entire row**, not just the label. Especially for toggle rows.
7. **Never pass `strokeWidth` to `<Icon />`.** The wrapper applies `tokens.iconStrokeWidth` (**1.0**) for you. The sole exception is `strokeWidth={0}` on Tabler's `*Filled` glyphs, which paint from `fill`. (Was 1.5 with 79 of 144 call sites overriding it; settled at 1.0 and the overrides removed.)
8. **No more than one primary button per surface.** Two primaries = no primary.
9. **Loading state on buttons uses `<Spinner />`** (16px, 1.5px stroke, 700ms rotate — `tokens.button.spinner`). Never `ActivityIndicator`, never replace the label with "Loading…".
10. **Background defaults to cream-50** (`#FAF7F2`). Pure white is wrong.

---

## Critical product principles (from beta research)

These shape every UX decision:

- **All in one place** — Bookflow's value prop is consolidating tools. Don't fragment the experience by sending users out to other apps.
- **Source traceability is non-negotiable** — every AI claim (summary points, Q&A answers) must cite back to the source chapter/page. Users learned not to trust AI without sources. This is a marketed feature, not optional.
- **Cost transparency before AI actions** — show estimated credits before generating whole-book summaries or doing expensive operations. No surprise charges.
- **Quality ratings everywhere AI generates content** — 👍/👎 with optional reason chips. Used to identify hallucination patterns.
- **Honest empty/edge states** — explain what still works when something fails (offline state, low credits, etc.). Don't just show an error.
- **No dark patterns** — no fake countdowns, no fake scarcity, no manipulative copy. The product earns trust by being honest.
- **Cache aggressively** — TTS and LLM responses are expensive. Cache every chapter+voice combination, every chapter summary. The unit economics depend on it.

---

## Critical engineering principles

- **Streaming over spinners** — when AI is generating a response, stream the text in. Don't show a spinner and dump the whole response at once. Streaming makes 8-second responses feel like 2-second responses.
- **Local-first for reading** — once a book is downloaded, reading + listening should work fully offline. Q&A and summaries require network; that's fine.
- **Test against real personas** — when implementing a feature, mentally walk through it as Ama (low-data Android user) and David (dyslexic adult on iOS). If the implementation only works for one, fix it.
- **Cost-conscious LLM calls** — use Haiku 4.5 for simple operations (chapter summaries, grading, translation), Sonnet 4.5 only for hard tasks (Q&A, whole-book summaries). The tier strategy keeps margins healthy.
- **Always handle the offline state** — every feature that touches the network needs an offline branch. Don't assume connectivity.

---

## What to do when something is unclear

If a request is ambiguous, the order of priority is:

1. **Check the spec docs** in `/docs/specs/` — most decisions are documented there
2. **Re-read this CLAUDE.md** — opinionated decisions are stated here
3. **Ask the user** — for genuinely new decisions, surface options rather than guessing
4. **Default to simpler** — when in doubt, the simpler implementation wins

Never:
- Silently invent a new design pattern when a canonical one exists
- Add a new dependency without flagging it
- Hardcode magic numbers — use tokens
- Skip TypeScript types because "this is just a quick prototype"

---

## Solo founder context

The user is building this alone. That means:

- **Velocity matters more than perfection.** Ship the thinnest slice first; iterate.
- **Boring tech beats clever tech.** Use the well-trodden path.
- **Tests for high-value logic, not everything.** Test the audio sync algorithm, the credit accounting, the EPUB parser. Don't test trivial UI rendering.
- **Reviewing what Claude Code writes is part of the job.** Don't merge code you don't understand, even if it works. You'll need to debug it at 2 AM eventually.

---

## Useful commands

```bash
# Start the dev server
npx expo start

# Run on iOS simulator
npx expo start --ios

# Run on Android emulator
npx expo start --android

# Type check
npx tsc --noEmit

# Run tests (Vitest, on the pure packages — there is no RN test runner)
npm test

# Build for TestFlight/Play Store internal testing
eas build --profile preview --platform all
```

---

## Last thing

If at any point this CLAUDE.md feels outdated relative to what we're actually building, propose updates to it. The file should evolve with the project, not stay frozen at week 1.
