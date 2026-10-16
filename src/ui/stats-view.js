/* Stats view: headline numbers and win-rate breakdowns. */
import { SESSIONS } from "../config.js";
import { activeTrades } from "../state.js";
import * as St from "../lib/stats.js";
import { escapeHtml, money, pnlClass, fmtMins, plural } from "../lib/format.js";
import { $ } from "./dom.js";

function setStat(id, text, tone) {
  const el = $(id);
  el.textContent = text;
  el.className = "stat-val num" + (tone ? " " + tone : "");
}

/* One breakdown row: name, win-rate bar, trades, P&L. */
function row(name, g, { bold = false } = {}) {
  if (!g || !g.tot) return "";
  const wr = Math.round(g.w / g.tot * 100);
  const tone = wr >= 50 ? "pos" : "neg";
  return `<div class="strat-row">
    <span class="strat-name${bold ? " strong" : ""}" title="${escapeHtml(name)}">${escapeHtml(name)}</span>
    <div class="bar-wrap" role="img" aria-label="${wr}% win rate"><div class="bar-fill ${tone}" style="width:${wr}%"></div></div>
    <span class="num strong ${tone} col-wr">${wr}%</span>
    <span class="dim col-n">${plural(g.tot, "trade")}</span>
    <span class="num strong ${pnlClass(g.pnl)} col-pnl">${money(g.pnl)}</span>
  </div>`;
}

const empty = text => `<p class="hint">${text}</p>`;

function rows(map, { order, sort = "pnl", bold, medals = false } = {}) {
  let keys = order ? order.filter(k => map[k]) : Object.keys(map);
  if (!order) keys.sort(sort === "wr" ? (a, b) => map[b].w / map[b].tot - map[a].w / map[a].tot : (a, b) => map[b].pnl - map[a].pnl);
  const medal = i => (medals ? ["🥇 ", "🥈 ", "🥉 "][i] || "" : "");
  return keys.map((k, i) => row(medal(i) + k, map[k], { bold: bold?.(k) })).join("");
}

function tradeLine(t) {
  return `<div class="trade-line"><div><span class="sym">${escapeHtml(t.instrument || "—")}</span> <span class="dim">${escapeHtml(t.date)}</span>${t.ct ? ` <span class="ct-name">${escapeHtml(t.ct)}</span>` : ""}<br>
    <span class="dim small">${escapeHtml(t.strat || "—")} · ${escapeHtml(t.session || "—")}</span></div>
    <span class="num strong ${pnlClass(t.netPnl)}">${money(t.netPnl)}</span></div>`;
}

