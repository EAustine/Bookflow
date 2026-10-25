/**
 * Query keys for the library feature (§6: "query keys defined per
 * feature in `api/keys.ts`").
 *
 * Built as a hierarchy rather than flat strings so invalidation can be
 * scoped. `invalidateQueries({ queryKey: libraryKeys.all })` clears
 * everything library-related; `libraryKeys.detail(id)` clears one book.
 * Realtime events (§6) invalidate rather than hand-patching state, and
 * the shape of these keys is what makes that cheap.
 *
 * `as const` throughout: TanStack compares keys structurally, and a
 * widened `string[]` makes typos silently miss instead of failing.
 */
export const libraryKeys = {
  all: ['library'] as const,

  /** Every book list, whatever the filter. */
  lists: () => [...libraryKeys.all, 'list'] as const,
  /** One list. `userId` is part of the key so a sign-out/sign-in on the
   *  same device cannot serve the previous account's library from
   *  cache — which a persisted cache makes a real possibility. */
  list: (userId: string) => [...libraryKeys.lists(), userId] as const,

  details: () => [...libraryKeys.all, 'detail'] as const,
  detail: (bookId: string) => [...libraryKeys.details(), bookId] as const,

  /** Page content, keyed per book. The reader's hot path. */
  pages: (bookId: string) => [...libraryKeys.all, 'pages', bookId] as const,
  page: (bookId: string, pageIndex: number) =>
    [...libraryKeys.pages(bookId), pageIndex] as const,
} as const;
