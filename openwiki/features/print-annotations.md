---
type: feature
title: Print Annotations
description: Creating and managing annotations for printed/physical media without attached PDFs, placeholder attachments, page label locator popups, and menu integration.
tags: [print-annotations, placeholder-attachment, annotations, xul-panel, context-menu, locator-tags, zotero-internals]
verified:
  - by: openwiki/0.7.2
    at: 2026-10-16T19:49:13.348Z
sources:
  - id: openwiki-source-956835b1752f01a3d7799dd0
    resource: repo://addon/locale/en-US/addon.ftl
  - id: openwiki-source-b9c2588debeb2af18098f399
    resource: repo://docs/anchors.md
  - id: openwiki-source-115b2dad781e2a2c5b5a980d
    resource: repo://docs/architecture.md
  - id: openwiki-source-9de21399094753516f4782e2
    resource: repo://src/core/labelPopup.ts
  - id: openwiki-source-8b3e5ee735c3e2c4b153403d
    resource: repo://src/core/locator.ts
  - id: openwiki-source-965e4bd9bd8c9e95faec15d1
    resource: repo://src/core/printDialog.ts
  - id: openwiki-source-b390002b3c21cd54df94b8e4
    resource: repo://src/features/citavi/citaviPrintQuotes.ts
  - id: openwiki-source-23e4e70f42c4d9c767e9a999
    resource: repo://src/features/organizer/annotationIndex.ts
  - id: openwiki-source-76bd23f3a07acd2400abb8d8
    resource: repo://src/features/print/annotationRowMenu.ts
  - id: openwiki-source-14294881b17ba133d14ada2d
    resource: repo://src/features/print/dialog.ts
  - id: openwiki-source-0d1333c3c5dde69ff0b6f9ea
    resource: repo://src/features/print/logic/printAnnotation.ts
  - id: openwiki-source-961c406a7d9c3ced3f50a02e
    resource: repo://src/features/print/logic/printMenuState.ts
  - id: openwiki-source-95cc8ccb0c0882676d49aa26
    resource: repo://src/features/print/menus.ts
  - id: openwiki-source-a2e0a3ad1d08d60deac0b75a
    resource: repo://src/features/print/placeholder.ts
  - id: openwiki-source-ecfe002007c7fceaaf2e66ec
    resource: repo://src/features/print/printAnnotations.ts
  - id: openwiki-source-6855627d8368f1cf0965bcad
    resource: repo://src/features/reader/labelPopup.ts
  - id: openwiki-source-0c1da386b0384a677fb31b3d
    resource: repo://src/features/reader/readerMenu.ts
  - id: openwiki-source-203c7dd08ccb7d6de0448e34
    resource: repo://src/hooks.ts
  - id: openwiki-source-8e77b678012b338d1d1e4e82
    resource: repo://test-unit/printMenuState.test.ts
  - id: openwiki-source-22daf31a20f83a77b0bb7816
    resource: repo://test/printMenus.test.ts
generated: { by: "openwiki/0.7.2", at: "2026-10-16T19:49:13.348Z" }
---

A printed or physical source — such as a printed law commentary, monograph, journal volume, or archival record — has no digital document file attached. By design, Zotero refuses to store an annotation whose direct parent is a regular bibliographic title item: an `annotation` item is accepted only under a file attachment with an `attachmentReaderType` (`pdf`, `epub`, `snapshot`), and attempting to save an annotation directly under a regular item (or a linked-URL attachment) throws an unrecoverable exception (Zotero 10.0.5, `xpcom/data/item.js` 2246–2259, documented in [docs/anchors.md](../../docs/anchors.md)).

FlexAnnotate resolves this architectural constraint by generating a minimal, valid one-page PDF — known as the **placeholder attachment** — attached to the title item. All print annotations for that work are parented to this placeholder attachment. Consequently, print annotations become first-class Zotero annotations:
- They sync seamlessly across devices via Zotero Sync.
- They are indexed library-wide by FlexAnnotate's `AnnotationIndex` and surface within the Organizer and document outlines.
- They appear in the item pane's annotation list alongside digital annotations.
- They can be cited in word processors (Word, LibreOffice) via standard citation dialogs using custom CSL locators (such as page, paragraph, column, or margin numbers).
- They share the same locator input mask and locator tag mechanics used for digital PDF/EPUB annotations.

