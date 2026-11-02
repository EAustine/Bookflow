/**
 * Discover feature.
 *
 * §4 rule 1: other features import from THIS file, never from the
 * paths inside. The ESLint boundary added in M1 enforces it.
 */
export * from './screens/DiscoverScreen';
// Presentational, and published for the §6 gallery as well as for the
// screen: a card-shaped focus ring outsets 4px, which only a rendered
// tile can prove is not clipped by the surface around it.
export * from './components/DiscoverBookRow';
export * from './components/RailCard';
export * from './api/discoverApi';
export * from './api/discoverCache';
export * from './api/discoverImport';
export * from './api/discoverSeed';
