import { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Linking,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { File as FsFile } from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BottomSheet, type BottomSheetRef, Button, Icon, Text } from '~/components';
import { tokens } from '~/design/tokens';
import { refreshCurrentUser } from '~/hooks/useCurrentUser';
import { supabase } from '~/lib/supabase';
import { presentCustomerCenter, restorePurchases } from '~/lib/revenuecat';
import type { YouPlan, YouProfile } from '~/screens/YouScreen';

// External URLs for the Privacy & data rows live in a shared
// constants module so a marketing change is a one-line edit.
import {
  PRIVACY_POLICY_URL,
  STUDENT_VERIFICATION_URL,
  TERMS_OF_SERVICE_URL,
} from '~/lib/legalUrls';
import { useBackHandler } from '~/lib/useBackHandler';

// ─── Props ────────────────────────────────────────────────────────────────────

export type AccountScreenProps = {
  profile: YouProfile;
  plan: YouPlan;
  onBack: () => void;
  onSignOut: () => Promise<void> | void;
  onUpgrade: () => void;
  onExportData?: () => void;
};

// ─── Screen ───────────────────────────────────────────────────────────────────

export function AccountScreen({
  profile,
  plan,
  onBack,
  onSignOut,
  onUpgrade,
  onExportData,
}: AccountScreenProps) {
  const signOutSheetRef = useRef<BottomSheetRef>(null);
  const deleteSheetRef = useRef<BottomSheetRef>(null);
  const [signingOut, setSigningOut] = useState(false);
  const [view, setView] = useState<'home' | 'edit-profile'>('home');
  const [exporting, setExporting] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const confirmSignOut = useCallback(async () => {
    if (signingOut) return;
    setSigningOut(true);
    try {
      await onSignOut();
      signOutSheetRef.current?.dismiss();
    } finally {
      setSigningOut(false);
    }
  }, [onSignOut, signingOut]);

  const openUrl = useCallback(async (url: string) => {
    try {
      const supported = await Linking.canOpenURL(url);
      if (supported) {
        await Linking.openURL(url);
      } else {
        Alert.alert("Can't open link", url);
      }
    } catch (err) {
      Alert.alert("Can't open link", err instanceof Error ? err.message : 'Unknown error');
    }
  }, []);

  const handleRestorePurchases = useCallback(async () => {
    if (restoring) return;
    setRestoring(true);
    try {
      const result = await restorePurchases();
      if (result.ok) {
        Alert.alert(
          'Purchases restored',
          result.pro
            ? "Your Pro subscription is active again. You're all set."
            : "We couldn't find any active purchases to restore on this account.",
        );
      } else if (result.reason === 'disabled') {
        Alert.alert(
          'Restore unavailable',
          'In-app purchases are not configured for this build.',
        );
      } else {
        Alert.alert(
          "Couldn't restore purchases",
          result.message ?? 'Please try again in a moment.',
        );
      }
    } finally {
      setRestoring(false);
    }
  }, [restoring]);

  const handleVerifyStudent = useCallback(async () => {
    // Student verification is provided via SheerID (or similar)
    // — we don't have a verification SDK integrated yet, so the
    // row deep-links into a web page where the user submits
    // their .edu credentials. The returned coupon is applied
    // to the Standard plan checkout.
    const url = STUDENT_VERIFICATION_URL;
    try {
      const supported = await Linking.canOpenURL(url);
      if (supported) {
        await Linking.openURL(url);
      } else {
        Alert.alert('Verification', `Open ${url} on a desktop to complete student verification.`);
      }
    } catch (err) {
      Alert.alert(
        "Can't open verification",
        err instanceof Error ? err.message : 'Unknown error',
      );
    }
  }, []);

  const handleDeleteAccount = useCallback(async () => {
    if (deleting) return;
    setDeleting(true);
    try {
      // Server-side cascade — drops the auth user (and every row
      // owned by them via FK / RLS). Signs the user out locally
      // once the function returns; the next render lands on the
      // Welcome screen.
      const { data, error } = await supabase.functions.invoke('delete-account', {
        body: {},
      });
      if (error || !data?.ok) {
        const message =
          error?.message ?? data?.message ?? 'Please try again in a moment.';
        Alert.alert("Couldn't delete account", message);
        return;
      }
      deleteSheetRef.current?.dismiss();
      // Local sign-out (the server may have already invalidated
      // the session). Triggers the App-level redirect to Welcome.
      await onSignOut();
    } catch (err) {
      Alert.alert(
        "Couldn't delete account",
        err instanceof Error ? err.message : 'Unknown error',
      );
    } finally {
      setDeleting(false);
    }
  }, [deleting, onSignOut]);

  const handleExportData = useCallback(async () => {
    if (exporting) return;
    if (onExportData) {
      onExportData();
      return;
    }
    setExporting(true);
    try {
      const exported = await gatherUserData();
      const blob = JSON.stringify(exported, null, 2);
      await Share.share({
        title: 'Your Bookflow data',
        message: blob,
      });
    } catch (err) {
      Alert.alert(
        "Couldn't export your data",
        err instanceof Error ? err.message : 'Something went wrong.',
      );
    } finally {
      setExporting(false);
    }
  }, [exporting, onExportData]);

  const isPro = plan.name !== 'Free';

  if (view === 'edit-profile') {
    return <EditProfileScreen profile={profile} onBack={() => setView('home')} />;
  }

  return (
    <>
      <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
        <SubHeader onBack={onBack} />
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <ProfileSection
            profile={profile}
            onEdit={() => setView('edit-profile')}
          />

          {isPro ? (
            <ProPlanCard plan={plan} />
          ) : (
            <FreePlanCard plan={plan} onUpgrade={onUpgrade} />
          )}

          <SectionGroup label="Account">
            {!isPro && (
              <>
                <AccountListRow
                  iconName="CreditCard"
                  label="Verify student status"
                  hint="$4.99/mo"
                  onPress={() => void handleVerifyStudent()}
                />
                <RowDivider />
              </>
            )}
            <AccountListRow
              iconName="Refresh"
              label={restoring ? 'Restoring…' : 'Restore purchases'}
              onPress={() => {
                if (restoring) return;
                void handleRestorePurchases();
              }}
            />
          </SectionGroup>

          <SectionGroup label="Privacy & data">
            <AccountListRow
              iconName="Shield"
              label="Privacy policy"
              onPress={() => void openUrl(PRIVACY_POLICY_URL)}
            />
            <RowDivider />
            <AccountListRow
              iconName="FileText"
              label="Terms of service"
              onPress={() => void openUrl(TERMS_OF_SERVICE_URL)}
            />
            <RowDivider />
            <AccountListRow
              iconName="Download"
              label={exporting ? 'Preparing export…' : 'Export my data'}
              onPress={() => void handleExportData()}
            />
          </SectionGroup>

          <SectionGroup>
            <AccountListRow
              iconName="Logout"
              label="Sign out"
              destructive
              onPress={() => signOutSheetRef.current?.present()}
            />
            <RowDivider />
            <AccountListRow
              iconName="Trash"
              label="Delete account"
              muted
              onPress={() => deleteSheetRef.current?.present()}
            />
          </SectionGroup>
        </ScrollView>
      </SafeAreaView>

      <BottomSheet ref={signOutSheetRef} enablePanDownToClose={!signingOut}>
        <SignOutBody
          loading={signingOut}
          onConfirm={confirmSignOut}
          onCancel={() => {
            if (!signingOut) signOutSheetRef.current?.dismiss();
          }}
        />
      </BottomSheet>

      <BottomSheet ref={deleteSheetRef} enablePanDownToClose={!deleting}>
        <DeleteAccountBody
          loading={deleting}
          onConfirm={() => void handleDeleteAccount()}
          onCancel={() => {
            if (!deleting) deleteSheetRef.current?.dismiss();
          }}
        />
      </BottomSheet>
    </>
  );
}

