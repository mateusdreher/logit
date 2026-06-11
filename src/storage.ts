import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { addDays, formatDate, monthKey, parseDate, parseDateTime } from "./dates.ts";
import type { HeaderState, Meeting, Project, Task } from "./domain.ts";
import { emptyHeaderState, goalItems, goalsDayToJson, normalizeGoalsDay } from "./goals.ts";
import {
  compareMeetings,
  isMeeting,
  meetingToJson,
  parseMeetingFile,
  parseMeetingJson,
  uniqueMeetings,
} from "./meetings.ts";
import {
  colorForProjectName,
  isProject,
  isRecord,
  parseProjectJson,
} from "./projects.ts";
import {
  compareTasks,
  isTask,
  parseTaskFile,
  parseTaskJson,
  taskToJson,
  uniqueTasks,
} from "./tasks.ts";

export async function loadTasksFromStorage(
  vaultRoot: string,
  today: Date,
  weekDays: Date[],
  weekDateSet: Set<string>,
): Promise<Task[]> {
  const paths = new Set(weekDays.map((date) => tasksYearPath(vaultRoot, date)));
  const taskGroups = await Promise.all(
    Array.from(paths).map((path) => readTasksYear(vaultRoot, path)),
  );
  return uniqueTasks(taskGroups.flat()).filter((task) =>
    taskIsInDashboardScope(task, weekDateSet),
  );
}

export async function saveTasksToStorage(
  vaultRoot: string,
  today: Date,
  weekDays: Date[],
  weekDateSet: Set<string>,
  edited: Task[],
) {
  const editedPaths = new Set([
    tasksYearPath(vaultRoot, today),
    ...weekDays.map((date) => tasksYearPath(vaultRoot, date)),
    ...edited.map((task) =>
      tasksYearPath(vaultRoot, parseDate(task.date) ?? today),
    ),
  ]);

  await Promise.all(
    Array.from(editedPaths).map(async (path) => {
      const existing = await readTasksYear(vaultRoot, path);
      const kept = existing.filter(
        (task) => !taskIsInDashboardScope(task, weekDateSet),
      );
      const monthTasks = edited.filter(
        (task) =>
          tasksYearPath(vaultRoot, parseDate(task.date) ?? today) === path,
      );
      await writeTasksYear(today, path, uniqueTasks([...kept, ...monthTasks]));
    }),
  );
}

export async function loadProjectsFromStorage(
  vaultRoot: string,
  loadedTasks: Task[],
) {
  const stored = await readProjectsFile(vaultRoot, projectsPath(vaultRoot));
  const fromTasks = loadedTasks.map((task) => task.project).filter(Boolean);
  const byName = new Map(stored.map((project) => [project.name, project]));
  for (const name of fromTasks) {
    if (!byName.has(name))
      byName.set(name, { name, color: colorForProjectName(name) });
  }
  return Array.from(byName.values()).sort((a, b) =>
    a.name.localeCompare(b.name),
  );
}

export async function saveProjectsToStorage(
  vaultRoot: string,
  projects: Project[],
) {
  await writeJsonFile(projectsPath(vaultRoot), projects);
}

export async function loadMeetingsFromStorage(
  vaultRoot: string,
  weekDays: Date[],
  weekDateSet: Set<string>,
): Promise<Meeting[]> {
  const paths = new Set(
    weekDays.map((date) => meetingsYearPath(vaultRoot, date)),
  );
  const groups = await Promise.all(
    Array.from(paths).map((path) => readMeetingsYear(vaultRoot, path)),
  );
  return uniqueMeetings(groups.flat()).filter((meeting) =>
    weekDateSet.has(meeting.dateTime.slice(0, 10)),
  );
}

export async function saveMeetingsToStorage(
  vaultRoot: string,
  today: Date,
  weekDays: Date[],
  weekDateSet: Set<string>,
  edited: Meeting[],
) {
  const editedPaths = new Set([
    ...weekDays.map((date) => meetingsYearPath(vaultRoot, date)),
    ...edited.map((meeting) =>
      meetingsYearPath(vaultRoot, parseDateTime(meeting.dateTime) ?? today),
    ),
  ]);

  await Promise.all(
    Array.from(editedPaths).map(async (path) => {
      const existing = await readMeetingsYear(vaultRoot, path);
      const kept = existing.filter(
        (meeting) => !weekDateSet.has(meeting.dateTime.slice(0, 10)),
      );
      const monthMeetings = edited.filter(
        (meeting) =>
          meetingsYearPath(vaultRoot, parseDateTime(meeting.dateTime) ?? today) ===
          path,
      );
      await writeMeetingsYear(
        today,
        path,
        uniqueMeetings([...kept, ...monthMeetings]),
      );
    }),
  );
}

