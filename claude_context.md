# Bookflow — Claude Code Session Context

_Last updated: 2026-04-29_

This file is a snapshot of where the Bookflow codebase stands at the end of the most recent Claude Code session. It captures decisions, what's shipping, what's half-built, and what the next session should pick up.

---

## 1. What Bookflow is (recap)

Mobile reading app combining **read + listen + AI summarize + Q&A + translate** in one experience. Two personas drive every call:

- **Ama** — 20yo Ghanaian Business undergrad, ESL, Android, $3–5/mo
- **David** — 34yo PM with dyslexia, premium-willing, $10–15/mo

Full product scope lives in `/docs/specs/bookflow_mvp_scope.md`. Tech stack and rules live in `/CLAUDE.md` (read at session start). Both are decided — don't propose alternatives.

---

## 2. Tech stack (locked in)

- **App**: React Native + Expo (managed), TypeScript strict, Expo Router (file-based — though most of the app currently lives in `App.tsx` while M1 stabilizes)
- **Styling**: NativeWind + custom token system in `src/design/tokens.ts`. Cream-50 (`#FAF7F2`) is the canvas color, never pure white.
- **State**: Zustand (global), TanStack Query (server). _Not yet wired — current screens read from mocks._
- **Backend**: Supabase (auth + Postgres + storage + edge fns + pgvector)
- **Subscriptions**: RevenueCat
- **LLM**: Anthropic (Sonnet 4.5 hard, Haiku 4.5 cheap)
- **TTS**: ElevenLabs Turbo v2.5
- **Email**: Resend (now wired as Supabase custom SMTP)
- **Analytics / crash**: PostHog / Sentry
- **Icons**: `@tabler/icons-react-native` via `~/components/Icon` wrapper, `strokeWidth={1.5}` enforced
- **Bottom sheets**: `@gorhom/bottom-sheet` only

Path alias `~/` → `src/`.

---

## 3. Project layout (current)

```
bookflow/
├── App.tsx                          # Single-file stage machine (splash→welcome→signin/signup→authCallback→onboarding→library)
├── src/
│   ├── components/
│   │   ├── Button.tsx               # Canonical — destructive variant is now SOLID-FILLED
│   │   ├── Icon.tsx                 # Tabler wrapper, strokeWidth=1.5
│   │   ├── Input.tsx
│   │   ├── ListRow.tsx
│   │   ├── BottomSheet.tsx          # Wraps @gorhom/bottom-sheet
│   │   ├── TabBar.tsx               # SHARED bottom tab bar (Library/Discover/Listen/You)
│   │   ├── Text.tsx                 # Named-typography wrapper
│   │   └── index.ts
│   ├── design/
│   │   └── tokens.ts                # All colors/spacing/typography
│   ├── lib/
│   │   ├── supabase.ts              # ⚠ Hybrid flowType: PKCE on native, implicit on web
│   │   ├── auth.ts                  # parseAuthCallback + completeAuthCallback (NEW unified API)
│   │   ├── revenuecat.ts
│   │   └── ...
│   ├── screens/
│   │   ├── SplashScreen.tsx
│   │   ├── WelcomeScreen.tsx
│   │   ├── SignInScreen.tsx
│   │   ├── SignUpScreen.tsx
│   │   ├── AuthCallbackScreen.tsx   # verifying / error states
│   │   ├── OnboardingIntentScreen.tsx
│   │   ├── OnboardingFirstBookScreen.tsx
│   │   ├── LibraryScreen.tsx        # Uses shared TabBar, accepts onTabChange
│   │   ├── YouScreen.tsx            # NEW — profile/plan/settings/sign-out
│   │   └── ComingSoonScreen.tsx     # NEW — Discover/Listen placeholder
│   ├── data/mockBooks.ts
│   └── types/book.ts
└── docs/specs/                      # Design system + product scope
```

---

## 4. What's built and working

### 4a. Design system

- **Tokens** (`src/design/tokens.ts`) — colors (canvas, surface, raised, accent, error, forest-800, etc.), spacing scale, radii, font families (Fraunces display, Geist body), named typography variants.
- **`<Text>` component** — named variants (`display-lg`, `heading-md`, `body-sm`, `label-md`, etc.) with semantic color props (`muted`, `subtle`, `inverse`, `secondary`).
- **`<Button>`** — primary / tertiary / **destructive (solid-filled)** variants. `destructive` was repurposed from a transparent + red label to error-bg + cream-label with `#9C3B30` pressed state. Confirmed zero pre-existing usages before changing.
- **`<Icon>`** — Tabler wrapper. Recently added: `Logout`, `Microphone`, `HelpCircle`, `TextSize` (in addition to the existing set).
- **`<TabBar>`** — shared component. Tab order: **Library / Discover / Listen / You**. Uses `useSafeAreaInsets` with `Math.max(insets.bottom, tokens.space.sm)` for home-indicator clearance. Exports `TabKey` type.

### 4b. Auth — magic-link sign-in/sign-up (Step 1)

