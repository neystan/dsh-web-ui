# DSH rc.7 Settings Slot Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Upgrade the local @neystan Web UI plugins from the rc.6 list-based settings slot to the rc.7 keyed `settings.plugin.item` contract.

**Architecture:** The official rc.7 settings-plugins package owns the keyed `settings.plugin.item` slot. Each local settings card registers directly under its settings namespace (`task-board`, `pet`, `describe-image`, or `skin-background`), while the obsolete custom `web-ui.plugin.item` grouping package is removed from the aggregate composition. The existing settings scopes and card components remain unchanged.

**Tech Stack:** TypeScript, React slot registrations, pnpm workspace builds, Vitest, DSH rc.7.

**Spec:** Runtime error: `keyed slot "settings.plugin.item" requires options.key` from `@neystan/dsh-client-ui-web-ui-settings` under DSH rc.7.

## Global Constraints

- Keep Node 24 and npm 11.17.0 for runtime verification.
- Keep existing settings card UI and settings namespaces.
- Do not downgrade DSH or reintroduce the rc.6 list registration.
- Use `key` equal to the Host settings namespace; do not use a synthetic key.

---

### Task 1: Lock the keyed-slot contract with a failing test

**Files:**
- Create: `packages/dsh-web-ui-settings/tests/rc7-slot-contract.spec.ts`

- [ ] **Step 1: Write the failing test**

Add a minimal SlotCore reproduction proving that an rc.7 keyed slot rejects the old `id` option and accepts a namespace `key`:

```ts
import { describe, expect, it } from 'vitest'
import { SlotCore } from '@deepseek-ai/dsh-client-ui-slots'

describe('rc.7 settings slot contract', () => {
  it('requires a namespace key for settings cards', () => {
    const slots = new SlotCore()
    slots.register({
      name: 'root',
      children: { 'settings.plugin.item': { kind: 'keyed', scope: 'root' } },
    }, () => null)
    expect(() => slots.register({ name: 'settings.plugin.item', id: 'legacy' }, () => null)).toThrow(
      'keyed slot "settings.plugin.item" requires options.key',
    )
    expect(() => slots.register({ name: 'settings.plugin.item', key: 'task-board' }, () => null)).not.toThrow()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails for the current type contract**

Run from `X:\download\dsh-web-ui`:

```powershell
pnpm --filter @neystan/dsh-client-ui-web-ui-settings test -- rc7-slot-contract.spec.ts
```

Expected: the test setup fails because the workspace's rc.6 slot declarations do not expose the rc.7 keyed settings slot.

### Task 2: Migrate settings-card registrations

**Files:**
- Modify: `packages/dsh-task-board/src/client/index.ts`
- Modify: `packages/dsh-pet/src/client/index.ts`
- Modify: `packages/dsh-tool-describe-image/src/client/index.ts`
- Modify: `packages/skins/skin-center/src/client/index.ts`

- [ ] **Step 1: Declare the rc.7 keyed slot locally**

In each client module augmentation, declare `settings.plugin.item` as `{ kind: 'keyed'; scope: 'root'; owner: SettingsPluginItemOwnerProps }` and remove the obsolete `web-ui.plugin.item` declaration.

- [ ] **Step 2: Register cards directly by settings namespace**

Replace the old `web-ui.plugin.item` registration with `settings.plugin.item` registration and use these keys:

```ts
task-board       -> key: 'task-board'
pet              -> key: 'pet'
describe-image   -> key: 'describe-image'
skin center      -> key: 'skin-background'
```

Keep each card's existing `locale` and `inject` face; remove list-only `id` and `order` fields.

- [ ] **Step 3: Run focused package typechecks/builds**

Run:

```powershell
pnpm --filter @neystan/dsh-client-ui-task-board typecheck
pnpm --filter @neystan/dsh-pet typecheck
pnpm --filter @neystan/dsh-tool-describe-image typecheck
pnpm --filter @neystan/dsh-client-ui-skin-center typecheck
```

Expected: all four pass and generated client bundles contain `key` registrations.

### Task 3: Remove the obsolete rc.6 grouping plugin from composition

**Files:**
- Modify: `packages/dsh-web-ui-all/aggregate.yml`
- Regenerate: `packages/dsh-web-ui-all/cordis.patch.yml`
- Modify: `packages/dsh-web-ui-all/package.json`

- [ ] **Step 1: Remove the old package from aggregate inputs**

Delete `../dsh-web-ui-settings` from `patchFrom`, `deps`, and its ordering comments. Keep the family plugin dependencies and skin-center patch.

- [ ] **Step 2: Regenerate aggregate output**

Run:

```powershell
node scripts/aggregate.mjs
```

Expected: `cordis.patch.yml` no longer inserts `ui-web-ui-settings`, and package dependencies no longer include `@neystan/dsh-client-ui-web-ui-settings`.

### Task 4: Verify the migration end-to-end

**Files:**
- Modify: generated `lib` outputs only through package build scripts.

- [ ] **Step 1: Build the linked workspace packages**

Run:

```powershell
pnpm --filter @neystan/dsh-web-ui-all build
```

- [ ] **Step 2: Run package tests**

Run:

```powershell
pnpm --filter @neystan/dsh-web-ui-settings test
pnpm --filter @neystan/dsh-client-ui-task-board test
pnpm --filter @neystan/dsh-pet test
pnpm --filter @neystan/dsh-tool-describe-image test
pnpm --filter @neystan/dsh-client-ui-skin-center test
```

- [ ] **Step 3: Start the exact user command and inspect the page**

Stop any existing DSH listener on port 3080, then run with Node 24/npm 11:

```powershell
npx --verbose @deepseek-ai/dsh web
```

Expected: no `options.key` loader error, the process prints `dsh web: http://127.0.0.1:3080`, and `Invoke-WebRequest http://127.0.0.1:3080/` returns HTTP 200.
