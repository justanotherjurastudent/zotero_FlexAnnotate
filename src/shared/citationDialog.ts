/**
 * Lebenszyklus des Zitierdialogs. Ein einziger Window-Watcher erkennt den
 * Dialog und ruft jeden registrierten Injector einmal pro Fenster auf, sobald
 * der Dialog fertig initialisiert ist. Beim Entladen eines Fensters und beim
 * Stoppen ruft er detach aller Injectoren auf. Ein fehlerhafter Injector hält
 * die anderen nicht an.
 */

export interface DialogInjector {
  name: string;
  inject(win: Window): void;
  detach(win: Window): void;
}

const DIALOG_URL = "chrome://zotero/content/integration/citationDialog.xhtml";

/** Reihenfolge = Injektionsreihenfolge; detach läuft in derselben Reihenfolge. */
const injectors: DialogInjector[] = [];
const tracked = new Set<Window>();
let listener: any = null;

export function registerDialogInjector(injector: DialogInjector): void {
  injectors.push(injector);
}

function run(win: Window, hook: "inject" | "detach") {
  for (const injector of injectors) {
    try {
      injector[hook](win);
    } catch (e) {
      ztoolkit.log(`citation dialog ${injector.name}.${hook} failed:`, e);
    }
  }
}

/** Wait until the dialog finished its own initialisation, then inject. */
function whenLoaded(win: Window, tries = 0) {
  if ((win as any).DIALOG_STATE?.loaded) {
    run(win, "inject");
    return;
  }
  if (tries > 150) return;
  win.setTimeout(() => whenLoaded(win, tries + 1), 200);
}

function track(win: Window) {
  const check = () => {
    if (win.location?.href !== DIALOG_URL || tracked.has(win)) return;
    tracked.add(win);
    win.addEventListener("unload", () => untrack(win), { once: true });
    whenLoaded(win);
  };
  if (win.document?.readyState === "complete") check();
  win.addEventListener("load", check);
}

/** Forgets a window and detaches all injectors from it. */
function untrack(win: Window) {
  if (!tracked.delete(win)) return;
  run(win, "detach");
}

export function start(): void {
  if (listener) return;
  listener = {
    onOpenWindow: (xulWin: any) => {
      try {
        track(xulWin.docShell.domWindow as Window);
      } catch (e) {
        ztoolkit.log("flexannotate dialog watch failed:", e);
      }
    },
    onCloseWindow: () => {},
  };
  Services.wm.addListener(listener);
  const en = Services.wm.getEnumerator("");
  while (en.hasMoreElements()) track(en.getNext() as Window);
}

export function stop(): void {
  if (listener) Services.wm.removeListener(listener);
  listener = null;
  for (const win of [...tracked]) untrack(win);
}
