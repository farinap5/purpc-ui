import React, { useState, useRef, useEffect } from "react";
import { 
  X, 
  Radio, 
  Key, 
  FileCode, 
  Activity, 
  Plus, 
  Download, 
  Image as ImageIcon
} from "lucide-react";
import { Session, Listener, Loot, Script, ConsoleLog, Packet, Command } from "../types";

interface CommandExecutionResult {
  task_ids?: string[];
  message?: string;
}

interface ConsoleTab {
  id: string;
  title: string;
  type: "event_log" | "listeners" | "loots" | "downloads" | "screenshots" | "scripts" | "packets" | "session";
  sessionId?: string;
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
  
  onAddListener: (newListener: Omit<Listener, "id" | "status">) => Promise<void>;
  onSetListenerState: (name: string, start: boolean) => Promise<void>;
  onSetScriptState: (script: Script, load: boolean) => Promise<void>;
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
  onAddListener,
  onSetListenerState,
  onSetScriptState,
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
  const [editedScriptContent, setEditedScriptContent] = useState("");
  const [scriptActionError, setScriptActionError] = useState("");

  const consoleScrollRef = useRef<HTMLDivElement | null>(null);
  const followOutputByTabRef = useRef<Record<string, boolean>>({});
  const scrollPositionByTabRef = useRef<Record<string, number>>({});

  useEffect(() => {
    if (!scripts.some(script => script.id === selectedScriptId)) {
      setSelectedScriptId(scripts[0]?.id || "");
      return;
    }
    const scr = scripts.find(s => s.id === selectedScriptId);
    if (scr) {
      setEditedScriptContent(scr.content);
    }
  }, [selectedScriptId, scripts]);

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

  const activeTab = tabs.find(t => t.id === activeTabId) || tabs[0];
  let serverHost = serverAddress;
  try {
    serverHost = new URL(serverAddress).host;
  } catch {
    // Keep the configured address as the display fallback.
  }

