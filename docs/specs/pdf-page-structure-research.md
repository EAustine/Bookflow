# Bookflow: Converting PDFs to a Page-Faithful, Chapter-Aware Text Mode

**Bottom line:** Your text mode turns 20 pages into roughly 130 because the pipeline flattens the PDF into one text stream and then cuts it into screen-sized chunks. To fix it, make the original PDF page the stored unit (chapter, then page, then block, with a page index on every block). Screen layout should only affect how text is drawn, never what counts as a page. Do the extraction in a server-side worker, not on the phone and not inside a Supabase Edge Function.

## TL;DR

- **Root cause and fix:** Extract text one page at a time with page indices, using pdf.js `getTextContent()` per page or PyMuPDF `page.get_text("dict")`. Store it as `chapter -> pages -> blocks`, and never re-paginate the stored data. In the reader, draw inline "Page 15" dividers and a sticky "p. 15 of 20" indicator. Screens are "screens", not pages.
- **Chapters:** Build them from the PDF outline (pdf.js `getOutline()` then `getDestination()`/`getPageIndex()`, or PyMuPDF `doc.get_toc()`). Use page labels (`getPageLabels()`, `page.get_label()`) only for display. If there is no outline, detect headings by font size. If that fails too, fall back to a layout model (Docling, Azure Document Intelligence) or to plain page-range groups.
- **Where to run it:** Run a Node (pdfjs-dist, Apache-2.0) or Python worker behind your Supabase backend. Supabase Edge Functions are capped at 256MB memory and 2s CPU per request, so use them only to trigger the job. Add a cloud OCR or layout fallback (Azure Document Intelligence, Textract, Google Document AI) for scanned pages. Every AI feature should read from the same page-indexed store and cite pages.

## Key Findings

### 1. Why the structure is lost

The ~130 "pages" come from paginating a flattened string by viewport size. Font size, line height and screen size all change the count, so "page 15" means nothing stable. Every app that solves this keeps two kinds of position apart:

- **Physical page index:** the 0-based position in the PDF, which is what the Full view shows.
- **Fluid reading position:** the screen or scroll offset in reflowed text.

The second is always worked out from the first, never stored as a page number. The EPUB standard makes the same split. The EPUB 3.3 `page-list` nav "Identifies the nav element that contains a list of pages for a print or other statically paginated source."\[1\] Inside the content, `epub:type="pagebreak"` markers record where each print page began, so reflowed text can still be cited by the original page numbers.\[2\] Bookflow should copy this model for PDFs.

### 2. Page-aware extraction: library comparison

All of the tools below can return text per page. They differ in layout quality, how much structure they detect, licensing, and where they can run.

