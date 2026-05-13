import assert from "node:assert/strict";
import {
  displayNameForPath,
  entryPathForParent,
  normalizeEntryType,
  normalizeTreeEntry,
  shouldHideSystemEntry,
} from "../src/utils/fileTreeUtils.js";

assert.equal(entryPathForParent("clip.mov", ""), "clip.mov");
assert.equal(entryPathForParent("media/clip.mov", "media"), "media/clip.mov");
assert.equal(entryPathForParent("clip.mov", "media"), "media/clip.mov");
assert.equal(displayNameForPath("media/clip.mov"), "clip.mov");

assert.deepEqual(
  normalizeTreeEntry({ name: "clip.mov", type: "file", size: 12 }, "media", "local"),
  { name: "clip.mov", path: "media/clip.mov", type: "file", size: 12, _source: "local" },
);

assert.equal(normalizeEntryType("FILE_INFO_TYPE_DIRECTORY"), "directory");
assert.equal(normalizeEntryType("FILE_INFO_TYPE_FILE"), "file");
assert.deepEqual(
  normalizeTreeEntry({ name: "docs", type: "FILE_INFO_TYPE_DIRECTORY", size: 0 }, "", "remote"),
  { name: "docs", path: "docs", type: "directory", size: 0, _source: "remote" },
);
assert.deepEqual(
  normalizeTreeEntry({ name: "media", fileType: "directory", size: 0 }, "", "local"),
  { name: "media", fileType: "directory", path: "media", type: "directory", size: 0, _source: "local" },
);

assert.equal(shouldHideSystemEntry({ path: "media/.stignore" }), true);
assert.equal(shouldHideSystemEntry({ path: "media/.stfolder" }), true);
assert.equal(shouldHideSystemEntry({ path: "media/clip.mov" }), false);

console.log("file-tree-utils smoke ok");
