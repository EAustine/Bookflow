/**
 * Files dragged onto an element — the §8 adapter behind §4 Library's
 * "Upload drag and drop is desktop only".
 *
 * ## Why this is not part of `files`
 *
 * `files` answers "the user chose a file", which both platforms can
 * do. Dropping is a different question — "the user is dragging
 * something over *this* element, and has now let go" — and it has no
 * native answer at all. §8's rule is that an adapter exposes what the
 * app needs rather than what a package offers, and these are two needs
 * with two different shapes, so they get two modules. `PickedFile` is
 * shared, because a dropped file and a chosen file are the same thing
 * once they land.
 *
 * ## Why native is a constant
 *
 * §8 of the responsive brief leaves "Library drag-over state on
 * tablets" out on purpose: "No drag source on touch". There is nothing
 * to drag from on a phone or a tablet, so this reports `dragging:
 * false` forever and the ref goes nowhere. The caller renders no zone
 * at all, but the hook still has to exist for the module to typecheck
 * on native.
 */

import type { PickedFile } from './files';

export type FileDropHandle = {
  /**
   * Attach to the element that should accept drops. A no-op on native.
   *
   * A callback ref rather than an object ref because the web
   * implementation has to add and remove DOM listeners as the node
   * mounts and unmounts, and a callback ref is the only kind that says
   * when that happens.
   */
  ref: (node: unknown) => void;
  /** A drag carrying files is currently over the element. */
  dragging: boolean;
};

/**
 * `onFiles` receives everything dropped in one gesture, which may be
 * more than one file; the caller decides whether to take all of them.
 * It is read from a ref internally, so passing a fresh closure on
 * every render does not re-register the listeners.
 */
export function useFileDrop(
  onFiles: (files: PickedFile[]) => void,
): FileDropHandle {
  return { ref: () => {}, dragging: false };
}
