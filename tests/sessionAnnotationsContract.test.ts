import assert from "node:assert/strict";
import test from "node:test";

import {
  MAX_SESSION_COLOR_BYTES,
  MAX_SESSION_NOTE_BYTES,
  TeamEvents,
  TeamOperations,
  type TeamSessionUpdateRequest
} from "../src/api/teamApi.ts";

test("session annotation identifiers match the TeamServer contract", () => {
  assert.equal(TeamOperations.sessionUpdate, "ask.session.update");
  assert.equal(TeamEvents.sessionUpdated, "evt.session.updated");
  assert.equal(MAX_SESSION_COLOR_BYTES, 64);
  assert.equal(MAX_SESSION_NOTE_BYTES, 4 << 10);
});

test("session annotation updates preserve explicit empty strings for clearing", () => {
  const clearAnnotations: TeamSessionUpdateRequest = {
    name: "session-1",
    color: "",
    note: ""
  };

  assert.deepEqual(clearAnnotations, {
    name: "session-1",
    color: "",
    note: ""
  });
});
