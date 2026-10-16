/* Built-in sample journal for demo mode (?demo or "Try the demo").
   About 120 made-up trades from May to October 2026, generated from a seeded
   RNG so every visitor (and every test) gets the same journal. The story is
   deliberately not a winning one: a decent start, two good weeks, a drawdown
   with a long losing streak and a pile of mistakes, a reset, then chop that
   ends a little under break-even. Clean trades make money; tagged mistakes
   give it back. Every row goes through the same maths as the Log Trade form. */
import { computeTrade, encodeNotesWithLegs } from "./calc.js";
import { localISODate } from "./format.js";

export const DEMO_SEED = 57;
export const DEMO_START = "2026-05-11";
export const DEMO_WEEKS = 22;
export const DEMO_YEAR = 2026;
export const DEMO_COPY_TRADERS = ["Alerts room", "Gold group"];
export const DEMO_CONFIG = { mode: "demo", timezone: "", imgbbKey: "" };

/* mulberry32: small, fast, good enough for sample data. */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ------------------------------------------------------------- the story */
/* Weeks are counted from DEMO_START. `day` is the chance of 0, 1, 2 or 3 trades on a weekday. */
const PHASES = [
  { until: 4, win: 0.5, slip: 0.3, day: [0.2, 0.55, 0.25, 0] },     // May: finding a rhythm
  { until: 8, win: 0.6, slip: 0.15, day: [0.25, 0.5, 0.25, 0] },    // June: the good weeks
  { until: 12, win: 0.36, slip: 0.5, day: [0.25, 0.35, 0.25, 0.15] }, // July: drawdown, overtrading
  { until: 16, win: 0.52, slip: 0.2, day: [0.3, 0.55, 0.15, 0] },    // August: smaller, fewer
  { until: 22, win: 0.47, slip: 0.3, day: [0.25, 0.5, 0.25, 0] },    // Sep to Oct: chop
];
const STREAK_WEEK = 9;    // the week the losing streak starts
const STREAK_LEN = 7;

const INSTRUMENTS = [["MES", 0.44], ["MNQ", 0.3], ["MGC", 0.2], ["XAUUSD", 0.06]];
const SPEC = {
  //       start price, daily drift sd, tick, stop range (pts), usual size
  MES:    { px: 6480, vol: 45, tick: 0.25, stop: [4, 9], size: [1, 3] },
  MNQ:    { px: 23600, vol: 220, tick: 0.25, stop: [14, 34], size: [1, 2] },
  MGC:    { px: 3720, vol: 30, tick: 0.1, stop: [3, 7], size: [1, 2] },
  XAUUSD: { px: 3718, vol: 30, tick: 0.01, stop: [4, 9], size: [10, 20] },
};
const COMMISSION = { MES: 1.24, MNQ: 1.24, MGC: 1.74, XAUUSD: 0 };

/* Times are what I'd type in Singapore. */
const SESSIONS = [
  ["NY AM", 0.46, [21 * 60 + 30, 23 * 60 + 40]],
  ["London", 0.2, [15 * 60, 17 * 60 + 30]],
  ["Asia", 0.14, [8 * 60 + 45, 11 * 60 + 30]],
  ["NY PM", 0.12, [60, 3 * 60 + 30]],
  ["Overnight", 0.08, [5 * 60, 7 * 60 + 30]],
];
const CATALYSTS = {
  "NY AM": ["NY open", "NY open", "CPI", "Jobless claims", "Retail sales", ""],
  "NY PM": ["FOMC", "Powell speaking", "", ""],
  London: ["London open", "London open", "UK CPI", ""],
  Asia: ["Asia range", "China data", ""],
  Overnight: ["", ""],
};

