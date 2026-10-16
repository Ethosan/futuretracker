# Trade Journal

A personal futures trading journal for **MES, MNQ, MGC and XAUUSD**. Trades are saved to **your own Google Sheet** through a small Apps Script, or just to the browser you're using. Either way you keep the data and nothing runs on someone else's server.

I built it to find out why my account kept going down. It showed me: the trades where I broke a rule lost more than the clean ones made.

**Live:** [futuretracker.netlify.app](https://futuretracker.netlify.app). Add [`?demo`](https://futuretracker.netlify.app/?demo) to try it with sample data.

- **Log trades** with scale-in / scale-out legs. Average entry, points and dollars risked, planned R:R, gross and net P&L, and the **R multiple** are worked out as you type.
- **Tag everything:** strategies (multi-select), copy trader, session, market condition, confidence, emotion, mistakes, a screenshot (drag, drop or paste; uploaded to imgbb) and written review notes.
- **Trade log** grouped by day, with today's tally, filters and **CSV export**.
- **Stats:** win rate, expectancy, profit factor, payoff ratio, average and total R, streaks, max drawdown, and win-rate breakdowns by copy trader, instrument, strategy, session, weekday, direction, confidence and hold time. **What mistakes cost:** each mistake's total P&L, and trades with a mistake against trades without one.
- **Charts:** equity curve, strategy, session, weekday, long vs short, instruments, copy traders, mistakes.
- **Review:** weekly or monthly report cards.
- **Heatmap:** a year of daily P&L. Tap a day to see its trades.
- **Live / Prop** account filter across every view. Installable and usable on a phone.
- **CSV export and import** in sheet column order, legs included, for backups and moving between storage options.
- **Checks before saving:** instrument, Long or Short, entry and exit prices, a stop and target on the right side of the entry, and no more contracts out than in. If you don't pick Win, Loss or BE, the P&L decides. A leg with no lots uses the Contracts field.
- **Delete a trade** from its detail panel. (Apps Script users: paste the new `Code.gs` and make a New deployment for this.)

## Demo

[`?demo`](https://futuretracker.netlify.app/?demo), or **Try the demo** on the setup screen, loads about 120 made-up trades from May to October 2026 on MES, MNQ, MGC and a few XAUUSD. It ends a little down, with a real drawdown, an 8-trade losing streak and a couple of good weeks.

- The data comes from a seeded generator in [`src/lib/demo.js`](src/lib/demo.js), so it is the same every time. Every trade goes through the form's own maths (`computeTrade`).
- It lives in memory. Logging and editing work, but nothing is written to localStorage or a sheet, and a saved setup on the same device is left alone. **Exit demo** reloads without `?demo`.
- `tests/demo.test.js` checks the data against every stats function and that demo mode never calls the Sheets client.

## Where trades are kept

| Option | How | Good for |
|---|---|---|
| Sign in with Google | The app makes a "Trade Journal" sheet in your Drive | Most people: no setup, every device |
| Your own Apps Script | Your own Apps Script web app (below) | The older way, still works |
| This device | Browser localStorage, no account | Trying it properly, or one phone only |
| Demo | Memory, gone on reload | Looking around |

Device-only trades stay in that one browser on that one web address. Use **Export CSV** in the Trade Log to back them up. To move to a sheet: export, connect the sheet in **Settings**, then **Import CSV**. Import skips trades whose id is already there.

## Moving from Apps Script to Sign in with Google

Needs the Google client ID set up first (see "Sign in with Google" below).

1. Open the journal where your trades show up (the device with your Apps Script URL), online.
2. **Settings → Where trades are kept → Move to Google sign-in.** Pick your Google account in the pop-up.
3. It downloads a backup CSV of every trade, copies them to a private "Trade Journal" sheet in your Drive, checks every one arrived, then switches. If anything fails, nothing is switched and the message says why.
4. A bar says how many trades moved. Open **Trade Log** and check the count matches.
5. Last step, in the Apps Script editor: **Deploy → Manage deployments**, pick the web app, **Archive**. The old URL then stops working. The old sheet isn't changed; keep it as a backup or delete it later.
6. Other devices: open the journal, Settings → Reset, then **Continue with Google**. It finds the same sheet.

Going back, if something looks wrong before you archive: Settings → Sign out, then set up the Apps Script URL again. The old sheet still has everything, and the backup CSV can be imported anywhere. Screenshots that were on imgbb keep their imgbb links; delete them in your imgbb account if you don't want public copies.

## Installable app (PWA)

- **Install:** Settings → App → **Install** (Chrome, Edge, Android). On iPhone or iPad: Safari → Share → Add to Home Screen; Settings says so on those devices. Home-screen shortcuts open Log a trade, Trade log and Stats.
- **Works offline:** the service worker saves every file of the build on install, so the app opens with no signal. It is generated at build time by `vite.config.js` from `src/sw.js`, with the file list and a version hash. It never touches trade data: Google, Apps Script and imgbb are other origins.
- **Logging offline (Google sheet modes):** saves, edits and deletes with no connection, or after Google sign-in runs out, wait in an outbox (`src/lib/offline.js`) and go to the sheet in order when you're back. The Trade Log marks them "not synced" and the status line counts them. The last loaded trades are kept so the app opens offline. Both are removed on sign out, which warns if anything hasn't synced. Device and demo modes are already offline.
- **Updates:** a new version downloads in the background and a "New version ready" bar offers Reload, so a half-typed trade is never lost to a surprise refresh.
- **Back button and links:** each screen has its own address (`#stats`, `#trade-log`...), so the back button works in the installed app and links open the right screen.

## Security and privacy

- **No server of ours.** Trades go straight from the browser to the user's own Google Drive, their own Apps Script, or their own browser storage.
- **Sign in with Google** uses only the `drive.file` permission: the app can open files it made, nothing else in the Drive. The sheet and the screenshots folder are private to the user. The access token lives in the tab (sessionStorage) for about an hour. **Sign out** revokes it and removes the app's settings from the browser.
- **Screenshots stay private.** Google mode: files in a private Drive folder, fetched with the token. This device and the demo: the browser's own IndexedDB. imgbb (public links) is only used by Apps Script setups that already have a key.
- **Content Security Policy** in `netlify.toml`: scripts only from this site, Google sign-in and Apps Script; data only to Sheets, Drive, Google sign-in and imgbb. No inline scripts. Plus HSTS, `X-Frame-Options: DENY`, `nosniff`, and a pop-up-safe COOP for Google sign-in.
- **Spreadsheet formulas:** Google mode writes cells as raw text, so nothing typed is ever run as a formula. Apps Script writes and CSV exports put an apostrophe in front of text that looks like a formula (`=`, `+`, `@`, `-` before non-numbers). CSV import takes it off again.
- **Everything shown on screen is escaped**, including imported CSVs and sheet contents.
- **Apps Script mode** is the weakest: the web app runs as "Anyone", so its URL works like a password, and JSONP sends rows in the URL. **Settings → Move to Google sign-in** copies every trade (and device screenshots) into a private Google sheet, checks they all arrived, switches, and forgets the Apps Script URL and imgbb key. Then delete the old deployment in Apps Script. The script also now only accepts a plain function name as its JSONP callback.
- **This device** mode is as private as the browser profile. Settings has **Delete trades on this device** (screenshots too), and **Move to Google sign-in** for a backup on every device.

`tests/security.test.js` covers the formula guard and private screenshots; `tests/demo.test.js` checks demo mode makes no network calls and writes nothing.

## Sign in with Google (setup for whoever hosts the app)

Users just press **Sign in with Google**. The app finds its "Trade Journal" sheet in their Drive, or makes one, and talks to it with the Sheets API from the browser. It asks only for `drive.file`, so it sees files it made and nothing else. The token stays in the tab for about an hour; after that a **Sign in** bar appears. Signing in on another device finds the same sheet.

The option is hidden until the build has a Google OAuth client ID. To set one up (once):

1. [Google Cloud console](https://console.cloud.google.com): create a project, e.g. "Trade Journal".
2. **APIs & Services → Library:** enable **Google Sheets API** and **Google Drive API**.
3. **Google Auth Platform → Branding:** app name "Trade Journal", your email, home page `https://futuretracker.netlify.app`, privacy policy `https://futuretracker.netlify.app/privacy.html`. Authorized domains: `futuretracker.netlify.app`, and `ethantam.dev` once the custom domain is live.
4. **Audience:** External. It starts in **Testing**, where only the test users you add (up to 100) can sign in. Add your own Google account. Press **Publish app** when you want anyone to be able to use it.
5. **Data access:** add the scope `https://www.googleapis.com/auth/drive.file`. It is a non-sensitive scope, so publishing shouldn't need Google's security review.
6. **Clients → Create client → Web application.** Authorized JavaScript origins: `https://futuretracker.netlify.app`, `https://futuretracker.ethantam.dev`, `http://localhost:5173`. No redirect URIs.
7. Copy the client ID (`….apps.googleusercontent.com`). It is not a secret.
8. **Netlify → Site configuration → Environment variables:** add `VITE_GOOGLE_CLIENT_ID` with that value, then **Deploys → Trigger deploy**. Locally, put the same line in `.env.local`.

If sign-in does nothing, the browser probably blocked the pop-up: allow pop-ups for the site.

## Apps Script setup (once per device)

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
  google-auth.js        Google sign-in (Identity Services token pop-up)
  lib/                  pure logic, unit tested
    calc.js             trade maths, R multiple, legs encoding
    stats.js            summaries, breakdowns, periods, heatmap data
    sheets.js           JSONP client for the Apps Script
    google.js           Sheets and Drive API client for "Sign in with Google"
    stores.js           device (localStorage) and in-memory stores, same shape as the sheet client
    rows.js             stored row to trade object
    csv.js              CSV export and import
    demo.js             seeded sample journal for demo mode
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
  sw.js                 service worker source (built into /sw.js by vite.config.js)
public/                 icons, manifest, install screenshots, privacy page
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

## Moving to futuretracker.ethantam.dev

Not set up yet. The app needs no code changes for it: every path is absolute from the root, the manifest and service worker use `/`, and the Apps Script accepts calls from any origin. The steps:

1. **Before switching**, on each device that uses "This device" storage: Trade Log → **Export CSV**. localStorage is tied to the web address, so those trades won't follow on their own. (Sheet users only need their Apps Script URL.)
2. **Netlify:** Domain management → Add a domain → `futuretracker.ethantam.dev`.
3. **Cloudflare DNS** for ethantam.dev: add `CNAME futuretracker → futuretracker.netlify.app`, **DNS only** (grey cloud), so Netlify can issue the certificate.
4. In Netlify, wait for HTTPS, then make it the primary domain. Netlify then redirects `futuretracker.netlify.app` to it, `?demo` included.
5. Open the new address on each device: sign in with Google again (same sheet), paste the Apps Script URL again, or pick "Use it on this device" and **Import CSV**. The Google client already lists `https://futuretracker.ethantam.dev` as an origin if you followed the steps above.
6. Update the links on ethantam.dev (the Trade Journal card and `journal` in the terminal in `main.js`) to `https://futuretracker.ethantam.dev/?demo`, and the Live link at the top of this README.
