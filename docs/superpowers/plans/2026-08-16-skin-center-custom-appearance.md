# Skin Center Custom Appearance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a compact Codex-style color editor for the official default theme and one global custom background image flow that works across the official theme and all bundled skins.

**Architecture:** Keep theme derivation, validation, and image inspection pure under `src/core`; keep DOM/CSS/settings behavior in two small client controllers; keep uploaded WebP bytes behind one host-side store and three same-origin routes. `SkinCenter.tsx` remains the orchestration shell while two focused editor components own the new controls. Theme variables are inline, allowlisted, and active only on the official look; the background controller is global and uses stable body attributes or `data-skin-chrome` markers instead of skin CSS-module hashes.

**Tech Stack:** TypeScript, React 18, CSS Modules, Cordis/DSH settings scopes, Node.js HTTP/filesystem/crypto, Vitest + jsdom, tsdown, pnpm workspace scripts.

## Global Constraints

- [ ] Read `docs/superpowers/specs/2026-08-16-skin-center-custom-theme-background-design.md` before each task and keep its decisions authoritative.
- [ ] Use `apply_patch` for source edits; preserve the untracked `.superpowers/` browser artifacts and unrelated user changes.
- [ ] Prefix every git command with `$env:GIT_CONFIG_NOSYSTEM='1'` because the machine-level Git config is malformed.
- [ ] Do not add fonts, theme import/export/copy, arbitrary CSS, an advanced token editor, named theme collections, image metadata panels, or a new UI framework.
- [ ] Keep all visible strings in `src/client/locales.ts`; use existing `--dsw-*` semantic tokens and CSS Modules.
- [ ] Do not expose filesystem paths, stack traces, or raw host errors through the new routes.
- [ ] Keep commits task-sized and never stage `.superpowers/`.

## File Map

| File | Responsibility |
| --- | --- |
| `src/core/theme.ts` | Theme types, color normalization, contrast math, deterministic token derivation |
| `src/core/background.ts` | Background settings migration and WebP header/dimension inspection |
| `src/client/custom-theme.ts` | Settings-backed official-theme inline token controller |
| `src/client/background.ts` | Settings-backed global background mode, scrim, and skin-art suppression |
| `src/client/image-upload.ts` | Browser validation, downscaling, WebP encoding, and upload request |
| `src/client/CustomThemeEditor.tsx` | Four compact controls per light/dark mode |
| `src/client/BackgroundEditor.tsx` | Three background modes, file selection, preview, save, delete |
| `src/client/SkinCenter.tsx` | Existing card list and integration only |
| `src/background-store.ts` | Bounded WebP validation, content-addressed storage, reads, deletes, temp cleanup |
| `src/routes.ts` | Existing routes plus POST/GET/DELETE background endpoints |
| `src/index.ts` | Settings schemas, asset-root construction, route registration |

---

### Task 1: Pure theme model and settings schemas

**Files:**
- Create: `packages/skins/skin-center/src/core/theme.ts`
- Create: `packages/skins/skin-center/tests/theme.spec.ts`
- Modify: `packages/skins/skin-center/src/index.ts`

**Interfaces produced:**

