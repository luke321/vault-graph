// github#58

import { floatColor } from "./colors";
import type { EdgeDisplayData, NodeDisplayData } from "./types";
import type { Mat3 } from "./viewport";

export interface RenderParams {
  matrix: Mat3;
  width: number;
  height: number;
  pixelRatio: number;
  zoomRatio: number;
  sizeRatio: number;
  correctionRatio: number;
  minEdgeThickness: number;
  antiAliasingFeather: number;
}

interface AttributeDef {
  name: string;
  size: number;
  type: "float" | "ubyte";
}

interface ProgramDefinition {
  vertices: number;
  vertexShader: string;
  fragmentShader: string;
  uniforms: string[];
  attributes: AttributeDef[];
  constantAttributes: AttributeDef[];
  constantData: number[][];
}

const BIAS = "const float bias = 255.0 / 254.0;";

function slots(attr: AttributeDef): number {
  return attr.type === "ubyte" ? 1 : attr.size;
}

function bytes(attr: AttributeDef): number {
  return attr.type === "ubyte" ? attr.size : attr.size * 4;
}

function compile(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) throw new Error("vault-graph: could not create a shader");
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader) ?? "";
    gl.deleteShader(shader);
    throw new Error("vault-graph: shader failed to compile:\n" + log + "\n" + source);
  }
  return shader;
}

export abstract class Program {
  protected array = new Float32Array(0);
  protected capacity = 0;
  protected readonly stride: number;

  private readonly constantArray: Float32Array;
  private readonly constantSlots: number;
  private readonly program: WebGLProgram;
  private readonly vertexShader: WebGLShader;
  private readonly fragmentShader: WebGLShader;
  private readonly buffer: WebGLBuffer;
  private readonly constantBuffer: WebGLBuffer;
  private readonly uniforms = new Map<string, WebGLUniformLocation>();
  private readonly locations = new Map<string, number>();

