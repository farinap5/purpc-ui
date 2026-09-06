import React, { useEffect, useMemo, useState } from "react";
import type {
  TeamListenerHostedConfiguration,
  TeamListenerHostedNotFoundClearRequest,
  TeamListenerHostedRemoveRequest
} from "../api/teamApi";
import type { Listener } from "../types";
import {
  listenerHostedConfigurationFor,
  type ListenerHostedConfigurationMap
} from "../utils/listenerHosted";
import type { HostedFileEditorTarget } from "./HostedFileModal";
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

interface HostedFilesPanelProps {
  listeners: Listener[];
  configurations: ListenerHostedConfigurationMap;
  isConnected: boolean;
  onLoad: (listenerName: string) => Promise<TeamListenerHostedConfiguration>;
  onRemove: (request: TeamListenerHostedRemoveRequest) => Promise<TeamListenerHostedConfiguration>;
  onClearNotFound: (request: TeamListenerHostedNotFoundClearRequest) => Promise<TeamListenerHostedConfiguration>;
  onOpenEditor: (target?: HostedFileEditorTarget) => void;
}

interface HostedFileRow {
  id: string;
  listener: Listener;
  urlPath: string;
  isNotFound: boolean;
  file: NonNullable<TeamListenerHostedConfiguration["not_found_page"]>;
  configVersion: number;
}

const formatHeaders = (headers?: Record<string, string>) => {
  const entries = Object.entries(headers || {});
  return entries.length ? entries.map(([name, value]) => `${name}: ${value}`).join("; ") : "—";
};

