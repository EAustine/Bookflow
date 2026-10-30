/**
 * File picking — the §8 `files` adapter, over `expo-document-picker`.
 *
 * The package reached further into the app than any call count
 * suggests: four files referenced `DocumentPicker.DocumentPickerAsset`
 * in their own prop and state types, but only one of them ever called
 * the picker. A native package was in the type signature of the shell,
 * the Library screen and the share-intent handler purely because it
 * owned the shape of "a file the user chose".
 *
 * So the adapter owns that shape now. `PickedFile` is the contract, and
 * it is deliberately the four fields the pipeline actually reads —
 * `name`, `size`, `mimeType` at validation and `uri` at upload — rather
 * than a mirror of the package's asset. That matters for web, where
 * there is no `uri` until something makes one, and it removes the
 * `as DocumentPickerAsset` cast the share-intent handler needed to
 * build an asset it had not picked.
 *
 * `files.web.ts` is the sibling Metro resolves for the web build.
 */

import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';

/** A file the user chose, in the only terms the upload pipeline uses. */
export type PickedFile = {
  /**
   * Something `fetch()` can read a Blob from. A cache-directory path on
   * native, an object URL on web.
   */
  uri: string;
  name: string;
  size?: number;
  mimeType?: string;
};

export type PickFilesOptions = {
  /** Accepted MIME types, e.g. `['application/pdf']`. */
  mimeTypes: string[];
  /** Allow selecting more than one file. Defaults to false. */
  multiple?: boolean;
};

/**
 * Open the platform's file picker.
 *
 * Returns an empty array when the user cancels, which is not the same
 * contract the package has: `getDocumentAsync` answers a result object
 * with `canceled`, a possibly-absent `assets`, and a possibly-empty
 * one. The call site collapsed all three into "nothing to upload"
 * anyway, so the adapter does it once instead of leaving three states
 * for every future caller — and every one of the three to get wrong.
 */
export async function pickFiles({
  mimeTypes,
  multiple = false,
}: PickFilesOptions): Promise<PickedFile[]> {
  const result = await DocumentPicker.getDocumentAsync({
    type: mimeTypes,
    multiple,
    // Without this the picked uri can point at a provider the app
    // cannot read twice (iCloud, Drive), and the upload reads it twice.
    copyToCacheDirectory: true,
  });
  if (result.canceled || !result.assets) return [];
  return result.assets.map((asset) => ({
    uri: asset.uri,
    name: asset.name,
    size: asset.size ?? undefined,
    mimeType: asset.mimeType ?? undefined,
  }));
}

/**
 * Read the bytes at a `PickedFile.uri` (or any other uri this platform
 * can read).
 *
 * Here rather than in `fileCache` because it is the other half of
 * picking: the caller has a uri this adapter produced and wants what
 * is behind it. `fileCache` is the app's own on-disk store, which is a
 * different concern with a different lifetime.
 *
 * The avatar upload needs this specifically because an XHR blob read
 * of a `file://` uri returns zero bytes on iOS — the bug that made
 * picked photos upload empty before `expo-file-system` was brought in.
 */
export async function readBytes(uri: string): Promise<ArrayBuffer> {
  return new File(uri).arrayBuffer();
}
