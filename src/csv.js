// CSV export and import.
import { COLUMNS } from "./constants.js";
import { escapeFormula, isFormulaLike, tradeToRow } from "./trade.js";

const csvCell = (value) => {
  const text = escapeFormula(String(value ?? ""));
  return /[",\n\r]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text;
};

export function tradesToCsv(trades) {
  const rowOf = (trade) => {
    const row = tradeToRow(trade);
    return COLUMNS.map((key) => row[key]);
  };
  return [
    COLUMNS.join(","),
    ...trades.map((trade) => rowOf(trade).map(csvCell).join(",")),
  ].join(`
`);
}

function parseCsv(text) {
  const rows = [];
  let row = [],
    cell = "",
    quoted = false;
  const src = text.replace(/^\uFEFF/, "");
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') {
        cell += '"';
        i++;
      } else {
        if (ch === '"') {
          quoted = false;
        } else {
          cell += ch;
        }
      }
    } else {
      if (ch === '"') {
        quoted = true;
      } else {
        if (ch === ",") {
          row.push(cell);
          cell = "";
        } else {
          if (
            ch ===
              `
` ||
            ch === "\r"
          ) {
            if (
              ch === "\r" &&
              src[i + 1] ===
                `
`
            ) {
              i++;
            }
            row.push(cell);
            rows.push(row);
            row = [];
            cell = "";
          } else {
            cell += ch;
          }
        }
      }
    }
  }
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

export function csvToTrades(text) {
  const [header, ...rows] = parseCsv(text);
  if (!header || !header.includes("id")) {
    throw new Error(
      "This CSV has no id column. Use a file exported from the journal.",
    );
  }
  return rows
    .filter((row) => row.some((cell) => cell.trim() !== ""))
    .map((row) =>
      Object.fromEntries(
        COLUMNS.map((key) => [
          key,
          header.includes(key)
            ? unescapeFormula(row[header.indexOf(key)] ?? "")
            : "",
        ]),
      ),
    );
}

function unescapeFormula(value) {
  return value.startsWith("'") && isFormulaLike(value.slice(1))
    ? value.slice(1)
    : value;
}
