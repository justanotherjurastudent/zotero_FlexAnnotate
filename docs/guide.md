# FlexAnnotate – User Guide

[Deutsch](handbuch.md) · English

Detailed user guide and reference manual with screenshots for all core features. The quick overview is available in the [README](../README.md).

---

## Quick Reference & Overview

| Where                                           | What                                                                              |
| ----------------------------------------------- | --------------------------------------------------------------------------------- |
| Right-click an item                             | _Add print annotation…_                                                           |
| Right-click an annotation (item tree)           | _Edit annotation…_; for print annotations also _Delete print annotation_          |
| Right-click an annotation (right-hand pane)     | the same entries                                                                  |
| Reader: right-click an annotation               | _Add/edit comment…_, _Set locator…_                                               |
| Reader: edit the page number                    | locator choice and "Use this locator for this document from now on"               |
| Toolbar button, next to the Sync button         | opens the Organizer (or focuses an open window)                                   |
| _Tools → FlexAnnotate: Organizer_               | opens the Organizer (or focuses an open window)                                   |
| Organizer, document icon in the outline toolbar | import an outline from Word/LibreOffice                                           |
| Organizer, export icon in the outline toolbar   | export the outline as Word/ODT                                                    |
| Citation dialog from Word/LibreOffice           | "Insert as" (full citation / citation only); in the annotations view, the outline |
| _Edit → Settings → FlexAnnotate_                | settings                                                                          |

---

## 1. Main Window & Print Annotations

FlexAnnotate enriches Zotero's library view with print annotations for physical books and displays custom locators directly in row titles.

![Main window with a book and child print annotations underneath](img/main-window.png)

### Creating and Editing Print Annotations

- **Create:** Right-click any library item without an attached PDF → _Add print annotation…_.
- **Edit:** Right-click any annotation (in the item tree, the right-hand sidebar, or the PDF reader) → _Edit annotation…_.
- The universal FlexAnnotate editing panel opens:

![Annotation editing modal](img/edit-annotation.png)

- **Pinpoint & Locator Type:** Full choice of locator types (page, paragraph, margin number, chapter, column, etc.) and page/number input.
- **Document Default:** Checking "Use this locator for this document from now on" configures the default locator for future annotations under this work.
- **Type & Color:** Choose between highlight and underline, with color selection from Zotero's palette.
- **Quote Text & Comment:** Full quote text field and personal analytical comment.
- **Row Titles in Item Tree:** Selected locator types (e.g. `paragraph` for margin numbers) appear directly in row titles in Zotero's item list (e.g., "Paragraph § 93, Rn. 4").
- **Background Mechanism:** For books without a file, FlexAnnotate attaches a lightweight placeholder (`#flexannotate-placeholder`). Print annotations behave identically to regular PDF annotations in searches, in the Organizer, and in Word citations.

### Opening the Organizer

Open or focus the Organizer window anytime by clicking the green button right in Zotero's main tab toolbar, just to the left of the Sync button:

![Organizer toolbar button](img/toolbar.png)

Alternatively, select _Tools → FlexAnnotate: Organizer_.

---

## 2. The Organizer

The Organizer is the structural hub of your research or writing project. It provides a hierarchical outline tree synced to Zotero tags (`§...`).

### Annotations View ("Wissen" Tab)

Assign individual excerpts and quotes to outline nodes by simple drag and drop:

![Organizer: Annotations view with outline, annotation list, and detail pane](img/organizer.png)

- **Three-Column Layout:**
  - **Left (Outline Tree):** Freely nest headings to any depth. Node counters show how many quotes are filed under each section. The search bar at the top filters headings and tags dynamically.
  - **Center (Annotation List):** Lists all annotations belonging to the active section or collection. Color badges indicate Zotero annotation colors; pinpoint locators and parent titles are clearly displayed. Shift-click or Ctrl-click to multi-select and move rows together.
  - **Right (Detail Pane):** Displays full excerpt text, locator details, citation information, and an editable comment box.

### Works View ("Titel" Tab)

In addition to specific quotes, you can also assign entire literature entries (books, articles, court decisions) to outline sections:

![Organizer: Works view showing books and papers under outline sections](img/organizer-titel.png)

- Switch to the **Titel** tab to manage books, monographs, and papers.
- Perfect for drafting and literature reviews: immediately see which sources belong to which chapter.

### §-Tags and Smart Suggestions in the PDF Reader

- Every outline node automatically anchors a corresponding tag (`§HeadingTitle`) to the collection's outline note.
- When reading a PDF in Zotero's reader, type `§` into an annotation's tag field: FlexAnnotate suggests outline headings in hierarchical outline order with prefix numbers!
- Renaming or deleting an outline heading in the Organizer automatically updates or cleans the associated tags across your library.

