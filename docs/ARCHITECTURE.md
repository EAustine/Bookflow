# Bookflow architecture

Status: approved direction, 2026-10-22. Owner: Austine.
This document is the target. `docs/ARCHITECTURE_GAPS.md` tracks the distance between it and the current code.

**Amended 2026-10-22** after Phase 0 measured the doc against the tree. Seven
changes, all approved: the `pages.id` constraint (§7.2), the character-offset
constraint (§7.4), the fourth text surface (§7.5), the clipboard adapter (§8),
the corrected schema size (§9.1), the corrected metering claim (§9.2), and
agent-instruction consistency (§12, M1). Nothing was changed without evidence
from the code; the evidence is in `ARCHITECTURE_GAPS.md`.

---

## 1. Decisions

| Decision | Answer |
|---|---|
| Surfaces | Phone (iOS, Android), tablet (iPad, Android tablets), web app in the browser |
| Web scope | **Full parity**: upload, read, listen, AI tools, account, billing |
| Codebase | **One Expo app** serves all three surfaces. The marketing site stays a separate static site |
| Reader | **One unified reading engine** (HTML/CSS/TS) used on every platform |
| Web purchases | **Yes.** People can subscribe and buy top-ups on web |
| Migration | **Incremental** inside the current repo. The live app stays shippable after every milestone |

## 2. Principles

1. **Screens are shared; shells adapt.** A screen never knows whether it is on a phone, a tablet or a desktop browser. Layout shells and presenters decide that.
2. **Platform differences live only in adapters.** Shared code never imports a native-only or web-only package.
3. **The server owns money, limits and long work.** Entitlements, credits and processing jobs are decided in Supabase, never on the device.
4. **One source per fact.** Tokens come from one package. Entitlements come from one table. The reader is one engine.
5. **Every milestone ships.** No long-lived rewrite branch. New pieces land behind flags and replace old ones only after parity is proven on device.

## 3. Surfaces and breakpoints

| Class | Width | Shell | Navigation | Transient UI |
|---|---|---|---|---|
| Compact | < 600 | Phone | Bottom tab bar | Bottom sheets |
| Medium | 600 to 1023 | Tablet | Side rail | Popovers and side panels |
| Expanded | ≥ 1024 | Desktop / large tablet | Side rail (expanded labels) | Popovers and side panels, multi-column |

- Breakpoints are tokens (`tokens.breakpoints`), read through one `useLayoutClass()` hook.
- Width decides the class, not the device. An iPad in split view can be Compact; a desktop browser window can be Medium.
- Tablet rules already established carry over: master-detail for browse surfaces, reading measure capped at ~680px, portrait collapses side panels into slide-overs.
- Platform differences (safe areas, system back, keyboard shortcuts on web) are handled only at the edges.

## 4. Repository layout

**npm workspaces.** Supabase stays at the root.

Decided 2026-10-22, having checked Expo's own guidance. Expo supports Bun, npm,
pnpm and Yarn equally and recommends none of them, so this is a judgement call
rather than a constraint. npm wins on one argument that is not familiarity:

**pnpm's main benefit is the thing React Native makes you turn off.** pnpm
defaults to isolated installs; Expo's docs say "not all packages work with
isolated dependencies, and some React Native libraries may cause build or
resolution errors", and the fix is `nodeLinker: hoisted` in
`pnpm-workspace.yaml`. Set that and you have pnpm configured to behave like
npm — with an extra config file, a lockfile migration and a new EAS surface to
debug, for no remaining advantage. At two apps and three packages the disk and
install-time savings are not worth a solo founder's debugging time.

npm's own caveat stands and is accepted: hoisting can hide dependency problems
and break hardcoded native paths. That is already true of this repo as a single
package, so the monorepo does not add the risk.

SDK 55 turns on `expo.experiments.autolinkingModuleResolution` automatically in
monorepos, which removes a historic source of monorepo pain for every package
manager. Since SDK 52, `expo/metro-config` configures Metro for workspaces on
its own — `watchFolders`, `resolver.nodeModulesPath`, `resolver.extraNodeModules`
and `resolver.disableHierarchicalLookup` must **not** be hand-set.

