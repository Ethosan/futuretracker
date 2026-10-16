/* Shared app state. Config and copy traders live in localStorage
   (same keys as before, so existing devices keep their setup). */
import { createSheetClient } from "./lib/sheets.js";

const CFG_KEY = "tj_config";
const CT_KEY = "tj_cts";

function readJSON(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
}

export const S = {
  cfg: readJSON(CFG_KEY, null),
  trades: [],
  loadedAt: 0,
  account: "all",
  editingId: null,
  reviewId: null,
  heatmapYear: new Date().getFullYear(),
};

let client = S.cfg?.scriptUrl ? createSheetClient(S.cfg.scriptUrl) : null;
export const sheet = () => client;

export function saveConfig(cfg) {
  S.cfg = cfg;
  localStorage.setItem(CFG_KEY, JSON.stringify(cfg));
  client = createSheetClient(cfg.scriptUrl);
}

export function clearConfig() {
  localStorage.removeItem(CFG_KEY);
}

export const getCopyTraders = () => readJSON(CT_KEY, []);
export const setCopyTraders = list => localStorage.setItem(CT_KEY, JSON.stringify(list));

/* Trades for the account picked in the sidebar. Trades with no account count as Live. */
export function activeTrades() {
  if (S.account === "all") return S.trades;
  if (S.account === "Live") return S.trades.filter(t => t.account === "Live" || !t.account);
  return S.trades.filter(t => t.account === S.account);
}

export const findTrade = id => S.trades.find(t => t.id === String(id));
