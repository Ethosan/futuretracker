// App start-up: connects storage, wires the screens together and handles navigation.
import "./style.css";
import { REFRESH_AFTER_MS } from "./constants.js";
import { isoDate, money } from "./format.js";
import { getToken } from "./google/auth.js";
import { setupPwa } from "./pwa.js";
import { removeDeviceImage } from "./screenshots.js";
import {
  getStore,
  initMode,
  pendingCount,
  state,
  storageMode,
  tradeById,
} from "./state.js";
import { isOffline } from "./stores/offline.js";
import { $, setSync, toast, withSpinner } from "./ui.js";
import { renderCharts } from "./views/charts.js";
import { renderHeatmap, setupHeatmap } from "./views/heatmap.js";
import {
  cancelEdit,
  setupTradeForm,
  startEdit,
  syncedLabel,
} from "./views/log-trade.js";
import {
  renderPeriodReview,
  setupPeriodReview,
} from "./views/period-review.js";
import {
  closeReview,
  openDay,
  openReview,
  setupReviewPanel,
} from "./views/review-panel.js";
import { modeLabel, setupConnection } from "./views/setup.js";
import { renderStats } from "./views/stats.js";
import { renderTradeLog, setupTradeLog } from "./views/trade-log.js";

initMode({
  demo: new URLSearchParams(location.search).has("demo"),
});

const RENDERERS = {
  "trade-log": renderTradeLog,
  stats: renderStats,
  charts: renderCharts,
  review: renderPeriodReview,
  heatmap: renderHeatmap,
};

let currentView = "log-trade";

const isRemote = () => ["sheet", "google"].includes(storageMode());

let loading = null;

async function loadTrades(force = false) {
  if (!(
    !force &&
    state.loadedAt &&
    Date.now() - state.loadedAt < REFRESH_AFTER_MS
  )) {
    return (
      loading ||
      (($("log-loading").hidden = false),
      (loading = (async () => {
        try {
          const firstLoad = !state.loadedAt;
          state.trades = await getStore().loadTrades();
          state.loadedAt = Date.now();
          if (
            firstLoad &&
            state.trades.length &&
            !state.trades.some((trade) =>
              trade.date?.startsWith(String(state.heatmapYear)),
            )
          ) {
            state.heatmapYear =
              +state.trades
                .reduce(
                  (latest, trade) =>
                    trade.date > latest ? trade.date : latest,
                  "",
                )
                .slice(0, 4) || state.heatmapYear;
          }
          updateSyncStatus();
        } catch (err) {
          setSync(
            "err",
            err.name === "NeedsSignIn" ? "Sign in needed" : "Sync failed",
          );
          if (err.name !== "NeedsSignIn") {
            toast("Couldn't load trades. Check your connection.", true);
          }
        } finally {
          $("log-loading").hidden = true;
          loading = null;
        }
      })()),
      loading)
    );
  }
}

function updateSyncStatus() {
  const pending = pendingCount();
  if (getStore()?.stale) {
    setSync(
      "err",
      "Offline · saved copy" + (pending ? ` · ${pending} to sync` : ""),
    );
  } else {
    if (pending) {
      setSync(
        "loading",
        `${pending} change${pending === 1 ? "" : "s"} to sync`,
      );
    } else {
      setSync(
        "ok",
        isRemote()
          ? "Synced · " +
              new Date().toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })
          : syncedLabel(),
      );
    }
  }
}

async function onBackOnline() {
  if (!(!getStore()?.flush || !navigator.onLine)) {
    await getStore()
      .flush()
      .catch(() => null);
    await loadTrades(true);
    renderCurrentView();
  }
}

addEventListener("tj:flushed", ({ detail }) => {
  if (detail.dropped.length) {
    toast(
      `${detail.dropped.length} offline change${detail.dropped.length === 1 ? "" : "s"} couldn't be applied: ${detail.dropped[0].error}`,
      true,
    );
  } else {
    if (detail.sent) {
      toast(
        `Back online. ${detail.sent} change${detail.sent === 1 ? "" : "s"} saved to your sheet.`,
      );
    }
  }
});

function renderCurrentView() {
  RENDERERS[currentView]?.();
}

const VIEWS = [
  "log-trade",
  "trade-log",
  "stats",
  "charts",
  "review",
  "heatmap",
];

const viewFromHash = () =>
  VIEWS.includes(location.hash.slice(1)) ? location.hash.slice(1) : null;

async function showView(view, { push = true } = {}) {
  if (push && location.hash !== "#" + view) {
    history.pushState(null, "", "#" + view);
  }
  currentView = view;
  document
    .querySelectorAll(".view")
    .forEach((el) => el.classList.toggle("active", el.id === "view-" + view));
  document.querySelectorAll(".nav-item[data-view]").forEach((navItem) => {
    const active = navItem.dataset.view === view;
    navItem.classList.toggle("active", active);
    if (active) {
      navItem.setAttribute("aria-current", "page");
    } else {
      navItem.removeAttribute("aria-current");
    }
  });
  $("main").scrollTop = 0;
  if (view === "log-trade") {
    return;
  }
  const spinner = $(view + "-loading");
  if (spinner) {
    spinner.hidden = false;
  }
  if (RENDERERS[view] && state.loadedAt) {
    renderCurrentView();
  }
  await loadTrades();
  if (spinner) {
    spinner.hidden = true;
  }
  if (currentView === view) {
    renderCurrentView();
  }
}

