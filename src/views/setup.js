// First-run setup and the Settings panel: storage choice, moving to Google, copy traders, time zone.
import { TIMEZONES } from "../constants.js";
import { tradesToCsv } from "../csv.js";
import { esc, isoDate, plural } from "../format.js";
import { getToken, loadGsi, signOut, tokenExpired } from "../google/auth.js";
import {
  findOrCreateSpreadsheet,
  sheetUrl,
  sheetsStore,
} from "../google/sheets.js";
import { imageDb, moveImageToDrive } from "../screenshots.js";
import {
  clearSyncData,
  copyTraders,
  forgetAll,
  forgetConfig,
  getStore,
  pendingCount,
  saveConfig,
  saveCopyTraders,
  state,
  storageMode,
} from "../state.js";
import { LOCAL_TRADES_KEY } from "../stores/local.js";
import { tradeToRow } from "../trade.js";
import { $, setSync, toast, withSpinner } from "../ui.js";
import { renderCopyTraderTags } from "./log-trade.js";
import APPS_SCRIPT_SOURCE from "../apps-script.gs?raw";

let settingsReturnFocus = null;

let onConnected = () => {};

let onReconnect = () => {};

const timezoneLabel = (zone) =>
  zone
    ? TIMEZONES.find((option) => option[1] === zone)?.[0]?.split(" (")[0] ||
      zone
    : "Local time";

const isScriptUrl = (url) => /^https:\/\/script\.google\.com\/\S+$/.test(url);

function updateSetupSteps() {
  $("sn1").classList.toggle("done", !!$("s-script-url").value.trim());
  $("sn2").classList.toggle("done", !!$("s-imgbb-key").value.trim());
}

async function connectScript() {
  const url = $("s-script-url").value.trim(),
    imgbbKey = $("s-imgbb-key").value.trim();
  $("err1").hidden = true;
  $("err-main").hidden = true;
  if (!isScriptUrl(url)) {
    $("err1").hidden = false;
    $("s-script-url").focus();
    return;
  }
  const previous = state.cfg;
  saveConfig({
    ...withoutMode(previous),
    scriptUrl: url,
    imgbbKey,
  });
  try {
    await withSpinner($("setup-btn"), "Connecting", () =>
      getStore().ensureHeaders(),
    );
    onConnected();
  } catch {
    if (previous) {
      saveConfig(previous);
    } else {
      forgetConfig();
    }
    $("err-main").hidden = false;
    $("err-main").textContent =
      'Could not connect. Check the Web App is deployed with access set to "Anyone" and that you copied the /exec URL.';
  }
}

function withoutMode(cfg) {
  const copy = {
    ...(cfg || {}),
  };
  delete copy.mode;
  return copy;
}

function useThisDevice() {
  saveConfig({
    mode: "local",
    imgbbKey: $("s-imgbb-key").value.trim(),
  });
  onConnected();
}

async function connectGoogle() {
  $("err-google").hidden = true;
  let returning = false;
  try {
    await withSpinner($("google-btn"), "Signing in", async () => {
      await getToken({
        interactive: true,
      });
      const { spreadsheetId, created } = await findOrCreateSpreadsheet({
        getToken,
        onExpired: tokenExpired,
      });
      saveConfig({
        mode: "google",
        spreadsheetId,
        imgbbKey: $("s-imgbb-key").value.trim(),
      });
      await getStore().ensureHeaders();
      returning = !created;
    });
    onConnected();
    toast(
      returning
        ? "Welcome back. Your journal is loaded."
        : "Done. Your journal is a private sheet in your Google Drive.",
    );
  } catch (err) {
    if (storageMode() === "google") {
      forgetConfig();
    }
    $("err-google").hidden = false;
    $("err-google").textContent =
      err.name === "NeedsSignIn"
        ? "Google sign-in didn't finish. If no window opened, allow pop-ups for this site and try again."
        : "Couldn't set up the sheet: " + err.message;
  }
}

