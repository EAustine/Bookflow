# M1 evidence — zero visual change

**Result: all five screens are pixel-identical.** Not "looks the same" — the
same bytes, compared channel by channel.

| | |
|---|---|
| Before | `main` @ `a9582c2` |
| After | `arch/m1-foundation` @ the monorepo conversion |
| Device | `bookflow_lowend` — 720×1600 @320 dpi, 2 cores, 2,473 MB |
| Build | **release** variant, both sides |
| Compared | 1,600 − 60 status-bar rows × 720 px × 5 screens ≈ **5.5 M pixels** |
| Differing | **0** |

```
screen                               size    differing        %   max Δ
01-welcome.png                 720x1600             0   0.000%       0
02-signup-empty.png            720x1600             0   0.000%       0
03-signup-checkbox-checked.png 720x1600             0   0.000%       0
04-signin-empty.png            720x1600             0   0.000%       0
05-signin-submitted.png        720x1600             0   0.000%       0
IDENTICAL — every paired screenshot matches pixel for pixel.
```

Reproduce: `./scripts/capture-screens.sh before|after` then
`python3 -I scripts/diff-screens.py`.

## Why only five screens

Five is everything reachable without an account. Flows 2–10 need the test
account that Phase D is still waiting on, so this proves the auth flow is
unchanged and says nothing about the rest. The structural argument covers
those: `tokens.ts` moved byte for byte, and `apps/app/src/design/tokens.ts`
re-exports it, so the 59 modules importing `~/design/tokens` resolve to the
same values through the same specifier.

## What had to be controlled, and why

Three things made early runs produce differences that had nothing to do with
M1. Each one would have been easy to report as a finding.

**Debug builds paint their own chrome.** The first attempt used a debug build,
which draws the expo-dev-client gear over the top-right corner and a LogBox
toast over the bottom. Both move between runs. Release builds carry neither.

**The status bar clock.** `12:00` in one run and `12:03` in the next is 75
changed pixels that mean nothing. `adb shell` demo mode pins the clock,
battery and signal; the top 60 rows are excluded from the comparison anyway,
because the status bar is system chrome rather than app output.

**A blinking caret.** The sign-in screen focuses its email field on arrival,
and a focused `TextInput` paints a caret that blinks. Two captures of the same
screen differ by the caret's phase. This is the one worth dwelling on, because
it is exactly the shape of a false positive:

```
same build, two runs:  165 px  x=86..89 (w=4)  y=524..566 (h=43)
```

A 4 × 43 vertical bar inside the email field. **Measured, not assumed** — the
harness was run twice against the *same* build, and the difference was
identical in count, position and magnitude to the one the before/after run had
produced. That is what established it as noise.

Focused-field screens were dropped from the set for this reason. `04` still
lands on a focused field because the screen focuses it automatically; its
caret happens to align across the final pair, and the noise-floor run above is
what justifies trusting that rather than hoping.

## Method note

The noise floor was measured **before** the result was believed: capture the
same build twice, diff, and only treat the harness as sound once that comes
back zero. Without it, the 165-pixel caret difference would have been a
plausible-looking regression to go hunting for.
