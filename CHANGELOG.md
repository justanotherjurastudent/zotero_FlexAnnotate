# Changelog

Format nach [Keep a Changelog](https://keepachangelog.com/), Versionierung nach [SemVer](https://semver.org/). Der Changelog des Ursprungsprojekts Lattice liegt unverändert in [`docs/lattice-changelog.md`](docs/lattice-changelog.md).

## 2.0.0 (2026-10-12)

**Annotations-Überarbeitung.** Annotationen lassen sich nachträglich bearbeiten (Locator, Seite, Kommentar), ein neuer Organizer ordnet sie in einer Gliederung, und der Zitierdialog arbeitet mit ihr. FlexAnnotate ist dafür komplett in TypeScript (zotero-plugin-scaffold) neu aufgebaut; 1.2.0 war Vanilla JS (Git-Tag `pre-merge`). Geprüft gegen Zotero 7.0.32, 8.0.4, 9.0.6 und 10.0.5/10.0.6; Umfang je Version siehe README.

### Added

- Organizer (Gliederung, Zitierdialog-Ansicht, Notiz-Export); basiert auf Lattice, siehe `NOTICE.md`.
- Kategorienbaum pro Hauptsammlung: Jede Sammlung auf oberster Ebene kann einen eigenen Gliederungsbaum haben. Wechsel über das Sammlungs-Drop-down im Organizer (Untersammlung zeigt den Baum der Hauptsammlung, aber nur deren Einträge) oder über den neuen Eintrag _Rechtsklick auf Sammlung → FlexAnnotate: Organizer für diese Sammlung_. Beim ersten Öffnen einer Sammlung ohne eigenen Baum fragt der Organizer einmal, ob der bestehende Bibliotheksbaum als Anfang übernommen werden soll; die Zuordnung Notiz→Sammlung liegt im Tag `#flexannotate-outline-<collectionKey>` (`core/collections.ts`, `features/organizer/outlineModel.ts`, `organizerState.ts`, `collectionMenu.ts`).
- Verwaiste Überschriften-Tags: Wurde eine Überschrift auf einem Rechner ohne Plugin umbenannt, zeigt der Organizer unter dem Baum den Knopf _Verwaiste Tags (n)_. Das Fenster listet nur die Tags (ohne Einträge) und ordnet jedes einer Überschrift zu oder entfernt es (`organizerOrphans.ts`, `core/outline.ts` `orphanHeadingTags`).
- Hinweis „auch in Baum: …“ an einer Kategorie, wenn das Werk in mehreren Hauptsammlungen liegt und die Überschrift dort ebenfalls existiert.
- Zitierdialog: Hat die gewählte Sammlung noch keinen Kategorienbaum, steht unter der Auswahl ein Hinweis, den Baum im Organizer anzulegen.
- Notizen gelöschter Sammlungen bleiben als Waisen liegen (Tag `#flexannotate-outline-<key>`); sie stören nicht und werden bewusst nicht automatisch gelöscht, falls die Sammlung nur im Papierkorb oder auf einem anderen Rechner noch gebraucht wird.
- Zitierdialog aus Word: Das Gliederungs-Drop-down über dem Kategorienbaum wählt, aus welcher Sammlung die Kategorien kommen (Gesamte Bibliothek oder Hauptsammlung); die Liste wird passend gefiltert und die letzte Wahl als Pref `dialogOutlineCollection` gemerkt (`features/organizer/dialogOutline.ts`).
- Zitierdialog aus Word: Der Gliederungsbaum zeigt wie der Organizer auch „(Ohne Kategorie)“. Annotationen, die keiner Überschrift zugeordnet sind, erscheinen dort statt weggelassen zu werden; „(Alle)“ enthält sie auf Wunsch mit. Beim Wechsel der Sammlung wird der Name im Drop-down sofort nachgezogen (`logic/dialogView.ts`, `dialogOutline.ts`, `dialogOutlineRender.ts`).
- Toolbar-Button oben rechts neben dem Sync-Button, der den Organizer öffnet; Eintrag _Werkzeuge → FlexAnnotate: Organizer_.
- Icons in den Menüs (Hinzufügen, Bearbeiten, Löschen, Organizer).
- Zotero 7.x ohne `Zotero.MenuManager`: Eintrag _Werkzeuge → FlexAnnotate: Organizer_ direkt im Werkzeugmenü (`features/organizer/toolsMenuFallback.ts`).
- Gliederungsimport aus Word/LibreOffice: Button mit Dokument-Symbol in der Werkzeugleiste der Gliederung. Erkennt Überschriften-Formatvorlagen (`.docx`: „Überschrift/Heading 1–9“, benutzerdefinierte Vorlagen mit `outlineLvl`; `.odt`: `text:h`), zeigt eine Vorschau (neu, vorhanden, umbenannt; mehrstufige Nummerierung `1`, `1.1` …; Option „Nummerierung aus Titeln entfernen“ nur bei erkannter Nummerierung) und hängt an, ohne etwas zu löschen oder zu verschieben. Gleiche Titel unter gleichem Elternknoten werden wiederverwendet, Duplikate heißen „Titel (2)“. Gesperrte Dateien (anderes Programm hält die Datei offen) bekommen eine eigene Meldung statt „kein gültiges Dokument“, alte `.doc`-Dateien einen Hinweis, sie als `.docx` zu speichern. Grenzen: nur Absatz-Formatvorlagen, Fußnoten und gelöschte Änderungen fehlen im Titel, kein `.doc`/`.rtf`, 50 MB je XML-Eintrag (`features/organizer/docImport.ts`, `core/docOutline.ts`).
- Gliederungsexport als Word/ODT: Button in der Gliederungsleiste schreibt die Überschriften als `.docx` oder `.odt` mit den Standard-Formatvorlagen („Überschrift/Heading 1–9“) und einer mehrstufigen, automatischen Nummerierung („1“, „1.1“ …), die in Word/LibreOffice mitläuft (`features/organizer/docExport.ts`, `core/docExport.ts`). Ist die Zieldatei geöffnet oder schreibgeschützt, schlägt das Schreiben mit einer Meldung fehl, statt die Datei zu beschädigen; der Dateidialog fragt vor dem Überschreiben.
- Organizer-Fußzeile: _Import_, _Export_ (Word/ODT) und _Notiz_ stehen als drei Knöpfe mit Icon in einer Zeile unter dem Baum (vorher Import/Export als Icons in der Werkzeugleiste, „Als Notiz exportieren“ als breiter Knopf mit Erklärtext); die Beschreibung erscheint als Tooltip.
- Organizer-Fensterverwaltung als Single-Instance: Menü und Toolbar-Button fokussieren und stellen ein bereits geöffnetes Organizer-Fenster wieder her, statt Duplikate zu öffnen; das offene Fenster schließt sauber beim Entladen des Plugins (`features/organizer/organizer.ts`).
- Zitierdialog aus Word: Die rechte Spalte behält mit und ohne Gliederungsansicht die native Breite (vorher feste 330 px). Die Suchleiste des Dialogs filtert die Gliederungsliste mit (gespiegelt ins Filterfeld des Plugins, nicht umgekehrt). Neuer Knopf „Zitatstelle anzeigen“ in der Vorschau öffnet den Reader an der Annotation und holt Zotero nach vorn; der Dialog bleibt offen.
- Citavi-Import: Dublettenprüfung. Ein zweiter Import desselben Exports legt nichts neu an; gleich sind Platzhalter (Werk), Seitenlabel und normalisierter Zitattext, bei leerem Text Seitenlabel und Kommentar.
- Neues Plugin-Icon (Sprechblase mit Gliederung) für Plugin und Organizer-Button.
- `npm run test:versions`: Zotero-Suite nacheinander für die installierte Version und alle Testversionen in `.zotero-versions/` (frisches Testprofil je Version).
- `npm run screenshots` und `npm run screenshots:docs`: Fensteraufnahmen aus den Zotero-Tests, kuratierte Bilder nach `docs/img/`.
- Neue Struktur: `src/core` (reine Logik), `src/shared`, `src/features/{print,citeOnly,citavi,reader,organizer}`; 214 Node-Unit-Tests und Zotero-Tests (80 bestanden auf 10.0.6 und 9.0.6, 74 auf 7.0.32, 72 auf 8.0.4; der Rest ist je Version übersprungen, siehe `docs/testing.md`).

### Fixed

- Umbenennen, Löschen und Export einer Überschrift wirken nur auf die Werke der Hauptsammlung des aktiven Baums statt bibliotheksweit (gleichnamige Überschriften in zwei Bäumen blieben sonst gekoppelt). Der Bibliotheksbaum bleibt uneingeschränkt.
- Beim Wechsel der Sammlung oder über das Kontextmenü passen Eintrags-Filter, Dropdown und Baum jetzt zusammen; Wechsel laufen nacheinander (keine doppelte Baum-Notiz).
- Zitierdialog: eine gelöschte Sammlung in der gemerkten Wahl fällt auf „Gesamte Bibliothek“ zurück.
- Datenverlust: Die Gliederungsnotiz wurde als markierte Notiz angelegt, sodass Zoteros Notiz-Editor sie öffnete und spätere Speicherungen des Organizers mit seinem älteren Stand überschreiben konnte (`editorInstance.js` `_save`). Sie wird jetzt mit `skipSelect: true` angelegt. Hat der Nutzer die Notiz selbst im Editor geöffnet, kann der Editor weiter überschreiben. Gibt es mehrere Gliederungsnotizen, gewinnt die zuletzt geänderte, bei Gleichstand die mit der höheren id (`pickNewest`).
- Citavi-Import: Die Schlagwort-Zuordnung verglich Präfixe (K1 traf K10). Im `OnetoN`-Text ist das erste Glied die ID des Eintrags, danach folgen die Schlagwörter; die Zuordnung ist jetzt exakt.
- Print-Annotationen auf Zotero 7.x bis 9.x: die Farbauswahl nutzte `Zotero.Annotations.COLORS`, das es erst ab 10.x gibt. Jetzt Fallback auf die acht Standardfarben (`core/printAnnotation.ts`).

### Changed

- Struktur: Reine Logik liegt jetzt je Feature in `src/features/<feature>/logic/`; `src/core/` enthält nur noch, was mehrere Features teilen (`locator`, `printDialog`, `labelPopup`). Organizer-Dateien sind in `panel/`, `dialog/`, `doc/` und `logic/` gegliedert. Pfadangaben in den Einträgen oben nennen noch den früheren Ort.
- Aufgeräumt: ungenutzter Annotations-Digest-Export, `copyDraft`, `clearPref`, die verwaiste Wurzel-`prefs.js`, die historische `docs/plan.md` und `renovate.json` (Dependabot bleibt).
- README kurz und zweisprachig; Details im [Handbuch](docs/handbuch.md) und [User guide](docs/guide.md).
- Gliederungsimport: Bei aktiver Option „Nummerierung aus Titeln entfernen“ werden auch bestehende Gliederungsknoten mit manueller Nummerierung im Titel wiederverwendet, auf den bereinigten Titel aktualisiert und zugehörige Tags via `OutlineModel.renameTag()` migriert (`core/docOutline.ts`, `features/organizer/docImport.ts`).
- Fokusbehandlung: Nach dem Schließen von Datei- und Bestätigungsdialogen beim Gliederungsimport und -export kehrt der Fensterfokus zuverlässig zum Organizer zurück.
- Toast-Benachrichtigungen im Organizer: Aktionsschaltflächen auf eigener Zeile, klickbare Nachrichtenzeile und Begrenzung auf sichtbare Bildschirmränder (`features/organizer/organizerDom.ts`).
- Ein gemeinsames Einstellungsfenster _FlexAnnotate_ statt zweier getrennter.
- Zitierdialog: ein gemeinsamer Fenster-Watcher mit Injectoren für Modus-Auswahl und Gliederungsansicht.
- Menüs über `Zotero.MenuManager`; Bearbeiten/Löschen für Annotationen im Item-Baum bleiben DOM-basiert, weil Zotero bei Annotationsauswahl keine Plugin-Menüs anwendet.
- Dokumentation (`README.md`, `docs/`, `AGENTS.md`) neu gefasst und gekürzt.

### Removed

- Startup-Popup.
- Der Build mit PowerShell-Skripten (`tools/`); gebaut wird mit `npm run build`.

### Migration

- Preference-Schlüssel `extensions.flexannotate.*` sind unverändert; Nutzerdaten von 1.x (Tags `#flexannotate-locator-<typ>`, `#flexannotate-default-locator-<typ>`, `#flexannotate-placeholder`, Platzhalter-Anhänge, Print-Annotationen) gelten weiter.
- Gliederungsdaten (`§Titel`, Notiz `★outline` mit `LATTICE-OUTLINE-V1`) bleiben mit Lattice kompatibel.
- Bekannte Einschränkungen: siehe [Handbuch](docs/handbuch.md), Abschnitte „Einschränkungen auf Zotero-Versionen vor 10“ und „Bekannte Punkte“.
