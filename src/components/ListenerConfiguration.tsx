import { useEffect, useMemo, useState, type FormEvent } from "react";
import type {
  TeamListenerCarrierDefinition,
  TeamListenerCreateRequest,
  TeamListenerDriverDefinition,
  TeamListenerOptionDefinition,
  TeamListenerRoute
} from "../api/teamApi";
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
  DesktopModal,
  DesktopPanel,
  PanelHeader
} from "./desktop";

type OptionDraftValue = string | boolean;
type OptionDraft = Record<string, OptionDraftValue>;
type RoutePurpose = "callback" | "interactive";
type RouteMatchMode = "none" | "path" | "path_prefix";
type RouteCarrierDirection = "inbound" | "outbound";

interface ListenerRouteDraft {
  key: string;
  id: string;
  purpose: RoutePurpose;
  priority: string;
  matchMode: RouteMatchMode;
  matchValue: string;
  matchHost: string;
  methods: string;
  extensions: string;
  sessionSource: "" | "query" | "header" | "cookie";
  sessionName: string;
  responseStatus: string;
  responseNilStatus: string;
  responseHeaders: string;
  noTaskBody: string;
  streamQuery: string;
  inboundType: string;
  inboundOptions: OptionDraft;
  outboundType: string;
  outboundOptions: OptionDraft;
}

interface ListenerConfigurationProps {
  isOpen: boolean;
  isConnected: boolean;
  onClose: () => void;
  onListDrivers: () => Promise<TeamListenerDriverDefinition[]>;
  onGetDriver: (name: string) => Promise<TeamListenerDriverDefinition>;
  onListCarriers: () => Promise<TeamListenerCarrierDefinition[]>;
  onCreate: (request: TeamListenerCreateRequest) => Promise<void>;
}

const hasDefault = (definition: TeamListenerOptionDefinition) =>
  Object.prototype.hasOwnProperty.call(definition, "default");

const optionDraftValue = (definition: TeamListenerOptionDefinition): OptionDraftValue => {
  const value = hasDefault(definition) ? definition.default : undefined;
  if (definition.type === "boolean") return typeof value === "boolean" ? value : false;
  if (definition.type === "string_list") return Array.isArray(value) ? value.join("\n") : "";
  if (definition.type === "string_map" || definition.type === "object") {
    return value && typeof value === "object" ? JSON.stringify(value, null, 2) : "{}";
  }
  if (value === undefined || value === null) return "";
  return String(value);
};

const createOptionDraft = (definitions: TeamListenerOptionDefinition[] = []): OptionDraft =>
  Object.fromEntries(definitions.map(definition => [definition.key, optionDraftValue(definition)]));

const setDottedValue = (target: Record<string, unknown>, path: string, value: unknown) => {
  const segments = path.split(".").filter(Boolean);
  let current = target;
  segments.forEach((segment, index) => {
    if (index === segments.length - 1) {
      current[segment] = value;
      return;
    }
    const nested = current[segment];
    if (!nested || typeof nested !== "object" || Array.isArray(nested)) current[segment] = {};
    current = current[segment] as Record<string, unknown>;
  });
};

const parseObjectValue = (value: string, label: string) => {
  if (!value.trim()) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error(`${label} must be a valid JSON object.`);
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`${label} must be a JSON object.`);
  }
  return parsed as Record<string, unknown>;
};

const parseOptionDraft = (
  definitions: TeamListenerOptionDefinition[] = [],
  draft: OptionDraft,
  context: string
) => {
  const options: Record<string, unknown> = {};

  definitions.forEach(definition => {
    const raw = draft[definition.key] ?? optionDraftValue(definition);
    const label = `${context} ${definition.key}`;
    let value: unknown;

    if (definition.type === "boolean") {
      value = raw === true;
    } else {
      const text = String(raw);
      if (definition.type === "integer") {
        if (!text.trim()) {
          if (definition.required || hasDefault(definition)) throw new Error(`${label} is required.`);
          return;
        }
        if (!/^-?\d+$/.test(text.trim())) throw new Error(`${label} must be an integer.`);
        value = Number(text);
        if (!Number.isSafeInteger(value)) throw new Error(`${label} is outside the supported integer range.`);
      } else if (definition.type === "string_list") {
        value = text.split(/[\n,]/).map(item => item.trim()).filter(Boolean);
      } else if (definition.type === "string_map" || definition.type === "object") {
        value = parseObjectValue(text, label);
        if (definition.type === "string_map" && Object.values(value as Record<string, unknown>).some(item => typeof item !== "string")) {
          throw new Error(`${label} values must all be strings.`);
        }
      } else {
        value = definition.type === "secret" ? text : text.trim();
        if (!value && definition.required) throw new Error(`${label} is required.`);
        if (!value && !hasDefault(definition)) return;
      }
    }
    setDottedValue(options, definition.key, value);
  });

  return options;
};

