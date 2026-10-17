# FlexAnnotate – Handbuch

Deutsch · [English](guide.md)

Ausführliche Bedienung und Nachschlagewerk. Der Überblick steht in der [README](../README.md).

## Bedienung

| Wo                                                | Was                                                                                |
| ------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Rechtsklick auf einen Titel                       | _Print-Annotation hinzufügen…_                                                     |
| Rechtsklick auf eine Annotation (Item-Baum)       | _Annotation bearbeiten…_, bei Print-Annotationen auch _Print-Annotation löschen_   |
| Rechtsklick auf eine Annotation (rechter Bereich) | dieselben Einträge                                                                 |
| Reader: Rechtsklick auf eine Annotation           | _Kommentar hinzufügen…/bearbeiten…_, _Locator festlegen…_                          |
| Reader: Seitenzahl bearbeiten                     | Locator-Auswahl und „Diesen Locator künftig für dieses Dokument verwenden“         |
| Toolbar-Button oben rechts, neben dem Sync-Button | öffnet den Organizer (bzw. fokussiert ein offenes Fenster)                         |
| _Werkzeuge → FlexAnnotate: Organizer_             | öffnet den Organizer (bzw. fokussiert ein offenes Fenster)                         |
| Organizer, Dokument-Symbol der Gliederungsleiste  | Gliederung aus Word/LibreOffice importieren                                        |
| Organizer, Export-Symbol der Gliederungsleiste    | Gliederung als Word/ODT exportieren                                                |
| Zitierdialog aus Word/LibreOffice                 | „Einfügen als“ (Vollnachweis / Nur Nachweis); im Annotationsbereich die Gliederung |
| _Bearbeiten → Einstellungen → FlexAnnotate_       | Einstellungen                                                                      |

### Gliederung aus Word/LibreOffice importieren

1. Organizer öffnen und in der Gliederungsleiste das Dokument-Symbol anklicken (_Gliederung aus Word/ODT-Dokument importieren…_).
2. Ein `.docx`- oder `.odt`-Dokument wählen.
3. In der Vorschau die Zähler (neu, vorhanden, umbenannt), die mehrstufige Nummerierung (`1`, `1.1` …) und die eingerückte Liste prüfen. Die Option „Nummerierung aus Titeln entfernen“ erscheint nur, wenn eine manuelle Nummerierung erkannt wurde (Formen wie `1.`, `1.2`, `1)`, `A.`, `I.`, `a)`, `(1)` in mindestens 80 % und mindestens 3 Überschriften).
4. _Importieren_ klicken; mit _Abbrechen_ bleibt alles unverändert.
5. Die neuen Überschriften stehen in der Gliederung; Annotationen werden wie gewohnt zugeordnet.

Erkannt werden die Formatvorlagen „Überschrift 1/2/3 …“ bzw. „Heading 1/2/3 …“, benutzerdefinierte Vorlagen mit Gliederungsebene (`outlineLvl`) und in ODT `text:h`. Die Ebenen werden lückenlos gemacht (die erste Überschrift ist Ebene 1, keine Ebene springt um mehr als eins).

Der Import hängt nur an: Nichts wird gelöscht oder verschoben. Eine Überschrift mit gleichem Titel (ohne Beachtung von Groß-/Kleinschreibung und Leerraum) unter demselben Elternknoten wird wiederverwendet, sonst entsteht sie als letztes Kind. Ist „Nummerierung aus Titeln entfernen“ aktiv, werden auch bestehende Gliederungspunkte erkannt, deren Titel noch eine manuelle Nummerierung tragen; deren Titel wird bereinigt und zugeordnete Annotationen/Werke werden automatisch auf das bereinigte Tag umgehängt. Weil jede Überschrift ein Tag ist, müssen Titel eindeutig sein; Duplikate heißen „Titel (2)“, „Titel (3)“.

Grenzen:

