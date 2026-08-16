# dsh-pet Custom Pet MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add one safely importable custom pet slot to `dsh-pet`, using the bundled whale pet's existing 8×9 animation contract, runtime behavior, progression data, and visual language.

**Architecture:** Keep the official whale package-owned and add one fixed `candidate`/`current` asset pair under `$DSH_HOME/pet/custom`. A shared pure contract validates manifests and WebP metadata; a host-side transactional store owns files; `PetService` serializes state changes and exposes stable asset descriptors; the current sprite component reloads descriptors without remounting the application; one settings-field component owns file selection, browser pixel QA, idle preview, prompt copying, apply, and delete.

**Tech Stack:** TypeScript 6, React 18, Cordis, Node.js file APIs, Vitest 4 with jsdom, CSS Modules, tsdown, native Canvas/ImageBitmap browser APIs.

## Global Constraints

- Preserve the official files in `packages/dsh-pet/assets/whale`; never copy or modify them at runtime.
- Accept exactly two separately selected files named `pet.json` and `spritesheet.webp`; do not add ZIP, PNG, GIF, URL, registry, history, or online-generation support.
- Support exactly one custom slot and the existing 8-column × 9-row, 192×208-cell, 1536×1872 transparent WebP contract.
- Reuse the nine existing tracks, frame counts, timing, state projection, interactions, name, affinity, treats, size, and position.
- Import creates or replaces only `candidate`; switching requires an explicit “Use selected pet” action and does not refresh the page.
- Management routes stay available while the floating pet is disabled. Disabling the plugin only stops the overlay, polling, and activity listeners.
- Reject arbitrary paths and unknown manifest fields. Never display absolute paths, host exceptions, or uploaded text as HTML.
- Do not add native image dependencies. Browser code performs pixel-level alpha checks; host code validates JSON, Base64, RIFF/WEBP metadata, dimensions, and alpha capability.
- All write operations are serialized and compare an `expectedState` token; stale requests return HTTP 409.
- Reuse current semantic colors, density, button treatment, 12px outer radius, 8–10px inner radius, focus styling, and reduced-motion behavior.
- Do not edit generated shared settings files: `PluginSettingsCard.tsx`, `settings-form.ts`, or `settings-card.module.css`.
- Preserve unrelated worktree changes, especially the untracked `.superpowers/` directory.
- Do not use emoji in source, UI strings, documentation, commits, or tests.

## File Map

**Create:**

- `packages/dsh-pet/src/core/pet-assets.ts` — shared format constants, manifest parser, WebP container inspection, stable validation codes.
- `packages/dsh-pet/src/core/pet-assets.test.ts` — contract and official-golden-sample tests.
- `packages/dsh-pet/src/pet-asset-store.ts` — fixed-path transactional storage and recovery.
- `packages/dsh-pet/src/pet-asset-store.test.ts` — store replacement, rollback, recovery, and cleanup tests.
- `packages/dsh-pet/tests/routes.spec.ts` — host API, limits, static response, disabled-state, and conflict tests.
- `packages/dsh-pet/src/client/pet-image-validation.ts` — browser decode, pixel QA, and import payload preparation.
- `packages/dsh-pet/src/client/pet-image-validation.test.ts` — deterministic RGBA validation tests.
- `packages/dsh-pet/src/client/generation-prompt.ts` — localized prompt generation and clipboard fallback.
- `packages/dsh-pet/src/client/generation-prompt.test.ts` — contract/path/copy behavior tests.
- `packages/dsh-pet/src/client/PetSpritePreview.tsx` — small idle-only official/candidate preview.
- `packages/dsh-pet/src/client/PetAppearanceField.tsx` — two-card appearance manager.
- `packages/dsh-pet/src/client/PetAppearanceField.test.tsx` — settings UI workflow tests.
- `packages/dsh-pet/src/client/pet-appearance.module.css` — package-local semantic-token styles.

**Modify:**

