/**
 * The signed-in shell, mounted once.
 *
 * Not `<Tabs>`. The shell owns the audio session, the mini-player
 * overlay and the share-intent hand-off, and all three must survive a
 * tab change — the player cannot unmount when you leave Listen.
 * `<Tabs>` would mount each screen in its own navigator subtree and
 * take that guarantee away.
 *
 * So the shell stays one component and the **route drives which tab it
 * shows**, replacing the `activeTab` state that `App.tsx` held. That is
 * precisely M2's change: the URL is the source of truth, and the stage
 * machine is gone. Each tab has a real URL and real history.
 *
 * What is NOT done here: the 15 drill-in routes from
 * docs/M2_ROUTE_MAP.md. You's nine-value `view` and Settings' five are
 * still internal state. They are the next step and each is reviewable
 * on its own; doing them in this change would mean one commit nobody
 * could review against a signed-in app that cannot be tested here.
 */
import { useCallback } from 'react';
import { Slot, usePathname, useRouter } from 'expo-router';
import type { TabKey } from '~/components';
import { BooksProvider } from '~/hooks/useBooks';
import { SignedInShell } from '~/shell/SignedInShell';
import { useShellSession } from '~/shell/useShellSession';

const TABS: TabKey[] = ['library', 'discover', 'listen', 'you'];

export default function TabsLayout() {
  const router = useRouter();
  const pathname = usePathname();
  const session = useShellSession();

  const activeTab =
    TABS.find((t) => pathname.startsWith(`/${t}`)) ?? 'library';

  const setActiveTab = useCallback(
    (tab: TabKey) => router.navigate(`/${tab}`),
    [router],
  );

  return (
    /*
     * BooksProvider mounts HERE, not in the root layout — the same
     * boundary App.tsx used, for the same reason its comment gave:
     * unmounting on sign-out tears down the realtime subscription and
     * the AsyncStorage cache handles, so a fresh session starts fresh.
     * Sign-out replaces to /(auth)/welcome, which leaves this layout.
     *
     * It was missed in the cutover. `useBooks()` throws without it, so
     * every signed-in launch would have crashed on arrival — invisible
     * to the type checker and unreachable without a test account.
     */
    <BooksProvider>
      <SignedInShell
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        userName={session.userName}
        onSignOut={session.onSignOut}
        onUpgrade={session.onUpgrade}
        listenState={session.listenState}
        setListenState={session.setListenState}
        pendingUploadAssets={session.pendingUploadAssets}
        onPendingUploadAssetsConsumed={session.onPendingUploadAssetsConsumed}
        youDrillHandlers={{
          // Account stays on YouScreen's internal `view` for now. The
          // route would need `profile` and `plan`, which the shell
          // assembles from four hooks (useIsPro, useBooks, useCurrentUser
          // and the month-stats refresh). Lifting that is M3's data-layer
          // work; pushing to a route that cannot be given its data would
          // be a 404 dressed up as progress.
          onSettings: () => router.push('/you/settings'),
          // These three live under /settings, not /you/settings, because
          // Settings reaches them too. One canonical route each.
          onReadingDisplay: () => router.push('/settings/reading-display'),
          onDefaultVoice: () => router.push('/settings/default-voice'),
          onTranslationLanguage: () => router.push('/settings/translation-language'),
          onNotifications: () => router.push('/settings/notifications'),
          onHelp: () => router.push('/you/help'),
          onSendFeedback: () => router.push('/you/feedback'),
        }}
      />
      {/* Keeps the tab route files live so Expo Router registers the
          URLs. They render nothing — the shell above draws the screen. */}
      <Slot />
    </BooksProvider>
  );
}
