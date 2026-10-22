/**
 * Fail CI when the Figma file and packages/tokens disagree (§11).
 *
 * The last cleanup round corrected six separate rounds of drift by hand.
 * This is the automation that makes that unnecessary — and, more
 * importantly, makes drift *visible* the day it appears rather than the
 * next time someone compares by eye.
 *
 * Direction: **code is the source of truth** (ground rule 1). A mismatch
 * is reported as "Figma is wrong" unless the value was never in Figma at
 * all, which is reported separately as a gap.
 *
 * Auth: needs FIGMA_TOKEN (a personal access token with file read) and
 * FIGMA_FILE_KEY. Without them the check SKIPS rather than fails, so CI
 * is green before the secret is configured — see the exit codes below.
 * A skip is printed loudly; it is not meant to be permanent.
 *
 *   exit 0  match, or skipped for want of a token
 *   exit 1  drift found
 *   exit 2  could not reach Figma / bad response
 */
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const t = await import(join(here, '..', 'dist/index.js'));

const TOKEN = process.env.FIGMA_TOKEN;
const FILE_KEY = process.env.FIGMA_FILE_KEY || 'Rt3gjNC24kBTrncxlnkuPW';

if (!TOKEN) {
  console.log(
    'SKIPPED: no FIGMA_TOKEN.\n' +
      '  The Figma file and these tokens are NOT being compared. Set\n' +
      '  FIGMA_TOKEN (personal access token, file read scope) as a CI\n' +
      '  secret to turn this into a real check.',
  );
  process.exit(0);
}

/** Figma stores colours 0-1 per channel; tokens.ts stores hex. */
function rgbaToHex({ r, g, b, a }) {
  const h = (n) => Math.round(n * 255).toString(16).padStart(2, '0').toUpperCase();
  const base = `#${h(r)}${h(g)}${h(b)}`;
  return a !== undefined && a < 0.999 ? `${base}@${a.toFixed(3)}` : base;
}

/**
 * The expected set, keyed by the Figma variable name.
 *
 * Only primitives and semantics are compared. Component tokens, text
 * styles and elevation are deliberately out of scope: they are
 * structural in Figma and numeric here, so a diff would be noise rather
 * than signal.
 */
function expected() {
  const out = new Map();
  for (const [family, scale] of Object.entries(t.colors)) {
    if (typeof scale === 'string') { out.set(`${family}`, scale.toUpperCase()); continue; }
    for (const [step, hex] of Object.entries(scale)) {
      if (typeof hex === 'string') out.set(`${family}/${step}`, hex.toUpperCase());
    }
  }
  const semantic = { text: t.textColors, bg: t.bgColors, border: t.borderColors };
  for (const [group, obj] of Object.entries(semantic)) {
    for (const [k, v] of Object.entries(obj)) {
      if (typeof v === 'string') out.set(`color/${group}/${k}`, v.toUpperCase());
    }
  }
  for (const [k, v] of Object.entries(t.space)) out.set(`space/${k}`, String(v));
  for (const [k, v] of Object.entries(t.radii)) out.set(`radius/${k}`, String(v));
  return out;
}

let res;
try {
  res = await fetch(`https://api.figma.com/v1/files/${FILE_KEY}/variables/local`, {
    headers: { 'X-Figma-Token': TOKEN },
  });
} catch (err) {
  console.error(`Could not reach Figma: ${err.message}`);
  process.exit(2);
}

if (!res.ok) {
  console.error(
    `Figma returned ${res.status}. ` +
      (res.status === 403
        ? 'The variables endpoint needs an Enterprise plan, or the token lacks file read scope.'
        : ''),
  );
  process.exit(2);
}

const body = await res.json();
const vars = Object.values(body?.meta?.variables ?? {});
const collections = body?.meta?.variableCollections ?? {};

const actual = new Map();
for (const v of vars) {
  const modes = Object.values(v.valuesByMode ?? {});
  if (!modes.length) continue;
  const value = modes[0];
  // Aliases resolve elsewhere; comparing them here would report every
  // semantic token as a mismatch against its own primitive.
  if (value && typeof value === 'object' && value.type === 'VARIABLE_ALIAS') continue;
  const modeCount = (collections[v.variableCollectionId]?.modes ?? []).length;
  if (modeCount > 1) continue; // reader themes: three modes, no single truth
  actual.set(
    v.name,
    v.resolvedType === 'COLOR' ? rgbaToHex(value) : String(value),
  );
}

const exp = expected();
const drift = [];
const missing = [];

for (const [name, want] of exp) {
  if (!actual.has(name)) { missing.push({ name, want }); continue; }
  const got = actual.get(name);
  if (got !== want) drift.push({ name, want, got });
}

console.log(`compared ${exp.size} tokens against ${actual.size} Figma variables`);

if (missing.length) {
  console.log(`\n${missing.length} token(s) have no Figma variable:`);
  for (const m of missing.slice(0, 20)) console.log(`  ${m.name} = ${m.want}`);
  if (missing.length > 20) console.log(`  …and ${missing.length - 20} more`);
}

if (drift.length) {
  console.error(`\nDRIFT — Figma disagrees with packages/tokens on ${drift.length} value(s).`);
  console.error('Code is the source of truth, so Figma is what needs fixing:\n');
  for (const d of drift) console.error(`  ${d.name}\n    code:  ${d.want}\n    figma: ${d.got}`);
  process.exit(1);
}

console.log('\nNo drift.');
process.exit(0);
