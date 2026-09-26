// github#58, github#7

import { Camera } from "./camera";
import { MouseCaptor, type CaptorHost, type Coords } from "./captor";
import { Emitter } from "./emitter";
import { EdgeCurveProgram, EdgeLineProgram, NodeCircleProgram, NodeHaloProgram,
         type EdgeProgram, type NodeProgram, type RenderParams } from "./programs";
import type { EdgeDisplayData, GraphStore, NodeDisplayData, NodeEvent, Point, RefreshOptions,
              Renderer as RendererApi, RendererEvents, RendererOptions, RendererSettings,
              StageEvent } from "./types";
import { createNormalization, getMatrixImpact, graphExtent, identity, matrixFromCamera,
         multiplyVec2, type Extent, type Mat3, type Normalization } from "./viewport";

interface EventMap extends RendererEvents {
  downStage: StageEvent;
  upNode: NodeEvent;
  upStage: StageEvent;
}

// github#58
const PICK_FLOOR_PX = 1.5;
// github#73
const TOUCH_PICK_FLOOR_PX = 14;
type WebGLLayer = "edges" | "nodes" | "hoverNodes";
type CanvasLayer = "labels" | "hovers" | "mouse";

const X_LABEL_MARGIN = 150;
const Y_LABEL_MARGIN = 50;
// github#186
const SPARSE_LABEL_LIMIT = 12;
const SPARSE_LABEL_WIDTH = 180;
const ANTI_ALIASING_FEATHER = 1;
const STAGE_PADDING = 30;
const DEFAULT_NODE_COLOR = "#999";
const DEFAULT_EDGE_COLOR = "#ccc";

function applyNodeDefaults(key: string, styled: Partial<NodeDisplayData> & Point): NodeDisplayData {
  if (typeof styled.x !== "number" || typeof styled.y !== "number") {
    throw new Error(`vault-graph: node "${key}" has no position; the style function must keep x and y`);
  }
  if (!styled.color) styled.color = DEFAULT_NODE_COLOR;
  if (typeof styled.label !== "string") styled.label = null;
  if (!styled.size) styled.size = 2;
  if (styled.hidden === undefined) styled.hidden = false;
  if (styled.highlighted === undefined) styled.highlighted = false;
  if (styled.forceLabel === undefined) styled.forceLabel = false;
  if (!styled.type) styled.type = "circle";
  if (!styled.zIndex) styled.zIndex = 0;
  return styled as NodeDisplayData;
}

function applyEdgeDefaults(styled: Partial<EdgeDisplayData> & { size: number }): EdgeDisplayData {
  if (!styled.color) styled.color = DEFAULT_EDGE_COLOR;
  if (!styled.label) styled.label = "";
  if (!styled.size) styled.size = 0.5;
  if (styled.hidden === undefined) styled.hidden = false;
  if (!styled.type) styled.type = "line";
  if (!styled.zIndex) styled.zIndex = 0;
  return styled as EdgeDisplayData;
}

function byZIndex<T>(items: T[], z: (item: T) => number): T[] {
  return items.sort((a, b) => {
    const za = z(a) || 0, zb = z(b) || 0;
    return za < zb ? -1 : za > zb ? 1 : 0;
  });
}

export class Renderer extends Emitter<EventMap> implements RendererApi {
  private readonly settings: RendererSettings;
  private readonly win: Window;
  private readonly doc: Document;
  private readonly nodeReducer: RendererOptions["nodeReducer"];
  private readonly edgeReducer: RendererOptions["edgeReducer"];
  private readonly drawHover: RendererOptions["drawHover"];

  private readonly elements = new Map<string, HTMLCanvasElement>();
  private readonly gl: Record<WebGLLayer, WebGL2RenderingContext>;
  private readonly ctx: Record<CanvasLayer, CanvasRenderingContext2D>;
  // github#144 -- rebuilt on webglcontextrestored, so not readonly
  private nodePrograms: { circle: NodeProgram; halo: NodeProgram };
  private hoverPrograms: { circle: NodeProgram; halo: NodeProgram };
  private edgePrograms: { line: EdgeProgram; curve: EdgeProgram };

