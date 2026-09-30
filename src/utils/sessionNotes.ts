export interface SessionNoteSegment {
  text: string;
  isTag: boolean;
}

const SESSION_NOTE_TAG_PATTERN = /#[\p{L}\p{N}_-]+/gu;

export const tokenizeSessionNote = (note: string): SessionNoteSegment[] => {
  const segments: SessionNoteSegment[] = [];
  let cursor = 0;

  for (const match of note.matchAll(SESSION_NOTE_TAG_PATTERN)) {
    const index = match.index;
    if (index > cursor) {
      segments.push({ text: note.slice(cursor, index), isTag: false });
    }
    segments.push({ text: match[0], isTag: true });
    cursor = index + match[0].length;
  }

  if (cursor < note.length) {
    segments.push({ text: note.slice(cursor), isTag: false });
  }

  return segments;
};
