export const TEAM_API_VERSION = 1;
export const TEAM_API_SUBPROTOCOL = "purpcmd.v1";
export const TEAM_API_BROWSER_AUTH_PREFIX = "purpcmd.auth.";
export const MAX_CONTROL_MESSAGE_BYTES = 1 << 20;
export const MAX_TRAFFIC_PREVIEW_BYTES = 16 << 10;
export const MAX_SESSION_COLOR_BYTES = 64;
export const MAX_SESSION_NOTE_BYTES = 4 << 10;
const REPLAY_PAGE_EVENT_LIMIT = 50;
const MAX_REPLAY_EVENTS = 1000;
const MAX_REPLAY_TRANSFER_BYTES = 4 << 20;

export const TeamOperations = {
  systemHello: "ask.system.hello",
  systemSnapshot: "ask.system.snapshot",
  listenerList: "ask.listener.list",
  listenerGet: "ask.listener.get",
  listenerCreate: "ask.listener.create",
  listenerUpdate: "ask.listener.update",
  listenerStart: "ask.listener.start",
  listenerStop: "ask.listener.stop",
  listenerRestart: "ask.listener.restart",
  listenerDelete: "ask.listener.delete",
  listenerHosted: "ask.listener.hosted",
  listenerHostedSet: "ask.listener.hosted.set",
  listenerHostedAdd: "ask.listener.hosted.add",
  listenerHostedRemove: "ask.listener.hosted.remove",
  listenerHostedNotFoundSet: "ask.listener.hosted.not-found.set",
  listenerHostedNotFoundClear: "ask.listener.hosted.not-found.clear",
  listenerTypeList: "ask.listener-type.list",
  listenerTypeGet: "ask.listener-type.get",
  listenerCarrierList: "ask.listener-carrier.list",
  speakerList: "ask.speaker.list",
  speakerGet: "ask.speaker.get",
  speakerCreate: "ask.speaker.create",
  speakerUpdate: "ask.speaker.update",
  speakerStart: "ask.speaker.start",
  speakerStop: "ask.speaker.stop",
  speakerRestart: "ask.speaker.restart",
  speakerDelete: "ask.speaker.delete",
  sessionUpdate: "ask.session.update",
  sessionTerminate: "ask.session.terminate",
  sessionDelete: "ask.session.delete",
  commandExecute: "ask.command.execute",
  lootList: "ask.loot.list",
  lootGet: "ask.loot.get",
  lootDelete: "ask.loot.delete",
  scriptList: "ask.script.list",
  scriptLoad: "ask.script.load",
  scriptUnload: "ask.script.unload",
  profileList: "ask.profile.list",
  profileGet: "ask.profile.get",
  profileCreate: "ask.profile.create",
  profileUpdate: "ask.profile.update",
  profileDelete: "ask.profile.delete",
  profileListenerSet: "ask.profile.listener.set",
  payloadBuilderList: "ask.payload-builder.list",
  buildCreate: "ask.build.create",
  buildGet: "ask.build.get",
  buildList: "ask.build.list",
  buildDelete: "ask.build.delete",
  eventReplay: "ask.event.replay",
  userCreate: "ask.user.create",
  userUpdate: "ask.user.update",
  userDelete: "ask.user.delete",
  userList: "ask.user.list",
  userMessage: "ask.user.message"
} as const;

