# Router cutover

`main` is `expo-router/entry` as of M2. The old entry is kept at
`index.ts.pre-router` for the length of this milestone — it is the one file
that reverts the cutover, and keeping it costs nothing until M2 is signed off.

It did one thing Expo Router does not do for free: wrap the tree in
`RootErrorBoundary` at the absolute outermost layer, so render-time throws
surface as a friendly screen rather than killing the JS bridge with SIGABRT.
That wrap now lives in `app/_layout.tsx`.

The boundary still does **not** catch module-eval throws — a `throw` at the top
of a `.ts` file, outside any function. For those the module has to fail softly;
`src/lib/supabase.ts` is the pattern: on missing env it logs and returns a
client that errors on use, which the boundary does catch.

Delete this file and `index.ts.pre-router` when M2 is approved.
