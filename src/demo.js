// Demo mode: generates the same realistic set of trades every time from a fixed seed.
import { isoDate } from "./format.js";
import { computeTrade, packLegs } from "./trade.js";

const DEMO_SEED = 57;

const DEMO_START = "2026-05-11";

const DEMO_WEEKS = 22;

export const DEMO_YEAR = 2026;

export const DEMO_COPY_TRADERS = ["Alerts room", "Gold group"];

export const DEMO_CONFIG = {
  mode: "demo",
  timezone: "",
  imgbbKey: "",
};

function seededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 1831565813) >>> 0;
    let x = state;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

const DEMO_PHASES = [
  {
    until: 4,
    win: 0.5,
    slip: 0.3,
    day: [0.2, 0.55, 0.25, 0],
  },
  {
    until: 8,
    win: 0.6,
    slip: 0.15,
    day: [0.25, 0.5, 0.25, 0],
  },
  {
    until: 12,
    win: 0.36,
    slip: 0.5,
    day: [0.25, 0.35, 0.25, 0.15],
  },
  {
    until: 16,
    win: 0.52,
    slip: 0.2,
    day: [0.3, 0.55, 0.15, 0],
  },
  {
    until: 22,
    win: 0.47,
    slip: 0.3,
    day: [0.25, 0.5, 0.25, 0],
  },
];

const SLUMP_WEEK = 9;

const SLUMP_TRADES = 7;

const DEMO_INSTRUMENT_MIX = [
  ["MES", 0.44],
  ["MNQ", 0.3],
  ["MGC", 0.2],
  ["XAUUSD", 0.06],
];

const DEMO_MARKETS = {
  MES: {
    px: 6480,
    vol: 45,
    tick: 0.25,
    stop: [4, 9],
    size: [1, 3],
  },
  MNQ: {
    px: 23600,
    vol: 220,
    tick: 0.25,
    stop: [14, 34],
    size: [1, 2],
  },
  MGC: {
    px: 3720,
    vol: 30,
    tick: 0.1,
    stop: [3, 7],
    size: [1, 2],
  },
  XAUUSD: {
    px: 3718,
    vol: 30,
    tick: 0.01,
    stop: [4, 9],
    size: [10, 20],
  },
};

const DEMO_COMMISSION = {
  MES: 1.24,
  MNQ: 1.24,
  MGC: 1.74,
  XAUUSD: 0,
};

const DEMO_SESSIONS = [
  ["NY AM", 0.46, [1290, 1420]],
  ["London", 0.2, [900, 1050]],
  ["Asia", 0.14, [525, 690]],
  ["NY PM", 0.12, [60, 210]],
  ["Overnight", 0.08, [300, 450]],
];

const DEMO_CATALYSTS = {
  "NY AM": ["NY open", "NY open", "CPI", "Jobless claims", "Retail sales", ""],
  "NY PM": ["FOMC", "Powell speaking", "", ""],
  London: ["London open", "London open", "UK CPI", ""],
  Asia: ["Asia range", "China data", ""],
  Overnight: ["", ""],
};

const DEMO_STRATEGIES = [
  ["ORB", 0.22, 0.08],
  ["VWAP reclaim", 0.16, 0.06],
  ["Trend continuation", 0.12, 0.04],
  ["Support/resistance", 0.1, 0],
  ["Breakout", 0.1, -0.06],
  ["Mean reversion", 0.07, -0.03],
  ["Fade/reversal", 0.08, -0.1],
  ["News/macro play", 0.06, -0.08],
  ["ICT/SMC", 0.04, -0.08],
  ["Scalp", 0.05, -0.02],
];

const COPY_TRADER_EDGE = {
  "Alerts room": -0.06,
  "Gold group": 0.03,
};

const SLUMP_MISTAKES = [
  "Revenge trade",
  "Moved stop",
  "Oversized",
  "FOMO entry",
  "Overtraded",
  "Chased entry",
  "Moved stop",
  "Revenge trade",
];