```ts
export type ThemeMode = 'light' | 'dark'

export interface PaletteConfig {
  accent: string
  background: string
  foreground: string
  contrast: number
}

export interface CustomThemeSettings {
  version: 1
  light?: PaletteConfig
  dark?: PaletteConfig
}

export const CUSTOM_THEME_NS = 'skin-custom-theme'
export const THEME_TOKEN_ALLOWLIST = [
  '--dsw-alias-bg-base', '--dsw-alias-bg-layer-1', '--dsw-alias-bg-layer-2',
  '--dsw-alias-bg-layer-3', '--dsw-alias-bg-overlay', '--dsw-alias-bg-skeleton',
  '--dsw-alias-border-l1', '--dsw-alias-border-l2', '--dsw-alias-border-l3', '--dsw-alias-border-l4',
  '--dsw-alias-brand-primary', '--dsw-alias-brand-primary-invert', '--dsw-alias-brand-text',
  '--dsw-alias-button-contrast-fill', '--dsw-alias-button-ghost-active-fill',
  '--dsw-alias-button-ghost-active-hover', '--dsw-alias-button-primary-dimmed',
  '--dsw-alias-button-primary-fill', '--dsw-alias-button-primary-hover', '--dsw-alias-button-tool-bar-fill',
  '--dsw-alias-interactive-bg-active', '--dsw-alias-interactive-bg-hover',
  '--dsw-alias-interactive-bg-hover-accent', '--dsw-alias-interactive-bg-hover-danger',
  '--dsw-alias-interactive-bg-hover-solid',
  '--dsw-alias-label-caption', '--dsw-alias-label-dimmed', '--dsw-alias-label-primary',
  '--dsw-alias-label-primary-dimmed', '--dsw-alias-label-primary-foreground',
  '--dsw-alias-label-primary-inverted', '--dsw-alias-label-secondary', '--dsw-alias-label-tertiary',
  '--dsw-alias-markdown-citation', '--dsw-alias-markdown-code-block',
  '--dsw-alias-markdown-code-block-banner', '--dsw-alias-markdown-inline-code',
  '--dsw-alias-markdown-placeholder', '--dsw-alias-markdown-tag',
  '--dsw-alias-toast-bg', '--dsw-alias-tooltip-bg',
  '--dsw-specific-bubble', '--dsw-specific-bubble-highlight', '--dsw-specific-input-major',
  '--dsw-specific-login-input', '--dsw-specific-menu', '--dsw-specific-selector',
  '--dsw-specific-sidebar-fill', '--dsw-specific-sidebar-nav-item-active',
  '--dsw-specific-sidebar-nav-item-active-accent', '--dsw-specific-sidebar-nav-item-hover',
  '--dsw-specific-tip',
] as const
export type ThemeTokenName = (typeof THEME_TOKEN_ALLOWLIST)[number]
export function normalizePalette(value: unknown): PaletteConfig | undefined
export function deriveThemeTokens(palette: PaletteConfig): Readonly<Record<ThemeTokenName, string>>
export function contrastRatio(foreground: string, background: string): number
```

- `normalizePalette` accepts only uppercase-normalized `#RRGGBB` values and an integer contrast from 0 through 100.
- `deriveThemeTokens` implements the approved linear-sRGB formulas exactly: `s = 0.06 + 0.18 * contrast / 100`; three surface mixes, four border mixes, secondary/tertiary text mixes, accent hover/dimmed, and black/white text on accent by the higher WCAG ratio.
- `THEME_TOKEN_ALLOWLIST` is the only iterable used for DOM writes. It excludes all state, skin-private, static-palette, and Aion variables.

- [ ] **Step 1: Write failing derivation tests.** Cover hex normalization, invalid values, contrast endpoints 0/100, deterministic surface/border ordering, text-on-accent selection, and the absence of state tokens.

```ts
expect(normalizePalette({
  accent: '#339cff', background: '#181818', foreground: '#ffffff', contrast: 73,
})).toEqual({
  accent: '#339CFF', background: '#181818', foreground: '#FFFFFF', contrast: 73,
})
expect(Object.keys(deriveThemeTokens(valid))).toEqual([...THEME_TOKEN_ALLOWLIST])
```

- [ ] **Step 2: Run the focused test and confirm it fails because the module does not exist.**

Run: `pnpm --filter @linxin666/dsh-client-ui-skin-center test -- tests/theme.spec.ts`

- [ ] **Step 3: Implement the minimal pure module.** Use channel-wise linear interpolation and a single `toHex()` conversion so all derived colors are opaque `#RRGGBB`; clamp every ratio before mixing.

- [ ] **Step 4: Register the settings namespace.** In `src/index.ts`, export `CUSTOM_THEME_NAMESPACE = settingsNamespace(CUSTOM_THEME_NS)`, add a Schemastery object for `version`, `light`, and `dark`, and install it beside the existing background section. Do not add an `enabled` field.

