// Storage backends kept in this browser: memory (demo) and localStorage.
import { normalizeTrade, pickColumns } from "../trade.js";

function arrayStore(readAll, writeAll, kind) {
  return {
    kind,
    async ensureHeaders() {},
    async loadTrades() {
      return readAll().map(normalizeTrade);
    },
    async append(trade) {
      writeAll([...readAll(), pickColumns(trade)]);
      return {
        status: "ok",
      };
    },
    async appendMany(trades) {
      writeAll([...readAll(), ...trades.map(pickColumns)]);
      return {
        status: "ok",
      };
    },
    async update(trade) {
      const rows = readAll(),
        index = rows.findIndex((row) => String(row.id) === String(trade.id));
      if (index === -1) {
        throw new Error("Trade not found");
      }
      rows[index] = pickColumns(trade);
      writeAll(rows);
      return {
        status: "ok",
      };
    },
    async remove(id) {
      const rows = readAll(),
        kept = rows.filter((row) => String(row.id) !== String(id));
      if (kept.length === rows.length) {
        throw new Error("Trade not found");
      }
      writeAll(kept);
      return {
        status: "ok",
      };
    },
  };
}

export function memoryStore(trades = []) {
  let rows = trades.map(pickColumns);
  return arrayStore(
    () =>
      rows.map((row) => ({
        ...row,
      })),
    (next) => {
      rows = next;
    },
    "memory",
  );
}

export const LOCAL_TRADES_KEY = "tj_trades";

export function localStore(storage = localStorage, key = LOCAL_TRADES_KEY) {
  return arrayStore(
    () => {
      try {
        return JSON.parse(storage.getItem(key)) || [];
      } catch {
        return [];
      }
    },
    (rows) => storage.setItem(key, JSON.stringify(rows)),
    "local",
  );
}
