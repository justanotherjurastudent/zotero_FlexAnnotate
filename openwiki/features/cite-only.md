---
type: feature
title: Cite-Only Mode (Nur-Nachweis-Zitieren)
description: Citation picker mode allowing inserting citations and references without quoting text, modeSelector injection into Word and LibreOffice citation dialogs, bubble prefix and suffix handling, and safe integration prototype patching.
tags: [cite-only, citations, patching, zotero-internals, word-integration, citation-dialog, locator, preferences, gates]
verified:
  - by: openwiki/0.7.2
    at: 2026-10-28T23:29:27.424Z
sources:
  - id: openwiki-source-a9881e7baa40bb12538c2760
    resource: repo://addon/content/preferences.xhtml
  - id: openwiki-source-929d66ee695e065932e4d312
    resource: repo://addon/prefs.js
  - id: openwiki-source-b9c2588debeb2af18098f399
    resource: repo://docs/anchors.md
  - id: openwiki-source-8b3e5ee735c3e2c4b153403d
    resource: repo://src/core/locator.ts
  - id: openwiki-source-53ed37b604ed976394abbcd6
    resource: repo://src/features/citeOnly/integrationPatch.ts
  - id: openwiki-source-ccec0c217a2dd72ca69f1ce5
    resource: repo://src/features/citeOnly/logic/citeOnly.ts
  - id: openwiki-source-c4f2aacecdd98c100ec86f70
    resource: repo://src/features/citeOnly/modeSelector.ts
  - id: openwiki-source-1aca34d6f01731bfcbb7443a
    resource: repo://src/features/gates.ts
  - id: openwiki-source-ecfe002007c7fceaaf2e66ec
    resource: repo://src/features/print/printAnnotations.ts
  - id: openwiki-source-0760a9e9a9fe13dfe92100ba
    resource: repo://src/features/registry.ts
  - id: openwiki-source-203c7dd08ccb7d6de0448e34
    resource: repo://src/hooks.ts
  - id: openwiki-source-9a53ffd0206b6ef92f484cfb
    resource: repo://src/shared/citationDialog.ts
  - id: openwiki-source-c4ea7da293e48c50e642ab75
    resource: repo://src/shared/feature.ts
  - id: openwiki-source-9c4952e482089b0b73be7e6b
    resource: repo://test-unit/citeOnly.test.ts
  - id: openwiki-source-1239ee0592fe08bc41c94d58
    resource: repo://test/citeOnly.test.ts
  - id: openwiki-source-74be4ba98567e6b3f8bbb0c5
    resource: repo://test/helpers.ts
  - id: openwiki-source-fbba13cd954182ac484ad4ec
    resource: repo://test/modeSelector.test.ts
generated: { by: "openwiki/0.7.2", at: "2026-10-28T23:29:27.424Z" }
---

In Zotero's Word and LibreOffice integration, inserting cited annotations natively diverts execution into a mock note via `_insertCitingResult` (`xpcom/integration.js:1678–1701`, verified against Zotero 10.0.5 in [docs/anchors.md](../../docs/anchors.md)) — pasting the annotation's quote text directly into the word processor document.

Cite-only mode ("Nur-Nachweis-Zitieren") provides academic citation without text quotations: when every cited item is an annotation with a valid, citable top-level work and the `citationOnly` preference is enabled, the plugin rewrites the citation payload in place to reference each annotation's parent item (the work) and passes the annotation's page label as the pinpoint locator. The document receives a standard reference citation (e.g., "Author 2024, p. 22") through Zotero's normal insertion pipeline `_insertItemsIntoDocument()` (`xpcom/integration.js:1778–1785`), bypassing note creation entirely.

The feature is organized across four primary components:

