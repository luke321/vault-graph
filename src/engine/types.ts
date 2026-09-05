/**
 * The engine's boundary: what the page needs from a graph store and a renderer, and nothing
 * more (github#58).
 *
 * These interfaces were measured, not designed. They are the members src/page.js actually
 * called on graphology and Sigma on develop@79d829a -- 16 of graphology's methods plus the two
 * Sigma itself read the edges through, 16 of Sigma's, one camera, one mouse captor, nine
 * events -- lifted out of the JSDoc typedefs that
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

export interface EdgeAttrs {
  weight: number;
  size: number;
}

export type EdgeVisitor = (edge: string, attrs: EdgeAttrs, source: string, target: string) => void;

export interface GraphStore {
  readonly order: number;
  readonly size: number;
  addNode(id: string, attrs: NodeAttrs): string;
  addUndirectedEdge(source: string, target: string, attrs: EdgeAttrs): string;
  hasNode(id: string): boolean;
  hasEdge(source: string, target: string): boolean;
  dropEdge(source: string, target: string): void;
  extremities(edge: string): [string, string];
  degree(id: string): number;
  neighbors(id: string): string[];
  nodes(): string[];
  forEachNode(fn: (id: string, attrs: NodeAttrs) => void): void;
  forEachEdge(fn: EdgeVisitor): void;
  forEachEdge(node: string, fn: EdgeVisitor): void;
  edges(): string[];
  getEdgeAttributes(edge: string): EdgeAttrs;
  getNodeAttribute<K extends keyof NodeAttrs>(id: string, name: K): NodeAttrs[K];
  getNodeAttributes(id: string): NodeAttrs;
  setNodeAttribute<K extends keyof NodeAttrs>(id: string, name: K, value: NodeAttrs[K]): void;
  mergeNodeAttributes(id: string, attrs: Partial<NodeAttrs>): void;
}

export type GraphStoreCtor = new () => GraphStore;

/* ----------------------------------------------------------------- camera */

export interface Point {
  x: number;
  y: number;
}

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
  setState(state: Partial<CameraState>): void;
  animate(to: Partial<CameraState>, opts?: { duration?: number }, done?: () => void): void;
  on(event: "updated", fn: (state: CameraState) => void): void;
}

/* --------------------------------------------------------------- display */

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
  type?: string;
  haloColor?: string;
}

export interface EdgeDisplayData {
  size: number;
  color: string;
  hidden: boolean;
  type?: string;
  curvature?: number;
  label?: string | null;
  zIndex?: number;
}

export type NodeReducer = (id: string, attrs: NodeAttrs) => NodeDisplayData;
export type EdgeReducer = (id: string, attrs: EdgeAttrs) => EdgeAttrs & Partial<EdgeDisplayData>;

/* ------------------------------------------------------------- settings */

export interface RendererSettings {
  minCameraRatio: number;
  maxCameraRatio: number;
  minEdgeThickness: number;
  zoomDuration: number;
  zoomingRatio: number;
  enableCameraPanning: boolean;
  labelSize: number;
  labelFont: string;
  labelWeight: string;
  labelColor: string;
}

export interface HoverData extends NodeDisplayData {
  key: string;
}

export type DrawHover = (
  ctx: CanvasRenderingContext2D,
  data: HoverData,
  settings: RendererSettings,
) => void;

export interface RendererOptions extends RendererSettings {
  win: Window;
  nodeReducer: NodeReducer;
  edgeReducer: EdgeReducer;
  drawHover: DrawHover;
}

/* --------------------------------------------------------------- events */

export interface MouseCoords {
  x: number;
  y: number;
  original: MouseEvent;
  preventDefault(): void;
}

export interface NodeEvent {
  node: string;
  event: MouseCoords;
  preventDefault(): void;
}

export interface StageEvent {
  event: MouseCoords;
  preventDefault(): void;
}

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

export interface MouseCaptor {
  on(event: "mousemovebody" | "mouseup" | "mouseleave", fn: (e: MouseCoords) => void): void;
}

/* ------------------------------------------------------------- renderer */

export interface RefreshOptions {
  skipIndexation?: boolean;
  partialGraph?: { nodes?: string[]; edges?: string[] };
  schedule?: boolean;
}

export interface Renderer {
  refresh(opts?: RefreshOptions): void;
  render(): void;
  kill(): void;
  graphToViewport(p: Point): Point;
  viewportToGraph(p: Point): Point;
  getCamera(): Camera;
  scaleSize(size: number): number;
  getNodeDisplayData(id: string): NodeDisplayData | undefined;
  getEdgeDisplayData(edge: string): EdgeDisplayData | undefined;
  getSetting<K extends keyof RendererSettings>(name: K): RendererSettings[K];
  setSetting<K extends keyof RendererSettings>(name: K, value: RendererSettings[K]): void;
  getCanvases(): Record<string, HTMLCanvasElement>;
  getDimensions(): { width: number; height: number };
  getMouseCaptor(): MouseCaptor;
  setCustomBBox(bbox: { x: [number, number]; y: [number, number] } | null): void;
  on<K extends keyof RendererEvents>(event: K, fn: (e: RendererEvents[K]) => void): void;
}

export type RendererCtor = new (
  graph: GraphStore,
  container: HTMLElement,
  options: RendererOptions,
) => Renderer;
