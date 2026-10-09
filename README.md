# FlexAnnotate

**Sprache / Language: [Deutsch](#deutsch) · [English](#english)**

Zotero-Plugin für gedruckte Quellen: Annotationen ohne Datei, Nur-Nachweis-Zitieren, Citavi-Import und ein Organizer (Gliederung) für Annotationen. Version 2.0.0-dev.0, Zotero 7 bis 10 (entwickelt und getestet nur gegen Zotero 10.0.5).

## Deutsch

### Inhalt

[Wozu](#wozu) · [Funktionen](#funktionen) · [Installation](#installation) · [Bedienung](#bedienung) · [Einstellungen](#einstellungen) · [Daten und Kompatibilität](#daten-und-kompatibilität) · [Bekannte Punkte](#bekannte-punkte) · [Entwicklung](#entwicklung) · [Lizenz und Herkunft](#lizenz-und-herkunft)

### Wozu

Zotero legt Annotationen nur unter einem Dateianhang (PDF, EPUB, Snapshot) ab. Wer mit gedruckten Büchern, Kommentaren oder Gesetzessammlungen arbeitet, hat dort keine Datei und kann Textstellen samt Seitenangabe nicht als Annotation festhalten. Außerdem setzt Zotero Annotationen in Word und LibreOffice immer mit Zitattext ein, und Zoteros Citavi-Import verwirft Zitate ohne PDF-Anker.

FlexAnnotate füllt diese Lücken und bringt einen Organizer mit, der Annotationen in einer Gliederung ordnet (Wissensorganisation wie in Citavi). Seit 2.0.0 sind das frühere FlexAnnotate und Annotree ein einziges Plugin.

### Funktionen

#### Gedruckte Quellen

- **Print-Annotationen:** Annotationen mit eigener Seitenangabe und wählbarem Locator (Seite, Randnummer, Absatz …) für Titel ohne Dateianhang. Technisch hängen sie an einem automatisch angelegten Platzhalter-Anhang. Bearbeiten und Löschen per Kontextmenü; Locator und Kommentar lassen sich auch an PDF-/EPUB-Annotationen im Reader ändern.
- **Nur-Nachweis-Zitieren:** Beim Einfügen von Annotationen aus Word oder LibreOffice wahlweise nur die Zitation mit Fundstelle, ohne Zitattext. Umschaltbar im Zitierdialog („Einfügen als“) und in den Einstellungen.
- **Citavi-Import:** Zitate ohne Dateianhang, die Zoteros Importer verwirft, werden als Print-Annotationen angelegt. Beiträge werden mit ihrem Hauptwerk verknüpft.

#### Organizer

- **Gliederung:** Überschriften (beliebig verschachtelt, Dezimalnummern nur zur Anzeige) ordnen Annotationen und Werke per Drag and Drop oder Zuweisungsleiste. Tabs „Wissen“ (Annotationen) und „Titel“ (Werke), Auswahl der Sammlung, Bearbeiten von Zitattext, Kommentar, Zitatstelle und Locator, Tastaturbedienung.
- **Zitierdialog-Ansicht:** Im Zitierdialog aus Word zeigt die Option „Nach Gliederung anordnen (FlexAnnotate)“ drei Spalten: Überschriften mit Anzahl, Annotationen, Vorschau. Ein grüner Haken markiert bereits zitierte Annotationen.
- **Export:** „Als Notiz exportieren“ legt eine Zotero-Notiz mit der Gliederung und den zugeordneten Zitaten an. „Zitatstelle öffnen“ springt zur Annotation im Reader.

Die Dateien in `doc/` stammen aus der Dokumentation von Lattice und zeigen nicht mehr den heutigen Stand (u. a. die entfernte Ideen-Ebene); sie sind deshalb hier nicht eingebunden.

### Installation

Fertiges XPI: [Releases](https://github.com/justanotherjurastudent/zotero_flexAnnotations/releases) (2.0.0 ist noch nicht veröffentlicht). In Zotero: _Werkzeuge → Plugins → Zahnrad → Plugin aus Datei installieren…_.

Selbst bauen (Node.js 24 wurde verwendet):

```bash
npm install
npm run build     # -> .scaffold/build/flex-annotate.xpi
```

Zotero muss mindestens Version 7.0 haben (Manifest); die Menüs nutzen `Zotero.MenuManager` und brauchen eine entsprechend neue Version, siehe [Bekannte Punkte](#bekannte-punkte).

### Bedienung

| Wo                                                | Was                                                                                |
| ------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Rechtsklick auf einen Titel                       | _Print-Annotation hinzufügen…_                                                     |
| Rechtsklick auf eine Annotation (Item-Baum)       | _Annotation bearbeiten…_, bei Print-Annotationen auch _Print-Annotation löschen_   |
| Rechtsklick auf eine Annotation (rechter Bereich) | dieselben Einträge                                                                 |
| Reader: Rechtsklick auf eine Annotation           | _Kommentar hinzufügen…/bearbeiten…_, _Locator festlegen…_                          |
| Reader: Seitenzahl bearbeiten                     | Locator-Auswahl und „Diesen Locator künftig für dieses Dokument verwenden“         |
| Toolbar-Button oben rechts, neben dem Sync-Button | öffnet den Organizer                                                               |
| _Werkzeuge → FlexAnnotate: Organizer_             | öffnet den Organizer                                                               |
| Zitierdialog aus Word/LibreOffice                 | „Einfügen als“ (Vollnachweis / Nur Nachweis); im Annotationsbereich die Gliederung |
| _Bearbeiten → Einstellungen → FlexAnnotate_       | Einstellungen                                                                      |

### Einstellungen

Schlüssel liegen unter `extensions.flexannotate.`.

| Option                                                                       | Wirkung                                                                  | Standard                                                                               |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------- |
| Standardmäßig nur den Nachweis einfügen (`citationOnly`)                     | Annotationen werden nur als Zitation mit Seitenangabe eingefügt          | aus                                                                                    |
| Leere Platzhalter-Anhänge behalten (`keepEmptyPlaceholders`)                 | Platzhalter bleibt, auch wenn keine Annotation mehr daran hängt          | aus                                                                                    |
| Werke hinter den Annotationen mitanzeigen (`showWorksInAnnotationView`)      | Organizer: Annotationsansicht zeigt auch die Werke                       | aus                                                                                    |
| Zitate ohne Dateianhang als Print-Annotationen übernehmen (`citaviImport`)   | Citavi-Import legt Print-Annotationen für Zitate an, die Zotero verwirft | an                                                                                     |
| Notiz zum Zitat behalten (`citaviKeepNotes`)                                 | Aus: die Notiz, die Zoteros Übersetzer zum Zitat anlegt, wird entfernt   | aus                                                                                    |
| Beiträge mit ihrem Hauptwerk verknüpfen (`citaviLinkContributions`)          | Citavi-Import legt „Verwandte“-Verknüpfungen an                          | an                                                                                     |
| Fundstellen zitieren als (`citaviLocatorPage/Column/Paragraph/Margin/Other`) | CSL-Locator je Citavi-Seitentyp                                          | Seite: page, Spalte: column, Paragraph: paragraph, Randnummer: paragraph, Andere: page |

Intern, ohne Oberfläche: `dialogOutlineView` (Zustand der Gliederungsoption im Zitierdialog), `citedAnnotations` (zitierte Annotationen je Dokument).

### Daten und Kompatibilität

Nutzerdaten der Version 1.x gelten unverändert weiter; die Preference-Schlüssel `extensions.flexannotate.*` sind gleich geblieben.

- `#flexannotate-locator-<typ>`: Locator-Typ einer Annotation (automatischer Tag; bei „Seite“ ohne abweichenden Dokument-Standard kein Tag).
- `#flexannotate-default-locator-<typ>`: Standard-Locator eines Anhangs für künftige Annotationen.
- `#flexannotate-placeholder`: kennzeichnet den Platzhalter-Anhang der Print-Annotationen.
- `§Titel`: Überschrift der Gliederung als Tag an zugeordneten Annotationen und Werken (Lattice-kompatibel).
- `★outline` und `LATTICE-OUTLINE-V1`: Notiz mit dem Gliederungsbaum als JSON (Lattice-kompatibel).

Die alte Version 1.2.0 ist über den Git-Tag `pre-merge` erreichbar.

### Bekannte Punkte

- Citavi-Import: Die Schlagwort-Zuordnung nutzt einen Präfix-Vergleich (K1 kann K10 treffen). Verhalten der alten Version, unverändert.
- Citavi-Import prüft keine Duplikate: ein zweiter Import desselben Exports legt Print-Annotationen erneut an.
- Das Seitenformat `PageRange` (`<os>`/`<nt>`) ist nur gegen synthetische Fixtures getestet.
- Reader-Popup, Reader-Menü sowie Toolbar- und Menü-Icons im Dark Mode sind nur per Code-Review geprüft, nicht visuell und nicht automatisch.
- Das Toolbar-Icon ist 16 px groß; Zoteros eigene Icons sind 20 px.
- Die Mindestversion Zotero 7.0 im Manifest ist nicht getestet. Getestet wurde nur gegen Zotero 10.0.5; die `MenuManager`-basierten Menüs erfordern eine neuere Zotero-Version als 7.0.
- Bearbeiten und Löschen für Annotationen im Item-Baum laufen über DOM, nicht über `MenuManager`: Zotero wendet bei Annotationsauswahl keine Plugin-Menüs an (`zoteroPane.js:4680` in 10.0.5).
- Nicht automatisch getestet: Reader-Fenster, ein echter Word-Lauf, der echte Citavi-Translator (siehe [docs/testing.md](docs/testing.md)).

### Entwicklung

Befehle, Aufbau und Regeln: [AGENTS.md](AGENTS.md). Dazu [docs/architecture.md](docs/architecture.md) (Aufbau, Datenmodell, Fallstricke), [docs/testing.md](docs/testing.md), [docs/anchors.md](docs/anchors.md) (verwendete Zotero-Interna) und [CHANGELOG.md](CHANGELOG.md).

### Lizenz und Herkunft

[AGPL-3.0-or-later](LICENSE). Der Organizer basiert auf [Lattice](https://github.com/birugit/zotero-grounded-qa) von birugit (AGPL-3.0-or-later); die Print-Annotationen, das Nur-Nachweis-Zitieren und der Citavi-Import stammen vom Projektautor. Einzelheiten: [NOTICE.md](NOTICE.md).

---

## English

### Contents

[Purpose](#purpose) · [Features](#features) · [Install](#install) · [Where to find things](#where-to-find-things) · [Settings and data](#settings-and-data) · [Known issues](#known-issues) · [Development and license](#development-and-license)

### Purpose

Zotero stores annotations only under a file attachment, so printed books, commentaries and statute collections cannot hold annotations with a page reference. Zotero also always inserts annotations into Word and LibreOffice with their quoted text, and its Citavi import discards quotes without a PDF anchor. FlexAnnotate closes these gaps and adds an organizer that files annotations under an outline. Since 2.0.0, the former FlexAnnotate and Annotree are one plugin.

### Features

**Printed sources**

- Print annotations: annotations with a manual page reference and selectable locator on items without a file. They hang under an automatically created placeholder attachment.
- Citation-only insertion: insert only the citation with its pinpoint from Word or LibreOffice (toggle in the citation dialog and in the settings).
- Citavi import: quotes without a file attachment become print annotations; contributions are linked to their parent work.

**Organizer**

- Outline: headings (tags `§Title`) file annotations and works by drag and drop; export as a Zotero note.
- Citation dialog view: option "Nach Gliederung anordnen (FlexAnnotate)" in the annotations view of the dialog opened from Word, with a green check for already cited annotations.

### Install

Download the XPI from [Releases](https://github.com/justanotherjurastudent/zotero_flexAnnotations/releases) (2.0.0 is not released yet) or build it with `npm install && npm run build` (`.scaffold/build/flex-annotate.xpi`). Install it via _Tools → Plugins → gear → Install Plugin From File…_.

### Where to find things

- Right-click an item: _Add print annotation…_; right-click an annotation: _Edit annotation…_ (print annotations also _Delete_).
- Organizer: toolbar button next to the Sync button, or _Tools → FlexAnnotate: Organizer_.
- Settings: _Edit → Settings → FlexAnnotate_ (preference keys `extensions.flexannotate.*`).

### Settings and data

The settings table above applies (German UI labels; the English UI uses the same options). Data created by 1.x keeps working unchanged: tags `#flexannotate-locator-<type>`, `#flexannotate-default-locator-<type>`, `#flexannotate-placeholder`, and the Lattice-compatible `§Title` tags and `★outline` note (`LATTICE-OUTLINE-V1`). Version 1.2.0 is available at the Git tag `pre-merge`.

### Known issues

See the German list above. In short: the Citavi keyword match is prefix-based, the Citavi import does not detect duplicates, the minimum Zotero version 7.0 in the manifest is untested (only 10.0.5 was tested), and dark-mode icons and the reader popup were reviewed in code only.

### Development and license

See [AGENTS.md](AGENTS.md) and [docs/](docs/). AGPL-3.0-or-later; the organizer is based on Lattice by birugit, see [NOTICE.md](NOTICE.md).
