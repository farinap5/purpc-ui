# TeamServer integration

The web interface uses protocol version `1` from `pkg/teamapi/api.go` over
`/api/v1/ws`. Requests have a stable browser-client ID, unique request IDs,
typed `ask.*` operations, correlated `rpy.*` replies, and sequenced `evt.*`
events. Raw inbound and outbound envelopes are retained in Event Monitor with
a maximum of 1,000 entries.

## Implemented

- authenticated connect, hello, replay, snapshot, reconnect, and disconnect;
- live sessions and server-owned listener, script, profile, command, and loot
  metadata;
- listener create/start/stop;
- session termination;
- payload-specific Lua command discovery and command execution;
- queued task IDs and asynchronous task response output;
- Lua script load/unload for paths already known to the TeamServer;
- profile-backed build creation and status monitoring.

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
