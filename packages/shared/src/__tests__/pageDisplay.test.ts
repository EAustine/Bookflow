import { describe, expect, it } from 'vitest';
import {
  labelsAreTrustworthy,
  pageDisplay,
  pageDisplayShort,
  pageDisplayText,
  resolvePageQuery,
  romanToInt,
} from '../pageDisplay';

/**
 * The roman-numeral novel from the brief's acceptance tests: twelve pages
 * of front matter numbered i..xii, then the body restarting at 1. So PDF
 * page 13 prints "1", and the printed "15" sits on PDF page 27.
 */
const NOVEL_LABELS: Array<string | null> = [
  ...['i', 'ii', 'iii', 'iv', 'v', 'vi', 'vii', 'viii', 'ix', 'x', 'xi', 'xii'],
  ...Array.from({ length: 30 }, (_, i) => String(i + 1)),
];

describe('pageDisplay', () => {
  it('shows the PDF number alone when there is no label', () => {
    expect(pageDisplay(22, null)).toEqual({ primary: 'Page 23', secondary: null });
  });

  it('shows the PDF number alone when the label agrees with it', () => {
    // PDF page 23 printing "23" is not worth two numbers.
    expect(pageDisplay(22, '23')).toEqual({ primary: 'Page 23', secondary: null });
  });

  it('puts the printed label first and the PDF page second', () => {
    expect(pageDisplay(22, '15')).toEqual({ primary: 'Page 15', secondary: 'PDF 23' });
  });

  it('handles roman front matter', () => {
    expect(pageDisplay(11, 'xii')).toEqual({ primary: 'Page xii', secondary: 'PDF 12' });
  });

  it('renders the one-line form the brief specifies', () => {
    expect(pageDisplayText(22, '15')).toBe('Page 15 · PDF 23');
    expect(pageDisplayText(22, null)).toBe('Page 23');
  });

  it('renders a compact form for dense rows', () => {
    expect(pageDisplayShort(22, '15')).toBe('15 · PDF 23');
    expect(pageDisplayShort(22, null)).toBe('23');
  });

  it('treats an empty-string label as absent', () => {
    expect(pageDisplay(5, '')).toEqual({ primary: 'Page 6', secondary: null });
  });
});

describe('romanToInt', () => {
  it('reads well-formed numerals in either case', () => {
    expect(romanToInt('xii')).toBe(12);
    expect(romanToInt('XIV')).toBe(14);
    expect(romanToInt('i')).toBe(1);
    expect(romanToInt('mcmxc')).toBe(1990);
  });

  it('rejects malformed numerals rather than guessing', () => {
    // "iiii" is 4 by naive addition; it is not a roman numeral.
    expect(romanToInt('iiii')).toBeNull();
    expect(romanToInt('vv')).toBeNull();
  });

  it('rejects anything that is not a numeral', () => {
    expect(romanToInt('A-3')).toBeNull();
    expect(romanToInt('15')).toBeNull();
    expect(romanToInt('')).toBeNull();
  });
});

describe('labelsAreTrustworthy', () => {
  it('accepts a novel that restarts once at the front-matter boundary', () => {
    // xii -> 1 is the expected single restart, not corruption.
    expect(labelsAreTrustworthy(NOVEL_LABELS)).toBe(true);
  });

  it('accepts plain sequential labels', () => {
    expect(labelsAreTrustworthy(['1', '2', '3', '4', '5', '6'])).toBe(true);
  });

  it('rejects labels missing on most pages', () => {
    expect(labelsAreTrustworthy(['1', null, null, null, '5'])).toBe(false);
  });

  it('rejects repeated labels', () => {
    expect(labelsAreTrustworthy(['1', '1', '1', '1', '1', '1'])).toBe(false);
  });

  it('rejects labels that go backwards more than once', () => {
    expect(labelsAreTrustworthy(['5', '1', '9', '2', '8', '3'])).toBe(false);
  });

  it('rejects an empty book', () => {
    expect(labelsAreTrustworthy([])).toBe(false);
  });
});

describe('resolvePageQuery', () => {
  it('lands "xii" on the right page', () => {
    // The brief's acceptance test: Go to page "xii" must land on PDF 12.
    expect(resolvePageQuery('xii', NOVEL_LABELS)).toEqual([
      { pageIndex: 11, via: 'label' },
    ]);
  });

  it('is case-insensitive about labels', () => {
    expect(resolvePageQuery('XII', NOVEL_LABELS)).toEqual([
      { pageIndex: 11, via: 'label' },
    ]);
  });

  it('offers both readings when a number is ambiguous', () => {
    // Printed "15" is PDF 27; PDF 15 prints "3". Both are real pages, and
    // only the user knows which they meant.
    expect(resolvePageQuery('15', NOVEL_LABELS)).toEqual([
      { pageIndex: 26, via: 'label' },
      { pageIndex: 14, via: 'pdf' },
    ]);
  });

  it('returns one match when label and PDF agree', () => {
    const labels = ['1', '2', '3'];
    expect(resolvePageQuery('2', labels)).toEqual([{ pageIndex: 1, via: 'label' }]);
  });

  it('falls back to the PDF number when no label matches', () => {
    expect(resolvePageQuery('40', NOVEL_LABELS)).toEqual([
      { pageIndex: 39, via: 'pdf' },
    ]);
  });

  it('returns nothing for out-of-range or empty input', () => {
    expect(resolvePageQuery('999', NOVEL_LABELS)).toEqual([]);
    expect(resolvePageQuery('   ', NOVEL_LABELS)).toEqual([]);
  });
});
