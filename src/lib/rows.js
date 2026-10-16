/* Stored rows (sheet, device or demo) to the in-memory trade shape. */
import { COLS } from "../config.js";
import { decodeNotesWithLegs, encodeNotesWithLegs } from "./calc.js";

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

/* Text that a spreadsheet would run as a formula (=, +, @, or - before
   something that isn't a number), e.g. =IMPORTXML(...) sending data away.
   A leading apostrophe makes Sheets and Excel keep it as plain text. */
const FORMULA = /^[=+@\t\r]|^-(?![\d.]+$)/;
export const isFormulaLike = v => typeof v === "string" && v !== "-" && FORMULA.test(v);
export const asPlainText = v => (isFormulaLike(v) ? "'" + v : v);

/* Keep only the sheet columns, in a fixed shape, for storing a row. */
export const pickColumns = row => Object.fromEntries(COLS.map(c => [c, row[c] ?? ""]));

/* A trade in memory back to the stored row shape (legs go back into notes). */
export function tradeToRow(t) {
  const row = pickColumns(t);
  row.notes = encodeNotesWithLegs(t.notes || "", t.legs?.entry || [], t.legs?.exit || []);
  for (const c of COLS) row[c] = String(row[c] ?? "");
  return row;
}
