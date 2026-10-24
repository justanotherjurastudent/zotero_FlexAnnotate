# Dokumentenweites Zitier-Tracking („Grüne Haken wie bei Citavi“)

Dieses Dokument beschreibt die Architektur, das Datenmodell und die Performance-Optimierung des sitzungs- und rechnerübergreifenden Zitier-Trackings in FlexAnnotate.

---

## 1. Motivation & Problemstellung

Im Zotero-Zitierdialog (erreichbar über Microsoft Word, LibreOffice Writer oder das persistente Begleitfenster) markiert die Gliederungsansicht („Nach Gliederung anordnen“) bereits im Dokument verwendete Zitate mit einem grünen Haken (`✓`), um versehentliche Doppelzitate zu vermeiden.

### Das Problem der bisherigen Lösung

In früheren Versionen speicherte FlexAnnotate diesen Status in den lokalen Zotero-Einstellungen (`Zotero.Prefs.get("extensions.flexannotate.citedAnnotations")`), abgelegt unter `session.sessionID`:

1. **Flüchtige Sitzungs-IDs:** In Zotero (`xpcom/integration.js:1069`) ist `session.sessionID` eine zufällige In-Memory-Zeichenkette (`Zotero.randomString()`). Bei jedem Zotero-Neustart wird sie neu erzeugt und im Word-Dokument überschrieben. Die alten Pref-Einträge waren damit sofort verwaist.
2. **Keine Synchronisation:** Die Profildatei `prefs.js` existiert nur auf dem lokalen Rechner. Wurde das Word-Dokument auf einem anderen Computer oder von einem Co-Autor geöffnet, waren alle Häkchen verschwunden.
3. **Keine automatische Bereinigung:** Wurde eine Fußnote in Word gelöscht, blieb die Annotation als „zitiert“ markiert, solange irgendein Zitat des übergeordneten Werkes im Dokument verblieb.

---

## 2. Technische Lösung

### 2.1 Speicherort: Word-Dokumentvariablen (`session.data.prefs`)

Zotero persistiert Dokumenteinstellungen (wie Zitationsstil und Sprache) direkt im Word- bzw. LibreOffice-Dokument über interne Dokumentvariablen (`ZOTERO_PREF_1` etc.).

Beim Serialisieren in das Zotero-eigene Dokument-XML (`xpcom/integration.js:2706–2722`) schreibt Zotero alle Eigenschaften von `this.prefs` als `<pref name="..." value="..."/>`-Elemente. Beim Einlesen über `unserializeXML` (`xpcom/integration.js:2736–2747`) werden alle vorhandenen Pref-Einträge unmodifiziert zurück in das JavaScript-Objekt `session.data.prefs` geladen.

FlexAnnotate legt die Zitationsdaten unter dem Schlüssel `flexannotate_cited` als kompakten **JSON-String** ab:

```json
{
  "citations": {
    "c_K8X29PLA": ["ANN_KEY_1"],
    "c_M4B11ZZR": ["ANN_KEY_2", "ANN_KEY_3"]
  },
  "manual": ["ANN_KEY_4"]
}
```

#### Eigenschaften dieses Speichers:

- **Dokumentgebunden:** Die Information reist mit der `.docx`- oder `.odt`-Datei mit (per Mail, Cloud, Git oder USB-Stick).
- **Rechnerunabhängig:** Da die stabilen 8-stelligen Zotero-Sync-Keys (`item.key`) gespeichert werden, funktioniert das Tracking auf jedem Rechner identisch – auch wenn die lokalen SQLite-IDs (`item.id`) sich unterscheiden.
- **Kompatibel mit Co-Autoren:** Auch wenn Co-Autoren FlexAnnotate nicht installiert haben, schleift Zoteros nativer Integrationscode unbekannte `<pref>`-Tags unverändert durch; die Daten werden nicht gelöscht.
- **Abwärtskompatibler Fallback:** Besitzt ein bestehendes Dokument noch keine Dokument-Pref (`readDocCitedData() === null`), greift FlexAnnotate transparent auf den lokalen Pref-Speicher zurück.

---

### 2.2 Zitations-Lebenszyklus (`citationID`)

Jedes Zitationsfeld in Word besitzt eine eindeutige `citationID`. In Zoteros regulärem Ablauf wird diese ID erst in `Session.prototype.addCitation` (`xpcom/integration.js:2230`) gewürfelt:

