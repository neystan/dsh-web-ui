# dsh-task-board — DSH web GUI task board plugin

English | [中文](README.zh.md)

A hot-pluggable DeepSeek Harness (DSH) plugin: a **task board** entry in the sidebar opens a multi-column kanban view; tasks execute for **real** through host agent sessions, and scheduled runs keep firing even while no GUI tab is open.

- No DSH source modification: cordis plugin (host half) + browser DOM extension (client half).
- Data and scheduling live in the **host process** (`~/.dsh/task-board.json`), so the board survives refreshes and restarts; tabs can close without stopping scheduled runs.
- Agent-facing surfaces are two single tools with an `action` dispatch field: `cron` (create/list/pause/resume/run/delete) and `todo` (add/list/done/delete).

## Features

- **Kanban board**: 待规划 / 待办 / 进行中 / 已完成 / 已失败 columns; search filter, new task, task detail (description / prompt / execution history), run / re-run, delete with confirm, jump to the execution session transcript, durable todo strip.
- **Real execution**: the host runner acquires a stable per-task session (`cron-<taskId>@<workspaceHash>`) inside a dedicated cron workspace (`~/.dsh/cron-workspace`, auto-created and registered as a workspace), pins the session title to the task title, and runs the task prompt with an isolation preamble (each scheduled run ignores prior conversation — recurring context stays independent). Sessions are never disposed and remain viewable.
- **Scheduling** (host, minute-granularity heartbeat, works without a GUI tab):
  - recurring: 5-field cron (`分 时 日 月 周`), rolled forward at dispatch (a tick can never double-fire; missed fires are skipped);
  - one-shot: ISO 8601 with UTC offset (`nextRunAt`) or relative `delaySeconds`; the trigger is consumed when the run actually starts; the task is removed once the run settles; a failed dispatch never orphans the task (still due → re-notified);
  - startup reconciliation: recurring rules recompute from now; expired one-shots are dropped (never fired late);
  - every scheduled run goes through the LLM: the host notifies the fixed **dispatcher session** (定时调度器), which calls `cron` action=run for each due task.
- **Agent tools**: `cron` (six actions, one discriminated schedule record `{enabled, recurring, cron, nextRunAt, lastTriggeredAt}`) and `todo` (four actions). Tasks and todos created by agents appear on the board immediately and vice versa.
- **System-prompt announcement**: a `plugin:task-board` section (order 200) declares the plugin's capabilities and limits to every agent.

## Directory structure

```
src/index.ts                                # host half: store/runner/scheduler/routes/tools wiring + announcement
src/host/store.ts                           # host ledger (~/.dsh/task-board.json, atomic writes, v1→v2 migration)
src/host/runner.ts                          # real agent sessions, cron workspace, dispatcher session, attach to workspace
src/host/scheduler.ts                       # minute heartbeat: due batches, roll-forward, startup reconciliation
src/host/execution-service.ts               # open → run → settle orchestration + one-shot/manual-run policy
src/host/tools.ts                           # the `cron` and `todo` tools (action dispatch)
src/host/routes.ts                          # /api/task-board/* (loopback-fenced)
src/core/*.ts                               # framework-free domain: tasks/todos/schedule models, controller, use-cases, store seam
src/client/*.ts(x)                          # browser half: API bridge, board UI, settings card, sidebar entry
tests/*.spec.ts                             # vitest: domain, store, scheduler, tools, controller, API bridge
```

## Install

Install the family aggregate `@linxin666/dsh-web-ui-all` or this plugin alone:

```sh
# from npm
dsh plugin --profile web add @linxin666/dsh-client-ui-task-board

# from the repo (development)
git clone https://github.com/neystan/dsh-web-ui.git
cd dsh-web-ui
pnpm install && pnpm -r build
dsh plugin --profile web add link:$(pwd)/packages/dsh-task-board
```

Restart `dsh web` after installing (a page refresh is not enough).

## Build & test

```sh
pnpm --filter @linxin666/dsh-client-ui-task-board typecheck
pnpm --filter @linxin666/dsh-client-ui-task-board test
pnpm --filter @linxin666/dsh-client-ui-task-board build   # lib/index.js + lib/client.js
```

## Data & workspaces

- Task/todo ledger: `~/.dsh/task-board.json` (host-owned; format version 2, v1 rows migrate on load).
- Cron workspace: `~/.dsh/cron-workspace` (auto-created; execution sessions are registered into it and appear under that workspace group in the GUI).
- Sessions: one stable session per task + the fixed `cron-dispatcher` session (定时调度器).

## Verification steps

1. Create a task, set a recurring schedule (e.g. `*/10 * * * *`) or a one-shot (`delaySeconds`), and run it manually from the detail view — the task moves 进行中 → 已完成/已失败, the execution log records it, and the session appears under the cron workspace.
2. Ask an agent to "list scheduled tasks" / "add a todo" — the `cron` / `todo` tools act on the same host ledger the board shows.
3. Close the GUI tab: scheduled runs keep firing (host scheduler); reopen later and the ledger is unchanged.
4. Restart `dsh web`: schedules are reconciled (recurring rules roll to their next match; expired one-shots are dropped), sessions resume.
