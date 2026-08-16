# dsh-pet 自定义宠物 MVP 设计

## 状态

本设计已确认。`dsh-pet` 保留内置鲸鱼娘，并增加一个可导入、预览、应用和删除的自定义宠物槽。自定义宠物严格复用内置宠物的九动作图集契约、状态机、播放节奏、互动、养成数据和显示配置。

## 目标

- 用户分别选择 `pet.json` 和 `spritesheet.webp`，无需压缩包。
- 用户可在设置卡中并列查看官方鲸鱼娘与一个自定义宠物。
- 导入只创建待应用素材，点击“使用所选宠物”后才切换，页面不刷新。
- 导入、应用或删除失败时保留可用宠物，不出现空白浮层。
- 当前选择、名字、亲密度、小鱼干、大小和位置在刷新及 DSH 重启后恢复。
- 设置卡提供一键复制的中英文生成提示词，并只引用仓库相对路径 `packages/dsh-pet/assets/whale`。
- 新增界面沿用当前设置卡的语义颜色、圆角、字号、密度和交互状态。

## 不做的功能

- 不在插件内调用 AI 或把普通图片自动转换为动画。
- 不增加多个自定义宠物、宠物注册表、素材市场或历史版本。
- 不支持 ZIP、PNG、GIF、APNG、Codex v2 观察方向或任意图集布局。
- 不允许自定义动作、帧数、播放速度、状态映射或单元尺寸。
- 不为每个宠物保存独立名字、亲密度、小鱼干、位置或大小。
- 不修改默认宠物素材、现有会话状态投影或悬浮宠物面板功能。

## 现有事实基线

内置宠物运行素材位于 `packages/dsh-pet/assets/whale/pet.json` 与 `packages/dsh-pet/assets/whale/spritesheet.webp`。`assets/whale/previews` 只用于 README 演示，不参与运行。

现有图集是 `1536×1872` 的透明 WebP，由 8 列、9 行、每格 `192×208` 组成。行序固定为 `idle`、`running-right`、`running-left`、`waving`、`jumping`、`failed`、`waiting`、`running`、`review`，有效帧数固定为 `[6, 8, 8, 4, 5, 8, 6, 6, 6]`。

现有状态机实际由会话活动触发 `idle`、`running-right`、`jumping`、`failed`、`waiting`、`running` 和 `review`。`running-left` 与 `waving` 继续作为素材轨道保留，本功能不增加触发场景。

现有 `$DSH_HOME/pet.json` 保存全局名字、亲密度、小鱼干账本和显示配置。本功能只为该对象增加当前外观选择，不改变其余字段的含义。

## 自定义素材契约

用户选择的两个文件名必须严格为 `pet.json` 和 `spritesheet.webp`。文件名只用于输入校验，Host 永远写入固定目录，不使用浏览器提交的路径。

`pet.json` 必须是 UTF-8 JSON，并符合以下结构：

```ts
interface PetAssetManifest {
  id: string
  displayName: string
  description: string
  spritesheetPath: 'spritesheet.webp'
  frames: [6, 8, 8, 4, 5, 8, 6, 6, 6]
}
```

`id` 必须匹配 `[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?`。`displayName` 去除首尾空格后为 1 至 40 个字符，`description` 去除首尾空格后不超过 160 个字符，`spritesheetPath` 必须严格等于 `spritesheet.webp`，`frames` 必须与内置数组完全一致。缺失字段、错误类型、未知运行参数和超出限制的文本均拒绝导入。

`pet.json` 最大 64 KiB，`spritesheet.webp` 最大 8 MiB。WebP 必须具有 RIFF/WEBP 文件头、透明通道和 `1536×1872` 尺寸。

浏览器解码图集后逐格检查：每个有效帧至少包含一个 alpha 大于 8 的像素；每行未使用的尾部单元格全部 alpha 不大于 8；每个有效单元格包含透明区域，拒绝整格不透明背景；无法解码、无法读取像素或尺寸错误均拒绝导入。