// ─── Edit profile sub-screen ─────────────────────────────────────────────────

/**
 * Lightweight edit screen for the profile name. Email is owned by
 * Supabase Auth and re-verification isn't wired yet, so this only
 * exposes the display name field. Saves to `profiles.full_name`;
 * `useCurrentUser` already reads that column so other surfaces
 * (library greeting, You tab header) update on the next render
 * without any manual cache invalidation.
 */
function EditProfileScreen({
  profile,
  onBack,
}: {
  profile: YouProfile;
  onBack: () => void;
}) {
  const [name, setName] = useState(profile.name);
  // Local preview state for the avatar — `avatarUrl` shows what's
  // currently displayed, `pickedUri` is the new image the user
  // selected (still a file:// URI until Save uploads it). After
  // Save succeeds the new public URL replaces both.
  const [avatarUrl, setAvatarUrl] = useState<string | null>(
    profile.avatarUrl ?? null,
  );
  const [pickedUri, setPickedUri] = useState<string | null>(null);
  const [pickedMime, setPickedMime] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [removingAvatar, setRemovingAvatar] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Mirrors ProfileSection — if the preview URL fails to load (a
  // remote `avatarUrl` whose storage returns 403, or a local
  // `pickedUri` whose file was deleted between pick and render),
  // fall back to initials instead of an empty circle.
  const [previewLoadFailed, setPreviewLoadFailed] = useState(false);

  const pickAvatar = useCallback(async () => {
    setError(null);
    setPreviewLoadFailed(false);
    // Permission flow lives inside the picker — we request only
    // media-library access (no camera) because the simulator
    // doesn't have a camera and most users grab from photos anyway.
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      setError('Permission to access photos was denied.');
      return;
    }
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        // String-literal `MediaType[]` form (SDK 55+).
        mediaTypes: ['images'],
        // Crop UI back on per user request. Confirmed via tested
        // builds that picker + editing works on iOS Simulator and
        // device; the previous "silent return" behavior wasn't
        // caused by editing — it was caused by the iOS image not
        // making it past the upload step (XHR blob from file://
        // returning 0 bytes). Switching to expo-file-system below
        // makes the upload robust enough to keep crop on.
        allowsEditing: true,
        aspect: [1, 1],
        // 0.8 — slightly higher than before so the cropped image
        // doesn't look soft on the 96px Edit-profile circle or the
        // larger sources we may render it in later.
        quality: 0.8,
        selectionLimit: 1,
      });
      // Diagnostic — visible in Metro / dev tools. If the picker
      // ever returns an unexpected shape (canceled when user
      // selected, empty assets array, missing uri), this surfaces
      // the cause without needing native logs.
      console.log('[avatar-pick] result', {
        canceled: result.canceled,
        count: result.assets?.length ?? 0,
        firstUri: result.assets?.[0]?.uri ?? null,
        firstMime: result.assets?.[0]?.mimeType ?? null,
        firstSize:
          (result.assets?.[0] as { fileSize?: number } | undefined)
            ?.fileSize ?? null,
      });
      if (result.canceled) return;
      const asset = result.assets?.[0];
      if (!asset?.uri) {
        setError(
          "Couldn't read the selected photo. Try a different image.",
        );
        return;
      }
      setPickedUri(asset.uri);
      setPickedMime(asset.mimeType ?? 'image/jpeg');
    } catch (err) {
      console.warn('[avatar-pick] threw', err);
      setError(
        err instanceof Error
          ? `Picker error: ${err.message}`
          : 'Could not open photo picker.',
      );
    }
  }, []);

  /**
   * Remove the user's profile photo, reverting the avatar back to
   * the initials chip. Three-step cleanup:
   *   1. Confirm via native Alert (destructive style)
   *   2. Delete the avatar file from `avatars/{user_id}/avatar.*`
   *      (uses `list` to find the actual extension since we don't
   *      know which the user uploaded — jpg/png/webp). Best-effort:
   *      if the file is already gone, we still clear the DB column.
   *   3. Upsert `profiles.avatar_storage_path = null` so future
   *      `useCurrentUser` reads return `avatarUrl = null` → all
   *      consumers render initials.
   *   4. Clear local picked-state + cached avatarUrl so the Edit
   *      profile preview reverts to initials immediately, before
   *      the broadcast refresh propagates.
   *
   * Works whether the user just picked a photo (not yet saved) or
   * has an existing avatar in storage. The picked-only case skips
   * the storage delete + DB upsert (nothing to clean up server-
   * side) and just clears local state.
   */
  const removeAvatar = useCallback(() => {
    const hasServerAvatar = !!avatarUrl;
    Alert.alert(
      'Remove profile photo?',
      hasServerAvatar
        ? 'Your profile will go back to showing your initials.'
        : 'The selected photo will be discarded.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              setRemovingAvatar(true);
              setError(null);
              try {
                // If only a just-picked-not-yet-saved photo is set,
                // there's nothing on the server to clean up.
                if (!hasServerAvatar) {
                  setPickedUri(null);
                  setPickedMime(null);
                  setPreviewLoadFailed(false);
                  return;
                }
                const {
                  data: { user },
                } = await supabase.auth.getUser();
                if (!user) {
                  setError('Not signed in.');
                  return;
                }
                // Find the actual file(s) under the user's avatar
                // prefix — we don't track the extension client-side,
                // and a legacy avatar might be jpg while a new one
                // would be png, etc. List + remove is bulletproof.
                const { data: objects, error: listErr } =
                  await supabase.storage.from('avatars').list(user.id);
                if (listErr) {
                  console.warn(
                    '[avatar-remove] list failed',
                    listErr.message,
                  );
                }
                if (objects && objects.length > 0) {
                  const paths = objects.map(
                    (o: { name: string }) => `${user.id}/${o.name}`,
                  );
                  const { error: delErr } = await supabase.storage
                    .from('avatars')
                    .remove(paths);
                  if (delErr) {
                    console.warn(
                      '[avatar-remove] storage delete failed',
                      delErr.message,
                    );
                    // Continue to the DB clear regardless — a
                    // dangling storage file is harmless once the
                    // path is removed from the row; the next
                    // upload will overwrite via upsert anyway.
                  }
                }
                const { error: upsertErr } = await supabase
                  .from('profiles')
                  .upsert(
                    { id: user.id, avatar_storage_path: null },
                    { onConflict: 'id' },
                  );
                if (upsertErr) {
                  setError(
                    `Couldn't remove photo: ${upsertErr.message}`,
                  );
                  return;
                }
                // Local clears so the Edit-profile preview reverts
                // to initials in the same frame, without waiting
                // for the refreshCurrentUser round-trip.
                setAvatarUrl(null);
                setPickedUri(null);
                setPickedMime(null);
                setPreviewLoadFailed(false);
                // Broadcast → useCurrentUser refetches → Account
                // home + You-tab avatars also flip back to initials.
                refreshCurrentUser();
              } catch (err) {
                console.warn('[avatar-remove] threw', err);
                setError(
                  err instanceof Error
                    ? err.message
                    : 'Could not remove photo.',
                );
              } finally {
                setRemovingAvatar(false);
              }
            })();
          },
        },
      ],
    );
  }, [avatarUrl]);

  const save = useCallback(async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setError('Please enter a name.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setError('Not signed in.');
        return;
      }
      // Upload the new avatar first (if any). We do this before the
      // profiles upsert so the row's `avatar_storage_path` always
      // points at something that actually exists in storage.
      //
      // History: previously used `fetch(uri).blob()` (iOS only —
      // failed on Android with "Network request failed"), then XHR
      // with responseType='blob' (worked on both platforms but
      // sometimes returned 0-byte blobs from the iOS Simulator's
      // file:// URIs). Now using expo-file-system's File API which
      // reads the file off disk into a real ArrayBuffer — same
      // primitive across iOS / Android / Simulator / device.
      let nextAvatarPath: string | null = null;
      if (pickedUri) {
        setUploading(true);
        try {
          const ext = pickedMime === 'image/png' ? 'png'
            : pickedMime === 'image/webp' ? 'webp'
            : 'jpg';
          const path = `${user.id}/avatar.${ext}`;
          // Read the picked file into an ArrayBuffer.
          let arrayBuffer: ArrayBuffer;
          try {
            const fsFile = new FsFile(pickedUri);
            arrayBuffer = await fsFile.arrayBuffer();
          } catch (readErr) {
            console.warn('[avatar-upload] read failed', readErr);
            setError(
              readErr instanceof Error
                ? `Couldn't read the photo: ${readErr.message}`
                : "Couldn't read the photo.",
            );
            return;
          }
          if (arrayBuffer.byteLength === 0) {
            setError('Selected photo is empty. Try a different image.');
            return;
          }
          console.log(
            '[avatar-upload] uploading',
            path,
            arrayBuffer.byteLength,
            'bytes',
          );
          const { error: upErr } = await supabase.storage
            .from('avatars')
            .upload(path, arrayBuffer, {
              contentType: pickedMime ?? 'image/jpeg',
              upsert: true,
            });
          if (upErr) {
            console.warn('[avatar-upload] upload failed', upErr);
            setError(`Couldn't upload photo: ${upErr.message}`);
            return;
          }
          nextAvatarPath = path;
          console.log('[avatar-upload] upload succeeded', path);
        } finally {
          setUploading(false);
        }
      }

      const updates: {
        id: string;
        full_name: string;
        avatar_storage_path?: string;
      } = {
        id: user.id,
        full_name: trimmed,
      };
      if (nextAvatarPath) updates.avatar_storage_path = nextAvatarPath;

      const { error: upsertError } = await supabase.from('profiles').upsert(
        updates,
        { onConflict: 'id' },
      );
      if (upsertError) {
        setError(upsertError.message);
        return;
      }
      // Refresh the local preview to the new public URL so a
      // subsequent navigation back to this screen renders the new
      // avatar without waiting for useCurrentUser to re-fetch.
      if (nextAvatarPath) {
        const { data: pub } = supabase.storage
          .from('avatars')
          .getPublicUrl(nextAvatarPath);
        // Append a cache-buster — getPublicUrl returns the same URL
        // for the same path, and the browser may have cached the
        // previous avatar at that URL. The Date.now() query string
        // forces a fresh fetch without changing the underlying file.
        if (pub?.publicUrl) {
          setAvatarUrl(`${pub.publicUrl}?v=${Date.now()}`);
        }
        setPickedUri(null);
        setPickedMime(null);
      }
      // Broadcast to every mounted useCurrentUser so the Account
      // home view (and anywhere else showing the avatar/name)
      // refetches and re-renders with the new values. Without this
      // the header still shows the old initials chip until the next
      // auth-state event or app reload.
      refreshCurrentUser();
      // Confirm the save before backing out. Without this users
      // who upload a photo see the screen pop and have no idea
      // whether the upload landed — especially if the new avatar
      // takes a second to propagate through useCurrentUser's
      // realtime → public URL → Image fetch chain.
      if (nextAvatarPath) {
        Alert.alert(
          'Photo saved',
          'Your profile photo has been updated.',
          [{ text: 'OK', onPress: onBack }],
        );
      } else {
        onBack();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setSaving(false);
    }
  }, [name, onBack, pickedUri, pickedMime]);

  // Save is enabled if EITHER the name or the avatar has changed.
  const canSave =
    name.trim().length > 0 &&
    (name.trim() !== profile.name.trim() || pickedUri !== null);

  // Preview source: the just-picked file (if any), else the saved
  // avatarUrl from props/local state.
  const previewUri = pickedUri ?? avatarUrl;
  const initials = (profile.name || profile.email || '?')
    .trim()
    .split(/\s+/)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .slice(0, 2)
    .join('') || '?';

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right', 'bottom']}>
      <View style={styles.subHeader}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back"
          onPress={onBack}
          style={({ pressed }) => [styles.backBtn, pressed && { opacity: 0.7 }]}
        >
          <Icon name="ArrowLeft" size={16} color={tokens.textColors.secondary} />
        </Pressable>
        <Text style={styles.subHeaderTitle}>Edit profile</Text>
      </View>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.editScrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {/* Avatar picker. Whole circle is tappable — we don't render
         *  a separate "Change photo" button because the chip itself
         *  is the affordance (matches iOS Settings / Slack /
         *  Discord patterns).
         *
         *  Layout note: the outer Pressable holds the avatar AND the
         *  camera badge as siblings — the badge is *outside* the
         *  clipped circle so it isn't cut off by `overflow: hidden`.
         *  The inner `avatarPickerCircle` is the only thing that
         *  clips, and it only contains the Image / initials. */}
        <View style={styles.avatarPickerWrap}>
          <Pressable
            onPress={() => void pickAvatar()}
            disabled={saving || uploading}
            accessibilityRole="button"
            accessibilityLabel={previewUri ? 'Change profile picture' : 'Add profile picture'}
            style={({ pressed }) => [
              styles.avatarPicker,
              pressed && { opacity: 0.85 },
              (saving || uploading) && { opacity: 0.6 },
            ]}
          >
            <View style={styles.avatarPickerCircle}>
              {previewUri && !previewLoadFailed ? (
                <Image
                  key={previewUri}
                  source={{ uri: previewUri }}
                  style={styles.avatarPickerImage}
                  resizeMode="cover"
                  onError={(e) => {
                    console.warn(
                      '[avatar-edit] preview failed to load',
                      previewUri,
                      e.nativeEvent?.error,
                    );
                    setPreviewLoadFailed(true);
                  }}
                  onLoad={() => setPreviewLoadFailed(false)}
                />
              ) : (
                <Text style={styles.avatarPickerInitials}>{initials}</Text>
              )}
            </View>
            <View style={styles.avatarPickerOverlay}>
              {uploading ? (
                <ActivityIndicator size="small" color={tokens.colors.cream[50]} />
              ) : (
                <Icon
                  name="Camera"
                  size={14}
                  color={tokens.colors.cream[50]}
                  strokeWidth={1.5}
                />
              )}
            </View>
          </Pressable>
          {/* Hint text reflects three states so the user knows the
           *  pick worked even when the Image element can't render
           *  the local URI (iOS Simulator photos with a `ph://` or
           *  some `file://` paths intermittently fail). Without
           *  this they tapped a photo and saw nothing change —
           *  thought the picker silently no-op'd. */}
          <Text style={styles.avatarPickerHint}>
            {pickedUri
              ? 'New photo selected · tap Save'
              : previewUri
                ? 'Tap to change'
                : 'Add a photo'}
          </Text>
          {/* Remove-photo tertiary button. Only visible when there's
           *  something to remove — either a just-picked file the user
           *  hasn't saved yet, or an existing avatar already in
           *  storage. Tap confirms via Alert, then clears the avatar
           *  immediately (no need to tap Save afterwards). */}
          {previewUri && (
            <Pressable
              onPress={() => void removeAvatar()}
              disabled={removingAvatar || saving || uploading}
              accessibilityRole="button"
              accessibilityLabel="Remove profile photo"
              hitSlop={8}
              style={({ pressed }) => [
                styles.avatarRemoveBtn,
                (removingAvatar || saving || uploading) && { opacity: 0.5 },
                pressed && { opacity: 0.7 },
              ]}
            >
              {removingAvatar ? (
                <ActivityIndicator
                  size="small"
                  color={tokens.colors.warn}
                />
              ) : (
                <Text style={styles.avatarRemoveBtnLabel}>
                  Remove photo
                </Text>
              )}
            </Pressable>
          )}
        </View>

        <View style={styles.editField}>
          <Text style={styles.editFieldLabel}>Display name</Text>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="Your name"
            placeholderTextColor={tokens.textColors.subtle}
            style={styles.editFieldInput}
            editable={!saving}
            autoCapitalize="words"
            returnKeyType="done"
            onSubmitEditing={() => void save()}
          />
        </View>

        <View style={styles.editField}>
          <Text style={styles.editFieldLabel}>Email</Text>
          <Text style={styles.editFieldReadonly}>{profile.email}</Text>
          <Text style={styles.editFieldHint}>
            Email is tied to your account and can{`’`}t be changed here.
          </Text>
        </View>

        {error && <Text style={styles.editError}>{error}</Text>}

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Save"
          onPress={() => void save()}
          disabled={!canSave || saving}
          style={({ pressed }) => [
            styles.editSaveBtn,
            (!canSave || saving) && { opacity: 0.5 },
            pressed && { opacity: 0.85 },
          ]}
        >
          <Text style={styles.editSaveLabel}>
            {saving ? (uploading ? 'Uploading photo…' : 'Saving…') : 'Save'}
          </Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

