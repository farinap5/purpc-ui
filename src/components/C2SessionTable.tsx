import React, { useState, useEffect, useLayoutEffect, useRef } from "react";
import { Session } from "../types";
import { 
  Terminal, 
  Trash2, 
  Edit3, 
  Monitor
} from "lucide-react";
import {
  CompactButton,
  CompactIconButton,
  CompactInput,
  CompactScrollbar,
  DataGrid,
  DesktopPanel
} from "./desktop";

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
      className="session-column-resizer"
    >
      <span />
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
    <DesktopPanel className="session-grid-panel">
      <CompactScrollbar ref={tableContainerRef} className="session-grid-scroll">
        <DataGrid
          aria-label="TeamServer sessions"
          className="session-grid"
          style={{ width: `${tableWidth}px` }}
        >
          <colgroup>
            {sessionColumns.map(column => (
              <col key={column.key} style={{ width: `${columnWidths[column.key]}px` }} />
            ))}
          </colgroup>
          <thead>
            <tr>
              {sessionColumns.map((column) => (
                <th
                  key={column.key}
                  className={`${column.key === "type" ? "text-center" : ""}`}
                >
                  <span className="block overflow-hidden text-ellipsis">{column.label}</span>
                  {renderColumnResizeHandle(column.key, column.accessibleLabel)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
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
                  aria-selected={isSelected}
                  title={isUnhealthy
                    ? `Session unhealthy: no callback for ${lastDisplay} (threshold ${formatLastActive(unhealthyThreshold)})`
                    : undefined}
                  className={`session-row ${
                    isKilled
                      ? "is-killed"
                      : isUnhealthy
                        ? "is-unhealthy"
                        : isSelected
                          ? "is-selected"
                          : ""
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
                        <CompactInput
                          type="text"
                          value={noteValue}
                          onChange={(e) => setNoteValue(e.target.value)}
                          onKeyDown={(e) => e.key === "Enter" && saveNote(session.id)}
                          className="session-note-input"
                          autoFocus
                        />
                        <CompactButton
                          onClick={() => saveNote(session.id)} 
                        >
                          Save
                        </CompactButton>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between w-full group">
                        <span>{session.note || ""}</span>
                        {!isKilled && (
                          <CompactIconButton
                            onClick={(e) => {
                              e.stopPropagation();
                              startEditingNote(session);
                            }}
                            className="session-note-edit hidden group-hover:inline-flex"
                            title="Edit Note"
                            aria-label={`Edit note for ${session.id}`}
                          >
                            <Edit3 />
                          </CompactIconButton>
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
        </DataGrid>
      </CompactScrollbar>

      {/* Context Menu Overlay - All icons uniform text-gray-400 */}
      {contextMenu && (
        <div
          style={{ top: contextMenu.y - 10, left: contextMenu.x + 5 }}
          className="session-context-menu"
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
              className="session-context-action"
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
              className="session-context-action"
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
              className="session-context-action"
            >
              <Trash2 className="w-3.5 h-3.5 text-gray-400" />
              <span>Kill Session</span>
            </button>
            <button
              onClick={() => {
                onDelete(contextMenu.sessionId);
                setContextMenu(null);
              }}
              className="session-context-action is-danger"
            >
              <Trash2 className="w-3.5 h-3.5 text-red-400" />
              <span>Delete Session</span>
            </button>
          </div>
        </div>
      )}
    </DesktopPanel>
  );
};
