import React, { useEffect, useState } from "react";
import { TeamBuild, TeamProfile } from "../api/teamApi";

interface PayloadGeneratorProps {
  profiles: TeamProfile[];
  isOpen: boolean;
  onClose: () => void;
  onCreateBuild: (profile: string) => Promise<TeamBuild>;
  onGetBuild: (id: string) => Promise<TeamBuild>;
  onDownloadBuild: (build: TeamBuild) => Promise<void>;
}

const wait = (milliseconds: number) => new Promise(resolve => window.setTimeout(resolve, milliseconds));

export const PayloadGenerator: React.FC<PayloadGeneratorProps> = ({
  profiles,
  isOpen,
  onClose,
  onCreateBuild,
  onGetBuild,
  onDownloadBuild
}) => {
  const [selectedProfile, setSelectedProfile] = useState("");
  const [build, setBuild] = useState<TeamBuild | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [isBuilding, setIsBuilding] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!profiles.some(profile => profile.name === selectedProfile)) {
      setSelectedProfile(profiles[0]?.name || "");
    }
  }, [profiles, selectedProfile]);

  if (!isOpen) return null;

  const activeProfile = profiles.find(profile => profile.name === selectedProfile);

  const handleBuild = async () => {
    if (!selectedProfile || isBuilding) return;
    setError("");
    setBuild(null);
    setLogs([`Requesting build for profile ${selectedProfile}…`]);
    setIsBuilding(true);

    try {
      let current = await onCreateBuild(selectedProfile);
      setBuild(current);
      setLogs(previous => [...previous, `Build ${current.id} accepted with status ${current.status}.`]);

      for (let attempt = 0; attempt < 120 && !["completed", "failed"].includes(current.status.toLowerCase()); attempt++) {
        await wait(750);
        const next = await onGetBuild(current.id);
        if (next.status !== current.status) {
          setLogs(previous => [...previous, `Status changed: ${current.status} → ${next.status}`]);
        }
        current = next;
        setBuild(current);
      }

      if (current.status.toLowerCase() === "completed") {
        setLogs(previous => [...previous, `Artifact ready: ${current.artifact_name || "unnamed artifact"}`]);
      } else if (current.status.toLowerCase() === "failed") {
        throw new Error(current.error || "TeamServer build failed.");
      } else {
        throw new Error("Build monitoring timed out. The job continues on the TeamServer.");
      }
    } catch (buildError) {
      const message = buildError instanceof Error ? buildError.message : String(buildError);
      setError(message);
      setLogs(previous => [...previous, `ERROR: ${message}`]);
    } finally {
      setIsBuilding(false);
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
                onChange={event => {
                  setSelectedProfile(event.target.value);
                  setBuild(null);
                  setLogs([]);
                  setError("");
                }}
                className="w-full rounded border border-[#444] bg-[#242528] p-2 text-white outline-none transition focus:border-violet-400"
              >
                {profiles.length === 0 && <option value="">No profiles available</option>}
                {profiles.map(profile => <option key={profile.name} value={profile.name}>{profile.name}</option>)}
              </select>
            </div>

            {activeProfile && (
              <dl className="grid grid-cols-[90px_1fr] gap-x-2 gap-y-1 rounded border border-[#333] bg-[#202124] p-3 font-mono text-[11px]">
                <dt className="text-gray-500">Type</dt><dd>{activeProfile.type}</dd>
                <dt className="text-gray-500">Target</dt><dd>{activeProfile.os} / {activeProfile.arch}</dd>
                <dt className="text-gray-500">LHOST</dt><dd>{activeProfile.lhost}</dd>
                <dt className="text-gray-500">Output</dt><dd>{activeProfile.output}</dd>
                <dt className="text-gray-500">Template</dt><dd className="break-all">{activeProfile.template}</dd>
              </dl>
            )}

            {error && <p className="rounded border border-red-900/70 bg-red-950/30 p-2 text-red-300">{error}</p>}

            <button
              type="button"
              onClick={() => void handleBuild()}
              disabled={!activeProfile || isBuilding}
              className="w-full cursor-pointer rounded bg-[#385d8a] px-4 py-2 font-bold text-white hover:bg-[#486d9a] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isBuilding ? "Building…" : "Create Build"}
            </button>

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
            <div className="mb-2 border-b border-[#292929] pb-1 text-[10px] text-gray-500">TEAMSERVER BUILD EVENTS</div>
            <div className="flex-1 space-y-1 overflow-auto text-[10px] text-gray-300">
              {logs.length === 0 ? <p className="text-gray-600">Ready.</p> : logs.map((log, index) => <p key={`${index}-${log}`}>{log}</p>)}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
};