```javascript
var duplicateIndex = this.documentCitationIDs[citation.citationID];
var needNewID = !citation.citationID || duplicateIndex != undefined;
if (needNewID) {
  citation.citationID = Zotero.Utilities.randomString();
}
```

FlexAnnotate nutzt diese Eigenschaft in `src/features/citeOnly/integrationPatch.ts`:

1. **Pre-Initialisierung:** Vor der Übergabe an `_insertItemsIntoDocument` bzw. Zoteros nativer Einfügeroutine wird `citation.citationID` mit `Zotero.Utilities.randomString()` vorab belegt, falls sie noch leer ist.
2. **Dauerhafte ID:** Da die ID bereits gesetzt ist und noch nicht in `documentCitationIDs` vorkommt, übernimmt Zotero exakt diesen Bezeichner unverändert in das Word-Feld.
3. **Verknüpfung:** FlexAnnotate speichert `citationID -> [annKey, ...]` in `session.data.prefs.flexannotate_cited`.

---

### 2.3 Automatisches Verschwinden beim Löschen der Fußnote (Reconciliation)

Wie bei Citavi verschwindet der grüne Haken automatisch, wenn der Nutzer die zugehörige Fußnote im Textverarbeitungsprogramm löscht:

1. **Feld-Scan durch Zotero:** Wann immer der Zitierdialog geöffnet oder in Word auf „Refresh“ / „Add/Edit Citation“ geklickt wird, führt Zotero `updateFromDocument()` (`xpcom/integration.js:1890`) aus. Dabei wird `session.documentCitationIDs` frisch befüllt – es enthält nur noch Zitationen, deren Feld in Word tatsächlich existiert.
2. **Reconciliation (`reconcileDocData` in `src/features/organizer/logic/cited.ts`):**
   - FlexAnnotate iteriert über alle in `docData.citations` verzeichneten `citationID`s.
   - Ist eine `citationID` nicht mehr in `session.documentCitationIDs` vorhanden, wurde die Fußnote gelöscht und der Eintrag wird aus `docData.citations` entfernt.
   - Wurde eine Annotation nur in dieser einen Fußnote zitiert, verschwindet ihr Schlüssel aus den aktiven Zitationen – der grüne Haken erlischt.
   - Wurde dieselbe Annotation an mehreren Stellen zitiert (z. B. Fußnote 3 und 12), bleibt der Haken aktiv, solange mindestens eine Fußnote noch im Text steht.
3. **Automatisches Zurückschreiben:** Das bereinigte `docData`-Objekt wird direkt in `session.data.prefs.flexannotate_cited` persistiert.

---

### 2.4 Nutzung auf mehreren Geräten (Multi-Device & Co-Autoren)

Häufige Fragestellung: _„Wie verhält sich das Plugin, wenn ich auf mehreren Rechnern arbeite oder nur auf einem davon das Plugin installiert ist?“_

1. **Rechner A (mit FlexAnnotate) → Rechner B (mit FlexAnnotate):**
   - **Nahtlose Mitnahme:** Da die Tracking-Informationen (`flexannotate_cited`) direkt in den Dokumenteigenschaften der `.docx`- oder `.odt`-Datei gespeichert werden, reisen sie beim Übertragen der Datei (z. B. via OneDrive, Google Drive, Dropbox, Nextcloud, E-Mail oder USB-Stick) automatisch mit.
   - **Bibliotheks-Sync:** Zoteros Standard-Synchronisation gleicht die PDF-Annotationen und deren eindeutige 8-stellige Schlüssel (`item.key`) zwischen beiden Rechnern ab.
   - **Ergebnis:** Beim Öffnen des Dokuments auf Rechner B liest FlexAnnotate die Zitationsdaten aus dem Word-Dokument aus und zeigt exakt dieselben grünen Haken und Fußnoten-Chips an wie auf Rechner A.

2. **Rechner A (mit FlexAnnotate) → Rechner B (OHNE FlexAnnotate, nur Standard-Zotero):**
   - **Kein Datenverlust:** Zoteros native Textverarbeitungs-Integration schleift unbekannte `<pref>`-Elemente in den Dokumentdaten (`session.data.prefs`) unverändert durch.
   - **Reguläre Zitate:** Alle mit FlexAnnotate eingefügten Nachweise sind standardmäßige Zotero-Zitierfelder. Sie können auf Rechner B ganz gewöhnlich aktualisiert, formatiert oder ergänzt werden.
   - **Automatische Synchronisation bei Rückkehr:** Wird das Dokument später wieder auf Rechner A geöffnet, gleicht `reconcileDocData` die Liste der Zitate automatisch mit den tatsächlichen Feldern im Dokument ab: Wurden auf Rechner B Fußnoten gelöscht, verschwinden die grünen Haken automatisch.