export const TeamEvents = {
  sessionUpdated: "evt.session.updated",
  sessionOutput: "evt.session.output",
  listenerCreated: "evt.listener.created",
  listenerUpdated: "evt.listener.updated",
  listenerStarting: "evt.listener.starting",
  listenerStarted: "evt.listener.started",
  listenerStopping: "evt.listener.stopping",
  listenerStopped: "evt.listener.stopped",
  listenerFailed: "evt.listener.failed",
  listenerDeleted: "evt.listener.deleted",
  listenerHostedUpdated: "evt.listener.hosted.updated",
  speakerCreated: "evt.speaker.created",
  speakerUpdated: "evt.speaker.updated",
  speakerConnecting: "evt.speaker.connecting",
  speakerConnected: "evt.speaker.connected",
  speakerDisconnected: "evt.speaker.disconnected",
  speakerFailed: "evt.speaker.failed",
  speakerStopped: "evt.speaker.stopped",
  speakerDeleted: "evt.speaker.deleted",
  streamCreated: "evt.stream.created",
  streamImplantAttached: "evt.stream.implant-attached",
  streamConsumerAttached: "evt.stream.consumer-attached",
  streamReady: "evt.stream.ready",
  streamClosed: "evt.stream.closed",
  streamExpired: "evt.stream.expired",
  streamFailed: "evt.stream.failed",
  profileCreated: "evt.profile.created",
  profileUpdated: "evt.profile.updated",
  profileDeleted: "evt.profile.deleted",
  payloadBuilderRegistered: "evt.payload-builder.registered",
  payloadBuilderUnregistered: "evt.payload-builder.unregistered",
  buildQueued: "evt.build.queued",
  buildStarted: "evt.build.started",
  buildOutput: "evt.build.output",
  buildCompleted: "evt.build.completed",
  buildFailed: "evt.build.failed",
  buildDeleted: "evt.build.deleted",
  userLogin: "evt.user.login",
  userLogout: "evt.user.logout",
  userCreated: "evt.user.created",
  userUpdated: "evt.user.updated",
  userDeleted: "evt.user.deleted",
  userMessage: "evt.user.message"
} as const;

export interface TeamApiErrorPayload {
  code: string;
  message: string;
  retryable?: boolean;
}

export interface TeamEnvelope<T = unknown> {
  version: number;
  type: string;
  id?: string;
  client_id?: string;
  sequence?: number;
  time?: string;
  ok?: boolean;
  data?: T;
  error?: TeamApiErrorPayload;
}

export interface TeamHelloReply {
  server_id: string;
  server_version: string;
  protocol: number;
  event_sequence: number;
  resync_required?: boolean;
}

export type TeamListenerState = "stopped" | "starting" | "running" | "stopping" | "failed";

export type TeamListenerOptionType =
  | "string"
  | "integer"
  | "boolean"
  | "duration"
  | "string_list"
  | "string_map"
  | "object"
  | "file"
  | "secret";

export interface TeamListenerOptionDefinition {
  key: string;
  type: TeamListenerOptionType;
  description?: string;
  required?: boolean;
  secret?: boolean;
  mutable_while_running?: boolean;
  default?: unknown;
}

export interface TeamListenerDriverDefinition {
  id: string;
  description?: string;
  capabilities?: string[];
  options?: TeamListenerOptionDefinition[];
}

export interface TeamListenerCarrierDefinition {
  id: string;
  description?: string;
  options?: TeamListenerOptionDefinition[];
}

export interface TeamListenerCarrierSpec {
  type: string;
  options?: Record<string, unknown>;
}

export interface TeamListenerRoute {
  id: string;
  purpose: "callback" | "interactive";
  priority?: number;
  match?: Record<string, unknown>;
  options?: Record<string, unknown>;
  inbound: TeamListenerCarrierSpec;
  outbound: TeamListenerCarrierSpec;
}

export interface TeamListener {
  name: string;
  uuid: string;
  host: string;
  port: string;
  running: boolean;
  persistent: boolean;
  associations: number;
  driver?: string;
  options?: Record<string, unknown>;
  routes?: TeamListenerRoute[];
  state?: TeamListenerState;
  desired_state?: "stopped" | "running";
  address?: string;
  last_error?: string;
  config_version?: number;
  /** Compatibility with teamservers predating the schema-driven driver API. */
  protocol?: string;
}

export interface TeamListenerCreateRequest {
  name: string;
  driver?: string;
  options?: Record<string, unknown>;
  routes?: TeamListenerRoute[];
  persistent?: boolean;
  start?: boolean;
}

export interface TeamListenerUpdateRequest {
  name: string;
  driver?: string;
  options?: Record<string, unknown>;
  routes?: TeamListenerRoute[];
  persistent?: boolean;
  expected_config_version: number;
}