  private readonly camera: Camera;
  private readonly captor: MouseCaptor;

  private readonly nodeData = new Map<string, NodeDisplayData>();
  private readonly edgeData = new Map<string, EdgeDisplayData>();
  private readonly forcedLabels = new Set<string>();
  private readonly highlighted = new Set<string>();
  private hoveredNode: string | null = null;
  private nodeOrder: string[] = [];
  private nodeZExtent: [number, number] = [Infinity, -Infinity];
  private edgeZExtent: [number, number] = [Infinity, -Infinity];

  private nodeExtent: Extent = { x: [0, 1], y: [0, 1] };
  private customBBox: Extent | null = null;
  private normalization: Normalization = createNormalization({ x: [0, 1], y: [0, 1] });
  private matrix: Mat3 = identity();
  private invMatrix: Mat3 = identity();
  private correctionRatio = 1;

  private width = 0;
  private height = 0;
  private pixelRatio = 1;
  private needToProcess = false;
  private killed = false;
  private renderFrame: number | null = null;
  private hoverFrame: number | null = null;
  // github#144 -- the layers whose context is gone right now
  private readonly lost = new Set<WebGLLayer>();
  private readonly contextListeners: Array<() => void> = [];
  private readonly onWindowResize = (): void => {
    this.scheduleRefresh();
  };
  // github#182 -- the container is the stage, not just the window
  private containerRO: ResizeObserver | null = null;

  constructor(
    private readonly graph: GraphStore,
    private readonly container: HTMLElement,
    options: RendererOptions,
  ) {
    super();
    const { win, nodeReducer, edgeReducer, drawHover, ...settings } = options;
    this.settings = { ...settings };
    this.win = win;
    this.doc = container.ownerDocument;
    this.nodeReducer = nodeReducer;
    this.edgeReducer = edgeReducer;
    this.drawHover = drawHover;

    const edges = this.createWebGL("edges");
    const nodes = this.createWebGL("nodes");
    const labels = this.create2D("labels");
    const hovers = this.create2D("hovers");
    const hoverNodes = this.createWebGL("hoverNodes");
    const mouse = this.create2D("mouse");
    this.gl = { edges, nodes, hoverNodes };
    this.ctx = { labels, hovers, mouse };
    this.resize(true);

    this.nodePrograms = this.makeNodePrograms("nodes");
    this.hoverPrograms = this.makeNodePrograms("hoverNodes");
    this.edgePrograms = this.makeEdgePrograms();

    this.camera = new Camera(win);
    this.applyCameraSettings();
    this.camera.on("updated", () => this.scheduleRender());

    const live = this.settings;
    const host: CaptorHost = {
      getCamera: () => this.camera,
      viewportToFramedGraph: (p) => this.viewportToFramedGraph(p),
      getViewportZoomedState: (p, r) => this.getViewportZoomedState(p, r),
      get zoomingRatio() { return live.zoomingRatio; },
      get zoomDuration() { return live.zoomDuration; },
    };
    this.captor = new MouseCaptor(mouse.canvas, host, win);
    this.bindCaptor();
    win.addEventListener("resize", this.onWindowResize);
    // github#182 -- a popout is a different window from the global
    const RO = (win as Window & { ResizeObserver?: typeof ResizeObserver }).ResizeObserver;
    if (RO) {
      const ro = new RO(() => this.scheduleRender());
      ro.observe(this.container);
      this.containerRO = ro;
    }

    this.refresh();
  }

  /* ------------------------------------------------------------ public API */

  refresh(opts?: RefreshOptions): void {
    if (this.killed) return;
    const partial = opts?.partialGraph;
    if (!partial) {
      this.clearIndices();
      this.graph.forEachNode((id) => this.addNode(id));
      this.graph.forEachEdge((e) => this.addEdge(e));
    } else {
      for (const id of partial.nodes ?? []) this.updateNode(id);
      for (const e of partial.edges ?? []) this.addEdge(e);
    }
    this.needToProcess = true;
    if (opts?.schedule) this.scheduleRender();
    else this.render();
  }