## Module Architecture

The print annotation subsystem spans core logic, UI panels, menu bindings, and reader popup enhancements:

| Module | Responsibility |
| --- | --- |
| [placeholder.ts](../../src/features/print/placeholder.ts) | Placeholder attachment lifecycle (generation, detection, retrieval, cleanup) |
| [printAnnotations.ts](../../src/features/print/printAnnotations.ts) | CRUD operations for print annotations, field validation, and locator tags |
| [dialog.ts](../../src/features/print/dialog.ts) | XUL `<panel>` input mask embedded in the main window |
| [menus.ts](../../src/features/print/menus.ts) | Item context menu entries in `#zotero-itemmenu` with custom visibility logic |
| [annotationRowMenu.ts](../../src/features/print/annotationRowMenu.ts) | Context menu for `<annotation-row>` elements in the right-hand item pane |
| [logic/printAnnotation.ts](../../src/features/print/logic/printAnnotation.ts) | Pure rules: color normalization, sort index generation, and PDF byte generation |
| [logic/printMenuState.ts](../../src/features/print/logic/printMenuState.ts) | Pure state machine determining context menu entry visibility |
| [core/printDialog.ts](../../src/core/printDialog.ts) | Pure dialog rules: layout dimensions, field visibility, focus order, save data construction |
| [core/locator.ts](../../src/core/locator.ts) | Pure locator tag resolution order and sparse tag diffing |
| [reader/labelPopup.ts](../../src/features/reader/labelPopup.ts) | Enhancement of Zotero's reader `.label-popup` with locator selectors and radio guards |
| [core/labelPopup.ts](../../src/core/labelPopup.ts) | Pure decision rules for reader page label and locator popups |

`printMenus` and `annotationRowMenu` are registered as features in [src/hooks.ts](../../src/hooks.ts). They have no background service lifecycle (`start`/`stop`), attaching and detaching UI elements per main window. The complete subsystem is exposed to tests and external consumers as `addon.api.print` (`placeholder`, `printAnnotations`, `dialog`, `menus`). Pure rules in `logic/` and `core/` contain no Zotero globals and are covered by Node unit tests in `test-unit/`, adhering to repository [conventions](../conventions.md).

## End-to-End Workflow & Lifecycle

The following diagram illustrates the creation, storage, indexing, and presentation pipeline for print annotations:

```mermaid
flowchart TD
    subgraph Creation["1. Creation and Input"]
        UI_Menu["Item Menu, Row Menu, or Citavi Import"] --> DL["Input Mask Panel or Importer"]
        DL --> VAL{"Validation"}
        VAL -->|"Page missing on print"| STAY["Focus page field, mask stays open"]
        VAL -->|"Valid"| PH{"Placeholder exists?"}
        PH -->|"No"| MK_PDF["buildPlaceholderPDF: generate 1-page A4 PDF"]
        MK_PDF --> IMP["importFromFile and tag #flexannotate-placeholder"]
        PH -->|"Yes"| CR["printAnnotations.create or update"]
        IMP --> CR
    end

    subgraph Storage["2. Storage and Invariants"]
        CR --> SET_TYP["Set annotationType first"]
        SET_TYP --> FLD["Normalize color, sortIndex, mock position"]
        FLD --> TAGS["Apply locator tags: #flexannotate-locator-*"]
        TAGS --> DB[("Zotero SQLite Database")]
    end

    subgraph Pipeline["3. Pipeline and Display"]
        DB --> NOTIF["Zotero Notifier event"]
        NOTIF --> IDX["AnnotationIndex: Library-wide cache"]
        NOTIF --> PANE["Item Pane: annotation-row elements"]
        IDX --> ORG["FlexAnnotate Organizer and Document Outline"]
        DB --> CSL["Citation Engine: Word and LibreOffice Integration"]
    end
```

