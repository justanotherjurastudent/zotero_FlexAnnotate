## Tab "Funktionen an/aus" der Einstellungen: Funktionen von FlexAnnotate einzeln ein- und ausschaltbar.
## Pro Funktion: Titel (.label) und eine Beschreibung. Die IDs folgen dem Gate-Namen in src/features/gates.ts
## (organizerToolbarButton -> prefs-feature-organizer-toolbar-button); test-unit/featureTexts.test.ts prüft das.
## Nicht aufgeführt (src/prefs/featureGroups.ts, HIDDEN_GATES): Import/Export im Organizer, Korrektur gegen
## einen Zotero-Fehler, Platzhalter-Aufräumen.

prefs-tab-options = Einstellungen
prefs-tab-features = Funktionen an/aus
prefs-features-intro =
    Hier schalten Sie Funktionen von FlexAnnotate ein oder aus, zum Beispiel wenn eine Funktion
    Probleme macht oder Zotero sie später selbst anbietet. Jede Gruppe hat oben einen Hauptschalter
    (fett): Schalten Sie ihn aus, sind alle Funktionen der Gruppe aus. Darunter lässt sich jede
    Funktion einzeln ein- und ausschalten. Aufgeführt sind nur Funktionen, die beim Laden oder bei
    jeder Benutzung anspringen; was erst bei einem Klick startet (etwa Import und Export im
    Organizer), hängt am Hauptschalter der Gruppe.
prefs-features-restart = Wirkt nach einem Neustart von Zotero.
prefs-features-needs = Nicht verfügbar, weil „{ $names }“ ausgeschaltet ist.

prefs-features-group-index = Grundlage
prefs-features-group-organizer = Organizer
prefs-features-group-dialog = Zitierdialog
prefs-features-group-citeonly = Nur-Nachweis-Zitieren
prefs-features-group-print = Print-Annotationen
prefs-features-group-rows = Annotationszeilen
prefs-features-group-reader = Reader
prefs-features-group-tags = Tags
prefs-features-group-citavi = Citavi-Import
prefs-features-group-api = Schnittstelle für andere Plugins

prefs-feature-annotation-index =
    .label = Annotationsindex
prefs-feature-annotation-index-description =
    Hält ein Verzeichnis aller Annotationen der Bibliothek aktuell. Der Organizer und die
    Gliederungsansicht im Zitierdialog brauchen es; ohne den Index stehen beide nicht zur Verfügung.

prefs-feature-organizer =
    .label = Organizer
prefs-feature-organizer-description =
    Hauptschalter: Der Organizer ist ein eigenes Fenster, in dem Sie Annotationen nach einer
    Gliederung ordnen. Ausgeschaltet entfallen das Fenster, sein Menüeintrag und alle Funktionen
    darunter, auch Import und Export.
prefs-feature-organizer-toolbar-button =
    .label = Organizer-Schaltfläche
prefs-feature-organizer-toolbar-button-description =
    Zeigt in der Zotero-Werkzeugleiste eine Schaltfläche, die den Organizer öffnet.
prefs-feature-tools-menu-fallback =
    .label = Organizer im Menü „Werkzeuge“
prefs-feature-tools-menu-fallback-description =
    Fügt dem Menü „Werkzeuge“ den Eintrag „FlexAnnotate: Organizer“ hinzu. Nötig nur in Zotero 7,
    das Plugin-Menüs noch nicht verwaltet; in neueren Versionen hat die Option keine Wirkung.
prefs-feature-collection-menu =
    .label = Organizer für eine Sammlung
prefs-feature-collection-menu-description =
    Fügt dem Rechtsklick-Menü einer Sammlung den Eintrag „Organizer für diese Sammlung“ hinzu.
prefs-feature-orphan-tags =
    .label = Verwaiste Tags erkennen
prefs-feature-orphan-tags-description =
    Findet §-Tags, zu denen es keine Überschrift mehr gibt, und bietet an, sie neu zuzuordnen
    oder zu entfernen.
prefs-feature-outline-anchor-tags =
    .label = Überschriften-Tags an der Gliederungsnotiz
prefs-feature-outline-anchor-tags-description =
    Legt die §-Tags aller Überschriften auch an der Gliederungsnotiz ab. So erscheinen sie in der
    Tag-Vervollständigung, selbst wenn ihnen noch keine Annotation zugeordnet ist.
prefs-feature-outline-scope-heading =
    .label = Geltungsbereich in der Notiz-Überschrift
prefs-feature-outline-scope-heading-description =
    Benennt die Überschrift der Gliederungsnotiz nach ihrem Geltungsbereich (Bibliothek oder
    Hauptsammlung), damit mehrere Gliederungen unterscheidbar sind.

prefs-feature-citation-dialog =
    .label = Zitierdialog von FlexAnnotate
prefs-feature-citation-dialog-description =
    Hauptschalter für alles, was FlexAnnotate im Zitierdialog von Word und LibreOffice ändert.
    Ausgeschaltet bleibt der Dialog, wie Zotero ihn liefert, und alle Funktionen darunter sind
    ebenfalls aus.
prefs-feature-outline-view =
    .label = Gliederungsansicht im Zitierdialog
prefs-feature-outline-view-description =
    Zeigt im Zitierdialog die Gliederung als Baum mit den zugeordneten Annotationen und einer
    Vorschau. Braucht den Annotationsindex.
prefs-feature-cited-tracking =
    .label = Bereits zitiert markieren
