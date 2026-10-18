// Stats screen.
import { SESSIONS } from "../constants.js";
import { duration, esc, money, plural, posNeg } from "../format.js";
import { visibleTrades } from "../state.js";
import {
  HOLD_BUCKETS,
  WEEKDAYS,
  averageHold,
  byCopyTrader,
  byDirection,
  byHoldTime,
  byInstrument,
  bySession,
  byStrategy,
  byWeekday,
  mistakeCost,
  summarize,
} from "../stats.js";
import { $ } from "../ui.js";

function setStat(id, text, tone) {
  const el = $(id);
  el.textContent = text;
  el.className = "stat-val num" + (tone ? " " + tone : "");
}

function breakdownRow(name, group, { bold = false } = {}) {
  if (!group || !group.tot) {
    return "";
  }
  const winRate = Math.round((group.w / group.tot) * 100),
    tone = winRate >= 50 ? "pos" : "neg";
  return `<div class="strat-row">
    <span class="strat-name${bold ? " strong" : ""}" title="${esc(name)}">${esc(name)}</span>
    <div class="bar-wrap" role="img" aria-label="${winRate}% win rate"><div class="bar-fill ${tone}" style="width:${winRate}%"></div></div>
    <span class="num strong ${tone} col-wr">${winRate}%</span>
    <span class="dim col-n">${plural(group.tot, "trade")}</span>
    <span class="num strong ${posNeg(group.pnl)} col-pnl">${money(group.pnl)}</span>
  </div>`;
}

const hint = (text) => `<p class="hint">${text}</p>`;

function breakdownRows(
  groups,
  { order, sort = "pnl", bold, medals = false } = {},
) {
  let names = order
    ? order.filter((name) => groups[name])
    : Object.keys(groups);
  if (!order) {
    names.sort(
      sort === "wr"
        ? (a, b) => groups[b].w / groups[b].tot - groups[a].w / groups[a].tot
        : (a, b) => groups[b].pnl - groups[a].pnl,
    );
  }
  const medal = (rank) => (medals && ["🥇 ", "🥈 ", "🥉 "][rank]) || "";
  return names
    .map((name, rank) =>
      breakdownRow(medal(rank) + name, groups[name], {
        bold: bold?.(name),
      }),
    )
    .join("");
}

function tradeLine(trade) {
  return `<div class="trade-line"><div><span class="sym">${esc(trade.instrument || "—")}</span> <span class="dim">${esc(trade.date)}</span>${trade.ct ? ` <span class="ct-name">${esc(trade.ct)}</span>` : ""}<br>
    <span class="dim small">${esc(trade.strat || "—")} · ${esc(trade.session || "—")}</span></div>
    <span class="num strong ${posNeg(trade.netPnl)}">${money(trade.netPnl)}</span></div>`;
}

