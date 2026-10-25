/**
 * Ai feature.
 *
 * §4 rule 1: other features import from THIS file, never from the
 * paths inside. The ESLint boundary added in M1 enforces it.
 */
export * from './screens/AIToolsScreen';
export * from './screens/PracticeQuestionsScreen';
export * from './api/aiChat';
export * from './api/aiSummary';
export * from './api/aiPractice';
export * from './api/aiStarters';
export * from './api/aiUsage';
