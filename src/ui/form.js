/* Log Trade form: entry/exit legs, live P&L maths, tags, save and edit. */
import { STRATEGIES, MISTAKES, OUTCOMES } from "../config.js";
import { S, store, storageMode, getCopyTraders, findTrade } from "../state.js";
import { computeTrade, encodeNotesWithLegs, validateTrade, outcomeFor } from "../lib/calc.js";
import { normalizeTrade } from "../lib/rows.js";
import { escapeHtml, localISODate, splitStrats } from "../lib/format.js";
import { $, toast, setSyncStatus, busy, pressGroup, pressedValues } from "./dom.js";
import { uploadTarget, uploadPrivate, showScreenshot, describeRef } from "./images.js";

let onSaved = () => {};

/* Status line text after a successful save or load. */
export const syncLabel = () => ({ demo: "Demo data, not saved", local: "Saved on this device" }[storageMode()] || "Synced");

/* Plain fields saved to the sheet as typed, keyed by trade column. */
const FIELDS = {
  date: "f-date", entryTime: "f-entryTime", instrument: "f-instrument", account: "f-account",
  dir: "f-dir", session: "f-session", marketCondition: "f-condition", contracts: "f-contracts",
  stop: "f-stop", target: "f-target", catalyst: "f-catalyst", thesis: "f-thesis", emo: "f-emo",
  exitTime: "f-exitTime", managedStop: "f-managedStop", commission: "f-commission",
  post: "f-post", right: "f-right", lesson: "f-lesson", chart: "f-chart",
};
const DERIVED = ["f-rr", "f-ticksRisk", "f-maxRisk", "f-grossPnl", "f-netPnl", "f-r"];

/* ------------------------------------------------------------------- legs */
function legRow(type, price = "", contracts = "") {
  const row = document.createElement("div");
  row.className = "leg-row";
  row.innerHTML = `
    <input class="leg-price" type="number" min="0" step="0.01" inputmode="decimal" placeholder="Price" aria-label="${type} price" value="${escapeHtml(price)}">
    <span class="leg-x" aria-hidden="true">×</span>
    <input class="leg-contracts" type="number" min="1" step="1" inputmode="numeric" placeholder="Lots" aria-label="${type} contracts" value="${escapeHtml(contracts)}">
    <button type="button" class="leg-del" data-action="del-leg" aria-label="Remove ${type} leg">✕</button>`;
  return row;
}

function addLeg(type, price, contracts, focus = true) {
  const row = legRow(type, price, contracts);
  $(type + "-legs").appendChild(row);
  recalc();
  if (focus) row.querySelector(".leg-price").focus();
}

/* A leg with a price but no lots uses the Contracts field if you typed one
   (or 1), so a one-leg trade only needs the price. Once typed, Contracts is
   yours: recalc stops overwriting it, so the two can't feed each other. */
let contractsTyped = false;
function readLegs(type) {
  const fallback = (contractsTyped && parseInt($("f-contracts").value, 10)) || 1;
  return [...document.querySelectorAll(`#${type}-legs .leg-row`)]
    .map(r => ({ price: parseFloat(r.querySelector(".leg-price").value), contracts: parseInt(r.querySelector(".leg-contracts").value, 10) || fallback }))
    .filter(l => l.price > 0 && l.contracts > 0);
}

function showAgg(type, legs) {
  const el = $(type + "-agg");
  if (legs.length <= 1) { el.hidden = true; return; }
  const total = legs.reduce((a, l) => a + l.contracts, 0);
  const avg = legs.reduce((a, l) => a + l.price * l.contracts, 0) / total;
  el.hidden = false;
  el.innerHTML = `Avg ${type}: <b>${avg.toFixed(2)}</b> · Total: <b>${total} contract${total !== 1 ? "s" : ""}</b>`;
}

/* ------------------------------------------------------------------- maths */
let last = null;

function setDerived(id, text, tone) {
  const el = $(id);
  el.value = text;
  el.classList.toggle("pos", tone === "pos");
  el.classList.toggle("neg", tone === "neg");
}

