# Skin Center Eleventh Custom Theme Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make custom appearance an independently selectable eleventh theme whose card, try-on, apply, boot restoration, and global background behavior match the ten bundled skins.

**Architecture:** Keep the custom surface as a safe semantic-token layer over the official boot graph, but give it a persisted `active` identity and route it through the same `TryOnController` and `/api/skin-center/apply` state machine as every other card. A pure theme-target model owns migration and target mapping; the controller owns settings and inline-token lifecycle; the React card only coordinates those interfaces.

**Tech Stack:** TypeScript, React 18, Cordis client runtime SettingsScope, Schemastery host schema, Vitest with jsdom, tsdown, CSS Modules.

## Global Constraints

- Do not modify DSH source or any of the ten bundled skin packages.
- Custom theme is the eleventh theme; official default remains a separate uncounted stock entry.
- Try-on never writes configuration and never refreshes; Apply persists through the existing host API and refreshes after state and manifest confirmation.
- Background settings and image storage remain global and unique across all themes.
- User input may only affect the existing semantic-token allowlist; do not accept arbitrary CSS or JavaScript.
- Reuse the current skin card, action, badge, spacing, slider, and semantic-color styles.
- Preserve unrelated worktree changes, including the untracked `.superpowers/` directory.

---

### Task 1: Persisted Theme Identity and Migration

**Files:**
- Modify: `packages/skins/skin-center/src/core/theme.ts`
- Modify: `packages/skins/skin-center/src/index.ts`
- Modify: `packages/skins/skin-center/tests/theme.spec.ts`

**Interfaces:**
- Produces: `CUSTOM_THEME_ID`, `OFFICIAL_THEME_ID`, `OFFICIAL_THEME_PRESETS`, `normalizeCustomThemeSettings(value)`, `resolveActiveThemeId(activeSkinId, customActive)`, and `themeApplyTarget(themeId)`.
- Produces: normalized `CustomThemeSettings` with `{ version: 2, active: boolean, light?: PaletteConfig, dark?: PaletteConfig }`.
- Consumes: generated skin IDs as opaque strings; `themeApplyTarget()` maps `custom` and `official` to the official host target and built-in IDs to their own host target.

- [ ] **Step 1: Write failing model and schema tests**

Add assertions equivalent to:

```ts
expect(normalizeCustomThemeSettings({ version: 1, light: palette })).toEqual({
  version: 2,
  active: true,
  light: palette,
})
expect(resolveActiveThemeId(undefined, false)).toBe(OFFICIAL_THEME_ID)
expect(resolveActiveThemeId(undefined, true)).toBe(CUSTOM_THEME_ID)
expect(resolveActiveThemeId('blue-fantasy', true)).toBe('blue-fantasy')
expect(themeApplyTarget(CUSTOM_THEME_ID)).toEqual({ hostTarget: OFFICIAL_THEME_ID, customActive: true })
expect(CustomThemeConfigSchema({})).toEqual({ version: 2, active: false })
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `pnpm --filter @neystan/dsh-client-ui-skin-center test -- tests/theme.spec.ts`

Expected: FAIL because the constants, normalizer, resolver, target mapper, and version 2 schema do not exist.

- [ ] **Step 3: Implement the minimal pure model and host schema**

Add strict normalization and these exact signatures:

```ts
export const OFFICIAL_THEME_ID = 'official'
export const CUSTOM_THEME_ID = 'custom'
export const OFFICIAL_THEME_PRESETS: Readonly<Record<ThemeMode, PaletteConfig>>
export function normalizeCustomThemeSettings(value: unknown): CustomThemeSettings
export function resolveActiveThemeId(activeSkinId: string | undefined, customActive: boolean): string
export function themeApplyTarget(themeId: string): { hostTarget: string; customActive: boolean }
```

Use fixed light and dark presets close to official DSH colors. Migrate valid version 1 palettes to version 2 and set `active` when either palette exists. Make the host schema accept versions 1 and 2 while defaulting new settings to `{ version: 2, active: false }`.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run: `pnpm --filter @neystan/dsh-client-ui-skin-center test -- tests/theme.spec.ts`

Expected: PASS with no warnings.

- [ ] **Step 5: Commit the model**

```text
git add packages/skins/skin-center/src/core/theme.ts packages/skins/skin-center/src/index.ts packages/skins/skin-center/tests/theme.spec.ts
git commit -m "feat(skin-center): add independent custom theme identity"
```

### Task 2: Custom Theme Controller Activation and Trial Lifecycle

**Files:**
- Modify: `packages/skins/skin-center/src/client/custom-theme.ts`
- Modify: `packages/skins/skin-center/src/client/index.ts`
- Modify: `packages/skins/skin-center/tests/custom-theme.spec.ts`

**Interfaces:**
- Consumes: `normalizeCustomThemeSettings()` and `OFFICIAL_THEME_PRESETS` from Task 1.
- Produces on `CustomThemeHandle`: `setActive(active): Promise<void>`, `startTrial(mode): void`, `endTrial(): void`, and `restoreDefaults(): Promise<void>`.
- Preserves: `preview`, `save`, `suspend`, `resume`, and per-token original value/priority restoration.

- [ ] **Step 1: Write failing controller tests**

Add separate tests that prove:

```ts
await controller.setActive(true)
expect(fake.value.active).toBe(true)
expect(document.body.style.getPropertyValue('--dsw-alias-brand-primary')).toBe(palette.accent)