export interface TeamHTTPHostedFile {
  source_path: string;
  status?: number;
  headers?: Record<string, string>;
}

export interface TeamListenerHostedConfiguration {
  name: string;
  listener_uuid: string;
  hosted_files: Record<string, TeamHTTPHostedFile>;
  not_found_page: TeamHTTPHostedFile | null;
  config_version: number;
}

export interface TeamListenerHostedSetRequest {
  name: string;
  hosted_files: Record<string, TeamHTTPHostedFile>;
  not_found_page?: TeamHTTPHostedFile | null;
  expected_config_version?: number;
}

export interface TeamListenerHostedAddRequest {
  name: string;
  url_path: string;
  file: TeamHTTPHostedFile;
  expected_config_version?: number;
}

export interface TeamListenerHostedRemoveRequest {
  name: string;
  url_path: string;
  expected_config_version?: number;
}

export interface TeamListenerHostedNotFoundSetRequest {
  name: string;
  file: TeamHTTPHostedFile;
  expected_config_version?: number;
}

export interface TeamListenerHostedNotFoundClearRequest {
  name: string;
  expected_config_version?: number;
}

export type TeamSpeakerState = "stopped" | "connecting" | "connected" | "disconnected" | "failed";

export interface TeamSpeakerHealthcheckConfig {
  enabled?: boolean;
  interval?: number;
  failure_threshold?: number;
}

export interface TeamSpeakerRetryConfig {
  interval?: number;
}

export interface TeamSpeakerTLSConfig {
  server_name?: string;
  root_ca_file?: string;
  client_cert_file?: string;
  client_key_file?: string;
  spki_sha256_pins?: string[];
  min_version?: "1.2" | "TLS1.2" | "tls1.2" | "1.3" | "TLS1.3" | "tls1.3";
  insecure_skip_verify?: boolean;
}

export interface TeamSpeakerHTTPClientConfig {
  base_url: string;
  host?: string;
  headers?: Record<string, string[]>;
  query?: Record<string, string[]>;
  cookies?: Record<string, string>;
  proxy_url?: string;
  use_environment_proxy?: boolean;
  follow_redirects?: boolean;
  allow_cross_origin_redirects?: boolean;
  max_redirects?: number;
  request_timeout?: number;
  dial_timeout?: number;
  tls_handshake_timeout?: number;
  response_header_timeout?: number;
  idle_connection_timeout?: number;
  max_request_bytes?: number;
  max_response_bytes?: number;
  max_response_header_bytes?: number;
  max_idle_connections?: number;
  max_idle_per_host?: number;
  disable_compression?: boolean;
  reuse_connections?: boolean;
  tls?: TeamSpeakerTLSConfig;
}

export interface TeamSpeakerHTTPRequestConfig {
  method?: string;
  path?: string;
  host?: string;
  headers?: Record<string, string[]>;
  query?: Record<string, string[]>;
  cookies?: Record<string, string>;
  expected_status?: number[];
}

export interface TeamSpeakerConfig {
  profile?: string;
  client: TeamSpeakerHTTPClientConfig;
  request: TeamSpeakerHTTPRequestConfig;
  healthcheck?: TeamSpeakerHealthcheckConfig;
  retry?: TeamSpeakerRetryConfig;
}

export interface TeamSpeaker {
  name: string;
  uuid: string;
  running: boolean;
  in_flight: boolean;
  persistent: boolean;
  state: TeamSpeakerState;
  desired_state: "stopped" | "running";
  config_version: number;
  associations: number;
  session?: string;
  last_attempt_at?: string;
  last_success_at?: string;
  last_error?: string;
  config: TeamSpeakerConfig;
}

export interface TeamSpeakerCreateRequest {
  name: string;
  persistent?: boolean;
  config: TeamSpeakerConfig;
}

export interface TeamSpeakerUpdateRequest {
  name: string;
  new_name?: string;
  persistent?: boolean;
  config?: TeamSpeakerConfig;
  expected_config_version?: number;
}

