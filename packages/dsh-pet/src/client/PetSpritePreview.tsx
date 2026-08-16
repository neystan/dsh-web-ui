import { useEffect, useRef, useState } from 'react'
import type { PetAssetView } from '../service.ts'
import { framePosition, FRAME_HEIGHT, FRAME_WIDTH, TRACKS } from './spritesheet.ts'

export interface PetSpritePreviewProps {
  asset: PetAssetView
  size?: number
}

/** Small idle-only preview shared by the official and custom appearance cards. */
export function PetSpritePreview({ asset, size = 96 }: PetSpritePreviewProps) {
  const [frame, setFrame] = useState(0)
  const frameRef = useRef(0)
  useEffect(() => {
    frameRef.current = 0
    setFrame(0)
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches === true) return
    let raf = 0
    let last = performance.now()
    let elapsed = 0
    const track = TRACKS.idle
    const tick = (now: number): void => {
      elapsed += now - last
      last = now
      if (elapsed >= track.durations[frameRef.current]!) {
        elapsed = 0
        frameRef.current = (frameRef.current + 1) % track.frames.length
        setFrame(frameRef.current)
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [asset.revision])

  const scale = size / FRAME_HEIGHT
  const position = framePosition(0, TRACKS.idle.frames[frame]!, scale)
  return (
    <div
      aria-label={asset.manifest.displayName}
      role="img"
      style={{
        width: Math.round(FRAME_WIDTH * scale),
        height: size,
        backgroundImage: `url(${asset.spritesheetUrl})`,
        backgroundSize: `${FRAME_WIDTH * 8 * scale}px ${FRAME_HEIGHT * 9 * scale}px`,
        backgroundRepeat: 'no-repeat',
        backgroundPosition: `${position.x}px ${position.y}px`,
      }}
    />
  )
}
