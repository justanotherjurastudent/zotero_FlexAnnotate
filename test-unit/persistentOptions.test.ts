import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { normalizePersistentOptions } from "../src/features/organizer/logic/persistentOptions.ts";

describe("normalizePersistentOptions", () => {
  it("removes popup and alwaysRaised and adds dialog=no and resizable", () => {
    const out = normalizePersistentOptions(
      "chrome,centerscreen,resizable=true,popup",
    );
    assert.equal(out, "chrome,centerscreen,resizable=true,dialog=no");
    assert.ok(
      !normalizePersistentOptions("chrome,alwaysRaised").includes(
        "alwaysRaised",
      ),
    );
  });

  it("adds resizable=yes when none is given", () => {
    assert.equal(
      normalizePersistentOptions("chrome,alwaysRaised"),
      "chrome,dialog=no,resizable=yes",
    );
  });

  it("passes the remembered size too (device pixels)", () => {
    assert.equal(
      normalizePersistentOptions("chrome,centerscreen", {
        left: 10,
        top: 20,
        width: 650.4,
        height: 875,
      }),
      "chrome,dialog=no,resizable=yes,left=10,top=20,width=650,height=875",
    );
  });

  it("uses the remembered position instead of centerscreen", () => {
    assert.equal(
      normalizePersistentOptions("chrome,centerscreen,resizable=true", {
        left: 120.4,
        top: 80,
      }),
      "chrome,resizable=true,dialog=no,left=120,top=80",
    );
  });
});
