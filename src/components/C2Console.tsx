import React, { useState, useRef, useEffect } from "react";
import { 
  X, 
  Radio, 
  Key, 
  FileCode, 
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

interface CommandExecutionResult {
  task_ids?: string[];
  message?: string;
}

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
  
  onAddListener: (newListener: Omit<Listener, "id" | "status">) => Promise<void>;
  onSetListenerState: (name: string, start: boolean) => Promise<void>;
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
  onAddListener,
  onSetListenerState,
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
  const [isCreatingListener, setIsCreatingListener] = useState(false);
  
  // Listener forms
  const [newListenerName, setNewListenerName] = useState("");
  const [newListenerHost, setNewListenerHost] = useState("127.0.0.1");
  const [newListenerPort, setNewListenerPort] = useState(443);
  const [newListenerPersistent, setNewListenerPersistent] = useState(false);

  // Script editor state
  const [selectedScriptId, setSelectedScriptId] = useState<string>("");
  const [scriptPath, setScriptPath] = useState("");
  const [scriptActionError, setScriptActionError] = useState("");
  const [isScriptActionPending, setIsScriptActionPending] = useState(false);

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
      setScriptPath(nextScript?.id || "");
    }
  }, [selectedScriptId, scripts]);

  useEffect(() => {
    const tab = tabs.find(item => item.id === activeTabId);
    if (tab?.type !== "scripts") return;

    setScriptActionError("");
    setIsScriptActionPending(true);
    void onRefreshScripts()
      .catch(error => setScriptActionError(error instanceof Error ? error.message : String(error)))
      .finally(() => setIsScriptActionPending(false));
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

  const handleCreateListener = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newListenerName.trim()) {
      alert("Please provide a listener name.");
      return;
    }
    setListenerActionError("");
    setIsCreatingListener(true);
    try {
      await onAddListener({
        name: newListenerName.trim(),
        payloadType: "Session HTTP",
        host: newListenerHost.trim(),
        port: newListenerPort,
        encryption: "None (Plaintext)",
        persistent: newListenerPersistent,
        associations: 0
      });
      setNewListenerName("");
    } catch (error) {
      setListenerActionError(error instanceof Error ? error.message : String(error));
    } finally {
      setIsCreatingListener(false);
    }
  };

  // 1. Team event log
  const renderEventLog = () => {
    return (
      <div className="flex flex-col h-full bg-[#000000] text-[#00FF00] font-mono p-3 overflow-auto text-sm leading-relaxed">
        <div ref={consoleScrollRef} onScroll={handleConsoleScroll} className="flex-1 space-y-1 overflow-y-auto">
          {eventLogs.map((log) => {
            let textColor = "text-[#00FF00]";
            if (log.type === "input") textColor = "text-[#FFFF00]";
            if (log.type === "error") textColor = "text-[#FF5555]";
            
            return (
              <div key={log.id} className="flex items-start space-x-2">
                <span className="text-[#00FF00] flex-shrink-0 select-none">{log.timestamp}</span>
                <span className={`${textColor} whitespace-pre-wrap font-mono`}>{log.message}</span>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const renderSessions = () => {
    return (
      <div className="h-full overflow-auto bg-[#1e1e1e] p-3 text-xs text-gray-300">
        <div className="mb-2 flex items-center justify-between border-b border-[#333] pb-2">
          <h3 className="font-bold uppercase text-gray-200">Active Sessions</h3>
          <span className="text-[10px] text-gray-500">{sessions.length} total</span>
        </div>
        <div className="overflow-auto rounded border border-[#333]">
          <table className="w-full min-w-[700px] table-fixed text-left">
            <thead className="bg-[#292a2d] text-[10px] uppercase text-gray-500">
              <tr>
                <th className="px-2 py-1.5">Name</th>
                <th className="px-2 py-1.5">User</th>
                <th className="px-2 py-1.5">Computer</th>
                <th className="px-2 py-1.5">Payload</th>
                <th className="px-2 py-1.5">Process</th>
                <th className="px-2 py-1.5">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#2c2d30] bg-[#222326]">
              {sessions.map(session => (
                <tr key={session.id} className="hover:bg-[#2d2e31]">
                  <td className="truncate px-2 py-1.5 font-mono text-gray-200">{session.id}</td>
                  <td className="truncate px-2 py-1.5">{session.user}</td>
                  <td className="truncate px-2 py-1.5">{session.computer}</td>
                  <td className="truncate px-2 py-1.5">{session.listener}</td>
                  <td className="truncate px-2 py-1.5">{session.process} ({session.pid})</td>
                  <td className={`px-2 py-1.5 font-bold ${
                    session.status === "active" ? "text-emerald-400" : session.status === "killed" ? "text-red-400" : "text-amber-400"
                  }`}>{session.status}</td>
                </tr>
              ))}
              {sessions.length === 0 && (
                <tr><td colSpan={6} className="px-3 py-8 text-center text-gray-600">No sessions are registered.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  const renderUnavailablePanel = () => (
    <div className="flex h-full items-center justify-center bg-[#1e1e1e] text-sm text-gray-500">
      This panel is unavailable.
    </div>
  );

  // 2. Session Terminal
  const renderSessionTerminal = (sessionId: string) => {
    const session = sessions.find(b => b.id === sessionId);
    if (!session) {
      return (
        <div className="flex items-center justify-center h-full bg-[#000000] text-gray-500 font-mono">
          Session inactive.
        </div>
      );
    }

    const filteredLogs = eventLogs.filter(log => log.sessionId === sessionId);
    const availableCommands = commands
      .filter(command => command.payloadType === session.listener && command.name !== "interactive" && command.name !== "ssh")
      .sort((left, right) => left.name.localeCompare(right.name));

    return (
      <div className="flex flex-col md:flex-row h-full bg-[#000000] divide-y md:divide-y-0 md:divide-x divide-[#222222]">
        <div className="flex-1 flex flex-col h-full p-2 overflow-hidden text-xs select-text">
          <div className="flex items-center justify-between text-gray-400 border-b border-[#222222] pb-1.5 mb-2 font-mono">
            <div className="flex items-center space-x-2">
              <span className="text-gray-200 font-bold">{session.user}@{session.computer}</span>
              <span className="text-gray-600">|</span>
              <span>PID: {session.pid} ({session.process})</span>
            </div>
            <button 
              onClick={() => {
                onAddLog({
                  id: `log-${Date.now()}`,
                  timestamp: new Date().toLocaleString(),
                  type: "output",
                  message: `\n[+] Terminal cleared.\n`,
                  sessionId
                });
              }}
              className="text-[10px] text-gray-500 hover:text-white cursor-pointer"
            >
              Clear
            </button>
          </div>

          <div ref={consoleScrollRef} onScroll={handleConsoleScroll} className="flex-1 overflow-y-auto space-y-1.5 font-mono text-sm">
            <div className="text-[#00FF00] text-xs p-1 bg-[#111111] border border-[#222222] rounded mb-2">
              *** Session active callback for {session.user}@{session.computer} ({session.pid})
            </div>

            {filteredLogs.map((log) => {
              let textClass = "text-gray-300";
              if (log.type === "input") textClass = "text-[#FFFF00] font-bold";
              if (log.type === "error") textClass = "text-red-400";
              if (log.type === "output") textClass = "text-[#00FF00]";

              if (log.type === "input") {
                return (
                  <div key={log.id} className={`${textClass} whitespace-pre-wrap break-words`}>
                    {log.message}
                  </div>
                );
              }

              const [summary, ...detailLines] = log.message.split("\n");
              
              return (
                <div key={log.id} className="font-mono">
                  <div className="flex items-start gap-1.5">
                    <span className="shrink-0 text-gray-500 text-[11px] select-text">[{log.timestamp}]</span>
                    <span className={`${textClass} whitespace-pre-wrap break-words min-w-0`}>{summary}</span>
                  </div>
                  {detailLines.length > 0 && (
                    <div className={`${textClass} whitespace-pre-wrap break-words`}>{detailLines.join("\n")}</div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Commands registered by loaded TeamServer Lua scripts */}
        <div className="w-full md:w-72 bg-[#0a0a0a] p-2 flex flex-col text-[11px] font-mono h-40 md:h-full overflow-hidden">
          <div className="text-gray-400 border-b border-[#222222] pb-1.5 mb-2">
            <span className="font-bold text-gray-300">Available Commands</span>
            <div className="mt-0.5 text-[9px] text-gray-600">Payload type: {session.listener}</div>
          </div>

          <div className="flex-1 overflow-y-auto space-y-1 pr-1 text-gray-400">
            {availableCommands.length === 0 ? (
              <div className="h-full flex items-center justify-center text-center text-gray-600 p-2">
                No Lua commands registered for this payload type.
              </div>
            ) : (
              availableCommands.map(command => (
                <button
                  key={`${command.payloadType}-${command.name}`}
                  type="button"
                  onClick={() => setCommandInput(`${command.name} `)}
                  className="block w-full cursor-pointer rounded border border-[#222222] bg-[#141414] p-1.5 text-left hover:bg-[#202020]"
                >
                  <div className="font-bold text-gray-200">{command.name}</div>
                  <div className="mt-0.5 text-[9px] leading-tight text-gray-500">{command.description}</div>
                </button>
              ))
            )}
          </div>
        </div>
      </div>
    );
  };

  // 3. Listeners Management
  const renderListeners = () => {
    return (
      <div className="bg-[#1e1e1e] p-3 text-gray-300 h-full overflow-auto flex flex-col md:flex-row gap-4 font-sans">
        <div className="flex-1 flex flex-col min-w-0">
          <h3 className="text-xs font-bold text-gray-200 mb-2 uppercase tracking-wide flex items-center">
            <Radio className="w-3.5 h-3.5 mr-1 text-gray-400" />
            <span>TeamServer Listeners</span>
          </h3>

          <div className="border border-[#333333] rounded overflow-hidden">
            <table className="w-full text-xs text-left text-gray-300">
              <thead className="bg-[#2a2a2a] text-gray-400 border-b border-[#333333]">
                <tr>
                  <th className="p-2">Name</th>
                  <th className="p-2">Host Bind</th>
                  <th className="p-2">Port</th>
                  <th className="p-2">Persistent</th>
                  <th className="p-2">Sessions</th>
                  <th className="p-2">Status</th>
                  <th className="p-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#2a2a2a] bg-[#222222]">
                {listeners.map(l => (
                  <tr key={l.id} className="hover:bg-[#282828]">
                    <td className="p-2 font-bold text-white">{l.name}</td>
                    <td className="p-2 font-mono text-gray-400">{l.host}</td>
                    <td className="p-2 font-mono font-bold text-white">{l.port}</td>
                    <td className="p-2 text-gray-400">{l.persistent ? "Yes" : "No"}</td>
                    <td className="p-2 text-gray-400">{l.associations ?? 0}</td>
                    <td className="p-2">
                      <span className="px-1.5 py-0.5 rounded text-[10px] bg-[#333] text-gray-200">
                        {l.status}
                      </span>
                    </td>
                    <td className="p-2 text-right">
                      <button
                        onClick={() => {
                          setListenerActionError("");
                          void onSetListenerState(l.name, l.status !== "Active")
                            .catch(error => setListenerActionError(error instanceof Error ? error.message : String(error)));
                        }}
                        className="text-[10px] bg-[#383838] hover:bg-[#484848] text-white px-2 py-0.5 rounded cursor-pointer"
                      >
                        {l.status === "Active" ? "Stop" : "Start"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="w-full md:w-72 bg-[#252525] border border-[#333333] p-3 rounded flex flex-col text-xs">
          <h3 className="text-xs font-bold text-gray-200 mb-2 border-b border-[#333] pb-1 flex items-center">
            <Plus className="w-3.5 h-3.5 mr-1 text-gray-400" />
            <span>New Listener</span>
          </h3>

          <form onSubmit={handleCreateListener} className="space-y-2.5 flex-1">
            <div>
              <label className="block text-gray-400 mb-1">Listener Name</label>
              <input
                type="text"
                required
                placeholder="HTTPS_Secure"
                value={newListenerName}
                onChange={(e) => setNewListenerName(e.target.value)}
                className="w-full bg-[#181818] border border-[#444] rounded p-1 text-white outline-none"
              />
            </div>

            <div>
              <label className="block text-gray-400 mb-1">Host Bind</label>
              <input
                type="text"
                required
                value={newListenerHost}
                onChange={(e) => setNewListenerHost(e.target.value)}
                className="w-full bg-[#181818] border border-[#444] rounded p-1 text-white outline-none font-mono"
              />
            </div>

            <div>
              <label className="block text-gray-400 mb-1">Port</label>
              <input
                type="number"
                min="1"
                max="65535"
                required
                value={newListenerPort}
                onChange={(e) => setNewListenerPort(parseInt(e.target.value))}
                className="w-full bg-[#181818] border border-[#444] rounded p-1 text-white outline-none"
              />
            </div>

            <label className="flex items-center gap-2 text-gray-400">
              <input
                type="checkbox"
                checked={newListenerPersistent}
                onChange={(e) => setNewListenerPersistent(e.target.checked)}
              />
              Persistent across TeamServer restarts
            </label>

            {listenerActionError && (
              <p className="rounded border border-red-900/70 bg-red-950/30 p-1.5 text-[10px] text-red-300">{listenerActionError}</p>
            )}

            <button
              type="submit"
              disabled={isCreatingListener || !isWsConnected}
              className="w-full bg-[#385d8a] hover:bg-[#486d9a] text-white font-bold py-1.5 rounded transition cursor-pointer mt-2 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isCreatingListener ? "Creating…" : "Create Listener"}
            </button>
          </form>
        </div>
      </div>
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
    <div className="bg-[#1e1e1e] p-3 text-gray-300 h-full overflow-hidden flex flex-col font-sans">
      <div className="mb-2 flex items-center justify-between gap-3">
        <h3 className="flex items-center text-xs font-bold uppercase text-gray-200">
          {icon}
          <span>{title}</span>
          <span className="ml-2 font-normal text-gray-500">({items.length})</span>
        </h3>
        <button
          type="button"
          disabled={isRefreshingLoots || !isWsConnected}
          onClick={() => void refreshLoots()}
          className="flex items-center gap-1.5 rounded border border-[#444] bg-[#292929] px-2 py-1 text-[10px] text-gray-200 transition hover:border-purple-500 hover:bg-[#333] focus:border-purple-500 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
        >
          <RefreshCw className={`h-3 w-3 ${isRefreshingLoots ? "animate-spin" : ""}`} />
          {isRefreshingLoots ? "Refreshing…" : "Refresh"}
        </button>
      </div>

      {lootActionError && (
        <p className="mb-2 rounded border border-red-900/70 bg-red-950/30 p-1.5 text-[10px] text-red-300">
          {lootActionError}
        </p>
      )}

      <div className="flex-1 overflow-auto rounded border border-[#333333] bg-[#222222]">
        <table className="w-full min-w-[1100px] text-left text-xs text-gray-300 font-mono">
          <thead className="sticky top-0 z-10 border-b border-[#333333] bg-[#2a2a2a] text-gray-400">
            <tr>
              <th className="p-2">UUID</th>
              <th className="p-2">Source Session</th>
              <th className="p-2">Created</th>
              <th className="p-2">File Name</th>
              <th className="p-2 text-right">Size</th>
              <th className="p-2">SHA-256</th>
              <th className="p-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#2a2a2a]">
            {items.map(item => (
              <tr key={item.id} className="hover:bg-[#282828]">
                <td className="p-2 select-all text-gray-400">{item.id}</td>
                <td className="p-2 select-all font-bold text-white">{item.sourceSession || "—"}</td>
                <td className="p-2 whitespace-nowrap text-gray-500">{item.capturedAt}</td>
                <td className="p-2 select-all break-all font-bold text-white">{item.data}</td>
                <td className="p-2 whitespace-nowrap text-right text-gray-300">
                  {item.size === undefined ? "—" : `${item.size.toLocaleString()} B`}
                </td>
                <td className="p-2 select-all break-all text-gray-400">{item.sha256 || "—"}</td>
                <td className="p-2">
                  <div className="flex justify-end gap-1.5 font-sans">
                    <button
                      type="button"
                      disabled={Boolean(lootActionId) || !isWsConnected}
                      onClick={() => void runLootAction("download", item.id)}
                      className="flex items-center gap-1 rounded border border-[#444] bg-[#292929] px-2 py-1 text-[10px] text-gray-200 transition hover:border-purple-500 hover:bg-[#333] focus:border-purple-500 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <Download className="h-3 w-3" />
                      {lootActionId === `download:${item.id}` ? "Downloading…" : "Download"}
                    </button>
                    <button
                      type="button"
                      disabled={Boolean(lootActionId) || !isWsConnected}
                      onClick={() => void runLootAction("delete", item.id)}
                      className="flex items-center gap-1 rounded border border-red-900/70 bg-red-950/30 px-2 py-1 text-[10px] text-red-300 transition hover:border-red-600 hover:bg-red-950/60 focus:border-purple-500 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <Trash2 className="h-3 w-3" />
                      {lootActionId === `delete:${item.id}` ? "Deleting…" : "Delete"}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr>
                <td colSpan={7} className="p-8 text-center font-sans text-gray-500">
                  No loot has been collected.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );

  // 4. Secrets
  const renderSecrets = () => {
    const secrets = loots.filter(item => item.type === "Secret" || item.type === "Credential" || item.type === "Token");
    return (
      <div className="flex h-full flex-col overflow-hidden bg-[#1e1e1e] p-3 font-sans text-gray-300">
        <div className="mb-2 flex items-center justify-between gap-3">
          <h3 className="flex items-center text-xs font-bold uppercase text-gray-200">
            <Key className="mr-1 h-3.5 w-3.5 text-gray-400" />
            <span>Secrets</span>
            <span className="ml-2 font-normal text-gray-500">({secrets.length})</span>
          </h3>
          <button
            type="button"
            disabled={isRefreshingLoots || !isWsConnected}
            onClick={() => void refreshLoots()}
            className="flex items-center gap-1.5 rounded border border-[#444] bg-[#292929] px-2 py-1 text-[10px] text-gray-200 transition hover:border-purple-500 hover:bg-[#333] focus:border-purple-500 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
          >
            <RefreshCw className={`h-3 w-3 ${isRefreshingLoots ? "animate-spin" : ""}`} />
            {isRefreshingLoots ? "Refreshing…" : "Refresh"}
          </button>
        </div>

        {lootActionError && (
          <p className="mb-2 rounded border border-red-900/70 bg-red-950/30 p-1.5 text-[10px] text-red-300">
            {lootActionError}
          </p>
        )}

        <div className="flex-1 overflow-auto rounded border border-[#333] bg-[#191919] p-3">
          <div className="grid grid-cols-1 gap-3 2xl:grid-cols-2">
            {secrets.map(item => {
              const preview = secretPreviews[item.id];
              const previewError = secretPreviewErrors[item.id];
              return (
                <article key={item.id} className="flex min-w-0 flex-col overflow-hidden rounded border border-[#383838] bg-[#252525]">
                  <div className="flex min-w-0 items-start justify-between gap-3 border-b border-[#333] p-2.5">
                    <div className="min-w-0">
                      <div className="select-text break-all font-mono text-xs font-bold text-white">{item.data}</div>
                      <div className="mt-1 text-[10px] text-gray-500">
                        Session <span className="select-text text-gray-300">{item.sourceSession || "—"}</span>
                        <span className="mx-1.5 text-gray-700">•</span>
                        {item.capturedAt}
                      </div>
                    </div>
                    <span className={`shrink-0 rounded border px-1.5 py-0.5 font-mono text-[9px] uppercase ${
                      preview?.kind === "hex"
                        ? "border-amber-800/70 bg-amber-950/30 text-amber-300"
                        : "border-purple-800/70 bg-purple-950/30 text-purple-300"
                    }`}>
                      {preview?.kind === "hex"
                        ? "Hexdump"
                        : preview?.kind === "text" ? "Text" : previewError ? "Error" : "Detecting"}
                    </span>
                  </div>

                  <div className="h-60 overflow-auto bg-[#111] p-3 font-mono text-[10px] leading-4 text-gray-300">
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

                  <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[#333] p-2.5">
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
                    <div className="flex shrink-0 gap-1.5">
                      <button
                        type="button"
                        disabled={Boolean(lootActionId) || !isWsConnected}
                        onClick={() => void runLootAction("download", item.id)}
                        className="flex items-center gap-1 rounded border border-[#444] bg-[#292929] px-2 py-1 text-[10px] text-gray-200 transition hover:border-purple-500 hover:bg-[#333] focus:border-purple-500 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <Download className="h-3 w-3" />
                        {lootActionId === `download:${item.id}` ? "Downloading…" : "Download"}
                      </button>
                      <button
                        type="button"
                        disabled={Boolean(lootActionId) || !isWsConnected}
                        onClick={() => void runLootAction("delete", item.id)}
                        className="flex items-center gap-1 rounded border border-red-900/70 bg-red-950/30 px-2 py-1 text-[10px] text-red-300 transition hover:border-red-600 hover:bg-red-950/60 focus:border-purple-500 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <Trash2 className="h-3 w-3" />
                        {lootActionId === `delete:${item.id}` ? "Deleting…" : "Delete"}
                      </button>
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
        </div>
      </div>
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
      <div className="flex h-full flex-col overflow-hidden bg-[#1e1e1e] p-3 font-sans text-gray-300">
        <div className="mb-2 flex items-center justify-between gap-3">
          <h3 className="flex items-center text-xs font-bold uppercase text-gray-200">
            <ImageIcon className="mr-1 h-3.5 w-3.5 text-gray-400" />
            <span>Device Images</span>
            <span className="ml-2 font-normal text-gray-500">({images.length})</span>
          </h3>
          <button
            type="button"
            disabled={isRefreshingLoots || !isWsConnected}
            onClick={() => void refreshLoots()}
            className="flex items-center gap-1.5 rounded border border-[#444] bg-[#292929] px-2 py-1 text-[10px] text-gray-200 transition hover:border-purple-500 hover:bg-[#333] focus:border-purple-500 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
          >
            <RefreshCw className={`h-3 w-3 ${isRefreshingLoots ? "animate-spin" : ""}`} />
            {isRefreshingLoots ? "Refreshing…" : "Refresh"}
          </button>
        </div>

        {lootActionError && (
          <p className="mb-2 rounded border border-red-900/70 bg-red-950/30 p-1.5 text-[10px] text-red-300">
            {lootActionError}
          </p>
        )}

        <div className="flex-1 overflow-auto rounded border border-[#333] bg-[#191919] p-3">
          <div className="flex flex-wrap items-start gap-3">
            {images.map(item => (
              <article key={item.id} className="flex w-[418px] max-w-full min-w-0 flex-col overflow-hidden rounded border border-[#383838] bg-[#252525]">
                <div className="flex h-48 items-center justify-center overflow-hidden border-b border-[#333] bg-[#111]">
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

                <div className="flex min-h-0 flex-1 flex-col p-2.5">
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

                  <div className="mt-3 flex justify-end gap-1.5 border-t border-[#333] pt-2">
                    <button
                      type="button"
                      disabled={Boolean(lootActionId) || !isWsConnected}
                      onClick={() => void runLootAction("download", item.id)}
                      className="flex items-center gap-1 rounded border border-[#444] bg-[#292929] px-2 py-1 text-[10px] text-gray-200 transition hover:border-purple-500 hover:bg-[#333] focus:border-purple-500 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <Download className="h-3 w-3" />
                      {lootActionId === `download:${item.id}` ? "Downloading…" : "Download"}
                    </button>
                    <button
                      type="button"
                      disabled={Boolean(lootActionId) || !isWsConnected}
                      onClick={() => void runLootAction("delete", item.id)}
                      className="flex items-center gap-1 rounded border border-red-900/70 bg-red-950/30 px-2 py-1 text-[10px] text-red-300 transition hover:border-red-600 hover:bg-red-950/60 focus:border-purple-500 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <Trash2 className="h-3 w-3" />
                      {lootActionId === `delete:${item.id}` ? "Deleting…" : "Delete"}
                    </button>
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
        </div>
      </div>
    );
  };

  // 7. Lua Scripts
  const renderScripts = () => {
    const selectedScript = scripts.find(script => script.id === selectedScriptId);

    const refreshScripts = async () => {
      setScriptActionError("");
      setIsScriptActionPending(true);
      try {
        await onRefreshScripts();
      } catch (error) {
        setScriptActionError(error instanceof Error ? error.message : String(error));
      } finally {
        setIsScriptActionPending(false);
      }
    };

    const runScriptAction = async (action: "load" | "unload") => {
      const path = scriptPath.trim();
      if (!path) {
        setScriptActionError("Enter a server-side Lua script path.");
        return;
      }

      setScriptActionError("");
      setIsScriptActionPending(true);
      try {
        if (action === "load") {
          const loaded = await onLoadScript(path);
          setSelectedScriptId(loaded.id);
          setScriptPath(loaded.id);
        } else {
          await onUnloadScript(path);
          setSelectedScriptId("");
          setScriptPath("");
        }
        await onRefreshScripts();
      } catch (error) {
        setScriptActionError(error instanceof Error ? error.message : String(error));
      } finally {
        setIsScriptActionPending(false);
      }
    };

    return (
      <div className="flex h-full flex-col gap-3 overflow-auto bg-[#1e1e1e] p-3 font-sans text-gray-300 md:flex-row">
        <div className="flex w-full flex-col md:w-72">
          <div className="mb-2 flex items-center justify-between border-b border-[#333] pb-2">
            <h3 className="flex items-center text-xs font-bold uppercase text-gray-200">
              <FileCode className="mr-1 h-3.5 w-3.5 text-gray-400" />
              <span>Loaded Scripts</span>
            </h3>
            <button
              type="button"
              onClick={() => void refreshScripts()}
              disabled={isScriptActionPending}
              className="cursor-pointer rounded border border-[#444] px-2 py-1 text-[10px] text-gray-400 hover:bg-[#333] hover:text-white disabled:cursor-wait disabled:opacity-50"
            >
              Refresh
            </button>
          </div>

          <div className="min-h-32 flex-1 space-y-1.5 overflow-auto">
            {scripts.map(scr => (
              <button
                key={scr.id}
                type="button"
                onClick={() => {
                  setSelectedScriptId(scr.id);
                  setScriptPath(scr.id);
                  setScriptActionError("");
                }}
                className={`w-full cursor-pointer rounded border p-2 text-left ${
                  selectedScriptId === scr.id 
                    ? "bg-[#385d8a] border-[#486d9a] text-white" 
                    : "bg-[#252525] border-[#333333] text-gray-300 hover:bg-[#2e2e2e]"
                }`}
              >
                <div className="font-bold text-xs">{scr.name}</div>
                <div className="truncate text-[10px] text-gray-400">{scr.description}</div>
              </button>
            ))}
            {scripts.length === 0 && !isScriptActionPending && (
              <div className="rounded border border-dashed border-[#3a3a3a] p-4 text-center text-[10px] text-gray-600">No scripts are loaded.</div>
            )}
          </div>
        </div>

        <div className="flex flex-1 flex-col gap-3 rounded border border-[#333333] bg-[#222222] p-3">
          <form
            onSubmit={event => {
              event.preventDefault();
              void runScriptAction("load");
            }}
            className="rounded border border-[#333] bg-[#1a1b1d] p-3"
          >
            <label htmlFor="server-script-path" className="mb-1 block text-[11px] text-gray-300">Server-side Lua script path</label>
            <input
              id="server-script-path"
              type="text"
              value={scriptPath}
              onChange={event => {
                setScriptPath(event.target.value);
                setScriptActionError("");
              }}
              placeholder="/opt/purplecommand/scripts/example.lua"
              className="w-full rounded border border-[#444] bg-[#141414] px-3 py-2 font-mono text-xs text-white outline-none transition placeholder:text-gray-700 focus:border-violet-400"
            />
            <p className="mt-1 text-[10px] text-gray-600">The path is resolved and read by the TeamServer.</p>
            <div className="mt-3 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => void runScriptAction("unload")}
                disabled={isScriptActionPending || !scriptPath.trim()}
                className="cursor-pointer rounded border border-red-900/70 bg-red-950/30 px-3 py-1.5 text-red-300 hover:bg-red-950/60 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Unload
              </button>
              <button
                type="submit"
                disabled={isScriptActionPending || !scriptPath.trim()}
                className="cursor-pointer rounded bg-[#385d8a] px-3 py-1.5 font-bold text-white hover:bg-[#486d9a] disabled:cursor-not-allowed disabled:opacity-40"
              >
                {isScriptActionPending ? "Working…" : "Load"}
              </button>
            </div>
          </form>

          {scriptActionError && <p className="rounded border border-red-900/70 bg-red-950/30 p-2 text-[10px] text-red-300">{scriptActionError}</p>}

          {selectedScript ? (
            <div className="rounded border border-[#333] bg-[#18191b] p-3 text-[11px]">
              <div className="font-bold text-gray-200">{selectedScript.name}</div>
              <div className="mt-1 break-all font-mono text-gray-500">{selectedScript.id}</div>
              <div className="mt-2 text-gray-400">Status: <span className="text-emerald-400">{selectedScript.status}</span></div>
              <pre className="mt-3 whitespace-pre-wrap break-all border-t border-[#333] pt-3 font-mono text-[10px] text-gray-500">{selectedScript.content}</pre>
            </div>
          ) : (
            <div className="flex min-h-32 flex-1 items-center justify-center rounded border border-dashed border-[#333] text-[11px] text-gray-600">Enter a server path to load a script.</div>
          )}
        </div>
      </div>
    );
  };

  // 8. WebSocket Event Monitor
  const renderEventMonitor = () => {
    return (
      <div className="bg-[#1e1e1e] p-3 text-gray-300 h-full overflow-hidden flex flex-col font-mono text-xs">
        <div className="mb-2 flex items-center justify-end font-sans">
          <span className="text-[10px] text-gray-500">{packets.length} / 1000 events</span>
        </div>

        <div className="border border-[#333333] rounded overflow-auto flex-1 bg-[#141414]">
          <div className="min-w-[850px]">
            <div className="sticky top-0 z-10 grid grid-cols-[100px_90px_100px_75px_130px_minmax(300px,1fr)] gap-2 border-b border-[#3b3b3b] bg-[#252526] px-2 py-1.5 text-[10px] font-bold uppercase tracking-wide text-gray-500">
              <span>Time</span>
              <span>Direction</span>
              <span>Transport</span>
              <span>Size</span>
              <span>Encryption</span>
              <span>Payload</span>
            </div>
            {packets.map((pkt) => (
              <div
                key={pkt.id}
                className="grid grid-cols-[100px_90px_100px_75px_130px_minmax(300px,1fr)] gap-2 border-b border-[#292929] px-2 py-1.5 text-[11px] hover:bg-[#222222]"
              >
                <span className="text-gray-500">{pkt.timestamp}</span>
                <span className="font-bold text-gray-300">{pkt.direction}</span>
                <span className="text-gray-400">{pkt.type}</span>
                <span className="text-gray-400">{pkt.size} B</span>
                <span className="text-gray-400">{pkt.encryption}</span>
                <span className="select-text break-all text-gray-300">{pkt.payload}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
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
    <div className="flex flex-col h-full bg-[#1e1e1e] border border-[#2b2b2b] select-none text-xs font-sans">
      {/* Tab bar header */}
      <div className="flex items-center bg-[#252526] border-b border-[#2b2b2b] overflow-x-auto select-none">
        {tabs.map((t) => {
          const isActive = t.id === activeTabId;
          const isEventLog = t.type === "event_log";
          
          return (
            <div
              key={t.id}
              onClick={() => onSetActiveTab(t.id)}
              className={`flex items-center space-x-2 px-3 py-1.5 border-r border-[#2d2d2d] cursor-pointer transition-colors ${
                isActive 
                  ? "bg-[#1e1e1e] text-white font-bold border-t-2 border-gray-400" 
                  : "bg-[#2d2d2d] text-[#A0A0A0] hover:bg-[#252526] hover:text-white"
              }`}
            >
              <span className="text-xs truncate max-w-[130px]">{t.title}</span>
              
              {!isEventLog && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onCloseTab(t.id);
                  }}
                  className="hover:bg-[#444] text-gray-400 hover:text-white p-0.5 rounded cursor-pointer ml-1"
                >
                  <X className="w-3 h-3 text-gray-400" />
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* Main Terminal View */}
      <div className="flex-1 min-h-0 relative">
        {renderContent()}
      </div>

      {/* Command prompt execution bar */}
      {activeTab && (activeTab.type === "session" || activeTab.type === "event_log") && (
        <div className="bg-[#111111] border-t border-[#2d2d2d] flex flex-col font-mono">
          {/* Prompt Form */}
          <form onSubmit={handleCommandSubmit} className="flex items-center px-2 py-1 bg-[#000000] text-xs">
            <span className="text-[#00FF00] font-bold mr-2 select-none">
              {activeTab.type === "session" ? "session>" : "event>"}
            </span>
            <input
              type="text"
              value={commandInput}
              onChange={(e) => setCommandInput(e.target.value)}
              onKeyDown={handleKeyDown}
              className="flex-1 bg-transparent text-[#00FF00] font-mono outline-none text-xs"
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
          <div className="bg-[#111111] px-2 py-1 flex items-center space-x-2 border-t border-[#222222]">
            <span className="bg-[#242b58] text-[#8397ff] border border-[#3e4a9e] px-2 py-0.5 rounded text-xs font-bold font-mono">
              {operatorName}@{serverHost}
            </span>
          </div>
        </div>
      )}
    </div>
  );
};
