/**
 * Per-page PDF text normalisation — the exact logic `process-book` runs
 * on each extracted page.
 *
 * It lives here, rather than inside the edge function, so the page
 * fidelity test can run the REAL pipeline against a PDF instead of a
 * copy of it that can drift. Pure string work with no Deno, Node or
 * platform imports, so the edge function takes it by relative path and
 * the test by the `@bookflow/shared` barrel.
 *
 * Nothing here is page-aware beyond the text it is handed: running
 * header/footer detection needs the whole book, so it is a separate
 * pass (`detectRunningChrome`) whose result is passed in.
 */

export function chromeKey(line: string): string {
  return (
    line
      // Leading page number. Digits may sit flush against the text;
      // a roman numeral must be its own token, because every letter in
      // `ivxlcdm` also starts ordinary words. Without the lookahead,
      // "More body text" keys as "ore body text" (the M is eaten) and
      // "Stand" as "Stan" — found by the unit test below this file's
      // behaviour, not in review.
      .replace(/^\s*\d{1,4}[\s.\u2022|-]*/, '')
      // Whitespace-delimited only: a hyphen joins words, so allowing it
      // here turned "Ill-advised" into "advised".
      .replace(/^\s*[ivxlcdm]{1,8}(?=\s)[\s.\u2022|-]*/i, '')
      // Trailing page number, same asymmetry.
      .replace(/[\s.\u2022|-]*\d{1,4}\s*$/, '')
      .replace(/\s+[.\u2022|-]*\s*[ivxlcdm]{1,8}\s*$/i, '')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase()
  );
}

/**
 * Collect the running header/footer keys for a book.
 *
 * Must see every page at once. The detector inside `normalizePdfText`
 * counts repeats across the "pages" it can find in the string it is
 * given — which, now that the PDF path calls it once per page, is one
 * page, where nothing can repeat. Running chrome is a property of the
 * book, so it is computed once here and passed in.
 *
 * Only the two outermost non-empty lines at each end of a page are
 * candidates. A running head is positional; restricting to the edges
 * means a phrase that genuinely recurs mid-paragraph is never stripped
 * out of the prose.
 */
