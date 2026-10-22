import { describe, expect, it } from 'vitest';
import {
  PLAYBACK_SPEEDS,
  SPEED_CATALOG,
  speedCatalogCoversStore,
} from '../playback.js';

describe('playback speed catalog', () => {
  // The reason this test exists: a 3x entry once shipped in the sheet
  // that the store could not persist, because the catalog and the
  // persisted set lived in different files.
  it('covers exactly the persisted speeds — no more, no fewer', () => {
    expect(speedCatalogCoversStore()).toBe(true);
  });

  it('has no 3x', () => {
    expect(PLAYBACK_SPEEDS).not.toContain(3 as never);
    expect(SPEED_CATALOG.map((s) => s.value)).not.toContain(3 as never);
  });

  it('is ordered slowest to fastest', () => {
    const vals = SPEED_CATALOG.map((s) => s.value);
    expect([...vals].sort((a, b) => a - b)).toEqual(vals);
  });

  it('gives every speed non-empty copy', () => {
    for (const s of SPEED_CATALOG) {
      expect(s.display, `display for ${s.value}`).toMatch(/×$/);
      expect(s.label.length, `label for ${s.value}`).toBeGreaterThan(0);
      expect(s.description.length, `description for ${s.value}`).toBeGreaterThan(10);
    }
  });

  it('includes 1x, so "normal" is always reachable', () => {
    expect(PLAYBACK_SPEEDS).toContain(1);
  });
});