Two rules that bite regardless of manager: duplicate React Native versions are
unsupported, and duplicate React versions cause runtime errors. `npm why` is
the check.

**On the marketing site.** It lives at `~/bookflow-site`: 27 files, 1 MB, pure
static HTML/CSS/JS with no build step, deployed as its own Vercel project. Two
things about it shape M1 more than the move itself does:

- **It is not a git repository.** The live marketing site has no version
  history at all. Moving it in is therefore trivial — a copy, with no subtree
  merge or history reconciliation — and it is also the fix for a real problem,
  not just tidying.
- **It shares the app's Supabase project** (`wqybsuhccyixpnrvmlxr`) and carries
  a 21st edge function, `contact-notify`, that this repo has never seen. Two
  checkouts linked to one project, one of them holding a function the other
  cannot deploy. `contact-notify` moves into `supabase/functions/` with the
  rest.

`vercel.json` carries `cleanUrls`, three security headers and immutable
caching for `/fonts` and `/images`. That config has to survive the move, and
the existing Vercel project should be re-pointed rather than replaced.

```
bookflow/
  apps/
    app/                    Expo app: iOS, Android, web
    site/                   Marketing site (static), moved in from ~/bookflow-site
  packages/
    tokens/                 Design tokens source → RN theme, CSS variables, Figma sync check
    reader-engine/          Unified reader: TS + DOM, built to a self-contained bundle
    shared/                 Types and pure logic shared by app, engine and edge functions
  supabase/
    migrations/
    functions/
  docs/
```

### Inside `apps/app/src`

```
app/                        Expo Router routes (file-based)
  (auth)/                   welcome, sign-in, sign-up, callback
  (onboarding)/             intent, first-book
  (tabs)/                   library, listen, discover, you
  book/[id].tsx             book detail
  read/[bookId].tsx         reader host
  +html.tsx                 web root document
features/
  library/  reader/  listen/  ai/  discover/  account/  billing/
    screens/  components/  hooks/  api/  store.ts
ui/                         Design-system components (Button, ListRow, Toggle, Sheet…)
layouts/                    CompactShell, MediumShell, ExpandedShell, Presenter
core/                       supabase client, query client, session, offline queue, analytics, errors, flags
platform/                   Adapters, each with .native.ts and .web.ts
```

Rules:
- A feature may import from `ui`, `core`, `platform`, `layouts` and `@bookflow/shared`. A feature never imports another feature's internals; it goes through that feature's public `index.ts`.
- `ui` never imports from `features`.
- Only `platform/*` may import native-only or web-only packages. Lint enforces this.

## 5. Navigation and auth

- **Expo Router** replaces the hand-rolled `stage` machine. Every screen has a URL. Typed routes on.
- The `(tabs)` group renders a bottom tab bar on Compact and a side rail on Medium and Expanded, from the same route definitions.
- **Presenter.** Anything that is a bottom sheet on a phone is opened through `<Presenter>`, which renders a bottom sheet on Compact and a popover or side panel on wider classes. Screens never import the sheet component directly.
- **Auth stays magic-link only.** Redirects: universal links (iOS) and App Links (Android) on the app domain for native, the plain URL on web. Supabase auth with PKCE on every platform.
- The splash/session-restore hand-off from F-37 moves into the root layout: restore decides where, the splash decides when.

## 6. Data layer

| Concern | Tool |
|---|---|
| Server state | **TanStack Query** for everything that comes from Supabase. Query keys defined per feature in `api/keys.ts` |
| Realtime | Supabase realtime events **invalidate** queries. No hand-patched state |
| Client state | **Zustand** for UI and session state: reader preferences, player state, layout state |
| Persistence | Query cache persisted. Native: MMKV. Web: IndexedDB |
| Offline writes | `core/offline-queue`: reading progress, highlights, bookmarks are queued, replayed in order, idempotent by client-generated id |
| Types | Generated from Supabase into `@bookflow/shared`. No hand-written row types |

