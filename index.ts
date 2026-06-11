import {
  BoxRenderable,
  InputRenderable,
  SyntaxStyle,
  TextareaRenderable,
  TextRenderable,
  createCliRenderer,
  type KeyEvent,
} from "@opentui/core";
import {
  addDays,
  formatDate,
  parseDate,
  startOfDay,
} from "./src/dates.ts";
import {
  type HeaderPaneId,
  type HeaderState,
  type Meeting,
  type Mode,
  type Pane,
  type PaneId,
  type Project,
  type Task,
  type TaskLine,
  type TaskModalState,
  isHeaderPaneId,
} from "./src/domain.ts";
import { goalStatusSymbol } from "./src/goals.ts";
import {
  formatMeetings,
  parseMeetingText,
  uniqueMeetings,
} from "./src/meetings.ts";
import { colorForProjectName } from "./src/projects.ts";
import {
  compareTasks,
  formatBacklog,
  formatTasksForDate,
  groupByProject,
  isTask,
  normalizeTask,
  normalizeTaskStatus,
  taskStatusSymbol,
  uniqueTasks,
} from "./src/tasks.ts";
import {
  dailyNotePath,
  ensureTodayGoals,
  loadMeetingsFromStorage,
  loadProjectsFromStorage,
  loadTasksFromStorage,
  readTextFile,
  saveMeetingsToStorage,
  saveProjectsToStorage,
  saveTasksToStorage,
  upsertGoalsDay,
  writeTextFile,
} from "./src/storage.ts";
import { colors } from "./src/theme.ts";

const vaultRoot =
  process.env.JOURNAL_VAULT_ROOT ?? "/home/mateusdreher/.my-vault";
const today = startOfDay(new Date());
const weekDays = Array.from({ length: 4 }, (_, index) =>
  addDays(today, index - 1),
);
const weekDateSet = new Set(weekDays.map(formatDate));

const renderer = await createCliRenderer({
  exitOnCtrlC: false,
  clearOnShutdown: true,
  targetFps: 30,
  backgroundColor: colors.bg,
});

let mode: Mode = "normal";
let currentPaneIndex = 0;
let statusText: TextRenderable;
const panes: Pane[] = [];
let loadedTasks: Task[] = [];
let loadedMeetings: Meeting[] = [];
let projectsCache: Project[] = [];
let headerState: HeaderState;
let taskModal: TaskModalState | null = null;
const taskLinesByPane = new Map<PaneId, TaskLine[]>();
const selectedTaskByPane = new Map<PaneId, number>();
const taskSyntaxStyle = SyntaxStyle.fromStyles({
  selected: { fg: "#111318", bg: colors.focus, bold: true },
  done: { fg: "#7bd88f", dim: true },
  blocked: { fg: "#ff6b6b", bold: true },
});

const saveHeaderDebounced = debounce(() => void saveHeaderState(), 500);
const saveTasksDebounced = debounce(() => void saveTasks(), 700);
const saveMeetingsDebounced = debounce(() => void saveMeetings(), 700);
const saveNoteDebounced = debounce(() => void saveNote(), 500);

const root = new BoxRenderable(renderer, {
  id: "root",
  flexDirection: "column",
  width: "100%",
  height: "100%",
  backgroundColor: colors.bg,
  padding: 1,
  rowGap: 1,
});

renderer.root.add(root);

headerState = await ensureTodayGoals(vaultRoot, today);
loadedTasks = await loadTasksFromStorage(
  vaultRoot,
  today,
  weekDays,
  weekDateSet,
);
projectsCache = await loadProjectsFromStorage(vaultRoot, loadedTasks);
registerProjectStyles(projectsCache);
loadedMeetings = await loadMeetingsFromStorage(
  vaultRoot,
  weekDays,
  weekDateSet,
);
const notePath = dailyNotePath(vaultRoot, today);
const dailyNote = await readTextFile(notePath);

