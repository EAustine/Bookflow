# M2 route map

Every navigable surface in the app, and the Expo Router route it becomes.

**This should have come out of Phase 0.** The migration brief says "use the
Phase 0 route map"; the gap analysis described the routing change and sized it
but never produced the map itself. This is that map, written now.

Source: `apps/app/App.tsx` (the `stage` machine and tab switch) plus the
in-component `view` state in each tab. Read at `arch/m2-routing` off
`main` @ `54a4b50`.

---

## 1. What navigation looks like today

Three mechanisms, none of which produce a URL:

| Mechanism | Where | Values |
|---|---|---|
| `stage` | `App.tsx:120`, 13 `setStage` call sites | `splash · welcome · signin · signup · authCallback · authCallbackError · onboardingIntent · onboardingFirstBook · library` |
| `activeTab` | `App.tsx:199` | `library · listen · discover · you` |
| per-screen `view` | 4 screens | see §3 |

Plus conditional rendering for things that behave like screens but are not
state machines at all — the reader a book opens into, the AI tools over a
reader, the full-screen search and highlights overlays.

## 2. Pre-auth — the `stage` machine

`stage` is really two concerns wearing one type: *which screen* and *has the
session resolved yet*. Expo Router separates them — the second belongs in the
root layout, which is where §5 puts the F-37 splash hand-off.

| `stage` | Route | Note |
|---|---|---|
| `splash` | *(not a route)* | Becomes root-layout state. Restore decides **where**, the splash decides **when** |
| `welcome` | `/(auth)/welcome` | |
| `signin` | `/(auth)/sign-in` | |
| `signup` | `/(auth)/sign-up` | Same component as sign-in with `isSignup` |
| `authCallback` | `/auth/callback` | Deep-link target. **Needs the app domain** |
| `authCallbackError` | `/auth/callback` + state | Not a separate route — same screen, error branch |
| `onboardingIntent` | `/(onboarding)/intent` | |
| `onboardingFirstBook` | `/(onboarding)/first-book` | |
| `library` | `/(tabs)/library` | The "signed in" terminal state |

## 3. Post-auth — tabs and their drill-ins

### `(tabs)`

| Tab | Route |
|---|---|
| library | `/(tabs)/library` |
| listen | `/(tabs)/listen` |
| discover | `/(tabs)/discover` |
| you | `/(tabs)/you` |

### Library

| Today | Route |
|---|---|
| `selectedBook` + `type === 'pdf'` | `/read/[bookId]` → PDF mode |
| `selectedBook` + epub, `epubMode === 'full'` | `/read/[bookId]` → EPUB full |
| `selectedBook` + text | `/read/[bookId]` → text |
| upload flow | `/library/upload` |
| processing | `/library/processing/[bookId]` |

**One route, three readers.** `LibraryScreen` currently picks the reader by
`book.type` before rendering (`LibraryScreen.tsx:719`). That dispatch moves
into `/read/[bookId]`, which is the right home for it — and after M0 spike 1
it is permanent, since PDF stays native (§7.6).

### Discover — `useState<'home' | 'category' | 'detail'>`

| Today | Route |
|---|---|
| `home` | `/(tabs)/discover` |
| `category` | `/discover/category/[id]` |
| `detail` | `/discover/book/[id]` — **corrected**, see below |

**Correction, 2026-10-25.** This originally said book detail was reachable
from Library *and* Discover and should therefore be a top-level `/book/[id]`.
That is wrong on both counts, found while building the route in M3:

- **Library has no detail view.** `LibraryScreen.tsx:718` goes straight from
  a selected book to the reader.
- **The ids are different namespaces.** `DiscoverBook.id` is a source-prefixed
  catalogue id (`gutenberg:1342`), not a `books.id` uuid. A single route
  taking "an id" would have had to guess which kind it was holding.

So it nests under Discover and fetches from `discoverApi`, not from the
`books` table. `DetailView` is also private to `DiscoverScreen` and takes
Discover's `libraryIds`/`pendingIds` state, so the route needs the Discover
feature extracted first — it is blocked on that, not on the query layer.

### Listen

| Today | Route |
|---|---|
| home | `/(tabs)/listen` |
| now playing | `/listen/now-playing` |
| history (`historyOpen` in `App.tsx:1277`) | `/listen/history` |

`historyOpen` is top-level state in `App.tsx` deciding what the Listen tab
renders — a route in all but name.

### You and Settings — **the duplication**

`YouScreen` has a nine-value `view`; `SettingsScreen` has a five-value one.
**They overlap on four screens.**

| Sub-screen | Reachable from |
|---|---|
| Reading display | You → `reading`, Settings → `reading` |
| Default voice | You → `voice`, Settings → `voice` |
| Translation language | You → `language`, Settings → `language` |
| Playback speed | Settings → `speed` only |

| Today | Route |
|---|---|
| You `home` | `/(tabs)/you` |
| You `account` | `/you/account` |
| Account `edit-profile` | `/you/account/edit-profile` |
| You `settings` | `/you/settings` |
| `reading` (both) | `/settings/reading-display` |
| `voice` (both) | `/settings/default-voice` |
| `language` (both) | `/settings/translation-language` |
| `speed` (Settings only) | `/settings/playback-speed` |
| `notifications` | `/settings/notifications` |
| `help` | `/you/help` |
| `feedback` | `/you/feedback` |

