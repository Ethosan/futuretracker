// App state, settings in localStorage (or memory in demo mode), and picking the storage backend.
import {
  DEMO_CONFIG,
  DEMO_COPY_TRADERS,
  DEMO_YEAR,
  generateDemoTrades,
} from "./demo.js";
import { getToken, tokenExpired } from "./google/auth.js";
import { sheetsStore } from "./google/sheets.js";
import { appsScriptStore } from "./stores/apps-script.js";
import { localStore, memoryStore } from "./stores/local.js";
import { offlineStore } from "./stores/offline.js";

const CONFIG_KEY = "tj_config";

const COPY_TRADERS_KEY = "tj_cts";

export const state = {
  demo: false,
  cfg: null,
  trades: [],
  loadedAt: 0,
  account: "all",
  editingId: null,
  reviewId: null,
  heatmapYear: new Date().getFullYear(),
};

const demoStorage = new Map();

const prefs = {
  get(key, fallback) {
    if (state.demo) {
      return demoStorage.has(key)
        ? structuredClone(demoStorage.get(key))
        : fallback;
    }
    try {
      return JSON.parse(localStorage.getItem(key)) ?? fallback;
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    if (state.demo) {
      demoStorage.set(key, structuredClone(value));
    } else {
      localStorage.setItem(key, JSON.stringify(value));
    }
  },
  remove(key) {
    if (state.demo) {
      demoStorage.delete(key);
    } else {
      localStorage.removeItem(key);
    }
  },
};

let store = null;

const SYNC_KEYS = ["tj_cache", "tj_outbox", "tj_moved"];

function createStore(cfg) {
  if (cfg?.mode === "local") {
    return localStore();
  }
  const opts = {
    storage: localStorage,
    onFlush: (result) =>
      dispatchEvent(
        new CustomEvent("tj:flushed", {
          detail: result,
        }),
      ),
  };
  return cfg?.mode === "google"
    ? offlineStore(
        sheetsStore({
          spreadsheetId: cfg.spreadsheetId,
          getToken,
          onExpired: tokenExpired,
        }),
        opts,
      )
    : cfg?.scriptUrl
      ? offlineStore(appsScriptStore(cfg.scriptUrl), opts)
      : null;
}

export const pendingCount = () => getStore()?.outbox?.size() || 0;

export function initMode({ demo = false } = {}) {
  state.demo = demo;
  if (demo) {
    state.cfg = {
      ...DEMO_CONFIG,
    };
    demoStorage.set(COPY_TRADERS_KEY, [...DEMO_COPY_TRADERS]);
    store = memoryStore(generateDemoTrades());
    state.heatmapYear = DEMO_YEAR;
  } else {
    state.cfg = prefs.get(CONFIG_KEY, null);
    store = null;
  }
}

export const getStore = () => store || (store = createStore(state.cfg));

export function storageMode() {
  return state.demo
    ? "demo"
    : state.cfg?.mode === "local" || state.cfg?.mode === "google"
      ? state.cfg.mode
      : state.cfg?.scriptUrl
        ? "sheet"
        : null;
}

export function saveConfig(cfg) {
  state.cfg = cfg;
  prefs.set(CONFIG_KEY, cfg);
  if (!state.demo) {
    store = createStore(cfg);
  }
}

export function clearSyncData() {
  if (!state.demo) {
    SYNC_KEYS.forEach((key) => localStorage.removeItem(key));
  }
}

export function forgetConfig() {
  prefs.remove(CONFIG_KEY);
  clearSyncData();
}

export const copyTraders = () => prefs.get(COPY_TRADERS_KEY, []);

export const saveCopyTraders = (list) => prefs.set(COPY_TRADERS_KEY, list);

export function forgetAll() {
  forgetConfig();
  prefs.remove(COPY_TRADERS_KEY);
}

export function visibleTrades() {
  return state.account === "all"
    ? state.trades
    : state.account === "Live"
      ? state.trades.filter(
          (trade) => trade.account === "Live" || !trade.account,
        )
      : state.trades.filter((trade) => trade.account === state.account);
}

export const tradeById = (id) =>
  state.trades.find((trade) => trade.id === String(id));