_Lifecycle of a print annotation from creation and placeholder synthesis through database persistence, Notifier indexing, and multi-surface display._

## The Placeholder Attachment Lifecycle

The placeholder attachment satisfies Zotero's database constraint without requiring an actual digital copy of the physical work. Its lifecycle is managed by [placeholder.ts](../../src/features/print/placeholder.ts):

### Runtime PDF Generation

Rather than shipping a static PDF file as an extension asset, [buildPlaceholderPDF()](../../src/features/print/logic/printAnnotation.ts) dynamically compiles a minimal, valid A4 PDF into a `Uint8Array`. Generating the PDF at runtime is strictly required by the Zotero extension environment:
1. `Zotero.Attachments.importFromFile()` requires a physical filesystem path.
2. Inside an installed XPI package, the extension's root URI is a `jar:` URI (`jar:file:///...`), which cannot be passed as a file path to `importFromFile()`.
3. The generated PDF incorporates an explicit Catalog (`/Type /Catalog`), Pages hierarchy (`/Type /Pages`), single Page object (`MediaBox [0 0 595 842]`), and a calculated cross-reference (`xref`) table with exact 10-digit byte offsets. This ensures `pdf.js` parses the file cleanly without triggering repair passes or console warnings.

```typescript
const tmpPath = PathUtils.join(Zotero.getTempDirectory().path, FILENAME);
await IOUtils.write(tmpPath, buildPlaceholderPDF());
try {
  const attachment = await Zotero.Attachments.importFromFile({
    file: tmpPath,
    parentItemID: item.id,
    title,
    contentType: "application/pdf",
  });
  attachment.addTag(TAG, 1);
  await attachment.saveTx();
  return attachment;
} finally {
  await IOUtils.remove(tmpPath, { ignoreAbsent: true });
}
```

### Detection by Tag vs. Title

- **Detection is strictly tag-based**: `isPlaceholder(item)` checks that the item is an attachment (`item.isAttachment()`) and possesses the automatic tag `#flexannotate-placeholder` (type 1 tag).
- **Titles are frozen at creation**: When imported, the placeholder's title is set from the localized `placeholder-title` string ("FlexAnnotate: Print Annotations"). Checking tags instead of titles guarantees that user language changes or title edits never break attachment identification.

### Retrieval and Single-Attachment Invariant

- `find(item)`: Iterates through the child attachments of a bibliographic title item and returns the first attachment matching `isPlaceholder()`.
- `ensure(item)`: Returns an existing placeholder or calls `create(item)`. Every annotation write routes through `ensure()`, guaranteeing that a title item owns at most one placeholder attachment shared across all its print annotations. Calling `create()` on a non-regular item throws an error.

### Automatic Cleanup

- `cleanUpIfEmpty(attachment)`: Erases the placeholder attachment via `attachment.eraseTx()` only when all three conditions are satisfied:
  1. The attachment is identified as a placeholder (`isPlaceholder()`).
  2. The `extensions.zotero.flexannotate.keepEmptyPlaceholders` preference (default `false`, defined in [addon/prefs.js](../../addon/prefs.js)) is false.
  3. No child annotations remain on the attachment (`attachment.getAnnotations().length === 0`).
- It is invoked automatically by `printAnnotations.erase()`. When a user deletes the final print annotation on a work, the placeholder PDF is cleaned up automatically, leaving no orphaned dummy attachments.

## Annotation Field Invariants & Data Constraints

Zotero enforces rigid validation checks when committing `annotation` items to the database (`xpcom/data/item.js:4487-4555`). [printAnnotations.ts](../../src/features/print/printAnnotations.ts) structures all operations around these invariants:

