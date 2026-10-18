// Log Trade screen: the trade form, entry and exit legs, live P&L, screenshots and saving.
import { MISTAKES, OUTCOMES, STRATEGIES } from "../constants.js";
import { esc, isoDate, splitList } from "../format.js";
import {
  imageHost,
  imageLabel,
  showImage,
  uploadImage,
} from "../screenshots.js";
import {
  copyTraders,
  getStore,
  state,
  storageMode,
  tradeById,
} from "../state.js";
import {
  computeTrade,
  normalizeTrade,
  outcomeOf,
  packLegs,
  validateTrade,
} from "../trade.js";
import {
  $,
  pressedValues,
  setPressed,
  setSync,
  toast,
  withSpinner,
} from "../ui.js";

let onSaved = () => {};

export const syncedLabel = () =>
  ({
    demo: "Demo data, not saved",
    local: "Saved on this device",
  })[storageMode()] || "Synced";

const FORM_FIELDS = {
  date: "f-date",
  entryTime: "f-entryTime",
  instrument: "f-instrument",
  account: "f-account",
  dir: "f-dir",
  session: "f-session",
  marketCondition: "f-condition",
  contracts: "f-contracts",
  stop: "f-stop",
  target: "f-target",
  catalyst: "f-catalyst",
  thesis: "f-thesis",
  emo: "f-emo",
  exitTime: "f-exitTime",
  managedStop: "f-managedStop",
  commission: "f-commission",
  post: "f-post",
  right: "f-right",
  lesson: "f-lesson",
  chart: "f-chart",
};

const CALC_FIELDS = [
  "f-rr",
  "f-ticksRisk",
  "f-maxRisk",
  "f-grossPnl",
  "f-netPnl",
  "f-r",
];

function legRow(kind, price = "", contracts = "") {
  const row = document.createElement("div");
  row.className = "leg-row";
  row.innerHTML = `
    <input class="leg-price" type="number" min="0" step="0.01" inputmode="decimal" placeholder="Price" aria-label="${kind} price" value="${esc(price)}">
    <span class="leg-x" aria-hidden="true">×</span>
    <input class="leg-contracts" type="number" min="1" step="1" inputmode="numeric" placeholder="Lots" aria-label="${kind} contracts" value="${esc(contracts)}">
    <button type="button" class="leg-del" data-action="del-leg" aria-label="Remove ${kind} leg">✕</button>`;
  return row;
}

function addLeg(kind, price, contracts, focus = true) {
  const row = legRow(kind, price, contracts);
  $(kind + "-legs").appendChild(row);
  recalc();
  if (focus) {
    row.querySelector(".leg-price").focus();
  }
}

let contractsEdited = false;

function readLegs(kind) {
  const fallbackContracts =
    (contractsEdited && parseInt($("f-contracts").value, 10)) || 1;
  return [...document.querySelectorAll(`#${kind}-legs .leg-row`)]
    .map((row) => ({
      price: parseFloat(row.querySelector(".leg-price").value),
      contracts:
        parseInt(row.querySelector(".leg-contracts").value, 10) ||
        fallbackContracts,
    }))
    .filter((leg) => leg.price > 0 && leg.contracts > 0);
}

function showLegTotals(kind, legs) {
  const el = $(kind + "-agg");
  if (legs.length <= 1) {
    el.hidden = true;
    return;
  }
  const total = legs.reduce((sum, leg) => sum + leg.contracts, 0),
    avg = legs.reduce((sum, leg) => sum + leg.price * leg.contracts, 0) / total;
  el.hidden = false;
  el.innerHTML = `Avg ${kind}: <b>${avg.toFixed(2)}</b> · Total: <b>${total} contract${total !== 1 ? "s" : ""}</b>`;
}

let lastCalc = null;

function setCalcField(id, value, tone) {
  const el = $(id);
  el.value = value;
  el.classList.toggle("pos", tone === "pos");
  el.classList.toggle("neg", tone === "neg");
}

