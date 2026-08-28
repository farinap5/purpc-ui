import { useState, useRef } from "react";
import { Session, Listener, Loot, Script, ConsoleLog, Packet, ConnectionSettings, Command, ConsoleTab, ConsoleTabType } from "./types";
import { C2Toolbar } from "./components/C2Toolbar";
import { C2SessionTable } from "./components/C2SessionTable";
import { C2Console } from "./components/C2Console";
import { PayloadGenerator } from "./components/PayloadGenerator";
import { BuildManager } from "./components/BuildManager";
import { ProfileManager } from "./components/ProfileManager";
import { SettingsModal } from "./components/SettingsModal";
import { AuthenticationPage } from "./components/AuthenticationPage";
import { isImageFileName, isSecretFileName } from "./utils/loot";
import {
  isBuildStateEvent,
  normalizeBuildOutput,
  normalizePayloadBuilders,
  reducePayloadBuilderEvent,
  retainBuildOutput,
  sortTeamBuilds,
  upsertTeamBuild
} from "./utils/teamBuildFlow";
import {
  TeamBuild,
  TeamBuildCreateRequest,
  TeamBuildOutput,
  TeamCommand,
  TeamCommandExecuteReply,
  TeamEnvelope,
  TeamEventCursor,
  TeamEvents,
  TeamListener,
  TeamLoot,
  TeamLootGetReply,
  TeamOperations,
  TeamPayloadBuilder,
  TeamProfile,
  TeamProfileUpdateKey,
  TeamScript,
  TeamSessionOutput,
  TeamServerClient,
  TeamSession,
  TeamSnapshot,
  TeamTask,
  TeamUser,
  TeamUserCredentials,
  TeamUserMessage
} from "./api/teamApi";

const MAX_EVENT_MONITOR_EVENTS = 1000;
const MAX_EVENT_MONITOR_CAPTURE_BYTES = 1 << 20;
const MAX_CONSOLE_LOGS = 1000;
const MAX_CONSOLE_LOG_CHARACTERS = 512 << 10;
const MAX_CONSOLE_MESSAGE_CHARACTERS = 64 << 10;
const USER_STATUS_EVENTS = new Set<string>([
  TeamEvents.userLogin,
  TeamEvents.userLogout,
  TeamEvents.userCreated,
  TeamEvents.userUpdated
]);

const sortTeamUsers = (users: TeamUser[]) => [...users].sort((left, right) => {
  if (left.admin !== right.admin) return left.admin ? -1 : 1;
  return left.name.localeCompare(right.name, undefined, { sensitivity: "base" });
});

const upsertTeamUser = (users: TeamUser[], user: TeamUser) => sortTeamUsers([
  ...users.filter(item => item.uuid !== user.uuid),
  user
]);


const redactSensitiveTraffic = (raw: string) => {
  const redact = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(redact);
    if (!value || typeof value !== "object") return value;
    return Object.fromEntries(Object.entries(value).map(([key, nested]) => [
      key,
      key.toLowerCase() === "token" ? "[REDACTED]" : redact(nested)
    ]));
  };

  try {
    return JSON.stringify(redact(JSON.parse(raw)));
  } catch {
    return raw;
  }
};

const createWebSocketSystemEvent = (action: string, address: string): Packet => ({
  id: `event-${action.toLowerCase()}-${Date.now()}`,
  timestamp: new Date().toLocaleTimeString(),
  direction: "SYSTEM",
  type: "WebSocket",
  size: 0,
  capturedSize: action.length + address.length + 1,
  encryption: "N/A",
  payload: `${action} ${address}`
});

const retainPackets = (packets: Packet[]) => {
  const retained: Packet[] = [];
  let capturedBytes = 0;
  for (const packet of packets) {
    if (retained.length >= MAX_EVENT_MONITOR_EVENTS) break;
    const packetBytes = packet.capturedSize ?? packet.payload.length;
    if (retained.length > 0 && capturedBytes + packetBytes > MAX_EVENT_MONITOR_CAPTURE_BYTES) break;
    retained.push(packet);
    capturedBytes += packetBytes;
  }
  return retained;
};

const mapTeamSession = (session: TeamSession, note = ""): Session => {
  const lastSeen = Date.parse(session.last_seen);
  return {
    id: session.name,
    extIp: session.socket || "—",
    intIp: session.uuid,
    listener: session.payload_type,
    user: session.user || "unknown",
    computer: session.hostname || "unknown",
    note,
    process: session.process || "unknown",
    pid: session.pid,
    arch: "Unknown",
    lastActive: Number.isFinite(lastSeen) ? Math.max(0, Math.floor((Date.now() - lastSeen) / 1000)) : 0,
    lastSeenAt: Number.isFinite(lastSeen) ? lastSeen : Date.now(),
    sleepSeconds: session.sleep,
    sleep: `${session.sleep} seconds`,
    os: "Unknown",
    status: session.terminating ? "killed" : session.alive ? "active" : "lost"
  };
};

const mapTeamListener = (listener: TeamListener): Listener => ({
  id: listener.name,
  name: listener.name,
  payloadType: "Session HTTP",
  host: listener.host,
  port: Number.parseInt(listener.port, 10) || 0,
  status: listener.running ? "Active" : "Stopped",
  encryption: "None (Plaintext)",
  persistent: listener.persistent,
  associations: listener.associations
});