- `packages/dsh-pet/src/client/spritesheet.ts` — consume shared geometry and frame constants.
- `packages/dsh-pet/src/persist.ts` and `src/persist.test.ts` — migrate and persist appearance.
- `packages/dsh-pet/src/ledger.ts` and `src/ledger.test.ts` — atomically update appearance without touching economy state.
- `packages/dsh-pet/src/service.ts` and `tests/service-enabled.spec.ts` — orchestrate assets, fallback, serialization, and state views.
- `packages/dsh-pet/src/routes.ts` — management and custom static routes with per-route body limits.
- `packages/dsh-pet/src/index.ts` — construct and recover the store before service registration.
- `packages/dsh-pet/src/client/WhalePet.tsx` and `src/client/WhalePet.test.tsx` — load the active descriptor instead of fixed URLs.
- `packages/dsh-pet/src/client/PetDockEntry.tsx` — pass the active asset descriptor into the pet component.
- `packages/dsh-pet/src/client/index.ts` — expose appearance API/controller and mount the new field.
- `packages/dsh-pet/src/client/PetSettingsCard.tsx` — place the appearance manager above existing settings without changing draft semantics.
- `packages/dsh-pet/src/client/locales.ts` — bilingual labels and stable error translations.
- `packages/dsh-pet/README.md`, `README.zh.md`, `README.i18n.yaml`, and `package.json` — document the MVP and keep package metadata aligned.

**Generate for verification only:**

- `packages/dsh-pet/lib/**` — ignored build output; verify it locally but do not force-add or commit it.

---

### Task 1: Establish One Shared Asset Contract

**Files:**

- Create: `packages/dsh-pet/src/core/pet-assets.ts`
- Create: `packages/dsh-pet/src/core/pet-assets.test.ts`
- Modify: `packages/dsh-pet/src/client/spritesheet.ts`

**Interfaces:**

- Produces `PET_ACTIONS`, `PET_FRAME_COUNTS`, atlas geometry, byte limits, `PetAssetManifest`, `PetAssetErrorCode`, `PetAssetValidationError`, `parsePetManifest(text)`, and `inspectWebpContainer(bytes)`.
- `parsePetManifest` accepts only the five known fields and returns trimmed text values.
- `inspectWebpContainer` supports lossless `VP8L` and extended `VP8X` WebP containers, scans chunks with padding, and reports width, height, and alpha capability without decoding pixels.
- `src/client/spritesheet.ts` imports the shared constants and keeps its existing public track behavior.

- [ ] **Step 1: Write failing manifest and WebP tests**

Cover the official `assets/whale/pet.json` and `assets/whale/spritesheet.webp` as golden samples, exact field names, ID boundaries, trimmed display text, 64 KiB manifest limit, fixed path, fixed frame tuple, unknown fields, malformed RIFF, wrong dimensions, plain `VP8` without alpha, `VP8L`, and `VP8X` with and without alpha.

Use these exact public shapes in the tests:

