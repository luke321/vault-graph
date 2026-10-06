// github#192
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseScreen } from "./harness-hook.mjs";
import { harnessScreen, leftWindow, useScreen } from "./screen.mjs";

test("a screen answer is a monitor, optionally narrowed to a region of it", () => {
  assert.deepEqual(parseScreen("left\n"), { which: "left", region: null });
  assert.deepEqual(parseScreen("waiting\nprimary -2560,0,1280,1440\n"),
    { which: "primary", region: { x: -2560, y: 0, w: 1280, h: 1440 } });
  assert.deepEqual(parseScreen("right 0,0,0,900"), { which: "right", region: null });
  assert.equal(parseScreen("centre"), null);
  assert.equal(parseScreen("left 1,2,3"), null);
  assert.equal(parseScreen(""), null);
});

test("a region is the harness screen, and a window centres inside it", () => {
  useScreen("primary", { x: 0, y: 0, w: 1280, h: 1440 });
  try {
    assert.deepEqual(harnessScreen(), { x: 0, y: 0, w: 1280, h: 1440 });
    assert.deepEqual(leftWindow(1000, 800), { x: 140, y: 320, w: 1000, h: 800 });
    assert.deepEqual(leftWindow(1600, 1000), { x: 0, y: 220, w: 1280, h: 1000 });
  } finally {
    useScreen("left");
  }
});
