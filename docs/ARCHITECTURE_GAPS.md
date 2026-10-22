# Architecture gaps

Phase 0 of the migration. Measures the distance between `docs/ARCHITECTURE.md`
(the target) and the code as it stands on `main` at `cfa7f3e`.

No code was changed to produce this. Every count in it came from the tree, not
from the previous documentation — where the two disagree, the tree won and the
disagreement is recorded.

Date: 2026-10-22 · Branch: `arch/phase0-gaps` · Base: `main` @ `cfa7f3e`

---

## 0. Headline

Three things are materially different from what `ARCHITECTURE.md` assumes, and
all three make the plan *better* rather than worse — but they move work between
milestones.

1. **M5 is mostly reshaping, not building.** Three of the five "new" tables in
   §9.1 already exist in substance, and the transactional credit debit the doc
   treats as a goal already ships. What is left is a reshape of live data,
   which is less work and more risk.
2. **M6 has a fourth reader to account for.** §7.5 maps three. There are four
   text-rendering surfaces, and the fourth — `ListenScreen` — is the *only*
   place word-level sync works today. It is the engine's hardest feature and
   the doc does not mention where it goes.
3. **The repo's own agent instructions contradict each other and the target.**
   `CLAUDE.md` and `AGENTS.md` give opposite directions on routing and data,
   and both document a test command that does not exist. Now an M1 deliverable
   (§12 of the architecture doc).

---

## 1. Current vs target, section by section

Size is the implementation effort: **S** days, **M** a week or two, **L** a
month or more.

| § | Area | Today | Change | Size |
|---|---|---|---|---|
| 3 | Breakpoints and shells | None. No `useLayoutClass`, no breakpoint tokens, phone layout only | All new. **Blocked** — no tablet or desktop frames in Figma | **L** |
| 4 | Repo layout | Single npm package. `src/{screens,components,lib,hooks,stores,design,types,utils}`. The marketing site is a **separate, unversioned** directory at `~/bookflow-site` | pnpm workspaces, `apps/`, `packages/`, `features/`. 35 screens and 33,203 lines move, plus 27 static files and one orphaned edge function | **M** |
| 5 | Navigation | Hand-rolled `stage` machine in `App.tsx` (1,468 lines) plus local `view` state inside each tab. `expo-router` not installed | Expo Router, typed routes, every screen a URL. The highest-risk structural change in the plan | **L** |
| 6 | Data layer | `@tanstack/react-query@5.100.5` **is installed** but server state is bespoke hooks (`useBooks`, `useBooksImpl`, `useCurrentUser`, `useBookChapters`) over Supabase. Zustand (2 stores) for client state. No persisted cache, no offline queue | Query for all server state, persisted cache, offline queue. Zustand stays | **L** |
| 7 | Reader | Four surfaces, 7,852 lines, three rendering strategies — see §4 below | One engine. The highest-consequence change | **L** |
| 8 | Platform adapters | None. 21 native-only import sites across 18 files. `src/lib/notifications.ts` is already an adapter in all but name | 9 adapters. Smaller than it looks | **M** |
| 9 | Backend | 13 tables, 27 migrations, 20 edge functions. `revenuecat-webhook` already live | Reshape 3, add 2. See §2 | **M** |
| 10 | Billing | `react-native-purchases@10.0.1` native only. Hosted paywall. No web | RevenueCat Web SDK, entitlements from Supabase | **M** |
| 11 | Tokens | `src/design/tokens.ts`, one file, RN only. Figma parity maintained **by hand** — six rounds of drift corrected manually in the last cleanup round | `packages/tokens` generating RN theme + `tokens.css` + a CI drift check | **M** |
| 12 | Quality | **Nothing.** No jest, no vitest, zero test files, no CI, no Sentry, no PostHog | All new | **M** |

### What is already further along than the doc assumes

- `react-native-web@0.21.2` is installed. M0's web-boot spike does not start from zero.
- `@tanstack/react-query` is installed and configured.
- `src/lib/notifications.ts` already lazy-`require`s `expo-notifications` behind a
  defensive wrapper (`:50`) — that is the adapter pattern, written for a
  different reason.
- Credit metering is already server-side and transactional (§2).

### What is further behind

- No test runner of any kind. M1's "tests green" gate is vacuous until one exists.
- No CI at all.
- `expo-secure-store`, `expo-haptics`, `react-native-mmkv`, `expo-router`,
  Sentry, PostHog and Vitest are all absent. `CLAUDE.md` requires flagging new
  dependencies; that is the list.

---

## 2. Schema map

**The live schema is 13 tables over 27 migrations, not the ten §9.1 assumed.**

