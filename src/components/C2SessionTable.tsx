import React, { useState, useEffect, useLayoutEffect, useRef } from "react";
import { Session } from "../types";
import { 
  Terminal, 
  Trash2, 
  Edit3, 
  Monitor
} from "lucide-react";

interface SessionTableProps {
  sessions: Session[];
  selectedSessionId: string | null;
  onSelectSession: (id: string) => void;
  onInteract: (session: Session) => void;
  onUpdateNote: (id: string, note: string) => void;
  onKill: (id: string) => void;
  onDelete: (id: string) => void;
}

type SessionColumnKey =
  | "type"
  | "id"
  | "extIp"
  | "intIp"
  | "listener"
  | "user"
  | "computer"
  | "note"
  | "process"
  | "pid"
  | "arch"
  | "last"
  | "sleep";

const sessionColumns: Array<{ key: SessionColumnKey; label: string; accessibleLabel: string }> = [
  { key: "type", label: "", accessibleLabel: "Operating system" },
  { key: "id", label: "Session ID", accessibleLabel: "Session ID" },
  { key: "extIp", label: "Socket", accessibleLabel: "Remote socket" },
  { key: "intIp", label: "UUID", accessibleLabel: "Session UUID" },
  { key: "listener", label: "Payload", accessibleLabel: "Payload type" },
  { key: "user", label: "User", accessibleLabel: "User" },
  { key: "computer", label: "Computer", accessibleLabel: "Computer" },
  { key: "note", label: "Note", accessibleLabel: "Note" },
  { key: "process", label: "Process", accessibleLabel: "Process" },
  { key: "pid", label: "PID", accessibleLabel: "Process ID" },
  { key: "arch", label: "Arch", accessibleLabel: "Architecture" },
  { key: "last", label: "Last", accessibleLabel: "Last active" },
  { key: "sleep", label: "Sleep", accessibleLabel: "Sleep interval" }
];

const initialColumnWidths: Record<SessionColumnKey, number> = {
  type: 38,
  id: 130,
  extIp: 130,
  intIp: 130,
  listener: 135,
  user: 120,
  computer: 150,
  note: 240,
  process: 140,
  pid: 75,
  arch: 75,
  last: 75,
  sleep: 150
};

const minimumColumnWidths: Record<SessionColumnKey, number> = {
  type: 32,
  id: 90,
  extIp: 90,
  intIp: 90,
  listener: 90,
  user: 80,
  computer: 100,
  note: 140,
  process: 90,
  pid: 55,
  arch: 55,
  last: 55,
  sleep: 90
};

const formatLastActive = (value: number) => {
  const totalSeconds = Math.max(0, Math.floor(value));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
};

const getSleepSeconds = (session: Session) => {
  if (session.sleepSeconds !== undefined) return session.sleepSeconds;

  const value = Number.parseFloat(session.sleep);
  if (!Number.isFinite(value)) return 0;
  const unit = session.sleep.toLowerCase();
  if (unit.includes("hour")) return value * 3600;
  if (unit.includes("minute")) return value * 60;
  return value;
};

