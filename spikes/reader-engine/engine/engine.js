/**
 * Bookflow reader engine — M0 spike.
 *
 * Throwaway. Exists to answer one question with numbers: can one DOM
 * engine render text, EPUB and PDF well enough on a low-end Android
 * device that §7 of ARCHITECTURE.md is buildable, and specifically is
 * pdf.js viable in-engine (retiring react-native-pdf)?
 *
 * What it deliberately does NOT do: chrome, settings, themes, search,
 * highlights, selection, persistence. The host owns all of that (§7.5).
 * Adding any of it here would make the numbers less honest, not more.
 *
 * Measurements, matching the M0 brief:
 *   - time to first page, per mode
 *   - scroll smoothness (long-frame count during a scripted scroll)
 *   - memory with a large PDF
 *   - word-highlight update latency driven at 4 Hz
 */

const $ = (s) => document.querySelector(s);
const viewport = $('#viewport');
const statusEl = $('#status');

const metrics = {
  device: {},
  runs: [],
};

function say(msg) {
  statusEl.textContent = msg;
  post({ type: 'status', msg });
}

/** Engine → host. Works both in an RN WebView and in plain Chrome. */
function post(payload) {
  const body = JSON.stringify({ v: 1, ...payload });
  if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(body);
  else console.log('[engine]', body);
}

/* ── memory ──────────────────────────────────────────────────────────
   performance.memory is Chrome-only, heap-only, and quantised — it does
   not see canvas backing stores, which is where a PDF viewer actually
   spends. Treat it as a floor, and read the real number from the host
   (adb dumpsys meminfo / PSS). Recorded in the write-up. */
function heapMB() {
  const m = performance.memory;
  if (!m) return null;
  return {
    usedMB: +(m.usedJSHeapSize / 1048576).toFixed(1),
    totalMB: +(m.totalJSHeapSize / 1048576).toFixed(1),
    limitMB: +(m.jsHeapSizeLimit / 1048576).toFixed(1),
  };
}