/* Edge per strategy, added to the phase win rate. ORB and VWAP work; fades and news don't. */
const STRATS = [
  ["ORB", 0.22, 0.08], ["VWAP reclaim", 0.16, 0.06], ["Trend continuation", 0.12, 0.04],
  ["Support/resistance", 0.1, 0], ["Breakout", 0.1, -0.06], ["Mean reversion", 0.07, -0.03],
  ["Fade/reversal", 0.08, -0.1], ["News/macro play", 0.06, -0.08], ["ICT/SMC", 0.04, -0.08],
  ["Scalp", 0.05, -0.02],
];
const CT_EDGE = { "Alerts room": -0.06, "Gold group": 0.03 };

const MISTAKES_BAD = ["Revenge trade", "Moved stop", "Oversized", "FOMO entry", "Overtraded", "Chased entry", "Moved stop", "Revenge trade"];
const MISTAKES_USUAL = ["Chased entry", "Exited early", "Held too long", "No clear setup", "FOMO entry", "Moved stop", "Exited early"];
const MISTAKE_EMO = {
  "Moved stop": "Anxious", "Chased entry": "Impatient", Oversized: "Overconfident", "Held too long": "Hopeful",
  "Exited early": "Nervous", "No clear setup": "Bored", "Revenge trade": "Frustrated", "FOMO entry": "FOMO", Overtraded: "Tired",
};
const CALM = ["Calm", "Patient", "Focused", "Calm", "Neutral", "A bit tired"];

