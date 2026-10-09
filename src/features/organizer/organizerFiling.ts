/**
 * Filing rows under headings: assign (tag) and unassign (untag).
 */

import { headingTag, OutlineNode } from "../../core/outline";
import { fileMany, unfileMany } from "./organizerData";
import { toast } from "./organizerDom";
import { Ctx } from "./organizerState";
import { tr } from "./strings";

/** File rows under a heading (a tag), then show how many were filed. */
export async function assign(ctx: Ctx, ids: number[], node: OutlineNode) {
  const { s } = ctx;
  const tag = headingTag(node.title);
  const changed = await fileMany(ids, tag);
  for (const r of s.allRows)
    if (changed.includes(r.id)) r.tags = [...r.tags, tag];
  const skipped = ids.length - changed.length;
  toast(
    tr("assigned")
      .replace("{n}", String(changed.length))
      .replace("{title}", node.title) +
      (skipped ? ` ${tr("skipped").replace("{n}", String(skipped))}` : ""),
  );
  ctx.render();
}

export async function unassign(ctx: Ctx, ids: number[], node: OutlineNode) {
  const { s } = ctx;
  const tag = headingTag(node.title);
  const changed = await unfileMany(ids, tag);
  for (const r of s.allRows)
    if (changed.includes(r.id)) r.tags = r.tags.filter((x) => x !== tag);
  ctx.render();
}
