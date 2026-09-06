import React, { useEffect, useRef, useState } from "react";
import type {
  TeamHTTPHostedFile,
  TeamListenerHostedAddRequest,
  TeamListenerHostedConfiguration,
  TeamListenerHostedNotFoundSetRequest
} from "../api/teamApi";
import type { Listener } from "../types";
import {
  parseHostedHeaders,
  validateHostedStatus,
  validateHostedURLPath
} from "../utils/listenerHosted";
import {
  CompactButton,
  CompactCheckbox,
  CompactFormGrid,
  CompactFormRow,
  CompactInput,
  CompactNumberInput,
  CompactSelect,
  CompactTextArea,
  DesktopModal
} from "./desktop";

export interface HostedFileEditorTarget {
  listenerName?: string;
  urlPath?: string;
  file?: TeamHTTPHostedFile;
  notFound?: boolean;
  configVersion?: number;
}

interface HostedFileModalProps {
  isOpen: boolean;
  listeners: Listener[];
  initial?: HostedFileEditorTarget;
  onClose: () => void;
  onLoad: (listenerName: string) => Promise<TeamListenerHostedConfiguration>;
  onAdd: (request: TeamListenerHostedAddRequest) => Promise<TeamListenerHostedConfiguration>;
  onSetNotFound: (request: TeamListenerHostedNotFoundSetRequest) => Promise<TeamListenerHostedConfiguration>;
}

const formatHeaders = (headers?: Record<string, string>) => JSON.stringify(headers || {}, null, 2);