```ts
export const PET_ACTIONS = [
  'idle',
  'running-right',
  'running-left',
  'waving',
  'jumping',
  'failed',
  'waiting',
  'running',
  'review',
] as const

export const PET_FRAME_COUNTS = [6, 8, 8, 4, 5, 8, 6, 6, 6] as const

export interface PetAssetManifest {
  id: string
  displayName: string
  description: string
  spritesheetPath: 'spritesheet.webp'
  frames: [6, 8, 8, 4, 5, 8, 6, 6, 6]
}
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```text
pnpm --filter @neystan/dsh-pet exec vitest run src/core/pet-assets.test.ts
```

Expected: FAIL because `src/core/pet-assets.ts` does not exist.

- [ ] **Step 3: Implement strict manifest parsing**

Export these constants:

```ts
export const PET_ATLAS_COLUMNS = 8
export const PET_ATLAS_ROWS = 9
export const PET_FRAME_WIDTH = 192
export const PET_FRAME_HEIGHT = 208
export const PET_ATLAS_WIDTH = 1536
export const PET_ATLAS_HEIGHT = 1872
export const PET_MANIFEST_MAX_BYTES = 64 * 1024
export const PET_SPRITESHEET_MAX_BYTES = 8 * 1024 * 1024
export const PET_IMPORT_BODY_MAX_BYTES = 12 * 1024 * 1024
```

Parse JSON only after checking `new TextEncoder().encode(text).byteLength` so the shared module stays browser-safe. Require a plain object with exactly `id`, `displayName`, `description`, `spritesheetPath`, and `frames`. Normalize only leading/trailing whitespace in the two display strings. Throw `PetAssetValidationError` with one stable code such as `manifest.invalid-json`, `manifest.unknown-field`, `manifest.invalid-id`, `manifest.invalid-name`, `manifest.description-too-long`, `manifest.invalid-path`, or `manifest.invalid-frames`.

- [ ] **Step 4: Implement bounded WebP container inspection**

Check `RIFF`, the declared RIFF length, and `WEBP`, then scan chunks using `chunkSize + (chunkSize & 1)`. For `VP8L`, require signature byte `0x2f`, decode the packed width/height, and read the alpha-used flag. For `VP8X`, decode the 24-bit minus-one width/height and require the alpha feature bit; accept alpha data represented by an `ALPH` chunk or a nested lossless payload whose `VP8L` alpha-used flag is set. Reject truncated chunks and `VP8`-only files with stable codes. After inspection, require exactly 1536×1872 and alpha capability.

- [ ] **Step 5: Reuse the constants in the existing sprite runtime**

Remove duplicated geometry and frame-count literals from `src/client/spritesheet.ts`. Import the shared values, preserve existing exported names when tests or components already consume them, and do not change track timing or state-to-track mapping.

- [ ] **Step 6: Run focused and package tests**

Run:

```text
pnpm --filter @neystan/dsh-pet exec vitest run src/core/pet-assets.test.ts
pnpm --filter @neystan/dsh-pet typecheck
```

Expected: PASS. The official manifest and WebP must pass the same contract used for custom assets.

- [ ] **Step 7: Commit the contract**

```text
git add packages/dsh-pet/src/core/pet-assets.ts packages/dsh-pet/src/core/pet-assets.test.ts packages/dsh-pet/src/client/spritesheet.ts
git commit -m "feat(pet): define custom pet asset contract"
```

### Task 2: Migrate the Persisted Appearance Without Splitting Progression

**Files:**

- Modify: `packages/dsh-pet/src/persist.ts`
- Modify: `packages/dsh-pet/src/persist.test.ts`
- Modify: `packages/dsh-pet/src/ledger.ts`
- Modify: `packages/dsh-pet/src/ledger.test.ts`

**Interfaces:**

- Produces `type PetAppearance = 'official' | 'custom'`.
- Adds `appearance` to `PetPersist` and defaults missing, invalid, or corrupt values to `official`.
- Produces `PetLedger.setAppearance(appearance)` while preserving the same name, affinity, treats, and display objects.

- [ ] **Step 1: Write failing migration and ledger tests**

Add tests proving an old valid `pet.json` without `appearance` loads as official, a custom selection round-trips, invalid values normalize to official, and this mutation leaves all economy/display fields unchanged:

```ts
const before = ledger.snapshot
ledger.setAppearance('custom')
expect(ledger.snapshot).toEqual({ ...before, appearance: 'custom' })
expect(ledger.takeDirty()).toBe(true)
```

- [ ] **Step 2: Run the focused tests and verify RED**

Run:

```text
pnpm --filter @neystan/dsh-pet exec vitest run src/persist.test.ts src/ledger.test.ts
```

Expected: FAIL because `appearance` and `setAppearance` do not exist.

- [ ] **Step 3: Add the tolerant migration**

Add the field to `emptyPersist()` and return it from `loadPetPersist()` using only an exact equality check:

```ts
export type PetAppearance = 'official' | 'custom'

const appearance: PetAppearance = parsed.appearance === 'custom'
  ? 'custom'
  : 'official'
```

Do not change the persistence filename, schema of other fields, clamping, or atomic save mechanism.

- [ ] **Step 4: Add the ledger setter**

Implement `setAppearance` with the same immutable snapshot pattern as `setName` and `setDisplay`. Mark dirty only when the value changes so repeated apply requests do not cause unnecessary writes.

- [ ] **Step 5: Run the focused tests and commit**

Run:

```text
pnpm --filter @neystan/dsh-pet exec vitest run src/persist.test.ts src/ledger.test.ts
```

Expected: PASS.

```text
git add packages/dsh-pet/src/persist.ts packages/dsh-pet/src/persist.test.ts packages/dsh-pet/src/ledger.ts packages/dsh-pet/src/ledger.test.ts
git commit -m "feat(pet): persist active pet appearance"
```

### Task 3: Add a Fixed-Path Transactional Asset Store

**Files:**

- Create: `packages/dsh-pet/src/pet-asset-store.ts`
- Create: `packages/dsh-pet/src/pet-asset-store.test.ts`

**Interfaces:**

- Owns only `$DSH_HOME/pet/custom/{current,candidate}` plus transient `.incoming`, `.backup`, and `.transaction.json` entries.
- Produces `PetAssetStore`, `StoredPetAsset`, `PetAssetStoreSnapshot`, `PreparedPetPromotion`, and injectable `PetAssetFileOps` for deterministic failure tests.
- Never accepts a caller-provided relative path; callers select only `current` or `candidate` and the store resolves exact filenames.

- [ ] **Step 1: Write failing storage tests**

Use a fresh OS temp directory per test. Cover first candidate import, candidate replacement, candidate promotion, promotion with old-current rollback, deleting both slots, incomplete pair rejection, startup recovery from `.backup`, cleanup of incomplete `.incoming`, revision changes, and absence of version/history directories.

Test this contract:

```ts
export type PetAssetSlot = 'current' | 'candidate'

