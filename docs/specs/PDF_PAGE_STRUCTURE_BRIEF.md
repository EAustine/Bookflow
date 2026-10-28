# PDF text mode: keep the original pages and chapters

Brief for Claude Code, distilled from the research report "Bookflow: Converting PDFs to a Page-Faithful, Chapter-Aware Text Mode". If the full report is saved in the repo, it lives at `docs/research/pdf-page-structure-research.md`.

## The problem

Text mode turns a 20-page PDF into about 130 "pages". The pipeline flattens the PDF into one text stream and then cuts it into screen-sized chunks, so "page 15" in text mode is not page 15 in the Full view. Chapters are lost the same way.

## The rule

The original PDF page is the unit of storage. Screen size, font size and line height decide how text is drawn, never what counts as a page.

- Text page count must equal the PDF's `numPages`.
- Page N in text mode must hold exactly the text of page N in the Full view.
- Chapter page ranges must match the PDF outline when it exists.

## Data model (Supabase Postgres)

```
documents(id, file_path, num_pages, has_outline, has_page_labels, extraction_version, status)

chapters(id, document_id, ordinal, level, parent_id, title,
         start_page_index, end_page_index, start_block_id,
         source /* outline | heading | layout_model | fallback */)

pages(document_id, page_index /* 0-based */, page_label /* nullable, e.g. "xii" */,
      chapter_id, width, height, rotation,
      text /* clean body text for AI */, char_count, is_scanned, ocr_engine, is_spread)

blocks(id, document_id, page_index, ordinal,
       role /* heading | paragraph | list | footnote | caption | table */,
       text, bbox /* [x0,y0,x1,y1], PDF points, top-left origin */,
       continues_from_prev_page, continues_to_next_page,
       chapter_id, char_start, char_end)
```

- Display page number = `page_index + 1`. Show `page_label` only as secondary text when it differs ("p. 15 · printed xii").
- A paragraph that crosses a page break is stored as two blocks with the `continues_*` flags. The renderer joins them visually and puts the page marker at the exact point page 15 starts.
- De-hyphenate across lines and pages. A joined word belongs to the page where it starts.
- Remove running headers, footers and page numbers: the top and bottom ~8% of each page, with lines that repeat on 30 to 50% of pages. Keep the removed text in a debug field.
- Never split a two-page spread into two pages. Keep front matter as its own chapter.
- Version the extraction (`extraction_version`). Re-extract the whole book when the parser changes.

## Extraction pipeline

Run it in a worker, not on the phone and not in a Supabase Edge Function. Edge Functions are capped at 256MB memory and 2s CPU per request.

1. Upload to Supabase Storage.
2. An Edge Function or DB trigger adds a job row.
3. A Node worker using `pdfjs-dist` (Apache-2.0), on Cloud Run, Fly.io or Render, does the extraction and writes chapters, pages and blocks.
4. It sets `status = ready`, and the app listens through Supabase Realtime. Stream page by page so page 1 is readable early.

For each document:
- `getDocument`, then `numPages`, `getPageLabels()` (null if none), `getOutline()` (null if none) and `getMetadata()`.
- For each page (`getPage(n)` is 1-based): `getTextContent()`. Rebuild lines from items that share a baseline (`transform[5]`) and font size and touch horizontally (`transform[4] + width`), and use `hasEOL`. Group lines into blocks by vertical gaps, and mark headings by font-size ratio (about 1.3x body size or more).
- Across pages: remove headers and footers, de-hyphenate, order columns, and link paragraphs across page breaks.

Chapters, in this order (record which method was used):
1. Outline: `getOutline()`. For each item, resolve `dest` with `getDestination()` if it is a string, then `getPageIndex(dest[0])` (0-based). Walk `items[]` for levels. A chapter runs from its start page to the page before the next chapter starts.
2. Tagged PDF: `page.getStructTree()` H1/H2.
3. Heading heuristics: font-size histogram, short lines near the top of the page, "Chapter / Part / Section" patterns.
4. Layout model fallback (Docling or Azure Document Intelligence `prebuilt-layout`).
5. Last resort: page-range groups ("Pages 1-10"). Never invent chapter titles.

Scanned pages: a page with under ~20 characters of text and a full-page image is scanned. OCR only those pages, keep their `page_index`, and set `is_scanned` and `ocr_engine`.

Licensing: PyMuPDF and pymupdf4llm are AGPL unless you buy the Artifex licence, so prefer pdf.js, pdfplumber or PDFBox.

## Reader UX

- Inline page dividers: a thin rule with "Page 15" (plus "· xii" when the label differs) at each page start, rendered as a `pageMarker` item in the FlashList of blocks. Tapping it opens that page in Full view.
- Sticky indicator: "Chapter 3 · p. 15 of 20" for the topmost visible block. Remove the screen-count page numbers.
- Contents shows chapters with page ranges ("Chapter 3 · pp. 15-21").
- Go to page uses PDF page numbers and accepts printed labels like "xii".
- The Full/Text toggle keeps your place: Text to Full opens the page of the topmost block, and Full to Text scrolls to the first block of that page.
- TTS is queued by block, highlights words by character offsets, updates the page indicator when it crosses a page marker, and skips header, footer and footnote roles.

## AI features

- "Summarise page 15" reads `pages.text WHERE page_index = 14`, never a screen chunk. "Summarise chapter 3" joins that chapter's pages.
- Cache summaries by `(document_id, page_index or chapter_id, extraction_version, model)`.
- Q&A chunks stay inside page boundaries, or cross at most one and record `page_indices: [14, 15]`. Every chunk carries `chapter_id` and `page_label`. A chunk without a page number never goes into the index.
- Put markers in the prompt context, like `[Page 15 | label xii | Chapter 3]`, and ask for citations like "(p. 15)" using only pages in the context. After generation, check that every cited page was retrieved, and link each citation to that page in Full view.
- "Page 15" in a user question means `page_index + 1`. If it only matches a printed label, resolve it and say "printed p. 15 (PDF page 23)".
- Translate per block and store it next to the original, so page markers and TTS offsets still line up.

## Acceptance tests

Use five PDFs: a 20-page single-column PDF with an outline, a novel with roman-numeral front matter, a two-column paper, a scanned book, and a PDF with no outline. For each one:
- the text page count equals `numPages`;
- chapter page ranges match the outline;
- the text of page N matches page N in the Full view;
- "summarise page N" quotes only page N content.