  render(): void {
    if (this.killed) return;
    if (this.renderFrame !== null) {
      this.win.cancelAnimationFrame(this.renderFrame);
      this.renderFrame = null;
    }
    this.resize();
    if (this.needToProcess) this.process();
    this.needToProcess = false;
    this.clear();
    if (!this.graph.order) {
      this.emit("afterRender", undefined);
      return;
    }

    const state = this.camera.getState();
    const dims = this.getDimensions();
    const graphDims = this.getGraphDimensions();
    this.matrix = matrixFromCamera(state, dims, graphDims, STAGE_PADDING);
    this.invMatrix = matrixFromCamera(state, dims, graphDims, STAGE_PADDING, true);
    this.correctionRatio = getMatrixImpact(this.matrix, state, dims);

    const params = this.renderParams();
    // github#144 -- a lost layer draws nothing, the others carry on
    if (!this.lost.has("nodes")) {
      this.nodePrograms.circle.render(params);
      this.nodePrograms.halo.render(params);
    }
    if (!this.lost.has("edges")) {
      this.edgePrograms.line.render(params);
      this.edgePrograms.curve.render(params);
    }
    this.renderLabels();
    this.renderHighlightedNodes();
    this.emit("afterRender", undefined);
  }

  kill(): void {
    this.killed = true;
    this.removeAllListeners();
    this.camera.kill();
    this.win.removeEventListener("resize", this.onWindowResize);
    // github#182
    this.containerRO?.disconnect();
    this.containerRO = null;
    this.captor.kill();
    if (this.renderFrame !== null) this.win.cancelAnimationFrame(this.renderFrame);
    if (this.hoverFrame !== null) this.win.cancelAnimationFrame(this.hoverFrame);
    this.renderFrame = null;
    this.hoverFrame = null;
    this.clearIndices();
    this.hoveredNode = null;
    for (const p of [this.nodePrograms.circle, this.nodePrograms.halo, this.hoverPrograms.circle,
                     this.hoverPrograms.halo, this.edgePrograms.line, this.edgePrograms.curve]) p.kill();
    // github#144 -- off before the deliberate loss below
    for (const off of this.contextListeners) off();
    this.contextListeners.length = 0;
    for (const gl of [this.gl.edges, this.gl.nodes, this.gl.hoverNodes]) {
      gl.getExtension("WEBGL_lose_context")?.loseContext();
    }
    for (const el of this.elements.values()) el.remove();
    this.elements.clear();
  }

  graphToViewport(p: Point): Point {
    return this.framedGraphToViewport(this.normalization.apply(p));
  }

  viewportToGraph(p: Point): Point {
    return this.normalization.inverse(this.viewportToFramedGraph(p));
  }

  getCamera(): Camera {
    return this.camera;
  }

  scaleSize(size = 1, cameraRatio = this.camera.ratio): number {
    return size / cameraRatio;
  }

  getNodeDisplayData(id: string): NodeDisplayData | undefined {
    const d = this.nodeData.get(id);
    return d ? { ...d } : undefined;
  }

  getEdgeDisplayData(edge: string): EdgeDisplayData | undefined {
    const d = this.edgeData.get(edge);
    return d ? { ...d } : undefined;
  }

  getSetting<K extends keyof RendererSettings>(name: K): RendererSettings[K] {
    return this.settings[name];
  }

  setSetting<K extends keyof RendererSettings>(name: K, value: RendererSettings[K]): void {
    this.settings[name] = value;
    this.applyCameraSettings();
    this.scheduleRefresh();
  }

  getCanvases(): Record<string, HTMLCanvasElement> {
    const out: Record<string, HTMLCanvasElement> = {};
    for (const [id, el] of this.elements) out[id] = el;
    return out;
  }

  getDimensions(): { width: number; height: number } {
    return { width: this.width, height: this.height };
  }

  getMouseCaptor(): MouseCaptor {
    return this.captor;
  }

