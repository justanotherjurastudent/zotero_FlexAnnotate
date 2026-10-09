# Changelog

Format nach [Keep a Changelog](https://keepachangelog.com/), Versionierung nach [SemVer](https://semver.org/). Der Changelog des Ursprungsprojekts Lattice liegt unverändert in [`docs/lattice-changelog.md`](docs/lattice-changelog.md).

## 2.0.0 (unreleased)

**Merged: Annotree is now part of FlexAnnotate.** Ein einziges TypeScript-Plugin (zotero-plugin-scaffold) ersetzt das Vanilla-JS-FlexAnnotate 1.2.0 (Git-Tag `pre-merge`) und Annotree. Geprüft gegen Zotero 7.0.32, 8.0.4, 9.0.6 und 10.0.5/10.0.6; Umfang je Version siehe README.

### Added

- Organizer (Gliederung, Zitierdialog-Ansicht, Notiz-Export) aus Annotree als Teil von FlexAnnotate.
- Toolbar-Button oben rechts neben dem Sync-Button, der den Organizer öffnet; Eintrag _Werkzeuge → FlexAnnotate: Organizer_.
- Icons in den Menüs (Hinzufügen, Bearbeiten, Löschen, Organizer).
- Zotero 7.x ohne `Zotero.MenuManager`: Eintrag _Werkzeuge → FlexAnnotate: Organizer_ direkt im Werkzeugmenü (`features/organizer/toolsMenuFallback.ts`).
- Gliederungsimport aus Word/LibreOffice: Button mit Dokument-Symbol in der Werkzeugleiste der Gliederung. Erkennt Überschriften-Formatvorlagen (`.docx`: „Überschrift/Heading 1–9“, benutzerdefinierte Vorlagen mit `outlineLvl`; `.odt`: `text:h`), zeigt eine Vorschau (neu, vorhanden, umbenannt; Option „Nummerierung aus Titeln entfernen“ nur bei erkannter Nummerierung) und hängt an, ohne etwas zu löschen oder zu verschieben. Gleiche Titel unter gleichem Elternknoten werden wiederverwendet, Duplikate heißen „Titel (2)“. Grenzen: nur Absatz-Formatvorlagen, Fußnoten und gelöschte Änderungen fehlen im Titel, kein `.doc`/`.rtf`, 50 MB je XML-Eintrag (`features/organizer/docImport.ts`, `core/docOutline.ts`).
- Zitierdialog aus Word: Die rechte Spalte behält mit und ohne Gliederungsansicht die native Breite (vorher feste 330 px). Die Suchleiste des Dialogs filtert die Gliederungsliste mit (gespiegelt ins Filterfeld des Plugins, nicht umgekehrt). Neuer Knopf „Zitatstelle anzeigen“ in der Vorschau öffnet den Reader an der Annotation und holt Zotero nach vorn; der Dialog bleibt offen.
- Citavi-Import: Dublettenprüfung. Ein zweiter Import desselben Exports legt nichts neu an; gleich sind Platzhalter (Werk), Seitenlabel und normalisierter Zitattext, bei leerem Text Seitenlabel und Kommentar.
- Plugin-Icon (Buch mit Textmarker).
- `npm run test:versions`: Zotero-Suite nacheinander für die installierte Version und alle Testversionen in `.zotero-versions/` (frisches Testprofil je Version).
- `npm run screenshots` und `npm run screenshots:docs`: Fensteraufnahmen aus den Zotero-Tests, kuratierte Bilder nach `docs/img/`.
- Neue Struktur: `src/core` (reine Logik), `src/shared`, `src/features/{print,citeOnly,citavi,reader,organizer}`; 181 Node-Unit-Tests und Zotero-Tests (letzter Lauf: 66 bestanden auf 10.0.6 und 9.0.6, 60 auf 7.0.32, 58 auf 8.0.4; Rest übersprungen, siehe `docs/testing.md`).

### Fixed

- Datenverlust: Die Gliederungsnotiz wurde als markierte Notiz angelegt, sodass Zoteros Notiz-Editor sie öffnete und spätere Speicherungen des Organizers mit seinem älteren Stand überschreiben konnte (`editorInstance.js` `_save`). Sie wird jetzt mit `skipSelect: true` angelegt. Hat der Nutzer die Notiz selbst im Editor geöffnet, kann der Editor weiter überschreiben. Gibt es mehrere Gliederungsnotizen, gewinnt die zuletzt geänderte, bei Gleichstand die mit der höheren id (`pickNewest`).
- Citavi-Import: Die Schlagwort-Zuordnung verglich Präfixe (K1 traf K10). Im `OnetoN`-Text ist das erste Glied die ID des Eintrags, danach folgen die Schlagwörter; die Zuordnung ist jetzt exakt.
- Print-Annotationen auf Zotero 7.x bis 9.x: die Farbauswahl nutzte `Zotero.Annotations.COLORS`, das es erst ab 10.x gibt. Jetzt Fallback auf die acht Standardfarben (`core/printAnnotation.ts`).

### Changed

- Ein gemeinsames Einstellungsfenster _FlexAnnotate_ statt zweier getrennter.
- Zitierdialog: ein gemeinsamer Fenster-Watcher mit Injectoren für Modus-Auswahl und Gliederungsansicht.
- Menüs über `Zotero.MenuManager`; Bearbeiten/Löschen für Annotationen im Item-Baum bleiben DOM-basiert, weil Zotero bei Annotationsauswahl keine Plugin-Menüs anwendet.
- Dokumentation (`README.md`, `docs/`, `AGENTS.md`) neu gefasst und gekürzt.

### Removed

- Startup-Popup.
- Annotree-Fallback-Tag `annotree:locator=<typ>`: Annotree wurde nie veröffentlicht, es gibt keine Daten, die ihn brauchen.
- Der Build mit PowerShell-Skripten (`tools/`); gebaut wird mit `npm run build`.

### Migration

- Preference-Schlüssel `extensions.flexannotate.*` sind unverändert; Nutzerdaten von 1.x (Tags `#flexannotate-locator-<typ>`, `#flexannotate-default-locator-<typ>`, `#flexannotate-placeholder`, Platzhalter-Anhänge, Print-Annotationen) gelten weiter.
- Gliederungsdaten (`§Titel`, Notiz `★outline` mit `LATTICE-OUTLINE-V1`) bleiben mit Lattice kompatibel.
- Bekannte Einschränkungen: siehe README, Abschnitte „Einschränkungen auf Zotero-Versionen vor 10“ und „Bekannte Punkte“.

## [0.2.4] – 2026-10-06

### Hinzugefügt

- Zitierdialog aus Word: Der grüne Haken lässt sich von Hand entfernen oder setzen, per Klick auf den Haken (bei markierten Zeilen für die ganze Markierung) oder mit dem Knopf in der Vorschau. Die Korrektur wird je Dokument gespeichert.

## [0.2.3] – 2026-10-06

### Geändert

- Das Feld „Stellentyp“ heißt „Locator“; ein Klick öffnet die Liste der Locator-Typen (wie bei FlexAnnotate nach Bezeichnung sortiert). Geändert wird nur der Locator dieser einen Annotation, Seitenzahlen anderer Annotationen bleiben unberührt (per Test belegt).
- Mehr Luft über der Sammlungsauswahl.
- Zitierdialog aus Word: Enter fügt die markierte Annotation zur Zitation hinzu (ein zweites Enter bestätigt den Dialog), die Pfeiltasten bewegen die Markierung.

### Behoben

- Zwei schnell aufeinanderfolgende Änderungen der Gliederung (z. B. Umbenennen, dann Verschieben) konnten sich beim Speichern gegenseitig überschreiben; Speichervorgänge laufen jetzt der Reihe nach.

### Dokumentation

- README: Abschnitt „Zu prüfen“ (Verfolgung zitierter Annotationen; Zusammenlegung mit FlexAnnotate).

## [0.2.2] – 2026-10-06

### Behoben

- Die Sammlungsauswahl im Organizer öffnet jetzt ihre Liste (eigenes Aufklappmenü statt `<select>`, dessen Popup in diesem Fenster nicht erscheint).
- Eine offene Umbenennung endet jetzt, sobald irgendwo außerhalb des Feldes die Maus gedrückt wird (Speichern bei gültiger Änderung, sonst Zurücksetzen), nicht nur bei einem Blur-Ereignis.
- Zitierdialog aus Word: Die drei Spalten bleiben innerhalb der Fensterbreite, auch bei sehr langen Zitaten (die Mindestbreite der Zeilen drückte das Layout auseinander).
- Der grüne Haken für zitierte Annotationen wartet auf die Liste der im Dokument zitierten Werke, die Zotero erst nach dem Öffnen des Dialogs lädt; vorher wurde sie leer gelesen und alle Einträge galten als nicht zitiert.

## [0.2.1] – 2026-10-06

### Geändert

- Stellentyp kompatibel mit FlexAnnotate: Gelesen werden `#flexannotate-locator-<typ>` (Annotation) und `#flexannotate-default-locator-<typ>` (Dokument-Standard am Anhang). Wo diese Tags in Gebrauch sind, ändert Annotree sie nach denselben Regeln wie FlexAnnotate (automatisches Tag, keins bei „Seite“ ohne abweichenden Standard) und legt kein eigenes Tag an; ein vorhandenes eigenes Tag wird dabei abgelöst. Ohne FlexAnnotate-Tags bleibt es beim privaten Tag `annotree:locator=<typ>`.

## [0.2.0] – 2026-10-06

### Hinzugefügt

- Zitatstelle öffnen springt zur genauen Annotation im Reader (öffnet den Tab oder wechselt in den offenen).
- Auswahl der Sammlung (und Untersammlungen), aus der die Einträge stammen; Standard ist die im Hauptfenster gewählte Sammlung.
- Bearbeiten von Zitattext, Kommentar, Zitatstelle und Stellentyp im Organizer.
- Tastaturbedienung (Entf, F2, Strg+Pfeile, Pfeiltasten, Strg+A).
- Farbige, kräftigere Symbole in der Gliederungsleiste (Papierkorb als Papierkorb); Plugin-Icon (Baum aus feinen Linien).
- Zitierdialog aus Word: drei Spalten (Kategorien mit Anzahl · Annotationen · Zitatvorschau), grüner Haken für bereits zitierte Annotationen. Gemerkt wird je Dokument beim Bestätigen des Dialogs; gültig, solange das Werk im Dokument noch zitiert ist (nutzt von Zotero ohnehin geladene Daten, kein zusätzliches Auslesen des Dokuments).
- Zotero-Testläufer `scripts/run-zotero-tests.mjs`, der sofort endet, sobald das Ergebnis vorliegt (rund 15 Sekunden).

### Geändert

- Doppelklick auf eine Überschrift benennt sofort um; ein Klick auf eine andere Überschrift beendet die Bearbeitung (Speichern bei gültiger Änderung, sonst Zurücksetzen).
- „Entwurf als Notiz“ heißt jetzt „Als Notiz exportieren“, mit Erklärung; die Notiz wird danach angezeigt.
- Die Scroll-Position der Spalten bleibt beim Neuzeichnen erhalten.

### Behoben

- Die Gliederungsnotiz wurde als leer gelesen, nachdem Zotero sie beim erneuten Speichern von `<pre><code>` auf `<pre>` umgeschrieben hatte.
- Untersammlungen fehlten in der Sammlungsauswahl (`Collections.getByLibrary` braucht `recursive = true`).

## [0.1.0] – 2026-10-06

Erste Fassung von Annotree, abgeleitet von Lattice 4.1.0 (birugit, AGPL-3.0-or-later, siehe `NOTICE.md`).

### Hinzugefügt

- Dreispaltiges Organizer-Fenster (Gliederung · einzeilige Einträge · Details) mit den Tabs **Wissen** (Annotationen) und **Titel** (Werke).
- Mehrfachauswahl (Strg, Umschalt, alle markieren) und Drag and Drop auf Gliederungsknoten; Zuweisungsleiste mit Tippfilter und dauerhaft sichtbarer Suchleiste.
- Dezimalnummern der Gliederung (nur zur Anzeige berechnet), Sammelknoten „(Alle)“ und „(Ohne Kategorie)“, „Gehe zu …“, Zwischentitel-Gruppierung.
- Option **„Nach Gliederung anordnen (Annotree)“** in der Annotationsansicht des Zitierdialogs, der sich aus Word öffnet.
- Einstellung „Werke hinter den Annotationen mitanzeigen“.
- Reine Logik unter `src/core/` mit Node-Unit-Tests; Zotero-Integrationstests im isolierten Test-Profil; Word-Rauchtest.
- Oberflächentexte auf Deutsch und Englisch.

### Entfernt

- KI-Komponente (Fragen und Antworten über PDFs, LLM-Anbindungen, API-Schlüssel) und die Ideen-Ebene.
- Chinesische Sprachdatei, Lattice-Beschreibungen und -Bildschirmfotos der KI-Funktionen.

### Geändert

- Name, Plugin-ID (`annotree@justanotherjurastudent.github.io`), Einstellungs-Präfix (`extensions.zotero.annotree`) und Dokumentation.
- Anpassung an Zotero 10.
- Datenformat unverändert kompatibel mit Lattice (Tag `§Titel`, Gliederungsnotiz `★outline`).
