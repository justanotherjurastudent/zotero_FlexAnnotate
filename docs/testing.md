# Tests

## Inhalt

- [Befehle](#befehle)
- [Strategie](#strategie)
- [Zotero-Tests im Detail](#zotero-tests-im-detail)
- [Grenzen](#grenzen)

## Befehle

| Befehl                  | Wirkung                                                                                                                          |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `npm run test:unit`     | Node-Tests in `test-unit/` (`node --test`), kein Zotero nötig                                                                    |
| `npm run test:zotero`   | Mocha-Tests in `test/` in einer eigenen Zotero-Instanz (läuft rund 15 s)                                                         |
| `npm run test:versions` | wie `test:zotero`, nacheinander für die installierte Version und jede Testversion in `.zotero-versions/*`; Tabelle und Exit-Code |
| `npm run lint:check`    | `prettier --check .` und `eslint .`                                                                                              |
| `npm run build`         | `zotero-plugin build` und `tsc --noEmit`                                                                                         |
| `npm run verify`        | `lint:check`, `build`, `test:unit`, `test:zotero` nacheinander                                                                   |

Stand bei der Erstellung dieser Datei (2026-10-09): 119 Unit-Tests und 50 Zotero-Tests, alle bestanden.

## Strategie

- Reine Logik gehört nach `src/core` und wird in `test-unit/` mit Node getestet. Node 24 führt `.ts` direkt aus, deshalb enden die Importe in `src/core` auf `.ts`. Keine Zotero-Globals in diesen Dateien.
- Verhalten, das Zotero braucht (Items, Tags, Menüs, Fenster, Patches), wird in `test/` geprüft, im echten Zotero über zotero-plugin-scaffold und Mocha.
- Zotero-Tests sprechen das Plugin nur über `addon.api` an (belegt in `src/hooks.ts`), nie über direkte Modulimporte: Module greifen auf das Global `ztoolkit` zu, das es im Testkontext nur über das Plugin gibt.
- Die Zotero-Tests laufen in einem isolierten Profil unter `.scaffold/test/` (eigener Datenordner, Standardport des Scaffolds 23124). Das produktive Zotero und seine Bibliothek bleiben unberührt; Word wird nicht gestartet.
- Testdaten sind synthetisch (`test/helpers.ts`: Werke, verlinkte PDF-Datei, Annotationen) und werden nach den Läufen gelöscht.
- Neue Logik: zuerst als reine Funktion in `src/core` mit Unit-Test. Nur was ohne Zotero nicht prüfbar ist, bekommt einen Zotero-Test.

## Zotero-Tests im Detail

`npm run test:zotero` startet `scripts/run-zotero-tests.mjs`. Der Wrapper

- setzt `ZOTERO_PLUGIN_ZOTERO_BIN_PATH` auf `%LOCALAPPDATA%\Zotero\zotero.exe`, falls nicht gesetzt,
- setzt `ZOTERO_PLUGIN_KILL_COMMAND` auf `scripts/kill-test-zotero.ps1`, das nur Prozesse beendet, deren Befehlszeile `.scaffold/test` enthält,
- erkennt „Test run completed“ im Ausgabestrom und beendet die Testinstanz sofort (`zotero-plugin test` bliebe sonst bis zum Abbruch stehen),
- bricht nach `FLEXANNOTATE_TEST_LIMIT_MS` Millisekunden ab (Standard 90000).

Die Testdateien in `test/` decken: Start und Feature-Lebenszyklus, Einstellungen, Print-Annotationen (Platzhalter, Eingabemaske, Menüs), Nur-Nachweis-Patch und Modus-Auswahl, Citavi-Import, Reader-Menü (nur An- und Abmelden), Organizer (Daten, Fenster, Toolbar-Button, Zitierdialog-Ansicht).

Bildschirmfotos der Testfenster landen in `.scaffold/test/shots/` (nicht versioniert).

`scripts/word-smoke.ps1` startet eine eigene, unsichtbare Word-Instanz, prüft, dass `Zotero.dotm` geladen ist, und beendet sie. Es öffnet kein Dokument und berührt das laufende Word nicht.

## Grenzen

Nicht automatisch getestet:

- **Reader-Fenster:** Kontextmenü, Seitenzahl-Popup und Locator-Anzeige im Reader. Getestet ist nur, dass sich das Reader-Menü an- und abmeldet.
- **Echter Word-Lauf:** Der Weg „Word-Schaltfläche → Zitierdialog → Einfügen“ braucht das laufende Zotero des Nutzers und würde dessen Bibliothek berühren. Getestet wird der Zitierdialog selbst mit dem echten Zotero-Fenster und einem Dialogobjekt wie in `Zotero.Integration.Session.cite`.
- **Echter Citavi-Translator:** Die Tests benutzen synthetische Fixtures. Das Format `PageRange` (`<os>`/`<nt>`) ist daher nur gegen Fixtures belegt.
- **Dark Mode:** Darstellung der Toolbar- und Menü-Icons und des Reader-Popups nur per Code-Review.
- **Zotero 7 bis 9:** Es gibt keinen Lauf gegen eine andere Version als 10.0.5.