function recalc() {
  const entryLegs = readLegs("entry"),
    exitLegs = readLegs("exit");
  showLegTotals("entry", entryLegs);
  showLegTotals("exit", exitLegs);
  const calc = computeTrade({
    entryLegs,
    exitLegs,
    contracts: $("f-contracts").value,
    stop: parseFloat($("f-stop").value),
    target: parseFloat($("f-target").value),
    instrument: $("f-instrument").value,
    dir: $("f-dir").value,
    commission: $("f-commission").value,
  });
  lastCalc = calc;
  if (entryLegs.length && !contractsEdited) {
    $("f-contracts").value = calc.contracts;
  }
  setCalcField(
    "f-ticksRisk",
    calc.ticks != null ? calc.ticks.toFixed(2) + " pts" : "",
  );
  setCalcField(
    "f-maxRisk",
    calc.maxRisk != null ? "$" + calc.maxRisk.toFixed(2) : "",
  );
  setCalcField("f-rr", calc.rr != null ? "1 : " + calc.rr.toFixed(2) : "");
  const tone = (value) => (value == null ? null : value >= 0 ? "pos" : "neg");
  setCalcField(
    "f-grossPnl",
    calc.gross != null ? calc.gross.toFixed(2) : "",
    tone(calc.gross),
  );
  setCalcField(
    "f-netPnl",
    calc.net != null ? calc.net.toFixed(2) : "",
    tone(calc.net),
  );
  setCalcField(
    "f-r",
    calc.r != null ? (calc.r >= 0 ? "+" : "") + calc.r.toFixed(2) + "R" : "",
    tone(calc.r),
  );
  if (calc.net != null && !pressedValues($("outcome-btns")).length) {
    $("outcome-btns").dataset.suggest =
      calc.net > 0 ? "W" : calc.net < 0 ? "L" : "BE";
  } else {
    delete $("outcome-btns").dataset.suggest;
  }
}

function renderTags(group, values) {
  group.innerHTML = values
    .map(
      (value) =>
        `<button type="button" class="tag" data-value="${esc(value)}" aria-pressed="false">${esc(value)}</button>`,
    )
    .join("");
}

export function renderCopyTraderTags() {
  const names = copyTraders(),
    group = $("ct-tags");
  if (!names.length) {
    group.innerHTML =
      '<span class="hint">No copy traders yet. Add them in Settings.</span>';
    return;
  }
  const selected = pressedValues(group)[0];
  renderTags(group, names);
  if (selected) {
    setPressed(group, selected);
  }
}

function readForm(id) {
  const trade = {
    id,
  };
  for (const [key, fieldId] of Object.entries(FORM_FIELDS)) {
    trade[key] = $(fieldId).value;
  }
  if (!trade.date) {
    trade.date = isoDate();
  }
  const strats = pressedValues($("strat-tags")),
    custom = $("f-strat-custom").value.trim();
  if (custom) {
    strats.push(custom);
  }
  trade.strat = strats.join(" | ");
  trade.ct = pressedValues($("ct-tags"))[0] || "";
  trade.conf = pressedValues($("conf-btns"))[0] || "";
  trade.outcome =
    pressedValues($("outcome-btns"))[0] ||
    (lastCalc?.net != null ? outcomeOf(lastCalc.net) : "");
  trade.mistake = pressedValues($("mistake-tags"))[0] || "";
  trade.entry = lastCalc?.entry ? lastCalc.entry.toFixed(2) : "";
  trade.exit = lastCalc?.exit ? lastCalc.exit.toFixed(2) : "";
  trade.contracts = $("f-contracts").value;
  trade.rr = $("f-rr").value;
  trade.ticksRisk = $("f-ticksRisk").value;
  trade.grossPnl = $("f-grossPnl").value;
  trade.netPnl = $("f-netPnl").value;
  trade.notes = packLegs(
    $("f-notes").value,
    readLegs("entry"),
    readLegs("exit"),
  );
  return trade;
}

const inputOf = (el) =>
  el.matches("input, select") ? el : el.querySelector("input");

function showErrors(errors) {
  document
    .querySelectorAll("#trade-form [aria-invalid]")
    .forEach((el) => el.removeAttribute("aria-invalid"));
  const box = $("form-errors");
  box.hidden = !errors.length;
  box.innerHTML = errors.map((err) => `<li>${esc(err.message)}</li>`).join("");
  for (const err of errors) {
    inputOf($(err.field))?.setAttribute("aria-invalid", "true");
  }
  if (errors.length) {
    inputOf($(errors[0].field))?.focus();
  }
}

async function saveTrade() {
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
  if (errors.length) {
    return;
  }
  const editingId = state.editingId,
    trade = readForm(editingId || Date.now().toString());
  setSync("loading", editingId ? "Updating..." : "Saving...");
  try {
    const queued =
        (
          await withSpinner(
            $("save-btn"),
            editingId ? "Updating" : "Saving",
            () =>
              editingId ? getStore().update(trade) : getStore().append(trade),
          )
        )?.status === "queued",
      saved = {
        ...normalizeTrade(trade),
        ...(queued
          ? {
              pending: true,
            }
          : {}),
      },
      index = state.trades.findIndex((row) => row.id === saved.id);
    if (index >= 0) {
      state.trades[index] = saved;
    } else {
      state.trades.push(saved);
    }
    const where =
      {
        demo: " Demo, so this tab only.",
        local: " On this device.",
      }[storageMode()] || "";
    toast(
      queued
        ? (editingId ? "Updated here." : "Saved here.") +
            " It goes to your sheet when you're back online."
        : (editingId ? "Trade updated." : "Trade saved.") + where,
    );
    if (queued) {
      dispatchEvent(new Event("tj:changed"));
    } else {
      setSync("ok", syncedLabel());
    }
    resetForm();
    onSaved();
  } catch (err) {
    toast(
      (editingId ? "Update" : "Save") +
        " failed. " +
        (err.message === "Timeout" ? "Check your connection." : err.message),
      true,
    );
    setSync("err", editingId ? "Update failed" : "Save failed");
  }
}

