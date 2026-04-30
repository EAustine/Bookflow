# Bookflow — Engineering Scoping

*A buildable plan for a solo founder. Reads top-to-bottom or by section. Approximately 9–12 months of full-time work for someone with mobile development experience; longer if learning from scratch. Resist the temptation to skip sections that feel obvious — the gotchas live in the boring details.*

---

## Part 0 — Honest Framing

Before any technology decisions, three things to internalize:

**You will not build this in 3 months.** Founders consistently underestimate mobile development, especially when AI services are involved. The MVP scope has 18 features across 5 product pillars plus auth, payments, analytics, and infrastructure. Realistic timeline for a solo developer with mobile experience: 9–12 months. Without prior mobile experience: 14–18 months. Plan accordingly. Tell yourself the truth about how long this will take so you don't burn out at month 4 thinking you're "behind."

**Most of your work is not the AI features.** New founders fixate on the LLM and TTS integration because they're novel. In reality, those are 2 weeks of work each. The other 9–11 months are: auth flows, payment plumbing, file upload pipelines, audio caching, EPUB parsing, offline sync, analytics instrumentation, push notifications, settings persistence, error handling, accessibility, app store submission, and bug fixing. The boring stuff is the work.

**Outsource ruthlessly.** Anything that isn't your core differentiator should be a third-party service from day 1. Auth → Clerk or Supabase Auth. Payments → RevenueCat. Email → Resend. Analytics → PostHog. Crash reporting → Sentry. File storage → Supabase or Cloudflare R2. You will not build a better auth system than Clerk. Don't try.

**Ship something users can touch in 8 weeks.** Not the full MVP — a thin slice. Reading + listening on one book, no payments, no Q&A. Get it in 5 hands. This protects you from spending 6 months building something that misses the mark. Beta testing works only if there's something to test.

---

## Part 1 — The Four Open Technical Decisions

These were left unresolved in the MVP scope. Solving them now unblocks everything else.

### 1.1 — Cross-platform framework: React Native vs. Flutter

**Recommendation: React Native with Expo.**

The honest case for each:

**Flutter pros**: Better default performance, more polished animations, single language (Dart), Google's design language is excellent for getting something professional-looking quickly.

**Flutter cons**: Smaller ecosystem for the specific things Bookflow needs (audio handling, EPUB parsing, AI streaming SDKs). Dart is a niche skill — if you ever hire help, the talent pool is smaller. AI provider SDKs (Anthropic, OpenAI) are usually JS-first; Dart wrappers are community-maintained and lag the official versions.

**React Native pros**: Massive ecosystem. JavaScript/TypeScript is the lingua franca — every AI provider has first-class JS SDKs. Expo specifically removes 80% of the native-platform pain (you can build, test, and deploy without a Mac for iOS for most of the journey). Easier to find tutorials, contractors, and Stack Overflow answers when stuck. Web-first companies (Vercel, Supabase, Clerk) have first-class React Native support.

**React Native cons**: Performance ceiling is lower than Flutter. Some animations require more work to feel as smooth.

**Why React Native wins for your specific situation**: As a solo founder, you should optimize for speed-of-learning and breadth-of-tutorials. React Native + Expo has roughly 5× the learning resources, and the ecosystem alignment with everything else you'll use (Supabase, RevenueCat, AI SDKs) is much tighter.

**Specific stack:**
- **Expo Router** — file-based routing, much simpler than configuring React Navigation manually
- **TypeScript** — non-negotiable. The bug-prevention compounds over months.
- **Tamagui or NativeWind** — for styling. Tamagui is more performant; NativeWind is simpler. Pick NativeWind unless you hit performance issues.
- **Zustand** — for global state. Don't use Redux. Don't use Context for everything.
- **TanStack Query (React Query)** — for server state and caching. Pairs beautifully with Supabase.

### 1.2 — TTS provider

**Recommendation: ElevenLabs.**

The voice-quality bar matters more here than you might think. Audio narration is one of Bookflow's core promises, especially for the David persona. Mediocre TTS is worse than no TTS — it actively pushes users away.

The honest comparison:

