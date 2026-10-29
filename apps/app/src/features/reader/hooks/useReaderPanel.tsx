/**
 * useReaderPanel — the reader's side panel, defined once for all
 * three readers (text, Full-mode PDF, Full-mode EPUB).
 *
 * §3 of docs/specs/responsive-handoff.md: the reader's tools slide
 * over on Medium and **dock** on Expanded and Desktop. §4 adds that
 * the AI tools list is the panel's root, with each tool opening
 * inside it.
 *
 * It is a hook rather than a component because the host has to lay
 * the docked panel out as a sibling of its content column — a docked
 * panel is not an overlay, so nothing can render it *over* the
 * reader. The host asks for `panel` and places it.
 *
 * All three readers carried their own `aiMode` + `showHighlights` and
 * their own copies of these five early returns. They are one
 * definition here instead, which is the only way the three cannot
 * drift — the reader already has three separate copies of its action
 * bar to show what happens otherwise.
 */

import { useState, type ReactNode } from 'react';
import { SidePanel } from '~/components';
import {
  AIToolsBody,
  ChatScreen,
  PracticeQuestionsScreen,
  SummaryScreen,
} from '~/features/ai';
import type { Book } from '~/types/book';
import { useSizeClass } from '~/hooks/useSizeClass';
import { HighlightsScreen } from '../screens/HighlightsScreen';
import { TranslateChapterScreen } from '../screens/TranslateChapterScreen';
import { PagesPanel, type PageRowItem } from '../components/PagesPanel';

/**
 * What the panel is showing. `tools` is its root: the four AI tools
 * open *inside* the panel, so back from one returns to the list
 * rather than closing it. `null` is closed.
 */
export type PanelView =
  | 'tools'
  | 'summary'
  | 'chat'
  | 'practice'
  | 'translate'
  | 'highlights'
  | 'pages'
  | null;

export type UseReaderPanelOptions = {
  book: Book;
  /** The page the AI tools operate on, in DB page indices. */
  pageIndex: number;
  /** Moves the reader. Highlights and Pages both navigate through it. */
  onJumpToPage: (pageIndex: number) => void;
  /**
   * The page list, when the host has one. Only the text reader bulk
   * fetches every page, so Full mode simply has no Pages view.
   */
  pageRows?: PageRowItem[];
};

export type ReaderPanel = {
  /** True above Compact, where the tools are a panel rather than a sheet. */
  isWide: boolean;
  panelView: PanelView;
  open: (view: PanelView) => void;
  close: () => void;
  /** True when the host's root should become a row. */
  dock: boolean;
  /** The panel, placed by the host. Null on Compact or when closed. */
  panel: ReactNode;
  /**
   * The Compact presentation: a full screen, as it has always been.
   * The host returns this before its own tree when it is not null.
   */
  fullScreen: ReactNode;
};

