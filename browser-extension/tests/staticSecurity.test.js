// browser-extension/tests/staticSecurity.test.js
//
// Automated version of P5.4's own static-security checklist item: scans
// this extension's actual source files (not a snapshot copy) for anything
// that would mean it does more than build and open a URL - a network
// call, a call into VeriVerse's own verify/post APIs, persistent storage,
// or a content script. Failing this test means the extension has grown
// capability beyond its P5.4 scope, not that the test itself is wrong.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const dir = path.dirname(fileURLToPath(import.meta.url));
const sourceFiles = ["../background.js", "../lib/buildVeriVerseLink.js"].map((rel) =>
  readFileSync(path.join(dir, rel), "utf8")
);

const forbiddenPatterns = [
  /\bfetch\(/,
  /XMLHttpRequest/,
  /\bWebSocket\b/,
  /chrome\.storage/,
  /chrome\.cookies/,
  /chrome\.history/,
  /chrome\.webRequest/,
  /chrome\.scripting/,
  /chrome\.tabs\.executeScript/,
  /\/api\/verify/,
  /\/api\/posts/,
];

test("extension source contains no network, storage, or content-script APIs", () => {
  for (const source of sourceFiles) {
    for (const pattern of forbiddenPatterns) {
      assert.equal(pattern.test(source), false, `forbidden pattern ${pattern} found`);
    }
  }
});

test("manifest declares no content scripts and no host permissions beyond activeTab", () => {
  const manifest = JSON.parse(readFileSync(path.join(dir, "../manifest.json"), "utf8"));
  assert.equal(manifest.content_scripts, undefined);
  assert.equal(manifest.host_permissions, undefined);
  assert.deepEqual([...manifest.permissions].sort(), ["activeTab", "contextMenus"]);
});
