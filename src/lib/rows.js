/* Stored rows (sheet, device or demo) to the in-memory trade shape. */
import { COLS } from "../config.js";
import { decodeNotesWithLegs } from "./calc.js";

const toNum = v => parseFloat(String(v ?? "").replace(/[$,]/g, "")) || 0;

/* Turn a stored row (as saved by the form) into the in-memory trade shape. */
export function normalizeTrade(obj) {
  const { notes, legs } = decodeNotesWithLegs(obj.notes || "");
  return {
    ...obj,
    id: String(obj.id),
    netPnl: toNum(obj.netPnl),
    grossPnl: toNum(obj.grossPnl),
    conf: parseInt(obj.conf, 10) || 0,
    notes,
    legs,
  };
}

/* Sheet values (header row first) to trade objects. */
export function rowsToTrades(rows) {
  if (rows.length <= 1) return [];
  const [head, ...body] = rows;
  return body
    .filter(row => row.some(v => v !== ""))
    .map(row => normalizeTrade(Object.fromEntries(head.map((h, i) => [h, row[i] ?? ""]))));
}

/* Keep only the sheet columns, in a fixed shape, for storing a row. */
export const pickColumns = row => Object.fromEntries(COLS.map(c => [c, row[c] ?? ""]));
