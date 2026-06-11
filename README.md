# logit

To install dependencies:

```bash
bun install
```

To run:

```bash
bun run start
```

The app uses `/home/mateusdreher/.my-vault` as the vault root by default.
Override it with:

```bash
JOURNAL_VAULT_ROOT=/path/to/vault bun run start
```

## Data formats

Tasks are saved in `journal/tasks/{year}.json`, grouped by month:

```json
{
  "06": [
    {
      "id": 1,
      "description": "Exemplo de tarefa",
      "project": "personal",
      "date": "11-06-2026",
      "status": "backlog"
    }
  ]
}
```

Valid task statuses are `backlog`, `blocked`, and `concluido`. New tasks default to `backlog`.
Older Markdown task files are still read as a fallback when the JSON file does not exist.

Meetings are saved in `journal/meetings/{year}.json`, grouped by month:

```json
{
  "06": [
    {
      "id": 1,
      "Title": "Exemplo de reuniao",
      "project": "personal",
      "date": "11-06-2026:11:00"
    }
  ]
}
```

Daily notes are loaded from and saved to `notes/dd-MM-yyyy.md`.

Header goals are saved in `journal/goals/{year}.json`, grouped by month:

```json
{
  "06": [
    {
      "checked": true,
      "main": { "text": "Missao do dia", "status": "open" },
      "obj1": { "text": "Objetivo 1", "status": "done" },
      "obj2": { "text": "Objetivo 2", "status": "open" },
      "obj3": { "text": "Objetivo 3", "status": "open" },
      "date": "11-06-2026"
    }
  ]
}
```

Known projects are cached in `journal/tasks/projects.json`, with one color per project.

## Code structure

- `index.ts`: TUI, panes, keyboard shortcuts, modal, focus, and render state.
- `src/domain.ts`: shared app types.
- `src/dates.ts`: date parsing/formatting helpers.
- `src/tasks.ts`: task parsing, normalization, sorting, grouping, and display labels.
- `src/meetings.ts`: meeting parsing, normalization, sorting, and display labels.
- `src/goals.ts`: mission/objective state and JSON shape helpers.
- `src/projects.ts`: project color and project JSON helpers.
- `src/storage.ts`: file paths, JSON persistence, and legacy Markdown fallback reads.
- `src/theme.ts`: terminal color palette.

## Keyboard

- `h`, `j`, `k`, `l`: move focus between panes in normal/view mode.
- `i` or `a`: enter insert mode and edit the focused non-task pane.
- `esc`: return to normal mode.
- `v`: enter view mode and select the focused pane text.
- `y`: copy selected text, or the focused pane text.
- In task panes, `j`/`k` navigate tasks, `a` opens the create task modal, `e` edits the selected task, and `x` marks it as `concluido`.
- In mission/objective panes, `x` toggles the item between open and done.
- In the task modal, `tab` changes field, `ctrl+n`/`ctrl+p` cycle known projects, `enter` or `ctrl+s` saves, and `esc` cancels.
- `ctrl+s`: save all panes.
- `q`: save and quit.

This project was created using `bun init` in bun v1.3.14. [Bun](https://bun.com) is a fast all-in-one JavaScript runtime.
