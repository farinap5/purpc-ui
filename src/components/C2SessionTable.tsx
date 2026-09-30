import React, { useState, useEffect, useLayoutEffect, useRef } from "react";
import { Session } from "../types";
import { MAX_SESSION_NOTE_BYTES } from "../api/teamApi";
import { 
  Terminal,
  ChevronRight,
  Palette,
  Trash2, 
  Edit3, 
  Monitor,
  Server
} from "lucide-react";
import {
  CompactButton,
  CompactIconButton,
  CompactInput,
  CompactScrollbar,
  DataGrid,
  DesktopPanel,
  StatusBar
} from "./desktop";

interface SessionTableProps {
  sessions: Session[];
  selectedSessionId: string | null;
  onSelectSession: (id: string) => void;
  onInteract: (session: Session) => void;
  onUpdateNote: (id: string, note: string) => Promise<void>;
  onUpdateColor: (id: string, color: string) => Promise<void>;
  onKill: (id: string) => void;
  onDelete: (id: string) => void;
}

type SessionColumnKey =
  | "type"
  | "id"
  | "extIp"
  | "intIp"
  | "listener"
  | "transport"
  | "association"
  | "liveness"
  | "user"
  | "computer"
  | "note"
  | "process"
  | "pid"
  | "arch"
  | "last"
  | "sleep";

const sessionColumns: Array<{ key: SessionColumnKey; label: string; accessibleLabel: string }> = [
  { key: "type", label: "", accessibleLabel: "Session transport" },
  { key: "id", label: "Session ID", accessibleLabel: "Session ID" },
  { key: "extIp", label: "Socket", accessibleLabel: "Remote socket" },
  { key: "intIp", label: "UUID", accessibleLabel: "Session UUID" },
  { key: "listener", label: "Payload", accessibleLabel: "Payload type" },
  { key: "transport", label: "Transport", accessibleLabel: "Transport type" },
  { key: "association", label: "Association", accessibleLabel: "Listener or speaker association" },
  { key: "liveness", label: "Liveness", accessibleLabel: "Session liveness" },
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
  transport: 85,
  association: 150,
  liveness: 90,
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
  transport: 70,
  association: 100,
  liveness: 75,
  user: 80,
  computer: 100,
  note: 140,
  process: 90,
  pid: 55,
  arch: 55,
  last: 55,
  sleep: 90
};

const sessionColorOptions = [
  { label: "Forest", value: "#4f8a62" },
  { label: "Teal", value: "#4f8a8a" },
  { label: "Ochre", value: "#a6843d" },
  { label: "Copper", value: "#a5653f" },
  { label: "Olive", value: "#7c8448" },
  { label: "Graphite", value: "#777d89" }
] as const;

const utf8ByteLength = (value: string) => new TextEncoder().encode(value).byteLength;

const errorMessage = (error: unknown) => error instanceof Error ? error.message : String(error);

const formatLastActive = (value: number) => {
  const totalSeconds = Math.max(0, Math.floor(value));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
};