  setCustomBBox(bbox: Extent | null): void {
    this.customBBox = bbox;
    this.scheduleRender();
  }

  /* ---------------------------------------------------------------- layers */

  private createCanvas(id: string): HTMLCanvasElement {
    const host = this.container as HTMLElement & { createEl?: (tag: "canvas") => HTMLCanvasElement };
    const canvas = host.createEl
      ? host.createEl("canvas")
      : (this.doc.createElementNS("http://www.w3.org/1999/xhtml", "canvas") as HTMLCanvasElement);
    canvas.className = "vg-layer vg-layer-" + id;
    this.container.appendChild(canvas);
    this.elements.set(id, canvas);
    return canvas;
  }

  private createWebGL(id: WebGLLayer): WebGL2RenderingContext {
    const canvas = this.createCanvas(id);
    const gl = canvas.getContext("webgl2", { preserveDrawingBuffer: false, antialias: false });
    if (!gl) throw new Error("vault-graph: WebGL2 is not available in this window");
    this.applyContextState(gl);
    // github#144 -- a loss must be prevented to be restorable
    const lost = (event: Event): void => this.onContextLost(id, event);
    const restored = (): void => this.onContextRestored(id);
    canvas.addEventListener("webglcontextlost", lost);
    canvas.addEventListener("webglcontextrestored", restored);
    this.contextListeners.push(() => {
      canvas.removeEventListener("webglcontextlost", lost);
      canvas.removeEventListener("webglcontextrestored", restored);
    });
    return gl;
  }

  private create2D(id: CanvasLayer): CanvasRenderingContext2D {
    const canvas = this.createCanvas(id);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("vault-graph: could not create a 2D context");
    return ctx;
  }

  private resize(force = false): void {
    const prevW = this.width, prevH = this.height, prevRatio = this.pixelRatio;
    this.width = this.container.offsetWidth || 1;
    this.height = this.container.offsetHeight || 1;
    this.pixelRatio = this.win.devicePixelRatio || 1;
    if (!force && prevW === this.width && prevH === this.height && prevRatio === this.pixelRatio) return;
    const w = this.width * this.pixelRatio, h = this.height * this.pixelRatio;
    for (const el of this.elements.values()) {
      el.style.width = this.width + "px";
      el.style.height = this.height + "px";
      el.width = w;
      el.height = h;
    }
    if (this.pixelRatio !== 1) for (const ctx of Object.values(this.ctx)) ctx.scale(this.pixelRatio, this.pixelRatio);
    for (const gl of Object.values(this.gl)) gl.viewport(0, 0, w, h);
  }

  private clear(): void {
    for (const layer of ["nodes", "edges", "hoverNodes"] as const) {
      // github#144 -- a call on a lost context is a silent no-op
      if (this.lost.has(layer)) continue;
      const gl = this.gl[layer];
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.clear(gl.COLOR_BUFFER_BIT);
    }
    this.ctx.labels.clearRect(0, 0, this.width, this.height);
    this.ctx.hovers.clearRect(0, 0, this.width, this.height);
  }

  /* --------------------------------------------------- github#144, context loss */

  // github#144 -- the state a restored context does not carry over
  private applyContextState(gl: WebGL2RenderingContext): void {
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.viewport(0, 0, this.width * this.pixelRatio, this.height * this.pixelRatio);
  }

  private makeNodePrograms(layer: "nodes" | "hoverNodes"): { circle: NodeProgram; halo: NodeProgram } {
    const gl = this.gl[layer];
    return { circle: new NodeCircleProgram(gl, this.doc), halo: new NodeHaloProgram(gl, this.doc) };
  }

  private makeEdgePrograms(): { line: EdgeProgram; curve: EdgeProgram } {
    const gl = this.gl.edges;
    return { line: new EdgeLineProgram(gl, this.doc), curve: new EdgeCurveProgram(gl, this.doc) };
  }

  private onContextLost(layer: WebGLLayer, event: Event): void {
    // github#144 -- kill() loses all three on purpose
    if (this.killed) return;
    event.preventDefault();
    if (this.lost.has(layer)) return;
    this.lost.add(layer);
    this.emit("contextLost", { layer });
  }

