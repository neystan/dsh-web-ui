/**
 * dsh-pet locale dictionaries (zh/en).
 * @module @linxin666/dsh-pet/client/locales
 */

/** Dictionary namespace this package registers. */
export const NS = 'pet'

/** Chinese copy. */
export const zh = {
  'pet.feed': '喂食',
  'pet.hide': '隐藏',
  'pet.rename': '改名',
  'pet.confirm': '确定',
  'pet.namePlaceholder': '输入新名字',
  'pet.summon': '召唤{name}',
  'pet.rank': '亲密度 {rank}',
  'pet.points': '{points} 点',
  'pet.treats': '小鱼干 ×{n}',
  'pet.state.loading': '鲸鱼娘正在赶来…',
  'pet.state.error': '鲸鱼娘迷路了（连接失败）',
  // 插件设置卡片（settings.plugin.item 席位）。
  'settings.title': '宠物',
  'settings.description': '鲸鱼娘的显示布局与名字。',
  'settings.enabled': '启用宠物',
  'settings.enabledHint': '关闭后隐藏宠物并停止轮询，可在设置里重新启用。',
  'settings.visible': '显示宠物',
  'settings.visibleHint': '关闭后宠物隐藏，可从聊天输入区重新召唤。',
  'settings.size': '大小（px）',
  'settings.sizeHint': '精灵单元高度，范围 32–512。',
  'settings.right': '距右侧（px）',
  'settings.rightHint': '距视口右边缘的水平内缩距离。',
  'settings.bottom': '距底部（px）',
  'settings.bottomHint': '距视口底边的垂直内缩距离。',
  'settings.name': '名字',
  'settings.nameHint': '宠物显示名，1–20 个字符。',
  'settings.inherit': '继承',
  'settings.on': '开',
  'settings.off': '关',
  'settings.overridden': '已覆盖',
  'settings.reset': '恢复默认',
  'settings.notExposed': '当前 DSH 版本未向设置页暴露本插件的配置命名空间，表单不可用。可编辑 ~/.dsh/settings.yaml 直接配置，或为 dsh-host-apiproxy 的 WEB_SETTINGS_NAMESPACES 白名单补充本命名空间后重启。',
  'settings.readOnly': '当前部署的设置只读。',
  'settings.expand': '展开设置',
  'settings.collapse': '收起设置',
  'settings.save': '保存',
  'settings.saving': '保存中…',
  'settings.discard': '放弃',
  'settings.unsaved': '未保存',
  'settings.saveFailed': '部署未接受这些值，已保留供你修改。',
  'settings.invalidNumber': '请输入数字，留空则使用默认值。',
  'settings.appearance.title': '宠物外观',
  'settings.appearance.description': '官方宠物与一个自定义宠物共用名字、亲密度和显示设置。',
  'settings.appearance.official': '官方鲸鱼娘',
  'settings.appearance.officialDescription': '使用插件内置的官方动画素材。',
  'settings.appearance.custom': '自定义宠物',
  'settings.appearance.customDescription': '分别选择 pet.json 和 spritesheet.webp。',
  'settings.appearance.active': '当前使用',
  'settings.appearance.pending': '待应用',
  'settings.appearance.empty': '尚未导入',
  'settings.appearance.selectManifest': '选择 pet.json',
  'settings.appearance.selectSpritesheet': '选择 spritesheet.webp',
  'settings.appearance.import': '验证并导入',
  'settings.appearance.useSelected': '使用所选宠物',
  'settings.appearance.copyPrompt': '复制生成提示词',
  'settings.appearance.copied': '已复制',
  'settings.appearance.delete': '删除自定义宠物',
  'settings.appearance.deleteConfirm': '删除自定义宠物并恢复官方宠物？',
  'settings.appearance.error.file.invalid-name': '文件名必须是 pet.json 和 spritesheet.webp。',
  'settings.appearance.error.file.too-large': '文件超过允许大小。',
  'settings.appearance.error.manifest.invalid-json': 'pet.json 不是有效 JSON。',
  'settings.appearance.error.manifest.invalid-object': 'pet.json 的结构无效。',
  'settings.appearance.error.manifest.unknown-field': 'pet.json 包含不支持的字段。',
  'settings.appearance.error.manifest.invalid-id': '宠物 ID 格式无效。',
  'settings.appearance.error.manifest.invalid-name': '宠物显示名必须为 1–40 个字符。',
  'settings.appearance.error.manifest.description-too-long': '宠物描述超过 160 个字符。',
  'settings.appearance.error.manifest.invalid-path': 'spritesheetPath 必须是 spritesheet.webp。',
  'settings.appearance.error.manifest.invalid-frames': '动作帧数必须匹配官方格式。',
  'settings.appearance.error.image.invalid-size': '图集尺寸必须是 1536×1872。',
  'settings.appearance.error.image.frame-empty': '有效动作帧不能为空。',
  'settings.appearance.error.image.frame-not-transparent': '每个动作帧都必须保留透明区域。',
  'settings.appearance.error.image.tail-not-empty': '未使用的尾部单元格必须透明。',
  'settings.appearance.error.image.decode-failed': '无法读取 WebP 图集像素。',
  'settings.appearance.error.appearance.request-failed': '外观操作失败，请重试。',
  'settings.appearance.error.appearance.not-ready': '外观状态尚未准备好。',
  'settings.appearance.error.asset.invalid-filename': '请选择指定文件名。',
  'settings.appearance.error.asset.invalid-base64': '图集数据无效。',
  'settings.appearance.error.asset.invalid-payload': '导入数据不完整。',
  'settings.appearance.error.asset.too-large': '图集超过 8 MiB。',
  'settings.appearance.error.asset.invalid-state': '外观状态已失效，请刷新设置。',
  'settings.appearance.error.asset.state-conflict': '外观已在其他页面更新，请重试。',
  'settings.appearance.error.asset.unavailable': '自定义宠物素材不可用。',
  'settings.appearance.error.clipboard.failed': '复制失败，请重试。',
  'settings.appearance.error.store.invalid-custom': '自定义宠物素材已损坏。',
  'settings.appearance.error.store.unavailable': '自定义宠物素材不可用。',
  'settings.appearance.error.store.write-failed': '保存自定义宠物失败。',
} as const

