# Skin Center (in-GUI embedded skin center)

English | [中文](README.zh.md)

`@neystan/dsh-client-ui-skin-center` (cordis plugin id `ui-skin-center`) embeds the skin list / try-on / apply into the plugin configuration page of the real dsh Web GUI, as a card in the "Web UI plugins" group (settings → plugin config → Web UI plugins → 皮肤中心 / Skin Center), sharing the same slot (`web-ui.plugin.item`) as the family plugins such as task-board / pet / live-stats, without taking a top-level settings nav item.

- List: shows the separate stock "官方默认" (official default) entry plus 11 themes: 10 bundled skins and one custom theme. Every theme uses the same card, Try on / Apply controls, active marker, tagline, and accent swatch; the custom card adds Edit.
- Try-on: clicking "Try on" loads a bundled skin's client bundle on demand — the host route `/api/skin-center/bundle/<id>` serves `lib/client.js` as a same-origin script (the same mechanism the core uses to load plugins), the factory registers with the page's own `window.__ModuleLoader__`, and `window.__DSH_MODULES__.import` materializes it (a real loader, not a simulator and no eval). Official and custom themes use the same surface lifecycle without loading a user bundle. The look changes immediately without refreshing; "Exit try-on" restores the previous styles, DOM, favicon, title, body inline styles, custom tokens, and background.
- Mutual exclusion: during try-on, the active skin's visual writes (body attribute, background inline styles, chrome child nodes, xp's footer taskbar) are temporarily withdrawn per the prescription, and restored verbatim on exit; only one skin is on the page at a time.
- Apply: the host half (`src/index.ts` + `src/routes.ts`) exposes `/api/skin-center/apply` and `/api/skin-center/bundle/<id>` (serves skin bundles on demand); clicking "Apply / 恢复默认" (Apply / Restore default) runs the embedded in-process `dsh-skin use` port (`src/skin-switch.ts`) server-side, writes `<harness-home>/cordis.patch.yml`, and the DSH config watcher hot-loads it within seconds and the page auto-refreshes — **no dsh web restart, no copying a command, no `dsh-skin` binary on PATH**. On failure the error message includes a terminal fallback command. Harness home follows the dsh launcher: an injected HOME maps to `<home>/.dsh`, else a trimmed non-empty `$DSH_HOME` is used directly, else `~/.dsh`. The target profile resolves as: explicit option, then `$DSH_SKIN_PROFILE`, then `$DSH_PROFILE`, then `process.cwd()` when it is a directory directly under `<harness-home>/profiles/<name>`, then `web`. Windows compatibility: the same resolution rules apply with no `$HOME` or fixed paths, and profile links fall back to directory junctions when symlink privileges are missing.
- Custom theme: the eleventh theme has an independent persisted identity and a compact light/dark editor with exactly accent, background, foreground, and contrast controls. Valid colors preview live; low contrast warns without blocking save. Restore default parameters writes fixed official-like light/dark presets while keeping custom active. Applying any target follows the same host state and manifest confirmation flow and refreshes once; custom safely uses the official boot graph plus its semantic-token settings. The existing controlled semantic surfaces always use the same translucent palette. The body keeps an opaque theme-colored canvas, so an image shows through when present and a stable solid hierarchy remains when absent.
- Global background: choose Follow skin, Custom, or None for the official look and every bundled skin. Source JPEG/PNG/WebP files are limited to 10 MiB, 16384 px per edge, and 40 million pixels; the browser decodes them locally, scales them to a 2560 px maximum edge, strips metadata into WebP, and caps the result at 6 MiB before the Host stores `<harness-home>/skin-center/assets/<sha256>.webp`. One occlusion slider is shared by skin art and the custom image.

## Install (official plugin bundle)

Install the family skin aggregate package `@neystan/dsh-skins` first (all skins plus the skin center in one); for this package alone use the `link:` commands below.

```sh
# All skins (recommended)
dsh plugin --profile web add @neystan/dsh-skins
# Or just the skin center
dsh plugin --profile web add @neystan/dsh-client-ui-skin-center
# From the repo (dev): dsh plugin --profile web add link:$(pwd)/packages/skins/skin-center
```

`$(pwd)` is your clone of the dsh-web-ui monorepo.

