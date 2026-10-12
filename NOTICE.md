# NOTICE – Herkunft und Urheberschaft

Der Organizer von **FlexAnnotate** (Gliederung, Annotationsindex, Export- und Zitierdialog-Ansicht unter `src/features/organizer/`, insbesondere `logic/outline.ts`) basiert auf Lattice von birugit und ist wie unten beschrieben ein abgeleitetes Werk. Die übrigen Teile (Print-Annotationen, Nur-Nachweis-Zitieren, Citavi-Import, Reader-Erweiterungen) stammen vom Projektautor justanotherjurastudent.

Der **Organizer** ist ein **abgeleitetes Werk (Fork mit starken Änderungen)** des Zotero-Plugins **Lattice** (Repository `zotero-grounded-qa`).

|                                    |                                                                                                                                                                              |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Ursprungsprojekt**               | Lattice for Zotero, <https://github.com/birugit/zotero-grounded-qa>                                                                                                          |
| **Urheber des Ursprungs**          | birugit                                                                                                                                                                      |
| **Übernommene Fassung**            | Version 4.1.0 (Commit `8d75041`, „chore(publish): release v4.1.0“)                                                                                                           |
| **Lizenz des Ursprungs**           | GNU Affero General Public License, Version 3 oder später (AGPL-3.0-or-later)                                                                                                 |
| **Lizenz von FlexAnnotate**        | **AGPL-3.0-or-later**, unverändert; der vollständige Lizenztext liegt in `LICENSE`                                                                                           |
| **Technische Basis des Ursprungs** | [Zotero Plugin Template](https://github.com/windingwind/zotero-plugin-template) (windingwind), [zotero-plugin-scaffold](https://github.com/northword/zotero-plugin-scaffold) |

## Was übernommen wurde

Die vollständige Git-Historie von Lattice ist in diesem Repository enthalten (Remote `upstream`), damit Urheberschaft und Entstehung jeder übernommenen Zeile nachvollziehbar bleiben. Konzeptionell und im Code übernommen bzw. weiterentwickelt werden insbesondere:

- das **Knowledge-Organizer-Konzept** (Überschrift = Zotero-Tag mit Präfix `§`; Gliederungsbaum als JSON in einer Notiz mit dem Tag `★outline`),
- der **Annotationsindex** und das Fenster „Alle Annotationen“,
- Export- und Zitierhilfen für Annotationen.

## Was am Organizer geändert wurde (Auszug, Details in der Git-Historie)

- Anpassung an Zotero 10.
- **Entfernt:** die KI-Komponente (Fragen und Antworten über PDFs, LLM-Anbindungen) und die Ideen-Ebene.
- **Neu:** dreispaltiges Organizer-Fenster nach dem Vorbild der Citavi-Wissensorganisation (Gliederung · Zitate · Details), Zuordnung von **Werken und Annotationen** zu Kategorien per Drag and Drop und Mehrfachauswahl, Einstellung zur Anzeige von Werken in der Annotationsansicht, Ansicht nach Gliederung im Zitierdialog, der sich aus Word öffnet.
- Eingebunden in FlexAnnotate mit eigenem Namen, eigener Plugin-ID und eigener Dokumentation.

## Pflichten aus der AGPL-3.0 (Kurzfassung, keine Rechtsberatung)

- Lizenz und Urheberhinweise des Ursprungs bleiben erhalten.
- Änderungen sind als solche gekennzeichnet (Git-Historie, diese Datei).
- Der Quellcode jeder verteilten oder über ein Netzwerk angebotenen Fassung ist unter derselben Lizenz zugänglich.

_Citavi_ ist eine Marke ihres jeweiligen Inhabers. FlexAnnotate ist **kein** Citavi-Produkt und steht in keiner Verbindung dazu; Citavi dient nur als Vorbild für Begriffe und Bedienkonzept.

Stand: 2026-10-12
