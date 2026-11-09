/**
 * Citation preview in the annotations dialog while citation-only mode is on.
 *
 * Zotero shows the preview only for the "citation" dialog type (citationDialog.js 2085-2088,
 * and CitationPreview.update() re-hides it on every bubble change), because annotations are
 * normally inserted as a quote. In citation-only mode they become ordinary citations of their
 * parent work, so we preview exactly that: the same rewrite the insert uses, rendered with the
 * session's own preview function (`io.previewFn`, integration.js 1567-1596).
 */
import { getPref } from "../../utils/prefs";
import { citationOnlyRewrite } from "./integrationPatch";

const observers = new WeakMap<Window, MutationObserver>();
const previews = new WeakMap<
  Window,
  { io: any; nativePreview: unknown; wrappedPreview: unknown }
>();

export function injectAnnotationPreview(win: Window): void {
  if (observers.has(win)) return;
  const doc = win.document;
  const box = doc.getElementById("citation-preview") as HTMLElement | null;
  const content = doc.getElementById("citation-preview-content");
  const button = doc.getElementById(
    "display-preview-button",
  ) as HTMLElement | null;
  const bubbles = doc.getElementById("bubble-input");
  if (!box || !content || !button || !bubbles) return;

  // The preview of Zotero's own "citation" type must also show annotations as their parent
  // work: previewFn gets the same rewrite the insert will apply (idempotent for the rewritten list).
  const io = (win as any).io;
  const nativePreview = io?.previewFn;
  const wrappedPreview = function (this: unknown, c: any, format?: string) {
    const items = getPref("citationOnly")
      ? citationOnlyRewrite(c?.citationItems ?? [])
      : null;
    return nativePreview.call(
      this,
      items ? { ...c, citationItems: items } : c,
      format,
    );
  };
  if (typeof nativePreview === "function") io.previewFn = wrappedPreview;
  previews.set(win, { io, nativePreview, wrappedPreview });

  let run = 0;
  let lastKey = "";
  let lastHtml = "";
  const setHidden = (el: HTMLElement, hidden: boolean) => {
    if (el.hidden !== hidden) el.hidden = hidden; // only on change: our own write must not retrigger us
  };

  const refresh = async () => {
    const w = win as any;
    if (w.DIALOG_STATE?.type !== "annotations" || !getPref("citationOnly")) {
      return; // in the other modes Zotero's own update() decides
    }
    const mine = ++run;
    let html = "";
    try {
      const items = (w.CitationDataManager?.items ?? []).map((i: any) =>
        i.getCitationItem({ includeDialogReferenceID: true }),
      );
      const rewritten = items.length ? citationOnlyRewrite(items) : null;
      if (rewritten) {
        const key = JSON.stringify(rewritten);
        if (key !== lastKey) {
          lastHtml = await w.io.previewFn(
            { ...w.io.citation, citationItems: rewritten },
            "html",
          );
          lastKey = key;
        }
        html = lastHtml;
      }
    } catch (e) {
      ztoolkit.log("flexannotate annotation preview failed:", e);
    }
    if (mine !== run) return; // a newer change is already being rendered
    content.innerHTML = html;
    const wanted = !!Zotero.Prefs.get("integration.citationPreviewShown");
    setHidden(box, !(html && wanted));
    setHidden(button, !html);
    button.setAttribute("aria-pressed", wanted ? "true" : "false");
  };

  const observer = new win.MutationObserver(() => void refresh());
  observer.observe(bubbles, { childList: true, subtree: true });
  for (const el of [box, button]) {
    observer.observe(el, { attributes: true, attributeFilter: ["hidden"] });
  }
  observers.set(win, observer);
  void refresh();
}

export function removeAnnotationPreview(win: Window): void {
  const observer = observers.get(win);
  if (!observer) return;
  observers.delete(win);
  observer.disconnect();
  const p = previews.get(win);
  previews.delete(win);
  if (p && p.io.previewFn === p.wrappedPreview)
    p.io.previewFn = p.nativePreview;
  // back to Zotero's own state for the annotations type: no preview
  if ((win as any).DIALOG_STATE?.type === "annotations") {
    const doc = win.document;
    for (const id of ["citation-preview", "display-preview-button"]) {
      const el = doc.getElementById(id) as HTMLElement | null;
      if (el) el.hidden = true;
    }
    const content = doc.getElementById("citation-preview-content");
    if (content) content.innerHTML = "";
  }
}
