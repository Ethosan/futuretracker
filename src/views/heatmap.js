// Heatmap screen: daily P&L calendar for a year, with a monthly summary.
import { money, plural, posNeg } from "../format.js";
import { state, visibleTrades } from "../state.js";
import { dailyTotals } from "../stats.js";
import { $ } from "../ui.js";

const MONTH_NAMES = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

const DAY_LETTERS = ["M", "T", "W", "T", "F", "S", "S"];

const pad2 = (n) => String(n).padStart(2, "0");

function cellStyle(day, maxAbs) {
  if (!day) {
    return "";
  }
  const alpha = (0.2 + Math.min(Math.abs(day.pnl) / maxAbs, 1) * 0.75).toFixed(
    2,
  );
  return day.pnl > 0
    ? `background:rgba(200,245,106,${alpha})`
    : day.pnl < 0
      ? `background:rgba(255,107,107,${alpha})`
      : "background:rgba(255,193,102,0.4)";
}

export function renderHeatmap() {
  const year = state.heatmapYear;
  $("heatmap-year-label").textContent = year;
  const trades = visibleTrades(),
    days = dailyTotals(trades, year),
    hasDays = Object.keys(days).length > 0;
  $("heatmap-empty").hidden = hasDays;
  $("heatmap-empty").textContent = trades.length
    ? `No trades in ${year}.`
    : "Log some trades to see the heatmap.";
  if (!hasDays) {
    $("heatmap-grid").innerHTML = "";
    $("heatmap-monthly-summary").innerHTML = "";
    return;
  }
  const firstDate = trades.reduce(
      (min, trade) =>
        trade.date && (!min || trade.date < min) ? trade.date : min,
      "",
    ),
    now = new Date(),
    firstMonth = firstDate.startsWith(String(year))
      ? +firstDate.slice(5, 7) - 1
      : 0,
    lastDay = Object.keys(days).sort().pop(),
    lastMonth =
      year === now.getFullYear()
        ? Math.max(now.getMonth(), lastDay ? +lastDay.slice(5, 7) - 1 : 0)
        : 11,
    showMonth = (name, month) => month >= firstMonth && month <= lastMonth,
    maxAbs = Math.max(
      ...Object.values(days).map((day) => Math.abs(day.pnl)),
      1,
    );
  $("heatmap-grid").innerHTML = MONTH_NAMES.map((name, month) => {
    if (!showMonth(name, month)) {
      return "";
    }
    const lead = (new Date(year, month, 1).getDay() + 6) % 7,
      daysInMonth = new Date(year, month + 1, 0).getDate();
    let html = DAY_LETTERS.map(
      (letter) => `<span class="hm-dow" aria-hidden="true">${letter}</span>`,
    ).join("");
    html += '<span class="hm-cell empty"></span>'.repeat(lead);
    for (let d = 1; d <= daysInMonth; d++) {
      const date = `${year}-${pad2(month + 1)}-${pad2(d)}`,
        day = days[date];
      html += day
        ? `<button type="button" class="hm-cell" data-date="${date}" style="${cellStyle(day, maxAbs)}" title="${date}: ${plural(day.trades, "trade")}, ${money(day.pnl)}, ${day.wins}W ${day.trades - day.wins}L" aria-label="${date}: ${plural(day.trades, "trade")}, ${money(day.pnl)}"></button>`
        : '<span class="hm-cell none"></span>';
    }
    return `<div class="hm-month"><div class="hm-month-name">${name}</div><div class="hm-days">${html}</div></div>`;
  }).join("");
  let yearPnl = 0,
    yearTrades = 0,
    yearWins = 0;
  const rows = MONTH_NAMES.map((name, month) => {
      if (!showMonth(name, month)) {
        return "";
      }
      const prefix = `${year}-${pad2(month + 1)}`,
        monthTrades = trades.filter(
          (trade) => trade.date && trade.date.startsWith(prefix),
        );
      if (!monthTrades.length) {
        return `<tr><td>${name}</td><td colspan="5" class="dim center">—</td></tr>`;
      }
      const pnl = monthTrades.reduce((sum, trade) => sum + trade.netPnl, 0),
        wins = monthTrades.filter((trade) => trade.outcome === "W").length,
        winRate = Math.round((wins / monthTrades.length) * 100);
      yearPnl += pnl;
      yearTrades += monthTrades.length;
      yearWins += wins;
      const dayPnls = Object.entries(days)
          .filter(([date]) => date.startsWith(prefix))
          .map(([, day]) => day.pnl),
        best = Math.max(...dayPnls),
        worst = Math.min(...dayPnls);
      return `<tr><td>${name}</td><td class="num dim">${monthTrades.length}</td><td class="num ${winRate >= 50 ? "pos" : "neg"}">${winRate}%</td>
      <td class="num strong ${posNeg(pnl)}">${money(pnl)}</td>
      <td class="num ${posNeg(best)}">${money(best)}</td><td class="num ${posNeg(worst)}">${money(worst)}</td></tr>`;
    }).join(""),
    yearWinRate = yearTrades ? Math.round((yearWins / yearTrades) * 100) : 0;
  $("heatmap-monthly-summary").innerHTML = `
    <h2 class="section-label">Monthly summary</h2>
    <div class="table-scroll"><table class="month-table">
      <thead><tr><th>Month</th><th>Trades</th><th>Win rate</th><th>Net P&amp;L</th><th>Best day</th><th>Worst day</th></tr></thead>
      <tbody>${rows}
        <tr class="total-row"><td>Year total</td><td class="num dim">${yearTrades}</td><td class="num ${yearWinRate >= 50 ? "pos" : "neg"}">${yearWinRate}%</td>
        <td class="num strong big ${posNeg(yearPnl)}">${money(yearPnl)}</td><td colspan="2"></td></tr>
      </tbody></table></div>`;
}

export function setupHeatmap({ openDay }) {
  $("heatmap-prev").addEventListener("click", () => {
    state.heatmapYear--;
    renderHeatmap();
  });
  $("heatmap-next").addEventListener("click", () => {
    state.heatmapYear++;
    renderHeatmap();
  });
  $("heatmap-grid").addEventListener("click", (event) => {
    const cell = event.target.closest(".hm-cell[data-date]");
    if (cell) {
      openDay(cell.dataset.date);
    }
  });
}