/** English copy. */
export const en = {
  'pet.feed': 'Feed',
  'pet.hide': 'Hide',
  'pet.rename': 'Rename',
  'pet.confirm': 'OK',
  'pet.namePlaceholder': 'Enter a new name',
  'pet.summon': 'Summon {name}',
  'pet.rank': 'Affinity {rank}',
  'pet.points': '{points} pts',
  'pet.treats': 'Treats ×{n}',
  'pet.state.loading': 'The whale girl is on her way…',
  'pet.state.error': 'The whale girl is lost (connection failed)',
  // Plugin settings card (the `settings.plugin.item` seat).
  'settings.title': 'Pet',
  'settings.description': 'The whale girl\u2019s display layout and name.',
  'settings.enabled': 'Enable the pet',
  'settings.enabledHint': 'When off, the pet hides and polling stops; re-enable it here.',
  'settings.visible': 'Show the pet',
  'settings.visibleHint': 'When off, the pet hides; summon it again from the input row.',
  'settings.size': 'Size (px)',
  'settings.sizeHint': 'Sprite cell height, 32\u2013512.',
  'settings.right': 'Right inset (px)',
  'settings.rightHint': 'Horizontal inset from the viewport right edge.',
  'settings.bottom': 'Bottom inset (px)',
  'settings.bottomHint': 'Vertical inset from the viewport bottom edge.',
  'settings.name': 'Name',
  'settings.nameHint': 'The pet\u2019s display name, 1\u201320 characters.',
  'settings.inherit': 'Inherit',
  'settings.on': 'On',
  'settings.off': 'Off',
  'settings.overridden': 'Overridden',
  'settings.reset': 'Reset to default',
  'settings.notExposed': 'This DSH version does not expose this plugin\'s settings namespace to the configuration page, so the form is unavailable. Edit ~/.dsh/settings.yaml directly, or add the namespace to dsh-host-apiproxy\'s WEB_SETTINGS_NAMESPACES allowlist and restart.',
  'settings.readOnly': 'This deployment stores settings read-only.',
  'settings.expand': 'Show settings',
  'settings.collapse': 'Hide settings',
  'settings.save': 'Save',
  'settings.saving': 'Saving\u2026',
  'settings.discard': 'Discard',
  'settings.unsaved': 'Unsaved',
  'settings.saveFailed': 'The deployment did not accept these values; they were left for you to correct.',
  'settings.invalidNumber': 'Enter a number, or leave blank to use the default.',
  'settings.appearance.title': 'Pet appearance',
  'settings.appearance.description': 'The official pet and one custom pet share the name, affinity, and display settings.',
  'settings.appearance.official': 'Official whale girl',
  'settings.appearance.officialDescription': 'Use the animation assets bundled with this plugin.',
  'settings.appearance.custom': 'Custom pet',
  'settings.appearance.customDescription': 'Select pet.json and spritesheet.webp separately.',
  'settings.appearance.active': 'Active',
  'settings.appearance.pending': 'Pending apply',
  'settings.appearance.empty': 'Not imported',
  'settings.appearance.selectManifest': 'Choose pet.json',
  'settings.appearance.selectSpritesheet': 'Choose spritesheet.webp',
  'settings.appearance.import': 'Validate and import',
  'settings.appearance.useSelected': 'Use selected pet',
  'settings.appearance.copyPrompt': 'Copy generation prompt',
  'settings.appearance.copied': 'Copied',
  'settings.appearance.delete': 'Delete custom pet',
  'settings.appearance.deleteConfirm': 'Delete the custom pet and return to the official pet?',
  'settings.appearance.error.file.invalid-name': 'The files must be named pet.json and spritesheet.webp.',
  'settings.appearance.error.file.too-large': 'A selected file exceeds the allowed size.',
  'settings.appearance.error.manifest.invalid-json': 'pet.json is not valid JSON.',
  'settings.appearance.error.manifest.invalid-object': 'pet.json has an invalid structure.',
  'settings.appearance.error.manifest.unknown-field': 'pet.json contains an unsupported field.',
  'settings.appearance.error.manifest.invalid-id': 'The pet ID format is invalid.',
  'settings.appearance.error.manifest.invalid-name': 'The display name must contain 1–40 characters.',
  'settings.appearance.error.manifest.description-too-long': 'The pet description is longer than 160 characters.',
  'settings.appearance.error.manifest.invalid-path': 'spritesheetPath must be spritesheet.webp.',
  'settings.appearance.error.manifest.invalid-frames': 'The action frame counts must match the official format.',
  'settings.appearance.error.image.invalid-size': 'The spritesheet must be 1536×1872.',
  'settings.appearance.error.image.frame-empty': 'A valid action frame is empty.',
  'settings.appearance.error.image.frame-not-transparent': 'Every action frame must retain transparent pixels.',
  'settings.appearance.error.image.tail-not-empty': 'Unused tail cells must be transparent.',
  'settings.appearance.error.image.decode-failed': 'The WebP pixels could not be read.',
  'settings.appearance.error.appearance.request-failed': 'The appearance operation failed. Try again.',
  'settings.appearance.error.appearance.not-ready': 'Appearance state is not ready yet.',
  'settings.appearance.error.asset.invalid-filename': 'Select the required filenames.',
  'settings.appearance.error.asset.invalid-base64': 'The spritesheet data is invalid.',
  'settings.appearance.error.asset.invalid-payload': 'The import payload is incomplete.',
  'settings.appearance.error.asset.too-large': 'The spritesheet is larger than 8 MiB.',
  'settings.appearance.error.asset.invalid-state': 'Appearance state expired. Refresh the settings.',
  'settings.appearance.error.asset.state-conflict': 'Appearance changed in another page. Try again.',
  'settings.appearance.error.asset.unavailable': 'The custom pet assets are unavailable.',
  'settings.appearance.error.clipboard.failed': 'Copy failed. Try again.',
  'settings.appearance.error.store.invalid-custom': 'The custom pet assets are corrupted.',
  'settings.appearance.error.store.unavailable': 'The custom pet assets are unavailable.',
  'settings.appearance.error.store.write-failed': 'The custom pet could not be saved.',
} as const

