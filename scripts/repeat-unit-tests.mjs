/* global process, console */
// Führt die Unit-Tests mehrmals hintereinander aus (Standard: 10 Durchläufe),
// um Nicht-Determinismus und Flakiness frühzeitig abzufangen.
import { spawnSync } from "node:child_process";

const runs = Number(process.env.TEST_REPEAT_COUNT || 10);
console.log(`Führe Unit-Tests ${runs}-mal aus zur Flake-Prüfung...`);

for (let i = 1; i <= runs; i++) {
  const result = spawnSync("npm", ["run", "test:unit"], {
    shell: true,
    stdio: "inherit",
  });
  if (result.status !== 0) {
    console.error(`Fehler in Durchlauf ${i}/${runs}!`);
    process.exit(result.status || 1);
  }
}

console.log(
  `Alle ${runs} Durchläufe erfolgreich bestanden (100% deterministisch).`,
);
