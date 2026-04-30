# Bookflow — Personas & MVP Feature Prioritization

*Working document for product scoping. Inputs: market research synthesis (ebook + audiobook market data, competitor analysis, user pain point research). Next step after this: low-fidelity wireframes.*

---

## Part 1 — Detailed User Personas

We're focusing on the two highest-opportunity segments identified in the research: **university students** and **adults with reading difficulties (dyslexia / ADHD / non-native English readers)**. These two share a high feature overlap, which means one well-designed MVP can serve both.

---

### Persona 1 — "Ama, the Overloaded Undergrad"

**Snapshot**

- 20 years old, third-year Business Administration student
- Lives on campus, primary device is a mid-range Android phone, secondary is a hand-me-down laptop
- English is her second language (Twi/French at home); she reads English fluently but slowly with academic texts
- Budget: lives on a stipend; will pay $3–5/month if a tool clearly saves her time during exam season

**A typical week**

She's assigned 4–6 chapters across 3 courses each week, plus 2–3 case studies. She finishes maybe 60% of the assigned reading. The rest she fakes through class discussions or skims the night before exams. She's tired, not lazy — there genuinely isn't enough time.

**Goals**

- Pass exams with strong grades without reading every word of every chapter
- Understand concepts well enough to participate in class without being called out
- Convert dead time (commute, walking between classes, doing laundry) into study time
- Self-test before exams to know what she actually retained

**Frustrations**

- Textbooks are dense and full of jargon she has to look up constantly
- She loses focus after 20 minutes of reading dense PDFs on her phone
- Existing tools are fragmented: she copy-pastes into ChatGPT for summaries, opens Google Translate for terms, uses YouTube for video explainers
- Free plans on Speechify and similar apps run out before she finishes one chapter
- She doesn't trust AI summaries to be accurate enough for exam material

**What she needs from Bookflow**

1. Upload a PDF chapter and get a clean, accurate summary at the section level (not just the whole chapter)
2. Listen to chapters at 1.5–2x speed during her commute
3. Tap any English word for an instant translation or simple-English definition
4. Auto-generate practice questions from each chapter to self-quiz
5. Works offline once a file is downloaded (campus wifi is unreliable)

**Quote we'd hope to hear in user interviews**

*"If this thing makes my readings into something I can actually finish on the bus, I'd pay for it."*

**How she'd discover Bookflow**

TikTok / Instagram Reels showing "how I survived finals using this app," referrals from classmates, university Telegram/WhatsApp study groups.

---

### Persona 2 — "David, the Reader Who Almost Gave Up"

**Snapshot**

- 34 years old, project manager at a mid-size logistics company
- Has dyslexia (diagnosed in his late 20s after years of thinking he was "just slow")
- Reads work emails and short content fine; long-form reading exhausts him within 15 minutes
- Wants to be the kind of person who reads business and self-development books — has tried, failed, and quietly given up several times
- Budget: comfortable paying $10–15/month for the right tool; he's bought audiobooks, Blinkist, and Audible at various points

**A typical week**

He buys books with genuine intention, reads 30–40 pages, then stalls. His shelf at home has 12 unfinished books. He mostly consumes ideas through podcasts now because reading feels like work. He'd love to read deeper material than what podcasts offer.

**Goals**

- Actually finish books he buys — fiction and non-fiction
- Engage with text in a way that doesn't trigger the cognitive overload he gets from print
- Retain what he reads; he's tired of forgetting books a month after "reading" them
- Read books that aren't in Audible's catalog (technical books, niche non-fiction, books from his home country)

**Frustrations**

- Audible's catalog is limited; many books he wants aren't available as audiobooks
- Most TTS apps sound robotic and make long listening tiring
- Blinkist gives him the gist but he wants the actual book, not someone else's interpretation
- He feels embarrassed admitting he "can't read" — wants tools that feel like productivity aids, not disability aids
- Switching between listening, reading, and looking things up is clunky across apps

**What he needs from Bookflow**

1. Upload any EPUB/PDF and get high-quality natural-sounding narration (this is non-negotiable)
2. Bimodal mode — text highlights word-by-word as audio plays (this is proven to help dyslexic readers significantly)
3. Chapter summaries he can read first, to prime his comprehension before listening
4. Ability to ask questions about what he just read/heard, like a study buddy — "wait, who was the protagonist again?"
5. Resume exactly where he left off, across devices

**Quote we'd hope to hear in user interviews**

*"I don't want a workaround for being broken. I want a better way to read."*

**How he'd discover Bookflow**

LinkedIn posts, productivity newsletters, dyslexia advocacy communities, podcast sponsorships on shows like Huberman / Tim Ferriss / business podcasts.

---

### What these two personas have in common (the MVP design anchor)

Both Ama and David need:

- High-quality TTS that doesn't fatigue them
- Synced text + audio (bimodal listening)
- Trustworthy summaries (chapter-level, not just whole-book)
- The ability to look things up without leaving the app (translation, definition, Q&A)
- Their own files — not a curated catalog they have to choose from

They differ on: price sensitivity, Q&A use case (Ama wants self-quizzing, David wants conversational comprehension), and discovery channels.

**Design principle**: build for both by treating the four pillars (read, listen, translate, summarize+Q&A) as one integrated reading session — not as separate modes the user has to navigate between.

---

## Part 2 — Feature Prioritization Matrix for MVP

Method: each feature scored on **User Value** (how much it matters to the two personas) and **Build Effort** (engineering and AI cost to ship a quality version). Both on a 1–5 scale. The Priority column is the recommendation.

### Core Reading Engine

