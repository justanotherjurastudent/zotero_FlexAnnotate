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

## 4. Manuelle Markierungen & Prototype-Sicherheit

- **Manuelle Korrektur:** Klickt der Nutzer im Zitierdialog direkt auf das grüne Häkchen, wird die Annotation in `docData.manual` aufgenommen (oder daraus entfernt). Manuelle Markierungen sind bewusst dokumentweit aktiv und überstehen Zotero-Neustarts.
- **Sicherheit gegen Prototype-Pollution:** Beim Parsen und Reconcilen (`parseDocData`, `reconcileDocData`) werden gefährliche Objektschlüssel (`__proto__`, `constructor`, `prototype`) strikt ignoriert.

---

## 5. Beteiligte Dateien

- `src/features/organizer/logic/cited.ts`: Reine Logik für Parsing, Serialisierung, Reconciliation und $\mathcal{O}(1)$-Set-Operationen (Node-testbar).
- `src/features/organizer/dialog/dialogCited.ts`: Schnittstelle zu Zoteros Integrations-Session (`session.data.prefs`, `session.documentCitationIDs`), Mapping von Sync-Keys auf lokale Fenster-IDs.
- `src/features/citeOnly/integrationPatch.ts`: Pre-Generierung der `citationID` und Protokollierung beim Einfügen von Zitationen.
- `src/features/organizer/dialog/dialogOutline.ts` & `dialogOutlineRender.ts`: UI-Anbindung und Live-Aktualisierung im Zitierdialog.
- `test-unit/cited.test.ts`: 15 Unit-Tests inkl. Performance-Benchmark und Randfall-Prüfungen.
- `test/citeOnly.test.ts`: Zotero-Integrationstests für den vollständigen Lebenszyklus.