controller.startTrial('dark')
expect(document.body.style.getPropertyValue('--dsw-alias-brand-primary')).toBe(darkPalette.accent)
controller.endTrial()
expect(document.body.style.getPropertyValue('--dsw-alias-brand-primary')).toBe('')

await controller.restoreDefaults()
expect(fake.value).toMatchObject({ version: 2, active: true, ...OFFICIAL_THEME_PRESETS })
```

Also assert that an active custom theme does not write tokens when a bundled skin is the base surface and that it applies during controller construction when the official base surface is active.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `pnpm --filter @neystan/dsh-client-ui-skin-center test -- tests/custom-theme.spec.ts`

Expected: FAIL because activation, explicit trial, and default restoration methods are missing.

- [ ] **Step 3: Implement the minimal lifecycle**

Normalize every scope snapshot to version 2. Compute token visibility from `baseSurfaceActive && !suspended && (settings.active || trialActive || draft !== undefined)`. Persist `active` without deleting palettes. `restoreDefaults()` writes both fixed presets while preserving `active`. `startTrial()` applies the saved or default palette for the requested mode; `endTrial()` removes trial-only visibility and restores the persisted surface state.

Update `client/index.ts` so boot construction receives whether an installed skin package is absent, and keep `TryOnController` appearance hooks responsible for suspend/resume around every surface transition.

- [ ] **Step 4: Run the focused tests and verify GREEN**

Run: `pnpm --filter @neystan/dsh-client-ui-skin-center test -- tests/custom-theme.spec.ts tests/try-on.spec.ts`

Expected: PASS; existing try-on restoration tests remain green.

- [ ] **Step 5: Commit the controller**

```text
git add packages/skins/skin-center/src/client/custom-theme.ts packages/skins/skin-center/src/client/index.ts packages/skins/skin-center/tests/custom-theme.spec.ts
git commit -m "feat(skin-center): manage custom theme activation lifecycle"
```

### Task 3: Unified Eleventh Card, Try-On, and Apply Flow

**Files:**
- Modify: `packages/skins/skin-center/src/client/SkinCenter.tsx`
- Modify: `packages/skins/skin-center/src/client/CustomThemeEditor.tsx`
- Modify: `packages/skins/skin-center/src/client/locales.ts`
- Modify: `packages/skins/skin-center/tests/appearance-ui.spec.ts`
- Modify: `packages/skins/skin-center/tests/try-on.spec.ts`

**Interfaces:**
- Consumes: `CUSTOM_THEME_ID`, `OFFICIAL_THEME_ID`, `resolveActiveThemeId()`, `themeApplyTarget()`, and Task 2 controller methods.
- Produces: one shared card renderer for official, custom, and generated skins; custom actions are Try On, Apply, and Edit.
- Preserves: existing `confirmActive()`, `manifestReady()`, error copy, and `window.location.reload()` after confirmed Apply.

- [ ] **Step 1: Write failing UI-state tests**

Add exported pure helpers only where needed to assert:

```ts
expect(themeCount(10)).toBe(11)
expect(cardState(undefined, false, null).activeId).toBe('official')
expect(cardState(undefined, true, null).activeId).toBe('custom')
expect(cardState('whale-song', true, null).activeId).toBe('whale-song')
expect(applyRequestFor('custom')).toEqual({ body: { official: true }, confirmationTarget: 'official' })
```

Add a try-on orchestration test proving custom trial calls `tryOnOfficial()` and `startTrial()` without fetch or reload, and exit calls `endTrial()` before controller restoration.

- [ ] **Step 2: Run focused tests and verify RED**

Run: `pnpm --filter @neystan/dsh-client-ui-skin-center test -- tests/appearance-ui.spec.ts tests/try-on.spec.ts`

Expected: FAIL because the custom card identity and unified orchestration do not exist.

- [ ] **Step 3: Implement the unified UI and apply transaction**

Remove the official card's old customize button and `resetAndApplyOfficial()` branch. Render a custom card adjacent to the generated skin entries with the same `cardHead`, `badge`, and `actionButtons` helper. Use the active ID resolver for all badges.

For custom try-on, call `controller.tryOnOfficial()`, then `customTheme.startTrial(themeMode)`, and set the same `tryingId` used by built-in skins. On exit, end the custom trial before `controller.exit()`.

Make Apply an async transaction:

```ts
const previousActive = customTheme.getSnapshot().settings.active
await customTheme.setActive(target.customActive)
try {
  await postApply(target.hostTarget)
  await confirmActive(target.hostTarget)
  await manifestReady(target.hostTarget)
  window.location.reload()
} catch (error) {
  await customTheme.setActive(previousActive)
  showApplyError(error)
}
```

Keep the existing timeout behavior: confirmation timeout reports the command fallback and does not refresh. Saving from the editor persists the current palette and then applies `custom`; cancelling exits only the temporary custom trial.

Change the editor reset action to `restoreDefaults()`. Use copy that distinguishes “restore default parameters” inside the custom editor from “restore official” on the official card.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run: `pnpm --filter @neystan/dsh-client-ui-skin-center test -- tests/appearance-ui.spec.ts tests/custom-theme.spec.ts tests/try-on.spec.ts tests/manifest.spec.ts`

Expected: PASS; tests assert no reload during try-on and exactly one reload after confirmed Apply.

- [ ] **Step 5: Commit the unified UI**

```text
git add packages/skins/skin-center/src/client/SkinCenter.tsx packages/skins/skin-center/src/client/CustomThemeEditor.tsx packages/skins/skin-center/src/client/locales.ts packages/skins/skin-center/tests/appearance-ui.spec.ts packages/skins/skin-center/tests/try-on.spec.ts
git commit -m "refactor(skin-center): promote custom appearance to eleventh theme"
```

### Task 4: Documentation, Generated Bundles, and End-to-End Verification

**Files:**
- Modify: `packages/skins/skin-center/README.md`
- Modify: `packages/skins/skin-center/README.zh.md`
- Modify: `packages/skins/skin-center/README.i18n.yaml`
- Modify generated by build: `packages/skins/skin-center/lib/client.js`
- Modify generated by build: `packages/skins/skin-center/lib/client.js.map`
- Modify generated by build: `packages/skins/skin-center/lib/index.js`
- Modify generated by aggregate build: `packages/dsh-skins/skin-center/**`

**Interfaces:**
- Consumes: completed behavior from Tasks 1-3.
- Produces: distributable client/host bundles and aggregate skin package matching source behavior.

- [ ] **Step 1: Update paired README behavior**

Document the 11-theme count, independent custom activation, global background, try-on without refresh, Apply with refresh, and default-parameter reset in mirrored English and Chinese sections. Remove wording that describes custom colors as part of the official card.

- [ ] **Step 2: Record the README pairing**

Run: `node scripts/verify-docs.mjs --write packages/skins/skin-center`

Expected: `README.i18n.yaml` records the two matching documents.

- [ ] **Step 3: Run package gates**

Run:

```text
pnpm --filter @neystan/dsh-client-ui-skin-center test
pnpm --filter @neystan/dsh-client-ui-skin-center typecheck
pnpm --filter @neystan/dsh-client-ui-skin-center build
pnpm skin-center:check
pnpm --filter @neystan/dsh-skins build
```

Expected: all commands exit 0 and generated bundles contain the new custom identity and locale copy.

- [ ] **Step 4: Run repository-level checks without rewriting unrelated files**

Run: `pnpm docs:check`, `pnpm test:scripts`, and `git diff --check`.

Expected: changed-package checks pass. If `docs:check` still reports pre-existing README pairing drift in unrelated packages, record the exact unrelated packages and do not modify them.

- [ ] **Step 5: Verify in both browser surfaces**

Using the user's running DSH instance, verify: custom appears as the eleventh card; official has no custom button; built-in and custom try-on do not refresh; custom and built-in Apply refresh once; active badge survives refresh; background remains visible; restoring custom parameters keeps custom active; restoring official disables custom.

- [ ] **Step 6: Commit documentation and generated assets**

```text
git add packages/skins/skin-center/README.md packages/skins/skin-center/README.zh.md packages/skins/skin-center/README.i18n.yaml packages/skins/skin-center/lib packages/dsh-skins/skin-center
git commit -m "docs(skin-center): document eleventh custom theme"
```

### Task 5: Use One Translucent Application Shell With an Opaque Canvas

**Files:**
- Modify: `packages/skins/skin-center/src/core/theme.ts`
- Modify: `packages/skins/skin-center/src/client/background.ts`
- Modify: `packages/skins/skin-center/src/client/custom-theme.ts`
- Modify: `packages/skins/skin-center/tests/background.spec.ts`
- Modify: `packages/skins/skin-center/tests/custom-theme.spec.ts`
- Modify generated by build: `packages/skins/skin-center/lib/client.js`
- Modify generated by build: `packages/skins/skin-center/lib/client.js.map`

**Interfaces:**
- Produces: `deriveThemeTokens(palette)` with the existing translucent base, layer, overlay, sidebar, menu, input, and bubble token values in every background mode; no new global selectors.
- Produces: an opaque `body` background color owned and restored by `CustomThemeController` as the no-image canvas.
- Removes: the background-mode body attribute and its cross-controller observer; no settings namespace or service is added.

- [ ] **Step 1: Write the failing composition tests**

Add pure derivation tests for RGBA base, layer, overlay, and sidebar tokens. Add a real-controller test that switches from a custom image to no background and asserts those surfaces remain translucent while the opaque body canvas remains the configured palette color. Add canvas restoration assertions for suspend and dispose.

- [ ] **Step 2: Run focused tests and verify RED**

Run: `pnpm --filter @neystan/dsh-client-ui-skin-center exec vitest run tests/background.spec.ts tests/custom-theme.spec.ts`

Expected: FAIL because no-image rendering still returns opaque `#RRGGBB` tokens and the controller does not own an opaque canvas.

- [ ] **Step 3: Implement uniform translucent derivation and canvas ownership**

Remove the optional background flag from `deriveThemeTokens` and always derive the controlled surface tokens as RGBA. Have `CustomThemeController` set `body` background color to the current palette while active and restore its exact original value and priority on suspend/dispose. Delete the background-mode attribute, its observer branch, and their obsolete tests.

- [ ] **Step 4: Run focused and package verification**

Run the two focused tests, the nine non-platform-specific skin-center test files, `pnpm --filter @neystan/dsh-client-ui-skin-center build`, `pnpm skin-center:check`, and `git diff --check`.

Expected: all focused and relevant tests pass; the known Windows-only POSIX permission assertion remains separately documented.

- [ ] **Step 5: Verify the real page and commit**

On the local DSH page, verify the same saved background becomes visible with custom active, remains visible after closing settings and refreshing, and try-on still restores correctly. Stop the temporary foreground server, then commit source, tests, docs, and generated client assets.
