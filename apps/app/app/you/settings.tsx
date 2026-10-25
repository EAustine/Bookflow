/**
 * Settings.
 *
 * Its four drill-ins are routes now. They live under `/settings/*`
 * rather than `/you/settings/*` because You reaches three of them too —
 * one canonical route each, which is the duplication finding in
 * docs/M2_ROUTE_MAP.md resolved.
 *
 * The `view` state SettingsScreen still carries is unreachable from
 * here. Left in place until the drill-ins are verified against a
 * signed-in account; it is the cheapest revert if the routing is wrong.
 */
import { useRouter } from 'expo-router';
import { SettingsScreen } from '~/features/account';

export default function Settings() {
  const router = useRouter();
  return (
    <SettingsScreen
      onBack={() => router.back()}
      onReadingDisplay={() => router.push('/settings/reading-display')}
      onDefaultVoice={() => router.push('/settings/default-voice')}
      onPlaybackSpeed={() => router.push('/settings/playback-speed')}
      onTranslationLanguage={() => router.push('/settings/translation-language')}
    />
  );
}
