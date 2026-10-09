import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  addToWindow,
  removeFromWindow,
  startAll,
  stopAll,
} from "../src/shared/feature.ts";
import type { Feature } from "../src/shared/feature.ts";

const silent = () => {};

describe("feature registry", () => {
  it("stopAll stops in reverse order", async () => {
    const calls: string[] = [];
    const features: Feature[] = ["a", "b", "c"].map((name) => ({
      name,
      stop: () => {
        calls.push(name);
      },
    }));
    stopAll(features, silent);
    assert.deepEqual(calls, ["c", "b", "a"]);
  });

  it("a throwing start does not prevent later features from starting", async () => {
    const started: string[] = [];
    const logged: string[] = [];
    const features: Feature[] = [
      {
        name: "broken",
        start: () => {
          throw new Error("boom");
        },
      },
      {
        name: "rejecting",
        start: async () => {
          throw new Error("async boom");
        },
      },
      {
        name: "ok",
        start: () => {
          started.push("ok");
        },
      },
    ];
    await startAll(features, (feature) => {
      logged.push(feature);
    });
    assert.deepEqual(started, ["ok"]);
    assert.deepEqual(logged, ["broken", "rejecting"]);
  });

  it("a throwing stop does not prevent earlier features from stopping", () => {
    const stopped: string[] = [];
    const features: Feature[] = [
      {
        name: "first",
        stop: () => {
          stopped.push("first");
        },
      },
      {
        name: "middle",
        stop: () => {
          throw new Error("boom");
        },
      },
      {
        name: "last",
        stop: () => {
          stopped.push("last");
        },
      },
    ];
    stopAll(features, silent);
    assert.deepEqual(stopped, ["last", "first"]);
  });

  it("features without optional hooks are fine", async () => {
    const features: Feature[] = [{ name: "bare" }];
    const win = {} as _ZoteroTypes.MainWindow;
    await startAll(features, silent);
    await addToWindow(features, win, silent);
    removeFromWindow(features, win, silent);
    stopAll(features, silent);
  });
});