3. **Warum keine Speicherung in einer lokalen Datenbank?**
   - Lokale SQLite-Primärschlüssel (`item.id`) sind auf verschiedenen Geräten nicht identisch (Rechner A kann für dieselbe Annotation ID `1420` vergeben, Rechner B ID `873`).
   - Durch die Bindung an den globalen Zotero-Sync-Key (`item.key`) und die Ablage in der Word-Datei selbst ist das System vollständig dezentral, synchronisationsfrei und kollisionstolerant.

---

## 3. Performance & Skalierbarkeit für große Dokumente

Bei Dissertationen oder Monografien mit 500 bis 1.000+ Fußnoten darf die Zitationsprüfung weder das Tippen noch das Rendern des Dialogs verlangsamen.

### 3.1 Kompaktes Datenformat

Statt redundanter Metadaten (Titel, URLs, Seitenzahlen) werden ausschließlich 8-stellige alphanumerische Strings gespeichert:

- Pro Zitation: ~25 bis 35 Bytes (z. B. `"c_K8X29PLA":["P8R4W3KZ"]`).
- 500 Zitationen belegen rund **15 KB** als JSON-String.
- 1.000 Zitationen belegen rund **30 KB**.
  Dies liegt um ein Vielfaches unter den Kapazitätsgrenzen von Word-Dokumentvariablen und lässt sich in Bruchteilen einer Millisekunde serialisieren.

### 3.2 Linearer Einmaldurchlauf ($\mathcal{O}(N)$)

Die Funktion `reconcileDocData`:

- Durchläuft `data.citations` in einem einzigen Durchlauf ($\mathcal{O}(N)$, wobei $N$ die Anzahl der Zitationsfelder ist).
- Prüft die Existenz in `session.documentCitationIDs` in konstanter Zeit ($\mathcal{O}(1)$).
- Baut simultan das `activeKeys: Set<string>` auf.

### 3.3 $\mathcal{O}(1)$ Lookups beim Rendern der Gliederungsansicht

Beim Rendern der Zeilen im Zitierdialog (`dialogOutlineRender.ts`):

- `activeKeys` wird für die Session einmalig in ein `Set<number>` lokaler Item-IDs gemappt (`v.cited`).
- In der Renderschleife (`renderRow`) prüft `v.cited.has(r.id)` das Vorhandensein in $\mathcal{O}(1)$.
- Es finden beim Scrollen, Filtern oder Tippen im Suchfeld **keine** JSON-Operationen, Array-Suchen oder Zotero-Abfragen statt.

### 3.4 Benchmark-Ergebnisse

In der automatisierten Testsuite (`test-unit/cited.test.ts`):

- **1.000 Zitationen** parsen, reconcilen und 1.000 Lookups durchführen: **< 2 ms** Gesamtlaufzeit.

---

## 4. Fußnoten-Nummerierung & Dokumentennavigation (Direktsprung)

### 4.1 Live-Extraktion aus `session.citationsByIndex`

In wissenschaftlichen Texten ändern sich Fußnotennummern fortlaufend (durch Einfügen oder Löschen früherer Fußnoten). FlexAnnotate speichert Fußnotennummern daher **nicht** statisch im XML ab, sondern liest sie bei Bedarf live aus der Zotero-Integrationssitzung aus:

- `session.citationsByIndex`: Zotero hält hier alle aktiven Zitationsfelder des Dokuments in Dokumentreihenfolge.
- `citation.properties.noteIndex`: Enthält den aktuellen 1-basierten Index der Fußnote bzw. Endnote im Textverarbeitungsprogramm (bei Zitationen im Fließtext / In-Text-Stilen ist `noteIndex === 0`).
- `buildCitationLocationsMap` / `getCitationLocations` (`src/features/organizer/logic/cited.ts`, `dialogCited.ts`): Verknüpft die `annKey`s aus `docData.citations` über die `citationID` mit den passenden Zitationsobjekten und sortiert sie aufsteigend nach ihrer Fußnotennummer sowie sekundär nach der Dokumentreihenfolge (`index` aus `citationsByIndex`).

### 4.2 Direktsprung in Word / LibreOffice & Re-Acquisition