const mapTeamLoot = (loot: TeamLoot): Loot => {
  const type: Loot["type"] = isImageFileName(loot.file_name)
    ? "Image"
    : isSecretFileName(loot.file_name) ? "Secret" : "File";

  return {
    id: loot.uuid,
    type,
    sourceSession: loot.session,
    capturedAt: loot.created_at ? new Date(loot.created_at).toLocaleString() : "—",
    data: loot.file_name,
    description: `${loot.size.toLocaleString()} bytes${loot.sha256 ? ` · SHA-256 ${loot.sha256}` : ""}`,
    size: loot.size,
    sha256: loot.sha256
  };
};

const mapTeamScript = (script: TeamScript): Script => ({
  id: script.path,
  name: script.name,
  description: script.path,
  loadedAt: "TeamServer",
  status: script.loaded ? "Active" : "Disabled",
  content: script.sha256 ? `-- SHA-256: ${script.sha256}\n-- Source: ${script.path}` : `-- Source: ${script.path}`
});

const mapTeamCommand = (command: TeamCommand): Command => ({
  payloadType: command.payload_type,
  name: command.name,
  description: command.description
});

const formatTaskTimestamp = (value?: string) => {
  const date = value ? new Date(value) : new Date();
  const safeDate = Number.isNaN(date.getTime()) ? new Date() : date;
  const month = String(safeDate.getMonth() + 1).padStart(2, "0");
  const day = String(safeDate.getDate()).padStart(2, "0");
  const year = safeDate.getFullYear();
  let hour = safeDate.getHours();
  const period = hour >= 12 ? "PM" : "AM";
  hour = hour % 12 || 12;
  const minute = String(safeDate.getMinutes()).padStart(2, "0");
  const second = String(safeDate.getSeconds()).padStart(2, "0");
  return `${month}/${day}/${year} ${String(hour).padStart(2, "0")}:${minute}:${second} ${period}`;
};

const truncateConsoleMessage = (message: string) => {
  if (message.length <= MAX_CONSOLE_MESSAGE_CHARACTERS) return message;
  const omitted = message.length - MAX_CONSOLE_MESSAGE_CHARACTERS;
  return `${message.slice(0, MAX_CONSOLE_MESSAGE_CHARACTERS)}\n[… ${omitted.toLocaleString()} characters omitted]`;
};

const retainConsoleLogs = (logs: ConsoleLog[]) => {
  const retained: ConsoleLog[] = [];
  let characters = 0;
  for (let index = logs.length - 1; index >= 0; index -= 1) {
    if (retained.length >= MAX_CONSOLE_LOGS) break;
    const log = logs[index];
    const message = truncateConsoleMessage(log.message);
    if (retained.length > 0 && characters + message.length > MAX_CONSOLE_LOG_CHARACTERS) break;
    retained.push(message === log.message ? log : { ...log, message });
    characters += message.length;
  }
  return retained.reverse();
};

const logsForServerEvent = (event: TeamEnvelope): ConsoleLog[] => {
  const eventTime = event.time ? new Date(event.time).toLocaleString() : new Date().toLocaleString();
  const taskTime = formatTaskTimestamp(event.time);
  const sequence = event.sequence ? ` #${event.sequence}` : "";
  const idPrefix = `${event.sequence || Date.now()}-${event.type}`;
  const userMessage = event.type === TeamEvents.userMessage ? event.data as TeamUserMessage : null;
  const eventUser = event.type.startsWith("evt.user.") && !userMessage ? event.data as TeamUser : null;
  const logs: ConsoleLog[] = [];

  if (event.type !== "evt.session.checkin") {
    logs.push({
      id: `event-${idPrefix}`,
      timestamp: eventTime,
      type: event.type === "evt.listener.failed" ? "error" : userMessage ? "input" : "system",
      message: userMessage?.user
        ? `<${userMessage.user}> ${userMessage.message}`
        : eventUser?.name
        ? `${event.type}${sequence}: ${eventUser.name} (${eventUser.uuid}) · ${eventUser.connected ? "connected" : "offline"}`
        : `${event.type}${sequence}`
    });
  }

  if (event.type === "evt.task.created") {
    const task = event.data as TeamTask;
    logs.push({ id: `log-${idPrefix}-created`, timestamp: formatTaskTimestamp(task.registered || event.time), type: "system", message: `task create: ${task.id}`, sessionId: task.session });
  } else if (event.type === "evt.task.dispatched") {
    const task = event.data as TeamTask;
    logs.push({ id: `log-${idPrefix}-dispatched`, timestamp: formatTaskTimestamp(task.last_sent || event.time), type: "system", message: `task collected: ${task.id}`, sessionId: task.session });
  } else if (event.type === "evt.task.completed") {
    const task = event.data as TeamTask;
    logs.push({ id: `log-${idPrefix}-completed`, timestamp: formatTaskTimestamp(task.response_time || event.time), type: "system", message: `task complete: ${task.id}`, sessionId: task.session });
  } else if (event.type === TeamEvents.sessionOutput) {
    const output = event.data as TeamSessionOutput;
    if (output?.session && typeof output.message === "string") {
      const source = output.source ? ` · ${output.source}` : "";
      const task = output.task_id ? `task output: ${output.task_id}${source}\n` : output.source ? `${output.source}\n` : "";
      logs.push({ id: `log-${idPrefix}-output`, timestamp: taskTime, type: "output", message: `${task}${output.message}`, sessionId: output.session });
    }
  } else if (event.type === "evt.script.output") {
    const output = event.data as { message?: string };
    if (output.message) logs.push({ id: `log-${idPrefix}-script`, timestamp: taskTime, type: "output", message: output.message });
  } else if (event.type === TeamEvents.buildOutput) {
    const output = normalizeBuildOutput(event);
    if (output) {
      logs.push({
        id: `log-${idPrefix}-build-output`,
        timestamp: taskTime,
        type: "output",
        message: `build output: ${output.build_id} · ${output.profile} · ${output.builder}\n${output.message}`
      });
    }
  }

  return logs;
};