function setAccount(account) {
  state.account = account;
  document
    .querySelectorAll("[data-account]")
    .forEach((btn) =>
      btn.setAttribute("aria-pressed", String(btn.dataset.account === account)),
    );
  const label = account === "all" ? "All accounts" : account + " account",
    badgeClass =
      account === "all"
        ? "badge-all"
        : account === "Live"
          ? "badge-live"
          : "badge-prop";
  document.querySelectorAll(".acct-badge").forEach((badge) => {
    badge.textContent = label;
    badge.className = "account-badge acct-badge " + badgeClass;
  });
  renderCurrentView();
}

async function deleteTrade(id) {
  const trade = tradeById(id);
  if (!trade) {
    return;
  }
  const summary = `${trade.instrument || "Trade"} ${trade.date} ${money(trade.netPnl)}`;
  if (
    confirm(`Delete this trade? ${summary}

This can't be undone.`)
  ) {
    try {
      const res = await withSpinner($("review-delete"), "Deleting", () =>
        getStore().remove(trade.id),
      );
      state.trades = state.trades.filter((row) => row.id !== trade.id);
      if (res?.status === "queued") {
        updateSyncStatus();
      }
      removeDeviceImage(trade.chart);
      if (state.editingId === trade.id) {
        cancelEdit();
      }
      closeReview();
      renderCurrentView();
      toast(
        res?.status === "queued"
          ? "Deleted here. Your sheet updates when you're back online."
          : "Trade deleted.",
      );
    } catch (err) {
      toast("Couldn't delete it. " + err.message, true);
    }
  }
}

function startApp() {
  $("setup-screen").hidden = true;
  $("app").hidden = false;
  $("demo-banner").hidden = !state.demo;
  $("logo-sub").textContent = modeLabel();
  $("f-date").value = isoDate();
  setSync("loading", isRemote() ? "Connecting..." : "Loading...");
  getStore()
    .ensureHeaders()
    .then(() => {
      setSync("ok", isRemote() ? "Connected" : syncedLabel());
      return loadTrades(true);
    })
    .then(renderCurrentView)
    .catch((err) => {
      if (err.name === "NeedsSignIn" || isOffline(err)) {
        loadTrades(true).then(renderCurrentView);
        return;
      }
      setSync("err", "Connection failed");
      toast(
        "Couldn't connect. Check your Apps Script URL and deployment.",
        true,
      );
    });
}

function exitDemo() {
  const url = new URL(location.href);
  url.searchParams.delete("demo");
  location.replace(url);
}

document
  .querySelectorAll(".nav-item[data-view]")
  .forEach((navItem) =>
    navItem.addEventListener("click", () => showView(navItem.dataset.view)),
  );

document
  .querySelectorAll("[data-account]")
  .forEach((btn) =>
    btn.addEventListener("click", () => setAccount(btn.dataset.account)),
  );

setupTradeForm({
  afterSave: () => {
    state.loadedAt = Date.now();
  },
});

setupTradeLog({
  open: openReview,
  refresh: () => loadTrades(true).then(renderCurrentView),
  imported: () => {
    state.loadedAt = Date.now();
    renderCurrentView();
  },
});

setupReviewPanel({
  edit: (id) => {
    showView("log-trade");
    startEdit(id);
  },
  remove: deleteTrade,
});

setupPeriodReview();

setupHeatmap({
  openDay,
});

setupConnection({
  connected: startApp,
  reconnect: (changed) => {
    if (changed === false) {
      renderCurrentView();
      return;
    }
    setSync("ok", isRemote() ? "Connected" : syncedLabel());
    loadTrades(true).then(renderCurrentView);
  },
});

setAccount("all");

$("exit-demo").addEventListener("click", exitDemo);

addEventListener("tj:needs-signin", () => {
  $("auth-banner").hidden = false;
});

$("reauth-btn").addEventListener("click", async () => {
  try {
    await getToken({
      interactive: true,
    });
    $("auth-banner").hidden = true;
    await getStore().ensureHeaders();
    await loadTrades(true);
    renderCurrentView();
  } catch {
    toast(
      "Google sign-in didn't finish. Allow pop-ups for this site and try again.",
      true,
    );
  }
});

addEventListener("popstate", () => {
  const view = viewFromHash();
  if (view && view !== currentView) {
    showView(view, {
      push: false,
    });
  }
});

addEventListener("online", onBackOnline);

addEventListener("tj:changed", updateSyncStatus);

setupPwa({
  remote: isRemote,
});

if (storageMode()) {
  startApp();
  const view = viewFromHash();
  if (view && view !== "log-trade") {
    showView(view, {
      push: false,
    });
  }
} else {
  $("setup-screen").hidden = false;
}
