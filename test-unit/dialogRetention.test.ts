import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  shouldIgnoreSearchInput,
  resolveInitialNode,
  resolveInitialQuery,
  shouldScrollToItem,
} from "../src/features/organizer/logic/dialogRetention.ts";

describe("dialog retention logic", () => {
  it("ignores search input on focus events", () => {
    assert.equal(shouldIgnoreSearchInput("focus"), true);
    assert.equal(shouldIgnoreSearchInput("input"), false);
    assert.equal(shouldIgnoreSearchInput(undefined), false);
  });

  it("resolves initial node prioritizing valid viewNode, then lastNode, then default", () => {
    assert.equal(resolveInitialNode("sec-1", "sec-2"), "sec-1");
    assert.equal(resolveInitialNode(null, "sec-2"), "sec-2");
    assert.equal(resolveInitialNode(undefined, "sec-2"), "sec-2");
    assert.equal(resolveInitialNode("all", "sec-2"), "sec-2");
    assert.equal(resolveInitialNode("none", "sec-2"), "sec-2");
    assert.equal(resolveInitialNode(null, null), "all");
    assert.equal(resolveInitialNode("none", null), "none");
    assert.equal(resolveInitialNode("", ""), "all");
  });

  it("resolves initial query prioritizing active queries", () => {
    assert.equal(resolveInitialQuery("query1", "query2", "query3"), "query1");
    assert.equal(resolveInitialQuery("", "query2", "query3"), "query2");
    assert.equal(resolveInitialQuery(null, "query2", "query3"), "query2");
    assert.equal(resolveInitialQuery(null, "", "query3"), "query3");
    assert.equal(resolveInitialQuery(null, null, null), "");
  });

  it("determines whether to scroll to the last inserted item", () => {
    assert.equal(shouldScrollToItem(false, 123), true);
    assert.equal(shouldScrollToItem(true, 123), false);
    assert.equal(shouldScrollToItem(false, null), false);
    assert.equal(shouldScrollToItem(false, undefined), false);
    assert.equal(shouldScrollToItem(false, 0), false);
  });
});
