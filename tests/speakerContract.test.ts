import assert from "node:assert/strict";
import test from "node:test";
import {
  TeamEvents,
  TeamOperations,
  type TeamEnvelope,
  type TeamSpeaker
} from "../src/api/teamApi.ts";
import {
  canDeleteSpeaker,
  canEditSpeaker,
  canRestartSpeaker,
  canStartSpeaker,
  canStopSpeaker,
  clearRedactedSpeakerValues,
  containsRedactedSpeakerValue,
  nanosecondsToSeconds,
  parseSpeakerArrayMap,
  redactControlTraffic,
  redactSpeakerConfiguration,
  reduceSpeakerEvent,
  secondsToNanoseconds,
  validateRedactedSpeakerValuesReentered,
  validateSpeakerTLS
} from "../src/utils/speaker.ts";

const speaker = (overrides: Partial<TeamSpeaker> = {}): TeamSpeaker => ({
  name: "edge-speaker",
  uuid: "speaker-uuid",
  running: false,
  in_flight: false,
  persistent: true,
  state: "stopped",
  desired_state: "stopped",
  config_version: 1,
  associations: 0,
  config: {
    client: { base_url: "https://10.20.30.40:8443" },
    request: { method: "POST", path: "/" }
  },
  ...overrides
});

test("uses the exact speaker operation and event names", () => {
  assert.deepEqual({
    list: TeamOperations.speakerList,
    get: TeamOperations.speakerGet,
    create: TeamOperations.speakerCreate,
    update: TeamOperations.speakerUpdate,
    start: TeamOperations.speakerStart,
    stop: TeamOperations.speakerStop,
    restart: TeamOperations.speakerRestart,
    delete: TeamOperations.speakerDelete
  }, {
    list: "ask.speaker.list",
    get: "ask.speaker.get",
    create: "ask.speaker.create",
    update: "ask.speaker.update",
    start: "ask.speaker.start",
    stop: "ask.speaker.stop",
    restart: "ask.speaker.restart",
    delete: "ask.speaker.delete"
  });
  assert.deepEqual([
    TeamEvents.speakerCreated,
    TeamEvents.speakerUpdated,
    TeamEvents.speakerConnecting,
    TeamEvents.speakerConnected,
    TeamEvents.speakerDisconnected,
    TeamEvents.speakerFailed,
    TeamEvents.speakerStopped,
    TeamEvents.speakerDeleted
  ], [
    "evt.speaker.created",
    "evt.speaker.updated",
    "evt.speaker.connecting",
    "evt.speaker.connected",
    "evt.speaker.disconnected",
    "evt.speaker.failed",
    "evt.speaker.stopped",
    "evt.speaker.deleted"
  ]);
});

test("speaker events replace complete UUID-keyed snapshots and delete by UUID", () => {
  const initial = speaker();
  const connected = speaker({ name: "renamed", state: "connected", running: true, config_version: 3 });
  const updated = reduceSpeakerEvent([initial], {
    type: TeamEvents.speakerConnected,
    data: connected
  } as TeamEnvelope);
  assert.equal(updated.length, 1);
  assert.deepEqual(updated[0], connected);

  const deleted = reduceSpeakerEvent(updated, {
    type: TeamEvents.speakerDeleted,
    data: { name: "renamed", uuid: "speaker-uuid" }
  } as TeamEnvelope);
  assert.deepEqual(deleted, []);
});

test("speaker lifecycle controls follow the state contract", () => {
  assert.equal(canStartSpeaker("stopped"), true);
  assert.equal(canEditSpeaker("stopped"), true);
  assert.equal(canDeleteSpeaker("stopped"), true);
  assert.equal(canStopSpeaker("connecting"), true);
  assert.equal(canStopSpeaker("failed"), true);
  assert.equal(canRestartSpeaker("connected"), true);
  assert.equal(canEditSpeaker("connected"), false);
  assert.equal(canDeleteSpeaker("disconnected"), false);
});

test("duration conversion preserves nanoseconds represented safely by JSON numbers", () => {
  for (const seconds of ["0.1", "1.000000001", "30", "9007199.254740991"]) {
    const nanoseconds = secondsToNanoseconds(seconds, "Duration");
    assert.equal(nanosecondsToSeconds(nanoseconds, "fallback"), seconds.replace(/\.0+$/, ""));
  }
  assert.throws(() => secondsToNanoseconds("0.0000000001", "Duration"), /9 decimal places/);
  assert.throws(() => secondsToNanoseconds("9007200", "Duration"), /too large/);
});

test("speaker headers reject reserved keys and credential markers", () => {
  assert.throws(
    () => parseSpeakerArrayMap('{"Host":["example"]}', "Headers", "header"),
    /controlled by the speaker/
  );
  assert.throws(
    () => parseSpeakerArrayMap('{"Authorization":["[REDACTED]"]}', "Headers", "header"),
    /redacted/
  );
});

test("speaker TLS validation accepts standard and raw base64 SHA-256 pins", () => {
  const raw = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
  assert.doesNotThrow(() => validateSpeakerTLS({ clientCertFile: "", clientKeyFile: "", pins: [raw, `${raw}=`] }));
  assert.throws(() => validateSpeakerTLS({ clientCertFile: "cert.pem", clientKeyFile: "", pins: [] }), /supplied together/);
});

test("speaker secrets are redacted for traffic and must be re-entered for replacement", () => {
  const plaintext = {
    client: {
      base_url: "https://bind.example",
      proxy_url: "socks5://user:pass@proxy.example",
      headers: { Authorization: ["Bearer secret"] },
      query: { token: ["query-secret"] },
      cookies: { session: "cookie-secret" },
      tls: { client_key_file: "/secret/key.pem" }
    },
    request: {
      method: "POST",
      path: "/",
      headers: { "X-Key": ["secret"] }
    }
  };
  const redacted = redactSpeakerConfiguration(plaintext);
  assert.equal(containsRedactedSpeakerValue(redacted), true);
  assert.equal(redacted.client.proxy_url, "[REDACTED]");
  assert.deepEqual(redacted.client.headers?.Authorization, ["[REDACTED]"]);

  const cleared = clearRedactedSpeakerValues(redacted);
  assert.equal(cleared.client.proxy_url, "");
  assert.throws(() => validateRedactedSpeakerValuesReentered(redacted, cleared), /Re-enter redacted/);
  assert.doesNotThrow(() => validateRedactedSpeakerValuesReentered(redacted, plaintext));

  const traffic = redactControlTraffic(JSON.stringify({
    version: 1,
    type: TeamOperations.speakerCreate,
    id: "request-id",
    client_id: "client-id",
    data: { name: "edge", config: plaintext }
  }));
  assert.equal(traffic.includes("Bearer secret"), false);
  assert.equal(traffic.includes("query-secret"), false);
  assert.equal(traffic.includes("cookie-secret"), false);
  assert.equal(traffic.includes("socks5://user:pass"), false);
  assert.match(traffic, /\[REDACTED\]/);
});