```
audio_cache · books · chunk_embeddings · conversations · highlights
listen_sessions · messages · pages · practice_questions · profiles
reading_sessions · summaries · translations
```

Plus `ai_usage_events` (0021), `credit_grants` (0024) and
`audio_content_cache` (0023), which are not in the generated types.

### Against §9.1

| Target table | Verdict | Evidence |
|---|---|---|
| `narration_segments` | **Already exists** as `audio_cache` | Columns: `page_id`, `voice_id`, `storage_path`, `alignment_path`, `duration_seconds`. Word timing per page and voice, exactly as specified. Added in `0016_audio_cache_alignment.sql` |
| `credit_ledger` | **Already exists** as `ai_usage_events` + `credit_grants` | `0021_ai_credit_metering.sql`, `0024_credit_topups.sql`. Append-only usage log plus grants with expiry |
| `entitlements` | **Reshape** of `profiles.plan` + `profiles.ai_credits_limit` | `supabase/functions/revenuecat-webhook/index.ts:178` already upserts these from the webhook |
| `jobs` | **Partial** — `books.processing_message` (0018) and realtime on `books` (0004) carry progress today | No job table, no retry/attempts, no queue |
| `documents` | **New** | Nothing equivalent |

### The one real gap in the credit model

§9.1 says "Balances are a view, never a stored counter." Today they are stored
counters on `profiles`: `ai_credits_used`, `ai_credits_balance`,
`ai_credits_balance_expires_at`, `ai_credits_period_start`. The events exist,
but the balance is not derived from them.

That is a genuine change and it is the riskiest part of M5, because the counter
is what gates every AI call today.

### §9.2 is already true

> "Every AI and narration function checks and debits credits in the same
> transaction as recording the request. No client-side metering."

This already ships. `supabase/functions/_shared/aiCredits.ts:89` calls the
`record_ai_usage` RPC — a plpgsql function (0021, revised by 0024 and 0027)
that rolls the period, writes the usage event, and debits top-up balance before
monthly allowance, in one transaction.

**Consequence:** §9.2's claim that server-side metering "unblocks the hidden
credit gauge" is wrong, because metering is not what is blocking it. Whatever
hides the gauge needs finding before M5 promises to restore it.

### Data migrations and risk to live users

| Migration | Risk | Note |
|---|---|---|
| `profiles.plan` → `entitlements` | **High** | Gates every paid feature. Needs dual-read behind a flag before the old columns are dropped |
| Stored balance → ledger view | **High** | Get this wrong and users are over- or under-charged. Reconciliation must be proven against real rows before cutover |
| `audio_cache` → `narration_segments` | **Low** | Rename plus columns. Content is regenerable |
| Canonical `documents` build | **Medium** | Additive, given the `pages.id` constraint now in §7.2. Every existing book needs a processing pass |
| `jobs` | **Low** | New table, no existing data |

`listen_sessions.chapter_id` is a leftover from `0010_chapters_to_pages.sql`
and should be reconciled or dropped while the schema is open.

---

## 3. Native-only imports

21 import sites across 18 files. Every one must move behind `platform/*` in M4.

| Package | §8 adapter | Sites | Where |
|---|---|---|---|
| `expo-clipboard` | **none in §8** | 4 | `AIToolsScreen.tsx:13`, `DiscoverScreen.tsx:13`, `HelpFAQScreen.tsx:17`, `YouDrillScreens.tsx:19` |
| `expo-document-picker` | `files` | 3 | `App.tsx:18`, `lib/uploadBook.ts:2`, `LibraryScreen.tsx:49` |
| `react-native-purchases` | `billing` | 3 | `hooks/useCustomerInfo.ts:2`, `lib/revenuecat.ts:8`, `BuyCreditsSheet.tsx:11` |
| `expo-audio` | `audio` | 2 | `lib/aiAudio.ts:7`, `lib/voicePreview.ts:5` |
| `expo-file-system` | `fileCache` | 2 | `lib/audioDownloads.ts:1`, `AccountScreen.tsx:14` |
| `expo-speech` | `audio` | 2 | `AIToolsScreen.tsx:14`, `ReaderScreen.tsx:65` |
| `expo-notifications` | `notifications` | 1 | `lib/notifications.ts:50` — already lazy-`require`d behind a wrapper |
| `expo-image-picker` | `files` | 1 | `AccountScreen.tsx:15` |
| `expo-share-intent` | `shareIntent` | 1 | `App.tsx:19` |
| `react-native-webview` | `reader-host` | 1 | `EpubFullReaderScreen.tsx:34` |
| `react-native-pdf` | `reader-host` | 1 | `PdfReaderScreen.tsx:29` |