In der persistenten Aufgabenleiste (dem Begleitfenster / Blätterfenster) ist die Word-Transaktion des vorherigen Einfügebefehls bereits abgeschlossen (`execCommand` in `xpcom/integration.js:332` hat `await document.complete()` im `finally`-Block aufgerufen). Dadurch ist der interne C++-COM-Zeiger des Dokuments freigegeben (`_documentStatus.active = false` in `zoteroWinWordIntegration.mjs:415`), und ein direkter Aufruf von `citation.field.select()` würde mit `"complete() method already called on document"` abbrechen.

FlexAnnotate löst das robust über ein zweistufiges Verfahren in `src/features/organizer/dialog/dialogCited.ts`:

1. **Windows Word Direktsprung via WScript/COM (`runWordJumpScript`):**
   Eine Disassemblierung der Zotero-C++-Bibliothek `libzoteroWinWordIntegration.dll` (Export `selectField` bei RVA `0xbd40`) belegt, dass Zotero auf Windows intern gar keine Selektion implementiert hat (der Aufruf setzt lediglich `Application.ScreenUpdating = 1` und liefert sofort Erfolg zurück). FlexAnnotate führt für Windows Word daher ein minimales, asynchrones VBScript (`flexannotate-jump-word.vbs`) über `wscript.exe` aus:
   - Greift via `GetObject(, "Word.Application")` direkt auf die laufende Word-Instanz zu.
   - Springt bei vorhandenem `noteIndex` direkt in die Fußnote (`targetDoc.Footnotes.Item(noteIndex).Range.Select`), scrollt das Word-Fenster per `targetDoc.ActiveWindow.ScrollIntoView` an die exakte Stelle und selektiert das Zitationsfeld.
   - Für Fließtext-Zitationen durchsucht es `StoryRanges` nach der `citationID`.
   - Aktiviert das Dokument und bringt Word per `WScript.Shell.AppActivate` sofort in den Vordergrund.
2. **Dynamische Re-Acquisition bei freigegebenem Dokument (Fallback & LibreOffice):**
   Für LibreOffice oder Mac-Umgebungen holt `jumpToCitation` über Zoteros Integrations-Schnittstelle eine frische Verbindung zum laufenden Dokument:
   ```ts
   const app = Zotero.Integration.getApplication(agent, "jump", docId);
   const doc = await (app.getDocument && docId
     ? app.getDocument(docId)
     : app.getActiveDocument());
   const fields = await doc.getFields(fieldType);
   // Matching nach citationID (oder noteIndex)
   await matchedField.select();
   ```
3. **Sicheres Aufräumen:**
   Im `finally`-Block werden `await doc.cleanup()` und `await doc.complete()` garantiert ausgeführt, sodass keine COM-Zeiger oder Dokument-Locks in Word lecken.

### 4.3 Fenster-Aktivierung auf Betriebssystem-Ebene (`bringWordProcessorToFront`)

In Zoteros nativer Windows-Integration ist `Document.prototype.activate` eine leere Funktion (`activate: function() {}`), weil Zotero im regulären Modus das Dialogfenster schließt und Windows den Fokus automatisch an Word zurückgibt. Im persistenten Begleitfenster bleibt der Dialog jedoch geöffnet.

FlexAnnotate bringt Word bzw. LibreOffice daher zuverlässig auf Betriebssystem-Ebene in den Vordergrund:

- **Windows:** Über Firefox/Zoteros natives `ctypes` (`resource://gre/modules/ctypes.sys.mjs`) wird `user32.dll` angesprochen:
  - `FindWindowW("OpusApp", null)` ermittelt das Fenster-Handle von Word (`SALFRAME` für LibreOffice).
  - `ShowWindow(hwnd, 9)` (`SW_RESTORE`) stellt das Fenster wieder her, falls es minimiert war.
  - `SetForegroundWindow(hwnd)` setzt Word in den Vordergrund. Da Zotero zum Klickzeitpunkt das aktive Vordergrundfenster ist, gestattet Windows diesen Fokuswechsel ohne Verzögerung.
- **macOS:** Auf Mac ruft FlexAnnotate `Zotero.Utilities.Internal.sendToBack()` auf, wodurch Zotero (falls im Vordergrund) per AppleScript versteckt wird und die zuvor aktive App, i. d. R. Word, nach vorn kommt (Anker in `docs/anchors.md`; auf macOS nicht getestet).
- **LibreOffice:** Ruft zusätzlich `doc.activate()` auf, was über LibreOffices UNO-API `frame.getContainerWindow().toFront()` auslöst.