const readNestedValue = (source: Record<string, unknown>, path: string) => {
  let current: unknown = source;
  for (const segment of path.split(".")) {
    if (!current || typeof current !== "object" || Array.isArray(current)) return undefined;
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
};

const validateHTTPOptions = (options: Record<string, unknown>) => {
  const validatePort = (key: string, required: boolean) => {
    const value = readNestedValue(options, key);
    if ((value === undefined || value === "") && !required) return;
    const text = String(value ?? "");
    if (!/^\d+$/.test(text) || Number(text) < 0 || Number(text) > 65535) {
      throw new Error(`${key} must be a port from 0 through 65535.`);
    }
  };
  validatePort("bind.port", true);
  validatePort("advertise.port", false);

  ["timeouts.read_header", "timeouts.read", "timeouts.write", "timeouts.idle"].forEach(key => {
    const value = readNestedValue(options, key);
    if (value === undefined || value === "") return;
    const duration = String(value);
    const parts = duration.match(/\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h)/g);
    if (!parts || parts.join("") !== duration || !parts.some(part => Number.parseFloat(part) > 0)) {
      throw new Error(`${key} must be a positive Go duration such as 5s or 1m30s.`);
    }
  });

  const validateSize = (key: string, minimum: number, maximum: number) => {
    const value = readNestedValue(options, key);
    if (typeof value !== "number" || value < minimum || value > maximum) {
      throw new Error(`${key} must be between ${minimum.toLocaleString()} and ${maximum.toLocaleString()} bytes.`);
    }
  };
  validateSize("max_body_bytes", 1, 67_108_864);
  validateSize("max_header_bytes", 1_024, 1_048_576);

  const tlsEnabled = readNestedValue(options, "tls.enabled") === true;
  const certificatePath = String(readNestedValue(options, "tls.cert_file") ?? "").trim();
  const keyPath = String(readNestedValue(options, "tls.key_file") ?? "").trim();
  if (tlsEnabled && (!certificatePath || !keyPath)) {
    throw new Error("TLS requires both certificate and key paths on the TeamServer host.");
  }
  if (!tlsEnabled && (certificatePath || keyPath)) {
    throw new Error("Enable TLS before supplying certificate or key paths.");
  }

  const headers = readNestedValue(options, "response_headers");
  const forbiddenHeaders = new Set([
    "connection", "content-length", "keep-alive", "proxy-authenticate", "proxy-authorization",
    "te", "trailer", "transfer-encoding", "upgrade"
  ]);
  if (headers && typeof headers === "object" && !Array.isArray(headers)) {
    Object.entries(headers as Record<string, unknown>).forEach(([headerName, value]) => {
      if (!headerName.trim() || /[\r\n]/.test(headerName) || /[\r\n]/.test(String(value))) {
        throw new Error("Response header names and values may not contain line breaks.");
      }
      if (forbiddenHeaders.has(headerName.trim().toLowerCase())) {
        throw new Error(`${headerName} is controlled by the HTTP server and cannot be configured.`);
      }
    });
  }
};

const splitNormalizedList = (value: string) =>
  value.split(/[\n,]/).map(item => item.trim()).filter(Boolean);

