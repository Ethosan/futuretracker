import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { checkAuth, keyParam } from "../src/stores/apps-script.js";

// Runs the real Apps Script file against a fake sheet, so the key check is tested as shipped.
function run(params, { key = "s3cret", rows = [["id"]] } = {}) {
  const calls = { cleared: 0, appended: [] };
  const sheet = {
    clearContents: () => calls.cleared++,
    appendRow: (r) => calls.appended.push(r),
    getDataRange: () => ({ getDisplayValues: () => rows, getValues: () => rows }),
  };
  const ctx = {
    PropertiesService: { getScriptProperties: () => ({ getProperty: () => key }) },
    SpreadsheetApp: { getActiveSpreadsheet: () => ({ getSheetByName: () => sheet, getSheets: () => [sheet] }) },
    ContentService: {
      MimeType: { JAVASCRIPT: "js" },
      createTextOutput: (t) => ({ text: t, setMimeType() { return this; } }),
    },
    decodeURIComponent,
    JSON,
    String,
    Math,
  };
  vm.runInNewContext(readFileSync(new URL("../src/apps-script.gs", import.meta.url), "utf8"), ctx);
  const res = vm.runInContext("doGet", ctx)({ parameter: { callback: "cb", ...params } });
  return { text: res.text, calls };
}

test("no key: refused before the sheet is touched", () => {
  const { text, calls } = run({ payload: encodeURIComponent(JSON.stringify({ action: "setup", headers: ["id"] })) });
  assert.match(text, /unauthorized/);
  assert.equal(calls.cleared, 0);
});

test("wrong key is refused, even a prefix of the real one", () => {
  assert.match(run({ key: "s3cre" }).text, /unauthorized/);
  assert.match(run({ key: "nope" }).text, /unauthorized/);
});

test("script with no KEY property is closed, not open", () => {
  assert.match(run({ key: "" }, { key: null }).text, /unauthorized/);
});

test("right key reads the sheet", () => {
  assert.match(run({ key: "s3cret" }).text, /values/);
});

test("right key but a broken payload gives bad_request, not an exception", () => {
  assert.match(run({ key: "s3cret", payload: "%7Bnot-json" }).text, /bad_request/);
});

test("keyParam and checkAuth", () => {
  assert.equal(keyParam(""), "");
  assert.equal(keyParam("a b"), "&key=a%20b");
  assert.throws(() => checkAuth({ status: "unauthorized" }), /shared key/);
  assert.deepEqual(checkAuth({ status: "ok" }), { status: "ok" });
});
