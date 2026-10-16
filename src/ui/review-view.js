/* Review view: one card per week or month. */
import { activeTrades } from "../state.js";
import { summary, groupByPeriod, mistakeCounts } from "../lib/stats.js";
import { escapeHtml, money, pnlClass, parseLocalDate, localISODate } from "../lib/format.js";
import { $ } from "./dom.js";

function periodLabel(key, period) {
  if (period === "week") {
    const end = parseLocalDate(key);
    end.setDate(end.getDate() + 6);
    return `Week of ${key} – ${localISODate(end)}`;
  }
  const [y, m] = key.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleString(undefined, { month: "long", year: "numeric" });
}

const mini = (val, label, cls = "") => `<div class="mini-card"><div class="mini-val num ${cls}">${val}</div><div class="mini-lbl">${label}</div></div>`;

function card(key, trades, period) {
  const s = summary(trades);
  const inst = {};
  for (const t of trades) if (t.instrument) inst[t.instrument] = (inst[t.instrument] || 0) + 1;
  const instChips = Object.entries(inst).sort((a, b) => b[1] - a[1]).map(([k, n]) => `<span class="chip">${escapeHtml(k)} ×${n}</span>`).join(" ");
  const sorted = [...trades].sort((a, b) => b.netPnl - a.netPnl);
  const best = sorted[0], worst = sorted[sorted.length - 1];
  const m = mistakeCounts(trades);
  const topMistakes = Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, n]) => `${escapeHtml(k)} (${n}×)`).join(", ");
  const pf = s.profitFactor == null ? "—" : s.profitFactor === Infinity ? "∞" : s.profitFactor.toFixed(2);

  return `<article class="period-card">
    <header class="period-head">
      <div><h2 class="period-title">${periodLabel(key, period)}</h2><div class="chip-row">${instChips}</div></div>
      <div class="period-pnl num ${pnlClass(s.net)}">${money(s.net)}</div>
    </header>
    <div class="mini-grid">
      ${mini(s.total, "Trades")}
      ${mini(Math.round(s.winRate) + "%", "Win rate", s.winRate >= 50 ? "pos" : "neg")}
      ${mini(s.wins ? money(s.avgWin) : "—", "Avg win", "pos")}
      ${mini(s.losses ? money(s.avgLoss) : "—", "Avg loss", "neg")}
      ${mini(pf, "Profit factor", s.profitFactor == null ? "" : s.profitFactor >= 1 ? "pos" : "neg")}
    </div>
    <div class="two-col">
      <div class="note-box"><div class="mini-lbl">Best trade</div><span class="sym">${escapeHtml(best.instrument || "—")}</span> <span class="dim small">${escapeHtml(best.date)}</span><span class="num strong ${pnlClass(best.netPnl)} right">${money(best.netPnl)}</span></div>
      <div class="note-box"><div class="mini-lbl">Worst trade</div><span class="sym">${escapeHtml(worst.instrument || "—")}</span> <span class="dim small">${escapeHtml(worst.date)}</span><span class="num strong ${pnlClass(worst.netPnl)} right">${money(worst.netPnl)}</span></div>
    </div>
    ${topMistakes ? `<div class="note-box"><span class="mini-lbl">Top mistakes: </span>${topMistakes}</div>` : ""}
  </article>`;
}

export function renderReview() {
  const t = activeTrades();
  const period = $("review-period").value;
  $("review-empty").hidden = t.length > 0;
  if (!t.length) { $("review-content").innerHTML = ""; return; }
  const groups = groupByPeriod(t, period);
  $("review-content").innerHTML = Object.keys(groups).sort((a, b) => b.localeCompare(a)).map(k => card(k, groups[k], period)).join("");
}

export function initReview() {
  $("review-period").addEventListener("change", renderReview);
}