const validateResponseHeaders = (headers: Record<string, unknown>, context: string) => {
  const forbiddenHeaders = new Set([
    "connection", "content-length", "keep-alive", "proxy-authenticate", "proxy-authorization",
    "te", "trailer", "transfer-encoding", "upgrade"
  ]);
  Object.entries(headers).forEach(([headerName, value]) => {
    if (typeof value !== "string") throw new Error(`${context} header values must be strings.`);
    if (!headerName.trim() || /[\r\n]/.test(headerName) || /[\r\n]/.test(value)) {
      throw new Error(`${context} header names and values may not contain line breaks.`);
    }
    if (forbiddenHeaders.has(headerName.trim().toLowerCase())) {
      throw new Error(`${context} header ${headerName} is controlled by the HTTP server.`);
    }
  });
};

const validateCarrierOptions = (type: string, options: Record<string, unknown>, context: string) => {
  if (type === "header" || type === "cookie") {
    const name = String(options.name ?? "").trim();
    if (!/^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/.test(name)) {
      throw new Error(`${context} ${type} name must be a valid HTTP token.`);
    }
  }
  if (type === "image" && options.template_base64) {
    let decoded: string;
    try {
      decoded = atob(String(options.template_base64));
    } catch {
      throw new Error(`${context} image template must be valid base64.`);
    }
    if (decoded.length > 4 * 1024 * 1024) throw new Error(`${context} image template exceeds 4 MiB.`);
    const pngSignature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
    if (decoded.length < pngSignature.length || pngSignature.some((byte, index) => decoded.charCodeAt(index) !== byte)) {
      throw new Error(`${context} image template must decode to a PNG.`);
    }
  }
};

