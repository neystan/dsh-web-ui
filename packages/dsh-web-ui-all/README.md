# @neystan/dsh-web-ui-all

English | [中文](README.zh.md)

The one-click aggregate package for the whole dsh web UI family: installing it brings the task board (including host cron, todos, and real LLM execution), Git graph, right panel, whale-girl pet (including custom pet assets), image-understanding tool, web-ui settings, and the skin family (10 bundled skins plus the custom-theme slot). Skin assets are bundled inside `dsh-skins`; no per-skin package is needed.

## Original Author & Credits

Forked from [zhu1090093659/dsh-web-ui](https://github.com/zhu1090093659/dsh-web-ui) (original npm scope `@linxin666/*`); the original copyright belongs to zhu1090093659 and is retained in the LICENSE. Maintained by neystan as `@neystan/*`.

## What it is

- **One install, everything on**: its dependencies pull in all sub-plugin packages (aionui-panel / task-board / git-graph / pet / describe-image / web-ui-settings / dsh-skins).
- **Aggregation carrier**: `cordis.patch.yml` aggregates the `insert` lines of each sub-plugin, mounted through the dsh plugin profile mechanism.

## Included additions

- **Task board**: persistent todos (`todo_add`, `todo_list`, `todo_done`, `todo_delete`), host-side cron, and real DSH Agent sessions for each task's execution prompt.
- **Custom theme**: a compact editor for accent/background/foreground/contrast plus a reusable WebP background, with try-on, restore-default, and apply behavior.
- **Custom pet**: separately import and validate `pet.json` and `spritesheet.webp`, preview the candidate, and switch without a page refresh.

## Install

### From npm (recommended)

```sh
dsh plugin --profile web add @neystan/dsh-web-ui-all
```

### From the repository (development)

```sh
git clone https://github.com/neystan/dsh-web-ui.git
cd dsh-web-ui
pnpm install && pnpm -r build
node scripts/link-profile.mjs
dsh plugin --profile web add link:$(pwd)/packages/dsh-web-ui-all
```

Restart `dsh web` for the plugins to take effect.

## Known limitations

- Every sub-plugin activates together. For only a subset, install that sub-plugin package directly.
- Do not install the aggregate package alongside the standalone package of the same plugin (e.g. @neystan/dsh-pet); run `dsh plugin remove` on the old package before switching.
- Dependencies on the `@deepseek-ai/*` SDK are pinned; compatibility follows the repository's release cadence.
