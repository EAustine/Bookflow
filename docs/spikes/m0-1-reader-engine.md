# M0 spike 1 — reader engine on low-end Android

**Question.** Can one DOM engine render text, EPUB and PDF well enough on a
low-end Android device to justify §7 of `ARCHITECTURE.md`? Specifically: is
pdf.js viable in-engine, retiring `react-native-pdf`?

**Answer.** Text and EPUB: yes, comfortably. **pdf.js: no-go.** Keep
`react-native-pdf`.

Date 2026-10-22 · branch `arch/m0-spikes` · code in `spikes/reader-engine/`

---

## 1. Setup

| | |
|---|---|
| Device | `bookflow_lowend` AVD — 2 cores, 2,473 MB, 720×1600 @320 dpi (360×800 dp) |
| Host | Apple Silicon, 14 cores, 36 GB (see §13.1 — this **flatters** the result) |
| Renderer | Chrome 124.0.6367.219 |
| WebView on the same device | **124.0.6367.219 — identical build** |
| Text / EPUB corpus | *Pride and Prejudice*, Gutenberg EPUB with images (23.7 MB, 18 spine docs, 164 images) → 351-page canonical document, 130,161 words |
| PDF corpus | *Think Python 2e* (244 pp, 0.9 MB) and *Convex Optimization* (714 pp, 6.6 MB) — real books with embedded fonts and figures, not synthetic |

Chrome and the system WebView being the **same build** is what makes this
measurement transferable: the engine the app will embed is the engine that was
measured.

## 2. Results

### Load — time to first painted page

| Mode | Pages | First paint | Note |
|---|---|---|---|
| text | 351 | **1,806 ms** | 662 ms of it fetching the 4.4 MB canonical JSON |
| epub | 18 docs | **1,778 ms** | 164 images |
| pdf | 244 | **2,606 ms** | pdf.js load 173 ms, open 583 ms |
| pdf-large | 714 | **3,942 ms** | open 2,595 ms |

All four load. The 714-page PDF opens without trouble — **opening** was never
the problem.

### Scroll — the decisive measurement

Two profiles, because they answer different questions. `read` advances 0.9 of a
viewport per step, which is what a thumb flick does. `seek` jumps 1/60th of the
document per step — on a 714-page PDF that is ~12 pages a frame, which is
scrubbing, not reading. Long frame = over 33 ms.

| Mode | read: long frames | read: worst | seek: long frames | seek: worst |
|---|---|---|---|---|
| **text** | **5 / 60** | 367 ms | 56 / 60 | 350 ms |
| **pdf-large** | **42 / 60** | **3,117 ms** | 58 / 60 | 5,800 ms |

Text mode drops 5 frames in 60 during ordinary reading, with no stall over
370 ms. That is a usable reader.

pdf.js drops **42 frames in 60** during *ordinary reading scroll*, with a
worst-case stall of **3.1 seconds**. Not scrubbing — reading.

### Memory

`performance.memory` reported a flat 10 MB for every mode. Chrome for Android
quantises it and it never sees canvas backing stores, which is exactly where a
PDF viewer spends. **It is useless for this question** and the real figure came
from `dumpsys meminfo` PSS, summed across Chrome's four processes.

| | |
|---|---|
| Baseline (browser idle) | 297 MB |
| Peak, 714-page PDF | **1,022 MB** |
| After scrolling away, settled | **958 MB** |
| Device total | 2,473 MB |

Peak is **41% of device RAM for the browser alone**, before the React Native
side of a real app is counted. It also does not come back down: 958 MB steady
after scrolling past, which means the canvas eviction in the prototype is not
fully releasing. That is a prototype bug, not a pdf.js verdict — but a fixed
version has to beat 958 MB, not match it.

### Word sync at 4 Hz

Budget is 250 ms per tick.

| Run | p50 | p95 | max |
|---|---|---|---|
| Text mode alone | 37.7 ms | 144.1 ms | 181.7 ms |
| Text mode after the 714-page PDF | 37.8 ms | **313 ms** | **818 ms** |

p50 is comfortable. p95 **misses the budget** once the device is under memory
pressure. The cause is the prototype's design: it builds all **130,161** word
spans up front. Building them lazily per visible page is the obvious fix and
is the right design regardless — recorded for M6.

## 3. Verdict

**pdf.js in-engine: no-go.** Three independent reasons, any one sufficient:

1. 42 of 60 frames long during *reading* scroll, worst stall 3.1 s.
2. ~1 GB peak for the browser alone on a 2.4 GB device.
3. Measured on hardware that **flatters** it. §13.1 sets the rule: a failure on
   this emulator is conclusive, because a real budget phone has slower cores,
   no comparable GPU, and thermal throttling the emulator cannot simulate. This
   is a failure.

`react-native-pdf` stays. §7 keeps three of its four modes; the engine is "one
engine for text, EPUB and the Listen view", and PDF full mode remains native.
That is a smaller §7 than the doc assumes and `ARCHITECTURE.md` needs amending.

**Text and EPUB in-engine: go.** Text mode is the strongest result here — 5
dropped frames in 60, sub-2-second first paint, on two cores. The `content-visibility`
approach works and means the engine does **not** need to reimplement the RN
reader's JS virtualisation.

## 4. What this spike does not settle

- **Real hardware.** Still outstanding, per question 14. A pass would have
  needed it; a failure does not, which is why this verdict can stand.
- **The 958 MB floor.** Prototype canvas eviction is leaking. Worth one hour
  before accepting the pdf.js verdict as final, since a correct eviction might
  move the memory number — though it would not move the 3.1 s frame stalls,
  which are CPU, not memory.
- **EPUB container parsing.** The spike serves pre-unzipped XHTML. Real EPUB
  mode must read the zip itself.
- **A native WebView host.** Measured in Chrome, which is the same build as the
  WebView, but `react-native-webview` adds a bridge the spike did not cross.
  The word-sync figures in particular are engine-side only; the host round trip
  is additional.

## 5. Method bugs found and fixed

Recorded because each one produced a plausible-looking wrong number first.

| Bug | Wrong answer it gave |
|---|---|
| `dumpsys meminfo` lists each process twice — once by process, once by OOM adjustment | 3,232 MB peak on a 2,473 MB device |
| First run measured Chrome's first-run welcome screen; the engine never loaded | 1,383 MB of "engine" memory |
| `nextPaint()` awaited two rAFs, which never fire in a hidden tab | Run hung indefinitely; now times out and flags `paintTimedOut` |
| Scroll test originally only had the `seek` profile | "53/60 long frames" for text mode, which reads as a failure; the reading profile gives 5/60 |
| `log_message` override assumed a string; `log_error` passes an `HTTPStatus` | Server threw on every 404 |

## 6. Reproducing

```bash
# serve (port 8100)
python3 -I spikes/reader-engine/serve.py 8100

# build sample assets from the EPUB
python3 -I spikes/reader-engine/build-assets.py

# run on the emulator and sample memory
./spikes/reader-engine/measure-device.sh "pdf-large,text" emulator-5556
```

Results land in `spikes/reader-engine/results/`. Chrome's first-run screens
must be dismissed once by hand (decline the account, decline notifications) or
the harness measures the welcome screen.
