import React, { useState, useRef, useEffect } from "react";
import { 
  X, 
  Key, 
  Plus, 
  Download, 
  RefreshCw,
  Trash2,
  Image as ImageIcon
} from "lucide-react";
import { Session, Listener, Loot, Script, ConsoleLog, Packet, Command, ConsoleTab } from "../types";
import { TeamUser, TeamUserCredentials, TeamUserMessage } from "../api/teamApi";
import { createLootContentPreview, imageMimeType, LootContentPreview } from "../utils/loot";
import { UserManager } from "./UserManager";
import {
  CompactButton,
  CompactFormRow,
  CompactIconButton,
  CompactInput,
  CompactScrollbar,
  DataGrid,
  DesktopPanel,
  LogConsole,
  PanelHeader,
  TabStrip
} from "./desktop";

interface CommandExecutionResult {
  task_ids?: string[];
  message?: string;
}

type ScriptAction = "refresh" | "load" | "unload" | "reload";

interface C2ConsoleProps {
  tabs: ConsoleTab[];
  activeTabId: string;
  onSetActiveTab: (id: string) => void;
  onCloseTab: (id: string) => void;
  
  sessions: Session[];
  listeners: Listener[];
  loots: Loot[];
  scripts: Script[];
  commands: Command[];
  eventLogs: ConsoleLog[];
  packets: Packet[];
  users: TeamUser[];
  
  onSetListenerState: (name: string, start: boolean) => Promise<void>;
  onDeleteListener: (name: string) => Promise<void>;
  onRefreshScripts: () => Promise<Script[]>;
  onLoadScript: (path: string) => Promise<Script>;
  onUnloadScript: (path: string) => Promise<void>;
  onRefreshLoots: () => Promise<Loot[]>;
  onDownloadLoot: (id: string) => Promise<void>;
  onLoadLootContent: (id: string) => Promise<Blob>;
  onDeleteLoot: (id: string) => Promise<void>;
  onListUsers: () => Promise<TeamUser[]>;
  onCreateUser: (name: string) => Promise<TeamUserCredentials>;
  onRefreshUserToken: (name: string) => Promise<TeamUserCredentials>;
  onDeleteUser: (name: string) => Promise<TeamUser>;
  onSendUserMessage: (message: string) => Promise<TeamUserMessage>;
  onAddLog: (log: ConsoleLog) => void;
  onExecuteCommand: (sessionId: string, commandLine: string) => Promise<CommandExecutionResult>;
  isWsConnected: boolean;
  operatorName: string;
  serverAddress: string;
}

