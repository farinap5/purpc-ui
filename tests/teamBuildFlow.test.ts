import assert from "node:assert/strict";
import test from "node:test";

import { TeamEvents, TeamOperations } from "../src/api/teamApi.ts";
import type { TeamBuild } from "../src/api/teamApi.ts";
import {
  isBuildStateEvent,
  MAX_BUILD_OUTPUT_BYTES,
  normalizeBuildOutput,
  normalizePayloadBuilder,
  normalizePayloadBuilders,
  reducePayloadBuilderEvent,
  retainBuildOutput,
  upsertTeamBuild
} from "../src/utils/teamBuildFlow.ts";

const build = (status: string, overrides: Partial<TeamBuild> = {}): TeamBuild => ({
  id: "build-1",
  profile: "linux-http",
  builder: "make-linux",
  status,
  created_at: "2026-08-27T10:00:00Z",
  ...overrides
});

test("declares the payload-builder and complete build lifecycle contract", () => {
  assert.equal(TeamOperations.payloadBuilderList, "ask.payload-builder.list");
  assert.equal(TeamEvents.payloadBuilderRegistered, "evt.payload-builder.registered");
  assert.equal(TeamEvents.payloadBuilderUnregistered, "evt.payload-builder.unregistered");
  for (const eventType of [
    TeamEvents.buildQueued,
    TeamEvents.buildStarted,
    TeamEvents.buildCompleted,
    TeamEvents.buildFailed
  ]) {
    assert.equal(isBuildStateEvent(eventType), true);
  }
  assert.equal(isBuildStateEvent(TeamEvents.buildOutput), false);
});

test("normalizes list and lifecycle payload-builder records", () => {
  assert.deepEqual(normalizePayloadBuilder(" lua-builder "), { name: "lua-builder" });
  assert.deepEqual(normalizePayloadBuilder({
    name: "go-linux",
    kind: "builtin",
    description: "Built-in Go builder"
  }), {
    name: "go-linux",
    type: "builtin",
    description: "Built-in Go builder",
    source: undefined
  });
  assert.deepEqual(normalizePayloadBuilders([
    "make-linux",
    { name: "lua-builder", type: "lua" },
    { name: "make-linux", type: "makefile" }
  ]), [
    { name: "lua-builder", type: "lua", description: undefined, source: undefined },
    { name: "make-linux", type: "makefile", description: undefined, source: undefined }
  ]);

  let builders = normalizePayloadBuilders(["make-linux"]);
  builders = reducePayloadBuilderEvent(builders, {
    version: 1,
    type: TeamEvents.payloadBuilderRegistered,
    data: { name: "lua-builder", type: "lua" }
  });
  assert.deepEqual(builders.map(builder => builder.name), ["lua-builder", "make-linux"]);
  builders = reducePayloadBuilderEvent(builders, {
    version: 1,
    type: TeamEvents.payloadBuilderUnregistered,
    data: { builder: "make-linux" }
  });
  assert.deepEqual(builders.map(builder => builder.name), ["lua-builder"]);
});

test("keeps queued, running, and terminal build transitions monotonic", () => {
  let builds: TeamBuild[] = [];
  builds = upsertTeamBuild(builds, build("queued"));
  builds = upsertTeamBuild(builds, build("running"));
  builds = upsertTeamBuild(builds, build("queued"));
  assert.equal(builds[0].status, "running", "a late create reply must not regress a started event");

  builds = upsertTeamBuild(builds, build("completed", {
    artifact_name: "implant",
    completed_at: "2026-08-27T10:01:00Z",
    download_url: "/api/v1/builds/build-1/artifact"
  }));
  builds = upsertTeamBuild(builds, build("running"));
  assert.equal(builds[0].status, "completed", "a terminal event must remain canonical");
  assert.equal(builds[0].builder, "make-linux");
  assert.equal(builds[0].download_url, "/api/v1/builds/build-1/artifact");
});

test("accepts exact build output metadata and caps retained UTF-8 output at 256 KiB", () => {
  const output = normalizeBuildOutput({
    version: 1,
    type: TeamEvents.buildOutput,
    sequence: 44,
    time: "2026-08-27T10:00:30Z",
    data: {
      build_id: "build-1",
      profile: "linux-http",
      builder: "lua-builder",
      message: "compiling implant"
    }
  });
  assert.deepEqual(output, {
    build_id: "build-1",
    profile: "linux-http",
    builder: "lua-builder",
    message: "compiling implant",
    sequence: 44,
    time: "2026-08-27T10:00:30Z"
  });
  assert.equal(normalizeBuildOutput({
    version: 1,
    type: TeamEvents.buildOutput,
    data: { build_id: "build-1", profile: "linux-http", message: "missing builder" }
  }), null);

  const oversized = normalizeBuildOutput({
    version: 1,
    type: TeamEvents.buildOutput,
    data: {
      build_id: "build-1",
      profile: "linux-http",
      builder: "lua-builder",
      message: "🟣".repeat(MAX_BUILD_OUTPUT_BYTES)
    }
  });
  assert.ok(oversized);
  assert.ok(new TextEncoder().encode(oversized.message).byteLength <= MAX_BUILD_OUTPUT_BYTES);
  assert.match(oversized.message, /bytes omitted/);
  assert.deepEqual(retainBuildOutput([output!, oversized]), [oversized]);
});