/* ── long-frame observer ───────────────────────────────────────────── */
let longFrames = [];
function watchFrames(on) {
  if (!on) { longFrames = []; return; }
  let last = performance.now();
  function tick(now) {
    const dt = now - last;
    last = now;
    // 16.7ms is one frame at 60Hz. Anything over ~33ms is a visible hitch.
    if (dt > 33) longFrames.push(+dt.toFixed(1));
    if (watching) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}
let watching = false;

/* ── mode: text (canonical document) ───────────────────────────────── */
async function loadText() {
  const t0 = performance.now();
  const doc = await fetch('../assets/canonical-document.json').then((r) => r.json());
  const fetched = performance.now();

  // One DOM build for the whole book, with content-visibility doing the
  // skipping. The alternative — virtualising in JS — is what the RN
  // reader does today (~3-5 pages resident). This tests whether the
  // browser's own mechanism is enough, which would be far simpler.
  const frag = document.createDocumentFragment();
  for (const page of doc.pages) {
    const sec = document.createElement('section');
    sec.className = 'page';
    sec.dataset.pageId = page.id;
    const no = document.createElement('div');
    no.className = 'page-no';
    no.textContent = `page ${page.index + 1}`;
    sec.appendChild(no);
    for (const block of page.blocks) {
      const p = document.createElement('p');
      p.className = 'block';
      // Word spans are what word-level sync addresses. Building them for
      // the whole book up front is the expensive choice; doing it lazily
      // per visible page is the obvious optimisation if this is slow.
      for (const w of block.words) {
        const s = document.createElement('span');
        s.className = 'w';
        s.dataset.wid = w.id;
        s.textContent = w.t;
        p.appendChild(s);
        p.appendChild(document.createTextNode(' '));
      }
      sec.appendChild(p);
    }
    frag.appendChild(sec);
  }
  viewport.replaceChildren(frag);

  // Two rAFs: first fires before paint, second after the frame that
  // painted. That is the honest "first page is on screen" moment.
  const paint = await nextPaint();
  const painted = performance.now();

  return {
    mode: 'text',
    paintTimedOut: paint.timedOut,
    pages: doc.pages.length,
    words: doc.wordCount,
    fetchMs: +(fetched - t0).toFixed(0),
    firstPaintMs: +(painted - t0).toFixed(0),
    heap: heapMB(),
  };
}

/**
 * Resolves after the frame that painted.
 *
 * The timeout is not belt-and-braces: a backgrounded or zero-size tab
 * stops firing rAF entirely, so without it the whole run hangs rather
 * than reporting anything. Flagged in the result so a timed-out paint is
 * never mistaken for a fast one.
 */
function nextPaint(budgetMs = 5000) {
  return new Promise((res) => {
    let done = false;
    const finish = (timedOut) => {
      if (done) return;
      done = true;
      res({ timedOut });
    };
    requestAnimationFrame(() => requestAnimationFrame(() => finish(false)));
    setTimeout(() => finish(true), budgetMs);
  });
}

/* ── mode: pdf (pdf.js) ────────────────────────────────────────────── */
let pdfjsLib = null;
async function ensurePdfjs() {
  if (pdfjsLib) return pdfjsLib;
  pdfjsLib = await import('./vendor/pdf.min.mjs');
  pdfjsLib.GlobalWorkerOptions.workerSrc = './vendor/pdf.worker.min.mjs';
  return pdfjsLib;
}

async function loadPdf(file) {
  const t0 = performance.now();
  const lib = await ensurePdfjs();
  const libReady = performance.now();

  const task = lib.getDocument({
    url: `../assets/${file}`,
    // Defaults matter here. Streaming + range requests are what keep a
    // large PDF off the heap; disabling them is how you OOM a cheap phone.
    disableAutoFetch: true,
    disableStream: false,
  });
  const pdf = await task.promise;
  const opened = performance.now();

  // Placeholders for every page, real canvases only for what is near the
  // viewport. This is the memory strategy under test: N pages of canvas
  // resident, not N pages of document.
  const width = Math.min(viewport.clientWidth, 680);
  const page1 = await pdf.getPage(1);
  const vp1 = page1.getViewport({ scale: 1 });
  const scale = width / vp1.width;
  const h = Math.round(vp1.height * scale);

  const frag = document.createDocumentFragment();
  for (let i = 1; i <= pdf.numPages; i++) {
    const ph = document.createElement('div');
    ph.className = 'pdf-placeholder';
    ph.dataset.pageNo = String(i);
    ph.style.width = `${Math.round(width)}px`;
    ph.style.height = `${h}px`;
    ph.textContent = `${i}`;
    frag.appendChild(ph);
  }
  viewport.replaceChildren(frag);

  const rendered = new Map();
  const RESIDENT = 4; // canvases kept alive around the viewport

  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        const no = +e.target.dataset.pageNo;
        if (e.isIntersecting) void renderPdfPage(pdf, no, scale, rendered, RESIDENT);
      }
    },
    { root: null, rootMargin: '200px 0px' },
  );
  viewport.querySelectorAll('.pdf-placeholder').forEach((el) => io.observe(el));

  await renderPdfPage(pdf, 1, scale, rendered, RESIDENT);
  const paint = await nextPaint();
  const painted = performance.now();

  return {
    mode: file.includes('large') ? 'pdf-large' : 'pdf',
    paintTimedOut: paint.timedOut,
    file,
    pages: pdf.numPages,
    libLoadMs: +(libReady - t0).toFixed(0),
    openMs: +(opened - libReady).toFixed(0),
    firstPaintMs: +(painted - t0).toFixed(0),
    heap: heapMB(),
  };
}

async function renderPdfPage(pdf, no, scale, rendered, resident) {
  if (rendered.has(no)) return;
  const slot = viewport.querySelector(`.pdf-placeholder[data-page-no="${no}"]`);
  if (!slot) return;
  rendered.set(no, true);

  const page = await pdf.getPage(no);
  const vp = page.getViewport({ scale });
  const canvas = document.createElement('canvas');
  canvas.className = 'pdf-page';
  // devicePixelRatio is the memory multiplier people forget: at dpr 2 a
  // page canvas is 4x the bytes. Capped at 2 deliberately.
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(vp.width * dpr);
  canvas.height = Math.round(vp.height * dpr);
  canvas.style.width = `${Math.round(vp.width)}px`;
  canvas.style.height = `${Math.round(vp.height)}px`;
  canvas.dataset.pageNo = String(no);

  const ctx = canvas.getContext('2d', { alpha: false });
  ctx.scale(dpr, dpr);
  await page.render({ canvasContext: ctx, viewport: vp }).promise;
  slot.replaceWith(canvas);

  // Evict distant canvases back to placeholders, or the heap grows with
  // every page the user scrolls past and never comes back down.
  for (const [n] of rendered) {
    if (Math.abs(n - no) <= resident) continue;
    const c = viewport.querySelector(`canvas.pdf-page[data-page-no="${n}"]`);
    if (!c) continue;
    const ph = document.createElement('div');
    ph.className = 'pdf-placeholder';
    ph.dataset.pageNo = String(n);
    ph.style.width = c.style.width;
    ph.style.height = c.style.height;
    ph.textContent = String(n);
    c.width = 0; c.height = 0; // release the backing store, not just the node
    c.replaceWith(ph);
    rendered.delete(n);
  }
}