buildHeader(headerState);
buildBody(dailyNote);
buildFooter();
renderAllTaskPanes();
focusPane("mission");
setMode("normal");

// KEY Events
renderer.keyInput.on("keypress", (key) => {
  if (key.eventType === "release") return;

  if (taskModal) {
    handleTaskModalKey(key);
    return;
  }

  if (key.ctrl && key.name === "c") {
    saveAll().finally(() => renderer.destroy());
    key.preventDefault();
    key.stopPropagation();
    return;
  }

  if (key.ctrl && key.name === "s") {
    saveAll();
    flashStatus("salvo");
    key.preventDefault();
    key.stopPropagation();
    return;
  }

  if (mode === "insert") {
    if (key.name === "escape" || (key.ctrl && key.name === "c")) {
      setMode("normal");
      key.preventDefault();
      key.stopPropagation();
    }
    return;
  }

  key.preventDefault();
  key.stopPropagation();

  if (key.name === "escape") {
    setMode("normal");
    return;
  }

  if (mode === "view") {
    handleViewKey(key);
    return;
  }

  handleNormalKey(key);
});

process.on("SIGINT", () => {
  saveAll().finally(() => renderer.destroy());
});

// Boxes renderes
function buildHeader(state: HeaderState) {
  const header = new BoxRenderable(renderer, {
    id: "header",
    flexDirection: "row",
    height: 6,
    width: "100%",
    backgroundColor: colors.bg,
    columnGap: 1,
  });

  header.add(
    createPane({
      id: "mission",
      title: goalPaneTitle("mission"),
      initialValue: state.mission.text,
      x: 0,
      y: 0,
      width: "25%",
      backgroundColor: colors.mission,
      kind: "header",
      onChange: saveHeaderDebounced,
    }).box,
  );

  const objectives = new BoxRenderable(renderer, {
    id: "objectives",
    flexDirection: "row",
    flexGrow: 1,
    columnGap: 1,
    backgroundColor: colors.bg,
  });

  objectives.add(
    createPane({
      id: "objective1",
      title: goalPaneTitle("objective1"),
      initialValue: state.objective1.text,
      x: 1,
      y: 0,
      kind: "header",
      onChange: saveHeaderDebounced,
    }).box,
  );
  objectives.add(
    createPane({
      id: "objective2",
      title: goalPaneTitle("objective2"),
      initialValue: state.objective2.text,
      x: 2,
      y: 0,
      kind: "header",
      onChange: saveHeaderDebounced,
    }).box,
  );
  objectives.add(
    createPane({
      id: "objective3",
      title: goalPaneTitle("objective3"),
      initialValue: state.objective3.text,
      x: 3,
      y: 0,
      kind: "header",
      onChange: saveHeaderDebounced,
    }).box,
  );

  header.add(objectives);
  root.add(header);
  renderHeaderTitles();
}

function buildBody(note: string) {
  const body = new BoxRenderable(renderer, {
    id: "body",
    flexDirection: "row",
    flexGrow: 1,
    minHeight: 16,
    width: "100%",
    backgroundColor: colors.bg,
    columnGap: 1,
  });

  body.add(
    createPane({
      id: "backlog",
      title: "Backlog",
      initialValue: formatBacklog(loadedTasks),
      x: 0,
      y: 1,
      width: "19%",
      kind: "task",
      onChange: () => undefined,
    }).box,
  );

  const weekBox = new BoxRenderable(renderer, {
    id: "week",
    title: "Tarefas",
    border: true,
    borderColor: colors.border,
    titleColor: colors.text,
    flexDirection: "row",
    flexGrow: 1,
    padding: 1,
    columnGap: 1,
    backgroundColor: colors.panel,
  });

  const weekPaneSpecs: Array<[PaneId, string, Date, number]> = [
    ["yesterday", "Ontem", weekDays[0]!, 1],
    ["today", "Hoje", weekDays[1]!, 2],
    ["tomorrow", "Amanha", weekDays[2]!, 3],
  ];

  for (const [id, label, date, x] of weekPaneSpecs) {
    weekBox.add(
      createPane({
        id,
        title: `${label} ${formatDate(date)}`,
        initialValue: formatTasksForDate(loadedTasks, formatDate(date)),
        x,
        y: 1,
        kind: "task",
        backgroundColor: id === "today" ? colors.today : colors.panelAlt,
        onChange: () => undefined,
      }).box,
    );
  }

  body.add(weekBox);
  body.add(
    createPane({
      id: "note",
      title: "Nota do dia",
      initialValue: note,
      x: 5,
      y: 1,
      width: "26%",
      kind: "note",
      onChange: saveNoteDebounced,
    }).box,
  );

  root.add(body);
}