export interface TeamSession {
  name: string;
  uuid: string;
  color: string;
  note: string;
  payload_type: string;
  transport: "listener" | "speaker";
  speaker?: string;
  speaker_uuid?: string;
  listener?: string;
  listener_uuid?: string;
  user: string;
  hostname: string;
  process: string;
  socket: string;
  pid: number;
  sleep: number;
  alive: boolean;
  liveness: "healthy" | "unavailable" | "unknown";
  health_monitoring: boolean;
  terminating: boolean;
  first_seen: string;
  last_seen: string;
}

export interface TeamSessionUpdateRequest {
  name: string;
  color?: string;
  note?: string;
}

export type TeamStreamState =
  | "waiting_implant"
  | "waiting_consumer"
  | "bridging"
  | "closed"
  | "expired"
  | "failed";

export interface TeamStream {
  id: string;
  session: string;
  task_id?: string;
  service: string;
  command?: string;
  local_address: string;
  local_host: string;
  local_port: number;
  state: TeamStreamState;
  created_at: string;
  expires_at?: string;
  implant_attached_at?: string;
  consumer_attached_at?: string;
  closed_at?: string;
  bytes_from_implant?: number;
  bytes_to_implant?: number;
  error?: string;
}

export interface TeamCommand {
  payload_type: string;
  name: string;
  description: string;
}

export interface TeamLoot {
  uuid: string;
  session: string;
  file_name: string;
  size: number;
  sha256?: string;
  created_at?: string;
}

export interface TeamLootGetReply {
  loot: TeamLoot;
  download_url: string;
}

export interface TeamScript {
  name: string;
  path: string;
  loaded: boolean;
  sha256?: string;
}

export interface TeamProfile {
  name: string;
  listener_uuid: string;
  type: string;
  mode: "reverse" | "bind";
  lhost: string;
  os: string;
  arch: string;
  os_options: string[];
  arch_options: string[];
  protocol: string;
  options: Record<string, unknown>;
  ots?: string;
  ots_configured: boolean;
  ots_expires_at?: string;
  ots_used_at?: string;
  config_version?: number;
  definition_created_at?: string;
  definition_updated_at?: string;
  output: string;
  public_key: string;
  template?: string;
  builder?: string;
}

export type TeamProfileUpdateKey =
  | "TYPE"
  | "MODE"
  | "LHOST"
  | "OS"
  | "ARCH"
  | "PROTOCOL"
  | "OPTIONS"
  | "OTS"
  | "OTS_CLEAR"
  | "OTS_EXPIRES_AT"
  | "OUTPUT"
  | "PUBLICKEY";

export interface TeamProfileUpdateRequest {
  name: string;
  key: TeamProfileUpdateKey;
  value: string;
}

export interface TeamBuild {
  id: string;
  profile: string;
  builder: string;
  status: string;
  artifact_name?: string;
  error?: string;
  created_at: string;
  completed_at?: string;
  download_url?: string;
}

export interface TeamBuildCreateRequest {
  profile: string;
  builder: string;
}

export interface TeamBuildOutput {
  build_id: string;
  profile: string;
  builder: string;
  message: string;
  sequence?: number;
  time?: string;
}

export interface TeamPayloadBuilder {
  name: string;
  description?: string;
  type?: string;
  source?: string;
}

export interface TeamUser {
  name: string;
  uuid: string;
  admin: boolean;
  connected: boolean;
  created: string;
  last_seen?: string;
}

export interface TeamUserCredentials {
  user: TeamUser;
  token: string;
}

export interface TeamUserMessage {
  user: string;
  message: string;
}

export interface TeamSnapshot {
  listeners: TeamListener[];
  speakers: TeamSpeaker[];
  sessions: TeamSession[];
  scripts: TeamScript[];
  profiles: TeamProfile[];
  builds: TeamBuild[];
  commands: TeamCommand[];
  users: TeamUser[];
  streams?: TeamStream[];
  event_sequence: number;
}