/* ------------------------------------------------------------------ words */
const THESIS = {
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
const POST = {
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
const POST_MISTAKE = {
  "Moved stop": "Price came for my stop and I moved it. Lost about twice what I planned.",
  "Revenge trade": "Took it straight after the last loss to win it back. There was no setup.",
  Oversized: "Doubled my size because the last few worked. It didn't.",
  "FOMO entry": "Saw it running and jumped in late.",
  Overtraded: "This was trade number four of the day. I should have stopped after two.",
  "Chased entry": "Entered well past my level. The stop was too far away for the target.",
  "Held too long": "Had it in profit, wanted more, gave it all back.",
  "Exited early": "Closed early on a small pullback. It went to my target without me.",
  "No clear setup": "Bored and clicked. Not a real setup.",
};
const RIGHT = {
  W: ["Waited for the retest.", "Took partials at 1R.", "Sized right and left it alone.", "Followed the plan."],
  L: ["Took the stop without touching it.", "Size was right, so the loss was small.", "Didn't add to a loser."],
  BE: ["Protected the trade once it moved.", "Got out flat instead of hoping."],
  slip: ["Logged it honestly.", "Stopped trading after this one.", "Not much."],
};
const LESSON = {
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
const NOTES = [
  "Phone only today.", "Spread was wide on the open.", "Slept badly.", "Took this on the prop account to stay under the daily limit.",
  "Checked the 1h chart first this time.", "Volume was thin. Holiday week.", "Had to leave halfway, set a bracket.",
  "Wrote the plan down before the open.", "Didn't check the calendar before the open.",
];

/* ----------------------------------------------------------------- helpers */
const fmtHM = m => { m = ((m % 1440) + 1440) % 1440; return String(Math.floor(m / 60)).padStart(2, "0") + ":" + String(m % 60).padStart(2, "0"); };
const roundTo = (v, tick) => Math.round(v / tick) * tick;
const fix = v => v.toFixed(2);

function pickers(rand) {
  const between = (a, b) => a + rand() * (b - a);
  const int = (a, b) => Math.floor(between(a, b + 1));
  const pick = arr => arr[Math.floor(rand() * arr.length)];
  const weighted = pairs => {
    const total = pairs.reduce((a, p) => a + p[1], 0);
    let x = rand() * total;
    for (const p of pairs) { if ((x -= p[1]) <= 0) return p; }
    return pairs[pairs.length - 1];
  };
  const fill = (s, vars) => s.replace(/\{(\w+)\}/g, (_, k) => vars[k]);
  return { between, int, pick, weighted, fill };
}

/* Sheet-shaped rows, exactly what the Log Trade form would save. */
export function generateDemoRows(seed = DEMO_SEED) {
  const rand = mulberry32(seed);
  const { between, int, pick, weighted, fill } = pickers(rand);
  const price = Object.fromEntries(Object.entries(SPEC).map(([k, s]) => [k, s.px]));
  const rows = [];
  let streakLeft = 0, streakStarted = false, id = 0;

  const start = new Date(DEMO_START + "T00:00:00");
  for (let d = 0; d < DEMO_WEEKS * 7; d++) {
    const day = new Date(start);
    day.setDate(start.getDate() + d);
    for (const k of Object.keys(price)) price[k] += (rand() - 0.48) * SPEC[k].vol;
    price.XAUUSD = price.MGC - 2 + rand() * 4;
    if (day.getDay() === 0 || day.getDay() === 6) continue;

    const week = Math.floor(d / 7);
    const phase = PHASES.find(p => week < p.until);
    if (week === STREAK_WEEK && !streakStarted) { streakStarted = true; streakLeft = STREAK_LEN; }
    const count = weighted(phase.day.map((p, n) => [n, p]))[0];
    const date = localISODate(day);
    let lastExit = null, lastSession = null;

    for (let n = 0; n < count; n++) {
      const instrument = weighted(INSTRUMENTS)[0];
      const spec = SPEC[instrument];
      /* Later trades on the same day follow the first one in the same session. */
      const [session, , window] = lastSession ? [lastSession, 0, [lastExit + 5, lastExit + 50]] : weighted(SESSIONS);
      lastSession = session;
      const entryMin = Math.round(between(window[0], window[1]));
      const dir = rand() < 0.56 ? "Long" : "Short";
      const sgn = dir === "Long" ? 1 : -1;

      const forcedLoss = streakLeft > 0;
      if (forcedLoss) streakLeft--;
      const slip = forcedLoss ? rand() < 0.8 : rand() < phase.slip;
      const mistake = slip ? pick(week >= 8 && week < 12 ? MISTAKES_BAD : MISTAKES_USUAL)
        : week >= 6 && week < 8 && rand() < 0.15 ? "Oversized" : rand() < 0.88 ? "None" : "";

      const ct = rand() < 0.2 ? (instrument === "MGC" || instrument === "XAUUSD" ? "Gold group" : pick(DEMO_COPY_TRADERS)) : "";
      const s1 = weighted(STRATS);
      const strats = [s1[0]];
      if (rand() < 0.22) { const s2 = weighted(STRATS)[0]; if (s2 !== s1[0]) strats.push(s2); }
      const edge = s1[2] + (CT_EDGE[ct] || 0) + (slip ? -0.18 : 0.06);

      let size = int(spec.size[0], spec.size[1]);
      if (mistake === "Oversized") size = instrument === "XAUUSD" ? size * 2 : size + 2;
      const stopPts = roundTo(between(spec.stop[0], spec.stop[1]), spec.tick) || spec.tick * 8;
      const entry = roundTo(price[instrument] + (rand() - 0.5) * spec.vol * 0.4, spec.tick);
      const stop = roundTo(entry - sgn * stopPts, spec.tick);
      const rrPlan = between(1.5, 3);
      const target = roundTo(entry + sgn * stopPts * rrPlan, spec.tick);

      /* Result in R before rounding to ticks. */
      let R, be = false;
      if (!forcedLoss && rand() < 0.07) { R = 0; be = true; }
      else if (!forcedLoss && rand() < Math.min(0.8, Math.max(0.12, phase.win + edge))) {
        R = mistake === "Exited early" ? between(0.25, 0.7) : between(0.6, rrPlan + 0.2);
      } else {
        R = mistake === "Moved stop" ? -between(1.5, 2.6) : mistake === "Held too long" ? -between(1.05, 1.5) : -between(0.75, 1.02);
      }

      /* Legs: some scale-outs on 2+ lots, a few scale-ins. */
      let entryLegs = [{ price: entry, contracts: size }];
      let exitLegs;
      const exitAt = r => roundTo(entry + sgn * stopPts * r, spec.tick);
      if (size >= 2 && R > 0.5 && rand() < 0.4) {
        const n1 = Math.floor(size / 2), n2 = size - n1;
        const r1 = Math.min(1, R * 0.6);
        exitLegs = [{ price: exitAt(r1), contracts: n1 }, { price: exitAt((R * size - r1 * n1) / n2), contracts: n2 }];
      } else {
        exitLegs = [{ price: exitAt(R), contracts: size }];
      }
      if (size >= 2 && size % 2 === 0 && rand() < 0.12) {
        const off = roundTo(stopPts * 0.3, spec.tick);
        entryLegs = [{ price: entry + sgn * off, contracts: size / 2 }, { price: entry - sgn * off, contracts: size / 2 }];
      }

      const commission = +(COMMISSION[instrument] * size).toFixed(2);
      const calc = computeTrade({ entryLegs, exitLegs, stop, target, instrument, dir, commission });
      const outcome = be ? "BE" : calc.net > 0 ? "W" : "L";

      /* Like most losing traders: winners cut quick, losers given room to "come back". */
      const hold = R === 0 ? int(4, 25) : strats.includes("Scalp") ? int(1, 6) : mistake === "Held too long" ? int(70, 190)
        : mistake === "Exited early" ? int(3, 14) : R > 0 ? int(6, 55) : int(10, 110);
      const exitMin = entryMin + hold;
      lastExit = exitMin;

      const cat = pick(CATALYSTS[session]);
      const vars = { r: Math.round(stopPts * 2), way: dir === "Long" ? "up" : "down", lvl: dir === "Long" ? "high" : "low", cat: cat || "The data" };
      const conf = slip ? (mistake === "Oversized" || mistake === "FOMO entry" ? 5 : int(1, 3)) : int(3, 5);
      const row = {
        id: "demo-" + String(++id).padStart(3, "0"),
        date,
        entryTime: fmtHM(entryMin),
        instrument,
        account: rand() < 0.36 ? "Prop" : "Live",
        dir,
        session,
        marketCondition: strats[0] === "Trend continuation" ? "Trending" : cat && cat !== "NY open" && cat !== "London open" && cat !== "Asia range" ? "News-driven" : pick(["Trending", "Ranging", "Choppy", "Ranging"]),
        contracts: String(calc.contracts),
        entry: calc.entry.toFixed(2),
        stop: fix(stop),
        target: fix(target),
        rr: calc.rr != null ? "1 : " + calc.rr.toFixed(2) : "",
        ticksRisk: calc.ticks != null ? calc.ticks.toFixed(2) + " pts" : "",
        catalyst: cat,
        strat: strats.join(" | "),
        ct,
        thesis: fill(pick(THESIS[strats[0]]), vars),
        conf: String(conf),
        emo: slip ? MISTAKE_EMO[mistake] : pick(CALM),
        exit: calc.exit.toFixed(2),
        exitTime: fmtHM(exitMin),
        managedStop: outcome === "W" && rand() < 0.35 ? fix(entry) : be ? fix(entry) : "",
        grossPnl: calc.gross.toFixed(2),
        commission: commission ? commission.toFixed(2) : "",
        netPnl: calc.net.toFixed(2),
        outcome,
        post: slip ? POST_MISTAKE[mistake] : pick(POST[outcome]),
        right: slip ? pick(RIGHT.slip) : pick(RIGHT[outcome]),
        lesson: slip ? LESSON[mistake] : rand() < 0.6 ? LESSON[outcome] : "",
        mistake,
        chart: "",
        notes: "",
      };
      const note = rand() < 0.3 ? pick(NOTES) : "";
      row.notes = encodeNotesWithLegs(note, entryLegs, exitLegs);
      rows.push(row);
    }
  }
  return rows;
}