export interface StoredPetAsset {
  slot: PetAssetSlot
  manifest: PetAssetManifest
  manifestText: string
  revision: string
}

export interface PetAssetStoreSnapshot {
  current?: StoredPetAsset
  candidate?: StoredPetAsset
  stateToken: string
  recoveryError?: 'store.recovered' | 'store.invalid-custom'
}

export interface PreparedPetPromotion {
  current: StoredPetAsset
  commit(): Promise<void>
  rollback(): Promise<void>
}
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```text
pnpm --filter @neystan/dsh-pet exec vitest run src/pet-asset-store.test.ts
```

Expected: FAIL because the store module does not exist.

- [ ] **Step 3: Implement fixed path resolution and reads**

Construct the store with the resolved DSH home and derive `join(dshHome, 'pet', 'custom')` internally. Add private helpers for a slot's exact `pet.json` and `spritesheet.webp`. On read, require both files, parse the manifest through Task 1, inspect the WebP through Task 1, and calculate SHA-256 over a length-delimited combination of manifest UTF-8 bytes and WebP bytes.

- [ ] **Step 4: Implement candidate replacement**

Write a fully validated pair into a newly recreated `.incoming` directory using temporary filenames, fsync or close each file, write the final manifest, then replace `candidate` by rename. If replacement fails, restore the previous candidate from a transient backup and surface `store.write-failed`. Always clean operation leftovers in `finally`.

- [ ] **Step 5: Implement promotion, rollback, delete, and recovery**

Before promotion, write `.transaction.json` with `{ "operation": "promote" }`. Rename `current` to `.backup`, rename `candidate` to `current`, validate the new `current`, and return a `PreparedPetPromotion`. Its `commit()` removes `.backup` and the marker; its `rollback()` moves the new current back to candidate and restores `.backup`. The service must call exactly one of them in `finally`-guarded application logic.

At startup, recovery must be deterministic: for an unfinished promotion, keep a valid new current when persisted appearance is custom and otherwise roll it back; restore a complete `.backup` when current is missing or invalid. Remove incomplete incoming/candidate directories. Never block startup on an invalid custom pair; expose `recoveryError` and an empty affected slot. Pass the persisted appearance into `recover(appearance)` rather than letting the store read `$DSH_HOME/pet.json` itself.

- [ ] **Step 6: Run focused tests and commit**

Run:

```text
pnpm --filter @neystan/dsh-pet exec vitest run src/pet-asset-store.test.ts src/core/pet-assets.test.ts
pnpm --filter @neystan/dsh-pet typecheck
```

Expected: PASS with no files left outside the fixed current/candidate layout after each successful operation.

```text
git add packages/dsh-pet/src/pet-asset-store.ts packages/dsh-pet/src/pet-asset-store.test.ts
git commit -m "feat(pet): add atomic custom pet asset store"
```

### Task 4: Expose Serialized Management and Static Asset APIs

**Files:**

- Modify: `packages/dsh-pet/src/service.ts`
- Modify: `packages/dsh-pet/src/routes.ts`
- Modify: `packages/dsh-pet/src/index.ts`
- Modify: `packages/dsh-pet/tests/service-enabled.spec.ts`
- Create: `packages/dsh-pet/tests/routes.spec.ts`

**Interfaces:**

- Produces `PetAssetView`, `PetAppearanceView`, and an `asset` field on the existing state view.
- Produces `appearanceState()`, `importCandidate(body)`, `useOfficial(expectedState)`, `useCustom(expectedState)`, and `deleteCustom(expectedState)` on `PetService`.
- Registers management routes regardless of the enabled setting; only overlay/activity behavior remains conditional.

- [ ] **Step 1: Write failing service and route tests**

Cover old-state fallback when custom files are absent, candidate import without switching, applying candidate without changing progression, switching back while retaining current, delete-active switching official first, 409 state conflicts, serialized concurrent writes, disabled management, malformed Base64, decoded image over 8 MiB, default 64 KiB body limit, import 12 MiB body limit, static Content-Type, ETag, and no-cache behavior.

Use this client-facing descriptor:

```ts
export interface PetAssetView {
  kind: 'official' | 'custom'
  slot: 'official' | 'current' | 'candidate'
  manifest: PetAssetManifest
  revision: string
  manifestUrl: string
  spritesheetUrl: string
}

export interface PetAppearanceView {
  appearance: PetAppearance
  official: PetAssetView
  current?: PetAssetView
  candidate?: PetAssetView
  stateToken: string
  error?: 'store.recovered' | 'store.invalid-custom'
}
```

