import { describe, expect, it, vi } from "vitest";
import { COLS } from "../src/config.js";
import { createGoogleStore, findOrCreateSheet, NeedsSignIn } from "../src/lib/google.js";
import { generateDemoRows } from "../src/lib/demo.js";
import { normalizeTrade } from "../src/lib/rows.js";

/* A tiny fake of the Sheets and Drive APIs: one tab, rows of strings. */
function fakeGoogle({ files = [], status = 200 } = {}) {
  const sheet = [];
  const calls = [];
  const json = (body, s = 200) => ({ ok: s < 300, status: s, json: async () => body });
  const fetch = vi.fn(async (url, opts = {}) => {
    const u = new URL(url);
    const method = opts.method || "GET";
    const range = decodeURIComponent(u.pathname.split("/values/")[1] || "");
    calls.push(method + " " + u.host + (range ? " " + range : ""));
    expect(opts.headers.Authorization).toBe("Bearer tok");
    if (status !== 200) return json({ error: { message: "nope" } }, status);
    if (u.host === "www.googleapis.com") return json({ files });
    if (method === "POST" && !range) return json({ spreadsheetId: "new-id" });
    const body = opts.body ? JSON.parse(opts.body) : null;
    if (range.endsWith(":append")) { sheet.push(...body.values); return json({}); }
    if (method === "PUT") {
      const row = +(range.match(/A(\d+)$/)?.[1] || 1) - 1;
      body.values.forEach((v, i) => { sheet[row + i] = v; });
      return json({});
    }
    if (range === "Trades!1:1") return json({ values: sheet.slice(0, 1) });
    if (range === "Trades!A:A") return json({ values: sheet.map(r => [r[0]]) });
    return json({ values: sheet });
  });
  return { fetch, sheet, calls };
}
const getToken = async () => "tok";

describe("Sign in with Google", () => {
  it("reuses the journal sheet it already made in Drive", async () => {
    const g = fakeGoogle({ files: [{ id: "old-id" }] });
    expect(await findOrCreateSheet({ getToken, fetch: g.fetch })).toEqual({ spreadsheetId: "old-id", created: false });
    expect(g.calls).toEqual(["GET www.googleapis.com"]);
  });

  it("makes a new sheet when there isn't one", async () => {
    const g = fakeGoogle();
    expect(await findOrCreateSheet({ getToken, fetch: g.fetch })).toEqual({ spreadsheetId: "new-id", created: true });
    expect(g.calls).toEqual(["GET www.googleapis.com", "POST sheets.googleapis.com"]);
  });

  it("writes headers once, then saves, edits and loads trades exactly", async () => {
    const g = fakeGoogle();
    const s = createGoogleStore({ spreadsheetId: "id", getToken, fetch: g.fetch });
    await s.ensureHeaders();
    await s.ensureHeaders();
    expect(g.sheet).toEqual([COLS]);
    const rows = generateDemoRows().slice(0, 3);
    for (const r of rows) await s.append(r);
    await s.update({ ...rows[1], netPnl: "-1.00", notes: "edited" });
    const out = await s.loadTrades();
    expect(out).toEqual([normalizeTrade(rows[0]), normalizeTrade({ ...rows[1], netPnl: "-1.00", notes: "edited" }), normalizeTrade(rows[2])]);
    await expect(s.update({ id: "missing" })).rejects.toThrow("not found");
  });

  it("an expired token asks for sign-in instead of failing quietly", async () => {
    const g = fakeGoogle({ status: 401 });
    const onExpired = vi.fn();
    const s = createGoogleStore({ spreadsheetId: "id", getToken, onExpired, fetch: g.fetch });
    await expect(s.loadTrades()).rejects.toBeInstanceOf(NeedsSignIn);
    expect(onExpired).toHaveBeenCalledOnce();
    const e = await createGoogleStore({ spreadsheetId: "id", getToken, fetch: fakeGoogle({ status: 403 }).fetch }).loadTrades().catch(x => x);
    expect(e.message).toBe("nope");
  });
});
