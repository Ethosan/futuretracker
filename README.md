# Trade Journal

A futures trading journal for MES, MNQ, MGC and XAUUSD. Log each trade with what you felt and what you did wrong, then see where the money goes. Has a demo mode. Installable as a PWA.

> **This repository holds the live built files recovered from Netlify, not the original source.**
> The files in `assets/` are minified Vite output. The original source code was not recovered, so changes have to be made either in the built files or by rebuilding the app from scratch.

| | |
| --- | --- |
| **Live** | https://futuretracker.ethantam.dev |
| **Hosting** | Netlify site `futuretracker` |
| **Data** | Your own Google Drive (Google sign-in, `drive.file` scope) or this device (`localStorage` / IndexedDB). |
| **Settings** | The Google OAuth client ID was compiled into the bundle at build time. Its authorised JavaScript origins in Google Cloud Console must include the live address. The original environment variable names aren't recoverable from the built files. |
| **Repository** | [gitlab.com/eatentam/futuretracker](https://gitlab.com/eatentam/futuretracker) |

## Run locally

No install or build step. Serve the folder with any static server:

```sh
npx serve .
```

Then open the address it prints. Opening `index.html` straight from disk won't work, because the service worker and absolute `/assets/` paths need a server.

## Deploy

`netlify.toml` is the one from the original source. It still says `command = "npm run build"` and `publish = "dist"`, which won't work from this repository (there is no `package.json` and no `dist/`). To redeploy from here, clear the build command and set the publish directory to the repository root (`.`).

## Files

| Path | What it is |
| --- | --- |
| `index.html` | App shell |
| `assets/` | Built JavaScript and CSS (minified) |
| `manifest.*`, icons | PWA install metadata and icons |
| `sw.js` | Service worker (offline cache) |
| `privacy.html`, `terms.html` | Privacy policy and terms (needed for Google sign-in) |
| `screenshots/` | PWA install screenshots |
| `netlify.toml` | Netlify headers (see *Deploy*) |