| Feature | User Value | Build Effort | Priority | Notes |
|---|---|---|---|---|
| Upload PDF + EPUB | 5 | 2 | **MVP** | Table stakes. Without this, nothing else works. |
| Clean reading view (text reflow, font size, dyslexia-friendly font, dark mode) | 5 | 2 | **MVP** | Critical for David; nice for Ama. Use OpenDyslexic or Lexend as default option. |
| Resume where you left off (per book) | 4 | 1 | **MVP** | Cheap to build, huge UX win. |
| Cross-device sync | 3 | 4 | **v2** | Skip for MVP — single-device is fine to validate the core value. |
| Highlights and notes (in-app) | 3 | 3 | **v2** | Useful but not the wedge. Readwise already owns this; we don't need to compete on day 1. |
| **Notes export** (highlights, summaries, Q&A history as JSON/Markdown) | 4 | 2 | **MVP** | Promoted from v2 after analysis: skeptical professional personas treated lack of export as paid-conversion dealbreaker. Cheap to build. |
| **Low-data / offline mode toggle** | 4 | 3 | **MVP** | Promoted from v2 after analysis: emerging-market users (Ghana, Kenya, Nigeria) flagged data costs as friction. Compresses audio quality, batches network calls. |
| Reading streaks and gamification | 2 | 2 | **v2 or later** | Don't lead with this. It's a retention layer added after value is proven. |

### Listen (TTS)

| Feature | User Value | Build Effort | Priority | Notes |
|---|---|---|---|---|
| High-quality AI narration (1+ natural voice) | 5 | 4 | **MVP** | The single biggest make-or-break feature. Use ElevenLabs, OpenAI TTS, or Google Cloud TTS — do NOT ship robotic voices. |
| Variable playback speed (0.5x – 3x) | 5 | 1 | **MVP** | Trivial to build, hugely valued by Ama for commute listening. |
| Bimodal mode (synced word-by-word highlighting while audio plays) | 5 | 4 | **MVP** | This is THE feature for David and dyslexic users. ElevenReader has it; users love it. Skipping this loses the accessibility segment. |
| Multiple voice options | 3 | 2 | **v2** | One excellent voice beats five mediocre ones at MVP. |
| Background play / lock-screen controls | 4 | 2 | **MVP** | Required for the commute use case. Skipping this kills audio retention. |
| Offline listening (downloaded audio) | 4 | 3 | **MVP-lite** | Critical for Ama (unreliable wifi). Cache the generated audio locally — don't regenerate. |
| Sleep timer | 2 | 1 | **v2** | Nice-to-have, not deciding factor. |

### Translate

| Feature | User Value | Build Effort | Priority | Notes |
|---|---|---|---|---|
| Tap a word → instant translation + simple definition | 5 | 2 | **MVP** | Huge for Ama (ESL) and a strong differentiator vs. Speechify/ElevenReader. Use Google Translate API or DeepL. |
| Tap a sentence/paragraph → translate inline | 4 | 2 | **MVP** | Same infra as above; small lift. |
| Translate full chapter to another language | 3 | 3 | **v2** | Useful but expensive in tokens. Wait for signal that users actually want this before building. |
| Build vocabulary list from looked-up words | 3 | 2 | **v2** | Lovely retention feature, not a launch driver. |

### Summarize

| Feature | User Value | Build Effort | Priority | Notes |
|---|---|---|---|---|
| Chapter-level summary (auto-generated on demand) | 5 | 3 | **MVP** | Critical for both personas. Must be section-aware, not just dumping the chapter into an LLM. |
| Whole-book summary | 3 | 2 | **MVP** | Easy to add once chapter summaries work. Useful for the "should I read this?" use case. |
| Section / page-level summaries | 4 | 4 | **v2** | Powerful for studying but more complex to scope cleanly — needs good chapter parsing first. |
| Customizable summary length (TL;DR / standard / detailed) | 3 | 1 | **MVP** | Trivial to add — just a prompt parameter. Big perceived value. |
| Key-takeaways / bullet-point mode | 3 | 1 | **MVP** | Same as above. Cheap, valuable. |

### Generate Questions / Q&A

| Feature | User Value | Build Effort | Priority | Notes |
|---|---|---|---|---|
| Auto-generate practice questions per chapter (multiple-choice + open-ended) | 5 | 3 | **MVP** | Ama's #1 differentiator. No competitor does this well. |
| Show answers / explanations after attempt | 4 | 2 | **MVP** | Required to make question generation actually useful. |
| Conversational Q&A about the book ("ask anything") | 4 | 3 | **MVP** | David's #1 use case. RAG over the book content. |
| Quiz mode with scoring + history | 3 | 3 | **v2** | Add once question generation is proven; gives Ama a study-tracking layer. |
| Spaced repetition flashcards from questions | 4 | 4 | **v2** | Powerful retention loop, but a separate product surface. |

### Onboarding, Account, Monetization (the boring but essential parts)

| Feature | User Value | Build Effort | Priority | Notes |
|---|---|---|---|---|
| Email + Google sign-in | 4 | 1 | **MVP** | Standard. |
| Free tier with usage limit | 5 | 2 | **MVP** | E.g. 1 book free, or 60 min audio/week. Critical for adoption. |
| Paid subscription ($4.99 student / $9.99 standard monthly) | 5 | 2 | **MVP** | Pricing should be tested, but plan for this from day 1. |
| Library view (uploaded books, recents) | 4 | 2 | **MVP** | Required for any returning user. |
| Settings: voice, speed, font, dyslexia mode, language | 4 | 1 | **MVP** | Don't skip — accessibility lives here. |

---

## Part 3 — Recommended MVP Scope (the short list)

If you stripped everything down to what must ship to test the hypothesis with Ama and David, here's the MVP:

**Reading**
- Upload PDF/EPUB
- Clean reader with dyslexia-friendly font + dark mode
- Resume where left off

**Listening**
- One excellent AI voice with variable speed
- Bimodal mode (synced text + audio)
- Background playback + offline cache

**Translate**
- Tap-word and tap-sentence translation + definition

**Summarize**
- Chapter-level summary on demand
- Whole-book summary
- Length toggle (TL;DR / standard / detailed)

**Q&A**
- Auto-generated practice questions per chapter (with answers)
- Conversational Q&A about the book

**Account**
- Sign-in, library, basic free + paid tier, settings

That's roughly **18 features** — meaningful but tight. Each one supports either Ama's exam-prep loop or David's accessibility-driven reading flow, and most support both.

**What we're explicitly NOT building in MVP:** cross-device sync, highlights/notes, vocabulary lists, full-chapter translation, multiple voices, gamification, quiz history, flashcards, social/sharing features.

