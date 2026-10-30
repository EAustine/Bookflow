/**
 * The signed-in session's shell state.
 *
 * Extracted from `App.tsx` in M2. These are the values `LibraryStage`
 * received as props from the stage machine; with the machine gone, the
 * tabs layout needs them from somewhere, and a hook keeps the shell's
 * own code untouched.
 *
 * Not a context: there is exactly one consumer — `(tabs)/_layout.tsx` —
 * and a provider would be ceremony around a single call site. If the
 * drill-in routes end up needing these too, a context is the right
 * change then.
 */
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { useSharedFiles } from '~/platform/shareIntent';
import type { PickedFile } from '~/platform/files';
import { supabase } from '~/lib/supabase';
import { reset as resetOfflineQueue } from '~/core/offline-queue';
import { clearBookCoverCache as clearLibrarySignedUrlCache } from '~/core/bookCovers';
import { clearLastListenedBookId } from '~/features/listen';
import { clearReaderImageSignedUrlCache } from '~/features/reader';
import { presentPaywall, ENTITLEMENT_PRO } from '~/features/billing';
import type { ListenPlaybackState } from '~/features/listen';

export type ShellSession = {
  userName: string;
  onSignOut: () => Promise<void>;
  onUpgrade: () => void;
  listenState: ListenPlaybackState;
  setListenState: React.Dispatch<React.SetStateAction<ListenPlaybackState>>;
  pendingUploadAssets: PickedFile[] | null;
  onPendingUploadAssetsConsumed: () => void;
};

export function useShellSession(): ShellSession {
  const router = useRouter();
  const [listenState, setListenState] = useState<ListenPlaybackState>('paused');
  const [pendingUploadAssets, setPendingUploadAssets] = useState<
    PickedFile[] | null
  >(null);

  const handleSignOut = useCallback(async () => {
    try {
      await supabase.auth.signOut();
    } catch (err) {
      // Ignore — even if the network call fails, the local session is
      // cleared by supabase-js and we still want to send the user home.
      console.warn('[auth] signOut failed:', err);
    }
    // Drop every in-memory signed URL keyed by the previous user's
    // storage prefix and the AsyncStorage pointer to their last-
    // listened book. Without these, the next sign-in on the same
    // device could briefly resolve covers / inline images from the
    // outgoing user's namespace, or auto-restore their listening
    // session on the Listen tab.
    try {
      clearLibrarySignedUrlCache();
      clearReaderImageSignedUrlCache();
      void clearLastListenedBookId();
    } catch (err) {
      console.warn('[auth] signed-URL cache clear failed:', err);
    }
  }, []);

  // The stage machine used to follow sign-out with setStage('welcome').
  // The route does that now, which is the one behavioural line that
  // moved rather than being copied.
  const onSignOut = useCallback(async () => {
    await handleSignOut();
    // Pending writes belong to the outgoing user. The executor already
    // refuses to replay them without a session, but leaving them on
    // disk means the next person to sign in on this device carries a
    // stranger's queue.
    await resetOfflineQueue();
    router.replace('/(auth)/welcome');
  }, [handleSignOut, router]);

  const onUpgrade = useCallback(
    () => void presentPaywall({ requiredEntitlement: ENTITLEMENT_PRO }),
    [],
  );

  /**
   * Share-intent hand-off. Native config for the extension itself lives
   * in `app.json` → plugins → `expo-share-intent` (iOS Share Extension
   * target + Android intent-filter for application/epub+zip and
   * application/pdf). Changes there require a new EAS build.
   */
  const { files: sharedFiles, clear: clearSharedFiles } = useSharedFiles();
  useEffect(() => {
    if (sharedFiles.length === 0) return;
    // Filter to the formats we can actually import. The plugin config
    // already restricts activation to EPUB+PDF, but defending here too
    // keeps things robust if a tester or share-target glitch sends
    // something else.
    const supported: PickedFile[] = [];
    for (const f of sharedFiles) {
      const mimeType = f.mimeType?.toLowerCase() ?? '';
      const name = f.name?.toLowerCase() ?? '';
      const looksLikeBook =
        mimeType === 'application/pdf' ||
        mimeType === 'application/epub+zip' ||
        name.endsWith('.pdf') ||
        name.endsWith('.epub');
      if (!looksLikeBook) continue;
      supported.push({
        uri: f.uri,
        name: f.name ?? 'Shared book',
        mimeType: f.mimeType ?? undefined,
        size: f.size ?? undefined,
      });
    }
    if (supported.length) {
      setPendingUploadAssets(supported);
      router.navigate('/library');
    }
    clearSharedFiles();
  }, [sharedFiles, clearSharedFiles, router]);

  const onPendingUploadAssetsConsumed = useCallback(
    () => setPendingUploadAssets(null),
    [],
  );

  return {
    // `App.tsx` passed the signup name here and the shell falls back to
    // the profile name; preserved rather than second-guessed.
    userName: '',
    onSignOut,
    onUpgrade,
    listenState,
    setListenState,
    pendingUploadAssets,
    onPendingUploadAssetsConsumed,
  };
}
