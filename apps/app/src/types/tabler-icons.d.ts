/**
 * Types for `@tabler/icons-react-native`'s per-icon modules.
 *
 * ## Why this file has to exist
 *
 * M4c moved `Icon.tsx` off the package barrel, which was costing 4.6 MB
 * of an 8.5 MiB web bundle, onto one module per icon. The package's
 * `exports` map advertises types for those subpaths at
 * `./dist/icons/*.d.ts`. The declarations actually live at
 * `./dist/icons/icons/*.d.ts`, one directory deeper, so TypeScript
 * finds nothing and silently types every per-icon import `any`.
 *
 * That is not academic. The per-icon modules export **only a default**
 * (`export { IconAlertTriangle as default }`), and `any` let `tsc`
 * accept a named import of a member that does not exist. The icons
 * became `undefined`, React rendered nothing where each one should be,
 * and it got through `tsc`, ESLint, both bundles and the Playwright
 * smoke test. A browser check on the auth-callback error state is what
 * actually caught it, by finding zero `<svg>` where the pre-M4c bundle
 * had one.
 *
 * `any` also made `Icon.tsx`'s
 * `satisfies Record<string, ComponentType<TablerIconProps>>` vacuous —
 * the check whose whole job is catching that mistake. This restores it:
 * with a default-only declaration, a named import is an error again.
 *
 * The prop shape is written out rather than imported, because importing
 * a type from the package root would mean naming the barrel this
 * milestone exists to stop naming. It is deliberately the **subset the
 * wrapper actually passes**, not the package's full `IconProps`: the
 * package types `size` and `strokeWidth` as `string | number`, and a
 * component that wide is not assignable to the
 * `ComponentType<TablerIconProps>` the map is checked against. Narrower
 * is the safe direction here, since it can only reject a prop the
 * wrapper does not pass.
 *
 * If the package fixes its `exports` map, delete this file and check
 * that a named import still fails before believing it.
 */
declare module '@tabler/icons-react-native/Icon*' {
  import type { ComponentType } from 'react';

  const icon: ComponentType<{
    size?: number;
    color?: string;
    strokeWidth?: number;
  }>;
  export default icon;
}