- Nur Absatz-Formatvorlagen und `outlineLvl`; fett gesetzter Fließtext zählt nicht als Überschrift.
- Fußnoten und gelöschte Änderungen fließen nicht in den Titel ein.
- `.doc` und `.rtf` werden nicht unterstützt (vorher in `.docx` oder `.odt` speichern).
- Je XML-Eintrag (`document.xml`, `styles.xml`, `content.xml`) gilt eine Grenze von 50 MB.
- Textfelder sowie Kopf- und Fußzeilen werden nicht gezielt behandelt.

Ist das Dokument gerade in einem anderen Programm geöffnet und exklusiv gesperrt, meldet der Import das statt „kein gültiges Dokument“; das Dokument in dem Programm schließen und es erneut versuchen.

### Gliederung als Word/ODT exportieren

1. Organizer öffnen und in der Gliederungsleiste das Export-Symbol anklicken (_Gliederung als Word/ODT exportieren…_).
2. Ort und Namen wählen; über das Format-Aufklappmenü zwischen `.docx` (Word) und `.odt` (LibreOffice) wechseln.
3. Das Dokument enthält alle Überschriften in Gliederungsreihenfolge mit den Standard-Formatvorlagen „Überschrift 1–9“ (bzw. „Heading 1–9“) und einer mehrstufigen automatischen Nummerierung („1“, „1.1“ …), die beim Umstellen von Kapiteln in Word/LibreOffice automatisch mitläuft. Direkt loslegen und unter den Überschriften schreiben.

Der Export ändert nichts in der Bibliothek; die Zieldatei wird überschrieben (der Dateidialog fragt vorher nach). Ist die Zieldatei gerade in Word/LibreOffice geöffnet oder schreibgeschützt, schlägt das Schreiben mit einer Meldung fehl, ohne die Datei zu beschädigen — das Dokument dort schließen und erneut exportieren.

## Einstellungen

Schlüssel liegen unter `extensions.flexannotate.`.

![Einstellungsfenster „FlexAnnotate“](img/preferences.png)

| Option                                                                                        | Wirkung                                                                                    | Standard                                                                               |
| --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------- |
| Standardmäßig nur den Nachweis einfügen (`citationOnly`)                                      | Annotationen werden nur als Zitation mit Seitenangabe eingefügt                            | aus                                                                                    |
| Leere Platzhalter-Anhänge behalten (`keepEmptyPlaceholders`)                                  | Platzhalter bleibt, auch wenn keine Annotation mehr daran hängt                            | aus                                                                                    |
| Werke hinter den Annotationen mitanzeigen (`showWorksInAnnotationView`)                       | Organizer: Annotationsansicht zeigt auch die Werke                                         | aus                                                                                    |
| Im Organizer Kommentare statt Zitattext in den Zeilen anzeigen (`showCommentInOrganizerRows`) | Organizer: Bei Annotationen mit Kommentar zeigt die Zeile den Kommentar statt des Exzerpts | aus                                                                                    |
| Zitate ohne Dateianhang als Print-Annotationen übernehmen (`citaviImport`)                    | Citavi-Import legt Print-Annotationen für Zitate an, die Zotero verwirft                   | an                                                                                     |
| Notiz zum Zitat behalten (`citaviKeepNotes`)                                                  | Aus: die Notiz, die Zoteros Übersetzer zum Zitat anlegt, wird entfernt                     | aus                                                                                    |
| Beiträge mit ihrem Hauptwerk verknüpfen (`citaviLinkContributions`)                           | Citavi-Import legt „Verwandte“-Verknüpfungen an                                            | an                                                                                     |
| Fundstellen zitieren als (`citaviLocatorPage/Column/Paragraph/Margin/Other`)                  | CSL-Locator je Citavi-Seitentyp                                                            | Seite: page, Spalte: column, Paragraph: paragraph, Randnummer: paragraph, Andere: page |

Intern, ohne Oberfläche: `dialogOutlineView` (Zustand der Gliederungsoption im Zitierdialog), `citedAnnotations` (zitierte Annotationen je Dokument).

