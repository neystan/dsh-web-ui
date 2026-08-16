# dsh-task-board — DSH web GUI 任务看板插件

[English](README.md) | 中文

一个可热插拔的 DeepSeek Harness (DSH) 插件：侧边栏「任务看板」入口打开多列看板视图；任务通过宿主 agent 会话**真实执行**，定时任务在**没有 GUI 标签页打开时也照常触发**。

- 不修改 DSH 源码：cordis 插件（宿主半边）+ 浏览器 DOM 扩展（客户端半边）。
- 数据与调度都在**宿主进程**（`~/.dsh/task-board.json`）：刷新/重启不丢，关标签页不影响定时执行。
- Agent 侧只有两个带 `action` 分发字段的单一工具：`cron`（create/list/pause/resume/run/delete）与 `todo`（add/list/done/delete）。

## 功能

- **多列看板**：待规划 / 待办 / 进行中 / 已完成 / 已失败；搜索过滤、新建任务、任务详情（描述 / Prompt / 执行历史）、执行/重新执行、带确认的删除、跳转执行会话 transcript、持久待办条。
- **真实执行**：宿主 runner 为每个任务维护一个稳定会话（`cron-<任务ID>@<工作区哈希>`），位于专用 cron 工作区（`~/.dsh/cron-workspace`，自动创建并注册为工作区）；会话标题固定为任务名；每次运行前注入隔离前导（忽略历史消息，周期任务上下文互不污染）；会话不销毁、可随时查看。
- **定时调度**（宿主分钟级心跳，无标签页也能跑）：
  - 周期：5 段 cron（分 时 日 月 周），派发时即滚动到下次（同一 tick 不会重复触发；错过的触发跳过不补跑）；
  - 一次性：`nextRunAt`（带 UTC offset 的 ISO 时间）或 `delaySeconds`（相对秒数）；触发在运行真正开始时消费；执行结束（无论成败）后任务删除；派发失败不会产生孤儿任务（仍到期 → 下个 tick 再次通知）；
  - 启动对账：周期规则从当前时刻重算；过期的一次性任务丢弃（绝不晚点执行）；
  - 所有定时执行都经过 LLM：宿主通知固定 **dispatcher 会话**（定时调度器），由它逐个调用 `cron` 工具 action=run。
- **Agent 工具**：`cron`（6 个 action，单一判别式调度记录 `{enabled, recurring, cron, nextRunAt, lastTriggeredAt}`）与 `todo`（4 个 action）；agent 建的任务/待办即时出现在看板，反之亦然。
- **系统提示词注入**：`plugin:task-board` 段（order 200）向每个 agent 声明本插件的能力与限制。

## 目录结构

```
src/index.ts                                # 宿主半边：store/runner/scheduler/routes/tools 接线 + 播报
src/host/store.ts                           # 宿主台账（~/.dsh/task-board.json，原子写，v1→v2 迁移）
src/host/runner.ts                          # 真实 agent 会话、cron 工作区、dispatcher 会话、工作区挂靠
src/host/scheduler.ts                       # 分钟心跳：到期批次、滚动、启动对账
src/host/execution-service.ts               # 打开→运行→结算 编排 + 一次性/手动运行策略
src/host/tools.ts                           # `cron` 与 `todo` 工具（action 分发）
src/host/routes.ts                          # /api/task-board/*（仅回环地址）
src/core/*.ts                               # 框架无关领域层：任务/待办/调度模型、控制器、用例、存储接口
src/client/*.ts(x)                          # 浏览器半边：API 桥、看板 UI、设置卡片、侧边栏入口
tests/*.spec.ts                             # vitest：领域、存储、调度器、工具、控制器、API 桥
```

## 安装

推荐安装全家桶聚合包 `@neystan/dsh-web-ui-all`，或单独安装本插件：

```sh
# npm 安装
dsh plugin --profile web add @neystan/dsh-client-ui-task-board

# 仓库安装（开发调试）
git clone https://github.com/neystan/dsh-web-ui.git
cd dsh-web-ui
pnpm install && pnpm -r build
dsh plugin --profile web add link:$(pwd)/packages/dsh-task-board
```

安装后**重启 `dsh web`**（页面刷新不够）。

## 构建与测试

```sh
pnpm --filter @neystan/dsh-client-ui-task-board typecheck
pnpm --filter @neystan/dsh-client-ui-task-board test
pnpm --filter @neystan/dsh-client-ui-task-board build   # lib/index.js + lib/client.js
```

## 数据与工作区

- 任务/待办台账：`~/.dsh/task-board.json`（宿主所有，格式版本 2，v1 行加载时自动迁移）。
- cron 工作区：`~/.dsh/cron-workspace`（自动创建；执行会话注册进该工作区，GUI 中显示在对应分组下）。
- 会话：每个任务一个稳定会话 + 固定 `cron-dispatcher` 会话（定时调度器）。

## 验证步骤

1. 新建任务，配置周期调度（如 `*/10 * * * *`）或一次性调度（`delaySeconds`），并在详情里手动运行 —— 任务应进入「进行中」→「已完成/已失败」，执行历史有记录，会话出现在 cron 工作区下。
2. 让 agent「列出定时任务」/「添加待办」—— `cron` / `todo` 工具操作的是看板显示的同一份宿主台账。
3. 关闭 GUI 标签页：定时任务照常触发（宿主调度）；重新打开后台账不变。
4. 重启 `dsh web`：调度对账（周期规则滚动到下一个匹配点；过期一次性任务丢弃），会话可恢复。