const DEMO_MISTAKES = [
  "Chased entry",
  "Exited early",
  "Held too long",
  "No clear setup",
  "FOMO entry",
  "Moved stop",
  "Exited early",
];

const MISTAKE_EMOTION = {
  "Moved stop": "Anxious",
  "Chased entry": "Impatient",
  Oversized: "Overconfident",
  "Held too long": "Hopeful",
  "Exited early": "Nervous",
  "No clear setup": "Bored",
  "Revenge trade": "Frustrated",
  "FOMO entry": "FOMO",
  Overtraded: "Tired",
};

const CALM_EMOTIONS = [
  "Calm",
  "Patient",
  "Focused",
  "Calm",
  "Neutral",
  "A bit tired",
];

const DEMO_THESES = {
  ORB: [
    "Opening range was about {r} points. Plan was to take the break {way} and put the stop back inside the range.",
    "Clean first 15 minutes. Waiting for a break {way} with volume, stop on the other side of the midpoint.",
  ],
  "VWAP reclaim": [
    "Flushed under VWAP at the open and came straight back. Looking for a move to the overnight {lvl}.",
    "Held VWAP twice on the retest. Taking it {way} with the stop just through VWAP.",
  ],
  "Trend continuation": [
    "Higher timeframe trend is {way}. Pullback to the 20 EMA, entry on the first push back.",
    "Strong trend day so far. Joining on the pullback, not chasing the high.",
  ],
  "Support/resistance": [
    "Prior day {lvl} lined up with a round number. Fading the first test.",
    "Big level from last week. Small stop, see if it holds.",
  ],
  Breakout: [
    "Tight range for an hour. Taking the break {way} and hoping for expansion.",
    "Third push into the same level. Expecting it to go this time.",
  ],
  "Mean reversion": [
    "Stretched far from VWAP with no news. Looking for a move back toward it.",
    "Two standard deviations off VWAP. Small size, quick target.",
  ],
  "Fade/reversal": [
    "Looked exhausted after the run. Trying to catch the turn.",
    "Spike into the level and a long wick. Fading it.",
  ],
  "News/macro play": [
    "{cat} number came in hot. Trading the first pullback after the spike.",
    "Positioned before {cat}. Stop wide enough for the noise.",
  ],
  "ICT/SMC": [
    "Swept the {lvl} and came back into the range. Entry on the fair value gap.",
    "Liquidity grab under the low, then a shift in structure. Taking the retrace.",
  ],
  Scalp: [
    "Quick scalp off the tape. In and out.",
    "Fast move into a level. Taking a few ticks.",
  ],
};

const DEMO_POST_TRADE = {
  W: [
    "Worked more or less as planned.",
    "Got the move. Took most of it near the target.",
    "Slow start, then it went. Trailed the rest.",
    "Hit the first target and the runner went further than I expected.",
  ],
  L: [
    "Stopped out. The level didn't hold.",
    "Went straight against me after entry.",
    "Chopped around and then took the stop.",
    "Looked fine for ten minutes, then reversed hard.",
  ],
  BE: [
    "Moved to break-even after the first push and got tagged.",
    "Went nowhere. Closed it flat.",
  ],
};

const MISTAKE_POST_TRADE = {
  "Moved stop":
    "Price came for my stop and I moved it. Lost about twice what I planned.",
  "Revenge trade":
    "Took it straight after the last loss to win it back. There was no setup.",
  Oversized: "Doubled my size because the last few worked. It didn't.",
  "FOMO entry": "Saw it running and jumped in late.",
  Overtraded:
    "This was trade number four of the day. I should have stopped after two.",
  "Chased entry":
    "Entered well past my level. The stop was too far away for the target.",
  "Held too long": "Had it in profit, wanted more, gave it all back.",
  "Exited early":
    "Closed early on a small pullback. It went to my target without me.",
  "No clear setup": "Bored and clicked. Not a real setup.",
};

