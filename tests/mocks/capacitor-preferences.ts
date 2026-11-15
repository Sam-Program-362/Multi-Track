/** In-memory stand-in for Capacitor Preferences, for Node tests. */
const store = new Map<string, string>();

export const Preferences = {
  async get({ key }: { key: string }) {
    return { value: store.get(key) ?? null };
  },
  async set({ key, value }: { key: string; value: string }) {
    store.set(key, value);
  },
  async remove({ key }: { key: string }) {
    store.delete(key);
  },
  async clear() {
    store.clear();
  },
  async keys() {
    return { keys: [...store.keys()] };
  },
};

export function __resetStore() {
  store.clear();
}

export function __setRaw(key: string, value: string) {
  store.set(key, value);
}

export function __getRaw(key: string): string | null {
  return store.get(key) ?? null;
}
