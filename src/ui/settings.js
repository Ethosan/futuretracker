/* Setup screen (first run) and the Settings sheet. */
import { TIMEZONES } from "../config.js";
import { S, saveConfig, clearConfig, forgetDevice, forgetOffline, getCopyTraders, setCopyTraders, store, storageMode, pendingChanges } from "../state.js";
import { findOrCreateSheet, createGoogleStore, sheetUrl } from "../lib/google.js";
import { tradeToRow } from "../lib/rows.js";
import { LOCAL_TRADES_KEY } from "../lib/stores.js";
import { deviceStore, screenshotToDrive } from "./images.js";
import { googleEnabled, preloadGoogle, getToken, tokenExpired, signOut } from "../google-auth.js";
import { escapeHtml, plural, localISODate } from "../lib/format.js";
import { tradesToCsv } from "../lib/csv.js";
import { $, toast, setSyncStatus, busy } from "./dom.js";
import { renderCopyTraderTags } from "./form.js";
import APPS_SCRIPT from "../../apps-script/Code.gs?raw";

let lastFocus = null;
let onConnected = () => {};
let onReconnect = () => {};

export const tzLabel = tz => (tz ? TIMEZONES.find(t => t[1] === tz)?.[0]?.split(" (")[0] || tz : "Local time");
const validUrl = u => /^https:\/\/script\.google\.com\/\S+$/.test(u);

/* ------------------------------------------------------------------ setup */
function checkSteps() {
  $("sn1").classList.toggle("done", !!$("s-script-url").value.trim());
  $("sn2").classList.toggle("done", !!$("s-imgbb-key").value.trim());
}

async function finishSetup() {
  const scriptUrl = $("s-script-url").value.trim();
  const imgbbKey = $("s-imgbb-key").value.trim();
  $("err1").hidden = true;
  $("err-main").hidden = true;
  if (!validUrl(scriptUrl)) {
    $("err1").hidden = false;
    $("s-script-url").focus();
    return;
  }
  const prev = S.cfg;
  saveConfig({ ...sheetConfig(prev), scriptUrl, imgbbKey });
  try {
    await busy($("setup-btn"), "Connecting", () => store().ensureHeaders());
    onConnected();
  } catch {
    if (prev) saveConfig(prev); else clearConfig();
    $("err-main").hidden = false;
    $("err-main").textContent = 'Could not connect. Check the Web App is deployed with access set to "Anyone" and that you copied the /exec URL.';
  }
}

/* A config for sheet mode: whatever was set before, minus the device-only flag. */
function sheetConfig(cfg) {
  const rest = { ...(cfg || {}) };
  delete rest.mode;
  return rest;
}

/* No sheet: trades stay in this browser. */
function startLocal() {
  saveConfig({ mode: "local", imgbbKey: $("s-imgbb-key").value.trim() });
  onConnected();
}

/* Sign in with Google: find the journal's sheet in the user's Drive, or make one.
   getToken runs straight from the tap so the browser lets Google's popup open. */
async function startGoogle() {
  $("err-google").hidden = true;
  let found = false;
  try {
    await busy($("google-btn"), "Signing in", async () => {
      await getToken({ interactive: true });
      const { spreadsheetId, created } = await findOrCreateSheet({ getToken, onExpired: tokenExpired });
      saveConfig({ mode: "google", spreadsheetId, imgbbKey: $("s-imgbb-key").value.trim() });
      await store().ensureHeaders();
      found = !created;
    });
    onConnected();
    toast(found ? "Welcome back. Your journal is loaded." : "Done. Your journal is a private sheet in your Google Drive.");
  } catch (e) {
    if (storageMode() === "google") clearConfig();
    $("err-google").hidden = false;
    $("err-google").textContent = e.name === "NeedsSignIn"
      ? "Google sign-in didn't finish. If no window opened, allow pop-ups for this site and try again."
      : "Couldn't set up the sheet: " + e.message;
  }
}

/* Apps Script or device -> Sign in with Google, in one tap. Copies every trade
   (device screenshots go to Drive too), checks they all arrived, then
   switches. The old Apps Script URL and imgbb key are dropped from this
   device. Sign-in comes first so Google's pop-up opens from the tap. */