  constructor(
    protected readonly gl: WebGL2RenderingContext,
    protected readonly doc: Document,
    private readonly def: ProgramDefinition,
  ) {
    this.stride = def.attributes.reduce((n, a) => n + slots(a), 0);
    this.constantSlots = def.constantAttributes.reduce((n, a) => n + slots(a), 0);
    if (def.constantData.length !== def.vertices) {
      throw new Error(`vault-graph: program wants ${def.vertices} constant rows, got ${def.constantData.length}`);
    }
    this.constantArray = new Float32Array(def.vertices * this.constantSlots);
    def.constantData.forEach((row, i) => {
      if (row.length !== this.constantSlots) throw new Error("vault-graph: constant row has the wrong width");
      row.forEach((v, j) => {
        this.constantArray[i * this.constantSlots + j] = v;
      });
    });

    const buffer = gl.createBuffer();
    const constantBuffer = gl.createBuffer();
    if (!buffer || !constantBuffer) throw new Error("vault-graph: could not create a WebGL buffer");
    this.buffer = buffer;
    this.constantBuffer = constantBuffer;
    this.vertexShader = compile(gl, gl.VERTEX_SHADER, def.vertexShader);
    this.fragmentShader = compile(gl, gl.FRAGMENT_SHADER, def.fragmentShader);
    const program = gl.createProgram();
    if (!program) throw new Error("vault-graph: could not create a WebGL program");
    gl.attachShader(program, this.vertexShader);
    gl.attachShader(program, this.fragmentShader);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      gl.deleteProgram(program);
      throw new Error("vault-graph: WebGL program failed to link");
    }
    this.program = program;
    for (const name of def.uniforms) {
      const loc = gl.getUniformLocation(program, name);
      if (loc) this.uniforms.set(name, loc);
    }
    for (const attr of [...def.attributes, ...def.constantAttributes]) {
      this.locations.set(attr.name, gl.getAttribLocation(program, attr.name));
    }
  }

  reallocate(capacity: number): void {
    if (capacity === this.capacity) return;
    this.capacity = capacity;
    this.array = new Float32Array(capacity * this.stride);
  }

  render(params: RenderParams): void {
    if (this.capacity === 0) return;
    const gl = this.gl;
    gl.viewport(0, 0, params.width * params.pixelRatio, params.height * params.pixelRatio);
    this.bind();
    gl.enable(gl.BLEND);
    gl.useProgram(this.program);
    this.setUniforms(params);
    gl.drawArraysInstanced(gl.TRIANGLES, 0, this.def.vertices, this.capacity);
    this.unbind();
  }

  kill(): void {
    const gl = this.gl;
    gl.deleteShader(this.vertexShader);
    gl.deleteShader(this.fragmentShader);
    gl.deleteProgram(this.program);
    gl.deleteBuffer(this.buffer);
    gl.deleteBuffer(this.constantBuffer);
  }

  protected abstract setUniforms(params: RenderParams): void;

  protected uniform(name: string): WebGLUniformLocation | null {
    return this.uniforms.get(name) ?? null;
  }

  protected zero(index: number): void {
    this.array.fill(0, index, index + this.stride);
  }

  private bind(): void {
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.constantBuffer);
    let offset = 0;
    for (const attr of this.def.constantAttributes) offset += this.bindAttribute(attr, offset, this.constantSlots * 4, 0);
    gl.bufferData(gl.ARRAY_BUFFER, this.constantArray, gl.STATIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
    offset = 0;
    for (const attr of this.def.attributes) offset += this.bindAttribute(attr, offset, this.stride * 4, 1);
    gl.bufferData(gl.ARRAY_BUFFER, this.array, gl.DYNAMIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
  }

  private bindAttribute(attr: AttributeDef, offset: number, strideBytes: number, divisor: number): number {
    const gl = this.gl;
    const location = this.locations.get(attr.name);
    if (location !== undefined && location !== -1) {
      gl.enableVertexAttribArray(location);
      const glType = attr.type === "ubyte" ? gl.UNSIGNED_BYTE : gl.FLOAT;
      gl.vertexAttribPointer(location, attr.size, glType, attr.type === "ubyte", strideBytes, offset);
      gl.vertexAttribDivisor(location, divisor);
    }
    return bytes(attr);
  }

  private unbind(): void {
    const gl = this.gl;
    for (const attr of [...this.def.constantAttributes, ...this.def.attributes]) {
      const location = this.locations.get(attr.name);
      if (location !== undefined && location !== -1) {
        gl.disableVertexAttribArray(location);
        gl.vertexAttribDivisor(location, 0);
      }
    }
  }
}

/* ------------------------------------------------------------------ nodes */

export abstract class NodeProgram extends Program {
  process(offset: number, data: NodeDisplayData): void {
    const i = offset * this.stride;
    if (data.hidden) {
      this.zero(i);
      return;
    }
    this.processVisible(i, data);
  }

  protected abstract processVisible(index: number, data: NodeDisplayData): void;
}

const THIRD = (2 * Math.PI) / 3;
const DISC_CONSTANTS = { constantAttributes: [{ name: "a_angle", size: 1, type: "float" as const }],
                         constantData: [[0], [THIRD], [2 * THIRD]] };

const CIRCLE_VERTEX = `
attribute vec4 a_color;
attribute vec2 a_position;
attribute float a_size;
attribute float a_angle;

uniform mat3 u_matrix;
uniform float u_sizeRatio;
uniform float u_correctionRatio;

varying vec4 v_color;
varying vec2 v_diffVector;
varying float v_radius;

${BIAS}

void main() {
  float size = a_size * u_correctionRatio / u_sizeRatio * 4.0;
  vec2 diffVector = size * vec2(cos(a_angle), sin(a_angle));
  vec2 position = a_position + diffVector;
  gl_Position = vec4(
    (u_matrix * vec3(position, 1)).xy,
    0,
    1
  );

  v_diffVector = diffVector;
  v_radius = size / 2.0;

  v_color = a_color;
  v_color.a *= bias;
}
`;