/**
 * Pull the user's books, highlights, and reading sessions into a
 * single JSON blob for the Export-my-data flow. Everything is
 * filtered server-side by RLS (queries only return the caller's own
 * rows). Falls back to empty arrays for tables that error so a
 * partial dump still goes out.
 */
async function gatherUserData(): Promise<Record<string, unknown>> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    throw new Error('Not signed in.');
  }
  const [booksResult, highlightsResult, sessionsResult] = await Promise.all([
    supabase
      .from('books')
      .select('id, title, author, file_type, total_pages, last_read_page, last_read_position, last_read_at, created_at')
      .eq('user_id', user.id),
    supabase
      .from('highlights')
      .select('id, book_id, page_index, kind, text, color, note, created_at')
      .eq('user_id', user.id),
    supabase
      .from('reading_sessions')
      .select('id, book_id, started_at, ended_at, duration_seconds')
      .eq('user_id', user.id),
  ]);
  return {
    exported_at: new Date().toISOString(),
    user: {
      id: user.id,
      email: user.email,
    },
    books: booksResult.data ?? [],
    highlights: highlightsResult.data ?? [],
    reading_sessions: sessionsResult.data ?? [],
  };
}

// ─── Sub-header ───────────────────────────────────────────────────────────────

function SubHeader({ onBack }: { onBack: () => void }) {
  // Hardware-back on the main Account screen pops back to the You
  // tab home. EditProfile sub-screen mounts its own back affordance
  // higher in the LIFO stack so this one is dormant while it's open.
  useBackHandler(() => {
    onBack();
    return true;
  });
  return (
    <View style={styles.subHeader}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Back"
        onPress={onBack}
        style={({ pressed }) => [styles.backBtn, pressed && { opacity: 0.7 }]}
      >
        <Icon name="ArrowLeft" size={16} color={tokens.textColors.secondary} />
      </Pressable>
      <Text style={styles.subHeaderTitle}>Account &amp; subscription</Text>
    </View>
  );
}