async function moveToGoogle() {
  const from = storageMode(),
    btn = $("move-btn");
  let moved = 0,
    total = 0;
  try {
    await withSpinner(btn, "Signing in", async () => {
      const status = (text) => {
        btn.firstChild.textContent = text;
      };
      await getToken({
        interactive: true,
      });
      if (getStore().flush) {
        status("Sending offline changes");
        const left = (await getStore().flush()).left;
        if (left) {
          throw new Error(
            `${left} offline change${left === 1 ? " is" : "s are"} still waiting. Go online and try again.`,
          );
        }
      }
      status("Reading your trades");
      const trades = await getStore().loadTrades();
      if (getStore().stale) {
        throw new Error(
          "Couldn't reach your current sheet, so nothing was moved. Check your connection and try again.",
        );
      }
      total = trades.length;
      if (total) {
        downloadCsv(
          trades,
          `trade-journal-backup-before-move-${isoDate()}.csv`,
        );
      }
      const { spreadsheetId } = await findOrCreateSpreadsheet({
          getToken,
          onExpired: tokenExpired,
        }),
        target = sheetsStore({
          spreadsheetId,
          getToken,
          onExpired: tokenExpired,
        });
      await target.ensureHeaders();
      const already = new Set(
          (await target.loadTrades()).map((trade) => trade.id),
        ),
        copied = [];
      for (const trade of trades.filter((trade) => !already.has(trade.id))) {
        status(`Copying ${copied.length + 1} of ${total}`);
        const row = tradeToRow(trade);
        row.chart = await moveImageToDrive(row.chart);
        copied.push(row);
      }
      if (copied.length) {
        await target.appendMany(copied);
      }
      status("Checking");
      const arrived = new Set(
        (await target.loadTrades()).map((trade) => trade.id),
      );
      if (!trades.every((trade) => arrived.has(trade.id))) {
        throw new Error(
          "Some trades didn't arrive. Nothing was switched, so try again.",
        );
      }
      moved = copied.length;
      getStore().forget?.();
      saveConfig({
        mode: "google",
        spreadsheetId,
        timezone: state.cfg.timezone || "",
      });
    });
  } catch (err) {
    toast(
      err.name === "NeedsSignIn"
        ? "Google sign-in didn't finish. Allow pop-ups for this site and try again."
        : "Move failed. " + err.message,
      true,
    );
    return;
  }
  closeSettings();
  $("logo-sub").textContent = modeLabel();
  onReconnect();
  if (
    from === "local" &&
    total &&
    confirm(
      `${total === 1 ? "Your trade is" : `All ${total} trades are`} now in your Google Drive. Delete the copy saved in this browser?`,
    )
  ) {
    localStorage.removeItem(LOCAL_TRADES_KEY);
    imageDb()
      .clear()
      .catch(() => {});
  }
  showMovedBanner({
    from,
    moved,
    total,
  });
}

function downloadCsv(trades, filename) {
  const link = document.createElement("a");
  link.href = URL.createObjectURL(
    new Blob([tradesToCsv(trades)], {
      type: "text/csv",
    }),
  );
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}

const MOVED_KEY = "tj_moved";

function showMovedBanner(info) {
  if (info) {
    localStorage.setItem(MOVED_KEY, JSON.stringify(info));
  }
  let moved = null;
  try {
    moved = JSON.parse(localStorage.getItem(MOVED_KEY));
  } catch {}
  $("moved-banner").hidden = !moved;
  if (!moved) {
    return;
  }
  const already = moved.total - moved.moved;
  $("moved-text").textContent =
    `${plural(moved.total, "trade")} now in your private Google sheet` +
    (already ? ` (${already} were already there).` : ".") +
    (moved.from === "sheet"
      ? " Last step: in the Apps Script editor, Deploy, then Manage deployments, then Archive the web app. Your old sheet isn't changed."
      : "");
}

const MOVE_NOTES = {
  sheet:
    "Safer than the Apps Script: no public web app URL, and screenshots stay private. Your trades are copied over; the old sheet isn't changed.",
  local:
    "Keeps your trades in a private sheet in your Google Drive, so they're backed up and on every device. Screenshots come too.",
};

const MODE_NOTES = {
  google:
    'Trades go to the "Trade Journal" sheet in your Google Drive. The journal can only see files it made.',
  demo: "This is the demo. Nothing here is saved, and it never connects to a Google Sheet.",
  local:
    "Trades are saved in this browser only, so anyone who uses this browser can see them. Back them up with Export CSV in the Trade Log. To move to a Google Sheet, paste its Apps Script URL below, then import the CSV.",
  sheet: "",
};

