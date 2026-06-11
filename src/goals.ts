import type { GoalItem, GoalStatus, HeaderState } from "./domain.ts";
import { isRecord } from "./projects.ts";

export function normalizeGoalsDay(value: unknown): HeaderState {
  const record = isRecord(value) ? value : {};
  return {
    checked: Boolean(record.checked),
    mission: parseGoalItem(record.main),
    objective1: parseGoalItem(record.obj1),
    objective2: parseGoalItem(record.obj2),
    objective3: parseGoalItem(record.obj3),
  };
}

export function goalsDayToJson(state: HeaderState, date: string) {
  return {
    checked: state.checked,
    main: goalItemToJson(state.mission),
    obj1: goalItemToJson(state.objective1),
    obj2: goalItemToJson(state.objective2),
    obj3: goalItemToJson(state.objective3),
    date,
  };
}

export function parseGoalItem(value: unknown): GoalItem {
  if (!isRecord(value)) return { text: "", status: "open" };
  return {
    text: String(value.text ?? ""),
    status: normalizeGoalStatus(value.status),
  };
}

export function goalItemToJson(goal: GoalItem) {
  return {
    text: goal.text.trim(),
    status: goal.status,
  };
}

export function normalizeGoalStatus(status: unknown): GoalStatus {
  const value = String(status ?? "").trim().toLowerCase();
  return value === "done" || value === "concluido" ? "done" : "open";
}

export function emptyHeaderState(checked = false): HeaderState {
  return {
    checked,
    mission: { text: "", status: "open" },
    objective1: { text: "", status: "open" },
    objective2: { text: "", status: "open" },
    objective3: { text: "", status: "open" },
  };
}

export function goalItems(state: HeaderState) {
  return {
    mission: state.mission,
    objective1: state.objective1,
    objective2: state.objective2,
    objective3: state.objective3,
  };
}

export function goalStatusSymbol(status: GoalStatus) {
  return status === "done" ? "✓" : "☐";
}