---

## Part 4 — Resolved Decisions

The five open questions from the previous round are now resolved:

1. **Pricing model** — Cap-based freemium with two tiers at launch (Free and Standard). See Part 5 for full breakdown.
2. **AI cost model** — Narration is cached (one user generates audio for a chapter, every subsequent listener of the same book/voice combo gets the cached audio). Free-tier users can stream only — no offline downloads. Standard-tier users can download for offline.
3. **Book sources** — Users can upload their own books (PDF, EPUB) AND access an integrated public domain library (Project Gutenberg, Standard Ebooks, Open Library). This solves the empty-state problem and gives users something to try immediately on signup.
4. **Primary platform** — Cross-platform from day 1. React Native or Flutter (decision deferred to engineering scoping).
5. **Q&A scope** — Conversational Q&A and generated questions are restricted to content from the book itself. The model uses RAG (retrieval-augmented generation) over the uploaded text and refuses or redirects when asked about anything outside the source. Reduces hallucination risk and reinforces the study-aid positioning. We'll revisit broader Q&A scope after MVP based on user research.

---

## Part 5 — Pricing Tiers

Pricing logic is built around three resources that have real cost: **AI tokens** (used for summaries and Q&A), **audio minutes** (used by TTS), and **book slots** (number of books active in the library at any time). Each tier sets a cap on these.

A note on the unit economics: a typical 80,000-word book is ~480,000 characters of TTS. At ElevenLabs Flash rates (~$0.06 per 1,000 characters), that's roughly $29 in raw TTS cost to narrate a full book once. Caching is what makes this viable — the first user generates the audio, every subsequent user of the same book/voice combo streams from cache at near-zero marginal cost.

### Free Plan — "Try Bookflow"

**Price:** $0 / forever

**What it includes:**
- **2 books** active in library at any time (uploaded or from public domain library)
- **90 minutes** of audio streaming per month (streaming only — no offline downloads). *Note: increased from initial 60 min based on analysis findings — multiple users worried 60 min was too tight to evaluate. Validate during beta (hypothesis B1).*
- **50,000 AI tokens** per month (covers roughly 5–8 chapter summaries OR ~40 Q&A messages OR ~3 question-generation runs — user chooses how to spend)
- 1 standard AI voice
- Tap-to-translate (basic, single-word and sentence)
- Bimodal mode (synced text + audio)
- Dyslexia-friendly font + dark mode
- Access to public domain library (Gutenberg etc.)

**What's locked:**
- Offline audio downloads
- Premium voices
- Full-chapter translation
- Higher caps on summaries, Q&A, and audio
- Unlimited library

**Purpose:** let users finish at least one short book or sample a few chapters of a longer book. Enough to experience the magic, not enough to live in the free tier indefinitely.

### Standard Plan — "Bookflow Pro"

**Price:** $9.99 / month, or $79 / year (~$6.58/month — saves ~34%)

**Student discount:** $4.99 / month with verified `.edu` or student status (via SheerID or similar). This is non-negotiable given Ama is one of our two primary personas.

