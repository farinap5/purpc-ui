import assert from "node:assert/strict";
import test from "node:test";

import { generateRandomOTS } from "../src/utils/randomSecret.ts";

test("generateRandomOTS creates a 16-byte lowercase alphanumeric secret by default", () => {
  const secret = generateRandomOTS();

  assert.equal(Buffer.byteLength(secret, "ascii"), 16);
  assert.match(secret, /^[0-9a-z]{16}$/);
});

test("generateRandomOTS honors an explicit positive length", () => {
  assert.match(generateRandomOTS(32), /^[0-9a-z]{32}$/);
});

test("generateRandomOTS rejects invalid lengths", () => {
  assert.throws(() => generateRandomOTS(0), RangeError);
  assert.throws(() => generateRandomOTS(1.5), RangeError);
});
