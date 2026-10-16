import "./styles/tokens.css";
import "./styles/base.css";
import "./styles/shell.css";
import "./styles/form.css";
import "./styles/views.css";
import "./styles/panels.css";

import { CACHE_TTL } from "./config.js";
import { S, initState, store, storageMode, findTrade, pendingChanges } from "./state.js";
import { isOffline } from "./lib/offline.js";
import { initPwa } from "./ui/pwa.js";
import { localISODate, money } from "./lib/format.js";
import { $, toast, setSyncStatus, busy } from "./ui/dom.js";
import { forgetScreenshot } from "./ui/images.js";
import { initForm, editTrade, cancelEdit, syncLabel } from "./ui/form.js";
import { initLog, renderLog } from "./ui/log.js";
import { initDetail, showTrade, showDay, closeDetail } from "./ui/detail.js";
import { renderStats } from "./ui/stats-view.js";
import { renderCharts } from "./ui/charts-view.js";
import { initReview, renderReview } from "./ui/review-view.js";
import { initHeatmap, renderHeatmap } from "./ui/heatmap-view.js";
import { initSettings, logoSub } from "./ui/settings.js";
import { getToken } from "./google-auth.js";

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
/* Google Sheet modes (Apps Script or sign-in) show "Synced"; device and demo say where they live. */
const remote = () => ["sheet", "google"].includes(storageMode());

/* ------------------------------------------------------------------ data */
let loading = null;
async function loadTrades(force = false) {
  if (!force && S.loadedAt && Date.now() - S.loadedAt < CACHE_TTL) return;
  if (loading) return loading;
  $("log-loading").hidden = false;
  loading = (async () => {
    try {
      const first = !S.loadedAt;
      S.trades = await store().loadTrades();
      S.loadedAt = Date.now();
      /* Open the heatmap on a year that has trades. */
      if (first && S.trades.length && !S.trades.some(t => t.date?.startsWith(String(S.heatmapYear)))) {
        S.heatmapYear = +S.trades.reduce((a, t) => (t.date > a ? t.date : a), "").slice(0, 4) || S.heatmapYear;
      }
      showSyncState();
    } catch (e) {
      setSyncStatus("err", e.name === "NeedsSignIn" ? "Sign in needed" : "Sync failed");
      if (e.name !== "NeedsSignIn") toast("Couldn't load trades. Check your connection.", true);
    } finally {
      $("log-loading").hidden = true;
      loading = null;
    }
  })();
  return loading;
}

/* Status line: synced, offline with a saved copy, or changes waiting. */
function showSyncState() {
  const waiting = pendingChanges();
  if (store()?.stale) setSyncStatus("err", "Offline · saved copy" + (waiting ? ` · ${waiting} to sync` : ""));
  else if (waiting) setSyncStatus("loading", `${waiting} change${waiting === 1 ? "" : "s"} to sync`);
  else setSyncStatus("ok", remote() ? "Synced · " + new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : syncLabel());
}

/* Back online: send what was saved offline, then reload. */
async function syncNow() {
  if (!store()?.flush || !navigator.onLine) return;
  await store().flush().catch(() => null);
  await loadTrades(true);
  renderCurrent();
}

/* Every sync of offline changes, whenever it happens, says what it did. */
addEventListener("tj:flushed", ({ detail: res }) => {
  if (res.dropped.length) toast(`${res.dropped.length} offline change${res.dropped.length === 1 ? "" : "s"} couldn't be applied: ${res.dropped[0].error}`, true);
  else if (res.sent) toast(`Back online. ${res.sent} change${res.sent === 1 ? "" : "s"} saved to your sheet.`);
});

function renderCurrent() {
  RENDER[current]?.();
}

/* ------------------------------------------------------------- navigation */
/* Each screen has its own address (#stats), so the back button and
   home-screen shortcuts work. */
const VIEWS = ["log-trade", "trade-log", "stats", "charts", "review", "heatmap"];
const viewFromHash = () => (VIEWS.includes(location.hash.slice(1)) ? location.hash.slice(1) : null);

async function goTo(view, { push = true } = {}) {
  if (push && location.hash !== "#" + view) history.pushState(null, "", "#" + view);
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

/* Delete after a confirm. The trade leaves the store first, then the screen. */
async function deleteTrade(id) {
  const t = findTrade(id);
  if (!t) return;
  const what = `${t.instrument || "Trade"} ${t.date} ${money(t.netPnl)}`;
  if (!confirm(`Delete this trade? ${what}\n\nThis can't be undone.`)) return;
  try {
    const res = await busy($("review-delete"), "Deleting", () => store().remove(t.id));
    S.trades = S.trades.filter(x => x.id !== t.id);
    if (res?.status === "queued") showSyncState();
    forgetScreenshot(t.chart);
    if (S.editingId === t.id) cancelEdit();
    closeDetail();
    renderCurrent();
    toast(res?.status === "queued" ? "Deleted here. Your sheet updates when you're back online." : "Trade deleted.");
  } catch (e) {
    toast("Couldn't delete it. " + e.message, true);
  }
}

/* ------------------------------------------------------------------ boot */
function showApp() {
  $("setup-screen").hidden = true;
  $("app").hidden = false;
  $("demo-banner").hidden = !S.demo;
  $("logo-sub").textContent = logoSub();
  $("f-date").value = localISODate();
  setSyncStatus("loading", remote() ? "Connecting..." : "Loading...");
  store().ensureHeaders()
    .then(() => { setSyncStatus("ok", remote() ? "Connected" : syncLabel()); return loadTrades(true); })
    .then(renderCurrent)
    .catch(e => {
      if (e.name === "NeedsSignIn" || isOffline(e)) { loadTrades(true).then(renderCurrent); return; }
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
initDetail({ edit: id => { goTo("log-trade"); editTrade(id); }, remove: deleteTrade });
initReview();
initHeatmap({ openDay: showDay });
initSettings({
  connected: showApp,
  reconnect: changed => {
    if (changed === false) { renderCurrent(); return; }
    setSyncStatus("ok", remote() ? "Connected" : syncLabel());
    loadTrades(true).then(renderCurrent);
  },
});
setAccount("all");
$("exit-demo").addEventListener("click", exitDemo);

/* Google tokens last an hour. When one runs out, a tap here gets a new one. */
addEventListener("tj:needs-signin", () => { $("auth-banner").hidden = false; });
$("reauth-btn").addEventListener("click", async () => {
  try {
    await getToken({ interactive: true });
    $("auth-banner").hidden = true;
    await store().ensureHeaders();
    await loadTrades(true);
    renderCurrent();
  } catch {
    toast("Google sign-in didn't finish. Allow pop-ups for this site and try again.", true);
  }
});

addEventListener("popstate", () => { const v = viewFromHash(); if (v && v !== current) goTo(v, { push: false }); });
addEventListener("online", syncNow);
addEventListener("tj:changed", showSyncState);
initPwa({ remote });

if (storageMode()) {
  showApp();
  const start = viewFromHash();
  if (start && start !== "log-trade") goTo(start, { push: false });
} else {
  $("setup-screen").hidden = false;
}
