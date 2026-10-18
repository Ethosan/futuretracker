// Charts screen (Chart.js).
import {
  ArcElement,
  BarController,
  BarElement,
  CategoryScale,
  Chart,
  DoughnutController,
  Filler,
  Legend,
  LineController,
  LineElement,
  LinearScale,
  PointElement,
  Tooltip,
} from "chart.js";
import { SESSIONS } from "../constants.js";
import { money } from "../format.js";
import { visibleTrades } from "../state.js";
import {
  WEEKDAYS,
  byCopyTrader,
  byDirection,
  byInstrument,
  bySession,
  byStrategy,
  byWeekday,
  equityCurve,
  mistakeCost,
  mistakeCounts,
} from "../stats.js";
import { $ } from "../ui.js";

Chart.register(
  LineController,
  BarController,
  DoughnutController,
  LineElement,
  BarElement,
  ArcElement,
  PointElement,
  CategoryScale,
  LinearScale,
  Filler,
  Tooltip,
  Legend,
);

const COLORS = {
  up: "#c8f56a",
  down: "#ff6b6b",
  blue: "#7ec8f7",
  amber: "#ffc166",
  upFill: "rgba(200,245,106,0.7)",
  downFill: "rgba(255,107,107,0.7)",
  grid: "#262626",
  text: "#a3a3a3",
};

Chart.defaults.color = COLORS.text;

Chart.defaults.borderColor = "#333";

Chart.defaults.font.family = "'DM Mono', monospace";

Chart.defaults.font.size = 12;

const charts = {};

const TOOLTIP = {
  backgroundColor: "#1c1c1c",
  borderColor: "#404040",
  borderWidth: 1,
  titleColor: "#f4f1ec",
  bodyColor: "#c4c4c4",
  padding: 10,
};

const BASE_OPTIONS = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: {
      display: false,
    },
    tooltip: TOOLTIP,
  },
};

const PERCENT_AXIS = {
  min: 0,
  max: 100,
  ticks: {
    callback: (value) => value + "%",
  },
  grid: {
    color: COLORS.grid,
  },
};

const bySign = (values, up, down) =>
  values.map((value) => (value >= 0 ? up : down));

const CATEGORY_AXIS = {
  grid: {
    display: false,
  },
  ticks: {
    autoSkip: false,
  },
};

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

const shortDate = (label) =>
  label ? +label.slice(8, 10) + " " + MONTHS[+label.slice(5, 7) - 1] : "";

function sizeForRows(canvasId, rows) {
  $(canvasId).parentElement.style.height = Math.max(160, rows * 30 + 36) + "px";
}

function drawChart(key, canvasId, config) {
  charts[key]?.destroy();
  charts[key] = new Chart($(canvasId), config);
}

function winRates(groups, names) {
  return names.map((name) => {
    const group = groups[name];
    return group.tot ? Math.round((group.w / group.tot) * 100) : 0;
  });
}

function winRateChart(
  key,
  canvasId,
  groups,
  names,
  { horizontal = false } = {},
) {
  const rates = winRates(groups, names),
    valueAxis = horizontal ? "x" : "y";
  if (horizontal) {
    sizeForRows(canvasId, names.length);
  }
  drawChart(key, canvasId, {
    type: "bar",
    data: {
      labels: names,
      datasets: [
        {
          data: rates,
          backgroundColor: rates.map((rate) =>
            rate >= 50 ? COLORS.upFill : COLORS.downFill,
          ),
          borderColor: rates.map((rate) =>
            rate >= 50 ? COLORS.up : COLORS.down,
          ),
          borderWidth: 1,
          borderRadius: 3,
        },
      ],
    },
    options: {
      ...BASE_OPTIONS,
      indexAxis: horizontal ? "y" : "x",
      scales: horizontal
        ? {
            y: CATEGORY_AXIS,
            x: PERCENT_AXIS,
          }
        : {
            x: CATEGORY_AXIS,
            y: PERCENT_AXIS,
          },
      plugins: {
        ...BASE_OPTIONS.plugins,
        tooltip: {
          ...TOOLTIP,
          callbacks: {
            label: (item) =>
              ` ${item.parsed[valueAxis]}% win rate · ${groups[names[item.dataIndex]].tot} trades`,
          },
        },
      },
    },
  });
}

