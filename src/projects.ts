import type { Project } from "./domain.ts";

export function colorForProjectName(name: string) {
  const palette = [
    "#375a7f",
    "#2f6f5f",
    "#7a4d68",
    "#6a5b2f",
    "#4f6b3f",
    "#6b4f8a",
    "#8a4f4f",
    "#3f6472",
  ];
  let hash = 0;
  for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return palette[hash % palette.length]!;
}

export function parseProjectJson(value: unknown): Project {
  if (typeof value === "string") {
    return { name: value.trim(), color: colorForProjectName(value.trim()) };
  }
  const record = isRecord(value) ? value : {};
  const name = String(record.name ?? "").trim();
  return {
    name,
    color: String(record.color ?? colorForProjectName(name)),
  };
}

export function isProject(project: Project) {
  return Boolean(project.name) && /^#[0-9a-f]{6}$/i.test(project.color);
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