  const handleCommandSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!commandInput.trim()) return;

    const currentCommand = commandInput.trim();
    setHistory(prev => [...prev, currentCommand]);
    setHistoryIdx(-1);
    setCommandInput("");

    if (activeTab.type === "event_log") {
      onAddLog({
        id: `log-${Date.now()}`,
        timestamp: new Date().toLocaleString(),
        type: "input",
        message: `<${operatorName}> ${currentCommand}`
      });

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

  // 4. Loots
  const renderLoots = () => {
    return (
      <div className="bg-[#1e1e1e] p-3 text-gray-300 h-full overflow-auto flex flex-col font-sans">
        <h3 className="text-xs font-bold text-gray-200 mb-2 uppercase flex items-center">
          <Key className="w-3.5 h-3.5 mr-1 text-gray-400" />
          <span>TeamServer Loot Metadata</span>
        </h3>

        <div className="border border-[#333333] rounded overflow-hidden flex-1 bg-[#222222]">
          <table className="w-full text-xs text-left text-gray-300 font-mono">
            <thead className="bg-[#2a2a2a] text-gray-400 border-b border-[#333333]">
              <tr>
                <th className="p-2 w-28">Source</th>
                <th className="p-2 w-36">Time</th>
                <th className="p-2">File</th>
                <th className="p-2">Size / Digest</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#2a2a2a]">
              {loots.map(c => (
                <tr key={c.id} className="hover:bg-[#282828]">
                  <td className="p-2 font-bold text-white">{c.sourceSession}</td>
                  <td className="p-2 text-gray-500">{c.capturedAt}</td>
                  <td className="p-2 text-white font-bold select-all">{c.data}</td>
                  <td className="p-2 text-gray-400">{c.description}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  // 5. Downloaded Files
  const renderDownloads = () => {
    const files = loots.filter(l => l.type === "File");
    return (
      <div className="bg-[#1e1e1e] p-3 text-gray-300 h-full overflow-auto flex flex-col font-sans">
        <h3 className="text-xs font-bold text-gray-200 mb-2 uppercase flex items-center">
          <Download className="w-3.5 h-3.5 mr-1 text-gray-400" />
          <span>Looted Files Repository</span>
        </h3>

        <div className="border border-[#333333] rounded overflow-hidden flex-1 bg-[#222222]">
          <table className="w-full text-xs text-left text-gray-300 font-mono">
            <thead className="bg-[#2a2a2a] text-gray-400 border-b border-[#333333]">
              <tr>
                <th className="p-2 w-28">Source Session</th>
                <th className="p-2 w-36">Time</th>
                <th className="p-2">Target File Path</th>
                <th className="p-2">Description</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#2a2a2a]">
              {files.map(f => (
                <tr key={f.id} className="hover:bg-[#282828]">
                  <td className="p-2 font-bold text-white">{f.sourceSession}</td>
                  <td className="p-2 text-gray-500">{f.capturedAt}</td>
                  <td className="p-2 text-white">{f.data}</td>
                  <td className="p-2 text-gray-400">{f.description}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  // 6. Screenshots
  const renderScreenshots = () => {
    const screens = loots.filter(l => l.type === "Screenshot");
    return (
      <div className="bg-[#1e1e1e] p-3 text-gray-300 h-full overflow-auto flex flex-col font-sans">
        <h3 className="text-xs font-bold text-gray-200 mb-2 uppercase flex items-center">
          <ImageIcon className="w-3.5 h-3.5 mr-1 text-gray-400" />
          <span>Target Screenshots</span>
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
          {screens.map(s => (
            <div key={s.id} className="bg-[#252525] border border-[#333333] rounded p-2 text-xs flex flex-col">
              <img src={s.data} alt="Screenshot" className="w-full h-36 object-cover rounded mb-2" />
              <div className="font-bold text-white flex justify-between">
                <span>Session: {s.sourceSession}</span>
                <span className="text-gray-500 text-[10px]">{s.capturedAt}</span>
              </div>
              <p className="text-gray-400 text-[11px] mt-1">{s.description}</p>
            </div>
          ))}
        </div>
      </div>
    );
  };

  // 7. Lua Scripts
  const renderScripts = () => {
    return (
      <div className="bg-[#1e1e1e] text-gray-300 p-3 h-full overflow-auto flex flex-col md:flex-row gap-3 font-sans">
        <div className="w-full md:w-64 flex flex-col">
          <h3 className="text-xs font-bold text-gray-200 mb-2 uppercase flex items-center">
            <FileCode className="w-3.5 h-3.5 mr-1 text-gray-400" />
            <span>Lua Scripts</span>
          </h3>

          <div className="space-y-1.5 flex-1">
            {scripts.map(scr => (
              <div
                key={scr.id}
                onClick={() => setSelectedScriptId(scr.id)}
                className={`p-2 rounded border cursor-pointer ${
                  selectedScriptId === scr.id 
                    ? "bg-[#385d8a] border-[#486d9a] text-white" 
                    : "bg-[#252525] border-[#333333] text-gray-300 hover:bg-[#2e2e2e]"
                }`}
              >
                <div className="font-bold text-xs">{scr.name}</div>
                <div className="text-[10px] text-gray-400 truncate">{scr.description}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="flex-1 flex flex-col bg-[#222222] border border-[#333333] rounded p-2 gap-2">
          {scripts.find(script => script.id === selectedScriptId) && (
            <div className="flex items-center justify-between border-b border-[#333] pb-2 text-[10px]">
              <span className="font-mono text-gray-500">Script source metadata is read-only.</span>
              <button
                type="button"
                onClick={() => {
                  const selected = scripts.find(script => script.id === selectedScriptId);
                  if (selected) {
                    setScriptActionError("");
                    void onSetScriptState(selected, selected.status !== "Active")
                      .catch(error => setScriptActionError(error instanceof Error ? error.message : String(error)));
                  }
                }}
                className="cursor-pointer rounded bg-[#383838] px-2 py-1 text-white hover:bg-[#484848]"
              >
                {scripts.find(script => script.id === selectedScriptId)?.status === "Active" ? "Unload" : "Load"}
              </button>
            </div>
          )}
          {scriptActionError && <p className="rounded border border-red-900/70 bg-red-950/30 p-2 text-[10px] text-red-300">{scriptActionError}</p>}
          <textarea
            value={editedScriptContent}
            readOnly
            className="flex-1 w-full bg-[#141414] text-gray-400 font-mono text-xs p-2 rounded outline-none border border-[#333333] resize-none"
          />
        </div>
      </div>
    );
  };

  // 8. WebSocket Event Monitor
  const renderEventMonitor = () => {
    return (
      <div className="bg-[#1e1e1e] p-3 text-gray-300 h-full overflow-hidden flex flex-col font-mono text-xs">
        <div className="mb-2 flex items-center justify-between font-sans">
          <h3 className="text-xs font-bold text-gray-200 uppercase flex items-center">
            <Activity className="w-3.5 h-3.5 mr-1 text-gray-400" />
            <span>Event Monitor</span>
          </h3>
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
    switch (activeTab.type) {
      case "event_log":
        return renderEventLog();
      case "session":
        return activeTab.sessionId ? renderSessionTerminal(activeTab.sessionId) : renderEventLog();
      case "listeners":
        return renderListeners();
      case "loots":
        return renderLoots();
      case "downloads":
        return renderDownloads();
      case "screenshots":
        return renderScreenshots();
      case "scripts":
        return renderScripts();
      case "packets":
        return renderEventMonitor();
      default:
        return renderEventLog();
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
      {(activeTab.type === "session" || activeTab.type === "event_log") && (
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
