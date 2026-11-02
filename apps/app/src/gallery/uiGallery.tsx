/**
 * The §6 component gallery — native side, which is nothing.
 *
 * Hover and keyboard focus are web traits. The gallery exists so the
 * ring can be tabbed to by a real browser and a real Tab key, which is
 * the only way §10's "keyboard tabbing on web shows the focus ring on
 * every interactive row, card and button" can be signed off rather than
 * asserted. On a device there is nothing to show, so this sibling keeps
 * the whole surface, and every feature barrel it imports, out of the
 * native bundle: Metro resolves `uiGallery.web.tsx` only for the web
 * platform.
 *
 * Same shape as `platform/*`'s pairs, for the same reason, but it lives
 * here instead because it imports from `features/` — §4 rule 1 lets a
 * feature import `platform`, not the other way round.
 *
 * **`.tsx`, not `.ts`, and that is load-bearing.** Metro tries the
 * platform variants *inside* each source extension, in `sourceExts`
 * order: `uiGallery.web.ts`, then `uiGallery.ts`, and only then
 * anything `.tsx`. A `.ts` stub beside a `.web.tsx` implementation
 * therefore wins on web too, and the web file is never bundled — it
 * typechecks, it lints, it exports clean, and the surface simply is
 * not there. Cost an export and a confused browser session to find.
 * Both halves of a pair take the same base extension.
 */

import type { ReactElement } from 'react';

/**
 * Web reads `?gallery=1`. There is no URL here, so this is always
 * false — but it is typed `boolean`, not `false`, because the web
 * sibling pins itself to this declaration with `typeof import('./uiGallery')`
 * and a literal type would make the real value unassignable.
 */
export const uiGalleryRequested: boolean = false;

export function UiGallery(): ReactElement | null {
  return null;
}