- [ ] **Step 2: Run focused tests and verify RED**

Run:

```text
pnpm --filter @neystan/dsh-pet exec vitest run tests/service-enabled.spec.ts tests/routes.spec.ts
```

Expected: FAIL because appearance service methods and routes do not exist.

- [ ] **Step 3: Integrate the store into service startup**

Construct `PetAssetStore` from the same resolved DSH home, call `recover()` before publishing the service, and build an official descriptor from `assets/whale/pet.json`. If persisted appearance is custom but `current` is missing or invalid, set appearance to official and flush once while preserving every other ledger field.

Put all mutating methods behind one promise queue. Compare the supplied token against the latest store/service token inside that queue. Use a stable token derived from appearance plus current and candidate revisions.

- [ ] **Step 4: Implement state transitions with rollback**

`importCandidate` validates the exact filenames, strict Base64, decoded byte size, shared manifest, and WebP inspection before calling the store. It does not change appearance.

`useCustom` promotes a candidate when present, otherwise requires a valid current, then persists `appearance='custom'`. If persistence fails after promotion, restore the previous store snapshot and appearance.

`useOfficial` persists official and retains custom assets. `deleteCustom` persists official before deleting an active custom pair; if the official switch cannot be saved, it must not delete files.

- [ ] **Step 5: Add routes and per-route body limits**

Add these exact endpoints:

```text
GET  /api/pet/appearance
POST /api/pet/appearance/import
POST /api/pet/appearance/use-official
POST /api/pet/appearance/use-custom
POST /api/pet/appearance/delete
GET  /pet/custom/current/pet.json
GET  /pet/custom/current/spritesheet.webp
GET  /pet/custom/candidate/pet.json
GET  /pet/custom/candidate/spritesheet.webp
```

Refactor the JSON reader to accept a limit argument. Use 12 MiB only for import and retain 64 KiB for all current and new small JSON routes. Map validation to 400, stale state to 409, unavailable slot to 404, and internal file failures to 500. Return stable codes only.

- [ ] **Step 6: Run route, service, and package tests**

Run:

```text
pnpm --filter @neystan/dsh-pet exec vitest run tests/routes.spec.ts tests/service-enabled.spec.ts src/persist.test.ts src/pet-asset-store.test.ts
pnpm --filter @neystan/dsh-pet typecheck
```

Expected: PASS. The disabled-state test must prove the management GET and import path remain callable.

- [ ] **Step 7: Commit the host integration**

```text
git add packages/dsh-pet/src/service.ts packages/dsh-pet/src/routes.ts packages/dsh-pet/src/index.ts packages/dsh-pet/tests/service-enabled.spec.ts packages/dsh-pet/tests/routes.spec.ts
git commit -m "feat(pet): expose custom pet management API"
```

### Task 5: Validate Pixels and Generate the Agent Prompt in the Browser

**Files:**

- Create: `packages/dsh-pet/src/client/pet-image-validation.ts`
- Create: `packages/dsh-pet/src/client/pet-image-validation.test.ts`
- Create: `packages/dsh-pet/src/client/generation-prompt.ts`
- Create: `packages/dsh-pet/src/client/generation-prompt.test.ts`

**Interfaces:**

- Produces `validatePetImage(decoded)`, `preparePetImport(manifestFile, spritesheetFile, decoder)`, `generationPrompt(locale)`, and `writeClipboard(text, dependencies)`.
- Uses a test-injected decoder so unit tests never depend on browser image codecs.
- Produces a ready-to-upload Base64 string only after both manifest and pixel checks pass.

- [ ] **Step 1: Write failing RGBA and prompt tests**

Create small deterministic RGBA buffers mapped to the real 8×9 cell boundaries. Cover exact dimensions, one nontransparent pixel in every valid frame, transparent area in every valid cell, completely transparent unused tail cells, alpha threshold 8, decode failure, filename mismatch, and size limits.

For both locale prompts assert all nine action names, `[6, 8, 8, 4, 5, 8, 6, 6, 6]`, `1536×1872`, `192×208`, the relative template path `packages/dsh-pet/assets/whale`, exactly two output filenames, and absence of a drive-letter or user-home path.

- [ ] **Step 2: Run focused tests and verify RED**

Run:

```text
pnpm --filter @neystan/dsh-pet exec vitest run src/client/pet-image-validation.test.ts src/client/generation-prompt.test.ts
```

Expected: FAIL because both client modules are missing.

- [ ] **Step 3: Implement pixel validation**

Use this decoder boundary:

```ts
export interface DecodedPetImage {
  width: number
  height: number
  rgba: Uint8ClampedArray
  close(): void
}

export interface PetImageDecoder {
  decode(file: File): Promise<DecodedPetImage>
}
```

For each row, scan valid cells `0..frames[row]-1`: require at least one pixel with alpha greater than 8 and at least one pixel with alpha at most 8. For tail cells `frames[row]..7`, reject the first alpha greater than 8 and include the action code in the stable error. Always call `close()` in `finally`.

The browser decoder may use `createImageBitmap`, an offscreen canvas when available, and a detached regular canvas fallback. It must not mount uploaded content into the application DOM.

- [ ] **Step 4: Prepare the import payload**

Check exact basenames and raw file sizes before reading. Parse manifest text through Task 1, decode and validate pixels, then convert bytes to Base64 in bounded chunks rather than spreading an 8 MiB array into one function call. Return the original manifest text and exact filenames.

- [ ] **Step 5: Implement prompt generation and clipboard fallback**

Build Chinese and English strings from the shared constants; do not duplicate geometry or frame literals in UI code. `writeClipboard` first calls `navigator.clipboard.writeText`. If unavailable or rejected, place a temporary readonly textarea in the document, select it, call `document.execCommand('copy')`, remove it in `finally`, and reject when the fallback reports false.

- [ ] **Step 6: Run tests and commit**

Run:

```text
pnpm --filter @neystan/dsh-pet exec vitest run src/client/pet-image-validation.test.ts src/client/generation-prompt.test.ts
pnpm --filter @neystan/dsh-pet typecheck
```

Expected: PASS.

```text
git add packages/dsh-pet/src/client/pet-image-validation.ts packages/dsh-pet/src/client/pet-image-validation.test.ts packages/dsh-pet/src/client/generation-prompt.ts packages/dsh-pet/src/client/generation-prompt.test.ts
git commit -m "feat(pet): validate custom pet assets in browser"
```

### Task 6: Make the Existing Pet Runtime Load the Active Asset Descriptor

**Files:**

- Modify: `packages/dsh-pet/src/client/WhalePet.tsx`
- Modify: `packages/dsh-pet/src/client/WhalePet.test.tsx`
- Modify: `packages/dsh-pet/src/client/PetDockEntry.tsx`
- Modify: `packages/dsh-pet/src/client/index.ts`

**Interfaces:**

- `WhalePet` consumes `asset: PetAssetView` instead of module-level fixed URLs.
- The official descriptor still points to `/pet/whale/pet.json` and `/pet/whale/spritesheet.webp`.
- A change to `asset.revision` resets only loading state and image resources; it preserves active session animation, interactions, display configuration, and the rest of the page.

- [ ] **Step 1: Write failing rerender tests**

Render with the official descriptor, resolve its manifest/image mocks, then rerender with a custom descriptor and a different revision. Assert the new URLs load once, the old image is released, the component returns to loading rather than displaying stale pixels, and no `window.location.reload` occurs. Keep existing interaction and drag tests unchanged.

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```text
pnpm --filter @neystan/dsh-pet exec vitest run src/client/WhalePet.test.tsx
```

Expected: FAIL because `WhalePet` still uses fixed official URLs and accepts no asset descriptor.

- [ ] **Step 3: Replace fixed URLs with descriptor-driven loading**

Add `asset` to the component props. Make the loader effect depend on `asset.manifestUrl`, `asset.spritesheetUrl`, and `asset.revision`. Abort stale manifest fetches, detach stale image handlers, reset readiness and frame counts, and verify the fetched manifest again with `parsePetManifest` before rendering.

Keep `WhalePet` as the component name to minimize churn. Do not change the animation loop, track timing, drag behavior, reaction bubble, or sprite CSS.

- [ ] **Step 4: Propagate service state through the existing client store**

Add `asset` to the state API type and pass it from the current root/dock component into `WhalePet`. The state poll already refreshes the view; when applying an appearance, trigger an immediate state refresh so the new hash is observed without waiting for the next interval.

- [ ] **Step 5: Run focused and regression tests**

Run:

```text
pnpm --filter @neystan/dsh-pet exec vitest run src/client/WhalePet.test.tsx tests/service-enabled.spec.ts
pnpm --filter @neystan/dsh-pet typecheck
```

Expected: PASS; existing animations and interactions retain their prior assertions.

- [ ] **Step 6: Commit the runtime switch**

```text
git add packages/dsh-pet/src/client/WhalePet.tsx packages/dsh-pet/src/client/WhalePet.test.tsx packages/dsh-pet/src/client/PetDockEntry.tsx packages/dsh-pet/src/client/index.ts
git commit -m "feat(pet): load active pet assets dynamically"
```