function winRateAndPnlChart(key, canvasId, groups, names) {
  const rates = winRates(groups, names),
    pnls = names.map((name) => +groups[name].pnl.toFixed(2));
  drawChart(key, canvasId, {
    type: "bar",
    data: {
      labels: names,
      datasets: [
        {
          label: "Win rate %",
          data: rates,
          backgroundColor: "rgba(200,245,106,0.65)",
          borderColor: COLORS.up,
          borderWidth: 1,
          borderRadius: 3,
          yAxisID: "y",
        },
        {
          label: "Net P&L $",
          data: pnls,
          backgroundColor: bySign(
            pnls,
            "rgba(126,200,247,0.6)",
            "rgba(255,107,107,0.6)",
          ),
          borderColor: bySign(pnls, COLORS.blue, COLORS.down),
          borderWidth: 1,
          borderRadius: 3,
          yAxisID: "y1",
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          labels: {
            color: COLORS.text,
          },
        },
        tooltip: {
          ...TOOLTIP,
          callbacks: {
            label: (item) =>
              item.dataset.yAxisID === "y"
                ? ` ${item.parsed.y}% win rate`
                : ` $${item.parsed.y.toFixed(2)}`,
          },
        },
      },
      scales: {
        x: CATEGORY_AXIS,
        y: {
          ...PERCENT_AXIS,
          position: "left",
        },
        y1: {
          position: "right",
          ticks: {
            callback: (value) => "$" + value,
          },
          grid: {
            display: false,
          },
        },
      },
    },
  });
}

