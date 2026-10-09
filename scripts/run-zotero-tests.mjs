/* global process, console, setTimeout */
// Runs the Zotero integration tests and returns as soon as they are done.
//
// `zotero-plugin test` prints "Test run completed" but keeps the Zotero test
// instance (and itself) alive until it is closed. This wrapper watches the
// output, stops ONLY the test instance (scripts/kill-test-zotero.ps1 matches
// the scaffold test profile, never the user's own Zotero) and exits with the
// result of the run.
import { spawn, spawnSync } from "node:child_process";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(fileURLToPath(import.meta.url), "..", "..");
const killScript = join(root, "scripts", "kill-test-zotero.ps1");
const killCommand = `powershell -NoProfile -File "${killScript}"`;
const limitMs = Number(process.env.ANNOTREE_TEST_LIMIT_MS || 90_000);

const env = {
  ...process.env,
  ZOTERO_PLUGIN_ZOTERO_BIN_PATH:
    process.env.ZOTERO_PLUGIN_ZOTERO_BIN_PATH ||
    join(process.env.LOCALAPPDATA || "", "Zotero", "zotero.exe"),
  ZOTERO_PLUGIN_KILL_COMMAND: killCommand,
};

const child = spawn("npx", ["zotero-plugin", "test"], {
  cwd: root,
  env,
  shell: true,
});

let failed = null;
let done = false;
let text = "";

const stopTestInstance = () =>
  spawnSync(killCommand, { shell: true, stdio: "ignore" });

const finish = (code) => {
  if (done) return;
  done = true;
  stopTestInstance();
  setTimeout(() => process.exit(code), 300);
};

const onData = (buf) => {
  const chunk = buf.toString();
  process.stdout.write(chunk);
  text += chunk;
  const m = text.match(/Test run completed - ([^\n]*)/);
  if (m && failed === null) {
    failed = /\b[1-9]\d* failed/.test(m[1]);
    finish(failed ? 1 : 0);
  }
};
child.stdout.on("data", onData);
child.stderr.on("data", onData);
child.on("exit", (code) =>
  finish(failed === null ? (code ?? 1) : failed ? 1 : 0),
);

setTimeout(() => {
  console.error(`\nTimed out after ${limitMs / 1000}s without a result.`);
  finish(2);
}, limitMs);