- [ ] **Step 5: Run the focused tests and package type/build checks.**

Run:

```powershell
pnpm --filter @linxin666/dsh-client-ui-skin-center test -- tests/theme.spec.ts
pnpm --filter @linxin666/dsh-client-ui-skin-center build
```

- [ ] **Step 6: Commit.**

```powershell
$env:GIT_CONFIG_NOSYSTEM='1'
git add packages/skins/skin-center/src/core/theme.ts packages/skins/skin-center/tests/theme.spec.ts packages/skins/skin-center/src/index.ts
git commit -m "feat(skin-center): add custom theme model"
```

---

### Task 2: Official-theme controller with preview, save, reset, and restoration

**Files:**
- Create: `packages/skins/skin-center/src/client/custom-theme.ts`
- Create: `packages/skins/skin-center/tests/custom-theme.spec.ts`

**Interface produced:**

```ts
export interface CustomThemeSnapshot {
  status: 'loading' | 'ready' | 'unavailable'
  settings: CustomThemeSettings
  draft?: { mode: ThemeMode; palette: PaletteConfig }
  officialActive: boolean
  suspended: boolean
  writable: boolean
}

export interface CustomThemeHandle {
  getSnapshot(): CustomThemeSnapshot
  subscribe(listener: () => void): () => void
  setOfficialActive(active: boolean): void
  preview(mode: ThemeMode, palette?: PaletteConfig): void
  save(mode: ThemeMode, palette: PaletteConfig): Promise<void>
  reset(): Promise<void>
  suspend(): void
  resume(): void
  dispose(): void
}

export class CustomThemeController implements CustomThemeHandle {
  constructor(scope: SettingsScope<CustomThemeSettings>, body?: HTMLElement)
}
```

- [ ] **Step 1: Write failing jsdom tests.** Verify that an official active palette writes only `THEME_TOKEN_ALLOWLIST`; non-official and suspended states restore every original inline value and priority; preview does not persist; save writes `version` plus the selected mode; reset unsets both modes; dispose restores and unsubscribes.

```ts
body.style.setProperty('--dsw-alias-bg-base', '#010203', 'important')
controller.setOfficialActive(true)
controller.preview('dark', palette)
controller.suspend()
expect(body.style.getPropertyValue('--dsw-alias-bg-base')).toBe('#010203')
expect(body.style.getPropertyPriority('--dsw-alias-bg-base')).toBe('important')
```

- [ ] **Step 2: Run and observe the missing-module failure.**

Run: `pnpm --filter @linxin666/dsh-client-ui-skin-center test -- tests/custom-theme.spec.ts`

- [ ] **Step 3: Implement one controller and one snapshot store.** Capture `{ value, priority }` lazily before the first write, never replace the whole body `style` attribute, derive the current light/dark mode from `data-ds-dark-theme`, and observe only that attribute. Apply a draft only when its mode matches the page mode.

- [ ] **Step 4: Persist through `SettingsScope.set/unset`.** Serialize writes, surface the scope's `writable/status`, and re-read the published snapshot after refusal rather than inventing optimistic persisted state.

- [ ] **Step 5: Run tests and build.**

Run:

```powershell
pnpm --filter @linxin666/dsh-client-ui-skin-center test -- tests/custom-theme.spec.ts
pnpm --filter @linxin666/dsh-client-ui-skin-center build
```

- [ ] **Step 6: Commit.**

```powershell
$env:GIT_CONFIG_NOSYSTEM='1'
git add packages/skins/skin-center/src/client/custom-theme.ts packages/skins/skin-center/tests/custom-theme.spec.ts
git commit -m "feat(skin-center): control official theme colors"
```

---

### Task 3: Make try-on cooperate with appearance controllers

**Files:**
- Modify: `packages/skins/skin-center/src/client/try-on.ts`
- Modify: `packages/skins/skin-center/tests/try-on.spec.ts`

