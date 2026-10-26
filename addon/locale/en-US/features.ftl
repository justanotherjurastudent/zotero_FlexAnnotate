## "Features" tab of the preferences: every FlexAnnotate feature can be switched on and off individually.
## Per feature: a title (.label) and a description. The ids follow the gate name in src/features/gates.ts
## (organizerToolbarButton -> prefs-feature-organizer-toolbar-button); test-unit/featureTexts.test.ts checks this.

prefs-tab-options = Options
prefs-tab-features = Features
prefs-features-intro =
    Here you switch individual FlexAnnotate features on or off, for example when a feature causes
    problems or Zotero offers it itself later. If you switch off a base feature, the features that
    depend on it are switched off as well.
prefs-features-restart = Takes effect after restarting Zotero.
prefs-features-needs = Not available because “{ $names }” is switched off.

prefs-features-group-organizer = Organizer
prefs-features-group-dialog = Citation dialog
prefs-features-group-citeonly = Citation-only citing
prefs-features-group-print = Print annotations
prefs-features-group-reader = Reader and tags
prefs-features-group-citavi = Citavi import
prefs-features-group-api = Interface for other plugins

prefs-feature-annotation-index =
    .label = Annotation index
prefs-feature-annotation-index-description =
    Keeps a directory of all annotations in the library up to date. The organizer and the outline
    view in the citation dialog need it; without the index neither is available.
prefs-feature-organizer =
    .label = Organizer
prefs-feature-organizer-description =
    The organizer is a separate window in which you sort annotations into an outline. Without it the
    window, its menu entry and all organizer functions are gone.
prefs-feature-organizer-toolbar-button =
    .label = Organizer button
prefs-feature-organizer-toolbar-button-description =
    Shows a button in the Zotero toolbar that opens the organizer.
prefs-feature-tools-menu-fallback =
    .label = Organizer in the Tools menu
prefs-feature-tools-menu-fallback-description =
    Adds the entry “FlexAnnotate: Organizer” to the Tools menu. Only needed in Zotero 7, which does
    not manage plugin menus yet; in newer versions this option has no effect.
prefs-feature-collection-menu =
    .label = Organizer for a collection
prefs-feature-collection-menu-description =
    Adds “Organizer for this collection” to the right-click menu of a collection.
prefs-feature-doc-import =
    .label = Import from Word and LibreOffice
prefs-feature-doc-import-description =
    Takes the headings of a Word or LibreOffice file (.docx, .odt) as an outline into the organizer.
prefs-feature-doc-export =
    .label = Export to Word and LibreOffice
prefs-feature-doc-export-description =
    Writes the outline as headings into a Word or LibreOffice file (.docx, .odt).
prefs-feature-note-export =
    .label = Export as note
prefs-feature-note-export-description =
    Exports the outline with its filed quotes as a standalone Zotero note.
prefs-feature-orphan-tags =
    .label = Detect orphaned tags
prefs-feature-orphan-tags-description =
    Finds § tags whose heading no longer exists and offers to reassign or remove them.
prefs-feature-outline-anchor-tags =
    .label = Heading tags on the outline note
prefs-feature-outline-anchor-tags-description =
    Also stores the § tags of all headings on the outline note. This way they show up in tag
    autocomplete even when no annotation is filed under them yet.
prefs-feature-outline-scope-heading =
    .label = Scope in the note heading
prefs-feature-outline-scope-heading-description =
    Names the heading of the outline note after its scope (library or top-level collection), so that
    several outlines can be told apart.

prefs-feature-citation-dialog =
    .label = Extend the citation dialog
prefs-feature-citation-dialog-description =
    Basis for what FlexAnnotate adds to the Word and LibreOffice citation dialog: the “Insert as”
    selection and the outline view. Without it the dialog stays as Zotero ships it.
prefs-feature-outline-view =
    .label = Outline view in the citation dialog
prefs-feature-outline-view-description =
    Shows the outline in the citation dialog as a tree with the filed annotations and a preview.
    Needs the annotation index.
prefs-feature-cited-tracking =
    .label = Mark already cited
prefs-feature-cited-tracking-description =
    Marks annotations that are already cited in the document with a green check in the citation
    dialog and compares this with the citations in the document. You can also set and remove the check by hand.
prefs-feature-footnote-jump =
    .label = Footnote numbers and jump
