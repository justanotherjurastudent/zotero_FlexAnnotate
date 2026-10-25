/**
 * Zentrale Feature-Schalter (pure, ohne Zotero-Importe — node-testbar).
 *
 * Jedes größere Feature ist hier als `FeatureGate` gelistet, damit man es
 * einzeln abschalten kann — z. B. wenn Zotero eine Funktion später selbst
 * mitbringt, sich eine interne API ändert oder ein Feature vorübergehend
 * deaktiviert werden soll.
 *
 * Diese Datei enthält nur Daten und die reine Abfragelogik. `registry.ts`
 * leitet daraus die aktiven `globalFeatures`/`dialogInjectors` ab; die
 * eigentliche Registrierung und Zotero-Kopplung bleibt dort.
 *
 * Hinweis zur Semantik: `isFeatureEnabled` liefert für unbekannte Namen `true`
 * (fail-open). Ein Tippfehler im Gate-Namen macht den Schalter damit still
 * wirkungslos — der Konsistenz-Test `test-unit/featureGates.test.ts` deckt
 * genau das ab.
 */

export interface FeatureGate {
  name: string;
  description: string;
  enabled: boolean;
}

/**
 * Ein Feature auf `enabled: false` setzen blendet es aus der Registrierung.
 * `description` nennt, was das Feature tut und wann man es abschalten würde.
 */
export const gates: FeatureGate[] = [
  {
    name: "organizer",
    description:
      "Organizer: Hauptfenster, Menü-Eintrag, Gliederung und Notiz-Export.",
    enabled: true,
  },
  {
    name: "organizerToolbarButton",
    description: "Organizer-Knopf in der Zotero-Toolbar.",
    enabled: true,
  },
  {
    name: "toolsMenuFallback",
    description: "Organizer-Eintrag im Tools-Menü (Fallback für Zotero 7).",
    enabled: true,
  },
  {
    name: "collectionMenu",
    description: "Rechtsklick auf Sammlung: 'Organizer für diese Sammlung'.",
    enabled: true,
  },
  {
    name: "citationDialog",
    description:
      "Window-Watcher für den Zitierdialog; Basis für Modus-Auswahl, Gliederungsansicht und Zeilen-Patch im Dialog.",
    enabled: true,
  },
  {
    name: "persistentDialogPatch",
    description:
      "Zitierfenster offen halten (Blätterfenster) inkl. Ort/Größe merken.",
    enabled: true,
  },
  {
    name: "citeOnlyPatch",
    description:
      "Nur-Nachweis-Zitieren: Integration-Patch für den Zitierdialog.",
    enabled: true,
  },
  {
    name: "readerMenu",
    description: "Reader-Kontextmenü des Zotero-Readers.",
    enabled: true,
  },
  {
    name: "citaviImport",
    description: "Citavi-Import (Dateien, Verknüpfungen, Druck-Zitate).",
    enabled: true,
  },
  {
    name: "annotationIndex",
    description:
      "Bibliotheksweiter Annotation-Index (Notifier-Observer) als Grundlage des Organizers.",
    enabled: true,
  },
  {
    name: "externalApi",
    description:
      "Plugin-zu-Plugin-Schnittstelle Zotero.FlexAnnotate für KI-Anbindungen.",
    enabled: true,
  },
  {
    name: "tagSuggest",
    description:
      "§-Tag-Vorschläge in Gliederungsreihenfolge in der Tag-Zeile (PDF/Item).",
    enabled: true,
  },
  {
    name: "printMenus",
    description: "Menüs für Print-Annotationen (Druckrang, Locator).",
    enabled: true,
  },
  {
    name: "annotationRowMenu",
    description: "Kontextmenü auf Annotation-Zeilen im Item-Baum.",
    enabled: true,
  },
  {
    name: "annotationRowPatch",
    description:
      "Annotation-Zeilen-Patch: stabilisiert das Listen-Rendering (Formatierung). Gilt als Feature und als Zitierdialog-Injektor.",
    enabled: true,
  },
  {
    name: "modeSelector",
    description: "Modus-Auswahl (Annotationen/Werke) im Zitierdialog.",
    enabled: true,
  },
  {
    name: "outlineView",
    description:
      "Gliederungsansicht im Zitierdialog (Annotationen- und Werke-Tab).",
    enabled: true,
  },
];

const gateByName = new Map(gates.map((g) => [g.name, g.enabled]));

/** Gibt es ein Gate mit diesem Namen? (Konsistenzprüfung für Tests/Code.) */
export function isKnownGate(name: string): boolean {
  return gateByName.has(name);
}

/**
 * Schalter-Abfrage für die Registrierung. Unbekannte Namen gelten als aktiv
 * (fail-open), damit ein neu hinzugefügtes Feature ohne Gate-Schlüssel nicht
 * still wegfällt — siehe Header-Hinweis.
 */
export function isFeatureEnabled(name: string): boolean {
  return gateByName.get(name) ?? true;
}
