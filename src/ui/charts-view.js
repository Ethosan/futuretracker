/* Charts view (Chart.js). Charts are rebuilt on each render. */
import {
  Chart, LineController, BarController, DoughnutController, LineElement, BarElement, ArcElement, PointElement,
  CategoryScale, LinearScale, Filler, Tooltip, Legend,
} from "chart.js";
import { SESSIONS } from "../config.js";
import { activeTrades } from "../state.js";
import * as St from "../lib/stats.js";
import { money } from "../lib/format.js";
import { $ } from "./dom.js";

Chart.register(LineController, BarController, DoughnutController, LineElement, BarElement, ArcElement, PointElement,
  CategoryScale, LinearScale, Filler, Tooltip, Legend);

const C = {
  up: "#c8f56a", down: "#ff6b6b", blue: "#7ec8f7", amber: "#ffc166",
  upFill: "rgba(200,245,106,0.7)", downFill: "rgba(255,107,107,0.7)",
  grid: "#262626", text: "#a3a3a3",
};
Chart.defaults.color = C.text;
Chart.defaults.borderColor = "#333";
Chart.defaults.font.family = "'DM Mono', monospace";
Chart.defaults.font.size = 12;

const charts = {};
const tip = { backgroundColor: "#1c1c1c", borderColor: "#404040", borderWidth: 1, titleColor: "#f4f1ec", bodyColor: "#c4c4c4", padding: 10 };
const base = { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: tip } };
const pctAxis = { min: 0, max: 100, ticks: { callback: v => v + "%" }, grid: { color: C.grid } };
const sign = (vals, a, b) => vals.map(v => (v >= 0 ? a : b));
/* Category axes show every label; long lists go horizontal instead of rotating. */
const cats = { grid: { display: false }, ticks: { autoSkip: false } };
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const shortDate = d => (d ? +d.slice(8, 10) + " " + MONTHS[+d.slice(5, 7) - 1] : "");

/* Horizontal bar charts get a height that fits their rows. */
function fitRows(canvasId, n) {
  $(canvasId).parentElement.style.height = Math.max(160, n * 30 + 36) + "px";
}

function draw(key, canvasId, config) {
  charts[key]?.destroy();
  charts[key] = new Chart($(canvasId), config);
}

/* Win rate (wins over decided trades) per group, in the given key order. */
function winRates(map, keys) {
  return keys.map(k => { const g = map[k]; const d = g.w + g.l; return d ? Math.round(g.w / d * 100) : 0; });
}

function wrBar(key, canvasId, map, keys, { horizontal = false } = {}) {
  const vals = winRates(map, keys);
  const v = horizontal ? "x" : "y";
  if (horizontal) fitRows(canvasId, keys.length);
  draw(key, canvasId, {
    type: "bar",
    data: { labels: keys, datasets: [{ data: vals, backgroundColor: vals.map(v => (v >= 50 ? C.upFill : C.downFill)), borderColor: vals.map(v => (v >= 50 ? C.up : C.down)), borderWidth: 1, borderRadius: 3 }] },
    options: { ...base, indexAxis: horizontal ? "y" : "x", scales: horizontal ? { y: cats, x: pctAxis } : { x: cats, y: pctAxis },
      plugins: { ...base.plugins, tooltip: { ...tip, callbacks: { label: ctx => ` ${ctx.parsed[v]}% win rate · ${map[keys[ctx.dataIndex]].w + map[keys[ctx.dataIndex]].l} decided` } } } },
  });
}

function wrAndPnl(key, canvasId, map, keys) {
  const wr = winRates(map, keys);
  const pnl = keys.map(k => +map[k].pnl.toFixed(2));
  draw(key, canvasId, {
    type: "bar",
    data: { labels: keys, datasets: [
      { label: "Win rate %", data: wr, backgroundColor: "rgba(200,245,106,0.65)", borderColor: C.up, borderWidth: 1, borderRadius: 3, yAxisID: "y" },
      { label: "Net P&L $", data: pnl, backgroundColor: sign(pnl, "rgba(126,200,247,0.6)", "rgba(255,107,107,0.6)"), borderColor: sign(pnl, C.blue, C.down), borderWidth: 1, borderRadius: 3, yAxisID: "y1" },
    ] },
    options: { responsive: true, maintainAspectRatio: false,
      plugins: { legend: { labels: { color: C.text } }, tooltip: { ...tip, callbacks: { label: ctx => (ctx.dataset.yAxisID === "y" ? ` ${ctx.parsed.y}% win rate` : ` $${ctx.parsed.y.toFixed(2)}`) } } },
      scales: { x: cats, y: { ...pctAxis, position: "left" }, y1: { position: "right", ticks: { callback: v => "$" + v }, grid: { display: false } } } },
  });
}