function buildFooter() {
  const footer = createPane({
    id: "meetings",
    title: "Reunioes",
    initialValue: formatMeetings(loadedMeetings),
    x: 0,
    y: 2,
    height: 7,
    kind: "meeting",
    onChange: saveMeetingsDebounced,
  });

  statusText = new TextRenderable(renderer, {
    id: "status",
    content: "",
    height: 1,
    width: "100%",
    fg: colors.muted,
    bg: colors.bg,
  });

  root.add(footer.box);
  root.add(statusText);
}

function createPane(options: {
  id: PaneId;
  title: string;
  initialValue: string;
  x: number;
  y: number;
  width?: number | `${number}%`;
  height?: number;
  backgroundColor?: string;
  kind: Pane["kind"];
  onChange: () => void;
}): Pane {
  const box = new BoxRenderable(renderer, {
    id: `${options.id}-box`,
    title: options.title,
    border: true,
    borderColor: colors.border,
    focusedBorderColor: colors.focus,
    titleColor: colors.text,
    flexDirection: "column",
    flexGrow: options.width ? undefined : 1,
    flexShrink: 1,
    flexBasis: options.width ? undefined : 0,
    width: options.width,
    height: options.height,
    minWidth: 0,
    padding: 1,
    backgroundColor: options.backgroundColor ?? colors.panel,
  });

  const editor = new TextareaRenderable(renderer, {
    id: options.id,
    initialValue: options.initialValue,
    width: "100%",
    height: "100%",
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 0,
    minWidth: 0,
    wrapMode: "word",
    showCursor: false,
    backgroundColor: options.backgroundColor ?? colors.panel,
    focusedBackgroundColor: options.backgroundColor ?? colors.panel,
    textColor: colors.text,
    focusedTextColor: colors.text,
    selectionBg: colors.select,
    syntaxStyle: options.kind === "task" ? taskSyntaxStyle : undefined,
    onContentChange: options.onChange,
  });

  box.add(editor);
  const pane: Pane = { ...options, box, editor };
  panes.push(pane);
  return pane;
}

// Functions

function handleNormalKey(key: KeyEvent) {
  if (currentPane().kind === "task" && handleTaskPaneKey(key)) return;
  if (key.shift && key.name === "tab") {
    moveFocus("left");
    return;
  }
  switch (key.name) {
    case "h":
    case "left":
      moveFocus("left");
      return;
    case "j":
    case "down":
      moveFocus("down");
      return;
    case "k":
    case "up":
      moveFocus("up");
      return;
    case "l":
    case "right":
    case "tab":
      moveFocus("right");
      return;
    case "i":
    case "a":
      setMode("insert");
      return;
    case "v":
      setMode("view");
      currentPane().editor.selectAll();
      return;
    case "y":
      copyCurrentText();
      return;
    case "x":
      if (currentPane().kind === "header") toggleCurrentGoal();
      else completeSelectedTask();
      saveCurrentKind();
      return;
    case "q":
      saveAll().finally(() => renderer.destroy());
      return;
  }
}

