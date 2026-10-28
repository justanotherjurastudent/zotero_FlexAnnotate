# Document-wide citation tracking ("green checkmarks like in Citavi")

This document describes the architecture, data model and performance optimisations of the citation tracking in FlexAnnotate that works across sessions and computers.

## 1. Motivation and problem

In the Zotero citation dialog (reachable from Microsoft Word, LibreOffice Writer or the persistent companion window), the outline view ("arrange by outline") marks citations already used in the document with a green checkmark (`✓`) to prevent accidental double citations.

### The problem with the earlier solution

Older versions stored this status in the local Zotero preferences (`Zotero.Prefs.get("extensions.flexannotate.citedAnnotations")`), stored under `session.sessionID`:

1. **Volatile session IDs:** In Zotero (`xpcom/integration.js:1069`), `session.sessionID` is a random in-memory string (`Zotero.randomString()`). It is recreated at every Zotero restart and overwritten in the Word document. The old pref entries were orphaned right away.
2. **No synchronisation:** the profile file `prefs.js` exists only on the local machine. If the Word document was opened on another computer or by a co-author, all checkmarks were gone.
3. **No automatic cleanup:** if a footnote was deleted in Word, the annotation stayed marked as "cited" as long as any citation of the parent work remained in the document.

## 2. Technical solution

### 2.1 Storage location: Word document variables (`session.data.prefs`)

Zotero persists document settings (such as citation style and language) directly in the Word or LibreOffice document through internal document variables (`ZOTERO_PREF_1` etc.).

When serialising into Zotero's own document XML (`xpcom/integration.js:2706–2722`), Zotero writes all properties of `this.prefs` as `<pref name="..." value="..."/>` elements. When reading back through `unserializeXML` (`xpcom/integration.js:2736–2747`), all existing pref entries are loaded unchanged into the JavaScript object `session.data.prefs`.

FlexAnnotate stores the citation data under the key `flexannotate_cited` as a compact **JSON string**:

```json
{
  "citations": {
    "c_K8X29PLA": ["ANN_KEY_1"],
    "c_M4B11ZZR": ["ANN_KEY_2", "ANN_KEY_3"]
  }
}
```

#### Properties of this store

- **Document-bound:** the information travels with the `.docx` or `.odt` file (by mail, cloud, Git or USB stick).
- **Machine-independent:** because the stable 8-character Zotero sync keys (`item.key`) are stored, the tracking behaves identically on every machine, even when the local SQLite IDs (`item.id`) differ.
- **Co-author compatible:** even when co-authors do not have FlexAnnotate installed, Zotero's native integration code passes unknown `<pref>` tags through unchanged; the data is not deleted.
- **Backwards-compatible fallback:** if an existing document has no document pref yet (`readDocCitedData() === null`), FlexAnnotate transparently falls back to the local pref store.

### 2.2 Citation lifecycle (`citationID`)

Every citation field in Word has a unique `citationID`. In Zotero's regular flow this ID is only rolled in `Session.prototype.addCitation` (`xpcom/integration.js:2230`):

```javascript
var duplicateIndex = this.documentCitationIDs[citation.citationID];
var needNewID = !citation.citationID || duplicateIndex != undefined;
if (needNewID) {
  citation.citationID = Zotero.Utilities.randomString();
}
```

FlexAnnotate uses this property in `src/features/citeOnly/integrationPatch.ts`:

1. **Pre-initialisation:** before passing it to `_insertItemsIntoDocument` resp. Zotero's native insertion routine, `citation.citationID` is pre-filled with `Zotero.Utilities.randomString()` if it is still empty.
2. **Permanent ID:** because the ID is already set and not yet present in `documentCitationIDs`, Zotero takes this exact identifier unchanged into the Word field.
3. **Linking:** FlexAnnotate stores `citationID -> [annKey, ...]` in `session.data.prefs.flexannotate_cited`.

---

### 2.3 Disappearing automatically when the footnote is deleted (reconciliation)

Like in Citavi, the green checkmark disappears automatically when the user deletes the matching footnote in the word processor:

1. **Field scan by Zotero:** whenever the citation dialog is opened or "Refresh" / "Add/Edit Citation" is clicked in Word, Zotero runs `updateFromDocument()` (`xpcom/integration.js:1890`). This refills `session.documentCitationIDs` freshly, so it contains only citations whose field actually exists in Word.
2. **Reconciliation (`reconcileDocData` in `src/features/organizer/logic/cited.ts`):**
   - FlexAnnotate iterates over all `citationID`s listed in `docData.citations`.
   - If a `citationID` is no longer present in `session.documentCitationIDs`, the footnote was deleted and the entry is removed from `docData.citations`.
   - If an annotation was cited only in this one footnote, its key disappears from the active citations and the green checkmark goes out.
   - If the same annotation was cited in several places (e.g. footnote 3 and 12), the checkmark stays active while at least one footnote is still in the text.
3. **Writing back automatically:** the cleaned `docData` object is persisted directly in `session.data.prefs.flexannotate_cited`.

### 2.4 Use across devices (multi-device and co-authors)

A common question: _"How does the plugin behave if I work on several machines or only one of them has the plugin installed?"_

1. **Machine A (with FlexAnnotate) → machine B (with FlexAnnotate):**
   - The tracking information (`flexannotate_cited`) is stored directly in the document properties of the `.docx` or `.odt` file, so it travels with the file (e.g. via OneDrive, Google Drive, Dropbox, Nextcloud, email or USB stick).
   - Zotero's standard synchronisation syncs the PDF annotations and their unique 8-character keys (`item.key`) between the two machines.
   - When the document is opened on machine B, FlexAnnotate reads the citation data from the Word document and shows exactly the same green checkmarks and footnote chips as on machine A.

2. **Machine A (with FlexAnnotate) → machine B (WITHOUT FlexAnnotate, only stock Zotero):**
   - Zotero's native word-processing integration passes unknown `<pref>` elements in the document data (`session.data.prefs`) through unchanged, so there is no data loss.
   - The citations inserted with FlexAnnotate are regular Zotero citation fields. On machine B they can be updated, formatted or extended normally.
   - When the document is later opened again on machine A, `reconcileDocData` compares the list of citations with the actual fields in the document: if footnotes were deleted on machine B, the green checkmarks disappear automatically.

3. **Why not store it in a local database?**
   - Local SQLite primary keys (`item.id`) are not identical across devices (machine A can assign ID `1420` for the same annotation, machine B ID `873`).
   - By tying to the global Zotero sync key (`item.key`) and storing in the Word file itself, the system is fully decentral, free of synchronisation and collision-tolerant.

## 3. Performance and scalability for large documents

In dissertations or monographs with 500 to 1,000+ footnotes, the citation check must not slow down typing or the rendering of the dialog.

### 3.1 Compact data format

Instead of redundant metadata (titles, URLs, page numbers), only 8-character alphanumeric strings are stored:

- Per citation about 25 to 35 bytes (e.g. `"c_K8X29PLA":["P8R4W3KZ"]`).
- 500 citations take up around **15 KB** as a JSON string.
- 1,000 citations take up around **30 KB**.
  This is far below the capacity limits of Word document variables and can be serialised in fractions of a millisecond.

### 3.2 Linear single pass ($\mathcal{O}(N)$)

The function `reconcileDocData`:

- runs through `data.citations` in a single pass ($\mathcal{O}(N)$, with $N$ the number of citation fields),
- checks the existence in `session.documentCitationIDs` in constant time ($\mathcal{O}(1)$),
- builds the `activeKeys: Set<string>` at the same time.

### 3.3 $\mathcal{O}(1)$ lookups when rendering the outline view

When rendering the rows in the citation dialog (`dialogOutlineRender.ts`):

- `activeKeys` is mapped once per session into a `Set<number>` of local item IDs (`v.cited`).
- In the render loop (`renderRow`), `v.cited.has(r.id)` checks the presence in $\mathcal{O}(1)$.
- While scrolling, filtering or typing in the search field, **no** JSON operations, array searches or Zotero queries take place.

