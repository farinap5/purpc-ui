import React, { useEffect, useMemo, useRef, useState } from "react";
import { TeamBuild, TeamBuildOutput, TeamPayloadBuilder, TeamProfile } from "../api/teamApi";
import {
  CompactButton,
  CompactFormGrid,
  CompactFormRow,
  CompactSelect,
  CompactTextArea,
  DesktopModal,
  DesktopPanel,
  LogConsole,
  PanelHeader
} from "./desktop";

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
    <DesktopModal
      title="TeamServer Payload Build"
      subtitle="Profiles and builds are owned by the TeamServer"
      onClose={onClose}
      width="860px"
    >
      <div className="payload-layout">
        <section className="payload-form-pane">
          <CompactFormGrid>
            <CompactFormRow label="Implant Profile" htmlFor="build-profile" required>
              <CompactSelect
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
              >
                {profiles.length === 0 && <option value="">No profiles available</option>}
                {profiles.map(profile => <option key={profile.name} value={profile.name}>{profile.name}</option>)}
              </CompactSelect>
            </CompactFormRow>

            <CompactFormRow label="Payload Builder" htmlFor="payload-builder" required>
              <div className="inline-control-row">
                <CompactSelect
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
                >
                  {payloadBuilders.length === 0 && <option value="">No payload builders registered</option>}
                  {payloadBuilders.map(builder => (
                    <option key={builder.name} value={builder.name}>
                      {builder.name}{builder.type ? ` (${builder.type})` : ""}
                    </option>
                  ))}
                </CompactSelect>
                <CompactButton
                  type="button"
                  onClick={() => {
                    setIsRefreshingBuilders(true);
                    setError("");
                    void onRefreshPayloadBuilders()
                      .catch(refreshError => setError(refreshError instanceof Error ? refreshError.message : String(refreshError)))
                      .finally(() => setIsRefreshingBuilders(false));
                  }}
                  disabled={isRefreshingBuilders || isBuilding}
                >
                  {isRefreshingBuilders ? "Refreshing…" : "Refresh"}
                </CompactButton>
              </div>
            </CompactFormRow>

            <CompactFormRow label="Description" htmlFor="payload-builder-description">
                <CompactTextArea
                  id="payload-builder-description"
                  value={activeBuilder?.description || ""}
                  readOnly
                  rows={4}
                  placeholder={activeBuilder ? "No description provided by this payload builder." : "Select a payload builder to view its description."}
                />
            </CompactFormRow>
          </CompactFormGrid>

          {activeProfile && (
              <dl className="desktop-property-grid">
                <dt className="text-gray-500">Type</dt><dd>{activeProfile.type}</dd>
                <dt className="text-gray-500">Target</dt><dd>{activeProfile.os} / {activeProfile.arch}</dd>
                <dt className="text-gray-500">LHOST</dt><dd>{activeProfile.lhost}</dd>
                <dt className="text-gray-500">Output</dt><dd>{activeProfile.output}</dd>
              </dl>
          )}

          {!isRefreshingBuilders && payloadBuilders.length === 0 && (
              <p className="desktop-alert desktop-alert--warning">
                No payload builders are registered on the TeamServer. Load the builder script or enable a built-in builder before creating a build.
              </p>
          )}

          {error && <p role="alert" className="desktop-alert desktop-alert--error">{error}</p>}

          <div className="centered-actions">
            <CompactButton
              type="button"
              onClick={() => void handleBuild()}
              disabled={!activeProfile || !activeBuilder || isBuilding}
              variant="primary"
              className="fixed-action-button"
            >
              {isBuilding ? "Building…" : "Create Build"}
            </CompactButton>
          </div>

          {build && (
              <dl className="desktop-property-grid">
                <dt className="text-gray-500">Build ID</dt><dd className="select-text break-all">{build.id}</dd>
                <dt className="text-gray-500">Builder</dt><dd>{build.builder || "—"}</dd>
                <dt className="text-gray-500">Status</dt><dd className="uppercase">{build.status}</dd>
                <dt className="text-gray-500">Created</dt><dd>{new Date(build.created_at).toLocaleString()}</dd>
                {build.error && <><dt className="text-red-400">Error</dt><dd className="break-words text-red-300">{build.error}</dd></>}
              </dl>
          )}

          {build?.status.toLowerCase() === "completed" && (
              <div className="desktop-alert desktop-alert--success artifact-ready">
                <strong>{build.artifact_name || "Build artifact"}</strong>
                <span>{build.download_url}</span>
                <CompactButton
                  type="button"
                  onClick={() => void handleDownload()}
                  disabled={!build.download_url || isDownloading}
                  variant="primary"
                >
                  {isDownloading ? "Downloading…" : "Download Artifact"}
                </CompactButton>
              </div>
          )}
        </section>

        <DesktopPanel className="payload-output-pane">
            <PanelHeader>TeamServer Build Events / Output</PanelHeader>
            <LogConsole ref={outputPanelRef} className="payload-output-log">
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
            </LogConsole>
        </DesktopPanel>
      </div>
    </DesktopModal>
  );
};
