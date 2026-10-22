# Release QA — `ui-cleanup`

Every user-visible change on this branch and the round before it, with the
screen to open and what "correct" looks like. Written to be run on a
**physical Android device**, because that is where the risk is concentrated:
font-family resolution, icon stroke at small sizes, the hardware back button,
and the native splash all behave differently there than on a simulator.

**How to read a row.** *Check* is what to do. *Correct* is what you should see.
*Why it might break* is the specific thing that would have gone wrong — worth
knowing so you can tell a real regression from a difference you were expecting.

Severity: 🔴 would block a release · 🟡 visible but shippable · ⚪ cosmetic.

---

## A. First launch — the splash and the brand marks

These changed most recently and are the least verified on real hardware.

| # | Check | Correct | Why it might break |
|---|---|---|---|
| A1 🔴 | Cold-start the app (force stop first) | The logomark is a **shallow, wide arch** — noticeably wider than it is tall. It should **not** change shape, size or position when the animated splash takes over | The asset shipped the retired, taller mark until F-41/F-42. Android 12+ also draws the splash icon from a *different* asset than iOS; if the handoff jumps, the Android-specific crop is wrong |
| A2 🔴 | Same cold start, watch the whole splash | The mark draws itself on left-to-right over ~1.2s, the wordmark fades in, then **one** slow breath (grow and settle) before the app appears. Total ~3.1s | The breath used to never run at all — session restore cut the splash at 1.25s |
| A3 🟡 | Home screen / app drawer icon | Shallow wide arch, cream on dark green | Launcher icon was the retired mark |
| A4 🟡 | Pull down a Bookflow notification | Small white arch, shallow | Notification icon was the retired mark |
| A5 ⚪ | Recents / task switcher | Icon matches the launcher | — |

> On Android the splash icon comes from `assets/splash-icon-android.png`; on
> iOS from `assets/splash-icon.png`. They are deliberately cut differently —
> Android draws it in a fixed icon container, iOS full-screen.

---

## B. Typography — the Fraunces weight change

**The single widest-reaching change on the branch.** Every Fraunces surface in
the app moved from Medium 500 to **SemiBold 600**, because Figma has no Fraunces
Medium and the two had to agree. `displayBold` moved up to Bold 700 to keep its
contrast.

| # | Check | Correct | Why it might break |
|---|---|---|---|
| B1 🔴 | Library / Discover / Listen / You tab titles (28px) | Fraunces, noticeably sturdy, evenly weighted. Not wispy, not heavy | Largest type carries the weight change most visibly |
| B2 🔴 | Welcome headline, "Everything you need to *read better*." | The italic emphasis still reads as a different cut, not just slanted | Italic is a separate family; if it fell back it will look mechanically slanted |
| B3 🟡 | Splash wordmark "Bookflow" | **Heavier than** the tab titles — it is Bold 700 against their SemiBold 600 | If `displayBold` silently resolves to the same family, the wordmark flattens |
| B4 🟡 | Onboarding → first book, the fake book covers | Tiny title on the cover art is Fraunces Bold, author below it italic | 11px Bold and 9px italic are the smallest Fraunces in the app — most likely to look muddy |
| B5 🟡 | Book detail title (22px), sheet titles (17–20px), reader chapter title (20px) | Crisp, no blurring of the serifs | — |
| B6 ⚪ | Any small Fraunces cover caption (6–9px) | Legible rather than a smudge | A heavier face at 6–9px is where this change is most likely to hurt |

> `fontWeight` was removed from all 107 Fraunces style objects. It was inert —
> verified pixel-identical on both platforms — so **nothing here should look
> different because of that**. If something does, it is a real finding.

---

## C. Icons — stroke 1.5 → 1.0

Set in the previous round, never checked on a real screen. A physical device at
full brightness is the honest test; emulators over-sharpen.

