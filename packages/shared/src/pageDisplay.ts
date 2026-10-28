/**
 * One way to turn a page into the string a human reads.
 *
 * From `docs/specs/PDF_PAGE_STRUCTURE_BRIEF.md`, "Page labels: show them,
 * everywhere, the same way". Storing `page_label` is not enough: if a
 * book's printed "15" sits on PDF page 23 and the reader only ever shows
 * 23, the app looks wrong next to the page the user is holding. Every
 * surface that shows a page number calls into this file, so Full view and
 * Text view cannot drift — that side-by-side comparison is the one users
 * actually make.
 *
 * **Labels are display only.** Front matter commonly restarts numbering,
 * so labels are neither unique nor ordered and must never be a lookup
 * key. `page_index` stays canonical everywhere.
 *
 * Self-contained by design: no imports, so Deno edge functions can take
 * it by relative path and the app by the `@bookflow/shared` barrel,
 * rather than the AI prompt markers drifting from the reader's UI.
 */

export type PageDisplay = {
  /** What to show first: the printed label when there is one. */
  primary: string;
  /** The PDF page, shown only when it differs from the label. */
  secondary: string | null;
};

/**
 * `pageIndex` is 0-based. `label` comes from pdf.js `getPageLabels()`, or
 * null.
 *
 * For a book extracted after migration 0028 the PDF page number is always
 * `page_index + 1` — `process-book` emits exactly one row per PDF page.
 * A pre-0028 book has several slice rows per PDF page, so its callers
 * pass `pdf_page_number - 1` to keep the printed figure true; the lookup
 * they do is still by `page_index`.
 */
export function pageDisplay(
  pageIndex: number,
  label: string | null | undefined,
): PageDisplay {
  const pdf = String(pageIndex + 1);
  if (!label || label === pdf) return { primary: `Page ${pdf}`, secondary: null };
  return { primary: `Page ${label}`, secondary: `PDF ${pdf}` };
}

/**
 * The index to hand `pageDisplay`, given a row's `page_index` and
 * `pdf_page_number`.
 *
 * Not a second display path — the one helper above still formats every
 * string. This only resolves which number is the PDF page. After 0028
 * they are the same (`page_index + 1 === pdf_page_number`); a pre-0028
 * book has several ~200-word slice rows per PDF page, so its
 * `page_index + 1` is a slice ordinal and would print "Page 37" for a
 * 20-page book. Lookups still use `page_index`.
 */
export function pdfIndexOf(
  pageIndex: number,
  pdfPageNumber: number | null | undefined,
): number {
  return typeof pdfPageNumber === 'number' && pdfPageNumber > 0
    ? pdfPageNumber - 1
    : pageIndex;
}

/** The same thing as one line: "Page 15 · PDF 23", or "Page 23". */
export function pageDisplayText(
  pageIndex: number,
  label: string | null | undefined,
): string {
  const { primary, secondary } = pageDisplay(pageIndex, label);
  return secondary ? `${primary} · ${secondary}` : primary;
}

/** Compact form for dense rows: "15 · PDF 23", or "23". */
export function pageDisplayShort(
  pageIndex: number,
  label: string | null | undefined,
): string {
  const pdf = String(pageIndex + 1);
  if (!label || label === pdf) return pdf;
  return `${label} · PDF ${pdf}`;
}

/**
 * Whether a book's labels can be trusted at all.
 *
 * The brief: "if labels are missing on most pages, repeat, or go
 * backwards, ignore them for the whole book and show PDF numbers only."
 * A partly-broken label set is worse than none, because the reader cannot
 * tell which pages it is lying about.
 *
 * "Go backwards" is deliberately not a plain less-than test: real books
 * restart numbering exactly once, at the front-matter boundary (xii then
 * 1). One restart is expected; two or more means the labels are noise.
 */
export function labelsAreTrustworthy(
  labels: ReadonlyArray<string | null | undefined>,
): boolean {
  if (labels.length === 0) return false;
  const present = labels.filter((l): l is string => !!l && l.trim().length > 0);
  // Missing on most pages.
  if (present.length < labels.length * 0.5) return false;

  // Repeats. Distinct labels are what make "go to xii" answerable.
  if (new Set(present).size < present.length * 0.9) return false;

  // Backwards more than once. Only numeric-ish labels can be compared;
  // a roman-to-arabic restart is counted through `romanToInt`.
  let restarts = 0;
  let previous: number | null = null;
  for (const label of present) {
    const value = labelToNumber(label);
    if (value === null) {
      previous = null;
      continue;
    }
    if (previous !== null && value <= previous) restarts++;
    previous = value;
  }
  return restarts <= 1;
}

/** Roman numeral to integer, or null if `s` is not one. Case-insensitive. */
export function romanToInt(s: string): number | null {
  const t = s.trim().toLowerCase();
  if (!t || !/^[ivxlcdm]+$/.test(t)) return null;
  const values: Record<string, number> = {
    i: 1, v: 5, x: 10, l: 50, c: 100, d: 500, m: 1000,
  };
  let total = 0;
  for (let i = 0; i < t.length; i++) {
    const current = values[t[i]!]!;
    const next = i + 1 < t.length ? values[t[i + 1]!]! : 0;
    total += current < next ? -current : current;
  }
  // Reject strings that are letters but not well-formed numerals
  // ("iiii", "vv") by round-tripping.
  return intToRoman(total) === t ? total : null;
}

function intToRoman(n: number): string {
  if (n <= 0 || n > 3999) return '';
  const table: Array<[number, string]> = [
    [1000, 'm'], [900, 'cm'], [500, 'd'], [400, 'cd'],
    [100, 'c'], [90, 'xc'], [50, 'l'], [40, 'xl'],
    [10, 'x'], [9, 'ix'], [5, 'v'], [4, 'iv'], [1, 'i'],
  ];
  let out = '';
  let rest = n;
  for (const [value, numeral] of table) {
    while (rest >= value) {
      out += numeral;
      rest -= value;
    }
  }
  return out;
}

/** A label as a comparable number: "15" -> 15, "xii" -> 12, "A-3" -> null. */
function labelToNumber(label: string): number | null {
  const t = label.trim();
  if (/^\d+$/.test(t)) return Number(t);
  return romanToInt(t);
}

export type PageMatch = { pageIndex: number; via: 'label' | 'pdf' };

/**
 * Resolve what someone typed into Go to page, or asked the AI for.
 *
 * The brief: "try a label match first, then a PDF number. If both match
 * different pages, show both options." Hence an array rather than a
 * single answer — in a book with roman front matter, "12" is both the
 * printed page 12 and PDF page 12, and they are different sheets. Only
 * the caller can ask which was meant.
 *
 * `labels` is indexed by `page_index`, so the position IS the lookup key;
 * labels are never used as one.
 */
export function resolvePageQuery(
  query: string,
  labels: ReadonlyArray<string | null | undefined>,
): PageMatch[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const out: PageMatch[] = [];

  // 1. Exact label match, case-insensitive. First wins: labels should be
  //    unique, and `labelsAreTrustworthy` is what rejects a set that is
  //    not.
  const labelIdx = labels.findIndex(
    (l) => !!l && l.trim().toLowerCase() === q,
  );
  if (labelIdx >= 0) out.push({ pageIndex: labelIdx, via: 'label' });

  // 2. PDF page number.
  if (/^\d+$/.test(q)) {
    const idx = Number(q) - 1;
    if (idx >= 0 && idx < labels.length && idx !== labelIdx) {
      out.push({ pageIndex: idx, via: 'pdf' });
    }
  }
  return out;
}
