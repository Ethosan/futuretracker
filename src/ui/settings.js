/* Setup screen (first run) and the Settings sheet. */
import { TIMEZONES } from "../config.js";
import { S, saveConfig, clearConfig, getCopyTraders, setCopyTraders, store, storageMode } from "../state.js";
import { findOrCreateSheet, sheetUrl } from "../lib/google.js";
import { googleEnabled, preloadGoogle, getToken, tokenExpired, signOut } from "../google-auth.js";
import { escapeHtml } from "../lib/format.js";
import { $, toast, setSyncStatus, busy } from "./dom.js";
import { renderCopyTraderTags } from "./form.js";
import APPS_SCRIPT from "../../apps-script/Code.gs?raw";

let lastFocus = null;
let onConnected = () => {};

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
  try {
    await busy($("google-btn"), "Signing in", async () => {
      await getToken({ interactive: true });
      const { spreadsheetId } = await findOrCreateSheet({ getToken, onExpired: tokenExpired });
      saveConfig({ mode: "google", spreadsheetId, imgbbKey: $("s-imgbb-key").value.trim() });
      await store().ensureHeaders();
    });
    onConnected();
  } catch (e) {
    if (storageMode() === "google") clearConfig();
    $("err-google").hidden = false;
    $("err-google").textContent = e.name === "NeedsSignIn"
      ? "Google sign-in didn't finish. If no window opened, allow pop-ups for this site and try again."
      : "Couldn't set up the sheet: " + e.message;
  }
}

/* --------------------------------------------------------------- settings */
const MODE_NOTE = {
  google: 'Trades go to the "Trade Journal" sheet in your Google Drive. The journal can only see files it made.',
  demo: "This is the demo. Nothing here is saved, and it never connects to a Google Sheet.",
  local: "Trades are saved in this browser only. Back them up with Export CSV in the Trade Log. To move to a Google Sheet, paste its Apps Script URL below, then import the CSV.",
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
  if (mode === "google") $("set-open-sheet").href = sheetUrl(S.cfg.spreadsheetId);
  $("set-danger").hidden = mode === "demo";
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
  /* Show the backend code without its header comment. */
  $("script-block").textContent = APPS_SCRIPT.replace(/^(\/\/.*\n)+\n?/, "").trim();

  $("s-script-url").addEventListener("input", checkSteps);
  $("s-imgbb-key").addEventListener("input", checkSteps);
  $("setup-form").addEventListener("submit", e => { e.preventDefault(); finishSetup(); });
  $("local-btn").addEventListener("click", startLocal);
  $("google-btn").addEventListener("click", startGoogle);
  if (googleEnabled()) {
    $("google-btn").hidden = false;
    document.querySelector(".paths").classList.add("four");
    $("script-path").querySelector(".path-title").textContent = "Use your own Apps Script";
    $("script-path").querySelector(".path-desc").textContent = "The older way. You set up the sheet and script yourself. About five minutes.";
    $("sheet-setup").textContent = "Use your own Apps Script";
    preloadGoogle()?.catch(() => {});
  }
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
    if (confirm("This clears the stored connection from this device. Your trades in Google Sheets are safe. Continue?")) {
      if (storageMode() === "google") signOut();
      clearConfig();
      location.reload();
    }
  });
  document.addEventListener("keydown", e => { if (e.key === "Escape") closeSettings(); });
}
