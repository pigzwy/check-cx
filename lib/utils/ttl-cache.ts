interface TtlCacheOptions {
  maxEntries?: number;
}

interface TtlCacheEntry<T> {
  value: T;
  expiresAt: number;
}

export interface TtlCacheState<T> {
  value?: T;
  expired: boolean;
}

export class TtlCache<K, T> {
  private readonly maxEntries: number;
  private readonly store = new Map<K, TtlCacheEntry<T>>();

  constructor(options?: TtlCacheOptions) {
    this.maxEntries = Math.max(1, options?.maxEntries ?? 100);
  }

  get(key: K, now: number = Date.now()): T | undefined {
    const state = this.getState(key, now);
    if (state.expired) {
      this.store.delete(key);
      return undefined;
    }
    return state.value;
  }

  getState(key: K, now: number = Date.now()): TtlCacheState<T> {
    const entry = this.store.get(key);
    if (!entry) {
      return { expired: false };
    }

    return {
      value: entry.value,
      expired: now >= entry.expiresAt,
    };
  }

  set(key: K, value: T, ttlMs: number, now: number = Date.now()): void {
    this.deleteExpired(now);
    if (!this.store.has(key) && this.store.size >= this.maxEntries) {
      const oldestKey = this.store.keys().next().value;
      if (oldestKey !== undefined) {
        this.store.delete(oldestKey);
      }
    }

    this.store.delete(key);
    this.store.set(key, {
      value,
      expiresAt: now + Math.max(1, ttlMs),
    });
  }

  delete(key: K): void {
    this.store.delete(key);
  }

  deleteExpired(now: number = Date.now()): number {
    let deletedCount = 0;
    for (const [key, entry] of this.store.entries()) {
      if (now >= entry.expiresAt) {
        this.store.delete(key);
        deletedCount += 1;
      }
    }
    return deletedCount;
  }

  clear(): void {
    this.store.clear();
  }
}
