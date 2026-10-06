/**
 * strings — UI texts of the dynamically built organizer window.
 *
 * The organizer builds its DOM in code, so its texts live here (German and
 * English) instead of in Fluent files; menus and preferences use Fluent.
 */

const de = {
  loading: "Lade …",
  tabKnowledge: "Wissen",
  tabTitles: "Titel",
  all: "(Alle)",
  none: "(Ohne Kategorie)",
  addHeading: "Überschrift hinzufügen",
  addSub: "Unterüberschrift hinzufügen",
  up: "Nach oben",
  down: "Nach unten",
  indent: "Eine Ebene tiefer",
  outdent: "Eine Ebene höher",
  rename: "Umbenennen",
  delete: "Löschen",
  goto: "Gehe zu …",
  draft: "Entwurf als Notiz",
  draftTitle: "Alle Einträge nach Gliederung in eine neue Notiz schreiben",
  draftSaved: "Entwurf als Notiz gespeichert",
  newHeading: "Neue Überschrift",
  deleteTitle: "Überschrift löschen",
  deleteConfirm:
    "„{title}“ und alle Unterüberschriften löschen? Die {n} Zuordnungs-Tags werden von den Einträgen entfernt.",
  assigned: "{n} Einträge zu „{title}“ hinzugefügt.",
  skipped: "{n} übersprungen (schreibgeschützt oder schon zugeordnet).",
  search: "Suchen …",
  selected: "{n} markiert",
  assignTo: "Zuweisen an … (tippen, Enter)",
  removeFromCategory: "Entfernen",
  removeFromCategoryTitle: "Markierte aus dieser Kategorie entfernen",
  sections: "Zwischentitel",
  shown: "{n} angezeigt",
  empty: "Nichts zu zeigen.",
  pickHint: "Wähle einen Eintrag. Strg/Umschalt für Mehrfachauswahl.",
  selectAll: "Alle markieren",
  source: "Quelle",
  categories: "Kategorien",
  open: "Öffnen",
  copy: "Zitat kopieren",
  copied: "Kopiert",
  dialogOutline: "Nach Gliederung anordnen (Annotree)",
  dialogEmpty: "Annotree: Noch keine Annotationen einer Gliederung zugeordnet.",
};

type Key = keyof typeof de;

const en: Record<Key, string> = {
  loading: "Loading …",
  tabKnowledge: "Knowledge",
  tabTitles: "Titles",
  all: "(All)",
  none: "(No category)",
  addHeading: "Add heading",
  addSub: "Add subheading",
  up: "Move up",
  down: "Move down",
  indent: "Indent",
  outdent: "Outdent",
  rename: "Rename",
  delete: "Delete",
  goto: "Go to …",
  draft: "Draft as note",
  draftTitle: "Write all entries into a new note, ordered by outline",
  draftSaved: "Draft saved as note",
  newHeading: "New heading",
  deleteTitle: "Delete heading",
  deleteConfirm:
    'Delete "{title}" and all subheadings? The {n} assignment tags are removed from the items.',
  assigned: 'Added {n} items to "{title}".',
  skipped: "{n} skipped (read-only or already assigned).",
  search: "Search …",
  selected: "{n} selected",
  assignTo: "Assign to … (type, Enter)",
  removeFromCategory: "Remove",
  removeFromCategoryTitle: "Remove the selected items from this category",
  sections: "Subheadings",
  shown: "{n} shown",
  empty: "Nothing to show.",
  pickHint: "Pick an entry. Ctrl/Shift for multi-select.",
  selectAll: "Select all",
  source: "Source",
  categories: "Categories",
  open: "Open",
  copy: "Copy quote",
  copied: "Copied",
  dialogOutline: "Arrange by outline (Annotree)",
  dialogEmpty: "Annotree: No annotations assigned to an outline yet.",
};

export function tr(key: Key): string {
  const locale = (Zotero as any).locale || "en-US";
  return String(locale).toLowerCase().startsWith("de") ? de[key] : en[key];
}