  private onContextRestored(layer: WebGLLayer): void {
    if (this.killed) return;
    this.lost.delete(layer);
    const gl = this.gl[layer];
    this.applyContextState(gl);
    // github#144 -- nothing to delete: the old resources died with the context
    if (layer === "nodes") this.nodePrograms = this.makeNodePrograms("nodes");
    else if (layer === "hoverNodes") this.hoverPrograms = this.makeNodePrograms("hoverNodes");
    else this.edgePrograms = this.makeEdgePrograms();
    // github#144 -- a fresh program is at capacity 0, so process() again
    this.needToProcess = true;
    this.render();
    this.emit("contextRestored", { layer });
  }

  /* ------------------------------------------------------------- indexing */

  private addNode(id: string): void {
    const styled = this.nodeReducer(id, { ...this.graph.getNodeAttributes(id) });
    const data = applyNodeDefaults(id, styled);
    this.nodeData.set(id, data);
    this.forcedLabels.delete(id);
    if (data.forceLabel && !data.hidden) this.forcedLabels.add(id);
    this.highlighted.delete(id);
    if (data.highlighted && !data.hidden) this.highlighted.add(id);
    const z = data.zIndex ?? 0;
    if (z < this.nodeZExtent[0]) this.nodeZExtent[0] = z;
    if (z > this.nodeZExtent[1]) this.nodeZExtent[1] = z;
    this.normalization.applyTo(data);
  }

  private updateNode(id: string): void {
    this.addNode(id);
  }

  private addEdge(edge: string): void {
    const styled = this.edgeReducer(edge, { ...this.graph.getEdgeAttributes(edge) });
    const data = applyEdgeDefaults(styled);
    this.edgeData.set(edge, data);
    const z = data.zIndex ?? 0;
    if (z < this.edgeZExtent[0]) this.edgeZExtent[0] = z;
    if (z > this.edgeZExtent[1]) this.edgeZExtent[1] = z;
  }

  private clearIndices(): void {
    this.nodeData.clear();
    this.edgeData.clear();
    this.forcedLabels.clear();
    this.highlighted.clear();
    this.nodeZExtent = [Infinity, -Infinity];
    this.edgeZExtent = [Infinity, -Infinity];
    this.nodeExtent = { x: [0, 1], y: [0, 1] };
  }

  private process(): void {
    this.nodeExtent = graphExtent(this.graph);
    this.normalization = createNormalization(this.customBBox ?? this.nodeExtent);

    const ids = this.graph.nodes();
    const datas: NodeDisplayData[] = [];
    const order: string[] = [];
    let circles = 0, halos = 0;
    for (const id of ids) {
      const data = this.nodeData.get(id);
      if (!data) continue;
      const attrs = this.graph.getNodeAttributes(id);
      data.x = attrs.x;
      data.y = attrs.y;
      this.normalization.applyTo(data);
      if (data.type === "halo") halos++;
      else circles++;
      order.push(id);
      datas.push(data);
    }
    this.nodePrograms.circle.reallocate(circles);
    this.nodePrograms.halo.reallocate(halos);
    if (this.nodeZExtent[0] !== this.nodeZExtent[1]) {
      const index = byZIndex(order.map((_, i) => i), (i) => datas[i].zIndex ?? 0);
      const sortedIds: string[] = [];
      const sortedDatas: NodeDisplayData[] = [];
      for (const i of index) {
        sortedIds.push(order[i]);
        sortedDatas.push(datas[i]);
      }
      order.length = 0;
      datas.length = 0;
      for (let i = 0; i < sortedIds.length; i++) {
        order.push(sortedIds[i]);
        datas.push(sortedDatas[i]);
      }
    }
    circles = 0;
    halos = 0;
    for (const data of datas) {
      if (data.type === "halo") this.nodePrograms.halo.process(halos++, data);
      else this.nodePrograms.circle.process(circles++, data);
    }
    this.nodeOrder = order;

    let edges = this.graph.edges();
    let lines = 0, curves = 0;
    for (const e of edges) {
      const data = this.edgeData.get(e);
      if (!data) continue;
      if (data.type === "curve") curves++;
      else lines++;
    }
    this.edgePrograms.line.reallocate(lines);
    this.edgePrograms.curve.reallocate(curves);
    if (this.edgeZExtent[0] !== this.edgeZExtent[1]) {
      edges = byZIndex(edges, (e) => this.edgeData.get(e)?.zIndex ?? 0);
    }
    lines = 0;
    curves = 0;
    for (const e of edges) {
      const data = this.edgeData.get(e);
      if (!data) continue;
      const [s, t] = this.graph.extremities(e);
      const sd = this.nodeData.get(s), td = this.nodeData.get(t);
      if (!sd || !td) continue;
      if (data.type === "curve") this.edgePrograms.curve.process(curves++, sd, td, data);
      else this.edgePrograms.line.process(lines++, sd, td, data);
    }
  }