skin-center is a self-contained bundle meeting the official DSH plugin standard (`dsh.bundle.patch` points to `cordis.patch.yml`; `prepare` uses a dedicated tsdown config for a self-contained build with no project references or type checking); it can also be installed via git: `dsh plugin --profile web add github:<org>/dsh-web-ui#<sha>` (the `prepare` script builds `lib/` in place).

A local `link:` install needs built artifacts first — `lib/` is git-ignored and not committed, so run `pnpm install && pnpm -r build` in the monorepo before linking.

pnpm ≥10 requires authorizing `allowBuilds` before installing a git dependency (the `prepare` script builds in place); a local `link:` install has no such requirement.

The skin plugins (qq98 / ths / xp / blue-fantasy) must resolve in the host for skin-center to list / try on the full set; skin-center itself has no mutual-exclusion requirement.

## Directory structure

```
skins/skin-center/
  package.json / tsdown.config.ts / tsconfig.json   # metadata for building within the checkout
  src/index.ts                                       # host side: registers /api/skin-center/* routes
  src/routes.ts                                      # host routes (proxy to the dsh-skin CLI)
  src/background-store.ts                            # bounded WebP validation + content-addressed assets
  src/core/theme.ts / background.ts                  # pure derivation, validation, and migration
  src/invariant.ts                                   # invariant companion plugin (no assertions)
  src/client/index.ts                                # apply: registers the Web UI plugin-group card + body scope
  src/client/SkinCenter.tsx                          # card component (official + 11 themes/try-on/one-click apply)
  src/client/CustomThemeEditor.tsx                   # custom theme's three colors + contrast
  src/client/BackgroundEditor.tsx                    # global three-mode image control
  src/client/custom-theme.ts / background.ts         # inline theme and background controllers
  src/client/try-on.ts                               # try-on engine (real loader + mutual-exclusion restore, incl. official try-on)
  src/client/locales.ts                              # en/zh copy
  src/client/skin-center.module.css                  # panel styles (--dsw-* tokens, adapting to the skin)
  src/client/generated/skins.ts                      # generated: skin registry (metadata only, do not hand-edit)
```

## Mechanism notes

- Skin enumeration: `generated/skins.ts` is produced by `scripts/skin-center-bundles` (reads `skins/<name>/skin.json`, validates that `lib/client.js` exists). **It contains metadata only, no embedded bundle text**: cold start does not parse the ~700KB base64 art assets, and the generated file is reproducible across machines (no build-machine absolute paths).
- Try-on loading: the host route `/api/skin-center/bundle/<id>` serves `lib/client.js` on demand (same-origin script, loaded via a `<script>` tag — the same mechanism as the core's `defaultLoadBundle`); the bundle body calls `window.__ModuleLoader__.load` to only register a factory; `window.__DSH_MODULES__.import(package)` materializes the module (CSS `<style data-plugin>` auto-injected); `surface.apply(miniCtx)` mounts with a miniCtx that only implements `effect(cb)` (the skin's only dependency). It does not rely on eval, so no CSP `unsafe-eval` pass is required — only same-origin script loading (as the page itself does when loading its plugin bundles).
- Failure semantics: when the bundle route 404s (skin not installed / `lib/client.js` not built) or the network fails, the script's error event fires, try-on reports a generic error and fully restores the active skin; no half skin is left between loading and restoring (the tryOn catch branch handles recovery).
- Exit restore: first run the skin's disposer (withdraws attribute/chrome/favicon/title/background entirely), then `invalidate(package)` + remove the style tag, then restore the active skin's visual snapshot verbatim. Official-default try-on = the same withdrawal prescription but without mounting any skin; exit restores identically.
- Active-theme detection: `window.__DSH_BOOT__.entries` only contains enabled bundled skins and is compared against registry packages. A bundled match wins; otherwise `skin-custom-theme.active` selects custom, and false selects official default.
- Appearance persistence: `skin-custom-theme` stores its independent active flag and optional light/dark palettes; `skin-background` stores the global background mode, occlusion, and image revision. Custom theme writes are limited to a fixed semantic-token allowlist. Background files use only `POST /api/skin-center/background` and `GET`/`DELETE /api/skin-center/background/<revision>.webp`, with same-origin and loopback fences on writes.
- One-click apply: host `/api/skin-center/apply` runs the embedded port of `dsh-skin use <name>` / `use official` (the port is the sole authority for the managed section and the symlink). Paths are `<harness-home>/cordis.patch.yml` and `<harness-home>/profiles/<profile>/node_modules` with the home/profile resolution described above. When the active skin is itself installed as a bundle — listed in the profile manifest's `dsh.profile.bundles` or `dependencies` (the two channels the loader reconciles), or a registry `bundleWired` skin — the home layer writes only the mutual-exclusion `disabled: true` rows and leaves the insert to the bundle patch; anything else, including the skin-center's own resolvability symlinks, keeps the home insert row. The structural dir-probe fallback applies only when the profile manifest is missing/unreadable. The DSH daemon surface ships its own config watcher (`watchUserPatches` + config-only HMR); after the patch is written it hot-loads in seconds without a restart; a browser refresh picks up the new boot graph (client plugin-graph row changes are not within `dsh-client-hmr` semantics).