**`expo-clipboard` has no adapter in §8** and is the most-used of the lot. It
needs one (`navigator.clipboard` on web), or §8 needs a line saying why not.

Web-safe and deliberately excluded: `expo-linking`, `expo-constants`,
`expo-font`, `expo-status-bar`, `expo-crypto`, `expo-web-browser`,
`expo-auth-session`, `@gorhom/bottom-sheet`, `react-native-svg`.

---

## 4. Reader inventory — M6's parity checklist

**There are four text-rendering surfaces, not three.** §7.5 maps three.

| Surface | Lines | Strategy | In §7.5? |
|---|---|---|---|
| `ReaderScreen.tsx` | 3,689 | RN `FlatList`, virtualised, lazy per-page fetch | yes |
| `ListenScreen.tsx` | 1,935 | RN text, **word-synced**, paragraph dimming | **no** |
| `EpubFullReaderScreen.tsx` | 1,151 | `react-native-webview` + injected CSS | yes |
| `PdfReaderScreen.tsx` | 1,077 | `react-native-pdf` | yes |
| | **7,852** | | |

### Parity checklist

| Feature | Text | Listen | EPUB | PDF | Notes for the engine |
|---|---|---|---|---|---|
| Themes — light / sepia / dark | ✅ | — | ✅ | — | `readerStore.ReaderTheme` |
| Presets — standard / comfortable / max | ✅ | — | ✅ | — | `ReaderScreen.tsx:2797` |
| Font family — serif / sans / **lexend** | ✅ | — | ✅ | — | Lexend is a dyslexia-friendly face. David's persona depends on it |
| Font size slider | ✅ | — | ✅ | — | `SizeSlider`, `ReaderScreen.tsx:2964` |
| Auto-hide chrome (3s) | ✅ | — | ✅ | — | `autoHide`, opacity-animated |
| Tap-to-toggle chrome | ✅ | — | ✅ | ✅ | |
| Continuous scroll + virtualisation | ✅ | ✅ | ✅ | — | Text mode holds ~3–5 pages in memory. **The engine must match this**, not regress to full-document rendering |
| Page / chapter navigation | ✅ | ✅ | ✅ | ✅ | `ChapterSheet` is shared |
| Progress persistence | ✅ | ✅ | ✅ | ✅ | `reading_sessions`, `books.last_read_page` |
| In-reader search | ✅ | — | ✅ | ✅ | `InReaderSearchHeader`, backed by `pages` fulltext (0012) |
| Highlights — create, list, delete | ✅ | — | ✅ | ✅ | `lib/highlights.ts` (414 lines), `HighlightsScreen` (497) |
| Word tap → translate popover | ✅ | — | — | — | `TranslatePopover`, `ReaderScreen.tsx:2672` |
| Sentence tap → translate sheet | ✅ | — | — | — | `SentenceTranslateSheet`, `:2471` |
| **Word-level audio sync** | ❌ | ✅ | ❌ | ❌ | **Only in Listen.** `ListenScreen.tsx:640–705` |
| Paragraph dimming while listening | ❌ | ✅ | ❌ | ❌ | |
| Inline chapter images | ✅ | — | ✅ | — | `ChapterImage` with a signed-URL cache, `:1716` |
| Text ⇄ Full mode toggle | ✅ | — | ✅ | ✅ | `ModeTogglePill`, `onRequestFullMode` |
| Zoom | — | — | — | ✅ | PDF only |

### The alignment detail that constrains the engine

Audio alignment from ElevenLabs is **character-level**, stored as a JSON sidecar
(`lib/aiAudio.ts:66–85`, `audio_cache.alignment_path`). `ListenScreen.tsx:640`
maps a character index to a word by walking word start offsets.

§7.4 says "the engine resolves the current word id." For that to work, the
canonical document's word ids must be derivable from character offsets **in the
exact text the TTS was generated from**. If the canonical build re-tokenises or
re-whitespaces page text, every cached alignment sidecar silently
mis-highlights.

This is the same class of problem as the `pages.id` decision, one level down,
and it is not yet addressed in the doc.

---

## 5. Risks, ranked

