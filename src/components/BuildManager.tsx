import React, { useEffect, useMemo, useRef, useState } from "react";
import { TeamBuild } from "../api/teamApi";

interface BuildManagerProps {
  isOpen: boolean;
  onClose: () => void;
  onList: () => Promise<TeamBuild[]>;
  onDelete: (id: string) => Promise<TeamBuild>;
  onDownload: (build: TeamBuild) => Promise<void>;
}

type BuildColumnKey = "status" | "profile" | "artifact" | "created" | "completed" | "id" | "actions";

const buildColumns: Array<{ key: BuildColumnKey; label: string }> = [
  { key: "status", label: "Status" },
  { key: "profile", label: "Profile" },
  { key: "artifact", label: "Artifact" },
  { key: "created", label: "Created" },
  { key: "completed", label: "Completed" },
  { key: "id", label: "Build ID" },
  { key: "actions", label: "Actions" }
];

const initialColumnWidths: Record<BuildColumnKey, number> = {
  status: 125,
  profile: 145,
  artifact: 190,
  created: 175,
  completed: 175,
  id: 280,
  actions: 175
};

const minimumColumnWidths: Record<BuildColumnKey, number> = {
  status: 100,
  profile: 90,
  artifact: 120,
  created: 135,
  completed: 135,
  id: 160,
  actions: 145
};

const activeStatuses = new Set(["queued", "running"]);

const sortBuilds = (items: TeamBuild[]) => [...items].sort((left, right) => {
  const difference = Date.parse(right.created_at) - Date.parse(left.created_at);
  return Number.isNaN(difference) || difference === 0 ? left.id.localeCompare(right.id) : difference;
});

const formatDate = (value?: string) => {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime()) || date.getUTCFullYear() <= 1) return "—";
  return date.toLocaleString();
};

const statusClass = (status: string) => {
  switch (status.toLowerCase()) {
    case "completed":
      return "border-emerald-800 bg-emerald-950/40 text-emerald-300";
    case "failed":
      return "border-red-900 bg-red-950/40 text-red-300";
    case "running":
      return "border-violet-800 bg-violet-950/40 text-violet-300";
    default:
      return "border-amber-900 bg-amber-950/30 text-amber-300";
  }
};

