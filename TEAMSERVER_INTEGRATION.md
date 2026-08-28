# TeamServer integration

The web interface uses protocol version `1` from `pkg/teamapi/api.go` over
`/api/v1/ws`. Requests have a stable browser-client ID, unique request IDs,
typed `ask.*` operations, correlated `rpy.*` replies, and sequenced `evt.*`
events. Raw inbound and outbound envelopes are retained in Event Monitor with
bounded previews: payloads over 16 KiB are omitted, and retained monitor data
is capped at 1,000 entries and 1 MiB total.

Cold connections use the server snapshot as their state baseline and do not
request historical replay. Reconnects within the running UI preserve a cursor
for the same TeamServer and replay missed events in pages of 50, with limits of
1,000 events, 4 MiB transferred, and 1 MiB per control envelope. If a replay
page exceeds those limits, the UI reports the omission and continues with a
fresh snapshot.

## Implemented

- authenticated connect, hello, replay, snapshot, reconnect, and disconnect;
- live sessions and server-owned listener, script, profile, command, and loot
  metadata;
- listener create/start/stop;
- session termination;
- payload-specific Lua command discovery and command execution;
- queued task IDs and asynchronous task response output;
- Lua script load/unload for paths already known to the TeamServer;
- payload-builder discovery through `ask.payload-builder.list`, live builder
  registration/unregistration, and explicit builder selection for every build;
- profile-backed build creation with snapshot-backed history, live
  `evt.build.queued`, `evt.build.started`, `evt.build.output`,
  `evt.build.completed`, `evt.build.failed`, and `evt.build.deleted` updates,
  256 KiB of retained debug output per build, and authenticated artifact
  downloads;
- implant profiles without the obsolete build-template field; build behavior is
  selected through the registered payload builder instead.

The username is a local presentation identity. The current TeamServer has no
operator-account model and authenticates all operators with the shared token.

## Intentionally deferred

- `ask.interactive.open`, `ask.interactive.close`, and interactive SSH streams;
- browser loot/artifact downloads and script/attachment uploads. These use
  authenticated HTTP endpoints and need an explicit same-origin deployment or
  configured allowed-origin policy before the browser can use them safely;
- profile editing, listener editing/deletion, session history deletion, and
  loot deletion UI.

The browser authenticates the WebSocket with `purpcmd.v1` plus the additive
`purpcmd.auth.BASE64URL_TOKEN` subprotocol. Native Go clients continue to use
the existing `Authorization: Bearer TOKEN` upgrade header.