  /* -------------------------------------------------------------- drawing */

  private renderParams(): RenderParams {
    return {
      matrix: this.matrix,
      width: this.width,
      height: this.height,
      pixelRatio: this.pixelRatio,
      zoomRatio: this.camera.ratio,
      sizeRatio: 1 / this.scaleSize(),
      correctionRatio: this.correctionRatio,
      minEdgeThickness: this.settings.minEdgeThickness,
      antiAliasingFeather: ANTI_ALIASING_FEATHER,
    };
  }

  private renderLabels(): void {
    const ctx = this.ctx.labels;
    const { labelSize, labelFont, labelWeight, labelColor } = this.settings;
    const occupied: { x: number; y: number; w: number; h: number }[] = [];
    ctx.fillStyle = labelColor;
    ctx.font = `${labelWeight} ${labelSize}px ${labelFont}`;
    for (const id of this.forcedLabels) {
      const data = this.nodeData.get(id);
      if (!data || data.hidden || !data.label) continue;
      const { x, y } = this.framedGraphToViewport(data);
      const size = this.scaleSize(data.size);
      if (x < -X_LABEL_MARGIN || x > this.width + X_LABEL_MARGIN || y < -Y_LABEL_MARGIN || y > this.height + Y_LABEL_MARGIN) continue;
      ctx.fillText(data.label, x + size + 3, y + labelSize / 3);
      occupied.push({ x: x + size + 1, y: y - labelSize, w: ctx.measureText(data.label).width + 4, h: labelSize + 5 });
    }
    // github#186
    const visible: NodeDisplayData[] = [];
    for (const data of this.nodeData.values()) {
      if (data.hidden) continue;
      visible.push(data);
      if (visible.length > SPARSE_LABEL_LIMIT) return;
    }
    for (const data of visible) {
      const { x, y } = this.framedGraphToViewport(data);
      const r = this.scaleSize(data.size) + 2;
      occupied.push({ x: x - r, y: y - r, w: r * 2, h: r * 2 });
    }
    for (const data of visible) {
      if (!data.autoLabel || data.forceLabel || !data.label) continue;
      const { x, y } = this.framedGraphToViewport(data);
      if (x < 0 || x > this.width || y < 0 || y > this.height) continue;
      const r = this.scaleSize(data.size) + 5;
      const maxWidth = Math.min(SPARSE_LABEL_WIDTH, this.width * 0.4);
      const chars = Array.from(data.label);
      let text = data.label;
      while (chars.length && ctx.measureText(text).width > maxWidth) {
        chars.pop(); text = chars.join("") + "…";
      }
      const w = ctx.measureText(text).width;
      const candidates = [
        { x: x + r, y: y + labelSize / 3 },
        { x: x - r - w, y: y + labelSize / 3 },
        { x: x - w / 2, y: y - r },
        { x: x - w / 2, y: y + r + labelSize }
      ];
      for (const at of candidates) {
        const box = { x: at.x - 2, y: at.y - labelSize, w: w + 4, h: labelSize + 4 };
        if (box.x < 2 || box.y < 2 || box.x + box.w > this.width - 2 || box.y + box.h > this.height - 2) continue;
        if (occupied.some((b) => box.x < b.x + b.w && box.x + box.w > b.x && box.y < b.y + b.h && box.y + box.h > b.y)) continue;
        ctx.fillText(text, at.x, at.y);
        occupied.push(box);
        break;
      }
    }
  }

