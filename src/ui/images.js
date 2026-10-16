/* Trade screenshots. In "Sign in with Google" mode they're private files in the
   user's Drive and are fetched with the token; otherwise they're plain URLs
   (imgbb, or one the user pasted). */
import { storageMode } from "../state.js";
import { createDriveImages, isDriveRef } from "../lib/google.js";
import { getToken, tokenExpired } from "../google-auth.js";

let drive = null;
const driveImages = () => (drive ||= createDriveImages({ getToken, onExpired: tokenExpired }));

export const privateImages = () => storageMode() === "google";

export function uploadPrivate(file) {
  return driveImages().upload(file, `Trade screenshot ${new Date().toISOString().slice(0, 16).replace("T", " ")}`);
}

/* Point an <img> at a screenshot. Hides it (via onFail) if it can't load. */
export async function showScreenshot(img, ref, onFail = () => { img.hidden = true; }) {
  img.addEventListener("error", onFail, { once: true });
  if (!isDriveRef(ref)) { img.src = ref; return; }
  try {
    img.src = await driveImages().objectUrl(ref);
  } catch {
    onFail();
  }
}

export const describeRef = ref => (isDriveRef(ref) ? "Saved privately in your Google Drive" : ref);