Reading works fully offline for downloaded books on native. On web, offline is best effort (cached recently opened books); it is not a launch requirement.

## 7. Unified reader engine

The highest-consequence part of the system. One engine renders text mode, the
Listen view and EPUB full mode everywhere. **PDF full mode stays native** —
see §7.6.

> **Amended 2026-10-22 by M0 spike 1.** This section originally claimed all
> three modes. pdf.js measured 42 dropped frames in 60 during ordinary reading
> scroll on a low-end emulator, with a 3.1 s worst stall and ~1 GB peak on a
> 2.4 GB device. Write-up: `docs/spikes/m0-1-reader-engine.md`.

### 7.1 Shape

- `packages/reader-engine`: TypeScript, plain DOM, no React. Built into a single self-contained bundle (HTML + JS + CSS + fonts).
- **Native host:** `react-native-webview` loading the bundle from local assets.
- **Web host:** a same-origin `iframe` loading the same bundle, so web gets the same CSS isolation and the same bridge as native. One protocol, two hosts.
- Brand fonts (Fraunces, Literata, Geist, Lexend) ship inside the bundle. This retires F-38.
- Themes, presets and type come from CSS variables generated by `packages/tokens`.

### 7.2 Content model

At upload, a processing job converts each book into a **canonical document**: pages → blocks → sentences → words, each with a stable id, plus page images for PDF where needed. Stored in Supabase Storage, versioned.

- Text mode, search, highlights, AI page context and audio sync all address the same ids.
- **Page identity is preserved.** The canonical document's page ids **are** the
  existing `pages.id` values; blocks, sentences and words are new ids layered
  beneath them. This is a constraint, not an implementation detail: seven tables
  of live user data hang off `pages.id` — `highlights`, `translations`,
  `practice_questions`, `summaries`, `reading_sessions`, `audio_cache` and
  `chunk_embeddings`. Minting new page ids would mean a remap across all seven
  and, because `chunk_embeddings` is pgvector, re-embedding every existing book
  if chunk boundaries move. Approved 2026-10-22.

- EPUB full mode renders the original EPUB inside the engine. **PDF full mode does not** — the M0 spike ruled pdf.js out and `react-native-pdf` stays (§7.6). The canonical document is still built for PDFs, because text mode, search, AI page context and audio sync all address it; only the *full-fidelity page rendering* remains native.

### 7.3 Bridge protocol

Typed, versioned messages defined in `@bookflow/shared/reader-protocol`.

- **Host → engine:** `load`, `setTheme`, `setPreset`, `setFont`, `goTo`, `search`, `setHighlights`, `audioTime`, `setChromeVisible`
- **Engine → host:** `ready`, `pageChanged`, `progress`, `tap`, `selection`, `wordTapped`, `searchResults`, `highlightCreated`, `error`
- Every message carries `v` (protocol version). The host refuses an engine bundle with an incompatible major version.

### 7.4 Audio and sync

- **Audio always plays in the host, never inside the WebView**, so background playback, lock-screen controls and Bluetooth work on native. Native: `expo-audio`. Web: `HTMLAudioElement` + Media Session API.
- Narration is generated with word-level timing data and stored alongside the audio.
- The host sends `audioTime` to the engine; the engine resolves the current word id and paints the highlight chip (amber-500 background, forest-900 text). Tapping a word sends `wordTapped`, and the host seeks.
- **Character offsets are preserved.** Alignment from ElevenLabs is
  *character*-level, stored as a JSON sidecar referenced by
  `audio_cache.alignment_path`; resolving a word means walking word start
  offsets against the character index. The canonical document must therefore
  address the **exact text the narration was generated from** — same
  tokenisation, same whitespace. Re-tokenising or re-normalising page text
  silently mis-highlights every narration already cached, with no error to
  catch it. This is the §7.2 `pages.id` constraint one level down, and it binds
  the canonical-document build in the same way.

### 7.5 What moves where

There are **four** text-rendering surfaces today, not three, totalling 7,852
lines. The fourth is the one that matters most, because it is the only place
word-level sync currently works.

