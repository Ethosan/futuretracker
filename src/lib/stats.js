/* Aggregates for the Stats, Charts, Review and Heatmap views. Pure functions. */
import { durationMinutes, rMultiple } from "./calc.js";
import { parseLocalDate, localISODate, splitStrats } from "./format.js";

const sum = (arr, f) => arr.reduce((a, x) => a + f(x), 0);
const byDateAsc = (a, b) => (a.date || "").localeCompare(b.date || "") || (a.entryTime || "").localeCompare(b.entryTime || "");

export function summary(trades) {
  const total = trades.length;
  const wins = trades.filter(t => t.outcome === "W");
  const losses = trades.filter(t => t.outcome === "L");
  const net = sum(trades, t => t.netPnl);
  const grossWin = sum(wins, t => t.netPnl);
  const grossLoss = Math.abs(sum(losses, t => t.netPnl));
  const avgWin = wins.length ? grossWin / wins.length : 0;
  const avgLoss = losses.length ? -grossLoss / losses.length : 0;
  const decided = wins.length + losses.length;

  const sorted = [...trades].sort(byDateAsc);
  let best = 0, worst = 0, w = 0, l = 0;
  for (const t of sorted) {
    if (t.outcome === "W") { w++; l = 0; best = Math.max(best, w); }
    else if (t.outcome === "L") { l++; w = 0; worst = Math.max(worst, l); }
    else { w = 0; l = 0; }
  }
  let streak = 0, streakType = "";
  const last = sorted[sorted.length - 1];
  if (last) {
    streakType = last.outcome;
    for (let i = sorted.length - 1; i >= 0 && sorted[i].outcome === last.outcome; i--) streak++;
  }

  let peak = 0, run = 0, maxDD = 0;
  for (const t of sorted) {
    run += t.netPnl;
    peak = Math.max(peak, run);
    maxDD = Math.max(maxDD, peak - run);
  }

  const rs = trades.map(rMultiple).filter(r => r != null && isFinite(r));

  return {
    total,
    wins: wins.length,
    losses: losses.length,
    winRate: total ? wins.length / total * 100 : 0,
    net,
    avg: total ? net / total : 0,
    avgWin,
    avgLoss,
    /* Expected $ per trade from win rate and average win/loss. */
    expectancy: total ? (wins.length / total) * avgWin + (losses.length / total) * avgLoss : 0,
    profitFactor: grossLoss > 0 ? grossWin / grossLoss : (grossWin > 0 ? Infinity : null),
    /* Average win divided by average loss. */
    payoff: avgLoss ? avgWin / Math.abs(avgLoss) : null,
    decided,
    streak,
    streakType,
    bestWinStreak: best,
    worstLossStreak: worst,
    maxDrawdown: maxDD,
    avgR: rs.length ? rs.reduce((a, b) => a + b, 0) / rs.length : null,
    totalR: rs.length ? rs.reduce((a, b) => a + b, 0) : null,
    rCount: rs.length,
  };
}

/* Group trades by a key (or keys, for multi-strategy trades): { key: { w, l, tot, pnl } }. */
export function breakdown(trades, keyFn) {
  const out = {};
  for (const t of trades) {
    const keys = [].concat(keyFn(t)).filter(Boolean);
    for (const k of keys) {
      const g = out[k] || (out[k] = { w: 0, l: 0, tot: 0, pnl: 0 });
      if (t.outcome === "W") g.w++;
      if (t.outcome === "L") g.l++;
      g.tot++;
      g.pnl += t.netPnl;
    }
  }
  return out;
}

export const byStrategy = trades => breakdown(trades, t => splitStrats(t.strat));
export const byCopyTrader = trades => breakdown(trades, t => t.ct || "Own trade");
export const byInstrument = trades => breakdown(trades, t => t.instrument);
export const bySession = trades => breakdown(trades, t => t.session);
export const byDirection = trades => breakdown(trades, t => t.dir);

export const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
export const byWeekday = trades => breakdown(trades, t => (t.date ? WEEKDAYS[(parseLocalDate(t.date).getDay() + 6) % 7] : null));

export const DURATION_BUCKETS = ["Scalp (<5m)", "Short (5–30m)", "Medium (30–120m)", "Long (>2h)"];
export function bucketFor(m) {
  if (m == null) return null;
  return m < 5 ? DURATION_BUCKETS[0] : m < 30 ? DURATION_BUCKETS[1] : m < 120 ? DURATION_BUCKETS[2] : DURATION_BUCKETS[3];
}
export const byDuration = trades => breakdown(trades, t => bucketFor(durationMinutes(t.entryTime, t.exitTime)));

export function holdTimes(trades) {
  const timed = trades.map(t => ({ t, m: durationMinutes(t.entryTime, t.exitTime) })).filter(x => x.m != null);
  const avg = list => (list.length ? list.reduce((a, x) => a + x.m, 0) / list.length : null);
  return {
    all: avg(timed),
    win: avg(timed.filter(x => x.t.outcome === "W")),
    loss: avg(timed.filter(x => x.t.outcome === "L")),
  };
}

export function mistakeCounts(trades) {
  const out = {};
  for (const t of trades) if (t.mistake && t.mistake !== "None") out[t.mistake] = (out[t.mistake] || 0) + 1;
  return out;
}

/* What each mistake cost: { mistake: { n, pnl } }, plus trades with and without one. */
export function mistakeCosts(trades) {
  const by = {};
  const clean = { n: 0, pnl: 0 }, slipped = { n: 0, pnl: 0 };
  for (const t of trades) {
    const tagged = t.mistake && t.mistake !== "None";
    const g = tagged ? slipped : clean;
    g.n++;
    g.pnl += t.netPnl;
    if (!tagged) continue;
    const m = by[t.mistake] || (by[t.mistake] = { n: 0, pnl: 0 });
    m.n++;
    m.pnl += t.netPnl;
  }
  return { by, clean, slipped };
}

/* Cumulative net P&L in trade order, for the equity curve. */
export function equityCurve(trades) {
  let cum = 0;
  return [...trades].filter(t => t.date).sort(byDateAsc).map(t => {
    cum += t.netPnl;
    return { label: t.date + " " + (t.instrument || ""), value: +cum.toFixed(2) };
  });
}

/* Monday of the week containing a YYYY-MM-DD date, as YYYY-MM-DD. */
export function weekStart(dateStr) {
  const d = parseLocalDate(dateStr);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return localISODate(d);
}

export function groupByPeriod(trades, period) {
  const groups = {};
  for (const t of trades) {
    if (!t.date) continue;
    const key = period === "week" ? weekStart(t.date) : t.date.slice(0, 7);
    (groups[key] || (groups[key] = [])).push(t);
  }
  return groups;
}

/* { "YYYY-MM-DD": { pnl, trades, wins } } for one year. */
export function dailyTotals(trades, year) {
  const out = {};
  for (const t of trades) {
    if (!t.date || !t.date.startsWith(String(year))) continue;
    const d = out[t.date] || (out[t.date] = { pnl: 0, trades: 0, wins: 0 });
    d.pnl += t.netPnl;
    d.trades++;
    if (t.outcome === "W") d.wins++;
  }
  return out;
}