function renderCopyTraderList() {
  const names = copyTraders();
  $("ct-list").innerHTML = names.length
    ? names
        .map(
          (name) =>
            `<div class="ct-row"><span>${esc(name)}</span><button type="button" class="icon-btn danger" data-ct="${esc(name)}" aria-label="Remove ${esc(name)}">✕</button></div>`,
        )
        .join("")
    : '<p class="hint">No copy traders added yet.</p>';
}

function addCopyTrader() {
  const input = $("set-ct-new"),
    name = input.value.trim();
  if (!name) {
    return;
  }
  const names = copyTraders();
  if (names.some((existing) => existing.toLowerCase() === name.toLowerCase())) {
    toast("Already in your list.", true);
    return;
  }
  saveCopyTraders([...names, name]);
  input.value = "";
  renderCopyTraderList();
  renderCopyTraderTags();
  toast(name + " added.");
}

function openSettings() {
  settingsReturnFocus = document.activeElement;
  $("set-timezone").innerHTML = TIMEZONES.map(
    ([label, zone]) =>
      `<option value="${zone}"${(state.cfg.timezone || "") === zone ? " selected" : ""}>${label}</option>`,
  ).join("");
  const mode = storageMode();
  $("set-mode-note").textContent = MODE_NOTES[mode];
  $("set-mode-note").hidden = !MODE_NOTES[mode];
  $("set-sheet-row").hidden = mode === "demo" || mode === "google";
  $("set-open-sheet-wrap").hidden = mode !== "google";
  $("move-google").hidden = !MOVE_NOTES[mode];
  $("move-note").textContent = MOVE_NOTES[mode] || "";
  if (mode === "google") {
    $("set-open-sheet").href = sheetUrl(state.cfg.spreadsheetId);
  }
  $("set-danger").hidden = mode === "demo";
  $("set-imgbb-section").hidden = mode !== "sheet";
  $("wipe-row").hidden = mode !== "local";
  $("reset-lbl").textContent =
    mode === "google" ? "Sign out" : "Reset connection";
  $("reset-btn").textContent = mode === "google" ? "Sign out" : "Reset";
  $("set-sheet-sub").textContent =
    mode === "local"
      ? "Optional. Switches to a sheet."
      : "Your web app endpoint";
  $("reset-sub").textContent =
    {
      local:
        "Clears the settings on this device. Trades saved on this device are kept.",
      google:
        "Signs out and clears the settings on this device. The sheet stays in your Drive.",
    }[mode] ||
    "Clears the settings on this device. Your trades in Google Sheets are safe.";
  $("set-script-url").value = state.cfg.scriptUrl || "";
  $("set-imgbb-key").value = state.cfg.imgbbKey || "";
  renderCopyTraderList();
  $("settings-overlay").classList.add("open");
  $("settings-overlay").setAttribute("aria-hidden", "false");
  $("settings-body").scrollTop = 0;
  $("settings-close").focus();
}

function closeSettings() {
  if ($("settings-overlay").classList.contains("open")) {
    $("settings-overlay").classList.remove("open");
    $("settings-overlay").setAttribute("aria-hidden", "true");
    settingsReturnFocus?.focus?.();
  }
}

function saveSettings({ onReconnect }) {
  const mode = storageMode(),
    changes = {
      imgbbKey: $("set-imgbb-key").value.trim(),
      timezone: $("set-timezone").value,
    },
    scriptUrl = $("set-script-url").value.trim();
  let reconnect = false;
  if (
    mode === "demo" ||
    mode === "google" ||
    (mode === "local" && !scriptUrl)
  ) {
    saveConfig({
      ...state.cfg,
      ...changes,
    });
  } else {
    if (!isScriptUrl(scriptUrl)) {
      toast("That doesn't look like an Apps Script web app URL.", true);
      return;
    }
    if (
      mode === "local" &&
      !confirm(
        "Switch to this Google Sheet? Trades on this device stay here. Export a CSV first if you want to import them into the sheet.",
      )
    ) {
      return;
    }
    reconnect = scriptUrl !== state.cfg.scriptUrl || mode === "local";
    if (reconnect && mode === "sheet") {
      const pending = pendingCount();
      if (
        pending &&
        !confirm(
          `${pending} change${pending === 1 ? " hasn't" : "s haven't"} reached your old sheet yet. Switching sheets drops ${pending === 1 ? "it" : "them"}. Continue?`,
        )
      ) {
        return;
      }
      clearSyncData();
    }
    saveConfig({
      ...withoutMode(state.cfg),
      ...changes,
      scriptUrl,
    });
  }
  $("logo-sub").textContent = modeLabel();
  closeSettings();
  toast("Settings saved.");
  if (reconnect) {
    setSync("loading", "Reconnecting...");
    getStore()
      .ensureHeaders()
      .then(onReconnect)
      .catch(() => setSync("err", "Connection failed"));
  } else {
    onReconnect(false);
  }
}

