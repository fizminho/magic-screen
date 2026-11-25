import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const expected = [
  ["public/icon-192.png", 192],
  ["public/icon-512.png", 512],
  ["public/apple-touch-icon.png", 180]
];

test("PWA icons are generated as valid PNGs at installable sizes", async () => {
  for (const [path, size] of expected) {
    const bytes = await readFile(new URL(`../${path}`, import.meta.url));
    assert.deepEqual([...bytes.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
    assert.equal(bytes.readUInt32BE(16), size);
    assert.equal(bytes.readUInt32BE(20), size);
  }
});
