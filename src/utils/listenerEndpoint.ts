import type { Listener } from "../types";

export interface ListenerLHostSnapshot {
  endpoint: string;
  host: string;
  port: string;
  source: "advertise" | "bind" | "advertise+bind";
  listenerName: string;
  listenerUUID: string;
  configVersion?: number;
}

export interface ProfileListenerCompatibility {
  compatible: boolean;
  snapshot: ListenerLHostSnapshot | null;
  reason?: string;
}

const asRecord = (value: unknown): Record<string, unknown> | undefined =>
  value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;

const optionString = (value: unknown) => typeof value === "string" && value.trim() ? value.trim() : undefined;

export const formatListenerEndpoint = (host: string, port: string) => {
  let normalizedHost = host.trim();
  const normalizedPort = port.trim();
  if (normalizedHost.startsWith("[") && normalizedHost.endsWith("]")) {
    normalizedHost = normalizedHost.slice(1, -1);
  }
  if (normalizedHost.includes(":") && normalizedHost.includes("%") && !normalizedHost.includes("%25")) {
    normalizedHost = normalizedHost.replace("%", "%25");
  }
  const formattedHost = normalizedHost.includes(":") && !(normalizedHost.startsWith("[") && normalizedHost.endsWith("]"))
    ? `[${normalizedHost}]`
    : normalizedHost;
  return `${formattedHost}:${normalizedPort}`;
};

const isWildcardAddress = (host: string) => {
  let normalized = host.trim().toLowerCase();
  if (normalized.startsWith("[") && normalized.endsWith("]")) normalized = normalized.slice(1, -1);
  normalized = normalized.replace("%25", "%").split("%", 1)[0];
  if (normalized === "0.0.0.0" || normalized === "::" || normalized === "::0") return true;

  const ipv4Mapped = normalized.match(/^(?:::ffff:|0:0:0:0:0:ffff:)(.+)$/);
  if (ipv4Mapped && (ipv4Mapped[1] === "0.0.0.0" || ipv4Mapped[1] === "0:0")) return true;

  if (!normalized.includes(":")) return false;
  const pieces = normalized.split(":").filter(Boolean);
  return pieces.length > 0 && pieces.every(piece => /^0{1,4}$/.test(piece));
};

export const resolveListenerLHost = (listener: Listener): ListenerLHostSnapshot | null => {
  const options = asRecord(listener.options);
  const bind = asRecord(options?.bind);
  const advertise = asRecord(options?.advertise);
  const advertisedHost = optionString(advertise?.host);
  const advertisedPort = optionString(advertise?.port);
  const host = advertisedHost || optionString(bind?.host);
  const port = advertisedPort || optionString(bind?.port);

  if (!host || !port || !/^\d+$/.test(port) || Number(port) < 1 || Number(port) > 65535) return null;
  const normalizedPort = String(Number(port));

  return {
    endpoint: formatListenerEndpoint(host, normalizedPort),
    host,
    port: normalizedPort,
    source: advertisedHost && advertisedPort
      ? "advertise"
      : advertisedHost || advertisedPort ? "advertise+bind" : "bind",
    listenerName: listener.name,
    listenerUUID: listener.uuid,
    configVersion: listener.configVersion
  };
};

/** Mirrors the server's current HTTP-profile attachment constraints for UI
 * affordances. The TeamServer remains authoritative and validates on attach. */
export const getProfileListenerCompatibility = (listener: Listener): ProfileListenerCompatibility => {
  const snapshot = resolveListenerLHost(listener);
  if (listener.driver.trim().toLowerCase() !== "http") {
    return { compatible: false, snapshot, reason: "HTTP listeners only" };
  }
  if (listener.persistent !== true) {
    return { compatible: false, snapshot, reason: "listener must be persistent" };
  }
  if (listener.routes?.length) {
    return { compatible: false, snapshot, reason: "custom routes are not supported" };
  }

  const options = asRecord(listener.options);
  const tls = asRecord(options?.tls);
  if (tls?.enabled === true) {
    return { compatible: false, snapshot, reason: "HTTPS is not supported" };
  }
  if (!snapshot) {
    return { compatible: false, snapshot: null, reason: "advertised endpoint is unavailable" };
  }
  if (isWildcardAddress(snapshot.host)) {
    return { compatible: false, snapshot, reason: "advertise a connectable host" };
  }
  return { compatible: true, snapshot };
};
