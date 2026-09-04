/**
 * The renderer: the page's picture, drawn by code we own (github#58, step 3).
 *
 * This is Sigma 3.0.2's Sigma class (MIT) cut down to what src/page.js used, and ported with
 * the same order of operations wherever the order shows: the layers stack in the same order in
 * the DOM, the two node programs and the two edge programs draw in the same order, labels and
 * hovers paint in the same order, and every number the page reads back -- graphToViewport,
 * scaleSize, getNodeDisplayData -- is computed the same way. The golden snapshots and the
 * pixel diff against the Sigma build are the proof; the comments say why where it matters.
 *
 * WHAT IS NOT HERE, and why: the label density grid (every label the page does not force is
 * empty, so the grid never drew one); the picking framebuffer (nodes are picked by geometry --
 * a pointer is on a node when it is within the node's drawn radius, the last-drawn one wins,
 * exactly what reading the colour-coded buffer answered); edge events, edge labels, touch, the
 * hide-on-move settings; the graph subscription (the store has no events and every write in
 * the page is followed by a refresh); WebGL1.
 *
 * LAYERS, bottom to top, all absolutely positioned inside the container the page hands over:
 *   edges       WebGL2   the line and curve programs
 *   nodes       WebGL2   the circle and halo programs
 *   labels      2D       forced labels (search hits, the focused note past the dim)
 *   hovers      2D       the page's drawHover: the focus web and the pill
 *   hoverNodes  WebGL2   the highlighted discs again, above the pills, as Sigma stacked them
 *   mouse       2D       nothing drawn; it is what the pointer events land on
 * getCanvases() hands them back by those names; edgeInk, checkFocusWeb and savePng read them.
 *
 * THE HOVER-LEAVE FIX IS NATIVE. Sigma's handleLeave emitted leaveNode and forgot to clear its
 * own hoveredNode, so coming back onto the same note emitted nothing (github#7, patched by
 * regex in src/vendor.mjs until now). onLeave below clears it. `hover re-arms after the pointer
 * leaves the stage` in the suite is the check.
 */

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

/** The events emitted; the page's nine plus the stage halves it never listened to. */
interface EventMap extends RendererEvents {
  rightClickStage: StageEvent;
  downStage: StageEvent;
  upNode: NodeEvent;
  upStage: StageEvent;
}

type WebGLLayer = "edges" | "nodes" | "hoverNodes";
type CanvasLayer = "labels" | "hovers" | "mouse";

const X_LABEL_MARGIN = 150;
const Y_LABEL_MARGIN = 50;
const ANTI_ALIASING_FEATHER = 1;
// Sigma's default stagePadding, which the page never overrode: the disc is framed inside the stage
// with this many px to spare on the smaller side, and every measured pixel constant assumes it.
const STAGE_PADDING = 30;
const DEFAULT_NODE_COLOR = "#999";
const DEFAULT_EDGE_COLOR = "#ccc";

/**
 * Sigma's applyNodeDefaults: the fields a style function may leave out, filled in -- on the
 * same object, so whatever else the page put on it (folder, tags, haloColor) rides along.
 */
function applyNodeDefaults(key: string, styled: Partial<NodeDisplayData> & Point): NodeDisplayData {
  if (typeof styled.x !== "number" || typeof styled.y !== "number") {
    throw new Error(`vault-graph: node "${key}" has no position; the style function must keep x and y`);
  }
  // Sigma's rule: a falsy label other than "" is no label; anything else is a string.
  const raw: unknown = styled.label;
  let label: string | null = null;
  if (typeof raw === "string") label = raw;
  else if (typeof raw === "number" || typeof raw === "boolean") label = raw ? String(raw) : null;
  return Object.assign(styled, {
    color: styled.color || DEFAULT_NODE_COLOR,
    label,
    size: styled.size || 2,
    hidden: styled.hidden ?? false,
    highlighted: styled.highlighted ?? false,
    forceLabel: styled.forceLabel ?? false,
    type: styled.type || "circle",
    zIndex: styled.zIndex || 0,
  });
}

function applyEdgeDefaults(styled: Partial<EdgeDisplayData> & { size: number }): EdgeDisplayData {
  return Object.assign(styled, {
    color: styled.color || DEFAULT_EDGE_COLOR,
    label: styled.label || "",
    size: styled.size || 0.5,
    hidden: styled.hidden ?? false,
    type: styled.type || "line",
    zIndex: styled.zIndex || 0,
  });
}