// ─── Profile section ──────────────────────────────────────────────────────────

function ProfileSection({
  profile,
  onEdit,
}: {
  profile: YouProfile;
  onEdit: () => void;
}) {
  const initials = getInitials(profile.name, profile.email);
  // Track Image load failures so a broken URL (RLS misconfig,
  // deleted file, network blip) gracefully falls back to the
  // initials chip instead of showing a blank circle. Reset on every
  // URL change via the key on <Image>, which re-mounts the element.
  const [avatarLoadFailed, setAvatarLoadFailed] = useState(false);
  const showImage = !!profile.avatarUrl && !avatarLoadFailed;
  return (
    <View style={styles.profileSection}>
      <View style={styles.avatar}>
        {showImage ? (
          <Image
            // key={profile.avatarUrl} forces a fresh <Image> instance
            // when the URL changes (e.g. after a re-upload). Without
            // it React would reuse the previous Image's internal
            // cache state and might keep showing the old/failed
            // result against the new URL.
            key={profile.avatarUrl ?? 'no-avatar'}
            source={{ uri: profile.avatarUrl ?? undefined }}
            style={styles.avatarImage}
            resizeMode="cover"
            onError={(e) => {
              console.warn(
                '[avatar] failed to load',
                profile.avatarUrl,
                e.nativeEvent?.error,
              );
              setAvatarLoadFailed(true);
            }}
            onLoad={() => setAvatarLoadFailed(false)}
          />
        ) : (
          <Text style={styles.avatarInitials}>{initials}</Text>
        )}
      </View>
      <View style={styles.profileInfo}>
        <Text style={styles.profileName}>{profile.name}</Text>
        <Text style={styles.profileEmail} numberOfLines={1}>
          {profile.email}
        </Text>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Edit profile"
        style={({ pressed }) => [styles.editBtn, pressed && { opacity: 0.7 }]}
        onPress={onEdit}
      >
        <Text style={styles.editBtnLabel}>Edit</Text>
      </Pressable>
    </View>
  );
}

