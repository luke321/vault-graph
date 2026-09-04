/**
 * The graph store: a keyed attribute bag with degree, which is all the page ever asked of
 * graphology (github#58, step 2).
 *
 * Three maps. `nodes` holds each node's attribute object BY REFERENCE, exactly as graphology
 * did -- getNodeAttributes hands back the object addNode was given, and mergeNodeAttributes
 * writes into it -- so nothing that held one of those objects can tell the difference.
 * `edgeRecords` holds every edge in insertion order, keyed by a string of our own. `adjacency` maps
 * a node to its neighbours, each to the edge between them, and is what degree, neighbors,
 * hasEdge and the per-node forEachEdge read.
 *
 * ITERATION ORDER IS GRAPHOLOGY'S, and that is the one place a store could silently change
 * the picture. graphology kept a node's undirected edges in a plain object keyed by neighbour
 * id, so `neighbors()` and `forEachEdge(node, fn)` came back in JavaScript property order:
 * array-index keys ascending, then the rest in insertion order. The page's node ids are
 * indexes into the vault's node list, so in practice that is numeric order. The graph-wide
 * walks (nodes, forEachNode, forEachEdge) were Map-backed and came back in insertion order,
 * which a Map still gives. `inPropertyOrder` below reproduces the object case; the golden
 * layout snapshots and the focus-web check are the proof that nothing reads any other order.
 *
 * NO EVENT EMITTER. graphology's `on`/`removeListener`/`rawListeners` were used for one thing:
 * `quietWrites` in page.js detached Sigma's subscription during the bulk position loops so
 * that 10,000 mergeNodeAttributes calls did not each schedule a render nothing would see. Every
 * one of those loops, and every other write in the page, is followed by an explicit refresh,
 * so the renderer has nothing to subscribe to and the store has nothing to emit.
 *
 * NO PARALLEL EDGES; SELF-LOOPS AS GRAPHOLOGY HAD THEM. page.js guards every addUndirectedEdge
 * with hasEdge, and graphology threw on a duplicate, so a duplicate is an error here too. A
 * note linking to itself is a different matter: nothing in either producer promises to drop
 * one, and graphology accepted it -- a self-loop counted two toward the node's degree and the
 * node appeared once among its own neighbours -- so the store does the same rather than turn
 * an odd vault into a page that does not boot. Edge keys are source + U+0001 + target in the
 * order the edge was added -- unique for a simple graph, and nothing outside the store
 * persists one.
 */

import type { EdgeAttrs, EdgeVisitor, GraphStore as GraphStoreApi, NodeAttrs } from "./types";

/** Source and target as they were given to addUndirectedEdge, plus the attribute object. */
interface EdgeRecord {
  readonly key: string;
  readonly source: string;
  readonly target: string;
  readonly attrs: EdgeAttrs;
}

const KEY_SEP = "\u0001";

/** A canonical array index: what JavaScript orders numerically when enumerating an object. */
function isArrayIndex(key: string): boolean {
  const n = Number(key);
  return Number.isInteger(n) && n >= 0 && n < 4294967295 && String(n) === key;
}

/**
 * The order a plain object would enumerate these keys in: array indexes ascending, then the
 * rest as they were inserted.
 */
function inPropertyOrder(keys: Iterable<string>): string[] {
  const indexes: number[] = [];
  const rest: string[] = [];
  for (const k of keys) {
    if (isArrayIndex(k)) indexes.push(Number(k));
    else rest.push(k);
  }
  indexes.sort((a, b) => a - b);
  const out: string[] = indexes.map(String);
  for (const k of rest) out.push(k);
  return out;
}

export class GraphStore implements GraphStoreApi {
  private readonly nodeAttrs = new Map<string, NodeAttrs>();
  private readonly edgeRecords = new Map<string, EdgeRecord>();
  private readonly adjacency = new Map<string, Map<string, EdgeRecord>>();

  get order(): number {
    return this.nodeAttrs.size;
  }

  get size(): number {
    return this.edgeRecords.size;
  }

  addNode(id: string, attrs: NodeAttrs): string {
    if (this.nodeAttrs.has(id)) throw new Error(`GraphStore: node "${id}" already exists`);
    this.nodeAttrs.set(id, attrs);
    this.adjacency.set(id, new Map());
    return id;
  }

  addUndirectedEdge(source: string, target: string, attrs: EdgeAttrs): string {
    const a = this.adjacency.get(source);
    const b = this.adjacency.get(target);
    if (!a) throw new Error(`GraphStore: node "${source}" not found`);
    if (!b) throw new Error(`GraphStore: node "${target}" not found`);
    if (a.has(target)) throw new Error(`GraphStore: edge ${source} -- ${target} already exists`);
    const key = source + KEY_SEP + target;
    const rec: EdgeRecord = { key, source, target, attrs };
    this.edgeRecords.set(key, rec);
    a.set(target, rec);
    b.set(source, rec);
    return key;
  }

  hasNode(id: string): boolean {
    return this.nodeAttrs.has(id);
  }

  hasEdge(source: string, target: string): boolean {
    const a = this.adjacency.get(source);
    return a !== undefined && a.has(target);
  }

