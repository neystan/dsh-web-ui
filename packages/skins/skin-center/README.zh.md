# Skin Center（GUI 内嵌皮肤中心）

[English](README.md) | 中文

`@neystan/dsh-client-ui-skin-center`（cordis 插件 id `ui-skin-center`）把皮肤列表/试穿/应用内嵌进真实 dsh Web GUI 的插件配置页，直接注册到 DSH rc.7 keyed `settings.plugin.item` 槽位，并以 `skin-background` 作为命名空间键，与其它插件卡片并列显示，不占设置页一级导航。

- 列表：展示独立的「官方默认」恢复入口，以及 11 个主题：10 个内置皮肤和 1 个自定义主题。所有主题使用相同卡片、试穿 / 应用按钮、激活标记、tagline 和强调色圆点；自定义卡额外提供编辑按钮。
- 试穿：点击「试穿」后按需加载内置皮肤的 client bundle——host 路由 `/api/skin-center/bundle/<id>` 以同源 script 提供 `lib/client.js`（内核加载插件的同一机制），factory 注册到页面自己的 `window.__ModuleLoader__`，`window.__DSH_MODULES__.import` 物化（不是模拟器、不用 eval）。官方和自定义主题使用同一套表面生命周期，不加载用户 bundle。外观立即切换且不刷新网页；「退出试穿」恢复之前的样式、DOM、favicon、标题、body 内联样式、自定义 token 和背景。
- 互斥：试穿期间会按配方暂时收回当前激活皮肤的视觉写面（body 属性、背景内联样式、chrome 子节点、xp 的 footer taskbar），退出后原样恢复；同一时刻页面上只有一套皮肤。
- 应用：host 半区（`src/index.ts` + `src/routes.ts`）暴露 `/api/skin-center/apply` 与 `/api/skin-center/bundle/<id>`（按需提供皮肤 bundle），点击「Apply / 恢复默认」即在服务端执行内嵌的 `dsh-skin use` 进程内移植版（`src/skin-switch.ts`），写入 `<harness-home>/cordis.patch.yml` 后由 DSH 配置 watcher 秒级热载入，页面自动刷新生效——**无需重启 dsh web，无需复制命令，也不要求 PATH 上有 `dsh-skin` 二进制**。应用失败时错误提示里附带终端兜底命令。harness home 与 dsh 启动器一致：注入的 HOME 映射为 `<home>/.dsh`，否则优先使用去除首尾空白后非空的 `$DSH_HOME`（直接使用，不再追加后缀），最后回退到 `~/.dsh`。目标 profile 依次取：显式选项、`$DSH_SKIN_PROFILE`、`$DSH_PROFILE`、`process.cwd()` 直接位于 `<harness-home>/profiles/<name>` 下时的 `<name>`，最后 `web`。Windows 兼容性：同一套解析规则不依赖 `$HOME` 与固定路径，符号链接权限不足时 profile 链接回退为目录 junction。
- 自定义主题：第 11 个主题拥有独立持久化身份和精简亮/暗编辑器，每套只有强调色、背景色、前景色和对比度。合法颜色实时预览；低对比度只警告、不阻止保存。「恢复默认参数」会写入固定的官方近似亮暗预设，同时保持自定义主题激活。应用任意目标都走相同的 host 状态和启动清单确认流程并刷新一次；自定义主题安全复用官方启动图及其语义 token 设置。原有受控语义表面始终采用同一组半透明颜色；body 同时保留不透明主题底色，因此有图片时透出图片，无图片时呈现稳定的纯色层次。
- 全局背景：官方默认与全部皮肤统一支持跟随皮肤、自定义图片、无背景。源 JPEG/PNG/WebP 限制为 10 MiB、单边 16384 px、4000 万像素；浏览器会在本地解码、缩放到最长边不超过 2560 px、去除元数据并转为不超过 6 MiB 的 WebP，Host 保存到 `<harness-home>/skin-center/assets/<sha256>.webp`。同一个遮挡滑块同时服务皮肤插画和自定义图片。

## 安装（官方 plugin bundle 方式）

推荐先装皮肤全家桶聚合包 `@neystan/dsh-skins` 一次到位（含全部皮肤与皮肤中心）；只装本包时用下列 link 命令。

```sh
# 装全部皮肤（推荐）
dsh plugin --profile web add @neystan/dsh-skins
# 或单独装皮肤中心
dsh plugin --profile web add @neystan/dsh-client-ui-skin-center
# 从仓库安装（开发调试）：dsh plugin --profile web add link:$(pwd)/packages/skins/skin-center
```

`$(pwd)` 指克隆全家桶仓库后的目录。

