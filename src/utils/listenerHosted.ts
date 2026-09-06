import {
  TeamEvents,
  type TeamEnvelope,
  type TeamListenerHostedConfiguration
} from "../api/teamApi.ts";

export type ListenerHostedConfigurationMap = Record<string, TeamListenerHostedConfiguration>;

export const upsertListenerHostedConfiguration = (
  configurations: ListenerHostedConfigurationMap,
  configuration: TeamListenerHostedConfiguration
): ListenerHostedConfigurationMap => ({
  ...configurations,
  [configuration.listener_uuid || configuration.name]: configuration
});

export const removeListenerHostedConfiguration = (
  configurations: ListenerHostedConfigurationMap,
  listener: { uuid?: string; name?: string }
) => Object.fromEntries(Object.entries(configurations).filter(([uuid, configuration]) =>
  uuid !== listener.uuid && configuration.listener_uuid !== listener.uuid && configuration.name !== listener.name
));

export const reduceListenerHostedEvent = (
  configurations: ListenerHostedConfigurationMap,
  event: TeamEnvelope
) => {
  if (event.type !== TeamEvents.listenerHostedUpdated) return configurations;
  const configuration = event.data as TeamListenerHostedConfiguration | undefined;
  if (!configuration?.name || !configuration.listener_uuid) return configurations;
  return upsertListenerHostedConfiguration(configurations, configuration);
};

export const listenerHostedConfigurationFor = (
  configurations: ListenerHostedConfigurationMap,
  listener: { uuid: string; name: string }
) => configurations[listener.uuid] || Object.values(configurations).find(configuration =>
  configuration.listener_uuid === listener.uuid || configuration.name === listener.name
);

export const parseHostedHeaders = (value: string) => {
  const parsed = JSON.parse(value) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Custom headers must be a JSON object.");
  }
  for (const [name, headerValue] of Object.entries(parsed)) {
    if (!name.trim() || typeof headerValue !== "string") {
      throw new Error("Every custom header must have a non-empty name and a string value.");
    }
  }
  return parsed as Record<string, string>;
};

export const validateHostedURLPath = (value: string) => {
  if (!value.startsWith("/")) return "Web server path must start with /.";
  if (value.startsWith("//") || /[?#\r\n\0]/.test(value)) {
    return "Web server path must be canonical and cannot contain a query, fragment, line break, or NUL byte.";
  }
  if (value === "/") return "";
  if (value.endsWith("/")) return "Web server path must not end with / unless it is the root path.";
  const segments = value.split("/").slice(1);
  if (segments.some(segment => segment === "" || segment === "." || segment === "..")) {
    return "Web server path must be canonical and cannot contain empty, . or .. segments.";
  }
  return "";
};

export const validateHostedStatus = (value: string) => {
  if (!/^\d+$/.test(value)) return "Status code must be a whole number.";
  const status = Number(value);
  if (status < 200 || status > 599 || [204, 205, 304].includes(status)) {
    return "Status code must be between 200 and 599 and permit a response body (not 204, 205, or 304).";
  }
  return "";
};