export const C2Console: React.FC<C2ConsoleProps> = ({
  tabs,
  activeTabId,
  onSetActiveTab,
  onCloseTab,
  sessions,
  listeners,
  loots,
  scripts,
  commands,
  eventLogs,
  packets,
  users,
  onSetListenerState,
  onDeleteListener,
  onRefreshScripts,
  onLoadScript,
  onUnloadScript,
  onRefreshLoots,
  onDownloadLoot,
  onLoadLootContent,
  onDeleteLoot,
  onListUsers,
  onCreateUser,
  onRefreshUserToken,
  onDeleteUser,
  onSendUserMessage,
  onAddLog,
  onExecuteCommand,
  isWsConnected,
  operatorName,
  serverAddress
}) => {
  const [commandInput, setCommandInput] = useState("");
  const [history, setHistory] = useState<string[]>([]);
  const [historyIdx, setHistoryIdx] = useState(-1);
  const [listenerActionError, setListenerActionError] = useState("");
  const [listenerDeletePending, setListenerDeletePending] = useState("");

  // Script editor state
  const [selectedScriptId, setSelectedScriptId] = useState<string>("");
  const [newScriptPath, setNewScriptPath] = useState("");
  const [scriptActionError, setScriptActionError] = useState("");
  const [pendingScriptAction, setPendingScriptAction] = useState<ScriptAction | null>(null);
  const isScriptActionPending = pendingScriptAction !== null;

  // Loot manager state
  const [lootActionId, setLootActionId] = useState("");
  const [lootActionError, setLootActionError] = useState("");
  const [isRefreshingLoots, setIsRefreshingLoots] = useState(false);
  const [imagePreviewUrls, setImagePreviewUrls] = useState<Record<string, string>>({});
  const [imagePreviewErrors, setImagePreviewErrors] = useState<Record<string, string>>({});
  const [secretPreviews, setSecretPreviews] = useState<Record<string, LootContentPreview>>({});
  const [secretPreviewErrors, setSecretPreviewErrors] = useState<Record<string, string>>({});

  const consoleScrollRef = useRef<HTMLDivElement | null>(null);
  const followOutputByTabRef = useRef<Record<string, boolean>>({});
  const scrollPositionByTabRef = useRef<Record<string, number>>({});
  const imagePreviewUrlsRef = useRef<Record<string, string>>({});
  const secretPreviewsRef = useRef<Record<string, LootContentPreview>>({});
  const secretPreviewRequestsRef = useRef<Set<string>>(new Set());
  const currentSecretIdsRef = useRef<Set<string>>(new Set());
  const componentMountedRef = useRef(true);

  useEffect(() => {
    if (!scripts.some(script => script.id === selectedScriptId)) {
      const nextScript = scripts[0];
      setSelectedScriptId(nextScript?.id || "");
    }
  }, [selectedScriptId, scripts]);

  useEffect(() => {
    if (listenerDeletePending && !listeners.some(listener => listener.name === listenerDeletePending)) {
      setListenerDeletePending("");
    }
  }, [listenerDeletePending, listeners]);

  useEffect(() => {
    const tab = tabs.find(item => item.id === activeTabId);
    if (tab?.type !== "scripts") return;

    setScriptActionError("");
    setPendingScriptAction("refresh");
    void onRefreshScripts()
      .catch(error => setScriptActionError(error instanceof Error ? error.message : String(error)))
      .finally(() => setPendingScriptAction(null));
  }, [activeTabId]);

  useEffect(() => {
    const tab = tabs.find(item => item.id === activeTabId);
    if (tab?.type !== "loots" && tab?.type !== "downloads" && tab?.type !== "images") return;

    setLootActionError("");
    setIsRefreshingLoots(true);
    void onRefreshLoots()
      .catch(error => setLootActionError(error instanceof Error ? error.message : String(error)))
      .finally(() => setIsRefreshingLoots(false));
  }, [activeTabId]);

  useEffect(() => {
    const images = loots.filter(item => item.type === "Image");
    const currentImageIds = new Set(images.map(item => item.id));
    let previewSetChanged = false;

    Object.entries(imagePreviewUrlsRef.current).forEach(([id, url]) => {
      if (!currentImageIds.has(id)) {
        URL.revokeObjectURL(url);
        delete imagePreviewUrlsRef.current[id];
        previewSetChanged = true;
      }
    });
    if (previewSetChanged) setImagePreviewUrls({ ...imagePreviewUrlsRef.current });
    setImagePreviewErrors(current => Object.fromEntries(
      Object.entries(current).filter(([id]) => currentImageIds.has(id))
    ));

    const tab = tabs.find(item => item.id === activeTabId);
    if (tab?.type !== "images") return;

    let cancelled = false;
    images.forEach(item => {
      if (imagePreviewUrlsRef.current[item.id]) return;
      void onLoadLootContent(item.id)
        .then(blob => {
          const previewBlob = blob.type.startsWith("image/")
            ? blob
            : new Blob([blob], { type: imageMimeType(item.data) });
          const previewUrl = URL.createObjectURL(previewBlob);
          if (cancelled) {
            URL.revokeObjectURL(previewUrl);
            return;
          }
          imagePreviewUrlsRef.current[item.id] = previewUrl;
          setImagePreviewUrls({ ...imagePreviewUrlsRef.current });
          setImagePreviewErrors(current => {
            const next = { ...current };
            delete next[item.id];
            return next;
          });
        })
        .catch(error => {
          if (!cancelled) {
            setImagePreviewErrors(current => ({
              ...current,
              [item.id]: error instanceof Error ? error.message : String(error)
            }));
          }
        });
    });

    return () => {
      cancelled = true;
    };
  }, [activeTabId, loots]);

  useEffect(() => () => {
    Object.values(imagePreviewUrlsRef.current).forEach(url => URL.revokeObjectURL(url));
    imagePreviewUrlsRef.current = {};
  }, []);

  useEffect(() => {
    componentMountedRef.current = true;
    return () => {
      componentMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    const secrets = loots.filter(item => item.type === "Secret" || item.type === "Credential" || item.type === "Token");
    const currentSecretIds = new Set(secrets.map(item => item.id));
    currentSecretIdsRef.current = currentSecretIds;

    secretPreviewsRef.current = Object.fromEntries(
      Object.entries(secretPreviewsRef.current).filter(([id]) => currentSecretIds.has(id))
    );
    setSecretPreviews({ ...secretPreviewsRef.current });
    setSecretPreviewErrors(current => Object.fromEntries(
      Object.entries(current).filter(([id]) => currentSecretIds.has(id))
    ));

    const tab = tabs.find(item => item.id === activeTabId);
    if (tab?.type !== "loots" || !isWsConnected) return;

    secrets.forEach(item => {
      if (secretPreviewsRef.current[item.id] || secretPreviewRequestsRef.current.has(item.id)) return;
      secretPreviewRequestsRef.current.add(item.id);
      const content = item.type === "Secret"
        ? onLoadLootContent(item.id)
        : Promise.resolve(new Blob([item.data], { type: "text/plain;charset=utf-8" }));
      void content
        .then(createLootContentPreview)
        .then(preview => {
          if (!componentMountedRef.current || !currentSecretIdsRef.current.has(item.id)) return;
          secretPreviewsRef.current[item.id] = preview;
          setSecretPreviews({ ...secretPreviewsRef.current });
          setSecretPreviewErrors(current => {
            const next = { ...current };
            delete next[item.id];
            return next;
          });
        })
        .catch(error => {
          if (!componentMountedRef.current || !currentSecretIdsRef.current.has(item.id)) return;
          setSecretPreviewErrors(current => ({
            ...current,
            [item.id]: error instanceof Error ? error.message : String(error)
          }));
        })
        .finally(() => secretPreviewRequestsRef.current.delete(item.id));
    });
  }, [activeTabId, isWsConnected, loots]);

  useEffect(() => {
    const container = consoleScrollRef.current;
    if (!container) return;
    if (followOutputByTabRef.current[activeTabId] ?? true) {
      container.scrollTop = container.scrollHeight;
    } else if (scrollPositionByTabRef.current[activeTabId] !== undefined) {
      container.scrollTop = scrollPositionByTabRef.current[activeTabId];
    }
    scrollPositionByTabRef.current[activeTabId] = container.scrollTop;
  }, [eventLogs, activeTabId]);

  const handleConsoleScroll = (event: React.UIEvent<HTMLDivElement>) => {
    const container = event.currentTarget;
    const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
    followOutputByTabRef.current[activeTabId] = distanceFromBottom <= 24;
    scrollPositionByTabRef.current[activeTabId] = container.scrollTop;
  };

  const activeTab = tabs.find(t => t.id === activeTabId);
  let serverHost = serverAddress;
  try {
    serverHost = new URL(serverAddress).host;
  } catch {
    // Keep the configured address as the display fallback.
  }

  const handleCommandSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!commandInput.trim() || !activeTab) return;

    const currentCommand = commandInput.trim();
    setHistory(prev => [...prev, currentCommand]);
    setHistoryIdx(-1);
    setCommandInput("");

    if (activeTab.type === "event_log") {
      if (!isWsConnected) {
        onAddLog({
          id: `log-${Date.now()}`,
          timestamp: new Date().toLocaleString(),
          type: "error",
          message: "[-] Team message was not sent: TeamServer is disconnected."
        });
        return;
      }

      try {
        // The server broadcasts evt.user.message to every client, including
        // this one. Let that event create the log entry to avoid duplicates.
        await onSendUserMessage(currentCommand);
      } catch (error) {
        onAddLog({
          id: `log-${Date.now()}`,
          timestamp: new Date().toLocaleString(),
          type: "error",
          message: `[-] Team message was not sent: ${error instanceof Error ? error.message : String(error)}`
        });
      }

      return;
    }

    if (activeTab.type === "session" && activeTab.sessionId) {
      const sessionId = activeTab.sessionId;
      const targetSession = sessions.find(b => b.id === sessionId);
      if (!targetSession) return;

      if (targetSession.status === "killed") {
        onAddLog({
          id: `log-${Date.now()}`,
          timestamp: new Date().toLocaleString(),
          type: "error",
          message: `[-] Task error: Cannot execute command. Session ${sessionId} is KILLED.`,
          sessionId: sessionId
        });
        return;
      }

      onAddLog({
        id: `log-${Date.now()}`,
        timestamp: new Date().toLocaleString(),
        type: "input",
        message: `session> ${currentCommand}`,
        sessionId: sessionId
      });

      if (!isWsConnected) {
        onAddLog({
          id: `log-${Date.now() + 1}`,
          timestamp: new Date().toLocaleString(),
          type: "error",
          message: `[-] Transport layer disconnected. Command was not sent.`,
          sessionId: sessionId
        });
        return;
      }

      const availableCommands = commands.filter(command => command.payloadType === targetSession.listener);
      if (currentCommand.toLowerCase() === "help") {
        onAddLog({
          id: `log-help-${Date.now()}`,
          timestamp: new Date().toLocaleString(),
          type: "output",
          message: availableCommands.length > 0
            ? availableCommands.map(command => `${command.name.padEnd(20)} ${command.description}`).join("\n")
            : `No commands are registered for payload type ${targetSession.listener}.`,
          sessionId
        });
        return;
      }

      try {
        const reply = await onExecuteCommand(sessionId, currentCommand);
        const tasks = reply.task_ids || [];
        if (tasks.length === 0) {
          onAddLog({
            id: `log-command-${Date.now()}`,
            timestamp: new Date().toLocaleString(),
            type: "output",
            message: reply.message || "Command completed without creating an implant task.",
            sessionId
          });
        }
      } catch (error) {
        onAddLog({
          id: `log-error-${Date.now()}`,
          timestamp: new Date().toLocaleString(),
          type: "error",
          message: `[-] ${error instanceof Error ? error.message : String(error)}`,
          sessionId
        });
      }
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowUp") {
      e.preventDefault();
      if (history.length === 0) return;
      const nextIdx = historyIdx === -1 ? history.length - 1 : Math.max(0, historyIdx - 1);
      setHistoryIdx(nextIdx);
      setCommandInput(history[nextIdx]);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      if (historyIdx === -1) return;
      if (historyIdx === history.length - 1) {
        setHistoryIdx(-1);
        setCommandInput("");
      } else {
        const nextIdx = historyIdx + 1;
        setHistoryIdx(nextIdx);
        setCommandInput(history[nextIdx]);
      }
    }
  };

  // 1. Team event log
  const renderEventLog = () => {
    return (
      <LogConsole ref={consoleScrollRef} onScroll={handleConsoleScroll} className="event-log-console">
          {eventLogs.map((log) => {
            return (
              <div key={log.id} className={`log-row log-row--${log.type}`}>
                <span className="log-timestamp">{log.timestamp}</span>
                <span className="log-message">{log.message}</span>
              </div>
            );
          })}
      </LogConsole>
    );
  };

  const renderSessions = () => {
    return (
      <DesktopPanel className="console-data-panel">
        <PanelHeader actions={<span className="panel-counter">{sessions.length} total</span>}>Active Sessions</PanelHeader>
        <CompactScrollbar className="console-grid-scroll">
          <DataGrid aria-label="Active sessions" className="console-session-grid">
            <thead>
              <tr>
                <th>Name</th><th>User</th><th>Computer</th><th>Payload</th><th>Process</th><th>Status</th>
              </tr>
            </thead>
            <tbody>
              {sessions.map(session => (
                <tr key={session.id}>
                  <td>{session.id}</td><td>{session.user}</td><td>{session.computer}</td><td>{session.listener}</td>
                  <td>{session.process} ({session.pid})</td>
                  <td className={`session-status ${
                    session.status === "active" ? "is-active" : session.status === "killed" ? "is-killed" : "is-lost"
                  }`}>{session.status}</td>
                </tr>
              ))}
              {sessions.length === 0 && (
                <tr><td colSpan={6} className="empty-grid-cell">No sessions are registered.</td></tr>
              )}
            </tbody>
          </DataGrid>
        </CompactScrollbar>
      </DesktopPanel>
    );
  };

  const renderUnavailablePanel = () => (
    <div className="empty-desktop-panel h-full">
      This panel is unavailable.
    </div>
  );

  // 2. Session Terminal
  const renderSessionTerminal = (sessionId: string) => {
    const session = sessions.find(b => b.id === sessionId);
    if (!session) {
      return (
        <div className="empty-desktop-panel h-full">
          Session inactive.
        </div>
      );
    }

    const filteredLogs = eventLogs.filter(log => log.sessionId === sessionId);
    const availableCommands = commands
      .filter(command => command.payloadType === session.listener && command.name !== "interactive" && command.name !== "ssh")
      .sort((left, right) => left.name.localeCompare(right.name));

    return (
      <div className="terminal-split">
        <DesktopPanel className="terminal-console-pane">
          <PanelHeader actions={
            <CompactButton
              onClick={() => {
                onAddLog({
                  id: `log-${Date.now()}`,
                  timestamp: new Date().toLocaleString(),
                  type: "output",
                  message: `\n[+] Terminal cleared.\n`,
                  sessionId
                });
              }}
              variant="ghost"
            >
              Clear
            </CompactButton>
          }>{session.user}@{session.computer} · PID {session.pid} ({session.process})</PanelHeader>

          <LogConsole ref={consoleScrollRef} onScroll={handleConsoleScroll} className="terminal-log">
            <div className="terminal-active-message">
              *** Session active callback for {session.user}@{session.computer} ({session.pid})
            </div>

            {filteredLogs.map((log) => {
              let textClass = "terminal-message";
              if (log.type === "input") textClass += " is-input";
              if (log.type === "error") textClass += " is-error";
              if (log.type === "output") textClass += " is-output";

              if (log.type === "input") {
                return (
                  <div key={log.id} className={textClass}>
                    {log.message}
                  </div>
                );
              }

              const [summary, ...detailLines] = log.message.split("\n");
              
              return (
                <div key={log.id}>
                  <div className="terminal-log-line">
                    <span className="terminal-timestamp">[{log.timestamp}]</span>
                    <span className={textClass}>{summary}</span>
                  </div>
                  {detailLines.length > 0 && (
                    <div className={textClass}>{detailLines.join("\n")}</div>
                  )}
                </div>
              );
            })}
          </LogConsole>
        </DesktopPanel>

        <DesktopPanel className="terminal-command-pane">
          <PanelHeader actions={<span className="panel-counter">{session.listener}</span>}>Available Commands</PanelHeader>

          <CompactScrollbar className="available-command-list">
            {availableCommands.length === 0 ? (
              <div className="empty-command-list">
                No Lua commands registered for this payload type.
              </div>
            ) : (
              availableCommands.map(command => (
                <CompactButton
                  key={`${command.payloadType}-${command.name}`}
                  type="button"
                  onClick={() => setCommandInput(`${command.name} `)}
                  className="available-command-row"
                  title={command.description}
                >
                  <strong>{command.name}</strong>
                  <span>{command.description}</span>
                </CompactButton>
              ))
            )}
          </CompactScrollbar>
        </DesktopPanel>
      </div>
    );
  };

  const deleteListener = async (name: string) => {
    setListenerActionError("");
    setListenerDeletePending(name);
    try {
      await onDeleteListener(name);
    } catch (error) {
      setListenerDeletePending("");
      setListenerActionError(error instanceof Error ? error.message : String(error));
    }
  };

  // 3. Listeners Management
  const renderListeners = () => {
    return (
      <DesktopPanel className="console-data-panel">
          <PanelHeader actions={<span className="panel-counter">{listeners.length} total</span>}>TeamServer Listeners</PanelHeader>
          {listenerActionError && (
            <p role="alert" className="desktop-alert desktop-alert--error panel-alert">{listenerActionError}</p>
          )}
          <CompactScrollbar className="console-grid-scroll">
            <DataGrid aria-label="TeamServer listeners" className="listener-grid">
              <thead>
                <tr>
                  <th>Name</th><th>Protocol</th><th>Host Bind</th><th>Port</th><th>Persistent</th><th>Sessions</th><th>Status</th><th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {listeners.map(l => (
                  <tr key={l.id}>
                    <td className="text-white">{l.name}</td>
                    <td>{l.payloadType === "Session HTTPS" ? "HTTPS" : "HTTP"}</td>
                    <td>{l.host}</td><td>{l.port}</td>
                    <td>{l.persistent ? "Yes" : "No"}</td><td>{l.associations ?? 0}</td>
                    <td><span className={l.status === "Active" ? "listener-status is-active" : "listener-status"}>{l.status}</span>
                    </td>
                    <td className="text-right">
                      <div className="grid-actions">
                        <CompactButton
                          type="button"
                          disabled={!isWsConnected || listenerDeletePending === l.name}
                          onClick={() => {
                            setListenerActionError("");
                            void onSetListenerState(l.name, l.status !== "Active")
                              .catch(error => setListenerActionError(error instanceof Error ? error.message : String(error)));
                          }}
                          variant={l.status === "Active" ? "danger" : "secondary"}
                        >
                          {l.status === "Active" ? "Stop" : "Start"}
                        </CompactButton>
                        <CompactIconButton
                          type="button"
                          variant="danger"
                          disabled={!isWsConnected || Boolean(listenerDeletePending)}
                          onClick={() => void deleteListener(l.name)}
                          aria-label={listenerDeletePending === l.name
                            ? `Waiting for deletion confirmation for listener ${l.name}`
                            : `Delete listener ${l.name}`}
                          title={listenerDeletePending === l.name ? "Waiting for deletion confirmation" : "Delete listener"}
                        >
                          <Trash2 aria-hidden="true" />
                        </CompactIconButton>
                      </div>
                    </td>
                  </tr>
                ))}
                {listeners.length === 0 && (
                  <tr><td colSpan={8} className="empty-grid-cell">No listeners are registered.</td></tr>
                )}
              </tbody>
            </DataGrid>
          </CompactScrollbar>
      </DesktopPanel>
    );
  };

  const refreshLoots = async () => {
    setLootActionError("");
    setIsRefreshingLoots(true);
    try {
      await onRefreshLoots();
    } catch (error) {
      setLootActionError(error instanceof Error ? error.message : String(error));
    } finally {
      setIsRefreshingLoots(false);
    }
  };

  const runLootAction = async (action: "download" | "delete", id: string) => {
    const actionId = `${action}:${id}`;
    setLootActionError("");
    setLootActionId(actionId);
    try {
      if (action === "download") await onDownloadLoot(id);
      else await onDeleteLoot(id);
    } catch (error) {
      setLootActionError(error instanceof Error ? error.message : String(error));
    } finally {
      setLootActionId("");
    }
  };

  const renderLootTable = (title: string, items: Loot[], icon: React.ReactNode) => (
    <DesktopPanel className="loot-table-panel">
      <PanelHeader actions={
        <CompactButton
          type="button"
          disabled={isRefreshingLoots || !isWsConnected}
          onClick={() => void refreshLoots()}
        >
          <RefreshCw className={`h-3 w-3 ${isRefreshingLoots ? "animate-spin" : ""}`} />
          {isRefreshingLoots ? "Refreshing…" : "Refresh"}
        </CompactButton>
      }><span className="panel-title-with-icon">{icon}{title} <small>({items.length})</small></span></PanelHeader>

      {lootActionError && (
        <p role="alert" className="desktop-alert desktop-alert--error panel-alert">
          {lootActionError}
        </p>
      )}

      <CompactScrollbar className="console-grid-scroll">
        <DataGrid aria-label={title} className="loot-grid">
          <colgroup>
            <col style={{ width: 250 }} /><col style={{ width: 150 }} /><col style={{ width: 170 }} />
            <col style={{ width: 220 }} /><col style={{ width: 100 }} /><col style={{ width: 360 }} /><col style={{ width: 190 }} />
          </colgroup>
          <thead>
            <tr>
              <th>UUID</th><th>Source Session</th><th>Created</th><th>File Name</th><th className="text-right">Size</th><th>SHA-256</th><th className="text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {items.map(item => (
              <tr key={item.id}>
                <td className="select-all">{item.id}</td>
                <td className="select-all text-white">{item.sourceSession || "—"}</td>
                <td>{item.capturedAt}</td>
                <td className="select-all text-white">{item.data}</td>
                <td className="text-right">
                  {item.size === undefined ? "—" : `${item.size.toLocaleString()} B`}
                </td>
                <td className="select-all">{item.sha256 || "—"}</td>
                <td>
                  <div className="grid-actions">
                    <CompactButton
                      type="button"
                      disabled={Boolean(lootActionId) || !isWsConnected}
                      onClick={() => void runLootAction("download", item.id)}
                      variant="secondary"
                    >
                      <Download className="h-3 w-3" />
                      {lootActionId === `download:${item.id}` ? "Downloading…" : "Download"}
                    </CompactButton>
                    <CompactButton
                      type="button"
                      disabled={Boolean(lootActionId) || !isWsConnected}
                      onClick={() => void runLootAction("delete", item.id)}
                      variant="danger"
                    >
                      <Trash2 className="h-3 w-3" />
                      {lootActionId === `delete:${item.id}` ? "Deleting…" : "Delete"}
                    </CompactButton>
                  </div>
                </td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr>
                <td colSpan={7} className="empty-grid-cell">
                  No loot has been collected.
                </td>
              </tr>
            )}
          </tbody>
        </DataGrid>
      </CompactScrollbar>
    </DesktopPanel>
  );

  // 4. Secrets
  const renderSecrets = () => {
    const secrets = loots.filter(item => item.type === "Secret" || item.type === "Credential" || item.type === "Token");
    return (
      <DesktopPanel className="loot-preview-panel">
        <PanelHeader actions={
          <CompactButton
            type="button"
            disabled={isRefreshingLoots || !isWsConnected}
            onClick={() => void refreshLoots()}
          >
            <RefreshCw className={`h-3 w-3 ${isRefreshingLoots ? "animate-spin" : ""}`} />
            {isRefreshingLoots ? "Refreshing…" : "Refresh"}
          </CompactButton>
        }><span className="panel-title-with-icon"><Key />Secrets <small>({secrets.length})</small></span></PanelHeader>

        {lootActionError && (
          <p role="alert" className="desktop-alert desktop-alert--error panel-alert">
            {lootActionError}
          </p>
        )}

        <CompactScrollbar className="loot-preview-scroll">
          <div className="secret-preview-grid">
            {secrets.map(item => {
              const preview = secretPreviews[item.id];
              const previewError = secretPreviewErrors[item.id];
              return (
                <article key={item.id} className="secret-record">
                  <div className="secret-record-header">
                    <div className="min-w-0">
                      <div className="select-text break-all font-mono text-xs font-bold text-white">{item.data}</div>
                      <div className="mt-1 text-[10px] text-gray-500">
                        Session <span className="select-text text-gray-300">{item.sourceSession || "—"}</span>
                        <span className="mx-1.5 text-gray-700">•</span>
                        {item.capturedAt}
                      </div>
                    </div>
                    <span className={`secret-preview-type ${
                      preview?.kind === "hex"
                        ? "is-hex"
                        : previewError ? "is-error" : "is-text"
                    }`}>
                      {preview?.kind === "hex"
                        ? "Hexdump"
                        : preview?.kind === "text" ? "Text" : previewError ? "Error" : "Detecting"}
                    </span>
                  </div>

                  <div className="secret-record-content">
                    {preview ? (
                      <pre className="min-w-max select-text whitespace-pre">{preview.content || "(empty file)"}</pre>
                    ) : previewError ? (
                      <div className="flex h-full items-center justify-center p-4 text-center text-red-300">
                        <div>
                          <p>Preview unavailable</p>
                          <p className="mt-1 break-words text-red-400/70">{previewError}</p>
                        </div>
                      </div>
                    ) : (
                      <div className="flex h-full items-center justify-center text-gray-600">
                        Loading authenticated preview…
                      </div>
                    )}
                  </div>

                  <div className="secret-record-footer">
                    <div className="min-w-0 text-[10px] text-gray-500">
                      {preview && (
                        <span>
                          {preview.truncated ? "Showing" : "Previewed"} {preview.bytesShown.toLocaleString()} of {preview.totalBytes.toLocaleString()} bytes
                        </span>
                      )}
                      {!preview && item.size !== undefined && <span>{item.size.toLocaleString()} bytes</span>}
                      <span className="mx-1.5 text-gray-700">•</span>
                      <span className="select-text font-mono" title={item.id}>{item.id}</span>
                    </div>
                    <div className="grid-actions">
                      <CompactButton
                        type="button"
                        disabled={Boolean(lootActionId) || !isWsConnected}
                        onClick={() => void runLootAction("download", item.id)}
                        variant="secondary"
                      >
                        <Download className="h-3 w-3" />
                        {lootActionId === `download:${item.id}` ? "Downloading…" : "Download"}
                      </CompactButton>
                      <CompactButton
                        type="button"
                        disabled={Boolean(lootActionId) || !isWsConnected}
                        onClick={() => void runLootAction("delete", item.id)}
                        variant="danger"
                      >
                        <Trash2 className="h-3 w-3" />
                        {lootActionId === `delete:${item.id}` ? "Deleting…" : "Delete"}
                      </CompactButton>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>

          {secrets.length === 0 && (
            <div className="flex h-full min-h-40 items-center justify-center text-xs text-gray-600">
              No secrets have been collected.
            </div>
          )}
        </CompactScrollbar>
      </DesktopPanel>
    );
  };

  // 5. Downloaded Files
  const renderDownloads = () => renderLootTable(
    "Looted Files Repository",
    loots.filter(item => item.type === "File"),
    <Download className="mr-1 h-3.5 w-3.5 text-gray-400" />
  );

  // 6. Images
  const renderImages = () => {
    const images = loots.filter(item => item.type === "Image");
    return (
      <DesktopPanel className="loot-preview-panel">
        <PanelHeader actions={
          <CompactButton
            type="button"
            disabled={isRefreshingLoots || !isWsConnected}
            onClick={() => void refreshLoots()}
          >
            <RefreshCw className={`h-3 w-3 ${isRefreshingLoots ? "animate-spin" : ""}`} />
            {isRefreshingLoots ? "Refreshing…" : "Refresh"}
          </CompactButton>
        }><span className="panel-title-with-icon"><ImageIcon />Device Images <small>({images.length})</small></span></PanelHeader>

        {lootActionError && (
          <p role="alert" className="desktop-alert desktop-alert--error panel-alert">
            {lootActionError}
          </p>
        )}

        <CompactScrollbar className="loot-preview-scroll">
          <div className="image-preview-grid">
            {images.map(item => (
              <article key={item.id} className="image-record">
                <div className="image-record-preview">
                  {imagePreviewUrls[item.id] ? (
                    <img
                      src={imagePreviewUrls[item.id]}
                      alt={item.data}
                      onError={() => {
                        const failedUrl = imagePreviewUrlsRef.current[item.id];
                        if (failedUrl) URL.revokeObjectURL(failedUrl);
                        delete imagePreviewUrlsRef.current[item.id];
                        setImagePreviewUrls({ ...imagePreviewUrlsRef.current });
                        setImagePreviewErrors(current => ({
                          ...current,
                          [item.id]: "This image format cannot be previewed by the system WebView."
                        }));
                      }}
                      className="h-full w-full select-none object-contain"
                    />
                  ) : imagePreviewErrors[item.id] ? (
                    <div className="p-4 text-center text-[10px] text-red-300">
                      <p>Preview unavailable</p>
                      <p className="mt-1 break-words text-red-400/70">{imagePreviewErrors[item.id]}</p>
                    </div>
                  ) : (
                    <div className="text-[10px] text-gray-600">Loading authenticated preview…</div>
                  )}
                </div>

                <div className="image-record-details">
                  <div className="select-text break-all font-mono text-xs font-bold text-white">{item.data}</div>
                  <dl className="mt-2 grid grid-cols-[70px_minmax(0,1fr)] gap-x-2 gap-y-1 text-[10px]">
                    <dt className="text-gray-600">Session</dt>
                    <dd className="select-text truncate text-gray-300" title={item.sourceSession}>{item.sourceSession || "—"}</dd>
                    <dt className="text-gray-600">Created</dt>
                    <dd className="text-gray-400">{item.capturedAt}</dd>
                    <dt className="text-gray-600">Size</dt>
                    <dd className="text-gray-400">{item.size === undefined ? "—" : `${item.size.toLocaleString()} B`}</dd>
                    <dt className="text-gray-600">UUID</dt>
                    <dd className="select-text truncate font-mono text-gray-500" title={item.id}>{item.id}</dd>
                  </dl>

                  <div className="grid-actions image-record-actions">
                    <CompactButton
                      type="button"
                      disabled={Boolean(lootActionId) || !isWsConnected}
                      onClick={() => void runLootAction("download", item.id)}
                      variant="secondary"
                    >
                      <Download className="h-3 w-3" />
                      {lootActionId === `download:${item.id}` ? "Downloading…" : "Download"}
                    </CompactButton>
                    <CompactButton
                      type="button"
                      disabled={Boolean(lootActionId) || !isWsConnected}
                      onClick={() => void runLootAction("delete", item.id)}
                      variant="danger"
                    >
                      <Trash2 className="h-3 w-3" />
                      {lootActionId === `delete:${item.id}` ? "Deleting…" : "Delete"}
                    </CompactButton>
                  </div>
                </div>
              </article>
            ))}
          </div>

          {images.length === 0 && (
            <div className="flex h-full min-h-40 items-center justify-center text-xs text-gray-600">
              No images have been collected.
            </div>
          )}
        </CompactScrollbar>
      </DesktopPanel>
    );
  };

  // 7. Lua Scripts
  const renderScripts = () => {
    const selectedScript = scripts.find(script => script.id === selectedScriptId);

    const refreshScripts = async () => {
      setScriptActionError("");
      setPendingScriptAction("refresh");
      try {
        await onRefreshScripts();
      } catch (error) {
        setScriptActionError(error instanceof Error ? error.message : String(error));
      } finally {
        setPendingScriptAction(null);
      }
    };

    const runScriptAction = async (action: Exclude<ScriptAction, "refresh">) => {
      const path = action === "load" ? newScriptPath.trim() : selectedScript?.id || "";
      if (!path) {
        setScriptActionError(action === "load" ? "Enter a server-side Lua script path." : "Select a loaded script first.");
        return;
      }

      setScriptActionError("");
      setPendingScriptAction(action);
      try {
        if (action === "load") {
          const loaded = await onLoadScript(path);
          setSelectedScriptId(loaded.id);
          setNewScriptPath("");
        } else if (action === "unload") {
          await onUnloadScript(path);
          setSelectedScriptId("");
        } else {
          await onUnloadScript(path);
          const reloaded = await onLoadScript(path);
          setSelectedScriptId(reloaded.id);
        }
        await onRefreshScripts();
      } catch (error) {
        setScriptActionError(error instanceof Error ? error.message : String(error));
      } finally {
        setPendingScriptAction(null);
      }
    };

    return (
      <div className="script-manager-split">
        <DesktopPanel className="script-list-panel">
          <PanelHeader actions={
            <CompactButton
              type="button"
              onClick={() => void refreshScripts()}
              disabled={isScriptActionPending || !isWsConnected}
            >
              {pendingScriptAction === "refresh" ? "Refreshing…" : "Refresh"}
            </CompactButton>
          }>Loaded Scripts</PanelHeader>

          <CompactScrollbar className="script-list">
            {scripts.map(scr => (
              <button
                key={scr.id}
                type="button"
                onClick={() => {
                  setSelectedScriptId(scr.id);
                  setScriptActionError("");
                }}
                aria-pressed={selectedScriptId === scr.id}
                className={`script-list-item ${selectedScriptId === scr.id ? "is-selected" : ""}`}
              >
                <strong>{scr.name}</strong>
                <span>{scr.description}</span>
              </button>
            ))}
            {scripts.length === 0 && !isScriptActionPending && (
              <div className="empty-command-list">No scripts are loaded.</div>
            )}
          </CompactScrollbar>
        </DesktopPanel>

        <DesktopPanel className="script-editor-panel">
          <form
            onSubmit={event => {
              event.preventDefault();
              void runScriptAction("load");
            }}
            className="script-load-form"
          >
            <CompactFormRow label="Server-side path" htmlFor="new-server-script-path" hint="Absolute path readable by the TeamServer process.">
              <div className="inline-control-row">
              <CompactInput
                id="new-server-script-path"
                type="text"
                value={newScriptPath}
                onChange={event => {
                  setNewScriptPath(event.target.value);
                  setScriptActionError("");
                }}
                placeholder="/opt/purplecommand/scripts/example.lua"
                autoComplete="off"
                spellCheck={false}
                disabled={isScriptActionPending}
                aria-describedby="new-server-script-path-help"
              />
              <CompactButton
                type="submit"
                disabled={isScriptActionPending || !isWsConnected || !newScriptPath.trim()}
                variant="primary"
              >
                <Plus className="h-3.5 w-3.5" />
                {pendingScriptAction === "load" ? "Loading…" : "Load Script"}
              </CompactButton>
              </div>
            </CompactFormRow>
            <span id="new-server-script-path-help" className="sr-only">Script files are not uploaded from this device.</span>
          </form>

          {scriptActionError && <p role="alert" className="desktop-alert desktop-alert--error panel-alert">{scriptActionError}</p>}

          {selectedScript ? (
            <div className="script-details">
              <div className="script-details-header">
                <div className="min-w-0">
                  <div className="font-bold text-gray-200">{selectedScript.name}</div>
                  <div className="mt-1 break-all font-mono text-gray-500">{selectedScript.id}</div>
                  <div className="mt-2 text-gray-400">Status: <span className="text-emerald-400">{selectedScript.status}</span></div>
                </div>
                <div className="grid-actions">
                  <CompactButton
                    type="button"
                    title="Unload and load the selected script again"
                    onClick={() => void runScriptAction("reload")}
                    disabled={isScriptActionPending || !isWsConnected}
                    variant="secondary"
                  >
                    <RefreshCw className={`h-3 w-3 ${pendingScriptAction === "reload" ? "animate-spin" : ""}`} />
                    {pendingScriptAction === "reload" ? "Reloading…" : "Reload"}
                  </CompactButton>
                  <CompactButton
                    type="button"
                    onClick={() => void runScriptAction("unload")}
                    disabled={isScriptActionPending || !isWsConnected}
                    variant="danger"
                  >
                    {pendingScriptAction === "unload" ? "Unloading…" : "Unload"}
                  </CompactButton>
                </div>
              </div>
              <pre className="script-source">{selectedScript.content}</pre>
            </div>
          ) : (
            <div className="empty-desktop-panel script-empty-state">
              Load a new script above or select a loaded script to manage it.
            </div>
          )}
        </DesktopPanel>
      </div>
    );
  };

  // 8. WebSocket Event Monitor
  const renderEventMonitor = () => {
    return (
      <DesktopPanel className="console-data-panel">
        <PanelHeader actions={<span className="panel-counter">{packets.length} / 1000 events</span>}>WebSocket Event Monitor</PanelHeader>
        <CompactScrollbar className="console-grid-scroll">
          <DataGrid aria-label="WebSocket event monitor" className="event-monitor-grid">
            <colgroup>
              <col style={{ width: 110 }} /><col style={{ width: 90 }} /><col style={{ width: 110 }} />
              <col style={{ width: 80 }} /><col style={{ width: 130 }} /><col />
            </colgroup>
            <thead><tr><th>Time</th><th>Direction</th><th>Transport</th><th>Size</th><th>Encryption</th><th>Payload</th></tr></thead>
            <tbody>
            {packets.map((pkt) => (
              <tr key={pkt.id}>
                <td>{pkt.timestamp}</td><td>{pkt.direction}</td><td>{pkt.type}</td>
                <td>{pkt.sizeIsLowerBound ? "≥" : ""}{pkt.size} B</td><td>{pkt.encryption}</td>
                <td className="select-text" title={pkt.payload}>{pkt.payload}</td>
              </tr>
            ))}
            {packets.length === 0 && (
              <tr><td colSpan={6} className="empty-grid-cell">No WebSocket events captured.</td></tr>
            )}
            </tbody>
          </DataGrid>
        </CompactScrollbar>
      </DesktopPanel>
    );
  };

  const renderContent = () => {
    if (!activeTab) return renderUnavailablePanel();
    switch (activeTab.type) {
      case "event_log":
        return renderEventLog();
      case "sessions":
        return renderSessions();
      case "session":
        return activeTab.sessionId ? renderSessionTerminal(activeTab.sessionId) : renderUnavailablePanel();
      case "listeners":
        return renderListeners();
      case "loots":
        return renderSecrets();
      case "downloads":
        return renderDownloads();
      case "images":
        return renderImages();
      case "scripts":
        return renderScripts();
      case "users":
        return (
          <UserManager
            users={users}
            isConnected={isWsConnected}
            onListUsers={onListUsers}
            onCreateUser={onCreateUser}
            onRefreshUserToken={onRefreshUserToken}
            onDeleteUser={onDeleteUser}
          />
        );
      case "packets":
        return renderEventMonitor();
      default:
        return renderUnavailablePanel();
    }
  };

  return (
    <div className="console-workspace">
      <TabStrip>
        {tabs.map((t) => {
          const isActive = t.id === activeTabId;
          const isEventLog = t.type === "event_log";
          
          return (
            <div
              key={t.id}
              onClick={() => onSetActiveTab(t.id)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onSetActiveTab(t.id);
                }
              }}
              role="tab"
              tabIndex={isActive ? 0 : -1}
              aria-selected={isActive}
              className={`tab-button ${isActive ? "is-active" : ""}`}
            >
              <span>{t.title}</span>
              
              {!isEventLog && (
                <CompactIconButton
                  onClick={(e) => {
                    e.stopPropagation();
                    onCloseTab(t.id);
                  }}
                  className="tab-close-button"
                  aria-label={`Close ${t.title} tab`}
                >
                  <X />
                </CompactIconButton>
              )}
            </div>
          );
        })}
      </TabStrip>

      {/* Main Terminal View */}
      <div className="flex-1 min-h-0 relative">
        {renderContent()}
      </div>

      {/* Command prompt execution bar */}
      {activeTab && (activeTab.type === "session" || activeTab.type === "event_log") && (
        <div className="command-dock">
          {/* Prompt Form */}
          <form onSubmit={handleCommandSubmit} className="command-line">
            <span className="command-prompt">
              {activeTab.type === "session" ? "session>" : "event>"}
            </span>
            <input
              type="text"
              value={commandInput}
              onChange={(e) => setCommandInput(e.target.value)}
              onKeyDown={handleKeyDown}
              className="command-input"
              autoFocus
            />
            <button
              type="submit"
              className="hidden"
            >
              Submit
            </button>
          </form>

          {/* Active operator badge */}
          <div className="command-status">
            <span>
              {operatorName}@{serverHost}
            </span>
          </div>
        </div>
      )}
    </div>
  );
};