export interface TeamTask {
  id: string;
  session: string;
  code: number;
  status: string;
  attempts: number;
  registered: string;
  last_sent?: string;
  response_time?: string;
  response?: string;
}

export interface TeamSessionOutput {
  session: string;
  task_id: string;
  message: string;
  source: string;
}

export interface TeamCommandExecuteReply {
  task_ids?: string[];
  message?: string;
}

export interface TeamEventRecord {
  sequence: number;
  type: string;
  time: string;
  data: unknown;
}

export interface TeamEventCursor {
  server_id: string;
  sequence: number;
}

export interface TeamTrafficRecord {
  payload: string;
  byte_length: number;
  byte_length_is_lower_bound: boolean;
  truncated: boolean;
}

export interface TeamServerClientConfig {
  serverAddress: string;
  token: string;
  timeoutMs?: number;
  initialEventCursor?: TeamEventCursor;
  onEvent?: (event: TeamEnvelope) => void;
  onReplay?: (events: TeamEnvelope[]) => void;
  onReplayWarning?: (message: string) => void;
  onEventCursorChange?: (cursor: TeamEventCursor) => void;
  onTraffic?: (direction: "INBOUND" | "OUTBOUND", record: TeamTrafficRecord) => void;
  onConnectionChange?: (connected: boolean, reason?: string) => void;
}

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (reason: Error) => void;
  timeout: number;
  operation: string;
}

export class TeamApiError extends Error {
  readonly code: string;
  readonly retryable: boolean;

  constructor(payload: TeamApiErrorPayload) {
    super(payload.message);
    this.name = "TeamApiError";
    this.code = payload.code;
    this.retryable = Boolean(payload.retryable);
  }
}

export class TeamMessageTooLargeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TeamMessageTooLargeError";
  }
}

const createID = () => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
};

const TEAM_CLIENT_ID_STORAGE_KEY = "purpcmd.client_id";
let fallbackClientID = "";

const stableClientID = () => {
  try {
    const stored = window.localStorage.getItem(TEAM_CLIENT_ID_STORAGE_KEY)?.trim();
    if (stored) return stored;
    const created = createID();
    window.localStorage.setItem(TEAM_CLIENT_ID_STORAGE_KEY, created);
    return created;
  } catch {
    if (!fallbackClientID) fallbackClientID = createID();
    return fallbackClientID;
  }
};

const encodeBrowserAuthToken = (token: string) => {
  const bytes = new TextEncoder().encode(token);
  let binary = "";
  bytes.forEach(byte => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
};

const websocketEndpoint = (serverAddress: string) => {
  const endpoint = new URL("/api/v1/ws", serverAddress);
  if (endpoint.protocol === "http:") endpoint.protocol = "ws:";
  if (endpoint.protocol === "https:") endpoint.protocol = "wss:";
  if (endpoint.protocol !== "ws:" && endpoint.protocol !== "wss:") {
    throw new Error(`Unsupported teamserver protocol: ${endpoint.protocol}`);
  }
  return endpoint.toString();
};

const measureControlMessage = (raw: string) => {
  if (raw.length > MAX_CONTROL_MESSAGE_BYTES) {
    return { byteLength: raw.length, byteLengthIsLowerBound: true };
  }
  return {
    byteLength: new TextEncoder().encode(raw).byteLength,
    byteLengthIsLowerBound: false
  };
};

const createTrafficRecord = (raw: string): TeamTrafficRecord => {
  const { byteLength, byteLengthIsLowerBound } = measureControlMessage(raw);
  const truncated = byteLength > MAX_TRAFFIC_PREVIEW_BYTES;
  const size = `${byteLengthIsLowerBound ? "at least " : ""}${byteLength.toLocaleString()} bytes`;
  return {
    payload: truncated ? `[payload omitted: ${size}; preview limit is ${MAX_TRAFFIC_PREVIEW_BYTES.toLocaleString()} bytes]` : raw,
    byte_length: byteLength,
    byte_length_is_lower_bound: byteLengthIsLowerBound,
    truncated
  };
};

const extractEnvelopeID = (raw: string) => raw
  .slice(0, 4096)
  .match(/"id"\s*:\s*"([^"\\]{1,128})"/)?.[1];