### Task 7: Add the Minimal Two-Card Appearance Manager

**Files:**

- Create: `packages/dsh-pet/src/client/PetSpritePreview.tsx`
- Create: `packages/dsh-pet/src/client/PetAppearanceField.tsx`
- Create: `packages/dsh-pet/src/client/PetAppearanceField.test.tsx`
- Create: `packages/dsh-pet/src/client/pet-appearance.module.css`
- Modify: `packages/dsh-pet/src/client/PetSettingsCard.tsx`
- Modify: `packages/dsh-pet/src/client/index.ts`
- Modify: `packages/dsh-pet/src/client/locales.ts`

**Interfaces:**

- Renders official and custom cards side-by-side, stacking at the existing narrow settings breakpoint.
- Card selection is local until “Use selected pet”; import/delete are immediate management actions and do not enter the existing SettingsScope draft.
- Reuses one controller instance owned by `client/index.ts` so opening/closing settings cannot stop the active custom pet.

- [ ] **Step 1: Write failing UI workflow tests**

Cover loading, official active, empty custom, current custom, candidate “pending apply”, card keyboard selection, disabled apply without an asset, both file selectors, local validation failure, successful import then candidate re-fetch validation, apply without refresh, delete confirmation, active delete fallback, Chinese/English prompt copy, temporary “Copied” state, clipboard failure, and reduced-motion first-frame preview.

Assert accessible names rather than CSS hashes. Stub the host API, file decoder, clipboard, confirmation, timers, and image loader.

- [ ] **Step 2: Run the component test and verify RED**

Run:

```text
pnpm --filter @neystan/dsh-pet exec vitest run src/client/PetAppearanceField.test.tsx
```

Expected: FAIL because the appearance field does not exist.

- [ ] **Step 3: Implement one small appearance controller**

Keep transport and state out of the JSX. Implement this controller surface in `client/index.ts` and pass it into `PetAppearanceField`:

```ts
export interface PetAppearanceController {
  getSnapshot(): PetAppearanceView | undefined
  subscribe(listener: () => void): () => void
  refresh(): Promise<void>
  importFiles(manifest: File, spritesheet: File): Promise<void>
  useOfficial(): Promise<void>
  useCustom(): Promise<void>
  deleteCustom(): Promise<void>
}
```

Each mutating request sends the current `stateToken`. On 409, refresh and show the localized stale-state message. After import, fetch the candidate URLs with revision cache busting and run browser decode validation again before marking it applicable.

- [ ] **Step 4: Implement previews and the two-card field**

`PetSpritePreview` uses only the `idle` row and the existing sprite timing helpers. It releases timers/images on descriptor changes and holds frame zero under `prefers-reduced-motion`.

The field contains only:

- Two selectable cards with preview, display name, one-line description, and textual active/pending status.
- `Use selected pet` below the cards.
- Exact file inputs, `Validate and import`, `Copy generation prompt`, and conditional `Delete custom pet` inside the custom card.
- Inline status/error copy; no modal except the native short delete confirmation.

Do not add tabs, advanced options, history, drag-and-drop, progress bars, decorative icons, or the full prompt text.

- [ ] **Step 5: Match the current settings-card visual system**

Use only `--dsw-alias-*` and `--dsw-specific-*` colors already used by the plugin. Reuse current 12–15px type scale, button height, borders, gaps, focus-visible outline, and disabled treatment. Use 12px for the appearance outer group, 10px for each pet card, and the package's existing narrow breakpoint to stack cards.

- [ ] **Step 6: Mount above existing fields without changing their save behavior**

Insert “Pet appearance” before the six current settings fields. Pass the controller independently of the CardForm draft. Preserve the existing enabled, visible, size, right, bottom, and name wiring and generated shared components unchanged.

Add bilingual labels and one localized string per stable error code. Never interpolate host error details or filesystem paths.

- [ ] **Step 7: Run UI and package tests**

Run:

```text
pnpm --filter @neystan/dsh-pet exec vitest run src/client/PetAppearanceField.test.tsx src/client/WhalePet.test.tsx
pnpm --filter @neystan/dsh-pet test
pnpm --filter @neystan/dsh-pet typecheck
```

Expected: PASS. The package-wide test run must keep all existing persistence, economy, service, state, and pet-interaction tests green.

- [ ] **Step 8: Commit the UI**

