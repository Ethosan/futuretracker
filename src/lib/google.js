/* "Sign in with Google": the journal makes and uses a sheet in the user's own
   Drive through the Sheets API, so there's no Apps Script to set up.
   The token only has the drive.file scope: it can see files this app created
   and nothing else in the user's Drive. Same shape as the other stores. */
import { COLS } from "../config.js";
import { rowsToTrades } from "./rows.js";

const SHEETS = "https://sheets.googleapis.com/v4/spreadsheets";
const DRIVE = "https://www.googleapis.com/drive/v3/files";
const UPLOAD = "https://www.googleapis.com/upload/drive/v3/files";
const FOLDER = "Trade Journal screenshots";
const FOLDER_MIME = "application/vnd.google-apps.folder";
export const SHEET_TITLE = "Trade Journal";
const TAB = "Trades";

/* Thrown when the token is missing or expired and a sign-in tap is needed. */
export class NeedsSignIn extends Error {
  constructor(msg = "Sign in to Google again.") { super(msg); this.name = "NeedsSignIn"; }
}

export const sheetUrl = id => `https://docs.google.com/spreadsheets/d/${id}/edit`;

function api(getToken, f, onExpired = () => {}) {
  return async (url, { method = "GET", body, raw, type, as = "json" } = {}) => {
    const token = await getToken();
    const headers = { Authorization: "Bearer " + token };
    if (body) headers["Content-Type"] = "application/json";
    if (type) headers["Content-Type"] = type;
    const res = await f(url, { method, headers, body: raw ?? (body ? JSON.stringify(body) : undefined) });
    if (res.status === 401) { onExpired(); throw new NeedsSignIn(); }
    if (!res.ok) {
      let msg = "Google returned " + res.status;
      try { msg = (await res.json()).error?.message || msg; } catch { /* not JSON */ }
      throw new Error(msg);
    }
    return as === "blob" ? res.blob() : res.json();
  };
}

/* Drive query for one file or folder this app made, by name and type. */
const findQuery = (name, mime) => `${DRIVE}?q=${encodeURIComponent(`name = '${name}' and mimeType = '${mime}' and trashed = false`)}&orderBy=createdTime desc&pageSize=1&fields=files(id)`;

/* The newest journal sheet this app made in the user's Drive, or a new one.
   Signing in on a second device finds the same sheet. */
export async function findOrCreateSheet({ getToken, onExpired, fetch: f = fetch }) {
  const call = api(getToken, f, onExpired);
  const found = await call(findQuery(SHEET_TITLE, "application/vnd.google-apps.spreadsheet"));
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
      return this.appendMany([row]);
    },
    /* Many rows in one request (moving a whole journal in). */
    appendMany(rows) {
      return call(values(`${TAB}!A1`, ":append?valueInputOption=RAW&insertDataOption=INSERT_ROWS"), { method: "POST", body: { values: rows.map(toRow) } });
    },
    async remove(id) {
      const ids = (await call(values(`${TAB}!A:A`))).values || [];
      const i = ids.findIndex(r => String(r[0]) === String(id));
      if (i < 1) throw new Error("Trade not found in the sheet");
      const meta = await call(`${SHEETS}/${spreadsheetId}?fields=sheets.properties(sheetId,title)`);
      const sheetId = meta.sheets.find(s => s.properties.title === TAB)?.properties.sheetId ?? 0;
      return call(`${SHEETS}/${spreadsheetId}:batchUpdate`, {
        method: "POST",
        body: { requests: [{ deleteDimension: { range: { sheetId, dimension: "ROWS", startIndex: i, endIndex: i + 1 } } }] },
      });
    },
    async update(row) {
      const ids = (await call(values(`${TAB}!A:A`))).values || [];
      const i = ids.findIndex(r => String(r[0]) === String(row.id));
      if (i < 1) throw new Error("Trade not found in the sheet");
      return write(`${TAB}!A${i + 1}`, [toRow(row)]);
    },
  };
}

/* Screenshots: private files in a "Trade Journal screenshots" folder in the
   user's Drive (not a public image host). The trade stores "drive:<id>". */
export const DRIVE_REF = "drive:";
export const isDriveRef = v => typeof v === "string" && v.startsWith(DRIVE_REF);

export function createDriveImages({ getToken, onExpired, fetch: f = fetch }) {
  const call = api(getToken, f, onExpired);
  let folder = null;
  const cache = new Map();

  async function folderId() {
    if (folder) return folder;
    const found = await call(findQuery(FOLDER, FOLDER_MIME));
    folder = found.files?.[0]?.id || (await call(`${DRIVE}?fields=id`, { method: "POST", body: { name: FOLDER, mimeType: FOLDER_MIME } })).id;
    return folder;
  }

  return {
    async upload(file, name = "screenshot") {
      const meta = { name, parents: [await folderId()] };
      const b = "tj" + Math.random().toString(36).slice(2);
      const raw = new Blob([
        `--${b}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n--${b}\r\nContent-Type: ${file.type || "image/png"}\r\n\r\n`,
        file,
        `\r\n--${b}--`,
      ]);
      const res = await call(`${UPLOAD}?uploadType=multipart&fields=id`, { method: "POST", raw, type: `multipart/related; boundary=${b}` });
      return DRIVE_REF + res.id;
    },
    /* A blob: URL for an <img>, fetched with the token (Drive files aren't public). */
    async objectUrl(ref) {
      if (!cache.has(ref)) {
        const id = encodeURIComponent(ref.slice(DRIVE_REF.length));
        cache.set(ref, call(`${DRIVE}/${id}?alt=media`, { as: "blob" }).then(blob => URL.createObjectURL(blob)).catch(e => { cache.delete(ref); throw e; }));
      }
      return cache.get(ref);
    },
  };
}
