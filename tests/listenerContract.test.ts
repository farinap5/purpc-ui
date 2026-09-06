import assert from "node:assert/strict";
import test from "node:test";

import {
  TEAM_API_SUBPROTOCOL,
  TeamEvents,
  TeamOperations,
  TeamServerClient
} from "../src/api/teamApi.ts";
import type {
  TeamEnvelope,
  TeamListener,
  TeamListenerCarrierDefinition,
  TeamListenerCreateRequest,
  TeamListenerDriverDefinition
} from "../src/api/teamApi.ts";

class ListenerMockWebSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;
  static instance: ListenerMockWebSocket | null = null;

  readyState = ListenerMockWebSocket.CONNECTING;
  protocol = TEAM_API_SUBPROTOCOL;
  onopen: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onclose: ((event: { code: number; reason: string }) => void) | null = null;
  readonly requests: TeamEnvelope[] = [];
  readonly url: string;
  readonly protocols: string[];

  constructor(url: string, protocols: string[]) {
    this.url = url;
    this.protocols = protocols;
    ListenerMockWebSocket.instance = this;
    queueMicrotask(() => {
      this.readyState = ListenerMockWebSocket.OPEN;
      this.onopen?.();
    });
  }

  send(raw: string) {
    const request = JSON.parse(raw) as TeamEnvelope;
    this.requests.push(request);
    const listener: TeamListener = {
      name: "main",
      uuid: "listener-1",
      host: "0.0.0.0",
      port: "0",
      running: false,
      persistent: false,
      associations: 0,
      driver: "http",
      options: { bind: { host: "0.0.0.0", port: "0" }, tls: { enabled: false } },
      routes: [],
      state: "stopped",
      desired_state: "stopped",
      config_version: 1
    };
    const driver: TeamListenerDriverDefinition = {
      id: "http",
      capabilities: ["routes", "carriers"],
      options: [{ key: "tls.enabled", type: "boolean", default: false }]
    };
    const carriers: TeamListenerCarrierDefinition[] = [{ id: "body" }, { id: "query" }];
    const data = request.type === TeamOperations.listenerTypeList
      ? [driver]
      : request.type === TeamOperations.listenerTypeGet
        ? driver
        : request.type === TeamOperations.listenerCarrierList
          ? carriers
          : listener;
    this.emit({ version: 1, type: request.type.replace(/^ask\./, "rpy."), id: request.id, ok: true, data });
  }

  emit(envelope: TeamEnvelope) {
    this.onmessage?.({ data: JSON.stringify(envelope) });
  }

  close(code = 1000, reason = "") {
    this.readyState = ListenerMockWebSocket.CLOSED;
    this.onclose?.({ code, reason });
  }
}

test("listener protocol uses exact operations and preserves explicit zero values", async t => {
  const originalWindow = globalThis.window;
  const originalWebSocket = globalThis.WebSocket;
  Object.assign(globalThis, { window: globalThis, WebSocket: ListenerMockWebSocket });
  t.after(() => {
    Object.assign(globalThis, { window: originalWindow, WebSocket: originalWebSocket });
    ListenerMockWebSocket.instance = null;
  });

  assert.deepEqual([
    TeamOperations.listenerList,
    TeamOperations.listenerGet,
    TeamOperations.listenerCreate,
    TeamOperations.listenerUpdate,
    TeamOperations.listenerStart,
    TeamOperations.listenerStop,
    TeamOperations.listenerRestart,
    TeamOperations.listenerDelete,
    TeamOperations.listenerTypeList,
    TeamOperations.listenerTypeGet,
    TeamOperations.listenerCarrierList
  ], [
    "ask.listener.list",
    "ask.listener.get",
    "ask.listener.create",
    "ask.listener.update",
    "ask.listener.start",
    "ask.listener.stop",
    "ask.listener.restart",
    "ask.listener.delete",
    "ask.listener-type.list",
    "ask.listener-type.get",
    "ask.listener-carrier.list"
  ]);

  const events: TeamEnvelope[] = [];
  const client = new TeamServerClient({
    serverAddress: "https://team.example.test",
    token: "listener-token",
    onEvent: event => events.push(event)
  });
  await client.connect();
  const socket = ListenerMockWebSocket.instance;
  assert.ok(socket);
  assert.equal(socket.url, "wss://team.example.test/api/v1/ws");
  assert.equal(socket.protocols[0], TEAM_API_SUBPROTOCOL);
  assert.match(socket.protocols[1], /^purpcmd\.auth\.[A-Za-z0-9_-]+$/);

  await client.request<TeamListenerDriverDefinition[]>(TeamOperations.listenerTypeList, {});
  await client.request<TeamListenerDriverDefinition>(TeamOperations.listenerTypeGet, { name: "http" });
  await client.request<TeamListenerCarrierDefinition[]>(TeamOperations.listenerCarrierList, {});
  const createRequest: TeamListenerCreateRequest = {
    name: "main",
    driver: "http",
    persistent: false,
    options: { bind: { host: "0.0.0.0", port: "0" }, tls: { enabled: false }, response_headers: {} },
    routes: [],
    start: false
  };
  await client.request<TeamListener>(TeamOperations.listenerCreate, createRequest);
  assert.deepEqual(socket.requests.at(-1)?.data, createRequest);

  const listener = (socket.requests.at(-1) && {
    name: "main", uuid: "listener-1", host: "0.0.0.0", port: "0", running: true,
    persistent: false, associations: 0, state: "running"
  }) as TeamListener;
  socket.emit({ version: 1, type: TeamEvents.listenerStarted, sequence: 1, ok: true, data: listener });
  socket.emit({ version: 1, type: TeamEvents.listenerStarted, sequence: 1, ok: true, data: listener });
  assert.equal(events.length, 1);
  client.close();
});
