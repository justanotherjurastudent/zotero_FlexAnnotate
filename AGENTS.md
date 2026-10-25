# AGENTS.md

## Projekt

FlexAnnotate ist ein Zotero-Plugin (TypeScript, zotero-plugin-scaffold, Version 2.0.0, Addon-ID `flexannotate@justanotherjurastudent.github.io`, AGPL-3.0-or-later). Es bietet Print-Annotationen, Nur-Nachweis-Zitieren, Citavi-Import und einen Organizer (Fork von Lattice); 1.2.0 liegt unter dem Git-Tag `pre-merge`. Ziel: Zotero 7.0 bis 10. Entwickelt gegen **Zotero 10.0.5/10.0.6** (Per-User-Install unter `%LOCALAPPDATA%\Zotero`); die Testsuite läuft zusätzlich gegen 7.0.32, 8.0.4 und 9.0.6 (`npm run test:versions`). Was vor Zotero 10 fehlt, steht im README. Aufbau und Fallstricke: `docs/architecture.md`.

## Aufbau

```
src/core/           reine Logik, die mehrere Features teilen (Locator, Eingabemaske, Seitenzahl-Popup)
src/shared/         Feature-Registry, assignChecked, Zitierdialog-Watcher
src/features/       print, citeOnly, citavi, reader, organizer; je Feature `logic/` = reine Logik ohne Zotero-Importe (Node-testbar)
src/prefs/          Skript des Einstellungsfensters (eigenes Bundle)
src/utils/          Locale, Prefs, Menü-Registrierung, ztoolkit
src/hooks.ts        Feature-Liste und Lebenszyklus
addon/              manifest.json, prefs.js, content/ (XHTML, Icons), locale/{de,en-US}
test-unit/          Node-Tests der reinen Logik
test/               Mocha-Tests im echten Zotero
scripts/            Testläufer (ein Lauf, mehrere Versionen), Screenshots, Kill-Skript, Word-Rauchtest
docs/               architecture, testing, anchors, handbuch (de), guide (en), img/ (README-Bilder), lattice-changelog
```

## Befehle

```bash
npm run build         # zotero-plugin build + tsc --noEmit -> .scaffold/build/flex-annotate.xpi
npm run test:unit     # Node-Tests
npm run test:zotero   # Zotero-Tests, eigene Instanz, rund 15 s
npm run test:versions # dieselbe Suite für die installierte Version und .zotero-versions/* (frisches Profil je Version)
npm run screenshots   # Zotero-Tests mit Fensteraufnahmen nach .scaffold/screenshots
npm run screenshots:docs # wie screenshots, kuratierte PNGs nach docs/img/
npm run lint:check    # prettier --check . und eslint .
npm run lint:fix      # prettier --write . und eslint --fix
npm run verify        # lint:check, build, test:unit, test:zotero
npm start             # zotero-plugin serve (Entwicklung, Zugangsdaten in .env, siehe .env.example)
```

## Regeln

- **Nie das produktive Zotero oder Word anfassen.** Tests laufen im isolierten Profil `.scaffold/test/` (`test:versions` löscht davon `profile/` je Version); der Wrapper beendet nur diese Instanz. Kein Skript, das das Nutzer-Zotero, dessen Bibliothek oder ein laufendes Word verändert.
- **Zotero-Interna nur gegen den Quellcode prüfen**, nicht aus dem Gedächtnis. Referenz: `.zotero-reference/<version>/` (gitignored; vorhanden: 7.0.32, 8.0.4, 9.0.6, 10.0.1, 10.0.5). Neu erzeugen aus der `omni.ja` der laufenden Installation (für andere Versionen aus `.zotero-versions/<version>/core/` entsprechend):

  ```powershell
  $dst = "$env:TEMP\zotero-omni"
  Copy-Item "$env:LOCALAPPDATA\Zotero\app\omni.ja" "$dst.zip" -Force
  Expand-Archive "$dst.zip" $dst   # Quellcode unter $dst\chrome\content\zotero
  ```

  Neue Fundstellen mit Zeile in `docs/anchors.md` eintragen und die Version nennen. Was nur auf einer Version nachgeschlagen wurde, als solches kennzeichnen.

- **Weitere Zotero-Versionen** liegen als entpackte Installer in `.zotero-versions/<version>/` (gitignored, nicht installiert; Beschaffung in `docs/testing.md`). Neue Funktionen auf 7.x bis 9.x prüfen und, wo sie fehlen, mit Funktionserkennung statt Versionsvergleich umgehen (Beispiele: `src/features/print/logic/printAnnotation.ts` `annotationColors`, `features/organizer/toolsMenuFallback.ts`).
- **Bilder in `docs/img/`** nur über `npm run screenshots:docs` erzeugen, nicht von Hand ändern; die README bindet sie ein.