**Interface change:**

```ts
export interface TryOnAppearanceLifecycle {
  beforeSurfaceChange(): void
  afterSurfaceChange(): void
  afterExit(): void
}

constructor(options: {
  loadBundle?: (entry: SkinCenterEntry) => Promise<void>
  appearance?: TryOnAppearanceLifecycle
} = {})
```

- [ ] **Step 1: Add failing regression tests.** Start with an official custom theme variable on `body.style`, enter a skin try-on, edit/reapply that variable while the session is live, then exit. Assert the controller hooks are ordered and the latest value survives; also assert original active-skin background properties still restore.

- [ ] **Step 2: Run the focused tests and confirm the existing whole-style snapshot fails the latest-value assertion.**

Run: `pnpm --filter @linxin666/dsh-client-ui-skin-center test -- tests/try-on.spec.ts`

- [ ] **Step 3: Replace whole-body-style restoration with property snapshots.** `ActiveVisuals` stores only the known skin backdrop properties, each as `{ value, priority }`. Retraction clears those properties; restoration writes only those properties. No code may call `body.setAttribute('style', snapshot)`.

- [ ] **Step 4: Wire lifecycle calls.** Call `beforeSurfaceChange()` before retracting, `afterSurfaceChange()` after a try-on surface mounts or official preview retracts, and `afterExit()` after the active surface restores. On async load failure, restore first and then call `afterExit()` exactly once.

- [ ] **Step 5: Run the complete try-on suite.**

Run: `pnpm --filter @linxin666/dsh-client-ui-skin-center test -- tests/try-on.spec.ts`

- [ ] **Step 6: Commit.**

```powershell
$env:GIT_CONFIG_NOSYSTEM='1'
git add packages/skins/skin-center/src/client/try-on.ts packages/skins/skin-center/tests/try-on.spec.ts
git commit -m "fix(skin-center): preserve appearance across try-on"
```

---

### Task 4: Content-addressed background asset store and three HTTP operations

**Files:**
- Create: `packages/skins/skin-center/src/core/background.ts`
- Create: `packages/skins/skin-center/src/background-store.ts`
- Create: `packages/skins/skin-center/tests/background-store.spec.ts`
- Modify: `packages/skins/skin-center/src/routes.ts`
- Modify: `packages/skins/skin-center/tests/routes.spec.ts`
- Modify: `packages/skins/skin-center/src/index.ts`

**Interfaces produced:**

```ts
export type BackgroundMode = 'skin' | 'custom' | 'none'

export interface BackgroundSettings {
  version: 1
  mode: BackgroundMode
  backgroundOpacity: number
  imageRevision?: string
}

export function normalizeBackgroundSettings(value: unknown): BackgroundSettings
export function inspectWebP(bytes: Uint8Array): { width: number; height: number } | undefined

export class BackgroundAssetStore {
  constructor(root: string)
  cleanupTempFiles(now?: number): Promise<void>
  save(source: AsyncIterable<Uint8Array>): Promise<{ revision: string }>
  read(revision: string): Promise<{ path: string; size: number } | undefined>
  delete(revision: string): Promise<boolean>
}
```

- [ ] **Step 1: Write failing pure/store tests.** Cover migration from `{ backgroundOpacity: 35 }` to `{ version: 1, mode: 'skin', backgroundOpacity: 35 }`; RIFF/WEBP VP8, VP8L, and VP8X dimensions; malformed input; 6 MiB stream rejection; dimension/pixel rejection; SHA-256 lowercase filename; duplicate save; atomic temp rename; contained read/delete; and cleanup limited to `.tmp-*` older than 24 hours.

- [ ] **Step 2: Run and confirm the modules are missing.**

Run: `pnpm --filter @linxin666/dsh-client-ui-skin-center test -- tests/background-store.spec.ts`

