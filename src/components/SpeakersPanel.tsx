import React, { useEffect, useMemo, useState } from "react";
import type { TeamSpeaker } from "../api/teamApi";
import {
  canDeleteSpeaker,
  canEditSpeaker,
  canRestartSpeaker,
  canStartSpeaker,
  canStopSpeaker
} from "../utils/speaker";
import {
  CompactButton,
  CompactScrollbar,
  CompactSelect,
  DataGrid,
  DesktopPanel,
  PanelHeader,
  StatusBar,
  Toolbar
} from "./desktop";

interface SpeakersPanelProps {
  speakers: TeamSpeaker[];
  isConnected: boolean;
  canManage: boolean;
  onList: () => Promise<TeamSpeaker[]>;
  onStart: (name: string) => Promise<TeamSpeaker>;
  onStop: (name: string) => Promise<TeamSpeaker>;
  onRestart: (name: string) => Promise<TeamSpeaker>;
  onDelete: (name: string) => Promise<TeamSpeaker>;
  onCreate: () => void;
  onEdit: (speaker: TeamSpeaker) => void;
}

const formatTimestamp = (value?: string) => {
  if (!value || value.startsWith("0001-")) return "Never";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "Never" : parsed.toLocaleString();
};

export const SpeakersPanel: React.FC<SpeakersPanelProps> = ({
  speakers,
  isConnected,
  canManage,
  onList,
  onStart,
  onStop,
  onRestart,
  onDelete,
  onCreate,
  onEdit
}) => {
  const [stateFilter, setStateFilter] = useState("all");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [pendingAction, setPendingAction] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const visibleSpeakers = useMemo(() => stateFilter === "all"
    ? speakers
    : speakers.filter(speaker => speaker.state === stateFilter), [speakers, stateFilter]);

  const refresh = async (background = false) => {
    if (!isConnected || isRefreshing) return;
    if (!background) {
      setError("");
      setNotice("");
    }
    setIsRefreshing(true);
    try {
      const listed = await onList();
      if (!background) setNotice(`Loaded ${listed.length} speaker${listed.length === 1 ? "" : "s"}.`);
    } catch (refreshError) {
      setError(refreshError instanceof Error ? refreshError.message : String(refreshError));
    } finally {
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    if (isConnected) void refresh(true);
  }, [isConnected]);

  const run = async (
    speaker: TeamSpeaker,
    action: "start" | "stop" | "restart" | "delete"
  ) => {
    if (!canManage) {
      setError("Only an administrator can mutate speakers.");
      return;
    }
    setPendingAction(`${action}:${speaker.uuid}`);
    setError("");
    setNotice("");
    try {
      if (action === "start") await onStart(speaker.name);
      else if (action === "stop") await onStop(speaker.name);
      else if (action === "restart") await onRestart(speaker.name);
      else await onDelete(speaker.name);
      setNotice(action === "delete"
        ? `Speaker ${speaker.name} deleted.`
        : `Speaker ${speaker.name} ${action} completed.`);
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : String(actionError));
    } finally {
      setPendingAction("");
    }
  };

  const isBusy = Boolean(pendingAction);
  const connectedCount = speakers.filter(speaker => speaker.state === "connected").length;

  return (
    <DesktopPanel className="console-data-panel speakers-panel">
      <PanelHeader actions={
        <>
          <span className="panel-counter">{speakers.length} total · {connectedCount} connected</span>
          <CompactButton type="button" variant="primary" onClick={onCreate} disabled={!isConnected || !canManage || isBusy}>
            New Speaker
          </CompactButton>
          <CompactButton type="button" onClick={() => void refresh()} disabled={!isConnected || isRefreshing || isBusy}>
            {isRefreshing ? "Refreshing…" : "Refresh"}
          </CompactButton>
        </>
      }>Outbound Speakers</PanelHeader>

      <Toolbar>
        <CompactSelect
          className="speaker-state-filter"
          value={stateFilter}
          onChange={event => setStateFilter(event.target.value)}
          aria-label="Filter speakers by state"
        >
          <option value="all">All speaker states</option>
          <option value="stopped">Stopped</option>
          <option value="connecting">Connecting</option>
          <option value="connected">Connected</option>
          <option value="disconnected">Disconnected</option>
          <option value="failed">Failed</option>
        </CompactSelect>
      </Toolbar>

      <StatusBar className="speakers-status">
        <span>Outbound HTTP workers · one bind endpoint per speaker</span>
        <span>{canManage ? "Administrator controls enabled" : "Read-only · administrator required"}</span>
      </StatusBar>

      {!isConnected && <p className="desktop-alert desktop-alert--warning panel-alert">Connect to the TeamServer to manage speakers.</p>}
      {!canManage && <p className="desktop-alert desktop-alert--warning panel-alert">Speaker create, update, lifecycle, and delete operations are admin-only.</p>}
      {error && <p role="alert" className="desktop-alert desktop-alert--error panel-alert">{error}</p>}
      {notice && <p className="desktop-alert desktop-alert--success panel-alert">{notice}</p>}

      <CompactScrollbar className="console-grid-scroll">
        <DataGrid aria-label="TeamServer outbound speakers" className="speakers-grid">
          <thead>
            <tr>
              <th>Name</th><th>UUID</th><th>Bind endpoint</th><th>Profile</th><th>Persistent</th><th>State</th><th>Desired</th>
              <th>In flight</th><th>Session</th><th>Sessions</th><th>Last attempt</th><th>Last success</th><th>Config</th><th className="text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {visibleSpeakers.map(speaker => (
              <tr key={speaker.uuid}>
                <td className="text-white">{speaker.name}</td>
                <td title={speaker.uuid} className="select-text text-[10px]">{speaker.uuid}</td>
                <td title={speaker.config.client.base_url}>{speaker.config.client.base_url}</td>
                <td>{speaker.config.profile || "—"}</td>
                <td>{speaker.persistent ? "Yes" : "No"}</td>
                <td>
                  <span className={`speaker-state is-${speaker.state}`}>{speaker.state}</span>
                  {speaker.last_error && <span className="speaker-error-text" title={speaker.last_error}>{speaker.last_error}</span>}
                </td>
                <td>{speaker.desired_state}</td>
                <td>{speaker.in_flight ? "Yes" : "No"}</td>
                <td>{speaker.session || "—"}</td>
                <td>{speaker.associations}</td>
                <td title={speaker.last_attempt_at}>{formatTimestamp(speaker.last_attempt_at)}</td>
                <td title={speaker.last_success_at}>{formatTimestamp(speaker.last_success_at)}</td>
                <td>v{speaker.config_version}</td>
                <td className="text-right">
                  <div className="grid-actions">
                    <CompactButton type="button" variant="secondary" disabled={!isConnected || !canManage || isBusy || !canStartSpeaker(speaker.state)} onClick={() => void run(speaker, "start")}>Start</CompactButton>
                    <CompactButton type="button" variant="danger" disabled={!isConnected || !canManage || isBusy || !canStopSpeaker(speaker.state)} onClick={() => void run(speaker, "stop")}>Stop</CompactButton>
                    <CompactButton type="button" disabled={!isConnected || !canManage || isBusy || !canRestartSpeaker(speaker.state)} onClick={() => void run(speaker, "restart")}>Restart</CompactButton>
                    <CompactButton type="button" disabled={!isConnected || !canManage || isBusy || !canEditSpeaker(speaker.state)} onClick={() => onEdit(speaker)}>Edit</CompactButton>
                    <CompactButton type="button" variant="danger" disabled={!isConnected || !canManage || isBusy || !canDeleteSpeaker(speaker.state)} onClick={() => void run(speaker, "delete")}>Delete</CompactButton>
                  </div>
                </td>
              </tr>
            ))}
            {!isRefreshing && visibleSpeakers.length === 0 && (
              <tr><td colSpan={14} className="empty-grid-cell">{speakers.length ? "No speakers match this filter." : "No speakers are configured."}</td></tr>
            )}
            {isRefreshing && speakers.length === 0 && (
              <tr><td colSpan={14} className="empty-grid-cell">Loading speakers…</td></tr>
            )}
          </tbody>
        </DataGrid>
      </CompactScrollbar>
    </DesktopPanel>
  );
};