function handleTaskPaneKey(key: KeyEvent) {
  switch (key.name) {
    case "j":
    case "down":
      moveTaskSelection(1);
      return true;
    case "k":
    case "up":
      moveTaskSelection(-1);
      return true;
    case "a":
      openTaskModal("create", currentPane().id);
      return true;
    case "e":
    case "enter":
      openTaskModal(
        "edit",
        currentPane().id,
        selectedTaskForPane(currentPane().id),
      );
      return true;
    case "x":
      completeSelectedTask();
      return true;
  }
  return false;
}

function handleViewKey(key: KeyEvent) {
  switch (key.name) {
    case "y":
      copyCurrentText();
      setMode("normal");
      return;
    case "h":
    case "left":
    case "j":
    case "down":
    case "k":
    case "up":
    case "l":
    case "right":
      handleNormalKey(key);
      setMode("view");
      currentPane().editor.selectAll();
      return;
  }
}

function setMode(nextMode: Mode) {
  if (currentPane().kind === "task" && nextMode === "insert")
    nextMode = "normal";
  mode = nextMode;
  for (const pane of panes) {
    pane.editor.showCursor = pane === currentPane() && mode === "insert";
    if (pane === currentPane() && mode === "insert") pane.editor.focus();
    else pane.editor.blur();
  }
  renderAllTaskPanes();
  updateStatus();
}

function focusPane(id: PaneId) {
  const index = panes.findIndex((pane) => pane.id === id);
  if (index >= 0) currentPaneIndex = index;
  for (const pane of panes) {
    pane.box.borderColor =
      pane === currentPane() ? colors.focus : colors.border;
  }
  renderAllTaskPanes();
  setMode(mode);
}

function currentPane() {
  return panes[currentPaneIndex]!;
}

function moveFocus(direction: "left" | "right" | "up" | "down") {
  const current = currentPane();
  if (direction === "left" || direction === "right") {
    const sameRow = panes
      .filter((pane) =>
        direction === "left"
          ? pane.y === current.y && pane.x < current.x
          : pane.y === current.y && pane.x > current.x,
      )
      .sort((a, b) =>
        direction === "left" ? b.x - a.x : a.x - b.x,
      );

    if (sameRow[0]) {
      focusPane(sameRow[0].id);
      return;
    }

    const rows = Array.from(new Set(panes.map((pane) => pane.y))).sort(
      (a, b) => a - b,
    );
    const currentRowIndex = rows.indexOf(current.y);
    const targetRow =
      direction === "right"
        ? rows[currentRowIndex + 1]
        : rows[currentRowIndex - 1];
    if (targetRow === undefined) return;

    const targetRowPanes = panes
      .filter((pane) => pane.y === targetRow)
      .sort((a, b) => a.x - b.x);
    const target =
      direction === "right"
        ? targetRowPanes[0]
        : targetRowPanes[targetRowPanes.length - 1];
    if (target) focusPane(target.id);
    return;
  }

  const candidates = panes
    .filter((pane) =>
      direction === "up" ? pane.y < current.y : pane.y > current.y,
    )
    .map((pane) => ({
      pane,
      score: Math.abs(pane.y - current.y) * 10 + Math.abs(pane.x - current.x),
    }))
    .sort((a, b) => a.score - b.score);

  if (candidates[0]) focusPane(candidates[0].pane.id);
}

function copyCurrentText() {
  const editor = currentPane().editor;
  const text = editor.hasSelection()
    ? editor.getSelectedText()
    : editor.plainText;
  renderer.copyToClipboardOSC52(text);
  flashStatus("copiado");
}

function completeSelectedTask() {
  const selected = selectedTaskForPane(currentPane().id);
  if (!selected) return;
  replaceTask(selected, { ...selected, status: "concluido" });
  void persistTasksAndProjects();
  flashStatus("task concluida");
}

function toggleCurrentGoal() {
  const paneId = currentPane().id;
  if (!isHeaderPaneId(paneId)) return;
  headerState = collectHeaderState();
  const goal = headerState[paneId];
  goal.status = goal.status === "done" ? "open" : "done";
  renderHeaderTitles();
  void saveHeaderState();
  flashStatus(goal.status === "done" ? "concluido" : "reaberto");
}

