# Trade Journal: Privacy

Trade Journal is a personal project by Ethan Tam. It's a futures trading journal for MES, MNQ, MGC and XAUUSD. It has no server and no database of its own, and it doesn't use analytics or ads. This page says what data touches the service and where it goes.

## Where your trades go

- **Sign in with Google:** trades are saved to a private spreadsheet called "Trade Journal" in your own Google Drive, and screenshots to a private "Trade Journal screenshots" folder next to it. Nobody else can open them unless you share them. The app asks only for the `drive.file` permission, so it can see and change files it created and nothing else in your Drive.
- **Your own Apps Script:** trades go to your sheet through a script you deploy yourself. Its web app URL works like a password: anyone who has it can read and change your trades.
- **This device:** trades stay in your browser's local storage. Anyone who uses that browser can see them. Settings has a button to delete them.
- **Demo mode:** sample data in memory. Nothing is saved.

## Google data

Your Google access token is kept in this browser tab only and expires after about an hour. Data from Google is shown to you in the app and is not sent anywhere else, sold, or shared. The app's use of information received from Google APIs follows the [Google API Services User Data Policy](https://developers.google.com/terms/api-services-user-data-policy), including the Limited Use requirements.

To remove access, open Settings, then Reset, or go to [your Google account permissions](https://myaccount.google.com/permissions). Your sheet stays in your Drive until you delete it.

## Screenshots

With Sign in with Google, screenshots stay private in your Drive. On this device, they stay in your browser's own storage. Only the older Apps Script setup can use imgbb, if you add a key, and anyone with an imgbb link can open it.

## Signing out

Settings, then Sign out, revokes the app's Google access and removes this app's settings from the browser.

## What is not done

- No ads, no analytics, no tracking pixels, no cross-site tracking.
- No selling or sharing of personal data.

## Changes

If this policy changes in a way that matters, the app will say so before it takes effect.

## Contact

[eatentam@gmail.com](mailto:eatentam@gmail.com)
