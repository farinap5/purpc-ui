import React, { useEffect, useMemo, useRef, useState } from "react";
import { TeamBuild, TeamBuildOutput, TeamPayloadBuilder, TeamProfile } from "../api/teamApi";

interface PayloadGeneratorProps {
  profiles: TeamProfile[];
  payloadBuilders: TeamPayloadBuilder[];
  builds: TeamBuild[];
  buildOutputByID: Record<string, TeamBuildOutput[]>;
  isOpen: boolean;
  onClose: () => void;
  onRefreshPayloadBuilders: () => Promise<TeamPayloadBuilder[]>;
  onCreateBuild: (profile: string, builder: string) => Promise<TeamBuild>;
  onDownloadBuild: (build: TeamBuild) => Promise<void>;
}

const activeBuildStatuses = new Set(["queued", "running"]);

export const PayloadGenerator: React.FC<PayloadGeneratorProps> = ({
  profiles,
  payloadBuilders,
  builds,
  buildOutputByID,
  isOpen,
  onClose,
  onRefreshPayloadBuilders,
  onCreateBuild,
  onDownloadBuild
}) => {
  const [selectedProfile, setSelectedProfile] = useState("");
  const [selectedBuilder, setSelectedBuilder] = useState("");
  const [buildID, setBuildID] = useState("");
  const [logs, setLogs] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [isRefreshingBuilders, setIsRefreshingBuilders] = useState(false);
  const [error, setError] = useState("");
  const previousStatusRef = useRef("");
  const outputPanelRef = useRef<HTMLDivElement | null>(null);

  const build = useMemo(
    () => builds.find(item => item.id === buildID) || null,
    [buildID, builds]
  );
  const buildOutput = buildID ? buildOutputByID[buildID] || [] : [];
  const isBuilding = isSubmitting || Boolean(build && activeBuildStatuses.has(build.status.toLowerCase()));

  useEffect(() => {
    if (!profiles.some(profile => profile.name === selectedProfile)) {
      setSelectedProfile(profiles[0]?.name || "");
    }
  }, [profiles, selectedProfile]);

  useEffect(() => {
    if (!payloadBuilders.some(builder => builder.name === selectedBuilder)) {
      setSelectedBuilder(payloadBuilders[0]?.name || "");
    }
  }, [payloadBuilders, selectedBuilder]);

  useEffect(() => {
    if (!isOpen) return;
    setIsRefreshingBuilders(true);
    void onRefreshPayloadBuilders()
      .catch(refreshError => setError(refreshError instanceof Error ? refreshError.message : String(refreshError)))
      .finally(() => setIsRefreshingBuilders(false));
  }, [isOpen]);

  useEffect(() => {
    if (!build) return;
    const status = build.status.toLowerCase();
    if (previousStatusRef.current && previousStatusRef.current !== status) {
      setLogs(previous => [...previous, `Status changed: ${previousStatusRef.current} → ${status}`]);
    }
    if (previousStatusRef.current !== status && status === "completed") {
      setLogs(previous => [...previous, `Artifact ready: ${build.artifact_name || "unnamed artifact"}`]);
    } else if (previousStatusRef.current !== status && status === "failed") {
      setError(build.error || "TeamServer build failed.");
    }
    previousStatusRef.current = status;
  }, [build]);

  useEffect(() => {
    const panel = outputPanelRef.current;
    if (panel) panel.scrollTop = panel.scrollHeight;
  }, [buildOutput.length, logs.length]);

  if (!isOpen) return null;

  const activeProfile = profiles.find(profile => profile.name === selectedProfile);
  const activeBuilder = payloadBuilders.find(builder => builder.name === selectedBuilder);

  const handleBuild = async () => {
    if (!selectedProfile || !selectedBuilder || isBuilding) return;
    setError("");
    setBuildID("");
    previousStatusRef.current = "";
    setLogs([`Requesting ${selectedBuilder} build for profile ${selectedProfile}…`]);
    setIsSubmitting(true);

    try {
      const created = await onCreateBuild(selectedProfile, selectedBuilder);
      setBuildID(created.id);
      previousStatusRef.current = created.status.toLowerCase();
      setLogs(previous => [...previous, `Build ${created.id} accepted with status ${created.status}.`]);
      if (created.status.toLowerCase() === "failed") setError(created.error || "TeamServer build failed.");
      if (created.status.toLowerCase() === "completed") {
        setLogs(previous => [...previous, `Artifact ready: ${created.artifact_name || "unnamed artifact"}`]);
      }
    } catch (buildError) {
      const message = buildError instanceof Error ? buildError.message : String(buildError);
      setError(message);
      setLogs(previous => [...previous, `ERROR: ${message}`]);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDownload = async () => {
    if (!build?.download_url || isDownloading) return;
    setError("");
    setIsDownloading(true);
    try {
      await onDownloadBuild(build);
      setLogs(previous => [...previous, `Artifact download started: ${build.artifact_name || build.id}`]);
    } catch (downloadError) {
      const message = downloadError instanceof Error ? downloadError.message : String(downloadError);
      setError(message);
      setLogs(previous => [...previous, `DOWNLOAD ERROR: ${message}`]);
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 font-sans text-xs text-gray-300">
      <div className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded border border-[#3E4044] bg-[#242528] shadow-2xl">
        <header className="flex items-center justify-between border-b border-[#3E4044] bg-[#1C1D1F] px-4 py-2">
          <div>
            <h2 className="font-bold text-gray-200">TeamServer Payload Build</h2>
            <p className="mt-0.5 text-[10px] text-gray-500">Profiles and builds are owned by the TeamServer.</p>
          </div>
          <button type="button" onClick={onClose} className="cursor-pointer text-gray-400 hover:text-white">Close</button>
        </header>

        <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 overflow-auto p-4 md:grid-cols-[1fr_300px]">
          <section className="space-y-3 rounded border border-[#333] bg-[#1A1B1D] p-3">
            <div>
              <label htmlFor="build-profile" className="mb-1 block text-gray-400">Implant Profile</label>
              <select
                id="build-profile"
                value={selectedProfile}
                disabled={isBuilding}
                onChange={event => {
                  setSelectedProfile(event.target.value);
                  setBuildID("");
                  previousStatusRef.current = "";
                  setLogs([]);
                  setError("");
                }}
                className="w-full rounded border border-[#444] bg-[#242528] p-2 text-white outline-none transition focus:border-violet-400 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {profiles.length === 0 && <option value="">No profiles available</option>}
                {profiles.map(profile => <option key={profile.name} value={profile.name}>{profile.name}</option>)}
              </select>
            </div>

            <div>
              <div className="mb-1 flex items-center justify-between gap-2">
                <label htmlFor="payload-builder" className="text-gray-400">Payload Builder</label>
                <button
                  type="button"
                  onClick={() => {
                    setIsRefreshingBuilders(true);
                    setError("");
                    void onRefreshPayloadBuilders()
                      .catch(refreshError => setError(refreshError instanceof Error ? refreshError.message : String(refreshError)))
                      .finally(() => setIsRefreshingBuilders(false));
                  }}
                  disabled={isRefreshingBuilders || isBuilding}
                  className="cursor-pointer text-[10px] text-violet-300 hover:text-violet-200 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isRefreshingBuilders ? "Refreshing…" : "Refresh"}
                </button>
              </div>
              <select
                id="payload-builder"
                value={selectedBuilder}
                disabled={isBuilding}
                onChange={event => {
                  setSelectedBuilder(event.target.value);
                  setBuildID("");
                  previousStatusRef.current = "";
                  setLogs([]);
                  setError("");
                }}
                className="w-full rounded border border-[#444] bg-[#242528] p-2 text-white outline-none transition focus:border-violet-400 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {payloadBuilders.length === 0 && <option value="">No payload builders registered</option>}
                {payloadBuilders.map(builder => (
                  <option key={builder.name} value={builder.name}>
                    {builder.name}{builder.type ? ` (${builder.type})` : ""}
                  </option>
                ))}
              </select>
              <label htmlFor="payload-builder-description" className="mt-2 block">
                <span className="mb-1 block text-[10px] text-gray-500">Builder description</span>
                <textarea
                  id="payload-builder-description"
                  value={activeBuilder?.description || ""}
                  readOnly
                  rows={4}
                  placeholder={activeBuilder ? "No description provided by this payload builder." : "Select a payload builder to view its description."}
                  className="w-full resize-y rounded border border-[#3a3b3e] bg-[#17181a] px-3 py-2 font-mono text-[11px] leading-5 text-gray-300 outline-none placeholder:text-gray-600"
                />
              </label>
            </div>

            {activeProfile && (
              <dl className="grid grid-cols-[90px_1fr] gap-x-2 gap-y-1 rounded border border-[#333] bg-[#202124] p-3 font-mono text-[11px]">
                <dt className="text-gray-500">Type</dt><dd>{activeProfile.type}</dd>
                <dt className="text-gray-500">Target</dt><dd>{activeProfile.os} / {activeProfile.arch}</dd>
                <dt className="text-gray-500">LHOST</dt><dd>{activeProfile.lhost}</dd>
                <dt className="text-gray-500">Output</dt><dd>{activeProfile.output}</dd>
              </dl>
            )}

            {!isRefreshingBuilders && payloadBuilders.length === 0 && (
              <p className="rounded border border-amber-900/70 bg-amber-950/30 p-2 text-amber-300">
                No payload builders are registered on the TeamServer. Load the builder script or enable a built-in builder before creating a build.
              </p>
            )}

            {error && <p className="rounded border border-red-900/70 bg-red-950/30 p-2 text-red-300">{error}</p>}

            <button
              type="button"
              onClick={() => void handleBuild()}
              disabled={!activeProfile || !activeBuilder || isBuilding}
              className="w-full cursor-pointer rounded bg-[#385d8a] px-4 py-2 font-bold text-white hover:bg-[#486d9a] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isBuilding ? "Building…" : "Create Build"}
            </button>

            {build && (
              <dl className="grid grid-cols-[90px_1fr] gap-x-2 gap-y-1 rounded border border-[#333] bg-[#202124] p-3 font-mono text-[11px]">
                <dt className="text-gray-500">Build ID</dt><dd className="select-text break-all">{build.id}</dd>
                <dt className="text-gray-500">Builder</dt><dd>{build.builder || "—"}</dd>
                <dt className="text-gray-500">Status</dt><dd className="uppercase">{build.status}</dd>
                <dt className="text-gray-500">Created</dt><dd>{new Date(build.created_at).toLocaleString()}</dd>
                {build.error && <><dt className="text-red-400">Error</dt><dd className="break-words text-red-300">{build.error}</dd></>}
              </dl>
            )}

            {build?.status.toLowerCase() === "completed" && (
              <div className="rounded border border-[#3f5a42] bg-[#1e2b20] p-3">
                <div className="font-bold text-gray-100">{build.artifact_name || "Build artifact"}</div>
                <div className="mt-1 break-all font-mono text-[10px] text-gray-400">{build.download_url}</div>
                <button
                  type="button"
                  onClick={() => void handleDownload()}
                  disabled={!build.download_url || isDownloading}
                  className="mt-2 w-full cursor-pointer rounded bg-[#385d8a] px-3 py-1.5 font-bold text-white hover:bg-[#486d9a] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isDownloading ? "Downloading…" : "Download Artifact"}
                </button>
              </div>
            )}
          </section>

          <section className="flex min-h-52 flex-col rounded border border-[#333] bg-[#121315] p-2.5 font-mono">
            <div className="mb-2 border-b border-[#292929] pb-1 text-[10px] text-gray-500">TEAMSERVER BUILD EVENTS / OUTPUT</div>
            <div ref={outputPanelRef} className="flex-1 space-y-1 overflow-auto text-[10px] text-gray-300">
              {logs.length === 0 && buildOutput.length === 0 && <p className="text-gray-600">Ready.</p>}
              {logs.map((log, index) => <p key={`activity-${index}-${log}`}>{log}</p>)}
              {buildOutput.map((output, index) => (
                <p key={`output-${output.sequence || index}`} className="whitespace-pre-wrap break-words text-gray-200">
                  <span className="text-gray-600">
                    {output.time ? `${new Date(output.time).toLocaleTimeString()} ` : ""}
                    [{output.profile} / {output.builder}]{" "}
                  </span>
                  {output.message}
                </p>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
};
