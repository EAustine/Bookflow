# Plan: page-faithful PDF text mode

Checked against `PDF_PAGE_STRUCTURE_BRIEF.md` and
`pdf-page-structure-research.md`. No code written yet.

---

## 1. The finding that changes the size of this

**The pipeline already extracts correct per-page text, already iterates real
PDF pages, and already records the real page number on every row. Then it
throws the structure away.**

`supabase/functions/process-book/index.ts`:

| Line | What it does |
|---|---|
| 938 | `extractText(proxy, { mergePages: false })` — per-page text, plus `totalPages` |
| 1018 | `for (let i = 0; i < perPageText.length; i++)` — iterates **real PDF pages** |
| 1030, 1055 | `pdf_page_number: i + 1` — records the real page on every emitted row |
| **1040** | `sliceIntoPagesByWordCount(bodyText, WORDS_PER_PAGE)` — **cuts each real page into ~200-word rows** |

And `pages.pdf_page_number` has existed since migration `0010`, with the
comment: *"Lets the PDF reader still snap to native pages even though the data
layer is now page-slice-based."*

So this is not "build a page-aware pipeline". It is **stop discarding the page
structure that is already computed**, and the research report's root-cause
diagnosis — "flattens the PDF into one text stream" — is not quite what the
code does. It slices *within* each page, which is better news: the mapping from
today's rows to real pages already exists in the data.

### A second bug the brief's rule exposes

Line 1020: `if (!cleaned || countWords(cleaned) < 5) continue;`

Near-empty pages — section dividers, plate pages, blanks — emit **no row at
all**. So even ignoring the slicing, page count can never equal `numPages`.
Rule "text page count must equal `numPages`" requires emitting these as empty
pages, not skipping them.

## 2. What in the current plan conflicts

### 2.1 Anything that splits text into screen-sized pages

`sliceIntoPagesByWordCount` has three call sites:

| Line | Format | Verdict |
|---|---|---|
| 683 | **EPUB** | **Keep.** EPUB has no inherent pages. 200 words is a deliberate product decision and is right here |
| 1040 | **PDF** | **Remove.** This is the bug |
| 1349 | **PDF**, OCR/chunked path for large books | **Remove.** Same bug, second path |

The rule is not "stop paginating by word count". It is **"a PDF page is a page;
an EPUB page is a product decision"**. Both call sites for PDF go; the EPUB one
stays.

### 2.2 `ARCHITECTURE.md` §7.2 — the `pages.id` constraint

Approved 2026-10-22: *the canonical document preserves `pages.id`*, because
seven tables reference it (`highlights`, `translations`, `practice_questions`,
`summaries`, `reading_sessions`, `audio_cache`, `chunk_embeddings`).

Collapsing 130 slice-rows into 20 page-rows destroys 110 ids. **On its face
this breaks the constraint** — which is why I stopped rather than starting.

**But `pdf_page_number` rescues it.** Every existing slice row already knows
which real page it came from, so the remap is a `GROUP BY`, not a guess:

```
old page row (slice 37, pdf_page_number 6)  ->  new page row for PDF page 6
```

Page-level attribution survives for every dependent table. What does **not**
survive is character offsets *within* a page: a highlight stored as "chars
120–180 of slice 37" has to become "chars N–M of page 6", and N is only
recoverable if slices are re-concatenated in order — which they can be,
because `index` is ordered and `pdf_page_number` groups them.

So §7.2 holds, with an amendment: it preserves `pages.id` for **EPUB**, and for
PDF it preserves *page identity* through `pdf_page_number` while the row ids
change. That is a real change to an approved decision and needs your sign-off.

### 2.3 The extraction-location conflict

The research says (§8): Edge Functions are capped at 256MB / 2s CPU, so run a
container worker on Cloud Run/Fly/Render.

**The code contradicts this.** `process-book` already extracts PDFs in an Edge
Function today, including a `pdf-lib` chunking path for books past 100 pages.
It is in production.

This also collides with **M0 spike 4**, which recommended a `jobs` table drained
by `pg_cron` + `pg_net` invoking an Edge Function — chosen partly because
pgmq has no worker either.

I am not proposing we adopt a new hosting platform on the strength of a limits
page when working code disagrees. **Proposal:** measure first. The slicing
removal makes extraction *cheaper* (fewer rows, less string work), so the
likeliest outcome is that the current Edge Function keeps working. If a real
book blows the limit, that is the evidence for a worker — and M5 can add one.

### 2.4 Schema shape

The brief wants `documents / chapters / pages / blocks`. Today there is
`books / pages`, no chapters table, no blocks.

`ARCHITECTURE.md` §9.1 already plans a `documents` table. The brief adds
`chapters` and `blocks`. **Blocks are the expensive part** — they carry bboxes,
roles, continuation flags, char offsets — and nothing in the current reader
consumes them.

**Proposal: do not build `blocks` yet.** Page-faithful pages and chapters
deliver every acceptance test in the brief except inline block-level rendering.
Blocks are what you need for bbox-accurate Full↔Text sync and footnote
skipping; they are a later, separable milestone.

### 2.5 New dependencies implied