| Zotero Invariant | Implementation Mechanism in `printAnnotations.ts` |
| --- | --- |
| `annotationType` must precede all other fields | `create()` assigns `annotation.annotationType = type` before touching text, comment, or color; assigning other fields first causes Zotero to throw. |
| `annotationText` permitted only for `highlight` and `underline` | `supportsText(type)` returns true only for `highlight` and `underline`. For other types (e.g., `note`), supplied quote text is folded into `annotationComment` separated by a blank line (`\n\n`) to prevent silent data loss. |
| `annotationPosition` required for PDF child annotations | Mocked as `{ pageIndex: 0, rects: [[0, 0, 0, 0]] }` serialized to JSON, satisfying Zotero's schema despite the absence of digital bounding boxes. |
| `annotationSortIndex` requires format `/^\d{5}\|\d{6}\|\d{5}$/` | `buildSortIndex(pageLabel)` extracts the first contiguous digit run from the page label, zero-padded to five digits and clamped to 99999 (e.g., "Rn. 12" $\to$ `00012|000000|00000`). Labels lacking digits (e.g., Roman numerals like "XIV") sort at 99999. |
| `annotationColor` requires lowercase `/#[a-f0-9]{6}/` | `normalizeColor()` trims whitespace, converts to lowercase, and falls back to `#ffd400` if invalid. |
| `annotationPageLabel` stores empty string as `null` | Zotero saves `pageLabel || null`. Reading back an unset label yields `null`, handled with `|| ""` fallback guards. |

### Update and Deletion Boundaries

- `update(annotation, data)`: Accepts `PrintAnnotationUpdate`, which strictly omits `type` and `tags`. Zotero restricts type mutation to switches between `highlight` and `underline`, so arbitrary type changing is prevented. Tags are manipulated exclusively through locator APIs.
- **Sort Index Protection**: When updating a page label, `update()` recalculates `annotationSortIndex` **only if** the parent attachment is a FlexAnnotate placeholder (`isPlaceholder(annotation.parentItem)`). For native annotations under real PDFs, the sort index encodes document coordinate order and must not be overwritten.
- `erase(annotation)`: Deletes the annotation item within a transaction (`annotation.eraseTx()`) and immediately calls `cleanUpIfEmpty()` on the parent attachment.

## Locator Tag System

Because Zotero annotations store page information as a plain text string (`annotationPageLabel`), FlexAnnotate persists citation locator semantics (such as paragraph, column, chapter, or margin) as tags on items and attachments ([src/core/locator.ts](../../src/core/locator.ts)):

### Tag Resolution Order

When resolving an annotation's citation type, `getLocator(annotation)` checks in sequence:
1. An explicit annotation tag: `#flexannotate-locator-<type>`
2. The parent attachment's default tag: `#flexannotate-default-locator-<type>`
3. The fallback ground state: `"page"`

Supported locator types include standard CSL locator terms (`chapter`, `column`, `figure`, `folio`, `issue`, `line`, `note`, `opus`, `page`, `paragraph`, `part`, `section`, `sub-verbo`, `verse`, `volume`) plus `"margin"` (Randnummer), which is standard in legal citations. Legacy or unknown tags are ignored.

### Sparse Tag Mutations

- `locatorTagChanges()`: Avoids redundant tags. An annotation receives an explicit `#flexannotate-locator-<type>` tag only if its locator differs from `page` or if the document's default locator differs from `page`.
- `setDefaultLocator(attachment, locator)`: Sets `#flexannotate-default-locator-<type>` on an attachment. Before switching the document default, it iterates across all existing child annotations and **freezes** any annotation lacking an explicit tag to the old default. This guarantees that changing a document default never alters past citations retroactively. Setting the default to `page` strips the default tag entirely.

## The Locator Input Mask: XUL Panel Architecture

The input mask enables creating print annotations, editing existing annotations, and assigning locators to both print and native annotations.

### Host Platform Constraints

Under Zotero 10, XUL elements parse only within privileged chrome document contexts. Third-party plugins cannot register `chrome://` URI protocols, and calling `openDialog()` with `file://` or `jar://` URIs produces blank, unprivileged windows ([docs/architecture.md](../../docs/architecture.md), Pitfall 5).

