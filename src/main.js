import "./styles/tokens.css";
import "./styles/base.css";
import "./styles/shell.css";
import "./styles/form.css";
import "./styles/views.css";
import "./styles/panels.css";

import { CACHE_TTL } from "./config.js";
import { S, initState, store, storageMode } from "./state.js";
import { localISODate } from "./lib/format.js";
import { $, toast, setSyncStatus } from "./ui/dom.js";
import { initForm, editTrade, syncLabel } from "./ui/form.js";
import { initLog, renderLog } from "./ui/log.js";
import { initDetail, showTrade, showDay } from "./ui/detail.js";
import { renderStats } from "./ui/stats-view.js";
import { renderCharts } from "./ui/charts-view.js";
import { initReview, renderReview } from "./ui/review-view.js";
import { initHeatmap, renderHeatmap } from "./ui/heatmap-view.js";
import { initSettings, logoSub } from "./ui/settings.js";

/* ?demo loads the sample journal in memory. Decide before anything reads config. */
initState({ demo: new URLSearchParams(location.search).has("demo") });

const RENDER = {
  "trade-log": renderLog,
  stats: renderStats,
  charts: renderCharts,
  review: renderReview,
  heatmap: renderHeatmap,
};
let current = "log-trade";

/* ------------------------------------------------------------------ data */
let loading = null;
async function loadTrades(force = false) {
  if (!force && S.loadedAt && Date.now() - S.loadedAt < CACHE_TTL) return;
  if (loading) return loading;
  $("log-loading").hidden = false;
  loading = (async () => {
    try {
      S.trades = await store().loadTrades();
      S.loadedAt = Date.now();
      setSyncStatus("ok", storageMode() === "sheet" ? "Synced · " + new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : syncLabel());
    } catch {
      setSyncStatus("err", "Sync failed");
      toast("Couldn't load trades. Check your connection.", true);
    } finally {
      $("log-loading").hidden = true;
      loading = null;
    }
  })();
  return loading;
}

function renderCurrent() {
  RENDER[current]?.();
}

/* ------------------------------------------------------------- navigation */
async function goTo(view) {
  current = view;
  document.querySelectorAll(".view").forEach(v => v.classList.toggle("active", v.id === "view-" + view));
  document.querySelectorAll(".nav-item[data-view]").forEach(n => {
    const on = n.dataset.view === view;
    n.classList.toggle("active", on);
    if (on) n.setAttribute("aria-current", "page"); else n.removeAttribute("aria-current");
  });
  $("main").scrollTop = 0;
  if (view === "log-trade") return;
  const spinner = $(view + "-loading");
  if (spinner) spinner.hidden = false;
  if (RENDER[view] && S.loadedAt) renderCurrent();
  await loadTrades();
  if (spinner) spinner.hidden = true;
  if (current === view) renderCurrent();
}

function setAccount(acct) {
  S.account = acct;
  document.querySelectorAll("[data-account]").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.account === acct)));
  const label = acct === "all" ? "All accounts" : acct + " account";
  const cls = acct === "all" ? "badge-all" : acct === "Live" ? "badge-live" : "badge-prop";
  document.querySelectorAll(".acct-badge").forEach(el => { el.textContent = label; el.className = "account-badge acct-badge " + cls; });
  renderCurrent();
}

/* ------------------------------------------------------------------ boot */
function showApp() {
  $("setup-screen").hidden = true;
  $("app").hidden = false;
  $("demo-banner").hidden = !S.demo;
  $("logo-sub").textContent = logoSub();
  $("f-date").value = localISODate();
  setSyncStatus("loading", storageMode() === "sheet" ? "Connecting..." : "Loading...");
  store().ensureHeaders()
    .then(() => { setSyncStatus("ok", storageMode() === "sheet" ? "Connected" : syncLabel()); return loadTrades(true); })
    .then(renderCurrent)
    .catch(() => {
      setSyncStatus("err", "Connection failed");
      toast("Couldn't connect. Check your Apps Script URL and deployment.", true);
    });
}

/* Leave the demo: same page without ?demo, so the normal setup (or your own journal) loads. */
function exitDemo() {
  const url = new URL(location.href);
  url.searchParams.delete("demo");
  location.replace(url);
}

document.querySelectorAll(".nav-item[data-view]").forEach(n => n.addEventListener("click", () => goTo(n.dataset.view)));
document.querySelectorAll("[data-account]").forEach(b => b.addEventListener("click", () => setAccount(b.dataset.account)));

initForm({ afterSave: () => { S.loadedAt = Date.now(); } });
initLog({ open: showTrade, refresh: () => loadTrades(true).then(renderCurrent), imported: () => { S.loadedAt = Date.now(); renderCurrent(); } });
initDetail({ edit: id => { goTo("log-trade"); editTrade(id); } });
initReview();
initHeatmap({ openDay: showDay });
initSettings({
  connected: showApp,
  reconnect: changed => {
    if (changed === false) { renderCurrent(); return; }
    setSyncStatus("ok", storageMode() === "sheet" ? "Connected" : syncLabel());
    loadTrades(true).then(renderCurrent);
  },
});
setAccount("all");
$("exit-demo").addEventListener("click", exitDemo);

if (storageMode()) showApp();
else $("setup-screen").hidden = false;

if ("serviceWorker" in navigator && import.meta.env.PROD) {
  addEventListener("load", () => navigator.serviceWorker.register("/sw.js").catch(() => {}));
}