export function useReaderPanel({
  book,
  pageIndex,
  onJumpToPage,
  pageRows,
}: UseReaderPanelOptions): ReaderPanel {
  const { sizeClass, isWide } = useSizeClass();
  const [panelView, setPanelView] = useState<PanelView>(null);
  /**
   * True while practice is running questions. §4 says the session
   * takes over the screen, and the screen does that with its own
   * modal — but a slide-over panel is *also* a modal, and two of them
   * do not compose: the session ended up under the panel's scrim with
   * an empty panel on top of it.
   *
   * So while a session runs the panel presents **docked** whatever
   * the size class, because docked is plain inline content that a
   * takeover simply covers. Switching `mode` rather than swapping the
   * wrapper is deliberate — the practice screen holds its questions
   * and answers in its own state, and changing the element type
   * around it would remount it and lose them.
   */
  const [practiceSession, setPracticeSession] = useState(false);

  const close = () => {
    setPanelView(null);
    setPracticeSession(false);
  };
  const backToTools = () => setPanelView('tools');

  // ── Compact: the full screens, unchanged ──────────────────────────
  //
  // The phone keeps what it had. Only Medium and above gain panels,
  // which is the same call the upload flow made: a chat or a practice
  // session is better served by a whole screen at 360 than by a
  // container with a reader behind it.
  let fullScreen: ReactNode = null;
  if (!isWide) {
    const onBack = () => {
      // The Compact overlays unmount the reader's list, which remounts
      // at offset 0. Arming the jump inside the close puts the user
      // back where they were with no flash of page 1.
      onJumpToPage(pageIndex);
      close();
    };
    if (panelView === 'summary') {
      fullScreen = <SummaryScreen book={book} pageIndex={pageIndex} onBack={onBack} />;
    } else if (panelView === 'chat') {
      fullScreen = <ChatScreen book={book} onBack={onBack} />;
    } else if (panelView === 'practice') {
      fullScreen = (
        <PracticeQuestionsScreen book={book} pageIndex={pageIndex} onBack={onBack} />
      );
    } else if (panelView === 'translate') {
      fullScreen = (
        <TranslateChapterScreen book={book} pageIndex={pageIndex} onBack={onBack} />
      );
    } else if (panelView === 'highlights') {
      fullScreen = (
        <HighlightsScreen
          book={book}
          onClose={onBack}
          onJumpToPage={(idx) => {
            onJumpToPage(idx);
            close();
          }}
        />
      );
    }
  }

  // ── Wide: one panel, whichever view is up ─────────────────────────
  //
  // `bare` for every view that owns a scroller and pins something
  // under it, which a content container cannot host. Pages and the
  // tools list are plain lists and are happy scrolled.
  const spec: { title: string; bare: boolean; back?: () => void; content: ReactNode } | null =
    panelView === 'tools'
      ? {
          title: 'AI tools',
          bare: false,
          content: (
            <AIToolsBody
              book={book}
              pageIndex={pageIndex}
              embedded
              onSummarize={() => setPanelView('summary')}
              onPractice={() => setPanelView('practice')}
              onAsk={() => setPanelView('chat')}
              onTranslate={() => setPanelView('translate')}
            />
          ),
        }
      : panelView === 'summary'
        ? {
            title: 'Summary',
            bare: true,
            back: backToTools,
            content: (
              <SummaryScreen book={book} pageIndex={pageIndex} embedded onBack={backToTools} />
            ),
          }
        : panelView === 'chat'
          ? {
              title: 'Ask about the book',
              bare: true,
              back: backToTools,
              content: <ChatScreen book={book} embedded onBack={backToTools} />,
            }
          : panelView === 'practice'
            ? {
                title: 'Practice questions',
                bare: true,
                back: backToTools,
                content: (
                  <PracticeQuestionsScreen
                    book={book}
                    pageIndex={pageIndex}
                    embedded
                    onSessionChange={setPracticeSession}
                    onBack={backToTools}
                  />
                ),
              }
            : panelView === 'translate'
              ? {
                  title: 'Page translation',
                  bare: true,
                  back: backToTools,
                  content: (
                    <TranslateChapterScreen
                      book={book}
                      pageIndex={pageIndex}
                      embedded
                      onBack={backToTools}
                    />
                  ),
                }
              : panelView === 'highlights'
                ? {
                    title: 'Highlights',
                    bare: true,
                    content: (
                      <HighlightsScreen
                        book={book}
                        embedded
                        onClose={close}
                        // No close on tap: the panel sits beside the
                        // page, and the point of the list is to walk
                        // it without reopening each time.
                        onJumpToPage={onJumpToPage}
                      />
                    ),
                  }
                : panelView === 'pages' && pageRows
                  ? {
                      title: 'Pages',
                      bare: false,
                      content: (
                        <PagesPanel
                          rows={pageRows}
                          currentPageIndex={pageIndex}
                          onJumpToPage={onJumpToPage}
                        />
                      ),
                    }
                  : null;

  const panel =
    isWide && spec ? (
      <SidePanel
        visible
        mode={
          practiceSession || sizeClass !== 'medium' ? 'docked' : 'slide-over'
        }
        title={spec.title}
        bare={spec.bare}
        onBack={spec.back}
        onDismiss={close}
      >
        {spec.content}
      </SidePanel>
    ) : null;

  return {
    isWide,
    panelView,
    open: setPanelView,
    close,
    // Only a docked panel changes the host's layout. A slide-over is
    // an overlay and leaves the content column alone.
    dock: isWide && (practiceSession || sizeClass !== 'medium') && spec !== null,
    panel,
    fullScreen,
  };
}