  dropEdge(source: string, target: string): void {
    const a = this.adjacency.get(source);
    const rec = a?.get(target);
    if (!a || !rec) throw new Error(`GraphStore: no edge ${source} -- ${target}`);
    a.delete(target);
    this.neighboursOf(target).delete(source);
    this.edgeRecords.delete(rec.key);
  }

  extremities(edge: string): [string, string] {
    const rec = this.edgeRecords.get(edge);
    if (!rec) throw new Error(`GraphStore: edge "${edge}" not found`);
    return [rec.source, rec.target];
  }

  degree(id: string): number {
    const around = this.neighboursOf(id);
    // A self-loop is one neighbour entry and two ends, and graphology counted the ends.
    return around.size + (around.has(id) ? 1 : 0);
  }

  neighbors(id: string): string[] {
    return inPropertyOrder(this.neighboursOf(id).keys());
  }

  nodes(): string[] {
    return Array.from(this.nodeAttrs.keys());
  }

  forEachNode(fn: (id: string, attrs: NodeAttrs) => void): void {
    for (const [id, attrs] of this.nodeAttrs) fn(id, attrs);
  }

  forEachEdge(fn: EdgeVisitor): void;
  forEachEdge(node: string, fn: EdgeVisitor): void;
  forEachEdge(nodeOrFn: string | EdgeVisitor, maybeFn?: EdgeVisitor): void {
    if (typeof nodeOrFn === "function") {
      for (const rec of this.edgeRecords.values()) nodeOrFn(rec.key, rec.attrs, rec.source, rec.target);
      return;
    }
    if (!maybeFn) throw new Error("GraphStore: forEachEdge(node) needs a callback");
    const around = this.neighboursOf(nodeOrFn);
    for (const neighbour of inPropertyOrder(around.keys())) {
      const rec = around.get(neighbour);
      if (rec) maybeFn(rec.key, rec.attrs, rec.source, rec.target);
    }
  }

  getNodeAttribute<K extends keyof NodeAttrs>(id: string, name: K): NodeAttrs[K] {
    return this.attrsOf(id)[name];
  }

  getNodeAttributes(id: string): NodeAttrs {
    return this.attrsOf(id);
  }

  setNodeAttribute<K extends keyof NodeAttrs>(id: string, name: K, value: NodeAttrs[K]): void {
    this.attrsOf(id)[name] = value;
  }

  mergeNodeAttributes(id: string, attrs: Partial<NodeAttrs>): void {
    Object.assign(this.attrsOf(id), attrs);
  }

  /* ------------------------------------------------ sigma 3.0.2 compatibility, transitional --
   * Until github#58 step 3.6 replaces it, the renderer is still Sigma's bundle, and Sigma
   * holds the graph itself: its constructor validates the object with graphology-utils'
   * isGraph (which asks for addUndirectedEdgeWithKey and dropNode as functions and throws
   * "Sigma: invalid graph instance." otherwise), subscribes to graph events, and its
   * indexation reads getEdgeAttributes and edges(). None of this is in the GraphStore
   * interface and none of it is called by page.js; every member below goes when Sigma does.
   *
   * on/removeListener are no-ops. The store emits nothing, so Sigma never reacts to a
   * write -- which is what quietWrites used to arrange around every bulk loop (github#19)
   * and is safe for the same reason it was: every write in page.js is followed by an
   * explicit refresh, and Sigma's refresh rebuilds every index from the graph.
   */

  /** isGraph asks for this too: a simple graph, one edge per pair. */
  readonly multi = false;

  /** Sigma subscribes to graph events here; nothing is ever emitted. */
  on(_event: string, _fn: (...args: unknown[]) => void): this {
    return this;
  }

  /** The other half of Sigma's subscription, called from its kill(). */
  removeListener(_event: string, _fn: (...args: unknown[]) => void): this {
    return this;
  }

  /** Read by Sigma's edge indexation; the same object addUndirectedEdge was given. */
  getEdgeAttributes(edge: string): EdgeAttrs {
    const rec = this.edgeRecords.get(edge);
    if (!rec) throw new Error(`GraphStore: edge "${edge}" not found`);
    return rec.attrs;
  }

  /** Every edge key, in insertion order. */
  edges(): string[] {
    return Array.from(this.edgeRecords.keys());
  }

  /** Probed by isGraph, never called: page.js keys nothing itself. */
  addUndirectedEdgeWithKey(): never {
    throw new Error("GraphStore: keyed edges are not supported");
  }

  /** Probed by isGraph, never called: nodes are never removed from the store. */
  dropNode(): never {
    throw new Error("GraphStore: nodes are never dropped");
  }

  private attrsOf(id: string): NodeAttrs {
    const attrs = this.nodeAttrs.get(id);
    if (!attrs) throw new Error(`GraphStore: node "${id}" not found`);
    return attrs;
  }

  private neighboursOf(id: string): Map<string, EdgeRecord> {
    const around = this.adjacency.get(id);
    if (!around) throw new Error(`GraphStore: node "${id}" not found`);
    return around;
  }
}
