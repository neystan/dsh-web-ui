import {
  PET_ACTIONS,
  PET_ATLAS_HEIGHT,
  PET_ATLAS_WIDTH,
  PET_FRAME_COUNTS,
  PET_FRAME_HEIGHT,
  PET_FRAME_WIDTH,
} from '../core/pet-assets.ts'

export const PET_TEMPLATE_PATH = 'packages/dsh-pet/assets/whale'

export type PromptLocale = 'zh' | 'en'

export function generationPrompt(locale: PromptLocale): string {
  const actions = PET_ACTIONS.join(', ')
  const frames = PET_FRAME_COUNTS.join(', ')
  if (locale === 'en') {
    return [
      'Create a custom animated pet from the attached clear, full-body, unobstructed reference image.',
      `Use ${PET_TEMPLATE_PATH} as the format template. Return exactly pet.json and spritesheet.webp.`,
      `The spritesheet must be transparent WebP ${PET_ATLAS_WIDTH}×${PET_ATLAS_HEIGHT}, arranged as 8 columns × 9 rows, with ${PET_FRAME_WIDTH}×${PET_FRAME_HEIGHT} cells.`,
      `Rows, in order, are: ${actions}. Valid frame counts are [${frames}].`,
      'Keep the character identity consistent, leave unused tail cells fully transparent, and run an alpha/spacing QA pass.',
      'Do not return a ZIP, PNG, GIF, extra files, or a different animation layout.',
    ].join('\n')
  }
  return [
    '请根据附加的清晰、完整、无遮挡宠物参考图，生成一个自定义动画宠物。',
    `使用 ${PET_TEMPLATE_PATH} 作为格式模板，最终只交付 pet.json 和 spritesheet.webp。`,
    `spritesheet.webp 必须是透明 WebP，尺寸 ${PET_ATLAS_WIDTH}×${PET_ATLAS_HEIGHT}，8 列 × 9 行，每格 ${PET_FRAME_WIDTH}×${PET_FRAME_HEIGHT}。`,
    `动作行顺序固定为：${actions}。有效帧数固定为 [${frames}]。`,
    '保持角色身份一致，未使用的尾部单元格必须完全透明，并执行透明度、尺寸和间距 QA。',
    '不要返回压缩包、PNG、GIF、额外文件或其他图集布局。',
  ].join('\n')
}

export interface ClipboardDependencies {
  clipboard?: { writeText(text: string): Promise<void> }
  document?: Document
}

export async function writeClipboard(text: string, dependencies: ClipboardDependencies = {}): Promise<void> {
  const clipboard = dependencies.clipboard ?? (typeof navigator !== 'undefined' ? navigator.clipboard : undefined)
  if (clipboard !== undefined) {
    try {
      await clipboard.writeText(text)
      return
    } catch {
      // Use the controlled DOM fallback below.
    }
  }
  const documentRef = dependencies.document ?? (typeof document !== 'undefined' ? document : undefined)
  if (documentRef === undefined) throw new Error('clipboard.failed')
  const textarea = documentRef.createElement('textarea')
  textarea.value = text
  textarea.setAttribute('readonly', '')
  textarea.style.position = 'fixed'
  textarea.style.opacity = '0'
  documentRef.body.appendChild(textarea)
  textarea.select()
  try {
    if (!documentRef.execCommand('copy')) throw new Error('clipboard.failed')
  } finally {
    textarea.remove()
  }
}