async function moveToGoogle() {
  const from = storageMode();
  const btn = $("move-btn");
  let moved = 0, total = 0;
  try {
    await busy(btn, "Signing in", async () => {
      const say = text => { btn.firstChild.textContent = text; };
      await getToken({ interactive: true });
      if (store().flush) {
        say("Sending offline changes");
        const left = (await store().flush()).left;
        if (left) throw new Error(`${left} offline change${left === 1 ? " is" : "s are"} still waiting. Go online and try again.`);
      }
      say("Reading your trades");
      const trades = await store().loadTrades();
      /* Never move a saved copy: it could be missing recent trades. */
      if (store().stale) throw new Error("Couldn't reach your current sheet, so nothing was moved. Check your connection and try again.");
      total = trades.length;
      /* A backup on this device before anything moves. */
      if (total) downloadCsv(trades, `trade-journal-backup-before-move-${localISODate()}.csv`);
      const { spreadsheetId } = await findOrCreateSheet({ getToken, onExpired: tokenExpired });
      const target = createGoogleStore({ spreadsheetId, getToken, onExpired: tokenExpired });
      await target.ensureHeaders();
      const have = new Set((await target.loadTrades()).map(t => t.id));
      const rows = [];
      for (const t of trades.filter(t => !have.has(t.id))) {
        say(`Copying ${rows.length + 1} of ${total}`);
        const row = tradeToRow(t);
        row.chart = await screenshotToDrive(row.chart);
        rows.push(row);
      }
      if (rows.length) await target.appendMany(rows);
      say("Checking");
      const arrived = new Set((await target.loadTrades()).map(t => t.id));
      if (!trades.every(t => arrived.has(t.id))) throw new Error("Some trades didn't arrive. Nothing was switched, so try again.");
      moved = rows.length;
      store().forget?.(); // the old sheet's offline copy and outbox
      saveConfig({ mode: "google", spreadsheetId, timezone: S.cfg.timezone || "" });
    });
  } catch (e) {
    toast(e.name === "NeedsSignIn" ? "Google sign-in didn't finish. Allow pop-ups for this site and try again." : "Move failed. " + e.message, true);
    return;
  }
  closeSettings();
  $("logo-sub").textContent = logoSub();
  onReconnect();
  if (from === "local" && total && confirm(`${total === 1 ? "Your trade is" : `All ${total} trades are`} now in your Google Drive. Delete the copy saved in this browser?`)) {
    localStorage.removeItem(LOCAL_TRADES_KEY);
    deviceStore().clear().catch(() => {});
  }
  showMoved({ from, moved, total });
}

