# M2 evidence — the router cutover

**Four of five screens pixel-identical. The fifth differs by 3 pixels, and the
same build differs from itself by the same 3 pixels in the same place.**

| | |
|---|---|
| Before | M1 release build — hand-rolled `stage` machine |
| After | M2 release build — Expo Router as `main` |
| Device | `bookflow_lowend`, 720×1600 @320 dpi |
| Excluded | status bar (top 60 rows) and gesture pill (bottom 40) — system chrome |

```
screen                           differing   max Δ
01-welcome                               0       0
02-signup-empty                          0       0
03-signup-checkbox-checked               3     179   <- caret, see below
04-signin-empty                          0       0
05-signin-submitted                      0       0
```

## The 3 pixels

`03` focuses the Full name field, and a focused `TextInput` paints a blinking
caret. The noise-floor run — the **same router build captured twice** — gives:

```
03-signup-checkbox-checked               3     179   row 596
```

Same count, same row, same magnitude. It is the caret's blink phase, not the
router. This is the identical signature M1 hit at row 524, and it is why the
noise floor gets measured before the result is read.

## Two emulator artifacts that first read as a 7.5% regression

The first run reported **83,768 differing pixels** on `02`. Neither was the app:

1. **The floating IME toolbar** had come back. Disabling the IMEs does not
   survive an app reinstall, so it has to be redone before each capture run.
2. **An Android clipboard suggestion popup**, showing text from earlier in the
   working session. Worth knowing for its own sake: anything on the emulator's
   clipboard can appear in a screenshot.

Both were cleared and the run repeated. Recorded because a 7.5% difference is
exactly the size that looks like a real regression and would have sent someone
hunting through the router diff.

## What this does and does not prove

**Proves:** the auth flow renders identically under Expo Router. Welcome, sign
up, sign in, the checkbox state and the validation error state are the same
pixels as the stage machine produced.

**Does not prove anything about the signed-in app.** Library, Listen, Discover,
You, the reader and every drill-in are post-auth and unreachable without the
test account. The shell was moved wholesale and unmodified precisely because it
could not be tested — but "it compiles and the move was mechanical" is a weaker
claim than the pixel evidence above, and should not be read as more.

M2 cannot be signed off on this evidence alone. The brief asks for a Maestro
flow covering sign-in → library → book → reader → listen → you, which needs the
account.