/** Key union for this namespace. */
export type PetKey = keyof typeof zh

/** The settings-card slice of the pet dictionary. */
export type SettingsCardKey = PetKey

/**
 * Active dictionary, picked by the document language at call time. The pet
 * mounts as a global floating surface (not a session-scoped slot), so it has
 * no framework locale seat and resolves its copy the same tiny way the
 * task-board's DOM-injected surface does.
 */
export function dictionary(): Record<PetKey, string> {
  const lang = typeof document !== 'undefined' ? document.documentElement.lang : 'zh'
  return lang.toLowerCase().startsWith('en') ? en : zh
}

/**
 * Translate a key with optional `{name}` template params. Mirrors the slot
 * `Translate` contract `(key, params?) => string` so it can be handed to the
 * same components that used to receive the framework-injected `t` seat. The
 * key is typed loosely (`string`) so the function is assignable to the slot's
 * `TranslateNS<'pet'>` (whose key domain also spans the shared common
 * vocabulary); a missing key degrades to the key itself rather than throwing.
 */
export function t(key: string, params?: Record<string, unknown>): string {
  let text: string = (dictionary() as Record<string, string>)[key] ?? key
  if (params !== undefined) {
    for (const [name, value] of Object.entries(params)) {
      text = text.replaceAll(`{${name}}`, String(value))
    }
  }
  return text
}

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** dsh-pet UI copy. */
    pet: PetKey
  }
}
