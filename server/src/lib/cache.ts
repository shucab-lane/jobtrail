type Entry<T> = { value: T; expiresAt: number };

// Small in-memory TTL cache. Fine for a single server process;
// would need to move to something like Redis if the API is scaled out.
export class TtlCache<T> {
  private store = new Map<string, Entry<T>>();
  private ttlMs: number;
  hits = 0;
  misses = 0;

  constructor(ttlMs: number) {
    this.ttlMs = ttlMs;
  }

  get(key: string) {
    const entry = this.store.get(key);
    if (!entry || entry.expiresAt < Date.now()) {
      this.store.delete(key);
      this.misses++;
      return undefined;
    }
    this.hits++;
    return entry.value;
  }

  set(key: string, value: T) {
    this.store.set(key, { value, expiresAt: Date.now() + this.ttlMs });
  }

  delete(key: string) {
    this.store.delete(key);
  }

  clear() {
    this.store.clear();
  }
}