- [ ] **Step 3: Implement the parser and store.** Buffer at most `6 * 1024 * 1024` bytes, accept only valid WebP up to 2560 per edge and 6,553,600 pixels, hash the accepted bytes, write a random `.tmp-*` in the same directory, and rename to `<sha256>.webp`. Validate revision with `/^[a-f0-9]{64}$/` before any path construction; resolve/realpath and verify containment on reads.

- [ ] **Step 4: Add failing real-HTTP route tests.** Extend the test `call()` helper to accept `Buffer` and expose response headers. Cover:
  - `POST /api/skin-center/background` returns `{ ok: true, revision }` for `image/webp`.
  - `GET /api/skin-center/background/<revision>.webp` returns identical bytes, `image/webp`, and `Cache-Control: private, max-age=31536000, immutable`.
  - `DELETE` returns `{ ok: true, deleted }`.
  - wrong method, cross-site, non-loopback `Host`, wrong content type, invalid revision, missing file, oversized body, and malformed WebP are fenced without path/stack leakage.

- [ ] **Step 5: Implement only the approved routes.** Add an exact POST route and a prefix GET/DELETE route. Reuse the same-origin fence and require a loopback hostname (`localhost`, `127.0.0.0/8`, or `::1`) on POST/DELETE. Inject the store through `SkinCenterRoutesDeps` for tests; do not add HEAD or listing endpoints.

```ts
export interface SkinCenterRoutesDeps {
  run?: (args: string[]) => Promise<string>
  backgrounds?: BackgroundAssetStore
}
```

- [ ] **Step 6: Expand the existing background settings schema.** Keep namespace `skin-background`, add `version`, `mode`, and `imageRevision`, and retain `backgroundOpacity`. In `apply`, construct the store at `join(dirname(resolvePaths().patchPath), 'skin-center', 'assets')`, launch best-effort temp cleanup, and pass it to `makeSkinCenterRoutes`.

- [ ] **Step 7: Run store, route, and build checks.**

Run:

```powershell
pnpm --filter @linxin666/dsh-client-ui-skin-center test -- tests/background-store.spec.ts tests/routes.spec.ts
pnpm --filter @linxin666/dsh-client-ui-skin-center build
```

- [ ] **Step 8: Commit.**

```powershell
$env:GIT_CONFIG_NOSYSTEM='1'
git add packages/skins/skin-center/src/core/background.ts packages/skins/skin-center/src/background-store.ts packages/skins/skin-center/tests/background-store.spec.ts packages/skins/skin-center/src/routes.ts packages/skins/skin-center/tests/routes.spec.ts packages/skins/skin-center/src/index.ts
git commit -m "feat(skin-center): store custom backgrounds safely"
```

---

### Task 5: Browser image validation, downscaling, and upload client

**Files:**
- Create: `packages/skins/skin-center/src/client/image-upload.ts`
- Create: `packages/skins/skin-center/tests/image-upload.spec.ts`

**Interface produced:**

```ts
export interface PreparedBackground {
  blob: Blob
  width: number
  height: number
  previewUrl: string
}

export interface DecodedImage {
  source: CanvasImageSource
  width: number
  height: number
  close(): void
}

export interface ImageCodec {
  decode(file: File): Promise<DecodedImage>
  encode(decoded: DecodedImage, maxEdge: number, quality: number): Promise<Blob>
}

export function prepareBackground(file: File, codec?: ImageCodec): Promise<PreparedBackground>
export function uploadBackground(blob: Blob, fetcher?: typeof fetch): Promise<string>
```

- [ ] **Step 1: Write failing tests with an injected fake codec.** Reject files over 10 MiB, MIME/magic mismatches, GIF/SVG, decoded edge over 16384, or over 40,000,000 pixels. Assert max-edge 2560 encoding attempts use qualities `0.88`, `0.80`, `0.72`, stop at the first blob no larger than 6 MiB, and close the decoded bitmap on success/failure. Assert upload accepts only a 64-character lowercase revision response.

- [ ] **Step 2: Run and observe the missing-module failure.**

Run: `pnpm --filter @linxin666/dsh-client-ui-skin-center test -- tests/image-upload.spec.ts`

