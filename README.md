# FlexAnnotate

**Deutsch · [English](#english)**

Ein Zotero-Plugin für alle, die mit gedruckten Quellen arbeiten: Kommentare, Lehrbücher, Gesetzessammlungen. Es speichert Annotationen mit Seitenangabe auch ohne PDF, fügt in Word auf Wunsch nur den Nachweis ein, importiert Citavi-Zitate und ordnet Annotationen in einer Gliederung. Läuft mit Zotero 7.0 bis 10, Version 2.0.0.

![Hauptfenster: ein Buch ohne Datei, darunter die Print-Annotationen](docs/img/main-window.png)

## Deutsch

### Wozu das Ganze

Zotero hängt Annotationen an Dateien, also an PDFs, EPUBs oder Snapshots. Ein gedrucktes Buch hat keine Datei, und damit kann man dort keine Textstelle mit Seitenzahl festhalten. Dazu kommen zwei weitere Hürden: Word und LibreOffice fügen eine Annotation immer samt Zitattext ein, und Zoteros Citavi-Import wirft Zitate ohne PDF-Anker weg.

FlexAnnotate löst diese drei Dinge und bringt einen Organizer mit, der Annotationen nach Gliederungspunkten sortiert, ähnlich wie die Wissensorganisation in Citavi.

### Was es kann

**Gedruckte Quellen**

- **Print-Annotationen.** Rechtsklick auf einen Titel, _Print-Annotation hinzufügen…_, Text, Kommentar und Seite eintragen. Statt „Seite“ gehen auch Randnummer, Absatz, Spalte und andere Locator. Im Hintergrund legt das Plugin dafür einen Platzhalter-Anhang an.
- **Nur-Nachweis-Zitieren.** Beim Einfügen aus Word oder LibreOffice lässt sich der Zitattext weglassen. Dann steht im Dokument nur die Zitation mit Fundstelle. Umschalten geht im Zitierdialog oder dauerhaft in den Einstellungen.
- **Citavi-Import.** Zitate ohne Dateianhang bleiben erhalten und werden zu Print-Annotationen. Ein zweiter Import desselben Exports legt keine Doubletten an.

**Organizer**

- **Gliederung.** Überschriften beliebig verschachteln und Annotationen oder Werke per Drag and Drop darunter einsortieren. Es gibt eine Ansicht für Annotationen („Wissen“) und eine für Werke („Titel“).
- **Eine Gliederung je Sammlung.** Jede Hauptsammlung kann ihren eigenen Baum haben.
- **Word und LibreOffice.** Eine Gliederung aus einem `.docx` oder `.odt` importieren, oder die eigene Gliederung als Dokument mit nummerierten Überschriften exportieren und dort weiterschreiben.
- **Notiz-Export.** Die Gliederung mit allen zugeordneten Zitaten wird auf Wunsch zu einer Zotero-Notiz.

![Organizer mit Gliederung, Annotationsliste und Detailbereich](docs/img/organizer.png)

**Zitierdialog (ab Zotero 9)**

Im Annotationsbereich des Dialogs gibt es die Option „Nach Gliederung anordnen“. Links stehen die Überschriften mit Anzahl, in der Mitte die Annotationen. Schon zitierte Annotationen tragen einen grünen Haken. Die Suche oben filtert mit, und „Zitatstelle anzeigen“ öffnet den Reader an der richtigen Stelle.

![Zitierdialog mit Gliederungsansicht](docs/img/citation-dialog.png)

### Installation

1. Die `.xpi`-Datei von der [Release-Seite](https://github.com/justanotherjurastudent/zotero_flexAnnotations/releases) laden.
2. In Zotero _Werkzeuge → Plugins_ öffnen, auf das Zahnrad klicken und _Plugin aus Datei installieren…_ wählen.
3. Zotero neu starten, falls es danach fragt.

Selbst bauen (Node.js 24):

```bash
npm install
npm run build    # Ergebnis: .scaffold/build/flex-annotate.xpi
```

### Erste Schritte

1. **Print-Annotation anlegen:** Rechtsklick auf einen Titel ohne Datei, _Print-Annotation hinzufügen…_.
2. **Organizer öffnen:** der grüne Button links neben dem Sync-Button oben rechts, oder _Werkzeuge → FlexAnnotate: Organizer_.
3. **Gliederung füllen:** im Organizer mit dem Plus-Symbol Überschriften anlegen, dann Annotationen darauf ziehen.
4. **Aus Word zitieren:** in Word auf _Anmerkung hinzufügen_ klicken. Im Zitierdialog „Einfügen als“ wählen, wenn nur der Nachweis erscheinen soll.

Eine Gliederung aus einer Word-Datei zu holen ist ebenfalls kurz:

![Vorschau beim Gliederungsimport](docs/img/import-preview.png)

Im Organizer das Dokument-Symbol anklicken, die Datei wählen, in der Vorschau prüfen und _Importieren_ drücken. Es wird nur angehängt, nichts gelöscht.

### Mit welchen Zotero-Versionen

Getestet sind 7.0.32, 8.0.4, 9.0.6 und 10.0.5/10.0.6. Alles Wichtige läuft auf allen vier. Kleine Abweichungen:

- Vor Zotero 10 hat das Farbmenü der Eingabemaske nur Zoteros acht Standardfarben.
- Unter 7.x liegt der Menüeintrag direkt im Menü _Werkzeuge_ und nicht über Zoteros Menü-Verwaltung.
- Den Annotationsmodus im Zitierdialog gibt es erst ab Zotero 9. Auf 7 und 8 tut das Plugin dort nichts.

### Weiterlesen

- [Handbuch](docs/handbuch.md): Bedienung im Detail, Import und Export der Gliederung, Einstellungen, Versionsmatrix, Datenformat, bekannte Punkte
- [CHANGELOG](CHANGELOG.md)
- [Aufbau und Fallstricke](docs/architecture.md) und [Tests](docs/testing.md) für Entwickler, dazu [AGENTS.md](AGENTS.md)

### Lizenz und Herkunft

[AGPL-3.0-or-later](LICENSE). Der Organizer geht auf [Lattice](https://github.com/birugit/zotero-grounded-qa) von birugit zurück (AGPL-3.0-or-later). Print-Annotationen, Nur-Nachweis-Zitieren und Citavi-Import stammen vom Projektautor. Details in [NOTICE.md](NOTICE.md).

---

## English

### What it is for

Zotero attaches annotations to files: PDFs, EPUBs, snapshots. A printed book has no file, so you cannot save a passage with a page number. Two more problems: Word and LibreOffice always insert an annotation together with its quoted text, and Zotero's Citavi import throws away quotes that have no PDF anchor.

FlexAnnotate deals with all three. It also ships an Organizer that sorts annotations under outline headings, much like knowledge organisation in Citavi.

### What it does

**Printed sources**

- **Print annotations.** Right-click an item, _Add print annotation…_, then enter text, comment and page. Instead of "page" you can use margin number, paragraph, column and others. In the background the plugin creates a placeholder attachment to hold them.
- **Citation-only insertion.** When you insert from Word or LibreOffice, you can leave out the quoted text and get only the citation with the pinpoint. Switch it in the citation dialog, or permanently in the settings.
- **Citavi import.** Quotes without a file attachment are kept and become print annotations. Importing the same export again creates no duplicates.

**Organizer**

- **Outline.** Nest headings as deeply as you like and drag annotations or works under them. One view lists annotations ("Wissen"), another lists works ("Titel").
- **One outline per collection.** Every top-level collection can have its own tree.
- **Word and LibreOffice.** Import an outline from a `.docx` or `.odt`, or export your outline as a document with numbered headings and keep writing there.
- **Note export.** On request the outline with all assigned quotes becomes a Zotero note.

**Citation dialog (Zotero 9 and later)**

The annotations view of the dialog gets the option "Nach Gliederung anordnen" (arrange by outline). Headings with counts are on the left, annotations in the middle. Annotations you have already cited carry a green check. The search bar at the top filters the list too, and "Zitatstelle anzeigen" (show place) opens the reader at the passage.

The plugin's labels are in German and English, following Zotero's language.

### Install

1. Download the `.xpi` from the [Releases page](https://github.com/justanotherjurastudent/zotero_flexAnnotations/releases).
2. In Zotero open _Tools → Plugins_, click the gear and choose _Install Plugin From File…_.
3. Restart Zotero if it asks.

To build it yourself (Node.js 24):

```bash
npm install
npm run build    # result: .scaffold/build/flex-annotate.xpi
```

### Getting started

1. **Create a print annotation:** right-click an item without a file, _Add print annotation…_.
2. **Open the Organizer:** the green button left of the Sync button at the top right, or _Tools → FlexAnnotate: Organizer_.
3. **Build an outline:** add headings with the plus icon, then drag annotations onto them.
4. **Cite from Word:** click _Add Note_ in Word. In the citation dialog pick "Insert as" if you want only the citation.

Getting an outline out of a Word file is short too. Click the document icon in the Organizer, choose the file, check the preview and press _Import_. It only appends and deletes nothing.

### Supported Zotero versions

Tested: 7.0.32, 8.0.4, 9.0.6 and 10.0.5/10.0.6. All the main features work on all four. Small differences:

- Before Zotero 10 the colour menu of the input panel has only Zotero's eight standard colours.
- On 7.x the menu entry goes straight into the _Tools_ menu instead of through Zotero's menu manager.
- The annotations mode in the citation dialog exists only from Zotero 9. On 7 and 8 the plugin does nothing there.

### Further reading

- [User guide](docs/guide.md): detailed usage, outline import and export, settings, version matrix, data format, known issues
- [CHANGELOG](CHANGELOG.md)
- [Architecture and pitfalls](docs/architecture.md) and [testing](docs/testing.md) for developers, plus [AGENTS.md](AGENTS.md)

### License and origin

[AGPL-3.0-or-later](LICENSE). The Organizer derives from [Lattice](https://github.com/birugit/zotero-grounded-qa) by birugit (AGPL-3.0-or-later). Print annotations, citation-only insertion and the Citavi import are by the project author. Details in [NOTICE.md](NOTICE.md).