  private renderHighlightedNodes(): void {
    const ctx = this.ctx.hovers;
    ctx.clearRect(0, 0, this.width, this.height);
    const toRender: string[] = [];
    const hovered = this.hoveredNode;
    if (hovered !== null) {
      const d = this.nodeData.get(hovered);
      if (d && !d.hidden) toRender.push(hovered);
    }
    for (const id of this.highlighted) if (id !== hovered) toRender.push(id);

    for (const id of toRender) {
      const data = this.nodeData.get(id);
      if (!data) continue;
      const { x, y } = this.framedGraphToViewport(data);
      this.drawHover(ctx, { key: id, ...data, size: this.scaleSize(data.size), x, y }, this.settings);
    }

    // github#144 -- the 2D hovers above still draw; the program work does not
    if (this.lost.has("hoverNodes")) return;

    let circles = 0, halos = 0;
    for (const id of toRender) {
      if (this.nodeData.get(id)?.type === "halo") halos++;
      else circles++;
    }
    this.hoverPrograms.circle.reallocate(circles);
    this.hoverPrograms.halo.reallocate(halos);
    circles = 0;
    halos = 0;
    for (const id of toRender) {
      const data = this.nodeData.get(id);
      if (!data) continue;
      if (data.type === "halo") this.hoverPrograms.halo.process(halos++, data);
      else this.hoverPrograms.circle.process(circles++, data);
    }
    const gl = this.gl.hoverNodes;
    gl.clear(gl.COLOR_BUFFER_BIT);
    const params = this.renderParams();
    this.hoverPrograms.circle.render(params);
    this.hoverPrograms.halo.render(params);
  }

  private scheduleRender(): void {
    if (this.killed || this.renderFrame !== null) return;
    this.renderFrame = this.win.requestAnimationFrame(() => this.render());
  }

  private scheduleRefresh(): void {
    this.refresh({ schedule: true });
  }

  private scheduleHighlightedNodesRender(): void {
    if (this.killed || this.hoverFrame !== null || this.renderFrame !== null) return;
    this.hoverFrame = this.win.requestAnimationFrame(() => {
      this.hoverFrame = null;
      this.renderHighlightedNodes();
    });
  }

  /* --------------------------------------------------------------- camera */

  private applyCameraSettings(): void {
    this.camera.minRatio = this.settings.minCameraRatio;
    this.camera.maxRatio = this.settings.maxCameraRatio;
    this.camera.enabledPanning = this.settings.enableCameraPanning;
    this.camera.setState(this.camera.validateState(this.camera.getState()));
  }

  private getGraphDimensions(): { width: number; height: number } {
    const extent = this.customBBox ?? this.nodeExtent;
    return { width: extent.x[1] - extent.x[0] || 1, height: extent.y[1] - extent.y[0] || 1 };
  }

  private framedGraphToViewport(p: Point): Point {
    const v = multiplyVec2(this.matrix, p);
    return { x: ((1 + v.x) * this.width) / 2, y: ((1 - v.y) * this.height) / 2 };
  }

  private viewportToFramedGraph(p: Point): Point {
    const res = multiplyVec2(this.invMatrix, { x: (p.x / this.width) * 2 - 1, y: 1 - (p.y / this.height) * 2 });
    if (Number.isNaN(res.x)) res.x = 0;
    if (Number.isNaN(res.y)) res.y = 0;
    return res;
  }

