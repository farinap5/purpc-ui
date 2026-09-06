import assert from "node:assert/strict";
import test from "node:test";

import {
  TeamEvents,
  TeamOperations,
  type TeamEnvelope,
  type TeamProfile
} from "../src/api/teamApi.ts";
import { reduceProfileEvent } from "../src/utils/profileEvents.ts";

const profile = (name: string, listenerUUID = "", lhost = "manual.example:8080"): TeamProfile => ({
  name,
  listener_uuid: listenerUUID,
  type: "impl",
  lhost,
  os: "linux",
  arch: "amd64",
  os_options: ["linux"],
  arch_options: ["amd64"],
  protocol: "http",
  options: {},
  ots_configured: false,
  output: "implant",
  public_key: "server.pub"
});

test("uses the exact profile listener operation and profile event names", () => {
  assert.equal(TeamOperations.profileListenerSet, "ask.profile.listener.set");
  assert.equal(TeamEvents.profileCreated, "evt.profile.created");
  assert.equal(TeamEvents.profileUpdated, "evt.profile.updated");
  assert.equal(TeamEvents.profileDeleted, "evt.profile.deleted");
});

test("replaces a cached profile with the complete authoritative update event", () => {
  const stale = profile("alpha", "old-listener", "old.example:1111");
  const complete = {
    ...profile("alpha", "new-listener", "new.example:2222"),
    options: { path: "/new" },
    config_version: 9
  };
  const event: TeamEnvelope = { version: 1, type: TeamEvents.profileUpdated, data: complete };

  const reduced = reduceProfileEvent([stale, profile("beta")], event);
  assert.equal(reduced.length, 2);
  assert.strictEqual(reduced.find(item => item.name === "alpha"), complete);
});

test("removes the profile named by a delete event", () => {
  const event: TeamEnvelope = {
    version: 1,
    type: TeamEvents.profileDeleted,
    data: { name: "alpha" }
  };
  assert.deepEqual(reduceProfileEvent([profile("alpha"), profile("beta")], event).map(item => item.name), ["beta"]);
});
