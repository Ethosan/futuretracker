// Trade Log screen: filters, the trade table grouped by day, CSV export and import.
import { INSTRUMENTS } from "../constants.js";
import { csvToTrades, tradesToCsv } from "../csv.js";
import {
  esc,
  isoDate,
  money,
  plural,
  posNeg,
  splitList,
  timeIn,
} from "../format.js";
import { getStore, state, visibleTrades } from "../state.js";
import { normalizeTrade, rMultipleOf } from "../trade.js";
import { $, toast, withSpinner } from "../ui.js";

let openTrade = () => {};

let onImported = () => {};

const outcomeClass = (outcome) =>
  outcome === "W" ? "out-w" : outcome === "L" ? "out-l" : "out-be";

const DASH = '<span class="dim">—</span>';

function fillStrategyFilter() {
  const select = $("filter-strat"),
    have = new Set([...select.options].map((opt) => opt.value)),
    names = [
      ...new Set(state.trades.flatMap((trade) => splitList(trade.strat))),
    ].sort();
  for (const name of names) {
    if (!have.has(name)) {
      select.add(new Option(name, name));
    }
  }
}

function renderTodayBar(trades) {
  const today = trades.filter((trade) => trade.date === isoDate()),
    bar = $("today-bar");
  bar.hidden = !today.length;
  if (!today.length) {
    return;
  }
  const pnl = today.reduce((sum, trade) => sum + trade.netPnl, 0),
    wins = today.filter((trade) => trade.outcome === "W").length;
  $("today-trades").textContent = plural(today.length, "trade");
  $("today-pnl").textContent = money(pnl);
  $("today-pnl").className = "num " + posNeg(pnl);
  $("today-wr").textContent = `${wins}W ${today.length - wins}L`;
}

function applyFilters(trades) {
  const text = $("filter-text").value.trim().toLowerCase(),
    outcome = $("filter-outcome").value,
    strat = $("filter-strat").value,
    instrument = $("filter-instrument").value;
  return trades.filter(
    (trade) =>
      (!text ||
        [
          trade.instrument,
          trade.strat,
          trade.ct,
          trade.date,
          trade.catalyst,
        ].some((field) => (field || "").toLowerCase().includes(text))) &&
      (!outcome || trade.outcome === outcome) &&
      (!strat || splitList(trade.strat).includes(strat)) &&
      (!instrument || trade.instrument === instrument),
  );
}

function tradeRow(trade) {
  const strats = splitList(trade.strat)
      .map((name) => `<span class="chip chip-strat">${esc(name)}</span>`)
      .join(" "),
    setup = trade.ct
      ? `<span class="ct-name">${esc(trade.ct)}</span>${strats ? "<br>" + strats : ""}`
      : strats || DASH,
    account = trade.account
      ? `<span class="chip ${trade.account === "Live" ? "chip-live" : "chip-prop"}">${esc(trade.account)}</span>`
      : DASH,
    r = rMultipleOf(trade);
  return `<tr class="trade-row" data-id="${esc(trade.id)}" tabindex="0" aria-label="${esc(trade.instrument || "Trade")} ${esc(trade.date)} ${money(trade.netPnl)}. Open">
    <td class="dim nowrap">${esc(trade.date)}</td>
    <td class="dim">${esc(timeIn(trade.entryTime, trade.date, state.cfg.timezone))}</td>
    <td><span class="sym">${esc(trade.instrument || "—")}</span></td>
    <td class="col-acct">${account}</td>
    <td class="${trade.dir === "Long" ? "pos" : trade.dir === "Short" ? "neg" : "dim"}">${esc(trade.dir || "—")}</td>
    <td class="col-setup">${setup}</td>
    <td class="num strong nowrap ${posNeg(trade.netPnl)}">${money(trade.netPnl)}</td>
    <td class="num col-r ${r == null ? "dim" : posNeg(r)}">${r == null ? "—" : (r >= 0 ? "+" : "") + r.toFixed(2) + "R"}</td>
    <td><span class="out-tag ${outcomeClass(trade.outcome)}">${esc(trade.outcome || "—")}</span>${trade.pending ? ` <span class="pending" title="Not in your sheet yet. Sends when you're back online.">not synced</span>` : ""}</td>
    <td class="dim col-session">${esc(trade.session || "—")}</td>
    <td>${trade.mistake && trade.mistake !== "None" ? `<span class="chip chip-mistake">${esc(trade.mistake)}</span>` : DASH}</td>
  </tr>`;
}