- [integrationPatch.ts](../../src/features/citeOnly/integrationPatch.ts) — safe prototype patches on `Zotero.Integration.Session.prototype`, runtime feature detection, Zotero-facing in-place citation rewriting, Citeproc reset stabilization, and prefix/suffix preservation;
- [logic/citeOnly.ts](../../src/features/citeOnly/logic/citeOnly.ts) — pure, zero-dependency decision function `citationOnlyItems` (Node unit-testable);
- [modeSelector.ts](../../src/features/citeOnly/modeSelector.ts) — UI injection adding the "Full annotation / Citation only" ("Vollnachweis / Nur Nachweis") selector dropdown into the Word/LibreOffice citation picker dialog, maintaining bubble input popups and prefix/suffix rendering;
- [dialogOutlineRender.ts](../../src/features/organizer/citationDialog/dialogOutlineRender.ts) — citation dialog outline rendering that bridges organizer selections into Zotero's native citation bubble queue.

## Citation Dialog Injection and Citation Processing

The end-to-end citation lifecycle spans two distinct phases: UI injection, mode selection, and bubble details configuration in the citation dialog window, followed by execution of the patched citation insertion pipeline in the active integration session.

```mermaid
sequenceDiagram
    autonumber
    actor User as User in Word or LibreOffice
    participant Doc as Document Processor
    participant Win as Citation Dialog Window
    participant Watcher as CitationDialogWatcher
    participant Selector as ModeSelector
    participant Prefs as Zotero Preferences
    participant Session as Integration Session
    participant Patch as rewriteToCitationOnly
    participant Logic as citationOnlyItems

    rect rgb(240, 245, 255)
    Note over User, Prefs: Phase 1: Citation Dialog Injection, Mode & Bubble Details
    User->>Doc: Request Add/Edit Citation
    Doc->>Win: Open citationDialog.xhtml
    Watcher->>Win: Detect window and poll whenLoaded
    Watcher->>Selector: injectModeSelector(win)
    Selector->>Win: Verify #annotations-sidebar exists (Zotero 9+)
    Selector->>Win: Inject select row into #settings-popup and #itemDetails popups
    Selector->>Win: Enable #itemDetails .details for annotations mode & hook prefix/suffix popup
    Selector->>Win: Patch win.Helpers.buildBubbleString to display bubble prefix/suffix
    Selector->>Win: Inject scoped style element and attach FTL localization
    Selector->>Win: Setup MutationObserver tracking dialog-type
    User->>Selector: Select mode (e.g. Nur Nachweis / Citation only)
    Selector->>Prefs: setPref(citationOnly, true)
    Selector->>Win: syncSelects synchronizes both popup dropdowns
    User->>Win: Add annotation & optionally edit prefix/suffix in bubble details
    User->>Win: Confirm citation insertion
    Win-->>Doc: Selected annotations passed to Integration Session
    end

    rect rgb(245, 255, 240)
    Note over Doc, Logic: Phase 2: Citation Processing & Safe Insertion
    Doc->>Session: _insertCitingResult(fieldIndex, field, citation)
    Session->>Prefs: getPref(citationOnly)
    alt citationOnly is true
        Session->>Patch: rewriteToCitationOnly(citation)
        Patch->>Patch: Verify all citationItems are annotations
        Patch->>Logic: citationOnlyItems(items, refs)
        alt pure validation succeeds
            Logic-->>Patch: return new citation item list (with parent IDs and locators)
            Patch->>Patch: Mutate citation.citationItems in place
            opt citation.loadItemData exists
                Patch->>Patch: await citation.loadItemData()
            end
            Patch-->>Session: return rewritten citation object
            opt citedTracking gate enabled
                Session->>Session: recordDocCitation in session.data.prefs
            end
            Session->>Session: _insertItemsIntoDocument(fieldIndex, field, rewritten)
            Session-->>Doc: Pinpoint citation of parent works (Author, p. 22)
        else mixed items or missing topLevelItem
            Logic-->>Patch: return null
            Patch-->>Session: return null (fall through)
            Session->>Session: native _insertCitingResult(fieldIndex, field, citation)
            Session-->>Doc: Native mock note with annotation quote text
        end
    else citationOnly is false or pref unset
        Session->>Session: native _insertCitingResult(fieldIndex, field, citation)
        Session->>Session: map prefix/suffix back onto reversed note items
        Session-->>Doc: Native mock note with annotation quote text
    end
    end
```
_End-to-end sequence of citation dialog injection, preference persistence, bubble detail maintenance, and safe insertion processing in Word and LibreOffice integration._