- [ ] **Step 3: Implement the native codec.** Read only enough bytes for JPEG/PNG/WebP magic before decoding, use `createImageBitmap`, draw to an offscreen canvas preserving aspect ratio, and encode WebP with `canvas.toBlob`. Revoke previous preview URLs in the editor rather than retaining them globally.

- [ ] **Step 4: Implement the upload helper.** POST the blob directly with `Content-Type: image/webp`; do not Base64-wrap it. Map all failures to stable client error codes used by locale copy.

- [ ] **Step 5: Run tests and build.**

Run:

```powershell
pnpm --filter @linxin666/dsh-client-ui-skin-center test -- tests/image-upload.spec.ts
pnpm --filter @linxin666/dsh-client-ui-skin-center build
```

- [ ] **Step 6: Commit.**

```powershell
$env:GIT_CONFIG_NOSYSTEM='1'
git add packages/skins/skin-center/src/client/image-upload.ts packages/skins/skin-center/tests/image-upload.spec.ts
git commit -m "feat(skin-center): prepare background uploads"
```

---

### Task 6: Global background controller and stable skin adapters

**Files:**
- Modify: `packages/skins/skin-center/src/client/background.ts`
- Create: `packages/skins/skin-center/tests/background.spec.ts`

**Interface produced:**

```ts
export interface BackgroundSnapshot {
  settings: BackgroundSettings
  status: 'loading' | 'ready' | 'unavailable'
  writable: boolean
}

export interface BackgroundHandle {
  getSnapshot(): BackgroundSnapshot
  subscribe(listener: () => void): () => void
  setMode(mode: BackgroundMode): Promise<void>
  setOpacity(value: number): Promise<void>
  commitRevision(revision: string): Promise<void>
  deleteRevision(fetcher?: typeof fetch): Promise<void>
  reapply(): void
  dispose(): void
}
```

- [ ] **Step 1: Write failing jsdom tests.** Cover the three modes, opacity preservation when mode is `none`, custom center/cover/fixed/no-repeat URL, missing revision fallback to skin art without settings mutation, and restoration of every touched inline property/priority.

- [ ] **Step 2: Add adapter tests for every art mechanism.** Assert central suppression/restore for:
  - body backgrounds: `data-dsh-blue-fantasy`, `data-dsh-whale-song`, `data-dsh-harbor`, `data-dsh-miku`;
  - stable DOM: `[data-skin-chrome="backdrop"]` and `[data-skin-chrome="stage"]`;
  - remaining skins through body-property override only.

Also mutate body style, `data-ds-dark-theme`, and direct children to prove the guarded observer reapplies without an infinite loop.

- [ ] **Step 3: Run and confirm the current opacity-only controller fails.**

Run: `pnpm --filter @linxin666/dsh-client-ui-skin-center test -- tests/background.spec.ts`

- [ ] **Step 4: Implement one controller.** Keep a precise snapshot for body background properties, `--dsw-skin-scrim`, and any stable art node styles. `mode: 'skin'` restores skin-owned art and applies scrim; `custom` suppresses skin art and applies the stored revision URL; `none` suppresses both and removes scrim while retaining the numeric setting.

- [ ] **Step 5: Implement settings-safe replace/delete.** `commitRevision(new)` uploads before this call, sets the new revision and `custom` mode, then verifies the scope's published revision before best-effort deleting the old asset. If persistence is refused, preserve the old revision and best-effort delete the new asset. `deleteRevision` is called only after UI confirmation, deletes the current asset, unsets the revision, and switches to `skin`.

- [ ] **Step 6: Run focused tests and build.**

Run:

```powershell
pnpm --filter @linxin666/dsh-client-ui-skin-center test -- tests/background.spec.ts
pnpm --filter @linxin666/dsh-client-ui-skin-center build
```

- [ ] **Step 7: Commit.**

```powershell
$env:GIT_CONFIG_NOSYSTEM='1'
git add packages/skins/skin-center/src/client/background.ts packages/skins/skin-center/tests/background.spec.ts
git commit -m "feat(skin-center): control global backgrounds"
```