function renderHeaderTitles() {
  for (const pane of panes) {
    if (!isHeaderPaneId(pane.id)) continue;
    pane.box.title = goalPaneTitle(pane.id);
    pane.box.titleColor =
      headerState[pane.id].status === "done" ? "#7bd88f" : colors.text;
  }
}

function goalPaneTitle(id: HeaderPaneId) {
  const labels: Record<HeaderPaneId, string> = {
    mission: "Missao do dia",
    objective1: "Objetivo 1",
    objective2: "Objetivo 2",
    objective3: "Objetivo 3",
  };
  return `${goalStatusSymbol(headerState?.[id]?.status ?? "open")} ${labels[id]}`;
}

function saveCurrentKind() {
  const kind = currentPane().kind;
  if (kind === "task") saveTasksDebounced();
  if (kind === "note") saveNoteDebounced();
  if (kind === "meeting") saveMeetingsDebounced();
  if (kind === "header") saveHeaderDebounced();
}

function updateStatus(extra = "") {
  const pane = currentPane();
  const shortcuts =
    pane.kind === "task"
      ? "j/k tarefa | h/l painel | a nova | e editar | x concluir | ctrl+s salvar | q sair"
      : pane.kind === "header"
        ? "i inserir | x concluir/reabrir | esc normal | v view | y copiar | ctrl+s salvar | q sair"
      : "i inserir | esc normal | v view | y copiar | ctrl+s salvar | q sair";
  statusText.content = `${mode.toUpperCase()} | ${pane.box.title ?? pane.id} | ${shortcuts}${extra ? ` | ${extra}` : ""}`;
}

function flashStatus(message: string) {
  updateStatus(message);
  setTimeout(() => updateStatus(), 1200);
}

function collectHeaderState(): HeaderState {
  return {
    checked: true,
    mission: { ...headerState.mission, text: paneText("mission") },
    objective1: { ...headerState.objective1, text: paneText("objective1") },
    objective2: { ...headerState.objective2, text: paneText("objective2") },
    objective3: { ...headerState.objective3, text: paneText("objective3") },
  };
}

// Functions
function collectTasks(): Task[] {
  return uniqueTasks(loadedTasks);
}

function paneText(id: PaneId) {
  return panes.find((pane) => pane.id === id)?.editor.plainText ?? "";
}

function renderAllTaskPanes() {
  renderTaskPane("backlog");
  renderTaskPane("yesterday");
  renderTaskPane("today");
  renderTaskPane("tomorrow");
}

function renderTaskPane(id: PaneId) {
  const pane = panes.find((candidate) => candidate.id === id);
  if (!pane || pane.kind !== "task") return;

  const date = dateForPane(id);
  const tasks = loadedTasks
    .filter((task) => (date ? task.date === date : !task.date))
    .sort(compareTasks);
  const grouped = groupByProject(tasks);
  const lines: string[] = [];
  const taskLines: TaskLine[] = [];
  const projectLines: Array<{ line: number; project: string }> = [];
  const doneLines: number[] = [];
  const blockedLines: number[] = [];

  for (const [project, projectTasks] of Object.entries(grouped)) {
    projectLines.push({ line: lines.length, project });
    lines.push(` ${project} `);
    for (const task of projectTasks) {
      taskLines.push({ line: lines.length, task });
      if (task.status === "concluido") doneLines.push(lines.length);
      if (task.status === "blocked") blockedLines.push(lines.length);
      lines.push(
        `  ${taskStatusSymbol(task.status)} ${task.description}${task.date && !date ? ` ${task.date}` : ""}`,
      );
      lines.push(" ");
    }
  }

  const selectedIndex = clamp(
    selectedTaskByPane.get(id) ?? 0,
    0,
    Math.max(0, taskLines.length - 1),
  );
  selectedTaskByPane.set(id, selectedIndex);
  taskLinesByPane.set(id, taskLines);
  pane.editor.setText(lines.join("\n").trimEnd());
  applyTaskHighlights(
    pane,
    projectLines,
    taskLines[selectedIndex]?.line,
    doneLines,
    blockedLines,
  );
}

