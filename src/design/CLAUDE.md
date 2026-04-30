# Design Directory Context

This directory contains the design system implementation. When working on files in `src/design/` or `src/components/`, follow these specific rules in addition to the root CLAUDE.md.

## The golden rule

**`tokens.ts` is the single source of truth.** Components reference tokens; tokens reference nothing. If you find yourself wanting to hardcode a color, font size, or spacing value, that value belongs in `tokens.ts` first.

## When asked to add a new token

1. Check the canonical spec in `/docs/specs/` first — the value might already be documented
2. Add it to `tokens.ts` in the appropriate group
3. Use semantic naming over visual naming (`error` not `red500`)
4. Document the source: which spec doc and section the value comes from

## When asked to add a new component

1. Check `/docs/specs/` for the canonical spec — Bookflow has 5 documented component systems
2. If a spec exists, implement it faithfully — don't reinterpret
3. If no spec exists, ask: should this be a one-off (inline in a screen) or a reusable component (here)?
4. Reusable components must:
   - Reference tokens for all visual values
   - Be exported from `src/components/index.ts`
   - Have TypeScript prop types defined
   - Handle all states defined in the spec (default, pressed, disabled, etc.)

## Component file template

```tsx
import { Pressable, Text, View } from 'react-native';
import { tokens } from '~/design/tokens';

export type ComponentNameProps = {
  // Props ordered: required first, then optional
};

export function ComponentName({ ... }: ComponentNameProps) {
  return (
    // Implementation
  );
}
```

## What NOT to do here

- Don't import from `react-native` StyleSheet directly when NativeWind classes work
- Don't use inline hex colors — go through `tokens.colors.X`
- Don't rebuild components that already exist — extend or compose them instead
- Don't add a `theme` prop to support light/dark variants until we explicitly add dark mode