### Importing an Outline from Word / LibreOffice

Import existing chapter outlines from your seminar paper, thesis, or dissertation draft:

![Outline import preview dialog from a Word document](img/import-preview.png)

1. Open the Organizer and click the document icon in the outline toolbar (_Import outline from Word/ODT document…_).
2. Select your `.docx` or `.odt` file.
3. Review the preview: node counters (new, existing, renamed), multilevel numbering (`1`, `1.1` …), and the hierarchical tree.
4. **Strip numbering from titles:** Automatically proposed when manual heading numbers (`1.`, `A.`, `I.`, `(1)`) are detected. Strips leading numbering and automatically re-links existing annotations to the cleaned tags.
5. Click _Import_. The import is strictly additive: no existing notes or headings are deleted.

### Exporting an Outline as Word / ODT

1. Click the export icon in the Organizer toolbar (_Export outline as Word/ODT…_).
2. Choose `.docx` (Microsoft Word) or `.odt` (LibreOffice Writer).
3. The exported file contains all headings formatted with true heading styles ("Heading 1–9") and native multilevel numbering.

---

## 3. Citing in Microsoft Word and LibreOffice

FlexAnnotate integrates smoothly into Zotero's native citation dialog (from Zotero 9 onwards).

### Outline View in the Citation Dialog

Check **"Nach Gliederung anordnen"** (Arrange by outline) to cite directly by your thesis structure:

![Three-column outline citation dialog](img/dialog-three-columns.png)

- Browse by outline sections with live counts on the left, select quotes in the center, and preview the excerpt on the right.
- **Stock View:** Uncheck the outline toggle anytime to switch back to Zotero's default citation picker:

![Native citation dialog](img/citation-dialog-native.png)

### Jump to Original PDF Context: "Zitatstelle anzeigen"

Need to verify the broader context of an excerpt before citing? Select the annotation and click **"Zitatstelle anzeigen"** (Show place):

![Show place button in citation dialog](img/citation-dialog-place.png)

Zotero immediately opens the PDF reader and navigates to the exact page and highlight!

### Instant Keyword Filtering

Type into the search bar to filter outline headings, quotes, and pinpoints simultaneously:

![Search filter in citation dialog](img/citation-dialog-search.png)

### Track Already-Cited Excerpts

To prevent inadvertent duplicates, FlexAnnotate marks annotations already cited in your active document with a distinct green checkmark (`✓`):

![Green checkmarks on already cited annotations](img/dialog-cited.png)

- **Cross-session and cross-machine persistence:** The citation status is saved directly inside the document variables of your `.docx` or `.odt` file (`session.data.prefs`). It survives Zotero restarts, switching computers, and sharing files with co-authors.
- **Automatic drop like Citavi:** When you delete a footnote in Word or LibreOffice, FlexAnnotate reconciles citations the next time you open the dialog (or run "Refresh"). The green checkmark is cleared automatically as soon as no remaining footnote references the excerpt.
- **Manual override:** Clicking the checkmark toggles the status manually if needed.

For technical details and large-document benchmarks, see [Document Citation Tracking](cited-tracking.md).

### Citation-Only Insertion

Under **"Einfügen als"** (Insert as), choose:

- **Vollnachweis (Full citation):** Inserts both quote text and footnote citation (default Zotero behavior).
- **Nur Nachweis (Citation only):** Inserts exclusively the citation and locator (e.g. "Smith, p. 42") without the quote text. Ideal for indirect citations and paraphrasing.

### Keep Citation Window Open (Persistent Task Pane Mode)

Turn on _"Als Aufgabenleiste geöffnet halten"_ (Keep citation window open as a persistent task pane) in the gear settings menu or plugin preferences:

- **Continuous Citing:** After clicking Insert, the dialog cycles briefly so Word can take the footnote, then immediately reopens at the identical desktop position. Pick the next citation without leaving Word.
- **Docking & Narrow Layout:** Dock the window like a native task pane to the side of Word. Below 750 px width, the layout automatically transforms vertically:

![Narrow citation dialog as a side task pane with preview at bottom](img/citation-dialog-narrow.png)

- **Vertical Structure Below 750 px:**
  - **Top:** The outline tree with section counts as a compact top bar.
  - **Middle:** The list of annotations filed under the active section.
  - **Bottom:** The quotation preview pane with excerpt text and the "Zitatstelle anzeigen" (show place) button.
  - **Menu Relocation:** To give maximum height to the annotations list, the toggles ("Nach Gliederung anordnen" and "Als Aufgabenleiste geöffnet halten") move neatly into the settings gear menu at the bottom right.