export default function App() {
  // Master states
  const [sessions, setSessions] = useState<Session[]>([]);
  const [listeners, setListeners] = useState<Listener[]>([]);
  const [loots, setLoots] = useState<Loot[]>([]);
  const [scripts, setScripts] = useState<Script[]>([]);
  const [commands, setCommands] = useState<Command[]>([]);
  const [profiles, setProfiles] = useState<TeamProfile[]>([]);
  const [payloadBuilders, setPayloadBuilders] = useState<TeamPayloadBuilder[]>([]);
  const [builds, setBuilds] = useState<TeamBuild[]>([]);
  const [buildOutputByID, setBuildOutputByID] = useState<Record<string, TeamBuildOutput[]>>({});
  const [users, setUsers] = useState<TeamUser[]>([]);
  const [eventLogs, setEventLogs] = useState<ConsoleLog[]>([]);
  const [packets, setPackets] = useState<Packet[]>([]);

  // Connection settings
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isWsConnected, setIsWsConnected] = useState(false);
  const [operatorName, setOperatorName] = useState("gnome");
  const [authToken, setAuthToken] = useState("");
  const [serverAddress, setServerAddress] = useState("http://127.0.0.1:8080");
  const [currentLag, setCurrentLag] = useState(0);
  const clientRef = useRef<TeamServerClient | null>(null);
  const sessionNotesRef = useRef<Record<string, string>>({});
  const eventCursorByServerRef = useRef<Record<string, TeamEventCursor>>({});

  // Tabbed system state
  const [tabs, setTabs] = useState<ConsoleTab[]>([
    { id: "event_log", title: "Event Log", type: "event_log" }
  ]);
  const [activeTabId, setActiveTabId] = useState("event_log");
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);

  // Modal open states
  const [isPayloadOpen, setIsPayloadOpen] = useState(false);
  const [isBuildManagerOpen, setIsBuildManagerOpen] = useState(false);
  const [isProfileManagerOpen, setIsProfileManagerOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  // Workspace split-panel state
  const workspaceRef = useRef<HTMLDivElement | null>(null);
  const [upperPanelHeight, setUpperPanelHeight] = useState(42);
  const [isResizingPanels, setIsResizingPanels] = useState(false);

  const getPanelSplitLimits = () => {
    const workspaceHeight = workspaceRef.current?.getBoundingClientRect().height ?? 0;
    if (workspaceHeight <= 0) return { min: 20, max: 75 };

    const dividerHeight = 8;
    const minimumUpperHeight = 160;
    const minimumLowerHeight = 180;
    const min = (minimumUpperHeight / workspaceHeight) * 100;
    const max = ((workspaceHeight - minimumLowerHeight - dividerHeight) / workspaceHeight) * 100;

    return {
      min: Math.min(min, 50),
      max: Math.max(Math.min(max, 85), 50)
    };
  };

  const clampPanelSplit = (value: number) => {
    const { min, max } = getPanelSplitLimits();
    return Math.min(max, Math.max(min, value));
  };

  const handlePanelResize = (clientY: number) => {
    const workspaceBounds = workspaceRef.current?.getBoundingClientRect();
    if (!workspaceBounds || workspaceBounds.height <= 0) return;

    const nextHeight = ((clientY - workspaceBounds.top) / workspaceBounds.height) * 100;
    setUpperPanelHeight(clampPanelSplit(nextHeight));
  };

  // Helper: Open a tab or switch focus to it if it already exists
  const handleAddTab = (type: ConsoleTabType, title: string, id?: string) => {
    const tabId = id || type;
    const exists = tabs.find(t => t.id === tabId);
    
    if (!exists) {
      const newTab = {
        id: tabId,
        title,
        type,
        sessionId: type === "session" ? id : undefined
      };
      setTabs(prev => [...prev, newTab]);
    }
    setActiveTabId(tabId);
  };

  const handleCloseTab = (id: string) => {
    if (id === "event_log") return; // Keep Event Log persistent
    
    const index = tabs.findIndex(t => t.id === id);
    const newTabs = tabs.filter(t => t.id !== id);
    setTabs(newTabs);

    // If closing active tab, focus another tab
    if (activeTabId === id) {
      const nextActive = newTabs[Math.max(0, index - 1)];
      setActiveTabId(nextActive.id);
    }
  };

  // Interact with a Session (double-click row or right-click option)
  const handleInteract = (session: Session) => {
    handleAddTab("session", `${session.user}@${session.computer} (${session.id})`, session.id);
  };

  const appendLogs = (logs: ConsoleLog[]) => {
    if (logs.length === 0) return;
    setEventLogs(previous => retainConsoleLogs([...previous, ...logs]));
  };

  const appendLog = (log: ConsoleLog) => appendLogs([log]);

  const addLog = (type: ConsoleLog["type"], message: string, sessionId?: string, timestamp = new Date().toLocaleString()) => {
    appendLog({
      id: `log-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      timestamp,
      type,
      message,
      sessionId
    });
  };

  const removeSessionFromWorkspace = (id: string) => {
    delete sessionNotesRef.current[id];
    setSessions(previous => previous.filter(session => session.id !== id));
    setSelectedSessionId(current => current === id ? null : current);
    setTabs(previous => previous.filter(tab => tab.sessionId !== id));
    setActiveTabId(current => current === id ? "event_log" : current);
  };

  const applyBuildEvent = (event: TeamEnvelope) => {
    if (event.type === TeamEvents.buildOutput) {
      const output = normalizeBuildOutput(event);
      if (!output) return;
      setBuildOutputByID(previous => ({
        ...previous,
        [output.build_id]: retainBuildOutput([...(previous[output.build_id] || []), output])
      }));
      return;
    }
    if (event.type === TeamEvents.buildDeleted) {
      const deleted = event.data as (Partial<TeamBuild> & { build_id?: string }) | undefined;
      const deletedID = deleted?.id || deleted?.build_id;
      if (!deletedID) return;
      setBuilds(previous => previous.filter(build => build.id !== deletedID));
      setBuildOutputByID(previous => {
        if (!previous[deletedID]) return previous;
        const next = { ...previous };
        delete next[deletedID];
        return next;
      });
      return;
    }
    if (isBuildStateEvent(event.type)) {
      const build = event.data as TeamBuild;
      if (build?.id) setBuilds(previous => upsertTeamBuild(previous, build));
    }
  };

  const applyPayloadBuilderEvent = (event: TeamEnvelope) => {
    if (
      event.type === TeamEvents.payloadBuilderRegistered ||
      event.type === TeamEvents.payloadBuilderUnregistered
    ) {
      setPayloadBuilders(previous => reducePayloadBuilderEvent(previous, event));
    }
  };

  const applySnapshot = (snapshot: TeamSnapshot) => {
    setSessions(snapshot.sessions.map(session => mapTeamSession(session, sessionNotesRef.current[session.name] || "")));
    setListeners(snapshot.listeners.map(mapTeamListener));
    setScripts(snapshot.scripts.map(mapTeamScript));
    setCommands(snapshot.commands.map(mapTeamCommand));
    setProfiles(snapshot.profiles);
    setBuilds(sortTeamBuilds(snapshot.builds || []));
    setUsers(sortTeamUsers(snapshot.users || []));
    setSelectedSessionId(current => {
      if (current && snapshot.sessions.some(session => session.name === current)) return current;
      return snapshot.sessions[0]?.name ?? null;
    });
  };

  const refreshServerState = async (client = clientRef.current) => {
    if (!client?.connected) return;
    const [snapshot, serverLoot, serverPayloadBuilders] = await Promise.all([
      client.request<TeamSnapshot>(TeamOperations.systemSnapshot, {}),
      client.request<TeamLoot[]>(TeamOperations.lootList, {}),
      client.request<unknown>(TeamOperations.payloadBuilderList, {})
    ]);
    applySnapshot(snapshot);
    setLoots(serverLoot.map(mapTeamLoot));
    setPayloadBuilders(normalizePayloadBuilders(serverPayloadBuilders));
  };

  const handleServerEvent = async (event: TeamEnvelope, client: TeamServerClient) => {
    appendLogs(logsForServerEvent(event));
    applyBuildEvent(event);
    applyPayloadBuilderEvent(event);

    if (USER_STATUS_EVENTS.has(event.type)) {
      const user = event.data as TeamUser;
      if (user?.uuid) setUsers(previous => upsertTeamUser(previous, user));
    } else if (event.type === TeamEvents.userDeleted) {
      const user = event.data as TeamUser;
      if (user?.uuid || user?.name) {
        setUsers(previous => previous.filter(item => item.uuid !== user.uuid && item.name !== user.name));
      }
    } else if (event.type === "evt.loot.created") {
      const createdLoot = mapTeamLoot(event.data as TeamLoot);
      setLoots(previous => [...previous.filter(item => item.id !== createdLoot.id), createdLoot]);
    } else if (event.type === "evt.loot.deleted") {
      const deletedLoot = event.data as TeamLoot;
      if (deletedLoot.uuid) setLoots(previous => previous.filter(item => item.id !== deletedLoot.uuid));
    } else if (event.type === "evt.session.deleted") {
      const deletedSession = event.data as { name?: string };
      if (deletedSession.name) removeSessionFromWorkspace(deletedSession.name);
    } else if (event.type === "evt.session.checkin") {
      const checkedInSession = event.data as TeamSession;
      const mappedSession = mapTeamSession(
        checkedInSession,
        sessionNotesRef.current[checkedInSession.name] || ""
      );
      setSessions(previous => {
        const existingIndex = previous.findIndex(session => session.id === mappedSession.id);
        if (existingIndex === -1) return [...previous, mappedSession];
        return previous.map((session, index) => index === existingIndex ? mappedSession : session);
      });
    }

    try {
      if (
        event.type.startsWith("evt.listener.") ||
        (event.type.startsWith("evt.session.") && !["evt.session.checkin", "evt.session.deleted", TeamEvents.sessionOutput].includes(event.type)) ||
        event.type.startsWith("evt.script.")
      ) {
        const snapshot = await client.request<TeamSnapshot>(TeamOperations.systemSnapshot, {});
        applySnapshot(snapshot);
      }
    } catch (error) {
      addLog("error", `Failed to refresh state after ${event.type}: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  const connectToTeamServer = async (settings: ConnectionSettings) => {
    const previousClient = clientRef.current;
    clientRef.current = null;
    previousClient?.close();
    setIsWsConnected(false);

    let client: TeamServerClient;
    let initializing = true;
    const initializationEvents: TeamEnvelope[] = [];
    const serverKey = settings.serverAddress.replace(/\/$/, "");
    client = new TeamServerClient({
      serverAddress: settings.serverAddress,
      token: settings.token,
      initialEventCursor: eventCursorByServerRef.current[serverKey],
      onEventCursorChange: cursor => {
        if (clientRef.current === client) eventCursorByServerRef.current[serverKey] = cursor;
      },
      onReplay: events => {
        appendLogs(events.flatMap(logsForServerEvent));
        events.forEach(event => {
          applyBuildEvent(event);
          applyPayloadBuilderEvent(event);
        });
      },
      onReplayWarning: message => addLog("error", message),
      onTraffic: (direction, traffic) => {
        const payload = redactSensitiveTraffic(traffic.payload);
        const packet: Packet = {
          id: `frame-${Date.now()}-${Math.random().toString(36).slice(2)}`,
          timestamp: new Date().toLocaleTimeString(),
          direction,
          type: "WebSocket",
          size: traffic.byte_length,
          sizeIsLowerBound: traffic.byte_length_is_lower_bound,
          capturedSize: new TextEncoder().encode(payload).byteLength,
          encryption: settings.serverAddress.startsWith("https:") ? "TLS" : "None",
          payload
        };
        setPackets(previous => retainPackets([packet, ...previous]));
      },
      onEvent: event => {
        if (initializing) initializationEvents.push(event);
        else void handleServerEvent(event, client);
      },
      onConnectionChange: (connected, reason) => {
        if (clientRef.current !== client) return;
        setIsWsConnected(connected);
        if (!connected && reason && reason !== "Operator disconnected") {
          addLog("system", `${TeamEvents.userLogout}: ${settings.username} · local connection closed`);
          addLog("error", `TeamServer connection lost: ${reason}`);
          setPackets(previous => retainPackets([
            createWebSocketSystemEvent("CLOSE", settings.serverAddress),
            ...previous
          ]));
        }
      }
    });
    clientRef.current = client;

    const startedAt = performance.now();
    try {
      const { hello, snapshot } = await client.initialize();
      if (hello.protocol !== 1) {
        throw new Error(`Unsupported teamserver protocol version ${hello.protocol}.`);
      }
      const [serverLoot, serverPayloadBuilders] = await Promise.all([
        client.request<TeamLoot[]>(TeamOperations.lootList, {}),
        client.request<unknown>(TeamOperations.payloadBuilderList, {})
      ]);
      setCurrentLag(Math.max(0, Math.round(performance.now() - startedAt)));
      applySnapshot(snapshot);
      setLoots(serverLoot.map(mapTeamLoot));
      setPayloadBuilders(normalizePayloadBuilders(serverPayloadBuilders));
      appendLogs(initializationEvents.flatMap(logsForServerEvent));
      initializationEvents.forEach(event => {
        applyBuildEvent(event);
        applyPayloadBuilderEvent(event);
      });
      const stateAdvancedDuringInitialization = initializationEvents.some(
        event => !event.sequence || event.sequence > snapshot.event_sequence
      );
      initializing = false;
      if (stateAdvancedDuringInitialization) await refreshServerState(client);
      setOperatorName(settings.username);
      setAuthToken(settings.token);
      setServerAddress(settings.serverAddress);
      setIsAuthenticated(true);
      setIsWsConnected(true);
      setPackets(previous => retainPackets([
        createWebSocketSystemEvent("OPEN", settings.serverAddress),
        ...previous
      ]));
      addLog("system", `*** ${settings.username} connected to ${settings.serverAddress} · server ${hello.server_id} (${hello.server_version})`);
    } catch (error) {
      if (clientRef.current === client) clientRef.current = null;
      client.close();
      setIsWsConnected(false);
      throw error;
    }
  };

  const handleAddListener = async (newListener: Omit<Listener, "id" | "status">) => {
    const client = clientRef.current;
    if (!client) throw new Error("Not connected to the teamserver.");
    const listener = await client.request<TeamListener>(TeamOperations.listenerCreate, {
      name: newListener.name,
      host: newListener.host,
      port: String(newListener.port),
      persistent: newListener.persistent ?? false
    });
    setListeners(previous => [...previous.filter(item => item.name !== listener.name), mapTeamListener(listener)]);
  };

  const handleListenerState = async (name: string, start: boolean) => {
    const client = clientRef.current;
    if (!client) throw new Error("Not connected to the teamserver.");
    const listener = await client.request<TeamListener>(start ? TeamOperations.listenerStart : TeamOperations.listenerStop, { name });
    setListeners(previous => previous.map(item => item.name === name ? mapTeamListener(listener) : item));
  };

  const handleRefreshScripts = async () => {
    const client = clientRef.current;
    if (!client) throw new Error("Not connected to the teamserver.");
    const listed = await client.request<TeamScript[]>(TeamOperations.scriptList, {});
    const mapped = listed.map(mapTeamScript);
    setScripts(mapped);
    return mapped;
  };

  const handleLoadScript = async (path: string) => {
    const client = clientRef.current;
    if (!client) throw new Error("Not connected to the teamserver.");
    const loaded = await client.request<TeamScript>(TeamOperations.scriptLoad, { path });
    const mapped = mapTeamScript(loaded);
    setScripts(previous => [...previous.filter(item => item.id !== mapped.id), mapped]);
    return mapped;
  };

  const handleUnloadScript = async (path: string) => {
    const client = clientRef.current;
    if (!client) throw new Error("Not connected to the teamserver.");
    await client.request<{ path: string }>(TeamOperations.scriptUnload, { name: path });
    setScripts(previous => previous.filter(item => item.id !== path));
  };

  const handleRefreshLoots = async () => {
    const listed = await requireTeamClient().request<TeamLoot[]>(TeamOperations.lootList, {});
    const mapped = listed.map(mapTeamLoot);
    setLoots(mapped);
    return mapped;
  };

  const handleDownloadLoot = async (id: string) => {
    const client = requireTeamClient();
    const reply = await client.request<TeamLootGetReply>(TeamOperations.lootGet, { uuid: id });
    const blob = await client.download(reply.download_url);
    const objectURL = URL.createObjectURL(blob);
    const fileName = reply.loot.file_name.split(/[\\/]/).pop()?.trim() || `${id}.bin`;
    const anchor = document.createElement("a");
    anchor.href = objectURL;
    anchor.download = fileName;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(objectURL), 1000);
  };

  const handleLoadLootContent = async (id: string) => {
    const client = requireTeamClient();
    const reply = await client.request<TeamLootGetReply>(TeamOperations.lootGet, { uuid: id });
    return client.download(reply.download_url);
  };

  const handleDeleteLoot = async (id: string) => {
    const deleted = await requireTeamClient().request<TeamLoot>(TeamOperations.lootDelete, { uuid: id });
    setLoots(previous => previous.filter(item => item.id !== (deleted.uuid || id)));
  };

  const handleUpdateNote = (id: string, note: string) => {
    sessionNotesRef.current[id] = note;
    setSessions(previous => previous.map(session => session.id === id ? { ...session, note } : session));
  };

  const executeSessionCommand = async (sessionId: string, commandLine: string) => {
    const client = clientRef.current;
    if (!client) throw new Error("Not connected to the teamserver.");
    const [name, ...argumentParts] = commandLine.trim().split(/\s+/);
    if (!name) throw new Error("Enter a command.");
    if (["interactive", "ssh"].includes(name.toLowerCase())) {
      throw new Error("Interactive session commands are reserved for a later integration stage.");
    }
    const startedAt = performance.now();
    const reply = await client.request<TeamCommandExecuteReply>(TeamOperations.commandExecute, {
      session: sessionId,
      name,
      arguments: argumentParts.join(" ")
    });
    setCurrentLag(Math.max(0, Math.round(performance.now() - startedAt)));
    return reply;
  };

  const handleKillSession = (id: string) => {
    const client = clientRef.current;
    if (!client) return;
    void client.request<TeamTask>(TeamOperations.sessionTerminate, { name: id })
      .then(task => {
        setSessions(previous => previous.map(session => session.id === id ? { ...session, status: "killed" } : session));
        addLog("system", `Termination task ${task.id} queued for session ${id}.`, id);
      })
      .catch(error => addLog("error", error instanceof Error ? error.message : String(error), id));
  };

  const handleDeleteSession = (id: string) => {
    const client = clientRef.current;
    if (!client) {
      addLog("error", "Not connected to the TeamServer.");
      return;
    }

    void client.request<{ name: string }>(TeamOperations.sessionDelete, { name: id })
      .then(result => {
        const deletedName = result.name || id;
        removeSessionFromWorkspace(deletedName);
        addLog("system", `Session ${deletedName} deleted from the TeamServer.`);
      })
      .catch(error => addLog("error", `Failed to delete session ${id}: ${error instanceof Error ? error.message : String(error)}`));
  };

  const handleResetAll = () => {
    setTabs([{ id: "event_log", title: "Event Log", type: "event_log" }]);
    setActiveTabId("event_log");
    setPackets([]);
    void refreshServerState().catch(error => addLog("error", error instanceof Error ? error.message : String(error)));
  };

  const requireTeamClient = () => {
    const client = clientRef.current;
    if (!client?.connected) throw new Error("Not connected to the TeamServer.");
    return client;
  };

  const handleListProfiles = async () => {
    const items = await requireTeamClient().request<TeamProfile[]>(TeamOperations.profileList, {});
    setProfiles(items);
    return items;
  };

  const handleGetProfile = (name: string) => {
    return requireTeamClient().request<TeamProfile>(TeamOperations.profileGet, { name });
  };

  const handleCreateProfile = async (profile: TeamProfile) => {
    const created = await requireTeamClient().request<TeamProfile>(TeamOperations.profileCreate, profile);
    setProfiles(previous => [...previous.filter(item => item.name !== created.name), created]);
    return created;
  };

  const handleUpdateProfile = async (name: string, key: TeamProfileUpdateKey, value: string) => {
    const updated = await requireTeamClient().request<TeamProfile>(TeamOperations.profileUpdate, { name, key, value });
    setProfiles(previous => previous.map(profile => profile.name === updated.name ? updated : profile));
    return updated;
  };

  const handleDeleteProfile = async (name: string) => {
    await requireTeamClient().request<{ name: string }>(TeamOperations.profileDelete, { name });
    setProfiles(previous => previous.filter(profile => profile.name !== name));
  };

  const handleListUsers = async () => {
    const listed = await requireTeamClient().request<TeamUser[]>(TeamOperations.userList, {});
    const sorted = sortTeamUsers(listed);
    setUsers(sorted);
    return sorted;
  };

  const handleCreateUser = async (name: string) => {
    const credentials = await requireTeamClient().request<TeamUserCredentials>(TeamOperations.userCreate, { name });
    setUsers(previous => upsertTeamUser(previous, credentials.user));
    return credentials;
  };

  const handleRefreshUserToken = async (name: string) => {
    const credentials = await requireTeamClient().request<TeamUserCredentials>(TeamOperations.userUpdate, { name });
    setUsers(previous => upsertTeamUser(previous, credentials.user));
    return credentials;
  };

  const handleDeleteUser = async (name: string) => {
    const deleted = await requireTeamClient().request<TeamUser>(TeamOperations.userDelete, { name });
    setUsers(previous => previous.filter(user => user.uuid !== deleted.uuid && user.name !== deleted.name));
    return deleted;
  };

  const handleSendUserMessage = (message: string) => {
    return requireTeamClient().request<TeamUserMessage>(TeamOperations.userMessage, { message });
  };

  const handleListPayloadBuilders = async () => {
    const listed = await requireTeamClient().request<unknown>(TeamOperations.payloadBuilderList, {});
    const normalized = normalizePayloadBuilders(listed);
    setPayloadBuilders(normalized);
    return normalized;
  };

  const handleCreateBuild = async (profile: string, builder: string) => {
    const client = clientRef.current;
    if (!client) throw new Error("Not connected to the teamserver.");
    const request: TeamBuildCreateRequest = { profile, builder };
    const created = await client.request<TeamBuild>(TeamOperations.buildCreate, request);
    setBuilds(previous => upsertTeamBuild(previous, created));
    return created;
  };

  const handleListBuilds = async () => {
    const listed = await requireTeamClient().request<TeamBuild[]>(TeamOperations.buildList, {});
    setBuilds(sortTeamBuilds(listed));
    return listed;
  };

  const handleDeleteBuild = async (id: string) => {
    const deleted = await requireTeamClient().request<TeamBuild>(TeamOperations.buildDelete, { id });
    setBuilds(previous => previous.filter(build => build.id !== (deleted.id || id)));
    setBuildOutputByID(previous => {
      if (!previous[id]) return previous;
      const next = { ...previous };
      delete next[id];
      return next;
    });
    return deleted;
  };

  const handleDownloadBuild = async (build: TeamBuild) => {
    if (!build.download_url) throw new Error("The completed build has no download URL.");
    const blob = await requireTeamClient().download(build.download_url);
    const objectURL = URL.createObjectURL(blob);
    const fileName = build.artifact_name?.split(/[\\/]/).pop()?.trim() || `${build.id}.bin`;
    const anchor = document.createElement("a");
    anchor.href = objectURL;
    anchor.download = fileName;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(objectURL), 1000);
  };

  const handleAuthenticate = (settings: ConnectionSettings) => connectToTeamServer(settings);
  const handleReconnect = (settings: ConnectionSettings) => connectToTeamServer(settings);

  const handleDisconnect = () => {
    if (!clientRef.current) return;
    clientRef.current.close();
    clientRef.current = null;
    setIsWsConnected(false);
    addLog("system", `${TeamEvents.userLogout}: ${operatorName} · local connection closed`);
    setPackets(previous => retainPackets([createWebSocketSystemEvent("CLOSE", serverAddress), ...previous]));
  };

  const handleConnect = () => {
    if (isWsConnected) return;
    void connectToTeamServer({ username: operatorName, token: authToken, serverAddress })
      .catch(error => addLog("error", error instanceof Error ? error.message : String(error)));
  };

  if (!isAuthenticated) {
    return (
      <AuthenticationPage
        initialSettings={{
          username: operatorName,
          token: authToken,
          serverAddress
        }}
        onConnect={handleAuthenticate}
      />
    );
  }

  return (
    <div className="desktop-app">
      
      {/* 1. Menu Bar and quick toolbars */}
      <C2Toolbar 
        onAddTab={handleAddTab}
        isWsConnected={isWsConnected}
        onConnectWs={handleConnect}
        onDisconnectWs={handleDisconnect}
        sessionsCount={sessions.filter(b => b.status === "active").length}
        activeListenersCount={listeners.filter(l => l.status === "Active").length}
        currentLag={currentLag}
        onTriggerPayloadModal={() => setIsPayloadOpen(true)}
        onTriggerBuildManager={() => setIsBuildManagerOpen(true)}
        onTriggerProfileModal={() => setIsProfileManagerOpen(true)}
        onTriggerSettingsModal={() => setIsSettingsOpen(true)}
      />

      {/* 2. Interactive Workspace layout */}
      <div ref={workspaceRef} className="workspace-split">
        
        {/* UPPER PANEL: Sessions / Targets table */}
        <div
          className="workspace-pane workspace-pane--upper"
          style={{ height: `${upperPanelHeight}%` }}
        >
          <C2SessionTable 
            sessions={sessions}
            selectedSessionId={selectedSessionId}
            onSelectSession={(id) => setSelectedSessionId(id)}
            onInteract={handleInteract}
            onUpdateNote={handleUpdateNote}
            onKill={handleKillSession}
            onDelete={handleDeleteSession}
          />
        </div>

        {/* Drag handle for resizing the target table and command panel */}
        <div
          role="separator"
          aria-label="Resize command panel"
          aria-orientation="horizontal"
          aria-valuemin={Math.round(getPanelSplitLimits().min)}
          aria-valuemax={Math.round(getPanelSplitLimits().max)}
          aria-valuenow={Math.round(upperPanelHeight)}
          tabIndex={0}
          title="Drag to resize panels. Use Up and Down arrow keys for keyboard resizing."
          onPointerDown={(event) => {
            event.preventDefault();
            event.currentTarget.setPointerCapture(event.pointerId);
            setIsResizingPanels(true);
          }}
          onPointerMove={(event) => {
            if (event.currentTarget.hasPointerCapture(event.pointerId)) {
              handlePanelResize(event.clientY);
            }
          }}
          onPointerUp={(event) => {
            if (event.currentTarget.hasPointerCapture(event.pointerId)) {
              event.currentTarget.releasePointerCapture(event.pointerId);
            }
            setIsResizingPanels(false);
          }}
          onPointerCancel={() => setIsResizingPanels(false)}
          onLostPointerCapture={() => setIsResizingPanels(false)}
          onKeyDown={(event) => {
            const step = event.shiftKey ? 10 : 2;
            if (event.key === "ArrowUp") {
              event.preventDefault();
              setUpperPanelHeight(current => clampPanelSplit(current - step));
            } else if (event.key === "ArrowDown") {
              event.preventDefault();
              setUpperPanelHeight(current => clampPanelSplit(current + step));
            } else if (event.key === "Home") {
              event.preventDefault();
              setUpperPanelHeight(getPanelSplitLimits().min);
            } else if (event.key === "End") {
              event.preventDefault();
              setUpperPanelHeight(getPanelSplitLimits().max);
            }
          }}
          className={`workspace-splitter ${isResizingPanels ? "is-active" : ""}`}
        >
          <span
            aria-hidden="true"
            className="workspace-splitter-grip"
          />
        </div>

        {/* LOWER PANEL: Consolidated Tabbed consoles */}
        <div className="workspace-pane workspace-pane--lower">
          <C2Console 
            tabs={tabs}
            activeTabId={activeTabId}
            onSetActiveTab={(id) => setActiveTabId(id)}
            onCloseTab={handleCloseTab}
            sessions={sessions}
            listeners={listeners}
            loots={loots}
            scripts={scripts}
            commands={commands}
            eventLogs={eventLogs}
            packets={packets}
            users={users}
            onAddListener={handleAddListener}
            onSetListenerState={handleListenerState}
            onRefreshScripts={handleRefreshScripts}
            onLoadScript={handleLoadScript}
            onUnloadScript={handleUnloadScript}
            onRefreshLoots={handleRefreshLoots}
            onDownloadLoot={handleDownloadLoot}
            onLoadLootContent={handleLoadLootContent}
            onDeleteLoot={handleDeleteLoot}
            onListUsers={handleListUsers}
            onCreateUser={handleCreateUser}
            onRefreshUserToken={handleRefreshUserToken}
            onDeleteUser={handleDeleteUser}
            onSendUserMessage={handleSendUserMessage}
            onAddLog={appendLog}
            onExecuteCommand={executeSessionCommand}
            isWsConnected={isWsConnected}
            operatorName={operatorName}
            serverAddress={serverAddress}
          />
        </div>

      </div>

      {/* 3. MODAL: Advanced compilation/generator of C2 session agents */}
      <PayloadGenerator 
        profiles={profiles}
        payloadBuilders={payloadBuilders}
        builds={builds}
        buildOutputByID={buildOutputByID}
        isOpen={isPayloadOpen}
        onClose={() => setIsPayloadOpen(false)}
        onRefreshPayloadBuilders={handleListPayloadBuilders}
        onCreateBuild={handleCreateBuild}
        onDownloadBuild={handleDownloadBuild}
      />

      <BuildManager
        builds={builds}
        isOpen={isBuildManagerOpen}
        onClose={() => setIsBuildManagerOpen(false)}
        onList={handleListBuilds}
        onDelete={handleDeleteBuild}
        onDownload={handleDownloadBuild}
      />

      <ProfileManager
        isOpen={isProfileManagerOpen}
        onClose={() => setIsProfileManagerOpen(false)}
        onList={handleListProfiles}
        onGet={handleGetProfile}
        onCreate={handleCreateProfile}
        onUpdate={handleUpdateProfile}
        onDelete={handleDeleteProfile}
      />

      {/* 4. MODAL: Global C2 performance and configurations */}
      <SettingsModal 
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        operatorName={operatorName}
        authToken={authToken}
        serverAddress={serverAddress}
        isWsConnected={isWsConnected}
        onReconnect={handleReconnect}
        onResetAll={handleResetAll}
      />

    </div>
  );
}
