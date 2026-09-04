/**
 * A typed event emitter, small enough to own (github#58).
 *
 * The camera, the mouse captor and the renderer each emit a handful of events the page
 * listens to. Sigma used a typed EventEmitter from a dependency; this is the twenty lines of
 * it that were used. Listeners run in registration order, on the emitting call stack, and a
 * listener that throws stops the rest -- the same contract as before.
 */

export type Listener<T> = (payload: T) => void;

export class Emitter<Events extends object> {
  private readonly listeners = new Map<keyof Events, Set<Listener<unknown>>>();

  on<K extends keyof Events>(event: K, fn: Listener<Events[K]>): this {
    let set = this.listeners.get(event);
    if (!set) {
      set = new Set();
      this.listeners.set(event, set);
    }
    // Widened to the erased listener type the set holds; the payload is narrowed again by K.
    set.add(fn as Listener<unknown>);
    return this;
  }

  off<K extends keyof Events>(event: K, fn: Listener<Events[K]>): this {
    this.listeners.get(event)?.delete(fn as Listener<unknown>);
    return this;
  }

  emit<K extends keyof Events>(event: K, payload: Events[K]): void {
    const set = this.listeners.get(event);
    if (!set) return;
    // A copy, so a listener that unsubscribes (or subscribes) mid-emit cannot skew the walk.
    for (const fn of Array.from(set)) fn(payload);
  }

  removeAllListeners(): void {
    this.listeners.clear();
  }
}
