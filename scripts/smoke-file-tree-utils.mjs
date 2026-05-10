import assert from "node:assert/strict";
import {
  displayNameForPath,
  entryPathForParent,
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

assert.equal(shouldHideSystemEntry({ path: "media/.stignore" }), true);
assert.equal(shouldHideSystemEntry({ path: "media/.stfolder" }), true);
assert.equal(shouldHideSystemEntry({ path: "media/clip.mov" }), false);

console.log("file-tree-utils smoke ok");
