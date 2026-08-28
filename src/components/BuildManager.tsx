import React, { useEffect, useMemo, useRef, useState } from "react";
import { TeamBuild } from "../api/teamApi";
import {
  CompactButton,
  CompactInput,
  CompactScrollbar,
  CompactSelect,
  DataGrid,
  DesktopModal,
  StatusBar
} from "./desktop";

interface BuildManagerProps {
  builds: TeamBuild[];
  isOpen: boolean;
  onClose: () => void;
  onList: () => Promise<TeamBuild[]>;
  onDelete: (id: string) => Promise<TeamBuild>;
  onDownload: (build: TeamBuild) => Promise<void>;
}

type BuildColumnKey = "status" | "profile" | "builder" | "artifact" | "created" | "completed" | "id" | "actions";

const buildColumns: Array<{ key: BuildColumnKey; label: string }> = [
  { key: "status", label: "Status" },
  { key: "profile", label: "Profile" },
  { key: "builder", label: "Builder" },
  { key: "artifact", label: "Artifact" },
  { key: "created", label: "Created" },
  { key: "completed", label: "Completed" },
  { key: "id", label: "Build ID" },
  { key: "actions", label: "Actions" }
];

const initialColumnWidths: Record<BuildColumnKey, number> = {
  status: 125,
  profile: 145,
  builder: 145,
  artifact: 190,
  created: 175,
  completed: 175,
  id: 280,
  actions: 175
};

const minimumColumnWidths: Record<BuildColumnKey, number> = {
  status: 100,
  profile: 90,
  builder: 100,
  artifact: 120,
  created: 135,
  completed: 135,
  id: 160,
  actions: 145
};

const activeStatuses = new Set(["queued", "running"]);

const formatDate = (value?: string) => {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime()) || date.getUTCFullYear() <= 1) return "—";
  return date.toLocaleString();
};

const statusClass = (status: string) => {
  switch (status.toLowerCase()) {
    case "completed":
      return "is-completed";
    case "failed":
      return "is-failed";
    case "running":
      return "is-running";
    default:
      return "is-queued";
  }
};

