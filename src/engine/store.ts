// github#58

import type { EdgeAttrs, EdgeVisitor, GraphStore as GraphStoreApi, NodeAttrs } from "./types";

interface EdgeRecord {
  readonly key: string;
  readonly source: string;
  readonly target: string;
  readonly attrs: EdgeAttrs;
}

const KEY_SEP = "\u0001";

function isArrayIndex(key: string): boolean {
  const n = Number(key);
  return Number.isInteger(n) && n >= 0 && n < 4294967295 && String(n) === key;
}

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

  edges(): string[] {
    return Array.from(this.edgeRecords.keys());
  }

  getEdgeAttributes(edge: string): EdgeAttrs {
    const rec = this.edgeRecords.get(edge);
    if (!rec) throw new Error(`GraphStore: edge "${edge}" not found`);
    return rec.attrs;
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
