import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { extractText, getDocumentProxy } from 'unpdf';
import { detectRunningChrome, normalizePdfText } from '../pdfPageText';

/**
 * Page fidelity: text page N really is PDF page N.
 *
 * The rule from docs/specs/PDF_PAGE_STRUCTURE_BRIEF.md is that a text
 * page equals a PDF page. The failure this guards against is silent:
 * if the pipeline merges, drops or offsets a page, every page number
 * after it is wrong, AI citations point at the wrong sheet, and nothing
 * throws. It is only visible by comparing text against the PDF itself.
 *
 * Two independent views of the same file are compared:
 *   - OURS      `extractText({ mergePages: false })`, the unpdf wrapper
 *               the pipeline uses, then the pipeline's own
 *               `normalizePdfText`.
 *   - REFERENCE `getTextContent()` per page, pdf.js's own page API.
 *
 * Because they come from different APIs, an off-by-one or a merge shows
 * up as a mismatch rather than cancelling out.
 *
 * Both sides get the SAME normalisation, including running-header
 * stripping and de-hyphenation. That is deliberate: this test is about
 * page ALIGNMENT, and comparing cleaned text to raw text would fail on
 * every page with a running head while telling us nothing about which
 * page the text came from.
 */

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), 'fixtures');

type PageReport = {
  page: number;
  reason: string;
  ours: string;
  reference: string;
};

function words(text: string): string[] {
  return text.split(/\s+/).filter(Boolean);
}

/** pdf.js's own per-page text, joined the way unpdf joins items. */
async function referencePageText(
  // deno-lint-ignore no-explicit-any
  proxy: any,
  pageNumber: number,
): Promise<string> {
  const page = await proxy.getPage(pageNumber);
  const content = await page.getTextContent();
  return (content.items as Array<{ str?: string }>)
    .map((item) => item.str ?? '')
    .join('\n');
}

async function checkFixture(file: string) {
  const bytes = readFileSync(join(FIXTURES, file));
  const proxy = await getDocumentProxy(new Uint8Array(bytes));
  const extracted = (await extractText(proxy, { mergePages: false })) as {
    text: string[];
  };
  const rawPages = extracted.text;

  // One chrome pass over the whole book, as the pipeline does.
  const chrome = detectRunningChrome(rawPages);
  const ourPages = rawPages.map((t) => normalizePdfText(t ?? '', chrome));

  const failures: PageReport[] = [];
  for (let i = 0; i < proxy.numPages; i++) {
    const reference = normalizePdfText(
      await referencePageText(proxy, i + 1),
      chrome,
    );
    const ours = ourPages[i] ?? '';
    const ow = words(ours);
    const rw = words(reference);

    // A page with no text is a real page; both sides must agree it is
    // empty rather than one of them borrowing from a neighbour.
    if (ow.length === 0 || rw.length === 0) {
      if (ow.length !== rw.length) {
        failures.push({
          page: i + 1,
          reason:
            ow.length === 0
              ? 'ours is empty but pdf.js found text on this page'
              : 'pdf.js found no text but ours has some — text from another page?',
          ours: ow.slice(0, 8).join(' '),
          reference: rw.slice(0, 8).join(' '),
        });
      }
      continue;
    }

    const firstOurs = ow.slice(0, 8).join(' ');
    const firstRef = rw.slice(0, 8).join(' ');
    if (firstOurs !== firstRef) {
      failures.push({
        page: i + 1,
        reason: 'first 8 words differ',
        ours: firstOurs,
        reference: firstRef,
      });
    }

    const lastOurs = ow.slice(-8).join(' ');
    const lastRef = rw.slice(-8).join(' ');
    if (lastOurs !== lastRef) {
      failures.push({
        page: i + 1,
        reason: 'last 8 words differ',
        ours: lastOurs,
        reference: lastRef,
      });
    }
  }

  return { numPages: proxy.numPages, emitted: ourPages.length, failures };
}

function describeFailures(failures: PageReport[]): string {
  return failures
    .map(
      (f) =>
        `\n  page ${f.page}: ${f.reason}\n    ours:      "${f.ours}"\n    pdf.js:    "${f.reference}"`,
    )
    .join('');
}

describe('PDF page fidelity', () => {
  for (const file of ['roman-novel.pdf', 'plain-with-blanks.pdf']) {
    describe(file, () => {
      it('emits exactly one text page per PDF page', async () => {
        const { numPages, emitted } = await checkFixture(file);
        expect(emitted).toBe(numPages);
      }, 60_000);

      it('page N text matches pdf.js page N, first and last 8 words', async () => {
        const { failures } = await checkFixture(file);
        // Named rather than a bare toHaveLength so a regression reports
        // WHICH page and HOW it drifted, not just a count.
        expect(
          failures.length === 0 ? 'no failures' : describeFailures(failures),
        ).toBe('no failures');
      }, 60_000);
    });
  }
});