export const HostedFileModal: React.FC<HostedFileModalProps> = ({
  isOpen,
  listeners,
  initial,
  onClose,
  onLoad,
  onAdd,
  onSetNotFound
}) => {
  const httpListeners = [...listeners]
    .filter(listener => listener.driver.trim().toLowerCase() === "http")
    .sort((left, right) => left.name.localeCompare(right.name, undefined, { sensitivity: "base" }));
  const httpListenerKey = httpListeners.map(listener => listener.uuid).join("|");
  const [listenerName, setListenerName] = useState("");
  const [sourcePath, setSourcePath] = useState("");
  const [urlPath, setURLPath] = useState("/");
  const [status, setStatus] = useState("200");
  const [headersText, setHeadersText] = useState("{}");
  const [notFound, setNotFound] = useState(false);
  const [configVersion, setConfigVersion] = useState(0);
  const [configurationLoaded, setConfigurationLoaded] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const loadIDRef = useRef(0);
  const isEditing = Boolean(initial?.file);

  const loadConfiguration = async (name: string) => {
    const loadID = ++loadIDRef.current;
    setConfigurationLoaded(false);
    setConfigVersion(0);
    if (!name) return;
    setIsLoading(true);
    setError("");
    try {
      const configuration = await onLoad(name);
      if (loadID !== loadIDRef.current) return;
      setConfigVersion(configuration.config_version);
      setConfigurationLoaded(true);
    } catch (loadError) {
      if (loadID === loadIDRef.current) {
        setError(loadError instanceof Error ? loadError.message : String(loadError));
      }
    } finally {
      if (loadID === loadIDRef.current) setIsLoading(false);
    }
  };

  useEffect(() => {
    if (!isOpen) return;
    const selectedListener = initial?.listenerName || httpListeners[0]?.name || "";
    const defaultPage = Boolean(initial?.notFound);
    setListenerName(selectedListener);
    setSourcePath(initial?.file?.source_path || "");
    setURLPath(initial?.urlPath || "/");
    setStatus(String(defaultPage ? 404 : initial?.file?.status || 200));
    setHeadersText(formatHeaders(initial?.file?.headers));
    setNotFound(defaultPage);
    setError("");
    if (initial?.file && initial.configVersion) {
      ++loadIDRef.current;
      setConfigVersion(initial.configVersion);
      setConfigurationLoaded(true);
      setIsLoading(false);
    } else {
      void loadConfiguration(selectedListener);
    }
  }, [isOpen, initial]);

  useEffect(() => {
    if (isOpen && !listenerName && httpListeners[0]) {
      setListenerName(httpListeners[0].name);
      void loadConfiguration(httpListeners[0].name);
    }
  }, [isOpen, httpListenerKey]);

  if (!isOpen) return null;

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    const normalizedSourcePath = sourcePath.trim();
    if (!listenerName) {
      setError("Select an HTTP listener.");
      return;
    }
    if (!normalizedSourcePath || normalizedSourcePath.includes("\0")) {
      setError("A valid TeamServer filesystem path is required.");
      return;
    }
    if (!notFound) {
      const pathError = validateHostedURLPath(urlPath);
      if (pathError) {
        setError(pathError);
        return;
      }
    }
    const statusError = validateHostedStatus(notFound ? "404" : status);
    if (statusError) {
      setError(statusError);
      return;
    }

    let headers: Record<string, string>;
    try {
      headers = parseHostedHeaders(headersText);
    } catch (headerError) {
      setError(headerError instanceof Error ? headerError.message : String(headerError));
      return;
    }

    setIsSaving(true);
    setError("");
    const file: TeamHTTPHostedFile = {
      source_path: normalizedSourcePath,
      status: notFound ? 404 : Number(status),
      headers
    };
    try {
      if (notFound) {
        await onSetNotFound({
          name: listenerName,
          file,
          expected_config_version: configVersion
        });
      } else {
        await onAdd({
          name: listenerName,
          url_path: urlPath,
          file,
          expected_config_version: configVersion
        });
      }
      onClose();
    } catch (saveError) {
      const message = saveError instanceof Error ? saveError.message : String(saveError);
      try {
        const current = await onLoad(listenerName);
        setConfigVersion(current.config_version);
        setConfigurationLoaded(true);
      } catch {
        setConfigurationLoaded(false);
      }
      setError(`${message} The latest hosted configuration was reloaded; review and save again.`);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <DesktopModal
      title={isEditing ? (notFound ? "Edit Default 404 Page" : "Edit Hosted File") : "Host File"}
      subtitle="Serve a TeamServer file directly from an HTTP listener"
      onClose={onClose}
      width="660px"
      footer={
        <>
          <span className="hosted-file-version">
            {configurationLoaded
              ? `Listener config v${configVersion}`
              : isLoading
                ? "Loading configuration…"
                : "Configuration unavailable"}
          </span>
          <CompactButton type="button" onClick={onClose} disabled={isSaving}>Cancel</CompactButton>
          <CompactButton
            type="submit"
            form="hosted-file-form"
            variant="primary"
            disabled={isSaving || isLoading || !configurationLoaded || !listenerName}
          >
            {isSaving ? "Saving…" : isEditing ? "Save Changes" : notFound ? "Set 404 Page" : "Host File"}
          </CompactButton>
        </>
      }
    >
      <form id="hosted-file-form" onSubmit={save} className="hosted-file-form">
        <CompactFormGrid>
          <CompactFormRow
            label="Attached listener"
            htmlFor="hosted-file-listener"
            required
            hint="Hosted-file changes are applied live without restarting the HTTP listener."
          >
            <CompactSelect
              id="hosted-file-listener"
              value={listenerName}
              onChange={event => {
                setListenerName(event.target.value);
                void loadConfiguration(event.target.value);
              }}
              disabled={isEditing || isSaving}
              required
            >
              {httpListeners.length === 0 && <option value="">No HTTP listeners available</option>}
              {listenerName && !httpListeners.some(listener => listener.name === listenerName) && (
                <option value={listenerName} disabled>{listenerName} — listener unavailable</option>
              )}
              {httpListeners.map(listener => (
                <option key={listener.uuid} value={listener.name}>{listener.name} — {listener.uuid}</option>
              ))}
            </CompactSelect>
          </CompactFormRow>

          <CompactFormRow
            label="Default 404 page"
            htmlFor="hosted-file-not-found"
            hint="When enabled, this file is returned with status 404 for any otherwise-unhandled route."
          >
            <label className="compact-check-label">
              <CompactCheckbox
                id="hosted-file-not-found"
                checked={notFound}
                onChange={event => {
                  setNotFound(event.target.checked);
                  setStatus(event.target.checked ? "404" : "200");
                }}
                disabled={isEditing || isSaving}
              />
              Use as the listener&apos;s default 404 response
            </label>
          </CompactFormRow>

          <CompactFormRow
            label="Filesystem path"
            htmlFor="hosted-file-source"
            required
            hint="Path on the TeamServer host. Relative paths resolve beneath its hosted-file directory; absolute paths must remain inside it."
          >
            <CompactInput
              id="hosted-file-source"
              value={sourcePath}
              onChange={event => setSourcePath(event.target.value)}
              placeholder="payloads/implant.bin"
              disabled={isSaving}
              autoFocus
              required
            />
          </CompactFormRow>

          <CompactFormRow
            label="Web server path"
            htmlFor="hosted-file-url"
            required={!notFound}
            hint={notFound ? "A default 404 page has no defined URL route." : "Exact canonical path beginning with /, for example /downloads/implant.bin."}
          >
            <CompactInput
              id="hosted-file-url"
              value={notFound ? "" : urlPath}
              onChange={event => setURLPath(event.target.value)}
              placeholder={notFound ? "Any unmatched route" : "/downloads/implant.bin"}
              disabled={notFound || isEditing || isSaving}
              required={!notFound}
            />
          </CompactFormRow>

          <CompactFormRow
            label="Status code"
            htmlFor="hosted-file-status"
            hint={notFound ? "Default pages always return HTTP 404." : "Defaults to 200; bodyless statuses 204, 205, and 304 are not supported."}
          >
            <CompactNumberInput
              id="hosted-file-status"
              min={200}
              max={599}
              value={notFound ? "404" : status}
              onChange={event => setStatus(event.target.value)}
              disabled={notFound || isSaving}
              required
            />
          </CompactFormRow>

          <CompactFormRow
            label="Custom headers"
            htmlFor="hosted-file-headers"
            hint="JSON object of response header names and string values. Server-controlled headers are rejected."
          >
            <CompactTextArea
              id="hosted-file-headers"
              value={headersText}
              onChange={event => setHeadersText(event.target.value)}
              rows={8}
              spellCheck={false}
              disabled={isSaving}
            />
          </CompactFormRow>
        </CompactFormGrid>

        {isEditing && (
          <p className="desktop-alert desktop-alert--warning">
            Listener and route identity are fixed while editing. Saving replaces the file, status, and headers at this mapping.
          </p>
        )}
        {error && <p role="alert" className="desktop-alert desktop-alert--error">{error}</p>}
      </form>
    </DesktopModal>
  );
};
