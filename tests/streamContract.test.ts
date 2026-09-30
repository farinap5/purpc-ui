import assert from "node:assert/strict";
import test from "node:test";
import {
  TeamEvents,
  TeamOperations,
  type TeamEnvelope,
  type TeamStream
} from "../src/api/teamApi.ts";
import {
  isTerminalStream,
  reduceStreamEvent,
  sortStreams,
  STREAM_STATE_LABELS,
  TEAM_STREAM_EVENT_TYPES
} from "../src/utils/streams.ts";

const stream = (overrides: Partial<TeamStream> = {}): TeamStream => ({
  id: "stream-1",
  session: "session-1",
  task_id: "task-1",
  service: "ssh",
  command: "ssh 127.0.0.1:22",
  local_address: "127.0.0.1:55001",
  local_host: "127.0.0.1",
  local_port: 55001,
  state: "waiting_implant",
  created_at: "2026-09-30T12:00:00Z",
  expires_at: "2026-09-30T12:01:00Z",
  ...overrides
});

test("uses the exact stream lifecycle event names", () => {
  assert.deepEqual(TEAM_STREAM_EVENT_TYPES, [
    "evt.stream.created",
    "evt.stream.implant-attached",
    "evt.stream.consumer-attached",
    "evt.stream.ready",
    "evt.stream.closed",
    "evt.stream.expired",
    "evt.stream.failed"
  ]);
  assert.equal(TeamEvents.streamReady, "evt.stream.ready");
});

test("does not invent unsupported stream operator operations", () => {
  assert.equal("streamList" in TeamOperations, false);
  assert.equal("streamGet" in TeamOperations, false);
  assert.equal("streamClose" in TeamOperations, false);
});

test("stream events replace full snapshots for either attachment order", () => {
  const created = stream();
  const implantFirst = stream({
    state: "waiting_consumer",
    implant_attached_at: "2026-09-30T12:00:05Z"
  });
  const readyAfterConsumer = stream({
    state: "bridging",
    implant_attached_at: "2026-09-30T12:00:05Z",
    consumer_attached_at: "2026-09-30T12:00:10Z"
  });

  let current = reduceStreamEvent([], {
    type: TeamEvents.streamCreated,
    data: created
  } as TeamEnvelope);
  current = reduceStreamEvent(current, {
    type: TeamEvents.streamImplantAttached,
    data: implantFirst
  } as TeamEnvelope);
  current = reduceStreamEvent(current, {
    type: TeamEvents.streamReady,
    data: readyAfterConsumer
  } as TeamEnvelope);
  assert.deepEqual(current, [readyAfterConsumer]);

  const consumerFirst = stream({
    id: "stream-2",
    state: "waiting_implant",
    consumer_attached_at: "2026-09-30T12:00:03Z"
  });
  const readyAfterImplant = stream({
    id: "stream-2",
    state: "bridging",
    consumer_attached_at: "2026-09-30T12:00:03Z",
    implant_attached_at: "2026-09-30T12:00:07Z"
  });
  current = reduceStreamEvent(current, {
    type: TeamEvents.streamConsumerAttached,
    data: consumerFirst
  } as TeamEnvelope);
  current = reduceStreamEvent(current, {
    type: TeamEvents.streamReady,
    data: readyAfterImplant
  } as TeamEnvelope);
  assert.deepEqual(current.find(item => item.id === "stream-2"), readyAfterImplant);
});

test("terminal stream events remain terminal and active streams sort first", () => {
  const active = stream({ id: "active", created_at: "2026-09-30T12:00:00Z" });
  const failed = stream({
    id: "failed",
    state: "failed",
    created_at: "2026-09-30T12:01:00Z",
    closed_at: "2026-09-30T12:01:05Z",
    error: "relay bytes: connection reset"
  });
  const closed = reduceStreamEvent([active], {
    type: TeamEvents.streamFailed,
    data: failed
  } as TeamEnvelope);

  assert.equal(isTerminalStream(failed), true);
  assert.deepEqual(sortStreams(closed).map(item => item.id), ["active", "failed"]);
});

test("stream UI labels match the lifecycle contract", () => {
  assert.deepEqual(STREAM_STATE_LABELS, {
    waiting_implant: "Waiting for implant",
    waiting_consumer: "Waiting for local client",
    bridging: "Connected",
    closed: "Closed",
    expired: "Attachment timed out",
    failed: "Failed"
  });
});
