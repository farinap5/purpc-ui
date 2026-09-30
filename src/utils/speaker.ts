import {
  TeamOperations,
  type TeamEnvelope,
  type TeamSpeaker,
  type TeamSpeakerConfig,
  type TeamSpeakerState
} from "../api/teamApi.ts";

export const SPEAKER_REDACTED_VALUE = "[REDACTED]";
export const SPEAKER_NAME_PATTERN = /^[A-Za-z0-9_.-]{1,64}$/;

export const SPEAKER_SNAPSHOT_EVENTS = new Set<string>([
  "evt.speaker.created",
  "evt.speaker.updated",
  "evt.speaker.connecting",
  "evt.speaker.connected",
  "evt.speaker.disconnected",
  "evt.speaker.failed",
  "evt.speaker.stopped"
]);

export const sortSpeakers = (speakers: TeamSpeaker[]) => [...speakers].sort((left, right) =>
  left.name.localeCompare(right.name, undefined, { sensitivity: "base" })
);

export const upsertSpeaker = (speakers: TeamSpeaker[], speaker: TeamSpeaker) => sortSpeakers([
  ...speakers.filter(item => item.uuid !== speaker.uuid && item.name !== speaker.name),
  speaker
]);

export const reduceSpeakerEvent = (speakers: TeamSpeaker[], event: TeamEnvelope): TeamSpeaker[] => {
  if (SPEAKER_SNAPSHOT_EVENTS.has(event.type)) {
    const speaker = event.data as TeamSpeaker | undefined;
    return speaker?.uuid && speaker.name ? upsertSpeaker(speakers, speaker) : speakers;
  }
  if (event.type !== "evt.speaker.deleted") return speakers;
  const deleted = event.data as { name?: string; uuid?: string } | undefined;
  if (!deleted?.name && !deleted?.uuid) return speakers;
  return speakers.filter(speaker =>
    (!deleted.uuid || speaker.uuid !== deleted.uuid) && (!deleted.name || speaker.name !== deleted.name)
  );
};

export const canStartSpeaker = (state: TeamSpeakerState) => state === "stopped";
export const canStopSpeaker = (state: TeamSpeakerState) => state !== "stopped";
export const canRestartSpeaker = (state: TeamSpeakerState) =>
  state === "stopped" || state === "connected" || state === "disconnected" || state === "failed";
export const canEditSpeaker = (state: TeamSpeakerState) => state === "stopped";
export const canDeleteSpeaker = (state: TeamSpeakerState) => state === "stopped";

const NANOSECONDS_PER_SECOND = 1_000_000_000n;
const MAX_SAFE_INTEGER_BIGINT = BigInt(Number.MAX_SAFE_INTEGER);

export const nanosecondsToSeconds = (value: number | undefined, fallbackSeconds: string) => {
  if (value === undefined || value === 0) return fallbackSeconds;
  if (!Number.isSafeInteger(value) || value < 0) return "";
  const nanoseconds = BigInt(value);
  const whole = nanoseconds / NANOSECONDS_PER_SECOND;
  const fraction = (nanoseconds % NANOSECONDS_PER_SECOND).toString().padStart(9, "0").replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : whole.toString();
};

export const secondsToNanoseconds = (
  value: string,
  label: string,
  minimumNanoseconds = 0n
) => {
  const normalized = value.trim();
  const match = normalized.match(/^(\d+)(?:\.(\d{1,9}))?$/);
  if (!match) throw new Error(`${label} must be a non-negative number with at most 9 decimal places.`);
  const whole = BigInt(match[1]);
  const fraction = BigInt((match[2] || "").padEnd(9, "0") || "0");
  const nanoseconds = whole * NANOSECONDS_PER_SECOND + fraction;
  if (nanoseconds < minimumNanoseconds) {
    throw new Error(`${label} must be at least ${nanosecondsToSeconds(Number(minimumNanoseconds), "0")} seconds.`);
  }
  if (nanoseconds > MAX_SAFE_INTEGER_BIGINT) {
    throw new Error(`${label} is too large to serialize exactly in the browser.`);
  }
  return Number(nanoseconds);
};

const HTTP_TOKEN = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/;

const parseJSONObject = (text: string, label: string): Record<string, unknown> => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text || "{}");
  } catch {
    throw new Error(`${label} must contain valid JSON.`);
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`${label} must be a JSON object.`);
  }
  return parsed as Record<string, unknown>;
};