const CIRCLE_FRAGMENT = `
precision highp float;

varying vec4 v_color;
varying vec2 v_diffVector;
varying float v_radius;

uniform float u_correctionRatio;

const vec4 transparent = vec4(0.0, 0.0, 0.0, 0.0);

void main(void) {
  float border = u_correctionRatio * 2.0;
  float dist = length(v_diffVector) - v_radius + border;

  float t = 0.0;
  if (dist > border)
    t = 1.0;
  else if (dist > 0.0)
    t = dist / border;

  gl_FragColor = mix(v_color, transparent, t);
}
`;

export class NodeCircleProgram extends NodeProgram {
  constructor(gl: WebGL2RenderingContext, doc: Document) {
    super(gl, doc, {
      vertices: 3,
      vertexShader: CIRCLE_VERTEX,
      fragmentShader: CIRCLE_FRAGMENT,
      uniforms: ["u_sizeRatio", "u_correctionRatio", "u_matrix"],
      attributes: [
        { name: "a_position", size: 2, type: "float" },
        { name: "a_size", size: 1, type: "float" },
        { name: "a_color", size: 4, type: "ubyte" },
      ],
      ...DISC_CONSTANTS,
    });
  }

  protected processVisible(i: number, data: NodeDisplayData): void {
    const a = this.array;
    a[i++] = data.x;
    a[i++] = data.y;
    a[i++] = data.size;
    a[i++] = floatColor(data.color);
  }

  protected setUniforms(p: RenderParams): void {
    const gl = this.gl;
    gl.uniform1f(this.uniform("u_correctionRatio"), p.correctionRatio);
    gl.uniform1f(this.uniform("u_sizeRatio"), p.sizeRatio);
    gl.uniformMatrix3fv(this.uniform("u_matrix"), false, p.matrix);
  }
}

const HALO_VERTEX = `
attribute vec2 a_position;
attribute float a_size;
attribute float a_angle;

uniform mat3 u_matrix;
uniform float u_sizeRatio;
uniform float u_correctionRatio;

varying vec2 v_diffVector;
varying float v_radius;

attribute vec4 a_borderColor_1;
varying vec4 v_borderColor_1;
attribute vec4 a_borderColor_2;
varying vec4 v_borderColor_2;

${BIAS}
const vec4 transparent = vec4(0.0, 0.0, 0.0, 0.0);

void main() {
  float size = a_size * u_correctionRatio / u_sizeRatio * 4.0;
  vec2 diffVector = size * vec2(cos(a_angle), sin(a_angle));
  vec2 position = a_position + diffVector;
  gl_Position = vec4(
    (u_matrix * vec3(position, 1)).xy,
    0,
    1
  );

  v_radius = size / 2.0;
  v_diffVector = diffVector;

  v_borderColor_1 = a_borderColor_1;
  v_borderColor_2 = a_borderColor_2;
}
`;