export function detectRunningChrome(pageTexts: string[]): Set<string> {
  const counts = new Map<string, number>();
  for (const raw of pageTexts) {
    const lines = raw.split('\n').map((l) => l.trim()).filter(Boolean);
    if (lines.length === 0) continue;
    const edges = [
      lines[0],
      lines[1],
      lines[lines.length - 2],
      lines[lines.length - 1],
    ];
    const seen = new Set<string>();
    for (const candidate of edges) {
      // A running head is a SHORT PHRASE, not a sentence. Both caps
      // earn their place: on the roman-numeral fixture a repeated
      // 61-character, 11-word body line sat at the page edge on every
      // page and was detected as chrome under the looser limits. 60
      // characters and 8 words still clear real heads comfortably
      // ("Sit . Walk . Stand 22" is 21 and 6).
      if (!candidate || candidate.length > 60) continue;
      if (candidate.split(/\s+/).length > 8) continue;
      const key = chromeKey(candidate);
      // Very short keys ("3", "x") are page numbers, already handled by
      // isPageNumberLine, and too generic to match on safely.
      if (key.length < 4) continue;
      if (seen.has(key)) continue;
      seen.add(key);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  // A running head appears on most pages. Requiring ~30% with a floor of
  // 3 keeps short documents from stripping a line that happened twice.
  const threshold = Math.max(3, Math.ceil(pageTexts.length * 0.3));
  const out = new Set<string>();
  for (const [key, n] of counts) {
    if (n >= threshold) out.add(key);
  }
  return out;
}

export function normalizePdfText(
  text: string,
  runningChrome?: ReadonlySet<string>,
): string {
  let out = text;

  // 1. Character-level cleanup that's safe to do up-front.
  out = out
    .replace(/­/g, '') // soft hyphen
    .replace(/ﬀ/g, 'ff')
    .replace(/ﬁ/g, 'fi')
    .replace(/ﬂ/g, 'fl')
    .replace(/ﬃ/g, 'ffi')
    .replace(/ﬄ/g, 'ffl')
    .replace(/ /g, ' '); // non-breaking space → regular

  // 2. Page-aware processing. We split on form-feed if present; if not, we
  // use a heuristic: "blank line + 1-or-2 digit line + blank line" is also
  // a page boundary in most PDFs. Strip per-page headers/footers and
  // page-number lines, then re-join with paragraph breaks.
  const pages = splitIntoPages(out);

  // Detect repeated short lines (headers or footers) that appear on ≥4
  // distinct pages. These are running titles like "Chapter 3" or
  // "The Great Gatsby" that got captured by pdf-parse as standalone lines.
  const lineCounts = new Map<string, number>();
  for (const page of pages) {
    const seenInPage = new Set<string>();
    for (const line of page.split('\n')) {
      const key = line.trim();
      if (!key || key.length > 80) continue;
      if (seenInPage.has(key)) continue;
      seenInPage.add(key);
      lineCounts.set(key, (lineCounts.get(key) ?? 0) + 1);
    }
  }
  const repeatedLines = new Set<string>();
  const PAGE_REPEAT_THRESHOLD = Math.min(4, Math.max(2, Math.floor(pages.length * 0.4)));
  for (const [key, count] of lineCounts) {
    if (count >= PAGE_REPEAT_THRESHOLD) repeatedLines.add(key);
  }

  // Strip per-page chrome.
  const cleanedPages = pages.map((page) => {
    const lines = page.split('\n');
    // Positions of the first and last non-empty lines, so the
    // book-wide running-chrome set is only applied at the edges of the
    // page where a header or footer can actually sit.
    let firstIdx = -1;
    let lastIdx = -1;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].trim()) {
        if (firstIdx < 0) firstIdx = i;
        lastIdx = i;
      }
    }
    const kept: string[] = [];
    for (let i = 0; i < lines.length; i++) {
      const raw = lines[i];
      const line = raw.trim();
      if (!line) {
        kept.push('');
        continue;
      }
      if (
        runningChrome &&
        runningChrome.size > 0 &&
        (i <= firstIdx + 1 || i >= lastIdx - 1) &&
        line.length <= 80 &&
        runningChrome.has(chromeKey(line))
      ) {
        continue;
      }
      if (repeatedLines.has(line)) continue;
      if (isPageNumberLine(line)) continue;
      kept.push(raw);
    }
    return kept.join('\n').trim();
  });

  out = cleanedPages.filter(Boolean).join('\n\n');

  // 3. Cross-line stitching.
  // De-hyphenate words split across lines: "exam-\nple" → "example".
  // Only when the second half starts lowercase, to avoid merging
  // legitimate hyphenated headings or proper-noun fragments.
  out = out.replace(/(\w)-\n(\p{Ll})/gu, '$1$2');

  // Soft-wrap collapse: a newline between letters/punct + letter, not
  // followed by another newline, is a wrap not a paragraph break.
  out = out.replace(/(\p{L}|\p{N}|[,;])\n(?!\n)(\p{L})/gu, '$1 $2');

  // 4. Final whitespace tidy.
  out = out
    .split('\n')
    .map((l) => l.replace(/[ \t]+/g, ' ').replace(/\s+$/, ''))
    .join('\n');
  out = out.replace(/\n{3,}/g, '\n\n');

  return out.trim();
}

/**
 * Split pdf-parse output into rough "pages". Prefer real form-feeds; when
 * absent, fall back to detecting standalone page-number lines as page
 * separators. Pages are returned without their separator.
 */
export function splitIntoPages(text: string): string[] {
  if (text.includes('\f')) {
    return text.split('\f');
  }
  // Heuristic split: a line that's just a 1–4 digit number (or Roman) on
  // its own, surrounded by blank-ish lines, marks a page boundary.
  const lines = text.split('\n');
  const pages: string[] = [];
  let buf: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line && isPageNumberLine(line)) {
      const prev = i > 0 ? lines[i - 1].trim() : '';
      const next = i + 1 < lines.length ? lines[i + 1].trim() : '';
      // Only treat as boundary when neighbours are blank — otherwise
      // mid-paragraph numerals would split a sentence in two.
      if (!prev && !next) {
        pages.push(buf.join('\n'));
        buf = [];
        continue;
      }
    }
    buf.push(lines[i]);
  }
  if (buf.length) pages.push(buf.join('\n'));
  return pages.length ? pages : [text];
}

/**
 * True for lines that almost-certainly aren't body content: bare page
 * numbers, "Page N", "N of M", and *lowercase* Roman numerals (the
 * convention used for front-matter folio numbers).
 *
 * We deliberately don't strip uppercase Roman numerals — many books use
 * them as chapter headings (I, II, III), and the chapter detector relies
 * on seeing them. Lowercase romans on their own line are almost always
 * page numbers.
 */
export function isPageNumberLine(line: string): boolean {
  const t = line.trim();
  if (!t) return false;
  if (/^\d{1,4}$/.test(t)) return true;
  if (/^page\s+\d{1,4}$/i.test(t)) return true;
  if (/^\d{1,4}\s+of\s+\d{1,4}$/i.test(t)) return true;
  // Lowercase Roman only — uppercase often signals a chapter heading.
  if (/^[ivxlcdm]{1,6}$/.test(t)) return true;
  return false;
}