export const parseSpeakerArrayMap = (
  text: string,
  label: string,
  kind: "header" | "query"
): Record<string, string[]> => {
  const parsed = parseJSONObject(text, label);
  const output: Record<string, string[]> = {};
  for (const [name, rawValues] of Object.entries(parsed)) {
    if (!name || (kind === "header" && !HTTP_TOKEN.test(name))) {
      throw new Error(`${label} contains an invalid ${kind} name: ${name || "(empty)"}.`);
    }
    if (kind === "header" && ["host", "x-purplecommand-exchange"].includes(name.toLowerCase())) {
      throw new Error(`${name} is controlled by the speaker and cannot be supplied as a header.`);
    }
    if (!Array.isArray(rawValues) || rawValues.length === 0 || rawValues.some(value => typeof value !== "string")) {
      throw new Error(`${label}.${name} must be a non-empty array of strings.`);
    }
    const values = rawValues as string[];
    if (values.some(value => value === SPEAKER_REDACTED_VALUE || CONTROL_CHARACTERS.test(value))) {
      throw new Error(`${label}.${name} contains a redacted or invalid value.`);
    }
    output[name] = [...values];
  }
  return output;
};

export const parseSpeakerCookies = (text: string, label: string): Record<string, string> => {
  const parsed = parseJSONObject(text, label);
  const output: Record<string, string> = {};
  for (const [name, rawValue] of Object.entries(parsed)) {
    if (!HTTP_TOKEN.test(name)) throw new Error(`${label} contains an invalid cookie name: ${name || "(empty)"}.`);
    if (typeof rawValue !== "string" || rawValue === SPEAKER_REDACTED_VALUE || CONTROL_CHARACTERS.test(rawValue) || /[";\\]/.test(rawValue)) {
      throw new Error(`${label}.${name} contains a redacted or invalid cookie value.`);
    }
    output[name] = rawValue;
  }
  return output;
};

export const parseExpectedStatuses = (value: string) => {
  const normalized = value.trim();
  if (!normalized) return [];
  const statuses = normalized.split(",").map(item => Number(item.trim()));
  if (statuses.some(status => !Number.isInteger(status) || status < 100 || status > 599)) {
    throw new Error("Expected statuses must be comma-separated HTTP status codes from 100 through 599.");
  }
  return Array.from(new Set(statuses));
};

export const parseNonNegativeInteger = (value: string, label: string, maximum?: number) => {
  if (!/^\d+$/.test(value.trim())) throw new Error(`${label} must be a non-negative integer.`);
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || (maximum !== undefined && parsed > maximum)) {
    throw new Error(`${label} is outside the supported range.`);
  }
  return parsed;
};

export const validateSpeakerEndpoint = (baseURL: string, path: string, proxyURL: string) => {
  let endpoint: URL;
  try {
    endpoint = new URL(baseURL.trim());
  } catch {
    throw new Error("Base URL must be a valid HTTP or HTTPS URL.");
  }
  if (!["http:", "https:"].includes(endpoint.protocol) || !endpoint.host || endpoint.username || endpoint.password || endpoint.hash) {
    throw new Error("Base URL must use HTTP or HTTPS, include a host, and contain no user information or fragment.");
  }

  const normalizedPath = path.trim();
  if (!normalizedPath) throw new Error("Request path is required; use / for the default bind endpoint.");
  if (/^[A-Za-z][A-Za-z\d+.-]*:/.test(normalizedPath) || normalizedPath.includes("#")) {
    throw new Error("Request path must be relative to the configured origin and cannot contain a fragment.");
  }
  try {
    const resolved = new URL(normalizedPath, endpoint);
    if (resolved.username || resolved.password || resolved.origin !== endpoint.origin) {
      throw new Error("invalid relative path");
    }
  } catch {
    throw new Error("Request path must be relative to the configured origin and cannot contain user information.");
  }

  if (proxyURL.trim()) {
    if (proxyURL.trim() === SPEAKER_REDACTED_VALUE) throw new Error("Re-enter the proxy URL before replacing this configuration.");
    let proxy: URL;
    try {
      proxy = new URL(proxyURL.trim());
    } catch {
      throw new Error("Proxy URL must be a valid URL.");
    }
    if (!proxy.host || !["http:", "https:", "socks5:", "socks5h:"].includes(proxy.protocol)) {
      throw new Error("Proxy URL must use http, https, socks5, or socks5h.");
    }
  }
};