function applyTaskHighlights(
  pane: Pane,
  projectLines: Array<{ line: number; project: string }>,
  selectedLine: number | undefined,
  doneLines: number[],
  blockedLines: number[],
) {
  pane.editor.clearAllHighlights();
  const selectedStyle = taskSyntaxStyle.getStyleId("selected");
  const doneStyle = taskSyntaxStyle.getStyleId("done");
  const blockedStyle = taskSyntaxStyle.getStyleId("blocked");

  for (const { line, project } of projectLines) {
    const projectStyle = projectStyleId(project);
    if (projectStyle !== null)
      pane.editor.addHighlight(line, {
        start: 0,
        end: 1000,
        styleId: projectStyle,
      });
  }
  for (const line of doneLines) {
    if (doneStyle !== null)
      pane.editor.addHighlight(line, {
        start: 0,
        end: 1000,
        styleId: doneStyle,
      });
  }
  for (const line of blockedLines) {
    if (blockedStyle !== null)
      pane.editor.addHighlight(line, {
        start: 0,
        end: 1000,
        styleId: blockedStyle,
      });
  }
  if (
    selectedLine !== undefined &&
    selectedStyle !== null &&
    currentPane() === pane &&
    mode === "normal"
  ) {
    pane.editor.addHighlight(selectedLine, {
      start: 0,
      end: 1000,
      styleId: selectedStyle,
      priority: 10,
    });
  }
}

function moveTaskSelection(delta: number) {
  const paneId = currentPane().id;
  const lines = taskLinesByPane.get(paneId) ?? [];
  if (lines.length === 0) return;
  selectedTaskByPane.set(
    paneId,
    clamp((selectedTaskByPane.get(paneId) ?? 0) + delta, 0, lines.length - 1),
  );
  renderTaskPane(paneId);
}

function selectedTaskForPane(paneId: PaneId) {
  const lines = taskLinesByPane.get(paneId) ?? [];
  return lines[selectedTaskByPane.get(paneId) ?? 0]?.task;
}

function openTaskModal(
  modalMode: TaskModalState["mode"],
  sourcePaneId: PaneId,
  task?: Task,
) {
  if (taskModal) closeTaskModal();
  if (modalMode === "edit" && !task) return;

  const defaultTask: Task = {
    project: projectsCache[0]?.name ?? "Geral",
    status: "backlog",
    description: "",
    date: dateForPane(sourcePaneId),
  };
  const taskValue = task ?? defaultTask;
  const box = new BoxRenderable(renderer, {
    id: "task-modal",
    title: modalMode === "create" ? "Nova tarefa" : "Editar tarefa",
    border: true,
    borderColor: colors.focus,
    titleColor: colors.text,
    backgroundColor: colors.modal,
    position: "absolute",
    top: "18%",
    left: "18%",
    width: "64%",
    height: 16,
    zIndex: 100,
    padding: 1,
    rowGap: 1,
    flexDirection: "column",
  });

  const project = createModalField("Projeto", taskValue.project, box);
  const status = createModalField("Status", taskValue.status, box);
  const description = createModalField("Descricao", taskValue.description, box);
  const date = createModalField("Data dd-MM-yyyy", taskValue.date ?? "", box);

  const help = new TextRenderable(renderer, {
    id: "task-modal-help",
    content:
      "enter/ctrl+s salvar | esc cancelar | tab proximo campo | ctrl+n/p projetos",
    height: 1,
    fg: colors.muted,
    bg: colors.modal,
  });
  box.add(help);

  root.add(box);
  taskModal = {
    mode: modalMode,
    sourcePaneId,
    originalTask: task,
    box,
    fields: [project, status, description, date],
    project,
    status,
    description,
    date,
    activeField: 0,
  };
  focusModalField(0);
}