const HALO_FRAGMENT = `
precision highp float;

varying vec2 v_diffVector;
varying float v_radius;

varying vec4 v_borderColor_1;
varying vec4 v_borderColor_2;

uniform float u_correctionRatio;

${BIAS}
const vec4 transparent = vec4(0.0, 0.0, 0.0, 0.0);

void main(void) {
  float dist = length(v_diffVector);
  float aaBorder = 2.0 * u_correctionRatio;
  float v_borderSize_0 = v_radius;
  vec4 v_borderColor_0 = transparent;

  // Sizes:
  float borderSize_1 = v_radius * 0.26;
  // Now, let's split the remaining space between "fill" borders:
  float fillBorderSize = (v_radius - (borderSize_1) ) / 1.0;
  float borderSize_2 = fillBorderSize;

  // Finally, normalize all border sizes, to start from the full size and to end with the smallest:
  float adjustedBorderSize_0 = v_radius;
  float adjustedBorderSize_1 = adjustedBorderSize_0 - borderSize_1;
  float adjustedBorderSize_2 = adjustedBorderSize_1 - borderSize_2;

  // Colors:
  vec4 borderColor_0 = transparent;
  vec4 borderColor_1 = v_borderColor_1;
  borderColor_1.a *= bias;
  if (borderSize_1 <= 1.0 * u_correctionRatio) { borderColor_1 = borderColor_0; }
  vec4 borderColor_2 = v_borderColor_2;
  borderColor_2.a *= bias;
  if (borderSize_2 <= 1.0 * u_correctionRatio) { borderColor_2 = borderColor_1; }

  if (dist > adjustedBorderSize_0) {
    gl_FragColor = borderColor_0;
  } else if (dist > adjustedBorderSize_0 - aaBorder) {
    gl_FragColor = mix(borderColor_1, borderColor_0, (dist - adjustedBorderSize_0 + aaBorder) / aaBorder);
  } else if (dist > adjustedBorderSize_1) {
    gl_FragColor = borderColor_1;
  } else if (dist > adjustedBorderSize_1 - aaBorder) {
    gl_FragColor = mix(borderColor_2, borderColor_1, (dist - adjustedBorderSize_1 + aaBorder) / aaBorder);
  } else if (dist > adjustedBorderSize_2) {
    gl_FragColor = borderColor_2;
  } else { /* Nothing to add here */ }
}
`;

const DEFAULT_HALO_COLOR = "#000000";

export class NodeHaloProgram extends NodeProgram {
  constructor(gl: WebGL2RenderingContext, doc: Document) {
    super(gl, doc, {
      vertices: 3,
      vertexShader: HALO_VERTEX,
      fragmentShader: HALO_FRAGMENT,
      uniforms: ["u_sizeRatio", "u_correctionRatio", "u_matrix"],
      attributes: [
        { name: "a_position", size: 2, type: "float" },
        { name: "a_size", size: 1, type: "float" },
        { name: "a_borderColor_1", size: 4, type: "ubyte" },
        { name: "a_borderColor_2", size: 4, type: "ubyte" },
      ],
      ...DISC_CONSTANTS,
    });
  }

  protected processVisible(i: number, data: NodeDisplayData): void {
    const a = this.array;
    a[i++] = data.x;
    a[i++] = data.y;
    a[i++] = data.size;
    a[i++] = floatColor(data.haloColor || DEFAULT_HALO_COLOR);
    a[i++] = floatColor(data.color || DEFAULT_HALO_COLOR);
  }

  protected setUniforms(p: RenderParams): void {
    const gl = this.gl;
    gl.uniform1f(this.uniform("u_correctionRatio"), p.correctionRatio);
    gl.uniform1f(this.uniform("u_sizeRatio"), p.sizeRatio);
    gl.uniformMatrix3fv(this.uniform("u_matrix"), false, p.matrix);
  }
}

/* ------------------------------------------------------------------ edges */

export abstract class EdgeProgram extends Program {
  process(offset: number, source: NodeDisplayData, target: NodeDisplayData, data: EdgeDisplayData): void {
    const i = offset * this.stride;
    if (data.hidden || source.hidden || target.hidden) {
      this.zero(i);
      return;
    }
    this.processVisible(i, source, target, data);
  }

  protected abstract processVisible(index: number, source: NodeDisplayData, target: NodeDisplayData, data: EdgeDisplayData): void;
}

