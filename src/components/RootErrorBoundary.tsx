import { Component, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

/**
 * Top-level error boundary. Wraps the entire app shell so any
 * uncaught throw during render — bad import, missing env var,
 * native module failure — surfaces as a friendly screen instead of
 * killing the JS bridge with SIGABRT.
 *
 * The Bookflow misconfig that prompted this (`Missing
 * EXPO_PUBLIC_SUPABASE_URL ...`) was thrown at module-eval time from
 * supabase.ts. Module-eval throws happen *before* any React tree
 * mounts, so the boundary needs to be the absolute outermost wrapper —
 * see `index.ts` for the registration site.
 *
 * Intentionally minimal:
 *   - Plain inline styles + raw RN primitives so a broken design
 *     system or token import can't bring this down with the app.
 *   - No translation, no design tokens, no fancy animations —
 *     same reason.
 *
 * Reset behaviour: tapping "Try again" re-renders children. If the
 * underlying cause is non-deterministic (network blip, transient
 * native init), the second render will succeed. If it's a hard
 * misconfig, the boundary catches the same error again and re-renders
 * the fallback — at least the user can read the message and report it.
 */

type Props = { children: ReactNode };
type State = {
  error: Error | null;
};

export class RootErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: { componentStack?: string | null }) {
    // Standard console.error so dev sees it; in production this still
    // shows up in `adb logcat`/`xcrun simctl spawn ... log` for triage.
    console.error('[RootErrorBoundary]', error, info?.componentStack);
  }

  reset = () => this.setState({ error: null });

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <View style={styles.root}>
        <View style={styles.card}>
          <Text style={styles.title}>Something went wrong</Text>
          <Text style={styles.body}>
            Bookflow hit an unexpected error and couldn&apos;t start. Please
            try again. If the problem keeps happening, reinstall the app
            or contact support.
          </Text>
          <View style={styles.detailWrap}>
            <Text style={styles.detail} numberOfLines={6}>
              {this.state.error.message || String(this.state.error)}
            </Text>
          </View>
          <Pressable onPress={this.reset} style={styles.btn}>
            <Text style={styles.btnLabel}>Try again</Text>
          </Pressable>
        </View>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#FAF7F2',
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 24,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
    color: '#1A1A1A',
    marginBottom: 8,
  },
  body: {
    fontSize: 14,
    lineHeight: 20,
    color: '#3D3A36',
    marginBottom: 16,
  },
  detailWrap: {
    backgroundColor: '#F5F1E8',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
  },
  detail: {
    fontSize: 12,
    fontFamily: 'Menlo',
    color: '#6B6862',
    lineHeight: 16,
  },
  btn: {
    backgroundColor: '#1B4332',
    height: 44,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnLabel: {
    color: '#FAF7F2',
    fontSize: 14,
    fontWeight: '500',
  },
});