## Build (in-repo tsdown, no DSH checkout)

Like the skins, the skin center builds with the in-repo shared tsdown preset (`shared/tsdown.client.ts` handles CSS-Module injection and platform externalization; types come from the official NPM SDK devDependencies):

```sh
# 1. Regenerate the registry (re-run after skin metadata changes; bundle text rides the host route on demand, no regen needed)
node scripts/skin-center-bundles
#    A skin bundle change itself only needs that skin rebuilt (tsdown); the GUI picks up the new text on the next try-on

# 2. Build in the repo
cd ~/code/dsh-web-ui && export NPM_TOKEN='<token>'   # if private-scope auth is still required
pnpm --filter @neystan/dsh-client-ui-skin-center run bundle
```

## Install (personal environment wiring, not committed to the checkout)

```sh
# 1. profile symlink (same as qq98/blue-fantasy)
ln -sfn ~/code/dsh-web-ui/packages/skins/skin-center \
  ~/.dsh/profiles/node_modules/@neystan/dsh-client-ui-skin-center

# 2. add to ~/.dsh/cordis.patch.yml (outside the dsh-skin managed section, do not touch that section):
#   - insert:
#       - id: ui-skin-center
#         name: '@neystan/dsh-client-ui-skin-center'

# 3. the config watcher hot-loads in seconds; refresh the page to see the skin-center card in 插件配置 → Web UI 插件
```

## Try-on mutual-exclusion restore prescription (try-on.ts)

| Skin | body attribute | extra handling |
| --- | --- | --- |
| All | withdraw `bodyAttr` (CSS deactivated) | snapshot/clear the body background inline style (blue-fantasy whale background); remove chrome among the body's direct child nodes that are not `#root` (measured: only skin chrome); neutralize observers to prevent ghost write-backs |
| xp | same | additionally inject neutralizer CSS to hide the sidebar footer's taskbar/start button (its rules are not scoped by attribute) |

Exit try-on = try-on skin disposer (real code path) → module invalidate + style cleanup → restore the active skin snapshot verbatim.

## Acceptance checklist (top-level README contract)

- [x] The skin-center card appears in 插件配置 → Web UI 插件 without console errors
- [x] The list contains the separate official default plus 11 themes; custom uses the same card and the current target is marked
- [x] Try-on really takes effect without refreshing (chrome/background/title/favicon/custom tokens); light/dark correct; official and custom can be tried on
- [x] Exit fully restores; mutual exclusion (no two title bars)
- [x] One-click apply: the host API runs `dsh-skin use`, the watcher hot-loads, the page auto-refreshes (no restart); failure carries a command fallback
- [x] Regression: the dsh-skin CLI (incl. `use official`), the web gallery, and the official GUI are unaffected
- [x] On-demand loading: cold start does not parse the ~700KB embedded base64 (`generated/skins.ts` is only ~5KB of metadata); try-on fetches the bundle on demand; no eval (CSP needs no `unsafe-eval`)
- [x] The custom theme's independent active state and light/dark colors persist, restore cleanly across try-on, and expose only three colors plus contrast
- [x] Follow skin / Custom / None backgrounds work across all skins; upload, replace, delete, missing-file fallback, and occlusion persist
- [x] e2e screenshots live in `docs/e2e/skin-center/`