### 4.4 UI-Darstellung: Vorschau-Chips & Hover-Popover (ohne Seitenleiste bei Titeln)

- **Hover-Popover auf dem grünen Haken (`✓`) für Titel und Annotationen:**
  Im `Titel`-Tab (Werks-Zitate) gibt es bewusst keine rechte Seitenleiste, um die Ansicht kompakt und übersichtlich zu halten.
  Stattdessen erscheint beim Hovern über das grüne Häkchen (`mouseenter`) ein schlankes, schwebendes Popover:
  ```text
  ┌─────────────────────────┐
  │ ZITIERT IN:             │
  │ [ Fn. 2 ]  [ Fn. 15 ]   │
  └─────────────────────────┘
  ```
  - **Click-to-Jump:** Jeder Chip ist ein Button, der beim Klick via `jumpToCitation` sofort zur entsprechenden Fußnote in Word springt und Word fokussiert.
  - **Clipping-sicher:** Das Popover wird absolut am Dokument gerendert (`position: fixed`) und per `getBoundingClientRect()` unter dem Haken platziert, sodass es niemals durch `overflow: hidden` der Listenansicht abgeschnitten wird.
  - **Automatisches Schließen:** Beim Verlassen von Haken und Popover schließt es sich mit einem kurzen Debounce (200 ms). Beim Scrollen der Liste schließt es sofort.
- **Vorschau-Spalte (rechts, bei Annotationen):** Für zitierte Annotationen erscheint unter dem Quellenhinweis weiterhin die Zeile `Zitiert in:` mit interaktiven Chips (z. B. `[ Fn. 3 ]`, `[ Fn. 12 ]` oder `[ Text ]`).
- **Liste (Mitte):** Der Tooltip des grünen Hakens (`✓`) zeigt die konkreten Fußnoten ohne Duplikate an, z. B. `Bereits zitiert (Fn. 3, Fn. 12)`.
- **Datenquelle für Werke:** Bei regulären Titeln (`r.kind === "work"`) werden die Fundstellen in $\mathcal{O}(1)$ über `getAllWorkCitationLocations()` aus `session.citationsByItemID[workID]` bezogen und mit `buildWorkCitationLocationsMap` nach Fußnotennummer sortiert.

---

## 5. Manuelle Markierungen & Prototype-Sicherheit

- **Manuelle Korrektur:** Klickt der Nutzer im Zitierdialog direkt auf das grüne Häkchen, wird die Annotation in `docData.manual` aufgenommen (oder daraus entfernt). Manuelle Markierungen sind bewusst dokumentweit aktiv und überstehen Zotero-Neustarts.
- **Sicherheit gegen Prototype-Pollution:** Beim Parsen und Reconcilen (`parseDocData`, `reconcileDocData`) werden gefährliche Objektschlüssel (`__proto__`, `constructor`, `prototype`) strikt ignoriert.

---

## 6. Beteiligte Dateien

- `src/features/organizer/logic/cited.ts`: Reine Logik für Parsing, Serialisierung, Reconciliation, Fußnoten-Mapping (`buildCitationLocationsMap`, `findCitationLocations`) und $\mathcal{O}(1)$-Set-Operationen (Node-testbar).
- `src/features/organizer/dialog/dialogCited.ts`: Schnittstelle zu Zoteros Integrations-Session (`session.data.prefs`, `session.documentCitationIDs`, `session.citationsByIndex`), Sprungfunktion (`jumpToCitation`).
- `src/features/citeOnly/integrationPatch.ts`: Pre-Generierung der `citationID` und Protokollierung beim Einfügen von Zitationen.
- `src/features/organizer/dialog/dialogOutline.ts` & `dialogOutlineRender.ts`: UI-Anbindung (Footnote-Chips, Direktsprung, Checkmark-Tooltip) und Styling (`LAYOUT_CSS`).
- `src/features/organizer/strings.ts`: Lokalisierte UI-Texte (Deutsch & Englisch für „Zitiert in:“, „Fn. {n}“, „Text“ und Sprunghinweise).
- `test-unit/cited.test.ts`: 22 Unit-Tests inkl. Performance-Benchmark, Fußnoten-Mapping und Randfall-Prüfungen.
- `test/citeOnly.test.ts`: Zotero-Integrationstests für den vollständigen Lebenszyklus und die Sprungnavigation.
