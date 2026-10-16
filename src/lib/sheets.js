/* Google Sheets sync through the user's own Apps Script web app.
   Apps Script web apps don't send CORS headers, so every call is JSONP
   (a <script> tag with a callback). Writes go in the query string. */
import { COLS } from "../config.js";
import { rowsToTrades, asPlainText } from "./rows.js";

let seq = 0;

function jsonp(url, timeoutMs = 12_000) {
  return new Promise((resolve, reject) => {
    const cb = "tjcb_" + Date.now() + "_" + seq++;
    const script = document.createElement("script");
    const cleanup = () => {
      clearTimeout(timer);
      delete window[cb];
      script.remove();
    };
    const timer = setTimeout(() => { cleanup(); reject(new Error("Timeout")); }, timeoutMs);
    window[cb] = data => { cleanup(); resolve(data); };
    script.onerror = () => { cleanup(); reject(new Error("Script error")); };
    script.src = url + (url.includes("?") ? "&" : "?") + "callback=" + cb;
    document.body.appendChild(script);
  });
}

export function createSheetClient(scriptUrl) {
  const get = () => jsonp(scriptUrl + "?v=" + Date.now());
  const post = (action, payload) => {
    const body = encodeURIComponent(JSON.stringify({ action, ...(Array.isArray(payload) ? { row: payload } : payload) }));
    return jsonp(scriptUrl + "?payload=" + body + "&v=" + Date.now());
  };

  return {
    async ensureHeaders() {
      const rows = (await get()).values || [];
      const ok = rows.length > 0 && rows[0].length > 0 && rows[0][0] === "id";
      if (!ok) await post("setup", { headers: COLS });
    },
    async loadTrades() {
      return rowsToTrades((await get()).values || []);
    },
    append(row) {
      return post("append", COLS.map(c => asPlainText(row[c] ?? "")));
    },
    async update(row) {
      const res = await post("update", COLS.map(c => asPlainText(row[c] ?? "")));
      if (res && res.status === "not_found") throw new Error("Trade not found in the sheet");
      return res;
    },
  };
}