export async function ensureTodayGoals(
  vaultRoot: string,
  today: Date,
): Promise<HeaderState> {
  const path = goalsYearPath(vaultRoot, today);
  const json = (await readJsonFile<Record<string, unknown[]>>(path)) ?? {};
  const current = findGoalDay(json, today);
  const normalizedCurrent = current ? normalizeGoalsDay(current) : undefined;

  if (normalizedCurrent?.checked) return normalizedCurrent;

  const hasCurrentText =
    normalizedCurrent &&
    Object.values(goalItems(normalizedCurrent)).some((goal) => goal.text);
  const next = hasCurrentText
    ? { ...normalizedCurrent, checked: true }
    : await goalsFromPreviousOpenDay(vaultRoot, today);

  await upsertGoalsDay(vaultRoot, today, next);
  return next;
}

export async function upsertGoalsDay(
  vaultRoot: string,
  date: Date,
  state: HeaderState,
) {
  const path = goalsYearPath(vaultRoot, date);
  const json = (await readJsonFile<Record<string, unknown[]>>(path)) ?? {};
  const key = monthKey(date);
  const days = Array.isArray(json[key]) ? json[key]! : [];
  const dateKey = formatDate(date);
  const nextDay = goalsDayToJson(state, dateKey);
  const index = days.findIndex((day) => isRecord(day) && day.date === dateKey);
  if (index >= 0) days[index] = nextDay;
  else days.push(nextDay);
  json[key] = days.sort((a, b) =>
    String(isRecord(a) ? a.date ?? "" : "").localeCompare(
      String(isRecord(b) ? b.date ?? "" : ""),
    ),
  );
  await writeJsonFile(path, json);
}

export function dailyNotePath(vaultRoot: string, date: Date) {
  return join(vaultRoot, "notes", `${formatDate(date)}.md`);
}

export async function readTextFile(path: string) {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return "";
    throw error;
  }
}

export async function writeTextFile(path: string, content: string) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, content, "utf8");
}

async function readTasksYear(
  vaultRoot: string,
  path: string,
): Promise<Task[]> {
  const json = await readJsonFile<Record<string, unknown[]>>(path);
  if (json) return Object.values(json).flat().map(parseTaskJson).filter(isTask);
  return readLegacyTasksForYear(vaultRoot, yearFromPath(path));
}

async function writeTasksYear(today: Date, path: string, tasks: Task[]) {
  await writeJsonFile(
    path,
    groupYearItems(
      tasks.sort(compareTasks),
      (task) => monthKey(parseDate(task.date) ?? today),
      taskToJson,
    ),
  );
}

async function readMeetingsYear(
  vaultRoot: string,
  path: string,
): Promise<Meeting[]> {
  const json = await readJsonFile<Record<string, unknown[]>>(path);
  if (json)
    return Object.values(json)
      .flat()
      .map(parseMeetingJson)
      .filter(isMeeting);
  return readLegacyMeetingsForYear(vaultRoot, yearFromPath(path));
}

async function writeMeetingsYear(
  today: Date,
  path: string,
  meetings: Meeting[],
) {
  await writeJsonFile(
    path,
    groupYearItems(
      meetings.sort(compareMeetings),
      (meeting) => monthKey(parseDateTime(meeting.dateTime) ?? today),
      meetingToJson,
    ),
  );
}

async function goalsFromPreviousOpenDay(
  vaultRoot: string,
  today: Date,
): Promise<HeaderState> {
  const yesterday = addDays(today, -1);
  const previousJson =
    (await readJsonFile<Record<string, unknown[]>>(
      goalsYearPath(vaultRoot, yesterday),
    )) ?? {};
  const previous = findGoalDay(previousJson, yesterday);
  if (!previous) return emptyHeaderState(true);

  const previousGoals = normalizeGoalsDay(previous);
  const next = emptyHeaderState(true);
  for (const id of ["mission", "objective1", "objective2", "objective3"] as const) {
    const previousGoal = previousGoals[id];
    if (previousGoal.status !== "done") {
      next[id] = { text: previousGoal.text, status: "open" };
    }
  }
  return next;
}

