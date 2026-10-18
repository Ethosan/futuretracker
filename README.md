# Trade Journal

A futures trading journal for MES, MNQ, MGC and XAUUSD. Log each trade with what you felt and what you did wrong, then see where the money goes. Has a demo mode. Installable as a PWA.

| | |
| --- | --- |
| **Live** | https://futuretracker.ethantam.dev |
| **Demo** | https://futuretracker.ethantam.dev/?demo |
| **Hosting** | Netlify site `futuretracker`: build `npm run build`, publish `dist` (set in `netlify.toml`) |
| **Data** | Your own Google Drive (Google sign-in, `drive.file` scope), a Google Sheet through your own Apps Script, or this device (`localStorage` / IndexedDB). |
| **Settings** | `VITE_GOOGLE_CLIENT_ID` (optional): the Google OAuth client ID. Without it the build uses the ID the live site has always used. Its authorised JavaScript origins in Google Cloud Console must include the live address. |
| **Repository** | [gitlab.com/eatentam/futuretracker](https://gitlab.com/eatentam/futuretracker) |

> **About this source.** The original source was only on GitHub, and that account was suspended in October 2026. This code was rebuilt on 19 Oct 2026 from the live site's built files. The names, comments and file layout are new, but the behaviour is the same: the rebuilt app was checked against the live one in demo mode, screen by screen (139 screens, including charts pixel for pixel, logging a trade, and the first-run setup screen), with no differences.

## Run locally

```sh
npm install
npm run dev      # http://localhost:5173, add ?demo for demo data
npm run build    # production build in dist/
```

Needs Node 22 (the version Netlify builds with).

## Files

| Path | What it is |
| --- | --- |
| `index.html` | App shell: every screen's markup |
| `src/main.js` | Start-up, navigation between screens |
| `src/views/` | One file per screen: Log Trade, Trade Log, Stats, Charts, Heatmap, Review, the trade panel, and setup/settings |
| `src/trade.js` | Trade maths: average fills, P&L, risk, R, validation |
| `src/stats.js` | Win rate, expectancy, streaks, drawdown and the breakdowns |
| `src/stores/` | Where trades are kept: this browser, Apps Script, and the offline outbox |
| `src/google/` | Google sign-in, the Sheets backend, Drive screenshots |
| `src/demo.js` | The demo data (same trades every time, from a fixed seed) |
| `src/apps-script.gs` | The Apps Script the setup screen tells you to paste into your sheet |
| `src/style.css` | All styles |
| `sw.js` | Service worker. The build adds the list of files to cache and a version in front of it (see `vite.config.js`) |
| `public/` | Icons, manifest, privacy and terms pages, install screenshots |
| `netlify.toml` | Build settings and security headers |
