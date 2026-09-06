import assert from "node:assert/strict";
import test from "node:test";

import type { Listener } from "../src/types.ts";
import {
  getProfileListenerCompatibility,
  resolveListenerLHost
} from "../src/utils/listenerEndpoint.ts";

const listener = (options: Record<string, unknown>): Listener => ({
  id: "listener-1",
  uuid: "listener-uuid",
  name: "main",
  driver: "http",
  payloadType: "Session HTTP",
  host: "wrong-bind-compatibility-host",
  port: 9999,
  status: "running",
  desiredState: "running",
  configVersion: 7,
  options,
  encryption: "None (Plaintext)",
  persistent: true
});

test("copies listener advertisement without using top-level bind compatibility fields", () => {
  const snapshot = resolveListenerLHost(listener({
    bind: { host: "0.0.0.0", port: "4444" },
    advertise: { host: "callbacks.example.test", port: "8443" }
  }));
  assert.deepEqual(snapshot, {
    endpoint: "callbacks.example.test:8443",
    host: "callbacks.example.test",
    port: "8443",
    source: "advertise",
    listenerName: "main",
    listenerUUID: "listener-uuid",
    configVersion: 7
  });
});

test("falls back to bind options and brackets IPv6 addresses", () => {
  const snapshot = resolveListenerLHost(listener({ bind: { host: "2001:db8::42", port: "4444" } }));
  assert.equal(snapshot?.endpoint, "[2001:db8::42]:4444");
  assert.equal(snapshot?.source, "bind");
});

test("fills a partial advertisement from bind options", () => {
  const snapshot = resolveListenerLHost(listener({
    bind: { host: "0.0.0.0", port: "4444" },
    advertise: { host: "2001:db8::10" }
  }));
  assert.equal(snapshot?.endpoint, "[2001:db8::10]:4444");
  assert.equal(snapshot?.source, "advertise+bind");
});

test("does not fall back to listener DTO host and port", () => {
  assert.equal(resolveListenerLHost(listener({})), null);
});

test("normalizes a scoped IPv6 advertisement for a URL-safe LHOST", () => {
  const snapshot = resolveListenerLHost(listener({
    bind: { host: "127.0.0.1", port: "4444" },
    advertise: { host: "fe80::1%eth0", port: "8443" }
  }));
  assert.equal(snapshot?.endpoint, "[fe80::1%25eth0]:8443");
});

test("marks only persistent plain HTTP default-route listeners as attachable", () => {
  const compatible = listener({
    bind: { host: "0.0.0.0", port: "4444" },
    advertise: { host: "callback.example", port: "8443" }
  });
  assert.equal(getProfileListenerCompatibility(compatible).compatible, true);

  assert.match(
    getProfileListenerCompatibility({ ...compatible, persistent: false }).reason || "",
    /persistent/
  );
  assert.match(
    getProfileListenerCompatibility({ ...compatible, routes: [{}] }).reason || "",
    /custom routes/
  );
  assert.match(
    getProfileListenerCompatibility({
      ...compatible,
      options: { ...compatible.options, tls: { enabled: true } }
    }).reason || "",
    /HTTPS/
  );
});

test("rejects wildcard bind fallback until a connectable host is advertised", () => {
  const compatibility = getProfileListenerCompatibility(listener({
    bind: { host: "::", port: "4444" }
  }));
  assert.equal(compatibility.compatible, false);
  assert.match(compatibility.reason || "", /connectable host/);
});