export function renderStats() {
  const t = activeTrades();
  const s = St.summary(t);
  const tone = v => (v >= 0 ? "pos" : "neg");
  setStat("s-trades", String(s.total));
  $("stats-content").hidden = !s.total;
  $("stats-empty").hidden = !!s.total;
  if (!s.total) return;

  setStat("s-wr", Math.round(s.winRate) + "%", s.winRate >= 50 ? "pos" : "neg");
  setStat("s-pnl", money(s.net), tone(s.net));
  setStat("s-avg", money(s.avg), tone(s.avg));
  setStat("s-avgwin", s.wins ? money(s.avgWin) : "—", "pos");
  setStat("s-avgloss", s.losses ? money(s.avgLoss) : "—", "neg");
  setStat("s-expectancy", money(s.expectancy), tone(s.expectancy));
  setStat("s-profitfactor", s.profitFactor == null ? "—" : s.profitFactor === Infinity ? "∞" : s.profitFactor.toFixed(2), s.profitFactor == null ? "" : s.profitFactor >= 1 ? "pos" : "neg");
  setStat("s-streak", s.streak ? (s.streakType === "W" ? "+" : s.streakType === "L" ? "-" : "") + s.streak + " " + s.streakType : "—", s.streakType === "W" ? "pos" : s.streakType === "L" ? "neg" : "");
  setStat("s-beststreak", s.bestWinStreak ? s.bestWinStreak + "W" : "—", "pos");
  setStat("s-worststreak", s.worstLossStreak ? s.worstLossStreak + "L" : "—", "neg");
  setStat("s-maxdd", s.maxDrawdown ? money(-s.maxDrawdown) : "$0", "neg");
  setStat("s-avgr", s.avgR == null ? "—" : (s.avgR >= 0 ? "+" : "") + s.avgR.toFixed(2) + "R", s.avgR == null ? "" : tone(s.avgR));
  setStat("s-totalr", s.totalR == null ? "—" : (s.totalR >= 0 ? "+" : "") + s.totalR.toFixed(1) + "R", s.totalR == null ? "" : tone(s.totalR));
  setStat("s-payoff", s.payoff == null ? "—" : s.payoff.toFixed(2), s.payoff == null ? "" : s.payoff >= 1 ? "pos" : "neg");
  $("s-r-note").textContent = s.rCount ? `R uses entry, stop and size on ${plural(s.rCount, "trade")}` : "Add a stop loss to trades to track R";

  $("ct-breakdown").innerHTML = rows(St.byCopyTrader(t), { medals: true, bold: k => k !== "Own trade" }) || empty("Log copy trades to see the leaderboard.");
  $("instrument-breakdown").innerHTML = rows(St.byInstrument(t), { bold: () => true }) || empty("No data.");
  $("strat-breakdown").innerHTML = rows(St.byStrategy(t), { sort: "wr" }) || empty("No strategies tagged.");
  $("session-breakdown").innerHTML = rows(St.bySession(t), { order: SESSIONS }) || empty("No sessions tagged.");
  $("weekday-breakdown").innerHTML = rows(St.byWeekday(t), { order: St.WEEKDAYS }) || empty("No data.");
  $("dir-breakdown").innerHTML = rows(St.byDirection(t), { order: ["Long", "Short"] }) || empty("No data.");

  /* Sorted by what each mistake cost, not how often it happened. */
  const { by, clean, slipped } = St.mistakeCosts(t);
  const mistakeRows = Object.keys(by).sort((a, b) => by[a].pnl - by[b].pnl)
    .map(m => `<div class="mistake-row"><span>${escapeHtml(m)}</span><span class="mistake-cost"><span class="dim">${by[m].n}×</span> <span class="num strong ${pnlClass(by[m].pnl)}">${money(by[m].pnl)}</span></span></div>`).join("");
  $("mistake-breakdown").innerHTML = mistakeRows
    ? `<p class="mistake-sum">With a mistake: <span class="num strong ${pnlClass(slipped.pnl)}">${money(slipped.pnl)}</span> over ${plural(slipped.n, "trade")}.<br>
        Without: <span class="num strong ${pnlClass(clean.pnl)}">${money(clean.pnl)}</span> over ${plural(clean.n, "trade")}.</p>` + mistakeRows
    : empty("No mistakes logged yet.");

  $("conf-breakdown").innerHTML = [1, 2, 3, 4, 5].map(c => {
    const sub = t.filter(x => x.conf === c);
    const wr = sub.length ? Math.round(sub.filter(x => x.outcome === "W").length / sub.length * 100) : null;
    const cls = wr == null ? "dim" : wr >= 60 ? "pos" : wr >= 40 ? "warn" : "neg";
    return `<div class="mini-card"><div class="mini-val num ${cls}">${wr != null ? wr + "%" : "—"}</div><div class="mini-lbl">Conf ${c}</div><div class="dim small">${plural(sub.length, "trade")}</div></div>`;
  }).join("");

  const hold = St.holdTimes(t);
  $("dur-avg").textContent = fmtMins(hold.all);
  $("dur-win").textContent = fmtMins(hold.win);
  $("dur-loss").textContent = fmtMins(hold.loss);
  $("dur-breakdown").innerHTML = rows(St.byDuration(t), { order: St.DURATION_BUCKETS }) || empty("Log trades with entry and exit times to see hold-time results.");

  const byPnl = [...t].sort((a, b) => b.netPnl - a.netPnl);
  $("top-winners").innerHTML = byPnl.filter(x => x.netPnl > 0).slice(0, 3).map(tradeLine).join("") || empty("No winning trades yet.");
  $("top-losers").innerHTML = byPnl.filter(x => x.netPnl < 0).reverse().slice(0, 3).map(tradeLine).join("") || empty("No losing trades yet.");
}