const createRouteKey = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random()}`;

const createRouteDraft = (carriers: TeamListenerCarrierDefinition[], index: number): ListenerRouteDraft => {
  const inbound = carriers.find(carrier => carrier.id === "body") || carriers[0];
  const outbound = carriers.find(carrier => carrier.id === "body") || carriers.find(carrier => carrier.id !== "query") || carriers[0];
  return {
    key: createRouteKey(), id: `route-${index}`, purpose: "callback", priority: "0",
    matchMode: "none", matchValue: "", matchHost: "", methods: "", extensions: "",
    sessionSource: "", sessionName: "", responseStatus: "", responseNilStatus: "",
    responseHeaders: "{}", noTaskBody: "", streamQuery: "stream",
    inboundType: inbound?.id || "", inboundOptions: createOptionDraft(inbound?.options),
    outboundType: outbound?.id || "", outboundOptions: createOptionDraft(outbound?.options)
  };
};

const parseOptionalStatus = (value: string, label: string) => {
  if (!value.trim()) return undefined;
  if (!/^\d+$/.test(value.trim())) throw new Error(`${label} must be an integer from 100 through 599.`);
  const status = Number(value);
  if (status < 100 || status > 599) throw new Error(`${label} must be from 100 through 599.`);
  return status;
};

const buildRoute = (
  route: ListenerRouteDraft,
  carriersByID: Map<string, TeamListenerCarrierDefinition>
): TeamListenerRoute => {
  const id = route.id.trim();
  if (!id) throw new Error("Every custom route requires a non-empty ID.");
  if (!/^-?\d+$/.test(route.priority.trim())) throw new Error(`Route ${id} priority must be an integer.`);

  const match: Record<string, unknown> = {};
  if (route.matchMode !== "none") {
    const value = route.matchValue.trim();
    if (!value.startsWith("/")) throw new Error(`Route ${id} path must start with /.`);
    match[route.matchMode] = value;
  }
  if (route.matchHost.trim()) match.host = route.matchHost.trim();
  const methods = splitNormalizedList(route.methods).map(method => method.toUpperCase());
  if (methods.length > 0) match.methods = methods;
  const extensions = splitNormalizedList(route.extensions).map(extension => {
    const normalized = extension.toLowerCase();
    return normalized.startsWith(".") ? normalized : `.${normalized}`;
  });
  if (extensions.length > 0) match.extensions = extensions;

  const routeOptions: Record<string, unknown> = {};
  if (route.purpose === "callback") {
    if (route.sessionSource) {
      const name = route.sessionName.trim();
      if (!name) throw new Error(`Route ${id} session ${route.sessionSource} requires a name.`);
      routeOptions.session = { source: route.sessionSource, name };
    }
    const response: Record<string, unknown> = {};
    const status = parseOptionalStatus(route.responseStatus, `Route ${id} response status`);
    const nilStatus = parseOptionalStatus(route.responseNilStatus, `Route ${id} no-task status`);
    if (status !== undefined) response.status = status;
    if (nilStatus !== undefined) response.nil_status = nilStatus;
    const headers = parseObjectValue(route.responseHeaders, `Route ${id} response headers`);
    validateResponseHeaders(headers, `Route ${id} response`);
    if (Object.keys(headers).length > 0) response.headers = headers;
    if (route.noTaskBody) response.no_task_body = route.noTaskBody;
    if (Object.keys(response).length > 0) routeOptions.response = response;
  } else if (route.streamQuery.trim()) {
    routeOptions.stream_query = route.streamQuery.trim();
  }

  const inbound = carriersByID.get(route.inboundType);
  const outbound = carriersByID.get(route.outboundType);
  if (!inbound || !outbound) throw new Error(`Route ${id} requires valid inbound and outbound carriers.`);
  if (outbound.id === "query") throw new Error(`Route ${id} cannot use query as an outbound carrier.`);
  const inboundOptions = parseOptionDraft(inbound.options, route.inboundOptions, `Route ${id} inbound carrier`);
  const outboundOptions = parseOptionDraft(outbound.options, route.outboundOptions, `Route ${id} outbound carrier`);
  validateCarrierOptions(inbound.id, inboundOptions, `Route ${id} inbound carrier`);
  validateCarrierOptions(outbound.id, outboundOptions, `Route ${id} outbound carrier`);

  return {
    id,
    purpose: route.purpose,
    priority: Number(route.priority),
    ...(Object.keys(match).length > 0 ? { match } : {}),
    ...(Object.keys(routeOptions).length > 0 ? { options: routeOptions } : {}),
    inbound: { type: inbound.id, options: inboundOptions },
    outbound: { type: outbound.id, options: outboundOptions }
  };
};

interface OptionFieldsProps {
  definitions?: TeamListenerOptionDefinition[];
  values: OptionDraft;
  idPrefix: string;
  onChange: (key: string, value: OptionDraftValue) => void;
}

function OptionFields({ definitions = [], values, idPrefix, onChange }: OptionFieldsProps) {
  if (definitions.length === 0) return <p className="listener-empty-options">No options are required.</p>;
  return (
    <CompactFormGrid>
      {definitions.map(definition => {
        const id = `${idPrefix}-${definition.key.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
        const value = values[definition.key] ?? optionDraftValue(definition);
        const typeHint = definition.type === "string_list"
          ? "One value per line."
          : definition.type === "string_map" || definition.type === "object"
            ? "Enter a JSON object."
            : definition.type === "file"
              ? "Path on the TeamServer host; this is not a browser upload."
              : "";
        const hint = [definition.description, typeHint].filter(Boolean).join(" ");
        return (
          <CompactFormRow key={definition.key} label={definition.key} htmlFor={id} required={definition.required} hint={hint || undefined}>
            {definition.type === "boolean" ? (
              <label className="compact-check-label">
                <CompactCheckbox id={id} checked={value === true} onChange={event => onChange(definition.key, event.target.checked)} />
                Enabled
              </label>
            ) : definition.type === "integer" ? (
              <CompactNumberInput id={id} value={String(value)} onChange={event => onChange(definition.key, event.target.value)} step={1} required={definition.required} />
            ) : definition.type === "string_list" || definition.type === "string_map" || definition.type === "object" ? (
              <CompactTextArea id={id} value={String(value)} onChange={event => onChange(definition.key, event.target.value)} required={definition.required} spellCheck={false} />
            ) : (
              <CompactInput
                id={id}
                type={definition.type === "secret" || definition.secret ? "password" : "text"}
                value={String(value)}
                onChange={event => onChange(definition.key, event.target.value)}
                required={definition.required}
                autoComplete="off"
                spellCheck={false}
              />
            )}
          </CompactFormRow>
        );
      })}
    </CompactFormGrid>
  );
}