/** A stable sort by zIndex: equal z keeps the incoming (graph) order, as Sigma's did. */
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
  private readonly nodeStyle: RendererOptions["nodeStyle"];
  private readonly edgeStyle: RendererOptions["edgeStyle"];
  private readonly drawHover: RendererOptions["drawHover"];

  private readonly elements = new Map<string, HTMLCanvasElement>();
  private readonly gl: Record<WebGLLayer, WebGL2RenderingContext>;
  private readonly ctx: Record<CanvasLayer, CanvasRenderingContext2D>;
  private readonly nodePrograms: { circle: NodeProgram; halo: NodeProgram };
  private readonly hoverPrograms: { circle: NodeProgram; halo: NodeProgram };
  private readonly edgePrograms: { line: EdgeProgram; curve: EdgeProgram };

  private readonly camera: Camera;
  private readonly captor: MouseCaptor;

  private readonly nodeData = new Map<string, NodeDisplayData>();
  private readonly edgeData = new Map<string, EdgeDisplayData>();
  private readonly forcedLabels = new Set<string>();
  private readonly highlighted = new Set<string>();
  private hoveredNode: string | null = null;
  /** Node ids in draw order (z-sorted), for picking: the last hit is the one on top. */
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
  private renderFrame: number | null = null;
  private hoverFrame: number | null = null;
  private readonly onWindowResize = (): void => {
    this.scheduleRefresh();
  };

  constructor(
    private readonly graph: GraphStore,
    private readonly container: HTMLElement,
    options: RendererOptions,
  ) {
    super();
    const { win, nodeStyle, edgeStyle, drawHover, ...settings } = options;
    this.settings = { ...settings };
    this.win = win;
    this.doc = container.ownerDocument;
    this.nodeStyle = nodeStyle;
    this.edgeStyle = edgeStyle;
    this.drawHover = drawHover;

    // The layers, in stacking order.
    const edges = this.createWebGL("edges");
    const nodes = this.createWebGL("nodes");
    const labels = this.create2D("labels");
    const hovers = this.create2D("hovers");
    const hoverNodes = this.createWebGL("hoverNodes");
    const mouse = this.create2D("mouse");
    this.gl = { edges, nodes, hoverNodes };
    this.ctx = { labels, hovers, mouse };
    this.resize(true);

    this.nodePrograms = { circle: new NodeCircleProgram(this.gl.nodes, this.doc), halo: new NodeHaloProgram(this.gl.nodes, this.doc) };
    this.hoverPrograms = { circle: new NodeCircleProgram(this.gl.hoverNodes, this.doc), halo: new NodeHaloProgram(this.gl.hoverNodes, this.doc) };
    this.edgePrograms = { line: new EdgeLineProgram(this.gl.edges, this.doc), curve: new EdgeCurveProgram(this.gl.edges, this.doc) };

    this.camera = new Camera(win);
    this.applyCameraSettings();
    this.camera.on("updated", () => this.scheduleRender());

    // The settings object is mutated in place by setSetting, so these reads stay live.
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

    this.refresh();
  }

  /* ------------------------------------------------------------ public API */

  refresh(opts?: RefreshOptions): void {
    const partial = opts?.partialGraph;
    if (!partial) {
      this.clearIndices();
      this.graph.forEachNode((id) => this.addNode(id));
      this.graph.forEachEdge((e) => this.addEdge(e));
    } else {
      for (const id of partial.nodes ?? []) this.updateNode(id);
      for (const e of partial.edges ?? []) this.addEdge(e);
    }
    // Every refresh reprocesses. Sigma skipped the reprocess for a partial refresh that
    // claimed nothing moved, and wrote the item into its program slot instead; a full process
    // draws the identical frame and costs a few milliseconds on the 10k vault, so the two
    // paths are one here.
    this.needToProcess = true;
    if (opts?.schedule) this.scheduleRender();
    else this.render();
  }

  render(): void {
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
    // Program order is Sigma's: the default program first, then the registered one -- so
    // haloed notes draw above every plain disc, and curves above every straight line.
    this.nodePrograms.circle.render(params);
    this.nodePrograms.halo.render(params);
    this.edgePrograms.line.render(params);
    this.edgePrograms.curve.render(params);
    this.renderLabels();
    this.renderHighlightedNodes();
    this.emit("afterRender", undefined);
  }

  kill(): void {
    this.removeAllListeners();
    this.win.removeEventListener("resize", this.onWindowResize);
    this.captor.kill();
    if (this.renderFrame !== null) this.win.cancelAnimationFrame(this.renderFrame);
    if (this.hoverFrame !== null) this.win.cancelAnimationFrame(this.hoverFrame);
    this.renderFrame = null;
    this.hoverFrame = null;
    this.clearIndices();
    this.hoveredNode = null;
    for (const p of [this.nodePrograms.circle, this.nodePrograms.halo, this.hoverPrograms.circle,
                     this.hoverPrograms.halo, this.edgePrograms.line, this.edgePrograms.curve]) p.kill();
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

  /** A size attribute in drawn px: size / ratio. The identity size law the page was tuned to. */
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
    const canvas = this.doc.createElement("canvas");
    // Positioned by page.css (.vault-graph .vg-layer), which both hosts load; the mouse layer's
    // touch-action and user-select come from there too.
    canvas.className = "vg-layer vg-layer-" + id;
    this.container.appendChild(canvas);
    this.elements.set(id, canvas);
    return canvas;
  }

  private createWebGL(id: WebGLLayer): WebGL2RenderingContext {
    const canvas = this.createCanvas(id);
    const gl = canvas.getContext("webgl2", { preserveDrawingBuffer: false, antialias: false });
    if (!gl) throw new Error("vault-graph: WebGL2 is not available in this window");
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    return gl;
  }

  private create2D(id: CanvasLayer): CanvasRenderingContext2D {
    const canvas = this.createCanvas(id);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("vault-graph: could not create a 2D context");
    return ctx;
  }

  /** Reads the container's size; sizes every layer to it when it changed. */
  private resize(force = false): void {
    const prevW = this.width, prevH = this.height;
    this.width = this.container.offsetWidth || 1;
    this.height = this.container.offsetHeight || 1;
    this.pixelRatio = this.win.devicePixelRatio || 1;
    if (!force && prevW === this.width && prevH === this.height) return;
    const w = this.width * this.pixelRatio, h = this.height * this.pixelRatio;
    for (const el of this.elements.values()) {
      el.style.width = this.width + "px";
      el.style.height = this.height + "px";
      el.width = w;
      el.height = h;
    }
    // Setting a canvas's size resets its 2D transform, so the DPR scale goes back on.
    if (this.pixelRatio !== 1) for (const ctx of Object.values(this.ctx)) ctx.scale(this.pixelRatio, this.pixelRatio);
    for (const gl of Object.values(this.gl)) gl.viewport(0, 0, w, h);
  }

  private clear(): void {
    for (const gl of [this.gl.nodes, this.gl.edges, this.gl.hoverNodes]) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.clear(gl.COLOR_BUFFER_BIT);
    }
    this.ctx.labels.clearRect(0, 0, this.width, this.height);
    this.ctx.hovers.clearRect(0, 0, this.width, this.height);
  }

  /* ------------------------------------------------------------- indexing */

  private addNode(id: string): void {
    const styled = this.nodeStyle(id, { ...this.graph.getNodeAttributes(id) });
    const data = applyNodeDefaults(id, styled);
    this.nodeData.set(id, data);
    this.forcedLabels.delete(id);
    if (data.forceLabel && !data.hidden) this.forcedLabels.add(id);
    this.highlighted.delete(id);
    if (data.highlighted && !data.hidden) this.highlighted.add(id);
    const z = data.zIndex ?? 0;
    if (z < this.nodeZExtent[0]) this.nodeZExtent[0] = z;
    if (z > this.nodeZExtent[1]) this.nodeZExtent[1] = z;
  }

  private updateNode(id: string): void {
    this.addNode(id);
    const data = this.nodeData.get(id);
    if (data) this.normalization.applyTo(data);
  }

  private addEdge(edge: string): void {
    const styled = this.edgeStyle(edge, { ...this.graph.getEdgeAttributes(edge) });
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

  /** Normalises positions, orders by z, and fills the programs. Sigma's process(). */
  private process(): void {
    this.nodeExtent = graphExtent(this.graph);
    this.normalization = createNormalization(this.customBBox ?? this.nodeExtent);

    let nodes = this.graph.nodes();
    let circles = 0, halos = 0;
    for (const id of nodes) {
      const data = this.nodeData.get(id);
      if (!data) continue;
      const attrs = this.graph.getNodeAttributes(id);
      data.x = attrs.x;
      data.y = attrs.y;
      this.normalization.applyTo(data);
      if (data.type === "halo") halos++;
      else circles++;
    }
    this.nodePrograms.circle.reallocate(circles);
    this.nodePrograms.halo.reallocate(halos);
    if (this.nodeZExtent[0] !== this.nodeZExtent[1]) {
      nodes = byZIndex(nodes, (id) => this.nodeData.get(id)?.zIndex ?? 0);
    }
    circles = 0;
    halos = 0;
    for (const id of nodes) {
      const data = this.nodeData.get(id);
      if (!data) continue;
      if (data.type === "halo") this.nodePrograms.halo.process(halos++, data);
      else this.nodePrograms.circle.process(circles++, data);
    }
    this.nodeOrder = nodes;

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

  /** The forced labels: Sigma's geometry (x + size + 3, y + labelSize / 3), nothing else drawn. */
  private renderLabels(): void {
    const ctx = this.ctx.labels;
    const { labelSize, labelFont, labelWeight, labelColor } = this.settings;
    for (const id of this.forcedLabels) {
      const data = this.nodeData.get(id);
      if (!data || data.hidden || !data.label) continue;
      const { x, y } = this.framedGraphToViewport(data);
      const size = this.scaleSize(data.size);
      if (x < -X_LABEL_MARGIN || x > this.width + X_LABEL_MARGIN || y < -Y_LABEL_MARGIN || y > this.height + Y_LABEL_MARGIN) continue;
      ctx.fillStyle = labelColor;
      ctx.font = `${labelWeight} ${labelSize}px ${labelFont}`;
      ctx.fillText(data.label, x + size + 3, y + labelSize / 3);
    }
  }

  /** The hovered node, then the highlighted ones, through drawHover; then their discs on top. */
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
    if (this.renderFrame !== null) return;
    this.renderFrame = this.win.requestAnimationFrame(() => this.render());
  }

  private scheduleRefresh(): void {
    this.refresh({ schedule: true });
  }

  private scheduleHighlightedNodesRender(): void {
    if (this.hoverFrame !== null || this.renderFrame !== null) return;
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

  /** The camera state that zooms to `newRatio` while keeping the point under `target` still. */
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

  /**
   * The node under a viewport point: within its drawn radius (size / ratio px), the last one
   * drawn winning -- haloed notes over plain discs, higher z over lower, later over earlier.
   * That is the answer Sigma's colour-coded framebuffer gave, without the framebuffer.
   */
  private getNodeAtPosition(p: Point): string | null {
    let lastCircle: string | null = null;
    let lastHalo: string | null = null;
    const inv = 1 / this.camera.ratio;
    for (const id of this.nodeOrder) {
      const data = this.nodeData.get(id);
      if (!data || data.hidden) continue;
      const v = this.framedGraphToViewport(data);
      const r = data.size * inv;
      const dx = v.x - p.x, dy = v.y - p.y;
      if (dx * dx + dy * dy > r * r) continue;
      if (data.type === "halo") lastHalo = id;
      else lastCircle = id;
    }
    return lastHalo ?? lastCircle;
  }

  /* --------------------------------------------------------------- events */

  private bindCaptor(): void {
    const base = (event: Coords): StageEvent => ({ event, preventSigmaDefault: () => event.preventSigmaDefault() });

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
      // THE #7 FIX: the node left is forgotten, so coming back onto it is an enter again.
      if (this.hoveredNode !== null) {
        const node = this.hoveredNode;
        this.hoveredNode = null;
        this.emit("leaveNode", { ...base(e), node });
        this.scheduleHighlightedNodesRender();
      }
    });

    const interaction = (kind: "click" | "doubleClick" | "rightClick" | "down" | "up") => (e: Coords): void => {
      const ev = base(e);
      const at = this.getNodeAtPosition(e);
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
