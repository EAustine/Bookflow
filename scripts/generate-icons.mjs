/**
 * Bookflow icon + splash asset generator.
 *
 * Run with: `node scripts/generate-icons.mjs`
 *
 * Renders the brand logomark (the two stacked arcs from
 * AuthCallbackScreen) into the four PNGs Expo needs:
 *
 *   assets/icon.png            1024×1024 — iOS home screen + global icon
 *   assets/adaptive-icon.png   1024×1024 — Android adaptive foreground
 *   assets/splash-icon.png     1024×1024 — splash mark over the cream bg
 *   assets/favicon.png            64×64  — web favicon
 *
 * iOS round-corners the icon automatically; we ship a square.
 * Android composites `adaptive-icon.png` over the `backgroundColor`
 * declared in app.json, with a 66% safe-area inside the 1024 canvas.
 *
 * Re-run any time the brand mark changes — sharp is idempotent.
 */

import { mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const ASSETS = join(ROOT, 'assets');

// Brand colors (mirror src/design/tokens.ts)
const FOREST_800 = '#1B4332';
const CREAM_50 = '#FAF7F2';

/**
 * The arc-pair logomark, parameterised by stroke colour. The viewBox is
 * 100×100; the file gets rendered at whatever target size sharp picks.
 *
 * Stroke widths are 11 (slightly thicker than the in-app 9px version)
 * so the mark reads cleanly when rendered at 60×60 on the iOS home
 * screen. The opacity-0.45 secondary arc gives the mark depth without
 * relying on multiple colours.
 */
function logomarkSvg({ stroke, padding = 12 }) {
  const inset = padding;
  // We pad inside the 100-unit canvas so the arcs don't touch edges.
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100">
  <g transform="translate(${inset / 2}, ${inset / 2}) scale(${(100 - inset) / 100})">
    <path d="M 25 80 C 33.5 22 66.5 22 75 80"
          stroke="${stroke}" stroke-width="11" stroke-linecap="round" fill="none" />
    <path d="M 35 78 C 45 33 55 33 65 78"
          stroke="${stroke}" stroke-width="11" stroke-linecap="round" fill="none" opacity="0.45" />
  </g>
</svg>`;
}

/**
 * Solid square SVG used as a background plate composited with the
 * logomark. Lets sharp do the math without us hand-rolling a raw RGBA
 * buffer (which is fragile for non-pixel-aligned sizes).
 */
function solidSvg({ size, color }) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
  <rect width="${size}" height="${size}" fill="${color}" />
</svg>`;
}

async function makeIosIcon(outPath) {
  // Solid forest-800 bg + cream mark. iOS rounds corners, so a square fill
  // is correct (don't pre-round — Apple's mask wins anyway).
  const bg = sharp(Buffer.from(solidSvg({ size: 1024, color: FOREST_800 })));
  const mark = sharp(Buffer.from(logomarkSvg({ stroke: CREAM_50, padding: 28 })))
    .resize(1024, 1024);
  const buffer = await bg
    .composite([{ input: await mark.png().toBuffer() }])
    .png()
    .toBuffer();
  await sharp(buffer).toFile(outPath);
  console.log(`  → ${outPath}`);
}

async function makeAdaptiveIcon(outPath) {
  // Foreground only — Android paints `backgroundColor` (set in app.json)
  // behind it. Safe-area is the inner 66%, so we pad the mark heavily
  // to keep it inside the launcher mask radius.
  const transparent = sharp({
    create: {
      width: 1024,
      height: 1024,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  });
  const mark = sharp(Buffer.from(logomarkSvg({ stroke: FOREST_800, padding: 38 })))
    .resize(1024, 1024);
  const buffer = await transparent
    .composite([{ input: await mark.png().toBuffer() }])
    .png()
    .toBuffer();
  await sharp(buffer).toFile(outPath);
  console.log(`  → ${outPath}`);
}

async function makeSplashIcon(outPath) {
  // The splash bg in app.json is cream (#FAF7F2). The icon floats over
  // it transparent so we don't double-paint the bg on devices where
  // splash sizing differs from native launcher icons.
  const transparent = sharp({
    create: {
      width: 1024,
      height: 1024,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  });
  const mark = sharp(Buffer.from(logomarkSvg({ stroke: FOREST_800, padding: 30 })))
    .resize(1024, 1024);
  const buffer = await transparent
    .composite([{ input: await mark.png().toBuffer() }])
    .png()
    .toBuffer();
  await sharp(buffer).toFile(outPath);
  console.log(`  → ${outPath}`);
}

async function makeFavicon(outPath) {
  // 64×64 cream-on-forest, same composition as the iOS icon but tiny.
  const bg = sharp(Buffer.from(solidSvg({ size: 64, color: FOREST_800 })));
  const mark = sharp(Buffer.from(logomarkSvg({ stroke: CREAM_50, padding: 18 })))
    .resize(64, 64);
  const buffer = await bg
    .composite([{ input: await mark.png().toBuffer() }])
    .png()
    .toBuffer();
  await sharp(buffer).toFile(outPath);
  console.log(`  → ${outPath}`);
}

async function main() {
  await mkdir(ASSETS, { recursive: true });
  console.log('Generating icons:');
  await makeIosIcon(join(ASSETS, 'icon.png'));
  await makeAdaptiveIcon(join(ASSETS, 'adaptive-icon.png'));
  await makeSplashIcon(join(ASSETS, 'splash-icon.png'));
  await makeFavicon(join(ASSETS, 'favicon.png'));
  console.log('\nDone. Re-run with `node scripts/generate-icons.mjs`.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