---

### Task 7: Compact Codex-style editors and client integration

**Files:**
- Create: `packages/skins/skin-center/src/client/CustomThemeEditor.tsx`
- Create: `packages/skins/skin-center/src/client/BackgroundEditor.tsx`
- Modify: `packages/skins/skin-center/src/client/SkinCenter.tsx`
- Modify: `packages/skins/skin-center/src/client/index.ts`
- Modify: `packages/skins/skin-center/src/client/locales.ts`
- Modify: `packages/skins/skin-center/src/client/skin-center.module.css`

**Component contracts:**

```tsx
export function CustomThemeEditor(props: {
  handle: CustomThemeHandle
  visible: boolean
  t: (key: SkinCenterKey) => string
}): JSX.Element | null

export function BackgroundEditor(props: {
  handle: BackgroundHandle
  t: (key: SkinCenterKey) => string
}): JSX.Element
```

- [ ] **Step 1: Wire controllers before rendering controls.** In `client/index.ts`, bind both settings scopes, instantiate the custom-theme controller and expanded background controller, pass theme suspend/resume plus background `reapply()` into `TryOnController`, inject both handles, and dispose all observers/subscriptions through `ctx.effect`.

- [ ] **Step 2: Reduce `SkinCenter.tsx` instead of growing it.** Remove the old `BACKDROP_SKIN_IDS`, opacity-only UI, and related state. Keep gallery/try-on/apply orchestration. Give the official card a single localized `customize/customized` action that scrolls/focuses the independent editor section below the skin list.

  When another skin is active, that action records the current light/dark mode and calls `tryOnOfficial()` before opening the editor. `Cancel` exits try-on and restores the recorded mode; `Save and apply` saves the palette and calls the existing official apply flow so the official theme remains active. The editor is visible when the official theme is active or this official try-on edit session is live; `CustomThemeController.setOfficialActive` follows the same condition.

- [ ] **Step 3: Implement the theme editor.** Match the reference hierarchy without fonts: one light/dark segmented switch; exactly accent, background, foreground, and contrast rows; native color input plus uppercase hex text; one contrast range; low-contrast warning; save and restore-default actions. Changes preview immediately, invalid text never applies, and section errors use `aria-live`.

- [ ] **Step 4: Implement the background editor.** Render only three mode buttons (`跟随皮肤`, `自定义图片`, `无背景`), choose/replace, save, delete, one local preview, and the existing scrim slider. The slider is disabled only in `none`. Use a hidden native file input reached by a labeled button; confirm before delete; revoke preview URLs on replace/unmount.

- [ ] **Step 5: Keep styling compact.** Reuse the current 12px/10px card radii, 12px controls, borders, spacing, focus ring, and `--dsw-alias-*` tokens. Add no new shadow language, icon library, or fixed desktop width; verify at 320px.

- [ ] **Step 6: Complete English and Chinese locale keys.** Remove obsolete background hint strings and do not leave hardcoded user-visible text in JSX.

- [ ] **Step 7: Run all package tests and build.**

Run:

```powershell
pnpm --filter @linxin666/dsh-client-ui-skin-center test
pnpm --filter @linxin666/dsh-client-ui-skin-center build
```

- [ ] **Step 8: Inspect the built client bundle for accidental Node imports and obsolete controls.**

Run:

```powershell
rg -n "node:fs|node:path|高级|字体|导入|复制主题" packages/skins/skin-center/lib/client.js
```

Expected: no Node imports and no removed feature labels.

- [ ] **Step 9: Commit.**

```powershell
$env:GIT_CONFIG_NOSYSTEM='1'
git add packages/skins/skin-center/src/client/CustomThemeEditor.tsx packages/skins/skin-center/src/client/BackgroundEditor.tsx packages/skins/skin-center/src/client/SkinCenter.tsx packages/skins/skin-center/src/client/index.ts packages/skins/skin-center/src/client/locales.ts packages/skins/skin-center/src/client/skin-center.module.css
git commit -m "feat(skin-center): add compact appearance editors"
```