  private getViewportZoomedState(target: Point, newRatio: number): ReturnType<Camera["getState"]> {
    const { ratio, angle, x, y } = this.camera.getState();
    const { minCameraRatio, maxCameraRatio } = this.settings;
    if (typeof maxCameraRatio === "number") newRatio = Math.min(newRatio, maxCameraRatio);
    if (typeof minCameraRatio === "number") newRatio = Math.max(newRatio, minCameraRatio);
    const ratioDiff = newRatio / ratio;
    const mouse = this.viewportToFramedGraph(target);
    const centre = this.viewportToFramedGraph({ x: this.width / 2, y: this.height / 2 });
    return {
      angle,
      x: (mouse.x - centre.x) * (1 - ratioDiff) + x,
      y: (mouse.y - centre.y) * (1 - ratioDiff) + y,
      ratio: newRatio,
    };
  }

  /* -------------------------------------------------------------- picking */

  // github#73, design/0013
  private getNodeAtPosition(p: Point, floorPx = PICK_FLOOR_PX): string | null {
    let lastCircle: string | null = null;
    let lastHalo: string | null = null;
    let nearest: string | null = null;
    let nearestD2 = floorPx * floorPx;
    const inv = 1 / this.camera.ratio;
    for (const id of this.nodeOrder) {
      const data = this.nodeData.get(id);
      if (!data || data.hidden) continue;
      const v = this.framedGraphToViewport(data);
      const r = data.size * inv;
      const dx = v.x - p.x, dy = v.y - p.y;
      const d2 = dx * dx + dy * dy;
      if (d2 > r * r) {
        if (d2 <= nearestD2) { nearestD2 = d2; nearest = id; }
        continue;
      }
      if (data.type === "halo") lastHalo = id;
      else lastCircle = id;
    }
    return lastHalo ?? lastCircle ?? nearest;
  }

  /* --------------------------------------------------------------- events */

  private bindCaptor(): void {
    const base = (event: Coords): StageEvent => ({ event, preventDefault: () => event.preventDefault() });

    this.captor.on("mousemove", (e) => {
      const ev = base(e);
      const at = this.getNodeAtPosition(e);
      if (at !== null && this.hoveredNode !== at) {
        if (this.hoveredNode !== null) this.emit("leaveNode", { ...ev, node: this.hoveredNode });
        this.hoveredNode = at;
        this.emit("enterNode", { ...ev, node: at });
        this.scheduleHighlightedNodesRender();
        return;
      }
      if (this.hoveredNode !== null && at !== this.hoveredNode) {
        const node = this.hoveredNode;
        this.hoveredNode = null;
        this.emit("leaveNode", { ...ev, node });
        this.scheduleHighlightedNodesRender();
      }
    });

    this.captor.on("mouseleave", (e) => {
      if (this.hoveredNode !== null) {
        const node = this.hoveredNode;
        this.hoveredNode = null;
        this.emit("leaveNode", { ...base(e), node });
        this.scheduleHighlightedNodesRender();
      }
    });

    const interaction = (kind: "click" | "doubleClick" | "rightClick" | "down" | "up") => (e: Coords): void => {
      const ev = base(e);
      // github#73
      const at = this.getNodeAtPosition(e, e.fat ? TOUCH_PICK_FLOOR_PX : PICK_FLOOR_PX);
      if (at !== null) {
        const payload: NodeEvent = { ...ev, node: at };
        if (kind === "click") this.emit("clickNode", payload);
        else if (kind === "doubleClick") this.emit("doubleClickNode", payload);
        else if (kind === "rightClick") this.emit("rightClickNode", payload);
        else if (kind === "down") this.emit("downNode", payload);
        else this.emit("upNode", payload);
        return;
      }
      if (kind === "click") this.emit("clickStage", ev);
      else if (kind === "doubleClick") this.emit("doubleClickStage", ev);
      else if (kind === "rightClick") this.emit("rightClickStage", ev);
      else if (kind === "down") this.emit("downStage", ev);
      else this.emit("upStage", ev);
    };
    this.captor.on("click", interaction("click"));
    this.captor.on("doubleClick", interaction("doubleClick"));
    this.captor.on("rightClick", interaction("rightClick"));
    this.captor.on("mousedown", interaction("down"));
    this.captor.on("mouseup", interaction("up"));
  }
}