prefs-feature-cited-tracking-description =
    Erkennt zitierte Annotationen und Titel im Dokument, merkt sie sich in einer JSON-Datenstruktur
    in den Dokumentvariablen und entfernt sie wieder, wenn sie nicht mehr im Dokument stehen.
    Zitierte Annotationen erhalten im Zitierdialog einen grünen Haken.
prefs-feature-footnote-jump =
    .label = Fußnotennummern und Sprung
prefs-feature-footnote-jump-description =
    Zeigt bei zitierten Annotationen die Fußnotennummer und springt per Klick an die Stelle in Word
    oder LibreOffice.
prefs-feature-dialog-show-place =
    .label = Schaltfläche „Zitatstelle anzeigen“
prefs-feature-dialog-show-place-description =
    Fügt in der Vorschau des Zitierdialogs die Schaltfläche „Zitatstelle anzeigen“ hinzu. Sie öffnet
    den Anhang an der gewählten Annotation.
prefs-feature-persistent-dialog-patch =
    .label = Zitierfenster offen halten
prefs-feature-persistent-dialog-patch-description =
    Macht die Option „Zitierfenster als persistente Aufgabenleiste geöffnet halten“ verfügbar: Nach dem
    Einfügen in Word oder LibreOffice bleibt der Zitierdialog als Begleitfenster offen und merkt sich
    Position und Größe.
prefs-feature-narrow-dialog-layout =
    .label = Schmale Ansicht des Zitierfensters
prefs-feature-narrow-dialog-layout-description =
    Ordnet das offen gehaltene Zitierfenster unter 750 Pixeln Breite untereinander an (Baum, Liste,
    Details) und verlegt Schalter ins Zahnradmenü.

prefs-feature-cite-only-patch =
    .label = Nur-Nachweis-Zitieren
prefs-feature-cite-only-patch-description =
    Hauptschalter: Ermöglicht, statt der vollständigen Annotation nur den Nachweis mit Seitenangabe
    in Word oder LibreOffice einzufügen. Ausgeschaltet entfällt auch die Auswahl im Zitierdialog.
prefs-feature-mode-selector =
    .label = Nachweis-Optionen: nur Nachweis oder mit Zitat
prefs-feature-mode-selector-description =
    Fügt im Zitierdialog die Auswahl „Vollnachweis“ oder „Nur Nachweis“ hinzu, im Einstellungsmenü und
    im Popup eines Eintrags. Braucht den Zitierdialog und das Nur-Nachweis-Zitieren.

prefs-feature-print-menus =
    .label = Menüeinträge für Print-Annotationen
prefs-feature-print-menus-description =
    Hauptschalter: Fügt dem Rechtsklick-Menü der Literaturliste die Einträge „Annotation hinzufügen“,
    „Annotation bearbeiten“ und „Annotation löschen“ hinzu, auch für Quellen ohne PDF wie gedruckte Bücher.
prefs-feature-annotation-row-menu =
    .label = Menü auf Annotationszeilen
prefs-feature-annotation-row-menu-description =
    Fügt dem Rechtsklick-Menü einer Annotation im rechten Bereich die Einträge „Annotation bearbeiten“ und
    „Annotation löschen“ hinzu.

prefs-feature-annotation-row-patch =
    .label = Annotationszeilen verbessern
prefs-feature-annotation-row-patch-description =
    Zeigt in Annotationszeilen den richtigen Locator-Typ (zum Beispiel „Randnummer 318“ statt „Seite 318“)
    und einen Pfeil, der den Anhang an der Textstelle öffnet.

prefs-feature-reader-menu =
    .label = Reader-Menü
prefs-feature-reader-menu-description =
    Hauptschalter: Fügt dem Rechtsklick-Menü einer Annotation im Zotero-Reader den Eintrag „Annotation
    bearbeiten…“ hinzu.
prefs-feature-reader-label-popup =
    .label = Locator-Auswahl im Seitenzahl-Popup
prefs-feature-reader-label-popup-description =
    Fügt im Popup zum Ändern der Seitenzahl im Reader die Auswahl des Locator-Typs (Seite, Randnummer …) hinzu.

prefs-feature-tag-suggest =
    .label = §-Tag-Vorschläge
prefs-feature-tag-suggest-description =
    Zeigt beim Tippen von „§“ im Tag-Feld die Überschriften der Gliederung in Gliederungsreihenfolge statt
    alphabetisch. Wie, stellen Sie im Tab „Einstellungen“ ein.

prefs-feature-citavi-import =
    .label = Citavi-Import
prefs-feature-citavi-import-description =
    Hauptschalter: Ermöglicht den Import aus Citavi (Dateien, Verknüpfungen und Zitate ohne PDF).
prefs-feature-citavi-print-quotes =
    .label = Citavi: Zitate ohne PDF
prefs-feature-citavi-print-quotes-description =
    Übernimmt beim Citavi-Import auch Zitate, zu denen es kein PDF gibt, als Print-Annotationen.
prefs-feature-citavi-links =
    .label = Citavi: Beiträge verknüpfen
prefs-feature-citavi-links-description =
    Verknüpft beim Citavi-Import Beiträge in Sammelwerken mit ihrem übergeordneten Band.

prefs-feature-external-api =
    .label = Schnittstelle für andere Plugins
prefs-feature-external-api-description =
    Stellt die Gliederung mit ihren Nummern anderen Plugins (zum Beispiel KI-Anbindungen) über
    Zotero.FlexAnnotate bereit. Ohne diese Funktion kann kein anderes Plugin die Gliederung lesen.
