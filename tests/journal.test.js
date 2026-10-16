import { describe, expect, it } from "vitest";
import { computeTrade, weightedAvg, durationMinutes, encodeNotesWithLegs, decodeNotesWithLegs, rMultiple } from "../src/lib/calc.js";
import { summary, byStrategy, byWeekday, weekStart, groupByPeriod, dailyTotals, equityCurve } from "../src/lib/stats.js";
import { rowsToTrades } from "../src/lib/sheets.js";
import { money, localISODate, fmtMins } from "../src/lib/format.js";
import { COLS } from "../src/config.js";

const trade = (o) => ({ outcome: "", netPnl: 0, date: "2026-10-12", ...o });

describe("computeTrade", () => {
  it("MES long, one leg each: $5 per point per contract", () => {
    const r = computeTrade({
      entryLegs: [{ price: 6000, contracts: 2 }], exitLegs: [{ price: 6004, contracts: 2 }],
      stop: 5998, target: 6006, instrument: "MES", dir: "Long", commission: "1.24",
    });
    expect(r.gross).toBe(40);
    expect(r.net).toBeCloseTo(38.76);
    expect(r.ticks).toBe(2);
    expect(r.maxRisk).toBe(20);
    expect(r.rr).toBe(3);
    expect(r.r).toBeCloseTo(1.938);
  });

  it("short trades profit when price falls", () => {
    const r = computeTrade({
      entryLegs: [{ price: 21000, contracts: 1 }], exitLegs: [{ price: 20990, contracts: 1 }],
      instrument: "MNQ", dir: "Short",
    });
    expect(r.gross).toBe(20);
  });

  it("scales out: each exit leg against the average entry", () => {
    const r = computeTrade({
      entryLegs: [{ price: 2400, contracts: 1 }, { price: 2402, contracts: 1 }],
      exitLegs: [{ price: 2405, contracts: 1 }, { price: 2410, contracts: 1 }],
      instrument: "MGC", dir: "Long",
    });
    expect(r.entry).toBe(2401);
    expect(r.contracts).toBe(2);
    expect(r.gross).toBe((4 + 9) * 10);
  });

  it("leaves P&L empty until there is an exit", () => {
    const r = computeTrade({ entryLegs: [{ price: 6000, contracts: 1 }], exitLegs: [], instrument: "MES", dir: "Long" });
    expect(r.gross).toBeNull();
    expect(r.net).toBeNull();
  });

  it("weightedAvg", () => {
    expect(weightedAvg([{ price: 10, contracts: 1 }, { price: 20, contracts: 3 }])).toEqual({ avg: 17.5, total: 4 });
    expect(weightedAvg([])).toBeNull();
  });
});

describe("legs in notes", () => {
  it("round-trips multi-leg detail and keeps single-leg notes untouched", () => {
    const entry = [{ price: 1, contracts: 1 }, { price: 2, contracts: 1 }];
    const exit = [{ price: 3, contracts: 2 }];
    const notes = encodeNotesWithLegs("Felt good", entry, exit);
    expect(decodeNotesWithLegs(notes)).toEqual({ notes: "Felt good", legs: { entry, exit } });
    expect(encodeNotesWithLegs("Plain", [entry[0]], exit)).toBe("Plain");
  });
});

describe("rowsToTrades", () => {
  it("maps sheet rows to trades and parses numbers", () => {
    const row = COLS.map(c => ({ id: "17", netPnl: "$1,234.50", grossPnl: "1240", conf: "4", notes: "x\n__LEGS__{\"entry\":[],\"exit\":[]}" }[c] ?? ""));
    const [t] = rowsToTrades([COLS, row, COLS.map(() => "")]);
    expect(t.id).toBe("17");
    expect(t.netPnl).toBe(1234.5);
    expect(t.conf).toBe(4);
    expect(t.notes).toBe("x");
    expect(t.legs).toEqual({ entry: [], exit: [] });
    expect(rowsToTrades([COLS])).toEqual([]);
  });
});

describe("summary", () => {
  const ts = [
    trade({ date: "2026-10-01", outcome: "W", netPnl: 100 }),
    trade({ date: "2026-10-02", outcome: "L", netPnl: -50 }),
    trade({ date: "2026-10-03", outcome: "L", netPnl: -50 }),
    trade({ date: "2026-10-04", outcome: "W", netPnl: 200 }),
    trade({ date: "2026-10-05", outcome: "W", netPnl: 100 }),
  ];
  const s = summary(ts);

  it("win rate, net and averages", () => {
    expect(s.total).toBe(5);
    expect(s.winRate).toBe(60);
    expect(s.net).toBe(300);
    expect(s.avgWin).toBeCloseTo(133.33, 1);
    expect(s.avgLoss).toBe(-50);
  });

  it("profit factor is gross wins over gross losses", () => {
    expect(s.profitFactor).toBe(4);
    expect(s.payoff).toBeCloseTo(2.667, 2);
  });

  it("streaks and drawdown follow date order", () => {
    expect(s.streak).toBe(2);
    expect(s.streakType).toBe("W");
    expect(s.bestWinStreak).toBe(2);
    expect(s.worstLossStreak).toBe(2);
    expect(s.maxDrawdown).toBe(100);
  });

  it("R multiple from entry, stop and size", () => {
    const t = trade({ instrument: "MES", entry: "6000", stop: "5998", contracts: "1", netPnl: 20 });
    expect(rMultiple(t)).toBe(2);
    expect(rMultiple(trade({ netPnl: 5 }))).toBeNull();
  });
});

describe("breakdowns and periods", () => {
  it("multi-strategy trades count toward each strategy", () => {
    const b = byStrategy([trade({ strat: "ORB | VWAP reclaim", outcome: "W", netPnl: 10 })]);
    expect(Object.keys(b)).toEqual(["ORB", "VWAP reclaim"]);
    expect(b.ORB).toEqual({ w: 1, l: 0, tot: 1, pnl: 10 });
  });

  it("weekday uses the local calendar date", () => {
    expect(Object.keys(byWeekday([trade({ date: "2026-10-12" })]))).toEqual(["Mon"]);
  });

  it("weeks start on Monday", () => {
    expect(weekStart("2026-10-18")).toBe("2026-10-12");
    expect(weekStart("2026-10-12")).toBe("2026-10-12");
    expect(Object.keys(groupByPeriod([trade({ date: "2026-10-14" })], "month"))).toEqual(["2026-10"]);
  });

  it("daily totals and equity curve", () => {
    const ts = [trade({ date: "2026-10-01", netPnl: 10, outcome: "W" }), trade({ date: "2026-10-01", netPnl: -4 }), trade({ date: "2025-10-01", netPnl: 99 })];
    expect(dailyTotals(ts, 2026)).toEqual({ "2026-10-01": { pnl: 6, trades: 2, wins: 1 } });
    expect(equityCurve(ts).map(p => p.value)).toEqual([99, 109, 105]);
  });
});

describe("format", () => {
  it("money, minutes, local date", () => {
    expect(money(12.5)).toBe("+$12.50");
    expect(money(-3)).toBe("-$3.00");
    expect(fmtMins(95)).toBe("1h 35m");
    expect(fmtMins(120)).toBe("2h");
    expect(durationMinutes("23:50", "00:10")).toBe(20);
    expect(localISODate(new Date(2026, 0, 5, 1, 0))).toBe("2026-01-05");
  });
});