export function recalc() {
  const entryLegs = readLegs("entry"), exitLegs = readLegs("exit");
  showAgg("entry", entryLegs);
  showAgg("exit", exitLegs);
  const r = computeTrade({
    entryLegs, exitLegs,
    contracts: $("f-contracts").value,
    stop: parseFloat($("f-stop").value),
    target: parseFloat($("f-target").value),
    instrument: $("f-instrument").value,
    dir: $("f-dir").value,
    commission: $("f-commission").value,
  });
  last = r;
  if (entryLegs.length && !contractsTyped) $("f-contracts").value = r.contracts;
  setDerived("f-ticksRisk", r.ticks != null ? r.ticks.toFixed(2) + " pts" : "");
  setDerived("f-maxRisk", r.maxRisk != null ? "$" + r.maxRisk.toFixed(2) : "");
  setDerived("f-rr", r.rr != null ? "1 : " + r.rr.toFixed(2) : "");
  const tone = v => (v == null ? null : v >= 0 ? "pos" : "neg");
  setDerived("f-grossPnl", r.gross != null ? r.gross.toFixed(2) : "", tone(r.gross));
  setDerived("f-netPnl", r.net != null ? r.net.toFixed(2) : "", tone(r.net));
  setDerived("f-r", r.r != null ? (r.r >= 0 ? "+" : "") + r.r.toFixed(2) + "R" : "", tone(r.r));

  /* Suggest an outcome from net P&L if none is picked yet. */
  if (r.net != null && !pressedValues($("outcome-btns")).length) {
    $("outcome-btns").dataset.suggest = r.net > 0 ? "W" : r.net < 0 ? "L" : "BE";
  } else {
    delete $("outcome-btns").dataset.suggest;
  }
}

/* -------------------------------------------------------------------- tags */
function tagButtons(container, values) {
  container.innerHTML = values.map(v => `<button type="button" class="tag" data-value="${escapeHtml(v)}" aria-pressed="false">${escapeHtml(v)}</button>`).join("");
}

export function renderCopyTraderTags() {
  const cts = getCopyTraders();
  const box = $("ct-tags");
  if (!cts.length) {
    box.innerHTML = '<span class="hint">No copy traders yet. Add them in Settings.</span>';
    return;
  }
  const current = pressedValues(box)[0];
  tagButtons(box, cts);
  if (current) pressGroup(box, current);
}

/* --------------------------------------------------------------- read/save */
function readForm(id) {
  const row = { id };
  for (const [col, el] of Object.entries(FIELDS)) row[col] = $(el).value;
  if (!row.date) row.date = localISODate();
  const strats = pressedValues($("strat-tags"));
  const custom = $("f-strat-custom").value.trim();
  if (custom) strats.push(custom);
  row.strat = strats.join(" | ");
  row.ct = pressedValues($("ct-tags"))[0] || "";
  row.conf = pressedValues($("conf-btns"))[0] || "";
  /* Not picked: take it from the P&L, so every trade counts in the win rate. */
  row.outcome = pressedValues($("outcome-btns"))[0] || (last?.net != null ? outcomeFor(last.net) : "");
  row.mistake = pressedValues($("mistake-tags"))[0] || "";
  row.entry = last?.entry ? last.entry.toFixed(2) : "";
  row.exit = last?.exit ? last.exit.toFixed(2) : "";
  row.contracts = $("f-contracts").value;
  row.rr = $("f-rr").value;
  row.ticksRisk = $("f-ticksRisk").value;
  row.grossPnl = $("f-grossPnl").value;
  row.netPnl = $("f-netPnl").value;
  row.notes = encodeNotesWithLegs($("f-notes").value, readLegs("entry"), readLegs("exit"));
  return row;
}

/* Show what's missing next to the Save button and on the fields themselves. */
const inputOf = el => (el.matches("input, select") ? el : el.querySelector("input"));
function showErrors(errors) {
  document.querySelectorAll("#trade-form [aria-invalid]").forEach(el => el.removeAttribute("aria-invalid"));
  const box = $("form-errors");
  box.hidden = !errors.length;
  box.innerHTML = errors.map(e => `<li>${escapeHtml(e.message)}</li>`).join("");
  for (const e of errors) inputOf($(e.field))?.setAttribute("aria-invalid", "true");
  if (errors.length) inputOf($(errors[0].field))?.focus();
}

async function submit() {
  recalc();
  const errors = validateTrade({
    instrument: $("f-instrument").value,
    dir: $("f-dir").value,
    entryLegs: readLegs("entry"),
    exitLegs: readLegs("exit"),
    stop: parseFloat($("f-stop").value),
    target: parseFloat($("f-target").value),
  });
  showErrors(errors);
  if (errors.length) return;
  const editing = S.editingId;
  const row = readForm(editing || Date.now().toString());
  setSyncStatus("loading", editing ? "Updating..." : "Saving...");
  try {
    const res = await busy($("save-btn"), editing ? "Updating" : "Saving", () => (editing ? store().update(row) : store().append(row)));
    const queued = res?.status === "queued";
    const trade = { ...normalizeTrade(row), ...(queued ? { pending: true } : {}) };
    const idx = S.trades.findIndex(t => t.id === trade.id);
    if (idx >= 0) S.trades[idx] = trade; else S.trades.push(trade);
    const where = { demo: " Demo, so this tab only.", local: " On this device." }[storageMode()] || "";
    toast(queued
      ? (editing ? "Updated here." : "Saved here.") + " It goes to your sheet when you're back online."
      : (editing ? "Trade updated." : "Trade saved.") + where);
    if (queued) dispatchEvent(new Event("tj:changed")); else setSyncStatus("ok", syncLabel());
    exitEditMode();
    onSaved();
  } catch (e) {
    toast((editing ? "Update" : "Save") + " failed. " + (e.message === "Timeout" ? "Check your connection." : e.message), true);
    setSyncStatus("err", editing ? "Update failed" : "Save failed");
  }
}

