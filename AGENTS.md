# AGENTS.md

## Projekt

FlexAnnotate ist ein Zotero-Plugin (TypeScript, zotero-plugin-scaffold, Version 2.0.0-dev.0, Addon-ID `flexannotate@justanotherjurastudent.github.io`, AGPL-3.0-or-later). Es vereint das frühere FlexAnnotate (Print-Annotationen, Nur-Nachweis-Zitieren, Citavi-Import; 1.2.0 liegt unter dem Git-Tag `pre-merge`) und Annotree (Organizer; Fork von Lattice). Ziel: Zotero 7 bis 10, entwickelt und getestet nur gegen **Zotero 10.0.5** (Per-User-Install unter `%LOCALAPPDATA%\Zotero`). Aufbau und Fallstricke: `docs/architecture.md`.

## Aufbau

```
src/core/           reine Logik ohne Zotero-Importe (Node-testbar)
src/shared/         Feature-Registry, assignChecked, Zitierdialog-Watcher
src/features/       print, citeOnly, citavi, reader, organizer
src/prefs/          Skript des Einstellungsfensters (eigenes Bundle)
src/utils/          Locale, Prefs, Menü-Registrierung, ztoolkit
src/hooks.ts        Feature-Liste und Lebenszyklus
addon/              manifest.json, prefs.js, content/ (XHTML, Icons), locale/{de,en-US}
test-unit/          Node-Tests der reinen Logik
test/               Mocha-Tests im echten Zotero
scripts/            Testläufer, Kill-Skript, Word-Rauchtest
docs/               architecture, testing, anchors, plan (historisch), lattice-changelog
```

## Befehle

```bash
npm run build         # zotero-plugin build + tsc --noEmit -> .scaffold/build/flex-annotate.xpi
npm run test:unit     # Node-Tests
npm run test:zotero   # Zotero-Tests, eigene Instanz, rund 15 s
npm run lint:check    # prettier --check . und eslint .
npm run lint:fix      # prettier --write . und eslint --fix
npm run verify        # lint:check, build, test:unit, test:zotero
npm start             # zotero-plugin serve (Entwicklung, Zugangsdaten in .env, siehe .env.example)
```

## Regeln

- **Nie das produktive Zotero oder Word anfassen.** Tests laufen im isolierten Profil `.scaffold/test/`; der Wrapper beendet nur diese Instanz. Kein Skript, das das Nutzer-Zotero, dessen Bibliothek oder ein laufendes Word verändert.
- **Zotero-Interna nur gegen den Quellcode prüfen**, nicht aus dem Gedächtnis. Referenz: `.zotero-reference/10.0.5/` (gitignored). Neu erzeugen aus der `omni.ja` der laufenden Installation:

  ```powershell
  $dst = "$env:TEMP\zotero-omni"
  Copy-Item "$env:LOCALAPPDATA\Zotero\app\omni.ja" "$dst.zip" -Force
  Expand-Archive "$dst.zip" $dst   # Quellcode unter $dst\chrome\content\zotero
  ```

  Neue Fundstellen mit Zeile in `docs/anchors.md` eintragen und die Version nennen.

- **Prototyp-Patches** nur mit `assignChecked` (`src/shared/patch.ts`): Ziel vorher prüfen, Ergebnis zurücklesen, Fehlschlag protokollieren, in `stop`/`removeFromWindow` zurücknehmen. Ein Patch braucht einen Nachweis (Test oder Quellstelle).
- **Reine Logik nach `src/core`** (keine Zotero-Globals, Importe mit `.ts`-Endung) und dort mit einem Node-Test in `test-unit/` absichern.
- **Zotero-Tests nur über `addon.api`** (siehe `src/hooks.ts`); Module nicht direkt importieren, sie brauchen das Global `ztoolkit`.
- **Neue Features** als `Feature` (`src/shared/feature.ts`) in `src/hooks.ts` eintragen: Globales in `start`/`stop`, DOM in `addToWindow`/`removeFromWindow`, beides idempotent.
- **Fensterzustand** gehört ans Element oder in eine `WeakMap` je Fenster, nicht ans Modulobjekt (`docs/architecture.md`, Fallstrick 11).
- **Menüs:** `Zotero.MenuManager` über `src/utils/menu.ts`; für Annotationen im Item-Baum DOM, weil Zotero dort keine Plugin-Menüs anwendet (`docs/architecture.md`, Fallstrick 10).
- **Urheberschaft:** Der Organizer basiert auf Lattice (birugit, AGPL-3.0-or-later). Lizenz- und Urheberhinweise erhalten, Herkunft in `NOTICE.md` pflegen. Keine Rechtsaussagen erfinden.
- **Kein Push, kein Release, kein Tag** ohne ausdrücklichen Auftrag. Commits nur auf Anweisung, im Format Conventional Commits (`feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:`).

## Konventionen

- Kommentare, Nutzertexte und diese Datei auf Deutsch; Bezeichner und Log-Ausgaben auf Englisch. `docs/architecture.md` ist englisch (technische Referenz).
- Lokalisierung: Fluent in `addon/locale/de` und `addon/locale/en-US` gleichzeitig pflegen; der Organizer hat seine Texte in `src/features/organizer/strings.ts`.
- Format: Prettier (`package.json`, 80 Zeichen, 2 Leerzeichen). Vor dem Abschluss `npm run lint:check`.
- Preference-Schlüssel liegen unter `extensions.flexannotate.` und sind für Nutzerdaten stabil; nicht umbenennen. Gleiches gilt für die Tags `#flexannotate-*`, `§Titel` und `★outline`.
- `strict_max_version` im Manifest ist auf Zotero 10 Pflicht; bei einer neuen Hauptversion anheben und neu prüfen.
- Doku im selben Änderungssatz wie der Code: `README.md`, `CHANGELOG.md`, bei Zotero-Interna `docs/anchors.md`.
