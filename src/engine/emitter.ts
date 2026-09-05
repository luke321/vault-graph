// github#58

export type Listener<T> = (payload: T) => void;

export class Emitter<Events extends object> {
  private readonly listeners = new Map<keyof Events, Set<Listener<unknown>>>();

  on<K extends keyof Events>(event: K, fn: Listener<Events[K]>): this {
    let set = this.listeners.get(event);
    if (!set) {
      set = new Set();
      this.listeners.set(event, set);
    }
    set.add(fn as Listener<unknown>);
    return this;
  }

  emit<K extends keyof Events>(event: K, payload: Events[K]): void {
    const set = this.listeners.get(event);
    if (!set) return;
    for (const fn of Array.from(set)) fn(payload);
  }

  removeAllListeners(): void {
    this.listeners.clear();
  }
}
