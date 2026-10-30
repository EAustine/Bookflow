/**
 * Image picking on web — a file input scoped to images. See
 * `imagePicker.ts` for the result contract.
 *
 * **No crop.** `allowsEditing`, `aspect` and `quality` are accepted and
 * ignored, so a web avatar uploads at whatever the user chose. A
 * browser offers no crop UI, and the alternatives were a cropper
 * dependency or a hand-rolled canvas editor — both a feature rather
 * than an adapter, and the avatar is rendered into a 96px circle that
 * centre-crops anyway. Decided deliberately; if web avatars start
 * looking wrong in the larger surfaces, that is the signal to revisit.
 *
 * `denied` never happens here: a file input needs no permission, the
 * user either chooses a file or does not. That is the same distinction
 * native draws, with one branch the browser cannot reach.
 */

export const pickImage: typeof import('./imagePicker').pickImage = () =>
  new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.style.display = 'none';

    let settled = false;
    const finish = (file: File | null) => {
      if (settled) return;
      settled = true;
      input.remove();
      if (!file) {
        resolve({ status: 'cancelled' });
        return;
      }
      resolve({
        status: 'picked',
        image: {
          // An object URL so `readBytes` can fetch it, matching the
          // contract `PickedFile.uri` already sets for this adapter's
          // sibling. The caller uploads and navigates away, which is
          // what releases it.
          uri: URL.createObjectURL(file),
          mimeType: file.type || null,
        },
      });
    };

    input.addEventListener('change', () => finish(input.files?.[0] ?? null));
    input.addEventListener('cancel', () => finish(null));

    document.body.appendChild(input);
    input.click();
  });