export const BuildManager: React.FC<BuildManagerProps> = ({
  builds,
  isOpen,
  onClose,
  onList,
  onDelete,
  onDownload
}) => {
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [columnWidths, setColumnWidths] = useState(initialColumnWidths);
  const [isLoading, setIsLoading] = useState(false);
  const [actionID, setActionID] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const refreshInFlightRef = useRef(false);
  const activeColumnResize = useRef<{
    key: BuildColumnKey;
    startX: number;
    startWidth: number;
  } | null>(null);

  const refresh = async (background = false) => {
    if (refreshInFlightRef.current) return;
    refreshInFlightRef.current = true;
    if (!background) {
      setIsLoading(true);
      setError("");
      setNotice("");
    }
    try {
      await onList();
      if (background) setError("");
    } catch (refreshError) {
      setError(refreshError instanceof Error ? refreshError.message : String(refreshError));
    } finally {
      refreshInFlightRef.current = false;
      if (!background) setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) void refresh();
  }, [isOpen]);

  const filteredBuilds = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return builds.filter(build => {
      const status = build.status.toLowerCase();
      if (statusFilter !== "all" && status !== statusFilter) return false;
      if (!normalizedQuery) return true;
      return [build.id, build.profile, build.builder || "", build.artifact_name || "", build.error || "", build.status]
        .some(value => value.toLowerCase().includes(normalizedQuery));
    });
  }, [builds, query, statusFilter]);

  const hasActiveBuilds = builds.some(build => activeStatuses.has(build.status.toLowerCase()));

  if (!isOpen) return null;

  const updateColumnWidth = (key: BuildColumnKey, width: number) => {
    const nextWidth = Math.min(650, Math.max(minimumColumnWidths[key], width));
    setColumnWidths(current => ({ ...current, [key]: nextWidth }));
  };

  const renderResizeHandle = (key: BuildColumnKey, label: string) => (
    <span
      role="separator"
      aria-label={`Resize ${label} column`}
      aria-orientation="vertical"
      aria-valuemin={minimumColumnWidths[key]}
      aria-valuemax={650}
      aria-valuenow={Math.round(columnWidths[key])}
      tabIndex={0}
      title={`Drag to resize ${label}. Double-click to reset.`}
      onDoubleClick={event => {
        event.stopPropagation();
        updateColumnWidth(key, initialColumnWidths[key]);
      }}
      onPointerDown={event => {
        event.preventDefault();
        event.stopPropagation();
        activeColumnResize.current = { key, startX: event.clientX, startWidth: columnWidths[key] };
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerMove={event => {
        const activeResize = activeColumnResize.current;
        if (!activeResize || activeResize.key !== key) return;
        updateColumnWidth(key, activeResize.startWidth + event.clientX - activeResize.startX);
      }}
      onPointerUp={event => {
        activeColumnResize.current = null;
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
          event.currentTarget.releasePointerCapture(event.pointerId);
        }
      }}
      onPointerCancel={() => {
        activeColumnResize.current = null;
      }}
      onKeyDown={event => {
        if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
        event.preventDefault();
        updateColumnWidth(key, columnWidths[key] + (event.key === "ArrowRight" ? 12 : -12));
      }}
      className="build-column-resizer"
    />
  );

  const download = async (build: TeamBuild) => {
    setActionID(`download:${build.id}`);
    setError("");
    setNotice("");
    try {
      await onDownload(build);
      setNotice(`Artifact download started: ${build.artifact_name || build.id}`);
    } catch (downloadError) {
      setError(downloadError instanceof Error ? downloadError.message : String(downloadError));
    } finally {
      setActionID("");
    }
  };

  const deleteBuild = async (build: TeamBuild) => {
    setActionID(`delete:${build.id}`);
    setError("");
    setNotice("");
    try {
      const deleted = await onDelete(build.id);
      setNotice(`Build ${deleted.id} deleted.`);
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : String(deleteError));
    } finally {
      setActionID("");
    }
  };

  const tableWidth = buildColumns.reduce((total, column) => total + columnWidths[column.key], 0);

  return (
    <DesktopModal
      title="TeamServer Builds"
      subtitle="Download artifacts and manage build history"
      onClose={onClose}
      width="900px"
    >
        <div className="build-manager-layout">
          <div className="build-toolbar">
            <CompactInput
              type="search"
              value={query}
              onChange={event => setQuery(event.target.value)}
              placeholder="Search ID, profile, builder, artifact or error"
              aria-label="Search builds"
              className="build-search"
            />
            <CompactSelect
              value={statusFilter}
              onChange={event => setStatusFilter(event.target.value)}
              aria-label="Filter builds by status"
              className="build-status-filter"
            >
              <option value="all">All statuses</option>
              <option value="queued">Queued</option>
              <option value="running">Running</option>
              <option value="completed">Completed</option>
              <option value="failed">Failed</option>
            </CompactSelect>
            <CompactButton
              type="button"
              onClick={() => void refresh()}
              disabled={isLoading || Boolean(actionID)}
            >
              {isLoading ? "Refreshing…" : "Refresh"}
            </CompactButton>
          </div>

          <StatusBar className="build-status-bar">
            <span>Showing {filteredBuilds.length} of {builds.length}</span>
            {hasActiveBuilds && <span className="active-build-indicator">Following live TeamServer build events</span>}
          </StatusBar>

          {error && <p role="alert" className="desktop-alert desktop-alert--error">{error}</p>}
          {notice && <p className="desktop-alert desktop-alert--success">{notice}</p>}

          <CompactScrollbar className="build-grid-scroll">
            <DataGrid aria-label="TeamServer builds" style={{ width: `max(100%, ${tableWidth}px)` }}>
              <colgroup>
                {buildColumns.map(column => <col key={column.key} style={{ width: columnWidths[column.key] }} />)}
              </colgroup>
              <thead>
                <tr>
                  {buildColumns.map(column => (
                    <th
                      key={column.key}
                      className={`relative select-none ${column.key === "actions" ? "text-right" : ""}`}
                    >
                      {column.label}
                      {renderResizeHandle(column.key, column.label)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredBuilds.map(build => {
                  const status = build.status.toLowerCase();
                  const isActive = activeStatuses.has(status);
                  const canDownload = status === "completed" && Boolean(build.download_url);
                  return (
                    <tr key={build.id}>
                      <td>
                        <span className={`build-status ${statusClass(status)}`}>{build.status}</span>
                        {build.error && <span title={build.error} className="build-error-text">{build.error}</span>}
                      </td>
                      <td title={build.profile}>{build.profile}</td>
                      <td title={build.builder}>{build.builder || "—"}</td>
                      <td title={build.artifact_name} className="select-text">{build.artifact_name || "—"}</td>
                      <td title={build.created_at}>{formatDate(build.created_at)}</td>
                      <td title={build.completed_at}>{formatDate(build.completed_at)}</td>
                      <td title={build.id} className="select-text text-[10px] text-gray-500">{build.id}</td>
                      <td>
                        <div className="grid-actions">
                          <CompactButton
                            type="button"
                            onClick={() => void download(build)}
                            disabled={!canDownload || Boolean(actionID)}
                            variant="secondary"
                          >
                            {actionID === `download:${build.id}` ? "Downloading…" : "Download"}
                          </CompactButton>
                          <CompactButton
                            type="button"
                            onClick={() => void deleteBuild(build)}
                            disabled={isActive || Boolean(actionID)}
                            title={isActive ? "Queued and running builds cannot be deleted." : "Delete build and its managed artifact"}
                            variant="danger"
                          >
                            {actionID === `delete:${build.id}` ? "Deleting…" : "Delete"}
                          </CompactButton>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {!isLoading && filteredBuilds.length === 0 && (
                  <tr>
                    <td colSpan={buildColumns.length} className="empty-grid-cell">
                      {builds.length === 0 ? "No builds found on the TeamServer." : "No builds match the current filters."}
                    </td>
                  </tr>
                )}
                {isLoading && builds.length === 0 && (
                  <tr><td colSpan={buildColumns.length} className="empty-grid-cell">Loading builds…</td></tr>
                )}
              </tbody>
            </DataGrid>
          </CompactScrollbar>
        </div>
    </DesktopModal>
  );
};