function clearForm() {
  showErrors([]);
  contractsEdited = false;
  for (const id of [
    ...Object.values(FORM_FIELDS),
    ...CALC_FIELDS,
    "f-strat-custom",
    "f-notes",
  ]) {
    $(id).value = "";
    $(id).classList.remove("pos", "neg");
  }
  for (const id of [
    "strat-tags",
    "ct-tags",
    "mistake-tags",
    "conf-btns",
    "outcome-btns",
  ]) {
    setPressed($(id), [], {
      multi: true,
    });
  }
  $("f-date").value = isoDate();
  resetImageDrop();
  $("entry-legs").innerHTML = "";
  $("exit-legs").innerHTML = "";
  addLeg("entry", "", "", false);
  addLeg("exit", "", "", false);
}

export const cancelEdit = () => resetForm();

function resetForm() {
  state.editingId = null;
  $("save-btn").textContent = "Save trade";
  $("cancel-edit-btn").hidden = true;
  $("edit-mode-banner").hidden = true;
  clearForm();
}

export function startEdit(id) {
  const trade = tradeById(id);
  if (!trade) {
    return;
  }
  clearForm();
  for (const [key, fieldId] of Object.entries(FORM_FIELDS)) {
    $(fieldId).value = trade[key] || "";
  }
  $("f-notes").value = trade.notes || "";
  $("entry-legs").innerHTML = "";
  $("exit-legs").innerHTML = "";
  const legs =
    trade.legs && trade.legs.entry && trade.legs.exit ? trade.legs : null;
  if (legs) {
    legs.entry.forEach((leg) =>
      addLeg("entry", leg.price, leg.contracts, false),
    );
    legs.exit.forEach((leg) => addLeg("exit", leg.price, leg.contracts, false));
  } else {
    addLeg("entry", trade.entry, trade.contracts, false);
    addLeg("exit", trade.exit, trade.contracts, false);
  }
  const strats = splitList(trade.strat);
  setPressed($("strat-tags"), strats, {
    multi: true,
  });
  $("f-strat-custom").value = strats
    .filter((name) => !STRATEGIES.includes(name))
    .join(" | ");
  setPressed($("ct-tags"), trade.ct || "");
  setPressed($("mistake-tags"), trade.mistake || "");
  setPressed($("conf-btns"), String(trade.conf || ""));
  setPressed($("outcome-btns"), trade.outcome || "");
  if (trade.chart) {
    showImagePreview(trade.chart);
  }
  recalc();
  state.editingId = trade.id;
  $("save-btn").textContent = "Update trade";
  $("cancel-edit-btn").hidden = false;
  $("edit-mode-banner").hidden = false;
  toast("Editing. Make changes and press Update trade.");
}

function resetImageDrop() {
  $("img-preview-wrap").hidden = true;
  $("img-uploading").hidden = true;
  const label = $("img-drop-label");
  label.hidden = false;
  label.className = "img-label";
  label.innerHTML =
    "Click, drag &amp; drop, or <kbd>Ctrl+V</kbd> to paste a screenshot";
}

function showImagePreview(ref) {
  const wrap = $("img-preview-wrap");
  let img = $("img-preview");
  if (!img) {
    img = document.createElement("img");
    img.id = "img-preview";
    img.alt = "Screenshot preview";
    wrap.prepend(img);
  }
  img.hidden = false;
  showImage(img, ref);
  $("img-link-display").textContent = imageLabel(ref);
  $("img-preview-wrap").hidden = false;
}

function imageMessage(text, cls) {
  const label = $("img-drop-label");
  label.hidden = false;
  label.textContent = text;
  label.className = "img-label " + cls;
}

async function uploadToImageHost(blob) {
  $("img-drop-label").hidden = true;
  $("img-uploading").hidden = false;
  $("img-preview-wrap").hidden = true;
  try {
    const ref = await uploadImage(blob);
    $("f-chart").value = ref;
    $("img-uploading").hidden = true;
    showImagePreview(ref);
  } catch (err) {
    $("img-uploading").hidden = true;
    imageMessage(
      err.name === "NeedsSignIn"
        ? "Sign in with Google again, then add the screenshot."
        : "Couldn't save the screenshot. Try again.",
      "err",
    );
  }
}