const LINE_VERTEX = `
attribute vec4 a_color;
attribute vec2 a_normal;
attribute float a_normalCoef;
attribute vec2 a_positionStart;
attribute vec2 a_positionEnd;
attribute float a_positionCoef;

uniform mat3 u_matrix;
uniform float u_sizeRatio;
uniform float u_zoomRatio;
uniform float u_pixelRatio;
uniform float u_correctionRatio;
uniform float u_minEdgeThickness;
uniform float u_feather;

varying vec4 v_color;
varying vec2 v_normal;
varying float v_thickness;
varying float v_feather;

${BIAS}

void main() {
  float minThickness = u_minEdgeThickness;

  vec2 normal = a_normal * a_normalCoef;
  vec2 position = a_positionStart * (1.0 - a_positionCoef) + a_positionEnd * a_positionCoef;

  float normalLength = length(normal);
  vec2 unitNormal = normal / normalLength;

  // We require edges to be at least "minThickness" pixels thick *on screen*
  // (so we need to compensate the size ratio):
  float pixelsThickness = max(normalLength, minThickness * u_sizeRatio);

  // Then, we need to retrieve the normalized thickness of the edge in the WebGL
  // referential (in a ([0, 1], [0, 1]) space), using our "magic" correction
  // ratio:
  float webGLThickness = pixelsThickness * u_correctionRatio / u_sizeRatio;

  // Here is the proper position of the vertex
  gl_Position = vec4((u_matrix * vec3(position + unitNormal * webGLThickness, 1)).xy, 0, 1);

  // For the fragment shader though, we need a thickness that takes the "magic"
  // correction ratio into account (as in webGLThickness), but so that the
  // antialiasing effect does not depend on the zoom level. So here's yet
  // another thickness version:
  v_thickness = webGLThickness / u_zoomRatio;

  v_normal = unitNormal;

  v_feather = u_feather * u_correctionRatio / u_zoomRatio / u_pixelRatio * 2.0;

  v_color = a_color;
  v_color.a *= bias;
}
`;

const LINE_FRAGMENT = `
precision mediump float;

varying vec4 v_color;
varying vec2 v_normal;
varying float v_thickness;
varying float v_feather;

const vec4 transparent = vec4(0.0, 0.0, 0.0, 0.0);

void main(void) {
  float dist = length(v_normal) * v_thickness;

  float t = smoothstep(
    v_thickness - v_feather,
    v_thickness,
    dist
  );

  gl_FragColor = mix(v_color, transparent, t);
}
`;

export class EdgeLineProgram extends EdgeProgram {
  constructor(gl: WebGL2RenderingContext, doc: Document) {
    super(gl, doc, {
      vertices: 6,
      vertexShader: LINE_VERTEX,
      fragmentShader: LINE_FRAGMENT,
      uniforms: ["u_matrix", "u_zoomRatio", "u_sizeRatio", "u_correctionRatio", "u_pixelRatio", "u_feather", "u_minEdgeThickness"],
      attributes: [
        { name: "a_positionStart", size: 2, type: "float" },
        { name: "a_positionEnd", size: 2, type: "float" },
        { name: "a_normal", size: 2, type: "float" },
        { name: "a_color", size: 4, type: "ubyte" },
      ],
      constantAttributes: [
        { name: "a_positionCoef", size: 1, type: "float" },
        { name: "a_normalCoef", size: 1, type: "float" },
      ],
      constantData: [[0, 1], [0, -1], [1, 1], [1, 1], [0, -1], [1, -1]],
    });
  }

  protected processVisible(i: number, source: NodeDisplayData, target: NodeDisplayData, data: EdgeDisplayData): void {
    const thickness = data.size || 1;
    const x1 = source.x, y1 = source.y, x2 = target.x, y2 = target.y;
    const dx = x2 - x1, dy = y2 - y1;
    let len = dx * dx + dy * dy;
    let n1 = 0, n2 = 0;
    if (len) {
      len = 1 / Math.sqrt(len);
      n1 = -dy * len * thickness;
      n2 = dx * len * thickness;
    }
    const a = this.array;
    a[i++] = x1;
    a[i++] = y1;
    a[i++] = x2;
    a[i++] = y2;
    a[i++] = n1;
    a[i++] = n2;
    a[i++] = floatColor(data.color);
  }