| Today | Lines | Target |
|---|---|---|
| RN text-mode reader (`ReaderScreen`) | 3,689 | Engine text mode |
| Listen screen's synced text pane (`ListenScreen`) | 1,935 | Engine text mode, with audio sync active. Per §7.4 the engine already owns word painting, so this is the same mode driven by `audioTime` rather than a separate one |
| EPUB WebView with injected CSS | 1,151 | Engine EPUB mode |
| `react-native-pdf` | 1,077 | **Stays as-is.** Ruled out of the engine by M0 spike 1 |
| Reader chrome (header, action bar, sheets) | — | **Stays native React**, in the host. The engine renders only the page |
| Listen chrome (transport, voice picker, speed) | — | **Stays native React**, same rule |

**What this means for M6's parity bar.** Word sync and paragraph dimming ship
today in `ListenScreen` and nowhere else — not in the text reader, not in EPUB,
not in PDF. So "parity" for those two features is measured against
`ListenScreen`, and bringing them to the other three modes is **new work**, not
a port. Conversely, the text reader's virtualisation (~3–5 pages resident; it
was rebuilt that way because Android would not commit the full-document tree)
is a parity requirement the engine must meet, not a nice-to-have.

### 7.6 Why PDF stays native

M0 spike 1 measured pdf.js in the real WebView build (Chrome 124.0.6367.219,
identical to the device's system WebView) on a 2-core / 2,473 MB AVD, against
two real books — 244 and 714 pages, embedded fonts and figures.

| | text mode | pdf.js, 714 pp |
|---|---|---|
| First paint | 1,806 ms | 3,942 ms |
| Long frames, **reading** scroll | **5 / 60** | **42 / 60** |
| Worst stall | 367 ms | **3,117 ms** |
| Peak browser memory | — | **1,022 MB of 2,473 MB** |

Three independent failures, any one sufficient. And §13.1 is what makes this
binding rather than provisional: the emulator runs ARM natively on Apple
Silicon with no thermal throttling, so it *flatters* pdf.js. A pass would have
proved little; a failure proves the real device is worse.

**Consequences.**

- `react-native-pdf` is not removed at M6. It is a permanent part of the
  architecture, and `reader-host` keeps a PDF path (§8).
- Web has no PDF full mode at launch. Text mode still works for PDFs, because
  the canonical document is built regardless — so a PDF is readable and
  listenable on web, just not page-faithful. That is a product decision to
  take before M8, not an engineering gap.
- The engine's scope shrinks, which makes M6 smaller and safer. Text mode was
  the strongest result in the spike: `content-visibility` alone held 351 pages
  at 5 dropped frames in 60 on two cores, so the engine does **not** need to
  reimplement the RN reader's JS virtualisation.

**Not settled:** the prototype's canvas eviction leaked — memory settled at
958 MB after scrolling away rather than returning to baseline. Fixing it might
move the memory number but cannot move the 3.1 s frame stalls, which are CPU.
Worth an hour before treating the memory figure as the final word; the verdict
does not depend on it.

## 8. Platform adapters

Each adapter is one interface in `platform/<name>/index.ts` with `.native.ts` and `.web.ts` implementations.

| Adapter | Native | Web |
|---|---|---|
| `reader-host` | `react-native-webview` for text/EPUB, **`react-native-pdf` for PDF full mode** (§7.6) | same-origin iframe; **no PDF full mode at launch** |
| `audio` | `expo-audio` (background, lock screen) | `HTMLAudioElement` + Media Session |
| `files` | `expo-document-picker` | file input + drag and drop |
| `fileCache` | `expo-file-system` | Cache API / IndexedDB |
| `secureStorage` | `expo-secure-store` | Supabase session storage |
| `billing` | `react-native-purchases` | RevenueCat Web SDK |
| `shareIntent` | `expo-share-intent` | no-op at launch |
| `notifications` | `expo-notifications` | no-op at launch |
| `haptics` | `expo-haptics` | no-op |
| `clipboard` | `expo-clipboard` | `navigator.clipboard` |

`clipboard` is the most-used native-only package in the app — four call sites,
more than any other — which is why it gets a row despite looking incidental.

## 9. Backend

Supabase remains the backend. RLS on every table. AI and TTS keys stay server-side.

### 9.1 New or reshaped tables

Mapped against the current schema in `ARCHITECTURE_GAPS.md` before any
migration is written. The live schema is **13 tables over 27 migrations**,
not the ten this section originally assumed, and three of the five tables
below already exist in substance — see the gap analysis.

| Table | Purpose |
|---|---|
| `entitlements` | One row per user: tier, source (`app_store` / `play_store` / `web`), period end, raw RevenueCat payload ref. Written only by the RevenueCat webhook |
| `credit_ledger` | Append-only: user, kind (`audio_seconds` / `ai_credits`), delta, reason, reference id, expiry. Balances are a view, never a stored counter |
| `jobs` | Processing and narration jobs: type, book, status, progress, error, attempts. The Library reads progress from here |
| `documents` | Canonical document per book: storage path, model version, page count |
| `narration_segments` | Audio file refs and word timing data per page and voice |

### 9.2 Functions and jobs

- `revenuecat-webhook` → upserts `entitlements`; grants top-up credits into `credit_ledger`. The function already exists and is live, and does **both halves** already: subscription events write `profiles.plan` and `profiles.ai_credits_limit`, and `NON_RENEWING_PURCHASE` calls the `grant_credits` RPC for top-ups. So this is a retarget onto new tables, not new behaviour. Confirmed by M0 spike 3.
- Every AI and narration function checks and debits credits **in the same transaction** as recording the request. No client-side metering. **This already ships** — `supabase/functions/_shared/aiCredits.ts` calls the `record_ai_usage` RPC, a plpgsql function that rolls the billing period, writes the usage event and debits top-up balance before monthly allowance, atomically. What changes is only where the *balance* lives: today it is stored counters on `profiles`, and it becomes a view over the ledger.
- The hidden credit gauge is **not** blocked by metering, which is already server-side. Whatever is actually hiding it has to be found before M5 commits to restoring it.
- Long work (extraction, canonical document build, narration) runs as queued jobs, not request-bound calls. Queue choice (Supabase Queues/pgmq, or a `jobs` table drained by a scheduled function) is settled in Milestone 0.

## 10. Billing and entitlements

- **RevenueCat app user id = Supabase user id** on every platform. This is what makes one subscriber record across stores and web. Set it at sign-in, before any purchase call.
  **Already true on native** (M0 spike 3): `src/lib/auth.ts:367` calls `Purchases.logIn(session.user.id)` on sign-in and on session restore, and the webhook maps `event.app_user_id` straight to `profiles.id`. Two gaps remain — web has no equivalent auth sync yet (M4's `billing` adapter), and the `configure()` → `logIn()` ordering is conventional rather than enforced, so the "before any purchase call" rule deserves an assertion at the purchase call site.
- **Native:** RevenueCat SDK and the hosted paywall, as today.
- **Web:** RevenueCat Web (Web Billing engine on Stripe) through the Web SDK. Same entitlements and offerings; top-ups sold as one-time purchases.
- **Source of truth for gating:** the `entitlements` table and credit balance view in Supabase. The RevenueCat SDK result is used only as a fast local hint.
- **Linking from the mobile apps to web checkout** is governed by App Store and Play policy and differs by region. The apps do not link out to web checkout until that is reviewed. The web app sells directly.
- Prices remain store/RevenueCat-managed. The app never hard-codes a price.

### 10.1 Web Billing — confirmed 2026-10-22

**Status.** RevenueCat does not label Web Billing as beta *or* GA. The docs use
neither word; it ships with a published limitations list. So the M0 question
"GA or beta" has no answer in those terms — treat it as live with known gaps.

**Fees.** RevenueCat charges **no additional fee** for web; web purchases fall
under the normal Pro rate — free to $2,500 monthly tracked revenue, then 1%.
The processor's fees stack on top and depend on the billing engine:

| Engine | Processor fees (US) | Merchant of record |
|---|---|---|
| RevenueCat Billing | Stripe 2.9% + 30¢, plus optional Stripe Tax 50¢/txn | you |
| Stripe Billing | the same, **plus** Stripe Billing 0.7% of volume (or $620/mo) | you, or Stripe via Managed Payments |
| Paddle Billing | not published on the overview page | Paddle |

**RevenueCat Billing is the choice for us** on these numbers: it avoids Stripe
Billing's extra 0.7% and we do not need Paddle's merchant-of-record service
badly enough to pay for it unsurveyed.

**Limitations, and the one that matters.**

- **No translated content in web purchase links.** Bookflow is built for ESL
  readers — Ama is the first persona in `CLAUDE.md`, and inline translation is
  a marketed feature. A checkout that cannot be localised is a poor fit for the
  exact user the web app helps most.
- **Stripe is the only gateway.** RevenueCat says other local payment methods
  "may" come later. Card-only checkout is a weak offer to a Ghanaian
  undergraduate on a $3–5/month budget, where mobile money is normal.
- **Customers based in India are not supported.** Explicit exclusion.
- No B2B sales.

**Unconfirmed:** whether Ghanaian *customers* can pay without friction. The
documented rule is that the developer's bank account and entity determine where
you may collect, and customers can pay globally — but that is about legality,
not about whether the payment method is one Ama actually has. Needs a direct
answer from RevenueCat or Stripe before M8 commits to web as the route to
emerging-market users.

## 11. Design tokens

- `packages/tokens` is the single source (TypeScript). It generates:
  - the RN theme consumed by `apps/app`
  - `tokens.css` (CSS variables) consumed by the web shell, the reader engine and the marketing site
  - a manifest that a `tokens:check-figma` script compares against the Figma file's variables (`Rt3gjNC24kBTrncxlnkuPW`), failing CI on drift
- Breakpoints, reader themes and reader presets are tokens.

## 12. Quality and operations

| Area | Choice |
|---|---|
| Unit tests | Vitest for `shared`, `reader-engine`, `core` |
| E2E mobile | Maestro flows: sign-in, upload, read, listen, AI summary, purchase (sandbox) |
| E2E web | Playwright: same flows, plus reader engine visual snapshots |
| Errors | Sentry (native and web), source maps uploaded in CI |
| Product analytics | PostHog |
| CI | GitHub Actions: typecheck, lint (including import boundaries), tests, token drift check |
| Builds and releases | EAS Build, EAS Update channels per environment |
| Web hosting | EAS Hosting for `apps/app` web; marketing site on its existing host |
| Flags | `core/flags`, remote-configurable, used for every replacement in the migration |
| Agent instructions | `CLAUDE.md` and `AGENTS.md` are kept **consistent with each other and with this document**, and reconciled in M1 |

**On that last row.** The two files currently contradict each other and the
target: `AGENTS.md` prescribes Expo Router and a file-based `app/` tree, while
`CLAUDE.md` states that Expo Router "was planned and never adopted" and tells
the reader not to reach for it. Both document `npx jest`, and no test runner is
installed. Whichever file an agent reads, a correct migration step looks like a
violation of the house rules — so reconciling them is a prerequisite for the
rest of the work, not housekeeping after it.

## 13. Migration milestones

Each milestone ends with: type check clean, tests green, Android device QA, and a release (or a flag-off merge).

| # | Milestone | Done when |
|---|---|---|
| **M0** | Spikes | ~~Reader engine prototype~~ **done 2026-10-22 — text/EPUB go, pdf.js no-go** (§7.6); app boots on web; RevenueCat Web Billing sandbox purchase grants an entitlement visible on Android; queue choice made |
| **M1** | Foundation | Monorepo, `packages/tokens` generating the current theme with zero visual change, CI, Sentry, PostHog, test harness, and `CLAUDE.md`/`AGENTS.md` reconciled with this document |
| **M2** | Routing | Expo Router replaces the stage machine; every current screen reachable by URL; magic-link deep links work on both platforms; no visual change |
| **M3** | Features and data | Screens moved into `features/*`; TanStack Query for all server state; offline queue for progress and highlights |
| **M4** | Adapters and web boot | All native-only imports behind `platform/*`; the app runs end to end on web (reader may still be a placeholder) |
| **M5** | Backend | `entitlements`, `credit_ledger`, `jobs`, `documents`, `narration_segments`; webhook live; server-side metering; Library reads job progress |
| **M6** | Reader engine | Engine replaces text, the Listen view and EPUB behind a flag on native, then on web; RN text reader removed after parity. **`react-native-pdf` stays** (§7.6), so PDF full mode is untouched |
| **M7** | Responsive shells | Medium and Expanded shells, Presenter, master-detail layouts. **Requires tablet and desktop frames in Figma first** |
| **M8** | Web launch | Web paywall and top-ups, app domain, SEO-safe auth pages, Playwright suite green |

### 13.1 On M0's reader evidence — emulator only

No physical budget Android phone is available (decided 2026-10-22), so the M0
reader spike runs on an emulator. That is workable, but it changes what the
spike can conclude, and pretending otherwise would put a `react-native-pdf`
removal on evidence that does not support it.

The host is Apple Silicon: 14 cores, 36 GB. The emulator runs `arm64-v8a`
natively on it, so there is no translation penalty — and that is precisely the
problem. Emulated ARM here is *faster* than a budget phone, not slower.

| Measurable honestly | Not measurable |
|---|---|
| Memory ceiling and OOM behaviour, with `hw.ramSize=2048` | **CPU throughput** — the host's cores are far quicker than a budget SoC's efficiency cluster, and pdf.js rasterisation is CPU-bound |
| Whether the WebView holds a 300-page document at all | **Scroll and compositing smoothness** — host GPU |
| Correctness, layout, API behaviour | **Thermal throttling** — not simulated at all, and a budget phone throttles within minutes of sustained rendering |
| Relative comparison between two implementations | **Storage I/O** — host NVMe, not eMMC |

**So M0's pdf.js verdict is necessary, not sufficient.** A failure on the
emulator is conclusive: it will fail worse on a real phone. A pass proves only
that it is not hopeless. The spike should therefore:

1. Run against a **purpose-built low-end AVD** — 2 GB RAM, 2 cores — not the
   existing `bookflow_pixel9` profile (4 GB, 4 cores), which is a flagship.
2. Require **headroom, not a marginal pass**. A result that only just clears
   the bar on hardware this favourable is a no-go.
3. Treat the decision as **provisional**. `react-native-pdf` stays until pdf.js
   is confirmed on real low-end hardware.

> **Resolved 2026-10-22.** The spike returned a *failure*, and by the rule
> above that is the conclusive direction — a real budget phone is slower still.
> So the pdf.js decision is binding, not provisional, and no real-device
> confirmation is needed to act on it. Open question 14 is closed by the
> result rather than by the hardware. §7.6 has the numbers.

M6 no longer removes `react-native-pdf`, so that particular real-device check
is moot. A cloud device farm (Firebase Test Lab has a free tier) is still the
cheapest way to validate the **text and EPUB** engine on real budget hardware
before M6 ships it — a *pass* on the emulator is the case that needs
confirming, and text mode passed.

## 14. Open items

- Tablet and desktop screens do not exist in Figma yet; only the earlier HTML prototypes do. M7 is blocked on that design work.
- ~~RevenueCat Web Billing status and fees~~ — **confirmed 2026-10-22**, see §10.1. Open successor: whether Ghanaian customers can pay without friction, given Stripe-only, card-only, non-localisable checkout.
- Store-policy review for app-to-web purchase links, per region, before any link-out ships.
- Real top-up prices (F-33).
- What is actually hiding the credit gauge, given that metering is already server-side (§9.2).
- ~~Whether pnpm is the right choice over npm workspaces~~ — **decided 2026-10-22: npm workspaces.** Reasoning in §4.
- Where `bookflow_landing_site` lives; it is not beside the repo, and M1 moves it in.
- Whether M3's file moves should precede M2's routing, to avoid two passes over the same 33,203 lines of screens.
- The app domain for universal links and App Links (M2), and the Sentry and PostHog keys (M1).
