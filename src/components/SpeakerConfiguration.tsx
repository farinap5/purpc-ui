import React, { useEffect, useState } from "react";
import type {
  TeamProfile,
  TeamSpeaker,
  TeamSpeakerConfig,
  TeamSpeakerCreateRequest,
  TeamSpeakerUpdateRequest
} from "../api/teamApi";
import {
  clearRedactedSpeakerValues,
  containsRedactedSpeakerValue,
  nanosecondsToSeconds,
  parseExpectedStatuses,
  parseNonNegativeInteger,
  parseSpeakerArrayMap,
  parseSpeakerCookies,
  secondsToNanoseconds,
  SPEAKER_NAME_PATTERN,
  validateRedactedSpeakerValuesReentered,
  validateSpeakerEndpoint,
  validateSpeakerTLS
} from "../utils/speaker";
import {
  CollapsibleSection,
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

interface SpeakerConfigurationProps {
  isOpen: boolean;
  speaker?: TeamSpeaker;
  profiles: TeamProfile[];
  canManage: boolean;
  onClose: () => void;
  onGet: (name: string) => Promise<TeamSpeaker>;
  onCreate: (request: TeamSpeakerCreateRequest) => Promise<TeamSpeaker>;
  onUpdate: (request: TeamSpeakerUpdateRequest) => Promise<TeamSpeaker>;
}

interface SpeakerDraft {
  name: string;
  persistent: boolean;
  replaceConfiguration: boolean;
  allowClearRedacted: boolean;
  profile: string;
  baseURL: string;
  clientHost: string;
  clientHeaders: string;
  clientQuery: string;
  clientCookies: string;
  proxyURL: string;
  useEnvironmentProxy: boolean;
  followRedirects: boolean;
  allowCrossOriginRedirects: boolean;
  maxRedirects: string;
  requestTimeout: string;
  dialTimeout: string;
  tlsHandshakeTimeout: string;
  responseHeaderTimeout: string;
  idleConnectionTimeout: string;
  maxRequestBytes: string;
  maxResponseBytes: string;
  maxResponseHeaderBytes: string;
  maxIdleConnections: string;
  maxIdlePerHost: string;
  disableCompression: boolean;
  reuseConnections: boolean;
  tlsServerName: string;
  rootCAFile: string;
  clientCertFile: string;
  clientKeyFile: string;
  spkiPins: string;
  tlsMinVersion: "1.2" | "1.3";
  insecureSkipVerify: boolean;
  method: string;
  path: string;
  requestHost: string;
  requestHeaders: string;
  requestQuery: string;
  requestCookies: string;
  expectedStatus: string;
  healthEnabled: boolean;
  healthInterval: string;
  failureThreshold: string;
  retryInterval: string;
}

const formatJSON = (value: unknown) => JSON.stringify(value || {}, null, 2);
const asString = (value: number | undefined, fallback: number) => String(value || fallback);

const createDraft = (speaker?: TeamSpeaker): SpeakerDraft => {
  const config = clearRedactedSpeakerValues(speaker?.config || {
    client: { base_url: "" },
    request: { method: "POST", path: "/" }
  });
  const client = config.client;
  const request = config.request;
  const tls = client.tls || {};
  return {
    name: speaker?.name || "",
    persistent: speaker?.persistent ?? true,
    replaceConfiguration: !speaker,
    allowClearRedacted: false,
    profile: config.profile || "",
    baseURL: client.base_url || "",
    clientHost: client.host || "",
    clientHeaders: formatJSON(client.headers),
    clientQuery: formatJSON(client.query),
    clientCookies: formatJSON(client.cookies),
    proxyURL: client.proxy_url || "",
    useEnvironmentProxy: Boolean(client.use_environment_proxy),
    followRedirects: Boolean(client.follow_redirects),
    allowCrossOriginRedirects: Boolean(client.allow_cross_origin_redirects),
    maxRedirects: asString(client.max_redirects, 5),
    requestTimeout: nanosecondsToSeconds(client.request_timeout, "30"),
    dialTimeout: nanosecondsToSeconds(client.dial_timeout, "10"),
    tlsHandshakeTimeout: nanosecondsToSeconds(client.tls_handshake_timeout, "10"),
    responseHeaderTimeout: nanosecondsToSeconds(client.response_header_timeout, "15"),
    idleConnectionTimeout: nanosecondsToSeconds(client.idle_connection_timeout, "90"),
    maxRequestBytes: asString(client.max_request_bytes, 11190488),
    maxResponseBytes: asString(client.max_response_bytes, 11190488),
    maxResponseHeaderBytes: asString(client.max_response_header_bytes, 65536),
    maxIdleConnections: asString(client.max_idle_connections, 100),
    maxIdlePerHost: asString(client.max_idle_per_host, 10),
    disableCompression: Boolean(client.disable_compression),
    reuseConnections: Boolean(client.reuse_connections),
    tlsServerName: tls.server_name || "",
    rootCAFile: tls.root_ca_file || "",
    clientCertFile: tls.client_cert_file || "",
    clientKeyFile: tls.client_key_file || "",
    spkiPins: (tls.spki_sha256_pins || []).join("\n"),
    tlsMinVersion: tls.min_version?.includes("1.3") ? "1.3" : "1.2",
    insecureSkipVerify: Boolean(tls.insecure_skip_verify),
    method: request.method || "POST",
    path: request.path || "/",
    requestHost: request.host || "",
    requestHeaders: formatJSON(request.headers),
    requestQuery: formatJSON(request.query),
    requestCookies: formatJSON(request.cookies),
    expectedStatus: (request.expected_status || []).join(", "),
    healthEnabled: config.healthcheck?.enabled ?? true,
    healthInterval: nanosecondsToSeconds(config.healthcheck?.interval, "30"),
    failureThreshold: asString(config.healthcheck?.failure_threshold, 3),
    retryInterval: nanosecondsToSeconds(config.retry?.interval, "15")
  };
};

const optional = <T,>(value: T, present: boolean) => present ? value : undefined;

const buildConfiguration = (draft: SpeakerDraft): TeamSpeakerConfig => {
  validateSpeakerEndpoint(draft.baseURL, draft.path, draft.proxyURL);
  if (!draft.method.trim() || !/^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/.test(draft.method.trim())) {
    throw new Error("Request method must be a valid HTTP token. Bind implants normally require POST.");
  }
  if (draft.allowCrossOriginRedirects && !draft.followRedirects) {
    throw new Error("Cross-origin redirects require redirects to be enabled.");
  }

  const clientHeaders = parseSpeakerArrayMap(draft.clientHeaders, "Client headers", "header");
  const clientQuery = parseSpeakerArrayMap(draft.clientQuery, "Client query", "query");
  const clientCookies = parseSpeakerCookies(draft.clientCookies, "Client cookies");
  const requestHeaders = parseSpeakerArrayMap(draft.requestHeaders, "Request headers", "header");
  const requestQuery = parseSpeakerArrayMap(draft.requestQuery, "Request query", "query");
  const requestCookies = parseSpeakerCookies(draft.requestCookies, "Request cookies");
  const pins = draft.spkiPins
    .split(/[\n,]/)
    .map(value => value.trim().replace(/^sha256\//i, ""))
    .filter(Boolean);
  validateSpeakerTLS({ clientCertFile: draft.clientCertFile, clientKeyFile: draft.clientKeyFile, pins });

  const failureThreshold = parseNonNegativeInteger(draft.failureThreshold, "Health failure threshold", 100);
  if (failureThreshold !== 0 && failureThreshold < 1) throw new Error("Health failure threshold must be 0 or from 1 through 100.");
  const retryInterval = secondsToNanoseconds(draft.retryInterval, "Retry interval");
  if (retryInterval > 0 && retryInterval < 100_000_000) {
    throw new Error("Retry interval must be 0 for the default or at least 0.1 seconds.");
  }

  const config: TeamSpeakerConfig = {
    profile: optional(draft.profile, Boolean(draft.profile)),
    client: {
      base_url: draft.baseURL.trim(),
      host: optional(draft.clientHost.trim(), Boolean(draft.clientHost.trim())),
      headers: optional(clientHeaders, Object.keys(clientHeaders).length > 0),
      query: optional(clientQuery, Object.keys(clientQuery).length > 0),
      cookies: optional(clientCookies, Object.keys(clientCookies).length > 0),
      proxy_url: optional(draft.proxyURL.trim(), Boolean(draft.proxyURL.trim())),
      use_environment_proxy: draft.useEnvironmentProxy,
      follow_redirects: draft.followRedirects,
      allow_cross_origin_redirects: draft.allowCrossOriginRedirects,
      max_redirects: parseNonNegativeInteger(draft.maxRedirects, "Maximum redirects"),
      request_timeout: secondsToNanoseconds(draft.requestTimeout, "Request timeout"),
      dial_timeout: secondsToNanoseconds(draft.dialTimeout, "Dial timeout"),
      tls_handshake_timeout: secondsToNanoseconds(draft.tlsHandshakeTimeout, "TLS handshake timeout"),
      response_header_timeout: secondsToNanoseconds(draft.responseHeaderTimeout, "Response header timeout"),
      idle_connection_timeout: secondsToNanoseconds(draft.idleConnectionTimeout, "Idle connection timeout"),
      max_request_bytes: parseNonNegativeInteger(draft.maxRequestBytes, "Maximum request bytes"),
      max_response_bytes: parseNonNegativeInteger(draft.maxResponseBytes, "Maximum response bytes"),
      max_response_header_bytes: parseNonNegativeInteger(draft.maxResponseHeaderBytes, "Maximum response header bytes"),
      max_idle_connections: parseNonNegativeInteger(draft.maxIdleConnections, "Maximum idle connections"),
      max_idle_per_host: parseNonNegativeInteger(draft.maxIdlePerHost, "Maximum idle connections per host"),
      disable_compression: draft.disableCompression,
      reuse_connections: draft.reuseConnections,
      tls: {
        server_name: optional(draft.tlsServerName.trim(), Boolean(draft.tlsServerName.trim())),
        root_ca_file: optional(draft.rootCAFile.trim(), Boolean(draft.rootCAFile.trim())),
        client_cert_file: optional(draft.clientCertFile.trim(), Boolean(draft.clientCertFile.trim())),
        client_key_file: optional(draft.clientKeyFile.trim(), Boolean(draft.clientKeyFile.trim())),
        spki_sha256_pins: optional(pins, pins.length > 0),
        min_version: draft.tlsMinVersion,
        insecure_skip_verify: draft.insecureSkipVerify
      }
    },
    request: {
      method: draft.method.trim().toUpperCase(),
      path: draft.path.trim(),
      host: optional(draft.requestHost.trim(), Boolean(draft.requestHost.trim())),
      headers: optional(requestHeaders, Object.keys(requestHeaders).length > 0),
      query: optional(requestQuery, Object.keys(requestQuery).length > 0),
      cookies: optional(requestCookies, Object.keys(requestCookies).length > 0),
      expected_status: optional(parseExpectedStatuses(draft.expectedStatus), Boolean(draft.expectedStatus.trim()))
    },
    healthcheck: {
      enabled: draft.healthEnabled,
      interval: secondsToNanoseconds(draft.healthInterval, "Health interval"),
      failure_threshold: failureThreshold
    },
    retry: {
      interval: retryInterval
    }
  };
  return config;
};

export const SpeakerConfiguration: React.FC<SpeakerConfigurationProps> = ({
  isOpen,
  speaker,
  profiles,
  canManage,
  onClose,
  onGet,
  onCreate,
  onUpdate
}) => {
  const [draft, setDraft] = useState<SpeakerDraft>(() => createDraft(speaker));
  const [baseVersion, setBaseVersion] = useState(0);
  const [conflict, setConflict] = useState<TeamSpeaker | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isReloading, setIsReloading] = useState(false);
  const [error, setError] = useState("");
  const bindProfiles = profiles
    .filter(profile => profile.mode === "bind")
    .sort((left, right) => left.name.localeCompare(right.name, undefined, { sensitivity: "base" }));
  const selectedProfileMissing = Boolean(draft.profile && !bindProfiles.some(profile => profile.name === draft.profile));

  const resetFromSpeaker = (current?: TeamSpeaker) => {
    setDraft(createDraft(current));
    setBaseVersion(current?.config_version || 0);
    setConflict(null);
    setError("");
  };

  useEffect(() => {
    if (isOpen) resetFromSpeaker(speaker);
  }, [isOpen, speaker?.uuid]);

  useEffect(() => {
    if (isOpen && speaker && baseVersion > 0 && speaker.config_version !== baseVersion && !isSaving) {
      setConflict(speaker);
      setError("This speaker changed on the TeamServer. Load the latest version before saving.");
    }
  }, [isOpen, speaker?.config_version, baseVersion, isSaving]);

  if (!isOpen) return null;

  const set = <K extends keyof SpeakerDraft>(key: K, value: SpeakerDraft[K]) => {
    setDraft(current => ({ ...current, [key]: value }));
    setError("");
  };

  const loadLatest = async () => {
    if (!speaker) return;
    setIsReloading(true);
    try {
      resetFromSpeaker(await onGet(speaker.name));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : String(loadError));
    } finally {
      setIsReloading(false);
    }
  };

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canManage) {
      setError("Only an administrator can create or update speakers.");
      return;
    }
    const name = draft.name.trim();
    if (!SPEAKER_NAME_PATTERN.test(name)) {
      setError("Speaker name must contain 1–64 letters, numbers, dots, underscores, or hyphens.");
      return;
    }
    if (speaker && speaker.state !== "stopped") {
      setError("Stop the speaker before editing its configuration.");
      return;
    }
    if (conflict) {
      setError("Load the latest TeamServer version before reconciling this edit.");
      return;
    }

    try {
      const config = !speaker || draft.replaceConfiguration ? buildConfiguration(draft) : undefined;
      if (speaker && config && containsRedactedSpeakerValue(speaker.config) && !draft.allowClearRedacted) {
        validateRedactedSpeakerValuesReentered(speaker.config, config);
      }
      setIsSaving(true);
      setError("");
      if (!speaker) {
        await onCreate({ name, persistent: draft.persistent, config: config! });
      } else {
        const request: TeamSpeakerUpdateRequest = {
          name: speaker.name,
          expected_config_version: baseVersion
        };
        if (name !== speaker.name) request.new_name = name;
        if (draft.persistent !== speaker.persistent) request.persistent = draft.persistent;
        if (config) request.config = config;
        if (!request.new_name && request.persistent === undefined && !request.config) {
          setError("No speaker changes to save.");
          setIsSaving(false);
          return;
        }
        await onUpdate(request);
      }
      setDraft(createDraft());
      onClose();
    } catch (saveError) {
      if (speaker) {
        try {
          const current = await onGet(speaker.name);
          if (current.config_version !== baseVersion) setConflict(current);
        } catch {
          // Preserve the original server error when reconciliation cannot be loaded.
        }
      }
      setError(saveError instanceof Error ? saveError.message : String(saveError));
    } finally {
      setIsSaving(false);
    }
  };

  const footerStatus = speaker ? `Speaker config v${baseVersion}` : "Creates a stopped speaker";

  return (
    <DesktopModal
      title={speaker ? `Edit Speaker: ${speaker.name}` : "New Speaker"}
      subtitle="Outbound HTTP worker for a bind-mode implant"
      onClose={onClose}
      width="980px"
      footer={
        <>
          <span className="speaker-config-version">{footerStatus}</span>
          <CompactButton type="button" onClick={onClose} disabled={isSaving}>Cancel</CompactButton>
          <CompactButton
            type="submit"
            form="speaker-configuration-form"
            variant="primary"
            disabled={isSaving || isReloading || !canManage || Boolean(conflict) || Boolean(speaker && speaker.state !== "stopped")}
          >
            {isSaving ? "Saving…" : speaker ? "Save Speaker" : "Create Speaker"}
          </CompactButton>
        </>
      }
    >
      <form id="speaker-configuration-form" className="speaker-configuration-form" onSubmit={save}>
        {!canManage && (
          <p className="desktop-alert desktop-alert--warning">Speaker mutations are restricted to the TeamServer administrator.</p>
        )}
        {conflict && (
          <div className="desktop-alert desktop-alert--warning speaker-conflict-alert">
            <span>The speaker changed on the TeamServer (now v{conflict.config_version}). Load it before reconciling your edit.</span>
            <CompactButton type="button" variant="secondary" onClick={() => void loadLatest()} disabled={isReloading}>
              {isReloading ? "Loading…" : "Load Latest"}
            </CompactButton>
          </div>
        )}
        {error && <p role="alert" className="desktop-alert desktop-alert--error">{error}</p>}

        <CompactFormGrid>
          <CompactFormRow label="Name" htmlFor="speaker-name" required hint="1–64 letters, numbers, dots, underscores, or hyphens.">
            <CompactInput id="speaker-name" value={draft.name} onChange={event => set("name", event.target.value)} disabled={isSaving} autoFocus required />
          </CompactFormRow>
          <CompactFormRow label="Persistence" htmlFor="speaker-persistent" hint="Persistent speakers survive TeamServer restarts.">
            <label className="compact-check-label">
              <CompactCheckbox id="speaker-persistent" checked={draft.persistent} onChange={event => set("persistent", event.target.checked)} disabled={isSaving} />
              Persist this speaker
            </label>
          </CompactFormRow>
          {speaker && (
            <CompactFormRow label="Transport configuration" htmlFor="speaker-replace-config" hint="Leave disabled for a safe rename-only or persistence-only update.">
              <label className="compact-check-label">
                <CompactCheckbox
                  id="speaker-replace-config"
                  checked={draft.replaceConfiguration}
                  onChange={event => set("replaceConfiguration", event.target.checked)}
                  disabled={isSaving}
                />
                Replace the complete HTTP/TLS configuration
              </label>
            </CompactFormRow>
          )}
        </CompactFormGrid>

        {(!speaker || draft.replaceConfiguration) && (
          <>
            {speaker && containsRedactedSpeakerValue(speaker.config) && (
              <div className="desktop-alert desktop-alert--warning">
                <p>
                  The TeamServer redacts header, query, cookie, proxy, and client-key values. Their names are retained below,
                  but every redacted value must be re-entered before the complete configuration can be replaced.
                </p>
                <label className="compact-check-label danger-check-label">
                  <CompactCheckbox
                    checked={draft.allowClearRedacted}
                    onChange={event => set("allowClearRedacted", event.target.checked)}
                    disabled={isSaving}
                  />
                  I understand redacted values not re-entered will be cleared or replaced with blank values
                </label>
              </div>
            )}

            <CollapsibleSection title="Endpoint and request" open>
              <CompactFormGrid>
                <CompactFormRow label="Bind profile" htmlFor="speaker-profile" hint="Optional bind-mode implant profile used for payload and OTS validation.">
                  <CompactSelect id="speaker-profile" value={draft.profile} onChange={event => set("profile", event.target.value)} disabled={isSaving}>
                    <option value="">No profile</option>
                    {selectedProfileMissing && <option value={draft.profile} disabled>{draft.profile} — unavailable or not bind mode</option>}
                    {bindProfiles.map(profile => <option key={profile.name} value={profile.name}>{profile.name} — {profile.type}</option>)}
                  </CompactSelect>
                </CompactFormRow>
                <CompactFormRow label="Base URL" htmlFor="speaker-base-url" required hint="HTTP or HTTPS origin of the bind implant; credentials and fragments are forbidden.">
                  <CompactInput id="speaker-base-url" type="url" value={draft.baseURL} onChange={event => set("baseURL", event.target.value)} placeholder="https://10.20.30.40:8443" disabled={isSaving} required />
                </CompactFormRow>
                <CompactFormRow label="Method" htmlFor="speaker-method" required hint="The standard bind implant requires POST.">
                  <CompactInput id="speaker-method" value={draft.method} onChange={event => set("method", event.target.value)} placeholder="POST" disabled={isSaving} required />
                </CompactFormRow>
                <CompactFormRow label="Path" htmlFor="speaker-path" required hint="Relative to the base URL. Use / for the standard bind payload.">
                  <CompactInput id="speaker-path" value={draft.path} onChange={event => set("path", event.target.value)} placeholder="/" disabled={isSaving} required />
                </CompactFormRow>
                <CompactFormRow label="Request Host" htmlFor="speaker-request-host" hint="Optional Host header override. Do not place Host in the header JSON.">
                  <CompactInput id="speaker-request-host" value={draft.requestHost} onChange={event => set("requestHost", event.target.value)} disabled={isSaving} />
                </CompactFormRow>
                <CompactFormRow label="Expected statuses" htmlFor="speaker-expected-status" hint="Optional comma-separated strict list. Empty accepts any 2xx response, including terminating 204 responses.">
                  <CompactInput id="speaker-expected-status" value={draft.expectedStatus} onChange={event => set("expectedStatus", event.target.value)} placeholder="200, 204" disabled={isSaving} />
                </CompactFormRow>
              </CompactFormGrid>
            </CollapsibleSection>

            <CollapsibleSection title="Health and retry" open>
              <CompactFormGrid>
                <CompactFormRow label="Background health" htmlFor="speaker-health-enabled" hint="Task-triggered checks remain enabled when background health is disabled.">
                  <label className="compact-check-label">
                    <CompactCheckbox id="speaker-health-enabled" checked={draft.healthEnabled} onChange={event => set("healthEnabled", event.target.checked)} disabled={isSaving} />
                    Enable periodic health requests
                  </label>
                </CompactFormRow>
                <CompactFormRow label="Health interval (seconds)" htmlFor="speaker-health-interval">
                  <CompactNumberInput id="speaker-health-interval" min="0" step="0.000000001" value={draft.healthInterval} onChange={event => set("healthInterval", event.target.value)} disabled={isSaving} />
                </CompactFormRow>
                <CompactFormRow label="Failure threshold" htmlFor="speaker-failure-threshold" hint="0 selects the default; explicit values are 1–100.">
                  <CompactNumberInput id="speaker-failure-threshold" min="0" max="100" step="1" value={draft.failureThreshold} onChange={event => set("failureThreshold", event.target.value)} disabled={isSaving} />
                </CompactFormRow>
                <CompactFormRow label="Retry interval (seconds)" htmlFor="speaker-retry-interval" hint="0 selects the 15-second default; custom values must be at least 0.1 seconds.">
                  <CompactNumberInput id="speaker-retry-interval" min="0" step="0.000000001" value={draft.retryInterval} onChange={event => set("retryInterval", event.target.value)} disabled={isSaving} />
                </CompactFormRow>
              </CompactFormGrid>
            </CollapsibleSection>

            <CollapsibleSection title="Request values">
              <CompactFormGrid>
                <CompactFormRow label="Headers (JSON)" htmlFor="speaker-request-headers" hint="Object values are string arrays. Host and X-PurpleCommand-Exchange are reserved.">
                  <CompactTextArea id="speaker-request-headers" value={draft.requestHeaders} onChange={event => set("requestHeaders", event.target.value)} rows={6} spellCheck={false} disabled={isSaving} />
                </CompactFormRow>
                <CompactFormRow label="Query (JSON)" htmlFor="speaker-request-query" hint="Object values are string arrays and replace matching client defaults.">
                  <CompactTextArea id="speaker-request-query" value={draft.requestQuery} onChange={event => set("requestQuery", event.target.value)} rows={6} spellCheck={false} disabled={isSaving} />
                </CompactFormRow>
                <CompactFormRow label="Cookies (JSON)" htmlFor="speaker-request-cookies" hint="Object values are strings and replace matching client defaults.">
                  <CompactTextArea id="speaker-request-cookies" value={draft.requestCookies} onChange={event => set("requestCookies", event.target.value)} rows={6} spellCheck={false} disabled={isSaving} />
                </CompactFormRow>
              </CompactFormGrid>
            </CollapsibleSection>

            <CollapsibleSection title="HTTP client defaults">
              <CompactFormGrid>
                <CompactFormRow label="Client Host" htmlFor="speaker-client-host" hint="Default Host override; the request-level value takes precedence.">
                  <CompactInput id="speaker-client-host" value={draft.clientHost} onChange={event => set("clientHost", event.target.value)} disabled={isSaving} />
                </CompactFormRow>
                <CompactFormRow label="Headers (JSON)" htmlFor="speaker-client-headers" hint="Object values are string arrays.">
                  <CompactTextArea id="speaker-client-headers" value={draft.clientHeaders} onChange={event => set("clientHeaders", event.target.value)} rows={6} spellCheck={false} disabled={isSaving} />
                </CompactFormRow>
                <CompactFormRow label="Query (JSON)" htmlFor="speaker-client-query" hint="Object values are string arrays.">
                  <CompactTextArea id="speaker-client-query" value={draft.clientQuery} onChange={event => set("clientQuery", event.target.value)} rows={6} spellCheck={false} disabled={isSaving} />
                </CompactFormRow>
                <CompactFormRow label="Cookies (JSON)" htmlFor="speaker-client-cookies" hint="Object values are strings.">
                  <CompactTextArea id="speaker-client-cookies" value={draft.clientCookies} onChange={event => set("clientCookies", event.target.value)} rows={6} spellCheck={false} disabled={isSaving} />
                </CompactFormRow>
              </CompactFormGrid>
            </CollapsibleSection>

            <CollapsibleSection title="Proxy and redirects">
              <CompactFormGrid>
                <CompactFormRow label="Proxy URL" htmlFor="speaker-proxy-url" hint="Optional http, https, socks5, or socks5h proxy. Credentials are redacted after saving.">
                  <CompactInput id="speaker-proxy-url" value={draft.proxyURL} onChange={event => set("proxyURL", event.target.value)} autoComplete="off" disabled={isSaving} />
                </CompactFormRow>
                <CompactFormRow label="Proxy source" htmlFor="speaker-environment-proxy">
                  <label className="compact-check-label">
                    <CompactCheckbox id="speaker-environment-proxy" checked={draft.useEnvironmentProxy} onChange={event => set("useEnvironmentProxy", event.target.checked)} disabled={isSaving} />
                    Use TeamServer environment proxy settings
                  </label>
                </CompactFormRow>
                <CompactFormRow label="Redirects" htmlFor="speaker-follow-redirects">
                  <div className="speaker-checkbox-group">
                    <label className="compact-check-label"><CompactCheckbox id="speaker-follow-redirects" checked={draft.followRedirects} onChange={event => set("followRedirects", event.target.checked)} disabled={isSaving} />Follow redirects</label>
                    <label className="compact-check-label"><CompactCheckbox checked={draft.allowCrossOriginRedirects} onChange={event => set("allowCrossOriginRedirects", event.target.checked)} disabled={isSaving || !draft.followRedirects} />Allow cross-origin redirects</label>
                  </div>
                </CompactFormRow>
                <CompactFormRow label="Maximum redirects" htmlFor="speaker-max-redirects">
                  <CompactNumberInput id="speaker-max-redirects" min="0" step="1" value={draft.maxRedirects} onChange={event => set("maxRedirects", event.target.value)} disabled={isSaving || !draft.followRedirects} />
                </CompactFormRow>
              </CompactFormGrid>
            </CollapsibleSection>

            <CollapsibleSection title="Timeouts and limits">
              <CompactFormGrid>
                {([
                  ["requestTimeout", "Request timeout", "30"],
                  ["dialTimeout", "Dial timeout", "10"],
                  ["tlsHandshakeTimeout", "TLS handshake timeout", "10"],
                  ["responseHeaderTimeout", "Response header timeout", "15"],
                  ["idleConnectionTimeout", "Idle connection timeout", "90"]
                ] as const).map(([key, label, placeholder]) => (
                  <CompactFormRow key={key} label={`${label} (seconds)`} htmlFor={`speaker-${key}`}>
                    <CompactNumberInput id={`speaker-${key}`} min="0" step="0.000000001" value={draft[key]} onChange={event => set(key, event.target.value)} placeholder={placeholder} disabled={isSaving} />
                  </CompactFormRow>
                ))}
                {([
                  ["maxRequestBytes", "Maximum request bytes"],
                  ["maxResponseBytes", "Maximum response bytes"],
                  ["maxResponseHeaderBytes", "Maximum response header bytes"],
                  ["maxIdleConnections", "Maximum idle connections"],
                  ["maxIdlePerHost", "Maximum idle connections per host"]
                ] as const).map(([key, label]) => (
                  <CompactFormRow key={key} label={label} htmlFor={`speaker-${key}`}>
                    <CompactNumberInput id={`speaker-${key}`} min="0" step="1" value={draft[key]} onChange={event => set(key, event.target.value)} disabled={isSaving} />
                  </CompactFormRow>
                ))}
                <CompactFormRow label="HTTP behavior">
                  <div className="speaker-checkbox-group">
                    <label className="compact-check-label"><CompactCheckbox checked={draft.disableCompression} onChange={event => set("disableCompression", event.target.checked)} disabled={isSaving} />Disable compression</label>
                    <label className="compact-check-label"><CompactCheckbox checked={draft.reuseConnections} onChange={event => set("reuseConnections", event.target.checked)} disabled={isSaving} />Reuse HTTP connections</label>
                  </div>
                </CompactFormRow>
              </CompactFormGrid>
            </CollapsibleSection>

            <CollapsibleSection title="TLS">
              <CompactFormGrid>
                <CompactFormRow label="Server name" htmlFor="speaker-tls-server-name"><CompactInput id="speaker-tls-server-name" value={draft.tlsServerName} onChange={event => set("tlsServerName", event.target.value)} disabled={isSaving} /></CompactFormRow>
                <CompactFormRow label="Root CA file" htmlFor="speaker-root-ca"><CompactInput id="speaker-root-ca" value={draft.rootCAFile} onChange={event => set("rootCAFile", event.target.value)} disabled={isSaving} /></CompactFormRow>
                <CompactFormRow label="Client certificate" htmlFor="speaker-client-cert"><CompactInput id="speaker-client-cert" value={draft.clientCertFile} onChange={event => set("clientCertFile", event.target.value)} disabled={isSaving} /></CompactFormRow>
                <CompactFormRow label="Client key" htmlFor="speaker-client-key" hint="Required with a client certificate and redacted after saving."><CompactInput id="speaker-client-key" value={draft.clientKeyFile} onChange={event => set("clientKeyFile", event.target.value)} autoComplete="off" disabled={isSaving} /></CompactFormRow>
                <CompactFormRow label="SPKI SHA-256 pins" htmlFor="speaker-spki-pins" hint="One hexadecimal or base64 pin per line; sha256/ prefix is optional."><CompactTextArea id="speaker-spki-pins" value={draft.spkiPins} onChange={event => set("spkiPins", event.target.value)} rows={5} spellCheck={false} disabled={isSaving} /></CompactFormRow>
                <CompactFormRow label="Minimum TLS version" htmlFor="speaker-tls-min-version"><CompactSelect id="speaker-tls-min-version" value={draft.tlsMinVersion} onChange={event => set("tlsMinVersion", event.target.value as "1.2" | "1.3")} disabled={isSaving}><option value="1.2">TLS 1.2</option><option value="1.3">TLS 1.3</option></CompactSelect></CompactFormRow>
                <CompactFormRow label="Certificate verification" htmlFor="speaker-insecure-tls"><label className="compact-check-label danger-check-label"><CompactCheckbox id="speaker-insecure-tls" checked={draft.insecureSkipVerify} onChange={event => set("insecureSkipVerify", event.target.checked)} disabled={isSaving} />Skip TLS certificate verification</label></CompactFormRow>
              </CompactFormGrid>
            </CollapsibleSection>
          </>
        )}
      </form>
    </DesktopModal>
  );
};
