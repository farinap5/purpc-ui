import React, { useEffect, useMemo, useState } from "react";
import type { TeamStream } from "../api/teamApi";
import {
  isTerminalStream,
  sortStreams,
  STREAM_STATE_LABELS
} from "../utils/streams";
import {
  CompactButton,
  CompactScrollbar,
  CompactSelect,
  DataGrid,
  DesktopPanel,
  PanelHeader,
  SplitPane,
  StatusBar,
  Toolbar
} from "./desktop";

interface StreamsPanelProps {
  streams: TeamStream[];
  isConnected: boolean;
  onRefresh: () => Promise<TeamStream[]>;
}

const formatTimestamp = (value?: string) => {
  if (!value || value.startsWith("0001-")) return "—";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "—" : parsed.toLocaleString();
};

const formatBytes = (value?: number) => `${Math.max(0, value || 0).toLocaleString()} B`;

const formatDuration = (milliseconds: number) => {
  const totalSeconds = Math.max(0, Math.ceil(milliseconds / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
};

const pairingDeadline = (stream: TeamStream, now: number) => {
  if (stream.state === "bridging") return "Pairing complete";
  if (isTerminalStream(stream) || !stream.expires_at) return "—";
  const expiresAt = Date.parse(stream.expires_at);
  if (Number.isNaN(expiresAt)) return "—";
  const remaining = expiresAt - now;
  return remaining <= 0 ? "Due now" : `${formatDuration(remaining)} remaining`;
};

const attachmentSummary = (value?: string) => value ? "Attached" : "Waiting";

export const StreamsPanel: React.FC<StreamsPanelProps> = ({ streams, isConnected, onRefresh }) => {
  const [stateFilter, setStateFilter] = useState("active");
  const [selectedStreamID, setSelectedStreamID] = useState("");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [clockNow, setClockNow] = useState(Date.now());

  const sortedStreams = useMemo(() => sortStreams(streams), [streams]);
  const visibleStreams = useMemo(() => sortedStreams.filter(stream => {
    if (stateFilter === "all") return true;
    if (stateFilter === "active") return !isTerminalStream(stream);
    return stream.state === stateFilter;
  }), [sortedStreams, stateFilter]);
  const selectedStream = sortedStreams.find(stream => stream.id === selectedStreamID);
  const activeCount = streams.filter(stream => !isTerminalStream(stream)).length;
  const connectedCount = streams.filter(stream => stream.state === "bridging").length;

  useEffect(() => {
    const intervalID = window.setInterval(() => setClockNow(Date.now()), 1000);
    return () => window.clearInterval(intervalID);
  }, []);

  useEffect(() => {
    if (selectedStreamID && visibleStreams.some(stream => stream.id === selectedStreamID)) return;
    setSelectedStreamID(visibleStreams[0]?.id || "");
  }, [selectedStreamID, sortedStreams, visibleStreams]);

  const refresh = async () => {
    if (!isConnected || isRefreshing) return;
    setIsRefreshing(true);
    setError("");
    setNotice("");
    try {
      const refreshed = await onRefresh();
      setNotice(`Loaded ${refreshed.length} stream${refreshed.length === 1 ? "" : "s"} from the TeamServer snapshot.`);
    } catch (refreshError) {
      setError(refreshError instanceof Error ? refreshError.message : String(refreshError));
    } finally {
      setIsRefreshing(false);
    }
  };

  const copyEndpoint = async (stream: TeamStream) => {
    setError("");
    setNotice("");
    try {
      if (!navigator.clipboard?.writeText) throw new Error("Clipboard access is unavailable in this frontend.");
      await navigator.clipboard.writeText(stream.local_address);
    } catch (copyError) {
      setError(copyError instanceof Error ? copyError.message : String(copyError));
    }
  };

  return (
    <DesktopPanel className="console-data-panel streams-panel">
      <PanelHeader actions={
        <>
          <span className="panel-counter">{streams.length} total · {activeCount} active · {connectedCount} connected</span>
          <CompactButton type="button" onClick={() => void refresh()} disabled={!isConnected || isRefreshing}>
            {isRefreshing ? "Refreshing…" : "Refresh snapshot"}
          </CompactButton>
        </>
      }>Byte Streams</PanelHeader>

      <Toolbar>
        <CompactSelect
          className="stream-state-filter"
          value={stateFilter}
          onChange={event => setStateFilter(event.target.value)}
          aria-label="Filter streams by state"
        >
          <option value="active">Active streams</option>
          <option value="all">All stream states</option>
          <option value="waiting_implant">Waiting for implant</option>
          <option value="waiting_consumer">Waiting for local client</option>
          <option value="bridging">Connected</option>
          <option value="closed">Closed</option>
          <option value="expired">Attachment timed out</option>
          <option value="failed">Failed</option>
        </CompactSelect>
      </Toolbar>

      <StatusBar className="streams-status">
        <span>Metadata only · byte relay remains on the TeamServer</span>
        <span>Terminal streams do not reconnect</span>
      </StatusBar>

      {!isConnected && <p className="desktop-alert desktop-alert--warning panel-alert">Reconnect to refresh the stream snapshot and receive lifecycle events.</p>}
      <p className="desktop-alert desktop-alert--accent panel-alert">
        Local endpoints are bound on the TeamServer machine. A remote browser or workstation cannot connect directly without separately authorized host-level forwarding.
      </p>
      {error && <p role="alert" className="desktop-alert desktop-alert--error panel-alert">{error}</p>}
      {notice && <p className="desktop-alert desktop-alert--success panel-alert">{notice}</p>}

      <SplitPane className="streams-content">
        <CompactScrollbar className="console-grid-scroll streams-grid-scroll">
          <DataGrid aria-label="TeamServer byte streams" className="streams-grid">
            <thead>
              <tr>
                <th>State</th><th>Service</th><th>Session</th><th>TeamServer endpoint</th>
                <th>Implant</th><th>Local client</th><th>Pairing deadline</th>
                <th>From implant</th><th>To implant</th><th>Created</th><th>Error</th><th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {visibleStreams.map(stream => {
                const terminal = isTerminalStream(stream);
                return (
                  <tr
                    key={stream.id}
                    aria-selected={stream.id === selectedStreamID}
                    onClick={() => setSelectedStreamID(stream.id)}
                  >
                    <td><span className={`stream-state is-${stream.state}`}>{STREAM_STATE_LABELS[stream.state]}</span></td>
                    <td>{stream.service}</td>
                    <td title={stream.session} className="select-text">{stream.session}</td>
                    <td title={`${stream.local_address} is reachable only from the TeamServer host`} className="select-text">{stream.local_address}</td>
                    <td title={formatTimestamp(stream.implant_attached_at)}>{attachmentSummary(stream.implant_attached_at)}</td>
                    <td title={formatTimestamp(stream.consumer_attached_at)}>{attachmentSummary(stream.consumer_attached_at)}</td>
                    <td title={stream.state === "bridging" ? "The pairing deadline no longer applies after relay starts." : formatTimestamp(stream.expires_at)}>
                      {pairingDeadline(stream, clockNow)}
                    </td>
                    <td>{formatBytes(stream.bytes_from_implant)}</td>
                    <td>{formatBytes(stream.bytes_to_implant)}</td>
                    <td title={stream.created_at}>{formatTimestamp(stream.created_at)}</td>
                    <td title={stream.error} className={stream.error ? "stream-error-text" : undefined}>{stream.error || "—"}</td>
                    <td className="text-right">
                      <div className="grid-actions">
                        <CompactButton
                          type="button"
                          variant="secondary"
                          onClick={event => {
                            event.stopPropagation();
                            setSelectedStreamID(stream.id);
                          }}
                        >
                          Inspect
                        </CompactButton>
                        <CompactButton
                          type="button"
                          onClick={event => {
                            event.stopPropagation();
                            void copyEndpoint(stream);
                          }}
                          disabled={terminal || !stream.local_address}
                          title={terminal
                            ? "Terminal streams cannot reconnect; create a new stream instead."
                            : "Copy the TeamServer-local TCP endpoint. This remains available while either side is waiting."}
                        >
                          Copy endpoint
                        </CompactButton>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {visibleStreams.length === 0 && (
                <tr><td colSpan={12} className="empty-grid-cell">{streams.length ? "No streams match this filter." : "No streams are present in the TeamServer snapshot."}</td></tr>
              )}
            </tbody>
          </DataGrid>
        </CompactScrollbar>

        <DesktopPanel className="stream-detail-panel">
          <PanelHeader actions={selectedStream && !isTerminalStream(selectedStream) ? (
            <CompactButton type="button" onClick={() => void copyEndpoint(selectedStream)}>
              Copy endpoint
            </CompactButton>
          ) : undefined}>Stream Details</PanelHeader>
          <CompactScrollbar className="stream-detail-body">
            {selectedStream ? (
              <>
                <dl className="desktop-property-grid">
                  <dt>ID</dt><dd className="select-text">{selectedStream.id}</dd>
                  <dt>State</dt><dd><span className={`stream-state is-${selectedStream.state}`}>{STREAM_STATE_LABELS[selectedStream.state]}</span></dd>
                  <dt>Service</dt><dd>{selectedStream.service}</dd>
                  <dt>Session</dt><dd className="select-text">{selectedStream.session}</dd>
                  <dt>Task ID</dt><dd className="select-text">{selectedStream.task_id || "—"}</dd>
                  <dt>Command</dt><dd className="select-text">{selectedStream.command || "—"}</dd>
                  <dt>Local address</dt><dd className="select-text">{selectedStream.local_address}</dd>
                  <dt>Local host</dt><dd className="select-text">{selectedStream.local_host}</dd>
                  <dt>Local port</dt><dd>{selectedStream.local_port}</dd>
                  <dt>Created</dt><dd>{formatTimestamp(selectedStream.created_at)}</dd>
                  <dt>Pairing deadline</dt><dd>{selectedStream.state === "bridging" ? "No longer applicable" : formatTimestamp(selectedStream.expires_at)}</dd>
                  <dt>Deadline status</dt><dd>{pairingDeadline(selectedStream, clockNow)}</dd>
                  <dt>Implant attached</dt><dd>{formatTimestamp(selectedStream.implant_attached_at)}</dd>
                  <dt>Consumer attached</dt><dd>{formatTimestamp(selectedStream.consumer_attached_at)}</dd>
                  <dt>Closed</dt><dd>{formatTimestamp(selectedStream.closed_at)}</dd>
                  <dt>From implant</dt><dd>{formatBytes(selectedStream.bytes_from_implant)}</dd>
                  <dt>To implant</dt><dd>{formatBytes(selectedStream.bytes_to_implant)}</dd>
                  <dt>Error</dt><dd className={selectedStream.error ? "stream-error-text" : undefined}>{selectedStream.error || "—"}</dd>
                </dl>
                {selectedStream.service.toLowerCase().includes("socks") && (
                  <p className="desktop-alert desktop-alert--warning">Each stream represents one SOCKS5 TCP connection, not a multi-client SOCKS listener.</p>
                )}
                <p className="desktop-alert desktop-alert--warning">
                  The current operator API has no stream-close operation. Streams close naturally when either tunnel endpoint closes.
                </p>
              </>
            ) : (
              <div className="empty-desktop-panel">Select a stream to inspect its metadata.</div>
            )}
          </CompactScrollbar>
        </DesktopPanel>
      </SplitPane>
    </DesktopPanel>
  );
};