const DEMO_WENT_RIGHT = {
  W: [
    "Waited for the retest.",
    "Took partials at 1R.",
    "Sized right and left it alone.",
    "Followed the plan.",
  ],
  L: [
    "Took the stop without touching it.",
    "Size was right, so the loss was small.",
    "Didn't add to a loser.",
  ],
  BE: ["Protected the trade once it moved.", "Got out flat instead of hoping."],
  slip: ["Logged it honestly.", "Stopped trading after this one.", "Not much."],
};

const DEMO_LESSONS = {
  "Moved stop": "The stop is the plan. Don't move it.",
  "Revenge trade": "After a loss, walk away for 30 minutes.",
  Oversized: "Size stays the same after a winning week.",
  "FOMO entry": "If I missed the entry, I missed it.",
  Overtraded: "Two trades a day. Then close the platform.",
  "Chased entry": "No entry more than a point past the level.",
  "Held too long": "Take the target when it's there.",
  "Exited early": "Let the stop and target do the work.",
  "No clear setup": "No setup, no trade.",
  W: "Same setup, same size. Keep doing this.",
  L: "Good trade, bad outcome. That's fine.",
  BE: "Break-even is a fine result.",
};

const DEMO_NOTES = [
  "Phone only today.",
  "Spread was wide on the open.",
  "Slept badly.",
  "Took this on the prop account to stay under the daily limit.",
  "Checked the 1h chart first this time.",
  "Volume was thin. Holiday week.",
  "Had to leave halfway, set a bracket.",
  "Wrote the plan down before the open.",
  "Didn't check the calendar before the open.",
];

const clockTime = (minutes) => {
  minutes = ((minutes % 1440) + 1440) % 1440;
  return (
    String(Math.floor(minutes / 60)).padStart(2, "0") +
    ":" +
    String(minutes % 60).padStart(2, "0")
  );
};

const roundTo = (value, step) => Math.round(value / step) * step;

const fixed2 = (value) => value.toFixed(2);

function randomTools(rand) {
  const between = (min, max) => min + rand() * (max - min);
  return {
    between,
    int: (min, max) => Math.floor(between(min, max + 1)),
    pick: (list) => list[Math.floor(rand() * list.length)],
    weighted: (items) => {
      const total = items.reduce((sum, item) => sum + item[1], 0);
      let roll = rand() * total;
      for (const item of items) {
        if ((roll -= item[1]) <= 0) {
          return item;
        }
      }
      return items[items.length - 1];
    },
    fill: (template, vars) =>
      template.replace(/\{(\w+)\}/g, (match, key) => vars[key]),
  };
}

