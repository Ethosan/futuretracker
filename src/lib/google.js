/* "Sign in with Google": the journal makes and uses a sheet in the user's own
   Drive through the Sheets API, so there's no Apps Script to set up.
   The token only has the drive.file scope: it can see files this app created
   and nothing else in the user's Drive. Same shape as the other stores. */
import { COLS } from "../config.js";
import { rowsToTrades } from "./rows.js";

const SHEETS = "https://sheets.googleapis.com/v4/spreadsheets";
const DRIVE = "https://www.googleapis.com/drive/v3/files";
export const SHEET_TITLE = "Trade Journal";
const TAB = "Trades";

/* Thrown when the token is missing or expired and a sign-in tap is needed. */
export class NeedsSignIn extends Error {
  constructor(msg = "Sign in to Google again.") { super(msg); this.name = "NeedsSignIn"; }
}

export const sheetUrl = id => `https://docs.google.com/spreadsheets/d/${id}/edit`;

function api(getToken, f, onExpired = () => {}) {
  return async (url, { method = "GET", body } = {}) => {
    const token = await getToken();
    const res = await f(url, {
      method,
      headers: { Authorization: "Bearer " + token, ...(body ? { "Content-Type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (res.status === 401) { onExpired(); throw new NeedsSignIn(); }
    if (!res.ok) {
      let msg = "Google returned " + res.status;
      try { msg = (await res.json()).error?.message || msg; } catch { /* not JSON */ }
      throw new Error(msg);
    }
    return res.json();
  };
}

/* The newest journal sheet this app made in the user's Drive, or a new one.
   Signing in on a second device finds the same sheet. */
export async function findOrCreateSheet({ getToken, onExpired, fetch: f = fetch }) {
  const call = api(getToken, f, onExpired);
  const q = `name = '${SHEET_TITLE}' and mimeType = 'application/vnd.google-apps.spreadsheet' and trashed = false`;
  const found = await call(`${DRIVE}?q=${encodeURIComponent(q)}&orderBy=createdTime desc&pageSize=1&fields=files(id)`);
  if (found.files?.length) return { spreadsheetId: found.files[0].id, created: false };
  const made = await call(SHEETS, {
    method: "POST",
    body: { properties: { title: SHEET_TITLE }, sheets: [{ properties: { title: TAB, gridProperties: { frozenRowCount: 1 } } }] },
  });
  return { spreadsheetId: made.spreadsheetId, created: true };
}

export function createGoogleStore({ spreadsheetId, getToken, onExpired, fetch: f = fetch }) {
  const call = api(getToken, f, onExpired);
  const values = (range, rest = "") => `${SHEETS}/${spreadsheetId}/values/${encodeURIComponent(range)}${rest}`;
  /* RAW keeps what the form typed: "09:30" stays text, not a time Sheets reformats. */
  const write = (range, rows) => call(values(range, "?valueInputOption=RAW"), { method: "PUT", body: { values: rows } });
  const toRow = row => COLS.map(c => String(row[c] ?? ""));

  return {
    kind: "google",
    async ensureHeaders() {
      const head = (await call(values(`${TAB}!1:1`))).values?.[0] || [];
      if (head[0] !== "id") await write(`${TAB}!A1`, [COLS]);
    },
    async loadTrades() {
      return rowsToTrades((await call(values(TAB))).values || []);
    },
    append(row) {
      return call(values(`${TAB}!A1`, ":append?valueInputOption=RAW&insertDataOption=INSERT_ROWS"), { method: "POST", body: { values: [toRow(row)] } });
    },
    async update(row) {
      const ids = (await call(values(`${TAB}!A:A`))).values || [];
      const i = ids.findIndex(r => String(r[0]) === String(row.id));
      if (i < 1) throw new Error("Trade not found in the sheet");
      return write(`${TAB}!A${i + 1}`, [toRow(row)]);
    },
  };
}