## The Mode Selector in the Citation Dialog

The citation mode selector in [src/features/citeOnly/modeSelector.ts](../../src/features/citeOnly/modeSelector.ts) is implemented purely via DOM injection into the integration dialog window (`chrome://zotero/content/integration/citationDialog.xhtml`), never by modifying or monkey-patching dialog JavaScript prototypes.

### Injection Points and Dialog Structure

Registration occurs in [src/features/registry.ts](../../src/features/registry.ts) and is wired in [src/hooks.ts](../../src/hooks.ts), where `modeSelector` is registered as the first dialog injector before the outline view:

```ts
export const dialogInjectorEntries: DialogInjector[] = [
  {
    name: "modeSelector",
    inject: modeSelector.injectModeSelector,
    detach: modeSelector.removeModeSelector,
  },
  outlineView,
  // ...
];
```

The shared citation dialog watcher in [src/shared/citationDialog.ts](../../src/shared/citationDialog.ts) monitors window creation using `Services.wm`. Once `(win as any).DIALOG_STATE?.loaded` evaluates to true, the watcher executes `injectModeSelector(win)`.

`injectModeSelector` targets two injection points provided by the citation dialog DOM:

1. **The settings popup (`#settings-popup .popup`):** inserted next to Zotero's native "include comments" checkbox.
2. **The item-details popup (`#itemDetails .popup`):** inserted immediately before the `.buttons` container using `detailsPopup.insertBefore(row, buttons)` so that standard actions ("Remove", "Show in Library", "Done") remain pinned to the bottom of the popup.

Each injection point receives an `.hbox.flexannotate-citation-mode-row` containing a localized label and a `<select>` with options `"full"` (`flexannotate-dialog-mode-full`) and `"citation"` (`flexannotate-dialog-mode-citation`).

### State Persistence and Synchronization

Selection state is backed by the boolean preference `extensions.flexannotate.citationOnly`:

- When the row is built, `select.value` initializes from `getPref("citationOnly") ? "citation" : "full"`.
- A `change` event listener on each `<select>` invokes `setPref("citationOnly", select.value === "citation")`.
- `syncSelects(doc, select.value)` iterates over all `select.flexannotate-citation-mode` elements in the document and mirrors the new value, keeping both the settings popup and the item-details popup synchronized.
- Changes update the central preference store immediately, synchronizing seamlessly with the settings pane in [addon/content/preferences.xhtml](../../addon/content/preferences.xhtml).

### Maintaining Bubble-Input Prefix and Suffix Popups

In vanilla Zotero, the item-details popup (`#itemDetails .details`) is restricted to regular works citations (`data-dialog-type="citation"`). When in annotations mode (`dialog-type="annotations"`), `PopupsHandler.openItemDetails` returns early before initializing `#prefix` and `#suffix` inputs or populating `ph.itemDetailsWhenOpened` (`popupHandler.mjs:118–122`). As a result, users cannot edit citation prefixes (such as "vgl. ") or suffixes (such as ", Fn. 3") on annotation bubbles.

FlexAnnotate bridges this gap directly within `modeSelector.ts`:

1. **Enabling the Details Container:** `trackDialogType` updates the container's allowed modes by executing:
   ```ts
   details?.setAttribute("data-dialog-type", "citation,annotations");
   ```
2. **CSS Input Filtering:** Injected CSS suppresses non-prefix/suffix controls in annotations mode so that irrelevant fields (such as work-level locator overrides or suppress-author toggles) are hidden, leaving only `#prefix` and `#suffix` visible:
   ```css
   #citation-dialog[dialog-type="annotations"] #itemDetails .details > :not([for="prefix"], #prefix, [for="suffix"], #suffix) {
     display: none !important;
   }
   ```
