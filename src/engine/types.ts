/**
 * The engine's boundary: what the page needs from a graph store and a renderer, and nothing
 * more (github#58).
 *
 * These interfaces were measured, not designed. They are the members src/page.js actually
 * called on graphology and Sigma on develop@79d829a -- 16 of graphology's methods, 16 of
 * Sigma's, one camera, one mouse captor, nine events -- lifted out of the JSDoc typedefs that
 * github#60 wrote for the two vendored bundles. page.js re-points its typedefs here
 * (`@typedef {import("./engine/types").Renderer} SigmaLike`), so the page and the engine are
 * checked against one declaration and a member that is not named here shows up on the lint
 * meter, which is the point.
 *
 * WHAT IS DELIBERATELY NOT HERE, because the page never used it: Sigma's label density grid
 * and its three settings (every label the page does not force is blanked in nodeStyle, so the
 * grid never drew one), camera rotation (off, angle 0 everywhere), node image programs, edge
 * events and labels, touch input, double-click zoom (always prevented), the graph subscription
 * (every bulk write is followed by an explicit refresh), and graphology's event emitter (used
 * only to silence that subscription -- see quietWrites in page.js, which goes with it).
 *
 * TYPES ONLY. Nothing here reaches a runtime: esbuild erases it from the plugin bundle and the
 * exporter's engine bundle alike, and tsc reads it under tsconfig.json's include.
 */

/* ------------------------------------------------------------------ graph */

/** The attributes the page puts on every node at addNode and reads back. */
export interface NodeAttrs {
  label: string;
  x: number;
  y: number;
  size: number;
  folder: string;
  sub: string;
  dirs: string[];
  ntype: string;
  tags: string[];
  path: string;
  deg: number;
  created: string;
  touched: string;
  words: number;
  ghost: boolean;
}

/** The attributes the page puts on every edge. `size` is what the renderer draws with. */
export interface EdgeAttrs {
  weight: number;
  size: number;
}

/** What forEachEdge hands its callback: the edge key, its attributes, and both ends. */
export type EdgeVisitor = (edge: string, attrs: EdgeAttrs, source: string, target: string) => void;

/**
 * An undirected graph keyed by node id: a keyed attribute bag with degree. Nodes and edges
 * iterate in insertion order; a node's own edges and neighbours iterate the way graphology's
 * did (integer-like ids ascending, then insertion order), so no consumer can tell the two
 * apart. Edge keys are the store's own and nothing outside it persists one.
 */
export interface GraphStore {
  /** Number of nodes. */
  readonly order: number;
  /** Number of edges. */
  readonly size: number;
  /** Adds a node; returns its id. Throws if the id exists. */
  addNode(id: string, attrs: NodeAttrs): string;
  /** Adds an undirected edge; returns its key. Throws if either end is missing. */
  addUndirectedEdge(source: string, target: string, attrs?: EdgeAttrs): string;
  hasNode(id: string): boolean;
  hasEdge(source: string, target: string): boolean;
  /** Removes the edge between two nodes, if any. */
  dropEdge(source: string, target: string): void;
  /** Both ends of an edge, in the order they were given to addUndirectedEdge. */
  extremities(edge: string): [string, string];
  degree(id: string): number;
  neighbors(id: string): string[];
  nodes(): string[];
  forEachNode(fn: (id: string, attrs: NodeAttrs) => void): void;
  /** Every edge, or every edge of one node. */
  forEachEdge(fn: EdgeVisitor): void;
  forEachEdge(node: string, fn: EdgeVisitor): void;
  getNodeAttribute<K extends keyof NodeAttrs>(id: string, name: K): NodeAttrs[K];
  getNodeAttributes(id: string): NodeAttrs;
  setNodeAttribute<K extends keyof NodeAttrs>(id: string, name: K, value: NodeAttrs[K]): void;
  mergeNodeAttributes(id: string, attrs: Partial<NodeAttrs>): void;
}

/** The store's constructor, as the hosts hand it into `deps.Graph`. */
export type GraphStoreCtor = new () => GraphStore;

/* ----------------------------------------------------------------- camera */

export interface Point {
  x: number;
  y: number;
}

/**
 * The camera, in Sigma's normalised space: (0.5, 0.5) is the centre of the custom bbox and
 * `ratio` is graph units per viewport unit -- smaller is closer. `angle` is always 0 here;
 * it stays in the record because every setState the suite issues carries it.
 */
export interface CameraState {
  x: number;
  y: number;
  ratio: number;
  angle: number;
}

export interface Camera {
  readonly x: number;
  readonly y: number;
  readonly ratio: number;
  readonly angle: number;
  getState(): CameraState;
  /** Sets the state at once, clamped and gated exactly as animate's landing would be. */
  setState(state: Partial<CameraState>): void;
  /**
   * Tweens to `to` over `duration` ms (quadraticInOut) and calls `done` on landing -- also
   * when the tween is cut short by another, which page.js's fit() relies on to re-lock panning.
   */
  animate(to: Partial<CameraState>, opts?: { duration?: number }, done?: () => void): void;
  /** Fires on every state change, including each frame of an animate. */
  on(event: "updated", fn: () => void): void;
}

/* --------------------------------------------------------------- display */

/**
 * What the page's node style function returns and getNodeDisplayData reads back: the node's
 * attributes plus the display fields the renderer consumes. Colours are CSS strings as the
 * page produces them (hex, or rgba() from withAlpha).
 */
