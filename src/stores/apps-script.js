// Storage backend: a Google Sheet through your own Apps Script web app (JSONP).
import { COLUMNS } from "../constants.js";
import { escapeFormula, rowsToTrades } from "../trade.js";

let callbackSeq = 0;

function jsonp(url, timeoutMs = 12000) {
  return new Promise((resolve, reject) => {
    const name = "tjcb_" + Date.now() + "_" + callbackSeq++,
      script = document.createElement("script"),
      cleanup = () => {
        clearTimeout(timer);
        delete window[name];
        script.remove();
      },
      timer = setTimeout(() => {
        cleanup();
        reject(new Error("Timeout"));
      }, timeoutMs);
    window[name] = (data) => {
      cleanup();
      resolve(data);
    };
    script.onerror = () => {
      cleanup();
      reject(new Error("Script error"));
    };
    script.src = url + (url.includes("?") ? "&" : "?") + "callback=" + name;
    document.body.appendChild(script);
  });
}

export function appsScriptStore(scriptUrl) {
  const read = () => jsonp(scriptUrl + "?v=" + Date.now()),
    send = (action, data) => {
      const payload = encodeURIComponent(
        JSON.stringify({
          action,
          ...(Array.isArray(data)
            ? {
                row: data,
              }
            : data),
        }),
      );
      return jsonp(scriptUrl + "?payload=" + payload + "&v=" + Date.now());
    };
  return {
    async ensureHeaders() {
      const rows = (await read()).values || [];
      if (!(rows.length > 0 && rows[0].length > 0 && rows[0][0] === "id")) {
        await send("setup", {
          headers: COLUMNS,
        });
      }
    },
    async loadTrades() {
      return rowsToTrades((await read()).values || []);
    },
    append(trade) {
      return send(
        "append",
        COLUMNS.map((key) => escapeFormula(trade[key] ?? "")),
      );
    },
    async update(trade) {
      const res = await send(
        "update",
        COLUMNS.map((key) => escapeFormula(trade[key] ?? "")),
      );
      if (res && res.status === "not_found") {
        throw new Error("Trade not found in the sheet");
      }
      return res;
    },
    async remove(id) {
      const res = await send("delete", {
        id,
      });
      if (res?.status === "not_found") {
        throw new Error("Trade not found in the sheet");
      }
      if (res?.status !== "ok") {
        throw new Error(
          "Your Apps Script is out of date. Paste the new script and make a New deployment, or move to Google sign-in in Settings.",
        );
      }
      return res;
    },
  };
}
