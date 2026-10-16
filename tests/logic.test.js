import { describe, expect, it } from "vitest";
import { validateTrade, outcomeFor, computeTrade } from "../src/lib/calc.js";
import { createLocalStore, createMemoryStore } from "../src/lib/stores.js";
import { createDeviceImages, memoryKv, isDeviceRef } from "../src/lib/device-images.js";
import { tradeToRow, normalizeTrade } from "../src/lib/rows.js";
import { generateDemoRows } from "../src/lib/demo.js";

const leg = (price, contracts = 1) => ({ price, contracts });
const ok = { instrument: "MES", dir: "Long", entryLegs: [leg(6500)], exitLegs: [leg(6504)], stop: 6496, target: 6510 };
const fields = o => validateTrade({ ...ok, ...o }).map(e => e.field);

describe("trade validation", () => {
  it("a complete trade passes", () => {
    expect(validateTrade(ok)).toEqual([]);
    expect(validateTrade({ ...ok, stop: NaN, target: NaN })).toEqual([]); // stop and target are optional
  });

  it("asks for what's missing", () => {
    expect(fields({ instrument: "" })).toEqual(["f-instrument"]);
    expect(fields({ dir: "" })).toEqual(["f-dir"]);
    expect(fields({ entryLegs: [] })).toEqual(["entry-legs"]);
    expect(fields({ exitLegs: [] })).toEqual(["exit-legs"]);
  });

  it("catches a stop or target on the wrong side", () => {
    expect(fields({ stop: 6501 })).toEqual(["f-stop"]);
    expect(fields({ target: 6490 })).toEqual(["f-target"]);
    expect(fields({ dir: "Short", exitLegs: [leg(6490)], stop: 6496, target: 6480 })).toEqual(["f-stop"]);
    expect(fields({ dir: "Short", exitLegs: [leg(6490)], stop: 6510, target: 6480 })).toEqual([]);
  });

  it("won't exit more contracts than were entered", () => {
    expect(fields({ exitLegs: [leg(6504, 2)] })).toEqual(["exit-legs"]);
  });

  it("a short without a direction would have been booked as a long win", () => {
    const asIfLong = computeTrade({ entryLegs: [leg(6500)], exitLegs: [leg(6510)], instrument: "MES", dir: "" });
    expect(asIfLong.net).toBe(50);
    expect(fields({ dir: "", exitLegs: [leg(6510)] })).toContain("f-dir");
  });

  it("outcome follows net P&L when not picked", () => {
    expect([outcomeFor(12), outcomeFor(-0.62), outcomeFor(0)]).toEqual(["W", "L", "BE"]);
  });
});

describe("deleting trades", () => {
  const rows = generateDemoRows().slice(0, 3);
  for (const [name, make] of [["device", () => createLocalStore(fakeStorage(), "k")], ["demo", () => createMemoryStore([])]]) {
    it(`${name} store removes one trade by id`, async () => {
      const s = make();
      for (const r of rows) await s.append(r);
      await s.remove(rows[1].id);
      expect((await s.loadTrades()).map(t => t.id)).toEqual([rows[0].id, rows[2].id]);
      await expect(s.remove("nope")).rejects.toThrow("not found");
    });
  }
});

describe("device screenshots", () => {
  it("are stored and read back privately, then removed", async () => {
    const d = createDeviceImages(memoryKv());
    const ref = await d.upload(new Blob(["img"], { type: "image/png" }));
    expect(isDeviceRef(ref)).toBe(true);
    expect(await (await d.blob(ref)).text()).toBe("img");
    expect(await d.objectUrl(ref)).toMatch(/^blob:/);
    await d.remove(ref);
    await expect(d.blob(ref)).rejects.toThrow("not on this device");
  });
});

describe("tradeToRow", () => {
  it("is the inverse of normalizeTrade, legs included", () => {
    for (const r of generateDemoRows().slice(0, 40)) expect(normalizeTrade(tradeToRow(normalizeTrade(r)))).toEqual(normalizeTrade(r));
  });
});

function fakeStorage() {
  const m = new Map();
  return { getItem: k => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k) };
}
