import { beforeEach, describe, expect, it, vi } from "vitest";
import { COLS, INSTRUMENTS, SESSIONS, STRATEGIES, MISTAKES } from "../src/config.js";
import { generateDemoRows, mulberry32, DEMO_COPY_TRADERS } from "../src/lib/demo.js";
import { normalizeTrade } from "../src/lib/rows.js";
import { computeTrade, rMultiple, durationMinutes } from "../src/lib/calc.js";
import * as St from "../src/lib/stats.js";
import { createLocalStore, createMemoryStore } from "../src/lib/stores.js";
import { tradesToCsv, csvToRows, parseCsv } from "../src/lib/csv.js";
import { splitStrats } from "../src/lib/format.js";

/* The Sheets transport, replaced so we can prove demo mode never reaches it. */
const sheetCalls = vi.hoisted(() => ({ create: 0, calls: [] }));
vi.mock("../src/lib/sheets.js", () => ({
  createSheetClient: url => {
    sheetCalls.create++;
    const hit = name => async () => { sheetCalls.calls.push(name + " " + url); return { values: [] }; };
    return { ensureHeaders: hit("ensureHeaders"), loadTrades: hit("loadTrades"), append: hit("append"), update: hit("update") };
  },
}));

const rows = generateDemoRows();
const trades = rows.map(normalizeTrade);
const near = (a, b) => Math.abs(a - b) < 0.011;

function fakeStorage(init = {}) {
  const m = new Map(Object.entries(init));
  return {
    getItem: k => (m.has(k) ? m.get(k) : null),
    setItem: vi.fn((k, v) => m.set(k, String(v))),
    removeItem: vi.fn(k => m.delete(k)),
    dump: () => Object.fromEntries(m),
  };
}