export const BuildManager: React.FC<BuildManagerProps> = ({
  isOpen,
  onClose,
  onList,
  onDelete,
  onDownload
}) => {
  const [builds, setBuilds] = useState<TeamBuild[]>([]);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [columnWidths, setColumnWidths] = useState(initialColumnWidths);
  const [isLoading, setIsLoading] = useState(false);
  const [actionID, setActionID] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const buildsRef = useRef<TeamBuild[]>([]);
  const refreshInFlightRef = useRef(false);
  const activeColumnResize = useRef<{
    key: BuildColumnKey;
    startX: number;
    startWidth: number;
  } | null>(null);

  const replaceBuilds = (items: TeamBuild[]) => {
    const sorted = sortBuilds(items);
    buildsRef.current = sorted;
    setBuilds(sorted);
  };

  const refresh = async (background = false) => {
    if (refreshInFlightRef.current) return;
    refreshInFlightRef.current = true;
    if (!background) {
      setIsLoading(true);
      setError("");
      setNotice("");
    }
    try {
      replaceBuilds(await onList());
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

  useEffect(() => {
    if (!isOpen) return;
    const intervalID = window.setInterval(() => {
      if (buildsRef.current.some(build => activeStatuses.has(build.status.toLowerCase()))) {
        void refresh(true);
      }
    }, 1500);
    return () => window.clearInterval(intervalID);
  }, [isOpen]);

  const filteredBuilds = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return builds.filter(build => {
      const status = build.status.toLowerCase();
      if (statusFilter !== "all" && status !== statusFilter) return false;
      if (!normalizedQuery) return true;
      return [build.id, build.profile, build.artifact_name || "", build.error || "", build.status]
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
      className="absolute inset-y-0 right-0 w-2 translate-x-1 cursor-col-resize touch-none outline-none after:absolute after:inset-y-1 after:left-1/2 after:w-px after:bg-[#45474b] hover:after:bg-violet-400 focus:after:bg-violet-400"
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
      replaceBuilds(buildsRef.current.filter(item => item.id !== deleted.id));
      setNotice(`Build ${deleted.id} deleted.`);
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : String(deleteError));
    } finally {
      setActionID("");
    }
  };

  const tableWidth = buildColumns.reduce((total, column) => total + columnWidths[column.key], 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 font-sans text-xs text-gray-300">
      <div className="flex max-h-[94vh] w-full max-w-[96vw] flex-col overflow-hidden rounded border border-[#3E4044] bg-[#242528] shadow-2xl">
        <header className="flex items-center justify-between border-b border-[#3E4044] bg-[#1C1D1F] px-4 py-3">
          <div>
            <h2 className="font-bold text-gray-100">TeamServer Builds</h2>
            <p className="mt-0.5 text-[10px] text-gray-500">Download artifacts and remove completed or failed build history.</p>
          </div>
          <button type="button" onClick={onClose} className="cursor-pointer rounded px-2 py-1 text-gray-400 hover:bg-[#333] hover:text-white">Close</button>
        </header>

        <div className="flex min-h-0 flex-1 flex-col p-4">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <input
              type="search"
              value={query}
              onChange={event => setQuery(event.target.value)}
              placeholder="Search ID, profile, artifact or error"
              aria-label="Search builds"
              className="min-w-64 flex-1 rounded border border-[#444] bg-[#17181A] px-3 py-1.5 text-gray-200 outline-none transition placeholder:text-gray-600 focus:border-violet-400"
            />
            <select
              value={statusFilter}
              onChange={event => setStatusFilter(event.target.value)}
              aria-label="Filter builds by status"
              className="rounded border border-[#444] bg-[#17181A] px-3 py-1.5 text-gray-300 outline-none transition focus:border-violet-400"
            >
              <option value="all">All statuses</option>
              <option value="queued">Queued</option>
              <option value="running">Running</option>
              <option value="completed">Completed</option>
              <option value="failed">Failed</option>
            </select>
            <button
              type="button"
              onClick={() => void refresh()}
              disabled={isLoading || Boolean(actionID)}
              className="cursor-pointer rounded border border-[#444] px-3 py-1.5 text-gray-300 hover:bg-[#333] hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isLoading ? "Refreshing…" : "Refresh"}
            </button>
          </div>

          <div className="mb-2 flex min-h-4 items-center justify-between text-[10px] text-gray-500">
            <span>Showing {filteredBuilds.length} of {builds.length}</span>
            {hasActiveBuilds && <span className="text-violet-300">Auto-refreshing active builds every 1.5 seconds</span>}
          </div>

          {error && <p className="mb-3 rounded border border-red-900/70 bg-red-950/30 p-2 text-red-300">{error}</p>}
          {notice && <p className="mb-3 rounded border border-emerald-900/70 bg-emerald-950/20 p-2 text-emerald-300">{notice}</p>}

          <div className="min-h-0 flex-1 overflow-auto rounded border border-[#333] bg-[#18191B]">
            <table className="table-fixed border-collapse text-left" style={{ width: `max(100%, ${tableWidth}px)` }}>
              <colgroup>
                {buildColumns.map(column => <col key={column.key} style={{ width: columnWidths[column.key] }} />)}
              </colgroup>
              <thead className="sticky top-0 z-10 bg-[#292A2D] text-[10px] uppercase text-gray-500">
                <tr>
                  {buildColumns.map(column => (
                    <th
                      key={column.key}
                      className={`relative select-none px-3 py-2 ${column.key === "actions" ? "text-right" : ""}`}
                    >
                      {column.label}
                      {renderResizeHandle(column.key, column.label)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#303236]">
                {filteredBuilds.map(build => {
                  const status = build.status.toLowerCase();
                  const isActive = activeStatuses.has(status);
                  const canDownload = status === "completed" && Boolean(build.download_url);
                  return (
                    <tr key={build.id} className="align-middle hover:bg-[#222326]">
                      <td className="overflow-hidden px-3 py-2.5">
                        <span className={`inline-block rounded border px-2 py-0.5 font-bold uppercase ${statusClass(status)}`}>{build.status}</span>
                        {build.error && <span title={build.error} className="mt-1 block truncate text-[10px] text-red-300">{build.error}</span>}
                      </td>
                      <td title={build.profile} className="truncate px-3 py-2.5 text-gray-200">{build.profile}</td>
                      <td title={build.artifact_name} className="select-text truncate px-3 py-2.5 font-mono text-gray-300">{build.artifact_name || "—"}</td>
                      <td title={build.created_at} className="truncate px-3 py-2.5 text-gray-400">{formatDate(build.created_at)}</td>
                      <td title={build.completed_at} className="truncate px-3 py-2.5 text-gray-400">{formatDate(build.completed_at)}</td>
                      <td title={build.id} className="select-text truncate px-3 py-2.5 font-mono text-[10px] text-gray-500">{build.id}</td>
                      <td className="px-3 py-2.5">
                        <div className="flex justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => void download(build)}
                            disabled={!canDownload || Boolean(actionID)}
                            className="cursor-pointer rounded border border-violet-900 px-2 py-1 text-violet-200 hover:bg-violet-950/50 disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            {actionID === `download:${build.id}` ? "Downloading…" : "Download"}
                          </button>
                          <button
                            type="button"
                            onClick={() => void deleteBuild(build)}
                            disabled={isActive || Boolean(actionID)}
                            title={isActive ? "Queued and running builds cannot be deleted." : "Delete build and its managed artifact"}
                            className="cursor-pointer rounded border border-red-900 px-2 py-1 text-red-300 hover:bg-red-950/50 disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            {actionID === `delete:${build.id}` ? "Deleting…" : "Delete"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {!isLoading && filteredBuilds.length === 0 && (
                  <tr>
                    <td colSpan={buildColumns.length} className="h-52 text-center text-gray-600">
                      {builds.length === 0 ? "No builds found on the TeamServer." : "No builds match the current filters."}
                    </td>
                  </tr>
                )}
                {isLoading && builds.length === 0 && (
                  <tr><td colSpan={buildColumns.length} className="h-52 text-center text-gray-600">Loading builds…</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};