function getInitials(name: string, email: string): string {
  const trimmed = name.trim();
  if (trimmed) {
    const parts = trimmed.split(/\s+/).slice(0, 2);
    const result = parts.map((p) => p[0]?.toUpperCase() ?? '').join('');
    if (result) return result;
  }
  return (email.split('@')[0] ?? '').slice(0, 2).toUpperCase() || '·';
}

// ─── Free plan card ───────────────────────────────────────────────────────────

function FreePlanCard({ plan, onUpgrade }: { plan: YouPlan; onUpgrade: () => void }) {
  const { audio, aiCredits, books } = plan.meters;

  return (
    <View style={styles.subCard}>
      <View style={styles.freeCardHeader}>
        <View>
          <Text style={styles.planEyebrow}>Your plan</Text>
          <Text style={styles.planName}>Free</Text>
          <Text style={styles.planStatus}>Resets June 1</Text>
        </View>
        <Pressable
          accessibilityRole="button"
          onPress={onUpgrade}
          style={({ pressed }) => [styles.upgradeBtn, pressed && { opacity: 0.85 }]}
        >
          <Text style={styles.upgradeBtnLabel}>Upgrade</Text>
        </Pressable>
      </View>

      <View style={styles.cardMeters}>
        <MeterRow
          name="Audio"
          valueLabel={`${audio.used} / ${audio.total} min`}
          percent={pct(audio.used, audio.total)}
        />
        <MeterRow
          name="AI credits"
          valueLabel={`${fmt(aiCredits.used)} / ${fmt(aiCredits.total)}`}
          percent={pct(aiCredits.used, aiCredits.total)}
        />
        <MeterRow
          name="Books"
          valueLabel={`${books.used} / ${books.total}`}
          percent={pct(books.used, books.total)}
        />
      </View>
    </View>
  );
}

// ─── Pro plan card ────────────────────────────────────────────────────────────

const PRO_FEATURES = [
  'Unlimited audio streaming & offline downloads',
  'Unlimited library',
  '500K AI credits / month',
  '3 premium AI voices',
];

