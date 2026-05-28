-- ============================================================================
-- Bookflow · 0009_chapters_html_content
-- ----------------------------------------------------------------------------
-- Adds an HTML version of each chapter so the reader can offer a
-- "Full" mode that preserves images, headings, bold/italic, lists, and
-- any other block-level formatting from the source EPUB. The plain-text
-- `content` column stays the canonical form for text-only reading,
-- search, AI tools, and TTS — it's cheaper to render and supports our
-- per-word interaction features.
--
-- Nullable: legacy chapters (extracted before this column existed) keep
-- working in text mode; the client hides the "Full" toggle for any book
-- whose chapters all have null html_content.
--
-- PDFs leave this null — the original PDF file IS the full-mode
-- representation, and the native PDF reader handles that path.
-- ============================================================================

alter table public.chapters
  add column if not exists html_content text;
