/* Setup screen (first run) and the Settings sheet. */
import { TIMEZONES } from "../config.js";
import { S, saveConfig, clearConfig, getCopyTraders, setCopyTraders, sheet } from "../state.js";
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
  saveConfig({ ...(prev || {}), scriptUrl, imgbbKey });
  try {
    await busy($("setup-btn"), "Connecting", () => sheet().ensureHeaders());
    onConnected();
  } catch {
    if (prev) saveConfig(prev); else clearConfig();
    $("err-main").hidden = false;
    $("err-main").textContent = 'Could not connect. Check the Web App is deployed with access set to "Anyone" and that you copied the /exec URL.';
  }
}

/* --------------------------------------------------------------- settings */
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
  const scriptUrl = $("set-script-url").value.trim();
  if (!validUrl(scriptUrl)) { toast("That doesn't look like an Apps Script web app URL.", true); return; }
  const reconnect = scriptUrl !== S.cfg.scriptUrl;
  saveConfig({ ...S.cfg, scriptUrl, imgbbKey: $("set-imgbb-key").value.trim(), timezone: $("set-timezone").value });
  $("logo-sub").textContent = "Personal · " + tzLabel(S.cfg.timezone);
  closeSettings();
  toast("Settings saved.");
  if (reconnect) {
    setSyncStatus("loading", "Reconnecting...");
    sheet().ensureHeaders().then(onReconnect).catch(() => setSyncStatus("err", "Connection failed"));
  } else {
    onReconnect(false);
  }
}

export function initSettings({ connected, reconnect }) {
  onConnected = connected;
  /* Show the backend code without its header comment. */
  $("script-block").textContent = APPS_SCRIPT.replace(/^(\/\/.*\n)+\n?/, "").trim();

  $("s-script-url").addEventListener("input", checkSteps);
  $("s-imgbb-key").addEventListener("input", checkSteps);
  $("setup-form").addEventListener("submit", e => { e.preventDefault(); finishSetup(); });
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
      clearConfig();
      location.reload();
    }
  });
  document.addEventListener("keydown", e => { if (e.key === "Escape") closeSettings(); });
}