export function renderCharts() {
  const trades = visibleTrades();
  $("charts-empty").hidden = trades.length > 0;
  $("chart-grid").hidden = !trades.length;
  if (!trades.length) {
    return;
  }
  const curve = equityCurve(trades);
  drawChart("pnl", "chart-pnl", {
    type: "line",
    data: {
      labels: curve.map((point) => point.label),
      datasets: [
        {
          data: curve.map((point) => point.value),
          borderColor: COLORS.up,
          borderWidth: 2,
          pointRadius: curve.length > 60 ? 0 : 3,
          pointBackgroundColor: curve.map((point) =>
            point.value >= 0 ? COLORS.up : COLORS.down,
          ),
          pointBorderColor: "transparent",
          tension: 0.3,
          fill: true,
          backgroundColor: (ctx) => {
            const gradient = ctx.chart.ctx.createLinearGradient(
              0,
              0,
              0,
              ctx.chart.height,
            );
            gradient.addColorStop(0, "rgba(200,245,106,0.16)");
            gradient.addColorStop(1, "rgba(200,245,106,0.01)");
            return gradient;
          },
        },
      ],
    },
    options: {
      ...BASE_OPTIONS,
      scales: {
        x: {
          ticks: {
            maxTicksLimit: 6,
            maxRotation: 0,
            callback(value) {
              return shortDate(this.getLabelForValue(value));
            },
          },
          grid: {
            color: COLORS.grid,
          },
        },
        y: {
          ticks: {
            callback: (value) => "$" + value,
          },
          grid: {
            color: COLORS.grid,
          },
        },
      },
      plugins: {
        ...BASE_OPTIONS.plugins,
        tooltip: {
          ...TOOLTIP,
          callbacks: {
            label: (item) => ` $${item.parsed.y.toFixed(2)}`,
          },
        },
      },
    },
  });
  const strats = byStrategy(trades),
    byWinRate = Object.keys(strats).sort(
      (a, b) => strats[b].w / strats[b].tot - strats[a].w / strats[a].tot,
    );
  winRateChart("wr", "chart-wr", strats, byWinRate, {
    horizontal: true,
  });
  const byPnl = Object.keys(strats).sort(
      (a, b) => strats[b].pnl - strats[a].pnl,
    ),
    pnls = byPnl.map((name) => +strats[name].pnl.toFixed(2));
  sizeForRows("chart-strat-pnl", byPnl.length);
  drawChart("strat-pnl", "chart-strat-pnl", {
    type: "bar",
    data: {
      labels: byPnl,
      datasets: [
        {
          data: pnls,
          backgroundColor: bySign(pnls, COLORS.upFill, COLORS.downFill),
          borderColor: bySign(pnls, COLORS.up, COLORS.down),
          borderWidth: 1,
          borderRadius: 3,
        },
      ],
    },
    options: {
      ...BASE_OPTIONS,
      indexAxis: "y",
      scales: {
        y: CATEGORY_AXIS,
        x: {
          ticks: {
            callback: (value) => "$" + value,
            maxTicksLimit: 5,
          },
          grid: {
            color: COLORS.grid,
          },
        },
      },
      plugins: {
        ...BASE_OPTIONS.plugins,
        tooltip: {
          ...TOOLTIP,
          callbacks: {
            label: (item) => ` $${item.parsed.x.toFixed(2)}`,
          },
        },
      },
    },
  });
  const traders = byCopyTrader(trades);
  winRateAndPnlChart(
    "ct",
    "chart-ct",
    traders,
    Object.keys(traders).sort((a, b) => traders[b].pnl - traders[a].pnl),
  );
  const sessions = bySession(trades);
  winRateChart(
    "session",
    "chart-session",
    sessions,
    SESSIONS.filter((name) => sessions[name]),
  );
  const instruments = byInstrument(trades),
    instrumentNames = Object.keys(instruments),
    palette = [COLORS.up, COLORS.blue, COLORS.amber, COLORS.down];
  drawChart("instrument", "chart-instrument", {
    type: "doughnut",
    data: {
      labels: instrumentNames,
      datasets: [
        {
          data: instrumentNames.map((name) => instruments[name].tot),
          backgroundColor: instrumentNames.map(
            (name, i) => palette[i % 4] + "cc",
          ),
          borderColor: instrumentNames.map((name, i) => palette[i % 4]),
          borderWidth: 1,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: "right",
          labels: {
            color: COLORS.text,
            padding: 14,
          },
        },
        tooltip: {
          ...TOOLTIP,
          callbacks: {
            label: (item) => {
              const group = instruments[instrumentNames[item.dataIndex]];
              return ` ${group.tot} trades · ${Math.round((group.w / group.tot) * 100)}% WR · $${group.pnl.toFixed(2)}`;
            },
          },
        },
      },
    },
  });
  const dirs = byDirection(trades);
  winRateAndPnlChart(
    "longshort",
    "chart-longshort",
    {
      Long: dirs.Long || {
        w: 0,
        l: 0,
        tot: 0,
        pnl: 0,
      },
      Short: dirs.Short || {
        w: 0,
        l: 0,
        tot: 0,
        pnl: 0,
      },
    },
    ["Long", "Short"],
  );
  const days = byWeekday(trades);
  winRateAndPnlChart(
    "weekday",
    "chart-weekday",
    days,
    WEEKDAYS.filter((day) => days[day]),
  );
  const counts = mistakeCounts(trades),
    cost = mistakeCost(trades).by,
    mistakeNames = Object.keys(counts).sort((a, b) => counts[b] - counts[a]);
  sizeForRows("chart-mistakes", mistakeNames.length);
  drawChart("mistakes", "chart-mistakes", {
    type: "bar",
    data: {
      labels: mistakeNames,
      datasets: [
        {
          data: mistakeNames.map((name) => counts[name]),
          backgroundColor: "rgba(255,107,107,0.65)",
          borderColor: COLORS.down,
          borderWidth: 1,
          borderRadius: 3,
        },
      ],
    },
    options: {
      ...BASE_OPTIONS,
      indexAxis: "y",
      scales: {
        y: CATEGORY_AXIS,
        x: {
          ticks: {
            stepSize: 1,
            maxRotation: 0,
          },
          grid: {
            color: COLORS.grid,
          },
        },
      },
      plugins: {
        ...BASE_OPTIONS.plugins,
        tooltip: {
          ...TOOLTIP,
          callbacks: {
            label: (item) =>
              ` ${item.parsed.x} time${item.parsed.x !== 1 ? "s" : ""} · ${money(cost[mistakeNames[item.dataIndex]].pnl)}`,
          },
        },
      },
    },
  });
}