3. **Popup Initialization (`onShowDetails`):** Listens for `show-details-popup` on the document and `popupshowing` on `#itemDetails`. If `dialog-type` is `"annotations"`, it reads `ph.bubbleItem` and populates `ph.itemDetailsWhenOpened`:
   ```ts
   ph.itemDetailsWhenOpened = {
     label: bi.label,
     locator: bi.locator,
     prefix: bi.prefix,
     suffix: bi.suffix,
     suppressAuthor: bi.suppressAuthor,
   };
   ```
   It then fills the DOM input fields (`#locator`, `#prefix`, `#suffix`, `#suppress-author`) directly from `bubbleItem`.
4. **Input Focus (`onPopupShown`):** On `popupshown`, if in annotations mode, it automatically focuses the `#prefix` input field.
5. **Bubble Label Rendering (`buildBubbleString`):** In native Zotero, bubbles for annotations in the input bar do not render prefixes or suffixes. `modeSelector.ts` patches `win.Helpers.buildBubbleString` using `assignChecked`. When `bubbleItem?.item?.isAnnotation?.()` is true:
   - A defined `prefix` is truncated to 10 characters (with `…` if longer) and checked against CiteProc's Romanesque punctuation regexp (`csl.ENDSWITH_ROMANESQUE_REGEXP`) to append a trailing space when needed.
   - A defined `suffix` is truncated to 10 characters (with `…`) and checked against `csl.STARTSWITH_ROMANESQUE_REGEXP` to prepend a leading space when needed.
6. **Teardown & Cleanup:** `removeModeSelector(win)` unregisters event listeners (`show-details-popup`, `popupshowing`, `popupshown`), restores the original `Helpers.buildBubbleString` via `assignChecked`, resets `details` attribute `data-dialog-type` back to `"citation"`, and hides it when not in citation mode.

### Idempotency, Styling, and Localization

- **Idempotency:** Before creating rows, `injectModeSelector` checks `doc.querySelector(".flexannotate-citation-mode-row")`. If elements already exist, injection aborts immediately.
- **Styling:** Injected elements receive styling via a single `<style id="flexannotate-citation-dialog-style">` appended to `doc.head`. CSS styles conform to Zotero's design tokens (`var(--material-button)`, `var(--material-border)`, `var(--fill-primary)`, `var(--fill-quinary)`) and use `appearance: none` with custom padding to ensure cross-platform visual consistency in dark and light themes.
- **Localization:** The dialog document does not inherently load plugin Fluent bundles. `localize(doc, rows)` attaches the plugin's Fluent resource via `doc.l10n.addResourceIds(["flexannotate-addon.ftl"])` and translates rows using `l10n.translateFragment(row)`. If localization fails, an inline German/English fallback dictionary configures row text directly (`"Vollnachweis"` / `"Full annotation"`, `"Nur Nachweis"` / `"Citation only"`).

### Dynamic Visibility and Zotero 9+ Gating

- **Zotero 9+ Gating:** Zotero 8 and earlier lack an annotation mode in the citation dialog (on Zotero 7.x, the file is named `addCitationDialog.xhtml`). `injectModeSelector` immediately checks `doc.getElementById("annotations-sidebar")`; if absent, injection is skipped. Integration tests verify this boundary via `hasAnnotationDialog()` ([test/helpers.ts](../../test/helpers.ts)).
- **Tracking `dialog-type` Changes:** Zotero's `citationDialog.js` adjusts `[data-dialog-type]` visibility only during internal mode-switching routines. Because the plugin injects after initial dialog load, `trackDialogType(win, rows)` sets `row.hidden = !isAnnotations` based on `doc.documentElement.getAttribute("dialog-type") === "annotations"`. It then attaches a `MutationObserver` filtering for the `dialog-type` attribute. Observers are stored in a `WeakMap<Window, ModeSelectorState>()`.
- **Teardown:** `removeModeSelector(win)` disconnects and deletes the window's state from the `WeakMap`, removes all `.flexannotate-citation-mode-row` elements, and deletes the injected `<style>` tag.

