# Changelog

Format nach [Keep a Changelog](https://keepachangelog.com/), Versionierung nach [SemVer](https://semver.org/). Der Changelog des Ursprungsprojekts Lattice liegt unverändert in [`docs/lattice-changelog.md`](docs/lattice-changelog.md).

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
