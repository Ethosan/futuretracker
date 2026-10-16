/* Trade Log view: today bar, filters, grouped table and CSV export. */
import { COLS, INSTRUMENTS } from "../config.js";
import { S, activeTrades } from "../state.js";
import { rMultiple } from "../lib/calc.js";
import { escapeHtml, money, pnlClass, localISODate, fmtTime, splitStrats, plural } from "../lib/format.js";
import { $ } from "./dom.js";

let onOpen = () => {};

const outcomeClass = o => (o === "W" ? "out-w" : o === "L" ? "out-l" : "out-be");
const dash = '<span class="dim">—</span>';

function syncStrategyFilter() {
  const sel = $("filter-strat");
  const have = new Set([...sel.options].map(o => o.value));
  const all = [...new Set(S.trades.flatMap(t => splitStrats(t.strat)))].sort();
  for (const s of all) {
    if (!have.has(s)) sel.add(new Option(s, s));
  }
}

function renderToday(trades) {
  const today = trades.filter(t => t.date === localISODate());
  const bar = $("today-bar");
  bar.hidden = !today.length;
  if (!today.length) return;
  const pnl = today.reduce((a, t) => a + t.netPnl, 0);
  const w = today.filter(t => t.outcome === "W").length;
  $("today-trades").textContent = plural(today.length, "trade");
  $("today-pnl").textContent = money(pnl);
  $("today-pnl").className = "num " + pnlClass(pnl);
  $("today-wr").textContent = `${w}W ${today.length - w}L`;
}

function filtered(trades) {
  const text = $("filter-text").value.trim().toLowerCase();
  const outcome = $("filter-outcome").value;
  const strat = $("filter-strat").value;
  const inst = $("filter-instrument").value;
  return trades.filter(t =>
    (!text || [t.instrument, t.strat, t.ct, t.date, t.catalyst].some(v => (v || "").toLowerCase().includes(text))) &&
    (!outcome || t.outcome === outcome) &&
    (!strat || splitStrats(t.strat).includes(strat)) &&
    (!inst || t.instrument === inst));
}

function rowHtml(t) {
  const strats = splitStrats(t.strat).map(s => `<span class="chip chip-strat">${escapeHtml(s)}</span>`).join(" ");
  const setup = t.ct
    ? `<span class="ct-name">${escapeHtml(t.ct)}</span>${strats ? "<br>" + strats : ""}`
    : strats || dash;
  const acct = t.account ? `<span class="chip ${t.account === "Live" ? "chip-live" : "chip-prop"}">${escapeHtml(t.account)}</span>` : dash;
  const r = rMultiple(t);
  return `<tr class="trade-row" data-id="${escapeHtml(t.id)}" tabindex="0" aria-label="${escapeHtml(t.instrument || "Trade")} ${escapeHtml(t.date)} ${money(t.netPnl)}. Open">
    <td class="dim nowrap">${escapeHtml(t.date)}</td>
    <td class="dim">${escapeHtml(fmtTime(t.entryTime, t.date, S.cfg.timezone))}</td>
    <td><span class="sym">${escapeHtml(t.instrument || "—")}</span></td>
    <td class="col-acct">${acct}</td>
    <td class="${t.dir === "Long" ? "pos" : t.dir === "Short" ? "neg" : "dim"}">${escapeHtml(t.dir || "—")}</td>
    <td class="col-setup">${setup}</td>
    <td class="num strong nowrap ${pnlClass(t.netPnl)}">${money(t.netPnl)}</td>
    <td class="num col-r ${r == null ? "dim" : pnlClass(r)}">${r == null ? "—" : (r >= 0 ? "+" : "") + r.toFixed(2) + "R"}</td>
    <td><span class="out-tag ${outcomeClass(t.outcome)}">${escapeHtml(t.outcome || "—")}</span></td>
    <td class="dim col-session">${escapeHtml(t.session || "—")}</td>
    <td>${t.mistake && t.mistake !== "None" ? `<span class="chip chip-mistake">${escapeHtml(t.mistake)}</span>` : dash}</td>
  </tr>`;
}

export function renderLog() {
  syncStrategyFilter();
  const trades = activeTrades();
  renderToday(trades);
  $("log-count").textContent = plural(trades.length, "trade");

  const list = filtered(trades).sort((a, b) => (b.date || "").localeCompare(a.date || "") || (b.entryTime || "").localeCompare(a.entryTime || ""));
  $("log-empty").hidden = list.length > 0 || $("log-loading").hidden === false;
  $("log-empty").textContent = trades.length ? "No trades match these filters." : "No trades yet. Log your first one.";
  if (!list.length) { $("log-body").innerHTML = ""; return; }

  const days = new Map();
  for (const t of list) {
    const d = t.date || "—";
    if (!days.has(d)) days.set(d, []);
    days.get(d).push(t);
  }
  let html = "";
  for (const [date, dt] of days) {
    const pnl = dt.reduce((a, t) => a + t.netPnl, 0);
    const w = dt.filter(t => t.outcome === "W").length;
    html += `<tr class="day-row"><td colspan="11">
      <span class="strong">${escapeHtml(date)}</span>
      <span class="dim">${plural(dt.length, "trade")}</span>
      <span class="num strong ${pnlClass(pnl)}">${money(pnl)}</span>
      <span class="dim">${w}W ${dt.length - w}L</span></td></tr>`;
    html += dt.map(rowHtml).join("");
  }
  $("log-body").innerHTML = html;
}

/* CSV of every trade in the current account view, in sheet column order. */
function exportCsv() {
  const cell = v => {
    const s = String(v ?? "");
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  const lines = [COLS.join(","), ...activeTrades().map(t => COLS.map(c => cell(t[c])).join(","))];
  const blob = new Blob([lines.join("\n")], { type: "text/csv" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `trades-${S.account.toLowerCase()}-${localISODate()}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export function initLog({ open, refresh }) {
  onOpen = open;
  const inst = $("filter-instrument");
  for (const i of INSTRUMENTS) inst.add(new Option(i, i));
  for (const id of ["filter-text", "filter-outcome", "filter-strat", "filter-instrument"]) $(id).addEventListener("input", renderLog);
  $("refresh-btn").addEventListener("click", refresh);
  $("export-btn").addEventListener("click", exportCsv);
  const body = $("log-body");
  body.addEventListener("click", e => {
    const row = e.target.closest(".trade-row");
    if (row) onOpen(row.dataset.id);
  });
  body.addEventListener("keydown", e => {
    const row = e.target.closest(".trade-row");
    if (row && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); onOpen(row.dataset.id); }
  });
}
