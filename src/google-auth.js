/* Google sign-in for "Sign in with Google" mode, using Google Identity
   Services' token popup. No backend: the access token lives in this tab
   (sessionStorage) for its hour and is asked for again after that.

   Set VITE_GOOGLE_CLIENT_ID at build time (Netlify environment variable).
   Without it the Google option stays hidden. */
import { NeedsSignIn } from "./lib/google.js";

export const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || "";
export const googleEnabled = () => !!GOOGLE_CLIENT_ID;

const SCOPE = "https://www.googleapis.com/auth/drive.file";
const TOKEN_KEY = "tj_gtoken";

let token = null;
try { token = JSON.parse(sessionStorage.getItem(TOKEN_KEY)); } catch { /* none */ }
let client = null;
let pending = null;
let handlers = null;
let script = null;

/* Load the GIS script early so the popup can open straight from a tap. */
export function preloadGoogle() {
  if (!googleEnabled() || script) return script;
  script = new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://accounts.google.com/gsi/client";
    s.async = true;
    s.onload = resolve;
    s.onerror = () => { script = null; reject(new Error("Couldn't load Google sign-in.")); };
    document.head.appendChild(s);
  });
  return script;
}

const valid = () => token && Date.now() < token.expires - 60_000;

export function forgetToken() {
  token = null;
  sessionStorage.removeItem(TOKEN_KEY);
}

function needSignIn() {
  dispatchEvent(new Event("tj:needs-signin"));
  return new NeedsSignIn();
}

/* An access token. Opens Google's popup only during a tap (browsers block it
   otherwise); without one it asks the app to show a "Sign in" button. */
export async function getToken({ interactive = navigator.userActivation?.isActive ?? true } = {}) {
  if (valid()) return token.value;
  if (!interactive) throw needSignIn();
  await preloadGoogle();
  /* Handlers live outside the client and are passed in its config, so a
     closed or blocked pop-up (error_callback) always settles the promise. */
  client ||= window.google.accounts.oauth2.initTokenClient({
    client_id: GOOGLE_CLIENT_ID,
    scope: SCOPE,
    callback: r => handlers?.done(r),
    error_callback: () => handlers?.fail(),
  });
  pending ||= new Promise((resolve, reject) => {
    handlers = {
      done(r) {
        pending = handlers = null;
        if (r.error) { reject(needSignIn()); return; }
        token = { value: r.access_token, expires: Date.now() + Number(r.expires_in) * 1000 };
        sessionStorage.setItem(TOKEN_KEY, JSON.stringify(token));
        resolve(token.value);
      },
      fail() { pending = handlers = null; reject(needSignIn()); },
    };
    client.requestAccessToken({ prompt: "" });
  });
  return pending;
}

/* Google said 401: drop the token so the next tap signs in again. */
export function tokenExpired() {
  forgetToken();
  needSignIn();
}

export function signOut() {
  if (token && window.google?.accounts?.oauth2) window.google.accounts.oauth2.revoke(token.value, () => {});
  forgetToken();
}