  protected setUniforms(p: RenderParams): void {
    const gl = this.gl;
    gl.uniformMatrix3fv(this.uniform("u_matrix"), false, p.matrix);
    gl.uniform1f(this.uniform("u_zoomRatio"), p.zoomRatio);
    gl.uniform1f(this.uniform("u_sizeRatio"), p.sizeRatio);
    gl.uniform1f(this.uniform("u_correctionRatio"), p.correctionRatio);
    gl.uniform1f(this.uniform("u_pixelRatio"), p.pixelRatio);
    gl.uniform1f(this.uniform("u_feather"), p.antiAliasingFeather);
    gl.uniform1f(this.uniform("u_minEdgeThickness"), p.minEdgeThickness);
  }
}

const CURVE_VERTEX = `
attribute vec4 a_color;
attribute float a_direction;
attribute float a_thickness;
attribute vec2 a_source;
attribute vec2 a_target;
attribute float a_current;
attribute float a_curvature;

uniform mat3 u_matrix;
uniform float u_sizeRatio;
uniform float u_pixelRatio;
uniform vec2 u_dimensions;
uniform float u_minEdgeThickness;
uniform float u_feather;

varying vec4 v_color;
varying float v_thickness;
varying float v_feather;
varying vec2 v_cpA;
varying vec2 v_cpB;
varying vec2 v_cpC;

${BIAS}
const float epsilon = 0.7;

vec2 clipspaceToViewport(vec2 pos, vec2 dimensions) {
  return vec2(
    (pos.x + 1.0) * dimensions.x / 2.0,
    (pos.y + 1.0) * dimensions.y / 2.0
  );
}

vec2 viewportToClipspace(vec2 pos, vec2 dimensions) {
  return vec2(
    pos.x / dimensions.x * 2.0 - 1.0,
    pos.y / dimensions.y * 2.0 - 1.0
  );
}

void main() {
  float minThickness = u_minEdgeThickness;

  // Selecting the correct position
  // Branchless "position = a_source if a_current == 1.0 else a_target"
  vec2 position = a_source * max(0.0, a_current) + a_target * max(0.0, 1.0 - a_current);
  position = (u_matrix * vec3(position, 1)).xy;

  vec2 source = (u_matrix * vec3(a_source, 1)).xy;
  vec2 target = (u_matrix * vec3(a_target, 1)).xy;

  vec2 viewportPosition = clipspaceToViewport(position, u_dimensions);
  vec2 viewportSource = clipspaceToViewport(source, u_dimensions);
  vec2 viewportTarget = clipspaceToViewport(target, u_dimensions);

  vec2 delta = viewportTarget.xy - viewportSource.xy;
  float len = length(delta);
  vec2 normal = vec2(-delta.y, delta.x) * a_direction;
  vec2 unitNormal = normal / len;
  float boundingBoxThickness = len * a_curvature;

  float curveThickness = max(minThickness, a_thickness / u_sizeRatio);
  v_thickness = curveThickness * u_pixelRatio;
  v_feather = u_feather;

  v_cpA = viewportSource;
  v_cpB = 0.5 * (viewportSource + viewportTarget) + unitNormal * a_direction * boundingBoxThickness;
  v_cpC = viewportTarget;

  vec2 viewportOffsetPosition = (
    viewportPosition +
    unitNormal * (boundingBoxThickness / 2.0 + sign(boundingBoxThickness) * (curveThickness + epsilon)) *
    max(0.0, a_direction) // NOTE: cutting the bounding box in half to avoid overdraw
  );

  position = viewportToClipspace(viewportOffsetPosition, u_dimensions);
  gl_Position = vec4(position, 0, 1);

  v_color = a_color;
  v_color.a *= bias;
}
`;

