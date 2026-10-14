import { assert } from "chai";
import { config } from "../package.json";
import {
  cleanup,
  click,
  findWindowByUrl,
  makeAnnotation,
  makePdfAttachment,
  makeWork,
  waitFor,
} from "./helpers";
import { screenshot, screenshotDir } from "./screenshot";

/**
 * Layout des persistenten Zitierfensters in verschiedenen Größen (Round 3).
 * Läuft nur mit `npm run screenshots` (FLEXANNOTATE_SCREENSHOTS=1); sonst geskippt.
 * Die PNGs landen in .scaffold/screenshots/persistent/.
 */

const api = () => (Zotero as any)[config.addonInstance].api;
const DIALOG_URL = "chrome://zotero/content/integration/citationDialog.xhtml";
const NATIVE_OPTIONS = "chrome,centerscreen,resizable=true,alwaysRaised";
const enabled = () => Services.env.get("FLEXANNOTATE_SCREENSHOTS") === "1";
/** Breite x Höhe; 700x300 = unter Word angedockt, 520x700 = links angedockt. */
const SIZES: [number, number][] = [
  [1100, 700],
  [800, 600],
  [700, 600],
  [520, 700],
  [400, 700],
  [360, 500],
  [700, 300],
];

describe("persistent citation window layout (screenshots)", function () {
  this.timeout(240000);
  const anns: Zotero.Item[] = [];
  let noteID = 0;
  let origPref: unknown;
  const integration = () => (Zotero as any).Integration;

  const makeIo = () => {
    const io: any = new (integration().CitationEditInterface)(
      { citationItems: [], properties: {}, citationID: "flexannotate-layout" },
      true,
      Promise.resolve(0),
      Zotero.Promise.delay(300).then(() => ({})),
      async () => "",
    );
    io.isCitingNotes = false;
    io.isAddingAnnotations = true;
    io.sort = () => {};
    io.getItems = () => [];
    return io;
  };

  const closeDialogs = async () => {
    let w: Window | null;
    while ((w = findWindowByUrl(DIALOG_URL))) {
      const old = w;
      old.close();
      await waitFor(() => findWindowByUrl(DIALOG_URL) !== old);
    }
  };

  before(async function () {
    if (!enabled()) this.skip();
    await Zotero.Styles.init();
    const work = await makeWork("Layout Werk");
    const att = await makePdfAttachment(work);
    for (let i = 0; i < 3; i++)
      anns.push(
        await makeAnnotation(
          att,
          i === 1
            ? "Sehr langes Zitat ".repeat(40) + "Ende"
            : `Layoutzitat ${i}`,
          `${i}`,
          i,
        ),
      );
    const core = api().outline;
    const roots = [core.makeNode("Einleitung"), core.makeNode("Hauptteil")];
    noteID = await api().outlineModel.OutlineModel.save(
      Zotero.Libraries.userLibraryID,
      null,
      roots,
    );
    await api().organizerData.fileMany([anns[0].id, anns[1].id], "§Einleitung");
    origPref = api().persistentDialog.readPref();
    api().persistentDialog.writePref(true);
  });

  after(async function () {
    if (!enabled()) return;
    api().persistentDialog.writePref(origPref as boolean);
    await closeDialogs();
    (Zotero.Items.get(noteID) as Zotero.Item)?.eraseTx?.();
    await cleanup();
  });

  it("renders the window at each size and in the idle state", async function () {
    (integration() as any).currentSession = {
      sessionID: "T1",
      citationsByItemID: {},
    };
    const shots: string[] = [];
    const actual: string[] = [];
    for (const [W, H] of SIZES) {
      await closeDialogs();
      const done = integration().displayDialog(
        DIALOG_URL,
        NATIVE_OPTIONS,
        makeIo(),
        "citation",
      ) as Promise<void>;
      const w = (await waitFor(() => findWindowByUrl(DIALOG_URL))) as Window;
      await waitFor(() => (w as any).DIALOG_STATE?.loaded || null);
      actual.push(`open ${W}x${H}: loaded at ${w.outerWidth}x${w.outerHeight}`);
      const toggle = (await waitFor(() =>
        w.document.getElementById("flexannotate-toggle"),
      )) as HTMLInputElement;
      if (!toggle.checked) toggle.click();
      await waitFor(
        () =>
          w.document.querySelectorAll("#flexannotate-list-pane [data-ann-id]")
            .length === 3 || null,
      );
      // Zotero's load-time resize animation has to finish before we resize (else it wins)
      await Zotero.Promise.delay(2500);
      w.resizeTo(W, H);
      await Zotero.Promise.delay(1000);
      actual.push(`${W}x${H} -> ${w.outerWidth}x${w.outerHeight}`);
      shots.push(await screenshot(w, `persistent/${W}x${H}`));
      // one selected annotation: the preview with its action buttons in one row
      (
        w.document.querySelector(
          "#flexannotate-list-pane [data-ann-id]",
        ) as HTMLElement
      ).click();
      await waitFor(() => w.document.getElementById("flexannotate-show-place"));
      await Zotero.Promise.delay(300);
      shots.push(await screenshot(w, `persistent/${W}x${H}-selected`));
      w.close();
      await done;
    }

    // idle window after accepting: the command closes the dialog, then the hint window opens
    let endCommand!: () => void;
    integration().currentCommandPromise = new Promise<void>(
      (r) => (endCommand = r),
    );
    const done = integration().displayDialog(
      DIALOG_URL,
      NATIVE_OPTIONS,
      makeIo(),
      "citation",
    ) as Promise<void>;
    const w = (await waitFor(() => findWindowByUrl(DIALOG_URL))) as Window;
    await waitFor(() => (w as any).DIALOG_STATE?.loaded || null);
    const toggle = (await waitFor(() =>
      w.document.getElementById("flexannotate-toggle"),
    )) as HTMLInputElement;
    if (!toggle.checked) toggle.click();
    const plus = (await waitFor(() =>
      w.document.querySelector(
        `[data-ann-id="${anns[0].id}"] .flexannotate-plus`,
      ),
    )) as HTMLElement;
    plus.click();
    await waitFor(
      () => w.document.querySelectorAll("#bubble-input .bubble").length > 0,
    );
    w.resizeTo(800, 600);
    await waitFor(() => Math.abs(w.outerHeight - 600) < 3 || null);
    await (w as any).accept();
    // execCommand's finally (integration.js:312-347)
    if (integration().currentWindow && !integration().currentWindow.closed)
      integration().currentWindow.close();
    integration().currentWindow = false;
    endCommand();
    await done;
    // the browse window: the normal view again, with the annotations
    const browse = (await waitFor(
      () => {
        const x = findWindowByUrl(DIALOG_URL);
        return x && x !== w ? x : null;
      },
      8000,
      "browse window",
    )) as Window;
    await waitFor(() => ((browse as any).DIALOG_STATE?.loaded ? true : null));
    await Zotero.Promise.delay(1500);
    const bt = (await waitFor(() =>
      browse.document.getElementById("flexannotate-toggle"),
    )) as HTMLInputElement;
    if (!bt.checked) bt.click();
    await waitFor(() =>
      browse.document.querySelectorAll("#flexannotate-list-pane [data-ann-id]")
        .length === 3
        ? true
        : null,
    );
    await Zotero.Promise.delay(800);
    shots.push(
      await screenshot(browse, "persistent/browse-after-insert-800x600"),
    );
    browse.close();
    assert.lengthOf(shots, 2 * SIZES.length + 1);
    // the sizes the window really had (requested vs. actual), next to the PNGs
    await IOUtils.writeUTF8(
      PathUtils.join(screenshotDir(), "persistent", "sizes.txt"),
      actual.join("\n") + "\n",
    );
  });

  it("browse window keeps its stored rect after Zotero's resizes (screenshot)", async function () {
    await closeDialogs();
    const bw = api().persistentDialog.openBrowse({
      x: 220,
      y: 140,
      w: 520,
      h: 800,
    });
    try {
      await waitFor(() => (bw as any).DIALOG_STATE?.loaded || null);
      await Zotero.Promise.delay(3000);
      assert.approximately(bw.innerWidth, 520, 2, "width after 3 s");
      assert.approximately(bw.innerHeight, 800, 2, "height after 3 s");
      await screenshot(bw, "persistent/browse-pinned-520x800");
    } finally {
      bw.close();
    }
  });

  it("wide window (three columns) after the user resized it and a reopen (screenshot)", async function () {
    if (!enabled()) return this.skip();
    this.timeout(60000);
    (integration() as any).currentSession = {
      sessionID: "T1",
      citationsByItemID: {},
    };
    const origExec = integration().execCommand;
    await closeDialogs();
    api().persistentDialog.rememberCommand({
      agent: "WinWord",
      docId: "Dokument1",
      templateVersion: 0,
    });
    // the command: the citation goes into the io, as the real command would
    integration().execCommand = async () => {
      await integration().displayDialog(
        DIALOG_URL,
        NATIVE_OPTIONS,
        makeIo(),
        "citation",
      );
    };
    const bw = api().persistentDialog.openBrowse({
      x: 200,
      y: 120,
      w: 1000,
      h: 640,
    });
    try {
      // the pin is over after 5 s; then the user makes the window wider
      await Zotero.Promise.delay(5500);
      const c = {
        w: bw.outerWidth - bw.innerWidth,
        h: bw.outerHeight - bw.innerHeight,
      };
      bw.resizeTo(1100 + c.w, 700 + c.h);
      await Zotero.Promise.delay(500);
      const io = (bw as any).arguments[0].wrappedJSObject;
      io.citation.citationItems = [{ id: anns[0].id }];
      io.accept();
      const next = (await waitFor(() => {
        const w = findWindowByUrl(DIALOG_URL);
        return w && w !== bw && !w.closed ? w : null;
      })) as Window;
      await waitFor(() => (next as any).DIALOG_STATE?.loaded || null);
      await Zotero.Promise.delay(3000);
      assert.approximately(next.innerWidth, 1100, 2, "reopened width");
      assert.approximately(next.innerHeight, 700, 2, "reopened height");
      await screenshot(next, "persistent/wide-three-columns-after-reopen");
    } finally {
      integration().execCommand = origExec;
      await closeDialogs();
    }
  });

  it("narrow window: switches in the settings menu, closed and open", async function () {
    (integration() as any).currentSession = {
      sessionID: "T1",
      citationsByItemID: {},
    };
    await closeDialogs();
    const done = integration().displayDialog(
      DIALOG_URL,
      NATIVE_OPTIONS,
      makeIo(),
      "citation",
    ) as Promise<void>;
    const w = (await waitFor(() => findWindowByUrl(DIALOG_URL))) as Window;
    await waitFor(() => (w as any).DIALOG_STATE?.loaded || null);
    const doc = w.document;
    const toggle = (await waitFor(() =>
      doc.getElementById("flexannotate-toggle"),
    )) as HTMLInputElement;
    if (!toggle.checked) toggle.click();
    await waitFor(
      () =>
        doc.querySelectorAll("#flexannotate-list-pane [data-ann-id]").length ===
          3 || null,
    );
    await Zotero.Promise.delay(2500);
    w.resizeTo(520, 700);
    await Zotero.Promise.delay(1000);
    await screenshot(w, "persistent/narrow-520x700-closed");

    const popup = doc.getElementById("settings-popup") as any;
    (doc.getElementById("settings-button") as HTMLElement).click();
    await waitFor(
      () => (popup.state === "open" ? true : null),
      8000,
      "menu open",
    );
    await Zotero.Promise.delay(500);
    // drawWindow does not paint popups (separate native widget), so the menu shot is a
    // screen capture of the window region; this file gives its position on screen
    const r = popup.getBoundingClientRect();
    const dpr = w.devicePixelRatio;
    await IOUtils.writeUTF8(
      PathUtils.join(screenshotDir(), "persistent", "menu-geometry.json"),
      JSON.stringify({
        window: [w.screenX, w.screenY, w.outerWidth, w.outerHeight].map((v) =>
          Math.round(v * dpr),
        ),
        popup: [r.left, r.top, r.width, r.height].map((v) =>
          Math.round(v * dpr),
        ),
        dpr,
        boxes: [
          "includeComments",
          "flexannotate-toggle",
          "flexannotate-persistent-toggle",
        ].map((id) => {
          const el = w.document.getElementById(id) as HTMLElement | null;
          if (!el) return [id, null];
          const cs = w.getComputedStyle(el)!;
          const r2 = el.getBoundingClientRect();
          return [
            id,
            Math.round(r2.width),
            Math.round(r2.height),
            cs.margin,
            cs.width,
          ];
        }),
      }),
    );
    await screenshot(w, "persistent/narrow-520x700-menu", { flags: 4 });
    await Zotero.Promise.delay(6000); // time for the external screen capture (see above)
    popup.hidePopup();
    w.close();
    await done;
  });
});
