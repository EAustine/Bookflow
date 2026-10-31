/**
 * Web payload budget.
 *
 * ## Why a budget and not just the lint rule
 *
 * M4c cut the web export from 15.29 MiB to 4.25 MiB, and both causes
 * were a barrel import pulling a whole library in for a handful of
 * named exports: ~6,000 Tabler icons for 68, and 52 font weights for
 * 7. `eslint.config.js` now bans those two package roots by name.
 *
 * That rule catches the two causes we know about. This catches the
 * next one, whatever it turns out to be, because the defining property
 * of this class of regression is that **nothing else in CI notices**.
 * It typechecks, it lints, it bundles, it boots, the Playwright smoke
 * test passes, and every pixel renders correctly. The only symptom is
 * the number, so the number needs an assertion.
 *
 * ## Why these numbers
 *
 * Headroom over the measured 2026-10-31 figures, enough that ordinary
 * feature work does not trip it and small enough that another library
 * arriving whole does. Raising a budget is a deliberate act: do it in
 * a commit that says what grew and why, not as a drive-by to get CI
 * green. If you are here because the build failed, the useful question
 * is which dependency got bigger, and the per-bucket attribution in
 * the M4c log entry shows how to find out.
 *
 * Source maps are excluded: they are not served to anyone.
 */

import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const DIST = process.env.WEB_DIST ?? 'apps/app/dist';

/** MiB. Measured 2026-10-31: js 3.44, fonts 0.71, total 4.25. */
const BUDGETS = { js: 4.25, fonts: 1.0, total: 5.25 };

function walk(dir, found = []) {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) walk(path, found);
    else found.push(path);
  }
  return found;
}

let files;
try {
  files = walk(DIST);
} catch {
  console.error(
    `No web export at ${DIST}. Run \`npm run build:web\` first, or set WEB_DIST.`,
  );
  process.exit(1);
}

const MIB = 1024 * 1024;
const served = files.filter((f) => !f.endsWith('.map'));
const sizeOf = (list) =>
  list.reduce((sum, f) => sum + statSync(f).size, 0) / MIB;

const actual = {
  js: sizeOf(served.filter((f) => f.endsWith('.js'))),
  fonts: sizeOf(served.filter((f) => /\.(ttf|otf|woff2?)$/i.test(f))),
  total: sizeOf(served),
};

// A dist that is suspiciously small means the export failed or WEB_DIST
// points somewhere wrong, and a budget check that passes on an empty
// directory is worse than no check at all.
if (actual.total < 0.5) {
  console.error(
    `Only ${actual.total.toFixed(2)} MiB in ${DIST}. That is not a real ` +
      'export; failing rather than reporting a pass.',
  );
  process.exit(1);
}

let failed = false;
console.log(`Web payload in ${DIST} (source maps excluded):\n`);
for (const [name, budget] of Object.entries(BUDGETS)) {
  const used = actual[name];
  const over = used > budget;
  failed ||= over;
  const pct = ((used / budget) * 100).toFixed(0);
  console.log(
    `  ${over ? 'OVER ' : 'ok   '} ${name.padEnd(6)} ` +
      `${used.toFixed(2).padStart(6)} MiB  of ${budget.toFixed(2)} (${pct}%)`,
  );
}

if (failed) {
  console.error(
    '\nThe web payload is over budget. Find what grew before raising it: ' +
      'this check exists because a barrel import once added 11 MB without ' +
      'failing anything else in CI.',
  );
  process.exit(1);
}
console.log('\nWithin budget.');
