pref("showWorksInAnnotationView", false);
pref("dialogOutlineView", false);
pref("citedAnnotations", "");

// Nur-Nachweis-Zitieren: false = vollständige Annotation, true = nur Nachweis mit Locator
pref("citationOnly", false);

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
