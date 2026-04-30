# Bookflow — Design System Specification

*High-fidelity design system. Source of truth for visual decisions. To be implemented by engineering and used as reference for hi-fi mockups.*

---

## Part 1 — Brand Foundation

### Positioning anchor

**"Everything you need to read better — in one app."**

The visual identity must reinforce three things, in order of priority:

1. **Trust** — users are uploading their personal books, paying real money, and trusting AI summaries. The design must feel reliable, not flashy.
2. **Calm focus** — Bookflow is used during deep work and study. The visual environment should reduce cognitive load, not add to it.
3. **Literary craft** — we're a reading app. We should feel like we belong in the literary world, not the SaaS world.

### What we're NOT

- Not a generic AI app (no purple gradients, no shimmering effects, no "AI" iconography)
- Not childish or playful (we're for serious students and adults, not kids)
- Not corporate-sterile (no flat blue, no Inter on white)
- Not utilitarian-bland (Kindle's design language is competent but lifeless)

### Visual mood

Think: a thoughtfully-designed independent magazine like *The Atlantic* or *Aeon*. Or a quiet, well-lit library on a cold afternoon. Or the cover of a Penguin Modern Classics edition.

---

## Part 2 — Color System

### Why warm forest green

Most reading apps default to either cool blue (Audible, Kindle) or AI-cliche purple. Both miss the literary opportunity. **Warm forest green** evokes:

- Old library bindings and leather-bound books
- Focus and groundedness (calmer than blue, less corporate)
- Trust and longevity (greens are commonly associated with finance, stability, and growth — useful adjacencies for a paid subscription product)

It also has practical advantages: it works against both warm cream backgrounds AND in dark mode without losing identity.

### Primary palette

```
PRIMARY (Forest)
forest-900   #0E2A21    Deepest — text on cream, primary buttons
forest-800   #1B4332    PRIMARY BRAND — buttons, key accents, logo
forest-600   #2D5A3F    Hover states, secondary emphasis
forest-400   #4A7C59    Muted accents, icons in active state
forest-200   #B7CCB9    Surface tints, dividers in green sections
forest-100   #DAE6DC    Tinted backgrounds, success states
forest-50    #EFF4F0    Subtle hover tints

NEUTRALS (Paper & Ink)
ink-900      #1A1A1A    Primary text (NOT pure black)
ink-700      #3D3A36    Body text, headings on cream
ink-500      #6B6862    Secondary text, captions
ink-400      #8A8780    Tertiary text, hints, disabled
ink-300      #B5B2AB    Borders, dividers
ink-200      #D8D5CC    Light borders
ink-100      #ECE9E0    Subtle dividers
cream-50     #FAF7F2    PAGE BACKGROUND (NOT pure white)
cream-100    #F5F1E8    Card backgrounds, secondary surfaces

ACCENT (Amber — used sparingly)
amber-700    #B07B3A    Active highlights in dark mode
amber-500    #D4A574    KEY ACCENT — bimodal word highlight, active states
amber-200    #EFD9B5    Subtle amber tints

SEMANTIC
success      #2D7A4F    (forest-tinted green — feels native)
warning      #C68A2E    (amber-tinted, warmer than typical)
error        #B5453A    (warm red, not bright tomato)
info         #3D6B7A    (warm muted blue, used minimally)
```

### Color usage rules

**Cream-50 (`#FAF7F2`) is the default page background, not white.** This is non-negotiable. Pure white is harsh for long-form reading and doesn't match the literary mood. The cream is warm enough to feel paper-like but neutral enough not to read as sepia.

**Forest-800 (`#1B4332`) is the primary brand color.** Used for: primary CTAs, the logo, key navigation accents, the brand mark in onboarding. Used sparingly enough that when it appears, it carries weight.

**Amber-500 (`#D4A574`) is the bimodal word highlight color.** When audio is playing and a word is being spoken, it gets an amber background. Amber was chosen because it's the warmest, most attention-grabbing color in the palette without being a stop-sign red. It evokes the warm glow of a reading lamp.

**Ink-900 is text, not pure black.** Pure black (`#000000`) on cream looks harsh and corporate. Ink-900 (`#1A1A1A`) is softer and reads more like printed type.

### Dark mode palette

```
DARK MODE
bg-primary       #1A1F1B     (deep forest-tinted near-black)
bg-secondary     #232A24     (slightly elevated)
bg-tertiary      #2C342D     (cards, raised surfaces)
text-primary     #E8E5DC     (warm cream, NOT pure white)
text-secondary   #B5B2AB     
text-tertiary    #8A8780     
forest-accent    #4A7C59     (forest-400 lifted to feel vibrant)
amber-accent     #D4A574     (same — works in both modes)
border           #3D453E     
```

Dark mode keeps the same emotional temperature — warm-tinted, not cool blue-black. It's the difference between "reading by candlelight" (our dark mode) and "looking at a Slack window at 2am" (typical dark mode).

---

## Part 3 — Typography System

### Type stack

Three typefaces, each with a clear role:

**Display & headers — Fraunces** (variable serif, free via Google Fonts)
- A contemporary serif with personality. Variable axes for weight, optical size, and softness.
- Used for: app name "Bookflow," major headings (h1, h2), book titles in the Reader, hero text on landing pages.
- Why: Fraunces has more character than typical serifs (Lora, Source Serif). It signals "we care about typography" without being academic. The variable axes let us go from delicate (light, large optical size) for hero moments to robust (regular, small optical size) for UI labels.
- Weights used: 400 (regular), 500 (medium), 600 (semibold for hero only).

**UI text — Geist** (clean sans, free from Vercel)
- Geometric sans with subtle warmth. Designed specifically for digital interfaces.
- Used for: All UI text — buttons, navigation, body text in non-reading contexts, labels, metadata.
- Why: Most reading apps use Inter (overused, generic). Geist has a similar level of polish but more personality. It's also designed to work well at small sizes.
- Weights used: 400 (regular), 500 (medium). Two weights only.

**Reading text — Literata** (serif designed for reading, free via Google Fonts)
- Designed by TypeTogether and Google specifically for digital book reading.
- Used for: All text inside the Reader (book content, summaries, Q&A responses about books).
- Why: Literata's letterforms are optimized for sustained reading. It's the closest free analog to professional book typography. Using a different typeface inside the Reader vs. in the chrome creates a meaningful "now you're reading" mode shift.
- Weights used: 400 (regular), 500 (medium for emphasis).

**Accessibility option — Lexend** (already specced)
- Free, designed for dyslexic readers using research from the Lexend project.
- Available as a Reader typography option.

### Type scale

```
DISPLAY (Fraunces)
display-xl    48px / 56px line / 600 weight    Hero on landing page only
display-lg    36px / 44px line / 500 weight    Onboarding headlines  
display-md    28px / 36px line / 500 weight    Book detail screen titles
display-sm    22px / 30px line / 500 weight    Tab headers ("Your library")

UI HEADINGS (Geist)
heading-lg    20px / 28px line / 500 weight    Major UI section headers
heading-md    16px / 24px line / 500 weight    Card titles, dialog headers
heading-sm    14px / 20px line / 500 weight    Subsection labels

UI BODY (Geist)
body-lg       16px / 24px line / 400 weight    Important UI body text
body-md       14px / 20px line / 400 weight    DEFAULT UI text
body-sm       12px / 18px line / 400 weight    Secondary text, captions
body-xs       11px / 16px line / 400 weight    Metadata, tertiary text

LABELS (Geist)
label-md      12px / 16px / 500 / uppercase / 0.5px tracking    Section labels  
label-sm      10px / 14px / 500 / uppercase / 0.5px tracking    Tags, eyebrows

READING (Literata)
reading-default  16px / 28px line / 400 weight   Reader body text
reading-large    18px / 32px line / 400 weight   Reader large mode
reading-xl       20px / 36px line / 400 weight   Reader extra-large mode
```

### Typography rules

- **Sentence case for all UI.** No Title Case, no ALL CAPS except for label-md and label-sm (uppercase labels with letter-spacing).
- **Two weights maximum per typeface.** Don't ladder weights. 400 and 500. That's it.
- **Tabular numbers everywhere statistics appear.** Use `font-feature-settings: 'tnum'` so numbers in usage meters, page counts, etc. don't shift when values change.
- **Hyphenation and orphans matter.** In long-form reading and summary text, enable proper hyphenation (`hyphens: auto`) and avoid widows/orphans where possible.
- **No mid-sentence bolding for emphasis.** Italics for emphasis, bold only for labels/headings/UI hierarchy.

---

## Part 4 — Spacing System

### Base unit: 4px

All spacing is a multiple of 4px. This creates rhythm and predictability.

```
SPACING SCALE
xs    4px     Tight gaps between related elements
sm    8px     Component-internal padding
md    12px    Standard component padding, list-item gaps
lg    16px    Section padding, card padding
xl    24px    Section separation
2xl   32px    Major layout breaks
3xl   48px    Hero spacing, screen-level breathing room
4xl   64px    Reserved for landing page / onboarding
```

### Layout grid

Mobile (375–428px width range):
- Outer margin: 16px
- Inter-element gap: 12px default, 8px tight
- Card padding: 16px standard, 14px compact
- Section vertical separation: 24px

### Border radius

```
RADIUS SCALE
xs    4px     Pills, chips, tags
sm    6px     Inputs, small buttons
md    8px     Standard cards, list items
lg    12px    Major surfaces, hero cards
xl    16px    Bottom sheets (top corners only)
full  9999px  Avatars, circular buttons
```

---

## Part 5 — Component Specifications

### Buttons

**Primary button (forest-800 fill)**
- Background: forest-800 `#1B4332`
- Text: cream-50 `#FAF7F2`, body-md, 500 weight
- Padding: 12px vertical, 20px horizontal
- Radius: 8px (md)
- Hover: forest-600
- Active: forest-900, transform: scale(0.98)
- Disabled: ink-300 background, ink-500 text
- Min-height: 44px (accessibility)

**Secondary button (outlined)**
- Background: transparent
- Border: 1px solid ink-300
- Text: ink-900, body-md, 500 weight
- Padding: 12px vertical, 20px horizontal
- Radius: 8px
- Hover: cream-100 background, ink-500 border
- Active: cream-100, transform: scale(0.98)

**Tertiary button (text only)**
- Background: transparent
- Text: forest-800, body-md, 500 weight
- Padding: 12px vertical, 8px horizontal
- Hover: forest-50 background tint
- Used for: "Maybe later," "Cancel," low-emphasis actions

**Icon button (circular)**
- 36×36px (standard) or 44×44px (primary action)
- Background: cream-100 (default) or forest-800 (primary)
- Icon: 18px, ink-700 (default) or cream-50 (primary)
- Radius: full
- Hover: ink-100 (default) or forest-600 (primary)

### Inputs

**Text input**
- Background: cream-100
- Border: 1px solid transparent (default), forest-800 (focus)
- Text: ink-900, body-md
- Placeholder: ink-400
- Padding: 12px horizontal, 10px vertical
- Radius: 8px
- Min-height: 44px

**Search input (Library, Discover)**
- Same as text input but with leading 18px search icon (ink-400)
- Pill shape: radius 9999px when in header, radius 8px when inline

### Cards

**Standard card**
- Background: cream-50 (or cream-100 on cream-50 page bg for contrast)
- Border: 0.5px solid ink-200 (subtle definition)
- Radius: 12px (lg)
- Padding: 16px (or 14px compact)
- No drop shadow

**Hero card (Continue card on Library, Now Playing on Listen)**
- Background: cream-100
- Border: none
- Radius: 12px
- Padding: 16px
- Optional: subtle inner highlight using a 1px top border in cream-50

**Surface card (in dark mode)**
- Background: bg-tertiary `#2C342D`
- No border
- Radius: 12px

### Bottom sheets

- Background: cream-50
- Top corners radius: 16px (xl), bottom: 0
- Top edge: 4×32px drag handle, ink-300, 16px from top
- Padding: 16px horizontal, 18px bottom (24px if has bottom CTAs)
- Backdrop: ink-900 at 40% opacity behind the sheet

### Lists

**List item (Library books, settings rows)**
- Min-height: 56px
- Padding: 12px horizontal, 12px vertical
- Border-bottom: 0.5px solid ink-200 (between items, not after last)
- Hover (web): cream-100 background
- Active (mobile tap): cream-100 background, 100ms transition

### Tab bar (bottom navigation)

- Background: cream-50
- Border-top: 0.5px solid ink-200
- Padding: 8px horizontal, 8px top, 12px bottom (safe area aware)
- Per tab: 18×18 icon + label-sm (10px), 4px gap
- Active: forest-800 icon and label
- Inactive: ink-400 icon, ink-500 label

### Iconography

Use **Lucide icons** (free, consistent style, well-maintained). All icons:
- 18×18px in compact contexts (action bars, inline)
- 20×20px in standard UI
- 24×24px for emphasized buttons
- Stroke width: 1.5 (slightly lighter than Lucide default of 2 — feels more refined)
- Color: ink-700 default, forest-800 active, ink-400 disabled

### Progress bars

**Reading/playback progress**
- Track: ink-200, 3px height, radius 2px
- Fill: forest-800, smooth animation on update
- Thumb: 9×9 forest-800 circle, only visible on Reader scrub bar

**Usage meters (audio, AI credits, books)**
- Track: ink-100, 4px height, radius 2px
- Fill: forest-600 (under 80%), warning #C68A2E (80–95%), error #B5453A (95%+)

---

## Part 6 — Motion & Interaction

### Timing

```
TIMING TOKENS
fast       120ms     Hover states, color changes
base       200ms     Default transitions, sheet open/close
slow       320ms     Page transitions, modal entry
deliberate 480ms     Onboarding reveals, hero animations
```

### Easing

- **Default:** `cubic-bezier(0.4, 0.0, 0.2, 1)` — Material's standard ease
- **Sheet entry:** `cubic-bezier(0.0, 0.0, 0.2, 1)` — decelerate (feels like settling into place)
- **Sheet exit:** `cubic-bezier(0.4, 0.0, 1, 1)` — accelerate (feels like releasing)

### Motion rules

- **Bottom sheets** slide up from bottom with backdrop fade-in. 320ms entry, 200ms exit.
- **Page transitions** are simple cross-fades, 200ms. No swipe animations between tabs (feels fragile on mobile web).
- **Bimodal word highlight** has zero animation between words. The highlight just moves. Animating it would lag behind the audio.
- **Streaming text** (summaries, Q&A) reveals word-by-word with no fade-in. The cursor blinks.
- **Loading states** use a 3-dot pulse pattern, not spinners. Spinners feel like errors are imminent.

### Haptic feedback (native apps)

- Light haptic on primary button taps
- Medium haptic on long-press triggers (translate sentence)
- Heavy haptic on errors only

---

## Part 7 — Accessibility Requirements

These are non-negotiable, not nice-to-haves.

### WCAG AA minimum

- All text contrast ratios meet WCAG AA at minimum (4.5:1 for body text, 3:1 for large text)
- Forest-800 on cream-50: 11.4:1 — passes AAA
- Ink-700 on cream-50: 9.8:1 — passes AAA
- Ink-500 on cream-50: 4.7:1 — passes AA (use for secondary text only, never small body)
- Amber-500 (highlight color) is decorative — text never sits directly on it without an additional dark layer

### Touch targets

- Minimum 44×44px for any tappable element (iOS HIG)
- Minimum 8px gap between adjacent tappable elements
- Tab bar items have 44px hit area even though visual is smaller

### Focus states

- All interactive elements have a visible focus ring (2px solid forest-800, offset 2px) for keyboard users
- Focus rings only appear on keyboard navigation (use `:focus-visible`, not `:focus`)

### Reading-specific accessibility

- Text-to-speech respects user's system speech rate as default
- Bimodal highlight uses both background color AND increased weight (not color alone) to indicate spoken word
- Dyslexia-friendly font (Lexend) with one-tap activation in Reader settings
- Maximum text width in Reader: 65 characters per line (optimal reading)

---

## Part 8 — Logo & Brand Mark

### Wordmark

"Bookflow" set in **Fraunces, 600 weight, optical size 144** (display optimized). The "f" and "k" have generous serifs that catch the eye. Letter-spacing: -0.02em (subtle tightening).

### Logomark

A simple, memorable mark for app icons and small surfaces:

A stylized open book where the right page transforms into flowing audio waveform lines. The mark uses forest-800 as its primary color on cream-50 backgrounds, or cream-50 on forest-800 backgrounds.

The mark should be recognizable at 16×16px (favicon size) and elegant at 1024×1024px (app store).

### App icon

- Background: forest-800 solid
- Mark: cream-50
- iOS rounded square (system handles), Android adaptive icon with background and foreground layers

### Don't

- Don't add gradient effects to the logo
- Don't tilt or skew the wordmark
- Don't use the mark without sufficient padding (minimum padding = 25% of mark width)
- Don't recreate or modify the mark — use the official assets

---

## Part 9 — Surface Hierarchy

A page in Bookflow has three potential surface depths:

```
Page background (cream-50)
↓
Card or section (cream-100 — slight elevation)
↓
Inner element (cream-50 again — recessed feel)
```

In dark mode:
```
Page background (#1A1F1B)
↓
Card (#232A24)
↓
Inner element (#2C342D)
```

This three-tier system creates depth without using shadows. It's flat but has structure.

---

## Part 10 — Implementation Notes for Engineering

### Token system

All design tokens should be exposed as CSS custom properties (web) and a parallel structure in the chosen mobile framework's theming system. Naming convention: `--bf-{category}-{name}-{variant}`.

Example:
```css
:root {
  --bf-color-forest-800: #1B4332;
  --bf-color-cream-50:   #FAF7F2;
  --bf-color-ink-900:    #1A1A1A;
  
  --bf-font-display:     'Fraunces', Georgia, serif;
  --bf-font-ui:          'Geist', -apple-system, sans-serif;
  --bf-font-reading:     'Literata', Georgia, serif;
  --bf-font-dyslexia:    'Lexend', -apple-system, sans-serif;
  
  --bf-space-md:         12px;
  --bf-space-lg:         16px;
  
  --bf-radius-md:        8px;
  --bf-radius-lg:        12px;
}
```

### Font loading strategy

- Use `font-display: swap` to avoid invisible text during load
- Preload Fraunces and Geist (most-used variants) in `<head>`
- Literata loads only when the Reader is first opened (route-level lazy load)
- Variable font formats (woff2) only — no static cuts

### Performance budget

- First contentful paint: < 1.5s on 4G
- Time to interactive: < 3s on 4G
- Total bundle (excluding fonts): < 250KB gzipped
- Fonts: < 80KB total (variable fonts help here)

### Theming switch

Light/dark mode follows system preference by default, with manual override available in Settings. Theme transition: 200ms fade. Persist user choice in localStorage / native storage.

---

## Part 11 — Resources & Files

When implementation begins, these assets need to be produced:

- [ ] Fraunces, Geist, Literata, Lexend hosted via self-served font files (don't rely on Google Fonts CDN for production privacy)
- [ ] App icon: 1024×1024 master, all required platform sizes
- [ ] Logo: SVG master, light/dark variants, with/without wordmark
- [ ] Lucide icon set: 1.5 stroke variant, custom export
- [ ] Marketing site: hero illustrations or photography (literary, warm, editorial — never stock SaaS imagery)
- [ ] Onboarding illustrations: simple line illustrations in forest-800 on cream-50, hand-drawn feel preferred over geometric
- [ ] Empty state illustrations: same line-illustration style, never use generic icon-style empty states

---

This system is designed to be implementable, scalable, and distinctive. Every choice has a reason. Resist the temptation to "simplify" by switching to Inter or pure white backgrounds — those choices would erase the brand identity that makes Bookflow recognizable.
