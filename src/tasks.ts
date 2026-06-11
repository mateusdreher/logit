import { parseDate } from "./dates.ts";
import type { Task, TaskStatus } from "./domain.ts";

export function normalizeTask(task: Task): Task {
  return {
    id: task.id,
    project: task.project.trim() || "Geral",
    status: normalizeTaskStatus(task.status),
    description: task.description.trim(),
    date: task.date?.trim() || undefined,
  };
}

export function normalizeTaskStatus(status?: string): TaskStatus {
  const normalized = status?.trim().toLowerCase();
  if (
    normalized === "concluido" ||
    normalized === "concluida" ||
    normalized === "done" ||
    normalized === "x"
  )
    return "concluido";
  if (
    normalized === "blocked" ||
    normalized === "bloqueado" ||
    normalized === "bloqueada"
  )
    return "blocked";
  return "backlog";
}

export function isTaskStatus(status: string): status is TaskStatus {
  return status === "backlog" || status === "concluido" || status === "blocked";
}

export function isTask(task: Task): boolean {
  return (
    Boolean(task.description) &&
    isTaskStatus(task.status) &&
    (!task.date || parseDate(task.date) !== null)
  );
}

export function parseTaskJson(value: unknown): Task {
  const record = isRecord(value) ? value : {};
  return normalizeTask({
    id: typeof record.id === "number" ? record.id : undefined,
    project: String(record.project ?? ""),
    status: normalizeTaskStatus(String(record.status ?? "")),
    description: String(record.description ?? record.Title ?? ""),
    date: String(record.date ?? "") || undefined,
  });
}

export function taskToJson(task: Task) {
  return {
    ...(task.id !== undefined ? { id: task.id } : {}),
    description: task.description,
    project: task.project,
    date: task.date,
    status: task.status,
  };
}

export function parseTaskFile(text: string): Task[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => parseTaskLineWithContext(line))
    .filter(isTask);
}

export function parseTaskLineWithContext(
  line: string,
  context: { project?: string; date?: string } = {},
): Task {
  const cleanLine = line.trim().replace(/^[-*]\s*/, "");
  const parts = cleanLine.split(";").map((part) => part.trim());

  if (!cleanLine.includes(";")) {
    const dateMatch = cleanLine.match(/\b(\d{2}-\d{2}-\d{4})\b/);
    const statusMatch = cleanLine.match(
      /^\[(backlog|blocked|concluido|concluida|bloqueado|bloqueada|done|x)\]\s*/i,
    );
    const description = cleanLine
      .replace(
        /^\[(backlog|blocked|concluido|concluida|bloqueado|bloqueada|done|x)\]\s*/i,
        "",
      )
      .replace(/\b\d{2}-\d{2}-\d{4}\b/, "")
      .trim();
    return normalizeTask({
      project: context.project || "Geral",
      status: normalizeTaskStatus(statusMatch?.[1]),
      description,
      date: dateMatch?.[1] ?? context.date,
    });
  }

  if (parts.length >= 4) {
    const [
      project = context.project ?? "",
      status = "backlog",
      description = "",
      date = context.date ?? "",
    ] = parts;
    return normalizeTask({
      project,
      status: normalizeTaskStatus(status),
      description,
      date: date || undefined,
    });
  }

  const [
    project = context.project ?? "",
    description = "",
    date = context.date ?? "",
  ] = parts;
  return normalizeTask({
    project,
    status: "backlog",
    description,
    date: date || undefined,
  });
}

export function formatBacklog(tasks: Task[]) {
  const grouped = groupByProject(tasks.filter((task) => !task.date));
  return Object.entries(grouped)
    .map(([project, projectTasks]) =>
      [
        `Projeto: ${project}`,
        ...projectTasks.map(
          (task) => `- ${taskStatusSymbol(task.status)} ${task.description}`,
        ),
      ].join("\n"),
    )
    .join("\n\n");
}

export function formatTasksForDate(tasks: Task[], date: string) {
  return tasks
    .filter((task) => task.date === date)
    .sort(compareTasks)
    .map((task) => `${taskStatusSymbol(task.status)} ${task.description}`)
    .join("\n");
}

export function taskStatusSymbol(status: TaskStatus) {
  if (status === "concluido") return "✓";
  if (status === "blocked") return "✕";
  return "☐";
}

export function groupByProject(tasks: Task[]) {
  return tasks
    .sort(compareTasks)
    .reduce<Record<string, Task[]>>((groups, task) => {
      groups[task.project] ??= [];
      groups[task.project]!.push(task);
      return groups;
    }, {});
}

export function uniqueTasks(tasks: Task[]) {
  const seen = new Set<string>();
  return tasks.filter((task) => {
    const key =
      task.id !== undefined
        ? `id:${task.id}`
        : `${task.project};${task.status};${task.description};${task.date ?? ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function compareTasks(a: Task, b: Task) {
  return (
    (a.date ?? "").localeCompare(b.date ?? "") ||
    a.project.localeCompare(b.project) ||
    a.status.localeCompare(b.status) ||
    a.description.localeCompare(b.description)
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
