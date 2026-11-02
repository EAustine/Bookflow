/**
 * Drag-and-drop on web. See `fileDrop.ts` for the contract.
 *
 * ## The two awkward parts of the DOM API
 *
 * **`dragover` must be cancelled.** A browser's default for a dragged
 * file is to navigate to it, which means dropping a PDF on an
 * un-cancelled zone replaces the app with the PDF. `preventDefault` on
 * both `dragover` and `drop` is what makes the element a drop target
 * at all; it is not defensive, it is the mechanism.
 *
 * **`dragleave` fires on every child.** Moving the pointer from the
 * zone onto the icon inside it raises `dragleave` for the zone, so a
 * naive boolean flickers the drag-over state on every internal
 * boundary. The fix is to count enter and leave: the drag is over us
 * while the depth is above zero. `dragenter` and `dragleave` come in
 * pairs for every element, so the count is balanced.
 *
 * ## Only drags that carry files
 *
 * `dataTransfer.types` includes `Files` when the drag has any. Text
 * selections and dragged links also raise these events, and lighting
 * the zone up for a dragged paragraph would promise something the drop
 * cannot deliver.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { PickedFile } from './files';

const carriesFiles = (event: DragEvent): boolean =>
  Array.from(event.dataTransfer?.types ?? []).includes('Files');

/** Keep in step with the same mapping in `files.web.ts`. */
const toPickedFile = (file: File): PickedFile => ({
  uri: URL.createObjectURL(file),
  name: file.name,
  // Browsers leave the type empty for an extension they cannot map,
  // and the pipeline's own extension fallback expects undefined there,
  // not ''.
  size: file.size,
  mimeType: file.type || undefined,
});

export const useFileDrop: typeof import('./fileDrop').useFileDrop = (
  onFiles,
) => {
  const [dragging, setDragging] = useState(false);
  const nodeRef = useRef<HTMLElement | null>(null);
  const depth = useRef(0);

  // Read through a ref so a caller passing an inline arrow does not
  // tear the listeners down and rebuild them on every render.
  const handler = useRef(onFiles);
  handler.current = onFiles;

  const ref = useCallback((node: unknown) => {
    nodeRef.current = (node as HTMLElement | null) ?? null;
  }, []);

  useEffect(() => {
    const node = nodeRef.current;
    if (!node) return;

    const onDragEnter = (event: DragEvent) => {
      if (!carriesFiles(event)) return;
      depth.current += 1;
      setDragging(true);
    };

    const onDragOver = (event: DragEvent) => {
      if (!carriesFiles(event)) return;
      // Without this the browser navigates to the file on drop.
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
    };

    const onDragLeave = (event: DragEvent) => {
      if (!carriesFiles(event)) return;
      depth.current = Math.max(0, depth.current - 1);
      if (depth.current === 0) setDragging(false);
    };

    const onDrop = (event: DragEvent) => {
      if (!carriesFiles(event)) return;
      event.preventDefault();
      depth.current = 0;
      setDragging(false);
      const files = Array.from(event.dataTransfer?.files ?? []);
      if (files.length) handler.current(files.map(toPickedFile));
    };

    node.addEventListener('dragenter', onDragEnter);
    node.addEventListener('dragover', onDragOver);
    node.addEventListener('dragleave', onDragLeave);
    node.addEventListener('drop', onDrop);
    return () => {
      node.removeEventListener('dragenter', onDragEnter);
      node.removeEventListener('dragover', onDragOver);
      node.removeEventListener('dragleave', onDragLeave);
      node.removeEventListener('drop', onDrop);
      // A drag in flight when the zone unmounts would otherwise leave
      // the next mount thinking it is still being dragged over.
      depth.current = 0;
    };
    // `nodeRef.current` is set by the callback ref before this runs on
    // mount, and the node identity does not change for the life of the
    // element, so there is nothing else to depend on.
  }, []);

  return { ref, dragging };
};
