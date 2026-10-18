// Statistics: win rate, expectancy, streaks, drawdown, and breakdowns by strategy, session, weekday and more.
import { isoDate, parseIsoDate, splitList } from "./format.js";
import { minutesBetween, rMultipleOf } from "./trade.js";

const sumBy = (list, fn) => list.reduce((sum, item) => sum + fn(item), 0);

const byTime = (a, b) =>
  (a.date || "").localeCompare(b.date || "") ||
  (a.entryTime || "").localeCompare(b.entryTime || "");

export function summarize(trades) {
  const total = trades.length,
    wins = trades.filter((trade) => trade.outcome === "W"),
    losses = trades.filter((trade) => trade.outcome === "L"),
    net = sumBy(trades, (trade) => trade.netPnl),
    grossWin = sumBy(wins, (trade) => trade.netPnl),
    grossLoss = Math.abs(sumBy(losses, (trade) => trade.netPnl)),
    avgWin = wins.length ? grossWin / wins.length : 0,
    avgLoss = losses.length ? -grossLoss / losses.length : 0,
    decided = wins.length + losses.length,
    ordered = [...trades].sort(byTime);
  let bestWin = 0,
    worstLoss = 0,
    winRun = 0,
    lossRun = 0;
  for (const trade of ordered) {
    if (trade.outcome === "W") {
      winRun++;
      lossRun = 0;
      bestWin = Math.max(bestWin, winRun);
    } else {
      if (trade.outcome === "L") {
        lossRun++;
        winRun = 0;
        worstLoss = Math.max(worstLoss, lossRun);
      } else {
        winRun = 0;
        lossRun = 0;
      }
    }
  }
  let streak = 0,
    streakType = "";
  const last = ordered[ordered.length - 1];
  if (last) {
    streakType = last.outcome;
    for (
      let i = ordered.length - 1;
      i >= 0 && ordered[i].outcome === last.outcome;
      i--
    ) {
      streak++;
    }
  }
  let peak = 0,
    equity = 0,
    drawdown = 0;
  for (const trade of ordered) {
    equity += trade.netPnl;
    peak = Math.max(peak, equity);
    drawdown = Math.max(drawdown, peak - equity);
  }
  const rs = trades.map(rMultipleOf).filter((r) => r != null && isFinite(r));
  return {
    total,
    wins: wins.length,
    losses: losses.length,
    winRate: total ? (wins.length / total) * 100 : 0,
    net,
    avg: total ? net / total : 0,
    avgWin,
    avgLoss,
    expectancy: total
      ? (wins.length / total) * avgWin + (losses.length / total) * avgLoss
      : 0,
    profitFactor:
      grossLoss > 0 ? grossWin / grossLoss : grossWin > 0 ? Infinity : null,
    payoff: avgLoss ? avgWin / Math.abs(avgLoss) : null,
    decided,
    streak,
    streakType,
    bestWinStreak: bestWin,
    worstLossStreak: worstLoss,
    maxDrawdown: drawdown,
    avgR: rs.length ? rs.reduce((sum, r) => sum + r, 0) / rs.length : null,
    totalR: rs.length ? rs.reduce((sum, r) => sum + r, 0) : null,
    rCount: rs.length,
  };
}

function tally(trades, keysOf) {
  const groups = {};
  for (const trade of trades) {
    const keys = [].concat(keysOf(trade)).filter(Boolean);
    for (const key of keys) {
      const group =
        groups[key] ||
        (groups[key] = {
          w: 0,
          l: 0,
          tot: 0,
          pnl: 0,
        });
      if (trade.outcome === "W") {
        group.w++;
      }
      if (trade.outcome === "L") {
        group.l++;
      }
      group.tot++;
      group.pnl += trade.netPnl;
    }
  }
  return groups;
}

export const byStrategy = (trades) =>
  tally(trades, (trade) => splitList(trade.strat));

export const byCopyTrader = (trades) =>
  tally(trades, (trade) => trade.ct || "Own trade");

