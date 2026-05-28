-- 0018_books_processing_message.sql
--
-- Adds `processing_message` to `books` so the `process-book` edge
-- function can stream a human-readable status string back to the
-- client mid-flight. The client polls books.processing_status to
-- learn terminal state; this column complements it with a "what is
-- the server doing right now" hint that we surface in the upload UI.
--
-- Examples written into this column during a typical PDF flow:
--   "Downloading file…"
--   "Extracting text…"
--   "OCR'ing pages 101–200 of 350…"
--   "Saving chapters…"
--   NULL (the function clears it on success or terminal failure)
--
-- Nullable, free-text. We don't want to enumerate or constrain values
-- because each flow (epub vs pdf vs ocr-fallback) writes its own
-- sequence and we want to be able to tweak strings without a
-- migration. The client treats NULL as "no live status, fall back to
-- the phase-derived default".

alter table public.books
  add column if not exists processing_message text;

comment on column public.books.processing_message is
  'Live, human-readable progress hint written by the process-book edge function while a book is being ingested. NULL when there is no in-flight processing message to show. The client polls this alongside processing_status and surfaces it in the upload UI.';