| # | Check | Correct | Why it might break |
|---|---|---|---|
| C1 🔴 | Tab bar, all four icons, at normal brightness | Clearly legible, strokes do not disappear or shimmer | 1.0 at ~24px is the thinnest in the app |
| C2 🔴 | Reader action bar | Same | Often viewed in a dark room at low brightness |
| C3 🔴 | Listen transport controls | The ±15s and skip glyphs read as distinct from each other | They differ only by small details at 1.0 stroke |
| C4 🟡 | Settings list, every row icon in its tile | Legible at 16–18px inside the 32px tile | The brief's specific question |
| C5 🟡 | Same screens with the device at minimum brightness | Still legible | Thin strokes fail first in low light |
| C6 ⚪ | Filled glyphs — Play, Pause, thumbs | Solid, not outlined | They paint from `fill` with `strokeWidth={0}` |

---

## D. Settings and the You tab — rows and headers (F-30)

The largest structural change. Every sub-page header and nearly every settings
row was replaced.

| # | Check | Correct | Why it might break |
|---|---|---|---|
| D1 🔴 | You → Settings → Reading display → back, using the **hardware back button** | Returns to Settings, not to the You tab and not out of the app | The Android back handler **moved** into the shared `SubHeader`. Nesting relies on handlers stacking correctly |
| D2 🔴 | Same for Default voice, Playback speed, Translation language, Notifications, Help & FAQ, Send feedback | Each returns one level | Seven screens share one handler now |
| D3 🔴 | You → Account → Edit profile → hardware back | Returns to Account, **once** — not skipping two levels | Edit profile used to register its own handler as well; the duplicate was removed |
| D4 🔴 | Walk You → Settings → a drill screen | The title stays **left-aligned** the whole way. It must not slide to centre | Drill screens used to use a centred header |
| D5 🟡 | Settings, four drill-in rows (Reading display, Default voice, Playback speed, Translation target) | Each shows its current value **and** a chevron | Hint and chevron are modelled separately now |
| D6 🟡 | Settings → **Clear cache** | **No chevron.** It is an action, not a drill-in | It had one before; chevrons are supposed to mean "drills into more" |
| D7 🔴 | Settings → **Resume after calls**: tap the row label, not the switch | The toggle flips | Toggle rows used to be tappable only on the switch itself |
| D8 🔴 | Same for Usage warnings and Product updates (grant notification permission first) | Row tap flips the switch | — |
| D9 🟡 | Settings → Clear cache sub-label | Reads to the end: "…Books and progress stay." Not truncated mid-word | Shared rows clamp sub-labels to one line; this one is explicitly allowed two |
| D10 🟡 | Settings → Downloaded audio | Sits in a normal row with a music-note tile, honest sub-label | — |
| D12 🟡 | You → Account & subscription, every row | **No chevrons anywhere.** Verify student status shows "$4.99/mo" and nothing else | Five rows had a chevron and none of them drills in — two open a browser, one opens an email draft |
| D13 🔴 | Same screen, bottom two rows | **Sign out and Delete account are both red**, with plain icon tiles like every other row | Delete account used to be grey and the destructive rows used to have pink icon tiles. The spec says the label alone carries the colour |
| D14 🟡 | Compare Sign out here with Sign out on the You tab | Identical | They genuinely differed before this round |
| D11 🟡 | Deny notification permission, reopen Settings | The three notification rows are dimmed, their switches greyed and off, and the banner above explains why | Dimming is a prop on the shared row now |

---

## E. Listen

| # | Check | Correct | Why it might break |
|---|---|---|---|
| E1 🟡 | Listen tab → "Recently listened" block | Rows are compact: small covers, tight. Active row tinted green with a pause glyph | Two row components were merged into one with a size |
| E2 🟡 | Tap "See all" → Recently listened page | Rows are **larger** than the block you came from — bigger covers, more padding | If both look the same, the size prop is not being applied |
| E3 🟡 | Both screens, a book that is currently playing | Animated equaliser bars on the active row; others show a play triangle | — |
| E4 ⚪ | Listen tab → "This month" cards | Three cards with units attached to the numbers ("3.7h", "650m") and a small line under each | Unit and delta were only added to the design recently |
| E5 🟡 | Now playing, pause and resume | The hero card darkens when paused and the transport dims | Those colours moved to tokens |
| E6 🔴 | Playback speed sheet | Speeds go up to **2×**. There is **no 3×** | 3× used to be offered and could not be saved |

---

## F. Discover and book detail