function ProPlanCard({ plan }: { plan: YouPlan }) {
  const planLabel = plan.name === 'Standard' ? 'Standard · Yearly' : plan.name;

  return (
    <View style={styles.subCard}>
      <View style={styles.proCardHeader}>
        <View>
          <Text style={styles.planEyebrowPro}>Your plan</Text>
          <Text style={styles.planNamePro}>{planLabel}</Text>
          <Text style={styles.planStatusPro}>Active · $79 / year</Text>
        </View>
        <View style={styles.proCheck}>
          <Icon name="Check" size={11} color={tokens.colors.forest[800]} strokeWidth={2.5} />
        </View>
      </View>

      <View style={styles.renewalRow}>
        <Text style={styles.renewalLabel}>Next renewal</Text>
        <Text style={styles.renewalDate}>May 12, 2027</Text>
      </View>

      <View style={styles.proFeatures}>
        {PRO_FEATURES.map((f) => (
          <View key={f} style={styles.proFeatureRow}>
            <View style={styles.featureCheck}>
              <Icon name="Check" size={9} color={tokens.colors.forest[800]} strokeWidth={2.5} />
            </View>
            <Text style={styles.proFeatureText}>{f}</Text>
          </View>
        ))}
      </View>

      <View style={styles.proActions}>
        <Pressable
          accessibilityRole="button"
          style={({ pressed }) => [styles.proActionBtn, pressed && { opacity: 0.7 }]}
          onPress={() => {
            // RevenueCat's Customer Center handles plan management,
            // billing history, and cancellation in one native sheet —
            // both buttons open the same surface so the user can do
            // whatever they came here for in one place.
            void presentCustomerCenter().catch(() => {
              // Disabled / unconfigured — silently no-op.
            });
          }}
        >
          <Text style={styles.proActionManage}>Manage</Text>
        </Pressable>
        <View style={styles.proActionDivider} />
        <Pressable
          accessibilityRole="button"
          style={({ pressed }) => [styles.proActionBtn, pressed && { opacity: 0.7 }]}
          onPress={() => {
            void presentCustomerCenter().catch(() => {
              // Disabled / unconfigured — silently no-op.
            });
          }}
        >
          <Text style={styles.proActionCancel}>Cancel</Text>
        </Pressable>
      </View>
    </View>
  );
}

// ─── Meter row ────────────────────────────────────────────────────────────────

function MeterRow({
  name,
  valueLabel,
  percent,
}: {
  name: string;
  valueLabel: string;
  percent: number;
}) {
  const clamped = Math.max(0, Math.min(100, percent));
  const fillColor = percent >= 80 ? tokens.colors.amber[500] : tokens.colors.forest[800];
  return (
    <View style={styles.meterRow}>
      <View style={styles.meterMeta}>
        <Text style={styles.meterName}>{name}</Text>
        <Text style={styles.meterVal}>{valueLabel}</Text>
      </View>
      <View style={styles.meterTrack}>
        <View style={[styles.meterFill, { width: `${clamped}%`, backgroundColor: fillColor }]} />
      </View>
    </View>
  );
}

function pct(used: number, total: number) {
  return total > 0 ? (used / total) * 100 : 0;
}

function fmt(n: number): string {
  if (n >= 1000) {
    const k = n / 1000;
    return Number.isInteger(k) ? `${k}K` : `${k.toFixed(1)}K`;
  }
  return String(n);
}

// ─── Section group ────────────────────────────────────────────────────────────

function SectionGroup({ label, children }: { label?: string; children: React.ReactNode }) {
  return (
    <View style={styles.sectionGroup}>
      {label && <Text style={styles.sectionEyebrow}>{label}</Text>}
      <View style={styles.listGroup}>{children}</View>
    </View>
  );
}

function RowDivider() {
  return <View style={styles.rowDivider} />;
}

// ─── List row ─────────────────────────────────────────────────────────────────

import type { IconName } from '~/components/Icon';

/**
 * Account-screen list row. Visually distinct from the shared
 * `~/components/ListRow` (different prop shape, supports the
 * `muted` / `destructive` colour variants this screen uses for
 * Delete-account + Sign-out). Renamed from `ListRow` so the
 * shadowing doesn't confuse static analysis when both names are
 * in scope of a future shared-component import.
 */
function AccountListRow({
  iconName,
  label,
  hint,
  destructive,
  muted,
  onPress,
}: {
  iconName: IconName;
  label: string;
  hint?: string;
  destructive?: boolean;
  muted?: boolean;
  onPress: () => void;
}) {
  const iconBg = destructive
    ? tokens.bgColors.errorMuted
    : muted
    ? tokens.bgColors.surface
    : tokens.bgColors.surface;

  const iconColor = destructive
    ? tokens.colors.error
    : muted
    ? tokens.colors.ink[300]
    : tokens.textColors.secondary;

  const labelColor = destructive
    ? tokens.colors.error
    : muted
    ? tokens.colors.ink[400]
    : tokens.textColors.primary;

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.listRow,
        pressed && { backgroundColor: tokens.bgColors.raised },
      ]}
    >
      <View style={[styles.rowIconBg, { backgroundColor: iconBg }]}>
        <Icon name={iconName} size={15} color={iconColor} />
      </View>
      <Text style={[styles.rowLabel, { color: labelColor }, muted && styles.rowLabelMuted]}>
        {label}
      </Text>
      {hint && <Text style={styles.rowHint}>{hint}</Text>}
      {!destructive && !muted && (
        <Icon name="ChevronRight" size={13} color={tokens.colors.ink[300]} />
      )}
    </Pressable>
  );
}

// ─── Sign-out sheet body ──────────────────────────────────────────────────────

function SignOutBody({
  loading,
  onConfirm,
  onCancel,
}: {
  loading: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <View>
      <View style={styles.sheetIconWrap}>
        <Icon name="Logout" size={22} color={tokens.colors.error} />
      </View>
      <Text variant="display-sm" style={styles.sheetTitle}>
        Sign out?
      </Text>
      <Text variant="body-sm" color="muted" style={styles.sheetBody}>
        You'll need to sign back in to access your library and reading progress. Your data stays
        safe.
      </Text>
      <View style={styles.sheetActions}>
        <Button
          label="Sign out"
          variant="destructive"
          size="large"
          fullWidth
          loading={loading}
          onPress={onConfirm}
        />
        <Button
          label="Cancel"
          variant="tertiary"
          size="standard"
          fullWidth
          disabled={loading}
          onPress={onCancel}
        />
      </View>
    </View>
  );
}

