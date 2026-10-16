/* Trade screenshots, kept privately wherever the trades are:
   - Sign in with Google: a private folder in the user's Drive ("drive:<id>")
   - This device and the demo: the browser's own storage ("device:<id>")
   - Apps Script: imgbb if the user added a key (public link), else this device
   Plain URLs from older trades still show. */
import { S, storageMode } from "../state.js";
import { createDriveImages, isDriveRef } from "../lib/google.js";
import { createDeviceImages, isDeviceRef, idbKv, memoryKv } from "../lib/device-images.js";
import { getToken, tokenExpired } from "../google-auth.js";

let drive = null, device = null, deviceDb = null;
const driveImages = () => (drive ||= createDriveImages({ getToken, onExpired: tokenExpired }));
export const deviceStore = () => (deviceDb ||= idbKv());
const deviceImages = () => (device ||= createDeviceImages(S.demo ? memoryKv() : deviceStore()));

/* Where a new screenshot goes. */
export function uploadTarget() {
  const mode = storageMode();
  if (mode === "google") return "drive";
  if (mode === "sheet" && S.cfg?.imgbbKey) return "imgbb";
  return "device";
}

export const uploadPrivate = file => (uploadTarget() === "drive"
  ? driveImages().upload(file, `Trade screenshot ${new Date().toISOString().slice(0, 16).replace("T", " ")}`)
  : deviceImages().upload(file));

/* Point an <img> at a screenshot. Calls onFail (default: hide it) if it can't load. */
export async function showScreenshot(img, ref, onFail = () => { img.hidden = true; }) {
  img.addEventListener("error", onFail, { once: true });
  try {
    if (isDriveRef(ref)) img.src = await driveImages().objectUrl(ref);
    else if (isDeviceRef(ref)) img.src = await deviceImages().objectUrl(ref);
    else img.src = ref;
  } catch {
    onFail();
  }
}

export function describeRef(ref) {
  if (isDriveRef(ref)) return "Saved privately in your Google Drive";
  if (isDeviceRef(ref)) return "Saved privately on this device";
  return ref;
}

/* Delete a device screenshot along with its trade. Drive files stay in the user's Drive. */
export function forgetScreenshot(ref) {
  if (isDeviceRef(ref)) return deviceImages().remove(ref).catch(() => {});
}

/* Moving to Google: copy a device screenshot into Drive and return the new ref. */
export async function screenshotToDrive(ref) {
  if (!isDeviceRef(ref)) return ref;
  const blob = await deviceImages().blob(ref).catch(() => null);
  return blob ? driveImages().upload(blob, "Trade screenshot (moved)") : "";
}