async function addImage(blob) {
  if (!blob) {
    return;
  }
  if (imageHost() !== "imgbb") {
    uploadToImageHost(blob);
    return;
  }
  $("img-drop-label").hidden = true;
  $("img-uploading").hidden = false;
  $("img-preview-wrap").hidden = true;
  const form = new FormData();
  form.append("image", blob);
  try {
    const res = await (
      await fetch(
        `https://api.imgbb.com/1/upload?key=${encodeURIComponent(state.cfg.imgbbKey)}`,
        {
          method: "POST",
          body: form,
        },
      )
    ).json();
    if (!res.success) {
      throw new Error();
    }
    $("f-chart").value = res.data.url;
    $("img-uploading").hidden = true;
    showImagePreview(res.data.url);
  } catch {
    $("img-uploading").hidden = true;
    imageMessage(
      "Upload failed. Check the imgbb key or paste a URL below.",
      "err",
    );
  }
}

const imageFromPaste = (event) =>
  [...(event.clipboardData?.items || [])]
    .find((item) => item.type.startsWith("image/"))
    ?.getAsFile() || null;

export function setupTradeForm({ afterSave }) {
  onSaved = afterSave;
  renderTags($("strat-tags"), STRATEGIES);
  renderTags($("mistake-tags"), MISTAKES);
  $("conf-btns").innerHTML = [1, 2, 3, 4, 5]
    .map(
      (level) =>
        `<button type="button" class="conf-btn" data-value="${level}" aria-pressed="false" aria-label="Confidence ${level}">${level}</button>`,
    )
    .join("");
  $("outcome-btns").innerHTML = OUTCOMES.map(
    (outcome) =>
      `<button type="button" class="out-btn ${outcome.cls}" data-value="${outcome.value}" aria-pressed="false">${outcome.label}</button>`,
  ).join("");
  renderCopyTraderTags();
  $("strat-tags").addEventListener("click", (event) => {
    const btn = event.target.closest("button[data-value]");
    if (btn) {
      btn.setAttribute(
        "aria-pressed",
        String(btn.getAttribute("aria-pressed") !== "true"),
      );
    }
  });
  for (const groupId of [
    "ct-tags",
    "mistake-tags",
    "conf-btns",
    "outcome-btns",
  ]) {
    $(groupId).addEventListener("click", (event) => {
      const btn = event.target.closest("button[data-value]");
      if (!btn) {
        return;
      }
      const wasOn = btn.getAttribute("aria-pressed") === "true";
      setPressed($(groupId), wasOn ? "" : btn.dataset.value);
      if (groupId === "outcome-btns") {
        recalc();
      }
    });
  }
  $("f-contracts").addEventListener("input", () => {
    contractsEdited = $("f-contracts").value !== "";
  });
  for (const id of [
    "f-instrument",
    "f-dir",
    "f-contracts",
    "f-stop",
    "f-target",
    "f-commission",
  ]) {
    $(id).addEventListener("input", recalc);
  }
  for (const kind of ["entry", "exit"]) {
    const list = $(kind + "-legs");
    list.addEventListener("input", recalc);
    list.addEventListener("click", (event) => {
      if (event.target.closest('[data-action="del-leg"]')) {
        event.target.closest(".leg-row").remove();
        recalc();
      }
    });
    $("add-" + kind + "-leg").addEventListener("click", () => addLeg(kind));
  }
  $("trade-form").addEventListener("submit", (event) => {
    event.preventDefault();
    saveTrade();
  });
  $("clear-btn").addEventListener("click", () => {
    if (state.editingId) {
      resetForm();
    } else {
      clearForm();
    }
  });
  $("cancel-edit-btn").addEventListener("click", resetForm);
  const dropZone = $("img-drop-zone");
  dropZone.addEventListener("click", () => $("img-file-input").click());
  dropZone.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      $("img-file-input").click();
    }
  });
  dropZone.addEventListener("dragover", (event) => {
    event.preventDefault();
    dropZone.classList.add("over");
  });
  dropZone.addEventListener("dragleave", () =>
    dropZone.classList.remove("over"),
  );
  dropZone.addEventListener("drop", (event) => {
    event.preventDefault();
    dropZone.classList.remove("over");
    const file = event.dataTransfer.files[0];
    if (file && file.type.startsWith("image/")) {
      addImage(file);
    }
  });
  $("img-file-input").addEventListener("change", (event) =>
    addImage(event.target.files[0]),
  );
  $("f-chart").addEventListener("change", (event) => {
    if (event.target.value) {
      showImagePreview(event.target.value);
    } else {
      resetImageDrop();
    }
  });
  document.addEventListener("paste", (event) => {
    if (!$("view-log-trade").classList.contains("active")) {
      return;
    }
    const file = imageFromPaste(event);
    if (file) {
      event.preventDefault();
      addImage(file);
    }
  });
  clearForm();
}