export const C2SessionTable: React.FC<SessionTableProps> = ({
  sessions,
  selectedSessionId,
  onSelectSession,
  onInteract,
  onUpdateNote,
  onKill,
  onDelete
}) => {
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    sessionId: string;
  } | null>(null);

  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [noteValue, setNoteValue] = useState("");
  const [columnWidths, setColumnWidths] = useState(initialColumnWidths);
  const [clockNow, setClockNow] = useState(Date.now());
  const tableContainerRef = useRef<HTMLDivElement | null>(null);
  const fittedColumnWidths = useRef(initialColumnWidths);
  const hasManuallyResizedColumns = useRef(false);
  const activeColumnResize = useRef<{
    key: SessionColumnKey;
    startX: number;
    startWidth: number;
  } | null>(null);

  useEffect(() => {
    const intervalId = window.setInterval(() => setClockNow(Date.now()), 1000);
    return () => window.clearInterval(intervalId);
  }, []);

  const updateColumnWidth = (key: SessionColumnKey, width: number) => {
    hasManuallyResizedColumns.current = true;
    const nextWidth = Math.min(600, Math.max(minimumColumnWidths[key], width));
    setColumnWidths(current => ({ ...current, [key]: nextWidth }));
  };

  const fitColumnsToContainer = (containerWidth: number) => {
    if (containerWidth <= 0) return;

    const minimumTotal = sessionColumns.reduce(
      (total, column) => total + minimumColumnWidths[column.key],
      0
    );
    const flexibleTotal = sessionColumns.reduce(
      (total, column) => total + initialColumnWidths[column.key] - minimumColumnWidths[column.key],
      0
    );

    let nextWidths: Record<SessionColumnKey, number>;

    if (containerWidth >= minimumTotal) {
      const flexibleSpace = containerWidth - minimumTotal;
      nextWidths = sessionColumns.reduce((widths, column) => {
        const preferredFlex = initialColumnWidths[column.key] - minimumColumnWidths[column.key];
        widths[column.key] = minimumColumnWidths[column.key] + (preferredFlex / flexibleTotal) * flexibleSpace;
        return widths;
      }, {} as Record<SessionColumnKey, number>);
    } else {
      const scale = containerWidth / minimumTotal;
      nextWidths = sessionColumns.reduce((widths, column) => {
        widths[column.key] = minimumColumnWidths[column.key] * scale;
        return widths;
      }, {} as Record<SessionColumnKey, number>);
    }

    const roundedWidths = sessionColumns.reduce((widths, column) => {
      widths[column.key] = Math.floor(nextWidths[column.key]);
      return widths;
    }, {} as Record<SessionColumnKey, number>);
    const roundedTotal = sessionColumns.reduce((total, column) => total + roundedWidths[column.key], 0);
    roundedWidths.sleep += containerWidth - roundedTotal;

    fittedColumnWidths.current = roundedWidths;
    setColumnWidths(roundedWidths);
  };

  const renderColumnResizeHandle = (key: SessionColumnKey, label: string) => (
    <span
      role="separator"
      aria-label={`Resize ${label} column`}
      aria-orientation="vertical"
      aria-valuemin={minimumColumnWidths[key]}
      aria-valuemax={600}
      aria-valuenow={Math.round(columnWidths[key])}
      tabIndex={0}
      title={`Drag to resize ${label} column. Double-click to reset.`}
      onClick={(event) => event.stopPropagation()}
      onDoubleClick={(event) => {
        event.stopPropagation();
        updateColumnWidth(key, fittedColumnWidths.current[key]);
      }}
      onPointerDown={(event) => {
        event.preventDefault();
        event.stopPropagation();
        activeColumnResize.current = {
          key,
          startX: event.clientX,
          startWidth: columnWidths[key]
        };
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerMove={(event) => {
        const activeResize = activeColumnResize.current;
        if (activeResize?.key === key && event.currentTarget.hasPointerCapture(event.pointerId)) {
          updateColumnWidth(key, activeResize.startWidth + event.clientX - activeResize.startX);
        }
      }}
      onPointerUp={(event) => {
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
          event.currentTarget.releasePointerCapture(event.pointerId);
        }
        activeColumnResize.current = null;
      }}
      onPointerCancel={() => {
        activeColumnResize.current = null;
      }}
      onLostPointerCapture={() => {
        activeColumnResize.current = null;
      }}
      onKeyDown={(event) => {
        const step = event.shiftKey ? 25 : 5;
        if (event.key === "ArrowLeft") {
          event.preventDefault();
          updateColumnWidth(key, columnWidths[key] - step);
        } else if (event.key === "ArrowRight") {
          event.preventDefault();
          updateColumnWidth(key, columnWidths[key] + step);
        } else if (event.key === "Home") {
          event.preventDefault();
          updateColumnWidth(key, minimumColumnWidths[key]);
        }
      }}
      className="group absolute right-0 top-0 z-20 h-full w-2 translate-x-1/2 cursor-col-resize touch-none outline-none"
    >
      <span className="absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-transparent transition-colors group-hover:bg-[#8da2c2] group-focus:bg-[#8da2c2]" />
    </span>
  );

  const tableWidth = sessionColumns.reduce((total, column) => total + columnWidths[column.key], 0);

  useLayoutEffect(() => {
    const container = tableContainerRef.current;
    if (!container) return;

    const fitToCurrentWidth = () => {
      if (!hasManuallyResizedColumns.current) {
        fitColumnsToContainer(container.clientWidth);
      }
    };

    fitToCurrentWidth();
    const resizeObserver = new ResizeObserver(fitToCurrentWidth);
    resizeObserver.observe(container);

    return () => resizeObserver.disconnect();
  }, []);

  useEffect(() => {
    const handleGlobalClick = () => {
      setContextMenu(null);
    };
    window.addEventListener("click", handleGlobalClick);
    return () => window.removeEventListener("click", handleGlobalClick);
  }, []);

  const handleContextMenu = (e: React.MouseEvent, sessionId: string) => {
    e.preventDefault();
    onSelectSession(sessionId);
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      sessionId
    });
  };

  const startEditingNote = (session: Session) => {
    setEditingNoteId(session.id);
    setNoteValue(session.note);
  };

  const saveNote = (id: string) => {
    onUpdateNote(id, noteValue);
    setEditingNoteId(null);
  };

  // Uniform computer icon for session rows
  const getOsIcon = () => {
    return <Monitor className="w-3.5 h-3.5 text-gray-400 inline-block" />;
  };

  const contextSession = contextMenu
    ? sessions.find(session => session.id === contextMenu.sessionId)
    : undefined;

  return (
    <div className="relative flex flex-col h-full bg-[#2a2a2a] border border-[#1e1e1e] select-none text-xs font-mono">
      {/* Table Grid Container */}
      <div ref={tableContainerRef} className="overflow-auto flex-1 min-h-0">
        <table
          className="table-fixed text-left border-collapse whitespace-nowrap text-[#d0d0d0] [&_td]:overflow-hidden [&_td]:text-ellipsis"
          style={{ width: `${tableWidth}px` }}
        >
          <colgroup>
            {sessionColumns.map(column => (
              <col key={column.key} style={{ width: `${columnWidths[column.key]}px` }} />
            ))}
          </colgroup>
          <thead className="bg-[#242424] text-[#a0a0a0] sticky top-0 border-b border-[#333333] z-10 font-sans">
            <tr>
              {sessionColumns.map((column, index) => (
                <th
                  key={column.key}
                  className={`relative px-2 py-1 font-normal text-[11px] ${
                    index < sessionColumns.length - 1 ? "border-r border-[#333333]" : ""
                  } ${column.key === "type" ? "text-center" : ""}`}
                >
                  <span className="block overflow-hidden text-ellipsis">{column.label}</span>
                  {renderColumnResizeHandle(column.key, column.accessibleLabel)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-[#282828] bg-[#2b2b2b]">
            {sessions.map((session) => {
              const isSelected = selectedSessionId === session.id;
              const isKilled = session.status === "killed";
              const lastActive = session.lastSeenAt !== undefined
                ? Math.max(0, Math.floor((clockNow - session.lastSeenAt) / 1000))
                : session.lastActive;
              const sleepSeconds = getSleepSeconds(session);
              const unhealthyThreshold = sleepSeconds * 1.5;
              const isUnhealthy = !isKilled && sleepSeconds > 0 && lastActive > unhealthyThreshold;
              const lastDisplay = formatLastActive(lastActive);

              return (
                <tr
                  key={session.id}
                  onClick={() => onSelectSession(session.id)}
                  onDoubleClick={() => !isKilled && onInteract(session)}
                  onContextMenu={(e) => handleContextMenu(e, session.id)}
                  title={isUnhealthy
                    ? `Session unhealthy: no callback for ${lastDisplay} (threshold ${formatLastActive(unhealthyThreshold)})`
                    : undefined}
                  className={`cursor-pointer transition-colors duration-75 ${
                    isKilled
                      ? "bg-[#1f1a1a] text-gray-500 line-through"
                      : isUnhealthy
                        ? "bg-[#5a2020] text-red-100 hover:bg-[#6b2828]"
                        : isSelected
                          ? "bg-[#385d8a] text-white"
                          : "hover:bg-[#343434] text-[#d0d0d0]"
                  }`}
                >
                  {/* type */}
                  <td className="px-2 py-0.5 border-r border-[#282828] text-center">
                    {getOsIcon()}
                  </td>

                  {/* session id */}
                  <td className="px-2 py-0.5 border-r border-[#282828]" title={session.id}>
                    {session.id}
                  </td>
                  
                  {/* ext... */}
                  <td className="px-2 py-0.5 border-r border-[#282828]">
                    {session.extIp}
                  </td>
                  
                  {/* i... */}
                  <td className="px-2 py-0.5 border-r border-[#282828]">
                    {session.intIp}
                  </td>
                  
                  {/* list... */}
                  <td className="px-2 py-0.5 border-r border-[#282828]">
                    {session.listener}
                  </td>
                  
                  {/* user */}
                  <td className="px-2 py-0.5 border-r border-[#282828]">
                    {session.user}
                  </td>
                  
                  {/* co... */}
                  <td className="px-2 py-0.5 border-r border-[#282828]">
                    {session.computer}
                  </td>
                  
                  {/* note */}
                  <td className="px-2 py-0.5 border-r border-[#282828] truncate">
                    {editingNoteId === session.id ? (
                      <div className="flex items-center space-x-1" onClick={e => e.stopPropagation()}>
                        <input
                          type="text"
                          value={noteValue}
                          onChange={(e) => setNoteValue(e.target.value)}
                          onKeyDown={(e) => e.key === "Enter" && saveNote(session.id)}
                          className="bg-[#181818] border border-[#555] text-white text-[11px] px-1 py-0.5 rounded outline-none w-full"
                          autoFocus
                        />
                        <button 
                          onClick={() => saveNote(session.id)} 
                          className="text-[10px] bg-[#454545] text-white px-1 py-0.5 rounded cursor-pointer"
                        >
                          Save
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between w-full group">
                        <span>{session.note || ""}</span>
                        {!isKilled && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              startEditingNote(session);
                            }}
                            className="hidden group-hover:inline-block text-gray-400 hover:text-white cursor-pointer ml-1"
                            title="Edit Note"
                          >
                            <Edit3 className="w-3 h-3 text-gray-400" />
                          </button>
                        )}
                      </div>
                    )}
                  </td>
                  
                  {/* pro... */}
                  <td className="px-2 py-0.5 border-r border-[#282828]">
                    {session.process}
                  </td>
                  
                  {/* pid */}
                  <td className="px-2 py-0.5 border-r border-[#282828]">
                    {session.pid}
                  </td>
                  
                  {/* arch */}
                  <td className="px-2 py-0.5 border-r border-[#282828]">
                    {session.arch}
                  </td>
                  
                  {/* last */}
                  <td className={`px-2 py-0.5 border-r border-[#282828] font-bold ${
                    isUnhealthy ? "text-red-100" : "text-white"
                  }`}>
                    {lastDisplay}
                  </td>
                  
                  {/* sleep */}
                  <td className="px-2 py-0.5">
                    {session.sleep}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Context Menu Overlay - All icons uniform text-gray-400 */}
      {contextMenu && (
        <div
          style={{ top: contextMenu.y - 10, left: contextMenu.x + 5 }}
          className="fixed bg-[#252628] border border-[#3E4042] text-[#E0E0E0] rounded shadow-2xl z-50 py-1 w-52 text-xs font-sans divide-y divide-[#323438]"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Section 1: Interaction */}
          <div className="py-1">
            <button
              disabled={contextSession?.status === "killed"}
              onClick={() => {
                if (contextSession && contextSession.status !== "killed") onInteract(contextSession);
                setContextMenu(null);
              }}
              className="w-full text-left px-3 py-1.5 hover:bg-[#3D4044] hover:text-white flex items-center space-x-2 cursor-pointer disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
            >
              <Terminal className="w-3.5 h-3.5 text-gray-400" />
              <span>Interact (Terminal)</span>
            </button>
          </div>

          {/* Session-local presentation actions */}
          <div className="py-1">
            <button
              onClick={() => {
                const b = sessions.find(x => x.id === contextMenu.sessionId);
                if (b) startEditingNote(b);
                setContextMenu(null);
              }}
              className="w-full text-left px-3 py-1.5 hover:bg-[#3D4044] hover:text-white flex items-center space-x-2 cursor-pointer"
            >
              <Edit3 className="w-3.5 h-3.5 text-gray-400" />
              <span>Add custom note...</span>
            </button>
          </div>

          {/* Kill/Delete */}
          <div className="py-1">
            <button
              disabled={contextSession?.status === "killed"}
              onClick={() => {
                onKill(contextMenu.sessionId);
                setContextMenu(null);
              }}
              className="w-full text-left px-3 py-1.5 hover:bg-[#3D4044] hover:text-white flex items-center space-x-2 text-gray-300 cursor-pointer disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
            >
              <Trash2 className="w-3.5 h-3.5 text-gray-400" />
              <span>Kill Session</span>
            </button>
            <button
              onClick={() => {
                onDelete(contextMenu.sessionId);
                setContextMenu(null);
              }}
              className="w-full text-left px-3 py-1.5 hover:bg-red-950 hover:text-red-100 flex items-center space-x-2 text-red-300 cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5 text-red-400" />
              <span>Delete Session</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
