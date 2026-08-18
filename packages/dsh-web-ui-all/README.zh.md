# @neystan/dsh-web-ui-all

[English](README.md) | 中文

DSH Web UI 全家桶聚合插件：一键安装任务看板（宿主 cron、待办、真实 LLM 执行）、Git 图谱、右侧面板、鲸鱼娘宠物（含自定义素材）、图像理解工具和皮肤全家桶（10 款内置皮肤 + 自定义主题槽位）。设置卡片使用 DSH rc.7 官方 keyed settings 槽位。皮肤资产内置在 `dsh-skins`，无需单独安装每个皮肤包。

## 原作者与致谢

本包 fork 自 [zhu1090093659/dsh-web-ui](https://github.com/zhu1090093659/dsh-web-ui)（原 npm scope `@linxin666/*`），原始版权归原作者 zhu1090093659 所有并在 LICENSE 中保留。由 neystan 以 `@neystan/*` 名义维护。

## 是什么

- **一次安装、全部到位**：其 dependencies 引入全部子插件包（aionui-panel / task-board / git-graph / pet / describe-image / dsh-skins）。
- **聚合载具**：`cordis.patch.yml` 汇总各子插件的 `insert` 行，经 dsh 插件 profile 机制挂载。

## 新增能力

- **任务看板**：持久化待办（`todo_add`、`todo_list`、`todo_done`、`todo_delete`）、宿主级 cron，以及按执行 Prompt 创建真实 DSH Agent 会话。
- **自定义主题**：精简的强调色 / 背景色 / 前景色 / 对比度编辑器，支持可复用 WebP 背景、试穿、恢复默认和应用。
- **自定义宠物**：分别导入并校验 `pet.json` 与 `spritesheet.webp`，先预览候选，再无刷新切换。

## 安装

### 从 npm 安装（推荐）

```sh
dsh plugin --profile web add @neystan/dsh-web-ui-all
```

### 从仓库安装（开发调试）

```sh
git clone https://github.com/neystan/dsh-web-ui.git
cd dsh-web-ui
pnpm install && pnpm -r build
node scripts/link-profile.mjs
dsh plugin --profile web add link:$(pwd)/packages/dsh-web-ui-all
```

安装后重启 `dsh web` 使插件生效。

## 已知限制

- 各子插件随本包一起激活；若只需要其中一部分，请直接安装对应子插件包。
- 不要与同名独立插件包（如 @neystan/dsh-pet）同时安装；切换前先 `dsh plugin remove` 移除旧的。
- 依赖的 `@deepseek-ai/*` SDK 版本已锁定，兼容性跟随本仓库的发版节奏。
