# Tests

## Inhalt

- [Befehle](#befehle)
- [Strategie](#strategie)
- [Zotero-Tests im Detail](#zotero-tests-im-detail)
- [Mehrere Zotero-Versionen](#mehrere-zotero-versionen)
- [Bildschirmfotos](#bildschirmfotos)
- [Grenzen](#grenzen)

## Befehle

| Befehl                     | Wirkung                                                                                                                          |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `npm run test:unit`        | Node-Tests in `test-unit/` (`node --test`), kein Zotero nötig                                                                    |
| `npm run test:zotero`      | Mocha-Tests in `test/` in einer eigenen Zotero-Instanz (läuft rund 15 s)                                                         |
| `npm run test:versions`    | wie `test:zotero`, nacheinander für die installierte Version und jede Testversion in `.zotero-versions/*`; Tabelle und Exit-Code |
| `npm run screenshots`      | wie `test:zotero`, zusätzlich laufen die Aufnahmen aus `test/screenshots.test.ts`; PNGs nach `.scaffold/screenshots/`            |
| `npm run screenshots:docs` | `screenshots`, danach werden die kuratierten Bilder nach `docs/img/` kopiert (`scripts/docs-screenshots.mjs`)                    |
| `npm run lint:check`       | `prettier --check .` und `eslint .`                                                                                              |
| `npm run build`            | `zotero-plugin build` und `tsc --noEmit`                                                                                         |
| `npm run verify`           | `lint:check`, `build`, `test:unit`, `test:zotero` nacheinander                                                                   |

Stand 2026-10-09: 181 Unit-Tests, alle bestanden (`npm run test:unit` zum Zeitpunkt der Doku-Überarbeitung ausgeführt). Zotero-Tests laut letztem `test:versions`-Lauf: 66 bestanden auf 10.0.6 und 9.0.6, 60 auf 7.0.32, 58 auf 8.0.4, jeweils ohne Fehler; die übrigen Tests sind übersprungen (pending), siehe [Mehrere Zotero-Versionen](#mehrere-zotero-versionen). Diese Zotero-Zahlen wurden beim Schreiben der Doku nicht neu erzeugt.

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
- bricht nach `FLEXANNOTATE_TEST_LIMIT_MS` Millisekunden ab (Standard 240000; die Suite ist auf älteren Zotero-Versionen langsamer).

Die Testdateien in `test/` decken: Start und Feature-Lebenszyklus, Einstellungen, Print-Annotationen (Platzhalter, Eingabemaske, Menüs), Nur-Nachweis-Patch und Modus-Auswahl, Citavi-Import (u. a. exakte Schlagwörter, Dubletten), Reader-Menü (nur An- und Abmelden), Werkzeugmenü-Rückfall, Organizer (Daten, Fenster, Toolbar-Button, Zitierdialog-Ansicht mit Suche und „Zitatstelle anzeigen“) und den Gliederungsimport (`docImport.test.ts`, Fixtures in `docFixtures.ts`; die reine Logik in `test-unit/docOutline.test.ts`).

`scripts/word-smoke.ps1` startet eine eigene, unsichtbare Word-Instanz, prüft, dass `Zotero.dotm` geladen ist, und beendet sie. Es öffnet kein Dokument und berührt das laufende Word nicht.

## Mehrere Zotero-Versionen

`npm run test:versions` (`scripts/run-versions.mjs`) führt `scripts/run-zotero-tests.mjs` nacheinander aus für

- die installierte Version (aus `%LOCALAPPDATA%\Zotero\app\application.ini`) und
- jede Version in `.zotero-versions/<version>/core/zotero.exe`. Geprüft wurden 7.0.32, 8.0.4 und 9.0.6.

Die Binaries in `.zotero-versions/` sind entpackte Installer, nicht installiert, und per `.gitignore` ausgeschlossen. So beschaffst du eine Version:

```powershell
$v = "9.0.6"
Invoke-WebRequest "https://download.zotero.org/client/release/$v/Zotero-${v}_x64_setup.exe" -OutFile "$env:TEMP\zotero-$v-setup.exe"
7z x "-o.zotero-versions/$v" "$env:TEMP\zotero-$v-setup.exe"
# die App liegt danach unter .zotero-versions/9.0.6/core/
```

Jede Version bekommt ein frisches Testprofil: Der Scaffold leert nur das Datenverzeichnis, das Profil bliebe sonst bei einem Versionswechsel mit Startup-Cache und Erweiterungsregister der vorigen Version stehen, und die Läufe hingen von der Reihenfolge ab (8.0.4 schlug nur direkt nach 7.0.32 fehl). Das Skript löscht dafür `.scaffold/test/profile` vor jedem Lauf, nie ein produktives Profil.

Am Ende steht eine Tabelle mit `version`, `passed`, `failed`, `pending`, `exit`; der Exit-Code ist 1, wenn eine Version Fehler hat oder kein Ergebnis liefert. Übersprungene Tests (pending) zählt das Skript aus den `ℹ … pending`-Zeilen, weil Zotero sie in der Ergebniszeile nicht nennt. Übersprungen wird, was es auf der Version nicht gibt: die Tests mit Annotationsmodus im Zitierdialog (`hasAnnotationDialog()` in `test/helpers.ts`, erst ab Zotero 9; `features.test.ts`, `modeSelector.test.ts`) und der Befehlstest des Werkzeugmenü-Rückfalls, sobald `Zotero.MenuManager` vorhanden ist (`toolsMenu.test.ts`).

## Bildschirmfotos

`npm run screenshots` setzt `FLEXANNOTATE_SCREENSHOTS=1`; `test/screenshots.test.ts` macht dann Aufnahmen der Testfenster mit `drawWindow` (`test/screenshot.ts`) nach `.scaffold/screenshots/`. `npm run screenshots:docs` kopiert die kuratierten Dateien nach `docs/img/` (Liste `CURATED` in `scripts/docs-screenshots.mjs`) und warnt bei Dateien über 250 KB. `drawWindow` erfasst nur das Fenster selbst: Popups und Menüs erscheinen nicht. Die Aufnahmen laufen im Testprofil mit synthetischen Daten, nie im produktiven Zotero.

## Grenzen

Nicht automatisch getestet:

- **Reader-Fenster:** Kontextmenü, Seitenzahl-Popup und Locator-Anzeige im Reader. Getestet ist nur, dass sich das Reader-Menü an- und abmeldet.
- **Echter Word-Lauf:** Der Weg „Word-Schaltfläche → Zitierdialog → Einfügen“ braucht das laufende Zotero des Nutzers und würde dessen Bibliothek berühren. Getestet wird der Zitierdialog selbst mit dem echten Zotero-Fenster und einem Dialogobjekt wie in `Zotero.Integration.Session.cite`.
- **Echter Citavi-Translator:** Die Tests benutzen synthetische Fixtures. Das Format `PageRange` (`<os>`/`<nt>`) ist daher nur gegen Fixtures belegt.
- **Dark Mode:** Darstellung der Toolbar- und Menü-Icons und des Reader-Popups nur per Code-Review.
- **Andere Patchversionen:** Gelaufen sind nur 7.0.32, 8.0.4, 9.0.6 und 10.0.5/10.0.6. Zwischenversionen sind nicht geprüft.
- **Zitierdialog vor Zotero 9:** Der Annotationsmodus fehlt dort; die Tests dafür sind übersprungen, nicht bestanden.
- **Dateiauswahl des Gliederungsimports:** Der Test übergibt die Datei direkt an `docImport.importFromFile`; der native Dialog (`FilePicker`) ist nicht automatisch getestet.
