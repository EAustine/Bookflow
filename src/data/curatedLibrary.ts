/**
 * Curated public-domain library — v1 starter set.
 *
 * Six classics, picked for the first-book onboarding picker
 * (per /Users/completefarmer/Downloads/05_first_book.html). Books are
 * pre-rendered with cover gradients + typography only — no real cover
 * art yet — so we can ship the activation flow without commissioning
 * artwork. Real EPUBs live in Supabase storage; we'll join on `id`.
 *
 * On the wire, picking a book here triggers a "copy into the user's
 * library" mutation that writes a row to `user_books` referencing the
 * `id` below. Don't change `id` values — they're foreign keys.
 */

export type CuratedBook = {
  /** Stable foreign key. Don't change. */
  id: string;
  /** Full title rendered both on the cover and in metadata. */
  title: string;
  /** Short title for the small caption under the cover. */
  shortTitle: string;
  /** Full author name on the cover. */
  author: string;
  /** Last name (or short form) for the small caption under the cover. */
  shortAuthor: string;
  /** Cover gradient — rendered as a 135deg LinearGradient (top-left → bottom-right). */
  cover: {
    from: string;
    to: string;
    /** Title color on the cover. */
    titleColor: string;
    /** Author color on the cover. */
    authorColor: string;
    /** Optional 0.5px hairline border for very pale covers (e.g. cream-on-cream). */
    border?: string;
  };
};

export const CURATED_LIBRARY: readonly CuratedBook[] = [
  {
    id: 'the-great-gatsby',
    title: 'The Great Gatsby',
    shortTitle: 'The Great Gatsby',
    author: 'F. Scott Fitzgerald',
    shortAuthor: 'Fitzgerald',
    cover: {
      from: '#2D5A3F',
      to: '#1B4332',
      titleColor: '#FAF7F2',
      authorColor: '#B7CCB9',
    },
  },
  {
    id: 'pride-and-prejudice',
    title: 'Pride and Prejudice',
    shortTitle: 'Pride and Prejudice',
    author: 'Jane Austen',
    shortAuthor: 'Austen',
    cover: {
      from: '#ECE5D5',
      to: '#D8D5CC',
      titleColor: '#1A1A1A',
      authorColor: '#6B6862',
    },
  },
  {
    id: 'dorian-gray',
    title: 'The Picture of Dorian Gray',
    shortTitle: 'Dorian Gray',
    author: 'Oscar Wilde',
    shortAuthor: 'Wilde',
    cover: {
      from: '#1A1A1A',
      to: '#3D3A36',
      titleColor: '#FAF7F2',
      authorColor: '#D8D5CC',
    },
  },
  {
    id: 'frankenstein',
    title: 'Frankenstein',
    shortTitle: 'Frankenstein',
    author: 'Mary Shelley',
    shortAuthor: 'Shelley',
    cover: {
      from: '#D4A574',
      to: '#B8895A',
      titleColor: '#1A1A1A',
      authorColor: '#3D3A36',
    },
  },
  {
    id: 'meditations',
    title: 'Meditations',
    shortTitle: 'Meditations',
    author: 'Marcus Aurelius',
    shortAuthor: 'Aurelius',
    cover: {
      from: '#FAF7F2',
      to: '#F5F1E8',
      titleColor: '#1A1A1A',
      authorColor: '#6B6862',
      border: '#D8D5CC',
    },
  },
  {
    id: 'walden',
    title: 'Walden',
    shortTitle: 'Walden',
    author: 'H.D. Thoreau',
    shortAuthor: 'Thoreau',
    cover: {
      from: '#234D38',
      to: '#0E2A21',
      titleColor: '#FAF7F2',
      authorColor: '#B7CCB9',
    },
  },
] as const;

export type CuratedBookId = (typeof CURATED_LIBRARY)[number]['id'];
