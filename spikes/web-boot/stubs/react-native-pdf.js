// M0 spike 2 stub — react-native-pdf
//
// Throwaway. Enough surface for the web bundle to resolve and the app to
// boot; every call throws or no-ops loudly so a web code path that really
// needs this package shows up as a runtime error rather than silence.
// The real answer is a §8 adapter with a working .web.ts.


import React from 'react';
import { Text, View } from 'react-native';

// PDF full mode has no web implementation and, after M0 spike 1, no
// planned one — pdf.js was ruled out of the engine (§7.6). Web gets text
// mode for PDFs, which works because the canonical document is built
// regardless.
export default function PdfStub() {
  return React.createElement(
    View,
    { style: { padding: 24 } },
    React.createElement(Text, null, 'PDF full mode is not available on web'),
  );
}
