/**
 * Reader hosts on web — §8 gives this row "same-origin iframe; no PDF
 * full mode at launch", and that is exactly what this is: EPUB Full
 * works, PDF Full says so plainly.
 *
 * ## HtmlHost really works, because of one shim
 *
 * The reader's bridge script is written against
 * `window.ReactNativeWebView.postMessage`, and rewriting it for web
 * would mean two bridges to keep in step — the scroll-restore and
 * tap-versus-scroll logic is subtle enough that a second copy would
 * drift. So the iframe gets a four-line shim defining that object in
 * terms of `parent.postMessage` before the bridge runs, and the
 * existing script works unchanged.
 *
 * `srcDoc` keeps the document same-origin-ish without a server round
 * trip; messages are matched by `event.source` so a message from any
 * other frame on the page cannot be mistaken for ours.
 *
 * ## PdfHost does not, and will not here
 *
 * §7.6 rules pdf.js out of the reader engine on measurements, not
 * taste: M0 spike 1 recorded 42 dropped frames in 60 during ordinary
 * reading scroll on a low-end device, in the same Chromium build as
 * that device's WebView. `react-native-pdf` is permanent on native,
 * and web PDF rendering is a separate decision with its own budget.
 *
 * Until then this renders a plain explanation rather than throwing or
 * showing an empty box. The screen around it keeps working, so the
 * user can still leave, open another book, or switch to listening.
 */

import { useEffect, useRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { HtmlHostProps, PdfHostProps } from './readerHost';
import { tokens } from '~/design/tokens';

/**
 * Defines the bridge's transport inside the iframe. Runs before the
 * reader's own script, which then needs no knowledge of web.
 */
const BRIDGE_SHIM = `window.ReactNativeWebView = {
  postMessage: function (message) { parent.postMessage(message, '*'); }
};`;

export function HtmlHost({
  html,
  bridgeScript,
  onMessage,
  style,
}: HtmlHostProps) {
  const frameRef = useRef<HTMLIFrameElement | null>(null);

  useEffect(() => {
    if (!onMessage) return;
    const handler = (event: MessageEvent) => {
      // Only our frame. Any other embed on the page posting a
      // lookalike message is ignored.
      if (event.source !== frameRef.current?.contentWindow) return;
      try {
        onMessage(JSON.parse(String(event.data)));
      } catch {
        // Non-JSON payload; the bridge only ever sends JSON.
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [onMessage]);

  const srcDoc = bridgeScript
    ? `${html}<script>${BRIDGE_SHIM}\n${bridgeScript}</script>`
    : html;

  return (
    <View style={style}>
      <iframe
        ref={frameRef}
        srcDoc={srcDoc}
        style={{ width: '100%', height: '100%', border: 'none' }}
        title="Book"
      />
    </View>
  );
}

export function PdfHost({ style }: PdfHostProps) {
  return (
    <View style={[styles.wrap, style]}>
      <Text style={styles.title}>PDFs open in the app</Text>
      <Text style={styles.body}>
        Reading PDFs in the browser is not supported yet. Open this book
        in the Bookflow app, or listen to it here instead.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    gap: 8,
  },
  title: {
    fontFamily: tokens.fonts.display,
    fontSize: 16,
    color: tokens.textColors.primary,
    textAlign: 'center',
  },
  body: {
    fontFamily: tokens.fonts.ui,
    fontSize: 13,
    lineHeight: 20,
    color: tokens.textColors.muted,
    textAlign: 'center',
  },
});