export function clearForm() {
  showErrors([]);
  contractsTyped = false;
  for (const el of [...Object.values(FIELDS), ...DERIVED, "f-strat-custom", "f-notes"]) {
    $(el).value = "";
    $(el).classList.remove("pos", "neg");
  }
  for (const g of ["strat-tags", "ct-tags", "mistake-tags", "conf-btns", "outcome-btns"]) pressGroup($(g), [], { multi: true });
  $("f-date").value = localISODate();
  resetImage();
  $("entry-legs").innerHTML = "";
  $("exit-legs").innerHTML = "";
  addLeg("entry", "", "", false);
  addLeg("exit", "", "", false);
}

export const cancelEdit = () => exitEditMode();

function exitEditMode() {
  S.editingId = null;
  $("save-btn").textContent = "Save trade";
  $("cancel-edit-btn").hidden = true;
  $("edit-mode-banner").hidden = true;
  clearForm();
}

/* Fill the form from a saved trade. */
export function editTrade(id) {
  const t = findTrade(id);
  if (!t) return;
  clearForm();
  for (const [col, el] of Object.entries(FIELDS)) $(el).value = t[col] || "";
  $("f-notes").value = t.notes || "";

  $("entry-legs").innerHTML = "";
  $("exit-legs").innerHTML = "";
  const legs = t.legs && t.legs.entry && t.legs.exit ? t.legs : null;
  if (legs) {
    legs.entry.forEach(l => addLeg("entry", l.price, l.contracts, false));
    legs.exit.forEach(l => addLeg("exit", l.price, l.contracts, false));
  } else {
    addLeg("entry", t.entry, t.contracts, false);
    addLeg("exit", t.exit, t.contracts, false);
  }

  const known = splitStrats(t.strat);
  pressGroup($("strat-tags"), known, { multi: true });
  $("f-strat-custom").value = known.filter(s => !STRATEGIES.includes(s)).join(" | ");
  pressGroup($("ct-tags"), t.ct || "");
  pressGroup($("mistake-tags"), t.mistake || "");
  pressGroup($("conf-btns"), String(t.conf || ""));
  pressGroup($("outcome-btns"), t.outcome || "");
  if (t.chart) showImage(t.chart);
  recalc();

  S.editingId = t.id;
  $("save-btn").textContent = "Update trade";
  $("cancel-edit-btn").hidden = false;
  $("edit-mode-banner").hidden = false;
  toast("Editing. Make changes and press Update trade.");
}

/* -------------------------------------------------------------- screenshot */
function resetImage() {
  $("img-preview-wrap").hidden = true;
  $("img-uploading").hidden = true;
  const label = $("img-drop-label");
  label.hidden = false;
  label.className = "img-label";
  label.innerHTML = "Click, drag &amp; drop, or <kbd>Ctrl+V</kbd> to paste a screenshot";
}

function showImage(url) {
  const wrap = $("img-preview-wrap");
  let img = $("img-preview");
  if (!img) {
    img = document.createElement("img");
    img.id = "img-preview";
    img.alt = "Screenshot preview";
    wrap.prepend(img);
  }
  img.hidden = false;
  showScreenshot(img, url);
  $("img-link-display").textContent = describeRef(url);
  $("img-preview-wrap").hidden = false;
}

function imageMessage(text, cls) {
  const label = $("img-drop-label");
  label.hidden = false;
  label.textContent = text;
  label.className = "img-label " + cls;
}

/* Google Drive or this device: private, no key needed. */
async function uploadPrivately(file) {
  $("img-drop-label").hidden = true;
  $("img-uploading").hidden = false;
  $("img-preview-wrap").hidden = true;
  try {
    const ref = await uploadPrivate(file);
    $("f-chart").value = ref;
    $("img-uploading").hidden = true;
    showImage(ref);
  } catch (e) {
    $("img-uploading").hidden = true;
    imageMessage(e.name === "NeedsSignIn" ? "Sign in with Google again, then add the screenshot." : "Couldn't save the screenshot. Try again.", "err");
  }
}