内置 `assets/whale` 文件是自动化测试的黄金样本，必须通过同一 manifest 与图集校验器。

## 存储和持久化

官方鲸鱼娘继续从插件安装目录读取，不复制到 `$DSH_HOME`。自定义素材只使用以下固定结构：

```text
$DSH_HOME/pet/custom/
|-- current/
|   |-- pet.json
|   `-- spritesheet.webp
`-- candidate/
    |-- pet.json
    `-- spritesheet.webp
```

`current` 是已应用的自定义素材，`candidate` 是已导入并通过校验、等待应用的素材。临时写入目录和 `.backup` 只在一次原子操作期间存在，操作完成或启动恢复后立即清理，不形成历史版本。

现有 `PetPersist` 增加一个字段：

```ts
interface PetPersist {
  appearance: 'official' | 'custom'
  name: string
  affinity: AffinityState
  treats: TreatLedger
  display: PetDisplayConfig
}
```

旧文件缺少 `appearance` 时按 `official` 读取，其余字段保持原值。选择 `custom` 但 `current` 缺失或无效时，服务回退 `official` 并原子保存修正后的选择，不修改养成或显示数据。

## 最小代码边界

`src/core/pet-assets.ts` 是 Host 与 client 共用的素材契约事实源，保存尺寸、行序、帧数、manifest 类型和纯 manifest 校验，不依赖 DOM、Node 文件系统或 DSH 服务。

`src/pet-asset-store.ts` 只负责固定目录解析、临时写入、`candidate` 替换、`candidate` 到 `current` 的备份交换、删除和启动恢复，不了解 React、设置卡或会话状态。

`src/routes.ts` 在现有 API 中增加素材状态、导入、应用官方、应用自定义和删除端点，并为 `current` 与 `candidate` 提供只读静态路由。现有官方资源路由保持不变。

`src/service.ts` 继续拥有运行状态和账本，只增加外观选择、素材管理编排及浏览器可用的素材描述。状态机、奖励和互动方法不改变。

`src/client/pet-image-validation.ts` 负责浏览器 WebP 解码、Canvas alpha 扫描和校验结果，不负责上传或写设置。

`src/client/generation-prompt.ts` 根据共用契约常量生成中英文提示词，避免按钮文案中的尺寸、行序或帧数与校验器漂移。

`src/client/PetAppearanceField.tsx` 渲染双宠物卡片、文件选择、待应用预览、复制提示词、应用和删除操作。现有 `PluginSettingsCard` 与生成的共享 CSS 文件不修改。

`src/client/pet-appearance.module.css` 只保存宠物外观区域的包内样式，并使用现有 DSH 语义 token。

`src/client/WhalePet.tsx` 保留组件与现有互动，只把固定素材 URL 改为由服务状态提供的 manifest URL、spritesheet URL 和内容哈希。文件名和大范围组件结构不做无关重构。

## API 和传输

素材管理路由在插件加载期间始终注册，因此关闭“启用宠物”后仍可导入、应用或删除素材。关闭只停止会话事件监听、宠物浮层和浏览器状态轮询。

浏览器读取两个文件后，通过一个导入请求提交：

```ts
interface ImportPetBody {
  manifestFileName: 'pet.json'
  manifestText: string
  spritesheetFileName: 'spritesheet.webp'
  spritesheetBase64: string
  expectedState: string
}
```

导入端点单独使用 12 MiB 请求上限，以容纳最大 8 MiB WebP 的 Base64 膨胀；其他现有 JSON 端点继续使用 64 KiB 上限。图片字节不进入 SettingsScope、settings YAML 或 `$DSH_HOME/pet.json`。

Host 重新解析原始 manifest 文本并验证字符串、Base64、解码字节数、RIFF/WEBP 魔数、头部尺寸和 alpha 能力。Host 不引入 `sharp` 等大型原生图片依赖；逐格像素校验由浏览器完成，写入后的 `candidate` 必须通过 Host 静态路由重新加载和再次解码，客户端才启用应用按钮。

素材管理状态返回官方、自定义当前、自定义候选的 manifest、静态 URL、内容哈希、当前选择、操作状态标识和稳定错误码。内容哈希只用于缓存刷新及过期请求校验，不映射为版本目录。

所有导入、应用与删除在 Host 进程内串行执行。每个写请求携带 `expectedState`；状态已改变时返回 `409`，客户端重新读取状态，不让多标签页操作交叉覆盖。

## 导入、预览和应用

导入流程如下：

1. 浏览器检查两个文件名、大小、manifest 和图集像素。
2. 浏览器一次提交 manifest 原文与 WebP Base64。
3. Host 在临时目录中重新校验并写入两个文件。
4. Host 原子替换 `candidate`，不修改 `current` 或当前选择。
5. 浏览器从候选静态路由重新加载文件并再次完成解码校验。
6. 自定义卡片显示候选的 `idle` 预览、`displayName`、一行 `description` 和“待应用”。

应用自定义宠物时，Store 把旧 `current` 移到单一 `.backup`，把 `candidate` 移为 `current`，更新 `appearance='custom'`，再删除备份。任一步骤失败时恢复旧目录和旧选择。

没有候选但已有有效 `current` 时，应用自定义只更新 `appearance='custom'`。应用官方宠物只更新 `appearance='official'`，保留 `current` 供以后再次切换。

服务状态中的素材 URL包含内容哈希查询参数。选择或内容哈希变化时，现有宠物组件重新加载 manifest 与 WebP 并继续使用相同九动作状态，不刷新页面。

## 删除和恢复

删除按钮只在存在 `current` 或 `candidate` 时显示，并先要求简短确认。

删除正在使用的自定义宠物时，服务先原子保存 `appearance='official'`，确认官方素材描述可用，再删除 `current`、`candidate` 和操作残留。删除失败时保持官方选择并报告错误；无法完成安全切换时不删除素材。

启动时检测 `.backup`、临时目录和素材文件对。完整旧备份优先恢复到缺失的 `current`，不完整临时目录直接清理；任何无法确认的自定义素材均不阻止 Web GUI 启动，运行外观回退官方。

## 设置界面

现有悬浮宠物面板继续只显示喂食、改名和隐藏。素材管理全部位于现有“宠物”设置卡的“宠物外观”区域。

外观区域使用两张并列卡片。官方卡循环显示内置 `idle` 动画并标记是否当前使用；自定义卡按状态显示未导入、候选预览、当前使用或待应用。窄设置栏中两张卡片纵向排列。

点击卡片只改变客户端选中状态，点击“使用所选宠物”才调用应用 API。自定义槽没有可用 `current` 或已校验 `candidate` 时不能应用。

自定义卡提供“选择 pet.json”“选择 spritesheet.webp”“验证并导入”“复制生成提示词”和条件显示的“删除”。两个文件未同时选择、客户端校验未通过或正在操作时，导入按钮禁用。

素材操作通过 API 立即执行，不进入 SettingsScope 的“保存/放弃”草稿。现有启用、显示、大小、右距、底距和名字字段继续使用原有 SettingsScope 表单及保存按钮。

所有新颜色使用 `--dsw-*` 语义 token；外卡 12px 圆角，内部卡与按钮使用现有 8 至 10px 圆角和当前 12 至 15px 字号密度。不引入 UI 框架、装饰图标或悬浮面板按钮。

卡片使用原生按钮和文件输入，支持键盘操作、可见焦点和文字状态，选中状态不只依赖颜色。`prefers-reduced-motion` 启用时预览固定在第一帧。

## 复制生成提示词

中文界面复制中文提示词，英文界面复制英文提示词。提示词由共用契约常量组装，并包含以下要求：

- 用户同时向 Agent 附加一张清晰、完整、无遮挡的宠物参考图。
- 以仓库相对路径 `packages/dsh-pet/assets/whale` 为格式模板，不包含盘符、用户名或绝对路径。
- 最终只交付 `pet.json` 与 `spritesheet.webp`。
- 图集尺寸、单元尺寸、九行动作行序和固定有效帧数。
- 透明背景、空白尾部单元格、角色身份一致性和逐行动画 QA。

按钮优先使用 Clipboard API，必要时使用受控文本选择回退。复制成功后短暂显示“已复制”，失败时在按钮下显示“复制失败，请重试”，不弹出模态框或常驻完整提示词。

## 错误和安全语义

客户端按字段显示稳定错误，包括文件名错误、manifest 字段错误、文件过大、WebP 无法解码、尺寸不符、具体动作行空白和尾部单元格不透明。错误不会清除用户已选择的另一文件。

Host 使用稳定错误码和适当状态码：输入或校验错误返回 `400`，过期状态返回 `409`，不可恢复的文件系统错误返回 `500`。客户端本地化错误码，不显示绝对路径、堆栈或原始内部异常。

素材内容只作为 JSON 文本和 `image/webp` 响应处理，不执行上传内容，不接受外部 URL，不从 manifest 解析路径，不把 HTML 注入 DOM。静态路由固定 Content-Type，并通过内容哈希、ETag 与 `Cache-Control: no-cache` 协调缓存。

## 测试

纯逻辑测试覆盖共用常量、manifest 正例、所有字段边界、未知字段、固定帧数和内置 `assets/whale/pet.json` 黄金样本。

浏览器图片测试通过可注入解码器和 RGBA 样本覆盖正确图集、错误尺寸、有效帧空白、不透明尾格、不透明背景、解码失败和 reduced-motion 预览。真实内置 WebP 另作为集成黄金样本检查文件头与尺寸。

Store 测试覆盖首次导入、候选替换、候选应用、旧 current 回滚、官方切换、自定义删除、启动备份恢复、损坏素材回退和不保留历史版本。

路由测试覆盖 64 KiB 默认限制、12 MiB 导入限制、Base64 和 WebP 头部拒绝、固定文件名、状态冲突、禁用状态下管理可用、静态响应类型及内容哈希缓存。

Service 与持久化测试覆盖旧 `pet.json` 迁移、选择往返、无效 current 回退、养成数据不变、应用与删除失败语义及管理操作串行化。

Client 组件测试覆盖双卡状态、选择后应用、候选预览、导入错误、删除确认、键盘操作、中英文复制提示词、相对路径、无盘符、剪贴板成功和失败反馈，以及素材哈希变化后重新加载。

## 文档和验收

更新 `packages/dsh-pet/README.md`、`README.zh.md` 与 `README.i18n.yaml`，两种语言同步说明自定义宠物操作、文件契约、Agent 生成方法、相对模板路径、本地存储、共享养成数据和首版限制。

自动验证至少运行：

```text
pnpm --filter @neystan/dsh-pet typecheck
pnpm --filter @neystan/dsh-pet test
pnpm --filter @neystan/dsh-pet build
pnpm docs:check
```

真实 Web GUI 手工验收覆盖：复制中英文提示词；把内置鲸鱼娘两个文件作为自定义素材导入；查看候选待机预览；无刷新应用自定义；切回官方并保留素材；删除自定义；关闭宠物后继续管理素材；刷新页面和重启 DSH 后选择与养成状态正确。

完成标准是：官方鲸鱼娘与一个自定义宠物在同一设置卡中稳定切换；自定义素材严格兼容当前九动作契约；导入、应用、删除和故障恢复不破坏现有宠物；复制提示词不暴露绝对路径；新增 UI 与当前插件视觉一致；实现中没有多宠物、在线生成、历史版本或其他超出 MVP 的功能。
