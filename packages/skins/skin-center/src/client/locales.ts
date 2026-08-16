/**
 * Skin-center locale dictionaries. The plugin-card name, its description,
 * and every control of the in-GUI skin center is localized through the
 * standard `t` seat.
 */

/** Copy keys owned by this plugin. */
export type SkinCenterKey =
  | 'title'
  | 'cardDescription'
  | 'expand'
  | 'collapse'
  | 'intro'
  | 'official'
  | 'officialTagline'
  | 'active'
  | 'tryingOn'
  | 'tryOn'
  | 'exitTryOn'
  | 'apply'
  | 'applying'
  | 'restore'
  | 'applyFailed'
  | 'appliedUnconfirmed'
  | 'theme'
  | 'themeLight'
  | 'themeDark'
  | 'tryOnError'
  | 'customTheme'
  | 'customThemeTagline'
  | 'edit'
  | 'accent'
  | 'background'
  | 'foreground'
  | 'contrast'
  | 'invalidColor'
  | 'contrastWarning'
  | 'cancel'
  | 'resetTheme'
  | 'saveAndApply'
  | 'themeSaveFailed'
  | 'backgroundTitle'
  | 'backgroundSkin'
  | 'backgroundCustom'
  | 'backgroundNone'
  | 'chooseImage'
  | 'replaceImage'
  | 'saveImage'
  | 'deleteImage'
  | 'confirmDelete'
  | 'backgroundPreview'
  | 'backgroundMissing'
  | 'imageInvalid'
  | 'imageTooLarge'
  | 'imageUploadFailed'
  | 'backgroundSaveFailed'
  | 'backgroundDeleteFailed'
  | 'backgroundOpacity'

export const en: Record<SkinCenterKey, string> = {
  title: 'Skin Center',
  cardDescription: 'Try on any installed skin live in the GUI — exit restores instantly, applying persists in one click.',
  expand: 'Expand',
  collapse: 'Collapse',
  intro: 'Try on any skin live — it takes effect instantly, exit restores the current look. Apply persists it across restarts.',
  official: 'Official default',
  officialTagline: 'The stock DSH look with no skin applied.',
  active: 'Active',
  tryingOn: 'Trying on',
  tryOn: 'Try on',
  exitTryOn: 'Exit try-on',
  apply: 'Apply',
  applying: 'Applying…',
  restore: 'Restore',
  applyFailed: 'Apply failed',
  appliedUnconfirmed: 'Applied, but the change has not been confirmed — refresh the page if the skin did not switch',
  theme: 'Theme preview',
  themeLight: 'Light',
  themeDark: 'Dark',
  tryOnError: 'Try-on failed — see console',
  customTheme: 'Custom theme',
  customThemeTagline: 'A personal theme with editable colors, contrast, and the shared background.',
  edit: 'Edit',
  accent: 'Accent',
  background: 'Background',
  foreground: 'Foreground',
  contrast: 'Contrast',
  invalidColor: 'Use a six-digit hexadecimal color.',
  contrastWarning: 'Low text contrast (background / accent):',
  cancel: 'Cancel',
  resetTheme: 'Restore default parameters',
  saveAndApply: 'Save and apply',
  themeSaveFailed: 'The custom theme could not be saved.',
  backgroundTitle: 'Background image',
  backgroundSkin: 'Follow skin',
  backgroundCustom: 'Custom',
  backgroundNone: 'None',
  chooseImage: 'Choose image',
  replaceImage: 'Replace image',
  saveImage: 'Save',
  deleteImage: 'Delete',
  confirmDelete: 'Delete the saved background image and follow the skin again?',
  backgroundPreview: 'Background preview',
  backgroundMissing: 'The saved image is missing. Upload a replacement or delete it.',
  imageInvalid: 'Choose a valid JPEG, PNG, or WebP image within the dimension limits.',
  imageTooLarge: 'The image is too large to save.',
  imageUploadFailed: 'The image could not be processed or uploaded.',
  backgroundSaveFailed: 'The background setting could not be saved.',
  backgroundDeleteFailed: 'The saved background could not be deleted.',
  backgroundOpacity: 'Background occlusion',
}

export const zh: Record<SkinCenterKey, string> = {
  title: '皮肤中心',
  cardDescription: '在 GUI 内即时试穿任意皮肤，退出即完全还原；应用一键完成并自动刷新。',
  expand: '展开',
  collapse: '收起',
  intro: '任意皮肤可即时试穿，退出即完全还原；「应用」一键持久化，页面自动刷新生效。',
  official: '官方默认',
  officialTagline: '还原 DSH 官方默认外观，不应用任何皮肤。',
  active: '当前激活',
  tryingOn: '试穿中',
  tryOn: '试穿',
  exitTryOn: '退出试穿',
  apply: '应用',
  applying: '应用中…',
  restore: '恢复默认',
  applyFailed: '应用失败',
  appliedUnconfirmed: '已写入配置但尚未确认生效——若皮肤未切换请手动刷新页面',
  theme: '主题预览',
  themeLight: '亮色',
  themeDark: '暗色',
  tryOnError: '试穿失败，详见控制台',
  customTheme: '自定义主题',
  customThemeTagline: '可编辑颜色与对比度，并使用全局背景图片。',
  edit: '编辑',
  accent: '强调色',
  background: '背景',
  foreground: '前景',
  contrast: '对比度',
  invalidColor: '请输入六位十六进制颜色。',
  contrastWarning: '文字对比度偏低（背景 / 强调色）：',
  cancel: '取消',
  resetTheme: '恢复默认参数',
  saveAndApply: '保存并应用',
  themeSaveFailed: '自定义主题保存失败。',
  backgroundTitle: '背景图片',
  backgroundSkin: '跟随皮肤',
  backgroundCustom: '自定义',
  backgroundNone: '无背景',
  chooseImage: '选择图片',
  replaceImage: '替换图片',
  saveImage: '保存',
  deleteImage: '删除',
  confirmDelete: '删除已保存的背景图片并切回跟随皮肤？',
  backgroundPreview: '背景预览',
  backgroundMissing: '已保存的图片不存在，请重新上传或删除引用。',
  imageInvalid: '请选择尺寸合规的 JPEG、PNG 或 WebP 图片。',
  imageTooLarge: '图片过大，无法保存。',
  imageUploadFailed: '图片处理或上传失败。',
  backgroundSaveFailed: '背景设置保存失败。',
  backgroundDeleteFailed: '已保存的背景删除失败。',
  backgroundOpacity: '背景遮挡',
}
