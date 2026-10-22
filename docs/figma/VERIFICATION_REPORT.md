# Bookflow — Figma ↔ app verification report

Ground rule 10, finally run against a real app render. Every frame in the Figma
file compared against the app running on a device, on both platforms.

| | |
|---|---|
| **Figma file** | `Rt3gjNC24kBTrncxlnkuPW` |
| **Branch** | `ui-cleanup` |
| **iOS** | iPhone 17 Pro simulator, 402 × 874 pt |
| **Android** | `bookflow_pixel9` emulator, 1080 × 2424 px @ 420 dpi = **411.4 × 923.4 dp** |
| **Figma base** | 393 × 852 |
| **Captures** | `docs/figma/verification/<platform>/` |

**On frame width.** Figma frames are 393 wide; Android runs at 411. Text wraps
differently as a result — the Welcome headline breaks after "to" on Android and
after "need" in Figma. That is the width, not a defect, and it is recorded as
**Match** wherever the content and layout are otherwise identical. Only genuine
differences are called out.

**Status key** — Match · Fixed (Figma was wrong, corrected) · Code bug (logged,
left for the user) · Could not reach.

---

## Flow 1 — Auth

| # | Frame | Node | Platform | Status | Note |
|---|---|---|---|---|---|
| 1 | `Auth / Splash / Default` | `146:2` | **iOS** | **Fixed (code)** | Same asset chain. Re-measured on the simulator after rebuild: ratio **0.659**, **96 pt** wide, centre **−36 pt** — matching the JS splash exactly |
| 1 | `Auth / Splash / Default` | `146:2` | Android | **Fixed (code)** | Shipped the retired logomark. Splash asset regenerated (F-41) and the whole icon set with it (F-42) — Android 12+ renders the launcher icon, not the splash asset. Re-measured on device: **0.662** against a canonical 0.661, was 0.895. Figma also draws a Lockup (outlined wordmark vectors) where the app draws a logomark SVG plus a live 36px `<Text>` |
| 2 | `Auth / Welcome / Default` | `146:32` | Android | **Match** | Lockup, illustration, headline with italic emphasis, sub-copy, CTA, sign-in link and legal line all present and correctly ordered. Wrap differs (411 vs 393) |
| 3 | `Auth / Sign up / Form` | `146:121` | Android | **Fixed** | Three Figma defects — see below |
| 4 | `Auth / Sign in / Form` | `146:187` | Android | **Fixed** | Four Figma defects — see below |
| 5 | `Auth / Sign in / Check your email` | `146:240` | — | **Could not reach** | Reaching it means submitting the form, which sends a real magic-link email. Not triggered |
| 6 | `Auth / Callback / Verifying` | `147:161` | — | **Could not reach** | Needs a magic link opened from an inbox |
| 7 | `Auth / Callback / Link expired` | `147:201` | — | **Could not reach** | Same |
| 8 | `Auth / Onboarding / Intent` | `147:258` | — | **Could not reach** | Post-auth |
| 9 | `Auth / Onboarding / First book` | `147:363` | — | **Could not reach** | Post-auth |
| 10 | `Auth / Returning user / Session restore` | `147:420` | — | **Could not reach** | Post-auth |

**4 of 10 frames reachable without an account: 1 match, 2 Figma defects fixed,
1 code bug fixed. 6 blocked.** (An earlier draft of this line said 5 of 10 —
it counted the splash twice, once per platform. The table has ten unique
frames and four of them were compared.)

### Splash — final state, both platforms

| | Android | iOS | JS splash draws |
|---|---|---|---|
| Shape (ink ratio) | **0.663** | **0.659** | 0.661 |
| Width | **96 dp** | **96 pt** | 96 |
| Centre vs screen centre | **−36 dp** | **−36 pt** | −36 |

Shape, size and position match on both, so the native → JS handoff no longer
moves. Android draws its icon from `assets/splash-icon-android.png` and iOS from
`assets/splash-icon.png` — deliberately different crops, because Android renders
the splash icon inside a fixed container and iOS full-screen.

### Sign up — what was wrong in Figma

1. **The back button was an empty circle.** The app draws `ArrowLeft`. Icon added.
2. **Invented helper text.** Figma showed *"We'll send a magic link"* under the
   Email field. That string is the screen's **subtitle** in code
   (`SignInScreen.tsx:174`), not a field helper — the frame showed it twice, once
   correctly and once in a slot the app never fills. `Show helper` set to false.
3. **Wrong legal copy.** Figma said *"By continuing, you agree to our…"*; the app
   says *"By creating an account, you agree to our…"* (`SignInScreen.tsx:249`).
4. Email and name fields were showing filled values on a frame named "Form";
   reset to the placeholders the app shows on arrival.

### Sign in — what was wrong in Figma

1. **Empty back circle**, same as sign-up. Icon added.
2. **Invented helper text**, same as sign-up. Hidden.
3. **A legal line that the app does not show here.** The code wraps it in
   `{isSignup && …}` — it is sign-up only. Removed.
4. **Wrong footer copy.** Figma *"New to Bookflow? Sign up"*; the app says
   *"Don't have an account? Sign up"* (`SignInScreen.tsx:269`).

### Confirmed working on Android

- The **3px focus ring** from F-5 renders on the focused field.
- The display font is **Fraunces SemiBold** after the A2 change, and the
  `fontWeight` removal left rendering untouched (0 pixels differed).

---

## Flows 2–10

**Blocked pending a test account.** The brief asks for an account with books,
reading progress, listen history, and a Free and a Pro state, and says not to
create one or use the personal account.

That is **98 frames**, 91% of the file, never compared against a render.

> **Disclosure:** the iOS simulator was already signed in as
> `eluroaustine3@gmail.com` from the first build, and the device checks run
> during Phases A–C (Library, Listen, Recently-listened, You, Settings, the
> Remove book sheet) used that session. Nothing was modified — the one
> destructive flow opened was cancelled — but those captures came from real
> personal data and are **not** included in `docs/figma/verification/`.

---

## Android icon-stroke check (F-3, 1.5 → 1.0)

**Not yet run.** The surfaces the brief names — tab bar, reader action bar,
Listen transport, Settings list — are all post-auth. Blocked on the test account.

What can be said from the auth screens: at 18px the back-arrow and the
checkbox read cleanly at 1.0 on a 420 dpi screen. That is the top of the size
range; the 16–18px question the brief asks about is really about the tab bar
and the transport controls, which are not yet reachable.