| Tool | Per-page output | Bounding boxes | Structure / roles | License / deployment | Fit for Bookflow |
|---|---|---|---|---|---|
| **pdf.js / pdfjs-dist** | `pdf.getPage(n)` (1-based) then `page.getTextContent()` | Yes: each item has `str`, `transform` (x = `[4]`, baseline y = `[5]`, font size ~ `[3]`), `width`, `height`, `fontName`, `hasEOL`\[3\] | `getOutline()`, `getPageLabels()`, `getStructTree()` for tagged PDFs; no header/footer detection | Apache-2.0; Node, browser, WebView | **Primary choice** for a permissive JS pipeline |
| **PyMuPDF (fitz)** | `for page in doc`; `page.number` (0-based) | Yes: `get_text("dict")` gives blocks, lines, spans with bbox, font, size, flags | `doc.get_toc()`, `page.get_label()` | AGPL-3.0 or Artifex commercial | Best quality and speed in Python; license is a gate |
| **pymupdf4llm** | `to_markdown(path, page_chunks=True)` returns one dict per page with `metadata` (page number), `toc_items`, `text` | Page boxes in layout mode | Header/footer removal, multi-column detection | AGPL (built on PyMuPDF) | Fastest route to a working prototype\[4\] |
| **pdfplumber / pdfminer.six** | `pdf.pages[i]`; `extract_pages()` | Yes (chars, words, `LTTextContainer`)\[5\] | None built in | MIT | Permissive Python option; slower |
| **Poppler `pdftotext`** | Form feed `\f` between pages by default (`-nopgbrk` turns it off); `-f`/`-l` page range; `-layout`; `-bbox-layout`\[6\]\[7\] | Only with `-bbox-layout` | None | GPL CLI | Fine for a quick, robust baseline; split on `\f`\[8\]\[9\] |
| **Apache PDFBox** | `PDFTextStripper.setStartPage/EndPage` | Via `TextPosition` | Outline, page labels APIs | Apache-2.0, Java | Powers Android in `expo-pdf-text-extract` |
| **Docling (IBM)** | Every `DocItem` has `prov[]` with `page_no`, `bbox`, `charspan` | Yes | `section_header`, `page_header`, `page_footer`, tables, figures, reading order | MIT-licensed codebase (individual models carry their own licenses), Python, GPU helps | Best open-source layout model for hard PDFs |
| **Marker** | `--paginate_output` adds page separators; JSON output is a list of pages, each a `Page` block with child blocks\[10\] | Polygons | `SectionHeader`, `PageHeader`, `PageFooter`, `Footnote`, `TableOfContents`\[10\] | Python, GPU recommended; code Apache 2.0, model weights under a modified AI Pubs Open Rail-M license (free for research, personal use, and startups under $5M funding/revenue) | Strong for books and papers; the weights license matters once you grow past $5M |
| **Unstructured** | `partition_pdf(strategy="hi_res")` gives elements with `metadata.page_number`\[11\]\[12\] | `metadata.coordinates`\[13\] | `Title`, `NarrativeText`, `Header`, `Footer` | OSS plus hosted API | Good for RAG; `hi_res` is slow\[14\] |
| **Azure Document Intelligence (prebuilt-layout)** | `pages[].pageNumber`, `paragraphs[].boundingRegions` | Yes | Paragraph `role`: `title`, `sectionHeading`, `footnote`, `pageHeader`, `pageFooter`, `pageNumber`, `formulaBlock` | Cloud; Layout about $10 per 1,000 pages (docuocr.com, checked against Azure's Retail Prices API, July 2026) | **Best managed fallback**, OCR included |
| **AWS Textract / Google Document AI / Adobe PDF Extract / LlamaParse** | Per-page blocks or elements with page refs (Document AI `pageRefs[].page` is zero-based)\[15\] | Yes | Layout roles vary by product | Cloud, per page | Alternatives to Azure; pick one vendor |
| **GROBID** | TEI with coordinates | Yes | Scholarly structure only | Java service | Only for academic papers |
| **`expo-pdf-text-extract`** | `extractTextFromPage(path, n)` (1-based), `getPageCount()`\[16\]\[17\] | No | None | Uses PDFKit on iOS and PDFBox on Android; needs a dev build, not Expo Go\[17\]\[18\] | On-device fallback for offline use only |

**Reliability notes:**

- **pdf.js items are not words or lines.** One visible word can arrive as several items, and item order is not always reading order. You need to rebuild lines yourself: join items that share a baseline (`transform[5]`) and font size and that touch horizontally (`transform[4] + width`). `hasEOL` marks line ends.\[19\]
- **The PDF y-axis points up.** Convert coordinates with `viewport.transform` before using them for display or comparison.\[20\]
- **Docling provenance has edge-case bugs.** Lists that cross a page break are one known case. Also, Markdown export loses provenance: keep the lossless JSON (`save_as_json`) and use that.\[21\]\[22\]
- **Your backends must agree on page breaks.** One project found that pdftotext emits `\f` at every page break while its PyMuPDF path joined pages with plain newlines, which silently shifted every page-to-offset mapping.\[23\] Store page boundaries as structure, not as delimiter characters.

### 3. Detecting and preserving chapters

Try these in order and record which method produced the result (`chapter.source = outline | heading | layout_model | fallback`):

1. **Outline / bookmarks (most reliable when present).**
   - **pdf.js:** `const outline = await pdf.getOutline()`. It returns `null`, not an empty array, when there is no outline. For each item: if `dest` is a string, call `await pdf.getDestination(dest)`. Then `await pdf.getPageIndex(destArray[0])` gives a 0-based index.\[24\]\[25\]
   - **Walk `items[]` recursively for levels.** Item titles can be nested children, and a dest's first element may already be a ref.
   - **PyMuPDF:** `doc.get_toc(simple=False)` returns `[level, title, page(1-based), dest]`.\[26\]
   - **Page ranges:** chapter N runs from its start page to the page before chapter N+1 starts. Store `start_page_index`, `end_page_index`, `level`, and `start_block_id` if the chapter starts mid-page.
2. **Page labels (for display only, never for lookup).** PDF.js documents the split itself: `getPage()` takes a position starting at 1, `getPageIndex()` returns an index starting at 0, and `getPageLabels()` returns labels for those indexes, or `null` if there are none.\[27\]\[28\] Store both values. Front matter labelled "i, ii, iii" and body pages starting at "1" on physical page 9 are common. "Treating a label as an array offset conflates different values."\[27\]
3. **Tagged PDF structure tree.** `page.getStructTree()` in pdf.js, and `getTextContent({ includeMarkedContent: true })`. Use `H1`/`H2` tags where they exist. Many consumer PDFs are untagged, so treat this as a bonus, not a dependency.
4. **Heading heuristics.**
   - From the pdf.js items or PyMuPDF spans, build a font-size histogram. The most common size is body text.
   - Spans that are 1.3x or more larger (or bold with flags), short, near the top of the page, and often preceded by whitespace are heading candidates.
   - Patterns like `^(chapter|part|section)\s+\w+` or `^\d+(\.\d+)*\s` raise confidence.
   - Also look for a printed table of contents page and match its entries against later headings.
5. **Layout model.** Docling `section_header`, Azure `sectionHeading`, Marker `SectionHeader`.\[29\]\[30\]
6. **Fallback.** If nothing is found, make one chapter per N pages ("Pages 1-10") or a single "Document" chapter. Never invent chapter titles you can't back up.

### 4. Recommended data model

Use tables or JSON in Supabase Postgres plus Storage:

```
documents(id, file_path, num_pages, has_outline, has_page_labels, extraction_version, status)

chapters(id, document_id, ordinal, level, parent_id, title,
         start_page_index, end_page_index, start_block_id, source)

pages(document_id, page_index /*0-based, PK part*/, page_label /*nullable, e.g. "xii"*/,
      chapter_id /*chapter containing the page start*/, width, height, rotation,
      text /*clean body text for AI*/, char_count, is_scanned, ocr_engine, is_spread)

blocks(id, document_id, page_index, ordinal, role /*heading|paragraph|list|footnote|caption|table*/,
       text, bbox /*[x0,y0,x1,y1] in PDF points, top-left origin*/,
       continues_from_prev_page bool, continues_to_next_page bool,
       chapter_id, char_start, char_end /*offsets into pages.text*/)

tts_marks(block_id, sentence_ordinal, word_ordinal, char_start, char_end)  -- or computed on the fly
```

Design rules:

- **One canonical "page number": `page_index + 1`.** It matches the Full view's page counter and pdf.js `getPage()`. Show `page_label` as secondary text ("p. 15 · printed xii") only when it differs.
- **Paragraphs that cross a page break are stored as two fragments.** The last block of page 14 gets `continues_to_next_page = true` and the first block of page 15 gets `continues_from_prev_page = true`. The renderer joins them into one visual paragraph and puts the page marker at the exact character where page 15 begins. The text still belongs to the right page for AI and for comparing views.
- **De-hyphenation:** if a line ends in `-` and the next line (on the same page or the next page) starts with a lowercase letter, join the word. Assign the joined word to the page where it starts.
- **Running headers, footers and page numbers:** take the top and bottom ~8% of each page. Normalise digits to `#`. Drop lines that repeat on at least ~30-50% of pages, or that match the page label or index. pymupdf4llm, Marker, Docling and Azure (`pageHeader`/`pageFooter`/`pageNumber` roles) do this for you.\[4\]\[29\] Keep the removed text in a `chrome` field for debugging rather than deleting it.
- **Multi-column pages and reading order:**
  - PyMuPDF `get_text("dict", sort=True)` gives top-to-bottom, left-to-right order only.\[31\]
  - For columns, cluster blocks by x-range and read column by column.\[32\]
  - pymupdf4llm, Docling and Marker handle columns with layout analysis.
  - Store `ordinal` after reading-order resolution, so every consumer (renderer, TTS, AI) uses the same order.
- **Footnotes:** tag them `role=footnote` with the page they belong to. Show them at the end of the page section (before the next page marker) or as tap-to-expand notes. TTS should skip them by default, which Speechify and ElevenReader both offer as a setting.\[33\]
- **Version the extraction** (`extraction_version`). If parsing changes, re-extract the whole book. Character offsets and highlights depend on the version.

### 5. UX patterns from existing apps

- **Google Play Books:** offers "Original pages" (fixed layout that "usually matches the printed edition") and "Flowing text" (adjustable font) as separate views. Their partner docs ask that "each page of your .pdf file correspond to a single page of text," which shows that mapping pages one-to-one is the assumption behind the toggle.\[34\]\[35\]
- **Kindle "real page numbers":** an option called "Page in Book" shows print-edition page numbers, which come from a publisher-supplied page map. The page indicator moves through reflowed screens, so you may turn several screens before the page number changes.\[36\]\[37\]\[38\] That is the right behaviour for Bookflow too.
- **EPUB page-list / pagebreak:** invisible anchors in the text flow with labels like `aria-label="Page 48"`, plus a flat page list for "go to page".\[39\]\[40\] This is the exact pattern to copy.
- **Adobe Acrobat Liquid Mode:** reflows using cloud AI (the PDF "is sent to Adobe's Document Cloud for processing") and leaves the original unchanged. Adobe's help page says "Liquid Mode does not apply to files with more than 200 pages," and Adobe's Acrobat for Android Liquid Mode help page also lists files larger than 10MB as unsupported. So even Adobe does the restructuring server-side and with limits.
- **Voice Dream Reader:** lets you view PDFs "both in the original layout and as plain text," with a footer page number you tap to jump, and a "Page" navigation unit when the document has page markers. It skips PDF headers and footers automatically.\[41\]\[42\]\[43\]
- **Speechify:** jumps to a page through a Thumbnails sidebar (PDF only, premium). Its skip settings cover headers, footers, footnotes, citations and URLs.\[33\]\[44\]\[45\]
- **ElevenReader:** its marketing says "Smart imports pull out the main text and skip headers, footers, and page numbers". Some of its pages call this an Ultra-plan feature.\[46\]\[47\]
- **KOReader:** reflows PDFs into a single column with k2pdfopt and provides a "flip mode" that shows the full original page. A user report says the status bar shows the pinned source page in reflow mode.\[48\]\[49\]\[50\]
- **Moon+ Reader:** a user report says the reflowed view breaks after each source page and shows a page number there.\[51\] I could not find official documentation for this.
- **Gap:** none of these apps officially document inline original-page dividers in their text views. Bookflow can stand out by doing this explicitly.

**Recommended Bookflow UX:**

- **Inline page dividers.** At each page start, show a thin rule with a small centred label "Page 15" (plus "· xii" when the label differs). Make it tappable to open that page in Full view. Implement it as a list item of type `pageMarker` in a FlashList/FlatList of blocks.
- **Sticky position indicator.** Show "Chapter 3 · p. 15 of 20" for the topmost visible block. Drop the ~130 screen count completely, or show a progress percentage instead.
- **Chapter navigation.** The table of contents shows chapters with page ranges ("Chapter 3 · pp. 15-21"). Opening a chapter in Text mode renders only that chapter's pages, which keeps long books fast.
- **Go to page** uses PDF page numbers (and accepts labels like "xii" by looking them up in the label map).
- **Full and Text toggle keeps your place.** Going Text to Full opens `page_index` of the topmost visible block, and can also scroll to its bbox. Going Full to Text scrolls to the first block of the current page. This is your "compare" feature, and it can also be shown as a split view on tablet and web.
- **TTS:** queue speech by block, track word highlights by character offsets within `blocks.text`, and update the page indicator when speech crosses a `pageMarker`. Optionally announce "Page 15" (Voice Dream style, off by default). Skip header/footer/footnote roles.

### 6. Keeping AI features tied to original pages

- **"Summarise page 15"** should read `SELECT text FROM pages WHERE page_index = 14`. It should never read a screen chunk. "Summarise chapter 3" concatenates that chapter's pages in order. Cache summaries keyed by `(document_id, page_index | chapter_id, extraction_version, model)`.
- **Chunking for Q&A:**
  - Chunk inside page boundaries, or allow a chunk to cross at most one boundary and record `page_indices: [14, 15]`.
  - Keep `chapter_id` and `page_label` in the chunk metadata.
  - This mirrors pymupdf4llm `page_chunks=True` and the LangChain `PyPDFLoader` convention (one document per page with `page` and `page_label`).\[4\]\[52\]
  - The rule one RAG guide states fits here: a chunk without a page number should never reach your index.\[52\]
- **Prompt format:** put explicit markers in the context, for example `[Page 15 | label xii | Chapter 3]\n...text...`. Tell the model to cite as "(p. 15)" using only numbers that appear in the context.
- **Check citations after generation.** Every cited page must be among the pages you retrieved. Turn each citation into a link that opens that page in Full view.
- **Page numbers in user queries:** treat "page 15" as `page_index + 1` by default, because that matches the Full view counter. If page labels exist and the user's number matches a label but not an index (say a printed "15" that sits on physical page 23), resolve it to the label and show "printed p. 15 (PDF page 23)".
- **Translation is done per block**, and the result is stored next to the original, so page markers and TTS offsets still line up.

### 7. Scanned PDFs and edge cases

- **Detecting scanned pages:**
  - A page is likely scanned when it has little or no extractable text (for example under ~20 characters) but a full-page image block. Check page by page, because mixed documents are common.
  - OCR only those pages and keep `page_index`. All the cloud engines return page numbers.
  - Good options: Azure prebuilt-layout (OCR plus roles in one call), or Tesseract/OCRmyPDF on the worker.
  - Mark `is_scanned` and `ocr_engine`, and show a small "OCR" badge on that page's divider.
- **No outline:** run the heading heuristic. If that fails, use page-range chapters. Tell the user plainly that "This PDF has no chapter information."
- **Inconsistent or missing page labels:** treat labels as display-only. If `getPageLabels()` returns `null`, show physical numbers only. You can optionally infer printed numbers from detected footer digits before removing them, but store them as `inferred_label` and keep them separate from real labels.
- **Front matter:** keep it as a "Front matter" chapter (cover, title, contents) with its own pages. Don't drop it, or page parity breaks.
- **Two-page spreads:**
  - Pages with width/height > ~1.2 that hold two text columns split by a central gutter are likely scanned spreads.
  - Keep one `page_index`, as the Full view does. Set `is_spread`, and read left half then right half.
  - Never split a spread into two Bookflow pages, or the 1:1 mapping breaks.
- **Rotated pages:** apply `rotation` before ordering blocks.
- **Encrypted or copy-protected PDFs:** pdf.js and PyMuPDF can open owner-password-restricted files. If you can't extract text, route the file to OCR.

### 8. Performance, cost, and where to run it

- **Supabase Edge Functions are not suitable for parsing.** The documented limits are 256MB memory, 2s CPU time per request, and a 150s (Free) or 400s (paid) wall clock. Going over returns `546 WORKER_RESOURCE_LIMIT`.\[53\]\[54\] Supabase's own troubleshooting page for that error says that if your work needs more resources, "you can look into other solutions, such as AWS Lambda, that are less restrictive, or self-host edge functions."
- **Recommended setup:**
  1. The client uploads to Supabase Storage.
  2. An Edge Function or DB trigger writes a row to a job queue.
  3. A container worker (Node with pdfjs-dist, or Python) on Cloud Run, Fly.io or Render pulls the job, extracts the book, writes `chapters/pages/blocks`, and sets `status=ready`.
  4. The app subscribes through Supabase Realtime.
  5. Stream results one page at a time so page 1 can be read before the whole book finishes.
- **On-device:**
  - `expo-pdf-text-extract` gives per-page text from PDFKit/PDFBox.\[17\]\[55\] It returns no bboxes, outline or font data, so you can't do header removal or heading detection with it.
  - pdf.js can run in a WebView on mobile and natively in the browser on web. Large books on low-end phones will be slow and use a lot of memory.
  - Use on-device extraction only as an offline preview. The server result replaces it.
- **Cost:**
  - Open-source text-layer extraction costs fractions of a cent per book on a CPU container.
  - Layout models (Docling, Marker, Unstructured `hi_res`) run much faster on a GPU.
  - Cloud OCR and layout engines charge per page. According to docuocr.com (July 2026), Azure Read costs $1.50 per 1,000 pages (about $0.60 above 1M pages a month), Azure Layout $10 per 1,000 pages, and AWS Textract Tables $15 per 1,000 pages. Send them only scanned or failed pages, not every book.
- **Licensing:** PyMuPDF and pymupdf4llm are "Dual Licensed - GNU AFFERO GPL 3.0 or Artifex Commercial License".\[56\] A closed-source app or SaaS will need the commercial license.\[57\]\[58\] pdf.js (Apache-2.0), pdfplumber/pdfminer.six (MIT) and PDFBox (Apache-2.0) avoid this.
- **File limits:** set an upload cap (for example 100-200MB and 2,000 pages). Process in page batches. Store page images or thumbnails for Full view separately from text.

## Recommendations

1. **Change the storage model first.** This is the real fix. Persist `chapters -> pages -> blocks` with `page_index` everywhere, and remove any code that saves screen-paginated "pages". Screen pagination becomes a render-time calculation inside a chapter, if you keep it at all. A continuous scroll with page dividers is simpler and matches the dividers better.
2. **Extraction service:** a Node worker using `pdfjs-dist`. This is my main recommendation because it is permissive, the same library can render the Full view on web, and it covers `getOutline`, `getPageLabels`, `getTextContent` and `getStructTree`. Pipeline per document:
   - `getDocument` then read `numPages`, `getPageLabels()`, `getOutline()` (resolve each dest to a page index), and `getMetadata()`.
   - For each page: `getTextContent()`, then rebuild lines (baseline/size/adjacency join, `hasEOL`), then group lines into blocks by vertical gaps, then mark headings by font-size ratio.
   - Across all pages: remove headers and footers by repetition, de-hyphenate, sort columns, and link paragraphs across page breaks.
   - Pages with almost no text go to Azure Document Intelligence `prebuilt-layout`, keeping the page index.
   - If there is no outline and no confident headings, send the document to Docling or Azure for `sectionHeading` detection. Otherwise use page-range chapters.
   - If you prefer Python and can accept AGPL or buy the Artifex license, use PyMuPDF (`get_toc`, `get_label`, `get_text("dict", sort=True)`) or pymupdf4llm (`page_chunks=True`) instead. Quality goes up and the work involved drops.
3. **Text view UX:** inline "Page N" dividers, a sticky "Chapter · p. N of M" indicator, a table of contents with page ranges, go-to-page using PDF numbers, and a Full/Text toggle that keeps your place by page and bbox. Never show the screen count as pages.
4. **AI:** page-scoped summaries read `pages.text` directly. Q&A chunks carry `page_indices` and `chapter_id`. Prompts include `[Page N]` markers, and citations are checked after generation. Default to physical page numbers and resolve labels explicitly.
5. **Test with a small corpus:** a 20-page single-column PDF with an outline, a novel with roman-numeral front matter, a two-column paper, a scanned book, and a PDF with no outline. Pass criteria:
   - text page count equals `numPages`;
   - chapter page ranges match the outline;
   - page N text matches the Full view page N.

## Caveats

- Fidelity depends on the PDF. Untagged PDFs with odd fonts can produce scrambled reading order, broken ligatures or missing spaces. Outlines can point to the wrong pages. Layout models reduce these problems but don't remove them.
- Some details here come from vendor or marketing pages rather than independent tests: ElevenReader's smart import (described inconsistently as Ultra-only) and Speechify's skipping. The cloud OCR prices come from a third-party price tracker (docuocr.com), not from the vendors' own pricing pages. App behaviour around page markers (KOReader status bar, Moon+ reflow) comes from user reports, not documentation.
- The pricing, license terms and GPU needs of Marker, LlamaParse and the cloud OCR vendors change often. Check them before you commit. According to its GitHub README, Marker's code is Apache 2.0, but its model weights use a modified AI Pubs Open Rail-M license that is free only for research, personal use, and startups under $5M funding/revenue. Earlier 1.x releases were GPL-3.0.
- Character offsets and highlights depend on `extraction_version`. Any parser upgrade needs a migration or a full re-extraction.

## Sources

1. [EPUB 3.3](https://w3c.github.io/epub-specs/epub33/core/)
2. [EPUB Page Numbers: Static Pagination and page-list Navigation — toolkit.bot](https://toolkit.bot/blog/epub-page-numbers)
3. [5.4.0 • npm-pdfjs-dist • tessl • Registry • Tessl](https://tessl.io/registry/tessl/npm-pdfjs-dist/5.4.0/files/docs/text-layer.md)
4. [pymupdf4llm/README.md at main · pymupdf/pymupdf4llm · GitHub](https://github.com/pymupdf/pymupdf4llm/blob/main/README.md)
5. [Conflicting PDF text positions reported by pdf.js vs pdfminer · Issue #16634 · mozilla/pdf.js · GitHub](https://github.com/mozilla/pdf.js/issues/16634)
6. [Extract Text From PDF File using Poppler pdftotext](https://lindevs.com/extract-text-from-pdf-file-using-poppler-pdftotext)
7. [Go to main content](https://docs.oracle.com/cd/E88353_01/html/E37839/pdftotext-1.html)
8. [poppler/utils/pdftotext.1 at master · davidben/poppler · GitHub](https://github.com/davidben/poppler/blob/master/utils/pdftotext.1)
9. [GitHub - lanl/poppler-science: pdf to text with per-character OCR and (some) rich text awareness · GitHub](https://github.com/lanl/poppler-science)
10. [GitHub - datalab-to/marker: Convert PDF to markdown + JSON quickly with high accuracy · GitHub](https://github.com/datalab-to/marker)
11. [Pinecone Hybrid Search with Metadata for RAG Systems](https://unstructured.io/blog/optimizing-unstructured-data-retrieval)
12. [Per-element metadata dict](https://theneuralbase.com/unstructured/learn/intermediate/per-element-metadata-dict/)
13. [coordinates (for PDFs)](https://theneuralbase.com/unstructured/learn/intermediate/coordinates-for-pdfs/)
14. [Partition a Document with Auto-Detection](https://theneuralbase.com/unstructured/learn/beginner/example/)
15. [Comportamiento de los separadores](https://docs.cloud.google.com/document-ai/docs/splitters-behavior?hl=es)
16. [GitHub - gr8pathik/expo-pdf-text-extract: Native PDF text extraction for React Native and Expo. Extract text content from PDF files using platform-native APIs (PDFKit on iOS, PDFBox on Android). Works with Expo development builds. · GitHub](https://github.com/gr8pathik/expo-pdf-text-extract)
17. [expo-pdf-text-extract 1.0.1 on npm - Libraries.io - security & maintenance data for open source software](https://libraries.io/npm/expo-pdf-text-extract)
18. [Introducing expo-pdf-text-extract: Native PDF Text Extraction for React Native & Expo](https://pathikgandhi.com/blog/introducing-expo-pdf-text-extract-native-pdf-text-extraction-for-react-native-expo)
19. [pdf.js split my numbers: rebuilding "CHF 15,000" from text items - DEV Community](https://dev.to/banxta/pdfjs-split-my-numbers-rebuilding-chf-15000-from-text-items-2p2c)
20. [How I Convert PDF to Markdown in the Browser - DEV Community](https://dev.to/lanxk/how-i-convert-pdf-to-markdown-in-the-browser-2hff)
21. [Page Numbers Not Appearing Correctly in Provenance Metadata · docling-project/docling · Discussion #1012 · GitHub](https://github.com/docling-project/docling/discussions/1012)
22. [Global and per-page export\_to\_markdown are not byte-comparable when a list straddles a page boundary · Issue #710 · docling-project/docling-core · GitHub](https://github.com/docling-project/docling-core/issues/710)
23. [fix(extract): PyMuPDF backend drops \\f page breaks — page↔offset mapping is backend-dependent · Issue #133 · caelum29/calibre-mcp · GitHub](https://github.com/caelum29/calibre-mcp/issues/133)
24. [PDF.js: Access outline, bookmarks, and metadata](https://www.nutrient.io/blog/pdfjs-document-outline-bookmarks-metadata/)
25. [extracting text from a defined position in adobe acrobat dc using javascript 1275528](https://community.adobe.com/questions-9/extracting-text-from-a-defined-position-in-adobe-acrobat-dc-using-javascript-1275528)
26. [GitHub - pymupdf/PyMuPDF: PyMuPDF is a high performance Python library for data extraction, analysis, conversion & manipulation of PDF (and other) documents. · GitHub](https://github.com/pymupdf/pymupdf)
27. [Page positions, page labels, and printed numbers are different PDF data - DEV Community](https://dev.to/yanwang/page-positions-page-labels-and-printed-numbers-are-different-pdf-data-5939)
28. [JSDoc: Class: PDFDocumentProxy](https://mozilla.github.io/pdf.js/api/draft/module-pdfjsLib-PDFDocumentProxy.html)
29. [Document layout analysis - Document Intelligence - Foundry Tools](https://learn.microsoft.com/en-us/azure/ai-services/document-intelligence/prebuilt/layout?view=doc-intel-4.0.0)
30. [azure.ai.documentintelligence.models.DocumentParagraph class](https://learn.microsoft.com/en-us/python/api/azure-ai-documentintelligence/azure.ai.documentintelligence.models.documentparagraph?view=azure-python-preview)
31. [Text Extraction Using PyMuPDF](https://medium.com/@pymupdf/text-extraction-ocr-using-pymupdf-4572b97c6a58)
32. [PDF Parsing with PyMuPDF and pdfplumber — AI Agents](https://www.coddykit.com/courses/ai_agents_basic/pdf-parsing-with-pymupdf-and-pdfplumber-5316557)
33. [How to Autoskip Content in Speechify](https://speechify.com/blog/how-to-autoskip-content-in-speechify/)
34. [PDF file configuration - Google Play Books Partner Center Help](https://support.google.com/books/partner/answer/107073?hl=en)
35. [Buy & read ebooks - Android phone & tablet - Google Play Help](https://support.google.com/googleplay/answer/185545?hl=en&co=GENIE.Platform%3DAndroid)
36. [How to See a Book's Page Number on Amazon Kindle](https://www.howtogeek.com/715778/how-to-see-a-books-page-number-on-amazon-kindle/)
37. [Getting "Real Page Numbers" on my ebook.](https://www.kdpcommunity.com/s/question/0D5f400000FHistCAD/getting-real-page-numbers-on-my-ebook?language=en_US)
38. [Goodreads Librarians Group discussion](https://www.goodreads.com/topic/show/496478-ebook-page-numbers)
39. [Page List - Accessible Publishing Knowledge Base](https://kb.daisy.org/publishing/docs/navigation/pagelist.html)
40. [Getting Started with ARIA and EPUB](https://www.accessiblepublishing.ca/getting-started-with-aria-and-epub/)
41. [Voice Dream - Natural Reader - App Store - Apple](https://apps.apple.com/us/app/voice-dream-natural-reader/id496177674)
42. [Agora-net](http://www.agora-net.com/~gray/voicedream/Help.html)
43. [A Review of the Voice Dream Reader for iOS: A One-Stop Solution](https://afb.org/aw/14/8/15662)
44. [How to skip content such as headers, footers, brackets, etc. on the computer?](https://speechify.com/blog/how-to-skip-content-such-as-headers-footers-brackets-etc-on-the-computer/)
45. [How can I jump to a specific page in my PDF on the computer?](https://speechify.com/blog/how-can-i-jump-to-a-specific-page-in-my-pdf-on-the-computer/)
46. [Read PDF Aloud Online Free: Natural AI Voices](https://elevenreader.io/read-aloud-pdf)
47. [Best AI PDF Readers](https://elevenreader.io/blog/ai-pdf-reader)
48. [KOReader: An All-in-One Third-Party E-Reader Plugin for Kindle](https://en.bookfere.com/post/kindle-plugin-koreader.html)
49. [KOReader User Guide](https://koreader.rocks/user_guide/)
50. [Temporary 'Reference point' bookmark · Issue #13378 · koreader/koreader · GitHub](https://github.com/koreader/koreader/issues/13378)
51. [Moon Reader reflow questions - MobileRead Forums](https://www.mobileread.com/forums/showthread.php?t=352261)
52. [PDF Chunking for RAG: Split PDFs Without Losing Structure](https://www.poma-ai.com/docs/blog/pdf-chunking-for-rag/)
53. [Limits](https://supabase.com/docs/guides/functions/limits)
54. [Edge Function limits, one ceiling at a time](https://erfi.dev/reference/supabase-edge-function-limits/)
55. [How to listen to PDFs & Google Docs — EA Forum](https://forum.effectivealtruism.org/posts/iZKexkGDndiWtMbxb/how-to-listen-to-pdfs-and-google-docs)
56. [pymupdf · PyPI](https://pypi.org/project/pymupdf/)
57. [pypdf vs PyMuPDF: Speed, Quality, and the AGPL License Question](https://www.file2markdown.ai/blog/pypdf-vs-pymupdf)
58. [PyMuPDF vs pdfplumber (2026): the speed-vs-license tradeoff, benchmarked — pdfmux](https://pdfmux.com/blog/pymupdf-vs-pdfplumber/)