export function ListenerConfiguration({
  isOpen, isConnected, onClose, onListDrivers, onGetDriver, onListCarriers, onCreate
}: ListenerConfigurationProps) {
  const [name, setName] = useState("");
  const [persistent, setPersistent] = useState(true);
  const [startImmediately, setStartImmediately] = useState(true);
  const [drivers, setDrivers] = useState<TeamListenerDriverDefinition[]>([]);
  const [carriers, setCarriers] = useState<TeamListenerCarrierDefinition[]>([]);
  const [selectedDriver, setSelectedDriver] = useState<TeamListenerDriverDefinition | null>(null);
  const [driverOptions, setDriverOptions] = useState<OptionDraft>({});
  const [routes, setRoutes] = useState<ListenerRouteDraft[]>([]);
  const [error, setError] = useState("");
  const [isLoadingSchema, setIsLoadingSchema] = useState(false);
  const [isCreating, setIsCreating] = useState(false);

  const carriersByID = useMemo(() => new Map(carriers.map(carrier => [carrier.id, carrier])), [carriers]);
  const supportsRoutes = Boolean(selectedDriver?.capabilities?.includes("routes"));
  const hasCustomTransport = routes.length > 0 || driverOptions["tls.enabled"] === true;

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    setName(""); setPersistent(true); setStartImmediately(true); setDrivers([]); setCarriers([]);
    setSelectedDriver(null); setDriverOptions({}); setRoutes([]); setError(""); setIsCreating(false);
    setIsLoadingSchema(true);

    void Promise.all([onListDrivers(), onListCarriers()])
      .then(async ([listedDrivers, listedCarriers]) => {
        if (cancelled) return;
        const sortedDrivers = [...listedDrivers].sort((left, right) => left.id.localeCompare(right.id));
        const sortedCarriers = [...listedCarriers].sort((left, right) => left.id.localeCompare(right.id));
        setDrivers(sortedDrivers);
        setCarriers(sortedCarriers);
        const initialDriver = sortedDrivers.find(driver => driver.id === "http") || sortedDrivers[0];
        if (!initialDriver) throw new Error("The TeamServer did not advertise any listener drivers.");
        const discoveredDriver = await onGetDriver(initialDriver.id).catch(() => initialDriver);
        if (cancelled) return;
        setSelectedDriver(discoveredDriver);
        setDriverOptions(createOptionDraft(discoveredDriver.options));
      })
      .catch(loadError => {
        if (!cancelled) setError(loadError instanceof Error ? loadError.message : String(loadError));
      })
      .finally(() => {
        if (!cancelled) setIsLoadingSchema(false);
      });
    return () => { cancelled = true; };
  }, [isOpen]);

  if (!isOpen) return null;

  const selectDriver = async (driverID: string) => {
    const fallback = drivers.find(driver => driver.id === driverID);
    if (!fallback) return;
    setError(""); setIsLoadingSchema(true);
    try {
      const discovered = await onGetDriver(driverID).catch(() => fallback);
      setSelectedDriver(discovered); setDriverOptions(createOptionDraft(discovered.options)); setRoutes([]);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : String(loadError));
    } finally {
      setIsLoadingSchema(false);
    }
  };

  const updateRoute = (index: number, update: Partial<ListenerRouteDraft>) => {
    setRoutes(current => current.map((route, routeIndex) => routeIndex === index ? { ...route, ...update } : route));
    setError("");
  };

  const selectCarrier = (index: number, direction: RouteCarrierDirection, carrierID: string) => {
    const definition = carriersByID.get(carrierID);
    if (!definition) return;
    updateRoute(index, direction === "inbound"
      ? { inboundType: carrierID, inboundOptions: createOptionDraft(definition.options) }
      : { outboundType: carrierID, outboundOptions: createOptionDraft(definition.options) });
  };

  const updateCarrierOption = (index: number, direction: RouteCarrierDirection, key: string, value: OptionDraftValue) => {
    setRoutes(current => current.map((route, routeIndex) => {
      if (routeIndex !== index) return route;
      const optionKey = direction === "inbound" ? "inboundOptions" : "outboundOptions";
      return { ...route, [optionKey]: { ...route[optionKey], [key]: value } };
    }));
    setError("");
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const listenerName = name.trim();
    if (!listenerName) { setError("Enter a listener name."); return; }
    if (!isConnected) { setError("Connect to the TeamServer before creating a listener."); return; }
    if (!selectedDriver) { setError("Select a listener driver advertised by the TeamServer."); return; }

    setError(""); setIsCreating(true);
    try {
      const options = parseOptionDraft(selectedDriver.options, driverOptions, "Listener option");
      if (selectedDriver.id === "http") validateHTTPOptions(options);
      const routeIDs = routes.map(route => route.id.trim());
      if (new Set(routeIDs).size !== routeIDs.length) throw new Error("Custom route IDs must be unique.");
      const request: TeamListenerCreateRequest = {
        name: listenerName,
        driver: selectedDriver.id,
        persistent,
        options,
        routes: routes.map(route => buildRoute(route, carriersByID)),
        start: startImmediately
      };
      await onCreate(request);
      onClose();
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : String(createError));
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <DesktopModal
      title="New Listener"
      subtitle="Schema-driven TeamServer listener configuration"
      onClose={onClose}
      width="920px"
      className="listener-configuration-modal"
      aria-busy={isLoadingSchema || isCreating}
      footer={
        <>
          <CompactButton type="button" onClick={onClose}>Cancel</CompactButton>
          <CompactButton type="submit" form="listener-configuration-form" variant="primary" disabled={isCreating || isLoadingSchema || !isConnected || !selectedDriver}>
            {isCreating ? "Creating…" : startImmediately ? "Create & Start" : "Create Listener"}
          </CompactButton>
        </>
      }
    >
      <form id="listener-configuration-form" className="listener-configuration-form" onSubmit={handleSubmit}>
        {!isConnected && <p className="desktop-alert desktop-alert--warning">Connect to the TeamServer to discover and create listeners.</p>}
        {isLoadingSchema && !selectedDriver && <p className="desktop-alert desktop-alert--accent">Loading listener driver and carrier schemas…</p>}
        {error && <p id="listener-configuration-error" role="alert" className="desktop-alert desktop-alert--error">{error}</p>}

        <DesktopPanel className="listener-configuration-section">
          <PanelHeader>Listener Identity</PanelHeader>
          <CompactFormGrid className="listener-configuration-section-body">
            <CompactFormRow label="Name" htmlFor="listener-configuration-name" required>
              <CompactInput
                id="listener-configuration-name" value={name}
                onChange={event => { setName(event.target.value); setError(""); }}
                placeholder="main" autoComplete="off" required aria-invalid={Boolean(error)}
                aria-describedby={error ? "listener-configuration-error" : undefined}
              />
            </CompactFormRow>
            <CompactFormRow label="Driver" htmlFor="listener-configuration-driver" required hint={selectedDriver?.description}>
              <CompactSelect
                id="listener-configuration-driver" value={selectedDriver?.id || ""}
                onChange={event => void selectDriver(event.target.value)}
                disabled={isLoadingSchema || drivers.length === 0} required
              >
                {drivers.length === 0 && <option value="">No drivers discovered</option>}
                {drivers.map(driver => <option key={driver.id} value={driver.id}>{driver.id}</option>)}
              </CompactSelect>
            </CompactFormRow>
            <CompactFormRow label="Lifecycle">
              <div className="listener-checkbox-row">
                <label className="compact-check-label">
                  <CompactCheckbox checked={persistent} onChange={event => setPersistent(event.target.checked)} />
                  Persist across TeamServer restarts
                </label>
                <label className="compact-check-label">
                  <CompactCheckbox checked={startImmediately} onChange={event => setStartImmediately(event.target.checked)} />
                  Start immediately after creation
                </label>
              </div>
            </CompactFormRow>
          </CompactFormGrid>
        </DesktopPanel>

        {selectedDriver && (
          <CollapsibleSection title={`Driver Options — ${selectedDriver.id}`} open>
            {selectedDriver.capabilities && selectedDriver.capabilities.length > 0 && (
              <p className="listener-schema-description">Capabilities: {selectedDriver.capabilities.join(", ")}</p>
            )}
            <OptionFields
              definitions={selectedDriver.options} values={driverOptions} idPrefix="listener-driver-option"
              onChange={(key, value) => { setDriverOptions(current => ({ ...current, [key]: value })); setError(""); }}
            />
          </CollapsibleSection>
        )}

        <CollapsibleSection title={`Custom Routes — ${routes.length}`} open={routes.length > 0}>
          <p className={`desktop-alert desktop-alert--${hasCustomTransport ? "warning" : "accent"}`}>
            Empty routes with TLS disabled use the current implant-compatible HTTP profile. Custom routes,
            carriers, or TLS require matching custom implant configuration and do not rebuild existing implants.
          </p>
          {selectedDriver && !supportsRoutes && (
            <p className="desktop-alert desktop-alert--warning">
              The selected driver does not advertise custom route support.
            </p>
          )}

          <div className="listener-route-list">
            {routes.map((route, index) => {
              const inbound = carriersByID.get(route.inboundType);
              const outbound = carriersByID.get(route.outboundType);
              return (
                <DesktopPanel key={route.key} className="listener-route-panel">
                  <PanelHeader actions={
                    <CompactButton type="button" variant="danger" onClick={() => setRoutes(current => current.filter((_, routeIndex) => routeIndex !== index))}>Remove</CompactButton>
                  }>
                    Route {index + 1}{route.id.trim() ? ` — ${route.id.trim()}` : ""}
                  </PanelHeader>

                  <div className="listener-route-body">
                    <CompactFormGrid>
                      <CompactFormRow label="Route ID" htmlFor={`listener-route-${index}-id`} required>
                        <CompactInput id={`listener-route-${index}-id`} value={route.id} onChange={event => updateRoute(index, { id: event.target.value })} required />
                      </CompactFormRow>
                      <CompactFormRow label="Purpose" htmlFor={`listener-route-${index}-purpose`} required>
                        <CompactSelect id={`listener-route-${index}-purpose`} value={route.purpose} onChange={event => updateRoute(index, { purpose: event.target.value as RoutePurpose })}>
                          <option value="callback">callback</option><option value="interactive">interactive</option>
                        </CompactSelect>
                      </CompactFormRow>
                      <CompactFormRow label="Priority" htmlFor={`listener-route-${index}-priority`} hint="Higher priorities match first.">
                        <CompactNumberInput id={`listener-route-${index}-priority`} value={route.priority} onChange={event => updateRoute(index, { priority: event.target.value })} step={1} />
                      </CompactFormRow>
                      <CompactFormRow label="Path Match" htmlFor={`listener-route-${index}-match-mode`}>
                        <div className="listener-inline-fields">
                          <CompactSelect id={`listener-route-${index}-match-mode`} value={route.matchMode} onChange={event => updateRoute(index, { matchMode: event.target.value as RouteMatchMode })}>
                            <option value="none">Any path</option><option value="path">Exact path</option><option value="path_prefix">Path prefix</option>
                          </CompactSelect>
                          <CompactInput value={route.matchValue} onChange={event => updateRoute(index, { matchValue: event.target.value })} placeholder="/pixel.png" disabled={route.matchMode === "none"} />
                        </div>
                      </CompactFormRow>
                      <CompactFormRow label="Host" htmlFor={`listener-route-${index}-host`}>
                        <CompactInput id={`listener-route-${index}-host`} value={route.matchHost} onChange={event => updateRoute(index, { matchHost: event.target.value })} placeholder="example.test" />
                      </CompactFormRow>
                      <CompactFormRow label="Methods" htmlFor={`listener-route-${index}-methods`} hint="Comma-separated or one per line; normalized to uppercase.">
                        <CompactInput id={`listener-route-${index}-methods`} value={route.methods} onChange={event => updateRoute(index, { methods: event.target.value })} placeholder="POST" />
                      </CompactFormRow>
                      <CompactFormRow label="Extensions" htmlFor={`listener-route-${index}-extensions`} hint="Comma-separated; normalized to lowercase with a leading dot.">
                        <CompactInput id={`listener-route-${index}-extensions`} value={route.extensions} onChange={event => updateRoute(index, { extensions: event.target.value })} placeholder=".png, .jpg" />
                      </CompactFormRow>
                    </CompactFormGrid>

                    {route.purpose === "callback" ? (
                      <CollapsibleSection title="Callback Options">
                        <CompactFormGrid>
                          <CompactFormRow label="Session Source" htmlFor={`listener-route-${index}-session-source`}>
                            <div className="listener-inline-fields">
                              <CompactSelect id={`listener-route-${index}-session-source`} value={route.sessionSource} onChange={event => updateRoute(index, { sessionSource: event.target.value as ListenerRouteDraft["sessionSource"] })}>
                                <option value="">Not configured</option><option value="query">query</option><option value="header">header</option><option value="cookie">cookie</option>
                              </CompactSelect>
                              <CompactInput value={route.sessionName} onChange={event => updateRoute(index, { sessionName: event.target.value })} placeholder="X-Session" disabled={!route.sessionSource} />
                            </div>
                          </CompactFormRow>
                          <CompactFormRow label="Response Status" htmlFor={`listener-route-${index}-response-status`}>
                            <CompactNumberInput id={`listener-route-${index}-response-status`} value={route.responseStatus} onChange={event => updateRoute(index, { responseStatus: event.target.value })} min={100} max={599} />
                          </CompactFormRow>
                          <CompactFormRow label="No-task Status" htmlFor={`listener-route-${index}-nil-status`}>
                            <CompactNumberInput id={`listener-route-${index}-nil-status`} value={route.responseNilStatus} onChange={event => updateRoute(index, { responseNilStatus: event.target.value })} min={100} max={599} />
                          </CompactFormRow>
                          <CompactFormRow label="Response Headers" htmlFor={`listener-route-${index}-response-headers`} hint="JSON object.">
                            <CompactTextArea id={`listener-route-${index}-response-headers`} value={route.responseHeaders} onChange={event => updateRoute(index, { responseHeaders: event.target.value })} spellCheck={false} />
                          </CompactFormRow>
                          <CompactFormRow label="No-task Body" htmlFor={`listener-route-${index}-no-task-body`}>
                            <CompactInput id={`listener-route-${index}-no-task-body`} value={route.noTaskBody} onChange={event => updateRoute(index, { noTaskBody: event.target.value })} />
                          </CompactFormRow>
                        </CompactFormGrid>
                      </CollapsibleSection>
                    ) : (
                      <CollapsibleSection title="Interactive Options">
                        <CompactFormGrid>
                          <CompactFormRow label="Stream Query" htmlFor={`listener-route-${index}-stream-query`} hint="Query parameter containing the interactive stream ID.">
                            <CompactInput id={`listener-route-${index}-stream-query`} value={route.streamQuery} onChange={event => updateRoute(index, { streamQuery: event.target.value })} placeholder="stream" />
                          </CompactFormRow>
                        </CompactFormGrid>
                      </CollapsibleSection>
                    )}

                    <div className="listener-carrier-grid">
                      {(["inbound", "outbound"] as const).map(direction => {
                        const definition = direction === "inbound" ? inbound : outbound;
                        const selectedType = direction === "inbound" ? route.inboundType : route.outboundType;
                        const values = direction === "inbound" ? route.inboundOptions : route.outboundOptions;
                        return (
                          <CollapsibleSection key={direction} title={`${direction === "inbound" ? "Inbound" : "Outbound"} Carrier`} open>
                            <CompactFormGrid>
                              <CompactFormRow label="Type" htmlFor={`listener-route-${index}-${direction}-type`} required hint={definition?.description}>
                                <CompactSelect id={`listener-route-${index}-${direction}-type`} value={selectedType} onChange={event => selectCarrier(index, direction, event.target.value)} required>
                                  {carriers.filter(carrier => direction === "inbound" || carrier.id !== "query").map(carrier => <option key={carrier.id} value={carrier.id}>{carrier.id}</option>)}
                                </CompactSelect>
                              </CompactFormRow>
                            </CompactFormGrid>
                            <OptionFields
                              definitions={definition?.options} values={values} idPrefix={`listener-route-${index}-${direction}`}
                              onChange={(key, value) => updateCarrierOption(index, direction, key, value)}
                            />
                          </CollapsibleSection>
                        );
                      })}
                    </div>
                  </div>
                </DesktopPanel>
              );
            })}
          </div>

          <div className="listener-route-actions">
            <CompactButton
              type="button"
              onClick={() => setRoutes(current => [...current, createRouteDraft(carriers, current.length + 1)])}
              disabled={!supportsRoutes || carriers.length === 0}
            >
              Add Custom Route
            </CompactButton>
          </div>
        </CollapsibleSection>
      </form>
    </DesktopModal>
  );
}