// ─── Delete account sheet body ───────────────────────────────────────────────

/**
 * Required by Apple Guideline 5.1.1(v) — apps that support sign-up
 * must offer in-app account deletion. The actual deletion runs on
 * the server via the `delete-account` edge function which drops
 * the auth user; RLS + CASCADE constraints take care of the
 * dependent rows (books, highlights, sessions, conversations,
 * messages, summaries, audio_cache, etc).
 */
function DeleteAccountBody({
  loading,
  onConfirm,
  onCancel,
}: {
  loading: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <View>
      <View style={[styles.sheetIconWrap, { backgroundColor: tokens.colors.errorBg }]}>
        <Icon name="Trash" size={22} color={tokens.colors.error} />
      </View>
      <Text variant="display-sm" style={styles.sheetTitle}>
        Delete account?
      </Text>
      <Text variant="body-sm" color="muted" style={styles.sheetBody}>
        This permanently removes your account, every book you{`’`}ve uploaded, your reading
        progress, your highlights, and any AI conversations. It can{`’`}t be undone.
      </Text>
      <View style={styles.sheetActions}>
        <Button
          label="Delete my account"
          variant="destructive"
          size="large"
          fullWidth
          loading={loading}
          onPress={onConfirm}
        />
        <Button
          label="Cancel"
          variant="tertiary"
          size="standard"
          fullWidth
          disabled={loading}
          onPress={onCancel}
        />
      </View>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: tokens.bgColors.canvas,
  },
  scroll: { flex: 1 },
  scrollContent: {
    paddingBottom: tokens.space['2xl'],
  },

  // Sub-header
  subHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: tokens.space.lg,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: tokens.borderColors.subtle,
    backgroundColor: tokens.bgColors.canvas,
  },
  backBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: tokens.bgColors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  subHeaderTitle: {
    fontFamily: tokens.fonts.display,
    fontSize: 17,
    fontWeight: '500',
    color: tokens.textColors.primary,
    flex: 1,
  },

  // Profile section
  profileSection: {
    marginHorizontal: tokens.space.lg,
    marginTop: tokens.space.lg,
    marginBottom: tokens.space.lg,
    backgroundColor: tokens.bgColors.surface,
    borderRadius: 14,
    padding: tokens.space.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: tokens.colors.forest[800],
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    overflow: 'hidden',
  },
  avatarImage: {
    width: 52,
    height: 52,
  },
  avatarInitials: {
    fontFamily: tokens.fonts.display,
    fontSize: 20,
    fontWeight: '500',
    color: tokens.colors.cream[50],
    lineHeight: 24,
  },
  profileInfo: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  profileName: {
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 15,
    fontWeight: '500',
    color: tokens.textColors.primary,
  },
  profileEmail: {
    fontFamily: tokens.fonts.ui,
    fontSize: 12,
    color: tokens.textColors.muted,
  },
  editBtn: {
    height: 30,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: tokens.bgColors.canvas,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: tokens.borderColors.subtle,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  editBtnLabel: {
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 12,
    fontWeight: '500',
    color: tokens.textColors.secondary,
  },

  // Plan cards (shared wrapper)
  subCard: {
    marginHorizontal: tokens.space.lg,
    marginBottom: tokens.space.lg,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: tokens.borderColors.subtle,
    overflow: 'hidden',
  },

  // Free card header
  freeCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 14,
    paddingHorizontal: tokens.space.md,
    backgroundColor: tokens.bgColors.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: tokens.borderColors.subtle,
  },
  planEyebrow: {
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 10,
    fontWeight: '500',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    color: tokens.colors.ink[400],
    marginBottom: 3,
  },
  planName: {
    fontFamily: tokens.fonts.display,
    fontSize: 18,
    fontWeight: '500',
    color: tokens.textColors.primary,
    lineHeight: 22,
  },
  planStatus: {
    fontFamily: tokens.fonts.ui,
    fontSize: 11,
    color: tokens.textColors.muted,
    marginTop: 1,
  },
  upgradeBtn: {
    height: 36,
    paddingHorizontal: 16,
    borderRadius: 9,
    backgroundColor: tokens.colors.forest[800],
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  upgradeBtnLabel: {
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 13,
    fontWeight: '500',
    color: tokens.colors.cream[50],
  },

  // Meters (inside free card)
  cardMeters: {
    padding: 14,
    gap: 12,
    backgroundColor: tokens.bgColors.canvas,
  },
  meterRow: { gap: 5 },
  meterMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  meterName: {
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 12,
    fontWeight: '500',
    color: tokens.textColors.secondary,
  },
  meterVal: {
    fontFamily: tokens.fonts.ui,
    fontSize: 11,
    color: tokens.colors.ink[400],
  },
  meterTrack: {
    height: 4,
    backgroundColor: tokens.colors.cream[200],
    borderRadius: 2,
    overflow: 'hidden',
  },
  meterFill: {
    height: '100%',
    borderRadius: 2,
  },

  // Pro card header
  proCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 14,
    paddingHorizontal: tokens.space.md,
    backgroundColor: tokens.colors.forest[800],
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: tokens.colors.forest[700],
  },
  planEyebrowPro: {
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 10,
    fontWeight: '500',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    color: tokens.colors.forest[200],
    marginBottom: 3,
  },
  planNamePro: {
    fontFamily: tokens.fonts.display,
    fontSize: 18,
    fontWeight: '500',
    color: tokens.colors.cream[50],
    lineHeight: 22,
  },
  planStatusPro: {
    fontFamily: tokens.fonts.ui,
    fontSize: 11,
    color: tokens.colors.forest[200],
    marginTop: 1,
  },
  proCheck: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: tokens.colors.forest[200],
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },

  // Renewal row
  renewalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: tokens.space.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: tokens.borderColors.subtle,
    backgroundColor: tokens.bgColors.canvas,
  },
  renewalLabel: {
    fontFamily: tokens.fonts.ui,
    fontSize: 12,
    color: tokens.textColors.secondary,
  },
  renewalDate: {
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 12,
    fontWeight: '500',
    color: tokens.textColors.primary,
  },

  // Pro features
  proFeatures: {
    padding: 12,
    paddingHorizontal: tokens.space.md,
    gap: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: tokens.borderColors.subtle,
    backgroundColor: tokens.bgColors.canvas,
  },
  proFeatureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  featureCheck: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: tokens.colors.forest[50],
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  proFeatureText: {
    fontFamily: tokens.fonts.ui,
    fontSize: 12,
    color: tokens.textColors.secondary,
    flex: 1,
  },

  // Pro actions footer
  proActions: {
    flexDirection: 'row',
    backgroundColor: tokens.bgColors.canvas,
  },
  proActionBtn: {
    flex: 1,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  proActionDivider: {
    width: StyleSheet.hairlineWidth,
    backgroundColor: tokens.borderColors.subtle,
  },
  proActionManage: {
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 13,
    fontWeight: '500',
    color: tokens.colors.forest[800],
  },
  proActionCancel: {
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 13,
    fontWeight: '500',
    color: tokens.colors.error,
  },

  // Section group
  sectionGroup: {
    paddingHorizontal: tokens.space.lg,
    marginBottom: tokens.space.lg,
  },
  sectionEyebrow: {
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 11,
    fontWeight: '500',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    color: tokens.colors.ink[400],
    marginBottom: 8,
  },
  listGroup: {
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: tokens.borderColors.subtle,
    backgroundColor: tokens.bgColors.canvas,
  },

  // List row
  listRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: tokens.space.md,
    backgroundColor: tokens.bgColors.canvas,
  },
  rowIconBg: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  rowLabel: {
    flex: 1,
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 14,
    fontWeight: '500',
    color: tokens.textColors.primary,
  },
  rowLabelMuted: {
    fontFamily: tokens.fonts.ui,
    fontWeight: '400',
  },
  rowHint: {
    fontFamily: tokens.fonts.ui,
    fontSize: 13,
    color: tokens.colors.ink[400],
    flexShrink: 0,
  },
  rowDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: tokens.borderColors.subtle,
  },

  // Sign-out sheet
  sheetIconWrap: {
    width: 48,
    height: 48,
    borderRadius: tokens.radii['2xl'],
    backgroundColor: tokens.bgColors.errorMuted,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: tokens.space.md,
  },
  sheetTitle: {
    marginBottom: tokens.space.xs,
  },
  sheetBody: {
    marginBottom: tokens.space.xl,
  },
  sheetActions: {
    gap: tokens.space.sm,
  },

  // Edit profile sub-screen — uses its own content container so we
  // can apply horizontal padding once at the wrapper level. The
  // shared `scrollContent` deliberately omits horizontal padding
  // because the Account home view's section groups apply their own.
  editScrollContent: {
    paddingHorizontal: tokens.space.lg,
    paddingTop: tokens.space.lg,
    paddingBottom: tokens.space['2xl'],
  },
  // Avatar picker — circular chip at the top of the edit screen,
  // tap-to-change. Image fills the circle; falls back to initials
  // when there's no photo. A small overlay chip on the bottom-right
  // shows a camera icon (or spinner while uploading) so users know
  // it's interactive without needing a separate button.
  avatarPickerWrap: {
    alignItems: 'center',
    gap: 8,
    marginBottom: tokens.space.xl,
  },
  // Outer container — sized to the avatar but NOT clipped, so the
  // camera badge can hang off the bottom-right corner without being
  // cut by overflow:hidden.
  avatarPicker: {
    width: 96,
    height: 96,
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Inner circle — this is the only thing that clips. Holds the
  // Image (or initials text). Anything that needs to escape the
  // circle (overlay badge) must be a sibling of this view, not a
  // child.
  avatarPickerCircle: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: tokens.colors.forest[100],
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarPickerImage: {
    width: 96,
    height: 96,
  },
  avatarPickerInitials: {
    // The display serif has tall ascenders; at fontSize 32 the
    // glyphs got clipped at the top of the 96px circle because the
    // default lineHeight pushes the baseline lower than the visual
    // center. Smaller fontSize + explicit lineHeight = predictable
    // vertical centering across both platforms.
    fontFamily: tokens.fonts.display,
    fontSize: 28,
    lineHeight: 32,
    fontWeight: '500',
    color: tokens.colors.forest[800],
    // No letterSpacing — added a slight forward shift that made the
    // serif feet straddle the circle's vertical center awkwardly.
    textAlign: 'center',
  },
  // Camera badge — positioned so its center sits roughly on the
  // bottom-right edge of the circle (`right: -2` nudges it slightly
  // off-canvas, matching iOS Settings / Slack avatar conventions).
  avatarPickerOverlay: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: tokens.colors.forest[800],
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: tokens.bgColors.canvas,
  },
  avatarPickerHint: {
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 12,
    fontWeight: '500',
    color: tokens.textColors.muted,
  },
  // Tertiary "Remove photo" button — text-only, destructive tint,
  // sits below the avatar hint. Lower visual weight than the
  // primary forest Save button so it doesn't compete for attention
  // when the user just wants to change their photo.
  avatarRemoveBtn: {
    marginTop: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    minHeight: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarRemoveBtnLabel: {
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 12,
    fontWeight: '500',
    color: tokens.colors.warn,
  },
  editField: {
    gap: 6,
    marginBottom: tokens.space.lg,
  },
  editFieldLabel: {
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 11,
    fontWeight: '500',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: tokens.textColors.muted,
  },
  editFieldInput: {
    backgroundColor: tokens.bgColors.surface,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontFamily: tokens.fonts.ui,
    fontSize: 15,
    color: tokens.textColors.primary,
  },
  editFieldReadonly: {
    backgroundColor: tokens.bgColors.surface,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontFamily: tokens.fonts.ui,
    fontSize: 15,
    color: tokens.textColors.subtle,
  },
  editFieldHint: {
    fontFamily: tokens.fonts.ui,
    fontSize: 11,
    color: tokens.textColors.subtle,
    marginTop: 2,
  },
  editError: {
    fontFamily: tokens.fonts.ui,
    fontSize: 13,
    color: tokens.colors.warn,
    marginBottom: 12,
  },
  editSaveBtn: {
    backgroundColor: tokens.colors.forest[800],
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 6,
  },
  editSaveLabel: {
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 14,
    fontWeight: '500',
    color: tokens.colors.cream[50],
  },
});
