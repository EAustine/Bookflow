# Architecture migration log

Running record of decisions, progress and open questions, so any session can
resume cold. Newest entries at the bottom of each section.

Target: `docs/ARCHITECTURE.md` · Distance to it: `docs/ARCHITECTURE_GAPS.md`

---

## Where we are

| | |
|---|---|
| **Current step** | **M0 in progress** on `arch/m0-spikes`. Spike 1 done (pdf.js no-go, §7.6). Spikes 2 and 4 next; spike 3 blocked on RevenueCat/Stripe access |
| **Branch** | Phase 0 merged to `main` via [#2](https://github.com/EAustine/Bookflow/pull/2), rebased. Nothing in flight |
| **`main`** | `28250be`, pushed. Carries `v11-batch`, the UI cleanup round, and Phase 0 |
| **Next** | M0 spikes, on `arch/m0-spikes`. Throwaway code; nothing merges to `main` |

---

## Decisions

| Date | Decision | Who | Why |
|---|---|---|---|
| 2026-10-22 | `ui-cleanup` fast-forwarded to `main`, carrying `v11-batch`'s 32 commits with the cleanup round's 46 | Austine | Unblocks the migration gate. Both rounds reviewed together rather than separately |
| 2026-10-22 | **The canonical document preserves `pages.id`** | Austine | Seven tables of live user data reference it — `highlights`, `translations`, `practice_questions`, `summaries`, `reading_sessions`, `audio_cache`, `chunk_embeddings`. One is pgvector. New ids would mean a seven-table remap plus re-embedding every book. Now a constraint in §7.2 |
| 2026-10-22 | `ARCHITECTURE.md` adopted into the repo as `docs/ARCHITECTURE.md` | — | With two amendments; see commit `bd36983` |
| 2026-10-22 | **All seven Phase 0 amendments applied** to `ARCHITECTURE.md` | Austine | §7.2 `pages.id`, §7.4 character offsets, §7.5 fourth text surface, §8 clipboard adapter, §9.1 schema size, §9.2 metering already ships, §12/M1 agent-instruction consistency |
| 2026-10-22 | **pdf.js is out of the engine; `react-native-pdf` stays permanently** | M0 spike 1 | 42/60 long frames on reading scroll, 3.1 s worst stall, 1,022 MB peak on a 2,473 MB device — measured in the same Chromium build as the device's WebView. The emulator flatters pdf.js, so a failure is binding. §7.6 |
| 2026-10-22 | M0's reader spike runs on an **emulator**, no physical device | Austine | None available. Recorded with its consequence in §13.1: the emulator runs arm64 natively on Apple Silicon, so it over-states CPU performance and cannot throttle. A failure there is conclusive; a pass is not. `react-native-pdf` stays until a real device confirms |
| 2026-10-22 | **npm workspaces**, not pnpm | Austine | Expo supports both and recommends neither. pnpm's isolated installs are exactly what React Native makes you disable (`nodeLinker: hoisted`), leaving pnpm configured to act like npm with an extra config file, a lockfile migration and a new EAS surface to debug. The repo is already npm |
| 2026-10-22 | **RevenueCat Billing** is the web engine, not Stripe Billing or Paddle | — | Stripe Billing adds 0.7% of volume on top of the same transaction fee, and Paddle's merchant-of-record service is not worth paying for unsurveyed. Revisit if VAT handling becomes the binding constraint |
| 2026-10-22 | Marketing site located at `~/bookflow-site`; `contact-notify` moves into `supabase/functions/` with it at M1 | Austine | It is unversioned and shares the app's Supabase project, so consolidating it ends a split-brain link and puts a live edge function under version control for the first time |
| 2026-10-22 | `ListenScreen` becomes **engine text mode with audio sync active**, not a separate mode or a native holdout | Austine | §7.4 already gives the engine word painting, so this is the reading consistent with the rest of the doc. Consequence: word sync's parity bar is `ListenScreen`, and bringing it to the other three modes is new work |

---

## Progress

### M0 — spikes · in progress

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

**Spikes 2 and 4** next. **Spike 3** needs RevenueCat dashboard access and
Stripe test keys.

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
| 4 | Sentry and PostHog keys | M1 |
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