- **Prototyp-Patches** nur mit `assignChecked` (`src/shared/patch.ts`): Ziel vorher prüfen, Ergebnis zurücklesen, Fehlschlag protokollieren, in `stop`/`removeFromWindow` zurücknehmen. Ein Patch braucht einen Nachweis (Test oder Quellstelle).
- **Reine Logik** nach `src/features/<feature>/logic/` (nur wenn mehrere Features sie brauchen: `src/core`); keine Zotero-Globals, Importe mit `.ts`-Endung, und mit einem Node-Test in `test-unit/` absichern.
- **Zotero-Tests nur über `addon.api`** (siehe `src/hooks.ts`); Module nicht direkt importieren, sie brauchen das Global `ztoolkit`.
- **Neue Features** als `Feature` (`src/shared/feature.ts`) bzw. `DialogInjector` (`src/shared/citationDialog.ts`) in `src/features/registry.ts` eintragen (nicht direkt in `hooks.ts`); jedes Feature sowie jede runtime-gegatete Unterfunktion muss als `FeatureGate` in `src/features/gates.ts` definiert sein (ggf. mit `requires: [...]` für abhängige Einstiegspunkte) und im Node-Test `test-unit/featureGates.test.ts` abgedeckt werden. Globales in `start`/`stop`, DOM in `addToWindow`/`removeFromWindow`, beides idempotent.
- **Fensterzustand** gehört ans Element oder in eine `WeakMap` je Fenster, nicht ans Modulobjekt (`docs/architecture.md`, Fallstrick 11).
- **Menüs:** `Zotero.MenuManager` über `src/utils/menu.ts`; für Annotationen im Item-Baum DOM, weil Zotero dort keine Plugin-Menüs anwendet (`docs/architecture.md`, Fallstrick 10).
- **Urheberschaft:** Der Organizer basiert auf Lattice (birugit, AGPL-3.0-or-later). Lizenz- und Urheberhinweise erhalten, Herkunft in `NOTICE.md` pflegen. Keine Rechtsaussagen erfinden.
- **Kein Push, kein Release, kein Tag** ohne ausdrücklichen Auftrag. Commits nur auf Anweisung, im Format Conventional Commits (`feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:`).

## Konventionen

- Kommentare und Code-Dokumentation auf Englisch (technische Lesbarkeit, konsistent projektübergreifend); Nutzertexte (UI/Locales) und diese Datei auf Deutsch; Bezeichner und Log-Ausgaben auf Englisch. `docs/architecture.md` ist englisch (technische Referenz). Deutsch bleibt in Doku und Handbüchern (`docs/`, `README.md`) erlaubt.
- Lokalisierung: Fluent in `addon/locale/de` und `addon/locale/en-US` gleichzeitig pflegen; der Organizer hat seine Texte in `src/features/organizer/strings.ts`.
- Format: Prettier (`package.json`, 80 Zeichen, 2 Leerzeichen). Vor dem Abschluss `npm run lint:check`.
- Preference-Schlüssel liegen unter `extensions.flexannotate.` und sind für Nutzerdaten stabil; nicht umbenennen. Gleiches gilt für die Tags `#flexannotate-*`, `§Titel` und `★outline`.
- `strict_max_version` im Manifest ist auf Zotero 10 Pflicht; bei einer neuen Hauptversion anheben und neu prüfen.
- Doku im selben Änderungssatz wie der Code: `README.md`, `CHANGELOG.md`, bei Zotero-Interna `docs/anchors.md`, bei Fallstricken `docs/architecture.md`.
- Die README-Funktionsmatrix für Zotero vor 10 nur aus Testläufen (`npm run test:versions`) ableiten und nach jeder Änderung an einem Rückfall nachziehen.

<!-- OPENWIKI:START -->

## OpenWiki

This repository has a generated `openwiki/` evidence index. It is optional just-in-time context, not required startup reading.

- Do not enumerate, preload, or search wikis at task start. Use retrieval when the user asks for it, when unfamiliar architecture or dependency behavior materially affects the task, or when source inspection leaves an important uncertainty. Stop once the question is grounded.
- When those conditions apply and OpenWiki retrieval tools are available, use `openwiki_search` for just-in-time context and `openwiki_read` for the relevant complete sections. If search returns `workspace_required`, ask which listed workspace to use and retry with its ID.
- Use `openwiki_list_workspaces` or `openwiki_list_wikis` when workspace membership itself needs to be discovered.
- If the retrieval tools are unavailable, read `openwiki/quickstart.md` and follow its links to the relevant pages.
- Treat source code and tests as authoritative. A brief's unknowns and review items are verification gaps, not automatic requirements.
- Prefer the narrowest quiet validation that proves the changed behavior. Preserve complete failure output.

The scheduled OpenWiki GitHub Actions workflow refreshes the repository wiki. Do not hand-edit generated OpenWiki pages unless explicitly asked; prefer updating source code/docs and letting OpenWiki regenerate.

<!-- OPENWIKI:END -->
