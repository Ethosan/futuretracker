// Trade screenshots: saved in Google Drive, on this device (IndexedDB) or by imgbb URL.
import { getToken, tokenExpired } from "./google/auth.js";
import { driveImages, isDriveRef } from "./google/drive.js";
import { state, storageMode } from "./state.js";

const DEVICE_PREFIX = "device:";

const isDeviceRef = (ref) =>
  typeof ref == "string" && ref.startsWith(DEVICE_PREFIX);

function deviceImages(db) {
  const urls = new Map(),
    keyOf = (ref) => ref.slice(DEVICE_PREFIX.length);
  return {
    async upload(blob) {
      const key = crypto.randomUUID();
      await db.set(key, blob);
      return DEVICE_PREFIX + key;
    },
    async blob(ref) {
      const blob = await db.get(keyOf(ref));
      if (!blob) {
        throw new Error("Screenshot not on this device");
      }
      return blob;
    },
    async objectUrl(ref) {
      if (!urls.has(ref)) {
        urls.set(ref, URL.createObjectURL(await this.blob(ref)));
      }
      return urls.get(ref);
    },
    async remove(ref) {
      await db.delete(keyOf(ref));
      if (urls.has(ref)) {
        URL.revokeObjectURL(urls.get(ref));
        urls.delete(ref);
      }
    },
  };
}

function memoryDb() {
  const map = new Map();
  return {
    get: async (key) => map.get(key),
    set: async (key, value) => {
      map.set(key, value);
    },
    delete: async (key) => {
      map.delete(key);
    },
  };
}

function indexedDb(dbName = "tj-images", storeName = "images") {
  let opening = null;
  const open = () =>
      (opening ||= new Promise((resolve, reject) => {
        const req = indexedDB.open(dbName, 1);
        req.onupgradeneeded = () => req.result.createObjectStore(storeName);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      })),
    run = async (mode, action) => {
      const objectStore = (await open())
        .transaction(storeName, mode)
        .objectStore(storeName);
      return new Promise((resolve, reject) => {
        const req = action(objectStore);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    };
  return {
    get: (key) => run("readonly", (s) => s.get(key)),
    set: (key, value) => run("readwrite", (s) => s.put(value, key)),
    delete: (key) => run("readwrite", (s) => s.delete(key)),
    clear: () => run("readwrite", (s) => s.clear()),
  };
}

let driveImagesInstance = null;

let deviceImagesInstance = null;

let indexedDbInstance = null;

const drive = () =>
  (driveImagesInstance ||= driveImages({
    getToken,
    onExpired: tokenExpired,
  }));

export const imageDb = () => (indexedDbInstance ||= indexedDb());

const device = () =>
  (deviceImagesInstance ||= deviceImages(state.demo ? memoryDb() : imageDb()));

export function imageHost() {
  const mode = storageMode();
  return mode === "google"
    ? "drive"
    : mode === "sheet" && state.cfg?.imgbbKey
      ? "imgbb"
      : "device";
}

export const uploadImage = (blob) =>
  imageHost() === "drive"
    ? drive().upload(
        blob,
        `Trade screenshot ${new Date().toISOString().slice(0, 16).replace("T", " ")}`,
      )
    : device().upload(blob);

export async function showImage(
  img,
  ref,
  onFail = () => {
    img.hidden = true;
  },
) {
  img.addEventListener("error", onFail, {
    once: true,
  });
  try {
    if (isDriveRef(ref)) {
      img.src = await drive().objectUrl(ref);
    } else {
      if (isDeviceRef(ref)) {
        img.src = await device().objectUrl(ref);
      } else {
        img.src = ref;
      }
    }
  } catch {
    onFail();
  }
}

export function imageLabel(ref) {
  return isDriveRef(ref)
    ? "Saved privately in your Google Drive"
    : isDeviceRef(ref)
      ? "Saved privately on this device"
      : ref;
}

export function removeDeviceImage(ref) {
  if (isDeviceRef(ref)) {
    return device()
      .remove(ref)
      .catch(() => {});
  }
}

export async function moveImageToDrive(ref) {
  if (!isDeviceRef(ref)) {
    return ref;
  }
  const blob = await device()
    .blob(ref)
    .catch(() => null);
  return blob ? drive().upload(blob, "Trade screenshot (moved)") : "";
}
