# FlexAnnotate — Architecture

FlexAnnotate is a bootstrapped Zotero plugin written in TypeScript and built with zotero-plugin-scaffold (version 2.0.0-dev.0, `strict_min_version` 7.0, `strict_max_version` 10.\*). It is developed against Zotero 10.0.5 and run through the automated suite on 7.0.32, 8.0.4, 9.0.6 and 10.0.5/10.0.6 (`npm run test:versions`); see the README for what each version supports. It combines two former plugins: the vanilla-JS FlexAnnotate (print annotations, citation-only insertion, Citavi import; tag `pre-merge` holds 1.2.0) and Annotree (organizer, a fork of Lattice).

References like `xpcom/integration.js:1678` are paths inside `chrome/content/zotero/` of Zotero's `omni.ja`. Unless marked "(10.0.1, not rechecked)" or given with another version, they were checked against 10.0.5. All anchors by version: [anchors.md](anchors.md).

## Contents

- [Layers](#layers)
- [Feature lifecycle](#feature-lifecycle)
- [Module map](#module-map)
- [Data model](#data-model)
- [Control flow](#control-flow)
- [Pitfalls](#pitfalls)
- [Teardown](#teardown)

## Layers

```
src/core/            pure logic, no Zotero imports, tested with node --test
src/shared/          feature registry, checked patching, citation dialog watcher
src/features/<f>/    one folder per feature; talks to Zotero
src/prefs/           script of the preference pane (separate bundle)
src/utils/           locale, prefs, menu registration, ztoolkit
```

Dependencies point downwards: features import `core`, `shared` and `utils`; `core` imports nothing from Zotero. Features: `print`, `citeOnly`, `citavi`, `reader`, `organizer`. `src/hooks.ts` is the only place that knows all features.

## Feature lifecycle

`src/shared/feature.ts` defines `Feature` with optional hooks `start`, `stop`, `addToWindow`, `removeFromWindow`. `startAll`, `stopAll`, `addToWindow` and `removeFromWindow` call them in order (stop in reverse) and log a failing hook without aborting the others or throwing.

`hooks.ts` holds the ordered `features` array and runs it:

1. `onStartup` waits for Zotero, calls `initLocale()`, exposes `addon.api` (used by the Zotero tests), registers the preference pane, runs `startAll(features)`, then `onMainWindowLoad` for every open window.
2. `onMainWindowLoad` inserts the FTL files and runs `addToWindow(features, win)`.
3. `onMainWindowUnload` runs `removeFromWindow`; `onShutdown` runs `stopAll`.

Global work (patches, observers, `MenuManager` menus) belongs in `start`/`stop`; DOM belongs in `addToWindow`/`removeFromWindow`. Both must be idempotent and check for their own element IDs.

## Module map

| Folder                   | Responsibility                                                                                                      | Key files                                                                                                                                                                                        |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `src/core`               | Rules without Zotero: locators, sort index, outline tree, Citavi parsing, cite-only rewrite, dialog view, selection | `locator.ts`, `printAnnotation.ts`, `outline.ts`, `citavi.ts`, `citeOnly.ts`, `cited.ts`, `dialogView.ts`, `docOutline.ts`, `selection.ts`                                                       |
| `src/shared`             | Registry and helpers used by several features                                                                       | `feature.ts`, `patch.ts` (`assignChecked`), `citationDialog.ts` (watcher + injectors)                                                                                                            |
| `src/features/print`     | Placeholder attachment, print annotations, input panel, menus                                                       | `placeholder.ts`, `printAnnotations.ts`, `dialog.ts`, `menus.ts`, `annotationRowMenu.ts`                                                                                                         |
| `src/features/citeOnly`  | Citation-only insertion and the mode selector                                                                       | `integrationPatch.ts`, `modeSelector.ts`                                                                                                                                                         |
| `src/features/citavi`    | Second import pass for Citavi, contribution links                                                                   | `citaviImport.ts`, `citaviPrintQuotes.ts`, `citaviLinks.ts`                                                                                                                                      |
| `src/features/reader`    | Reader context menu, locator in the page-number popup                                                               | `readerMenu.ts`, `labelPopup.ts`                                                                                                                                                                 |
| `src/features/organizer` | Organizer window, annotation index, outline model, citation dialog view, export, toolbar button, outline import     | `organizer*.ts`, `annotationIndex.ts`, `outlineModel.ts`, `dialogOutline*.ts`, `dialogCited.ts`, `outlineExport.ts`, `toolbarButton.ts`, `toolsMenuFallback.ts`, `openTarget.ts`, `docImport.ts` |
| `src/prefs`              | Fills the Citavi locator menulists in the preference pane                                                           | `preferences.ts`                                                                                                                                                                                 |
| `src/utils`              | Helpers from the scaffold template plus menu registration                                                           | `locale.ts`, `prefs.ts`, `menu.ts`, `ztoolkit.ts`                                                                                                                                                |
| `addon/`                 | Manifest, default prefs, XHTML of the pane, FTL (`de`, `en-US`), icons                                              | `manifest.json`, `prefs.js`, `content/preferences.xhtml`, `locale/*`                                                                                                                             |

The organizer window builds its DOM in code; its texts live in `organizer/strings.ts` (German and English). Menus and preferences use Fluent.

## Data model

All data lives in Zotero's own structures (tags, notes, child items), so it syncs and survives a plugin removal.

| Datum                                  | Where                             | Meaning                                                                         |
| -------------------------------------- | --------------------------------- | ------------------------------------------------------------------------------- |
| `#flexannotate-placeholder`            | tag on the placeholder attachment | marks the generated PDF that carries print annotations                          |
| `#flexannotate-locator-<type>`         | automatic tag on an annotation    | CSL locator type; absent for `page` unless the document default differs         |
| `#flexannotate-default-locator-<type>` | automatic tag on an attachment    | default locator for annotations created later; `page` is never tagged           |
| `§Title`                               | tag on annotations and works      | files the item under the outline heading `Title`                                |
| `★outline`                             | tag on a standalone note          | the note holds the outline tree as JSON after the sentinel `LATTICE-OUTLINE-V1` |
| `citedAnnotations`                     | preference                        | per document session id: annotation id to work id, at most 50 documents         |

### Placeholder attachment

Zotero accepts annotations only under a file attachment with an `attachmentReaderType` (`xpcom/data/item.js:2246-2259`; reader types from the content type, `:3530-3540`). A regular item or a linked URL as parent throws on save. `placeholder.create()` therefore imports a generated one-page PDF (`core/printAnnotation.ts: buildPlaceholderPDF`) as a child, titled from `placeholder-title`, and tags it. The file is generated at runtime because `Zotero.Attachments.importFromFile()` needs a real path and `rootURI` inside an XPI is a `jar:` URI. `isPlaceholder()` checks the tag, not the title. `cleanUpIfEmpty()` erases the placeholder after its last annotation unless `keepEmptyPlaceholders` is set.

### Annotation field rules

Enforced by Zotero in `xpcom/data/item.js` (10.0.5 line numbers):

| Rule                                                                             | Line         |
| -------------------------------------------------------------------------------- | ------------ |
| `annotationType` must be set before any other annotation field                   | `:4511`      |
| Type changes only between `highlight` and `underline`                            | `:4518-4520` |
| `annotationText` only for `highlight` and `underline`                            | `:4530-4531` |
| `annotationColor` must match `/#[a-f0-9]{6}/` (lowercase)                        | `:4537`      |
| `annotationSortIndex` must match `/^\d{5}\|\d{6}\|\d{5}$/` for a PDF parent      | `:4547`      |
| `annotationPageLabel` is saved as `pageLabel \|\| null` and reads back as `null` | `:2290`      |

`printAnnotations.create()` sets the type first, folds quoted text into the comment for type `note`, falls back to `#ffd400` for invalid colors and writes a fixed `annotationPosition` (`pageIndex` 0, one zero rect), because the PDF parent requires the field and no geometry exists. The printed page goes into `annotationPageLabel`; `buildSortIndex()` takes the first digit run, clamps it to 99999 and pads it, so a label without digits sorts last.

### Locator type

`core/locator.ts` resolves the locator in this order: tag on the annotation, default tag on the attachment, `page`. `setDefaultLocator()` first freezes existing annotations without an explicit tag to the previous default, so changing the default never alters old annotations. `applyLocatorTag()` removes old locator tags before writing the new one.

### Outline note

`core/outline.ts` and `organizer/outlineModel.ts` read and write the note. Zotero rewrites `<pre><code>` to `<pre>` on save; the reader accepts both. Numbers such as `1.2.3` are computed for display and never stored. Format and tags are compatible with Lattice.

`OutlineModel.save()` creates the note with `saveTx({ skipSelect: true })`. If several notes carry `★outline` (for example after a sync conflict), `findNote()` takes `pickNewest()` (`core/outline.ts`): latest `dateModified`, on a tie the higher id, so the result does not depend on the input order. See pitfall 14.

## Control flow

### Create a print annotation

1. `printMenus` (`menus.ts`) adds a separator and three entries to `zotero-itemmenu` and toggles them on `popupshowing` through `core/printMenuState.ts`.
2. The entry calls `dialog.open(win, item)`, which awaits `Zotero.Styles.init()`, builds a XUL `<panel>` once (`parseXULToFragment`) and fills locator and color menulists.
3. On save, `printAnnotations.create()` calls `placeholder.ensure(item)`, creates the annotation under it and applies the locator tag.
4. Edit and delete use the same panel; `annotationRowMenu.ts` adds a popup for `annotation-row` elements in the item pane via one capture-phase `contextmenu` listener on the document.

### Citation-only insertion

1. `citeOnlyPatch.start()` replaces `Zotero.Integration.Session.prototype._insertCitingResult` (`xpcom/integration.js:1678`) through `assignChecked`; a failed patch throws and is logged by the registry.
2. Zotero branches there: annotations become a mock note; everything else goes to `_insertItemsIntoDocument()` (`:1778`).
3. With `citationOnly` set, the patched method calls `core/citeOnly.ts: citationOnlyItems`. Only when every cited item is an annotation with a citable top-level item does it build a new item list (parent item, `annotationPageLabel` as locator, locator tag as label), assign it to the same citation object and call `_insertItemsIntoDocument()` itself.
4. Any other case, or any error, falls through to the original method. The citation object is mutated, not cloned, because the session later calls `.serialize()` on it (`:1778-1785`).
5. The mode selector is injected into the citation dialog (see next flow) and writes the same preference.

### Citation dialog: shared watcher and injectors

1. `shared/citationDialog.ts` registers one `Services.wm` listener. For each window with `location.href` equal to `chrome://zotero/content/integration/citationDialog.xhtml` it waits until `DIALOG_STATE.loaded` (`integration/citationDialog.js:149`).
2. It then calls every registered `DialogInjector.inject(win)` once, in registration order: first `modeSelector`, then `outlineView` (`organizer/dialogOutline.ts`).
3. `modeSelector` adds the "Einfügen als" select to the settings popup and the item popup and follows `dialog-type` changes with a `MutationObserver`.
4. `outlineView` adds the "Nach Gliederung anordnen" checkbox to the annotations view. When on, it renders tree, list and preview in the dialog's three columns. Inserting clicks the "+" of a hidden native `annotation-row`, so Zotero's own insertion code runs.
   The plugin sets no width of its own on `#sidebar`, so the right column keeps Zotero's width with and without the view. The CSS it adds only keeps long rows from widening the layout (`LAYOUT_CSS` in `dialogOutline.ts`).
   Zotero's own search bar is mirrored into the outline filter: `bubble-input` fires `handle-input` (`detail.query`) on the document (`integration/citationDialog.js:1261`, `elements/bubbleInput.js:333`), and `addSearchSync` writes the query into the plugin's filter field and re-renders. The filter field is never written back.
   With exactly one annotation selected, the preview offers "Zitatstelle anzeigen": `openTarget.openRow()` calls `Zotero.Reader.open(attachmentID, { annotationID: key })` and activates the main window with `Zotero.Utilities.Internal.activate`. The dialog stays open.
5. On `accept`, `dialogCited.ts` wraps `io.accept` to record cited annotation ids per document session id. An entry counts as cited while its work is still cited in the document.
6. An unload of the window or `stop()` calls `detach` of every injector. A failing injector does not stop the others.

### Citavi import

Zotero's importer walks `//Annotations/Annotation` (nodes with `Quads`) and skips sources without an attachment (`import/citavi.js:76-80`). Quotes on printed sources exist only as `<KnowledgeItem>`.

1. `CitaviImport.patch()` (feature `start`) wraps `Zotero.Translate.Import.prototype.translate`. After a Citavi XML translation it keeps the translation object (`_itemSaver._IDMap`, `_io`).
2. `CitaviImport.addToWindow()` patches `importFile` and `importFromClipboard` of each window's own `Zotero_File_Interface`. The pass runs in their `finally`, after Zotero's own annotation pass (`fileInterface.js:686`).
3. `importPrintQuotes` re-inits the XML stream, collects anchored IDs from `//EntityLinks/EntityLink/SourceID` and creates print annotations for the other `KnowledgeItem`s (colors and text distribution from `QUOTATION_TYPES`, locator type from `PageRange` `<nt>` through the `citaviLocator*` preferences).
4. For quotes it created, it removes the translator's note only if the note starts with `CoreStatement` + `Text` and the remainder looks like a locator (`isPageTail`, at most 60 characters of digits, spaces and hyphens). `citaviKeepNotes` disables this.
   Keywords: `//KnowledgeItemKeywords/OnetoN` holds one text per item, `ID:…;KeywordID:…;…`. The first member is the id of the `KnowledgeItem`, the others are keyword ids (the part after `:` is ignored). `splitOnetoN()` and `resolveKeywords()` (`core/citavi.ts`) match the owner id exactly and look up each keyword name by id. The earlier prefix match (`starts-with`) let id `K1` hit the node of `K10`.
   Duplicates: before saving, `isDuplicateAnnotation()` compares the candidate with the existing annotations of the same work's placeholder: equal page label and equal normalized quote text (markup stripped); with an empty text, the comment counts instead. A second import of the same export therefore creates nothing.
5. `linkContributions` reads `ReferenceReferences/OnetoN` (`Parent;Child1;Child2…`) and adds related-item links between parent and children and among siblings in one transaction. The translator does not do this (`xpcom/translation/translate_item.js:1081-1089` is commented out).

### Outline import from Word/LibreOffice

1. The document icon in the outline toolbar (`organizerTree.ts`) calls `docImport.start()`. `pickFile()` uses Zotero's `FilePicker` wrapper (`modules/filePicker.mjs`, which adapts `init()` per version, see anchors.md) with the filter `*.docx; *.odt`.
2. `readHeadings()` opens the file with `nsIZipReader`, rejects entries above `MAX_ENTRY_BYTES` (50 MB) before reading, and reads `word/document.xml` (+ `word/styles.xml`) or `content.xml` through `Zotero.File.getContentsAsync(stream)`. The reader is always closed.
3. `core/docOutline.ts` scans the XML with a small tokenizer (no DOM). DOCX: the level comes from the paragraph's `outlineLvl`, else from its style (`outlineLvl` of the style, style name `Heading n`/`Überschrift n`, `basedOn` chain, last the style id); `w:del`/`w:moveFrom` text is skipped. ODT: `text:h` with `outline-level`; `text:note` and `text:deletion` are skipped. Headers, footers and footnote parts are never read; text boxes are not treated separately.
4. `normalizeHeadings()` makes the levels gapless and, if at least 80 % (and at least 3) of the titles start with a manual number (`STRIP_RE`), reports `numberingDetected`; stripping is applied only if the user ticks the box.
5. `planOutlineImport()` plans an append-merge against the current tree (`reuse` under the same parent by NFC-normalized, case-insensitive title, else `create` as last child; collisions with any existing title become `Title (2)`). `applyImportPlan()` works on a copy. Only if something is created, the tree is saved through `OutlineModel.save()`.

## Pitfalls

Rules that still apply. Line numbers are 10.0.5 unless marked.

1. **Silent patch failure.** Assigning to a frozen object does nothing outside strict mode and throws inside it; an Xray expando swallows the write. Always use `assignChecked()` (`shared/patch.ts`): assign in `try`/`catch`, read back, compare identity. CommonJS modules from `require()` run in their own sandbox with frozen `exports` (`resource/require.js`, `resource/loader.sys.mjs`) and are no patch targets.
2. **`Zotero_File_Interface` is not a singleton.** Every window that loads `fileInterface.js` has its own object (`fileInterface.js:179`; the wizard loads it itself, `import/importWizard.xhtml:22`). Patch per window; the failure is silent.
3. **Order of the Citavi passes.** Zotero takes the attachment with `getAttachments()[0]` (`import/citavi.js:76,82`). A placeholder created earlier can receive PDF annotations, so the print pass must run after Zotero's.
4. **Startup cache.** Zotero loads `bootstrap.js` with `ignoreCache: true` (`xpcom/plugins.js:205-210`); the bundled build has no inner script loading of its own. The pane script is the exception, which Zotero loads without it: after changing `preferences.ts`, start once with `-purgecaches` (10.0.1, not rechecked).
5. **XUL parses only in privileged chrome documents.** A plugin cannot register a `chrome.manifest`; `openDialog()` with `file:` or `jar:` URLs gives an empty window. Build UI with `MozXULElement.parseXULToFragment()` in the main window, as Zotero does in `elements/*.js` (10.0.1, not rechecked).
6. **`Zotero.Styles.init()` before locator labels.** `Cite.getLocatorString()` reads `Object.keys(Zotero.Styles.locales)` (`xpcom/cite.js:54`), and `locales` is set at the end of `init()` (`xpcom/style.js:154`). `init()` returns a running initialization as a promise (`:68-77`). `getLocatorString()` creates its per-locale map before filling it (`cite.js:66-67`), so an aborted fill leaves later calls returning `undefined`; fall back to the raw locator name.
7. **Preference pane menulists.** Pane scripts run in a sandbox before the fragment exists (`preferences/preferences.js:313-320`, `translateFragment` at `:355`). Zotero fires a `load` event at each pane child (`:617-618`): listen on `document` in the capture phase and re-check each time. Zotero resyncs late-added menuitems through a `MutationObserver` only if the binding exists (`:516-524`); set `elem.value` after filling instead. The pane needs its own `<linkset>` with the plugin FTL (`preferences_general.xhtml:29`).
8. **Fluent value messages versus XUL labels.** `data-l10n-id` sets `textContent`, a `<menuitem>` shows `label`. Use `Zotero.getString()` for color names (`Zotero.Annotations.COLORS` are `[l10n-id, hex]` pairs, `xpcom/annotations.js:40-42`; the `getString` pattern is from `elements/zoteroSearch.js`, 10.0.1 line 1269, not rechecked).
9. **`strict_max_version` is mandatory on Zotero 10.** Without it the plugin is dropped silently at manifest parsing (tested on 10.0.1 with five otherwise identical plugins). `extensions.strictCompatibility` is `false` in `defaults/preferences/zotero.js:6`, but the toolkit sets `addon.strictCompatibility` itself for release builds (`XPIInstall.sys.mjs:507`, toolkit `omni.ja`, 10.0.1, not rechecked).
10. **Item context menu.** `buildItemContextMenu()` removes only its own `zotero-locate` entries (`zoteroPane.js:4196-4199`) and hides only its known options, so appended plugin entries persist and must manage their own visibility on `popupshowing`. For annotation selections the function returns at `:4680`, before `Zotero.MenuManager.updateMenuPopup` (`:4685`), so `MenuManager` entries never update for annotations. `printMenus` therefore uses DOM, not `MenuManager`.
11. **The plugin scope is global, windows are not.** Module objects exist once per session, elements once per window. State of one interaction belongs on the element (expando on the panel, attribute on the popup), per-window bookkeeping in a `WeakMap`. Do not use a "some window is set up" flag; collect windows and test for empty.
12. **`MenuManager` unregistration needs the returned key.** `registerMenu()` returns a key; `unregisterMenu()` with the raw `menuID` finds nothing (`utils/menu.ts`; `xpcom/pluginAPI/menuManager.js:824,833`). `unregisterAllPluginMenus()` stores the keys.
13. **`Zotero.Reader.open` is wrapped by `readerMenu`** and restored through `assignChecked` on stop (`readerMenu.ts`); `Reader.open` is at `xpcom/reader.js:2917`.
14. **Zotero's note editor can overwrite the outline note.** A note that gets selected in the item tree opens in the note editor, and `EditorInstance._save()` (`xpcom/editorInstance.js:1149`; it calls `item.setNote(html)` at `:1177`) writes the editor's copy back, also for a later change it did not see. Selection after a save is suppressed only for `skipSelect` (`xpcom/data/dataObject.js:1053-1054`; `collectionViewItemTree.js:816, 1040`). `OutlineModel.save()` therefore creates the note with `skipSelect: true`. If the user opens the note in the editor, the editor can still overwrite later organizer saves; nothing in the plugin prevents that. No test opens the note in the editor, so the overwrite itself is derived from the source, not reproduced.

## Teardown

`onShutdown` calls `stopAll(features)` in reverse order: patches are restored through `assignChecked` (`_insertCitingResult`, `translate`, per-window `Zotero_File_Interface` methods, `Reader.open`), the citation dialog watcher detaches all injectors (including those in open dialogs), `MenuManager` menus are unregistered by key, the annotation index unloads its notifier observer, and `ztoolkit.unregisterAll()` removes toolkit UI. `removeFromWindow` removes the toolbar button, item-menu entries and the annotation popup of each window. Each patch checks its target before patching and verifies the result after; on failure only that feature disables itself and logs a warning.