## Interception and Citation Item Selection

FlexAnnotate intercepts citation items selected either natively or via the plugin's outline view to guarantee quote-free reference citations.

### Item Selection via Organizer Outline

Users can select annotations either through Zotero's native search bar or through FlexAnnotate's Organizer outline in the citation dialog. As implemented in `insert()` ([src/features/organizer/citationDialog/dialogOutlineRender.ts](../../src/features/organizer/citationDialog/dialogOutlineRender.ts)):

- In citation (works) mode, items are added via `(win as any).IOManager.addItemsToCitation(works)`.
- In annotations mode, the outline renderer creates a transient `<annotation-row action="plus">` inside a hidden `#flexannotate-native` container attached to `#annotations-list`. It waits for `.zotero-clicky-plus` to render, triggers a simulated `.click()`, and removes the temporary row.
- This places selected annotations into Zotero's internal `bubble-input` list, ensuring they are serialized into the standard `citation` object when the dialog is confirmed.

### The Hook Point: `_insertCitingResult`

In native Zotero, `Zotero.Integration.Session.prototype._insertCitingResult` handles citations containing annotations by creating a mock note and passing the note content into the document. In cite-only mode, the plugin intercepts this call and routes the rewritten citation to the normal reference insertion method `_insertItemsIntoDocument(fieldIndex, field, citation)`.

`insertAnnotations` is deliberately **not** a patch point: in Zotero's architecture, it exists only on `Zotero.EditorInstance` (the note editor), never on `Integration.Session`.

### Safe Installation via `assignChecked`

The patch conforms to FlexAnnotate's strict [patching contract](../architecture/patching.md):

1. **Target Pre-Checking:** `patch()` verifies that both `_insertCitingResult` and `_insertItemsIntoDocument` exist as functions on `Zotero.Integration.Session.prototype`. If either is missing, it logs a descriptive warning (`"Nur-Nachweis-Zitieren (citeOnly) bleibt deaktiviert"`) and returns `false`.
2. **Closure Capture:** The original function `native = proto._insertCitingResult` is captured in the wrapper's lexical closure. It is not read dynamically from module state at call time, preventing null-dereference crashes if `unpatch()` runs during an active invocation.
3. **Atomic Assignment & Verification:** `assignChecked(proto, "_insertCitingResult", patched)` writes the wrapper and immediately reads back the property. If the write fails or is swallowed by Gecko Xray expandos, the patch aborts and returns `false`.
4. **Idempotency Guard:** A module-level `installed: Installed | null` pointer tracks installation. A repeated call to `patch()` exits early without wrapping twice.
5. **Foreign Patch Coexistence:** During teardown in `unpatch()`, if `proto._insertCitingResult !== patchedInsert`, the plugin detects that another extension has patched the method and leaves the wrapper chain intact rather than stomping external modifications.
6. **Restoration on Teardown:** `unpatch()` restores the native function and nullifies `installed` only when all patched methods are successfully restored.
7. **Loud Failure Policy:** Registered as `citeOnlyPatch` in [src/features/registry.ts](../../src/features/registry.ts), its `start()` method throws an error if `patch()` fails:
   ```ts
   if (!patch()) {
     throw new Error("citeOnlyPatch: _insertCitingResult patch not active");
   }
   ```
   This ensures failed patches are logged loudly by the [feature lifecycle](../architecture/feature-lifecycle.md) registry rather than silently leaving citations broken.

### Citeproc State Fix (`citeprocResetFix`)

When the `citeprocResetFix` gate is active (enabled by default in [src/features/gates.ts](../../src/features/gates.ts)), `patch()` additionally wraps `proto.resetRequest`:

- **The Zotero Bug:** In native Zotero (`xpcom/integration.js:574, 1161, 1192–1195, 1914`), `getSession()` and `setData()` set `session.rebuildCiteprocState = true`. However, `Session.prototype.resetRequest` unconditionally resets this flag to `false` before `updateFromDocument()` can restore Citeproc state. In the citation dialog, this triggers crashes in `processCitationCluster` when interacting with documents containing existing citations.
- **The Wrapper:** The patched `resetRequest` captures `wasRebuilding = this.rebuildCiteprocState` before calling native `resetRequest`, and restores `this.rebuildCiteprocState = true` if it was set prior to the call.

### Live Preference Checking, Document Cited Tracking, and Full-Note Prefix Restoration

The patched `_insertCitingResult` wrapper executes with dynamic fallback logic:

1. **Live Preference Evaluation:** Re-evaluates `getPref("citationOnly")` on **every call**. Changing the preference in the citation dialog or preferences window takes effect immediately on the next citation without re-patching.
2. **Citation ID Assignment & Document Cited Tracking:** When `citationOnly` is active, the wrapper ensures a persistent `citationID` is assigned (generating one via `Zotero.Utilities.randomString()` if missing or equal to `"flexannotate-browse"`). If the `citedTracking` gate is enabled, it records the cited annotation keys into the document preferences (`session.data.prefs[DOC_CITED_PREF]`) via `recordDocCitation`, allowing the dialog outline view to show green citation checkmarks ([dialogOutlineRender.ts](../../src/features/organizer/citationDialog/dialogOutlineRender.ts)).
3. **Prefix and Suffix Restoration for Full Notes:** If `citationOnly` is false or fallback occurs, native `_insertCitingResult` invokes `_insertNoteIntoDocument`. Because native code reverses citations before mapping them (`xpcom/integration.js:1765–1775`), bubble prefix and suffix properties are lost. FlexAnnotate inspects the result array and maps `prefix` and `suffix` from `citation.citationItems[i]` back onto the corresponding reversed entry `res[res.length - 1 - i]`.
4. **Fault-Tolerant Fallback:** Rewriting and insertion run inside a `try / catch` boundary. Any thrown exception is logged via `Zotero.logError(e)` and execution immediately delegates to `native.call(this, fieldIndex, field, citation)`, guaranteeing word processor insertions never freeze or corrupt user documents.

### In-Place Mutation vs. Cloning

`rewriteToCitationOnly(citation)` mutates `citation.citationItems` in place and returns the original citation instance.

The citation object **must not be cloned**: cloning creates a plain JavaScript object that loses `Zotero.Integration.Citation.prototype`, causing subsequent calls like `citation.serialize()` to fail inside the integration session.

Because mutating the live citation object affects downstream consumers, mutation occurs only after complete validation:
1. `citation.citationItems` is verified as a non-empty array.
2. Every item resolves via `Zotero.Cite.getItem(ci.id)` to an item where `item.isAnnotation()` is true.
3. The pure decision function `citationOnlyItems` returns a valid, non-null list.

Once `citation.citationItems = items` is assigned, `if (typeof citation.loadItemData === "function") await citation.loadItemData();` is awaited to ensure parent metadata is fully loaded before the session serializes the field.

## The Pure Decision Engine: `citationOnlyItems`

The core data transformation in [src/features/citeOnly/logic/citeOnly.ts](../../src/features/citeOnly/logic/citeOnly.ts) is isolated into a pure decision function:

```ts
export function citationOnlyItems(
  items: CitationItemLike[],
  refs: (AnnotationRef | null)[],
): CitationItemLike[] | null
```

By decoupling data transformation from Zotero XPCOM globals, the decision logic is tested under the standard Node test runner in [test-unit/citeOnly.test.ts](../../test-unit/citeOnly.test.ts).