export function renderTradeLog() {
  fillStrategyFilter();
  const trades = visibleTrades();
  renderTodayBar(trades);
  $("log-count").textContent = plural(trades.length, "trade");
  const shown = applyFilters(trades).sort(
    (a, b) =>
      (b.date || "").localeCompare(a.date || "") ||
      (b.entryTime || "").localeCompare(a.entryTime || ""),
  );
  $("log-empty").hidden = shown.length > 0 || $("log-loading").hidden === false;
  $("log-empty").textContent = trades.length
    ? "No trades match these filters."
    : "No trades yet. Log your first one.";
  if (!shown.length) {
    $("log-body").innerHTML = "";
    return;
  }
  const byDay = new Map();
  for (const trade of shown) {
    const day = trade.date || "—";
    if (!byDay.has(day)) {
      byDay.set(day, []);
    }
    byDay.get(day).push(trade);
  }
  let html = "";
  for (const [day, dayTrades] of byDay) {
    const pnl = dayTrades.reduce((sum, trade) => sum + trade.netPnl, 0),
      wins = dayTrades.filter((trade) => trade.outcome === "W").length;
    html += `<tr class="day-row"><td colspan="11">
      <span class="strong">${esc(day)}</span>
      <span class="dim">${plural(dayTrades.length, "trade")}</span>
      <span class="num strong ${posNeg(pnl)}">${money(pnl)}</span>
      <span class="dim">${wins}W ${dayTrades.length - wins}L</span></td></tr>`;
    html += dayTrades.map(tradeRow).join("");
  }
  $("log-body").innerHTML = html;
}

function exportCsv() {
  const blob = new Blob([tradesToCsv(visibleTrades())], {
      type: "text/csv",
    }),
    link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `trades-${state.account.toLowerCase()}-${isoDate()}.csv`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}

async function importCsv(file) {
  if (!file) {
    return;
  }
  let rows;
  try {
    rows = csvToTrades(await file.text());
  } catch (err) {
    toast(err.message || "Couldn't read that file.", true);
    return;
  }
  const have = new Set(state.trades.map((trade) => trade.id)),
    fresh = rows.filter((row) => row.id && !have.has(String(row.id)));
  if (!fresh.length) {
    toast("Nothing new to import.");
    return;
  }
  let done = 0;
  try {
    await withSpinner($("import-btn"), "Importing", async () => {
      if (getStore().appendMany) {
        await getStore().appendMany(fresh);
        done = fresh.length;
      } else {
        for (const row of fresh) {
          await getStore().append(row);
          done++;
        }
      }
      state.trades.push(...fresh.map(normalizeTrade));
    });
    toast(`Imported ${plural(done, "trade")}.`);
  } catch {
    toast(
      `Imported ${done} of ${fresh.length}. The rest failed, try again.`,
      true,
    );
  }
  onImported();
}

export function setupTradeLog({ open, refresh, imported }) {
  openTrade = open;
  onImported = imported;
  const select = $("filter-instrument");
  for (const name of INSTRUMENTS) {
    select.add(new Option(name, name));
  }
  for (const id of [
    "filter-text",
    "filter-outcome",
    "filter-strat",
    "filter-instrument",
  ]) {
    $(id).addEventListener("input", renderTradeLog);
  }
  $("refresh-btn").addEventListener("click", refresh);
  $("export-btn").addEventListener("click", exportCsv);
  $("import-btn").addEventListener("click", () => $("import-file").click());
  $("import-file").addEventListener("change", (event) => {
    importCsv(event.target.files[0]);
    event.target.value = "";
  });
  const body = $("log-body");
  body.addEventListener("click", (event) => {
    const row = event.target.closest(".trade-row");
    if (row) {
      openTrade(row.dataset.id);
    }
  });
  body.addEventListener("keydown", (event) => {
    const row = event.target.closest(".trade-row");
    if (row && (event.key === "Enter" || event.key === " ")) {
      event.preventDefault();
      openTrade(row.dataset.id);
    }
  });
}