export function renderStats() {
  const trades = visibleTrades(),
    summary = summarize(trades),
    tone = (value) => (value >= 0 ? "pos" : "neg");
  setStat("s-trades", String(summary.total));
  $("stats-content").hidden = !summary.total;
  $("stats-empty").hidden = !!summary.total;
  if (!summary.total) {
    return;
  }
  setStat(
    "s-wr",
    Math.round(summary.winRate) + "%",
    summary.winRate >= 50 ? "pos" : "neg",
  );
  setStat("s-pnl", money(summary.net), tone(summary.net));
  setStat("s-avg", money(summary.avg), tone(summary.avg));
  setStat("s-avgwin", summary.wins ? money(summary.avgWin) : "—", "pos");
  setStat("s-avgloss", summary.losses ? money(summary.avgLoss) : "—", "neg");
  setStat("s-expectancy", money(summary.expectancy), tone(summary.expectancy));
  setStat(
    "s-profitfactor",
    summary.profitFactor == null
      ? "—"
      : summary.profitFactor === Infinity
        ? "∞"
        : summary.profitFactor.toFixed(2),
    summary.profitFactor == null
      ? ""
      : summary.profitFactor >= 1
        ? "pos"
        : "neg",
  );
  setStat(
    "s-streak",
    summary.streak
      ? (summary.streakType === "W"
          ? "+"
          : summary.streakType === "L"
            ? "-"
            : "") +
          summary.streak +
          " " +
          summary.streakType
      : "—",
    summary.streakType === "W"
      ? "pos"
      : summary.streakType === "L"
        ? "neg"
        : "",
  );
  setStat(
    "s-beststreak",
    summary.bestWinStreak ? summary.bestWinStreak + "W" : "—",
    "pos",
  );
  setStat(
    "s-worststreak",
    summary.worstLossStreak ? summary.worstLossStreak + "L" : "—",
    "neg",
  );
  setStat(
    "s-maxdd",
    summary.maxDrawdown ? money(-summary.maxDrawdown) : "$0",
    "neg",
  );
  setStat(
    "s-avgr",
    summary.avgR == null
      ? "—"
      : (summary.avgR >= 0 ? "+" : "") + summary.avgR.toFixed(2) + "R",
    summary.avgR == null ? "" : tone(summary.avgR),
  );
  setStat(
    "s-totalr",
    summary.totalR == null
      ? "—"
      : (summary.totalR >= 0 ? "+" : "") + summary.totalR.toFixed(1) + "R",
    summary.totalR == null ? "" : tone(summary.totalR),
  );
  setStat(
    "s-payoff",
    summary.payoff == null ? "—" : summary.payoff.toFixed(2),
    summary.payoff == null ? "" : summary.payoff >= 1 ? "pos" : "neg",
  );
  $("s-r-note").textContent = summary.rCount
    ? `R uses entry, stop and size on ${plural(summary.rCount, "trade")}`
    : "Add a stop loss to trades to track R";
  $("ct-breakdown").innerHTML =
    breakdownRows(byCopyTrader(trades), {
      medals: true,
      bold: (name) => name !== "Own trade",
    }) || hint("Log copy trades to see the leaderboard.");
  $("instrument-breakdown").innerHTML =
    breakdownRows(byInstrument(trades), {
      bold: () => true,
    }) || hint("No data.");
  $("strat-breakdown").innerHTML =
    breakdownRows(byStrategy(trades), {
      sort: "wr",
    }) || hint("No strategies tagged.");
  $("session-breakdown").innerHTML =
    breakdownRows(bySession(trades), {
      order: SESSIONS,
    }) || hint("No sessions tagged.");
  $("weekday-breakdown").innerHTML =
    breakdownRows(byWeekday(trades), {
      order: WEEKDAYS,
    }) || hint("No data.");
  $("dir-breakdown").innerHTML =
    breakdownRows(byDirection(trades), {
      order: ["Long", "Short"],
    }) || hint("No data.");
  const { by: byMistake, clean, slipped } = mistakeCost(trades),
    rows = Object.keys(byMistake)
      .sort((a, b) => byMistake[a].pnl - byMistake[b].pnl)
      .map(
        (name) =>
          `<div class="mistake-row"><span>${esc(name)}</span><span class="mistake-cost"><span class="dim">${byMistake[name].n}×</span> <span class="num strong ${posNeg(byMistake[name].pnl)}">${money(byMistake[name].pnl)}</span></span></div>`,
      )
      .join("");
  $("mistake-breakdown").innerHTML = rows
    ? `<p class="mistake-sum">With a mistake: <span class="num strong ${posNeg(slipped.pnl)}">${money(slipped.pnl)}</span> over ${plural(slipped.n, "trade")}.<br>
        Without: <span class="num strong ${posNeg(clean.pnl)}">${money(clean.pnl)}</span> over ${plural(clean.n, "trade")}.</p>` +
      rows
    : hint("No mistakes logged yet.");
  $("conf-breakdown").innerHTML = [1, 2, 3, 4, 5]
    .map((level) => {
      const atLevel = trades.filter((trade) => trade.conf === level),
        winRate = atLevel.length
          ? Math.round(
              (atLevel.filter((trade) => trade.outcome === "W").length /
                atLevel.length) *
                100,
            )
          : null;
      return `<div class="mini-card"><div class="mini-val num ${winRate == null ? "dim" : winRate >= 60 ? "pos" : winRate >= 40 ? "warn" : "neg"}">${winRate != null ? winRate + "%" : "—"}</div><div class="mini-lbl">Conf ${level}</div><div class="dim small">${plural(atLevel.length, "trade")}</div></div>`;
    })
    .join("");
  const hold = averageHold(trades);
  $("dur-avg").textContent = duration(hold.all);
  $("dur-win").textContent = duration(hold.win);
  $("dur-loss").textContent = duration(hold.loss);
  $("dur-breakdown").innerHTML =
    breakdownRows(byHoldTime(trades), {
      order: HOLD_BUCKETS,
    }) ||
    hint("Log trades with entry and exit times to see hold-time results.");
  const ranked = [...trades].sort((a, b) => b.netPnl - a.netPnl);
  $("top-winners").innerHTML =
    ranked
      .filter((trade) => trade.netPnl > 0)
      .slice(0, 3)
      .map(tradeLine)
      .join("") || hint("No winning trades yet.");
  $("top-losers").innerHTML =
    ranked
      .filter((trade) => trade.netPnl < 0)
      .reverse()
      .slice(0, 3)
      .map(tradeLine)
      .join("") || hint("No losing trades yet.");
}