export class TeamServerClient {
  private readonly config: Required<Pick<TeamServerClientConfig, "serverAddress" | "token" | "timeoutMs">> & TeamServerClientConfig;
  private readonly clientID = stableClientID();
  private readonly pending = new Map<string, PendingRequest>();
  private socket: WebSocket | null = null;
  private lastSequence: number;
  private serverID: string;
  private replayResponseBytes = 0;
  private manuallyClosed = false;

  constructor(config: TeamServerClientConfig) {
    this.config = {
      ...config,
      serverAddress: config.serverAddress.replace(/\/$/, ""),
      token: config.token,
      timeoutMs: config.timeoutMs ?? 15_000
    };
    this.lastSequence = Math.max(0, config.initialEventCursor?.sequence || 0);
    this.serverID = config.initialEventCursor?.server_id || "";
  }

  get connected() {
    return this.socket?.readyState === WebSocket.OPEN;
  }

  async connect(): Promise<void> {
    if (this.connected) return;
    if (this.socket && this.socket.readyState === WebSocket.CONNECTING) {
      throw new Error("A teamserver connection is already in progress.");
    }

    this.manuallyClosed = false;
    const authProtocol = TEAM_API_BROWSER_AUTH_PREFIX + encodeBrowserAuthToken(this.config.token);
    const socket = new WebSocket(websocketEndpoint(this.config.serverAddress), [TEAM_API_SUBPROTOCOL, authProtocol]);
    this.socket = socket;

    await new Promise<void>((resolve, reject) => {
      const timeout = window.setTimeout(() => {
        socket.close();
        reject(new Error("Timed out while connecting to the teamserver."));
      }, this.config.timeoutMs);

      socket.onopen = () => {
        window.clearTimeout(timeout);
        if ("protocol" in socket && socket.protocol !== TEAM_API_SUBPROTOCOL) {
          socket.close(1002, "TeamServer selected an unsupported WebSocket subprotocol");
          reject(new Error(`TeamServer selected unsupported WebSocket subprotocol ${socket.protocol || "(none)"}.`));
          return;
        }
        this.config.onConnectionChange?.(true);
        resolve();
      };
      socket.onerror = () => {
        window.clearTimeout(timeout);
        reject(new Error(
          "The TeamServer rejected the WebSocket upgrade. Verify the token and restart a TeamServer built with browser authentication support (purpcmd.auth.)."
        ));
      };
      socket.onmessage = event => {
        if (this.socket === socket) this.handleMessage(String(event.data));
      };
      socket.onclose = event => {
        window.clearTimeout(timeout);
        this.handleClose(socket, event.code, event.reason);
      };
    });
  }

  async initialize(): Promise<{ hello: TeamHelloReply; snapshot: TeamSnapshot }> {
    await this.connect();
    const hello = await this.hello();
    const snapshot = await this.request<TeamSnapshot>(TeamOperations.systemSnapshot, {});
    this.advanceEventSequence(snapshot.event_sequence || 0);
    return { hello, snapshot };
  }

  async request<T>(operation: string, data: unknown, timeoutMs?: number): Promise<T> {
    const id = createID();
    const envelope: TeamEnvelope = {
      version: TEAM_API_VERSION,
      type: operation,
      id,
      client_id: this.clientID,
      time: new Date().toISOString(),
      data
    };
    const raw = JSON.stringify(envelope);
    if (measureControlMessage(raw).byteLength > MAX_CONTROL_MESSAGE_BYTES) {
      throw new Error("Teamserver control message exceeds the 1 MiB protocol limit.");
    }

    if (!this.connected) {
      throw new Error("Not connected to the teamserver. Reconnect to restore event continuity before retrying the request.");
    }
    return this.requestOnce<T>(id, operation, raw, timeoutMs ?? this.config.timeoutMs);
  }