export const HostedFilesPanel: React.FC<HostedFilesPanelProps> = ({
  listeners,
  configurations,
  isConnected,
  onLoad,
  onRemove,
  onClearNotFound,
  onOpenEditor
}) => {
  const httpListeners = useMemo(() => listeners
    .filter(listener => listener.driver.trim().toLowerCase() === "http")
    .sort((left, right) => left.name.localeCompare(right.name, undefined, { sensitivity: "base" })), [listeners]);
  const [listenerFilter, setListenerFilter] = useState("all");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [pendingAction, setPendingAction] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const visibleListeners = listenerFilter === "all"
    ? httpListeners
    : httpListeners.filter(listener => listener.uuid === listenerFilter);

  const rows = visibleListeners.flatMap<HostedFileRow>(listener => {
    const configuration = listenerHostedConfigurationFor(configurations, listener);
    if (!configuration) return [];
    const hostedRows = Object.entries(configuration.hosted_files || {})
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([urlPath, file]) => ({
        id: `${listener.uuid}:${urlPath}`,
        listener,
        urlPath,
        isNotFound: false,
        file,
        configVersion: configuration.config_version
      }));
    if (configuration.not_found_page) {
      hostedRows.push({
        id: `${listener.uuid}:<default-404>`,
        listener,
        urlPath: "<default 404>",
        isNotFound: true,
        file: configuration.not_found_page,
        configVersion: configuration.config_version
      });
    }
    return hostedRows;
  });

  const loadedListenerCount = httpListeners.filter(listener =>
    Boolean(listenerHostedConfigurationFor(configurations, listener))
  ).length;

  const refresh = async (background = false) => {
    if (!isConnected || isRefreshing) return;
    if (!background) {
      setError("");
      setNotice("");
    }
    setIsRefreshing(true);
    const targets = listenerFilter === "all"
      ? httpListeners
      : httpListeners.filter(listener => listener.uuid === listenerFilter);
    const results = await Promise.allSettled(targets.map(listener => onLoad(listener.name)));
    const failures = results.filter(result => result.status === "rejected") as PromiseRejectedResult[];
    if (failures.length) {
      setError(failures.map(result => result.reason instanceof Error ? result.reason.message : String(result.reason)).join("; "));
    } else if (!background) {
      setNotice(`Loaded hosted files for ${targets.length} HTTP listener${targets.length === 1 ? "" : "s"}.`);
    }
    setIsRefreshing(false);
  };

  useEffect(() => {
    if (isConnected && httpListeners.length) void refresh(true);
  }, [isConnected, httpListeners.map(listener => `${listener.uuid}:${listener.configVersion || 0}`).join("|")]);

  useEffect(() => {
    if (listenerFilter !== "all" && !httpListeners.some(listener => listener.uuid === listenerFilter)) {
      setListenerFilter("all");
    }
  }, [listenerFilter, httpListeners]);

  const remove = async (row: HostedFileRow) => {
    setPendingAction(row.id);
    setError("");
    setNotice("");
    try {
      if (row.isNotFound) {
        await onClearNotFound({
          name: row.listener.name,
          expected_config_version: row.configVersion
        });
      } else {
        await onRemove({
          name: row.listener.name,
          url_path: row.urlPath,
          expected_config_version: row.configVersion
        });
      }
      setNotice(`${row.isNotFound ? "Default 404 page cleared" : `Hosted route ${row.urlPath} removed`} from ${row.listener.name}.`);
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : String(actionError));
    } finally {
      setPendingAction("");
    }
  };

  const selectedListener = listenerFilter === "all"
    ? undefined
    : httpListeners.find(listener => listener.uuid === listenerFilter);

  return (
    <DesktopPanel className="console-data-panel hosted-files-panel">
      <PanelHeader actions={
        <>
          <span className="panel-counter">{rows.length} hosted</span>
          <CompactButton
            type="button"
            variant="primary"
            disabled={!isConnected || httpListeners.length === 0}
            onClick={() => onOpenEditor(selectedListener ? { listenerName: selectedListener.name } : undefined)}
          >
            Host File
          </CompactButton>
          <CompactButton
            type="button"
            disabled={!isConnected || isRefreshing || httpListeners.length === 0}
            onClick={() => void refresh()}
          >
            {isRefreshing ? "Refreshing…" : "Refresh"}
          </CompactButton>
        </>
      }>HTTP Hosted Files</PanelHeader>

      <Toolbar>
        <CompactSelect
          className="hosted-files-listener-filter"
          value={listenerFilter}
          onChange={event => setListenerFilter(event.target.value)}
          aria-label="Filter hosted files by listener"
          disabled={httpListeners.length === 0}
        >
          <option value="all">All HTTP listeners</option>
          {httpListeners.map(listener => (
            <option key={listener.uuid} value={listener.uuid}>{listener.name} — {listener.uuid}</option>
          ))}
        </CompactSelect>
      </Toolbar>

      <StatusBar className="hosted-files-status">
        <span>{loadedListenerCount} of {httpListeners.length} HTTP listener configurations loaded</span>
        <span>Updates apply live</span>
      </StatusBar>

      {!isConnected && <p className="desktop-alert desktop-alert--warning panel-alert">Connect to the TeamServer to manage hosted files.</p>}
      {error && <p role="alert" className="desktop-alert desktop-alert--error panel-alert">{error}</p>}
      {notice && <p className="desktop-alert desktop-alert--success panel-alert">{notice}</p>}

      <CompactScrollbar className="console-grid-scroll">
        <DataGrid aria-label="HTTP listener hosted files" className="hosted-files-grid">
          <thead>
            <tr>
              <th>Web path</th>
              <th>Listener</th>
              <th>Listener UUID</th>
              <th>Filesystem path</th>
              <th>Status</th>
              <th>Custom headers</th>
              <th>Config</th>
              <th className="text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(row => (
              <tr key={row.id}>
                <td className={row.isNotFound ? "text-amber-300" : "text-white"}>{row.isNotFound ? "Default 404" : row.urlPath}</td>
                <td>{row.listener.name}</td>
                <td title={row.listener.uuid} className="select-text text-[10px]">{row.listener.uuid}</td>
                <td title={row.file.source_path} className="select-text">{row.file.source_path}</td>
                <td>{row.isNotFound ? 404 : row.file.status || 200}</td>
                <td title={formatHeaders(row.file.headers)}>{formatHeaders(row.file.headers)}</td>
                <td>v{row.configVersion}</td>
                <td className="text-right">
                  <div className="grid-actions">
                    <CompactButton
                      type="button"
                      variant="secondary"
                      disabled={Boolean(pendingAction)}
                      onClick={() => onOpenEditor({
                        listenerName: row.listener.name,
                        urlPath: row.isNotFound ? undefined : row.urlPath,
                        file: row.file,
                        notFound: row.isNotFound,
                        configVersion: row.configVersion
                      })}
                    >
                      Edit
                    </CompactButton>
                    <CompactButton
                      type="button"
                      variant="danger"
                      disabled={Boolean(pendingAction)}
                      onClick={() => void remove(row)}
                    >
                      {pendingAction === row.id ? (row.isNotFound ? "Clearing…" : "Removing…") : row.isNotFound ? "Clear" : "Remove"}
                    </CompactButton>
                  </div>
                </td>
              </tr>
            ))}
            {!isRefreshing && rows.length === 0 && (
              <tr>
                <td colSpan={8} className="empty-grid-cell">
                  {httpListeners.length === 0
                    ? "No HTTP listeners are registered."
                    : "No hosted files or default 404 pages are configured for this selection."}
                </td>
              </tr>
            )}
            {isRefreshing && rows.length === 0 && (
              <tr><td colSpan={8} className="empty-grid-cell">Loading hosted-file configurations…</td></tr>
            )}
          </tbody>
        </DataGrid>
      </CompactScrollbar>
    </DesktopPanel>
  );
};