function downloadCsv(trades, name) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([tradesToCsv(trades)], { type: "text/csv" }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/* After a move: a bar that stays until dismissed, with the last step. */
const MOVED_KEY = "tj_moved";
function showMoved(info) {
  if (info) localStorage.setItem(MOVED_KEY, JSON.stringify(info));
  let data = null;
  try { data = JSON.parse(localStorage.getItem(MOVED_KEY)); } catch { /* none */ }
  $("moved-banner").hidden = !data;
  if (!data) return;
  const already = data.total - data.moved;
  $("moved-text").textContent = `${plural(data.total, "trade")} now in your private Google sheet` +
    (already ? ` (${already} were already there).` : ".") +
    (data.from === "sheet" ? " Last step: in the Apps Script editor, Deploy, then Manage deployments, then Archive the web app. Your old sheet isn't changed." : "");
}

/* --------------------------------------------------------------- settings */
const MOVE_NOTE = {
  sheet: "Safer than the Apps Script: no public web app URL, and screenshots stay private. Your trades are copied over; the old sheet isn't changed.",
  local: "Keeps your trades in a private sheet in your Google Drive, so they're backed up and on every device. Screenshots come too.",
};
const MODE_NOTE = {
  google: 'Trades go to the "Trade Journal" sheet in your Google Drive. The journal can only see files it made.',
  demo: "This is the demo. Nothing here is saved, and it never connects to a Google Sheet.",
  local: "Trades are saved in this browser only, so anyone who uses this browser can see them. Back them up with Export CSV in the Trade Log. To move to a Google Sheet, paste its Apps Script URL below, then import the CSV.",
  sheet: "",
};

function renderCopyTraderList() {
  const cts = getCopyTraders();
  $("ct-list").innerHTML = cts.length
    ? cts.map(ct => `<div class="ct-row"><span>${escapeHtml(ct)}</span><button type="button" class="icon-btn danger" data-ct="${escapeHtml(ct)}" aria-label="Remove ${escapeHtml(ct)}">✕</button></div>`).join("")
    : '<p class="hint">No copy traders added yet.</p>';
}

function addCopyTrader() {
  const input = $("set-ct-new");
  const name = input.value.trim();
  if (!name) return;
  const cts = getCopyTraders();
  if (cts.some(c => c.toLowerCase() === name.toLowerCase())) { toast("Already in your list.", true); return; }
  setCopyTraders([...cts, name]);
  input.value = "";
  renderCopyTraderList();
  renderCopyTraderTags();
  toast(name + " added.");
}

export function openSettings() {
  lastFocus = document.activeElement;
  $("set-timezone").innerHTML = TIMEZONES.map(([label, val]) => `<option value="${val}"${(S.cfg.timezone || "") === val ? " selected" : ""}>${label}</option>`).join("");
  const mode = storageMode();
  $("set-mode-note").textContent = MODE_NOTE[mode];
  $("set-mode-note").hidden = !MODE_NOTE[mode];
  $("set-sheet-row").hidden = mode === "demo" || mode === "google";
  $("set-open-sheet-wrap").hidden = mode !== "google";
  $("move-google").hidden = !(googleEnabled() && MOVE_NOTE[mode]);
  $("move-note").textContent = MOVE_NOTE[mode] || "";
  if (mode === "google") $("set-open-sheet").href = sheetUrl(S.cfg.spreadsheetId);
  $("set-danger").hidden = mode === "demo";
  $("set-imgbb-section").hidden = mode !== "sheet";
  $("wipe-row").hidden = mode !== "local";
  $("reset-lbl").textContent = mode === "google" ? "Sign out" : "Reset connection";
  $("reset-btn").textContent = mode === "google" ? "Sign out" : "Reset";
  $("set-sheet-sub").textContent = mode === "local" ? "Optional. Switches to a sheet." : "Your web app endpoint";
  $("reset-sub").textContent = {
    local: "Clears the settings on this device. Trades saved on this device are kept.",
    google: "Signs out and clears the settings on this device. The sheet stays in your Drive.",
  }[mode] || "Clears the settings on this device. Your trades in Google Sheets are safe.";
  $("set-script-url").value = S.cfg.scriptUrl || "";
  $("set-imgbb-key").value = S.cfg.imgbbKey || "";
  renderCopyTraderList();
  $("settings-overlay").classList.add("open");
  $("settings-overlay").setAttribute("aria-hidden", "false");
  $("settings-body").scrollTop = 0;
  $("settings-close").focus();
}

export function closeSettings() {
  if (!$("settings-overlay").classList.contains("open")) return;
  $("settings-overlay").classList.remove("open");
  $("settings-overlay").setAttribute("aria-hidden", "true");
  lastFocus?.focus?.();
}

function saveSettings({ onReconnect }) {
  const mode = storageMode();
  const prefs = { imgbbKey: $("set-imgbb-key").value.trim(), timezone: $("set-timezone").value };
  const scriptUrl = $("set-script-url").value.trim();
  let reconnect = false;

  if (mode === "demo" || mode === "google" || (mode === "local" && !scriptUrl)) {
    saveConfig({ ...S.cfg, ...prefs });
  } else {
    if (!validUrl(scriptUrl)) { toast("That doesn't look like an Apps Script web app URL.", true); return; }
    if (mode === "local" && !confirm("Switch to this Google Sheet? Trades on this device stay here. Export a CSV first if you want to import them into the sheet.")) return;
    reconnect = scriptUrl !== S.cfg.scriptUrl || mode === "local";
    /* Offline changes and the saved copy belong to the old sheet. */
    if (reconnect && mode === "sheet") {
      const waiting = pendingChanges();
      if (waiting && !confirm(`${waiting} change${waiting === 1 ? " hasn't" : "s haven't"} reached your old sheet yet. Switching sheets drops ${waiting === 1 ? "it" : "them"}. Continue?`)) return;
      forgetOffline();
    }
    saveConfig({ ...sheetConfig(S.cfg), ...prefs, scriptUrl });
  }

  $("logo-sub").textContent = logoSub();
  closeSettings();
  toast("Settings saved.");
  if (reconnect) {
    setSyncStatus("loading", "Reconnecting...");
    store().ensureHeaders().then(onReconnect).catch(() => setSyncStatus("err", "Connection failed"));
  } else {
    onReconnect(false);
  }
}

/* Small line under the logo: where trades live and the display timezone. */
export function logoSub() {
  const where = { demo: "Demo", local: "This device", sheet: "Google Sheet", google: "Google Sheet" }[storageMode()] || "Personal";
  return where + " · " + tzLabel(S.cfg?.timezone);
}

export function initSettings({ connected, reconnect }) {
  onConnected = connected;
  onReconnect = reconnect;
  $("move-btn").addEventListener("click", moveToGoogle);
  $("moved-dismiss").addEventListener("click", () => { localStorage.removeItem(MOVED_KEY); showMoved(); });
  showMoved();
  /* Show the backend code without its header comment. */
  $("script-block").textContent = APPS_SCRIPT.replace(/^(\/\/.*\n)+\n?/, "").trim();

  $("s-script-url").addEventListener("input", checkSteps);
  $("s-imgbb-key").addEventListener("input", checkSteps);
  $("setup-form").addEventListener("submit", e => { e.preventDefault(); finishSetup(); });
  $("local-btn").addEventListener("click", startLocal);
  $("google-btn").addEventListener("click", startGoogle);
  if (googleEnabled()) {
    /* New users never leave the app: Google makes the sheet, screenshots need no
       key. The Apps Script setup (copy a script, deploy it, paste a URL, get an
       imgbb key elsewhere) is only offered when Google sign-in isn't set up.
       Existing Apps Script users keep working and can move in Settings. */
    $("google-start").hidden = false;
    $("script-path").hidden = true;
    $("script-details").hidden = true;
    preloadGoogle()?.catch(() => {});
  }
  $("script-path").addEventListener("click", () => { $("script-details").open = true; });
  $("copy-script-btn").addEventListener("click", async () => {
    try { await navigator.clipboard.writeText($("script-block").textContent.trim()); } catch { /* clipboard blocked */ }
    $("copy-script-btn").textContent = "copied!";
    setTimeout(() => { $("copy-script-btn").textContent = "copy"; }, 2000);
  });

  document.querySelectorAll("[data-open-settings]").forEach(b => b.addEventListener("click", openSettings));
  $("settings-close").addEventListener("click", closeSettings);
  $("settings-cancel").addEventListener("click", closeSettings);
  $("settings-overlay").addEventListener("click", e => { if (e.target === $("settings-overlay")) closeSettings(); });
  $("settings-save").addEventListener("click", () => saveSettings({ onReconnect: reconnect }));
  $("set-ct-add").addEventListener("click", addCopyTrader);
  $("set-ct-new").addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); addCopyTrader(); } });
  $("ct-list").addEventListener("click", e => {
    const b = e.target.closest("[data-ct]");
    if (!b) return;
    setCopyTraders(getCopyTraders().filter(c => c !== b.dataset.ct));
    renderCopyTraderList();
    renderCopyTraderTags();
  });
  $("reset-btn").addEventListener("click", () => {
    const google = storageMode() === "google";
    const waiting = pendingChanges();
    if (waiting && !confirm(`${waiting} change${waiting === 1 ? " hasn't" : "s haven't"} reached your sheet yet (made offline). They'll be lost. Continue anyway?`)) return;
    const msg = google
      ? "Sign out of Google on this device? Your journal stays in your Google Drive."
      : "This clears the stored connection from this device. Your trades in Google Sheets are safe. Continue?";
    if (!confirm(msg)) return;
    if (google) {
      signOut();
      forgetDevice(); // leave nothing behind on a shared computer
    } else {
      clearConfig();
    }
    location.replace(location.pathname);
  });
  $("wipe-btn").addEventListener("click", () => {
    if (!confirm("Delete every trade saved in this browser? This can't be undone.")) return;
    localStorage.removeItem(LOCAL_TRADES_KEY);
    deviceStore().clear().catch(() => {}).finally(() => location.reload());
  });
  document.addEventListener("keydown", e => { if (e.key === "Escape") closeSettings(); });
}
