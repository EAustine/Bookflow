import { useEffect, useMemo, useState } from 'react';
import { supabase } from '~/lib/supabase';

/**
 * Full-text search within a single book.
 *
 * Backed by `pages.content_tsv` (a stored tsvector, indexed with GIN
 * — see migration 0012). Postgres handles the heavy lifting; the
 * client just submits a query and renders results with a snippet
 * around the first match.
 *
 * We construct snippets client-side instead of using
 * `ts_headline`: it would require an RPC, and our 200-word pages are
 * short enough that a JS substring + match-position scan is cheap
 * and gives us full control over the highlight markup.
 */

export type SearchHit = {
  pageId: string;
  pageIndex: number;
  pdfPageNumber: number | null;
  /** A short excerpt centered on the first match within this page. */
  snippet: string;
  /** [start, end] character offsets within `snippet` of the highlighted match. */
  highlightRange: [number, number] | null;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Convert a user query string into a Postgres `websearch_to_tsquery`
 * expression. We use websearch syntax because it tolerates natural
 * input — quoted phrases, "or" / "and" / "-" exclusions — without
 * making the user learn `&` / `|` operators.
 */
function buildSnippet(content: string, query: string, radius = 80): {
  snippet: string;
  highlightRange: [number, number] | null;
} {
  if (!content) return { snippet: '', highlightRange: null };
  // Strip the leading quote/operator markers from the user query so
  // our snippet regex matches the actual words. We keep this simple
  // because the FTS engine already returned the page — we just need
  // *some* match position to centre on.
  const cleaned = query
    .replace(/[+\-]?"([^"]+)"/g, '$1')
    .replace(/[+\-]/g, '')
    .trim();
  const firstTerm = cleaned.split(/\s+/).find((t) => t.length >= 2);
  if (!firstTerm) {
    return { snippet: content.slice(0, radius * 2), highlightRange: null };
  }
  const matchRe = new RegExp(escapeRegExp(firstTerm), 'i');
  const m = matchRe.exec(content);
  if (!m) {
    return { snippet: content.slice(0, radius * 2), highlightRange: null };
  }
  const start = Math.max(0, m.index - radius);
  const end = Math.min(content.length, m.index + m[0].length + radius);
  let snippet = content.slice(start, end);
  let prefix = start > 0 ? '…' : '';
  let suffix = end < content.length ? '…' : '';
  // Adjust highlight offset to the trimmed snippet.
  let hStart = (m.index - start) + prefix.length;
  let hEnd = hStart + m[0].length;
  snippet = prefix + snippet + suffix;
  return { snippet, highlightRange: [hStart, hEnd] };
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export async function searchBook(args: {
  bookId: string;
  query: string;
  limit?: number;
}): Promise<SearchHit[]> {
  const { bookId, query, limit = 50 } = args;
  const trimmed = query.trim();
  if (!trimmed || !UUID_RE.test(bookId)) return [];

  // We pass the user query straight to `to_tsquery` via Supabase's
  // textSearch helper (which supports websearch mode in v2). The
  // tsvector column is `content_tsv`; results are ordered by ts_rank
  // (we approximate via ascending page_index for a deterministic
  // order — relevance isn't critical for in-book search, sequence is).
  const { data, error } = await supabase
    .from('pages')
    .select('id, page_index, pdf_page_number, content')
    .eq('book_id', bookId)
    .textSearch('content_tsv', trimmed, {
      type: 'websearch',
      config: 'english',
    })
    .order('page_index', { ascending: true })
    .limit(limit);

  if (error) {
    console.warn('[search] failed:', error.message);
    return [];
  }

  return (data ?? []).map((row) => {
    const r = row as {
      id: string;
      page_index: number;
      pdf_page_number: number | null;
      content: string | null;
    };
    const { snippet, highlightRange } = buildSnippet(r.content ?? '', trimmed);
    return {
      pageId: r.id,
      pageIndex: r.page_index,
      pdfPageNumber: r.pdf_page_number,
      snippet,
      highlightRange,
    };
  });
}

export type UseBookSearchState = {
  results: SearchHit[];
  loading: boolean;
  error: string | null;
};

/**
 * Debounced book-search hook. Returns an empty list while the query
 * is shorter than 2 chars; debounces 250ms so typing doesn't fire a
 * query per keystroke.
 */
export function useBookSearch(bookId: string, query: string): UseBookSearchState {
  const [state, setState] = useState<UseBookSearchState>({
    results: [],
    loading: false,
    error: null,
  });

  // Debounce key — useEffect runs whenever it changes after the
  // delay below.
  const trimmed = useMemo(() => query.trim(), [query]);

  useEffect(() => {
    if (trimmed.length < 2) {
      setState({ results: [], loading: false, error: null });
      return;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      setState((prev) => ({ ...prev, loading: true, error: null }));
      const hits = await searchBook({ bookId, query: trimmed });
      if (cancelled) return;
      setState({ results: hits, loading: false, error: null });
    }, 250);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [bookId, trimmed]);

  return state;
}
