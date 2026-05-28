/**
 * Word lookup against api.dictionaryapi.dev — a free, no-key public
 * endpoint that returns phonetics, definitions, and examples for English
 * words. We use it for the in-reader translate popover so tapping a word
 * actually shows the right meaning instead of a hardcoded placeholder.
 *
 * The API rate-limits aggressively at scale, but for a single user's
 * tapping it's plenty — we cache lookups in-memory for the session so
 * the same word doesn't re-fetch.
 *
 * If the API is unreachable or doesn't recognise the word we return
 * `null` so the caller can show a "Definition unavailable" state.
 */

export type WordLookup = {
  word: string;
  phonetic: string | null;
  definitions: { partOfSpeech: string; definition: string; example: string | null }[];
};

// LRU cap on the lookup cache so the Map doesn't grow without bound
// over a long session. Map iteration order in V8/Hermes is insertion
// order, so the oldest entry is `CACHE.keys().next().value` — we
// evict that when the cap is hit. 2000 distinct words covers a heavy
// reading session without filling more than a few hundred KB.
const CACHE = new Map<string, WordLookup | null>();
const CACHE_MAX = 2000;

function rememberLookup(word: string, value: WordLookup | null): void {
  // Re-insert to bump the entry to the end of the LRU order even if
  // we already had it (e.g. a repeat hit for a successful lookup).
  if (CACHE.has(word)) CACHE.delete(word);
  CACHE.set(word, value);
  if (CACHE.size > CACHE_MAX) {
    const oldest = CACHE.keys().next().value;
    if (oldest !== undefined) CACHE.delete(oldest);
  }
}

export async function lookupWord(rawWord: string): Promise<WordLookup | null> {
  const word = rawWord.trim().toLowerCase();
  if (!word) return null;
  if (CACHE.has(word)) {
    // Touch the entry so it moves to the end of the LRU.
    const v = CACHE.get(word) ?? null;
    rememberLookup(word, v);
    return v;
  }

  try {
    const res = await fetch(
      `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`,
    );
    if (!res.ok) {
      rememberLookup(word, null);
      return null;
    }
    const data = (await res.json()) as Array<{
      word: string;
      phonetic?: string;
      phonetics?: { text?: string }[];
      meanings: {
        partOfSpeech: string;
        definitions: { definition: string; example?: string }[];
      }[];
    }>;
    if (!Array.isArray(data) || data.length === 0) {
      rememberLookup(word, null);
      return null;
    }

    const entry = data[0];
    const phonetic =
      entry.phonetic?.trim() ||
      entry.phonetics?.find((p) => p.text)?.text ||
      null;

    // Flatten meanings → top 3 definitions across parts of speech. The
    // popover is small; 3 lines is the readable maximum.
    const definitions: WordLookup['definitions'] = [];
    for (const meaning of entry.meanings) {
      for (const def of meaning.definitions.slice(0, 2)) {
        definitions.push({
          partOfSpeech: meaning.partOfSpeech,
          definition: def.definition,
          example: def.example ?? null,
        });
        if (definitions.length >= 3) break;
      }
      if (definitions.length >= 3) break;
    }

    const lookup: WordLookup = {
      word: entry.word,
      phonetic,
      definitions,
    };
    rememberLookup(word, lookup);
    return lookup;
  } catch {
    rememberLookup(word, null);
    return null;
  }
}