export const validateSpeakerTLS = (config: {
  clientCertFile: string;
  clientKeyFile: string;
  pins: string[];
}) => {
  if (Boolean(config.clientCertFile.trim()) !== Boolean(config.clientKeyFile.trim())) {
    throw new Error("TLS client certificate and key paths must be supplied together.");
  }
  if (config.clientKeyFile.trim() === SPEAKER_REDACTED_VALUE) {
    throw new Error("Re-enter the TLS client key path before replacing this configuration.");
  }
  const hexadecimal = /^[A-Fa-f0-9]{64}$/;
  const base64 = /^[A-Za-z\d+/]{43}=?$/;
  for (const supplied of config.pins) {
    const pin = supplied.replace(/^sha256\//i, "");
    if (!hexadecimal.test(pin) && !base64.test(pin)) throw new Error(`Invalid SPKI SHA-256 pin: ${supplied}.`);
  }
};

export const containsRedactedSpeakerValue = (value: unknown): boolean => {
  if (value === SPEAKER_REDACTED_VALUE) return true;
  if (Array.isArray(value)) return value.some(containsRedactedSpeakerValue);
  return Boolean(value && typeof value === "object" && Object.values(value).some(containsRedactedSpeakerValue));
};

export const clearRedactedSpeakerValues = <T>(value: T): T => {
  if (value === SPEAKER_REDACTED_VALUE) return "" as T;
  if (Array.isArray(value)) return value.map(clearRedactedSpeakerValues) as T;
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, nested]) => [key, clearRedactedSpeakerValues(nested)])) as T;
  }
  return value;
};

const valueAtPath = (value: unknown, path: Array<string | number>) => path.reduce<unknown>((current, key) => {
  if (!current || typeof current !== "object") return undefined;
  return (current as Record<string | number, unknown>)[key];
}, value);

const redactedPaths = (value: unknown, path: Array<string | number> = []): Array<Array<string | number>> => {
  if (value === SPEAKER_REDACTED_VALUE) return [path];
  if (Array.isArray(value)) return value.flatMap((nested, index) => redactedPaths(nested, [...path, index]));
  if (value && typeof value === "object") {
    return Object.entries(value).flatMap(([key, nested]) => redactedPaths(nested, [...path, key]));
  }
  return [];
};

export const validateRedactedSpeakerValuesReentered = (
  original: TeamSpeakerConfig,
  replacement: TeamSpeakerConfig
) => {
  const missing = redactedPaths(original).filter(path => {
    const value = valueAtPath(replacement, path);
    return typeof value !== "string" || value === "" || value === SPEAKER_REDACTED_VALUE;
  });
  if (missing.length) {
    const labels = missing.slice(0, 4).map(path => path.join("."));
    const remainder = missing.length > labels.length ? ` and ${missing.length - labels.length} more` : "";
    throw new Error(`Re-enter redacted configuration values before saving: ${labels.join(", ")}${remainder}.`);
  }
};

const redactArrayMap = (value?: Record<string, string[]>) => value
  ? Object.fromEntries(Object.entries(value).map(([key, values]) => [key, values.map(() => SPEAKER_REDACTED_VALUE)]))
  : value;

const redactStringMap = (value?: Record<string, string>) => value
  ? Object.fromEntries(Object.keys(value).map(key => [key, SPEAKER_REDACTED_VALUE]))
  : value;

export const redactSpeakerConfiguration = (config: TeamSpeakerConfig): TeamSpeakerConfig => ({
  ...config,
  client: {
    ...config.client,
    headers: redactArrayMap(config.client.headers),
    query: redactArrayMap(config.client.query),
    cookies: redactStringMap(config.client.cookies),
    proxy_url: config.client.proxy_url ? SPEAKER_REDACTED_VALUE : config.client.proxy_url,
    tls: config.client.tls ? {
      ...config.client.tls,
      client_key_file: config.client.tls.client_key_file ? SPEAKER_REDACTED_VALUE : config.client.tls.client_key_file
    } : undefined
  },
  request: {
    ...config.request,
    headers: redactArrayMap(config.request.headers),
    query: redactArrayMap(config.request.query),
    cookies: redactStringMap(config.request.cookies)
  }
});

export const redactControlTraffic = (raw: string) => {
  const redactTokens = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(redactTokens);
    if (!value || typeof value !== "object") return value;
    return Object.fromEntries(Object.entries(value).map(([key, nested]) => [
      key,
      key.toLowerCase() === "token" ? SPEAKER_REDACTED_VALUE : redactTokens(nested)
    ]));
  };

  try {
    const parsed = JSON.parse(raw) as TeamEnvelope<Record<string, unknown>>;
    if (
      (parsed.type === TeamOperations.speakerCreate || parsed.type === TeamOperations.speakerUpdate) &&
      parsed.data?.config && typeof parsed.data.config === "object"
    ) {
      parsed.data.config = redactSpeakerConfiguration(parsed.data.config as TeamSpeakerConfig);
    }
    return JSON.stringify(redactTokens(parsed));
  } catch {
    return raw.includes('"ask.speaker.')
      ? "[speaker control frame omitted because credentials could not be safely redacted]"
      : raw;
  }
};
