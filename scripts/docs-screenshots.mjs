/* global process, console */
// Runs `npm run screenshots` and copies the curated PNGs into docs/img/.
// Exits non-zero if the screenshot run fails or a curated file is missing.
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(fileURLToPath(import.meta.url), "..", "..");
const srcDir = join(root, ".scaffold", "screenshots");
const dstDir = join(root, "docs", "img");
const CURATED = [
  "organizer.png",
  "citation-dialog.png",
  "citation-dialog-native.png",
  "citation-dialog-place.png",
  "citation-dialog-search.png",
  "preferences.png",
  "main-window.png",
  "toolbar.png",
  "import-preview.png",
];
const WARN_BYTES = 250 * 1024;

const run = spawnSync("npm run screenshots", {
  cwd: root,
  shell: true,
  stdio: "inherit",
});
if (run.status !== 0) {
  console.error(`screenshots failed (exit ${run.status ?? "signal"})`);
  process.exit(run.status || 1);
}

mkdirSync(dstDir, { recursive: true });
let missing = 0;
for (const name of CURATED) {
  const src = join(srcDir, name);
  if (!existsSync(src)) {
    console.error(`missing: ${src}`);
    missing++;
    continue;
  }
  copyFileSync(src, join(dstDir, name));
  const kb = statSync(src).size / 1024;
  console.log(`${name.padEnd(28)} ${kb.toFixed(1).padStart(8)} KB`);
  if (kb * 1024 > WARN_BYTES) {
    console.warn(`warning: ${name} is larger than 250 KB`);
  }
}

if (missing) {
  console.error(`${missing} curated screenshot(s) missing`);
  process.exit(1);
}
console.log(`copied ${CURATED.length} files to ${dstDir}`);