describe("demo data", () => {
  it("is deterministic", () => {
    expect(generateDemoRows()).toEqual(rows);
    const a = mulberry32(1), b = mulberry32(1);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
    expect(generateDemoRows(2)).not.toEqual(rows);
  });

  it("about 120 trades over about five months on the app's instruments", () => {
    expect(trades.length).toBeGreaterThanOrEqual(110);
    expect(trades.length).toBeLessThanOrEqual(130);
    const dates = trades.map(t => t.date).sort();
    const days = (new Date(dates.at(-1)) - new Date(dates[0])) / 864e5;
    expect(days).toBeGreaterThan(140);
    expect(days).toBeLessThan(170);
    const inst = St.byInstrument(trades);
    expect(Object.keys(inst).sort()).toEqual(["MES", "MGC", "MNQ", "XAUUSD"]);
    expect(inst.XAUUSD.tot).toBeLessThan(10);
    expect(new Set(trades.map(t => t.id)).size).toBe(trades.length);
  });

  it("uses the app's own tag lists", () => {
    for (const t of trades) {
      expect(INSTRUMENTS).toContain(t.instrument);
      expect(SESSIONS).toContain(t.session);
      expect(["Live", "Prop"]).toContain(t.account);
      expect(["Long", "Short"]).toContain(t.dir);
      expect(["W", "L", "BE"]).toContain(t.outcome);
      for (const s of splitStrats(t.strat)) expect(STRATEGIES).toContain(s);
      if (t.mistake) expect(MISTAKES).toContain(t.mistake);
      if (t.ct) expect(DEMO_COPY_TRADERS).toContain(t.ct);
      expect(t.conf).toBeGreaterThanOrEqual(1);
      expect(t.conf).toBeLessThanOrEqual(5);
    }
  });

  it("fills every field the app reads", () => {
    const always = ["date", "entryTime", "exitTime", "instrument", "account", "dir", "session", "marketCondition", "contracts",
      "entry", "stop", "target", "rr", "ticksRisk", "strat", "thesis", "conf", "emo", "exit", "grossPnl", "netPnl", "outcome", "post", "right"];
    for (const r of rows) for (const c of always) expect(r[c], `${r.id} ${c}`).not.toBe("");
    const sometimes = ["catalyst", "ct", "managedStop", "commission", "lesson", "mistake"];
    for (const c of sometimes) expect(rows.some(r => r[c]), c).toBe(true);
    expect(trades.some(t => t.notes)).toBe(true);
    expect(trades.some(t => t.legs?.exit?.length > 1)).toBe(true);
    expect(trades.some(t => t.legs?.entry?.length > 1)).toBe(true);
    expect(trades.filter(t => t.mistake && t.mistake !== "None").length).toBeGreaterThan(20);
    for (const r of rows) expect(Object.keys(r).sort()).toEqual([...COLS].sort());
  });

  it("each trade's numbers match the form's own maths", () => {
    for (const t of trades) {
      const entryLegs = t.legs?.entry || [{ price: +t.entry, contracts: +t.contracts }];
      const exitLegs = t.legs?.exit || [{ price: +t.exit, contracts: +t.contracts }];
      const c = computeTrade({ entryLegs, exitLegs, stop: +t.stop, target: +t.target, instrument: t.instrument, dir: t.dir, commission: t.commission });
      expect(near(c.net, t.netPnl), t.id).toBe(true);
      expect(near(t.grossPnl - (+t.commission || 0), t.netPnl), t.id).toBe(true);
      expect(Number.isFinite(rMultiple(t))).toBe(true);
      expect(durationMinutes(t.entryTime, t.exitTime)).toBeGreaterThan(0);
      if (t.outcome === "W") expect(t.netPnl).toBeGreaterThan(0);
      if (t.outcome === "L") expect(t.netPnl).toBeLessThan(0);
    }
  });

  it("passes every stats function with no NaN, and the totals reconcile", () => {
    const s = St.summary(trades);
    for (const [k, v] of Object.entries(s)) {
      if (typeof v === "number") expect(Number.isFinite(v), k).toBe(true);
    }
    const net = trades.reduce((a, t) => a + t.netPnl, 0);
    expect(near(s.net, net)).toBe(true);
    expect(s.wins + s.losses + trades.filter(t => t.outcome === "BE").length).toBe(s.total);
    expect(near(St.equityCurve(trades).at(-1).value, net)).toBe(true);
    expect(near(Object.values(St.dailyTotals(trades, 2026)).reduce((a, d) => a + d.pnl, 0), net)).toBe(true);
    for (const period of ["week", "month"]) {
      const g = St.groupByPeriod(trades, period);
      expect(near(Object.values(g).flat().reduce((a, t) => a + t.netPnl, 0), net)).toBe(true);
    }
    for (const fn of [St.bySession, St.byInstrument, St.byDirection, St.byWeekday, St.byCopyTrader, St.byDuration]) {
      const g = fn(trades);
      expect(Object.values(g).reduce((a, x) => a + x.tot, 0)).toBe(trades.length);
      expect(near(Object.values(g).reduce((a, x) => a + x.pnl, 0), net)).toBe(true);
      for (const x of Object.values(g)) expect(Number.isFinite(x.pnl)).toBe(true);
    }
    expect(Object.keys(St.byStrategy(trades)).length).toBeGreaterThanOrEqual(6);
    const { clean, slipped, by } = St.mistakeCosts(trades);
    expect(clean.n + slipped.n).toBe(trades.length);
    expect(near(clean.pnl + slipped.pnl, net)).toBe(true);
    expect(near(Object.values(by).reduce((a, m) => a + m.pnl, 0), slipped.pnl)).toBe(true);
    const hold = St.holdTimes(trades);
    for (const v of Object.values(hold)) expect(Number.isFinite(v)).toBe(true);
  });

  it("tells an honest story: ends a little down, with a real drawdown and good weeks", () => {
    const s = St.summary(trades);
    expect(s.net).toBeLessThan(0);
    expect(s.net).toBeGreaterThan(-600);
    expect(s.profitFactor).toBeGreaterThan(0.8);
    expect(s.profitFactor).toBeLessThan(1);
    expect(s.maxDrawdown).toBeGreaterThan(1000);
    expect(s.worstLossStreak).toBeGreaterThanOrEqual(6);
    const weeks = Object.values(St.groupByPeriod(trades, "week")).map(w => St.summary(w).net);
    expect(weeks.filter(n => n > 400).length).toBeGreaterThanOrEqual(2);
    const { clean, slipped } = St.mistakeCosts(trades);
    expect(clean.pnl).toBeGreaterThan(0);
    expect(slipped.pnl).toBeLessThan(0);
  });
});