```mermaid
flowchart TD
    START["citationOnlyItems(items, refs)"] --> E{"items non-empty and refs.length === items.length?"}
    E -- "no" --> NULL["return null (native fallthrough)"]
    E -- "yes" --> LOOP["Iterate items in order"]
    LOOP --> R{"ref present and ref.topLevelId !== null?"}
    R -- "no" --> NULL
    R -- "yes" --> ENTRY["Build entry: id = topLevelId, clear uris and itemData"]
    ENTRY --> L{"ref.pageLabel is non-empty?"}
    L -- "yes" --> SET["locator = pageLabel, label = locatorType"]
    L -- "no" --> KEEP["Retain original locator and label"]
    SET --> NEXT["Next item"]
    KEEP --> NEXT
    NEXT --> DONE{"All items processed?"}
    DONE -- "no" --> LOOP
    DONE -- "yes" --> OUT["Return new CitationItemLike list"]
```
_Decision flow in citationOnlyItems: any condition violation returns null, falling back to vanilla Zotero citation behavior._

### Decision Rules and Rejection Cases

`citationOnlyItems` returns `null` (triggering fallback to native `_insertCitingResult`) under any of the following conditions:

| Condition | Cause and Architectural Behavior |
| --------- | -------------------------------- |
| `items.length === 0` | Empty citation payload; nothing to rewrite. |
| `refs.length !== items.length` | Mismatched reference array; caller resolution defect. |
| Any `refs[i] === null` | Mixed selection containing non-annotation items (regular works or notes). |
| Any `refs[i].topLevelId === null` | Annotation has no citable top-level work (e.g., orphan attachment or standalone note). |

### Output Entry Construction

When all conditions are met, `citationOnlyItems` returns a **new array** without mutating its input items:

1. **Top-Level Reference:** `id` is replaced with `ref.topLevelId`.
2. **Metadata Cleared:** `uris` and `itemData` are explicitly cleared (`undefined`) because they described the annotation rather than the cited parent work.
3. **Pinpoint Locators:** If `ref.pageLabel` is non-empty, `locator` is assigned `ref.pageLabel` and `label` is set to `ref.locatorType`. If `ref.pageLabel` is empty, the original `locator` and `label` properties are retained without modification.
4. **Ordering & Multi-Work Preservation:** Original array ordering is maintained, correctly mapping multiple annotations from different parent works to their respective parents.
5. **Property Spreading:** Original properties (such as `prefix` and `suffix` edited in the bubble popup) are preserved via object spreading (`...items[i]`).

### Building `AnnotationRef` and Resolving Locators

The caller ([integrationPatch.ts](../../src/features/citeOnly/integrationPatch.ts)) constructs an `AnnotationRef` for each annotation via `refOf(annotation)`:

- `topLevelId`: Derived from `annotation.topLevelItem`. If `top.isRegularItem()` is false or missing, `topLevelId` is set to `null` and logged via `ztoolkit.log`.
- `pageLabel`: Extracted from `annotation.annotationPageLabel`.
- `locatorType`: Resolved via [`getLocator(annotation)`](../../src/features/print/printAnnotations.ts) only when `pageLabel` is present (a locator type is meaningless without a pinpoint value).

As documented in [Print Annotations](print-annotations.md) and the [Data Model](../architecture/data-model.md), `getLocator` evaluates locator tags in priority order via `locatorOf` ([src/core/locator.ts](../../src/core/locator.ts)):
1. Annotation tag: `#flexannotate-locator-<type>`.
2. Attachment default tag: `#flexannotate-default-locator-<type>`.
3. Fallback: `"page"`.

For non-standard print sources (such as legal commentaries or classical texts), the locator may resolve to CSL types such as `paragraph`, `section`, or `column`.

## Configuration, Preferences, and Gate Switches

The feature's configuration and gate switches operate across three levels: user preferences, architectural feature gates, and emergency hotfix preferences.

### Preferences

- **Key:** `extensions.flexannotate.citationOnly`
- **Default:** `false` (declared in [addon/prefs.js](../../addon/prefs.js))
- **Preferences UI:** Bound declaratively in [addon/content/preferences.xhtml](../../addon/content/preferences.xhtml):
  ```xml
  <checkbox
    id="flexannotate-pref-citation-only"
    data-l10n-id="prefs-citation-only"
    preference="extensions.__addonRef__.citationOnly"
    native="true"
  />
  ```
