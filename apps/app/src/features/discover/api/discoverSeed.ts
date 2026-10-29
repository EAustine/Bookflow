import type { DiscoverBook } from './discoverApi';

/**
 * Baked-in seed list of popular Gutenberg books. Used as the
 * cold-start fallback for the Discover home feed: when the user
 * opens Discover for the very first time and there's no AsyncStorage
 * cache, we render this list immediately while the live Gutendex
 * fetch resolves in the background.
 *
 * Why bake these in:
 *   - First-launch perceived perf — content shows in <100ms instead
 *     of waiting on a Gutendex round-trip + cover-image download.
 *   - Network resilience — if Gutendex is slow or temporarily down
 *     the user still sees usable content.
 *
 * The list is deliberately short (8 books) and biased toward
 * timeless, broadly-appealing fiction. They're real Gutenberg ids,
 * so when the live fetch returns and overwrites this, identifiable
 * books stay consistent (the user doesn't see "Pride and Prejudice"
 * disappear and reappear with a different cover URL).
 *
 * The cover URLs go through images.weserv.nl (same proxy
 * `discoverApi.ts` uses for live data) — pre-resized, webp-encoded,
 * cached globally. No raw Gutenberg image hosts in the seed.
 */

function proxyCover(rawUrl: string): string {
  const stripped = rawUrl.replace(/^https?:\/\//, '');
  return `https://images.weserv.nl/?url=${encodeURIComponent(stripped)}&w=240&output=webp&q=80&we`;
}

const SEED_RAW: Array<{
  id: number;
  title: string;
  author: string;
  tags: string[];
  about: string;
  downloadCount: number;
}> = [
  {
    id: 1342,
    title: 'Pride and Prejudice',
    author: 'Jane Austen',
    tags: ['Fiction', 'Romance', 'England'],
    about:
      'The witty Elizabeth Bennet navigates marriage, money, and reputation in Regency England.',
    downloadCount: 80000,
  },
  {
    id: 84,
    title: 'Frankenstein; Or, The Modern Prometheus',
    author: 'Mary Wollstonecraft Shelley',
    tags: ['Fiction', 'Gothic', 'Horror'],
    about:
      "Mary Shelley's Gothic masterpiece about an ambitious scientist and the creature he gives life to.",
    downloadCount: 75000,
  },
  {
    id: 11,
    title: "Alice's Adventures in Wonderland",
    author: 'Lewis Carroll',
    tags: ['Fantasy', "Children's literature"],
    about:
      'A girl falls down a rabbit hole into a world of riddles, royalty, and absurd logic.',
    downloadCount: 70000,
  },
  {
    id: 2701,
    title: 'Moby Dick; Or, The Whale',
    author: 'Herman Melville',
    tags: ['Fiction', 'Adventure', 'Sea stories'],
    about:
      "Captain Ahab's monomaniacal pursuit of the white whale that took his leg, narrated by Ishmael.",
    downloadCount: 65000,
  },
  {
    id: 1661,
    title: 'The Adventures of Sherlock Holmes',
    author: 'Arthur Conan Doyle',
    tags: ['Mystery', 'Detective'],
    about:
      'Twelve cases starring the consulting detective and his chronicler, Dr Watson.',
    downloadCount: 60000,
  },
  {
    id: 64317,
    title: 'The Great Gatsby',
    author: 'F. Scott Fitzgerald',
    tags: ['Fiction', 'Jazz Age', 'American'],
    about:
      "Nick Carraway's account of his neighbour Jay Gatsby and the Long Island summer that undoes them all.",
    downloadCount: 55000,
  },
  {
    id: 174,
    title: 'The Picture of Dorian Gray',
    author: 'Oscar Wilde',
    tags: ['Fiction', 'Gothic', 'Aesthetics'],
    about:
      "Wilde's only novel: a young man's portrait ages while he stays beautiful, and corrupt.",
    downloadCount: 50000,
  },
  {
    id: 76,
    title: 'Adventures of Huckleberry Finn',
    author: 'Mark Twain',
    tags: ['Fiction', 'Adventure', 'American'],
    about:
      'A boy and an escaped slave drift down the Mississippi together, confronting pre-war America.',
    downloadCount: 45000,
  },
];

/**
 * Build full DiscoverBook objects from the compact seed metadata.
 * Cover + EPUB URLs follow Gutenberg's stable per-book convention so
 * we don't have to ship the URLs explicitly in the seed.
 */
export const DISCOVER_SEED: DiscoverBook[] = SEED_RAW.map((s) => ({
  id: `gutenberg:${s.id}`,
  title: s.title,
  author: s.author,
  language: 'en',
  tags: s.tags,
  // Standard Gutenberg cover URL pattern. Wrapped through weserv to
  // match what `discoverApi.reshape` does for live results, so the
  // visual treatment is identical between seed + live data.
  coverUrl: proxyCover(`https://www.gutenberg.org/cache/epub/${s.id}/pg${s.id}.cover.medium.jpg`),
  epubUrl: `https://www.gutenberg.org/ebooks/${s.id}.epub.images`,
  formats: {
    'application/epub+zip': `https://www.gutenberg.org/ebooks/${s.id}.epub.images`,
  },
  about: s.about,
  source: 'gutenberg',
  downloadCount: s.downloadCount,
}));

/**
 * Curated Bible collection for the dedicated "The Holy Bible" rail.
 *
 * COPYRIGHT NOTE: only public-domain translations are listed here. Modern
 * copyrighted versions (NKJV, NLT, NIV, ESV, NASB, …) are NOT free to
 * distribute and would require a publisher licence or an official Bible API
 * agreement — do not add them as bundled texts. The three below are complete,
 * verified Project Gutenberg editions:
 *   - #10   King James Version (1611) — the classic English translation
 *   - #8294 World English Bible — a readable modern-English PD translation
 *   - #8300 Douay-Rheims (Challoner Revision) — traditional English Catholic
 */
const BIBLE_RAW: Array<{
  id: number;
  title: string;
  author: string;
  tags: string[];
  about: string;
  downloadCount: number;
}> = [
  {
    id: 10,
    title: 'Holy Bible: King James Version',
    author: 'KJV · 1611',
    tags: ['Bible', 'Scripture', 'KJV'],
    about:
      'The complete King James Version of the Old and New Testaments, the classic 1611 English translation.',
    downloadCount: 17381,
  },
  {
    id: 8294,
    title: 'Holy Bible: World English Bible',
    author: 'WEB · Modern English',
    tags: ['Bible', 'Scripture', 'Modern English'],
    about:
      'A complete, readable modern-English translation in the public domain, a contemporary update of the American Standard Version.',
    downloadCount: 1445,
  },
  {
    id: 8300,
    title: 'Holy Bible: Douay-Rheims',
    author: 'Catholic · Challoner Revision',
    tags: ['Bible', 'Scripture', 'Catholic'],
    about:
      'The complete Douay-Rheims Bible (Challoner Revision), the traditional English Catholic translation.',
    downloadCount: 3175,
  },
];

/**
 * Always-available Bible versions for the Discover "Holy Bible" rail. Built
 * from baked-in Gutenberg references (same URL conventions as the seed), so
 * the rail renders instantly and never empties on a network miss.
 */
export const BIBLE_VERSIONS: DiscoverBook[] = BIBLE_RAW.map((s) => ({
  id: `gutenberg:${s.id}`,
  title: s.title,
  author: s.author,
  language: 'en',
  tags: s.tags,
  coverUrl: proxyCover(`https://www.gutenberg.org/cache/epub/${s.id}/pg${s.id}.cover.medium.jpg`),
  epubUrl: `https://www.gutenberg.org/ebooks/${s.id}.epub.images`,
  formats: {
    'application/epub+zip': `https://www.gutenberg.org/ebooks/${s.id}.epub.images`,
  },
  about: s.about,
  source: 'gutenberg',
  downloadCount: s.downloadCount,
}));