/* ── mode: epub ────────────────────────────────────────────────────── */
async function loadEpub() {
  const t0 = performance.now();
  // The spike unzips server-side and serves plain XHTML, because the
  // question here is render cost, not zip parsing. Real EPUB mode has to
  // read the container itself; that is M6's problem, not M0's.
  const manifest = await fetch('../assets/epub-manifest.json').then((r) => r.json());
  const fetched = performance.now();

  const frag = document.createDocumentFragment();
  for (const href of manifest.spine) {
    const sec = document.createElement('section');
    sec.className = 'page epub-doc';
    sec.dataset.href = href;
    sec.innerHTML = await fetch(`../assets/epub/${href}`).then((r) => r.text());
    frag.appendChild(sec);
  }
  viewport.replaceChildren(frag);
  const paint = await nextPaint();
  const painted = performance.now();

  return {
    mode: 'epub',
    paintTimedOut: paint.timedOut,
    docs: manifest.spine.length,
    fetchMs: +(fetched - t0).toFixed(0),
    firstPaintMs: +(painted - t0).toFixed(0),
    heap: heapMB(),
  };
}

/* ── word sync at 4 Hz ─────────────────────────────────────────────── */
let syncTimer = null;
let syncStats = null;

function toggleSync() {
  if (syncTimer) {
    clearInterval(syncTimer);
    syncTimer = null;
    const s = syncStats;
    s.p50 = percentile(s.samples, 50);
    s.p95 = percentile(s.samples, 95);
    s.max = Math.max(...s.samples);
    delete s.samples;
    metrics.runs.push({ kind: 'wordSync', ...s });
    say(`sync off — p50 ${s.p50}ms p95 ${s.p95}ms max ${s.max}ms over ${s.ticks} ticks`);
    $('#sync').setAttribute('aria-pressed', 'false');
    return;
  }

  const words = [...viewport.querySelectorAll('.w')];
  if (!words.length) { say('sync needs text mode'); return; }

  syncStats = { ticks: 0, samples: [], words: words.length };
  let i = 0;
  let prev = null;

  // 4 Hz is the brief's rate. Each tick is what the host sending
  // `audioTime` costs the engine: find the word, swap the class, let it
  // paint. Measured to the next paint, not just to the end of script.
  syncTimer = setInterval(() => {
    const t0 = performance.now();
    if (prev) prev.classList.remove('active');
    const el = words[i % words.length];
    el.classList.add('active');
    prev = el;
    i += 7; // skip ahead so it walks the book rather than one paragraph
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        syncStats.samples.push(+(performance.now() - t0).toFixed(2));
        syncStats.ticks++;
      }),
    );
  }, 250);

  $('#sync').setAttribute('aria-pressed', 'true');
  say('sync on at 4Hz — scroll around, then press again to stop');
}

function percentile(arr, p) {
  const a = [...arr].sort((x, y) => x - y);
  return +a[Math.floor((a.length - 1) * (p / 100))].toFixed(2);
}

/* ── scripted scroll ───────────────────────────────────────────────── */
async function scrollRun(label) {
  longFrames = [];
  watching = true;
  watchFrames(true);
  const t0 = performance.now();

  // Two different questions, so two different scrolls.
  //
  // 'seek' jumps 1/60th of the document per frame. On a 714-page PDF
  // that is ~12 pages a frame — scrubbing, not reading. It is a useful
  // worst case but it is NOT what a reader does, and quoting its frame
  // counts as if it were would overstate the problem badly.
  //
  // 'read' advances most of a viewport per step, which is what a thumb
  // flick does. This is the number that should drive the decision.
  const total = document.documentElement.scrollHeight - window.innerHeight;
  const steps = 60;
  const reading = label.endsWith(':read');
  const stride = reading
    ? Math.round(window.innerHeight * 0.9)
    : Math.round(total / steps);

  let y = reading ? window.scrollY : 0;
  for (let s = 1; s <= steps; s++) {
    y = reading ? Math.min(y + stride, total) : Math.round((total * s) / steps);
    window.scrollTo(0, y);
    await new Promise((r) => requestAnimationFrame(r));
    if (reading && y >= total) break;
  }
  const dur = performance.now() - t0;
  watching = false;

  const run = {
    kind: 'scroll',
    label,
    steps,
    durationMs: +dur.toFixed(0),
    longFrames: longFrames.length,
    worstFrameMs: longFrames.length ? Math.max(...longFrames) : 0,
    heap: heapMB(),
  };
  metrics.runs.push(run);
  say(`scroll ${label}: ${run.longFrames} long frames of ${steps}, worst ${run.worstFrameMs}ms`);
  return run;
}

