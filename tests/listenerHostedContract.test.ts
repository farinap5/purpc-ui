import assert from "node:assert/strict";
import test from "node:test";

import {
  TeamEvents,
  TeamOperations,
  type TeamEnvelope,
  type TeamListenerHostedConfiguration
} from "../src/api/teamApi.ts";
import {
  listenerHostedConfigurationFor,
  parseHostedHeaders,
  reduceListenerHostedEvent,
  removeListenerHostedConfiguration,
  upsertListenerHostedConfiguration,
  validateHostedStatus,
  validateHostedURLPath
} from "../src/utils/listenerHosted.ts";

const configuration = (version: number): TeamListenerHostedConfiguration => ({
  name: "web",
  listener_uuid: "listener-uuid",
  hosted_files: {
    "/download": {
      source_path: "payloads/implant.bin",
      status: 200,
      headers: { "Content-Type": "application/octet-stream" }
    }
  },
  not_found_page: null,
  config_version: version
});

test("uses the exact hosted-file operation and event names", () => {
  assert.deepEqual({
    get: TeamOperations.listenerHosted,
    set: TeamOperations.listenerHostedSet,
    add: TeamOperations.listenerHostedAdd,
    remove: TeamOperations.listenerHostedRemove,
    set404: TeamOperations.listenerHostedNotFoundSet,
    clear404: TeamOperations.listenerHostedNotFoundClear,
    event: TeamEvents.listenerHostedUpdated
  }, {
    get: "ask.listener.hosted",
    set: "ask.listener.hosted.set",
    add: "ask.listener.hosted.add",
    remove: "ask.listener.hosted.remove",
    set404: "ask.listener.hosted.not-found.set",
    clear404: "ask.listener.hosted.not-found.clear",
    event: "evt.listener.hosted.updated"
  });
});

test("hosted update events replace the complete UUID-keyed configuration", () => {
  const original = configuration(3);
  const updated = {
    ...configuration(4),
    hosted_files: {},
    not_found_page: { source_path: "site/404.html", status: 404 }
  };
  const event: TeamEnvelope = {
    version: 1,
    type: TeamEvents.listenerHostedUpdated,
    data: updated
  };

  const reduced = reduceListenerHostedEvent(
    upsertListenerHostedConfiguration({}, original),
    event
  );
  assert.strictEqual(reduced[updated.listener_uuid], updated);
  assert.deepEqual(reduced[updated.listener_uuid].hosted_files, {});
});

test("finds and removes hosted state by stable listener UUID or listener name", () => {
  const cached = upsertListenerHostedConfiguration({}, configuration(5));
  assert.equal(listenerHostedConfigurationFor(cached, { uuid: "listener-uuid", name: "renamed" })?.config_version, 5);
  assert.deepEqual(removeListenerHostedConfiguration(cached, { name: "web" }), {});
});

test("validates server-compatible hosted paths, statuses, and header JSON", () => {
  assert.equal(validateHostedURLPath("/"), "");
  assert.equal(validateHostedURLPath("/downloads/implant.bin"), "");
  assert.match(validateHostedURLPath("/downloads/../implant.bin"), /canonical/);
  assert.match(validateHostedURLPath("/downloads?token=x"), /canonical/);
  assert.equal(validateHostedStatus("200"), "");
  assert.match(validateHostedStatus("204"), /response body/);
  assert.deepEqual(parseHostedHeaders('{"Content-Type":"application/octet-stream"}'), {
    "Content-Type": "application/octet-stream"
  });
  assert.throws(() => parseHostedHeaders('{"X-Count":3}'), /string value/);
});
