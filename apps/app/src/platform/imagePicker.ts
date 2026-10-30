/**
 * Image picking — the adapter over `expo-image-picker`. Like `speech`,
 * §8's table has no row for this package; the row it should have is
 * "`imagePicker` | `expo-image-picker` | file input, no crop".
 *
 * One caller, the avatar flow in AccountScreen, and the adapter is
 * shaped around the four outcomes it actually branches on rather than
 * around the package's result object. The call site used to unpack
 * `perm.granted`, then `result.canceled`, then `result.assets?.[0]`,
 * then `asset.uri` — four shapes to reach one answer, each with its
 * own way of being absent. A discriminated union says it once.
 *
 * **Crop is native-only.** `allowsEditing` and `aspect` have no browser
 * equivalent short of adding a cropper dependency, and web ignores
 * them: a web avatar is uploaded uncropped. That is a decision, not an
 * oversight — see `imagePicker.web.ts`.
 */

import * as ImagePicker from 'expo-image-picker';

export type PickedImage = {
  /** Readable by `readBytes` from `~/platform/files`. */
  uri: string;
  /** Null when the platform did not say; callers default it. */
  mimeType: string | null;
};

export type PickImageResult =
  | { status: 'picked'; image: PickedImage }
  /** The user backed out. Not an error; say nothing. */
  | { status: 'cancelled' }
  /** Media-library access refused. The caller should offer Settings. */
  | { status: 'denied' }
  /** The picker returned, but with nothing readable in it. */
  | { status: 'unreadable' };

export type PickImageOptions = {
  /** Native crop UI. Ignored on web. */
  allowsEditing?: boolean;
  /** Crop aspect, with `allowsEditing`. Ignored on web. */
  aspect?: [number, number];
  /** 0–1 recompression. Ignored on web, which uploads the file as-is. */
  quality?: number;
};

export async function pickImage({
  allowsEditing = false,
  aspect,
  quality,
}: PickImageOptions = {}): Promise<PickImageResult> {
  // Media library only, never the camera: the simulator has no camera,
  // and the avatar flow has always been "grab one from photos".
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) return { status: 'denied' };

  const result = await ImagePicker.launchImageLibraryAsync({
    // String-literal `MediaType[]` form (SDK 55+).
    mediaTypes: ['images'],
    allowsEditing,
    aspect,
    quality,
    selectionLimit: 1,
  });

  // Kept from the call site, because what it watches for is the
  // package's behaviour rather than the screen's: a picker that reports
  // cancelled after a selection, or hands back an asset with no uri,
  // is diagnosable from here without native logs.
  console.log('[image-pick] result', {
    canceled: result.canceled,
    count: result.assets?.length ?? 0,
    firstUri: result.assets?.[0]?.uri ?? null,
    firstMime: result.assets?.[0]?.mimeType ?? null,
  });

  if (result.canceled) return { status: 'cancelled' };
  const asset = result.assets?.[0];
  if (!asset?.uri) return { status: 'unreadable' };
  return {
    status: 'picked',
    image: { uri: asset.uri, mimeType: asset.mimeType ?? null },
  };
}
