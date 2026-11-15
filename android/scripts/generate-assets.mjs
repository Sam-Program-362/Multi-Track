/**
 * Builds the image sources @capacitor/assets needs from the existing logo.
 *
 *   node scripts/generate-assets.mjs
 *
 * Produces assets/icon-foreground.png, assets/icon-background.png,
 * assets/icon-only.png and assets/splash.png, which `npm run assets` then
 * expands into every Android density and adaptive-icon layer.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "assets");
const logo = join(root, "public", "logo.svg");
const BACKGROUND = "#05060f";

await mkdir(outDir, { recursive: true });

// The adaptive icon foreground is 108x108dp with only the middle 72x72dp
// visible, so the logo is rendered small and centred on a transparent canvas.
const foreground = await sharp(logo)
  .resize(620, 620, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
  .extend({
    top: 202,
    bottom: 202,
    left: 202,
    right: 202,
    background: { r: 0, g: 0, b: 0, alpha: 0 },
  })
  .png()
  .toBuffer();
await writeFile(join(outDir, "icon-foreground.png"), foreground);

await sharp({
  create: { width: 1024, height: 1024, channels: 4, background: BACKGROUND },
})
  .png()
  .toFile(join(outDir, "icon-background.png"));

// Legacy square / round launcher icon: the full logo on the app background.
const iconOnly = await sharp(logo)
  .resize(1024, 1024, { fit: "contain", background: BACKGROUND })
  .png()
  .toBuffer();
await writeFile(join(outDir, "icon-only.png"), iconOnly);

// Splash screen: logo centred on the same background.
const splashMark = await sharp(logo)
  .resize(700, 700, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
  .png()
  .toBuffer();
const splash = await sharp({
  create: { width: 2732, height: 2732, channels: 4, background: BACKGROUND },
})
  .composite([{ input: splashMark, gravity: "center" }])
  .png()
  .toBuffer();
await writeFile(join(outDir, "splash.png"), splash);

console.log("Wrote assets/icon-foreground.png, icon-background.png, icon-only.png, splash.png");