# Trade Journal

A personal futures trading journal for **MES, MNQ, MGC and XAUUSD**. Every trade is saved to **your own Google Sheet** through a small Apps Script, so you keep the data and nothing runs on someone else's server.

- **Log trades** with scale-in / scale-out legs. Average entry, points and dollars risked, planned R:R, gross and net P&L, and the **R multiple** are worked out as you type.
- **Tag everything:** strategies (multi-select), copy trader, session, market condition, confidence, emotion, mistakes, a screenshot (drag, drop or paste; uploaded to imgbb) and written review notes.
- **Trade log** grouped by day, with today's tally, filters and **CSV export**.
- **Stats:** win rate, expectancy, profit factor, payoff ratio, average and total R, streaks, max drawdown, and win-rate breakdowns by copy trader, instrument, strategy, session, weekday, direction, confidence and hold time.
- **Charts:** equity curve, strategy, session, weekday, long vs short, instruments, copy traders, mistakes.
- **Review:** weekly or monthly report cards.
- **Heatmap:** a year of daily P&L. Tap a day to see its trades.
- **Live / Prop** account filter across every view. Installable and usable on a phone.

## Setup (once per device)

1. Create a Google Sheet ([sheets.new](https://sheets.new)).
2. **Extensions → Apps Script**, replace the code with [`apps-script/Code.gs`](apps-script/Code.gs), save.
3. **Deploy → New deployment → Web app**, *Execute as: Me*, *Who has access: Anyone*. Authorize, then copy the Web app URL (`https://script.google.com/macros/s/…/exec`).
4. Open the journal and paste the URL. It writes the header row for you.
5. Optional: add an [imgbb](https://api.imgbb.com) API key in **Settings** for screenshot uploads.

After editing the script, always make a **New deployment**. "Manage deployments" keeps serving the old code.

The URL and keys are stored in this browser's localStorage only.

### Sheet format

One row per trade, columns in the order listed in `COLS` in [`src/config.js`](src/config.js). Never reorder them; new columns go at the end. Multi-leg detail is appended to the `notes` cell after a `__LEGS__` marker.

## Project structure

```
index.html              page markup (all views)
apps-script/Code.gs     Google Apps Script backend (also shown on the setup screen)
src/
  main.js               boot, navigation, account filter, data loading
  config.js             sheet columns, instruments and point values, tag lists
  state.js              app state, config and copy traders in localStorage
  lib/                  pure logic, unit tested
    calc.js             trade maths, R multiple, legs encoding
    stats.js            summaries, breakdowns, periods, heatmap data
    sheets.js           JSONP client for the Apps Script and row parsing
    format.js           money, dates, durations, escaping
  ui/
    form.js             Log Trade form
    log.js              Trade Log table and CSV export
    detail.js           trade detail panel and day list
    stats-view.js       Stats
    charts-view.js      Charts (Chart.js)
    review-view.js      Review
    heatmap-view.js     Heatmap
    settings.js         setup screen and Settings
    dom.js              toast, sync status, small helpers
  styles/               tokens, base, shell, form, views, panels
public/                 icons, manifest, service worker
tests/                  Vitest tests for src/lib
```

## Develop

Needs Node 20 or newer.

```sh
npm install
npm run dev          # http://localhost:5173
npm test
```

| Script | What it does |
|---|---|
| `npm run dev` | Vite dev server with hot reload |
| `npm run build` | Production build into `dist/` |
| `npm run preview` | Serve the production build |
| `npm test` | Vitest unit tests |
| `npm run lint` | ESLint |
| `npm run audit:design` | [impeccable](https://www.npmjs.com/package/impeccable) design scan (`npx impeccable` if not installed) |

**New instrument?** Add it with its dollars-per-point to `POINT_VALUE` in `src/config.js` and to the selects in `index.html`.

## Deploy on Netlify

1. In Netlify: **Add new site → Import an existing project → GitHub →** `Ethosan/futuretracker`. (For an existing site: **Site configuration → Build & deploy → Link repository**.)
2. Netlify reads `netlify.toml`: build command `npm run build`, publish directory `dist`.
3. Every push to `main` deploys.

Saved settings live in the browser for the site's domain. If the Netlify domain changes, paste the Apps Script URL in once more. Your trades are in the sheet either way.