- Welcome → SignIn / SignUp screens send a magic link via `supabase.auth.signInWithOtp` with `emailRedirectTo: AUTH_CALLBACK_URL` (`Linking.createURL('/auth/callback')`).
- `signin` variant uses `shouldCreateUser: false` so typos fail loudly instead of silently signing somebody up.
- Marketing-consent flag persisted as `marketing_consent` on signup metadata.
- `humanizeAuthError` maps Supabase errors to neutral copy (rate limit, user-not-found, invalid-email, network).
- **Resend SMTP** wired into Supabase for transactional sends (no domain purchased — using Resend's stopgap).
- Custom URL scheme `bookflow://` registered in `app.json`.
- Both `bookflow://auth/callback` (native) and `http://localhost:8081/auth/callback` (web) added to Supabase Redirect URL allowlist.

### 4c. Auth — callback handling (Step 1B, **just refactored**)

**Hybrid flow as of this session:**

- `src/lib/supabase.ts` sets `flowType = Platform.OS === 'web' ? 'implicit' : 'pkce'`.
- `src/lib/auth.ts` exports a unified API:
  - `parseAuthCallback(url)` returns a discriminated union:
    - `{ kind: 'code', code }` — PKCE query param (native)
    - `{ kind: 'tokens', accessToken, refreshToken }` — implicit-flow URL fragment (web)
    - `null` — not an auth callback
  - `completeAuthCallback(payload)` dispatches to `exchangeCodeForSession` or `setSession`.
  - `parseAuthCallbackCode` and `exchangeAuthCallbackCode` retained as thin shims for backwards compat (marked deprecated).
- `App.tsx` deep-link `useEffect` uses the new `parseAuthCallback` + `completeAuthCallback` pair. Fires on both `getInitialURL` (cold start) and `Linking.addEventListener('url', …)` (warm start). On success → `onboardingIntent`. On failure → `authCallbackError` with categorized error kind.
- `setupRevenueCatAuthSync()` hooks `SIGNED_IN` / `SIGNED_OUT` events to log RevenueCat in/out.

**Why hybrid?** PKCE on web requires the email-link click to land in the same browser/profile/origin that requested it (verifier lives in localStorage). In dev that's brittle — different default browser, different tab. Implicit flow returns tokens directly in the URL fragment, no verifier to lose. This is Supabase's recommended pattern for hybrid RN + Web apps.

### 4d. Session restoration

- Cold-start `useEffect` calls `supabase.auth.getSession()` and, if a persisted session exists, jumps from `splash` → `library`. Functional setter guards against racing the deep-link handler — a fresh magic-link verification always wins precedence.

### 4e. Onboarding (placeholder)

- `OnboardingIntentScreen` (intent picker) → `OnboardingFirstBookScreen` (curated first book) → `library`.
- Both have `Skip` paths. Persistence is a TODO (M2): `signup_intent_picked` / `signup_first_book_picked` events to PostHog, write `onboarding_intent` to profile, copy curated book into `user_books`.

### 4f. Library tab

- `LibraryScreen` renders header (greeting + your library), Continue card (most-recent in-progress book with Listen/Read CTAs), all-books list with status (Finished / Not started / `X% · last read N days ago`).
- Uses shared `<TabBar>` and accepts `onTabChange` prop lifted to `App`.
- All data from `src/data/mockBooks.ts`. `NOW` is hardcoded to `2026-04-28T10:00:00` for stable relative-time strings.

### 4g. You tab + sign-out flow

- `YouScreen.tsx` built per `/Users/completefarmer/Downloads/you_tab.html`:
  - Page header + tappable profile card (avatar with initials fallback, name, email, chevron)
  - Plan card (forest-800 bg, three meters: audio, AI credits, books — auto-amber at ≥80%)
  - Reading section, Account section (with destructive Sign out row), Support section, version footer
- Sign-out triggers a `BottomSheet` confirmation with **stacked CTAs** (per design rule #2): destructive primary on top, tertiary Cancel below.
- `SignOutSheetBody` calls `onSignOut()` which is handled in `App.tsx`:
  - `await supabase.auth.signOut()` (warns on failure, doesn't block — local session is cleared anyway)
  - reset `activeTab` to `'library'` so next sign-in lands on the right tab
  - `setStage('welcome')`
- `getInitials(name, email)` falls back to email local-part when name is empty.

### 4h. Coming-soon tabs

- `ComingSoonScreen` placeholder for Discover and Listen. Honest empty-state copy explaining what'll live there + shared TabBar so user can navigate away. Per CLAUDE.md "honest empty/edge states".

### 4i. App stage machine

`App.tsx` is a single-file stage machine (no React Navigation yet — kept simple for M1):

```
splash → welcome → signin / signup → authCallback → (success) → onboardingIntent → onboardingFirstBook → library
                                  ↓                                                                       ↑
                                  authCallbackError                                                       │
                                                                                                          │
session restore (cold start, persisted token) ───────────────────────────────────────────────────────────┘
```

Within `library` stage, `activeTab` state routes between `LibraryScreen`, `YouScreen`, `ComingSoonScreen`. Tab state lives at App level so it survives screen re-renders and can be deep-linked into later.

---

## 5. Known fixes applied this session

| Issue | Fix |
|---|---|
| Supabase free-tier SMTP rate-limited | Configured Resend custom SMTP |
| `flowType` defaulted to implicit but code used PKCE methods | Explicit `flowType` per platform |
| Wrong Redirect URL in Supabase | User-side config corrected |
| `pointerEvents` deprecation noise from gorhom/bottom-sheet | `LogBox.ignoreLogs(['props.pointerEvents is deprecated'])` in `App.tsx` |
| Red-overlay risk from `SafeAreaView` from `react-native` | Switched all screens to `react-native-safe-area-context`, wrapped App in `SafeAreaProvider` |
| `PKCE code verifier not found in storage` (web magic-link) | **Hybrid flow** — implicit on web (no verifier needed), PKCE on native |

---

## 6. What's pending

### Auth track (unblocks everything user-facing)

1. **Step 1B verification** (immediate next) — test magic-link end-to-end on web after the hybrid flow refactor. Click email link → should hit the implicit-flow branch → `setSession` with tokens from fragment → land on `onboardingIntent`. Native test (iOS Simulator, Android emulator) should still hit PKCE branch unchanged.
2. **Step 2 — Google OAuth** — `expo-auth-session` + `supabase.auth.signInWithIdToken({ provider: 'google', token })`. Wire into `WelcomeScreen` / `SignInScreen` / `SignUpScreen` "Continue with Google" buttons.
3. **Step 3 — Apple OAuth** — `expo-apple-authentication` + `signInWithIdToken({ provider: 'apple', token, nonce })`. iOS-only button.

### M2 (real data layer)

- Replace `MOCK_PROFILE` / `MOCK_PLAN` in `App.tsx` with real Supabase queries (TanStack Query).
- Replace `mockBooks.ts` reads in `LibraryScreen` with `user_books` query.
- Persist `onboarding_intent` to profile table + PostHog `signup_intent_picked` event.
- Persist first-book selection (copy curated row into `user_books`) + PostHog `signup_first_book_picked`.
- Returning-user routing: query `profile.onboarding_intent` after auth callback — if set, skip onboarding straight to library. Right now every sign-in lands on intent picker (Skip gets you through in 2 taps but isn't ideal).

### M2+ feature work (per scope doc)

- Reader screen + EPUB parsing (`epubjs`)
- Audio playback + bimodal sync (`expo-av` or `react-native-track-player`, ElevenLabs streaming)
- AI chapter summaries (Haiku 4.5)
- Q&A with source citations (Sonnet 4.5 + pgvector)
- Inline translation
- Cost-transparency UI before whole-book operations
- Quality ratings (👍/👎 + reason chips) on AI output

---

## 7. Where we stopped

Right after the **hybrid auth flow refactor**:

1. `src/lib/supabase.ts` — `flowType` is platform-conditional ✅
2. `src/lib/auth.ts` — added `parseAuthCallback` (discriminated union) + `completeAuthCallback` (dispatches to `exchangeCodeForSession` or `setSession`); kept old names as deprecated shims ✅
3. `App.tsx` — deep-link handler uses the new unified API ✅
4. `npx tsc --noEmit` — clean ✅

**Next action**: user tests Step 1B on web. Expected behavior: magic-link click in any browser → tokens in URL fragment → `setSession` succeeds → onboarding. No more "PKCE code verifier not found" because web no longer uses PKCE.

If Step 1B passes, move to Step 2 (Google OAuth).

---

## 8. House rules that bind every change

(Distilled from `CLAUDE.md` — re-read it before any non-trivial change.)

- **No alternative library proposals** — stack is locked in.
- **Tokens, not magic numbers** — every color/spacing/radius/typography goes through `src/design/tokens.ts`.
- **Cream-50 background**, not pure white.
- **Buttons never truncate** — switch to stacked layout instead.
- **Confirmation sheets always stacked**, never side-by-side. (YouScreen sign-out follows this.)
- **Chevrons mean "drills into more"**, not "tappable."
- **Disabled states must explain why** in a sub-label.
- **Destructive actions always trigger a confirmation sheet** — never fire on tap. (Sign-out follows this.)
- **Tap target is the entire row** for toggles.
- **Icons via `~/components/Icon`** wrapper, never raw Tabler imports. `strokeWidth={1.5}`.
- **One primary button per surface**, max.
- **Loading buttons use spinner**, not "Loading…" text.
- **Source traceability is non-negotiable** — every AI-generated claim must cite source chapter/page.
- **Cost transparency before AI actions** — show estimated credits.
- **Stream LLM output**, don't spinner-then-dump.
- **Local-first reading** — once downloaded, reading + listening work offline.
- **Cache aggressively** — TTS and LLM responses by content+voice.
- **TypeScript strict** — no escape-hatch types because "it's just a prototype."

---

_End of context. The next session can resume by reading this file + `CLAUDE.md` and picking up at §6 / §7._
