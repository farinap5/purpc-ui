import assert from "node:assert/strict";
import test from "node:test";

import {
  TeamEvents,
  TeamOperations,
  TeamServerClient
} from "../src/api/teamApi.ts";
import type {
  TeamBuild,
  TeamEnvelope,
  TeamPayloadBuilder
} from "../src/api/teamApi.ts";

type MessageHandler = ((event: { data: string }) => void) | null;
type CloseHandler = ((event: { code: number; reason: string }) => void) | null;

class MockWebSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;

  static instance: MockWebSocket | null = null;
  static requests: TeamEnvelope[] = [];

  readyState = MockWebSocket.CONNECTING;
  onopen: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onmessage: MessageHandler = null;
  onclose: CloseHandler = null;

  readonly url: string;
  readonly protocols: string[];

  constructor(url: string, protocols: string[]) {
    this.url = url;
    this.protocols = protocols;
    MockWebSocket.instance = this;
    queueMicrotask(() => {
      this.readyState = MockWebSocket.OPEN;
      this.onopen?.();
    });
  }

  send(raw: string) {
    const request = JSON.parse(raw) as TeamEnvelope;
    MockWebSocket.requests.push(request);
    const build: TeamBuild = {
      id: "build-1",
      profile: "linux-http",
      builder: "lua-builder",
      status: "queued",
      created_at: "2026-08-27T10:00:00Z"
    };
    const reply = (type: string, data: unknown) => this.emit({
      version: 1,
      type,
      id: request.id,
      ok: true,
      data
    });

    switch (request.type) {
      case TeamOperations.payloadBuilderList:
        reply("rpl.payload-builder.list", [
          { name: "lua-builder", type: "lua" },
          { name: "make-linux", type: "makefile" }
        ] satisfies TeamPayloadBuilder[]);
        break;
      case TeamOperations.buildCreate:
        this.emitEvent(1, TeamEvents.buildQueued, build);
        this.emitEvent(2, TeamEvents.buildStarted, { ...build, status: "running" });
        this.emitEvent(3, TeamEvents.buildOutput, {
          build_id: build.id,
          profile: build.profile,
          builder: build.builder,
          message: "lua: compiling implant"
        });
        this.emitEvent(4, TeamEvents.buildCompleted, {
          ...build,
          status: "completed",
          artifact_name: "implant",
          completed_at: "2026-08-27T10:01:00Z",
          download_url: "/api/v1/builds/build-1/artifact"
        });
        reply("rpy.build.create", build);
        break;
      case TeamOperations.buildGet:
        reply("rpy.build.get", { ...build, status: "completed" });
        break;
      case TeamOperations.buildList:
        reply("rpy.build.list", [{ ...build, status: "completed" }]);
        break;
      case TeamOperations.buildDelete:
        this.emitEvent(5, TeamEvents.buildDeleted, { ...build, status: "completed" });
        reply("rpy.build.delete", { ...build, status: "completed" });
        break;
      default:
        throw new Error(`Unexpected operation ${request.type}`);
    }
  }

  emit(envelope: TeamEnvelope) {
    this.onmessage?.({ data: JSON.stringify(envelope) });
  }

  emitEvent(sequence: number, type: string, data: unknown) {
    this.emit({
      version: 1,
      type,
      sequence,
      time: `2026-08-27T10:00:0${sequence}Z`,
      ok: true,
      data
    });
  }

  close(code = 1000, reason = "") {
    this.readyState = MockWebSocket.CLOSED;
    this.onclose?.({ code, reason });
  }
}

test("runs the payload-builder build, output, artifact, and delete protocol flow", async t => {
  const originalWindow = globalThis.window;
  const originalWebSocket = globalThis.WebSocket;
  const originalFetch = globalThis.fetch;
  Object.assign(globalThis, {
    window: globalThis,
    WebSocket: MockWebSocket
  });
  let downloadAuthorization = "";
  globalThis.fetch = async (_input, init) => {
    downloadAuthorization = new Headers(init?.headers).get("Authorization") || "";
    return new Response(new Blob(["artifact"]), { status: 200 });
  };
  t.after(() => {
    Object.assign(globalThis, {
      window: originalWindow,
      WebSocket: originalWebSocket,
      fetch: originalFetch
    });
    MockWebSocket.instance = null;
    MockWebSocket.requests = [];
  });

  const events: TeamEnvelope[] = [];
  const client = new TeamServerClient({
    serverAddress: "http://127.0.0.1:8080",
    token: "test-token",
    onEvent: event => events.push(event)
  });
  await client.connect();

  const builders = await client.request<TeamPayloadBuilder[]>(TeamOperations.payloadBuilderList, {});
  assert.deepEqual(builders.map(builder => builder.name), ["lua-builder", "make-linux"]);

  const created = await client.request<TeamBuild>(TeamOperations.buildCreate, {
    profile: "linux-http",
    builder: "lua-builder"
  });
  assert.equal(created.status, "queued");
  const createRequest = MockWebSocket.requests.find(request => request.type === TeamOperations.buildCreate);
  assert.deepEqual(createRequest?.data, { profile: "linux-http", builder: "lua-builder" });
  assert.deepEqual(events.slice(0, 4).map(event => event.type), [
    TeamEvents.buildQueued,
    TeamEvents.buildStarted,
    TeamEvents.buildOutput,
    TeamEvents.buildCompleted
  ]);
  assert.deepEqual(events[2].data, {
    build_id: "build-1",
    profile: "linux-http",
    builder: "lua-builder",
    message: "lua: compiling implant"
  });

  const listed = await client.request<TeamBuild[]>(TeamOperations.buildList, {});
  assert.equal(listed[0].builder, "lua-builder");
  const fetched = await client.request<TeamBuild>(TeamOperations.buildGet, { name: "build-1" });
  assert.equal(fetched.id, "build-1");

  const artifact = await client.download("/api/v1/builds/build-1/artifact");
  assert.equal(await artifact.text(), "artifact");
  assert.equal(downloadAuthorization, "Bearer test-token");

  const deleted = await client.request<TeamBuild>(TeamOperations.buildDelete, { id: "build-1" });
  assert.equal(deleted.id, "build-1");
  assert.equal(events.at(-1)?.type, TeamEvents.buildDeleted);
  client.close();
});