To overcome this, [dialog.ts](../../src/features/print/dialog.ts) implements the mask as a XUL `<panel id="flexannotate-print-annotation-panel">` injected directly into the main window document via `win.MozXULElement.parseXULToFragment()`. `build(win)` constructs the panel once per window, and `win.MozXULElement.insertFTLIfNeeded()` loads localization bundles into main and reader windows.

### Per-Window State Ownership

Module instances are singletons per application session, but Zotero windows open and close independently. Storing dialog state on module variables causes cross-window leaks. The panel's active state (`mode`, `view`, `item`, `annotation`, `annotations`, `requirePage`) is held in a private `WeakMap<Element, PanelState>` keyed by the panel's DOM element.

### Opening and Initialization

Both `open(win, parentItem)` and `openForEdit(win, annotations, options)` must `await ensureLocatorsReady()` before rendering. This ensures `Zotero.Styles.init()` has finished. The locator menu builds its labels via `Zotero.Cite.getLocatorString()`, which depends on `Zotero.Styles.locales`. Opening the panel before styles are initialized would leave the locator menu empty until the next application restart.

### Modes and Views

The dialog supports three views defined in [src/core/printDialog.ts](../../src/core/printDialog.ts):

| View | Visible Groups | Dimensions | Primary Focus |
| --- | --- | --- | --- |
| `full` | Locator, Type/Color, Quote Text, Comment | 440px (min 380, max 480) | Page field (for print) or Comment (for native) |
| `comment` | Comment only | 380px (min 340, max 420) | Comment textarea |
| `locator` | Locator and Page | 320px (min 280, max 360) | Locator dropdown |

- **Create Mode**: Opened via `open(win, parentItem)`. Type dropdown is enabled (defaults to `highlight`), locator defaults to the document's default locator, and `requirePage` is set to `true`.
- **Edit Mode**: Opened via `openForEdit(win, annotations, { view })`. Type dropdown is locked (`disabled = true`) because Zotero forbids arbitrary type modification. When editing multiple annotations simultaneously, the dialog forces the `locator` view and hides the page label field, applying bulk locator updates.
- **Page Requirement Guard**: `requirePage` is true for print sources (`placeholder.isPlaceholder(...)`) because print citations rely exclusively on page numbers. Native annotations have digital documents, so page labels are optional.
- **Controls & Menus**:
  - *Quotation Text*: Automatically disabled and dimmed (`opacity: 0.5`) when the type is not `highlight` or `underline`.
  - *Color Palette*: Populated from `Zotero.Annotations.COLORS` (Zotero 10.x) with an 8-color fallback. Menuitem labels are set via `Zotero.getString()` rather than Fluent attributes, ensuring the XUL `<menuitem>` label attribute displays properly.
  - *Default Locator Checkbox*: Checked and locked if the selected locator is already the document default (`defaultCheckboxState`).
- **Keyboard Handling**: `Tab` cycles through visible, enabled form controls with wrap-around (`nextFocusIndex`). `Enter` accepts and saves (unless inside an open dropdown or un-modified textarea). `Escape` closes the panel.
- **Commit Sequence**: `accept()` constructs save data using `buildSaveData()`. If a required page label is missing, it returns `null`, leaving the panel open and refocusing the page input. If the "use as default" checkbox is checked, the document default is updated *before* saving annotations, ensuring `applyLocatorTag()` applies tags consistently. A successful save triggers the `afterSave` hook, allowing reader windows to refresh automatically.

## Reader Page Label Locator Popups

When working inside Zotero's built-in PDF/EPUB reader, page numbers and locators are edited through the reader's native page label popup (`.label-popup` in `reader.js`). FlexAnnotate hooks into this popup ([src/features/reader/labelPopup.ts](../../src/features/reader/labelPopup.ts) and [src/core/labelPopup.ts](../../src/core/labelPopup.ts)):

```typescript
// src/features/reader/labelPopup.ts
export function enhanceLabelPopup(reader: ReaderInstance, popup: Element): void {
  if (popup.querySelector(".flexannotate-locator-section")) return;
  // Injects locator selector dropdown and document default checkbox
  // Disables linear renumbering when locator !== 'page'
}
```