function createModalField(title: string, value: string, parent: BoxRenderable) {
  const fieldBox = new BoxRenderable(renderer, {
    id: `task-modal-${title}`,
    title,
    border: true,
    borderColor: colors.border,
    focusedBorderColor: colors.focus,
    titleColor: colors.text,
    height: 3,
    width: "100%",
    paddingX: 1,
    backgroundColor: colors.modal,
  });
  const input = new InputRenderable(renderer, {
    id: `task-modal-input-${title}`,
    value,
    width: "100%",
    backgroundColor: colors.modal,
    focusedBackgroundColor: colors.modal,
    textColor: colors.text,
    focusedTextColor: colors.text,
    cursorColor: colors.focus,
  });
  fieldBox.add(input);
  parent.add(fieldBox);
  return input;
}

function handleTaskModalKey(key: KeyEvent) {
  key.preventDefault();
  key.stopPropagation();
  if (!taskModal) return;

  if (key.name === "escape") {
    closeTaskModal();
    return;
  }
  if (key.name === "tab" || key.name === "down") {
    focusModalField(taskModal.activeField + 1);
    return;
  }
  if (key.name === "up") {
    focusModalField(taskModal.activeField - 1);
    return;
  }
  if (key.ctrl && key.name === "n") {
    cycleProject(1);
    return;
  }
  if (key.ctrl && key.name === "p") {
    cycleProject(-1);
    return;
  }
  if (key.name === "enter" || key.name === "return" || (key.ctrl && key.name === "s")) {
    saveTaskModal();
    return;
  }

  taskModal.fields[taskModal.activeField]?.handleKeyPress(key);
}

function focusModalField(index: number) {
  if (!taskModal) return;
  taskModal.activeField =
    ((index % taskModal.fields.length) + taskModal.fields.length) %
    taskModal.fields.length;
  for (const [fieldIndex, field] of taskModal.fields.entries()) {
    if (fieldIndex === taskModal.activeField) field.focus();
    else field.blur();
  }
}

function cycleProject(delta: number) {
  if (!taskModal || projectsCache.length === 0) return;
  const current = taskModal.project.value;
  const projectNames = projectsCache.map((project) => project.name);
  const currentIndex = Math.max(0, projectNames.indexOf(current));
  const nextIndex =
    (((currentIndex + delta) % projectsCache.length) + projectsCache.length) %
    projectsCache.length;
  taskModal.project.value = projectsCache[nextIndex]!.name;
}

function saveTaskModal() {
  if (!taskModal) return;
  const nextTask = normalizeTask({
    project: taskModal.project.value,
    status: normalizeTaskStatus(taskModal.status.value),
    description: taskModal.description.value,
    date: taskModal.date.value || undefined,
  });
  if (!isTask(nextTask)) {
    flashStatus("task invalida");
    return;
  }

  if (taskModal.mode === "edit" && taskModal.originalTask)
    replaceTask(taskModal.originalTask, nextTask);
  else addTask(nextTask);
  const targetPane = paneIdForTask(nextTask);
  selectedTaskByPane.set(targetPane, taskIndexForPane(targetPane, nextTask));
  closeTaskModal();
  focusPane(targetPane);
  void persistTasksAndProjects();
  flashStatus("task salva");
}

function closeTaskModal() {
  if (!taskModal) return;
  root.remove(taskModal.box.id);
  taskModal = null;
  setMode("normal");
}

function paneIdForTask(task: Task): PaneId {
  if (!task.date) return "backlog";
  if (task.date === formatDate(weekDays[0]!)) return "yesterday";
  if (task.date === formatDate(weekDays[1]!)) return "today";
  if (task.date === formatDate(weekDays[2]!)) return "tomorrow";
  return "backlog";
}

