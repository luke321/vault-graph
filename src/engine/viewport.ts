/**
 * The viewport math: how a graph coordinate becomes a pixel (github#58, step 3.1).
 *
 * Ported from sigma 3.0.2 (MIT) with the arithmetic kept exactly as it was, because every
 * measured constant in page.js -- the dot ramp, the edge cap, the logo placement, the wedge
 * labels -- was calibrated against the pixels these functions produce. The chain is:
 *
 *   graph units  --normalise-->  framed graph ([0,1]², the custom bbox mapped onto it)
 *                --matrixFromCamera-->  clip space ([-1,1]²)
 *                --(1+x)·w/2, (1-y)·h/2-->  viewport px
 *
 * `angle` is carried through the matrix so the camera state keeps its shape, but nothing here
 * ever sets it to anything but 0: rotation was switched off in the page long before this file
 * existed.
 *
 * `getMatrixImpact` is the one function whose author admits not fully explaining it (the
 * comment is Sigma's own, kept). It is also the one the shaders cannot do without: it turns a
 * pixel length into the framed-graph length that the matrix will map back onto that many
 * pixels, which is how a node's `size` ends up as exactly `size / ratio` px on screen.
 */

import type { GraphStore, Point } from "./types";

export type Mat3 = Float32Array;

export interface Dimensions {
  width: number;
  height: number;
}

export interface Extent {
  x: [number, number];
  y: [number, number];
}

export interface CameraStateLike {
  x: number;
  y: number;
  ratio: number;
  angle: number;
}

/* ------------------------------------------------------------------ mat3 */

export function identity(): Mat3 {
  return Float32Array.of(1, 0, 0, 0, 1, 0, 0, 0, 1);
}

function scale(m: Mat3, x: number, y?: number): Mat3 {
  m[0] = x;
  m[4] = typeof y === "number" ? y : x;
  return m;
}

function rotate(m: Mat3, r: number): Mat3 {
  const s = Math.sin(r);
  const c = Math.cos(r);
  m[0] = c;
  m[1] = s;
  m[3] = -s;
  m[4] = c;
  return m;
}

function translate(m: Mat3, x: number, y: number): Mat3 {
  m[6] = x;
  m[7] = y;
  return m;
}

/** a = a · b, in place, exactly Sigma's operand order. */
function multiply(a: Mat3, b: Mat3): Mat3 {
  const a00 = a[0], a01 = a[1], a02 = a[2];
  const a10 = a[3], a11 = a[4], a12 = a[5];
  const a20 = a[6], a21 = a[7], a22 = a[8];
  const b00 = b[0], b01 = b[1], b02 = b[2];
  const b10 = b[3], b11 = b[4], b12 = b[5];
  const b20 = b[6], b21 = b[7], b22 = b[8];
  a[0] = b00 * a00 + b01 * a10 + b02 * a20;
  a[1] = b00 * a01 + b01 * a11 + b02 * a21;
  a[2] = b00 * a02 + b01 * a12 + b02 * a22;
  a[3] = b10 * a00 + b11 * a10 + b12 * a20;
  a[4] = b10 * a01 + b11 * a11 + b12 * a21;
  a[5] = b10 * a02 + b11 * a12 + b12 * a22;
  a[6] = b20 * a00 + b21 * a10 + b22 * a20;
  a[7] = b20 * a01 + b21 * a11 + b22 * a21;
  a[8] = b20 * a02 + b21 * a12 + b22 * a22;
  return a;
}

/** Applies the matrix to a point; `z` 0 transforms a direction rather than a position. */
export function multiplyVec2(a: Mat3, b: Point, z = 1): Point {
  const a00 = a[0], a01 = a[1], a10 = a[3], a11 = a[4], a20 = a[6], a21 = a[7];
  return {
    x: b.x * a00 + b.y * a10 + a20 * z,
    y: b.x * a01 + b.y * a11 + a21 * z,
  };
}

/* ---------------------------------------------------------------- camera */

/**
 * The graph is normalised into a [0,1]² square, then rescaled so that two nodes touch
 * opposite sides of the stage at the default camera. This is that rescaling factor.
 */
export function getCorrectionRatio(viewport: Dimensions, graph: Dimensions): number {
  const viewportRatio = viewport.height / viewport.width;
  const graphRatio = graph.height / graph.width;
  // Stage and graph in different directions: the nodes already touch opposite sides.
  if ((viewportRatio < 1 && graphRatio > 1) || (viewportRatio > 1 && graphRatio < 1)) return 1;
  // Otherwise fit the squarer one inside the other.
  return Math.min(Math.max(graphRatio, 1 / graphRatio), Math.max(1 / viewportRatio, viewportRatio));
}

