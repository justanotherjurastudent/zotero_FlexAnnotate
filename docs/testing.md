# Tests

Annotree prüft sich auf drei Ebenen. Alle laufen lokal, ohne das produktive Zotero oder Word anzufassen.

## 1. Node-Unit-Tests (`npm run test:unit`)

Ordner `test-unit/`. Testen die reine Logik unter `src/core/` (keine Zotero-Importe): Gliederungsbaum, Dezimalnummern, Gruppierung, Auswahlregeln, Aufbau der Zitierdialog-Ansicht. Node 24 führt `.ts` direkt aus, deshalb enden Importe in `src/core` auf `.ts`.

## 2. Zotero-Tests (`npm run test:zotero`)

Ordner `test/`, Mocha im echten Zotero über `zotero-plugin-scaffold`.

- Das Gerüst startet eine **eigene Zotero-Instanz** mit eigenem Profil (`.scaffold/test/profile`), eigenem Datenordner (`.scaffold/test/data`) und dem Port 23124. Das produktive Zotero und seine Bibliothek bleiben unberührt.
- Lauf und Beenden: `npm run test:zotero` startet `scripts/run-zotero-tests.mjs`. Der Wrapper setzt `ZOTERO_PLUGIN_KILL_COMMAND` auf `scripts/kill-test-zotero.ps1`, erkennt „Test run completed“ im Ausgabestrom und beendet **sofort nur** die Test-Instanz (Prozesse, deren Befehlszeile `.scaffold/test` enthält). Ohne den Wrapper bliebe `zotero-plugin test` nach dem Ergebnis bis zum Abbruch stehen; ein Lauf dauert so rund 15 Sekunden. Obergrenze: `ANNOTREE_TEST_LIMIT_MS` (Standard 90000).
- Testdaten sind synthetisch (Werk, verlinkte PDF-Datei, Annotationen) und werden danach gelöscht.
- Abgedeckt: Zeilen laden, mehrere Einträge in einem Zug zuordnen, Werke zuordnen, Gliederungsnotiz lesen und schreiben, Organizer-Fenster (drei Spalten, Suchleiste außerhalb des Scrollbereichs, Mehrfachauswahl mit Umschalttaste, Drag and Drop), **Zitierdialog** (echtes `citationDialog.xhtml` mit einem Dialogobjekt wie in `Zotero.Integration.Session.cite`): Option sichtbar, drei Spalten mit Überschriften und Anzahl, Vorschau, Einfügen über Zoteros eigenen Weg, grüner Haken für zitierte Annotationen (mit Gültigkeitsprüfung), Einstellung „Werke mitanzeigen“. Organizer: Doppelklick-Umbenennen und Blur-Verhalten, Tastatur, Sammlungsauswahl, Bearbeiten, Export, Zitatstelle öffnen (Reader-Aufruf mit `{annotationID}`).
- Bildschirmfotos der Fenster landen in `.scaffold/test/shots/` (nicht versioniert).

## 3. Word-Rauchtest (`scripts/word-smoke.ps1`)

Startet eine **eigene, unsichtbare Word-Instanz** (nur deren Prozess wird beendet), prüft, dass `Zotero.dotm` geladen ist, und beendet sie wieder. Das laufende Word wird nicht angefasst, es wird kein Dokument geöffnet.

**Grenze:** Ein vollständiger Durchlauf „Word-Schaltfläche → Zitierdialog → Einfügen“ braucht die laufende Zotero-Instanz des Nutzers (die Word-Anbindung spricht mit ihr) und würde deren Bibliothek berühren. Das wird nicht automatisiert. Stattdessen wird der Dialog selbst (Ebene 2) mit dem echten Zotero-Fenster geprüft; der Weg von Word bis zum Öffnen des Dialogs ist unverändertes Zotero.
