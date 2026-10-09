/* global process, console */
// Führt die Zotero-Suite nacheinander für die installierte Zotero-Version und für
// jede Testversion in .zotero-versions/<version>/core/zotero.exe aus. Jeder Lauf geht
// über scripts/run-zotero-tests.mjs (eigenes Testprofil, nur diese Instanz wird beendet).
// Am Ende: Tabelle je Version und Exit-Code != 0, wenn eine Version rot ist oder
// kein Ergebnis liefert.
import { spawn } from "node:child_process";
import { existsSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(fileURLToPath(import.meta.url), "..", "..");
const wrapper = join(root, "scripts", "run-zotero-tests.mjs");
const versionsDir = join(root, ".zotero-versions");
const installedAppIni = join(
  process.env.LOCALAPPDATA || "",
  "Zotero",
  "app",
  "application.ini",
);

/** Version aus application.ini (installiert) oder aus dem Ordnernamen (Testversion). */
function installedVersion() {
  try {
    const ini = readFileSync(installedAppIni, "utf8");
    return ini.match(/^Version=(.+)$/m)?.[1].trim() ?? "installed";
  } catch {
    return "installed";
  }
}

const targets = [{ version: installedVersion(), bin: null }];
if (existsSync(versionsDir)) {
  for (const name of readdirSync(versionsDir).sort()) {
    const bin = join(versionsDir, name, "core", "zotero.exe");
    if (existsSync(bin)) targets.push({ version: name, bin });
  }
}

/** Startet den Testläufer für eine Version und reicht die Ausgabe durch. */
function runOne({ bin }) {
  const env = { ...process.env };
  if (bin) env.ZOTERO_PLUGIN_ZOTERO_BIN_PATH = bin;
  else delete env.ZOTERO_PLUGIN_ZOTERO_BIN_PATH;

  return new Promise((resolve) => {
    const child = spawn(process.execPath, [wrapper], { cwd: root, env });
    let out = "";
    const tee = (buf) => {
      const chunk = buf.toString();
      out += chunk;
      process.stdout.write(chunk);
    };
    child.stdout.on("data", tee);
    child.stderr.on("data", tee);
    child.on("exit", (code) => resolve({ code, out }));
  });
}

/**
 * Zählt aus der Zeile "Test run completed - N passed, M failed". Zotero nennt in dieser
 * Zeile keine übersprungenen Tests; die stehen als "ℹ <Titel> pending" in der Ausgabe.
 */
function parseResult(out) {
  const line = out.match(/Test run completed - ([^\n]*)/)?.[1];
  if (!line) return null;
  const count = (word) =>
    Number(line.match(new RegExp(`(\\d+) ${word}`))?.[1] ?? 0);
  return {
    passed: count("passed"),
    failed: count("failed"),
    pending: (out.match(/^\s*ℹ .* pending\s*$/gm) || []).length,
  };
}

// Der Scaffold leert nur das Datenverzeichnis, das Testprofil bleibt stehen. Beim
// Wechsel der Zotero-Version träfe die neue Version auf Startup-Cache, Erweiterungs-
// register und Versionsmarker der vorigen — das machte Läufe reihenfolgeabhängig
// (8.0.4 schlug nur direkt nach 7.0.32 fehl). Deshalb je Version ein frisches Profil.
// Nur dieser Ordner im Projekt wird gelöscht, nie das produktive Zotero-Profil.
const testProfile = join(root, ".scaffold", "test", "profile");

const rows = [];
for (const target of targets) {
  console.log(
    `\n=== Zotero ${target.version}${target.bin ? "" : " (installiert)"} ===`,
  );
  rmSync(testProfile, { recursive: true, force: true });
  const { code, out } = await runOne(target);
  const result = parseResult(out);
  rows.push({
    version: target.version,
    passed: result?.passed ?? "-",
    failed: result?.failed ?? "-",
    pending: result?.pending ?? "-",
    exit: code ?? "-",
    ok: result !== null && result.failed === 0 && code === 0,
  });
}

const cols = ["version", "passed", "failed", "pending", "exit"];
const width = (c) =>
  Math.max(c.length, ...rows.map((r) => String(r[c]).length));
const line = (r) => cols.map((c) => String(r[c]).padEnd(width(c))).join("  ");
console.log("\n" + line(Object.fromEntries(cols.map((c) => [c, c]))));
for (const r of rows) console.log(line(r));

const allOk = rows.every((r) => r.ok);
console.log(
  allOk
    ? "\nAlle Versionen ohne Fehler."
    : "\nMindestens eine Version hat Fehler.",
);
process.exit(allOk ? 0 : 1);