| # | Risk | Why it is ranked here | Mitigation |
|---|---|---|---|
| 1 | **Credit balance migration** | Stored counters → ledger view, on live paying users. Wrong by one row and someone is over-charged or gets free AI | Dual-write, reconcile against real rows, cut over only when a full recompute matches the counter for every user |
| 2 | **pdf.js on low-end Android** | If it will not hold a 300-page PDF in 2–3 GB RAM, §7 loses a third of its scope and `react-native-pdf` stays — which means the engine is not "one engine" | M0 spike #1. Already the right first question |
| 3 | **Word-sync parity** | The engine's hardest feature ships today in the one surface the doc does not map, and depends on character-offset stability | Add `ListenScreen` to §7.5. Make offset stability an explicit constraint |
| 4 | **Entitlement migration** | `profiles.plan` gates every paid feature | Dual-read behind a flag; drop the old columns a release later |
| 5 | **Expo Router cutover** | `App.tsx` is 1,468 lines of stage machine, tab switching, audio session and global overlays, all at once. No visual change to verify against — the evidence is behaviour | Maestro before the cutover, not after. The prompt already asks for this |
| 6 | **Text-mode memory regression** | Today's reader was explicitly rebuilt to virtualise because Android "effectively never committed the new tree" with the old full-fetch model (`ReaderScreen.tsx:313–322`). A DOM engine can regress this | Make it an M0 acceptance number, not an M6 discovery |
| 7 | **Two contradictory agent instruction files** | `CLAUDE.md` says never use Expo Router; `AGENTS.md:26` says use it. Whichever an agent reads, half the migration looks like a violation | Reconcile both in M1 |
| 8 | **pnpm + EAS + Expo** | Hoisting and `node_modules` layout are a known source of EAS build failures. The repo is npm today | Confirm pnpm is deliberate, or use npm workspaces |
| 9 | **The marketing site is unversioned and shares the app's Supabase project** | `~/bookflow-site` is not a git repository — the live site has no history. It is also linked to `wqybsuhccyixpnrvmlxr`, the app's own project, and holds a 21st edge function (`contact-notify`) that this repo has never seen. One laptop directory is the only copy of a live function's source | Move it in at M1: a plain copy, since there is no history to reconcile. `contact-notify` joins `supabase/functions/` |
| 10 | **Figma drift** | Parity is maintained by hand; six rounds of it were corrected manually last round | `tokens:check-figma` in M1 is the right answer |

### Unknowns that need you, not code

- The app domain for universal links and App Links (M2).
- Sentry and PostHog keys (M1).
- Real top-up prices (F-33).
- RevenueCat Web Billing status and fees (M0 #3).
- Whether a physical budget Android phone is available for M0 #1.

---

## 6. Changes to `ARCHITECTURE.md` — all applied

All seven are in the doc as of 2026-10-22, approved by Austine.

| # | § | Change | Commit |
|---|---|---|---|
| 1 | 7.2 | Canonical document **preserves `pages.id`**. Seven tables of live user data reference it, one of them pgvector | `bd36983` |
| 2 | 9.1 | "Ten-table schema" corrected — 13 tables over 27 migrations, three of the five "new" tables already exist in substance | `bd36983` |
| 3 | 7.5 | **Fourth text surface added.** `ListenScreen` (1,935 lines) becomes engine text mode with audio sync active, per §7.4's existing rule that the engine owns word painting. Its chrome stays native, same as the reader's | this branch |
| 4 | 7.4 | **Character offsets are preserved.** Alignment is character-level; the canonical document must address the exact text the narration was generated from, or every cached narration mis-highlights silently | this branch |
| 5 | 9.2 | Credit-gauge claim corrected. Transactional check-and-debit **already ships** via `record_ai_usage`; only the stored-counter → ledger-view change is real. What hides the gauge is now an open item | this branch |
| 6 | 8 | **`clipboard` adapter added** — `expo-clipboard` → `navigator.clipboard`. Four call sites, more than any other native-only package | this branch |
| 7 | 12, M1 | **Agent-instruction consistency** is now a quality concern and an M1 deliverable. `CLAUDE.md` and `AGENTS.md` contradict each other and the target | this branch |

### What #3 settles

The proposal offered two readings — `ListenScreen` becomes an engine mode, or
the doc says it stays native and engine word sync is new work. §7.4 already
specifies that the engine resolves the word id and paints the highlight, so the
first reading is the one consistent with the rest of the document, and that is
what was written.

The consequence is recorded in §7.5: **word sync and paragraph dimming ship
today only in `ListenScreen`**, so M6's parity bar for them is that screen, and
bringing them to the text, EPUB and PDF modes is new work rather than a port.
The text reader's virtualisation runs the other way — it is a parity
requirement the engine must meet.

### A sequencing question, not a change

M2 moves every screen into routes; M3 then moves every screen file into
`features/`. That is two passes over the same 33,203 lines. Doing M3's moves
first — pure file moves, no behaviour change, trivially verifiable — and then
routing the result might be lower risk. It would also mean the stage machine
survives one milestone longer, which is a cost. Worth a decision before M2.