/** The matrix from the camera state -- framed graph to clip space, or its inverse. */
export function matrixFromCamera(
  state: CameraStateLike,
  viewport: Dimensions,
  graph: Dimensions,
  padding: number,
  inverse = false,
): Mat3 {
  const { angle, ratio, x, y } = state;
  const { width, height } = viewport;
  const matrix = identity();
  const smallestDimension = Math.min(width, height) - 2 * padding;
  const correctionRatio = getCorrectionRatio(viewport, graph);
  if (!inverse) {
    multiply(matrix, scale(identity(),
      2 * (smallestDimension / width) * correctionRatio,
      2 * (smallestDimension / height) * correctionRatio));
    multiply(matrix, rotate(identity(), -angle));
    multiply(matrix, scale(identity(), 1 / ratio));
    multiply(matrix, translate(identity(), -x, -y));
  } else {
    multiply(matrix, translate(identity(), x, y));
    multiply(matrix, scale(identity(), ratio));
    multiply(matrix, rotate(identity(), angle));
    multiply(matrix, scale(identity(),
      width / smallestDimension / 2 / correctionRatio,
      height / smallestDimension / 2 / correctionRatio));
  }
  return matrix;
}

/**
 * Sigma's own words: "All these transformations we apply on the matrix to get it rescale the
 * graph as we want make it very hard to get pixel-perfect distances in WebGL. This function
 * returns a factor that properly cancels the matrix effect on lengths. [...] I notice that
 * the following ratio works: R = size(V) / size(M * V) / W, as long as M * V is in the
 * direction of W. Also, note that we use `angle` and not `-angle`, because the image is
 * vertically swapped in WebGL."
 */
export function getMatrixImpact(matrix: Mat3, state: CameraStateLike, viewport: Dimensions): number {
  const { x, y } = multiplyVec2(matrix, { x: Math.cos(state.angle), y: Math.sin(state.angle) }, 0);
  return 1 / Math.sqrt(x * x + y * y) / viewport.width;
}

/* --------------------------------------------------------- normalisation */

export interface Normalization {
  /** Graph units to the framed [0,1]² square. */
  apply(p: Point): Point;
  /** The same, in place, on anything carrying x and y. */
  applyTo(p: Point): void;
  /** Framed square back to graph units. */
  inverse(p: Point): Point;
  /** The graph extent's larger side: framed units times this are graph units. */
  readonly ratio: number;
}

export function createNormalization(extent: Extent): Normalization {
  const [minX, maxX] = extent.x;
  const [minY, maxY] = extent.y;
  let ratio = Math.max(maxX - minX, maxY - minY);
  let dX = (maxX + minX) / 2;
  let dY = (maxY + minY) / 2;
  if (ratio === 0 || Math.abs(ratio) === Infinity || Number.isNaN(ratio)) ratio = 1;
  if (Number.isNaN(dX)) dX = 0;
  if (Number.isNaN(dY)) dY = 0;
  return {
    apply: (p) => ({ x: 0.5 + (p.x - dX) / ratio, y: 0.5 + (p.y - dY) / ratio }),
    applyTo: (p) => {
      p.x = 0.5 + (p.x - dX) / ratio;
      p.y = 0.5 + (p.y - dY) / ratio;
    },
    inverse: (p) => ({ x: dX + ratio * (p.x - 0.5), y: dY + ratio * (p.y - 0.5) }),
    ratio,
  };
}

/** The graph's node extent in x and y; the unit square when it has no nodes. */
export function graphExtent(graph: GraphStore): Extent {
  if (!graph.order) return { x: [0, 1], y: [0, 1] };
  let xMin = Infinity, xMax = -Infinity, yMin = Infinity, yMax = -Infinity;
  graph.forEachNode((_id, attrs) => {
    const { x, y } = attrs;
    if (x < xMin) xMin = x;
    if (x > xMax) xMax = x;
    if (y < yMin) yMin = y;
    if (y > yMax) yMax = y;
  });
  return { x: [xMin, xMax], y: [yMin, yMax] };
}

/* ---------------------------------------------------------------- easing */

export type EasingName = "linear" | "quadraticIn" | "quadraticOut" | "quadraticInOut";

export const easings: Record<EasingName, (k: number) => number> = {
  linear: (k) => k,
  quadraticIn: (k) => k * k,
  quadraticOut: (k) => k * (2 - k),
  quadraticInOut: (k) => {
    if ((k *= 2) < 1) return 0.5 * k * k;
    return -0.5 * (--k * (k - 2) - 1);
  },
};
