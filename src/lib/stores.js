/* Trade stores that don't need a Google Sheet. Both have the same shape as
   the sheet client in sheets.js: ensureHeaders, loadTrades, append, update.
   Rows are kept exactly as the form saves them (strings, legs in notes). */
import { normalizeTrade, pickColumns } from "./rows.js";

function rowStore(read, write, kind) {
  return {
    kind,
    async ensureHeaders() {},
    async loadTrades() {
      return read().map(normalizeTrade);
    },
    async append(row) {
      write([...read(), pickColumns(row)]);
      return { status: "ok" };
    },
    async update(row) {
      const rows = read();
      const i = rows.findIndex(r => String(r.id) === String(row.id));
      if (i === -1) throw new Error("Trade not found");
      rows[i] = pickColumns(row);
      write(rows);
      return { status: "ok" };
    },
  };
}

/* Demo mode: rows live in this tab only and vanish on reload. */
export function createMemoryStore(rows = []) {
  let data = rows.map(pickColumns);
  return rowStore(() => data.map(r => ({ ...r })), next => { data = next; }, "memory");
}

/* "This device" mode: rows in the browser's localStorage, no account needed. */
export const LOCAL_TRADES_KEY = "tj_trades";

export function createLocalStore(storage = localStorage, key = LOCAL_TRADES_KEY) {
  const read = () => {
    try { return JSON.parse(storage.getItem(key)) || []; } catch { return []; }
  };
  return rowStore(read, rows => storage.setItem(key, JSON.stringify(rows)), "local");
}
