import { parseDateTime } from "./dates.ts";
import type { Meeting } from "./domain.ts";

export function normalizeMeeting(meeting: Meeting): Meeting {
  return {
    id: meeting.id,
    project: meeting.project.trim() || "Geral",
    description: meeting.description.trim(),
    dateTime: meeting.dateTime.trim(),
  };
}

export function isMeeting(meeting: Meeting): boolean {
  return (
    Boolean(meeting.description) && parseDateTime(meeting.dateTime) !== null
  );
}

export function parseMeetingJson(value: unknown): Meeting {
  const record = isRecord(value) ? value : {};
  return normalizeMeeting({
    id: typeof record.id === "number" ? record.id : undefined,
    project: String(record.project ?? ""),
    description: String(record.description ?? record.Title ?? ""),
    dateTime: String(record.dateTime ?? record.date ?? ""),
  });
}

export function meetingToJson(meeting: Meeting) {
  return {
    ...(meeting.id !== undefined ? { id: meeting.id } : {}),
    Title: meeting.description,
    project: meeting.project,
    date: meeting.dateTime,
  };
}

export function parseMeetingFile(text: string): Meeting[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map(parseMeetingLine)
    .filter(isMeeting);
}

export function parseMeetingText(text: string): Meeting[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim().replace(/^[-*]\s*/, ""))
    .filter(Boolean)
    .map(parseMeetingLine)
    .filter(isMeeting);
}

export function parseMeetingLine(line: string): Meeting {
  const [project = "", description = "", dateTime = ""] = line.split(";");
  return normalizeMeeting({ project, description, dateTime });
}

export function formatMeetings(meetings: Meeting[]) {
  return meetings.sort(compareMeetings).map(formatMeetingLine).join("\n");
}

export function formatMeetingLine(meeting: Meeting) {
  return `${meeting.project};${meeting.description};${meeting.dateTime}`;
}

export function uniqueMeetings(meetings: Meeting[]) {
  const seen = new Set<string>();
  return meetings.filter((meeting) => {
    const key =
      meeting.id !== undefined ? `id:${meeting.id}` : formatMeetingLine(meeting);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function compareMeetings(a: Meeting, b: Meeting) {
  return (
    a.dateTime.localeCompare(b.dateTime) ||
    a.project.localeCompare(b.project) ||
    a.description.localeCompare(b.description)
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
