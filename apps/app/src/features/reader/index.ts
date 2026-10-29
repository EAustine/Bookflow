/**
 * Reader feature.
 *
 * §4 rule 1: other features import from THIS file, never from the
 * paths inside. The ESLint boundary added in M1 enforces it.
 */
export * from './screens/ReaderScreen';
export * from './screens/PdfReaderScreen';
export * from './screens/EpubFullReaderScreen';
export * from './screens/InReaderSearchHeader';
export * from './screens/BookSearchScreen';
export * from './screens/HighlightsScreen';
export * from './screens/TranslateChapterScreen';
export * from './screens/TranslateWordPopover';
export * from './api/bookSearch';
export * from './api/useBookChapters';
export * from './api/highlights';
export * from './api/readingSessions';
export * from './api/readingStats';
export * from './api/dictionary';
export * from './api/translateSnippet';
export * from './api/aiTranslate';