export function generateDemoTrades(seed = DEMO_SEED) {
  const rand = seededRandom(seed),
    { between, int, pick, weighted, fill } = randomTools(rand),
    prices = Object.fromEntries(
      Object.entries(DEMO_MARKETS).map(([sym, market]) => [sym, market.px]),
    ),
    trades = [];
  let forcedSlips = 0,
    slumpStarted = false,
    seq = 0;
  const start = new Date(DEMO_START + "T00:00:00");
  for (let dayIndex = 0; dayIndex < DEMO_WEEKS * 7; dayIndex++) {
    const day = new Date(start);
    day.setDate(start.getDate() + dayIndex);
    for (const sym of Object.keys(prices)) {
      prices[sym] += (rand() - 0.48) * DEMO_MARKETS[sym].vol;
    }
    prices.XAUUSD = prices.MGC - 2 + rand() * 4;
    if (day.getDay() === 0 || day.getDay() === 6) {
      continue;
    }
    const week = Math.floor(dayIndex / 7),
      phase = DEMO_PHASES.find((ph) => week < ph.until);
    if (week === SLUMP_WEEK && !slumpStarted) {
      slumpStarted = true;
      forcedSlips = SLUMP_TRADES;
    }
    const tradesToday = weighted(
        phase.day.map((weight, count) => [count, weight]),
      )[0],
      date = isoDate(day);
    let lastExitMin = null,
      lastSession = null;
    for (let tradeIndex = 0; tradeIndex < tradesToday; tradeIndex++) {
      const instrument = weighted(DEMO_INSTRUMENT_MIX)[0],
        market = DEMO_MARKETS[instrument],
        [session, , window] = lastSession
          ? [lastSession, 0, [lastExitMin + 5, lastExitMin + 50]]
          : weighted(DEMO_SESSIONS);
      lastSession = session;
      const entryMin = Math.round(between(window[0], window[1])),
        dir = rand() < 0.56 ? "Long" : "Short",
        sign = dir === "Long" ? 1 : -1,
        forced = forcedSlips > 0;
      if (forced) {
        forcedSlips--;
      }
      const slipped = forced ? rand() < 0.8 : rand() < phase.slip,
        mistake = slipped
          ? pick(week >= 8 && week < 12 ? SLUMP_MISTAKES : DEMO_MISTAKES)
          : week >= 6 && week < 8 && rand() < 0.15
            ? "Oversized"
            : rand() < 0.88
              ? "None"
              : "",
        copyTrader =
          rand() < 0.2
            ? instrument === "MGC" || instrument === "XAUUSD"
              ? "Gold group"
              : pick(DEMO_COPY_TRADERS)
            : "",
        strategy = weighted(DEMO_STRATEGIES),
        strats = [strategy[0]];
      if (rand() < 0.22) {
        const extra = weighted(DEMO_STRATEGIES)[0];
        if (extra !== strategy[0]) {
          strats.push(extra);
        }
      }
      const edge =
        strategy[2] +
        (COPY_TRADER_EDGE[copyTrader] || 0) +
        (slipped ? -0.18 : 0.06);
      let size = int(market.size[0], market.size[1]);
      if (mistake === "Oversized") {
        size = instrument === "XAUUSD" ? size * 2 : size + 2;
      }
      const stopDist =
          roundTo(between(market.stop[0], market.stop[1]), market.tick) ||
          market.tick * 8,
        entryPx = roundTo(
          prices[instrument] + (rand() - 0.5) * market.vol * 0.4,
          market.tick,
        ),
        stopPx = roundTo(entryPx - sign * stopDist, market.tick),
        targetR = between(1.5, 3),
        targetPx = roundTo(entryPx + sign * stopDist * targetR, market.tick);
      let resultR,
        scratch = false;
      if (!forced && rand() < 0.07) {
        resultR = 0;
        scratch = true;
      } else {
        if (
          !forced &&
          rand() < Math.min(0.8, Math.max(0.12, phase.win + edge))
        ) {
          resultR =
            mistake === "Exited early"
              ? between(0.25, 0.7)
              : between(0.6, targetR + 0.2);
        } else {
          resultR =
            mistake === "Moved stop"
              ? -between(1.5, 2.6)
              : mistake === "Held too long"
                ? -between(1.05, 1.5)
                : -between(0.75, 1.02);
        }
      }
      let entryLegs = [
          {
            price: entryPx,
            contracts: size,
          },
        ],
        exitLegs;
      const priceAtR = (r) =>
        roundTo(entryPx + sign * stopDist * r, market.tick);
      if (size >= 2 && resultR > 0.5 && rand() < 0.4) {
        const half = Math.floor(size / 2),
          rest = size - half,
          firstR = Math.min(1, resultR * 0.6);
        exitLegs = [
          {
            price: priceAtR(firstR),
            contracts: half,
          },
          {
            price: priceAtR((resultR * size - firstR * half) / rest),
            contracts: rest,
          },
        ];
      } else {
        exitLegs = [
          {
            price: priceAtR(resultR),
            contracts: size,
          },
        ];
      }
      if (size >= 2 && size % 2 === 0 && rand() < 0.12) {
        const offset = roundTo(stopDist * 0.3, market.tick);
        entryLegs = [
          {
            price: entryPx + sign * offset,
            contracts: size / 2,
          },
          {
            price: entryPx - sign * offset,
            contracts: size / 2,
          },
        ];
      }
      const commission = +(DEMO_COMMISSION[instrument] * size).toFixed(2),
        calc = computeTrade({
          entryLegs,
          exitLegs,
          stop: stopPx,
          target: targetPx,
          instrument,
          dir,
          commission,
        }),
        outcome = scratch ? "BE" : calc.net > 0 ? "W" : "L",
        holdMin =
          resultR === 0
            ? int(4, 25)
            : strats.includes("Scalp")
              ? int(1, 6)
              : mistake === "Held too long"
                ? int(70, 190)
                : mistake === "Exited early"
                  ? int(3, 14)
                  : resultR > 0
                    ? int(6, 55)
                    : int(10, 110),
        exitMin = entryMin + holdMin;
      lastExitMin = exitMin;
      const catalyst = pick(DEMO_CATALYSTS[session]),
        vars = {
          r: Math.round(stopDist * 2),
          way: dir === "Long" ? "up" : "down",
          lvl: dir === "Long" ? "high" : "low",
          cat: catalyst || "The data",
        },
        confidence = slipped
          ? mistake === "Oversized" || mistake === "FOMO entry"
            ? 5
            : int(1, 3)
          : int(3, 5),
        trade = {
          id: "demo-" + String(++seq).padStart(3, "0"),
          date,
          entryTime: clockTime(entryMin),
          instrument,
          account: rand() < 0.36 ? "Prop" : "Live",
          dir,
          session,
          marketCondition:
            strats[0] === "Trend continuation"
              ? "Trending"
              : catalyst &&
                  catalyst !== "NY open" &&
                  catalyst !== "London open" &&
                  catalyst !== "Asia range"
                ? "News-driven"
                : pick(["Trending", "Ranging", "Choppy", "Ranging"]),
          contracts: String(calc.contracts),
          entry: calc.entry.toFixed(2),
          stop: fixed2(stopPx),
          target: fixed2(targetPx),
          rr: calc.rr != null ? "1 : " + calc.rr.toFixed(2) : "",
          ticksRisk: calc.ticks != null ? calc.ticks.toFixed(2) + " pts" : "",
          catalyst,
          strat: strats.join(" | "),
          ct: copyTrader,
          thesis: fill(pick(DEMO_THESES[strats[0]]), vars),
          conf: String(confidence),
          emo: slipped ? MISTAKE_EMOTION[mistake] : pick(CALM_EMOTIONS),
          exit: calc.exit.toFixed(2),
          exitTime: clockTime(exitMin),
          managedStop:
            (outcome === "W" && rand() < 0.35) || scratch
              ? fixed2(entryPx)
              : "",
          grossPnl: calc.gross.toFixed(2),
          commission: commission ? commission.toFixed(2) : "",
          netPnl: calc.net.toFixed(2),
          outcome,
          post: slipped
            ? MISTAKE_POST_TRADE[mistake]
            : pick(DEMO_POST_TRADE[outcome]),
          right: pick(
            slipped ? DEMO_WENT_RIGHT.slip : DEMO_WENT_RIGHT[outcome],
          ),
          lesson: slipped
            ? DEMO_LESSONS[mistake]
            : rand() < 0.6
              ? DEMO_LESSONS[outcome]
              : "",
          mistake,
          chart: "",
          notes: "",
        },
        note = rand() < 0.3 ? pick(DEMO_NOTES) : "";
      trade.notes = packLegs(note, entryLegs, exitLegs);
      trades.push(trade);
    }
  }
  return trades;
}
