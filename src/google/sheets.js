// Storage backend: the "Trade Journal" sheet in your Google Drive, through the Sheets API.
import { COLUMNS } from "../constants.js";
import { NetworkError } from "../stores/offline.js";
import { rowsToTrades } from "../trade.js";

const SHEETS_API = "https://sheets.googleapis.com/v4/spreadsheets";

export const DRIVE_FILES_API = "https://www.googleapis.com/drive/v3/files";

export const DRIVE_UPLOAD_API =
  "https://www.googleapis.com/upload/drive/v3/files";

export const SCREENSHOT_FOLDER = "Trade Journal screenshots";

export const FOLDER_MIME = "application/vnd.google-apps.folder";

const SPREADSHEET_TITLE = "Trade Journal";

const SHEET_TAB = "Trades";

export class NeedsSignIn extends Error {
  constructor(message = "Sign in to Google again.") {
    super(message);
    this.name = "NeedsSignIn";
  }
}

export const sheetUrl = (spreadsheetId) =>
  `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`;

export function googleFetcher(getToken, fetchFn, onExpired = () => {}) {
  return async (url, { method = "GET", body, raw, type, as = "json" } = {}) => {
    const headers = {
      Authorization: "Bearer " + (await getToken()),
    };
    if (body) {
      headers["Content-Type"] = "application/json";
    }
    if (type) {
      headers["Content-Type"] = type;
    }
    const res = await fetchFn(url, {
      method,
      headers,
      body: raw ?? (body ? JSON.stringify(body) : void 0),
    }).catch(() => {
      throw new NetworkError();
    });
    if (res.status === 401) {
      onExpired();
      throw new NeedsSignIn();
    }
    if (!res.ok) {
      let message = "Google returned " + res.status;
      try {
        message = (await res.json()).error?.message || message;
      } catch {}
      throw new Error(message);
    }
    return as === "blob" ? res.blob() : res.json();
  };
}

export const findFileQuery = (name, mimeType) =>
  `${DRIVE_FILES_API}?q=${encodeURIComponent(`name = '${name}' and mimeType = '${mimeType}' and trashed = false`)}&orderBy=createdTime desc&pageSize=1&fields=files(id)`;

export async function findOrCreateSpreadsheet({
  getToken,
  onExpired,
  fetch: fetchFn = fetch,
}) {
  const api = googleFetcher(getToken, fetchFn, onExpired),
    found = await api(
      findFileQuery(
        SPREADSHEET_TITLE,
        "application/vnd.google-apps.spreadsheet",
      ),
    );
  return found.files?.length
    ? {
        spreadsheetId: found.files[0].id,
        created: false,
      }
    : {
        spreadsheetId: (
          await api(SHEETS_API, {
            method: "POST",
            body: {
              properties: {
                title: SPREADSHEET_TITLE,
              },
              sheets: [
                {
                  properties: {
                    title: SHEET_TAB,
                    gridProperties: {
                      frozenRowCount: 1,
                    },
                  },
                },
              ],
            },
          })
        ).spreadsheetId,
        created: true,
      };
}

export function sheetsStore({
  spreadsheetId,
  getToken,
  onExpired,
  fetch: fetchFn = fetch,
}) {
  const api = googleFetcher(getToken, fetchFn, onExpired),
    valuesUrl = (range, suffix = "") =>
      `${SHEETS_API}/${spreadsheetId}/values/${encodeURIComponent(range)}${suffix}`,
    writeRange = (range, values) =>
      api(valuesUrl(range, "?valueInputOption=RAW"), {
        method: "PUT",
        body: {
          values,
        },
      }),
    toRow = (trade) => COLUMNS.map((key) => String(trade[key] ?? ""));
  return {
    kind: "google",
    async ensureHeaders() {
      if (
        ((await api(valuesUrl(`${SHEET_TAB}!1:1`))).values?.[0] || [])[0] !==
        "id"
      ) {
        await writeRange(`${SHEET_TAB}!A1`, [COLUMNS]);
      }
    },
    async loadTrades() {
      return rowsToTrades((await api(valuesUrl(SHEET_TAB))).values || []);
    },
    append(trade) {
      return this.appendMany([trade]);
    },
    appendMany(trades) {
      return api(
        valuesUrl(
          `${SHEET_TAB}!A1`,
          ":append?valueInputOption=RAW&insertDataOption=INSERT_ROWS",
        ),
        {
          method: "POST",
          body: {
            values: trades.map(toRow),
          },
        },
      );
    },
    async remove(id) {
      const rowIndex = (
        (await api(valuesUrl(`${SHEET_TAB}!A:A`))).values || []
      ).findIndex((row) => String(row[0]) === String(id));
      if (rowIndex < 1) {
        throw new Error("Trade not found in the sheet");
      }
      const sheetId =
        (
          await api(
            `${SHEETS_API}/${spreadsheetId}?fields=sheets.properties(sheetId,title)`,
          )
        ).sheets.find((sheet) => sheet.properties.title === SHEET_TAB)
          ?.properties.sheetId ?? 0;
      return api(`${SHEETS_API}/${spreadsheetId}:batchUpdate`, {
        method: "POST",
        body: {
          requests: [
            {
              deleteDimension: {
                range: {
                  sheetId,
                  dimension: "ROWS",
                  startIndex: rowIndex,
                  endIndex: rowIndex + 1,
                },
              },
            },
          ],
        },
      });
    },
    async update(trade) {
      const rowIndex = (
        (await api(valuesUrl(`${SHEET_TAB}!A:A`))).values || []
      ).findIndex((row) => String(row[0]) === String(trade.id));
      if (rowIndex < 1) {
        throw new Error("Trade not found in the sheet");
      }
      return writeRange(`${SHEET_TAB}!A${rowIndex + 1}`, [toRow(trade)]);
    },
  };
}