skin-center 是符合 DSH 官方插件标准的自包含 bundle（`dsh.bundle.patch` 指向 `cordis.patch.yml`、`prepare` 用专用 tsdown 配置自包含构建，无项目引用、无类型检查），也可经 git 安装：`dsh plugin --profile web add github:<org>/dsh-web-ui#<sha>`（`prepare` 会原地构建 `lib/`）。

本地 link 安装前需先在全家桶仓库内构建产物（`lib/` 被 git 忽略、不随仓库提交）：`pnpm install && pnpm -r build` 后再 link 安装。

pnpm ≥10 安装 git 依赖前需先授权 `allowBuilds`（`prepare` 会原地构建），本地 link 安装则无此要求。

需要皮肤插件们（qq98 / ths / xp / blue-fantasy）在宿主里也可解析时，skin-center 才能完整列出 / 试穿全部皮肤；skin-center 本身无互斥要求。

## 目录结构

```
skins/skin-center/
  package.json / tsdown.config.ts / tsconfig.json   # checkout 内构建所需的元数据
  src/index.ts                                       # host 侧：注册 /api/skin-center/* 路由
  src/routes.ts                                      # host 路由（代理 dsh-skin CLI）
  src/background-store.ts                            # WebP 限额校验与内容寻址存储
  src/core/theme.ts / background.ts                  # 纯派生、校验与配置迁移
  src/invariant.ts                                   # invariant 伴随插件（无断言）
  src/client/index.ts                                # apply：注册 Web UI 插件组卡片 + body 作用域
  src/client/SkinCenter.tsx                          # 卡片组件（官方 + 11 主题/试穿/一键应用）
  src/client/CustomThemeEditor.tsx                   # 自定义主题的三种颜色 + 对比度
  src/client/BackgroundEditor.tsx                    # 全局三态背景图片控制
  src/client/custom-theme.ts / background.ts         # 内联主题与背景控制器
  src/client/try-on.ts                               # 试穿引擎（真实 loader + 互斥还原，含官方试穿）
  src/client/locales.ts                              # en/zh 文案
  src/client/skin-center.module.css                  # 面板样式（--dsw-* token，随皮肤自适应）
  src/client/generated/skins.ts                      # 生成：皮肤注册表（仅元数据，勿手改）
```

## 机制要点

- 皮肤枚举：`generated/skins.ts` 由 `scripts/skin-center-bundles` 生成（读 `skins/<name>/skin.json`，校验 `lib/client.js` 存在）。**只含元数据，不内嵌 bundle 文本**：冷启动不解析 ~700KB 的 base64 美术资源，且生成文件跨机器可复现（无构建机绝对路径）。
- 试穿加载：host 路由 `/api/skin-center/bundle/<id>` 按需提供 `lib/client.js`（同源 script，`<script>` 标签加载——与内核 `defaultLoadBundle` 同一机制），bundle 体调用 `window.__ModuleLoader__.load` 只注册 factory；`window.__DSH_MODULES__.import(package)` 物化模块（CSS `<style data-plugin>` 自动注入）；`surface.apply(miniCtx)` 挂载，miniCtx 只实现 `effect(cb)`（皮肤唯一依赖）。不依赖 eval，因此不要求 CSP 放行 `unsafe-eval`——只要求同源 script 可加载（页面自身加载插件 bundle 亦然）。
- 失败语义：bundle 路由 404（皮肤未安装 / `lib/client.js` 未构建）或网络失败时，script 的 error 事件触发，试穿报通用错误并完整还原激活皮肤；加载与还原之间不会留下半套皮肤（tryOn 的 catch 分支负责恢复）。
- 退出还原：先跑皮肤的 disposer（属性/chrome/favicon/标题/背景全撤回），再 `invalidate(package)` + 删 style 标签，最后把激活皮肤的视觉快照原样恢复。官方默认试穿 = 同一套收回配方但不挂载任何皮肤，退出同样原样恢复。
- 激活主题检测：`window.__DSH_BOOT__.entries` 只含启用的内置皮肤，并与注册表 package 比对。内置匹配优先；否则 `skin-custom-theme.active` 为 true 时选择自定义，为 false 时选择官方默认。
- 外观持久化：`skin-custom-theme` 保存独立激活位和可选亮/暗配色；`skin-background` 保存全局背景模式、遮挡和图片 revision。主题只能写固定语义 token 白名单。背景端点只有 `POST /api/skin-center/background` 与 `GET`/`DELETE /api/skin-center/background/<revision>.webp`，写操作受同源和 loopback 双重限制。
- 一键应用：host `/api/skin-center/apply` 执行内嵌的 `dsh-skin use <name>` / `use official` 移植版（该移植版是 managed 区段与 symlink 的唯一权威）。路径为 `<harness-home>/cordis.patch.yml` 与 `<harness-home>/profiles/<profile>/node_modules`，home/profile 按上文规则解析。当激活皮肤自身已作为 bundle 安装——出现在 profile manifest 的 `dsh.profile.bundles` 或 `dependencies` 中（loader 仅对这两条通道做 patch 行归并），或注册表标记 `bundleWired`——home 层只写互斥的 `disabled: true` 行，insert 留给 bundle patch；其余情况（包括 skin-center 自建的可解析 symlink）都保留 home 层 insert 行。结构目录探测仅在 profile manifest 缺失/不可读时兜底。DSH 长驻表面自带配置 watcher（`watchUserPatches` + config-only HMR），patch 写入后数秒热载入、无需重启；浏览器刷新页面取新 boot 图即生效（client 插件图行增删不在 `dsh-client-hmr` 语义内）。

