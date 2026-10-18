// Google sign-in (Google Identity Services token client) for Sheets and Drive.
import { NeedsSignIn } from "./sheets.js";

// OAuth web client ID (not a secret). Set VITE_GOOGLE_CLIENT_ID to use another one.
const GOOGLE_CLIENT_ID =
  import.meta.env.VITE_GOOGLE_CLIENT_ID ||
  "827053407069-8kqvukftrtufd4q7scst7bonnuo08qan.apps.googleusercontent.com";

const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.file";

const TOKEN_KEY = "tj_gtoken";

let token = null;

try {
  token = JSON.parse(sessionStorage.getItem(TOKEN_KEY));
} catch {}

let tokenClient = null;

let pendingToken = null;

let pendingRequest = null;

let gsiLoading = null;

export function loadGsi() {
  return (gsiLoading ||= new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.onload = resolve;
    script.onerror = () => {
      gsiLoading = null;
      reject(new Error("Couldn't load Google sign-in."));
    };
    document.head.appendChild(script);
  }));
}

const tokenValid = () => token && Date.now() < token.expires - 60000;

function clearToken() {
  token = null;
  sessionStorage.removeItem(TOKEN_KEY);
}

function signInNeeded() {
  dispatchEvent(new Event("tj:needs-signin"));
  return new NeedsSignIn();
}

export async function getToken({
  interactive = navigator.userActivation?.isActive ?? true,
} = {}) {
  if (tokenValid()) {
    return token.value;
  }
  if (!interactive) {
    throw signInNeeded();
  }
  await loadGsi();
  tokenClient ||= window.google.accounts.oauth2.initTokenClient({
    client_id: GOOGLE_CLIENT_ID,
    scope: DRIVE_SCOPE,
    callback: (res) => pendingRequest?.done(res),
    error_callback: () => pendingRequest?.fail(),
  });
  pendingToken ||= new Promise((resolve, reject) => {
    pendingRequest = {
      done(res) {
        pendingToken = pendingRequest = null;
        if (res.error) {
          reject(signInNeeded());
          return;
        }
        token = {
          value: res.access_token,
          expires: Date.now() + Number(res.expires_in) * 1000,
        };
        sessionStorage.setItem(TOKEN_KEY, JSON.stringify(token));
        resolve(token.value);
      },
      fail() {
        pendingToken = pendingRequest = null;
        reject(signInNeeded());
      },
    };
    tokenClient.requestAccessToken({
      prompt: "",
    });
  });
  return pendingToken;
}

export function tokenExpired() {
  clearToken();
  signInNeeded();
}

export function signOut() {
  if (token && window.google?.accounts?.oauth2) {
    window.google.accounts.oauth2.revoke(token.value, () => {});
  }
  clearToken();
}
