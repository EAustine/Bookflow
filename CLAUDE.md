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

## Tech stack — these are decided, not suggestions

**Core:**
- React Native + Expo (managed workflow)
- TypeScript with strict mode enabled (non-negotiable)
- Expo Router for file-based routing
- NativeWind for styling
- Zustand for global state (not Redux, not Context for everything)
- TanStack Query for server state and caching

**Backend & services:**
- Supabase for auth, database (Postgres), storage, edge functions, pgvector for RAG
- RevenueCat for subscription management (handles App Store + Play Store)
- Anthropic API for LLM features (Claude Sonnet 4.5 for hard tasks, Haiku 4.5 for cheap tasks)
- ElevenLabs API for TTS (Turbo v2.5 model, supports streaming + word-level timestamps)
- Resend for transactional email
- PostHog for analytics
- Sentry for crash reporting

**Specific libraries:**
- `lucide-react-native` for icons (with `react-native-svg`) — always pass `strokeWidth={1.5}`
- `@gorhom/bottom-sheet` for bottom sheets (don't roll our own)
- `expo-av` or `react-native-track-player` for audio playback
- `epubjs` for EPUB parsing
- Read `/docs/specs/bookflow_engineering_scoping.md` for the full rationale on each choice

**Don't suggest alternatives** like "have you considered Flutter?" or "we should use Redux instead." These were debated; the answers are above. If a genuinely new constraint emerges, then revisit — but don't second-guess proactively.

---

## Project conventions

### File structure

```
src/
├── app/                  # Expo Router routes (file-based)
│   ├── (tabs)/          # Tab navigator
│   │   ├── library.tsx
│   │   ├── discover.tsx
│   │   ├── listen.tsx
│   │   └── you.tsx
│   ├── reader/[id].tsx  # Reader screen
│   └── _layout.tsx
├── components/          # Reusable components
│   ├── Button.tsx       # Canonical button — use, don't reinvent
│   ├── Input.tsx
│   ├── Icon.tsx         # Lucide wrapper
│   ├── ListRow.tsx
│   ├── BottomSheet.tsx
│   └── ...
├── design/              # Design system tokens & utilities
│   ├── tokens.ts        # All colors, spacing, typography
│   ├── CLAUDE.md        # Nested instructions for design work
│   └── theme.ts
├── lib/                 # Service integrations
│   ├── supabase.ts
│   ├── anthropic.ts
│   ├── elevenlabs.ts
│   └── revenuecat.ts
├── hooks/               # Custom React hooks
├── stores/              # Zustand stores
├── types/               # TypeScript type definitions
└── utils/               # Pure utility functions

docs/
└── specs/               # All design system + product specs
    ├── bookflow_mvp_scope.md
    ├── bookflow_design_system.md
    ├── bookflow_button_system.html
    ├── bookflow_input_system.html
    ├── bookflow_bottom_sheet_system.html
    ├── bookflow_list_row_system.html
    └── bookflow_engineering_scoping.md
```

### Naming conventions

- **Components**: PascalCase, single component per file. `Button.tsx`, `BookCard.tsx`.
- **Hooks**: camelCase prefixed with `use`. `useBookProgress.ts`, `useAudio.ts`.
- **Utils**: camelCase verbs. `formatReadingTime.ts`, `parseEpub.ts`.
- **Types**: PascalCase, suffixed appropriately. `Book`, `BookCardProps`, `UseAudioReturn`.
- **Files in app/**: Follow Expo Router conventions (e.g., `[id].tsx` for dynamic routes).

### Imports

- Use `~/` as the root alias mapped to `src/`. Configured via `paths` in `tsconfig.json`; Metro picks them up at runtime via the `experiments.tsconfigPaths` flag in `app.json` (no `babel-plugin-module-resolver` needed).
- Order: React → external libraries → `~/` internal → relative `./`.
- Always use named imports for components and types.
- Lucide icons: import individual icons, never `import * as Lucide`.

### Styling rules

- Use NativeWind utility classes for everything possible.
- Tokens come from `~/design/tokens.ts` — never hardcode hex colors or pixel values.
- For complex styles or animations, use StyleSheet.create — but tokens still come from `tokens.ts`.
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
7. **Icons always use `strokeWidth={1.5}`**, not Lucide's default 2. Use the `<Icon />` wrapper, never raw Lucide imports.
8. **No more than one primary button per surface.** Two primaries = no primary.
9. **Loading state on buttons uses a spinner** (16px, 1.5px stroke, 700ms rotate). Never replace label with "Loading...".
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

# Run tests
npx jest

# Build for TestFlight/Play Store internal testing
eas build --profile preview --platform all
```

---

## Last thing

If at any point this CLAUDE.md feels outdated relative to what we're actually building, propose updates to it. The file should evolve with the project, not stay frozen at week 1.