| # | Check | Correct | Why it might break |
|---|---|---|---|
| F1 🔴 | Discover → a book → **Remove from library** | A **bottom sheet** slides up. **Not** a native Android dialog | Removal used to use a native alert here while Library used a sheet |
| F2 🔴 | In that sheet | Buttons stacked — red "Remove book" on top, "Cancel" below. Never side by side | — |
| F3 🔴 | Confirm the removal | The book goes, and the Add button returns to "Add to library" | The whole removal path was rewritten |
| F4 🟡 | Book detail bottom bar, a book **not** in your library | One wide dark-green "Add to library" button, taller than before | The CTA is the standard button at Large now |
| F5 🟡 | Tap Add and watch | A **spinner**, not the Android system loading wheel, and the label reads "Adding…" | — |
| F6 🟡 | Book detail for a book **in** your library | **Outlined** button reading "Remove from library", with a square play button beside it at the same height | **Deliberate change** — it was a pale green fill. Flag it if you dislike it |
| F7 🟡 | Book detail, below the title | Just a green "Free" badge. **No** "Read time" or "Chapters" stats, no "If you like this" rail | Those were removed; they never had data |
| F8 ⚪ | Book detail topic tags, and tags on a category row | Detail tags are larger and darker; category-row tags smaller and lighter | They are one component with two sizes now |
| F9 🟡 | Discover home, tap the **"For you"** chip | The page scrolls back to the top | It used to do nothing |
| F10 🔴 | Discover home on a cold start | Books load. If some sources fail you should still see the ones that worked | **Known issue (F-39)** — a total-failure state has been seen while 748 books had loaded |

---

## G. Inputs, buttons, toggles

| # | Check | Correct | Why it might break |
|---|---|---|---|
| G1 🟡 | Sign-in, tap the email field | A soft green halo appears **outside** the border. The field must not jump or resize | The ring is reserved permanently and painted on focus |
| G2 🟡 | Any primary button mid-action | A thin circular spinner, label hidden. Never the Android system wheel, never the word "Loading" | — |
| G3 🔴 | Compare a toggle on You with one in Settings | **Identical size.** Both small, dark green when on | Three different switches used to ship |
| G4 🟡 | Any button label | Slightly heavier than body text — Medium, not Regular | Button labels silently rendered Regular before F-17 |
| G5 🟡 | A standard list row label vs a compact one | Standard is heavier; compact is lighter | The per-size weight is carried by the font family now |

---

## H. Sign out and delete account

| # | Check | Correct | Why it might break |
|---|---|---|---|
| H1 🔴 | You → Sign out | Sheet with a red icon tile, "Sign out?", stacked buttons | Three near-identical sheets were merged into one |
| H2 🔴 | Account → Sign out | **Identical** to H1 | They used to differ in whitespace |
| H3 🔴 | Account → Delete account | Same shape, trash icon, "Delete my account" | Shares the component now |
| H4 🔴 | Actually sign out, then back in | Works end to end | — |

---

## I. Things that should look *unchanged*

If any of these differ, it is a regression, not an expected change.

| # | Check | Correct |
|---|---|---|
| I1 | Pro plan card on You | Same as before — colours moved to tokens, values identical |
| I2 | Now-playing hero card | Same as before — 28 colour literals moved to tokens, values identical |
| I3 | Every Fraunces screen, ignoring the weight change in §B | Same layout and line breaks |
| I4 | Reader, all three themes | Light, Sepia and Dark unchanged. The Full/Text pill is dark-tinted on the Dark theme |

---

## J. Known open issues — do not raise these as new

| ID | What you will see |
|---|---|
| **F-39** | Discover can show "Couldn't reach the catalog" even when several sources returned books |
| **F-38** | The EPUB full-mode reader does **not** render Fraunces or Literata — it falls back to Noto Serif on Android, Georgia on iOS, and headings and body share one face |
| **F-33** | Credit top-up prices in Figma are placeholders |
| **F-27** | Adding a book past the free cap jumps straight to the hosted paywall with no state on the button |

---

## Coverage note

Everything in §A was measured on the Pixel 9 emulator. **§B through §I were
verified on an emulator and simulator only** — never on physical hardware, and
large parts of the app were never reachable at all during verification because
it needed a signed-in test account. Sections C (icon stroke in real light) and
D (hardware back) are the ones a physical device is most likely to disagree
about.