**Finding.** Two state machines render the same four components, so the same
screen is currently two different places depending on arrival. A URL cannot be
ambiguous, which forces the question the prose never did: one canonical route,
linked from both. That removes the duplicated `view` branches from
`SettingsScreen` and shrinks `YouScreen`'s union from nine to four.

This is a **behaviour** change, not just structure: today, back from Reading
display returns to whichever screen you came from, and both parents keep
their own copy of the state. One route means one back target and one state.
M2's "no visual change" rule still holds — the pixels are identical; the
history stack is not.

### Reader sub-surfaces

| Today | Route |
|---|---|
| `aiMode` = `summary \| chat \| practice \| translate` (`ReaderScreen.tsx:373`) | `/read/[bookId]/ai/[mode]` |
| Highlights overlay | `/read/[bookId]/highlights` |
| In-reader search | **stays local** — a header mode, not a screen |
| Book search (`BookSearchScreen`) | `/read/[bookId]/search` |

`HighlightsScreen`, `BookSearchScreen` and `PracticeQuestionsScreen` are each
rendered from **three** different readers today. As routes they are written
once.

## 4. Not routes

Bottom sheets stay sheets in M2. §5 routes them through `<Presenter>` in M7,
which is blocked on tablet frames. Touching them now would mean doing the work
twice.

`ChapterSheet`, `PlaybackSpeedSheet`, `BuyCreditsSheet`, `AddBookSheet`,
`RemoveBookSheet`, the sign-out and delete-account confirmations, and the
translate popovers all stay as they are.

## 5. Counts

| | |
|---|---|
| `stage` values → routes | 9 → 8 |
| Tabs | 4 |
| Drill-in routes | 15 |
| Screens rendered from more than one parent today | **4** |
| Routes total | **~31** |
| Screen components | 35 |

## 6. Progress

| Route | Status |
|---|---|
| `/settings/reading-display` | ✅ |
| `/settings/default-voice` | ✅ |
| `/settings/translation-language` | ✅ |
| `/settings/playback-speed` | ✅ |
| `/settings/notifications` | ✅ |
| `/you/settings` | ✅ |
| `/you/help` | ✅ |
| `/you/feedback` | ✅ |
| `/you/account` | **blocked on M3** — needs `profile` and `plan`, which the shell assembles from `useIsPro`, `useBooks`, `useCurrentUser` and the month-stats refresh. Lifting that is the data-layer milestone. Falls back to YouScreen's internal view, which is the shipped behaviour |
| `/you/account/edit-profile` | blocked, same reason |
| `/discover/category/[id]` | **deferred to M3** |
| `/discover/book/[id]` | **deferred to M3** — needs the Discover feature extracted, not just a query |
| `/listen/now-playing` | **deferred to M3** |
| `/listen/history` | **deferred to M3** |
| `/read/[bookId]` and its 3 sub-routes | **deferred to M3** |

**The duplication is resolved.** Reading display, default voice and
translation language are one route each, reached from both You and Settings.
`YouScreen` and `SettingsScreen` both gained optional handler props that fall
back to their internal `view` state, so the migration was additive — the
fallbacks are dead in the app but are the cheapest possible revert, and they
stay until a signed-in account can verify the routes.

### F-46 — two components named `SendFeedbackScreen`

Found while wiring `/you/feedback`. `src/screens/SendFeedbackScreen.tsx` is a
380-line compose form requiring an `onSubmit`, and **nothing imports it**. The
app ships the `YouDrillScreens` version, which hands off to the user's mail app
instead. The new route picked the standalone one by name and the type error is
the only reason it was caught — on a milestone whose rule is that nothing
changes, it would have silently replaced a mail hand-off with a form.

### Why seven routes moved to M3

Austine's call, 2026-10-23. The eight that landed share a shape: their screens
take only `onBack`, use no React context, and already had optional handler
props. Purely additive.

The seven that did not share a different one. `openDetail(book)` and
`openCategory(cat)` take **whole objects**; a URL carries an id, so they need
fetch-by-id that does not exist yet. `/read/[bookId]` needs to resolve a `Book`
from an id, and `BooksProvider` is deliberately scoped to `(tabs)` for sign-out
cleanup. Listen's two are driven by shell state and the audio session.

Each needs either M3's data layer or threading the shell's in-memory
collections into routes — which recreates exactly the coupling routing was
meant to remove, and would be undone again in M3.

The deciding evidence was two latent crashes found in the already-committed
cutover: `BooksProvider` and `ToastHost` were both dropped, invisible to the
type checker and unreachable without an account. Two bugs in ~20 routes of
unverifiable work is the rate; adding seven more that each need data plumbing
raises the odds of shipping something broken faster than it delivers value.

## 7. Open before the rest



1. **The app domain** — universal links (iOS) and App Links (Android) both need
   it, and `/auth/callback` is the magic-link target. Blocking.
2. **One canonical route for the shared four**, per §3. Recommended, and the
   route map above assumes it.
3. **Sentry and PostHog**, deferred from M1. M2 replaces the navigation layer
   wholesale; a crash in a route transition is the kind of thing that is
   invisible without reporting. Worth closing first.
