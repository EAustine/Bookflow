# Architecture migration log

Running record of decisions, progress and open questions, so any session can
resume cold. Newest entries at the bottom of each section.

Target: `docs/ARCHITECTURE.md` · Distance to it: `docs/ARCHITECTURE_GAPS.md`

---

## Where we are

| | |
|---|---|
| **Current step** | **M3 merged to `main` 2026-10-28** (fast-forward, 26 commits). Offline queue, the eight-feature decomposition, PDF page fidelity, `pageDisplay`, and the page-fidelity test are in |
| **Branch** | None in flight. `main` at `41c0add`, **26 commits ahead of `origin/main` — not pushed** |
| **`main`** | Carries M1, M2 and M3. tsc 0, eslint 0, deno check clean, 68 tests |
| **Next** | TanStack Query conversion (M3's remaining scope), the 7 routes deferred from M2, and the reader items under "Known, carried past the merge" below |

---

## Decisions

| Date | Decision | Who | Why |
|---|---|---|---|
| 2026-10-22 | `ui-cleanup` fast-forwarded to `main`, carrying `v11-batch`'s 32 commits with the cleanup round's 46 | Austine | Unblocks the migration gate. Both rounds reviewed together rather than separately |
| 2026-10-22 | **The canonical document preserves `pages.id`** | Austine | Seven tables of live user data reference it — `highlights`, `translations`, `practice_questions`, `summaries`, `reading_sessions`, `audio_cache`, `chunk_embeddings`. One is pgvector. New ids would mean a seven-table remap plus re-embedding every book. Now a constraint in §7.2 |
| 2026-10-22 | `ARCHITECTURE.md` adopted into the repo as `docs/ARCHITECTURE.md` | — | With two amendments; see commit `bd36983` |
| 2026-10-22 | **All seven Phase 0 amendments applied** to `ARCHITECTURE.md` | Austine | §7.2 `pages.id`, §7.4 character offsets, §7.5 fourth text surface, §8 clipboard adapter, §9.1 schema size, §9.2 metering already ships, §12/M1 agent-instruction consistency |
| 2026-10-22 | **`jobs` table, not Supabase Queues (pgmq)** | M0 spike 4 | pgmq has no worker, so it saves none of the scheduling work; §9.1 needs `jobs` for progress regardless, and queue messages are opaque. Choosing pgmq means running both |
| 2026-10-22 | **pdf.js is out of the engine; `react-native-pdf` stays permanently** | M0 spike 1 | 42/60 long frames on reading scroll, 3.1 s worst stall, 1,022 MB peak on a 2,473 MB device — measured in the same Chromium build as the device's WebView. The emulator flatters pdf.js, so a failure is binding. §7.6 |
| 2026-10-22 | M0's reader spike runs on an **emulator**, no physical device | Austine | None available. Recorded with its consequence in §13.1: the emulator runs arm64 natively on Apple Silicon, so it over-states CPU performance and cannot throttle. A failure there is conclusive; a pass is not. `react-native-pdf` stays until a real device confirms |
| 2026-10-22 | **npm workspaces**, not pnpm | Austine | Expo supports both and recommends neither. pnpm's isolated installs are exactly what React Native makes you disable (`nodeLinker: hoisted`), leaving pnpm configured to act like npm with an extra config file, a lockfile migration and a new EAS surface to debug. The repo is already npm |
| 2026-10-22 | **RevenueCat Billing** is the web engine, not Stripe Billing or Paddle | — | Stripe Billing adds 0.7% of volume on top of the same transaction fee, and Paddle's merchant-of-record service is not worth paying for unsurveyed. Revisit if VAT handling becomes the binding constraint |
| 2026-10-22 | Marketing site located at `~/bookflow-site`; `contact-notify` moves into `supabase/functions/` with it at M1 | Austine | It is unversioned and shares the app's Supabase project, so consolidating it ends a split-brain link and puts a live edge function under version control for the first time |
| 2026-10-22 | `ListenScreen` becomes **engine text mode with audio sync active**, not a separate mode or a native holdout | Austine | §7.4 already gives the engine word painting, so this is the reading consistent with the rest of the doc. Consequence: word sync's parity bar is `ListenScreen`, and bringing it to the other three modes is new work |

---

## Progress

### M3 — features and data · ✅ merged to `main` 2026-10-28

Merged at Austine's call with these reader issues open and understood,
not forgotten:

**Known, carried past the merge**

- **A search jump does not land on the exact page it names.** It leaves
  the saved position and lands in the right region; a "page 20" hit put
  the reader near page 5. Row heights vary and there is no
  `getItemLayout`, so the saved-page restore converges on an averaged
  guess rather than an exact offset.
- **Exact jumps and vertical nested scrolling pull against each other.**
  Precise jumps want fixed row heights; fixed row heights want a
  per-page scroller; a vertical per-page scroller fights the vertical
  list it sits in — measured as the tail of one page frozen at the top
  of the screen while the next scrolled underneath, on 2 of 9
  reading-sized swipes. Horizontal paging is the one arrangement where
  all three hold; it was built, tried and reverted because it changes
  how a page is turned. That is a product decision, still open.
- **No sticky page indicator.** It was built and removed for naming
  pages that were not on screen. It becomes feasible the moment page
  offsets are exact.
- **Go to page** exists as tested logic in `@bookflow/shared`
  (`resolvePageQuery`) with no UI; its first home was wrong and it was
  pulled rather than left somewhere arbitrary.
- **EPUB Full↔Text keeps its place only approximately** — scroll
  fraction, so an image-heavy book can be a page or two out.

**What the freeze taught**, worth keeping because it cost most of a
day: whole-frame screenshot hashes prove that *something* changed, not
that the page moved as one. They passed while the screen showed two
pages with the top one frozen. Comparing a top strip against a bottom
strip per frame found it in one run, and a screen recording from
Austine found it before either.

### M3 — features and data · original scope

`src/screens` is gone; eight features own their own screens and api. The
offline write queue is in `packages/shared` with 22 tests, wired through the
write call sites, draining on reconnect and foreground.

**2026-10-28 — the decomposition shipped a crash, and running the app found
it in seconds.** The move script repointed every intra-feature import at the
feature's own barrel (`../index`), which re-exports those same files. A cycle
resolves to `undefined` on one side at module-eval time, and the app died on
launch:

    FATAL EXCEPTION: mqt_v_native
    TypeError: Cannot read property 'map' of undefined  (metroRequire)

59 imports, 29 files, all 8 features. **tsc, the bundler and the test suite
were all green** — types resolve through a cycle, so nothing in CI could see
it. It surfaced the first time anything executed the app since the M2
cutover, which is the real lesson: this branch had been verified by reading
and typechecking, never by running.

The script was not the root cause on its own. `eslint.config.js` restricted
`../*/!(index)`, which from `features/<name>/screens/` also matches
`../api/<file>` — a *same-feature* import. The rule meant to stop a feature
reaching into another feature and instead pushed intra-feature imports onto
the barrel; the script implemented the rule as written. Both are fixed, and
`import/no-cycle` now guards relative edges — verified by reintroducing a
cycle and watching both rules fire. It immediately found a second,
pre-existing cycle (`aiAudio` ↔ `audioDownloads`) that is genuinely safe and
is now annotated rather than silently tolerated.

**2026-10-28 — a second M1 regression, found the same way.** With the crash
fixed, the app launched but sign-in failed with "Couldn't reach our servers".
Not the network: `.env` has lived at the repo root since June, and Expo reads
it from the *project* root, which M1 moved to `apps/app/`. Every
`EXPO_PUBLIC_*` var had been undefined in local builds since then, so the app
fell back to `https://invalid.bookflow.local`. The app logs this loudly at
startup; nobody had read the log because nobody had run the app. Fixed with
`apps/app/.env -> ../../.env` (both paths gitignored) and documented in
`.env.example`. EAS builds were never affected — they use `eas env`.

Worth noting what did *not* find either bug: tsc, the bundler, the test suite,
and a static grep of the built bundle, which gave a false negative on Hermes
bytecode. Both were found by running the app and reading logcat.

The same commit also corrected a §4 layering mistake from the decomposition:
`bookCovers.ts` was moved into `features/library/api/`, but `ui/
RecentListenRow` renders covers too and ui must not import a feature. It is
signed-URL infrastructure over Supabase Storage, so it now lives in `core/`.
That had been an ESLint error on the branch since `9bdf6ee`, meaning **lint
was red and reported green** — corrected here.

### Production deploy · 2026-10-28

Austine approved a full catch-up after the PDF page-fidelity work turned
out not to be live at all.

**Why text mode still looked word-sliced after a re-process:** `process-book`
on production was version 29, deployed **2026-05-28** — five months before the
fix was written. Migrations `0026`–`0029` were all unapplied. The code was
correct and simply had never shipped. Nothing in the repo surfaces this; the
only way to see it is to ask the project what is actually deployed.

Applied `0026`→`0029` and deployed `process-book` (v29→30), `generate-summary`
(14→15), `chat-message` (11→12) and `discover-doab` (7→8). Verified: all four
migrations now report local **and** remote; the deployed DOAB function answers
200 with 24 usable books in 0.9 s.

Two things the push exposed:

- **The schema had drifted from the ledger.** `0026` reported *"column
  ai_credits_balance_total already exists, skipping"* — production already
  had those columns without the migration being recorded, so someone had
  applied them by hand. The `if not exists` guards absorbed it.
- **`public.chapters` really was free to create.** `0010` did
  `alter table public.chapters rename to pages`, so the 0001-era table had
  not existed under that name since. Confirmed from the push output itself:
  `create table if not exists` emits a *"relation already exists, skipping"*
  notice when it skips, and none appeared for `chapters` — unlike 0026's
  columns, which did. 0010 also renamed the dependent FK columns
  (`chapter_id` → `page_id`), so the new `chapters` table collides with
  nothing.

**17 edge functions remain stale**, in two groups that matter:

| Commit | Functions | What is undeployed |
|---|---|---|
| `7a117d1` | 13 | The `deno check` fixes — 22 real type errors, including the PostgREST embedded-array bug that silently dropped the chapter name from every AI page marker |
| `ea34369` | 4 | The whole credits / metering feature — `generate-audio`, `generate-practice`, `generate-translation`, `revenuecat-webhook` — while its migrations `0026`/`0027` are now applied |

The DB side of `0026`/`0027` is self-contained (the RPCs keep their
signatures, so June-era callers get the new behaviour), so this is drift
rather than breakage. It still wants closing.

### M2 — routing · ✅ merged to `main`

Expo Router is the entry point; the `stage` machine no longer drives
navigation. Auth, onboarding and the four tabs are routes. 8 of 15 drill-ins
landed; **7 deferred to M3** because each needs fetch-by-id, which is what M3
builds — doing them now meant building them twice.

**The duplication finding is resolved.** Reading display, default voice and
translation language are one canonical route each instead of existing twice
with a copy of the state in each parent. The migration was additive:
`YouScreen` already had optional handler props falling back to internal `view`
state and `SettingsScreen` gained the same, so the fallbacks go dead rather
than being deleted — the cheapest revert while nothing can be verified.

`(tabs)/_layout.tsx` is deliberately not `<Tabs>`: the shell owns the audio
session and mini player and must stay mounted across tab changes, which
`<Tabs>` would prevent by putting each screen in its own navigator subtree.
The shell itself moved out of `App.tsx` unmodified, and stays router-free so
it remains a reviewable move of code that cannot be run here.

**Evidence: 4 of 5 auth screens pixel-identical**, the fifth off by 3 pixels
the same build reproduces against itself — the caret, same signature as M1.
Two emulator artifacts first reported it as a 7.5% regression: the IME toolbar
returns after an app reinstall, and an Android clipboard popup rendered text
from the working session into a screenshot.

**Two latent crashes found and fixed**, both from the cutover dropping
providers `App.tsx` had mounted: `BooksProvider` (every signed-in launch would
have crashed on `useBooks`) and `ToastHost` (toasts silently gone). Neither is
visible to the type checker; neither is reachable without an account. They are
the clearest measure of what the missing test account costs — two bugs in
roughly twenty routes of unverifiable work.

**F-46.** Two components are named `SendFeedbackScreen`. The standalone
380-line compose form is imported by nothing; the app ships the
`YouDrillScreens` version, which hands off to the user's mail app. A new route
picked the dead one by name and only a missing required prop caught it.

**Blocked for sign-off:** the Maestro flow the brief asks for needs the test
account, and iOS Universal Link verification needs a physical device (§13.1).
The Apple Team ID and Play signing fingerprint are also outstanding —
`docs/M2_DEEP_LINKS.md`.

### M1 — foundation · ✅ 2026-10-22 (merged)

npm workspaces: `apps/app`, `apps/site`, `packages/tokens`, `packages/shared`.
124 files moved as detected renames. Supabase and docs stay at the root.

`packages/tokens` holds `tokens.ts` byte for byte, adds the breakpoints §3 and
§11 called for, and generates `tokens.css` — 163 custom properties.
`apps/app/src/design/tokens.ts` re-exports it, so the 59 modules importing
`~/design/tokens` never changed.

`packages/shared` holds the generated DB types plus three functions that were
private to screens and therefore untestable. 14 Vitest tests. One pins existing
behaviour rather than fixing it: `formatCredits(1500)` is `"2K"`, overstating a
balance by 500 credits — a product decision, left alone.

ESLint turns §4's boundaries from prose into enforcement. Rule 4 is a warning,
not an error: 19 call sites violate it and M4 is where they move. CI runs
typecheck, lint, tests, token drift and a native bundle; it deliberately does
not build web until M4's adapters exist.

The marketing site moved in from `~/bookflow-site`, and its `contact-notify`
edge function joined the other twenty.

**Evidence: all five reachable screens pixel-identical.** 5.5M pixels, 0
differing, release builds both sides. `docs/evidence/m1/README.md` records the
method — in particular that the noise floor was measured before the result was
believed, which is what exposed a 165-pixel "regression" as a blinking caret.

Two things bit on the way and are worth remembering. Packages emit **CommonJS**,
not ESM: tsc emits relative specifiers verbatim, so ESM needed `'./format.js'`
in source and Metro then looked for a literal `format.js` that does not exist.
And the package tsconfigs do **not** extend `expo/tsconfig.base` — it sets
`customConditions`, which is incompatible with CommonJS resolution.

**Deferred: Sentry and PostHog.** Austine's call, 2026-10-22 — the keys were
not to hand and nothing else in M1 depended on them. Still M1 scope, not
dropped scope. They belong before M2 ships: replacing the navigation layer
without crash reporting is the worst moment to be blind. Open question 4.

### M0 — spikes · ✅ complete

**Spike 1, reader engine · ✅ 2026-10-22 · `docs/spikes/m0-1-reader-engine.md`**

Built `bookflow_lowend` (2 cores, 2,473 MB, 720×1600) and measured a DOM engine
against real books in Chrome 124.0.6367.219 — the same build as the device's
system WebView, which is what makes the numbers transferable.

Text mode: 1,806 ms first paint, **5 long frames in 60** on reading scroll.
`content-visibility` alone carries 351 pages, so the engine does not need its
own virtualisation. EPUB similar.

pdf.js: **42 long frames in 60**, 3.1 s worst stall, 1,022 MB peak. No-go.
`react-native-pdf` stays and §7 loses a mode.

Word sync p50 37.8 ms but p95 313 ms under memory pressure, missing the 250 ms
budget — caused by building all 130,161 word spans up front. Lazy per-page
spans for M6.

Five method bugs are recorded in §5 of the write-up with the wrong numbers they
each produced first, including a 3,232 MB reading on a 2,473 MB device.

**Spike 2, web boot · ✅ 2026-10-22 · `docs/spikes/m0-2-web-boot.md`**

The app boots on web. Welcome screen renders, zero console errors, **no app
code changed** — both blockers were configuration or dependency.

Ten native-only packages need stubs (the §8 adapter list, plus `expo-clipboard`
which §8 lacked until Phase 0). The second blocker is the `import.meta` one the
brief predicted, and it is nastier than expected: **bundling succeeds** and the
failure is at runtime, because Expo serves the web bundle as a classic script.
Green CI, blank app. Traced to one occurrence in 8.5 MB — Zustand's `devtools`
middleware, which we never use but which rides in on the `zustand/middleware`
barrel. Fixed with a web-only Babel rewrite of `import.meta` rather than by
chasing the import, so the next dependency cannot re-break it the same way.

Two things for later: M4's CI must **load** the page, not just build it, or
this class of failure ships silently. And 8.5 MB is too big for Ama — mostly
fonts bundled at every weight including unused italics.

**Spike 4, job queue · ✅ 2026-10-22 · `docs/spikes/m0-4-job-queue.md`**

**`jobs` table, not Supabase Queues.** pgmq has no worker and no scheduler, so
adopting it still needs `pg_cron` + `pg_net` + a consumer function — it saves
none of the work that does not exist today. Meanwhile §9.1 already requires
`jobs` for the progress the Library reads, and a queue message is opaque, so
choosing pgmq means running both and keeping them consistent. Retry policy
becomes three columns rather than a gap pgmq leaves open. Research only, no
prototype.

**Spike 3, RevenueCat Web · ◑ PARTIAL 2026-10-22 · `docs/spikes/m0-3-revenuecat-web.md`**

Status and fees answered (§10.1). The sandbox purchase is blocked on RevenueCat
dashboard access and Stripe test keys — **do not hand those over to be used
here**; it is a purchase flow against a real account, so run the plan in §3 of
the write-up yourself.

What was possible without credentials mattered more than expected: **the
identity precondition §10 rests on is already implemented**, and verifiable
from code. `auth.ts:367` calls `Purchases.logIn(session.user.id)` on sign-in and
session restore; the webhook maps `event.app_user_id` straight to `profiles.id`.
The webhook also already handles top-ups via the `grant_credits` RPC, which §9.2
does not credit it with. So the sandbox test would confirm the model rather than
discover it, and it is not on M0's critical path — nothing in M1–M4 depends on
it and web purchases ship at M8.

Three risks found while reading: the `configure()` → `logIn()` window is
unenforced ordering rather than guaranteed; web has no equivalent auth sync yet
(M4's `billing` adapter); and `profiles.plan` is the de facto source of truth
only because there is currently one writer.

### Phase 0 — gap analysis · ✅ 2026-10-22

Wrote `docs/ARCHITECTURE_GAPS.md`. Everything in it measured from the tree at
`cfa7f3e`, not carried over from existing docs.

Three findings that move work between milestones:

1. **M5 shrinks and gets riskier.** Three of §9.1's five "new" tables already
   exist in substance — `audio_cache` is `narration_segments`,
   `ai_usage_events` + `credit_grants` are `credit_ledger`, and
   `profiles.plan` + a live `revenuecat-webhook` are `entitlements`. What is
   left is a reshape of live paying users' data. §9.2's transactional
   check-and-debit already ships via the `record_ai_usage` RPC.
2. **M6 has a fourth reader.** `ListenScreen.tsx` (1,935 lines) renders
   word-synced text and is the only place word-level sync works today. §7.5
   maps three surfaces and misses it. 7,852 lines of text rendering in total.
3. **`CLAUDE.md` and `AGENTS.md` contradict each other** on routing and data,
   and both document `npx jest` when no test runner is installed.

Corrections made to the doc on the way in: the schema is 13 tables over 27
migrations, not ten.

---

## Open questions

### Needs Austine

| # | Question | Blocks |
|---|---|---|
| 1 | ~~Approve the gap analysis and the proposed `ARCHITECTURE.md` changes~~ — **done 2026-10-22**, all seven applied | ✅ |
| 2 | ~~Where does the marketing site live?~~ — **answered 2026-10-22**: `~/bookflow-site`. Not a git repo, pure static, own Vercel project, and it shares the app's Supabase project plus a 21st edge function. See `ARCHITECTURE_GAPS.md` risk 9 | ✅ |
| 3 | ~~Is pnpm deliberate?~~ — **decided 2026-10-22: npm workspaces**, §4 of the architecture doc | ✅ |
| 4 | **Sentry and PostHog keys.** Deferred from M1 by Austine on 2026-10-22, not dropped. Worth closing before M2 lands: replacing the navigation layer without crash reporting is the worst moment to be blind | before M2 ships |
| 5 | App domain for universal links and App Links | M2 |
| 6 | ~~Is a physical budget Android phone available?~~ — **no, decided 2026-10-22**: emulator only. See §13.1 — this makes M0's pdf.js verdict provisional, not binding | ✅ |
| 7 | Should M3's file moves come *before* M2's routing, to avoid two passes over 33,203 lines? | M2 |
| 8 | ~~RevenueCat Web Billing: GA or beta, and current fees~~ — **confirmed 2026-10-22**, §10.1 of the architecture doc. Neither label is used; fees are 1% RevenueCat + Stripe 2.9%+30¢ | ✅ |
| 9 | Real top-up prices (F-33, carried over from the Figma round) | M5 |

### Needs investigation

| # | Question | When |
|---|---|---|
| 10 | What actually hides the credit gauge? Not metering — that is already server-side and transactional. §9.2 now says so, and this is an open item in §14 | before M5 |
| 11 | ~~Does the canonical document preserve character offsets?~~ — **settled**: §7.4 now requires it. Still needs *proving* in the M0 canonical-document spike | M0 |
| 12 | `listen_sessions.chapter_id` is a leftover from `0010_chapters_to_pages.sql`. Reconcile or drop while the schema is open | M5 |
| 15 | **F-46 — two components named `SendFeedbackScreen`.** The standalone 380-line form is dead; the app ships the mail hand-off. Delete the dead one, or wire it and delete the stub | M3 |
| 13 | **Can Ghanaian customers actually pay?** Web Billing is Stripe-only, card-only, and its purchase links cannot be localised. The persona the web app most helps is the one least served by that checkout. Needs a direct answer from RevenueCat or Stripe | before M8 |
| ~~14~~ | ~~Real-device confirmation for pdf.js~~ — **closed by the result, 2026-10-22.** The spike failed, and a failure on flattering hardware is conclusive. Successor: confirm **text/EPUB** on a real device before M6 ships, since a *pass* is the case needing confirmation | before M6 |

---

## Carried over from the Figma round

Still open, recorded in `docs/figma/FIGMA_BUILD_LOG.md`:

- **F-27** — free-book cap jumps to the hosted paywall with no button state. Tied to F-35.
- **F-33** — top-up prices are placeholders in Figma.
- **F-35** — no in-repo upgrade UI. Answered in part by §10, but native stays hosted.
- **F-38** — EPUB WebView renders fallback fonts. **§7.1 retires this** by bundling the brand fonts in the engine. Closes at M6.
- **F-39** — Discover total-failure state while 748 books loaded. Needs a repro.
- **F-22** — cosmetic Figma-only opacity quirk.

`docs/RELEASE_QA_CHECKLIST.md` (67 checks) still has to be run on a physical
Android device before anything ships, and roughly a third of it needs a
signed-in test account that does not exist yet.