## Einschränkungen auf Zotero-Versionen vor 10

Das Manifest verlangt Zotero 7.0 bis 10.\*. Geprüft ist das nur durch die automatische Zotero-Testsuite (`npm run test:versions`, siehe [testing.md](testing.md)) gegen Zotero **7.0.32, 8.0.4, 9.0.6** und **10.0.5/10.0.6**. Andere Patchversionen derselben Reihen sind nicht geprüft; Abweichungen dort sind nicht ausgeschlossen.

| Funktion                                                                                            | 7.0.x                       | 8.0.x                       | 9.0.x                       | 10.x                    |
| --------------------------------------------------------------------------------------------------- | --------------------------- | --------------------------- | --------------------------- | ----------------------- |
| Organizer (Fenster, Gliederung, Export), Toolbar-Button                                             | geprüft                     | geprüft                     | geprüft                     | geprüft                 |
| Gliederungsimport aus Word/LibreOffice                                                              | geprüft                     | geprüft                     | geprüft                     | geprüft                 |
| Gliederungsexport als Word/ODT (inkl. Sperr-Tests)                                                  | geprüft                     | geprüft                     | geprüft                     | geprüft                 |
| Print-Annotationen inkl. Eingabemaske                                                               | geprüft, Farbmenü: Rückfall | geprüft, Farbmenü: Rückfall | geprüft, Farbmenü: Rückfall | geprüft                 |
| Citavi-Import                                                                                       | geprüft                     | geprüft                     | geprüft                     | geprüft                 |
| Nur-Nachweis-Zitieren (Patch von `_insertCitingResult`, nur synthetisch geprüft)                    | geprüft                     | geprüft                     | geprüft                     | geprüft                 |
| Menü _Werkzeuge → FlexAnnotate: Organizer_                                                          | Rückfall (DOM)              | geprüft (`MenuManager`)     | geprüft (`MenuManager`)     | geprüft (`MenuManager`) |
| Zitierdialog mit Annotationsmodus: Modus-Auswahl, Gliederungsansicht, Suche, „Zitatstelle anzeigen“ | nicht verfügbar             | nicht verfügbar             | geprüft                     | geprüft                 |
| Einstellungsfenster                                                                                 | geprüft                     | geprüft                     | geprüft                     | geprüft                 |

- **Zitierfenster offen halten (Option `persistentCitationDialog`, Standard aus):** Nach dem Einfügen öffnet sich der Dialog an derselben Stelle neu mit allen Annotationen; dort lassen sich weitere Annotationen einfügen. Eine neue Anfrage aus Word ersetzt das Fenster. Einschalten wirkt sofort, auch auf einem bereits offenen Fenster: das nächste Einfügen dort lässt es wieder aufleben. Ausschalten schließt das offene Fenster nicht mehr sofort, sondern erst mit der nächsten Einfügung (dann wieder wie in Vanilla-Zotero). Geprüft: Testsuite auf 10.0.6 und 9.0.6 grün; 7.0.32 und 8.0.4 haben keinen Annotationsmodus, dort fehlt die Option.
- **Farbmenü (7.x bis 9.x):** `Zotero.Annotations.COLORS` gibt es erst ab 10.x. Davor verwendet die Eingabemaske die acht Standardfarben von Zotero (`STANDARD_COLORS` in `src/features/print/logic/printAnnotation.ts`).
- **Werkzeugmenü (7.x):** `Zotero.MenuManager` fehlt in 7.0.32; der Eintrag wird direkt in das Menü _Werkzeuge_ eingehängt. Die übrigen Menüs (Rechtsklick auf Titel und Annotationen) arbeiten ohnehin über DOM.
- **Zitierdialog (7.x, 8.x):** Der Annotationsmodus im Zitierdialog existiert erst ab Zotero 9. Auf 7.x und 8.x gibt es dort weder die Option „Nach Gliederung anordnen“ noch die Modus-Auswahl „Einfügen als“ noch „Zitatstelle anzeigen“. Das Plugin tut in diesem Dialog nichts und stört nicht.