1. **DOM Injection**: When `.label-popup` opens, `enhanceLabelPopup()` injects a custom locator selector row and a "use as default" checkbox before the dialog's radio group.
2. **Renumbering Constraints**: Zotero's native popup provides linear renumbering modes ("from this page forward", "all pages") and an auto-detect checkbox. These options assume standard sequential pagination. In `core/labelPopup.ts`, `isPageLocator(locator)` checks whether the chosen locator is `"page"`. If a non-page locator is chosen (such as `"margin"` or `"paragraph"`):
   - Linear renumbering radios (`from`, `all`) are disabled and dimmed (`setRadioEnabled(radio, false)`).
   - The auto-detect checkbox column is hidden (`display: none`).
   - The radio selection defaults to `single` or `selected` via `preferredRadio()`, preventing corruption of paragraph or margin numbering sequences.
3. **Application**: Page labels are applied only when targeting a unique annotation (`shouldSetPageLabel`), and locator changes update the annotation and attachment defaults using `planApply()`.

## Context Menu Integration

FlexAnnotate integrates with two distinct context menu surfaces in Zotero's main window:

### 1. Item Context Menu (`#zotero-itemmenu`)

Menu items are appended directly to `#zotero-itemmenu` as DOM elements ([src/features/print/menus.ts](../../src/features/print/menus.ts)):
- `flexannotate-itemmenu-separator`: Separator element
- `flexannotate-add-print-annotation`: "Add Print Annotation…"
- `flexannotate-itemmenu-edit`: "Edit Annotation…"
- `flexannotate-itemmenu-delete`: "Delete Print Annotation"

#### Why DOM Elements Instead of `Zotero.MenuManager`
FlexAnnotate deliberately avoids `Zotero.MenuManager` for the item tree context menu:
1. Zotero's `buildItemContextMenu()` function exits early for annotation selections (`zoteroPane.js:4680`), returning before `Zotero.MenuManager.updateMenuPopup()` runs (`:4685`). Consequently, a MenuManager entry's visibility callback never fires for annotations, causing menu entries to freeze in incorrect states.
2. Zotero's menu rebuild mechanism only clears its own `zotero-locate` items, preserving third-party DOM elements.
3. Attaching native DOM elements and registering a `popupshowing` event listener ensures the menu re-evaluates visibility dynamically on every open based on `ZoteroPane.getSelectedItems()`.

The visibility logic is defined as a pure function in [src/features/print/logic/printMenuState.ts](../../src/features/print/logic/printMenuState.ts):
- **Add**: Visible only when exactly one regular title item is selected.
- **Edit**: Visible when exactly one annotation is selected (disabled if the annotation is read-only).
- **Delete**: Visible only when exactly one **print** annotation is selected (parent must satisfy `placeholder.isPlaceholder()`).
- **Separator**: Visible if either Add or Edit is visible.
- **Multi-item / Mixed Selections**: All entries hidden.

`updateVisibility(doc, items)` is exported directly, allowing integration tests to verify menu visibility states without requiring simulated mouse clicks.

### 2. Annotation Row Context Menu

In the right-hand item pane, Zotero renders child annotations as custom `<annotation-row annotation-id="…">` elements (`attachmentAnnotationsBox.js:134`). Zotero provides no native context menu for these rows, and the elements are destroyed and recreated whenever the selection changes.

[annotationRowMenu.ts](../../src/features/print/annotationRowMenu.ts) addresses this by registering a single `contextmenu` event listener at the **document level in the capture phase**:
1. When a right-click occurs, `event.target.closest("annotation-row")` resolves the target row and extracts its `annotation-id`.
2. It constructs and opens a custom `<menupopup id="flexannotate-annotation-popup">` at the cursor coordinates.
3. The annotation ID is written to a `data-flexannotate-annotation-id` attribute on the popup element itself, ensuring commands resolve the correct item even in multi-window setups.
4. "Edit" is displayed for all annotations (disabled if read-only); "Delete" is displayed **only for print annotations**.

## Ecosystem Integration

Print annotations are fully integrated across FlexAnnotate and Zotero:

### Zotero Pipeline Parity
Because print annotations are real `annotation` items attached to a valid PDF, Zotero's core storage, search, and sync engines process them identically to native highlights. Changes trigger standard `Notifier` events (`item: add`, `modify`, `trash`).

### Outline Tracking and the Organizer
FlexAnnotate's [AnnotationIndex](../features/organizer.md) maintains an in-memory, library-wide cache of all annotations, updating incrementally from `Notifier` events. Print annotations are ingested into this index alongside digital annotations. They appear in the Organizer tree, can be structured into hierarchical document outlines (`docOutline`), and support navigation links back to the parent item.

### Word Processor Citations
During citation generation in Microsoft Word or LibreOffice, Zotero formats citations using CSL processors. Print annotations supply their `annotationPageLabel` and tag-based locators (such as `paragraph` or `margin`), allowing physical commentaries and books to be cited with accurate pinpoint locators.

### Citavi Project Import
During migration from Citavi ([src/features/citavi/citaviPrintQuotes.ts](../../src/features/citavi/citaviPrintQuotes.ts)), quotations linked to physical books without attached files are converted into print annotations. Citavi import invokes `printAnnotations.create()` to create the placeholder attachment and populate print annotations, deduplicating against existing entries.

## Focused Tests

The print annotations subsystem is thoroughly verified through unit and integration suites:

- [test-unit/printAnnotation.test.ts](../../test-unit/printAnnotation.test.ts): Unit tests for pure rules:
  - `annotationColors`: Validates Zotero's palette array and falls back to standard 8 colors on malformed input.
  - `buildSortIndex`: Tests numeric sorting of digit runs ("Rn. 12" $\to$ `00012`), sorting labels without digits at 99999 ("XIV"), and clamping values over 99999.
  - `normalizeColor`: Verifies trimming, case folding, and hex validation.
  - `buildPlaceholderPDF`: Verifies valid `%PDF-1.4` headers, trailer dictionary, and that computed `xref` offsets align with object byte positions.
  - `supportsText`: Confirms text quotation support is restricted to `highlight` and `underline`.
- [test-unit/printDialog.test.ts](../../test-unit/printDialog.test.ts): Unit tests for dialog layout, field visibility, `buildSaveData`, `defaultCheckboxState`, and `nextFocusIndex`.
- [test-unit/printMenuState.test.ts](../../test-unit/printMenuState.test.ts): Validates the context menu visibility matrix across regular, native annotation, print annotation, multi-selection, and empty states.
- [test-unit/locator.test.ts](../../test-unit/locator.test.ts): Tests locator resolution precedence and sparse tag diffing.
- [test/print.test.ts](../../test/print.test.ts): Integration tests running inside Zotero:
  - Creates placeholder attachment and first print annotation.
  - Reuses existing placeholder for subsequent annotations on the same item.
  - Retains placeholder while annotations remain.
  - Erases placeholder when its final annotation is deleted.
  - Preserves empty placeholders when `keepEmptyPlaceholders` is set to `true`.
- [test/printDialog.test.ts](../../test/printDialog.test.ts): Integration tests exercising the XUL panel:
  - Creating annotations from user input and verifying database commit via `Notifier`.
  - Missing page label on print sources keeps the dialog open without saving.
  - Type menu remains enabled on creation and disabled on edit.
- [test/printMenus.test.ts](../../test/printMenus.test.ts): Integration tests verifying that context menu DOM elements are appended once, update visibility based on selection, and detach cleanly upon `removeFromWindow()`.

## Related Pages

- [Data Model](../architecture/data-model.md) — Persistent tag schema (`#flexannotate-placeholder`, locator tags) and Zotero field rules.
- [Organizer](organizer.md) — Cross-paper annotation indexing, outline tracking, and library-wide browsing.
- [Citavi Import](citavi-import.md) — Converting Citavi quotation cards into print annotations via placeholder attachments.
- [Reader Integration](reader.md) — Reader page label popup enhancements, custom locator menus, and the `afterSave` refresh hook.