## 构建（仓库内 tsdown，无需 DSH checkout）

皮肤中心与皮肤一样，用仓库内共享 tsdown 预设构建（`shared/tsdown.client.ts` 处理 CSS Modules 注入与平台外部化；类型来自官方 NPM SDK devDependencies）：

```sh
# 1. 重新生成注册表（皮肤元数据变化后重跑；bundle 文本按需走 host 路由，无需重生成）
node scripts/skin-center-bundles
#    皮肤 bundle 自身变化只需重建对应皮肤（tsdown），GUI 下次试穿即取到新文本

# 2. 在仓库内构建
cd ~/code/dsh-web-ui && export NPM_TOKEN='<token>'   # 若仍使用私有 scope 认证
pnpm --filter @neystan/dsh-client-ui-skin-center run bundle
```

## 安装（个人环境接线，不在 checkout 提交）

```sh
# 1. profile symlink（与 qq98/blue-fantasy 同款）
ln -sfn ~/code/dsh-web-ui/packages/skins/skin-center \
  ~/.dsh/profiles/node_modules/@neystan/dsh-client-ui-skin-center

# 2. ~/.dsh/cordis.patch.yml 增加（放在 dsh-skin managed 段之外，勿动该段）：
#   - insert:
#       - id: ui-skin-center
#         name: '@neystan/dsh-client-ui-skin-center'

# 3. 配置 watcher 秒级热载入；刷新页面即在 插件配置 → Web UI 插件 组里看到皮肤中心卡片
```

## 试穿互斥的还原配方（try-on.ts）

| 皮肤 | body 属性 | 额外处理 |
| --- | --- | --- |
| 全部 | 收回 `bodyAttr`（CSS 失活） | 快照/清空 body 背景内联样式（blue-fantasy 鲸鱼背景）；摘除 body 直接子节点中非 `#root` 的 chrome（实测仅皮肤 chrome）；中性化观察器防幽灵写回 |
| xp | 同上 | 额外注入 neutralizer CSS 隐藏 sidebar footer 的 taskbar/开始按钮（其规则未按属性作用域） |

退出试穿 = 试穿皮肤 disposer（真实代码路径）→ 模块 invalidate + 样式清理 → 激活皮肤快照原样恢复。

## 验收对照（README 顶层契约）

- [x] 插件配置 → Web UI 插件 组里出现皮肤中心卡片，无 console 报错
- [x] 列表含独立官方默认入口和 11 个主题；自定义使用相同卡片，当前目标有标记
- [x] 试穿不刷新且真实生效（chrome/背景/标题/favicon/自定义 token），亮/暗正确；官方与自定义均可试穿
- [x] 退出完全还原；互斥（不出现两套标题栏）
- [x] 一键应用：host API 执行 `dsh-skin use`，watcher 热载入，页面自动刷新生效（无重启）；失败附命令兜底
- [x] 回归：dsh-skin CLI（含 `use official`）、网页 Gallery、官方 GUI 不受影响
- [x] 按需加载：冷启动不解析 ~700KB 内嵌 base64（`generated/skins.ts` 仅 5KB 元数据），试穿按需取 bundle；无 eval（CSP 无需 `unsafe-eval`）
- [x] 自定义主题的独立激活状态与亮/暗配色可持久化，试穿往返精确恢复，界面只提供三种颜色与对比度
- [x] 跟随皮肤 / 自定义图片 / 无背景覆盖全部皮肤；上传、替换、删除、缺图降级与遮挡均可持久化
- [x] e2e 截图见 `docs/e2e/skin-center/`
