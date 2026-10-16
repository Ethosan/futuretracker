/* Heatmap view: a calendar per month coloured by daily P&L, plus a monthly table. */
import { S, activeTrades } from "../state.js";
import { dailyTotals } from "../lib/stats.js";
import { money, pnlClass, plural } from "../lib/format.js";
import { $ } from "./dom.js";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DOW = ["M", "T", "W", "T", "F", "S", "S"];
const pad = n => String(n).padStart(2, "0");

function cellStyle(d, maxAbs) {
  if (!d) return "";
  const alpha = (0.2 + Math.min(Math.abs(d.pnl) / maxAbs, 1) * 0.75).toFixed(2);
  if (d.pnl > 0) return `background:rgba(200,245,106,${alpha})`;
  if (d.pnl < 0) return `background:rgba(255,107,107,${alpha})`;
  return "background:rgba(255,193,102,0.4)";
}

export function renderHeatmap() {
  const year = S.heatmapYear;
  $("heatmap-year-label").textContent = year;
  const trades = activeTrades();
  const days = dailyTotals(trades, year);
  const has = Object.keys(days).length > 0;
  $("heatmap-empty").hidden = has;
  $("heatmap-empty").textContent = trades.length ? `No trades in ${year}.` : "Log some trades to see the heatmap.";
  if (!has) { $("heatmap-grid").innerHTML = ""; $("heatmap-monthly-summary").innerHTML = ""; return; }

  /* Skip months before the journal's first trade and after this month: they can only be empty. */
  const first = trades.reduce((a, t) => (t.date && (!a || t.date < a) ? t.date : a), "");
  const now = new Date();
  const from = first.startsWith(String(year)) ? +first.slice(5, 7) - 1 : 0;
  const to = year === now.getFullYear() ? now.getMonth() : 11;
  const shown = (_, mi) => mi >= from && mi <= to;

  const maxAbs = Math.max(...Object.values(days).map(d => Math.abs(d.pnl)), 1);
  $("heatmap-grid").innerHTML = MONTHS.map((mon, mi) => {
    if (!shown(mon, mi)) return "";
    const lead = (new Date(year, mi, 1).getDay() + 6) % 7;
    const count = new Date(year, mi + 1, 0).getDate();
    let cells = DOW.map(d => `<span class="hm-dow" aria-hidden="true">${d}</span>`).join("");
    cells += '<span class="hm-cell empty"></span>'.repeat(lead);
    for (let d = 1; d <= count; d++) {
      const date = `${year}-${pad(mi + 1)}-${pad(d)}`;
      const data = days[date];
      cells += data
        ? `<button type="button" class="hm-cell" data-date="${date}" style="${cellStyle(data, maxAbs)}" title="${date}: ${plural(data.trades, "trade")}, ${money(data.pnl)}, ${data.wins}W ${data.trades - data.wins}L" aria-label="${date}: ${plural(data.trades, "trade")}, ${money(data.pnl)}"></button>`
        : '<span class="hm-cell none"></span>';
    }
    return `<div class="hm-month"><div class="hm-month-name">${mon}</div><div class="hm-days">${cells}</div></div>`;
  }).join("");

  let yearPnl = 0, yearTrades = 0, yearWins = 0;
  const rows = MONTHS.map((mon, mi) => {
    if (!shown(mon, mi)) return "";
    const prefix = `${year}-${pad(mi + 1)}`;
    const mt = trades.filter(t => t.date && t.date.startsWith(prefix));
    if (!mt.length) return `<tr><td>${mon}</td><td colspan="5" class="dim center">—</td></tr>`;
    const pnl = mt.reduce((a, t) => a + t.netPnl, 0);
    const w = mt.filter(t => t.outcome === "W").length;
    const wr = Math.round(w / mt.length * 100);
    yearPnl += pnl; yearTrades += mt.length; yearWins += w;
    const daily = Object.entries(days).filter(([d]) => d.startsWith(prefix)).map(([, v]) => v.pnl);
    const best = Math.max(...daily), worst = Math.min(...daily);
    return `<tr><td>${mon}</td><td class="num dim">${mt.length}</td><td class="num ${wr >= 50 ? "pos" : "neg"}">${wr}%</td>
      <td class="num strong ${pnlClass(pnl)}">${money(pnl)}</td>
      <td class="num ${pnlClass(best)}">${money(best)}</td><td class="num ${pnlClass(worst)}">${money(worst)}</td></tr>`;
  }).join("");
  const ywr = yearTrades ? Math.round(yearWins / yearTrades * 100) : 0;
  $("heatmap-monthly-summary").innerHTML = `
    <h2 class="section-label">Monthly summary</h2>
    <div class="table-scroll"><table class="month-table">
      <thead><tr><th>Month</th><th>Trades</th><th>Win rate</th><th>Net P&amp;L</th><th>Best day</th><th>Worst day</th></tr></thead>
      <tbody>${rows}
        <tr class="total-row"><td>Year total</td><td class="num dim">${yearTrades}</td><td class="num ${ywr >= 50 ? "pos" : "neg"}">${ywr}%</td>
        <td class="num strong big ${pnlClass(yearPnl)}">${money(yearPnl)}</td><td colspan="2"></td></tr>
      </tbody></table></div>`;
}

export function initHeatmap({ openDay }) {
  $("heatmap-prev").addEventListener("click", () => { S.heatmapYear--; renderHeatmap(); });
  $("heatmap-next").addEventListener("click", () => { S.heatmapYear++; renderHeatmap(); });
  $("heatmap-grid").addEventListener("click", e => {
    const cell = e.target.closest(".hm-cell[data-date]");
    if (cell) openDay(cell.dataset.date);
  });
}
