/* Shared app state. Config and copy traders live in localStorage
   (same keys as before, so existing devices keep their setup).

   Three ways to keep trades:
   - "sheet": the user's own Google Sheet through Apps Script (cfg.scriptUrl)
   - "local": this browser's localStorage, no account (cfg.mode === "local")
   - demo:    a built-in sample journal in memory (?demo). Nothing is read from
              or written to localStorage, and the sheet client is never made. */
import { createSheetClient } from "./lib/sheets.js";
import { createLocalStore, createMemoryStore } from "./lib/stores.js";
import { generateDemoRows, DEMO_CONFIG, DEMO_COPY_TRADERS, DEMO_YEAR } from "./lib/demo.js";

const CFG_KEY = "tj_config";
const CT_KEY = "tj_cts";

export const S = {
  demo: false,
  cfg: null,
  trades: [],
  loadedAt: 0,
  account: "all",
  editingId: null,
  reviewId: null,
  heatmapYear: new Date().getFullYear(),
};

/* Key-value storage: localStorage normally, a Map in demo mode. */
const memory = new Map();
const kv = {
  get(key, fallback) {
    if (S.demo) return memory.has(key) ? structuredClone(memory.get(key)) : fallback;
    try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
  },
  set(key, value) {
    if (S.demo) memory.set(key, structuredClone(value));
    else localStorage.setItem(key, JSON.stringify(value));
  },
  remove(key) {
    if (S.demo) memory.delete(key);
    else localStorage.removeItem(key);
  },
};

let client = null;

function makeStore(cfg) {
  if (cfg?.mode === "local") return createLocalStore();
  if (cfg?.scriptUrl) return createSheetClient(cfg.scriptUrl);
  return null;
}

/* Call once at boot, before anything reads S.cfg or the store. */
export function initState({ demo = false } = {}) {
  S.demo = demo;
  if (demo) {
    S.cfg = { ...DEMO_CONFIG };
    memory.set(CT_KEY, [...DEMO_COPY_TRADERS]);
    client = createMemoryStore(generateDemoRows());
    S.heatmapYear = DEMO_YEAR;
  } else {
    S.cfg = kv.get(CFG_KEY, null);
    client = null;
  }
}

/* The active trade store (sheet, device or demo). Made on first use. */
export const store = () => client || (client = makeStore(S.cfg));

export const storageMode = () => (S.demo ? "demo" : S.cfg?.mode === "local" ? "local" : S.cfg?.scriptUrl ? "sheet" : null);

export function saveConfig(cfg) {
  S.cfg = cfg;
  kv.set(CFG_KEY, cfg);
  if (!S.demo) client = makeStore(cfg);
}

export function clearConfig() {
  kv.remove(CFG_KEY);
}

export const getCopyTraders = () => kv.get(CT_KEY, []);
export const setCopyTraders = list => kv.set(CT_KEY, list);

/* Trades for the account picked in the sidebar. Trades with no account count as Live. */
export function activeTrades() {
  if (S.account === "all") return S.trades;
  if (S.account === "Live") return S.trades.filter(t => t.account === "Live" || !t.account);
  return S.trades.filter(t => t.account === S.account);
}

export const findTrade = id => S.trades.find(t => t.id === String(id));
