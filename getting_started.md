# Getting Started with Claude Code

Concrete prompts for the first sessions building Bookflow with Claude Code. Copy these directly into Claude Code and adjust as needed.

---

## Session 1 — Verify the setup

Before doing anything else, confirm Claude Code reads CLAUDE.md correctly.

**Prompt to Claude Code:**

> Read CLAUDE.md and the spec files in docs/specs/. Then summarize back to me: (1) what Bookflow is and who it's for, (2) the chosen tech stack, (3) the five components in the design system. Don't write any code yet — I just want to verify you've internalized the project context.

If Claude Code's summary matches your understanding, you're good. If anything's wrong or missing, update CLAUDE.md before proceeding.

---

## Session 2 — Build the design system foundation

Goal: get all 5 canonical components implemented before touching any screens.

**Prompt:**

> Look at src/components/Button.tsx and src/components/Icon.tsx — these are already started. Build the remaining canonical components in this exact order:
>
> 1. `src/components/Input.tsx` — implement the full input system per docs/specs/bookflow_input_system.html. Three sizes (compact, standard, large), three variants (text, search, textarea), all seven states (enabled, disabled, focus, pressed, error, success, autofill).
>
> 2. `src/components/ListRow.tsx` — implement per docs/specs/bookflow_list_row_system.html. One anatomy with three slots (leading, content, trailing), six patterns documented, two sizes, four states. Make the patterns easy to use — consider exposing them as variants like `<ListRow variant="settings" ... />` or as composable parts.
>
> 3. `src/components/BottomSheet.tsx` — wrap @gorhom/bottom-sheet with our patterns per docs/specs/bookflow_bottom_sheet_system.html. Five variants: picker, action menu, confirmation, form, detail. Match the motion specs (320ms enter, 200ms exit) and drag thresholds (25% / 600px/s).
>
> All components must reference tokens from `~/design/tokens` — never hardcode visual values. Add TypeScript types for all props. Plan first, then implement one component at a time. Show me each before moving to the next.

After this session you'll have a complete component library — the foundation everything else builds on.

---

## Session 3 — Set up Supabase

Goal: get auth and the database schema in place.

**Prompt:**

> Set up our Supabase integration. Steps:
>
> 1. Create `src/lib/supabase.ts` that exports a typed Supabase client. Use the env vars from .env (EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY).
>
> 2. Generate the database schema from docs/specs/bookflow_engineering_scoping.md (Part 2.3, "Database schema"). Output it as a SQL file in `supabase/migrations/0001_initial_schema.sql`. Tables: profiles, subscriptions, books, chapters, audio_cache, summaries, conversations, messages, chunk_embeddings.
>
> 3. Add Row Level Security policies for each table. Default rule: users can only read/write their own data (filter by user_id matching auth.uid()).
>
> 4. Generate TypeScript types for the schema in `src/types/database.ts` matching the table structure.
>
> 5. Create `src/lib/auth.ts` with sign-in functions (Google OAuth and email magic link) and a `useAuth` hook that returns the current user.
>
> Don't run the migration yet — output the files so I can review before applying.

---

## Session 4 — Milestone 1, screen 1: Library

Goal: a working Library screen showing books, even if they're hardcoded for now.

**Prompt:**

> Build the Library screen at `src/app/(tabs)/library.tsx`. Reference the design in docs/specs/bookflow_design_showcase.html (open the file to see the visual reference).
>
> Requirements:
> - Header: "Library" title in Fraunces (display font) + Search icon button (right side)
> - "Continue reading" hero card showing the most recently-read book with progress bar
> - Below the hero: a list of all books in the user's library, each as a ListRow (use the Settings pattern with cover thumbnail as leading icon, title as label, "Chapter X · Y%" as hint, chevron trailing)
> - Empty state: "No books yet" with a primary button "Add your first book"
> - Sort/filter button in header that opens a bottom sheet (SortFilterSheet) — wire up the trigger but the sheet contents can be a placeholder for now
>
> Use mock data for books (an array of 3-4 hardcoded books) so we can see the screen working before wiring up Supabase.
>
> All components must come from src/components/ — don't reinvent buttons or list rows.

---

## Session 5 — Milestone 1, screen 2: Reader

Goal: a working Reader screen for a single book with EPUB parsing.

**Prompt:**

> Build the Reader screen at `src/app/reader/[id].tsx`. Reference docs/specs/bookflow_design_showcase.html for the visual.
>
> Requirements:
> - Top header: back button, book title (truncated), chapter progress
> - Top right: Aa typography button (opens TypographyPanel bottom sheet), chapters icon
> - Body: rendered chapter text in Literata font, configurable size (use a Zustand store for typography preferences)
> - Bottom action bar: 4 icons (Listen, AI tools, Chapters, Search)
> - Tap a word: open a small popover with translation (mock for now, just show "Translation: [word]")
>
> Use a hardcoded EPUB file from assets/ for testing. Parse it with epubjs to extract chapter text. Save reading position to AsyncStorage so it persists between app launches.
>
> Plan the implementation before writing code. Tell me about any decisions you need from me.

---

## Session 6 — Milestone 1, screen 3: Listen mode

Goal: TTS playback with bimodal sync.

**Prompt:**

> Add Listen mode to the Reader. When the user taps the Listen icon in the action bar, the reader transitions to listen mode:
>
> Requirements:
> - Top: book cover, title, current chapter
> - Center: chapter text rendered with the current word highlighted in amber-500 (per the bimodal pattern)
> - Bottom: full audio player — back 15s, play/pause, forward 15s + speed selector + voice picker + sleep timer
>
> Implementation:
> 1. Create `src/lib/elevenlabs.ts` with a function `synthesizeChapter(chapterText, voice)` that calls ElevenLabs Turbo v2.5 with character timestamps. Stream the audio to the device.
> 2. Cache audio in Supabase Storage so a chapter+voice combo is generated only once.
> 3. Use expo-av or react-native-track-player for playback. Background playback enabled.
> 4. Word highlighting: align ElevenLabs character timestamps with text rendering positions. Update highlight on requestAnimationFrame as audio plays.
>
> Note: the audio sync is the hardest part of this milestone. Spike on it first — get rough sync working, then refine. Don't try to make it perfect on the first try.

---

## After Milestone 1

You should have a working app where:
- A user signs up
- They open a hardcoded book (or upload one)
- They can read it with their preferred typography
- They can listen to it with synced word highlighting

Show this to 5 people in your network. Watch them use it. Note where they get confused. Fix the obvious problems before continuing to Milestone 2.

---

## General tips for working with Claude Code

**Plan before code.** For anything bigger than ~50 lines, ask Claude Code to make a plan first, review the plan, then say "implement this." This catches bad approaches before they become bad code.

**Spec, not vibes.** When asking for a UI element, reference the canonical spec ("per the Settings pattern in bookflow_list_row_system.html"). "Make it look good" leads to inconsistent results.

**Review every file.** Before merging, read what was written. If you don't understand something, ask Claude Code to explain it. Code you don't understand is technical debt.

**Test as you go.** After each feature, manually test it on a simulator AND a real device. Don't batch testing.

**Update CLAUDE.md as you learn.** When you discover a new convention or constraint, add it to CLAUDE.md so future sessions inherit it.

**When stuck, simplify.** If Claude Code keeps failing at something, the request is probably too big. Break it into smaller steps.
