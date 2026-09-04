/**
 * TRANSITIONAL: Sigma's settings bag, read into the engine's typed options (github#58).
 *
 * Until step 3.6, src/page.js constructs its renderer with the ~25-key object Sigma took --
 * reducers, program classes, label settings, camera clamps -- and the standalone bootstrap in
 * shell.html hands `deps.Sigma` a constructor. When the `--renderer own` build asks for the
 * engine, shell.html wraps `Renderer` in a class whose constructor runs the bag through this
 * function, so the page can drive either renderer unchanged while the pixel diff between the
 * two is measured. At the switch the page constructs `RendererOptions` itself and this file
 * goes.
 *
 * Every read checks its type and throws on a mismatch: a bag that drifts from what the page
 * writes should fail loudly here rather than draw something slightly wrong.
 */

import type { DrawHover, EdgeStyle, NodeStyle, RendererOptions } from "./types";

type Bag = Record<string, unknown>;

function num(bag: Bag, key: string): number {
  const v = bag[key];
  if (typeof v !== "number") throw new Error(`vault-graph: renderer setting "${key}" must be a number`);
  return v;
}

function str(bag: Bag, key: string): string {
  const v = bag[key];
  if (typeof v !== "string") throw new Error(`vault-graph: renderer setting "${key}" must be a string`);
  return v;
}

function bool(bag: Bag, key: string): boolean {
  const v = bag[key];
  if (typeof v !== "boolean") throw new Error(`vault-graph: renderer setting "${key}" must be a boolean`);
  return v;
}

function fn<T>(bag: Bag, key: string): T {
  const v = bag[key];
  if (typeof v !== "function") throw new Error(`vault-graph: renderer setting "${key}" must be a function`);
  return v as unknown as T;
}

export function optionsFromSigmaSettings(bag: Bag, win: Window): RendererOptions {
  const labelColor = bag.labelColor;
  if (typeof labelColor !== "object" || labelColor === null || typeof (labelColor as Bag).color !== "string") {
    throw new Error('vault-graph: renderer setting "labelColor" must be { color: string }');
  }
  return {
    win,
    nodeStyle: fn<NodeStyle>(bag, "nodeReducer"),
    edgeStyle: fn<EdgeStyle>(bag, "edgeReducer"),
    drawHover: fn<DrawHover>(bag, "defaultDrawNodeHover"),
    labelFont: str(bag, "labelFont"),
    labelSize: num(bag, "labelSize"),
    labelWeight: str(bag, "labelWeight"),
    labelColor: (labelColor as { color: string }).color,
    minCameraRatio: num(bag, "minCameraRatio"),
    maxCameraRatio: num(bag, "maxCameraRatio"),
    zoomingRatio: num(bag, "zoomingRatio"),
    zoomDuration: num(bag, "zoomDuration"),
    minEdgeThickness: num(bag, "minEdgeThickness"),
    enableCameraPanning: bool(bag, "enableCameraPanning"),
  };
}