- Supported for Word for Windows, LibreOffice Writer, and Word for Mac.

---

## 4. Settings

Open settings via _Edit → Settings → FlexAnnotate_ (or on macOS _Zotero → Settings_):

![Settings pane "FlexAnnotate"](img/preferences.png)

| Option                                                                               | Effect                                                         | Default                                                                          |
| ------------------------------------------------------------------------------------ | -------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Insert only the citation by default (`citationOnly`)                                 | Annotations are inserted as a citation with pinpoint only      | off                                                                              |
| Keep empty placeholder attachments (`keepEmptyPlaceholders`)                         | Placeholder stays even if all annotations under it are deleted | off                                                                              |
| Also show works behind the annotations (`showWorksInAnnotationView`)                 | Organizer: annotation view also lists works                    | off                                                                              |
| Show comments instead of quote text in organizer rows (`showCommentInOrganizerRows`) | Organizer: rows display comments instead of quote excerpts     | off                                                                              |
| Import quotes without a file as print annotations (`citaviImport`)                   | Citavi import creates print annotations for unattached quotes  | on                                                                               |
| Keep the note on the quote (`citaviKeepNotes`)                                       | Off: removes the translator note generated for imported quotes | off                                                                              |
| Link contributions to their parent work (`citaviLinkContributions`)                  | Citavi import generates "Related" links                        | on                                                                               |
| Cite pinpoints as (`citaviLocatorPage/Column/Paragraph/Margin/Other`)                | CSL locator mapping for Citavi page types                      | page: page, column: column, paragraph: paragraph, margin: paragraph, other: page |

---

## 5. Zotero Versions & Compatibility

The manifest supports Zotero 7.0 to 10.\*. Compatibility is verified continuously by the automated test suite (`npm run test:versions`) against **7.0.32, 8.0.4, 9.0.6**, and **10.0.5/10.0.6**.

| Feature                                                               | 7.0.x                        | 8.0.x                        | 9.0.x                        | 10.x                   |
| --------------------------------------------------------------------- | ---------------------------- | ---------------------------- | ---------------------------- | ---------------------- |
| Organizer (window, outline, export), toolbar button                   | tested                       | tested                       | tested                       | tested                 |
| Outline import from Word/LibreOffice                                  | tested                       | tested                       | tested                       | tested                 |
| Outline export as Word/ODT                                            | tested                       | tested                       | tested                       | tested                 |
| Print annotations incl. input panel                                   | tested (color menu fallback) | tested (color menu fallback) | tested (color menu fallback) | tested                 |
| Citavi import                                                         | tested                       | tested                       | tested                       | tested                 |
| Citation-only insertion                                               | tested                       | tested                       | tested                       | tested                 |
| Menu _Tools → FlexAnnotate: Organizer_                                | fallback (DOM)               | tested (`MenuManager`)       | tested (`MenuManager`)       | tested (`MenuManager`) |
| Citation dialog with annotations mode (outline, search, "show place") | not available                | not available                | tested                       | tested                 |
| Persistent citation task pane (`persistentCitationDialog`)            | not available                | not available                | tested                       | tested                 |
| Settings pane                                                         | tested                       | tested                       | tested                       | tested                 |

### Data Format

- `#flexannotate-locator-<type>`: Locator type of an annotation (automatic tag).
- `#flexannotate-placeholder`: Marks the placeholder attachment of print annotations.
- `§Title`: Outline heading as a tag on annotations and works.
- `★outline`: Note storing the outline tree in JSON format (Lattice-compatible).

---

## 6. FAQ & Known Notes

- **Can I edit the `★outline` note directly in Zotero's note editor?**
  No. Do not manually edit the outline note in the note editor, as manual edits can desynchronize tree state. Always use the Organizer window.
- **Why does the persistent citation window cycle briefly after an insert?**
  Word and LibreOffice only apply a citation once the dialog completes its transaction. FlexAnnotate immediately re-displays the browsing dialog at the exact same screen position.
- **Are margin numbers supported as true pinpoints?**
  CSL and standard Zotero do not have a dedicated "margin number" locator type. FlexAnnotate maps margin numbers to `paragraph`, which prints standard "Rn." or "para." citations in almost all academic and legal styles.
- **How does sync work across multiple computers?**
  Because all outline structures and print annotations are stored as standard Zotero entities (notes, tags, child attachments), Zotero's built-in cloud sync automatically synchronizes everything across all your devices.