function taskIndexForPane(paneId: PaneId, task: Task) {
  return Math.max(
    0,
    (taskLinesByPane.get(paneId) ?? []).findIndex((line) =>
      sameTask(line.task, task),
    ),
  );
}

function replaceTask(original: Task, next: Task) {
  loadedTasks = uniqueTasks(
    loadedTasks.map((task) =>
      sameTask(task, original)
        ? normalizeTask({ ...next, id: next.id ?? task.id })
        : task,
    ),
  );
  syncProjectCacheFromTasks();
  renderAllTaskPanes();
}

function addTask(task: Task) {
  loadedTasks = uniqueTasks([
    ...loadedTasks,
    normalizeTask({ ...task, id: task.id ?? nextTaskId() }),
  ]);
  syncProjectCacheFromTasks();
  renderAllTaskPanes();
}

function sameTask(a: Task, b: Task) {
  if (a.id !== undefined && b.id !== undefined) return a.id === b.id;
  return (
    a.project === b.project &&
    a.status === b.status &&
    a.description === b.description &&
    (a.date ?? "") === (b.date ?? "")
  );
}

function syncProjectCacheFromTasks() {
  const existingByName = new Map(
    projectsCache.map((project) => [project.name, project]),
  );
  for (const task of loadedTasks) {
    const name = task.project.trim();
    if (!name || existingByName.has(name)) continue;
    existingByName.set(name, { name, color: colorForProjectName(name) });
  }
  projectsCache = Array.from(existingByName.values()).sort((a, b) =>
    a.name.localeCompare(b.name),
  );
  registerProjectStyles();
}

async function persistTasksAndProjects() {
  await Promise.all([saveTasks(), saveProjects()]);
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function nextTaskId() {
  return (
    Math.max(0, ...loadedTasks.map((task) => task.id ?? 0)) + 1
  );
}

async function saveHeaderState() {
  headerState = collectHeaderState();
  await upsertGoalsDay(vaultRoot, today, headerState);
  renderHeaderTitles();
}

async function saveTasks() {
  const edited = collectTasks();
  await saveTasksToStorage(
    vaultRoot,
    today,
    weekDays,
    weekDateSet,
    edited,
  );
  loadedTasks = edited;
}

async function saveProjects() {
  await saveProjectsToStorage(vaultRoot, projectsCache);
}

async function saveMeetings() {
  const edited = uniqueMeetings(parseMeetingText(paneText("meetings")));
  await saveMeetingsToStorage(
    vaultRoot,
    today,
    weekDays,
    weekDateSet,
    edited,
  );
  loadedMeetings = edited;
}

async function saveNote() {
  await writeTextFile(notePath, paneText("note"));
}

async function saveAll() {
  await Promise.all([
    saveHeaderState(),
    saveTasks(),
    saveMeetings(),
    saveNote(),
  ]);
}

function dateForPane(id: PaneId) {
  if (id === "yesterday") return formatDate(weekDays[0]!);
  if (id === "today") return formatDate(weekDays[1]!);
  if (id === "tomorrow") return formatDate(weekDays[2]!);
  return undefined;
}

function projectStyleId(projectName: string) {
  const styleName = projectStyleName(projectName);
  const existing = taskSyntaxStyle.getStyleId(styleName);
  if (existing !== null) return existing;
  return taskSyntaxStyle.registerStyle(styleName, {
    fg: "#ffffff",
    bg: projectColor(projectName),
    bold: true,
  });
}

function registerProjectStyles(projects = projectsCache) {
  for (const project of projects) {
    taskSyntaxStyle.registerStyle(projectStyleName(project.name), {
      fg: "#ffffff",
      bg: project.color,
      bold: true,
    });
  }
}

function projectStyleName(projectName: string) {
  return `project:${projectName}`;
}

function projectColor(projectName: string) {
  return (
    projectsCache.find((project) => project.name === projectName)?.color ??
    colorForProjectName(projectName)
  );
}

function debounce(callback: () => void, delay: number) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(callback, delay);
  };
}
