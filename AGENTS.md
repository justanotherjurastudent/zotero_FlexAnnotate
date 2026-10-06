# AGENTS.md – Annotree

Zotero-Plugin (Zotero 7–10) zum Ordnen von Annotationen und Werken nach der Gliederung einer eigenen Arbeit. Fork von Lattice (birugit, AGPL-3.0-or-later, siehe `NOTICE.md`).

## Aufbau

- `src/core/` – **reine Logik ohne Zotero-Importe** (Gliederungsbaum, Nummern, Gruppierung, Auswahl, Zitierdialog-Ansicht). Importe enden auf `.ts`, damit Node sie direkt testen kann.
- `src/modules/` – Zotero-nahe Schicht: `organizer.ts` (Fenster), `organizerData.ts` (Zeilen, Zuordnung), `outlineModel.ts` (Tags, Gliederungsnotiz), `citationDialogPatch.ts` (Zitierdialog aus Word), `annotationIndex.ts`, Export.
- `src/utils/strings.ts` – Texte des Organizer-Fensters (de/en); Menüs und Einstellungen über Fluent unter `addon/locale/`.
- `test-unit/` Node-Tests · `test/` Zotero-Tests (Mocha im echten Zotero) · `scripts/` Test- und Hilfsskripte.

## Datenmodell (nicht ändern, ohne Lattice-Kompatibilität zu prüfen)

Überschrift = Tag `§Titel` an Annotation **oder** Werk. Gliederung = JSON in einer Notiz mit Tag `★outline` (Kennung `LATTICE-OUTLINE-V1`). Nummern werden berechnet, nie gespeichert. Titel sind eindeutig, weil jede Überschrift ein Tag ist.

## Befehle

| Zweck                                | Befehl                   |
| ------------------------------------ | ------------------------ |
| Bauen + Typprüfung                   | `npm run build`          |
| Node-Tests                           | `npm run test:unit`      |
| Zotero-Tests (isoliertes Profil)     | `npm run test:zotero`    |
| Lint/Format                          | `npm run lint:check`     |
| Alles                                | `npm run verify`         |
| Word-Rauchtest (eigene Word-Instanz) | `scripts/word-smoke.ps1` |

## Regeln

1. **Nie das produktive Zotero oder Word anfassen.** Zotero-Tests nur über `npm run test:zotero` (eigenes Profil, Port 23124, sicheres Beenden). Nie `taskkill /im zotero.exe`.
2. **Nichts über Zotero-Interna aus dem Gedächtnis.** Quelle prüfen (`%LOCALAPPDATA%\Zotero\app\omni.ja` ist eine ZIP-Datei) und in `docs/anchors.md` mit Fundstelle eintragen.
3. Keine Prototypen von Zotero umhängen; Ergänzungen am Zitierdialog nur als DOM-Elemente, beim Beenden entfernen (`CitationDialogPatch.stop()`).
4. Reine Logik gehört nach `src/core/` und bekommt einen Node-Test; Verhalten im Fenster bekommt einen Zotero-Test.
5. Fremde Annotationen (Gruppenbibliotheken) sind schreibgeschützt: überspringen, nicht fehlschlagen.
6. Kein Massen-Umschreiben von Tags ohne Bestätigung; Umbenennen geht über `OutlineModel.renameTag`.
7. Conventional Commits; kein `git push`, kein Release ohne ausdrücklichen Auftrag.
8. Urheberschaft bleibt sichtbar: `NOTICE.md`, Lizenzköpfe und Git-Historie von Lattice nicht entfernen.
