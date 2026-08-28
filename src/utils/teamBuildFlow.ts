import { TeamEvents } from "../api/teamApi.ts";
import type {
  TeamBuild,
  TeamBuildOutput,
  TeamEnvelope,
  TeamPayloadBuilder
} from "../api/teamApi.ts";

const MAX_BUILD_OUTPUT_ENTRIES = 1000;
export const MAX_BUILD_OUTPUT_BYTES = 256 << 10;

const buildStateEvents = new Set<string>([
  TeamEvents.buildQueued,
  TeamEvents.buildStarted,
  TeamEvents.buildCompleted,
  TeamEvents.buildFailed
]);

export const isBuildStateEvent = (type: string) => buildStateEvents.has(type);

export const sortTeamBuilds = (builds: TeamBuild[]) => [...builds].sort((left, right) => {
  const difference = Date.parse(right.created_at) - Date.parse(left.created_at);
  return Number.isNaN(difference) || difference === 0 ? left.id.localeCompare(right.id) : difference;
});

const buildStatusRank = (status: string) => {
  switch (status.toLowerCase()) {
    case "queued": return 0;
    case "running": return 1;
    case "completed":
    case "failed": return 2;
    default: return 0;
  }
};

export const upsertTeamBuild = (builds: TeamBuild[], build: TeamBuild) => {
  const existing = builds.find(item => item.id === build.id);
  const merged = existing && buildStatusRank(existing.status) > buildStatusRank(build.status)
    ? { ...build, ...existing }
    : { ...existing, ...build };
  return sortTeamBuilds([...builds.filter(item => item.id !== build.id), merged]);
};

export const normalizePayloadBuilder = (value: unknown): TeamPayloadBuilder | null => {
  if (typeof value === "string") {
    const name = value.trim();
    return name ? { name } : null;
  }
  if (!value || typeof value !== "object") return null;
  const outer = value as Record<string, unknown>;
  const nested = outer.builder && typeof outer.builder === "object"
    ? outer.builder as Record<string, unknown>
    : outer;
  const name = typeof nested.name === "string"
    ? nested.name.trim()
    : typeof outer.builder === "string" ? outer.builder.trim() : "";
  if (!name) return null;
  return {
    name,
    description: typeof nested.description === "string" ? nested.description : undefined,
    type: typeof nested.type === "string"
      ? nested.type
      : typeof nested.kind === "string" ? nested.kind : undefined,
    source: typeof nested.source === "string" ? nested.source : undefined
  };
};

export const normalizePayloadBuilders = (value: unknown): TeamPayloadBuilder[] => {
  const values = Array.isArray(value)
    ? value
    : value && typeof value === "object" && Array.isArray((value as { builders?: unknown[] }).builders)
    ? (value as { builders: unknown[] }).builders
    : [];
  const byName = new Map<string, TeamPayloadBuilder>();
  values.forEach(item => {
    const builder = normalizePayloadBuilder(item);
    if (builder) byName.set(builder.name, builder);
  });
  return [...byName.values()].sort((left, right) => left.name.localeCompare(right.name));
};

export const reducePayloadBuilderEvent = (
  builders: TeamPayloadBuilder[],
  event: TeamEnvelope
): TeamPayloadBuilder[] => {
  const builder = normalizePayloadBuilder(event.data);
  if (!builder) return builders;
  if (event.type === TeamEvents.payloadBuilderRegistered) {
    return normalizePayloadBuilders([
      ...builders.filter(item => item.name !== builder.name),
      builder
    ]);
  }
  if (event.type === TeamEvents.payloadBuilderUnregistered) {
    return builders.filter(item => item.name !== builder.name);
  }
  return builders;
};

const truncateBuildOutput = (message: string) => {
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  const encoded = encoder.encode(message);
  if (encoded.byteLength <= MAX_BUILD_OUTPUT_BYTES) return message;
  const marker = `\n[… ${(encoded.byteLength - MAX_BUILD_OUTPUT_BYTES).toLocaleString()}+ bytes omitted]`;
  const markerBytes = encoder.encode(marker);
  const contentLimit = Math.max(0, MAX_BUILD_OUTPUT_BYTES - markerBytes.byteLength);
  let content = decoder.decode(encoded.slice(0, contentLimit));
  while (content && encoder.encode(content).byteLength + markerBytes.byteLength > MAX_BUILD_OUTPUT_BYTES) {
    content = content.slice(0, -1);
  }
  return `${content}${marker}`;
};

export const normalizeBuildOutput = (event: TeamEnvelope): TeamBuildOutput | null => {
  if (event.type !== TeamEvents.buildOutput || !event.data || typeof event.data !== "object") return null;
  const data = event.data as Record<string, unknown>;
  const buildID = typeof data.build_id === "string" ? data.build_id : "";
  const profile = typeof data.profile === "string" ? data.profile : "";
  const builder = typeof data.builder === "string" ? data.builder : "";
  const message = typeof data.message === "string" ? data.message : "";
  if (!buildID || !profile || !builder || !message) return null;
  return {
    build_id: buildID,
    profile,
    builder,
    message: truncateBuildOutput(message),
    sequence: event.sequence,
    time: event.time
  };
};

export const retainBuildOutput = (entries: TeamBuildOutput[]) => {
  const retained: TeamBuildOutput[] = [];
  let retainedBytes = 0;
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    if (retained.length >= MAX_BUILD_OUTPUT_ENTRIES) break;
    const entry = entries[index];
    const bytes = new TextEncoder().encode(entry.message).byteLength;
    if (retained.length > 0 && retainedBytes + bytes > MAX_BUILD_OUTPUT_BYTES) break;
    retained.push(entry);
    retainedBytes += bytes;
  }
  return retained.reverse();
};