function findGoalDay(json: Record<string, unknown[]>, date: Date) {
  const days = json[monthKey(date)] ?? [];
  const dateKey = formatDate(date);
  return days.find((day) => isRecord(day) && day.date === dateKey);
}

function taskIsInDashboardScope(task: Task, weekDateSet: Set<string>) {
  return !task.date || weekDateSet.has(task.date);
}

function groupYearItems<T>(
  items: T[],
  keyForItem: (item: T) => string,
  serialize: (item: T) => unknown,
): Record<string, unknown[]> {
  const grouped: Record<string, unknown[]> = {};
  for (const item of items) {
    const key = keyForItem(item);
    grouped[key] ??= [];
    grouped[key]!.push(serialize(item));
  }
  return grouped;
}

async function readJsonFile<T>(path: string): Promise<T | null> {
  const raw = await readTextFile(path);
  if (!raw.trim()) return null;
  return JSON.parse(raw) as T;
}

async function writeJsonFile(path: string, content: unknown) {
  await writeTextFile(path, `${JSON.stringify(content, null, 2)}\n`);
}

async function readProjectsFile(
  vaultRoot: string,
  path: string,
): Promise<Project[]> {
  const json = await readJsonFile<unknown>(path);
  if (Array.isArray(json)) {
    return json.map(parseProjectJson).filter(isProject);
  }

  if (isRecord(json) && Array.isArray(json.projects)) {
    return json.projects.map(parseProjectJson).filter(isProject);
  }

  return (await readTextFile(legacyProjectsPath(vaultRoot)))
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((name) => ({ name, color: colorForProjectName(name) }));
}

async function readLegacyTasksForYear(
  vaultRoot: string,
  year: number,
): Promise<Task[]> {
  const months = await legacyMonths(vaultRoot, "tasks", year);
  const groups = await Promise.all(
    months.map(async (month) =>
      parseTaskFile(await readTextFile(legacyTaskMonthPath(vaultRoot, year, month))),
    ),
  );
  return groups.flat();
}

async function readLegacyMeetingsForYear(
  vaultRoot: string,
  year: number,
): Promise<Meeting[]> {
  const months = await legacyMonths(vaultRoot, "meetings", year);
  const groups = await Promise.all(
    months.map(async (month) =>
      parseMeetingFile(
        await readTextFile(legacyMeetingMonthPath(vaultRoot, year, month)),
      ),
    ),
  );
  return groups.flat();
}

async function legacyMonths(
  vaultRoot: string,
  kind: "tasks" | "meetings",
  year: number,
) {
  try {
    const entries = await readdir(join(vaultRoot, kind, String(year)));
    return entries
      .map((entry) => entry.match(/^(\d{2})\.md$/)?.[1])
      .filter((month): month is string => Boolean(month));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

function goalsYearPath(vaultRoot: string, date: Date) {
  return join(vaultRoot, "journal", "goals", `${date.getFullYear()}.json`);
}

function tasksYearPath(vaultRoot: string, date: Date) {
  return join(vaultRoot, "journal", "tasks", `${date.getFullYear()}.json`);
}

function projectsPath(vaultRoot: string) {
  return join(vaultRoot, "journal", "tasks", "projects.json");
}

function meetingsYearPath(vaultRoot: string, date: Date) {
  return join(vaultRoot, "journal", "meetings", `${date.getFullYear()}.json`);
}

function legacyTaskMonthPath(vaultRoot: string, year: number, month: string) {
  return join(vaultRoot, "tasks", String(year), `${month}.md`);
}

function legacyMeetingMonthPath(vaultRoot: string, year: number, month: string) {
  return join(vaultRoot, "meetings", String(year), `${month}.md`);
}

function legacyProjectsPath(vaultRoot: string) {
  return join(vaultRoot, "tasks", "projects.md");
}

function yearFromPath(path: string) {
  return Number(path.match(/(\d{4})\.json$/)?.[1] ?? new Date().getFullYear());
}
