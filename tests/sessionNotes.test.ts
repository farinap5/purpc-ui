import assert from "node:assert/strict";
import test from "node:test";

import { tokenizeSessionNote } from "../src/utils/sessionNotes.ts";

test("tokenizes multiple session-note tags without changing surrounding text", () => {
  assert.deepEqual(tokenizeSessionNote("Primary #domain-controller, owner #élise and #42."), [
    { text: "Primary ", isTag: false },
    { text: "#domain-controller", isTag: true },
    { text: ", owner ", isTag: false },
    { text: "#élise", isTag: true },
    { text: " and ", isTag: false },
    { text: "#42", isTag: true },
    { text: ".", isTag: false }
  ]);
});

test("does not treat a standalone hash as a tag", () => {
  assert.deepEqual(tokenizeSessionNote("# #valid"), [
    { text: "# ", isTag: false },
    { text: "#valid", isTag: true }
  ]);
});
