// Screenshots saved privately in a Google Drive folder.
import {
  DRIVE_FILES_API,
  DRIVE_UPLOAD_API,
  FOLDER_MIME,
  SCREENSHOT_FOLDER,
  findFileQuery,
  googleFetcher,
} from "./sheets.js";

const DRIVE_PREFIX = "drive:";

export const isDriveRef = (ref) =>
  typeof ref == "string" && ref.startsWith(DRIVE_PREFIX);

export function driveImages({ getToken, onExpired, fetch: fetchFn = fetch }) {
  const api = googleFetcher(getToken, fetchFn, onExpired);
  let folderId = null;
  const urls = new Map();
  async function folder() {
    return (folderId ||=
      (await api(findFileQuery(SCREENSHOT_FOLDER, FOLDER_MIME))).files?.[0]
        ?.id ||
      (
        await api(`${DRIVE_FILES_API}?fields=id`, {
          method: "POST",
          body: {
            name: SCREENSHOT_FOLDER,
            mimeType: FOLDER_MIME,
          },
        })
      ).id);
  }
  return {
    async upload(blob, name = "screenshot") {
      const meta = {
          name,
          parents: [await folder()],
        },
        boundary = "tj" + Math.random().toString(36).slice(2),
        body = new Blob([
          `--${boundary}\r
Content-Type: application/json; charset=UTF-8\r
\r
${JSON.stringify(meta)}\r
--${boundary}\r
Content-Type: ${blob.type || "image/png"}\r
\r
`,
          blob,
          `\r
--${boundary}--`,
        ]),
        res = await api(`${DRIVE_UPLOAD_API}?uploadType=multipart&fields=id`, {
          method: "POST",
          raw: body,
          type: `multipart/related; boundary=${boundary}`,
        });
      return DRIVE_PREFIX + res.id;
    },
    async objectUrl(ref) {
      if (!urls.has(ref)) {
        const fileId = encodeURIComponent(ref.slice(DRIVE_PREFIX.length));
        urls.set(
          ref,
          api(`${DRIVE_FILES_API}/${fileId}?alt=media`, {
            as: "blob",
          })
            .then((blob) => URL.createObjectURL(blob))
            .catch((err) => {
              urls.delete(ref);
              throw err;
            }),
        );
      }
      return urls.get(ref);
    },
  };
}