describe("demo mode in the app state", () => {
  let storage;
  const realConfig = JSON.stringify({ scriptUrl: "https://script.google.com/macros/s/REAL/exec", timezone: "Asia/Singapore" });

  beforeEach(() => {
    vi.resetModules();
    sheetCalls.create = 0;
    sheetCalls.calls = [];
    storage = fakeStorage({ tj_config: realConfig, tj_cts: '["Real trader"]' });
    vi.stubGlobal("localStorage", storage);
  });

  it("never calls the Sheets transport or touches the real config", async () => {
    const st = await import("../src/state.js");
    st.initState({ demo: true });
    expect(st.storageMode()).toBe("demo");
    expect(st.S.cfg.scriptUrl).toBeUndefined();

    const loaded = await st.store().ensureHeaders().then(() => st.store().loadTrades());
    expect(loaded.length).toBe(rows.length);

    const row = { ...rows[0], id: "new-1", netPnl: "12.50" };
    await st.store().append(row);
    await st.store().update({ ...row, netPnl: "-4.00" });
    const after = await st.store().loadTrades();
    expect(after.length).toBe(rows.length + 1);
    expect(after.at(-1).netPnl).toBe(-4);

    st.saveConfig({ ...st.S.cfg, timezone: "UTC" });
    st.setCopyTraders([...st.getCopyTraders(), "Someone"]);
    expect(st.getCopyTraders()).toEqual([...DEMO_COPY_TRADERS, "Someone"]);
    st.clearConfig();

    expect(sheetCalls.create).toBe(0);
    expect(sheetCalls.calls).toEqual([]);
    expect(storage.setItem).not.toHaveBeenCalled();
    expect(storage.removeItem).not.toHaveBeenCalled();
    expect(storage.dump()).toEqual({ tj_config: realConfig, tj_cts: '["Real trader"]' });
  });

  it("outside the demo, a saved sheet config still uses the sheet (control for the mock)", async () => {
    const st = await import("../src/state.js");
    st.initState();
    expect(st.storageMode()).toBe("sheet");
    expect(sheetCalls.create).toBe(0); // made lazily
    await st.store().loadTrades();
    expect(sheetCalls.create).toBe(1);
    expect(sheetCalls.calls).toEqual(["loadTrades https://script.google.com/macros/s/REAL/exec"]);
  });

  it("device mode keeps trades in localStorage and never makes a sheet client", async () => {
    vi.stubGlobal("localStorage", fakeStorage({ tj_config: JSON.stringify({ mode: "local" }) }));
    const st = await import("../src/state.js");
    st.initState();
    expect(st.storageMode()).toBe("local");
    await st.store().append(rows[0]);
    expect((await st.store().loadTrades())[0]).toEqual(trades[0]);
    expect(sheetCalls.create).toBe(0);
  });
});

describe("stores", () => {
  it("local store round-trips rows and updates by id", async () => {
    const storage = fakeStorage();
    const s = createLocalStore(storage, "k");
    await s.append(rows[3]);
    await s.append(rows[4]);
    await s.update({ ...rows[3], netPnl: "1.00" });
    const out = await s.loadTrades();
    expect(out.map(t => t.id)).toEqual([rows[3].id, rows[4].id]);
    expect(out[0].netPnl).toBe(1);
    await expect(s.update({ id: "missing" })).rejects.toThrow("not found");
  });

  it("memory store doesn't share objects with its caller", async () => {
    const s = createMemoryStore(rows.slice(0, 2));
    const a = await s.loadTrades();
    a[0].netPnl = 999;
    expect((await s.loadTrades())[0].netPnl).toBe(trades[0].netPnl);
  });
});

describe("csv", () => {
  it("export then import gives back the same trades, legs included", () => {
    const back = csvToRows(tradesToCsv(trades)).map(normalizeTrade);
    expect(back).toEqual(trades);
  });

  it("parses quotes, commas and newlines inside fields", () => {
    expect(parseCsv('a,b\n"x, ""y""","line1\nline2"\r\n')).toEqual([["a", "b"], ['x, "y"', "line1\nline2"]]);
    expect(() => csvToRows("foo,bar\n1,2")).toThrow("no id column");
  });
});
