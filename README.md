# Annotree

**Annotationen und Werke nach der Gliederung der eigenen Arbeit ordnen – wie das Wissen-Tab von Citavi, aber in Zotero.**

Annotree ist ein Zotero-Plugin (Zotero 7–10). Es zeigt alle Annotationen einer Bibliothek in einem dreispaltigen Fenster, ordnet sie per Drag and Drop Überschriften zu und stellt diese Gliederung auch im Zitierdialog bereit, der sich aus Word öffnet.

> **Herkunft:** Annotree ist ein Fork von [Lattice](https://github.com/birugit/zotero-grounded-qa) (Autor: birugit, AGPL-3.0-or-later). Die KI-Komponente wurde entfernt, Oberfläche und Word-Anbindung sind neu. Einzelheiten und Lizenzpflichten: [`NOTICE.md`](NOTICE.md). _Citavi_ ist eine Marke ihres Inhabers; Annotree steht in keiner Verbindung dazu.

## Funktionen

- **Organizer-Fenster** (Menü _Werkzeuge → Annotree: Organizer_) mit drei Spalten:
  1. **Gliederung** mit den Sammelknoten _(Alle)_ und _(Ohne Kategorie)_, Zählern, Dezimalnummern (1, 1.1, 1.2.3), Pfeil-Schaltflächen (nach oben/unten, tiefer/höher), Umbenennen, Löschen und „Gehe zu …“.
  2. **Einträge einzeilig**, mit durchgehend sichtbarer Suchleiste und Zuweisungsleiste (Überschrift tippen, Enter) – auch bei sehr langen Listen muss nie nach unten gescrollt werden. Optional gruppiert nach Zwischentiteln.
  3. **Details** mit Zitat, Kommentar, Quellenangabe samt Seite, Kategorien (entfernbar), „Öffnen“ und „Zitat kopieren“.
- **Zwei Tabs wie in Citavi:** _Wissen_ (Annotationen) und _Titel_ (Werke). Beide lassen sich Überschriften zuordnen.
- **Mehrfachauswahl** (Strg, Umschalt, Strg+A) und **Drag and Drop** auf einen Gliederungsknoten.
- **Tastatur:** Entf löscht die Überschrift (in der Liste: entfernt die Markierten aus der Kategorie), F2 oder Doppelklick benennt um, Strg+↑/↓ verschiebt, Strg+→/← rückt ein oder aus, Pfeiltasten navigieren, Strg+A markiert alle Einträge.
- **Sammlung wählen:** Standardmäßig die im Zotero-Hauptfenster gewählte Sammlung samt Untersammlungen; im Organizer lässt sich eine andere Sammlung, eine einzelne Untersammlung oder die ganze Bibliothek wählen.
- **Zitatstelle öffnen:** springt im Reader zur genauen Annotation (öffnet den Tab oder wechselt in den schon offenen).
- **Bearbeiten:** Zitattext, Kommentar, Zitatstelle und Stellentyp (Seite, Kapitel, Abschnitt …) einer Annotation. Der Stellentyp wird als privates Tag `annotree:locator=<typ>` gespeichert.
- **Als Notiz exportieren:** legt eine neue Zotero-Notiz mit allen Überschriften in Reihenfolge und darunter den zugeordneten Zitaten samt Quellenangabe an.
- **Zitierdialog aus Word:** Die Ansichten _Titel_, _Annotationen_ und _Notizen_ von Zotero bleiben. In der Annotationsansicht gibt es zusätzlich die Option **„Nach Gliederung anordnen (Annotree)“**. Dann zeigt der Dialog drei Spalten: links die Überschriften mit der Anzahl der Annotationen, in der Mitte die Annotationen der gewählten Überschrift (grüner Haken = in diesem Dokument bereits zitiert), rechts das Zitat mit Kommentar und Quelle. „+“, Doppelklick oder die Schaltfläche fügen ein, über Zoteros eigenen Weg.
- **Einstellung** (_Zotero → Einstellungen → Annotree_): _Werke hinter den Annotationen mitanzeigen_. Aus (Standard): nur die der Kategorie zugewiesenen Annotationen (wie der Wissen-Tab in Citavi). An: auch die Annotationen von Werken, die der Kategorie zugeordnet sind.

## So ist es gespeichert

Es gibt keine eigene Datenbank, alles liegt in Zotero und synchronisiert mit:

| Was                 | Wo                                                                                                    |
| ------------------- | ----------------------------------------------------------------------------------------------------- |
| Überschrift         | Tag `§Titel` an der Annotation oder am Werk                                                           |
| Gliederung (Baum)   | JSON in einer eigenen Notiz mit dem Tag `★outline` (Kennung `LATTICE-OUTLINE-V1`, lesbar für Lattice) |
| Nummern (1.2.3)     | werden nur zur Anzeige berechnet, nie gespeichert                                                     |
| Fremde Annotationen | in Gruppenbibliotheken schreibgeschützt, werden übersprungen                                          |

Überschriften sind eindeutig, weil jede ein Tag ist. Umbenennen schreibt das Tag an allen betroffenen Einträgen um.

## Installation und Entwicklung

```powershell
npm install
npm run build        # .scaffold/build/*.xpi
npm run test:unit    # Node-Tests der reinen Logik (src/core)
npm run test:zotero  # Zotero-Tests im isolierten Test-Profil
```

Die Test-Pipeline (isoliertes Profil, sicheres Beenden, Word-Rauchtest) steht in [`docs/testing.md`](docs/testing.md), die verwendeten Zotero-Interna mit Fundstellen in [`docs/anchors.md`](docs/anchors.md).

## Lizenz

AGPL-3.0-or-later, siehe [`LICENSE`](LICENSE) und [`NOTICE.md`](NOTICE.md).
