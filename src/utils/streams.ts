import {
  TeamEvents,
  type TeamEnvelope,
  type TeamStream,
  type TeamStreamState
} from "../api/teamApi.ts";

export const TEAM_STREAM_EVENT_TYPES = [
  TeamEvents.streamCreated,
  TeamEvents.streamImplantAttached,
  TeamEvents.streamConsumerAttached,
  TeamEvents.streamReady,
  TeamEvents.streamClosed,
  TeamEvents.streamExpired,
  TeamEvents.streamFailed
] as const;

const streamEventTypes = new Set<string>(TEAM_STREAM_EVENT_TYPES);
const terminalStates = new Set<TeamStreamState>(["closed", "expired", "failed"]);

export const STREAM_STATE_LABELS: Record<TeamStreamState, string> = {
  waiting_implant: "Waiting for implant",
  waiting_consumer: "Waiting for local client",
  bridging: "Connected",
  closed: "Closed",
  expired: "Attachment timed out",
  failed: "Failed"
};

export const isStreamEvent = (type: string) => streamEventTypes.has(type);

export const isTerminalStream = (stream: TeamStream) => terminalStates.has(stream.state);

export const sortStreams = (streams: TeamStream[]) => [...streams].sort((left, right) => {
  const terminalOrder = Number(isTerminalStream(left)) - Number(isTerminalStream(right));
  if (terminalOrder !== 0) return terminalOrder;
  const createdOrder = Date.parse(right.created_at) - Date.parse(left.created_at);
  return Number.isNaN(createdOrder) || createdOrder === 0
    ? left.id.localeCompare(right.id)
    : createdOrder;
});

export const upsertStream = (streams: TeamStream[], stream: TeamStream) => sortStreams([
  ...streams.filter(item => item.id !== stream.id),
  stream
]);

export const reduceStreamEvent = (streams: TeamStream[], event: TeamEnvelope): TeamStream[] => {
  if (!isStreamEvent(event.type)) return streams;
  const stream = event.data as TeamStream | undefined;
  return stream?.id ? upsertStream(streams, stream) : streams;
};
