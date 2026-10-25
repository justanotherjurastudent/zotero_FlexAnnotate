import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  parseStoredRect,
  serializeRect,
} from "../src/features/organizer/logic/persistentRect.ts";

const SCREEN = { left: 0, top: 0, width: 1920, height: 1040 };

describe("parseStoredRect", () => {
  it("keeps size and position when the window is on the screen", () => {
    assert.deepEqual(
      parseStoredRect('{"x":100,"y":80,"w":600,"h":720}', SCREEN),
      { x: 100, y: 80, w: 600, h: 720 },
    );
  });

  it("drops only the position when the window is off the screen", () => {
    assert.deepEqual(
      parseStoredRect('{"x":-5000,"y":80,"w":600,"h":720}', SCREEN),
      { w: 600, h: 720 },
    );
  });

  it("keeps the position when no screen area is known", () => {
    assert.deepEqual(
      parseStoredRect('{"x":-5000,"y":80,"w":600,"h":720}', null),
      {
        x: -5000,
        y: 80,
        w: 600,
        h: 720,
      },
    );
  });

  it("rejects invalid JSON, missing or non-finite numbers", () => {
    assert.equal(parseStoredRect("{bad", SCREEN), null);
    assert.equal(parseStoredRect("", SCREEN), null);
    assert.equal(parseStoredRect("null", SCREEN), null);
    assert.equal(parseStoredRect('{"x":1,"y":2}', SCREEN), null);
    assert.equal(parseStoredRect('{"w":"600","h":720}', SCREEN), null);
    assert.equal(parseStoredRect('{"w":1e999,"h":720}', SCREEN), null);
  });

  it("rejects sizes below the minimum", () => {
    assert.equal(parseStoredRect('{"w":319,"h":720}', SCREEN), null);
    assert.equal(parseStoredRect('{"w":600,"h":299}', SCREEN), null);
    assert.deepEqual(parseStoredRect('{"w":320,"h":300}', SCREEN), {
      w: 320,
      h: 300,
    });
  });

  it("clamps a stored size that exceeds the screen to the available area", () => {
    // e.g. switching from a larger monitor: do not discard, but clamp
    assert.deepEqual(parseStoredRect('{"w":2000,"h":720}', SCREEN), {
      w: 1920,
      h: 720,
    });
    assert.deepEqual(parseStoredRect('{"w":600,"h":1100}', SCREEN), {
      w: 600,
      h: 1040,
    });
    assert.deepEqual(parseStoredRect('{"w":2000,"h":1100}', SCREEN), {
      w: 1920,
      h: 1040,
    });
  });

  it("clamps size but keeps an on-screen position", () => {
    assert.deepEqual(
      parseStoredRect('{"x":100,"y":80,"w":2000,"h":1100}', SCREEN),
      { x: 100, y: 80, w: 1920, h: 1040 },
    );
  });
});

describe("serializeRect", () => {
  it("writes whole pixels that parseStoredRect reads back", () => {
    const s = serializeRect({ x: 100.4, y: 80.6, w: 600, h: 720 });
    assert.equal(s, '{"x":100,"y":81,"w":600,"h":720}');
    assert.deepEqual(parseStoredRect(s, SCREEN), {
      x: 100,
      y: 81,
      w: 600,
      h: 720,
    });
  });
});