async function uploadImg(file) {
  if (!file) return;
  if (uploadTarget() !== "imgbb") { uploadPrivately(file); return; }
  $("img-drop-label").hidden = true;
  $("img-uploading").hidden = false;
  $("img-preview-wrap").hidden = true;
  const fd = new FormData();
  fd.append("image", file);
  try {
    const res = await fetch(`https://api.imgbb.com/1/upload?key=${encodeURIComponent(S.cfg.imgbbKey)}`, { method: "POST", body: fd });
    const data = await res.json();
    if (!data.success) throw new Error();
    $("f-chart").value = data.data.url;
    $("img-uploading").hidden = true;
    showImage(data.data.url);
  } catch {
    $("img-uploading").hidden = true;
    imageMessage("Upload failed. Check the imgbb key or paste a URL below.", "err");
  }
}

const imageFromClipboard = e => [...(e.clipboardData?.items || [])].find(i => i.type.startsWith("image/"))?.getAsFile() || null;

/* -------------------------------------------------------------------- init */
export function initForm({ afterSave }) {
  onSaved = afterSave;

  tagButtons($("strat-tags"), STRATEGIES);
  tagButtons($("mistake-tags"), MISTAKES);
  $("conf-btns").innerHTML = [1, 2, 3, 4, 5].map(n => `<button type="button" class="conf-btn" data-value="${n}" aria-pressed="false" aria-label="Confidence ${n}">${n}</button>`).join("");
  $("outcome-btns").innerHTML = OUTCOMES.map(o => `<button type="button" class="out-btn ${o.cls}" data-value="${o.value}" aria-pressed="false">${o.label}</button>`).join("");
  renderCopyTraderTags();

  /* Multi-select strategies; single-select everything else (tap again to clear). */
  $("strat-tags").addEventListener("click", e => {
    const b = e.target.closest("button[data-value]");
    if (b) b.setAttribute("aria-pressed", String(b.getAttribute("aria-pressed") !== "true"));
  });
  for (const id of ["ct-tags", "mistake-tags", "conf-btns", "outcome-btns"]) {
    $(id).addEventListener("click", e => {
      const b = e.target.closest("button[data-value]");
      if (!b) return;
      const wasOn = b.getAttribute("aria-pressed") === "true";
      pressGroup($(id), wasOn ? "" : b.dataset.value);
      if (id === "outcome-btns") recalc();
    });
  }

  $("f-contracts").addEventListener("input", () => { contractsTyped = $("f-contracts").value !== ""; });
  for (const id of ["f-instrument", "f-dir", "f-contracts", "f-stop", "f-target", "f-commission"]) {
    $(id).addEventListener("input", recalc);
  }
  for (const type of ["entry", "exit"]) {
    const box = $(type + "-legs");
    box.addEventListener("input", recalc);
    box.addEventListener("click", e => {
      if (e.target.closest('[data-action="del-leg"]')) {
        e.target.closest(".leg-row").remove();
        recalc();
      }
    });
    $("add-" + type + "-leg").addEventListener("click", () => addLeg(type));
  }

  $("trade-form").addEventListener("submit", e => { e.preventDefault(); submit(); });
  $("clear-btn").addEventListener("click", () => { if (S.editingId) exitEditMode(); else clearForm(); });
  $("cancel-edit-btn").addEventListener("click", exitEditMode);

  /* Screenshot: click, keyboard, drag and drop, or paste anywhere. */
  const zone = $("img-drop-zone");
  zone.addEventListener("click", () => $("img-file-input").click());
  zone.addEventListener("keydown", e => {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); $("img-file-input").click(); }
  });
  zone.addEventListener("dragover", e => { e.preventDefault(); zone.classList.add("over"); });
  zone.addEventListener("dragleave", () => zone.classList.remove("over"));
  zone.addEventListener("drop", e => {
    e.preventDefault();
    zone.classList.remove("over");
    const f = e.dataTransfer.files[0];
    if (f && f.type.startsWith("image/")) uploadImg(f);
  });
  $("img-file-input").addEventListener("change", e => uploadImg(e.target.files[0]));
  $("f-chart").addEventListener("change", e => { if (e.target.value) showImage(e.target.value); else resetImage(); });
  document.addEventListener("paste", e => {
    if (!$("view-log-trade").classList.contains("active")) return;
    const file = imageFromClipboard(e);
    if (!file) return;
    e.preventDefault();
    uploadImg(file);
  });

  clearForm();
}
