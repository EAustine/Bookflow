/**
 * Reader hosts — the §8 `reader-host` adapter: the two native views
 * the reader renders content inside.
 *
 * `HtmlHost` is a WebView for EPUB Full mode. `PdfHost` is
 * `react-native-pdf` for PDF Full mode, and stays that way
 * permanently: M0 spike 1 measured pdf.js in a WebView at 42 dropped
 * frames in 60 during ordinary reading scroll on a low-end device, so
 * it is ruled out of the unified reader engine (§7.6). That is why
 * this adapter has two components rather than one host with a mode —
 * the two really are different renderers, and pretending otherwise
 * would invite someone to collapse them.
 *
 * ## What the adapter absorbs
 *
 * Every prop here that is not in a signature below is a constant the
 * screens had to carry: `originWhitelist`, `decelerationRate` as a
 * number rather than the string alias, `fitPolicy`, annotation
 * rendering, paging, spacing. They are renderer settings, not reader
 * decisions, and each one's reasoning is recorded against it here
 * instead of in a screen that should be about reading.
 *
 * Message parsing moves too. The EPUB screen's `onMessage` unpacked
 * `event.nativeEvent.data`, ran `JSON.parse` and swallowed non-JSON;
 * all three are transport details, so `onMessage` now receives the
 * parsed value.
 */

import type { StyleProp, ViewStyle } from 'react-native';
import { WebView } from 'react-native-webview';
import Pdf from 'react-native-pdf';

export type HtmlHostProps = {
  /** A full HTML document to render. */
  html: string;
  /**
   * Script run inside the document once it loads. It talks back
   * through `window.ReactNativeWebView.postMessage`, which the web
   * implementation shims so the same script works in an iframe.
   */
  bridgeScript?: string;
  /** Receives each parsed JSON message the bridge posts. */
  onMessage?: (message: unknown) => void;
  style?: StyleProp<ViewStyle>;
};

export function HtmlHost({
  html,
  bridgeScript,
  onMessage,
  style,
}: HtmlHostProps) {
  return (
    <WebView
      originWhitelist={['*']}
      source={{ html }}
      style={style}
      startInLoadingState={false}
      androidLayerType="hardware"
      setSupportMultipleWindows={false}
      automaticallyAdjustContentInsets={false}
      showsVerticalScrollIndicator
      // Numeric form, not the "normal" string alias. The alias works
      // on the old Paper renderer, which converts internally, but
      // Fabric on Android — enabled in app.json via `newArchEnabled`
      // — enforces strict prop types and throws
      // `ClassCastException: String cannot be cast to Double`.
      // 0.998 is the documented iOS value that "normal" mapped to.
      decelerationRate={0.998}
      injectedJavaScript={bridgeScript}
      onMessage={(event) => {
        try {
          onMessage?.(JSON.parse(event.nativeEvent.data));
        } catch {
          // Non-JSON payload; the bridge only ever sends JSON.
        }
      }}
    />
  );
}

export type PdfHostProps = {
  uri: string;
  /**
   * Page to show. Changing it moves the view; it should stay stable
   * during user-driven paging so the renderer does not re-snap to a
   * page it is already on.
   */
  page: number;
  onLoadComplete?: (totalPages: number) => void;
  onPageChanged?: (page: number) => void;
  onLoadProgress?: () => void;
  onError?: (error: unknown) => void;
  /** A single tap anywhere on the page. */
  onTap?: () => void;
  /** An embedded link was tapped. We do not follow them yet. */
  onPressLink?: () => void;
  style?: StyleProp<ViewStyle>;
};

export function PdfHost({
  uri,
  page,
  onLoadComplete,
  onPageChanged,
  onLoadProgress,
  onError,
  onTap,
  onPressLink,
  style,
}: PdfHostProps) {
  return (
    <Pdf
      // cache: false. The library's on-disk cache writes the PDF to a
      // hashed `.tmp` file in the app's cache directory and renames it
      // on completion. On Android the OS occasionally collects that
      // directory mid-session (low storage, pause-resume, app
      // standby), and the next render that re-opens the cached path
      // crashes with ENOENT on `<hash>.pdf.tmp`. Downloading fresh per
      // mount avoids the race; the signed URL is still cached in
      // memory by the screen, so a re-open skips the Supabase round
      // trip and only the bytes come down again.
      source={{ uri, cache: false }}
      page={page}
      onLoadComplete={(totalPages) => {
        if (totalPages > 0) onLoadComplete?.(totalPages);
      }}
      onPageChanged={(current) => onPageChanged?.(current)}
      onLoadProgress={() => onLoadProgress?.()}
      onError={(error) => onError?.(error)}
      onPageSingleTap={() => onTap?.()}
      onPressLink={() => onPressLink?.()}
      trustAllCerts={false}
      enablePaging
      horizontal
      // Fit the WIDTH (0), not both axes. The library default is 2,
      // "fit both", which was fine while this filled the window —
      // capped at 680 on a wide screen it letterboxes to the taller
      // axis and the page stops filling the column. §4 asks for
      // scaled to fit the width.
      fitPolicy={0}
      // None of our content is annotated, and skipping that pass
      // measurably tightens the swipe on Android.
      enableAnnotationRendering={false}
      spacing={8}
      style={style}
    />
  );
}