| Provider | Voice quality | Cost per 1M chars | Streaming | Caching policy |
|---|---|---|---|---|
| **ElevenLabs Turbo v2.5** | Best in class | ~$0.18 | ✅ | ✅ allowed |
| **OpenAI TTS-1 HD** | Good | ~$0.30 | ✅ | ✅ allowed |
| **Google Cloud TTS Studio** | Good | ~$0.16 | ✅ | ✅ allowed |
| **Azure Neural** | Good | ~$0.24 | ✅ | ✅ allowed |

ElevenLabs has the best voice quality and the most natural prosody for long-form content like book narration. Their Turbo v2.5 model has dropped costs significantly. Voice cloning (post-MVP) is also their strength — when you eventually want to offer "Sarah," "Daniel," and "Maya" as distinct voices, ElevenLabs lets you select from professional voice clones.

**The economics, with a 90-minute free cap:**

A typical book is ~80,000 words (~480,000 characters). A 90-minute audio session covers ~14,000 words (~84,000 characters). At ElevenLabs Turbo pricing of $0.18/1M chars:
- Cost per free user per month at full audio cap: **~$0.015**
- Cost per paid user per month at heavy usage (5x free cap): **~$0.075**

These costs are negligible. **Caching is the real lever.** Cache every chapter's audio after first generation. Subsequent users listening to the same chapter in the same voice cost $0. Your TTS bill should plateau quickly as your library grows.

**Implementation note**: ElevenLabs supports streaming audio (you can begin playback before full generation completes). Use this. Generating-then-playing introduces 2–3 seconds of latency that streaming eliminates.

### 1.3 — LLM provider for summaries / Q&A / practice questions

**Recommendation: Claude Sonnet 4.5 as primary, with Claude Haiku 4.5 for cost-sensitive operations.**

Three reasons specific to Bookflow:

1. **Long-context handling for source-grounded Q&A.** Q&A in Bookflow is RAG-based — given a question, retrieve relevant chunks of the book, ask the LLM to answer using only those chunks, with citations. Claude's long context (200K tokens) and strong instruction-following on "answer using only the provided sources" is best-in-class. This is the make-or-break for your source-traceability promise.
2. **Summary quality.** Summaries that compress a 30-page chapter into 3 paragraphs without losing nuance is hard. Claude tends to produce more faithful summaries with less hallucination than alternatives.
3. **Cost efficiency at scale.** Claude Haiku is fast and cheap for the high-volume operations (chapter summaries you'll generate thousands of). Sonnet for harder tasks (whole-book summaries, complex Q&A). The tier strategy keeps unit economics healthy.

**Specific model assignments:**

| Task | Model | Why |
|---|---|---|
| Chapter summaries | Haiku 4.5 | Fast, cheap, plenty good for chapter-scope content |
| Whole-book summaries | Sonnet 4.5 | Better synthesis across long content |
| Q&A | Sonnet 4.5 | Source grounding accuracy matters most here |
| Practice questions (generation) | Sonnet 4.5 | Quality of question matters; one-time generation |
| Practice questions (grading) | Haiku 4.5 | Simpler comparison task |
| Translation popovers | Haiku 4.5 | Cheap and fast |

**Cost projections with a 50K-token monthly budget:**

Free tier user using ~50K tokens monthly = roughly 5 chapter summaries + 20 Q&A questions + occasional translation. At Haiku/Sonnet blended pricing, that's **~$0.08–0.15 per free user per month**. Paid tier at 500K tokens: **~$0.80–1.50 per paid user per month**. Healthy unit economics — your gross margin on the $9.99 plan stays above 80%.

**Get the actual current pricing before committing.** LLM pricing changes frequently; verify at https://docs.claude.com before building cost projections into your business plan.

### 1.4 — Public domain library integration

**Recommendation: Pre-curated catalog of 200–500 titles for MVP, API integration in v2.**

Direct API integration with Project Gutenberg sounds appealing (instant access to 70,000+ books) but the metadata and presentation quality is rough. Many books have multiple translations of inconsistent quality. Cover images are missing or terrible. The user experience of browsing 70,000 unstructured books is worse than browsing 200 curated ones.

**The pre-curated approach:**
- Hand-pick 200–500 high-quality public domain books
- Get good cover art (commission or use Standard Ebooks editions which include proper covers)
- Categorize properly: Classics, Philosophy, Self-development, Fiction, Short reads
- Standard Ebooks (https://standardebooks.org) provides high-quality typographically-correct EPUBs of public domain works — better than raw Gutenberg files. They are themselves open source.

**Effort**: ~2 weeks of one-time work to assemble the catalog. Then it lives as static data in your app or in a small database table.

**Why this matters for the launch experience**: Free users in the Discover tab encounter a curated, polished library — feels like a real product. With raw Gutenberg dump it would feel like "we threw 70K books at you, good luck."

---

## Part 2 — Architecture Overview

A high-level view before getting into specifics.

### 2.1 — System architecture

```
┌─────────────────────────────────────────┐
│ Mobile app (React Native + Expo)        │
│ - UI, local DB, audio playback          │
│ - Direct calls to AI APIs for streaming │
└────────────┬────────────────────────────┘
             │
             │ HTTPS
             │
   ┌─────────▼──────────┐
   │   Supabase         │
   │ - Auth             │
   │ - Postgres DB      │
   │ - Storage (books)  │
   │ - Edge functions   │
   └────────────────────┘
   
   ┌────────────────────┐
   │   RevenueCat       │  ← Subscription management
   └────────────────────┘
   
   ┌────────────────────┐
   │   Anthropic API    │  ← Direct from app for streaming
   └────────────────────┘
   
   ┌────────────────────┐
   │   ElevenLabs API   │  ← Via edge function for caching
   └────────────────────┘
   
   ┌────────────────────┐
   │   PostHog          │  ← Product analytics
   └────────────────────┘
   
   ┌────────────────────┐
   │   Sentry           │  ← Crash reporting
   └────────────────────┘
```

### 2.2 — Why this architecture

**Supabase is the backbone.** Postgres for structured data (users, books, summaries, conversation history), Storage for uploaded EPUBs and cached audio, Auth for sign-in, Edge Functions for any server-side work that needs to keep API keys secret. This replaces what would otherwise be: a database, auth service, file storage service, and a backend server. One vendor, one bill, much less to manage.

**Direct API calls from the app for streaming AI.** Streaming summaries and Q&A responses requires a persistent connection. Routing these through your own server adds latency and cost without adding security (the user is the one whose tokens are being spent — proxying doesn't protect anything). Use Anthropic's client-side rate limiting and your own usage tracking.

**Audio generation goes through an edge function.** ElevenLabs needs a server-side API key. The edge function takes a chapter ID, generates audio if not cached, stores in Supabase Storage, returns a signed URL. Caching means you generate each chapter-voice combination exactly once.

**RevenueCat for payments.** Stripe and App Store/Play Store have completely different billing models, refund policies, receipt validation, etc. RevenueCat normalizes all of this. You write one integration, ship to all platforms, and it handles the chaos.

### 2.3 — Database schema (essential tables)

```sql
-- Users (managed by Supabase Auth, extended)
profiles (
  id uuid primary key references auth.users,
  display_name text,
  preferred_language text default 'en',
  translation_target text,
  reading_preset text default 'standard',
  created_at timestamptz
)

-- Subscription state (synced from RevenueCat)
subscriptions (
  user_id uuid primary key references profiles(id),
  tier text, -- 'free', 'standard', 'student'
  active boolean,
  expires_at timestamptz,
  monthly_audio_seconds_used int,
  monthly_tokens_used int,
  monthly_reset_at timestamptz
)

-- Books in user libraries
books (
  id uuid primary key,
  user_id uuid references profiles(id),
  title text,
  author text,
  source text, -- 'upload' or 'public_domain'
  storage_path text, -- supabase storage key
  total_pages int,
  current_page int default 1,
  added_at timestamptz,
  finished_at timestamptz
)

-- Chapter content (parsed from EPUB on upload)
chapters (
  id uuid primary key,
  book_id uuid references books(id),
  position int, -- chapter order
  title text,
  content text, -- the actual text
  word_count int
)

-- Cached audio per chapter+voice combination
audio_cache (
  chapter_id uuid references chapters(id),
  voice_id text, -- 'sarah', 'daniel', etc.
  storage_path text, -- supabase storage key for the mp3
  generated_at timestamptz,
  primary key (chapter_id, voice_id)
)

-- Summaries (cached per chapter+length)
summaries (
  chapter_id uuid references chapters(id),
  length text, -- 'tldr', 'standard', 'detailed', 'whole_book'
  content text,
  generated_at timestamptz,
  thumbs_up bool,
  thumbs_down_reason text,
  primary key (chapter_id, length)
)

-- Q&A conversation history
conversations (
  id uuid primary key,
  user_id uuid references profiles(id),
  book_id uuid references books(id),
  created_at timestamptz
)

messages (
  id uuid primary key,
  conversation_id uuid references conversations(id),
  role text, -- 'user' or 'assistant'
  content text,
  sources jsonb, -- array of {chapter_id, page, quote}
  thumbs_up bool,
  created_at timestamptz
)

-- Embeddings for RAG (Q&A retrieval)
chunk_embeddings (
  id uuid primary key,
  book_id uuid references books(id),
  chapter_id uuid references chapters(id),
  chunk_text text,
  embedding vector(1536), -- pgvector
  page_number int
)
```

This is 9 tables. There will be more (notifications, beta cohorts, feedback, etc.) but these 9 are the core.

---

## Part 3 — Epic Breakdown & Estimates

The MVP broken into 12 epics. Estimates are calendar weeks for a solo developer working full-time, assuming React Native experience. Add 30–50% if learning. These are not "minimum possible" estimates — they include normal debugging, polish, and the handful of unknowns every project has.

### Epic 1: Foundation (3 weeks)

Setting up the skeleton everything else builds on.

- Expo project with TypeScript + Expo Router
- Supabase project + auth integration
- Basic navigation structure (4 tabs)
- Design system implementation: colors, fonts (Fraunces, Geist, Literata loading), typography scale, button system, all components from the design system spec
- Light/dark mode handling
- Minimal "hello world" inside each tab
- CI/CD via Expo EAS Build

**Risk**: First-time React Native developers usually lose a week here to environment setup. Plan for it.

### Epic 2: Auth & Onboarding (2 weeks)

- Sign in with Google (via Supabase Auth)
- Sign in with email + magic link
- Three-step onboarding flow (welcome → intent → first book)
- Profile creation in Supabase
- Returning user "Welcome back" splash logic

### Epic 3: Library & Book Upload (4 weeks)

- File picker (PDF + EPUB)
- EPUB parsing using `epubjs` or `react-native-epub-creator` — extracting chapters, metadata, cover image
- PDF parsing — harder, recommend `react-native-pdf` for display, but text extraction needs server-side processing (use `pdf-parse` in a Supabase edge function)
- Upload to Supabase Storage with progress
- Library list view with search/sort/filter
- "Continue reading" hero card
- Empty state, populated state

**Risk**: PDF text extraction is genuinely hard. Some PDFs are scanned images requiring OCR (out of scope for MVP — show a clear error). EPUB is much cleaner; encourage users to use EPUB when possible.

### Epic 4: Reader (3 weeks)

- Text rendering with proper typography (Literata)
- Reader header (back, title, progress, Aa, chapters)
- Typography panel (size slider, font picker, theme, presets)
- Tap-to-translate popover
- Long-press for sentence translate
- Auto-save current position
- Chapter list view
- Search within book

**Risk**: Tap-to-translate selection mechanics on mobile are fiddly. Plan for 3 days just on this interaction.

### Epic 5: Listen Mode (TTS Integration) (4 weeks)

- ElevenLabs API integration via Supabase edge function
- Audio caching architecture (generate-once, store in Supabase Storage, serve via signed URL)
- Audio playback with `expo-av` or `react-native-track-player`
- Bimodal mode: synced word-by-word highlighting
- Background playback + lock screen controls
- Variable speed (0.5×–3×)
- Sleep timer
- Voice picker
- Mini player (persistent dock)
- Listen tab content

**Risk**: Bimodal sync is the technically hardest feature. ElevenLabs returns word-level timestamps with their character-aligned API; you align them with text rendering positions. Expect 1–2 weeks just on bimodal. This is the single biggest gating item for the David persona.

### Epic 6: Summaries (LLM Integration) (2 weeks)

- Anthropic SDK integration with streaming
- Summary generation: chapter (Haiku) and whole-book (Sonnet)
- Length toggles (TL;DR / Standard / Detailed)
- Source citation extraction (LLM returns sources with chapter+page references)
- Inline source markers in summary text
- Summary caching per chapter+length
- Quality rating (👍/👎 + reason chips)
- Whole-book credit cost confirmation flow
- Listen-to-summary feature (pipes summary text through TTS)

### Epic 7: Practice Questions (2 weeks)

- Question generation prompt engineering for MCQ + short-answer
- Start screen configuration (chapter, count, type, order)
- MCQ flow with answer reveal + explanation
- Short-answer flow with AI grading
- Results screen with score breakdown
- "Retry the ones you missed" focused session
- Quality rating

### Epic 8: Q&A (RAG Architecture) (4 weeks)

- Embedding generation on book upload (chunk text → OpenAI embeddings or Cohere)
- Storage in Supabase pgvector
- RAG retrieval flow: user question → embed → vector search → fetch top chunks → send to Claude with prompt
- Strict source-grounding prompts (every claim cited)
- Chat UI with streaming responses
- Source markers + click-to-navigate
- Off-topic detection and redirect
- Conversation persistence
- Low-credits banner logic
- Offline state handling

**Risk**: This is the most complex epic. Plan for 4 weeks; realistically might run to 5. The RAG quality is what makes Q&A feel magical or broken — invest the time in prompt engineering and chunk-size tuning.

### Epic 9: Discover (1 week)

- Pre-curated catalog seeding (Standard Ebooks → Supabase)
- Categories, featured rail, "because you're reading X" rail
- Book detail screen
- Add-to-library flow
- 60-second sample playback

### Epic 10: Subscription & Paywall (3 weeks)

- RevenueCat integration
- Three subscription tiers (Free, Standard, Student)
- App Store and Play Store products configuration
- Paywall screens (one per trigger: audio cap, book cap, AI tokens, feature gate)
- Soft warning banners at 80% threshold
- Usage tracking (audio seconds, tokens, books)
- Monthly reset job (Supabase scheduled function)
- Student verification (email-based for MVP — proper verification can use SheerID in v2)
- Restore purchases flow

**Risk**: App Store and Play Store subscription approval can take multiple submission cycles. Build this early in the project, not late. Get test purchases working in TestFlight by week 8 latest, not week 30.

### Epic 11: Settings & Account (2 weeks)

- You tab home with profile + plan + usage meters
- Account & subscription sub-screen
- Settings sub-screen (all preference toggles)
- Notification permission flow (contextual prompts, not onboarding)
- Local notifications scheduling for daily reminders
- Storage management (downloaded audio per book)
- Data export (GDPR compliance)
- Delete account flow with 30-day grace period
- Low-data mode toggle implementation

### Epic 12: Polish, Beta Prep, Launch (4 weeks)

- Beta testing infrastructure (TestFlight + Play Store internal testing)
- Analytics implementation (PostHog) — events per the metrics plan
- Crash reporting (Sentry)
- Onboarding analytics + funnel tracking
- All copy review and editing
- Empty states, error states, loading states across every screen
- Accessibility audit (VoiceOver, TalkBack, dynamic type)
- App store assets (screenshots, descriptions, keywords)
- Privacy policy and terms of service (use a service like Termly to generate)
- Final QA pass

### Total: 34 weeks of engineering work

That's ~8 months of full-time work for a developer with React Native experience, before factoring in:

- **Buffer for unknowns**: Add 4 weeks (10–15%) for things that go wrong
- **Beta iteration**: Add 4 weeks for feedback loops with beta users
- **Learning curve**: Add 8–16 weeks if you don't have prior React Native experience

**Total realistic timeline: 42–58 weeks (10–14 months) for a solo founder.**

---

## Part 4 — Cost Projections

Two cost categories matter: monthly recurring infrastructure (your fixed costs) and per-user variable costs.

### 4.1 — Monthly recurring infrastructure (fixed)

Roughly what you'll pay regardless of user count, at MVP stage:

| Service | Plan | Monthly cost |
|---|---|---|
| Supabase | Pro | $25 |
| RevenueCat | Free under $10K MTR | $0 |
| Anthropic API | Pay-as-you-go | varies (see below) |
| ElevenLabs | Creator | $22 (10K characters/month for testing only — use pay-as-you-go in production) |
| PostHog | Free under 1M events | $0 |
| Sentry | Free under 5K events | $0 |
| Resend (email) | Free under 3K emails | $0 |
| Domain + DNS | Cloudflare | $1 |
| Apple Developer | Annual / 12 | $8 |
| Google Play Console | One-time, amortized | $2 |
| Expo EAS Build | Free tier | $0 |
| **Total fixed** | | **~$58/month** |

### 4.2 — Variable costs per user

These scale with usage. Calculations assume the unit economics from Part 1.

**Per free user (heavy usage):**
- TTS: $0.015
- LLM: $0.10
- Storage: negligible (few MB per user)
- Bandwidth: $0.05 (audio streaming)
- **Total: ~$0.17 per free user per month**

**Per paid user (heavy usage):**
- TTS: $0.075
- LLM: $1.20
- Storage: $0.02
- Bandwidth: $0.30
- **Total: ~$1.62 per paid user per month**

**Gross margin on $9.99 paid tier: ~84%**. Healthy. Standard SaaS aims for 70–80%; you're above that even with heavy AI usage.

### 4.3 — Cost at scale

Three scenarios:

**Scenario A: 100 free users + 10 paid users (early launch)**
- Fixed: $58
- Variable: $17 (free) + $16 (paid) = $33
- **Total: $91/month** | Revenue: $99 | **Net: +$8**

**Scenario B: 1,000 free users + 100 paid users (post-public-beta)**
- Fixed: $58
- Variable: $170 + $162 = $332
- **Total: $390/month** | Revenue: $999 | **Net: +$609**

**Scenario C: 10,000 free users + 1,500 paid users (early growth)**
- Fixed: $58 (Supabase moves to Team at $599/mo at this scale)
- Variable: $1,700 + $2,430 = $4,130
- **Total: $4,787/month** | Revenue: $14,985 | **Net: +$10,198**

The economics work. The business doesn't break under load. Your job is just to get to scenario B.

### 4.4 — Things that could go wrong with cost projections

- **TTS caching less effective than expected**: If users mostly read niche books rather than popular titles, your TTS cache hit rate is low and per-user cost climbs. Mitigation: cap free audio at 90 minutes (already done).
- **Q&A becomes the dominant LLM cost**: Long conversations with many tokens per turn could blow the budget. Mitigation: monthly token caps already in place; Claude Haiku for cheaper fallback if needed.
- **Apple/Google take 30%**: Always factor this in. $9.99 → you get $6.99 in your first year, $8.49 after year 2 (15% reduced rate). This is built into the SaaS pricing assumption but worth restating.

---

## Part 5 — Risk Register

Real risks ranked by likelihood × impact.

### High risk

**R1: Bimodal audio sync is harder than expected.**
- Likelihood: High
- Impact: High (core feature for David persona)
- Mitigation: Spike on this in week 1 of Epic 5. If the alignment looks rough after a week, pivot to ElevenLabs' "force-aligned" timestamps endpoint or accept a less precise highlight.

**R2: App Store rejection.**
- Likelihood: Medium (most apps get rejected at least once)
- Impact: High (launch delay 1–4 weeks per rejection cycle)
- Mitigation: Read App Review Guidelines section 3.1 (in-app purchases) thoroughly. Use RevenueCat which handles 90% of compliance. Submit early, don't wait until launch day.

**R3: PDF parsing edge cases.**
- Likelihood: High
- Impact: Medium (some users can't upload some books)
- Mitigation: Show clear error for scanned PDFs. EPUB-first messaging in upload flow.

### Medium risk

**R4: Q&A hallucination despite source-grounding prompts.**
- Likelihood: Medium
- Impact: Medium (trust erosion)
- Mitigation: Strict prompts with examples. Test against 50 known Q&A pairs before launch. Use thumbs-down feedback to identify hallucination patterns.

**R5: Voice cloning IP issues if user uploads copyrighted books.**
- Likelihood: Medium
- Impact: Medium
- Mitigation: Terms of service explicitly require users to own/have license to uploaded books. No cross-user audio sharing in MVP.

**R6: Monthly reset bugs causing free users to be locked out.**
- Likelihood: Medium
- Impact: High (churn driver)
- Mitigation: Test reset job thoroughly. Have manual reset capability for support cases.

### Low risk

**R7: Supabase outage.**
- Likelihood: Low
- Impact: High but bounded
- Mitigation: Local-first architecture for reading (already designed). Books once downloaded keep working offline.

**R8: ElevenLabs price increase.**
- Likelihood: Low–Medium
- Impact: Medium
- Mitigation: TTS is swappable. Budget for migration to OpenAI TTS or Google as backup.

---

## Part 6 — Sequencing: How to Ship Progressively

Don't build everything before showing anyone. Here's the staged plan.

### Milestone 1 — "Read One Book" (week 8)
- Auth working
- Upload one EPUB
- Read it (Reader screen + typography panel)
- Listen to it (basic TTS, no bimodal yet)

Show this to 3–5 people in your network. Watch what they do. Fix the obvious problems before continuing.

### Milestone 2 — "Read + AI" (week 16)
- Bimodal audio working
- Chapter summaries
- Practice questions
- Library with multiple books

This is when you can recruit your closed alpha (10 users). They use it daily for 2 weeks.

### Milestone 3 — "Real product" (week 28)
- Q&A
- Translation
- Discover with public domain catalog
- Settings, accessibility

This is closed beta material. 50–100 invited users for 4 weeks.

### Milestone 4 — "Paid product" (week 36)
- RevenueCat + paywalls
- All edge states polished
- Analytics fully instrumented

This is public beta. 500–1,000 users for 4 weeks.

### Milestone 5 — Public launch (week 44+)
- Apply learnings from public beta
- App Store optimization
- Marketing site (the work we deferred)
- Press kit, launch announcement

---

## Part 7 — What to Learn Before / During Building

If you're newer to mobile development, here's the order of skills to acquire. Each is roughly 1–2 weeks of focused learning.

1. **TypeScript fundamentals** — types, generics, utility types. Skip class-heavy OO patterns; React is functional.
2. **React** — hooks, state, effects, component composition. Avoid older class-component tutorials.
3. **React Native + Expo** — Expo Router, native modules, the Metro bundler, EAS Build.
4. **Supabase** — auth flows, RLS (row-level security) policies, storage, edge functions.
5. **AI APIs** — start with the Anthropic SDK quick-start, then practice prompt engineering.
6. **App Store / Play Store** — provisioning profiles, submission process, in-app purchase setup. This trips everyone up; allow real time for it.

**Resources I'd actually recommend:**
- Expo docs (https://docs.expo.dev) — well-written, tutorial-style
- Supabase docs and the Building a SaaS course on their YouTube
- Theo's React Native + Expo content for modern patterns
- Anthropic's docs (https://docs.claude.com) for the LLM integration

**What NOT to do:** Don't start by reading 5 books. Pick the smallest possible app idea (a to-do list with auth) and build it before touching Bookflow. The goal is to feel the friction points first.

---

## Part 8 — When to Hire Help

You can do this solo. But there are points where bringing in help saves months.

**Worth hiring out:**
- **App Store / Play Store submission** ($500–$2K, one-time) — someone who's done it 50 times will spot 20 things you'd miss. Worth every dollar.
- **Final accessibility audit** ($1K–$3K) — VoiceOver and TalkBack testing is a specialized skill. Hire someone who does this professionally.
- **Brand assets refinement** — the illustrations and logo we created should be redrawn by a professional illustrator before launch ($500–$2K total).
- **Privacy policy / Terms of service** — use Termly or hire a lawyer. Don't write these yourself.

**NOT worth hiring out:**
- Core product engineering. You need to know your codebase intimately.
- Customer support. Do it yourself for the first 1,000 users. You'll learn things research can't tell you.
- Marketing copy. You know your users best.

---

## Part 9 — Final Recommendations

1. **Start with the boring stuff.** Auth, navigation, design system, deployment pipeline. The AI features come later. If you can't ship a non-AI version of your app, you can't ship the AI version either.
2. **Ship the thinnest slice in 8 weeks.** Read one book + listen to it. Get it in 5 hands. Iterate.
3. **Cache aggressively.** TTS and LLM responses are expensive; cache everything cacheable. Your unit economics depend on it.
4. **Build in this order**: Foundation → Auth → Library → Reader → Listen → Summaries → Q&A → Practice → Discover → Paywalls → Settings → Polish.
5. **Track these three metrics from day 1**: Day-7 retention, free-to-paid conversion, AI quality (👍/👎 ratio). Everything else is secondary.
6. **Set a working schedule and protect it.** Solo founders burn out by accident. 6 days a week for 10 months is sustainable. 7 days a week for 14 months is not.
7. **Be willing to cut features.** If at month 8 you're behind schedule, cut Practice questions before cutting Q&A. The prioritization in this doc is your guide; revisit it if you fall behind.

You have a complete plan. Now you have to actually build it.