## Daten und Kompatibilität

Nutzerdaten der Version 1.x gelten unverändert weiter; die Preference-Schlüssel `extensions.flexannotate.*` sind gleich geblieben.

- `#flexannotate-locator-<typ>`: Locator-Typ einer Annotation (automatischer Tag; bei „Seite“ ohne abweichenden Dokument-Standard kein Tag).
- `#flexannotate-default-locator-<typ>`: Standard-Locator eines Anhangs für künftige Annotationen.
- `#flexannotate-placeholder`: kennzeichnet den Platzhalter-Anhang der Print-Annotationen.
- `§Titel`: Überschrift der Gliederung als Tag an zugeordneten Annotationen und Werken (Lattice-kompatibel). Der Organizer verankert zusätzlich zu jeder Überschrift einen `§`-Tag an der `★outline`-Notiz (beim Speichern und beim Laden, sodass auch bestehende Notizen nachträglich befüllt werden), sodass der Tag auch ohne zugeordnete Einträge existiert: In der PDF-Ansicht genügt ein `§` in der Tag-Zeile des Anmerkungs-Popups, und die Überschriften dieses Baums werden vorgeschlagen. Umbenennen oder Löschen einer Überschrift verschiebt bzw. entfernt den Tag automatisch. Da Zotero Tag-Vorschläge bibliotheksweit vorschlägt, erscheinen dort auch `§`-Tags aus anderen Hauptsammlungen mit eigener Struktur.
- `★outline` und `LATTICE-OUTLINE-V1`: Notiz mit dem Gliederungsbaum als JSON (Lattice-kompatibel); mit dem zusätzlichen Tag `#flexannotate-outline-<collectionKey>` gehört die Notiz zum Baum der jeweiligen Sammlung. Die Überschrift der Notiz nennt den Geltungsbereich — für die ganze Bibliothek den Bibliotheksnamen, für eine Hauptsammlung deren Namen —, sodass mehrere Gliederungsnotizen in der Item-Liste unterscheidbar sind.

Die alte Version 1.2.0 ist über den Git-Tag `pre-merge` erreichbar.

## Bekannte Punkte

- Die Gliederungsnotiz `★outline` nicht selbst im Notiz-Editor öffnen und dort bearbeiten: Der Editor kann sie später mit seinem Stand überschreiben (Hintergrund: [architecture.md](architecture.md), Fallstrick 14). FlexAnnotate legt sie so an, dass Zotero sie nicht von sich aus öffnet.
- Zitierfenster offen halten: Die Mindesthöhe liegt bei rund 590 px, weil Zotero sie erzwingt. Nach dem Einfügen öffnet sich das Fenster an derselben Stelle neu, so dass weitere Annotationen eingefügt werden können; das Einfügen aus diesem Fenster ist in echtem Word noch nicht geprüft. Fensterposition nur unter Windows mit 125 % Skalierung gemessen. macOS, Linux und der dunkle Modus sind nicht geprüft.
- Das Seitenformat `PageRange` (`<os>`/`<nt>`) ist nur gegen synthetische Fixtures getestet.
- Reader-Popup, Reader-Menü sowie Toolbar- und Menü-Icons im Dark Mode sind nur per Code-Review geprüft, nicht visuell und nicht automatisch.
- Das Toolbar-Icon ist 16 px groß; Zoteros eigene Icons sind 20 px.
- Bearbeiten und Löschen für Annotationen im Item-Baum laufen über DOM, nicht über `MenuManager`: Zotero wendet bei Annotationsauswahl keine Plugin-Menüs an (`zoteroPane.js:4680` in 10.0.5).
- Nicht automatisch getestet: Reader-Fenster, ein echter Word-Lauf, der echte Citavi-Translator (siehe [testing.md](testing.md)).
