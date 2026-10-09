/**
 * icons — small colored SVG icons for the organizer toolbar (built with DOM
 * calls, no innerHTML). All icons use a 24×24 viewBox and bold shapes.
 */

const SVG_NS = "http://www.w3.org/2000/svg";

type Shape = [tag: string, attrs: Record<string, string>];

const stroke = (color: string, w = 2.6) => ({
  fill: "none",
  stroke: color,
  "stroke-width": String(w),
  "stroke-linecap": "round",
  "stroke-linejoin": "round",
});

const GREEN = "#1f9d55";
const BLUE = "#2563eb";
const INDIGO = "#6d4fd6";
const ORANGE = "#e07b00";
const RED = "#d93a3a";

export type IconName =
  | "add"
  | "addSub"
  | "up"
  | "down"
  | "indent"
  | "outdent"
  | "rename"
  | "delete"
  | "export";

const ICONS: Record<IconName, Shape[]> = {
  add: [
    ["circle", { cx: "12", cy: "12", r: "10", fill: GREEN }],
    ["path", { d: "M12 7v10M7 12h10", ...stroke("#fff", 2.8) }],
  ],
  addSub: [
    ["path", { d: "M5 3v9a4 4 0 0 0 4 4h4", ...stroke(GREEN, 2.8) }],
    ["circle", { cx: "18", cy: "16", r: "5", fill: GREEN }],
    ["path", { d: "M18 13.4v5.2M15.4 16h5.2", ...stroke("#fff", 2) }],
  ],
  up: [["path", { d: "M12 3 4 12h5v9h6v-9h5z", fill: BLUE }]],
  down: [["path", { d: "M12 21 4 12h5V3h6v9h5z", fill: BLUE }]],
  indent: [
    ["path", { d: "M4 4v16", ...stroke(INDIGO, 2.6) }],
    ["path", { d: "M9 12h11M15 6l6 6-6 6", ...stroke(INDIGO, 2.8) }],
  ],
  outdent: [
    ["path", { d: "M20 4v16", ...stroke(INDIGO, 2.6) }],
    ["path", { d: "M15 12H4M9 6l-6 6 6 6", ...stroke(INDIGO, 2.8) }],
  ],
  rename: [
    ["path", { d: "M3 21l1.5-6L16 3.5 20.5 8 9 19.5z", fill: ORANGE }],
    ["path", { d: "M14 5.5l4.5 4.5", ...stroke("#fff", 2) }],
  ],
  delete: [
    ["path", { d: "M3 6h18", ...stroke(RED, 2.8) }],
    ["path", { d: "M9 6V3.5h6V6", ...stroke(RED, 2.4) }],
    ["path", { d: "M5.5 6.5 6.7 21h10.6l1.2-14.5z", fill: RED }],
    ["path", { d: "M10 10.5v7M14 10.5v7", ...stroke("#fff", 2.2) }],
  ],
  export: [
    ["path", { d: "M6 3h9l4 4v14H6z", fill: BLUE }],
    ["path", { d: "M9 12h7M9 16h7M9 8.5h4", ...stroke("#fff", 1.8) }],
  ],
};

export function makeIcon(doc: Document, name: IconName, size = 18): SVGElement {
  const svg = doc.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("width", String(size));
  svg.setAttribute("height", String(size));
  svg.setAttribute("aria-hidden", "true");
  for (const [tag, attrs] of ICONS[name]) {
    const el = doc.createElementNS(SVG_NS, tag);
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    svg.appendChild(el);
  }
  return svg as unknown as SVGElement;
}