**What it includes:**
- **Unlimited books** in library
- **Unlimited audio streaming**
- **Offline audio downloads** (cached on device for any book in your library)
- **500,000 AI tokens** per month (effectively unlimited for a heavy reader — enough for ~50+ chapter summaries + sustained Q&A across multiple books)
- 3 premium AI voices to choose from
- Full tap-to-translate (word, sentence, full chapter on demand)
- Auto-generated practice questions per chapter (Ama's core feature)
- Conversational Q&A about the book (David's core feature)
- All MVP features unlocked
- Priority access to new features as they ship

**Purpose:** the everyday plan for someone who's actively studying or actively reading. Priced to be cheaper than Audible ($14.95/mo) and Speechify Premium ($11.58/mo on annual), competitive with Blinkist ($14.99/mo).

### Pricing Summary Table

| Resource | Free | Standard ($9.99/mo) | Student ($4.99/mo) |
|---|---|---|---|
| Books in library | 2 | Unlimited | Unlimited |
| Audio streaming | 90 min / month | Unlimited | Unlimited |
| Audio downloads (offline) | ❌ | ✅ | ✅ |
| AI tokens (summaries + Q&A) | 50K / month | 500K / month | 500K / month |
| Voices | 1 standard | 3 premium | 3 premium |
| Translate | Word + sentence | Word + sentence + full chapter | Same as Standard |
| Practice questions | ❌ | ✅ | ✅ |
| Conversational Q&A | ❌ | ✅ | ✅ |
| Public domain library | ✅ | ✅ | ✅ |
| Bimodal mode | ✅ | ✅ | ✅ |
| Dyslexia font + dark mode | ✅ | ✅ | ✅ |

### What we're deliberately NOT shipping at launch

- **Pay-as-you-go top-ups** (e.g., buying extra tokens). Adds billing complexity and confuses positioning. Revisit after we have real usage data.
- **Family plan** (multi-seat). Wait until we have evidence of demand.
- **Lifetime / one-time purchase**. Subscription model is the right fit for an AI-cost-driven product.
- **Enterprise / team plan** for schools and universities. High potential, but a separate sales motion. Revisit post-MVP once consumer side is validated.

### Critical assumptions to validate during user research

These pricing decisions are based on competitor benchmarks and reasonable AI cost estimates, but they're hypotheses until real users tell us otherwise:

- Is **$9.99** the right anchor, or is the global English-speaking market more price-sensitive? Consider testing $7.99 and $9.99 with different cohorts.
- Is the **60-minute free audio cap** generous enough to convert, or so generous it kills upgrade intent? Track free-tier audio consumption closely once live.
- Is **500K tokens** on Standard actually unlimited-feeling, or do power users (e.g., students prepping for finals) blow through it? May need to add a soft fair-use cap.
- Should student pricing be **$4.99 or $3.99**? Ama's persona suggests strong sensitivity at this price point — small differences may matter a lot.
- Are users willing to pay annually upfront? The 34% annual discount is aggressive; we may dial it back if cash flow allows.

---

## Part 6 — Paywall Copy & Trigger Logic

The paywall fires when a free-tier user hits one of four limits. Each trigger uses a contextual headline so users feel understood, not nagged. The body copy and CTA stay consistent across triggers; only the headline and supporting line change.

### Trigger 1 — Audio cap reached

**Triggered when:** Free user attempts to play audio after consuming 90 minutes for the month.

- **Eyebrow:** Free limit reached
- **Headline:** You've used your 90 minutes of audio for this month
- **Subline:** Upgrade to keep listening, or come back next month for a fresh 90 minutes.
- **Primary CTA:** See upgrade options
- **Secondary:** Maybe later

### Trigger 2 — Book limit reached

**Triggered when:** Free user attempts to upload a 3rd book or add a 3rd book from the public library.

- **Eyebrow:** Library full
- **Headline:** Your library is full — 2 of 2 books
- **Subline:** Remove a book to add a new one, or upgrade for an unlimited library.
- **Primary CTA:** See upgrade options
- **Secondary:** Manage library

*Note: this trigger has a secondary path ("Manage library") that lets users delete a book to make room — gives them an out without forcing the paywall conversation.*

### Trigger 3 — AI tokens exhausted

**Triggered when:** Free user attempts to generate a summary, ask a Q&A question, or generate practice questions after consuming their 50K monthly token allowance.

- **Eyebrow:** Free limit reached
- **Headline:** You're out of AI credits for this month
- **Subline:** Summaries, questions, and Q&A use AI credits. Upgrade for 500K credits a month, or come back when yours reset.
- **Primary CTA:** See upgrade options
- **Secondary:** Maybe later

### Trigger 4 — Feature gate (offline downloads)

**Triggered when:** Free user taps the download icon on a book to listen offline.

- **Eyebrow:** Pro feature
- **Headline:** Offline downloads are a Pro feature
- **Subline:** Cache audio on your device for listening without internet. Available on all paid plans.
- **Primary CTA:** See upgrade options
- **Secondary:** Maybe later

### Soft warnings — fire before the hard wall

To avoid surprising users at 100%, we show non-blocking banner warnings at the 80% threshold. These appear at the top of the relevant screen, are dismissible, and don't interrupt the user's flow.

| Trigger | Warning copy | Where it appears |
|---|---|---|
| Audio at 80% (72 min used) | 18 minutes of audio left this month | Top of Listen mode and Library |
| Books at 1 of 2 used | Wait — this isn't 80%, it's 50%. Skip warning. Trigger only at the wall. | n/a |
| AI tokens at 80% (40K used) | About 20% of your AI credits left this month | Top of Reader and any AI-feature screen |

*Note on books: 2 books is too small a number for a graduated warning. The hard wall fires straight at the 3rd-book attempt; the existing meter on the paywall screen makes this transparent.*

### Design principles for paywall copy

These principles apply to all current and future paywall messaging:

- **Name the specific limit.** Generic "upgrade now" copy converts worse than contextual triggers.
- **Acknowledge the alternative.** "Come back next month for a fresh 90 minutes" reminds users that the free tier still works — paying isn't the only path forward.
- **Show usage transparently.** All three usage meters are visible on the paywall screen so users can see exactly what's running out.
- **Always offer a graceful exit.** "Maybe later" and the close icon are real options, not buried.
- **No dark patterns.** No countdown timers, no fake scarcity, no auto-selecting the most expensive plan. We earn the upgrade.

---

## Part 7 — Wireframe Decisions Summary

All 10 MVP screens have been wireframed and reviewed. This section captures the design decisions and edge-case handling locked during wireframing.

### 7.1 — Onboarding flow

Three screens, no permission prompts:

1. **Welcome / sign-in** — Logo, one-line value prop, Google sign-in (primary) and email sign-in (secondary). No account creation form.
2. **Quick personalization (intent capture)** — Four options that drive home-screen prioritization: "Study & retain" (Ama), "Listen & finish books" (David), "Read in another language" (multilingual users), "Just exploring" (graceful escape).
3. **First book** — Big upload affordance + free public domain books below. "Skip for now" available.

**No tutorial / feature tour.** Users learn by doing; contextual tooltips fire when they encounter bimodal mode, summaries, and Q&A for the first time.

**No permission requests during onboarding.** Notifications, file access, and other permissions are requested contextually when first needed (see Section 7.10).

**Intent capture in step 2 is optional but powerful** — it routes the user's home screen emphasis (Listen primary for audio-first users, Study tools surfaced for students, etc.).

### 7.2 — Paywall behavior

Triggered by four caps (audio, books, AI tokens, feature gate). Each shows a contextual headline, the user's full usage meters, and a graceful "Maybe later" exit. See Part 6 for full copy specs.

**Soft warnings at 80% threshold** — non-blocking dismissible banners appear in relevant screens before users hit caps. Already specified.

**Pricing plan selection screen** — three options visible (Monthly $9.99, Yearly $79 / $6.58 mo with "Save 34%" badge, Student $4.99 with .edu verification). Yearly is visually emphasized as the recommended option. Restore purchases visible. CTA mirrors selected plan ("Start with Yearly — $79").

### 7.3 — Library

Home screen for returning users. Three zones:

- **Top**: Soft warning banner (when applicable), profile greeting + Search/+ icons
- **Middle**: "Continue" hero card (last-read book with Listen primary CTA + Read secondary), then "All books · N" list with progress, last-read time, and book type metadata
- **Bottom**: Tab nav (Library / Listen / Discover / You)

**Empty state** for first-session users: personalized greeting ("Welcome, Ama"), upload affordance, free book grid below, "See all free books" link.

**Sort & filter sheet** opens from the sort selector. Sort by: Recent / Recently added / Title (A–Z) / Progress. Filter by: All / In progress / Not started / Finished — counts shown. Active filter shows as dismissible chip. **No separate wishlist** — "Not started" filter handles this case.

**The "+" icon** opens a bottom sheet with two options: Upload PDF/EPUB or Browse free books.

### 7.4 — Reader

Five zones in default reading view:

- **Top header**: Back button, book title + chapter + progress %, Aa (typography) and ≡ (chapter list) icons
- **Reading area**: Generous padding, 12px body at 1.7 line-height (default), serif font default
- **Progress bar with ETA**: "p. 47 of 320 · ~ 3 min left in chapter" — concrete time motivates completion
- **Action bar**: Listen (primary, filled circle) / AI tools / Chapters / Search
- **No bottom tab nav** — Reader takes over the screen for focus

**Tap-to-translate**: Floating popover with word + phonetic + simple definition + translation in user's target language + audio pronunciation + Save word button. Long-press translates sentences/paragraphs inline using the same popover pattern.

**AI tools sheet** (bottom sheet from Reader): Summarize chapter / Generate questions / Ask about the book / Translate chapter. Shows current AI credits used at the bottom for transparency.

**Auto-hide chrome while reading** — setting (off by default per agreement). Tap screen to bring back.

**Bimodal mode is the only listen mode** — when audio plays, words highlight in the Reader; no separate audio-only screen needed (OS lock screen handles that).

### 7.5 — Typography panel (Aa)

Bottom sheet opened from the Reader. Contains:

- **Reading comfort presets** (top, prominent): Standard / Comfortable / Maximum readability — each applies a coordinated set of font + theme + spacing values
- **Text size slider** (A — A range)
- **Font**: Serif (default) / Sans-serif / OpenDyslexic / Lexend
- **Theme**: Light / Sepia / Dark
- **Auto-hide controls toggle**

Settings persist **per app**, not per book. Reset link top-right restores defaults.

### 7.6 — Listen mode

Three states, all use the same scrub bar + transport controls + bimodal text.

**Foreground (active listening)**:
- Top-of-screen header: book title, chapter, "listening" status
- Bimodal text area: dimmed paragraphs except current sentence (highlighted) and current word (solid block)
- Auto-scroll silently follows audio progression
- Bottom controls: scrub bar with current/end time, then transport row (speed pill, -15s, play/pause hero, +15s, sleep timer icon)
- Voice selector + Chapter shortcut as compact pills below

**Mini player**: Persistent dock above bottom tab nav when audio plays in background. Shows current title + progress bar + back-15 + play/pause. Tap to expand to full Listen mode.

**Voice picker** (bottom sheet): Free voice (Sarah) at top, locked Pro voices below with 🔒 + "Pro" badge. Tap any to preview. Pro upsell at the bottom.

**Sleep timer popover**: 5 / 15 / 30 / 60 min in 2×2 grid + "End of chapter" with time remaining + "Turn off timer" tertiary action.

**Auto-resume after interruption**: Default ON. Setting available to disable.

**Listen tab content**:
- *When playing*: Now playing hero card (artwork, metadata, full transport controls), Recently listened list, This month stats (total time, books finished, audio remaining)
- *When nothing playing*: "Pick up where you left off" hero card with last book + Resume button, Recently listened list, This month stats

### 7.7 — Summary

**Three scope toggles**: This chapter / Whole book + length presets (TL;DR / Standard / Detailed) + Bullets format toggle.

**Generation flow**:
1. Streaming text appears word-by-word as LLM generates
2. Cost transparency shown during generation ("Using ~2K AI credits")
3. Sources card at bottom with numbered references back to specific pages
4. Inline source markers (dotted underline + superscript) tap to jump to source

**Quality rating** (added to MVP per request):
- Default state: small bordered card with "Was this summary helpful?" + 👍/👎
- Thumbs-up path: card collapses to "Thanks for the feedback"
- Thumbs-down path: expands to reason chips (Missed key points / Inaccurate / Too short / Too long / Hard to follow / Other) + two CTAs ("Submit & regenerate" or "Submit only")
- Negative feedback is fed into prompt for regeneration to improve quality
- Data collected silently for now; surface insights in v2

**Whole-book credit cost confirmation** (bottom sheet):
- Warning headline ("This will use about 30% of your monthly credits")
- Body explains why (chapter count, complexity)
- Cost breakdown card: Estimated cost / Available this month (with progress bar) / After this summary
- Soft Pro upsell banner
- CTA shows cost on button ("Generate summary · 15K credits")
- Cancel as real option

**Bottom action bar**: Listen to summary (primary) / Regenerate (↻) / Share (↗).

**Auto-save behavior**: Most-recent summary at each length is cached per chapter. Switching between TL;DR/Standard/Detailed doesn't burn credits if cached. Regenerating overwrites cached version.

### 7.8 — Practice questions

**Start screen configuration**:
- Chapter selector (defaults to current chapter, dropdown for others)
- Number of questions: 5 / 10 (default, "recommended") / 15
- Question type: Mixed (default) / MCQ only / Short answer only
- Question order: Sequential (default, "recommended") / Randomized ("exam-prep mode")
- Estimated cost shown

**MCQ flow**:
- Header: × close, "Question N of M" + chapter, Skip
- Progress dots showing position
- Question + 4 options A/B/C/D
- After tap: correct answer bordered + filled icon, wrong options dim to 60%
- Feedback card: Correct/Incorrect label + explanation + source link with quoted phrase
- "Next question →" CTA

**Short answer flow**:
- Same header pattern
- User's answer quoted back in card
- Three grading verdicts: Correct ✓ / Mostly correct ~ (partial credit) / Incorrect ×
- Targeted feedback specific to user's answer (what's strong, what's missing/wrong)
- Model answer below with source linking

**Results screen**:
- Big score: "8 / 10" with "75% · 7.5 of 10 raw" subline (transparent rounding)
- Interpretive label changes by score: 90+%: "Excellent grasp" / 70-89%: "Strong understanding" / 50-69%: "Solid foundation, room to grow" / <50%: "This chapter needs another pass"
- Score breakdown card: Correct (full pts) / Partial (0.5 pts each) / Incorrect (0 pts) / Total · rounded
- Review list: only wrong/partial questions shown, with status labels
- Quality rating card (👍/👎) — same pattern as summaries
- "Retry the 3 you missed" primary CTA — generates focused mini-session of just incorrect/partial questions, no new credit cost

**Scoring math**: Partial answers count as 0.5 in raw score. Display rounded to nearest integer. Example: 7 correct + 1 partial + 2 wrong = 7.5 raw → "8 / 10" displayed.

**No timer, no leaderboards, no social sharing.** Goal is comprehension, not speed.

### 7.9 — Conversational Q&A

**Empty state**:
- Scope indicator banner under header: "Answers come only from this book" with ⓘ icon
- Welcome message + chat icon + "I'll cite the pages I'm pulling from" value prop
- Three suggested starter questions (contextually generated based on user's reading position)
- Standard chat input at bottom

**Active conversation**:
- Standard chat pattern: user messages right-aligned dark, AI responses left-aligned gray
- Sources appear *below* the AI message bubble in small gray text — keeps message readable
- Inline numbered superscripts (¹, ², ³) tap to jump to source in chapter
- Action row below sources: 👍 / 👎 / ↗ (share)
- Loading indicator while AI thinks: three pulsing dots in chat bubble

**Off-topic redirect**:
- Special bubble with left border accent + "Out of scope" label
- Honest copy: "I can only answer questions about [book]. That topic isn't covered."
- Pivot to help: "Did you want to ask something about [contextual topics]?"
- Two contextually-generated suggested questions appear below

**Low credits state** (below 20% of monthly budget):
- Persistent banner under header: "~ 9,800 AI credits left this month" + inline Upgrade button + × dismiss
- Banner reappears each time the user opens Q&A until they upgrade or month resets
- Conversation works normally — informational, not blocking
- Below 5%: copy escalates to specifics ("about 6 questions left")

**Offline state**:
- Header banner: "No connection · Reading still works" — reassures the user other features still function
- Existing chat history fully visible (stored locally)
- Failed user message dimmed to 50% opacity
- Error card appears below: dashed border, "Couldn't send" label, plain explanation, Try again + Discard actions
- Input field disabled with placeholder "You're offline — Q&A unavailable"
- No auto-retry on reconnection — user must explicitly retry

**Per-screen offline handling** (not global banner):
- Reader: works fully (text local), no banner
- Listen: works for downloaded audio, "Streaming unavailable offline" for non-downloaded
- Q&A / Summaries / Practice: block generation, allow viewing existing
- Library / Discover: "Some content unavailable offline"

**Conversation persistence**: One ongoing thread per book. No multi-thread management.

### 7.10 — Discover

**Main home**:
- Search bar (secondary placement)
- Category chips: For you (personalized) / Classics / Self-development / Philosophy / Short reads / Available in your language
- "Featured this week" — one editorially-curated standout with descriptive blurb
- "Because you're reading [book]" — contextual recommendations based on library
- "Short reads · under 100 pages" — friction-reducing rail with reading time estimates
- Horizontal scrolling rails for content density

**Category view**:
- Header: title + book count + "all free" emphasis + sort/filter icon
- Vertical list: bigger cards with author, summary, reading time
- "+" button per book for one-tap add; "✓" if already in library
- Tap card itself for detail screen

**Book detail**:
- Centered cover + title + author + meta row (read time, chapter count, "Free")
- About section: 2-3 sentence blurb
- Topics tag pills (tap to filter by category)
- Source attribution (e.g., "Project Gutenberg · George Long translation, 1862")
- "If you like this, also try" related books rail
- Bottom action: "+ Add to library" (primary) + ▶ (60-second sample preview, free for everyone)

**No social features in MVP**: no ratings/reviews from other users, no "trending" usage stats, no "X users have this." Day 1 we don't have data; later versions may add.

### 7.11 — You tab + Settings

**You tab (entry point)**:
- Profile header: avatar + name + email (tappable to edit)
- Plan status card with three usage meters (Audio / AI credits / Books) + Upgrade button
- Three grouped sections:
  - **Reading**: Reading display, Default voice, Translation language (current values shown as hints)
  - **Account**: Account & subscription, Settings, Notifications
  - **Support**: Help & FAQ, Send feedback
- Version number footer
- No destructive actions on top screen — those live deeper

**Account & subscription sub-screen**:
- Profile group: Name (editable), Email (read-only)
- Subscription card: current plan + status + Upgrade CTA (or for Pro users: plan + renewal date + Manage / Cancel)
- Restore purchases (App Store / Play Store compliance)
- Verify student status entry point with $4.99/mo price hint
- Privacy & data: Privacy policy / Terms of service / Export my data (GDPR-style data export)
- Sign out / Delete account (separated, in muted gray, both require confirmation; deletion has 30-day grace period)

**Settings sub-screen** (full preferences list):
- **Reading & audio**: Reading display / Default voice / Default playback speed / Resume audio after calls toggle
- **Language & translation**: App language / Translation target (separate — many users want English UI but native-language translations)
- **Notifications**: Daily reading reminder (with time, default 8 PM, default ON) / Usage warnings (default ON) / Product updates (default OFF, opt-in)
- **Storage**: Downloaded audio (size, per-book management) / Clear cache

**Notification permission flow** (contextual, NOT during onboarding):

The default-ON in-app toggle stores a *latent preference* — toggles work the moment OS permission is granted.

Three permission prompt triggers:
1. **After first reading session ends** (10+ minutes) — "Nice — 12 minutes done. Want a daily nudge?"
2. **When user manually toggles a notification preference ON** — clear intent signal
3. **When user finishes their first chapter** — moment of accomplishment

**Pre-prompt sheet** before iOS native permission dialog:
- Celebration framing first
- Preview of reminder time with Change link (lets user customize before granting)
- Honest disclosure: "Bookflow will ask iOS for permission next"
- Yes, remind me (primary) / Not now
- If dismissed, re-prompt once after 7 days, then never again unless triggered from Settings

**Settings — permission not granted state**:
- Banner at top: "Notifications are off — Bookflow doesn't have permission" + Turn on button
- Toggles dimmed (60% opacity) but show saved preferences
- Helper text: "Your toggles are saved. The moment you turn on notifications, Bookflow will start sending only the ones you've allowed."

**Settings — permission denied at OS level state**:
- Different banner: "Blocked at the system level" — clearer about where the block lives
- Open iOS settings button (deep-links to Bookflow's notifications page in system Settings)
- Same dimmed-toggles pattern

Cross-platform note: Android 13+ behaves like iOS (explicit permission). Older Android grants by default. Engineering handles the platform branching; UX is identical.

### 7.12 — Cross-cutting design principles

These apply across every screen:

- **Bottom sheets are the standard modal pattern** — typography, AI tools, voice picker, sleep timer, sort/filter, paywall confirmations, contextual prompts. Consistent affordance (drag handle on top), consistent dismiss (tap outside or × icon).
- **Source linking is everywhere AI is** — summaries, practice questions, Q&A all use the same dotted-underline + superscript + sources list pattern. Tapping any source jumps to the chapter at the cited page.
- **Cost transparency before AI actions** — "Using ~XK AI credits" or "Estimated cost: ~XK credits" is shown before any token-spending action. Users never get surprise deductions.
- **Quality ratings are 👍/👎 only, optional reasons via chips** — same pattern in summaries, Q&A, practice results. Lowest possible friction; data collected silently for v2 product decisions.
- **Honest empty states and edge states** — offline, low credits, blocked permissions, empty library all explain *what's happening and what still works*. No vague "Something went wrong" messaging.
- **No dark patterns** — no countdown timers, no fake scarcity, no auto-selecting expensive plans, no hard-to-find cancel buttons. Cancel and "Maybe later" are always real options.

---

## Part 8 — Refinements from Simulated Persona Analysis

A round of simulated persona analysis (15 personas, scenario-modeled) was conducted instead of pre-build user interviews. Findings were treated as **directional, not validated** — real validation deferred to beta testing post-MVP.

The analysis surfaced refinements to apply now and others to defer to beta validation.

### 8.1 — Refinements applied to MVP scope

These changes have low risk if wrong and meaningful upside if right. They are now part of MVP.

**Positioning change**: Lead marketing with **"Everything you need to read better — in one app."** The "all in one place" framing resonated with 11 of 15 simulated personas, including skeptical professionals. This is a stronger angle than "AI-powered reading," which is increasingly commoditized.

**Source traceability is a marketed feature, not just a UX detail**: Add to onboarding copy and product page: "Every summary cites the exact pages it pulled from." This was the most-cited differentiator from skeptical professional personas (Users B, E, G, K in the analysis). The functionality already exists in the wireframes; this change is about visibility.

**Free tier audio cap increased from 60 → 90 minutes per month**: Multiple simulated personas flagged the 60-minute cap as too tight to evaluate the product properly. 90 minutes lets a user finish a typical short book or sample multiple longer ones before hitting the wall. The unit-economics impact is modest (~50% increase in TTS streaming cost per free user) but the conversion impact of letting users *experience* the value should outweigh it. Validate during beta.

**Notes export added to MVP** (was v2): Two skeptical professional personas (Users B, G) treated lack of notes export as a dealbreaker for paid conversion. The feature is straightforward to build (export highlights, summaries, Q&A history as JSON or Markdown). Adding to MVP raises the quality bar for paying users.

**Low-data / offline mode toggle added to MVP**: Three personas based in emerging markets (Kenya, Ghana, Nigeria) flagged data costs as a friction point that would prevent payment. Given Ghana is the founder's home market and the global English-speaking emerging market is large, this is worth solving from day 1. Implementation: a Settings toggle that (a) compresses streamed audio quality, (b) delays non-essential network calls (analytics, cover image refreshes), (c) shows a per-session data usage estimate.

### 8.2 — Refinements deferred to beta validation

These are interesting findings that need real-user data before committing engineering effort.

**Practice questions prominence**: 9 of 15 personas (including 2 of 3 student personas) ranked practice questions as least-wanted or unused. This challenges a core MVP assumption that practice questions is Ama's killer feature. Rather than reducing prominence in the MVP, **build practice questions with a feature flag** that lets us A/B test prominence on the home screen and AI tools sheet during beta. If beta validates the simulated finding, we de-emphasize. If not, we keep the current treatment.

**Simple onboarding mode for older / lower-tech users**: Users J and O (60+, 1/5 tech savviness) suggested our 3-step onboarding may be too complex for this segment. Older users are not a primary persona for MVP launch — defer to v2 once we have data on whether they're trying to onboard and abandoning.

**Student pricing elasticity ($2.99 vs. $4.99)**: Simulated student personas hedged on $4.99. Real elasticity testing requires a live product and price experiments. Hold $4.99 for launch; consider testing $2.99 in select markets during beta.

### 8.3 — Refinements not applied (insufficient signal)

For completeness, these were in the analysis but did not warrant MVP changes:

- Family / shared-device use cases (2 mentions, not primary persona)
- Visual / image-heavy book support (1 mention)
- Enterprise / institutional pricing tier (2 mentions, both from skeptical-professional segment — interesting v2 direction)

---

## Part 9 — Beta Testing Program

Real-user validation happens via structured beta testing once MVP is built. The beta program is designed to answer the questions that simulated personas couldn't — actual behavior, retention, pricing elasticity, and unprompted insights.

### 9.1 — Beta phases

The beta runs in three phases over ~10 weeks.

**Phase 1 — Closed alpha (weeks 1–2)**: 10 hand-picked users from the founder's network, weighted toward Ama and David personas. Daily check-ins. Goal: surface critical bugs and onboarding friction before broader testing.

**Phase 2 — Closed beta (weeks 3–6)**: 50–100 invited users. Mix of strong-fit personas (students, dyslexic adults, ESL users) and skeptical professionals (academics, lawyers, engineers). Weekly check-ins via in-app survey. Goal: validate retention, conversion, AI quality, and feature-priority hypotheses.

**Phase 3 — Public beta (weeks 7–10)**: 500–1000 users via waitlist. Self-serve onboarding, no hand-holding. Goal: stress-test infrastructure, validate pricing elasticity, surface emergent use cases.

### 9.2 — Recruitment strategy per phase

**Closed alpha** — Direct outreach. Founder personally invites 10 people, ideally including:
- 2 university students who fit the Ama persona
- 2 adults with diagnosed reading difficulty (the David persona)
- 2 ESL adult users (validates the translation-priority finding)
- 1 emerging-market user (validates the low-data finding)
- 1 older / lower-tech user (validates the onboarding friction finding)
- 2 skeptical professionals (academic or legal — validates the source traceability finding)

**Closed beta** — Mix of:
- Targeted outreach via dyslexia advocacy groups, university student WhatsApp/Telegram channels, ESL learning communities
- Social media announcement (Twitter, LinkedIn) with a "request access" form that screens for fit
- Friends-of-alpha-users referral

**Public beta** — Waitlist signups, plus light marketing in 1-2 channels (e.g., a launch post on a relevant subreddit, mention in an accessibility newsletter). Don't go too broad too fast.

### 9.3 — What to measure

Three categories of metrics:

**Activation metrics** (week 1 of each user's experience):
- % of signups who complete onboarding
- % who upload or pick a first book
- % who reach their first chapter summary, audio play, Q&A question, or practice quiz
- Time from signup to first AI feature use

**Engagement metrics** (weeks 2–4):
- Daily active users (DAU) and weekly active users (WAU)
- Sessions per user per week
- Average session length
- Audio minutes consumed per active user
- AI features used per active user (which features dominate)
- % of users who finish a chapter / book

**Conversion metrics** (paid tier):
- % of free users who hit a cap
- % of capped users who upgrade vs. churn
- % of trial users who convert to paid
- Reasons given for cancellation (require a one-tap reason on cancel flow)

**Quality metrics** (continuous):
- Summary thumbs-up vs. thumbs-down ratio
- Q&A thumbs-up vs. thumbs-down ratio
- Practice question rating
- Crashes per session
- Average response time for AI features

### 9.4 — Validation hypotheses for beta

These are the hypotheses we deferred from simulated analysis and need real-user data to confirm:

**B1**: 90 minutes of free audio is sufficient for users to experience value without making the free tier feel "infinite enough" to skip paying. **Falsifies if**: <15% of free users hit the cap in their first month, OR >50% hit it within their first week.

**B2**: Practice questions are valued by students but de-prioritized by general users. **Falsifies if**: practice questions feature usage rate is similar (<10% variance) across student vs. non-student segments.

**B3**: Source traceability drives trust and conversion among skeptical professional users. **Falsifies if**: professional-segment users don't engage with source links (defined as <10% click-through) or rate Q&A/summaries no higher than other segments.

**B4**: $9.99 standard pricing converts at >5% from free to paid; $4.99 student pricing converts at >8%. **Falsifies if**: standard tier conversion <3% OR student tier shows minimal lift over standard.

**B5**: Low-data mode is used by users in emerging markets. **Falsifies if**: <20% of emerging-market users enable it, suggesting we misread the need.

**B6**: "All in one place" positioning (vs. "AI-powered") drives higher signup conversion. Test via A/B on the landing page. **Falsifies if**: AI-led messaging converts equally or better.

### 9.5 — Kill criteria

If the following thresholds are crossed during beta, we pause and reassess rather than push to launch.

**Hard kill criteria** (any one triggers a pause):
- Day-7 retention below 25%
- Free-to-paid conversion below 2% by end of closed beta
- More than 30% of users report AI quality is "unreliable" or "frequently wrong"
- Crash rate above 2% of sessions
- Average summary thumbs-down rate above 25%

**Soft kill criteria** (any two together trigger a pause):
- Day-30 retention below 15%
- Practice questions usage below 5% of active users
- Source traceability click-through below 5%
- Median session length below 5 minutes

If hard criteria are crossed: investigate root cause for 2 weeks. If unfixable, reconsider the MVP scope or business model before public launch.

If soft criteria are crossed: ship with experiments — feature-flag the underperforming feature, A/B test alternatives.

### 9.6 — Beta participant incentives and feedback

- **Free Pro access during beta** — all beta users get the paid tier for free. Pricing is tested separately via a small group of unbiased opt-in users.
- **In-app feedback** — every screen has a "Send feedback" floating button. Feedback is tagged by screen, captured with screenshot.
- **Weekly 5-question in-app survey** — short, dismissable. Asks about specific features and overall sentiment.
- **Optional 30-min interview** offered to 20% of beta users at week 3. Compensated with 3 months of post-beta Pro access.
- **A "must-have" survey at end of beta** — Sean Ellis question: "How would you feel if you could no longer use Bookflow?" If 40%+ say "very disappointed," we have product-market fit signal. Below 30%, we don't.

### 9.7 — What we change between beta phases

- After closed alpha → closed beta: Fix critical bugs, refine onboarding, ensure all wireframed features are stable. Don't add new features yet.
- After closed beta → public beta: Apply data-driven changes from B1–B6 hypothesis testing. Launch any A/B tests for soft-kill items. Lock pricing.
- After public beta → public launch: Lock infrastructure, finalize marketing copy based on what resonated, prepare support documentation.

---

## Part 10 — Open Decisions Before Engineering Begins

The MVP is now scoped, refined, and has a validation plan. Four technical decisions still need resolution before engineering scoping is complete.

- **TTS provider commitment** — ElevenLabs vs. OpenAI TTS vs. Google Cloud TTS. ElevenLabs has the best quality but highest cost; the caching strategy partially mitigates this. Beta will test whether voice quality is the differentiator we believe it is.
- **LLM provider for summaries / Q&A / questions** — Claude, GPT-4o, or Gemini. Each has different cost/quality tradeoffs that affect the token-cap math. Recommendation: Claude for Q&A and summaries (better source-grounding and longer context), with the option to swap if costs become prohibitive.
- **Cross-platform framework** — React Native vs. Flutter. Both viable; engineering preference and hiring market should drive this.
- **Public domain library integration** — direct API integration with Project Gutenberg vs. pre-curated catalog managed by Bookflow. Curation is more work but enables better metadata and discovery. Recommendation: pre-curated for MVP (200–500 titles), API integration for v2.

---

The MVP scope as defined in this document is intentionally tight. Resist the temptation to add features before beta data validates the core 18-feature loop (Read / Listen / Translate / Summarize / Q&A) actually retains users. Everything in the v2/later columns of Part 2 stays there until we have evidence.
