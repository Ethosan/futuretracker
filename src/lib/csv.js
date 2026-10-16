/* CSV export and import, in sheet column order. Used for backups and for
   moving trades between this device, a Google Sheet, or a new web address. */
import { COLS } from "../config.js";
import { encodeNotesWithLegs } from "./calc.js";
import { asPlainText, isFormulaLike } from "./rows.js";

/* Formula-looking text gets an apostrophe so Excel or Sheets won't run it. */
const cell = v => {
  const s = asPlainText(String(v ?? ""));
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
};

/* Trades back to stored rows: multi-leg detail goes back into notes. */
export function tradesToCsv(trades) {
  const row = t => COLS.map(c => (c === "notes" ? encodeNotesWithLegs(t.notes || "", t.legs?.entry || [], t.legs?.exit || []) : t[c]));
  return [COLS.join(","), ...trades.map(t => row(t).map(cell).join(","))].join("\n");
}

/* RFC 4180-ish: quoted fields, doubled quotes, newlines inside quotes. */
export function parseCsv(text) {
  const rows = [];
  let row = [], field = "", quoted = false;
  const s = text.replace(/^\uFEFF/, "");
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (quoted) {
      if (c === '"' && s[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && s[i + 1] === "\n") i++;
      row.push(field); rows.push(row); row = []; field = "";
    } else field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows;
}

/* CSV text to stored rows (objects keyed by column). Needs an "id" header. */
export function csvToRows(text) {
  const [head, ...body] = parseCsv(text);
  if (!head || !head.includes("id")) throw new Error("This CSV has no id column. Use a file exported from the journal.");
  return body
    .filter(r => r.some(v => v.trim() !== ""))
    .map(r => Object.fromEntries(COLS.map(c => [c, head.includes(c) ? unquote(r[head.indexOf(c)] ?? "") : ""])));
}

/* Undo the export's apostrophe. Anything else stays exactly as written; the
   stores keep it as text (RAW writes, or the apostrophe for Apps Script). */
function unquote(v) {
  return v.startsWith("'") && isFormulaLike(v.slice(1)) ? v.slice(1) : v;
}
