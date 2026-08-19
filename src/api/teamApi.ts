export const TEAM_API_VERSION = 1;
export const TEAM_API_SUBPROTOCOL = "purpcmd.v1";
export const TEAM_API_BROWSER_AUTH_PREFIX = "purpcmd.auth.";
export const MAX_CONTROL_MESSAGE_BYTES = 1 << 20;

export const TeamOperations = {
  systemHello: "ask.system.hello",
  systemSnapshot: "ask.system.snapshot",
  listenerCreate: "ask.listener.create",
  listenerStart: "ask.listener.start",
  listenerStop: "ask.listener.stop",
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
  buildCreate: "ask.build.create",
  buildGet: "ask.build.get",
  eventReplay: "ask.event.replay"
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

export interface TeamListener {
  name: string;
  uuid: string;
  host: string;
  port: string;
  running: boolean;
  persistent: boolean;
  associations: number;
}

export interface TeamSession {
  name: string;
  uuid: string;
  payload_type: string;
  user: string;
  hostname: string;
  process: string;
  socket: string;
  pid: number;
  sleep: number;
  alive: boolean;
  terminating: boolean;
  first_seen: string;
  last_seen: string;
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
  type: string;
  lhost: string;
  os: string;
  arch: string;
  uri: string;
  ua: string;
  output: string;
  template: string;
  public_key: string;
}

export type TeamProfileUpdateKey =
  | "TYPE"
  | "LHOST"
  | "OS"
  | "ARCH"
  | "URI"
  | "UA"
  | "OUTPUT"
  | "TEMPLATE"
  | "PUBLICKEY";

export interface TeamProfileUpdateRequest {
  name: string;
  key: TeamProfileUpdateKey;
  value: string;
}

export interface TeamBuild {
  id: string;
  profile: string;
  status: string;
  artifact_name?: string;
  error?: string;
  created_at: string;
  completed_at?: string;
  download_url?: string;
}

export interface TeamSnapshot {
  listeners: TeamListener[];
  sessions: TeamSession[];
  scripts: TeamScript[];
  profiles: TeamProfile[];
  commands: TeamCommand[];
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

export interface TeamServerClientConfig {
  serverAddress: string;
  token: string;
  timeoutMs?: number;
  onEvent?: (event: TeamEnvelope) => void;
  onTraffic?: (direction: "INBOUND" | "OUTBOUND", raw: string) => void;
  onConnectionChange?: (connected: boolean, reason?: string) => void;
}

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (reason: Error) => void;
  timeout: number;
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

const createID = () => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
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

export class TeamServerClient {
  private readonly config: Required<Pick<TeamServerClientConfig, "serverAddress" | "token" | "timeoutMs">> & TeamServerClientConfig;
  private readonly clientID = createID();
  private readonly pending = new Map<string, PendingRequest>();
  private socket: WebSocket | null = null;
  private lastSequence = 0;
  private manuallyClosed = false;

  constructor(config: TeamServerClientConfig) {
    this.config = {
      ...config,
      serverAddress: config.serverAddress.replace(/\/$/, ""),
      token: config.token,
      timeoutMs: config.timeoutMs ?? 15_000
    };
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
    this.lastSequence = Math.max(this.lastSequence, snapshot.event_sequence || 0);
    return { hello, snapshot };
  }

  async request<T>(operation: string, data: unknown): Promise<T> {
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
    if (new TextEncoder().encode(raw).byteLength > MAX_CONTROL_MESSAGE_BYTES) {
      throw new Error("Teamserver control message exceeds the 1 MiB protocol limit.");
    }

    let lastError: Error | null = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        await this.connect();
        return await this.requestOnce<T>(id, operation, raw);
      } catch (error) {
        const requestError = error instanceof Error ? error : new Error(String(error));
        if (requestError instanceof TeamApiError) throw requestError;
        lastError = requestError;
        if (attempt === 0) this.disconnectCurrent();
      }
    }
    throw lastError ?? new Error(`Teamserver request failed: ${operation}`);
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
      throw new Error(`Loot download failed (${response.status}): ${message || response.statusText}`);
    }
    return response.blob();
  }

  private requestOnce<T>(id: string, operation: string, raw: string): Promise<T> {
    const socket = this.socket;
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      return Promise.reject(new Error("Not connected to the teamserver."));
    }

    return new Promise<T>((resolve, reject) => {
      const timeout = window.setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Teamserver request timed out: ${operation}`));
      }, this.config.timeoutMs);
      this.pending.set(id, {
        resolve: value => resolve(value as T),
        reject,
        timeout
      });
      this.config.onTraffic?.("OUTBOUND", raw);
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
    const replayFrom = this.lastSequence;
    const hello = await this.request<TeamHelloReply>(TeamOperations.systemHello, {
      last_event_sequence: replayFrom
    });
    // A new dashboard has no local event continuity to restore. Its snapshot is
    // the authoritative baseline, so replaying the entire persisted event
    // database only duplicates state and can block the browser on busy servers.
    if (!hello.resync_required || replayFrom === 0) return hello;

    let cursor = replayFrom;
    while (cursor < hello.event_sequence) {
      const records = await this.request<TeamEventRecord[]>(TeamOperations.eventReplay, {
        after: cursor,
        limit: 1000
      });
      if (records.length === 0) break;
      for (const record of records) {
        this.acceptEvent({
          version: TEAM_API_VERSION,
          type: record.type,
          sequence: record.sequence,
          time: record.time,
          ok: true,
          data: record.data
        });
        cursor = record.sequence;
      }
      if (records.length < 1000) break;
    }
    return hello;
  }

  private handleMessage(raw: string): void {
    this.config.onTraffic?.("INBOUND", raw);
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
    pending.resolve(envelope.data);
  }

  private acceptEvent(envelope: TeamEnvelope): void {
    const sequence = envelope.sequence ?? 0;
    if (sequence > 0 && sequence <= this.lastSequence) return;
    if (sequence > 0) this.lastSequence = sequence;
    this.config.onEvent?.(envelope);
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