---

### Task 8: Documentation, visual QA, aggregate rebuild, and final verification

**Files:**
- Modify: `packages/skins/skin-center/README.md`
- Modify: `packages/skins/skin-center/README.zh.md`
- Modify: `packages/skins/skin-center/README.i18n.yaml`
- Modify: `packages/dsh-skins/README.md`
- Modify: `packages/dsh-skins/README.zh.md`
- Modify: `packages/dsh-skins/README.i18n.yaml`
- Create: `docs/e2e/skin-center/custom-appearance-desktop.png`
- Create: `docs/e2e/skin-center/custom-appearance-narrow.png`
- Rebuild generated aggregate artifacts under `packages/dsh-skins` only through its existing build script

- [ ] **Step 1: Update paired docs narrowly.** Document only the official-theme four-control editor, global three-mode background flow, upload limits, storage directory, and restore/delete behavior. Remove stale claims that opacity supports only Blue Fantasy/Whale Song and update the directory tree for the focused files.

- [ ] **Step 2: Run the package suite before browser QA.**

Run:

```powershell
pnpm --filter @linxin666/dsh-client-ui-skin-center test
pnpm --filter @linxin666/dsh-client-ui-skin-center build
pnpm skin-center:check
```

- [ ] **Step 3: Exercise the local GUI.** At `http://localhost:57977/`, verify light/dark official customization, invalid hex, low-contrast warning, save/reload/reset, image choose/preview/save/replace/delete, all three background modes, scrim preservation, every bundled skin, try-on enter/exit, and 320px keyboard/focus behavior. Use the in-app browser control skill for this step.

- [ ] **Step 4: Capture only two screenshots.** Save one combined desktop editor and one 320px narrow view at the exact paths above. Do not add per-state screenshot clutter.

- [ ] **Step 5: Regenerate the registry, rebuild the carrier, and run repository checks.**

Run:

```powershell
node scripts/skin-center-bundles
pnpm --filter @linxin666/dsh-client-ui-skin-center build
pnpm --filter @linxin666/dsh-skins build
pnpm gallery:check
pnpm aggregate:check
pnpm typecheck
pnpm test
pnpm test:scripts
pnpm docs:check
```

If `pnpm docs:check` still reports only the pre-existing README pairing drift in `dsh-aionui-panel`, `dsh-git-graph`, `dsh-pet`, `dsh-web-ui-all`, and `dsh-web-ui-settings`, record that baseline without editing those packages. Any new skin-center drift must be fixed.

- [ ] **Step 6: Audit scope and placeholders.**

Run:

```powershell
$env:GIT_CONFIG_NOSYSTEM='1'
git status --short
git diff --check HEAD~8..HEAD
rg -n "TODO|TBD|placeholder|高级主题|字体|导入主题|复制主题" packages/skins/skin-center/src packages/skins/skin-center/README.md packages/skins/skin-center/README.zh.md
```

Expected: `.superpowers/` remains untracked and unstaged; no placeholder or excluded feature remains.

- [ ] **Step 7: Commit documentation and generated carrier changes.**

```powershell
$env:GIT_CONFIG_NOSYSTEM='1'
git add packages/skins/skin-center/README.md packages/skins/skin-center/README.zh.md packages/skins/skin-center/README.i18n.yaml packages/dsh-skins/README.md packages/dsh-skins/README.zh.md packages/dsh-skins/README.i18n.yaml docs/e2e/skin-center/custom-appearance-desktop.png docs/e2e/skin-center/custom-appearance-narrow.png packages/dsh-skins/skins/skin-center
git commit -m "docs(skin-center): document custom appearance"
```

- [ ] **Step 8: Request code review and apply only verified findings.** Use `superpowers:requesting-code-review`, rerun the focused tests for any changed area, then use `superpowers:verification-before-completion` before claiming completion.
