import type {
  BoxRenderable,
  InputRenderable,
  TextareaRenderable,
} from "@opentui/core";

export type Mode = "normal" | "view" | "insert";

export type TaskStatus = "backlog" | "concluido" | "blocked";

export type GoalStatus = "open" | "done";

export type GoalItem = {
  text: string;
  status: GoalStatus;
};

export type Task = {
  id?: number;
  project: string;
  status: TaskStatus;
  description: string;
  date?: string;
};

export type Meeting = {
  id?: number;
  project: string;
  description: string;
  dateTime: string;
};

export type HeaderState = {
  checked: boolean;
  mission: GoalItem;
  objective1: GoalItem;
  objective2: GoalItem;
  objective3: GoalItem;
};

export type HeaderPaneId =
  | "mission"
  | "objective1"
  | "objective2"
  | "objective3";

export type PaneId =
  | HeaderPaneId
  | "backlog"
  | "yesterday"
  | "today"
  | "tomorrow"
  | "note"
  | "meetings";

export type PaneKind = "header" | "task" | "note" | "meeting";

export type Pane = {
  id: PaneId;
  x: number;
  y: number;
  box: BoxRenderable;
  editor: TextareaRenderable;
  kind: PaneKind;
};

export type TaskLine = {
  line: number;
  task: Task;
};

export type Project = {
  name: string;
  color: string;
};

export type TaskModalState = {
  mode: "create" | "edit";
  sourcePaneId: PaneId;
  originalTask?: Task;
  box: BoxRenderable;
  fields: InputRenderable[];
  project: InputRenderable;
  status: InputRenderable;
  description: InputRenderable;
  date: InputRenderable;
  activeField: number;
};

export const headerPaneIds: HeaderPaneId[] = [
  "mission",
  "objective1",
  "objective2",
  "objective3",
];

export function isHeaderPaneId(id: PaneId): id is HeaderPaneId {
  return (
    id === "mission" ||
    id === "objective1" ||
    id === "objective2" ||
    id === "objective3"
  );
}