const CURVE_FRAGMENT = `
precision highp float;

varying vec4 v_color;
varying float v_thickness;
varying float v_feather;
varying vec2 v_cpA;
varying vec2 v_cpB;
varying vec2 v_cpC;

float det(vec2 a, vec2 b) {
  return a.x * b.y - b.x * a.y;
}

vec2 getDistanceVector(vec2 b0, vec2 b1, vec2 b2) {
  float a = det(b0, b2), b = 2.0 * det(b1, b0), d = 2.0 * det(b2, b1);
  float f = b * d - a * a;
  vec2 d21 = b2 - b1, d10 = b1 - b0, d20 = b2 - b0;
  vec2 gf = 2.0 * (b * d21 + d * d10 + a * d20);
  gf = vec2(gf.y, -gf.x);
  vec2 pp = -f * gf / dot(gf, gf);
  vec2 d0p = b0 - pp;
  float ap = det(d0p, d20), bp = 2.0 * det(d10, d0p);
  float t = clamp((ap + bp) / (2.0 * a + b + d), 0.0, 1.0);
  return mix(mix(b0, b1, t), mix(b1, b2, t), t);
}

float distToQuadraticBezierCurve(vec2 p, vec2 b0, vec2 b1, vec2 b2) {
  return length(getDistanceVector(b0 - p, b1 - p, b2 - p));
}

const vec4 transparent = vec4(0.0, 0.0, 0.0, 0.0);

void main(void) {
  float dist = distToQuadraticBezierCurve(gl_FragCoord.xy, v_cpA, v_cpB, v_cpC);
  float thickness = v_thickness;

  float halfThickness = thickness / 2.0;
  if (dist < halfThickness) {
    float t = smoothstep(
      halfThickness - v_feather,
      halfThickness,
      dist
    );

    gl_FragColor = mix(v_color, transparent, t);
  } else {
    gl_FragColor = transparent;
  }
}
`;

const DEFAULT_CURVATURE = 0.25;

export class EdgeCurveProgram extends EdgeProgram {
  constructor(gl: WebGL2RenderingContext, doc: Document) {
    super(gl, doc, {
      vertices: 6,
      vertexShader: CURVE_VERTEX,
      fragmentShader: CURVE_FRAGMENT,
      uniforms: ["u_matrix", "u_sizeRatio", "u_dimensions", "u_pixelRatio", "u_feather", "u_minEdgeThickness"],
      attributes: [
        { name: "a_source", size: 2, type: "float" },
        { name: "a_target", size: 2, type: "float" },
        { name: "a_thickness", size: 1, type: "float" },
        { name: "a_curvature", size: 1, type: "float" },
        { name: "a_color", size: 4, type: "ubyte" },
      ],
      constantAttributes: [
        { name: "a_current", size: 1, type: "float" },
        { name: "a_direction", size: 1, type: "float" },
      ],
      constantData: [[0, 1], [0, -1], [1, 1], [0, -1], [1, 1], [1, -1]],
    });
  }

  protected processVisible(i: number, source: NodeDisplayData, target: NodeDisplayData, data: EdgeDisplayData): void {
    const a = this.array;
    a[i++] = source.x;
    a[i++] = source.y;
    a[i++] = target.x;
    a[i++] = target.y;
    a[i++] = data.size || 1;
    a[i++] = data.curvature ?? DEFAULT_CURVATURE;
    a[i++] = floatColor(data.color);
  }

  protected setUniforms(p: RenderParams): void {
    const gl = this.gl;
    gl.uniformMatrix3fv(this.uniform("u_matrix"), false, p.matrix);
    gl.uniform1f(this.uniform("u_pixelRatio"), p.pixelRatio);
    gl.uniform1f(this.uniform("u_sizeRatio"), p.sizeRatio);
    gl.uniform1f(this.uniform("u_feather"), p.antiAliasingFeather);
    gl.uniform2f(this.uniform("u_dimensions"), p.width * p.pixelRatio, p.height * p.pixelRatio);
    gl.uniform1f(this.uniform("u_minEdgeThickness"), p.minEdgeThickness);
  }
}