| Implied | Status | Needed now? |
|---|---|---|
| `pdfjs-dist` | absent | **No** — `unpdf` already wraps pdf.js and exposes the proxy (`getDocumentProxy`, line 936), so `getOutline()` / `getPageLabels()` are already reachable |
| `@shopify/flash-list` | absent | **No** — the reader's `FlatList` already virtualises; the brief says "FlashList/FlatList" |
| Azure Document Intelligence | n/a | **No** — OCR fallback is a later concern |

## 3. The plan

Four phases. Each ships independently and each has an acceptance test from the
brief.

### Phase 1 — Stop discarding the structure *(the actual fix)*

Changes confined to `process-book`:

1. Branch on `file_type`. PDF stops calling `sliceIntoPagesByWordCount`; EPUB
   keeps it unchanged.
2. Emit **one `pages` row per PDF page**, `page_index = i`,
   `pdf_page_number = i + 1`, `content` = that page's cleaned text.
3. Emit near-empty pages instead of skipping them, so count equals `numPages`.
4. Bump a new `extraction_version` on `books` so old and new rows are
   distinguishable.

**Acceptance:** text page count equals `numPages`; page N's text equals page N
in Full view. Testable on any PDF without an account.

### Phase 2 — Chapters from the outline

5. Use the pdf.js proxy already in hand: `getOutline()`, resolve each `dest`
   via `getDestination()` → `getPageIndex()`. Add a `chapters` table with
   `start_page_index` / `end_page_index` / `source`.
6. Keep the existing heading-regex detector as the `source = 'heading'`
   fallback, and page-range groups as last resort. Never invent titles.
7. `getPageLabels()` → `pages.page_label`, display-only.

**Acceptance:** chapter page ranges match the outline.

### Phase 3 — Reader and AI read real pages

8. Inline "Page 15" dividers as a `pageMarker` item; sticky
   "Chapter 3 · p. 15 of 20"; drop the screen count.
9. Go-to-page accepts PDF numbers and printed labels.
10. AI page context reads `pages.content WHERE page_index = N`, and prompts
    carry `[Page N | Chapter C]` markers with post-generation citation checks.

**Acceptance:** "summarise page N" quotes only page N.

This is where the §7.2 question bites — see Decision 1.

### Phase 4 — Backfill existing PDFs

Only after 1–3 are proven. Options in Decision 1.

## 4. Decisions — taken 2026-10-28

| # | Decision | Chosen |
|---|---|---|
| 1 | Existing PDFs | **(a) New uploads only.** Existing books keep slice-pages; `reprocessBook` lets a user opt in per book and knowingly lose that book's highlights. Backfill revisited at M5 |
| 2 | Extraction location | **Measure first.** The current Edge Function already extracts PDFs in production and the fix makes it cheaper. A container worker needs evidence, not a limits page |
| 3 | `blocks` table | **Deferred.** Pages + chapters satisfy every acceptance test except block-level rendering |

### Consequence of (a)

`ARCHITECTURE.md` §7.2 stands unamended. New PDFs get one row per page from the
start, so no existing `pages.id` is destroyed and the seven dependent tables
are untouched. The two page models coexist, distinguished by
`extraction_version` — which is exactly what that column is for.

## 5. Decisions as originally posed

**Decision 1 — existing PDFs.** New uploads get true pages either way.

| Option | Cost | Risk |
|---|---|---|
| **(a) New uploads only.** Existing PDFs keep slice-pages. `reprocessBook` already exists, so a user can opt in per book and knowingly lose that book's highlights | None upfront | Two page models coexist indefinitely; "page 15" means different things in two books |
| **(b) Backfill with remap.** Use `pdf_page_number` to collapse rows and repoint all seven tables. Character offsets recomputed by re-concatenating slices in `index` order | One migration, reversible if staged | Offsets are the fiddly part; embeddings need regenerating at cost |
| **(c) Backfill, drop derived data.** Collapse pages, delete summaries/practice/embeddings for PDFs, keep highlights at page granularity | Cheapest backfill | Users lose cached AI work |

**My recommendation: (a) now, (b) at M5.** (a) unblocks the fix immediately with
zero migration risk and is reversible. (b) is genuinely feasible *because* of
`pdf_page_number`, but it belongs with the other live-data migrations in M5,
where `documents`/`jobs` land and where there is a staging path.

**Decision 2 — extraction location.** Measure the current Edge Function against
a real book before adopting a container worker, or accept the research's
recommendation and plan one now? I recommend measuring.

**Decision 3 — blocks.** Build `blocks` in this workstream, or defer until
bbox-level Full↔Text sync is actually being built? I recommend defer.

## 5. Docs that need correcting

- The path you referenced, `docs/specs/pdf-page-structure.md`, does not exist.
  Files are `PDF_PAGE_STRUCTURE_BRIEF.md` and `pdf-page-structure-research.md`.
  The brief also points at `docs/research/...`, which does not exist either.
- `CLAUDE.md`'s file tree still shows `src/screens/`, removed in M3 today.
- `ARCHITECTURE.md` §7.2 needs the amendment in 2.2 once Decision 1 is made.
