# M0 spike 2 — web boot

**Question.** Can the current app boot on web with native-only modules
stubbed, and what are the blockers?

**Answer.** Yes. **Two blockers**, both fixed, neither deep. The Welcome
screen renders with zero console errors.

Date 2026-10-22 · branch `arch/m0-spikes` · code in `spikes/web-boot/`,
`metro.config.js`, `babel.config.js`

---

## 1. Result

`npx expo export --platform web` succeeds; the exported build boots and renders
the Welcome screen correctly — logomark, illustration, the Fraunces italic
emphasis in the headline, CTA, legal line. **No console errors** on a cold load.

| | |
|---|---|
| Modules bundled | 7,442 |
| Bundle | **8.5 MB** (one file) |
| Native-only packages needing a stub | **10** |
| Code changes to `src/` or `App.tsx` | **none** |

That last row is the important one. Nothing in the app's own code had to change
to boot on web — every blocker was in configuration or in a dependency.

## 2. Blocker 1 — native-only modules

```
Importing native-only module "react-native/Libraries/Utilities/codegenNativeComponent"
on web from: node_modules/react-native-pdf/fabric/RNPDFPdfNativeComponent.js
```

Ten packages have no web implementation. `metro.config.js` maps each to a stub
in `spikes/web-boot/stubs/` via `resolver.resolveRequest`, plus a catch-all for
`react-native/Libraries/*` since those imports come from *inside* dependencies
and cannot be caught by package name.

| Package | §8 adapter | Real web implementation |
|---|---|---|
| `react-native-pdf` | `reader-host` | **None, ever** — §7.6 ruled pdf.js out, so web has no PDF full mode |
| `react-native-purchases` | `billing` | RevenueCat Web SDK (M8) |
| `expo-audio` | `audio` | `HTMLAudioElement` + Media Session |
| `expo-file-system` | `fileCache` | Cache API / IndexedDB |
| `expo-document-picker` | `files` | `<input type="file">` + drag-drop |
| `expo-image-picker` | `files` | same |
| `expo-speech` | `audio` | `window.speechSynthesis` |
| `expo-clipboard` | `clipboard` | `navigator.clipboard` |
| `expo-notifications` | `notifications` | no-op at launch |
| `expo-share-intent` | `shareIntent` | no-op at launch |

The stubs throw loudly rather than returning plausible empties, so a web path
that genuinely needs one surfaces as a runtime error instead of silently doing
nothing. M4 replaces each with a real `.web.ts`.

## 3. Blocker 2 — `import.meta`, and why `expo export` did not catch it

The brief predicted this one. It is subtler than expected:

> `Uncaught SyntaxError: Cannot use 'import.meta' outside a module`

**Bundling succeeds.** `expo export` exits 0 and writes a valid bundle. The
failure is at *runtime*, because Expo serves the web bundle as a classic
script:

```html
<script src="/_expo/static/js/web/index-….js" defer>
```

`import.meta` is a syntax error outside a module, so the entire bundle dies
before one line of app code runs — a blank page with a single console error and
a green CI.

**Source**, traced to one occurrence in 8.5 MB: Zustand's `devtools`
middleware, reading `import.meta.env.MODE` to decide whether to wire up Redux
DevTools.

**We never use `devtools`.** `src/stores/*.ts` import `persist` and
`createJSONStorage`. `zustand/middleware` is a barrel, and Metro does not
tree-shake `devtools` out of the web bundle.

**Fix chosen.** `babel.config.js` rewrites `import.meta` to
`{ env: { MODE: 'production' }, url: '' }` **on web only**, keyed off
`api.caller(c => c.platform)`. Native is untouched.

Rewriting rather than chasing the import is deliberate: fixing the Zustand
import fixes today's bundle and leaves the next dependency to re-break it, with
the same silent signature. One transform covers the class.

After it: 0 occurrences of `import.meta` in the bundle, app boots, console
clean.

## 4. What this means for M4

- **Smaller than feared.** No app code changed. M4 is writing ten real `.web.ts`
  adapters and deleting these stubs.
- **`react-native-web@0.21.2` is already installed** and needed no configuration.
- **CI must load the page, not just build it.** This blocker produces a green
  `expo export` and a blank app. A Playwright smoke test that asserts the
  Welcome screen renders is the cheapest possible guard, and M4 should have it
  from the first commit.
- **8.5 MB is too big to ship.** Fine for a spike, not for Ama on a metered
  connection. Most of it is fonts — Fraunces, Literata, Geist and Lexend are
  bundled at every weight, including italics the app never uses. M8 needs
  subsetting and code splitting; worth a look when `packages/tokens` lands in M1
  since that is where font selection will live.

## 5. Not settled

- Only the **Welcome screen** was exercised. Everything past auth needs the test
  account, same as Phase D.
- **Auth redirect on web** is untested — magic link needs a real inbox.
- The stubs are stubs. `expo-audio` throwing means nothing past "press play"
  works on web today; that is M4's job, not a defect here.
- Not tested at mobile width. M4's brief asks for a 390px screenshot set.

## 6. Reproducing

```bash
npx expo export --platform web --output-dir spikes/web-boot/dist --clear
python3 -m http.server 8102 --directory spikes/web-boot/dist
```

Then open `http://localhost:8102/`. A stale `import.meta` error in a tab that
loaded the pre-fix bundle persists in that tab's console history — check in a
fresh tab before believing it.