/* ── wiring ────────────────────────────────────────────────────────── */
const LOADERS = {
  text: loadText,
  pdf: () => loadPdf('sample.pdf'),
  'pdf-large': () => loadPdf('sample-large.pdf'),
  epub: loadEpub,
};

async function run(mode) {
  say(`loading ${mode}…`);
  window.scrollTo(0, 0);
  try {
    const t = await LOADERS[mode]();
    metrics.runs.push({ kind: 'load', ...t });
    say(`${mode}: first paint ${t.firstPaintMs}ms` + (t.pages ? `, ${t.pages} pages` : ''));
    post({ type: 'loaded', ...t });
    await scrollRun(mode + ':read');   // what a reader does
    window.scrollTo(0, 0);
    await new Promise((r) => setTimeout(r, 400));
    await scrollRun(mode + ':seek');   // worst case: scrubbing
  } catch (err) {
    say(`${mode} FAILED: ${err && err.message}`);
    metrics.runs.push({ kind: 'error', mode, message: String(err && err.message) });
    post({ type: 'error', mode, message: String(err && err.message) });
  }
}

document.querySelectorAll('#controls button[data-mode]').forEach((b) => {
  b.addEventListener('click', () => {
    document.querySelectorAll('#controls button[data-mode]')
      .forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    void run(b.dataset.mode);
  });
});
$('#sync').addEventListener('click', toggleSync);
$('#dump').addEventListener('click', () => {
  const el = $('#metrics');
  el.textContent = JSON.stringify(metrics, null, 2);
  el.hidden = !el.hidden;
  post({ type: 'metrics', metrics });
});

metrics.device = {
  ua: navigator.userAgent,
  dpr: window.devicePixelRatio,
  cores: navigator.hardwareConcurrency,
  deviceMemoryGB: navigator.deviceMemory ?? null,
  viewport: `${window.innerWidth}x${window.innerHeight}`,
  heapLimitMB: heapMB()?.limitMB ?? null,
};

/* ── autorun ───────────────────────────────────────────────────────────
   Driving the buttons through adb input events is slow and flaky, and a
   mistimed tap would quietly corrupt a measurement. `?run=a,b,c` runs
   the sequence unattended and POSTs the result, so a run is one adb
   intent and one file. */
async function autorun(spec) {
  const modes = spec.split(',').map((s) => s.trim()).filter(Boolean);
  for (const m of modes) {
    if (!LOADERS[m]) { say(`unknown mode ${m}`); continue; }
    await run(m);
    // Let the heap settle before the next mode's baseline is taken,
    // otherwise each mode inherits the previous one's garbage.
    if (window.gc) window.gc();
    await new Promise((r) => setTimeout(r, 1500));
    metrics.runs.push({ kind: 'settled', mode: m, heap: heapMB() });
  }

  if (new URLSearchParams(location.search).has('sync')) {
    // Word sync needs text mode resident.
    if (modes[modes.length - 1] !== 'text') await run('text');
    toggleSync();
    await new Promise((r) => setTimeout(r, 12000)); // ~48 ticks at 4Hz
    toggleSync();
  }

  metrics.finishedAt = new Date().toISOString();
  try {
    await fetch('/metrics', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(metrics),
    });
    say('autorun complete — metrics posted');
  } catch (err) {
    say(`autorun complete, POST failed: ${err && err.message}`);
  }
  document.title = 'DONE ' + document.title;
}

// Host drives the engine; these are the §7.3 messages the spike needs.
window.addEventListener('message', (e) => {
  let m; try { m = JSON.parse(e.data); } catch { return; }
  if (m.type === 'load') void run(m.mode);
  if (m.type === 'sync') toggleSync();
  if (m.type === 'metrics') post({ type: 'metrics', metrics });
});

say(`ready — ${metrics.device.cores} cores, dpr ${metrics.device.dpr}, heap limit ${metrics.device.heapLimitMB}MB`);
post({ type: 'ready', device: metrics.device });

const autoSpec = new URLSearchParams(location.search).get('run');
if (autoSpec) void autorun(autoSpec);