export function modeLabel() {
  return (
    ({
      demo: "Demo",
      local: "This device",
      sheet: "Google Sheet",
      google: "Google Sheet",
    }[storageMode()] || "Personal") +
    " · " +
    timezoneLabel(state.cfg?.timezone)
  );
}

export function setupConnection({ connected, reconnect }) {
  onConnected = connected;
  onReconnect = reconnect;
  $("move-btn").addEventListener("click", moveToGoogle);
  $("moved-dismiss").addEventListener("click", () => {
    localStorage.removeItem(MOVED_KEY);
    showMovedBanner();
  });
  showMovedBanner();
  $("script-block").textContent = APPS_SCRIPT_SOURCE.replace(
    /^(\/\/.*\n)+\n?/,
    "",
  ).trim();
  $("s-script-url").addEventListener("input", updateSetupSteps);
  $("s-imgbb-key").addEventListener("input", updateSetupSteps);
  $("setup-form").addEventListener("submit", (event) => {
    event.preventDefault();
    connectScript();
  });
  $("local-btn").addEventListener("click", useThisDevice);
  $("google-btn").addEventListener("click", connectGoogle);
  $("google-start").hidden = false;
  $("script-path").hidden = true;
  $("script-details").hidden = true;
  loadGsi()?.catch(() => {});
  $("script-path").addEventListener("click", () => {
    $("script-details").open = true;
  });
  $("copy-script-btn").addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText($("script-block").textContent.trim());
    } catch {}
    $("copy-script-btn").textContent = "copied!";
    setTimeout(() => {
      $("copy-script-btn").textContent = "copy";
    }, 2000);
  });
  document
    .querySelectorAll("[data-open-settings]")
    .forEach((btn) => btn.addEventListener("click", openSettings));
  $("settings-close").addEventListener("click", closeSettings);
  $("settings-cancel").addEventListener("click", closeSettings);
  $("settings-overlay").addEventListener("click", (event) => {
    if (event.target === $("settings-overlay")) {
      closeSettings();
    }
  });
  $("settings-save").addEventListener("click", () =>
    saveSettings({
      onReconnect: reconnect,
    }),
  );
  $("set-ct-add").addEventListener("click", addCopyTrader);
  $("set-ct-new").addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      addCopyTrader();
    }
  });
  $("ct-list").addEventListener("click", (event) => {
    const btn = event.target.closest("[data-ct]");
    if (btn) {
      saveCopyTraders(copyTraders().filter((name) => name !== btn.dataset.ct));
      renderCopyTraderList();
      renderCopyTraderTags();
    }
  });
  $("reset-btn").addEventListener("click", () => {
    const isGoogle = storageMode() === "google",
      pending = pendingCount();
    if (!(
      (pending &&
        !confirm(
          `${pending} change${pending === 1 ? " hasn't" : "s haven't"} reached your sheet yet (made offline). They'll be lost. Continue anyway?`,
        )) ||
      !confirm(
        isGoogle
          ? "Sign out of Google on this device? Your journal stays in your Google Drive."
          : "This clears the stored connection from this device. Your trades in Google Sheets are safe. Continue?",
      )
    )) {
      if (isGoogle) {
        signOut();
        forgetAll();
      } else {
        forgetConfig();
      }
      location.replace(location.pathname);
    }
  });
  $("wipe-btn").addEventListener("click", () => {
    if (
      confirm("Delete every trade saved in this browser? This can't be undone.")
    ) {
      localStorage.removeItem(LOCAL_TRADES_KEY);
      imageDb()
        .clear()
        .catch(() => {})
        .finally(() => location.reload());
    }
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeSettings();
    }
  });
}
