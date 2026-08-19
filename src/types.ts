export type ConsoleTabType =
  | "event_log"
  | "sessions"
  | "listeners"
  | "loots"
  | "downloads"
  | "screenshots"
  | "scripts"
  | "packets"
  | "session";

export interface ConsoleTab {
  id: string;
  title: string;
  type: ConsoleTabType;
  sessionId?: string;
}

export interface Session {
  id: string;
  extIp: string;
  intIp: string;
  listener: string;
  user: string;
  computer: string;
  note: string;
  process: string;
  pid: number;
  arch: "x64" | "x86" | "ARM64" | "Unknown";
  lastActive: number; // in seconds
  lastSeenAt?: number; // source timestamp used to keep lastActive accurate
  sleepSeconds?: number; // numeric callback interval supplied by the TeamServer
  sleep: string; // e.g. "5s", "1m", "Interactive"
  os: "Windows" | "Linux" | "macOS" | "Unknown";
  status: "active" | "lost" | "killed";
}

export interface ConnectionSettings {
  username: string;
  token: string;
  serverAddress: string;
}

export interface Listener {
  id: string;
  name: string;
  payloadType: "Session HTTP" | "Session HTTPS" | "Session DNS" | "Session TCP" | "Foreign HTTP";
  host: string;
  port: number;
  status: "Active" | "Stopped";
  encryption: "AES-256-GCM" | "ChaCha20" | "RC4" | "None (Plaintext)";
  persistent?: boolean;
  associations?: number;
}

export interface Command {
  payloadType: string;
  name: string;
  description: string;
}

export interface Loot {
  id: string;
  type: "Credential" | "Screenshot" | "File" | "Token";
  sourceSession: string;
  capturedAt: string;
  data: string; // e.g. "Administrator:500:aad3b435b51404eeaad3b435b51404ee:31d6cfe0d16ae931b73c59d7e0c089c0:::"
  description: string;
  size?: number;
  sha256?: string;
}

export interface Script {
  id: string;
  name: string;
  description: string;
  loadedAt: string;
  status: "Active" | "Disabled";
  content: string;
}

export interface ConsoleLog {
  id: string;
  timestamp: string;
  type: "system" | "input" | "output" | "error" | "crypto";
  message: string;
  sessionId?: string; // empty for general event log
  encryptedHex?: string; // Encrypted representation for C2 visual feedback
}

export interface Packet {
  id: string;
  timestamp: string;
  direction: "INBOUND" | "OUTBOUND" | "SYSTEM";
  type: "WebSocket" | "HTTP";
  size: number;
  encryption: string;
  payload: string;
}