prefs-feature-footnote-jump-description =
    Shows the footnote number of cited annotations and jumps to the place in Word or LibreOffice on click.
prefs-feature-dialog-show-place =
    .label = “Show citation place” button
prefs-feature-dialog-show-place-description =
    Adds the button “Show citation place” to the preview of the citation dialog. It opens the
    attachment at the selected annotation.
prefs-feature-persistent-dialog-patch =
    .label = Keep citation window open
prefs-feature-persistent-dialog-patch-description =
    Makes the option “Keep citation window open as a persistent task pane” available: after inserting
    into Word or LibreOffice the citation dialog stays open as a companion window and remembers its
    position and size.
prefs-feature-narrow-dialog-layout =
    .label = Narrow view of the citation window
prefs-feature-narrow-dialog-layout-description =
    Stacks the kept-open citation window below 750 pixels width (tree, list, details) and moves
    switches into the gear menu.

prefs-feature-cite-only-patch =
    .label = Citation-only citing
prefs-feature-cite-only-patch-description =
    Lets you insert only the reference with its page instead of the full annotation into Word or
    LibreOffice.
prefs-feature-mode-selector =
    .label = “Insert as” selection
prefs-feature-mode-selector-description =
    Adds the choice “Full annotation” or “Citation only” to the citation dialog, in the settings menu
    and in the popup of an entry. Needs citation-only citing.
prefs-feature-citeproc-reset-fix =
    .label = Fix for a Zotero bug
prefs-feature-citeproc-reset-fix-description =
    Prevents the citation dialog from crashing when citations already exist: Zotero resets an
    internal state too early. Only switch off if it causes a problem.

prefs-feature-print-menus =
    .label = Menu entries for print annotations
prefs-feature-print-menus-description =
    Adds the entries “Add Annotation”, “Edit Annotation” and “Delete Annotation” to the right-click
    menu of the item list, also for sources without a PDF such as printed books.
prefs-feature-placeholder-cleanup =
    .label = Clean up empty placeholders
prefs-feature-placeholder-cleanup-description =
    Removes the empty helper file that print annotations hang on once its last annotation is deleted,
    also when you delete it in Zotero itself. Does not apply if “Keep empty placeholder attachments” is
    on in the “Options” tab.
prefs-feature-annotation-row-menu =
    .label = Menu on annotation rows
prefs-feature-annotation-row-menu-description =
    Adds the entries “Edit Annotation” and “Delete Annotation” to the right-click menu of an
    annotation in the right pane. Needs the menu entries for print annotations.
prefs-feature-annotation-row-patch =
    .label = Better annotation rows
prefs-feature-annotation-row-patch-description =
    Shows the correct locator type in annotation rows (for example “Margin no. 318” instead of
    “Page 318”) and an arrow that opens the attachment at the passage.

prefs-feature-reader-menu =
    .label = Reader menu
prefs-feature-reader-menu-description =
    Adds the entry “Edit Annotation…” to the right-click menu of an annotation in the Zotero reader.
prefs-feature-reader-label-popup =
    .label = Locator selection in the page number popup
prefs-feature-reader-label-popup-description =
    Adds the choice of the locator type (page, margin no. …) to the popup for changing the page
    number in the reader. Needs the reader menu.
prefs-feature-tag-suggest =
    .label = § tag suggestions
prefs-feature-tag-suggest-description =
    When you type “§” in the tag field, shows the outline headings in outline order instead of
    alphabetically. You choose how in the “Options” tab.

prefs-feature-citavi-import =
    .label = Citavi import
prefs-feature-citavi-import-description =
    Allows importing from Citavi (files, links and quotes without a PDF).
prefs-feature-citavi-print-quotes =
    .label = Citavi: quotes without a PDF
prefs-feature-citavi-print-quotes-description =
    Also takes quotes that have no PDF into Zotero as print annotations during the Citavi import.
    Needs the Citavi import.
prefs-feature-citavi-links =
    .label = Citavi: link contributions
prefs-feature-citavi-links-description =
    Links contributions in anthologies to their parent volume during the Citavi import.
    Needs the Citavi import.

prefs-feature-external-api =
    .label = Interface for other plugins
prefs-feature-external-api-description =
    Provides the outline with its numbers to other plugins (for example AI integrations) through
    Zotero.FlexAnnotate. Without it no other plugin can read the outline.