```text
git add packages/dsh-pet/src/client/PetSpritePreview.tsx packages/dsh-pet/src/client/PetAppearanceField.tsx packages/dsh-pet/src/client/PetAppearanceField.test.tsx packages/dsh-pet/src/client/pet-appearance.module.css packages/dsh-pet/src/client/PetSettingsCard.tsx packages/dsh-pet/src/client/index.ts packages/dsh-pet/src/client/locales.ts
git commit -m "feat(pet): add custom pet appearance controls"
```

### Task 8: Documentation, Build, and End-to-End Verification

**Files:**

- Modify: `packages/dsh-pet/README.md`
- Modify: `packages/dsh-pet/README.zh.md`
- Modify: `packages/dsh-pet/README.i18n.yaml`
- Modify: `packages/dsh-pet/package.json`

**Interfaces:**

- Documents the exact two-file contract, Agent workflow, relative template path, shared progression, local storage, switching, deleting, fallback, and MVP limitations in paired languages.
- Produces ignored local build artifacts that contain the same host/client behavior as source; the commit contains source and documentation only.

- [ ] **Step 1: Update the paired documentation and metadata**

Add one compact custom-pet section in both README files. Include the exact manifest schema, dimensions, action order, frame counts, two-file import steps, candidate/apply distinction, storage location expressed as `$DSH_HOME/pet/custom`, and the one-click prompt workflow. State that the user gives the Agent one clear full-body reference image and the Agent returns only `pet.json` and `spritesheet.webp`.

Use only `packages/dsh-pet/assets/whale` as the template path. Do not publish a machine-specific path. Update `package.json` description to mention one custom pet import without claiming unsupported generation or format conversion.

- [ ] **Step 2: Record the README pair**

Run:

```text
node scripts/verify-docs.mjs --write packages/dsh-pet
```

Expected: `packages/dsh-pet/README.i18n.yaml` is updated for the synchronized English and Chinese documents.

- [ ] **Step 3: Run all package gates and build distributables**

Run:

```text
pnpm --filter @neystan/dsh-pet test
pnpm --filter @neystan/dsh-pet typecheck
pnpm --filter @neystan/dsh-pet build
git diff --check
```

Expected: all commands exit 0; built host/client bundles include management routes, the dynamic descriptor, and the appearance UI.

- [ ] **Step 4: Run repository documentation checks without rewriting unrelated packages**

Run:

```text
pnpm docs:check
```

Expected for the current baseline: the command may remain nonzero only for pre-existing README pairing drift outside the completed `dsh-pet` pair. Record the exact unrelated package names and verify that `packages/dsh-pet` is absent from the failure list. Do not modify unrelated README files to make this task green.

- [ ] **Step 5: Perform real Web GUI acceptance**

Use the local DSH page and the bundled whale pair as a legal custom import. Verify in order:

1. Official and custom cards match the current settings visual style.
2. Copying the Chinese and English prompts includes the relative template path and no absolute path.
3. Import shows a candidate idle preview and does not switch the active pet.
4. Applying custom switches animation immediately without page refresh and preserves name, affinity, treats, size, and position.
5. Refreshing the page and restarting DSH restores the custom selection.
6. Switching official retains the custom current pair and also needs no refresh.
7. Deleting active custom confirms, switches official, removes custom files, and leaves progression intact.
8. Disabling the floating pet still permits import, apply, switch, and delete in settings.
9. A corrupt or missing current pair at startup falls back official and does not block Web GUI boot.

- [ ] **Step 6: Commit documentation and generated output**

```text
git add packages/dsh-pet/README.md packages/dsh-pet/README.zh.md packages/dsh-pet/README.i18n.yaml packages/dsh-pet/package.json
git commit -m "docs(pet): document custom pet import"
```

## Final Scope Audit

- [ ] Confirm there is exactly one custom slot and no registry, history, ZIP, online generation, extra animation controls, or per-pet progression.
- [ ] Confirm all runtime paths are fixed by the host and no uploaded manifest path is used for file access.
- [ ] Confirm every write path has a conflict test and rollback or safe fallback test.
- [ ] Confirm all new UI strings exist in both locales and all new colors use semantic tokens.
- [ ] Confirm the source, README files, package metadata, and generated bundles contain no absolute workstation path.
- [ ] Run `rg -n "TO[D]O|T[B]D|FIX[M]E|[A-Za-z]:[/\\\\]" packages/dsh-pet docs/superpowers/plans/2026-08-16-dsh-pet-custom-pet.md` and inspect every match; expected: no new placeholder or machine-specific path.
- [ ] Run `git status --short` and stage only `packages/dsh-pet` deliverables; leave `.superpowers/` and unrelated user changes untouched.
