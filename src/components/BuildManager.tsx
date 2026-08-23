import React, { useEffect, useState } from "react";
import { TeamBuild } from "../api/teamApi";

interface BuildManagerProps {
  isOpen: boolean;
  onClose: () => void;
  onList: () => Promise<TeamBuild[]>;
  onDelete: (id: string) => Promise<TeamBuild>;
  onDownload: (build: TeamBuild) => Promise<void>;
}

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
  const [isLoading, setIsLoading] = useState(false);
  const [actionID, setActionID] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const refresh = async () => {
    setIsLoading(true);
    setError("");
    try {
      const items = await onList();
      setBuilds([...items].sort((left, right) => {
        const difference = Date.parse(right.created_at) - Date.parse(left.created_at);
        return Number.isNaN(difference) || difference === 0 ? left.id.localeCompare(right.id) : difference;
      }));
    } catch (refreshError) {
      setError(refreshError instanceof Error ? refreshError.message : String(refreshError));
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) void refresh();
  }, [isOpen]);

  if (!isOpen) return null;

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
      setBuilds(current => current.filter(item => item.id !== deleted.id));
      setNotice(`Build ${deleted.id} deleted.`);
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : String(deleteError));
    } finally {
      setActionID("");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 font-sans text-xs text-gray-300">
      <div className="flex max-h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded border border-[#3E4044] bg-[#242528] shadow-2xl">
        <header className="flex items-center justify-between border-b border-[#3E4044] bg-[#1C1D1F] px-4 py-3">
          <div>
            <h2 className="font-bold text-gray-100">TeamServer Builds</h2>
            <p className="mt-0.5 text-[10px] text-gray-500">Download artifacts and remove completed or failed build history.</p>
          </div>
          <button type="button" onClick={onClose} className="cursor-pointer rounded px-2 py-1 text-gray-400 hover:bg-[#333] hover:text-white">Close</button>
        </header>

        <div className="flex min-h-0 flex-1 flex-col p-4">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-gray-500">{builds.length} build{builds.length === 1 ? "" : "s"}</span>
            <button
              type="button"
              onClick={() => void refresh()}
              disabled={isLoading || Boolean(actionID)}
              className="cursor-pointer rounded border border-[#444] px-3 py-1.5 text-gray-300 hover:bg-[#333] hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isLoading ? "Refreshing…" : "Refresh"}
            </button>
          </div>

          {error && <p className="mb-3 rounded border border-red-900/70 bg-red-950/30 p-2 text-red-300">{error}</p>}
          {notice && <p className="mb-3 rounded border border-emerald-900/70 bg-emerald-950/20 p-2 text-emerald-300">{notice}</p>}

          <div className="min-h-0 flex-1 overflow-auto rounded border border-[#333] bg-[#18191B]">
            <table className="w-full min-w-[1050px] border-collapse text-left">
              <thead className="sticky top-0 z-10 bg-[#292A2D] text-[10px] uppercase text-gray-500">
                <tr>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Profile</th>
                  <th className="px-3 py-2">Artifact</th>
                  <th className="px-3 py-2">Created</th>
                  <th className="px-3 py-2">Completed</th>
                  <th className="px-3 py-2">Build ID</th>
                  <th className="px-3 py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#303236]">
                {builds.map(build => {
                  const status = build.status.toLowerCase();
                  const isActive = activeStatuses.has(status);
                  const canDownload = status === "completed" && Boolean(build.download_url);
                  return (
                    <tr key={build.id} className="align-top hover:bg-[#222326]">
                      <td className="px-3 py-2.5">
                        <span className={`inline-block rounded border px-2 py-0.5 font-bold uppercase ${statusClass(status)}`}>{build.status}</span>
                        {build.error && <span className="mt-1 block max-w-56 break-words text-[10px] text-red-300">{build.error}</span>}
                      </td>
                      <td className="px-3 py-2.5 text-gray-200">{build.profile}</td>
                      <td className="select-text px-3 py-2.5 font-mono text-gray-300">{build.artifact_name || "—"}</td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-gray-400">{formatDate(build.created_at)}</td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-gray-400">{formatDate(build.completed_at)}</td>
                      <td className="select-text px-3 py-2.5 font-mono text-[10px] text-gray-500">{build.id}</td>
                      <td className="px-3 py-2.5">
                        <div className="flex justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => void download(build)}
                            disabled={!canDownload || Boolean(actionID)}
                            className="cursor-pointer rounded border border-[#465b78] px-2 py-1 text-blue-200 hover:bg-[#29384c] disabled:cursor-not-allowed disabled:opacity-40"
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
              </tbody>
            </table>

            {!isLoading && builds.length === 0 && (
              <div className="flex min-h-52 items-center justify-center text-gray-600">No builds found on the TeamServer.</div>
            )}
            {isLoading && builds.length === 0 && (
              <div className="flex min-h-52 items-center justify-center text-gray-600">Loading builds…</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
