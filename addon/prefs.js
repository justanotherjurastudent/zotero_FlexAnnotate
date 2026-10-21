pref("showWorksInAnnotationView", false);
pref("showCommentInOrganizerRows", false);
pref("dialogOutlineView", false);
// Zitierdialog: Sammlung, aus der die Gliederung kommt (0 = gesamte Bibliothek)
pref("dialogOutlineCollection", 0);
pref("citedAnnotations", "");
// §-Vorschläge im Tag-Feld in Gliederungsreihenfolge: all | typed | tree | off
pref("outlineTagSuggest", "all");

// Nur-Nachweis-Zitieren: false = vollständige Annotation, true = nur Nachweis mit Locator
pref("citationOnly", false);

// Zitierdialog nach dem Einfügen offen lassen und in Word wiederverwenden
pref("persistentCitationDialog", false);
// Letzte Lage und Größe des Blätterfensters (JSON, leer = keine): der erste Dialog nach einem Neustart nimmt sie
pref("persistentWindowRect", "");

// Vor dem Löschen einer Annotation (Kontextmenü) nachfragen
pref("confirmDeleteAnnotation", true);

// Platzhalter-Attachment behalten, auch wenn keine Annotation mehr daran hängt
pref("keepEmptyPlaceholders", false);

// Citavi-Import: Zitate ohne Dateianhang als Print-Annotationen übernehmen
pref("citaviImport", true);

// Die Notiz behalten, die Zoteros Übersetzer zu demselben Zitat anlegt.
// Aus = FlexAnnotate entfernt sie, sobald es das Zitat als Annotation übernommen hat.
pref("citaviKeepNotes", false);

// Beiträge (im Sammelwerk, Gesetzeskommentar, Tagungsband) beim Citavi-Import als
// Zotero-Relationen mit ihrem Hauptwerk und untereinander verknüpfen.
pref("citaviLinkContributions", true);

// CSL-Locator je Citavi-Seitentyp (<nt> in PageRange; ohne <nt> meint Citavi eine
// Seite). Für Randnummern gibt es in CSL keine Entsprechung, deshalb hängt die
// sinnvolle Wahl am Zitierstil — je nach Stil passt paragraph, opus oder column.
pref("citaviLocatorPage", "page");
pref("citaviLocatorColumn", "column");
pref("citaviLocatorParagraph", "paragraph");
pref("citaviLocatorMargin", "paragraph");
pref("citaviLocatorOther", "page");