export const C2SessionTable: React.FC<SessionTableProps> = ({
  sessions,
  selectedSessionId,
  onSelectSession,
  onInteract,
  onUpdateNote,
  onUpdateColor,
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
  const [pendingAnnotation, setPendingAnnotation] = useState<string | null>(null);
  const [annotationError, setAnnotationError] = useState("");
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
    setAnnotationError("");
    onSelectSession(sessionId);
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      sessionId
    });
  };

  const startEditingNote = (session: Session) => {
    setAnnotationError("");
    setEditingNoteId(session.id);
    setNoteValue(session.note);
  };

  const saveNote = async (id: string) => {
    if (utf8ByteLength(noteValue) > MAX_SESSION_NOTE_BYTES) {
      setAnnotationError("Notes may not exceed " + MAX_SESSION_NOTE_BYTES + " UTF-8 bytes.");
      return;
    }

    setPendingAnnotation("note:" + id);
    setAnnotationError("");
    try {
      await onUpdateNote(id, noteValue);
      setEditingNoteId(null);
    } catch (error) {
      setAnnotationError("Unable to save note: " + errorMessage(error));
    } finally {
      setPendingAnnotation(null);
    }
  };

  const updateColor = async (id: string, color: string) => {
    setPendingAnnotation("color:" + id);
    setAnnotationError("");
    try {
      await onUpdateColor(id, color);
      setContextMenu(null);
    } catch (error) {
      setAnnotationError("Unable to save color: " + errorMessage(error));
    } finally {
      setPendingAnnotation(null);
    }
  };

  const getSessionIcon = (session: Session) => {
    const Icon = session.transport === "speaker" ? Server : Monitor;
    const label = session.transport === "speaker" ? "Speaker session" : "Listener session";

    return <Icon aria-label={label} className="w-3.5 h-3.5 text-gray-400 inline-block" />;
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
              const isUnhealthy = !isKilled && session.liveness === "unavailable";
              const isLivenessUnknown = !isKilled && session.liveness === "unknown";
              const lastDisplay = formatLastActive(lastActive);
              const hasCustomColor = session.color.trim().length > 0;

              return (
                <tr
                  key={session.id}
                  onClick={() => onSelectSession(session.id)}
                  onDoubleClick={() => !isKilled && onInteract(session)}
                  onContextMenu={(e) => handleContextMenu(e, session.id)}
                  aria-selected={isSelected}
                  style={hasCustomColor ? ({ "--session-row-color": session.color } as React.CSSProperties) : undefined}
                  title={isUnhealthy
                    ? `Session liveness is unavailable; last protocol exchange was ${lastDisplay} ago.`
                    : isLivenessUnknown
                      ? "Session liveness is unknown because background speaker health monitoring is disabled. Task delivery remains enabled."
                      : undefined}
                  className={`session-row ${hasCustomColor ? "has-custom-color" : ""} ${
                    isKilled
                      ? "is-killed"
                      : isUnhealthy
                        ? "is-unhealthy"
                        : isLivenessUnknown
                          ? "is-liveness-unknown"
                        : isSelected
                          ? "is-selected"
                          : ""
                  }`}
                >
                  {/* type */}
                  <td className="px-2 py-0.5 border-r border-[#282828] text-center">
                    {getSessionIcon(session)}
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

                  <td className="px-2 py-0.5 border-r border-[#282828]">
                    {session.transport}
                  </td>

                  <td className="px-2 py-0.5 border-r border-[#282828]" title={session.transportUUID || undefined}>
                    {session.transportName}
                  </td>

                  <td className={`px-2 py-0.5 border-r border-[#282828] session-liveness is-${session.liveness}`}>
                    {session.liveness}
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
                          onKeyDown={(e) => {
                            if (e.key === "Enter") void saveNote(session.id);
                            if (e.key === "Escape") setEditingNoteId(null);
                          }}
                          disabled={pendingAnnotation === "note:" + session.id}
                          maxLength={MAX_SESSION_NOTE_BYTES}
                          className="session-note-input"
                          autoFocus
                        />
                        <CompactButton
                          type="button"
                          disabled={pendingAnnotation === "note:" + session.id}
                          onClick={() => void saveNote(session.id)}
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

      {/* Context Menu */}
      {contextMenu && (
        <div
          style={{ top: contextMenu.y - 10, left: contextMenu.x + 5 }}
          className="session-context-menu"
          onClick={(e) => e.stopPropagation()}
        >
          <div>
            <CompactButton
              type="button"
              variant="ghost"
              disabled={contextSession?.status === "killed"}
              onClick={() => {
                if (contextSession && contextSession.status !== "killed") onInteract(contextSession);
                setContextMenu(null);
              }}
              className="session-context-action"
            >
              <Terminal className="w-3.5 h-3.5 text-gray-400" />
              <span>Interact (Terminal)</span>
            </CompactButton>
          </div>

          <div>
            <CompactButton
              type="button"
              variant="ghost"
              onClick={() => {
                if (contextSession) startEditingNote(contextSession);
                setContextMenu(null);
              }}
              className="session-context-action"
            >
              <Edit3 className="w-3.5 h-3.5 text-gray-400" />
              <span>Add custom note...</span>
            </CompactButton>
          </div>

          <div className="session-context-submenu-root">
            <CompactButton
              type="button"
              variant="ghost"
              className="session-context-action"
              aria-haspopup="menu"
              disabled={pendingAnnotation === "color:" + contextMenu.sessionId}
            >
              <Palette className="w-3.5 h-3.5 text-gray-400" />
              <span>Color</span>
              <ChevronRight className="session-context-submenu-arrow" />
            </CompactButton>

            <div
              className={"session-context-menu session-color-submenu" + (
                contextMenu.x + 445 > window.innerWidth ? " is-left" : ""
              )}
              role="menu"
              aria-label="Session colors"
            >
              <div className="session-color-palette" role="group">
                {sessionColorOptions.map(option => (
                  <CompactButton
                    key={option.value}
                    type="button"
                    variant="ghost"
                    className="session-color-swatch"
                    style={{ "--session-color-swatch": option.value } as React.CSSProperties}
                    role="menuitemradio"
                    aria-label={"Set session color to " + option.label}
                    aria-checked={contextSession?.color === option.value}
                    title={option.label}
                    disabled={pendingAnnotation === "color:" + contextMenu.sessionId}
                    onClick={() => void updateColor(contextMenu.sessionId, option.value)}
                  >
                    <span className="session-color-chip" aria-hidden="true" />
                  </CompactButton>
                ))}
                <CompactButton
                  type="button"
                  variant="ghost"
                  className="session-color-clear"
                  role="menuitem"
                  disabled={!contextSession?.color || pendingAnnotation === "color:" + contextMenu.sessionId}
                  onClick={() => void updateColor(contextMenu.sessionId, "")}
                >
                  Clear
                </CompactButton>
              </div>
            </div>
          </div>

          <div>
            <CompactButton
              type="button"
              variant="ghost"
              disabled={contextSession?.status === "killed"}
              onClick={() => {
                onKill(contextMenu.sessionId);
                setContextMenu(null);
              }}
              className="session-context-action"
            >
              <Trash2 className="w-3.5 h-3.5 text-gray-400" />
              <span>Kill Session</span>
            </CompactButton>
            <CompactButton
              type="button"
              variant="danger"
              onClick={() => {
                onDelete(contextMenu.sessionId);
                setContextMenu(null);
              }}
              className="session-context-action is-danger"
            >
              <Trash2 className="w-3.5 h-3.5 text-red-400" />
              <span>Delete Session</span>
            </CompactButton>
          </div>
        </div>
      )}

      {annotationError ? (
        <StatusBar className="session-annotation-status">
          <span role="alert">{annotationError}</span>
        </StatusBar>
      ) : null}
    </DesktopPanel>
  );
};
