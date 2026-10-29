# RevenueCat paywall build sheet

How to rebuild the Bookflow paywall in the RevenueCat Paywalls editor so the iOS and Android apps match the web paywall designed in Figma.

| | |
|---|---|
| Figma source | `Components · Organisms` › `Paywall` (`336:1031`), variants Selected = Yearly / Monthly / Student |
| Plan card | `Components · Molecules` › `Plan option` (`334:22767`) |
| Frames | `Monetisation` page: Paywall / AI credits / Medium, Expanded, Desktop |
| Web | our own page (Stripe through RevenueCat Web Billing), same layout |
| Apps | RevenueCat Paywalls editor, one paywall template attached to the default offering |

Prices and caps follow the MVP scope: Standard $9.99 a month or $79 a year, Student $4.99 a month; Free gets 2 books, 90 minutes of audio and 50K AI credits a month. The app reads prices from the store, so set the store products to these prices. The live caps are still 60 minutes and 5 books; changing them is separate work. In RevenueCat, prices always come from the store through package variables, so only the copy names amounts.

## 1. Offering and packages

| Package | Identifier | Product | Default selected |
|---|---|---|---|
| Monthly | `$rc_monthly` | Standard monthly | no |
| Yearly | `$rc_annual` | Standard yearly | **yes** |
| Student | custom `student_monthly` | Student monthly | no |

Student needs a verified student email before purchase. In the app, the Student package opens the verification flow first. If that isn't built yet, leave Student out of the offering; the layout works with two packages.

## 2. Per-trigger copy (custom variables)

The paywall has four triggers. Only the eyebrow, headline and subline change between them. Text components can't read custom variables, so build four header stacks and give each one a visibility rule tied to one custom variable. Pass exactly one of these from the app when you present the paywall:

| Custom variable | Eyebrow | Headline | Subline |
|---|---|---|---|
| `trigger_audio` | FREE LIMIT REACHED | You've used your 90 minutes of audio for this month | Upgrade to keep listening, or come back next month for a fresh 90 minutes. |
| `trigger_library` | LIBRARY FULL | Your library is full: 2 of 2 books | Remove a book to add a new one, or upgrade for an unlimited library. |
| `trigger_ai` | FREE LIMIT REACHED | You're out of AI credits for this month | Summaries, questions, and Q&A use AI credits. Upgrade for 500K credits a month, or come back when yours reset. |
| `trigger_offline` | STANDARD FEATURE | Download books to listen offline | Offline audio comes with Standard, along with unlimited books and audio. |

A fifth, no-variable header ("Upgrade to Standard") covers the plain "Upgrade to Standard" button on the You tab.

## 3. Usage meters (Custom component)

The usage block (AI credits, Audio, Books with bars) needs live numbers, so build it as one **Custom component** (HTML, CSS and JS; decorative only, no purchase UI). Pass the values as custom variables and read them with `ctx.custom`:

| Variable | Example | Notes |
|---|---|---|
| `ai_used`, `ai_cap` | 50000, 50000 | show as "50K / 50K"; bar and value turn error red when used ≥ cap |
| `audio_used_min`, `audio_cap_min` | 18, 90 | "18 / 90 min" |
| `books_used`, `books_cap` | 1, 2 | "1 / 2" |

If the Custom component isn't worth it for v1, hide the block on native. The headline already says which limit was hit.

## 4. Layout, top to bottom

| # | Figma layer | RevenueCat component | Settings |
|---|---|---|---|
| 0 | Close | Header › Button, action Navigate back | Tabler `x` icon 20, 36 circle, fill surface |
| 1 | heading | Stack (vertical, gap 8) × 5, one per trigger | rule: visible when its custom variable is present |
| 1a | Eyebrow | Text | Geist Medium 12, tracking 8%, uppercase, accent |
| 1b | Headline | Text | Fraunces SemiBold 28/34, text primary |
| 1c | Subline | Text | Geist Regular 15/22, text secondary |
| 2 | usage | Custom component | see section 3; surface fill, radius 12, padding 14/16 |
| 3 | "Bookflow Standard includes" | Text | Geist Medium 17, text primary |
| 4 | features | Feature list (2 columns) | 8 rows, Tabler `check` 16 in accent, Geist 15 text primary, gap 16 × 10 |
| 5 | plans | Stack (horizontal, gap 12) of 3 Package | see section 5 |
| 6 | CTA | Purchase button | rectangle, radius 10, height 52, full width, fill amber/500, label forest/900 Geist Medium 17: `Start with {{ product.period_with_unit }} · {{ product.price }}` (check the exact variable names in the editor's variable picker) |
| 7 | secondary | Stack (horizontal, space between) | Button "Maybe later" (Navigate back), Button "Restore purchases" (Restore), both Geist Medium 15 accent, no fill |
| 8 | fine print | Text | Geist 12, text muted, centred. Native copy: "Billed through the App Store / Google Play. Cancel anytime in your store settings." |

Paywall padding 40 left and right (24 on phones), 28 top, 24 bottom, gap 18. Background canvas.

## 5. Package (plan option)

| | Default | Selected |
|---|---|---|
| Fill | canvas `#FAF7F2` | accent muted `#DAE6DC` |
| Border | 1px border subtle | 2px accent (forest/800) |
| Radio | 18 circle, 1.5px border default | 18 circle, 5px accent ring |
| Radius | 12 | 12 |

Inside each package: name (Geist Medium 13, uppercase), price (Fraunces SemiBold 22, `{{ product.price }}`), detail (Geist 13 muted, e.g. `per year · {{ product.price_per_month }} a month`), and on Yearly a badge "Save 34%" (Geist Medium 12, forest/800 on `#EFF4F0`, radius 6).

## 6. Tokens to enter in the editor

| Token | Hex |
|---|---|
| canvas (`color/bg/canvas`) | `#FAF7F2` |
| surface (`color/bg/surface`) | `#F5F1E8` |
| text primary | `#1A1A1A` |
| text secondary | `#3D3A36` |
| text muted | `#6B6862` |
| accent (`color/bg/accent`, forest/800) | `#1B4332` |
| accent muted (`color/bg/accent-muted`) | `#DAE6DC` |
| badge fill (forest/50) | `#EFF4F0` |
| upsell (`color/bg/upsell`, amber/500) | `#D4A574` |
| upsell pressed (`color/bg/upsell-pressed`, amber/600) | `#B89065` |
| on upsell (`color/text/on-upsell`, forest/900) | `#0E2A21` |
| error (`color/text/error`) | `#B5453A` |
| border subtle | `#D8D5CC` |
| border default | `#B5B2AB` |

Fonts: upload Fraunces (SemiBold 600) and Geist (Regular 400, Medium 500), each file under 2 MB. On Android, also register them as app resources.

Dark mode: Bookflow's app UI is light only (dark is a reader theme), so set the paywall to light.

## 7. Check before shipping

- [ ] The yearly package is selected by default and the CTA text follows the selection
- [ ] Each trigger variable shows only its own header
- [ ] Restore purchases works on both stores
- [ ] Prices show the store's localised price; no hard-coded amounts anywhere in copy
- [ ] Side-by-side screenshot against the Figma frame at 393 wide