- **Live Access:** Read dynamically via `getPref("citationOnly")` on every invocation of `_insertCitingResult`. Written directly via `setPref("citationOnly", boolean)` by the citation dialog mode selector.

### Feature Gates

In [src/features/gates.ts](../../src/features/gates.ts), cite-only mode and its dependent components are controlled through formal `FeatureGate` definitions:

| Gate Name | Category | Enabled by Default | Dependencies (`requires`) | Description |
| --------- | -------- | ------------------ | ------------------------- | ----------- |
| `citeOnlyPatch` | Lifecycle | `true` | *None* | Integration prototype patch on `Session.prototype._insertCitingResult`. |
| `modeSelector` | Dialog Injector | `true` | `citationDialog`, `citeOnlyPatch` | UI mode selector dropdown and bubble prefix/suffix details popup in citation dialog. |
| `citeprocResetFix` | Runtime | `true` | `citeOnlyPatch` | Workaround preserving `rebuildCiteprocState` across `Session.prototype.resetRequest`. |
| `citedTracking` | Runtime | `true` | `outlineView` | Writes cited annotation keys into session document preferences on cite-only insertion. |

- **Coupling Invariant:** If `citeOnlyPatch` is disabled, dependent gates `modeSelector` and `citeprocResetFix` are automatically disabled, preventing orphan UI controls or unnecessary prototype patching.
- **Hotfix Overrides:** Any gate can be disabled without releasing a new version by creating a hidden boolean preference `extensions.flexannotate.gate.<name>` set to `false` in `about:config`. Lifecycle gates evaluated during startup require a Zotero restart; runtime gates take effect immediately.

## Verification and Testing

Testing spans unit, integration, and UI layers:

- **Pure Decision Unit Tests ([test-unit/citeOnly.test.ts](../../test-unit/citeOnly.test.ts)):**
  - Asserts `citationOnlyItems` returns `null` for empty inputs, length mismatches, mixed selections, and missing `topLevelId`.
  - Verifies parent item rewriting, clearing of `uris` and `itemData`, and setting `locator` to `"22"` and `label` to `"page"`.
  - Verifies tag resolution priority (`locatorOf`) using document defaults and annotation overrides.
  - Verifies empty `pageLabel` handling, mixed page labels across multiple works, and input immutability.
- **Integration Patch Tests ([test/citeOnly.test.ts](../../test/citeOnly.test.ts)):**
  - Driven via `addon.api.citeOnly` (with `patch` and `isPatched`) in a live Zotero instance.
  - Asserts `patch.start()` replaces `_insertCitingResult` and `resetRequest`, repeated `patch.start()` avoids duplicate wrapping, and `patch.stop()` restores original function identities.
  - Verifies that foreign patches from other add-ons survive `patch.stop()`.
  - Verifies `resetRequest` preserves `rebuildCiteprocState: true` across resets.
  - Executes a synthetic insertion with `citationOnly` set to `true`, verifying that the output cites the parent work with `locator: "22"` and `label: "page"`, preserving prefix and suffix.
  - Verifies that in full citation mode, multiple annotation insertions preserve prefix and suffix despite native citation reversal.
  - Asserts that cite-only mode pre-assigns `citationID` and stores annotation keys in `session.data.prefs.flexannotate_cited`.
- **Mode Selector UI Tests ([test/modeSelector.test.ts](../../test/modeSelector.test.ts)):**
  - Gated to Zotero 9+ via `hasAnnotationDialog()`.
  - Verifies injection of one row per injection point (`#settings-popup` and `#itemDetails`), removal via `removeModeSelector`, and idempotent re-injection.
  - Asserts that changing the `<select>` triggers the `citationOnly` preference round-trip and synchronizes all dialog selects.
