import { registerRootComponent } from 'expo';
import { createElement } from 'react';

import App from './App';
import { RootErrorBoundary } from './src/components/RootErrorBoundary';

/**
 * Wrap the app in an error boundary at the absolute outermost layer
 * so render-time throws inside the App tree (broken imports, missing
 * required props, transient native module failures) surface as a
 * friendly screen instead of killing the JS bridge with SIGABRT.
 *
 * Note this does NOT catch module-eval throws (e.g. a `throw` at the
 * top of a `.ts` file outside any function). For those, the offending
 * module needs to surface the error softly — see `supabase.ts` for an
 * example: instead of throwing on missing env, it logs and returns a
 * client that errors on use, which IS caught by this boundary.
 */
function Root() {
  return createElement(RootErrorBoundary, null, createElement(App));
}

registerRootComponent(Root);
