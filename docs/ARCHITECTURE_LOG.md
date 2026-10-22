# Architecture migration log

Running record of decisions, progress and open questions, so any session can
resume cold. Newest entries at the bottom of each section.

Target: `docs/ARCHITECTURE.md` · Distance to it: `docs/ARCHITECTURE_GAPS.md`

---

## Where we are

| | |
|---|---|
| **Current step** | Phase 0 complete. Awaiting approval of the gap analysis before M0 |
| **Branch** | `arch/phase0-gaps` (docs only, no code changes) |
| **`main`** | `cfa7f3e`, 85 commits ahead of `origin/main` — **not pushed** |
| **Next** | M0 spikes, on `arch/m0-spikes`. Throwaway code; nothing merges to `main` |

---

## Decisions

| Date | Decision | Who | Why |
|---|---|---|---|
| 2026-10-22 | `ui-cleanup` fast-forwarded to `main`, carrying `v11-batch`'s 32 commits with the cleanup round's 46 | Austine | Unblocks the migration gate. Both rounds reviewed together rather than separately |
| 2026-10-22 | **The canonical document preserves `pages.id`** | Austine | Seven tables of live user data reference it — `highlights`, `translations`, `practice_questions`, `summaries`, `reading_sessions`, `audio_cache`, `chunk_embeddings`. One is pgvector. New ids would mean a seven-table remap plus re-embedding every book. Now a constraint in §7.2 |
| 2026-10-22 | `ARCHITECTURE.md` adopted into the repo as `docs/ARCHITECTURE.md` | — | With two amendments; see commit `bd36983` |

---

## Progress

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
| 1 | Approve the gap analysis and the five proposed `ARCHITECTURE.md` changes (§6 of the gaps doc) | M0 |
| 2 | Where does `bookflow_landing_site` live? It is not beside the repo | M1 |
| 3 | Is pnpm deliberate? The repo is npm today, and pnpm + EAS + Expo has known hoisting problems. npm workspaces would do the same job | M1 |
| 4 | Sentry and PostHog keys | M1 |
| 5 | App domain for universal links and App Links | M2 |
| 6 | Is a physical budget Android phone available for the M0 reader spike? | M0 |
| 7 | Should M3's file moves come *before* M2's routing, to avoid two passes over 33,203 lines? | M2 |
| 8 | RevenueCat Web Billing: GA or beta, and current fees | M0 |
| 9 | Real top-up prices (F-33, carried over from the Figma round) | M5 |

### Needs investigation

| # | Question | When |
|---|---|---|
| 10 | What actually hides the credit gauge? Not metering — that is already server-side and transactional, so §9.2's claim is wrong | before M5 |
| 11 | Does the canonical document preserve the **character offsets** that cached alignment sidecars address? Same class of problem as `pages.id`, one level down | M0 |
| 12 | `listen_sessions.chapter_id` is a leftover from `0010_chapters_to_pages.sql`. Reconcile or drop while the schema is open | M5 |

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