export interface NodeDisplayData {
  x: number;
  y: number;
  size: number;
  color: string;
  label: string | null;
  hidden: boolean;
  highlighted?: boolean;
  forceLabel?: boolean;
  zIndex?: number;
  /** "halo" draws the border program (a ring in haloColor around the disc); anything else a disc. */
  type?: string;
  haloColor?: string;
}

export interface EdgeDisplayData {
  size: number;
  color: string;
  hidden: boolean;
  /** "curve" bows the edge by `curvature`; anything else is a straight line. */
  type?: string;
  curvature?: number;
  label?: string | null;
  zIndex?: number;
}

/** The node style function: today's `nodeReducer`. Called for every node on every refresh. */
export type NodeStyle = (id: string, attrs: NodeAttrs) => NodeDisplayData;
/** The edge style function: today's `edgeReducer`. */
export type EdgeStyle = (id: string, attrs: EdgeAttrs) => EdgeAttrs & Partial<EdgeDisplayData>;

/* ------------------------------------------------------------- settings */

/** The settings the page reads or writes after construction, and the ones drawHover reads. */
export interface RendererSettings {
  minCameraRatio: number;
  maxCameraRatio: number;
  /** Floor on a drawn edge, in px. */
  minEdgeThickness: number;
  /** Per wheel notch, ms. */
  zoomDuration: number;
  /** Per wheel notch, as a factor on the ratio. */
  zoomingRatio: number;
  enableCameraPanning: boolean;
  labelSize: number;
  labelFont: string;
  labelWeight: string;
  labelColor: string;
}

/** Draws the hovered (or highlighted) node's pill onto the hovers canvas: the page's drawHover. */
export type DrawHover = (
  ctx: CanvasRenderingContext2D,
  data: NodeDisplayData,
  settings: RendererSettings,
) => void;

/** Everything the renderer is constructed with. Typed, so the host and the engine agree. */
export interface RendererOptions extends RendererSettings {
  /** The window the view lives in -- a popout's, not the global one. Timers and rAF go through it. */
  win: Window;
  nodeStyle: NodeStyle;
  edgeStyle: EdgeStyle;
  drawHover: DrawHover;
}

/* --------------------------------------------------------------- events */

/**
 * The pointer payload every event carries. `x`/`y` are viewport px relative to the container;
 * `original` is the DOM event. `preventSigmaDefault` keeps Sigma's name until the vendor layer
 * goes (three call sites in page.js); it stops the renderer's own handling of the gesture --
 * a pan, or the wheel zoom -- for this event.
 */
export interface MouseCoords {
  x: number;
  y: number;
  original: MouseEvent;
  preventSigmaDefault(): void;
}

export interface NodeEvent {
  node: string;
  event: MouseCoords;
  preventSigmaDefault(): void;
}

export interface StageEvent {
  event: MouseCoords;
  preventSigmaDefault(): void;
}

/** The nine events the page listens to, with their payloads. */
export interface RendererEvents {
  clickNode: NodeEvent;
  doubleClickNode: NodeEvent;
  rightClickNode: NodeEvent;
  downNode: NodeEvent;
  enterNode: NodeEvent;
  leaveNode: NodeEvent;
  clickStage: StageEvent;
  doubleClickStage: StageEvent;
  afterRender: void;
}

/** The raw pointer stream, for the page's node drag: moves anywhere in the document, and releases. */
export interface MouseCaptor {
  on(event: "mousemovebody" | "mouseup" | "mouseleave", fn: (e: MouseCoords) => void): void;
}

/* ------------------------------------------------------------- renderer */

export interface RefreshOptions {
  /** Accepted for compatibility with the page's call sites; the engine keeps no spatial index. */
  skipIndexation?: boolean;
  partialGraph?: { nodes?: string[]; edges?: string[] };
  /** Coalesce into the next animation frame instead of rendering now. */
  schedule?: boolean;
}

export interface Renderer {
  /** Re-runs the style functions over the graph and renders (or schedules a render). */
  refresh(opts?: RefreshOptions): void;
  /** Draws every layer now, synchronously. */
  render(): void;
  /** Releases listeners, observers and GL contexts. The renderer is unusable afterwards. */
  kill(): void;
  graphToViewport(p: Point): Point;
  viewportToGraph(p: Point): Point;
  getCamera(): Camera;
  /** A size attribute in drawn px at the current camera: size / ratio (the identity size law). */
  scaleSize(size: number): number;
  getNodeDisplayData(id: string): NodeDisplayData | undefined;
  getEdgeDisplayData(edge: string): EdgeDisplayData | undefined;
  getSetting<K extends keyof RendererSettings>(name: K): RendererSettings[K];
  setSetting<K extends keyof RendererSettings>(name: K, value: RendererSettings[K]): void;
  /** The layer canvases by name: edges, nodes, labels, hovers, hoverNodes, mouse. */
  getCanvases(): Record<string, HTMLCanvasElement>;
  /** The container's size in CSS px. */
  getDimensions(): { width: number; height: number };
  getMouseCaptor(): MouseCaptor;
  /** Pins the normalisation box; null returns to the graph's own extent. */
  setCustomBBox(bbox: { x: [number, number]; y: [number, number] } | null): void;
  on<K extends keyof RendererEvents>(event: K, fn: (e: RendererEvents[K]) => void): void;
}

/** The renderer's constructor, as the hosts hand it into `deps.Sigma`. */
export type RendererCtor = new (
  graph: GraphStore,
  container: HTMLElement,
  options: RendererOptions,
) => Renderer;