export function renderCharts() {
  const t = activeTrades();
  $("charts-empty").hidden = t.length > 0;
  $("chart-grid").hidden = !t.length;
  if (!t.length) return;

  const curve = St.equityCurve(t);
  draw("pnl", "chart-pnl", {
    type: "line",
    data: { labels: curve.map(p => p.label), datasets: [{
      data: curve.map(p => p.value), borderColor: C.up, borderWidth: 2, pointRadius: curve.length > 60 ? 0 : 3,
      pointBackgroundColor: curve.map(p => (p.value >= 0 ? C.up : C.down)), pointBorderColor: "transparent", tension: 0.3, fill: true,
      backgroundColor: ctx => {
        const g = ctx.chart.ctx.createLinearGradient(0, 0, 0, ctx.chart.height);
        g.addColorStop(0, "rgba(200,245,106,0.16)");
        g.addColorStop(1, "rgba(200,245,106,0.01)");
        return g;
      },
    }] },
    options: { ...base, scales: {
      x: { ticks: { maxTicksLimit: 6, maxRotation: 0, callback(v) { return shortDate(this.getLabelForValue(v)); } }, grid: { color: C.grid } },
      y: { ticks: { callback: v => "$" + v }, grid: { color: C.grid } } },
      plugins: { ...base.plugins, tooltip: { ...tip, callbacks: { label: ctx => ` $${ctx.parsed.y.toFixed(2)}` } } } },
  });

  const strat = St.byStrategy(t);
  const stratKeys = Object.keys(strat).filter(k => strat[k].w + strat[k].l).sort((a, b) => strat[b].w / (strat[b].w + strat[b].l) - strat[a].w / (strat[a].w + strat[a].l));
  wrBar("wr", "chart-wr", strat, stratKeys, { horizontal: true });

  const pnlKeys = Object.keys(strat).sort((a, b) => strat[b].pnl - strat[a].pnl);
  const pnlVals = pnlKeys.map(k => +strat[k].pnl.toFixed(2));
  fitRows("chart-strat-pnl", pnlKeys.length);
  draw("strat-pnl", "chart-strat-pnl", {
    type: "bar",
    data: { labels: pnlKeys, datasets: [{ data: pnlVals, backgroundColor: sign(pnlVals, C.upFill, C.downFill), borderColor: sign(pnlVals, C.up, C.down), borderWidth: 1, borderRadius: 3 }] },
    options: { ...base, indexAxis: "y", scales: { y: cats, x: { ticks: { callback: v => "$" + v, maxTicksLimit: 5 }, grid: { color: C.grid } } },
      plugins: { ...base.plugins, tooltip: { ...tip, callbacks: { label: ctx => ` $${ctx.parsed.x.toFixed(2)}` } } } },
  });

  const ct = St.byCopyTrader(t);
  wrAndPnl("ct", "chart-ct", ct, Object.keys(ct).sort((a, b) => ct[b].pnl - ct[a].pnl));

  const sess = St.bySession(t);
  wrBar("session", "chart-session", sess, SESSIONS.filter(s => sess[s]));

  const inst = St.byInstrument(t);
  const instKeys = Object.keys(inst);
  const palette = [C.up, C.blue, C.amber, C.down];
  draw("instrument", "chart-instrument", {
    type: "doughnut",
    data: { labels: instKeys, datasets: [{ data: instKeys.map(k => inst[k].tot), backgroundColor: instKeys.map((_, i) => palette[i % 4] + "cc"), borderColor: instKeys.map((_, i) => palette[i % 4]), borderWidth: 1 }] },
    options: { responsive: true, maintainAspectRatio: false,
      plugins: { legend: { position: "right", labels: { color: C.text, padding: 14 } },
        tooltip: { ...tip, callbacks: { label: ctx => { const g = inst[instKeys[ctx.dataIndex]]; return ` ${g.tot} trades · ${Math.round(g.w / g.tot * 100)}% WR · $${g.pnl.toFixed(2)}`; } } } } },
  });

  const dir = St.byDirection(t);
  wrAndPnl("longshort", "chart-longshort", { Long: dir.Long || { w: 0, l: 0, tot: 0, pnl: 0 }, Short: dir.Short || { w: 0, l: 0, tot: 0, pnl: 0 } }, ["Long", "Short"]);

  const wd = St.byWeekday(t);
  wrAndPnl("weekday", "chart-weekday", wd, St.WEEKDAYS.filter(d => wd[d]));

  const mist = St.mistakeCounts(t);
  const cost = St.mistakeCosts(t).by;
  const mk = Object.keys(mist).sort((a, b) => mist[b] - mist[a]);
  fitRows("chart-mistakes", mk.length);
  draw("mistakes", "chart-mistakes", {
    type: "bar",
    data: { labels: mk, datasets: [{ data: mk.map(k => mist[k]), backgroundColor: "rgba(255,107,107,0.65)", borderColor: C.down, borderWidth: 1, borderRadius: 3 }] },
    options: { ...base, indexAxis: "y", scales: { y: cats, x: { ticks: { stepSize: 1, maxRotation: 0 }, grid: { color: C.grid } } },
      plugins: { ...base.plugins, tooltip: { ...tip, callbacks: { label: ctx => ` ${ctx.parsed.x} time${ctx.parsed.x !== 1 ? "s" : ""} · ${money(cost[mk[ctx.dataIndex]].pnl)}` } } } },
  });
}
