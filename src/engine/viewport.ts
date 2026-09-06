// github#58

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

export function multiplyVec2(a: Mat3, b: Point, z = 1): Point {
  const a00 = a[0], a01 = a[1], a10 = a[3], a11 = a[4], a20 = a[6], a21 = a[7];
  return {
    x: b.x * a00 + b.y * a10 + a20 * z,
    y: b.x * a01 + b.y * a11 + a21 * z,
  };
}

/* ---------------------------------------------------------------- camera */

export function getCorrectionRatio(viewport: Dimensions, graph: Dimensions): number {
  const viewportRatio = viewport.height / viewport.width;
  const graphRatio = graph.height / graph.width;
  if ((viewportRatio < 1 && graphRatio > 1) || (viewportRatio > 1 && graphRatio < 1)) return 1;
  return Math.min(Math.max(graphRatio, 1 / graphRatio), Math.max(1 / viewportRatio, viewportRatio));
}

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

export function getMatrixImpact(matrix: Mat3, state: CameraStateLike, viewport: Dimensions): number {
  const { x, y } = multiplyVec2(matrix, { x: Math.cos(state.angle), y: Math.sin(state.angle) }, 0);
  return 1 / Math.sqrt(x * x + y * y) / viewport.width;
}

/* --------------------------------------------------------- normalisation */

export interface Normalization {
  apply(p: Point): Point;
  applyTo(p: Point): void;
  inverse(p: Point): Point;
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
