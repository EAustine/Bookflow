/**
 * File picking on web — a hidden `<input type="file">` (§8). See
 * `files.ts` for the contract and why the adapter owns `PickedFile`.
 *
 * The signature is annotated against the native module's own, so tsc
 * checks the two sides agree. Metro resolves this file on web and
 * `files.ts` everywhere else, and nothing otherwise compares them —
 * `import type` erases, so naming the native module here costs the web
 * bundle nothing.
 *
 * **`uri` is an object URL**, because that is what makes the two sides
 * interchangeable: the upload pipeline reads a file with
 * `fetch(picked.uri).blob()`, and `fetch` accepts a `blob:` URL. The
 * cost is that each one pins its File in memory until revoked, and the
 * adapter cannot revoke it — it does not know when the caller is done.
 * At one book per pick that is a few MB that the next navigation
 * releases. If bulk import ever lands on web, `PickedFile` should grow
 * a `release()` the pipeline calls in a finally.
 *
 * Drag and drop is the other half of §8's web row. It belongs to
 * whatever surface shows a drop zone rather than to a function that
 * opens a picker, so it is not here.
 */

export const pickFiles: typeof import('./files').pickFiles = ({
  mimeTypes,
  multiple = false,
}) =>
  new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = mimeTypes.join(',');
    input.multiple = multiple;
    input.style.display = 'none';

    let settled = false;
    const finish = (files: FileList | null) => {
      if (settled) return;
      settled = true;
      input.remove();
      resolve(
        Array.from(files ?? []).map((file) => ({
          uri: URL.createObjectURL(file),
          name: file.name,
          size: file.size,
          // Browsers leave this empty for a type they cannot map from
          // the extension; undefined is what the pipeline's own
          // extension fallback expects, and '' would defeat it.
          mimeType: file.type || undefined,
        })),
      );
    };

    // `cancel` is the modern signal and fires on dismissal in current
    // browsers. Where it does not, the promise simply stays pending and
    // the picker can be opened again — the input is detached, so a
    // second pick cannot be confused with the first.
    input.addEventListener('change', () => finish(input.files));
    input.addEventListener('cancel', () => finish(null));

    document.body.appendChild(input);
    input.click();
  });

/**
 * `fetch` reads a `blob:` url, which is what `pickFiles` hands out, and
 * an http(s) one too. The native note about zero-byte XHR reads is an
 * iOS `file://` problem and has no web counterpart.
 */
export const readBytes: typeof import('./files').readBytes = async (uri) => {
  const response = await fetch(uri);
  return response.arrayBuffer();
};