  async download(remotePath: string): Promise<Blob> {
    const serverEndpoint = new URL(this.config.serverAddress);
    const endpoint = new URL(remotePath, `${serverEndpoint.origin}/`);
    if (endpoint.protocol !== "http:" && endpoint.protocol !== "https:") {
      throw new Error(`Unsupported download protocol: ${endpoint.protocol}`);
    }
    if (endpoint.origin !== serverEndpoint.origin) {
      throw new Error("The TeamServer returned a download URL for a different origin.");
    }

    const response = await fetch(endpoint, {
      method: "GET",
      headers: { Authorization: `Bearer ${this.config.token}` }
    });
    if (!response.ok) {
      const message = (await response.text()).trim();
      throw new Error(`TeamServer download failed (${response.status}): ${message || response.statusText}`);
    }
    return response.blob();
  }

  private requestOnce<T>(id: string, operation: string, raw: string, timeoutMs: number): Promise<T> {
    const socket = this.socket;
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      return Promise.reject(new Error("Not connected to the teamserver."));
    }

    return new Promise<T>((resolve, reject) => {
      const timeout = window.setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Teamserver request timed out: ${operation}`));
      }, timeoutMs);
      this.pending.set(id, {
        resolve: value => resolve(value as T),
        reject,
        timeout,
        operation
      });
      this.captureTraffic("OUTBOUND", raw);
      try {
        socket.send(raw);
      } catch (error) {
        window.clearTimeout(timeout);
        this.pending.delete(id);
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }

  private disconnectCurrent(): void {
    const socket = this.socket;
    this.socket = null;
    if (socket && socket.readyState < WebSocket.CLOSING) socket.close();
  }

  close(): void {
    this.manuallyClosed = true;
    const socket = this.socket;
    this.socket = null;
    if (socket && socket.readyState < WebSocket.CLOSING) {
      socket.close(1000, "Operator disconnected");
    }
    this.rejectPending(new Error("Disconnected from the teamserver."));
    this.config.onConnectionChange?.(false, "Operator disconnected");
  }

  private async hello(): Promise<TeamHelloReply> {
    const requestedReplayFrom = this.lastSequence;
    const hello = await this.request<TeamHelloReply>(TeamOperations.systemHello, {
      last_event_sequence: requestedReplayFrom
    });
    const sameServer = !this.serverID || this.serverID === hello.server_id;
    this.serverID = hello.server_id;
    if (!sameServer || requestedReplayFrom > hello.event_sequence) {
      this.lastSequence = 0;
    }
    this.publishEventCursor();

    const replayFrom = this.lastSequence;
    // A cold dashboard has no continuity to restore. The snapshot requested
    // immediately after hello is its authoritative state baseline.
    if (!hello.resync_required || replayFrom === 0) return hello;

    let cursor = replayFrom;
    let replayedRecords = 0;
    this.replayResponseBytes = 0;
    while (cursor < hello.event_sequence) {
      let records: TeamEventRecord[];
      try {
        records = await this.request<TeamEventRecord[]>(TeamOperations.eventReplay, {
          after: cursor,
          limit: REPLAY_PAGE_EVENT_LIMIT
        });
      } catch (error) {
        if (!(error instanceof TeamMessageTooLargeError)) throw error;
        this.config.onReplayWarning?.(`${error.message} Continuing with a fresh snapshot; some transient events may be omitted.`);
        break;
      }
      if (records.length === 0) break;

      const previousCursor = cursor;
      const replayEvents: TeamEnvelope[] = [];
      const remainingRecords = Math.max(0, MAX_REPLAY_EVENTS - replayedRecords);
      const boundedRecords = records.slice(0, remainingRecords);
      for (const record of boundedRecords) {
        cursor = Math.max(cursor, record.sequence);
        if (record.sequence > 0 && record.sequence <= this.lastSequence) continue;
        const envelope: TeamEnvelope = {
          version: TEAM_API_VERSION,
          type: record.type,
          sequence: record.sequence,
          time: record.time,
          ok: true,
          data: record.data
        };
        this.advanceEventSequence(record.sequence);
        replayEvents.push(envelope);
      }
      replayedRecords += boundedRecords.length;
      if (replayEvents.length > 0) {
        if (this.config.onReplay) this.config.onReplay(replayEvents);
        else replayEvents.forEach(event => this.config.onEvent?.(event));
      }
      if (replayedRecords >= MAX_REPLAY_EVENTS || this.replayResponseBytes >= MAX_REPLAY_TRANSFER_BYTES) {
        this.config.onReplayWarning?.(
          `Warm replay reached its safety budget (${replayedRecords.toLocaleString()} events, ${this.replayResponseBytes.toLocaleString()} bytes). Continuing with the snapshot.`
        );
        break;
      }
      if (cursor <= previousCursor || records.length < REPLAY_PAGE_EVENT_LIMIT) break;
    }
    return hello;
  }

  private handleMessage(raw: string): void {
    const traffic = this.captureTraffic("INBOUND", raw);
    if (traffic.byte_length > MAX_CONTROL_MESSAGE_BYTES) {
      const size = `${traffic.byte_length_is_lower_bound ? "at least " : ""}${traffic.byte_length.toLocaleString()} bytes`;
      const error = new TeamMessageTooLargeError(`TeamServer response is ${size}, exceeding the 1 MiB control-message limit.`);
      const id = extractEnvelopeID(raw);
      const pending = id ? this.pending.get(id) : undefined;
      if (id && pending) {
        window.clearTimeout(pending.timeout);
        this.pending.delete(id);
        pending.reject(error);
      } else {
        this.rejectPending(error);
        this.disconnectCurrent();
        this.config.onConnectionChange?.(false, error.message);
      }
      return;
    }

    let envelope: TeamEnvelope;
    try {
      envelope = JSON.parse(raw) as TeamEnvelope;
    } catch {
      return;
    }
    if (envelope.type?.startsWith("evt.")) {
      this.acceptEvent(envelope);
      return;
    }
    if (!envelope.id) return;
    const pending = this.pending.get(envelope.id);
    if (!pending) return;
    window.clearTimeout(pending.timeout);
    this.pending.delete(envelope.id);
    if (envelope.error) {
      pending.reject(new TeamApiError(envelope.error));
      return;
    }
    if (!envelope.ok) {
      pending.reject(new Error(`Teamserver returned an unsuccessful reply for ${envelope.type}.`));
      return;
    }
    if (pending.operation === TeamOperations.eventReplay) {
      this.replayResponseBytes += traffic.byte_length;
    }
    pending.resolve(envelope.data);
  }

  private acceptEvent(envelope: TeamEnvelope): void {
    const sequence = envelope.sequence ?? 0;
    if (sequence > 0 && sequence <= this.lastSequence) return;
    if (sequence > 0) this.advanceEventSequence(sequence);
    this.config.onEvent?.(envelope);
  }

  private captureTraffic(direction: "INBOUND" | "OUTBOUND", raw: string): TeamTrafficRecord {
    const record = createTrafficRecord(raw);
    this.config.onTraffic?.(direction, record);
    return record;
  }

  private advanceEventSequence(sequence: number): void {
    if (sequence <= this.lastSequence) return;
    this.lastSequence = sequence;
    this.publishEventCursor();
  }

  private publishEventCursor(): void {
    if (!this.serverID) return;
    this.config.onEventCursorChange?.({ server_id: this.serverID, sequence: this.lastSequence });
  }

  private handleClose(socket: WebSocket, code: number, reason: string): void {
    if (this.socket !== socket) return;
    this.socket = null;
    const message = reason || `WebSocket closed with code ${code}`;
    this.rejectPending(new Error(message));
    if (!this.manuallyClosed) {
      this.config.onConnectionChange?.(false, message);
    }
  }

  private rejectPending(error: Error): void {
    for (const pending of this.pending.values()) {
      window.clearTimeout(pending.timeout);
      pending.reject(error);
    }
    this.pending.clear();
  }
}
