/* Screenshots kept on this device only (IndexedDB), for "This device" mode,
   the demo (in memory) and Apps Script without an imgbb key. Private: the
   image never leaves the browser. The trade stores "device:<id>". */
export const DEVICE_REF = "device:";
export const isDeviceRef = v => typeof v === "string" && v.startsWith(DEVICE_REF);

export function createDeviceImages(kv) {
  const urls = new Map();
  const id = ref => ref.slice(DEVICE_REF.length);
  return {
    async upload(file) {
      const key = crypto.randomUUID();
      await kv.set(key, file);
      return DEVICE_REF + key;
    },
    async blob(ref) {
      const b = await kv.get(id(ref));
      if (!b) throw new Error("Screenshot not on this device");
      return b;
    },
    async objectUrl(ref) {
      if (!urls.has(ref)) urls.set(ref, URL.createObjectURL(await this.blob(ref)));
      return urls.get(ref);
    },
    async remove(ref) {
      await kv.delete(id(ref));
      if (urls.has(ref)) { URL.revokeObjectURL(urls.get(ref)); urls.delete(ref); }
    },
  };
}

export function memoryKv() {
  const m = new Map();
  return { get: async k => m.get(k), set: async (k, v) => { m.set(k, v); }, delete: async k => { m.delete(k); } };
}

/* Tiny promise wrapper over one IndexedDB object store. */
export function idbKv(name = "tj-images", storeName = "images") {
  let db = null;
  const open = () => (db ||= new Promise((resolve, reject) => {
    const req = indexedDB.open(name, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(storeName);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  }));
  const run = async (mode, fn) => {
    const store = (await open()).transaction(storeName, mode).objectStore(storeName);
    return new Promise((resolve, reject) => {
      const req = fn(store);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  };
  return {
    get: k => run("readonly", s => s.get(k)),
    set: (k, v) => run("readwrite", s => s.put(v, k)),
    delete: k => run("readwrite", s => s.delete(k)),
    clear: () => run("readwrite", s => s.clear()),
  };
}