### 3.4 Benchmark results

In the automated test suite (`test-unit/cited.test.ts`):

- Parsing, reconciling and doing 1,000 lookups for **1,000 citations** takes **under 2 ms** in total.

## 4. Footnote numbering and document navigation (direct jump)

### 4.1 Live extraction from `session.citationsByIndex`

Footnote numbers change continuously in academic texts (by inserting or deleting earlier footnotes). FlexAnnotate therefore does **not** store footnote numbers statically in the XML, but reads them live from the Zotero integration session when needed:

- `session.citationsByIndex`: Zotero holds all active citation fields of the document here, in document order.
- `citation.properties.noteIndex`: contains the current 1-based index of the footnote or endnote in the word processor (`noteIndex === 0` for in-text citations / in-text styles).
- `buildCitationLocationsMap` / `getCitationLocations` (`src/features/organizer/logic/cited.ts`, `dialogCited.ts`): link the `annKey`s from `docData.citations` via the `citationID` to the matching citation objects and sort them ascending by footnote number, secondary by document order (`index` from `citationsByIndex`).

### 4.2 Direct jump in Word / LibreOffice and re-acquisition

In the persistent task bar (the companion / browse window), the Word transaction of the previous insert command is already finished (`execCommand` in `xpcom/integration.js:332` has called `await document.complete()` in the `finally` block). The internal C++ COM pointer of the document is therefore released (`_documentStatus.active = false` in `zoteroWinWordIntegration.mjs:415`), and a direct call of `citation.field.select()` would abort with `"complete() method already called on document"`.

FlexAnnotate solves this reliably with a two-step procedure in `src/features/organizer/citationDialog/dialogCited.ts`:

1. **Windows Word direct jump via WScript/COM (`runWordJumpScript`):**
   A disassembly of Zotero's C++ library `libzoteroWinWordIntegration.dll` (export `selectField` at RVA `0xbd40`) shows that on Windows Zotero internally implements no selection at all (the call only sets `Application.ScreenUpdating = 1` and returns success right away). For Windows Word FlexAnnotate therefore runs a minimal, asynchronous VBScript (`flexannotate-jump-word.vbs`) via `wscript.exe`:
   - accesses the running Word instance directly via `GetObject(, "Word.Application")`,
   - with an existing `noteIndex`, jumps straight into the footnote (`targetDoc.Footnotes.Item(noteIndex).Range.Select`), scrolls the Word window to the exact place via `targetDoc.ActiveWindow.ScrollIntoView` and selects the citation field,
   - for in-text citations it searches the `StoryRanges` for the `citationID`,
   - activates the document and brings Word to the foreground immediately via `WScript.Shell.AppActivate`.
2. **Dynamic re-acquisition with a released document (fallback and LibreOffice):**
   For LibreOffice or Mac environments, `jumpToCitation` gets a fresh connection to the running document through Zotero's integration interface:
   ```ts
   const app = Zotero.Integration.getApplication(agent, "jump", docId);
   const doc = await (app.getDocument && docId
     ? app.getDocument(docId)
     : app.getActiveDocument());
   const fields = await doc.getFields(fieldType);
   // Matching by citationID (or noteIndex)
   await matchedField.select();
   ```
3. **Safe cleanup:**
   in the `finally` block, `await doc.cleanup()` and `await doc.complete()` are guaranteed to run, so no COM pointers or document locks leak in Word.

### 4.3 Window activation at the OS level (`bringWordProcessorToFront`)

In Zotero's native Windows integration, `Document.prototype.activate` is an empty function (`activate: function() {}`), because Zotero closes the dialog window in regular mode and Windows automatically returns focus to Word. In the persistent companion window the dialog stays open.

FlexAnnotate therefore brings Word resp. LibreOffice reliably to the foreground at the OS level:

- **Windows:** via Firefox/Zotero's native `ctypes` (`resource://gre/modules/ctypes.sys.mjs`), `user32.dll` is addressed:
  - `FindWindowW("OpusApp", null)` determines the window handle of Word (`SALFRAME` for LibreOffice).
  - `ShowWindow(hwnd, 9)` (`SW_RESTORE`) restores the window if it was minimised.
  - `SetForegroundWindow(hwnd)` puts Word in the foreground. Since Zotero is the active foreground window at click time, Windows allows this focus change without delay.
- **macOS:** on Mac, FlexAnnotate calls `Zotero.Utilities.Internal.sendToBack()`, which hides Zotero via AppleScript (if it is in the foreground) and brings the previously active app, usually Word, to the front (anchor in `docs/anchors.md`; not tested on macOS).
- **LibreOffice:** additionally calls `doc.activate()`, which triggers `frame.getContainerWindow().toFront()` through LibreOffice's UNO API.

### 4.4 UI presentation: preview chips and hover popover (no sidebar for works)

- **Hover popover on the green checkmark (`✓`) for works and annotations:**
  In the `Work` tab (work citations) there is deliberately no right sidebar, to keep the view compact.
  Instead a slim floating popover appears when hovering over the green checkmark (`mouseenter`):
  ```text
  ┌─────────────────────────┐
  │ CITED IN:               │
  │ [ Fn. 2 ]  [ Fn. 15 ]   │
  └─────────────────────────┘
  ```
  - **Click-to-jump:** each chip is a button that jumps via `jumpToCitation` to the matching footnote in Word on click and focuses Word.
  - **Clipping-safe:** the popover is rendered absolutely to the document (`position: fixed`) and placed below the checkmark via `getBoundingClientRect()`, so it is never cut off by `overflow: hidden` of the list view.
  - **Automatic closing:** leaving checkmark and popover closes it with a short debounce (200 ms). Scrolling the list closes it immediately.
- **Preview column (right, for annotations):** for cited annotations, the line `Cited in:` with interactive chips stays under the source note (e.g. `[ Fn. 3 ]`, `[ Fn. 12 ]` or `[ Text ]`).
- **List (middle):** the tooltip of the green checkmark (`✓`) shows the concrete footnotes without duplicates, e.g. `Already cited (Fn. 3, Fn. 12)`.
- **Data source for works:** for regular works (`r.kind === "work"`), the locations are obtained in $\mathcal{O}(1)$ via `getAllWorkCitationLocations()` from `session.citationsByItemID[workID]` and sorted by footnote number with `buildWorkCitationLocationsMap`.

## 5. Dynamic checkmarks and prototype safety

- **Strictly dynamic checkmarks:** green checkmarks in the citation dialog cannot be toggled or removed by hand; they appear and disappear automatically from the document's active citations.
- **Prototype-pollution safety:** when parsing and reconciling (`parseDocData`, `reconcileDocData`), dangerous object keys (`__proto__`, `constructor`, `prototype`) are strictly ignored.

## 6. Involved files

- `src/features/organizer/logic/cited.ts`: pure logic for parsing, serialisation, reconciliation, footnote mapping (`buildCitationLocationsMap`, `findCitationLocations`) and $\mathcal{O}(1)$ set operations (Node-testable).
- `src/features/organizer/citationDialog/dialogCited.ts`: interface to Zotero's integration session (`session.data.prefs`, `session.documentCitationIDs`, `session.citationsByIndex`), jump function (`jumpToCitation`).
- `src/features/citeOnly/integrationPatch.ts`: pre-generation of the `citationID` and logging when inserting citations.
- `src/features/organizer/citationDialog/dialogOutline.ts` and `dialogOutlineRender.ts`: UI integration (footnote chips, direct jump, checkmark tooltip) and styling (`LAYOUT_CSS`).
- `src/features/organizer/strings.ts`: localised UI texts (German and English for "Cited in:", "Fn. {n}", "Text" and jump hints).
- `test-unit/cited.test.ts`: 22 unit tests incl. performance benchmark, footnote mapping and edge-case checks.
- `test/citeOnly.test.ts`: Zotero integration tests for the full lifecycle and the jump navigation.
