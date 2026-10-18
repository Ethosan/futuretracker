// Review screen: one card per week or month.
import { esc, isoDate, money, parseIsoDate, posNeg } from "../format.js";
import { visibleTrades } from "../state.js";
import { groupByPeriod, mistakeCounts, summarize } from "../stats.js";
import { $ } from "../ui.js";

function periodTitle(key, period) {
  if (period === "week") {
    const end = parseIsoDate(key);
    end.setDate(end.getDate() + 6);
    return `Week of ${key} – ${isoDate(end)}`;
  }
  const [year, month] = key.split("-").map(Number);
  return new Date(year, month - 1, 1).toLocaleString(void 0, {
    month: "long",
    year: "numeric",
  });
}

const miniCard = (value, label, tone = "") =>
  `<div class="mini-card"><div class="mini-val num ${tone}">${value}</div><div class="mini-lbl">${label}</div></div>`;

function periodCard(key, trades, period) {
  const summary = summarize(trades),
    counts = {};
  for (const trade of trades) {
    if (trade.instrument) {
      counts[trade.instrument] = (counts[trade.instrument] || 0) + 1;
    }
  }
  const chips = Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .map(
        ([name, count]) => `<span class="chip">${esc(name)} ×${count}</span>`,
      )
      .join(" "),
    ranked = [...trades].sort((a, b) => b.netPnl - a.netPnl),
    best = ranked[0],
    worst = ranked[ranked.length - 1],
    mistakes = mistakeCounts(trades),
    topMistakes = Object.entries(mistakes)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([name, count]) => `${esc(name)} (${count}×)`)
      .join(", "),
    profitFactor =
      summary.profitFactor == null
        ? "—"
        : summary.profitFactor === Infinity
          ? "∞"
          : summary.profitFactor.toFixed(2);
  return `<article class="period-card">
    <header class="period-head">
      <div><h2 class="period-title">${periodTitle(key, period)}</h2><div class="chip-row">${chips}</div></div>
      <div class="period-pnl num ${posNeg(summary.net)}">${money(summary.net)}</div>
    </header>
    <div class="mini-grid">
      ${miniCard(summary.total, "Trades")}
      ${miniCard(Math.round(summary.winRate) + "%", "Win rate", summary.winRate >= 50 ? "pos" : "neg")}
      ${miniCard(summary.wins ? money(summary.avgWin) : "—", "Avg win", "pos")}
      ${miniCard(summary.losses ? money(summary.avgLoss) : "—", "Avg loss", "neg")}
      ${miniCard(profitFactor, "Profit factor", summary.profitFactor == null ? "" : summary.profitFactor >= 1 ? "pos" : "neg")}
    </div>
    <div class="two-col">
      <div class="note-box"><div class="mini-lbl">Best trade</div><span class="sym">${esc(best.instrument || "—")}</span> <span class="dim small">${esc(best.date)}</span><span class="num strong ${posNeg(best.netPnl)} right">${money(best.netPnl)}</span></div>
      <div class="note-box"><div class="mini-lbl">Worst trade</div><span class="sym">${esc(worst.instrument || "—")}</span> <span class="dim small">${esc(worst.date)}</span><span class="num strong ${posNeg(worst.netPnl)} right">${money(worst.netPnl)}</span></div>
    </div>
    ${topMistakes ? `<div class="note-box"><span class="mini-lbl">Top mistakes: </span>${topMistakes}</div>` : ""}
  </article>`;
}

export function renderPeriodReview() {
  const trades = visibleTrades(),
    period = $("review-period").value;
  $("review-empty").hidden = trades.length > 0;
  if (!trades.length) {
    $("review-content").innerHTML = "";
    return;
  }
  const groups = groupByPeriod(trades, period);
  $("review-content").innerHTML = Object.keys(groups)
    .sort((a, b) => b.localeCompare(a))
    .map((key) => periodCard(key, groups[key], period))
    .join("");
}

export function setupPeriodReview() {
  $("review-period").addEventListener("change", renderPeriodReview);
}
