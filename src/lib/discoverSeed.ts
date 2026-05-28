import type { DiscoverBook } from '~/lib/discoverApi';

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
      "Wilde's only novel: a young man's portrait ages while he stays beautiful — and corrupt.",
    downloadCount: 50000,
  },
  {
    id: 76,
    title: 'Adventures of Huckleberry Finn',
    author: 'Mark Twain',
    tags: ['Fiction', 'Adventure', 'American'],
    about:
      'A boy and an escaped slave drift down the Mississippi together — and confront pre-war America.',
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