export const byInstrument = (trades) =>
  tally(trades, (trade) => trade.instrument);

export const bySession = (trades) => tally(trades, (trade) => trade.session);

export const byDirection = (trades) => tally(trades, (trade) => trade.dir);

export const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export const byWeekday = (trades) =>
  tally(trades, (trade) =>
    trade.date ? WEEKDAYS[(parseIsoDate(trade.date).getDay() + 6) % 7] : null,
  );

export const HOLD_BUCKETS = [
  "Scalp (<5m)",
  "Short (5–30m)",
  "Medium (30–120m)",
  "Long (>2h)",
];

function holdBucket(minutes) {
  return minutes == null
    ? null
    : minutes < 5
      ? HOLD_BUCKETS[0]
      : minutes < 30
        ? HOLD_BUCKETS[1]
        : minutes < 120
          ? HOLD_BUCKETS[2]
          : HOLD_BUCKETS[3];
}

export const byHoldTime = (trades) =>
  tally(trades, (trade) =>
    holdBucket(minutesBetween(trade.entryTime, trade.exitTime)),
  );

export function averageHold(trades) {
  const timed = trades
      .map((trade) => ({
        t: trade,
        m: minutesBetween(trade.entryTime, trade.exitTime),
      }))
      .filter((row) => row.m != null),
    avg = (rows) =>
      rows.length
        ? rows.reduce((sum, row) => sum + row.m, 0) / rows.length
        : null;
  return {
    all: avg(timed),
    win: avg(timed.filter((row) => row.t.outcome === "W")),
    loss: avg(timed.filter((row) => row.t.outcome === "L")),
  };
}

export function mistakeCounts(trades) {
  const counts = {};
  for (const trade of trades) {
    if (trade.mistake && trade.mistake !== "None") {
      counts[trade.mistake] = (counts[trade.mistake] || 0) + 1;
    }
  }
  return counts;
}

export function mistakeCost(trades) {
  const by = {},
    clean = {
      n: 0,
      pnl: 0,
    },
    slipped = {
      n: 0,
      pnl: 0,
    };
  for (const trade of trades) {
    const hasMistake = trade.mistake && trade.mistake !== "None",
      bucket = hasMistake ? slipped : clean;
    bucket.n++;
    bucket.pnl += trade.netPnl;
    if (!hasMistake) {
      continue;
    }
    const entry =
      by[trade.mistake] ||
      (by[trade.mistake] = {
        n: 0,
        pnl: 0,
      });
    entry.n++;
    entry.pnl += trade.netPnl;
  }
  return {
    by,
    clean,
    slipped,
  };
}

export function equityCurve(trades) {
  let equity = 0;
  return [...trades]
    .filter((trade) => trade.date)
    .sort(byTime)
    .map((trade) => {
      equity += trade.netPnl;
      return {
        label: trade.date + " " + (trade.instrument || ""),
        value: +equity.toFixed(2),
      };
    });
}

function weekStart(iso) {
  const date = parseIsoDate(iso);
  date.setDate(date.getDate() - ((date.getDay() + 6) % 7));
  return isoDate(date);
}

export function groupByPeriod(trades, period) {
  const groups = {};
  for (const trade of trades) {
    if (!trade.date) {
      continue;
    }
    const key =
      period === "week" ? weekStart(trade.date) : trade.date.slice(0, 7);
    (groups[key] || (groups[key] = [])).push(trade);
  }
  return groups;
}

export function dailyTotals(trades, year) {
  const days = {};
  for (const trade of trades) {
    if (!trade.date || !trade.date.startsWith(String(year))) {
      continue;
    }
    const day =
      days[trade.date] ||
      (days[trade.date] = {
        pnl: 0,
        trades: 0,
        wins: 0,
      });
    day.pnl += trade.netPnl;
    day.trades++;
    if (trade.outcome === "W") {
      day.wins++;
    }
  }
  return days;
}
