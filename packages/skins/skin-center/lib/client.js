window.__ModuleLoader__.load({
	id: "@neystan/dsh-client-ui-skin-center",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		let react_jsx_runtime = require("react/jsx-runtime");
		//#region src/core/theme.ts
		const CUSTOM_THEME_NS = "skin-custom-theme";
		const OFFICIAL_THEME_ID = "official";
		const CUSTOM_THEME_ID = "custom";
		/** Fixed, safe starting points that closely follow the official DSH surfaces. */
		const OFFICIAL_THEME_PRESETS = {
			light: {
				accent: "#339CFF",
				background: "#FFFFFF",
				foreground: "#181818",
				contrast: 60
			},
			dark: {
				accent: "#339CFF",
				background: "#181818",
				foreground: "#FFFFFF",
				contrast: 73
			}
		};
		/** The only CSS custom properties the custom-theme controller may write. */
		const THEME_TOKEN_ALLOWLIST = [
			"--dsw-alias-bg-base",
			"--dsw-alias-bg-layer-1",
			"--dsw-alias-bg-layer-2",
			"--dsw-alias-bg-layer-3",
			"--dsw-alias-bg-overlay",
			"--dsw-alias-bg-skeleton",
			"--dsw-alias-border-l1",
			"--dsw-alias-border-l2",
			"--dsw-alias-border-l3",
			"--dsw-alias-border-l4",
			"--dsw-alias-brand-primary",
			"--dsw-alias-brand-primary-invert",
			"--dsw-alias-brand-text",
			"--dsw-alias-button-contrast-fill",
			"--dsw-alias-button-ghost-active-fill",
			"--dsw-alias-button-ghost-active-hover",
			"--dsw-alias-button-primary-dimmed",
			"--dsw-alias-button-primary-fill",
			"--dsw-alias-button-primary-hover",
			"--dsw-alias-button-tool-bar-fill",
			"--dsw-alias-interactive-bg-active",
			"--dsw-alias-interactive-bg-hover",
			"--dsw-alias-interactive-bg-hover-accent",
			"--dsw-alias-interactive-bg-hover-danger",
			"--dsw-alias-interactive-bg-hover-solid",
			"--dsw-alias-label-caption",
			"--dsw-alias-label-dimmed",
			"--dsw-alias-label-primary",
			"--dsw-alias-label-primary-dimmed",
			"--dsw-alias-label-primary-foreground",
			"--dsw-alias-label-primary-inverted",
			"--dsw-alias-label-secondary",
			"--dsw-alias-label-tertiary",
			"--dsw-alias-markdown-citation",
			"--dsw-alias-markdown-code-block",
			"--dsw-alias-markdown-code-block-banner",
			"--dsw-alias-markdown-inline-code",
			"--dsw-alias-markdown-placeholder",
			"--dsw-alias-markdown-tag",
			"--dsw-alias-toast-bg",
			"--dsw-alias-tooltip-bg",
			"--dsw-specific-bubble",
			"--dsw-specific-bubble-highlight",
			"--dsw-specific-input-major",
			"--dsw-specific-login-input",
			"--dsw-specific-menu",
			"--dsw-specific-selector",
			"--dsw-specific-sidebar-fill",
			"--dsw-specific-sidebar-nav-item-active",
			"--dsw-specific-sidebar-nav-item-active-accent",
			"--dsw-specific-sidebar-nav-item-hover",
			"--dsw-specific-tip"
		];
		const HEX = /^#[0-9a-f]{6}$/i;
		function record(value) {
			return typeof value === "object" && value !== null ? value : void 0;
		}
		function normalizeHex(value) {
			return typeof value === "string" && HEX.test(value) ? value.toUpperCase() : void 0;
		}
		/** Normalize untrusted settings/UI data into one strict palette. */
		function normalizePalette(value) {
			const input = record(value);
			if (input === void 0) return void 0;
			const accent = normalizeHex(input.accent);
			const background = normalizeHex(input.background);
			const foreground = normalizeHex(input.foreground);
			const contrast = input.contrast;
			if (accent === void 0 || background === void 0 || foreground === void 0) return void 0;
			if (typeof contrast !== "number" || !Number.isInteger(contrast) || contrast < 0 || contrast > 100) return void 0;
			return {
				accent,
				background,
				foreground,
				contrast
			};
		}
		/** Migrate persisted custom-theme settings into the current strict shape. */
		function normalizeCustomThemeSettings(value) {
			const input = record(value);
			if (input === void 0 || input.version !== 1 && input.version !== 2) return {
				version: 2,
				active: false
			};
			const light = normalizePalette(input.light);
			const dark = normalizePalette(input.dark);
			return {
				version: 2,
				active: input.version === 1 ? light !== void 0 || dark !== void 0 : input.active === true,
				...light === void 0 ? {} : { light },
				...dark === void 0 ? {} : { dark }
			};
		}
		/** Resolve the one active card, with an installed skin taking precedence. */
		function resolveActiveThemeId(activeSkinId, customActive) {
			if (activeSkinId !== void 0) return activeSkinId;
			return customActive ? CUSTOM_THEME_ID : OFFICIAL_THEME_ID;
		}
		/** Map a UI theme identity onto the existing host switch target. */
		function themeApplyTarget(themeId) {
			if (themeId === "custom") return {
				hostTarget: OFFICIAL_THEME_ID,
				customActive: true
			};
			if (themeId === "official") return {
				hostTarget: OFFICIAL_THEME_ID,
				customActive: false
			};
			return {
				hostTarget: themeId,
				customActive: false
			};
		}
		function hexToRgb(hex) {
			return [
				Number.parseInt(hex.slice(1, 3), 16),
				Number.parseInt(hex.slice(3, 5), 16),
				Number.parseInt(hex.slice(5, 7), 16)
			];
		}
		function srgbToLinear(channel) {
			const value = channel / 255;
			return value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4;
		}
		function linearToSrgb(channel) {
			const value = channel <= .0031308 ? channel * 12.92 : 1.055 * channel ** (1 / 2.4) - .055;
			return Math.round(Math.min(1, Math.max(0, value)) * 255);
		}
		function toHex(rgb) {
			return `#${rgb.map((channel) => Math.round(channel).toString(16).padStart(2, "0")).join("")}`.toUpperCase();
		}
		function mix(from, to, ratio) {
			const amount = Math.min(1, Math.max(0, ratio));
			const a = hexToRgb(from).map(srgbToLinear);
			const b = hexToRgb(to).map(srgbToLinear);
			return toHex(a.map((channel, index) => linearToSrgb(channel + (b[index] - channel) * amount)));
		}
		function withAlpha(hex, alpha) {
			const [red, green, blue] = hexToRgb(hex);
			return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
		}
		function luminance(hex) {
			const [red, green, blue] = hexToRgb(hex).map(srgbToLinear);
			return .2126 * red + .7152 * green + .0722 * blue;
		}
		/** WCAG contrast ratio for two opaque `#RRGGBB` colors. */
		function contrastRatio(foreground, background) {
			const a = normalizeHex(foreground);
			const b = normalizeHex(background);
			if (a === void 0 || b === void 0) return 1;
			const lighter = Math.max(luminance(a), luminance(b));
			const darker = Math.min(luminance(a), luminance(b));
			return (lighter + .05) / (darker + .05);
		}
		/** Derive the stable DSW semantic token layer from four compact controls. */
		function deriveThemeTokens(palette) {
			const { accent, background, foreground } = palette;
			const c = palette.contrast / 100;
			const s = .06 + .18 * c;
			const layer1 = mix(background, foreground, .25 * s);
			const layer2 = mix(background, foreground, .5 * s);
			const layer3 = mix(background, foreground, .75 * s);
			const overlay = mix(background, foreground, 1.8 * s);
			const secondary = mix(foreground, background, .38 - .16 * c);
			const tertiary = mix(foreground, background, .55 - .2 * c);
			const accentHover = mix(accent, foreground, .14);
			const accentDimmed = mix(background, accent, .12 + .08 * c);
			const onAccent = contrastRatio("#000000", accent) >= contrastRatio("#FFFFFF", accent) ? "#000000" : "#FFFFFF";
			const feedback = mix(background, foreground, .82);
			const baseSurface = withAlpha(background, .5);
			const surface1 = withAlpha(layer1, .68);
			const surface2 = withAlpha(layer2, .76);
			const surface3 = withAlpha(layer3, .84);
			const overlaySurface = withAlpha(overlay, .94);
			const skeletonSurface = withAlpha(foreground, .08);
			const sidebarSurface = withAlpha(layer1, .58);
			return {
				"--dsw-alias-bg-base": baseSurface,
				"--dsw-alias-bg-layer-1": surface1,
				"--dsw-alias-bg-layer-2": surface2,
				"--dsw-alias-bg-layer-3": surface3,
				"--dsw-alias-bg-overlay": overlaySurface,
				"--dsw-alias-bg-skeleton": skeletonSurface,
				"--dsw-alias-border-l1": mix(background, foreground, .6 * s),
				"--dsw-alias-border-l2": mix(background, foreground, .9 * s),
				"--dsw-alias-border-l3": mix(background, foreground, 1.2 * s),
				"--dsw-alias-border-l4": mix(background, foreground, 1.5 * s),
				"--dsw-alias-brand-primary": accent,
				"--dsw-alias-brand-primary-invert": onAccent,
				"--dsw-alias-brand-text": accent,
				"--dsw-alias-button-contrast-fill": foreground,
				"--dsw-alias-button-ghost-active-fill": surface2,
				"--dsw-alias-button-ghost-active-hover": surface3,
				"--dsw-alias-button-primary-dimmed": accentDimmed,
				"--dsw-alias-button-primary-fill": accent,
				"--dsw-alias-button-primary-hover": accentHover,
				"--dsw-alias-button-tool-bar-fill": surface2,
				"--dsw-alias-interactive-bg-active": surface2,
				"--dsw-alias-interactive-bg-hover": surface1,
				"--dsw-alias-interactive-bg-hover-accent": accentDimmed,
				"--dsw-alias-interactive-bg-hover-danger": surface2,
				"--dsw-alias-interactive-bg-hover-solid": surface3,
				"--dsw-alias-label-caption": tertiary,
				"--dsw-alias-label-dimmed": tertiary,
				"--dsw-alias-label-primary": foreground,
				"--dsw-alias-label-primary-dimmed": secondary,
				"--dsw-alias-label-primary-foreground": onAccent,
				"--dsw-alias-label-primary-inverted": background,
				"--dsw-alias-label-secondary": secondary,
				"--dsw-alias-label-tertiary": tertiary,
				"--dsw-alias-markdown-citation": accent,
				"--dsw-alias-markdown-code-block": surface1,
				"--dsw-alias-markdown-code-block-banner": surface2,
				"--dsw-alias-markdown-inline-code": surface1,
				"--dsw-alias-markdown-placeholder": tertiary,
				"--dsw-alias-markdown-tag": accentDimmed,
				"--dsw-alias-toast-bg": feedback,
				"--dsw-alias-tooltip-bg": feedback,
				"--dsw-specific-bubble": surface1,
				"--dsw-specific-bubble-highlight": accentDimmed,
				"--dsw-specific-input-major": surface1,
				"--dsw-specific-login-input": surface1,
				"--dsw-specific-menu": overlaySurface,
				"--dsw-specific-selector": surface2,
				"--dsw-specific-sidebar-fill": sidebarSurface,
				"--dsw-specific-sidebar-nav-item-active": surface2,
				"--dsw-specific-sidebar-nav-item-active-accent": accentDimmed,
				"--dsw-specific-sidebar-nav-item-hover": surface2,
				"--dsw-specific-tip": surface1
			};
		}
		//#endregion
		//#region src/client/generated/skins.ts
		/** Every skin, ordered by packages/skins/<name>/skin.json `order`. */
		const SKIN_CENTER_ENTRIES = [
			{
				"id": "blue-fantasy",
				"name": "蓝色幻想",
				"nameEn": "Blue Fantasy",
				"author": "powerdog996（DreamSkin 社区）· dsh-web-ui 适配",
				"tagline": "鲸鱼插画背景 · periwinkle 靛蓝调色板 · 半透明面板",
				"description": "DreamSkin「DeepSeek-鲸鱼娘」Codex 桌面主题的 dsh 适配：鲸鱼插画背景垫在半透明面板之下，遮罩随亮/暗主题实时切换，periwinkle 靛蓝色调重映射到全部 dsh token。",
				"tags": [
					"dreamskin",
					"whale",
					"indigo",
					"art",
					"translucent"
				],
				"accent": "#4a5fa8",
				"bodyAttr": "data-dsh-blue-fantasy",
				"package": "@neystan/dsh-client-ui-skin-blue-fantasy",
				"order": 1
			},
			{
				"id": "whale-song",
				"name": "鲸吟",
				"nameEn": "Whale Song",
				"author": "dsh-web-ui",
				"tagline": "深海鲸语女神背景 · 冰蓝海洋调色板 · 金色细线点缀",
				"description": "《鲸吟》— 深海鲸语女神主题：无文字纯氛围背景画（蓝发女神与鲸群居左、冰蓝星座网格与金线点缀、右侧大量留白）垫在半透明面板之下，遮罩随亮/暗主题实时切换，冰蓝/浅青/深海军蓝/钴蓝冷色体系重映射到全部 dsh token，暗色变体为深海夜航调。",
				"tags": [
					"whale",
					"ocean",
					"ice-blue",
					"goddess",
					"art",
					"translucent"
				],
				"accent": "#4d8fd4",
				"bodyAttr": "data-dsh-whale-song",
				"package": "@neystan/dsh-client-ui-skin-whale-song",
				"order": 2
			},
			{
				"id": "harbor",
				"name": "夕港",
				"nameEn": "Harbor",
				"author": "moeblack",
				"tagline": "暮光蓝港 · 日落橙辉 · 半透明夜色面板",
				"description": "《夕港》黄昏港口主题：动漫少女黄昏港口背景（暮光蓝天空渐入日落橙）垫在半透明面板之下，遮罩随亮/暗主题实时切换，深暮蓝 #141a2e 底与日落橙 #ff9d5c 主色重映射到 dsh token，亮色是薄暮纱、暗色是深海夜航纱，同一幅画两种读法。",
				"tags": [
					"harbor",
					"dusk",
					"twilight",
					"sunset",
					"amber",
					"art",
					"translucent"
				],
				"accent": "#ff9d5c",
				"bodyAttr": "data-dsh-harbor",
				"package": "@neystan/dsh-client-ui-skin-harbor",
				"order": 3
			},
			{
				"id": "qq98",
				"name": "QQ2008 怀旧版",
				"nameEn": "QQ2008 Retro",
				"author": "dsh-web-ui",
				"tagline": "水晶蓝桌面 · 玻璃深蓝标题栏 · 戴围巾企鹅",
				"description": "dsh web ui 家族收录的第一个皮肤：QQ2008 水晶蓝年代。深蓝渐变桌面、玻璃质感标题栏、浅蓝状态栏和圆角高光控件，配一只戴围巾的企鹅。",
				"tags": [
					"retro",
					"qq",
					"2008",
					"crystal-blue",
					"nostalgia"
				],
				"accent": "#2b7cd9",
				"bodyAttr": "data-dsh-retro",
				"package": "@neystan/dsh-client-ui-skin-qq98",
				"order": 4
			},
			{
				"id": "ths",
				"name": "同花顺风格",
				"nameEn": "Tonghuashun Trading",
				"author": "dsh-web-ui",
				"tagline": "品牌红标题栏 · 实时行情状态栏 · 灰蓝数据终端",
				"description": "同花顺风格炒股主题：品牌红标题栏带上证指数行情签，状态栏红涨绿跌，自选股风格的侧边栏和交易终端面板，写代码也像盯盘。",
				"tags": [
					"stock",
					"trading",
					"terminal",
					"red"
				],
				"accent": "#e60012",
				"bodyAttr": "data-dsh-ths",
				"package": "@neystan/dsh-client-ui-skin-ths",
				"order": 5
			},
			{
				"id": "xp",
				"name": "Windows XP (Luna)",
				"nameEn": "Windows XP Luna",
				"author": "dsh-web-ui",
				"tagline": "Luna 蓝窗口条 · 绿色开始按钮 · Bliss 蓝天桌面",
				"description": "Windows XP (Luna) 复古主题：蓝色渐变窗口条带窗口按钮、米色状态栏（大写/数字/滚动指示灯）、侧边栏任务栏上的绿色「开始」按钮、资源管理器风格树行和 Bliss 蓝天桌面，全局直角。",
				"tags": [
					"retro",
					"xp",
					"luna",
					"windows",
					"start-button"
				],
				"accent": "#316ac5",
				"bodyAttr": "data-dsh-xp",
				"package": "@neystan/dsh-client-ui-skin-xp",
				"order": 6
			},
			{
				"id": "dragon-heir",
				"name": "龙的传人",
				"nameEn": "Dragon Heir",
				"author": "dsh-web-ui",
				"tagline": "不屈龙魂 · 万里长城双主题 · 朱砂龙印",
				"description": "龙的传人 — 一面是不屈龙魂（墨龙穿云、朱砂印章、不屈锋芒），一面是万里长城（青黛山色、金晖镀墙、苍茫暮色）。亮暗主题各自配一幅画与一枚龙印 favicon，面板半透明磨砂，让画透出来。",
				"tags": [
					"dragon",
					"loong",
					"chinese",
					"ink-wash",
					"great-wall",
					"dual-theme"
				],
				"accent": "#c3272b",
				"bodyAttr": "data-dsh-dragon-heir",
				"package": "@neystan/dsh-client-ui-skin-dragon-heir",
				"order": 7
			},
			{
				"id": "minecraft",
				"name": "Minecraft 方块世界",
				"nameEn": "Minecraft Voxel",
				"author": "dsh-web-ui",
				"tagline": "动态全景天空盒 · 方块按钮 · 告示牌输入框",
				"description": "复刻《我的世界》主界面氛围的方块皮肤：程序化绘制的像素全景天空盒（方块山、像素云、方块树、草方块地面）在身后缓慢旋转，界面浮在石板上；按钮还原 MC 菜单按钮（灰石板、悬停变黄、按下下沉），输入框做成带钉子的木告示牌。",
				"tags": [
					"minecraft",
					"voxel",
					"pixel",
					"game",
					"panorama",
					"skybox"
				],
				"accent": "#7cbd4b",
				"bodyAttr": "data-dsh-minecraft",
				"package": "@neystan/dsh-client-ui-skin-minecraft",
				"order": 8
			},
			{
				"id": "trading",
				"name": "交易终端",
				"nameEn": "Trading Terminal",
				"author": "dsh-web-ui",
				"tagline": "实时行情跑马灯 · 长桥港美股行情 · 红涨绿跌交易终端",
				"description": "结合 dsh-fun-ticker 行情跑马灯与 dsh-longbridge 港美股行情的炒股皮肤：顶栏滚动 A股/港股/美股/指数/加密/外汇报价（装 fun-ticker 后跟随你的自选列表），状态栏展示长桥行情快照与 A股/港股/美股交易时段，写代码也像盯盘。",
				"tags": [
					"stock",
					"trading",
					"ticker",
					"live",
					"terminal",
					"longbridge"
				],
				"accent": "#f23645",
				"bodyAttr": "data-dsh-trading",
				"package": "@neystan/dsh-client-ui-skin-trading",
				"order": 9
			},
			{
				"id": "miku",
				"name": "初音未来 · 电子歌姬",
				"nameEn": "Hatsune Miku",
				"author": "涂山苏苏",
				"tagline": "蓝紫双马尾 · 01 编号 · 音符波形 · 电子歌姬主题",
				"description": "以世界第一的虚拟歌姬初音未来为灵感的主题皮肤：蓝紫洋红渐变贯穿全局，音符与声波曲线点缀在半透明面板之间，标题栏与状态栏带有 01 编号徽标与音乐波形，半透明毛玻璃面板透出背景图——沉浸式电子歌姬氛围。",
				"tags": [
					"miku",
					"vocaloid",
					"blue",
					"music",
					"idol",
					"waveform"
				],
				"accent": "#2e9bff",
				"bodyAttr": "data-dsh-miku",
				"package": "@neystan/dsh-client-ui-skin-miku",
				"order": 10
			}
		];
		//#endregion
		//#region src/client/manifest.ts
		/**
		* Boot-manifest readiness checks for the one-click apply flow.
		*
		* The host half writes the skin patch synchronously, but the web app's boot
		* graph (the `window.__DSH_BOOT__` JSON inside the served HTML) is
		* regenerated asynchronously by the config watcher. A page reloaded right
		* after the patch write can therefore boot into the previous skin. These
		* helpers let the frontend poll the served document until the manifest
		* actually reflects the target before reloading.
		* @module @neystan/dsh-client-ui-skin-center/manifest
		*/
		/** Bundle URL pattern of any skin entry in the boot manifest. */
		const SKIN_BUNDLE_URL = /\/plugins\/@neystan\/dsh-client-ui-skin-(?!center)[a-z0-9-]+\/client\.js/;
		/**
		* Whether a served GUI document's boot manifest enables the given skin.
		* A `null` target means the stock look: no skin bundle URL may be present
		* (the skin-center plugin's own bundle always loads and is excluded).
		* @param documentHtml - the served GUI document (contains the boot JSON).
		* @param target - skin id, or `null` for the stock look.
		* @returns whether the manifest already enables the target.
		*/
		function manifestHasSkin(documentHtml, target) {
			if (target === null) return !SKIN_BUNDLE_URL.test(documentHtml);
			return documentHtml.includes(`/plugins/@neystan/dsh-client-ui-skin-${target}/client.js`);
		}
		//#endregion
		//#region src/client/image-upload.ts
		/** Browser-side background validation, normalization, preview, and upload. */
		const MAX_SOURCE_BYTES = 10 * 1024 * 1024;
		const MAX_SOURCE_EDGE = 16384;
		const MAX_SOURCE_PIXELS = 4e7;
		const MAX_OUTPUT_BYTES = 6 * 1024 * 1024;
		const OUTPUT_EDGE = 2560;
		const QUALITIES = [
			.88,
			.8,
			.72
		];
		const REVISION = /^[a-f0-9]{64}$/;
		function detectedType(bytes) {
			if (bytes.length >= 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return "image/jpeg";
			if (bytes.length >= 8 && [
				137,
				80,
				78,
				71,
				13,
				10,
				26,
				10
			].every((value, index) => bytes[index] === value)) return "image/png";
			if (bytes.length >= 12 && String.fromCharCode(...bytes.subarray(0, 4)) === "RIFF" && String.fromCharCode(...bytes.subarray(8, 12)) === "WEBP") return "image/webp";
		}
		const browserCodec = {
			async decode(file) {
				const bitmap = await createImageBitmap(file);
				return {
					source: bitmap,
					width: bitmap.width,
					height: bitmap.height,
					close: () => bitmap.close()
				};
			},
			async encode(decoded, maxEdge, quality) {
				const scale = Math.min(1, maxEdge / Math.max(decoded.width, decoded.height));
				const width = Math.max(1, Math.round(decoded.width * scale));
				const height = Math.max(1, Math.round(decoded.height * scale));
				const canvas = document.createElement("canvas");
				canvas.width = width;
				canvas.height = height;
				const context = canvas.getContext("2d");
				if (context === null) throw new Error("image-encode-failed");
				context.drawImage(decoded.source, 0, 0, width, height);
				return await new Promise((resolve, reject) => {
					canvas.toBlob((blob) => {
						if (blob === null || blob.type !== "image/webp") reject(/* @__PURE__ */ new Error("image-encode-failed"));
						else resolve(blob);
					}, "image/webp", quality);
				});
			}
		};
		/** Validate, decode, downscale and strip metadata into a bounded WebP blob. */
		async function prepareBackground(file, codec = browserCodec) {
			if (file.size < 1 || file.size > MAX_SOURCE_BYTES) throw new Error("source-image-too-large");
			if (detectedType(new Uint8Array(await file.slice(0, 16).arrayBuffer())) !== file.type) throw new Error("invalid-image-type");
			const decoded = await codec.decode(file);
			try {
				if (decoded.width < 1 || decoded.height < 1 || decoded.width > MAX_SOURCE_EDGE || decoded.height > MAX_SOURCE_EDGE || decoded.width * decoded.height > MAX_SOURCE_PIXELS) throw new Error("source-image-dimensions");
				for (const quality of QUALITIES) {
					const blob = await codec.encode(decoded, OUTPUT_EDGE, quality);
					if (blob.type === "image/webp" && blob.size <= MAX_OUTPUT_BYTES) return {
						blob,
						width: decoded.width,
						height: decoded.height,
						previewUrl: URL.createObjectURL(blob)
					};
				}
				throw new Error("encoded-image-too-large");
			} finally {
				decoded.close();
			}
		}
		/** Upload raw normalized WebP bytes and return the strict content revision. */
		async function uploadBackground(blob, fetcher = fetch) {
			let response;
			try {
				response = await fetcher("/api/skin-center/background", {
					method: "POST",
					headers: { "content-type": "image/webp" },
					body: blob
				});
			} catch {
				throw new Error("upload-failed");
			}
			if (!response.ok) throw new Error("upload-failed");
			let payload;
			try {
				payload = await response.json();
			} catch {
				throw new Error("upload-invalid-response");
			}
			const revision = typeof payload === "object" && payload !== null ? payload.revision : void 0;
			if (typeof revision !== "string" || !REVISION.test(revision)) throw new Error("upload-invalid-response");
			return revision;
		}
		//#endregion
		//#region \0dsh-css:packages/skins/skin-center/src/client/skin-center.module.css.mjs
		const css = "body[data-dsh-skin-center] .eDzMgW_pluginCard{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-3);border-radius:12px;list-style:none;transition:border-color .16s,background .16s}body[data-dsh-skin-center] .eDzMgW_pluginCard:hover{border-color:var(--dsw-alias-label-dimmed)}body[data-dsh-skin-center] .eDzMgW_pluginCardOpen{background:var(--dsw-alias-bg-layer-2);border-color:var(--dsw-alias-label-dimmed)}body[data-dsh-skin-center] .eDzMgW_cardHeader{appearance:none;width:100%;color:inherit;font:inherit;text-align:left;cursor:pointer;background:0 0;border:0;border-radius:12px;align-items:center;gap:12px;padding:14px 16px;display:flex}body[data-dsh-skin-center] .eDzMgW_cardHeader:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:-2px}body[data-dsh-skin-center] .eDzMgW_headText{flex-direction:column;flex:1;gap:4px;min-width:0;display:flex}body[data-dsh-skin-center] .eDzMgW_pluginName{color:var(--dsw-alias-label-primary);align-items:baseline;gap:8px;font-size:15px;font-weight:600;line-height:1.4;display:flex}body[data-dsh-skin-center] .eDzMgW_cardDescription{color:var(--dsw-alias-label-tertiary);font-size:13px;line-height:1.5}body[data-dsh-skin-center] .eDzMgW_chevron,body[data-dsh-skin-center] .eDzMgW_chevronOpen{color:var(--dsw-alias-label-tertiary);flex:none;transition:transform .16s}body[data-dsh-skin-center] .eDzMgW_chevronOpen{transform:rotate(180deg)}body[data-dsh-skin-center] .eDzMgW_cardBody{border-top:1px solid var(--dsw-alias-border-l2);flex-direction:column;gap:12px;margin:0 16px;padding:12px 0 8px;display:flex}body[data-dsh-skin-center] .eDzMgW_head{flex-direction:column;gap:6px;display:flex}body[data-dsh-skin-center] .eDzMgW_titleBadge{color:var(--dsw-alias-label-secondary,#6b7280);font-size:11px;font-weight:500}body[data-dsh-skin-center] .eDzMgW_intro{color:var(--dsw-alias-label-secondary,#6b7280);font-size:12.5px;line-height:1.55}body[data-dsh-skin-center] .eDzMgW_themeButton{border:1px solid var(--dsw-alias-border-l3,#cbd5e1);background:var(--dsw-alias-bg-layer-2,#fff);color:var(--dsw-alias-label-primary,#172a45);cursor:pointer;border-radius:6px;padding:5px 10px;font-size:12px;line-height:1;transition:background .12s,border-color .12s,color .12s}body[data-dsh-skin-center] .eDzMgW_themeButton:hover{border-color:var(--dsw-alias-border-l4,#94a3b8)}body[data-dsh-skin-center] .eDzMgW_themeButton:active{border-color:var(--dsw-alias-brand-primary,#2b7cd9);background:var(--dsw-alias-button-primary-dimmed,#e8f1fc);color:var(--dsw-alias-brand-primary,#1e63b8)}body[data-dsh-skin-center] .eDzMgW_themeButton:focus-visible{outline:2px solid var(--dsw-alias-brand-primary,#2b7cd9);outline-offset:2px}body[data-dsh-skin-center] .eDzMgW_themeButtonActive{border-color:var(--dsw-alias-brand-primary,#2b7cd9);background:var(--dsw-alias-button-primary-dimmed,#e8f1fc);color:var(--dsw-alias-brand-primary,#1e63b8)}body[data-dsh-skin-center] .eDzMgW_list{flex-direction:column;gap:10px;display:flex}body[data-dsh-skin-center] .eDzMgW_card{border:1px solid var(--dsw-alias-border-l1,#e2e8f0);background:var(--dsw-alias-bg-layer-2,#fff);border-radius:10px;flex-direction:column;gap:8px;padding:12px 14px;display:flex}body[data-dsh-skin-center] .eDzMgW_cardHead{align-items:center;gap:10px;min-width:0;display:flex}body[data-dsh-skin-center] .eDzMgW_swatch{width:14px;height:14px;box-shadow:inset 0 0 0 1px var(--dsw-alias-border-l4,#0f172a1f);border-radius:50%;flex:none}body[data-dsh-skin-center] .eDzMgW_cardName{text-overflow:ellipsis;white-space:nowrap;min-width:0;font-size:13.5px;font-weight:600;overflow:hidden}body[data-dsh-skin-center] .eDzMgW_cardTagline{color:var(--dsw-alias-label-secondary,#6b7280);font-size:12px;line-height:1.45}body[data-dsh-skin-center] .eDzMgW_badge{letter-spacing:.02em;border-radius:999px;flex:none;min-width:0;margin-left:auto;padding:2px 8px;font-size:11px;font-weight:600}body[data-dsh-skin-center] .eDzMgW_badgeActive{color:var(--dsw-alias-state-success-primary,#0f6b3a);background:var(--dsw-alias-state-success-tertiary,#dcf3e5)}body[data-dsh-skin-center] .eDzMgW_badgeTrying{color:var(--dsw-alias-brand-primary,#1e63b8);background:var(--dsw-alias-button-primary-dimmed,#e2edfc)}body[data-dsh-skin-center] .eDzMgW_actions{flex-wrap:wrap;align-items:center;gap:8px;display:flex}body[data-dsh-skin-center] .eDzMgW_button{border:1px solid var(--dsw-alias-border-l3,#cbd5e1);background:var(--dsw-alias-bg-layer-2,#fff);color:var(--dsw-alias-label-primary,#172a45);cursor:pointer;border-radius:7px;padding:6px 12px;font-size:12px;line-height:1;transition:background .12s,border-color .12s,color .12s}body[data-dsh-skin-center] .eDzMgW_button:hover:not(:disabled){border-color:var(--dsw-alias-brand-primary,#2b7cd9);color:var(--dsw-alias-brand-primary,#1e63b8)}body[data-dsh-skin-center] .eDzMgW_button:active:not(:disabled){border-color:var(--dsw-alias-button-primary-hover,#1e63b8);background:var(--dsw-alias-button-primary-dimmed,#e8f1fc);color:var(--dsw-alias-brand-primary,#1e63b8)}body[data-dsh-skin-center] .eDzMgW_button:focus-visible{outline:2px solid var(--dsw-alias-brand-primary,#2b7cd9);outline-offset:2px}body[data-dsh-skin-center] .eDzMgW_buttonPrimary{border-color:var(--dsw-alias-brand-primary,#2b7cd9);background:var(--dsw-alias-button-primary-fill,#2b7cd9);color:var(--dsw-alias-label-primary-foreground,#fff)}body[data-dsh-skin-center] .eDzMgW_buttonPrimary:hover:not(:disabled){border-color:var(--dsw-alias-button-primary-hover,#1e63b8);background:var(--dsw-alias-button-primary-hover,#1e63b8);color:var(--dsw-alias-label-primary-foreground,#fff)}body[data-dsh-skin-center] .eDzMgW_buttonPrimary:active:not(:disabled),body[data-dsh-skin-center] .eDzMgW_buttonPrimary:focus-visible:not(:disabled){border-color:var(--dsw-alias-button-primary-hover,#1e63b8);background:var(--dsw-alias-button-primary-hover,#1e63b8)}body[data-dsh-skin-center] .eDzMgW_buttonGhost{background:0 0;border-color:#0000}body[data-dsh-skin-center] .eDzMgW_button:disabled{opacity:.55;cursor:default}body[data-dsh-skin-center] .eDzMgW_error{color:var(--dsw-alias-state-error-primary,#b42318);font-size:12px}body[data-dsh-skin-center] .eDzMgW_backgroundRange{background:var(--dsw-alias-bg-layer-3,#e2e8f0);-webkit-appearance:none;appearance:none;cursor:pointer;border-radius:999px;width:100%;height:4px;margin:0}body[data-dsh-skin-center] .eDzMgW_backgroundRange::-webkit-slider-thumb{-webkit-appearance:none;appearance:none;border:2px solid var(--dsw-alias-label-primary-foreground,#fff);background:var(--dsw-alias-brand-primary,#2b7cd9);width:14px;height:14px;box-shadow:0 0 0 1px var(--dsw-alias-border-l4,#0f172a1f);cursor:pointer;border-radius:50%}body[data-dsh-skin-center] .eDzMgW_backgroundRange::-moz-range-thumb{border:2px solid var(--dsw-alias-label-primary-foreground,#fff);background:var(--dsw-alias-brand-primary,#2b7cd9);width:12px;height:12px;box-shadow:0 0 0 1px var(--dsw-alias-border-l4,#0f172a1f);cursor:pointer;border-radius:50%}body[data-dsh-skin-center] .eDzMgW_backgroundRange:focus-visible{outline:2px solid var(--dsw-alias-brand-primary,#2b7cd9);outline-offset:2px}body[data-dsh-skin-center] .eDzMgW_appearanceSection{border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-2);border-radius:10px;flex-direction:column;gap:10px;padding:12px 14px;display:flex}body[data-dsh-skin-center] .eDzMgW_sectionHeader{justify-content:space-between;align-items:center;gap:10px;display:flex}body[data-dsh-skin-center] .eDzMgW_sectionTitle{color:var(--dsw-alias-label-primary);margin:0;font-size:13px;font-weight:600}body[data-dsh-skin-center] .eDzMgW_segmented,body[data-dsh-skin-center] .eDzMgW_sectionActions{flex-wrap:wrap;align-items:center;gap:6px;display:flex}body[data-dsh-skin-center] .eDzMgW_sectionActions{justify-content:flex-end}body[data-dsh-skin-center] .eDzMgW_settingRow{border-top:1px solid var(--dsw-alias-border-l1);grid-template-columns:minmax(80px,1fr) minmax(160px,210px);align-items:center;gap:12px;min-height:34px;padding-top:8px;display:grid}body[data-dsh-skin-center] .eDzMgW_settingLabel{color:var(--dsw-alias-label-primary);font-size:12.5px;font-weight:500}body[data-dsh-skin-center] .eDzMgW_colorControl{align-items:center;gap:8px;min-width:0;display:flex}body[data-dsh-skin-center] .eDzMgW_colorInput{border:1px solid var(--dsw-alias-border-l3);background:var(--dsw-alias-bg-layer-1);cursor:pointer;border-radius:7px;flex:none;width:34px;height:28px;padding:2px}body[data-dsh-skin-center] .eDzMgW_hexInput{border:1px solid var(--dsw-alias-border-l3);background:var(--dsw-alias-bg-layer-1);width:100%;min-width:0;color:var(--dsw-alias-label-primary);font:inherit;text-transform:uppercase;border-radius:7px;padding:6px 9px;font-size:12px}body[data-dsh-skin-center] .eDzMgW_hexInput:focus-visible,body[data-dsh-skin-center] .eDzMgW_colorInput:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px}body[data-dsh-skin-center] .eDzMgW_hexInput[aria-invalid=true]{border-color:var(--dsw-alias-state-error-primary)}body[data-dsh-skin-center] .eDzMgW_rangeRow{grid-template-columns:minmax(80px,1fr) minmax(120px,1fr) 42px}body[data-dsh-skin-center] .eDzMgW_rangeValue{font-variant-numeric:tabular-nums;text-align:right;color:var(--dsw-alias-label-secondary);font-size:12px}body[data-dsh-skin-center] .eDzMgW_validation{color:var(--dsw-alias-state-warn-primary);font-size:12px;line-height:1.45}body[data-dsh-skin-center] .eDzMgW_imagePreview{border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);border-radius:8px;height:112px;overflow:hidden}body[data-dsh-skin-center] .eDzMgW_imagePreview img{object-fit:cover;width:100%;height:100%;display:block}body[data-dsh-skin-center] .eDzMgW_hiddenInput{clip:rect(0 0 0 0);white-space:nowrap;clip-path:inset(50%);width:1px;height:1px;position:absolute;overflow:hidden}@media (width<=420px){body[data-dsh-skin-center] .eDzMgW_sectionHeader{flex-direction:column;align-items:flex-start}body[data-dsh-skin-center] .eDzMgW_settingRow,body[data-dsh-skin-center] .eDzMgW_rangeRow{grid-template-columns:1fr;gap:7px}body[data-dsh-skin-center] .eDzMgW_rangeValue{text-align:left}body[data-dsh-skin-center] .eDzMgW_sectionActions{justify-content:flex-start}}@media (prefers-reduced-motion:reduce){body[data-dsh-skin-center] .eDzMgW_pluginCard,body[data-dsh-skin-center] .eDzMgW_cardHeader,body[data-dsh-skin-center] .eDzMgW_themeButton,body[data-dsh-skin-center] .eDzMgW_button,body[data-dsh-skin-center] .eDzMgW_chevron,body[data-dsh-skin-center] .eDzMgW_chevronOpen{transition:none}}";
		const tagId = "@neystan/dsh-client-ui-skin-center/skin-center.module.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "@neystan/dsh-client-ui-skin-center";
			tag.dataset.pluginCss = tagId;
			tag.textContent = css;
			document.head.appendChild(tag);
		}
		var skin_center_module_css_default = {
			"actions": "eDzMgW_actions",
			"appearanceSection": "eDzMgW_appearanceSection",
			"backgroundRange": "eDzMgW_backgroundRange",
			"badge": "eDzMgW_badge",
			"badgeActive": "eDzMgW_badgeActive",
			"badgeTrying": "eDzMgW_badgeTrying",
			"button": "eDzMgW_button",
			"buttonGhost": "eDzMgW_buttonGhost",
			"buttonPrimary": "eDzMgW_buttonPrimary",
			"card": "eDzMgW_card",
			"cardBody": "eDzMgW_cardBody",
			"cardDescription": "eDzMgW_cardDescription",
			"cardHead": "eDzMgW_cardHead",
			"cardHeader": "eDzMgW_cardHeader",
			"cardName": "eDzMgW_cardName",
			"cardTagline": "eDzMgW_cardTagline",
			"chevron": "eDzMgW_chevron",
			"chevronOpen": "eDzMgW_chevronOpen",
			"colorControl": "eDzMgW_colorControl",
			"colorInput": "eDzMgW_colorInput",
			"error": "eDzMgW_error",
			"head": "eDzMgW_head",
			"headText": "eDzMgW_headText",
			"hexInput": "eDzMgW_hexInput",
			"hiddenInput": "eDzMgW_hiddenInput",
			"imagePreview": "eDzMgW_imagePreview",
			"intro": "eDzMgW_intro",
			"list": "eDzMgW_list",
			"pluginCard": "eDzMgW_pluginCard",
			"pluginCardOpen": "eDzMgW_pluginCardOpen",
			"pluginName": "eDzMgW_pluginName",
			"rangeRow": "eDzMgW_rangeRow",
			"rangeValue": "eDzMgW_rangeValue",
			"sectionActions": "eDzMgW_sectionActions",
			"sectionHeader": "eDzMgW_sectionHeader",
			"sectionTitle": "eDzMgW_sectionTitle",
			"segmented": "eDzMgW_segmented",
			"settingLabel": "eDzMgW_settingLabel",
			"settingRow": "eDzMgW_settingRow",
			"swatch": "eDzMgW_swatch",
			"themeButton": "eDzMgW_themeButton",
			"themeButtonActive": "eDzMgW_themeButtonActive",
			"titleBadge": "eDzMgW_titleBadge",
			"validation": "eDzMgW_validation"
		};
		//#endregion
		//#region src/client/BackgroundEditor.tsx
		function errorKey(error) {
			const code = error instanceof Error ? error.message : "";
			if (code === "invalid-image-type" || code === "source-image-dimensions") return "imageInvalid";
			if (code === "source-image-too-large" || code === "encoded-image-too-large") return "imageTooLarge";
			if (code === "background-delete-failed") return "backgroundDeleteFailed";
			if (code === "background-settings-write-failed") return "backgroundSaveFailed";
			return "imageUploadFailed";
		}
		function BackgroundEditor({ handle, t }) {
			const snapshot = (0, react.useSyncExternalStore)(handle.subscribe.bind(handle), handle.getSnapshot.bind(handle));
			const input = (0, react.useRef)(null);
			const [prepared, setPrepared] = (0, react.useState)();
			const [busy, setBusy] = (0, react.useState)(false);
			const [error, setError] = (0, react.useState)();
			const { settings } = snapshot;
			(0, react.useEffect)(() => () => {
				if (prepared !== void 0) URL.revokeObjectURL(prepared.previewUrl);
			}, [prepared]);
			const choose = (file) => {
				if (file === void 0) return;
				setBusy(true);
				setError(void 0);
				prepareBackground(file).then((next) => {
					setPrepared(next);
				}).catch((cause) => {
					setError(errorKey(cause));
				}).finally(() => {
					setBusy(false);
				});
			};
			const selectMode = (mode) => {
				setError(void 0);
				if (mode === "custom" && settings.imageRevision === void 0) {
					input.current?.click();
					return;
				}
				handle.setMode(mode).catch(() => {
					setError("backgroundSaveFailed");
				});
			};
			const save = () => {
				if (prepared === void 0 || busy) return;
				setBusy(true);
				setError(void 0);
				uploadBackground(prepared.blob).then((revision) => handle.commitRevision(revision)).then(() => {
					setPrepared(void 0);
				}).catch((cause) => {
					setError(errorKey(cause));
				}).finally(() => {
					setBusy(false);
				});
			};
			const remove = () => {
				if (!window.confirm(t("confirmDelete"))) return;
				setBusy(true);
				setError(void 0);
				handle.deleteRevision().catch((cause) => {
					setError(errorKey(cause));
				}).finally(() => {
					setBusy(false);
				});
			};
			const imageUrl = settings.imageRevision === void 0 ? void 0 : `/api/skin-center/background/${settings.imageRevision}.webp`;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
				className: skin_center_module_css_default.appearanceSection,
				"aria-labelledby": "skin-center-background-title",
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: skin_center_module_css_default.sectionHeader,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", {
							id: "skin-center-background-title",
							className: skin_center_module_css_default.sectionTitle,
							children: t("backgroundTitle")
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: skin_center_module_css_default.segmented,
							"aria-label": t("backgroundTitle"),
							children: [
								"skin",
								"custom",
								"none"
							].map((mode) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: `${skin_center_module_css_default.themeButton} ${settings.mode === mode ? skin_center_module_css_default.themeButtonActive : ""}`,
								"aria-pressed": settings.mode === mode,
								disabled: busy || !snapshot.writable,
								onClick: () => {
									selectMode(mode);
								},
								children: t(mode === "skin" ? "backgroundSkin" : mode === "custom" ? "backgroundCustom" : "backgroundNone")
							}, mode))
						})]
					}),
					(prepared !== void 0 || imageUrl !== void 0) && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: skin_center_module_css_default.imagePreview,
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("img", {
							src: prepared?.previewUrl ?? imageUrl,
							alt: t("backgroundPreview"),
							onError: () => {
								if (prepared === void 0 && settings.imageRevision !== void 0) handle.reportMissingRevision(settings.imageRevision);
							}
						})
					}),
					snapshot.missingImage && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: skin_center_module_css_default.validation,
						"aria-live": "polite",
						children: t("backgroundMissing")
					}),
					error !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: skin_center_module_css_default.error,
						"aria-live": "polite",
						children: t(error)
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
						ref: input,
						className: skin_center_module_css_default.hiddenInput,
						type: "file",
						accept: "image/jpeg,image/png,image/webp",
						"aria-label": t("chooseImage"),
						onChange: (event) => {
							choose(event.target.files?.[0]);
							event.target.value = "";
						}
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: skin_center_module_css_default.sectionActions,
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: skin_center_module_css_default.button,
								disabled: busy || !snapshot.writable,
								onClick: () => {
									input.current?.click();
								},
								children: settings.imageRevision === void 0 && prepared === void 0 ? t("chooseImage") : t("replaceImage")
							}),
							prepared !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: `${skin_center_module_css_default.button} ${skin_center_module_css_default.buttonPrimary}`,
								disabled: busy || !snapshot.writable,
								onClick: save,
								children: t("saveImage")
							}),
							settings.imageRevision !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: `${skin_center_module_css_default.button} ${skin_center_module_css_default.buttonGhost}`,
								disabled: busy || !snapshot.writable,
								onClick: remove,
								children: t("deleteImage")
							})
						]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
						className: `${skin_center_module_css_default.settingRow} ${skin_center_module_css_default.rangeRow}`,
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: skin_center_module_css_default.settingLabel,
								children: t("backgroundOpacity")
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
								className: skin_center_module_css_default.backgroundRange,
								type: "range",
								min: "0",
								max: "100",
								step: "5",
								value: settings.backgroundOpacity,
								disabled: settings.mode === "none" || !snapshot.writable,
								"aria-valuetext": `${settings.backgroundOpacity}%`,
								onChange: (event) => {
									setError(void 0);
									handle.setOpacity(Number(event.target.value)).catch(() => {
										setError("backgroundSaveFailed");
									});
								}
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
								className: skin_center_module_css_default.rangeValue,
								children: [settings.backgroundOpacity, "%"]
							})
						]
					})
				]
			});
		}
		//#endregion
		//#region src/client/CustomThemeEditor.tsx
		function validateThemeDraft(draft) {
			const palette = normalizePalette(draft);
			return {
				...palette === void 0 ? {} : { palette },
				foregroundRatio: palette === void 0 ? 0 : contrastRatio(palette.foreground, palette.background),
				accentRatio: palette === void 0 ? 0 : contrastRatio(palette.foreground, palette.accent)
			};
		}
		function draftFor(mode, palette) {
			return palette === void 0 ? { ...OFFICIAL_THEME_PRESETS[mode] } : { ...palette };
		}
		function CustomThemeEditor({ handle, mode, setMode, onCancel, onSaveAndApply, backgroundEditor, t }) {
			const snapshot = (0, react.useSyncExternalStore)(handle.subscribe.bind(handle), handle.getSnapshot.bind(handle));
			const [drafts, setDrafts] = (0, react.useState)({
				light: draftFor("light", snapshot.settings.light),
				dark: draftFor("dark", snapshot.settings.dark)
			});
			const [busy, setBusy] = (0, react.useState)(false);
			const [saveError, setSaveError] = (0, react.useState)(false);
			const [dirty, setDirty] = (0, react.useState)(false);
			const draft = drafts[mode];
			const validation = validateThemeDraft(draft);
			(0, react.useEffect)(() => {
				if (validation.palette === void 0) handle.preview(mode);
				else handle.preview(mode, validation.palette);
				return () => {
					handle.preview(mode);
				};
			}, [
				handle,
				mode,
				draft.accent,
				draft.background,
				draft.foreground,
				draft.contrast
			]);
			(0, react.useEffect)(() => {
				if (dirty) return;
				setDrafts({
					light: draftFor("light", snapshot.settings.light),
					dark: draftFor("dark", snapshot.settings.dark)
				});
			}, [
				dirty,
				snapshot.settings.light,
				snapshot.settings.dark
			]);
			const update = (field, value) => {
				setDirty(true);
				setDrafts((current) => ({
					...current,
					[mode]: {
						...current[mode],
						[field]: value
					}
				}));
			};
			const save = () => {
				if (validation.palette === void 0 || busy) return;
				setBusy(true);
				setSaveError(false);
				handle.save(mode, validation.palette).then(onSaveAndApply).catch(() => {
					setSaveError(true);
				}).finally(() => {
					setBusy(false);
				});
			};
			const reset = () => {
				if (busy) return;
				setBusy(true);
				setSaveError(false);
				handle.restoreDefaults().then(() => {
					setDirty(false);
					setDrafts({
						light: { ...OFFICIAL_THEME_PRESETS.light },
						dark: { ...OFFICIAL_THEME_PRESETS.dark }
					});
				}).catch(() => {
					setSaveError(true);
				}).finally(() => {
					setBusy(false);
				});
			};
			const lowContrast = validation.palette !== void 0 && (validation.foregroundRatio < 4.5 || validation.accentRatio < 4.5);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
				className: skin_center_module_css_default.appearanceSection,
				"aria-labelledby": "skin-center-theme-title",
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: skin_center_module_css_default.sectionHeader,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", {
							id: "skin-center-theme-title",
							className: skin_center_module_css_default.sectionTitle,
							tabIndex: -1,
							children: t("customTheme")
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: skin_center_module_css_default.segmented,
							"aria-label": t("theme"),
							children: ["light", "dark"].map((candidate) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: `${skin_center_module_css_default.themeButton} ${mode === candidate ? skin_center_module_css_default.themeButtonActive : ""}`,
								"aria-pressed": mode === candidate,
								onClick: () => {
									setMode(candidate);
								},
								children: t(candidate === "light" ? "themeLight" : "themeDark")
							}, candidate))
						})]
					}),
					[
						"accent",
						"background",
						"foreground"
					].map((field) => {
						const validColor = /^#[0-9a-f]{6}$/i.test(draft[field]) ? draft[field] : "#000000";
						return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
							className: skin_center_module_css_default.settingRow,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: skin_center_module_css_default.settingLabel,
								children: t(field)
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
								className: skin_center_module_css_default.colorControl,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
									className: skin_center_module_css_default.colorInput,
									type: "color",
									value: validColor,
									"aria-label": t(field),
									onChange: (event) => {
										update(field, event.target.value.toUpperCase());
									}
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
									className: skin_center_module_css_default.hexInput,
									type: "text",
									value: draft[field],
									inputMode: "text",
									spellCheck: false,
									"aria-label": `${t(field)} HEX`,
									"aria-invalid": !/^#[0-9a-f]{6}$/i.test(draft[field]),
									onChange: (event) => {
										update(field, event.target.value);
									}
								})]
							})]
						}, field);
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
						className: `${skin_center_module_css_default.settingRow} ${skin_center_module_css_default.rangeRow}`,
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: skin_center_module_css_default.settingLabel,
								children: t("contrast")
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
								className: skin_center_module_css_default.backgroundRange,
								type: "range",
								min: "0",
								max: "100",
								step: "1",
								value: draft.contrast,
								"aria-valuetext": String(draft.contrast),
								onChange: (event) => {
									update("contrast", Number(event.target.value));
								}
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: skin_center_module_css_default.rangeValue,
								children: draft.contrast
							})
						]
					}),
					(validation.palette === void 0 || lowContrast) && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: skin_center_module_css_default.validation,
						"aria-live": "polite",
						children: validation.palette === void 0 ? t("invalidColor") : `${t("contrastWarning")} ${validation.foregroundRatio.toFixed(1)} / ${validation.accentRatio.toFixed(1)}`
					}),
					saveError && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: skin_center_module_css_default.error,
						"aria-live": "polite",
						children: t("themeSaveFailed")
					}),
					backgroundEditor,
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: skin_center_module_css_default.sectionActions,
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: `${skin_center_module_css_default.button} ${skin_center_module_css_default.buttonGhost}`,
								onClick: onCancel,
								children: t("cancel")
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: skin_center_module_css_default.button,
								disabled: busy || !snapshot.writable,
								onClick: reset,
								children: t("resetTheme")
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: `${skin_center_module_css_default.button} ${skin_center_module_css_default.buttonPrimary}`,
								disabled: busy || !snapshot.writable || validation.palette === void 0,
								onClick: save,
								children: t("saveAndApply")
							})
						]
					})
				]
			});
		}
		//#endregion
		//#region src/client/try-on.ts
		/**
		* Try-on engine for the in-GUI skin center.
		*
		* A skin's client bundle is executed through the REAL module system, not a
		* shim and not eval: the host route `/api/skin-center/bundle/<id>` serves
		* the skin's prebuilt `lib/client.js` as a same-origin script (mirroring
		* the kernel's own defaultLoadBundle — see dsh-client-modules), and its
		* body calls `window.__ModuleLoader__.load({id, factory})`, which only
		* REGISTERS the factory. `window.__DSH_MODULES__.import(package)` (the
		* kernel's ClientModuleSystem, contract C5/C6) then materializes it — which
		* auto-injects the skin's CSS `<style data-plugin>` tag — and
		* `surface.apply(miniCtx)` mounts the skin exactly as the fiber system
		* would, returning a full disposer. That makes try-on and its teardown the
		* real code paths, with no CSP `unsafe-eval` dependence and no startup
		* cost: the ~700KB of embedded art base64 is only parsed when a skin is
		* actually tried on.
		*
		* Mutual exclusion: the GUI never hosts two skins at once. The currently
		* ACTIVE skin is owned by its own cordis fiber (its disposer is not
		* reachable), so try-on retracts the active skin's visual writes by recipe:
		* remove its body attribute (its stylesheet goes inert), clear the
		* body-level backdrop inline styles (blue-fantasy's whale art), detach only
		* known skin chrome body children (title/status bars marked `data-skin-chrome`
		* or carrying the skin's body attribute, leaving other plugins' portals and
		* toasts in place), and neutralize known global-rule leaks (xp's sidebar
		* taskbar/start). Everything is snapshotted and restored on exit in original
		* order. The active skin's own fiber is never touched, so exiting try-on
		* returns the page to exactly the pre-try-on state.
		*
		* A ghost MutationObserver may survive retraction (blue-fantasy re-writes
		* its backdrop on theme flips), so during try-on a neutralizing observer
		* re-clears the backdrop props whenever `data-ds-dark-theme` changes.
		*/
		/** Body-level backdrop properties skins may write inline (blue-fantasy). */
		const BACKDROP_PROPS$1 = [
			"background-image",
			"background-position",
			"background-size",
			"background-attachment",
			"background-repeat"
		];
		/**
		* Per-skin neutralization CSS: rules that hide visual leaks whose styles
		* are NOT scoped under the skin's body attribute (they live on app elements
		* the skin touches, so detaching chrome cannot remove them). Matched by
		* css-module class substring, which is stable across rebuilds.
		*/
		const NEUTRALIZE_CSS = { xp: [`[data-pane='sidebar'] [class*='xpTaskbar']{background:transparent!important;border-top:none!important;box-shadow:none!important}`, `[data-pane='sidebar'] [class*='xpStart']{display:none!important}`].join("") };
		/** Host base path of the skin bundle route (registered by src/routes.ts). */
		const BUNDLE_ROUTE = "/api/skin-center/bundle";
		/**
		* Execute one skin's client bundle as a real same-origin script, mirroring
		* the kernel's own defaultLoadBundle (dsh-client-modules): the script body
		* calls `window.__ModuleLoader__.load({id, factory})`, which only registers
		* the factory — materialization is the caller's separate `import` step. No
		* eval: try-on works under any CSP that allows same-origin scripts (the
		* shell itself loads plugin bundles this way), and a failed fetch rejects
		* so the caller can restore the active skin instead of leaving it retracted.
		* @param url - same-origin bundle URL.
		* @returns a promise resolving once the script executed.
		*/
		function loadBundleScript(url) {
			return new Promise((resolve, reject) => {
				const el = document.createElement("script");
				el.async = true;
				el.src = url;
				el.addEventListener("load", () => {
					el.remove();
					resolve();
				}, { once: true });
				el.addEventListener("error", () => {
					el.remove();
					reject(/* @__PURE__ */ new Error(`skin-center: bundle script ${url} failed to load`));
				}, { once: true });
				document.head.append(el);
			});
		}
		/** Read the page's composed boot-graph entry ids (only enabled plugins appear). */
		function bootEntryIds() {
			return window.__DSH_BOOT__?.entries?.map((entry) => entry.id) ?? [];
		}
		/** The skin package currently ACTIVE in the boot graph, if it is one of ours. */
		function activeSkinEntry() {
			const ids = new Set(bootEntryIds());
			return SKIN_CENTER_ENTRIES.find((entry) => ids.has(entry.package));
		}
		/**
		* Whether a direct body child is skin chrome owned by `skin`: marked with the
		* `data-skin-chrome` marker (minecraft/dragon-heir) or carrying the skin's
		* scoping body attribute. Everything else — other plugins' portals, toasts and
		* overlays appended to body — is left alone.
		*/
		function isSkinChrome(el, skin) {
			if (el.hasAttribute("data-skin-chrome")) return true;
			return skin !== null && el.hasAttribute(skin.bodyAttr);
		}
		function miniCtx() {
			const disposers = [];
			return {
				effect(callback) {
					disposers.push(callback());
					return () => {};
				},
				get() {},
				__disposeAll() {
					for (const dispose of disposers.reverse()) dispose();
				}
			};
		}
		/**
		* One live try-on session: owns the tried-on skin's disposer plus the
		* captured active-skin visuals, and restores everything on exit.
		*/
		var TryOnController = class {
			session = null;
			/**
			* Generation counter. A newer try-on or exit increments it, so an in-flight
			* `tryOn` (awaiting the real bundle load) can detect it was superseded and
			* drop only what it mounted instead of clobbering the newer session.
			*/
			epoch = 0;
			/**
			* Loads one skin's client bundle so its factory registers on the page's
			* `__ModuleLoader__`. Defaults to a same-origin script tag from the host
			* route `/api/skin-center/bundle/<id>`; tests inject a stub.
			*/
			loadBundle;
			appearance;
			constructor(options = {}) {
				this.loadBundle = options.loadBundle ?? ((entry) => loadBundleScript(`${BUNDLE_ROUTE}/${encodeURIComponent(entry.id)}`));
				this.appearance = options.appearance;
			}
			/** The skin currently being tried on, if any. */
			get trying() {
				return this.session?.entry ?? null;
			}
			/** Whether the official stock look (no skin) is being tried on. */
			get tryingOfficial() {
				return this.session !== null && this.session.entry === null;
			}
			/** Start trying on `entry` (replaces any live session). */
			async tryOn(entry) {
				if (entry.package === activeSkinEntry()?.package) return;
				this.exit();
				const epoch = ++this.epoch;
				this.appearance?.beforeSurfaceChange();
				const active = this.captureAndRetractActive();
				let dispose;
				try {
					dispose = await this.loadAndApply(entry);
				} catch (error) {
					if (epoch === this.epoch) {
						this.restoreActive(active);
						this.appearance?.afterExit();
					}
					throw error;
				}
				if (epoch !== this.epoch) {
					this.cleanupModule(entry);
					dispose();
					return;
				}
				this.session = {
					entry,
					dispose,
					active
				};
				this.appearance?.afterSurfaceChange();
			}
			/**
			* Try on the official stock look: retract the active skin's visual writes
			* (same recipe as a skin try-on) and mount nothing. Exiting restores the
			* active skin exactly like any other try-on session.
			*/
			tryOnOfficial() {
				if (activeSkinEntry() === null) return;
				this.exit();
				this.epoch += 1;
				this.appearance?.beforeSurfaceChange();
				const active = this.captureAndRetractActive();
				this.session = {
					entry: null,
					dispose: () => {},
					active
				};
				this.appearance?.afterSurfaceChange();
			}
			/** Exit the live session: dispose the tried-on skin, then restore the active skin. */
			exit() {
				const session = this.session;
				if (session === null) return;
				this.epoch += 1;
				this.session = null;
				this.appearance?.beforeSurfaceChange();
				session.dispose();
				if (session.entry !== null) this.cleanupModule(session.entry);
				this.restoreActive(session.active);
				this.appearance?.afterExit();
			}
			/** Execute + materialize + mount the target skin through the real loader. */
			async loadAndApply(entry) {
				const modules = window.__DSH_MODULES__;
				if (modules === void 0) throw new Error("skin-center: window.__DSH_MODULES__ missing");
				modules.invalidate(entry.package);
				await this.loadBundle(entry);
				const apply = (await modules.import(entry.package)).apply;
				if (typeof apply !== "function") throw new Error(`skin-center: "${entry.package}" client bundle exports no apply`);
				const ctx = miniCtx();
				try {
					apply(ctx);
				} catch (error) {
					this.cleanupModule(entry);
					document.body.removeAttribute(entry.bodyAttr);
					for (const el of [...document.body.children]) if (isSkinChrome(el, entry)) el.remove();
					throw error;
				}
				return ctx.__disposeAll;
			}
			/** Drop the tried-on module record + its injected style tag. */
			cleanupModule(entry) {
				window.__DSH_MODULES__?.invalidate(entry.package);
				for (const el of document.querySelectorAll(`style[data-plugin=${JSON.stringify(entry.package)}]`)) el.remove();
			}
			/**
			* Snapshot the active skin's visual writes and retract them so the tried-on
			* skin can take over the whole surface.
			*/
			captureAndRetractActive() {
				const skin = activeSkinEntry() ?? null;
				const body = document.body;
				const bodyAttr = skin === null ? null : body.getAttribute(skin.bodyAttr);
				if (skin !== null && bodyAttr !== null) body.removeAttribute(skin.bodyAttr);
				const backdrop = /* @__PURE__ */ new Map();
				for (const prop of BACKDROP_PROPS$1) backdrop.set(prop, {
					value: body.style.getPropertyValue(prop),
					priority: body.style.getPropertyPriority(prop)
				});
				for (const prop of BACKDROP_PROPS$1) body.style.removeProperty(prop);
				const children = [...body.children];
				const chrome = /* @__PURE__ */ new Set();
				for (const el of children) if (el.id !== "root" && isSkinChrome(el, skin)) chrome.add(el);
				const detached = [];
				for (let i = 0; i < children.length; i++) {
					const el = children[i];
					if (!chrome.has(el)) continue;
					let anchor = null;
					for (let j = i + 1; j < children.length; j++) if (!chrome.has(children[j])) {
						anchor = children[j];
						break;
					}
					detached.push({
						el,
						anchor
					});
				}
				for (const { el } of detached) el.remove();
				const clearObserver = new MutationObserver(() => {
					for (const prop of BACKDROP_PROPS$1) body.style.removeProperty(prop);
				});
				clearObserver.observe(body, {
					attributes: true,
					attributeFilter: ["data-ds-dark-theme"]
				});
				const neutralizeCss = skin === null ? void 0 : NEUTRALIZE_CSS[skin.id];
				return {
					skin,
					bodyAttr,
					backdrop,
					detached,
					clearObserver,
					neutralizeStyle: neutralizeCss === void 0 ? null : this.injectStyle(neutralizeCss)
				};
			}
			/** Restore the active skin's captured visual state. */
			restoreActive(active) {
				const body = document.body;
				if (active.skin !== null && active.bodyAttr !== null) body.setAttribute(active.skin.bodyAttr, active.bodyAttr);
				for (const [property, original] of active.backdrop) if (original.value === "") body.style.removeProperty(property);
				else body.style.setProperty(property, original.value, original.priority);
				for (const { el, anchor } of active.detached) body.insertBefore(el, anchor !== null && anchor.parentNode === body ? anchor : null);
				active.clearObserver?.disconnect();
				active.neutralizeStyle?.remove();
			}
			injectStyle(css) {
				const tag = document.createElement("style");
				tag.dataset.skinCenterNeutralize = "";
				tag.textContent = css;
				document.head.append(tag);
				return tag;
			}
		};
		//#endregion
		//#region src/client/SkinCenter.tsx
		/**
		* The skin-center plugin card: one disclosure card inside the Web UI plugin
		* group (插件配置 → Web UI 插件), listing every installed skin plus the
		* official stock look. Live try-on executes the real bundle inside the GUI
		* (light/dark preview, full restore on exit); Apply is one click — the host
		* half runs `dsh-skin use` through /api/skin-center/apply, the config
		* watcher hot-reloads the patch, and the page reloads into the new skin.
		* Copy rides the standard `t` seat; the theme preview control drives the
		* official theme service (persisted, same as the Appearance row).
		*/
		/** Bring the editor into view without scrolling the settings dialog header away. */
		function revealThemeEditor(root = document) {
			const title = root.getElementById("skin-center-theme-title");
			title?.scrollIntoView({ block: "nearest" });
			title?.focus({ preventScroll: true });
		}
		/** Keep customization compact while preserving background controls for every skin. */
		function appearanceSections(editingTheme) {
			return editingTheme ? ["theme"] : ["skins", "background"];
		}
		/** The visible theme count excludes the separate official stock entry. */
		function skinThemeCount(installedCount) {
			return installedCount + 1;
		}
		/** Translate a card identity into the existing host API and confirmation target. */
		function applyRequestFor(themeId) {
			const { hostTarget } = themeApplyTarget(themeId);
			return {
				body: hostTarget === "official" ? { official: true } : { skin: hostTarget },
				confirmationTarget: hostTarget
			};
		}
		/** Enter custom try-on through the same official-surface session used by stock preview. */
		function beginCustomTryOn(controller, theme, mode) {
			controller.tryOnOfficial();
			theme.startTrial(mode);
		}
		/** End custom-only state before the shared controller restores the previous surface. */
		function finishTryOn(controller, theme, custom, restoreOfficialSurface) {
			if (custom) theme.endTrial();
			theme.setOfficialActive(restoreOfficialSurface);
			controller.exit();
		}
		/**
		* Render the skin-center card: a disclosure header naming the plugin, with
		* the skin list (official default + every installed skin; try-on / theme
		* preview / one-click apply) inside its body.
		* @param props - card props.
		* @returns the plugin card.
		*/
		function SkinCenter({ t, controller, customTheme, theme, background }) {
			const snapshot = (0, react.useSyncExternalStore)(theme.subscribe, theme.getTheme);
			const customSnapshot = (0, react.useSyncExternalStore)(customTheme.subscribe.bind(customTheme), customTheme.getSnapshot.bind(customTheme));
			const activeEntry = activeSkinEntry();
			const activePackage = activeEntry?.package;
			const activeId = resolveActiveThemeId(activeEntry?.id, customSnapshot.settings.active);
			const [open, setOpen] = (0, react.useState)(false);
			const [tryingId, setTryingId] = (0, react.useState)(null);
			const [applying, setApplying] = (0, react.useState)(null);
			const [error, setError] = (0, react.useState)(null);
			const [editingTheme, setEditingTheme] = (0, react.useState)(false);
			const [editingStartedTrial, setEditingStartedTrial] = (0, react.useState)(false);
			const restoreMode = (0, react.useRef)("light");
			const themeMode = snapshot.active.colorScheme === "dark" ? "dark" : "light";
			const sections = appearanceSections(editingTheme);
			const mounted = (0, react.useRef)(false);
			(0, react.useEffect)(() => {
				mounted.current = true;
				return () => {
					mounted.current = false;
				};
			}, []);
			(0, react.useEffect)(() => {
				const officialSurface = tryingId === "official" || tryingId === "custom" || tryingId === null && activePackage === void 0;
				customTheme.setOfficialActive(officialSurface);
				if (officialSurface && tryingId !== "official") customTheme.resume();
				else customTheme.suspend();
			}, [
				activePackage,
				tryingId,
				customTheme
			]);
			const tryOn = (entry) => {
				setError(null);
				if (tryingId === "custom") customTheme.endTrial();
				controller.tryOn(entry).then(() => {
					setTryingId(entry.id);
				}).catch(() => {
					setError(t("tryOnError"));
					setTryingId(null);
				});
			};
			const tryOnOfficial = () => {
				setError(null);
				try {
					if (tryingId === "custom") customTheme.endTrial();
					controller.tryOnOfficial();
				} catch {
					setError(t("tryOnError"));
					return;
				}
				setTryingId(OFFICIAL_THEME_ID);
			};
			const tryOnCustom = () => {
				setError(null);
				try {
					beginCustomTryOn(controller, customTheme, themeMode);
				} catch {
					setError(t("tryOnError"));
					return;
				}
				setTryingId(CUSTOM_THEME_ID);
			};
			const exitTryOn = () => {
				finishTryOn(controller, customTheme, tryingId === CUSTOM_THEME_ID, activePackage === void 0);
				setTryingId(null);
			};
			/**
			* Poll the host state until the config watcher reports the target active
			* (the patch write lands before the watcher re-applies it), or time out.
			* @param target - skin id, or `official` for the stock look.
			* @returns whether the target became active within the poll budget.
			*/
			const confirmActive = (target) => new Promise((resolve) => {
				const expected = target === "official" ? "none" : target;
				let tries = 0;
				const tick = () => {
					if (!mounted.current) {
						resolve(false);
						return;
					}
					tries += 1;
					fetch("/api/skin-center/state").then(async (response) => {
						const payload = await response.json().catch(() => null);
						if (response.ok && payload?.ok === true && payload.active === expected) {
							resolve(true);
							return;
						}
						if (tries >= 20 || !mounted.current) resolve(false);
						else window.setTimeout(tick, 250);
					}).catch(() => {
						if (tries >= 20 || !mounted.current) resolve(false);
						else window.setTimeout(tick, 250);
					});
				};
				tick();
			});
			/**
			* Poll the served GUI document until the boot manifest actually enables
			* the target (the config watcher regenerates it asynchronously after the
			* patch write — reloading earlier boots the page into the previous skin),
			* or time out.
			* @param target - skin id, or `official` for the stock look.
			* @returns whether the manifest caught up within the poll budget.
			*/
			const manifestReady = (target) => new Promise((resolve) => {
				const expected = target === "official" ? null : target;
				let tries = 0;
				const tick = () => {
					if (!mounted.current) {
						resolve(false);
						return;
					}
					tries += 1;
					fetch(window.location.href, { cache: "no-store" }).then(async (response) => {
						const html = await response.text().catch(() => null);
						if (html !== null && manifestHasSkin(html, expected)) {
							resolve(true);
							return;
						}
						if (tries >= 40 || !mounted.current) resolve(false);
						else window.setTimeout(tick, 500);
					}).catch(() => {
						if (tries >= 40 || !mounted.current) resolve(false);
						else window.setTimeout(tick, 500);
					});
				};
				tick();
			});
			/**
			* One-click apply: the host half runs `dsh-skin use <target>` (or
			* `use official`), the config watcher hot-reloads the patch within
			* seconds, then this page reloads to pick up the new boot graph. The
			* reload waits for both the patch (state poll) and the regenerated boot
			* manifest (manifest poll) so the page never boots into the old skin.
			* @param target - skin id, or `official` for the stock look.
			*/
			const applySkin = (target) => {
				setError(null);
				setApplying(target);
				const selection = themeApplyTarget(target);
				const request = applyRequestFor(target);
				const previousCustomActive = customTheme.getSnapshot().settings.active;
				const command = selection.hostTarget === "official" ? "dsh-skin use official" : `dsh-skin use ${selection.hostTarget}`;
				(async () => {
					let hostWriteStarted = false;
					try {
						await customTheme.setActive(selection.customActive);
						const response = await fetch("/api/skin-center/apply", {
							method: "POST",
							headers: { "content-type": "application/json" },
							body: JSON.stringify(request.body)
						});
						const payload = await response.json().catch(() => null);
						if (!response.ok || payload?.ok !== true) throw new Error(payload?.error ?? `HTTP ${response.status}`);
						hostWriteStarted = true;
						const confirmed = await confirmActive(request.confirmationTarget);
						if (!mounted.current) return;
						if (!confirmed) {
							setApplying(null);
							setError(`${t("appliedUnconfirmed")} — ${command}`);
							return;
						}
						const ready = await manifestReady(request.confirmationTarget);
						if (!mounted.current) return;
						if (ready) {
							window.location.reload();
							return;
						}
						setApplying(null);
						setError(`${t("appliedUnconfirmed")} — ${command}`);
					} catch (cause) {
						if (!hostWriteStarted) await customTheme.setActive(previousCustomActive).catch(() => {});
						if (!mounted.current) return;
						setApplying(null);
						const detail = cause instanceof Error ? cause.message : String(cause);
						setError(`${t("applyFailed")} (${detail}) — ${command}`);
					}
				})();
			};
			const openThemeEditor = () => {
				restoreMode.current = themeMode;
				const startsTrial = activeId !== CUSTOM_THEME_ID;
				setEditingStartedTrial(startsTrial);
				if (startsTrial) tryOnCustom();
				setEditingTheme(true);
				window.setTimeout(() => {
					revealThemeEditor();
				}, 0);
			};
			const cancelThemeEditor = () => {
				customTheme.preview(themeMode);
				if (editingStartedTrial) exitTryOn();
				theme.setTheme(restoreMode.current);
				setEditingTheme(false);
				setEditingStartedTrial(false);
			};
			const saveThemeAndApply = () => {
				setEditingTheme(false);
				setEditingStartedTrial(false);
				applySkin(CUSTOM_THEME_ID);
			};
			/** One row: try-on control + apply button. Shared by the official card and every skin card. */
			const actionButtons = (opts) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: skin_center_module_css_default.actions,
				children: [
					opts.isActive ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						type: "button",
						className: `${skin_center_module_css_default.button} ${skin_center_module_css_default.buttonGhost}`,
						disabled: true,
						children: t("tryOn")
					}) : opts.isTrying ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						type: "button",
						className: `${skin_center_module_css_default.button} ${skin_center_module_css_default.buttonPrimary}`,
						onClick: exitTryOn,
						children: t("exitTryOn")
					}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						type: "button",
						className: `${skin_center_module_css_default.button} ${skin_center_module_css_default.buttonPrimary}`,
						onClick: opts.onTryOn,
						children: t("tryOn")
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						type: "button",
						className: skin_center_module_css_default.button,
						disabled: applying !== null,
						onClick: opts.onApply ?? (() => {
							applySkin(opts.key);
						}),
						children: applying === opts.key ? t("applying") : opts.applyLabel
					}),
					opts.extra
				]
			});
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("li", {
				className: open ? `${skin_center_module_css_default.pluginCard} ${skin_center_module_css_default.pluginCardOpen}` : skin_center_module_css_default.pluginCard,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
					type: "button",
					className: skin_center_module_css_default.cardHeader,
					"aria-expanded": open,
					"aria-label": `${t(open ? "collapse" : "expand")}: ${t("title")}`,
					onClick: () => {
						setOpen((current) => !current);
					},
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
						className: skin_center_module_css_default.headText,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
							className: skin_center_module_css_default.pluginName,
							children: [t("title"), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: skin_center_module_css_default.titleBadge,
								children: String(skinThemeCount(SKIN_CENTER_ENTRIES.length))
							})]
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: skin_center_module_css_default.cardDescription,
							title: t("cardDescription"),
							children: t("cardDescription")
						})]
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("svg", {
						width: "14",
						height: "14",
						viewBox: "0 0 14 14",
						fill: "none",
						xmlns: "http://www.w3.org/2000/svg",
						className: open ? `${skin_center_module_css_default.chevron} ${skin_center_module_css_default.chevronOpen}` : skin_center_module_css_default.chevron,
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", {
							d: "M11.8486 5.5L11.4238 5.92383L8.69727 8.65137C8.44157 8.90706 8.21562 9.13382 8.01172 9.29785C7.79912 9.46883 7.55595 9.61756 7.25 9.66602C7.08435 9.69222 6.91565 9.69222 6.75 9.66602C6.44405 9.61756 6.20088 9.46883 5.98828 9.29785C5.78438 9.13382 5.55843 8.90706 5.30273 8.65137L2.57617 5.92383L2.15137 5.5L3 4.65137L3.42383 5.07617L6.15137 7.80273C6.42595 8.07732 6.59876 8.24849 6.74023 8.3623C6.87291 8.46904 6.92272 8.47813 6.9375 8.48047C6.97895 8.48703 7.02105 8.48703 7.0625 8.48047C7.07728 8.47813 7.12709 8.46904 7.25977 8.3623C7.40124 8.24849 7.57405 8.07732 7.84863 7.80273L10.5762 5.07617L11 4.65137L11.8486 5.5Z",
							fill: "currentColor"
						})
					})]
				}), open ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: skin_center_module_css_default.cardBody,
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: skin_center_module_css_default.head,
							children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: skin_center_module_css_default.intro,
								title: t("intro"),
								children: t("intro")
							})
						}),
						error !== null && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: skin_center_module_css_default.error,
							children: error
						}),
						sections.includes("skins") && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: skin_center_module_css_default.list,
							children: [
								(() => {
									const isActive = activeId === "official";
									const isTrying = tryingId === "official";
									const badge = isActive ? t("active") : isTrying ? t("tryingOn") : null;
									return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
										className: skin_center_module_css_default.card,
										children: [
											/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
												className: skin_center_module_css_default.cardHead,
												children: [
													/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
														className: skin_center_module_css_default.swatch,
														style: { background: "#98a1ab" },
														"aria-hidden": "true"
													}),
													/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
														className: skin_center_module_css_default.cardName,
														title: t("official"),
														children: t("official")
													}),
													badge !== null && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
														className: `${skin_center_module_css_default.badge} ${isActive ? skin_center_module_css_default.badgeActive : skin_center_module_css_default.badgeTrying}`,
														children: badge
													})
												]
											}),
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
												className: skin_center_module_css_default.cardTagline,
												title: t("officialTagline"),
												children: t("officialTagline")
											}),
											actionButtons({
												key: "official",
												isActive,
												isTrying,
												onTryOn: tryOnOfficial,
												applyLabel: t("restore")
											})
										]
									}, "official");
								})(),
								(() => {
									const isActive = activeId === "custom";
									const isTrying = tryingId === "custom";
									const badge = isActive ? t("active") : isTrying ? t("tryingOn") : null;
									const accent = customSnapshot.settings[themeMode]?.accent ?? OFFICIAL_THEME_PRESETS[themeMode].accent;
									return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
										className: skin_center_module_css_default.card,
										children: [
											/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
												className: skin_center_module_css_default.cardHead,
												children: [
													/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
														className: skin_center_module_css_default.swatch,
														style: { background: accent },
														"aria-hidden": "true"
													}),
													/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
														className: skin_center_module_css_default.cardName,
														title: t("customTheme"),
														children: t("customTheme")
													}),
													badge !== null && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
														className: `${skin_center_module_css_default.badge} ${isActive ? skin_center_module_css_default.badgeActive : skin_center_module_css_default.badgeTrying}`,
														children: badge
													})
												]
											}),
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
												className: skin_center_module_css_default.cardTagline,
												title: t("customThemeTagline"),
												children: t("customThemeTagline")
											}),
											actionButtons({
												key: "custom",
												isActive,
												isTrying,
												onTryOn: tryOnCustom,
												applyLabel: t("apply"),
												extra: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
													type: "button",
													className: skin_center_module_css_default.button,
													onClick: openThemeEditor,
													children: t("edit")
												})
											})
										]
									}, "custom");
								})(),
								SKIN_CENTER_ENTRIES.map((entry) => {
									const isActive = entry.id === activeId;
									const isTrying = entry.id === tryingId;
									const badge = isActive ? t("active") : isTrying ? t("tryingOn") : null;
									return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
										className: skin_center_module_css_default.card,
										children: [
											/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
												className: skin_center_module_css_default.cardHead,
												children: [
													/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
														className: skin_center_module_css_default.swatch,
														style: { background: entry.accent },
														"aria-hidden": "true"
													}),
													/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
														className: skin_center_module_css_default.cardName,
														title: entry.nameEn,
														children: entry.nameEn
													}),
													badge !== null && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
														className: `${skin_center_module_css_default.badge} ${isActive ? skin_center_module_css_default.badgeActive : skin_center_module_css_default.badgeTrying}`,
														children: badge
													})
												]
											}),
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
												className: skin_center_module_css_default.cardTagline,
												title: entry.tagline,
												children: entry.tagline
											}),
											actionButtons({
												key: entry.id,
												isActive,
												isTrying,
												onTryOn: () => {
													tryOn(entry);
												},
												applyLabel: t("apply")
											})
										]
									}, entry.id);
								})
							]
						}),
						sections.includes("theme") && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(CustomThemeEditor, {
							handle: customTheme,
							mode: themeMode,
							setMode: (mode) => {
								theme.setTheme(mode);
							},
							onCancel: cancelThemeEditor,
							onSaveAndApply: saveThemeAndApply,
							backgroundEditor: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(BackgroundEditor, {
								handle: background,
								t
							}),
							t
						}),
						sections.includes("background") && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(BackgroundEditor, {
							handle: background,
							t
						})
					]
				}) : null]
			});
		}
		//#endregion
		//#region src/core/background.ts
		const BACKGROUND_REVISION = /^[a-f0-9]{64}$/;
		function isRecord(value) {
			return typeof value === "object" && value !== null;
		}
		/** Migrate opacity-only settings and discard invalid optional fields. */
		function normalizeBackgroundSettings(value) {
			const input = isRecord(value) ? value : {};
			const rawOpacity = input.backgroundOpacity;
			const backgroundOpacity = typeof rawOpacity === "number" && Number.isFinite(rawOpacity) ? Math.max(0, Math.min(100, Math.round(rawOpacity))) : 0;
			const mode = input.mode === "custom" || input.mode === "none" ? input.mode : "skin";
			const imageRevision = typeof input.imageRevision === "string" && BACKGROUND_REVISION.test(input.imageRevision) ? input.imageRevision : void 0;
			return {
				version: 1,
				mode,
				backgroundOpacity,
				...imageRevision === void 0 ? {} : { imageRevision }
			};
		}
		//#endregion
		//#region src/client/background.ts
		const SKIN_BACKGROUND_NS = "skin-background";
		const OPACITY_FIELD = "backgroundOpacity";
		const SCRIM_VAR = "--dsw-skin-scrim";
		const BACKDROP_PROPS = [
			"background-image",
			"background-position",
			"background-size",
			"background-attachment",
			"background-repeat"
		];
		const ART_SELECTOR = "[data-skin-chrome=\"backdrop\"], [data-skin-chrome=\"stage\"]";
		const API = "/api/skin-center/background";
		var BackgroundController = class {
			scope;
			body;
			fetcher;
			listeners = /* @__PURE__ */ new Set();
			backdropOriginals = /* @__PURE__ */ new Map();
			artOriginals = /* @__PURE__ */ new Map();
			scrimOriginal;
			unsubscribeScope;
			observer;
			settings;
			missingRevision;
			suspended = false;
			disposed = false;
			snapshot;
			constructor(scope, body = document.body, fetcher = fetch) {
				this.scope = scope;
				this.body = body;
				this.fetcher = fetcher;
				this.settings = normalizeBackgroundSettings(scope.getSnapshot().value);
				this.scrimOriginal = {
					value: body.style.getPropertyValue(SCRIM_VAR),
					priority: body.style.getPropertyPriority(SCRIM_VAR)
				};
				this.snapshot = this.makeSnapshot();
				this.unsubscribeScope = scope.subscribe(() => {
					this.settings = normalizeBackgroundSettings(scope.getSnapshot().value);
					if (this.settings.imageRevision !== this.missingRevision) this.missingRevision = void 0;
					this.render(false);
				});
				const Observer = body.ownerDocument.defaultView?.MutationObserver;
				if (Observer !== void 0) {
					this.observer = new Observer(() => this.render(true));
					this.observeBody();
				}
				this.render(false);
			}
			getSnapshot() {
				return this.snapshot;
			}
			subscribe(listener) {
				this.listeners.add(listener);
				return () => {
					this.listeners.delete(listener);
				};
			}
			async setMode(mode) {
				this.settings = {
					...this.settings,
					mode
				};
				this.render(false);
				await this.scope.set("mode", mode);
			}
			async setOpacity(value) {
				const backgroundOpacity = Math.max(0, Math.min(100, Math.round(value)));
				this.settings = {
					...this.settings,
					backgroundOpacity
				};
				this.render(false);
				await this.scope.set(OPACITY_FIELD, backgroundOpacity);
			}
			async commitRevision(revision) {
				if (!BACKGROUND_REVISION.test(revision)) throw new Error("invalid-background-revision");
				const previous = this.settings;
				let published;
				try {
					published = await this.writeImageSettings(revision, "custom");
				} catch {
					await this.rollbackImageSettings(previous, revision);
					throw new Error("background-settings-write-failed");
				}
				if (published.imageRevision !== revision || published.mode !== "custom") {
					await this.rollbackImageSettings(previous, revision);
					throw new Error("background-settings-write-failed");
				}
				this.settings = published;
				this.missingRevision = void 0;
				this.render(false);
				if (previous.imageRevision !== void 0 && previous.imageRevision !== revision) await this.deleteAsset(previous.imageRevision, true);
			}
			async deleteRevision() {
				const previous = this.settings;
				const revision = previous.imageRevision;
				let published;
				try {
					published = await this.writeImageSettings(void 0, "skin");
				} catch {
					await this.rollbackImageSettings(previous);
					throw new Error("background-settings-write-failed");
				}
				if (published.imageRevision !== void 0 || published.mode !== "skin") {
					await this.rollbackImageSettings(previous);
					throw new Error("background-settings-write-failed");
				}
				if (revision !== void 0) try {
					await this.deleteAsset(revision, false);
				} catch (error) {
					await this.rollbackImageSettings(previous);
					throw error;
				}
				this.settings = published;
				this.missingRevision = void 0;
				this.render(false);
			}
			reportMissingRevision(revision) {
				if (revision !== this.settings.imageRevision) return;
				this.missingRevision = revision;
				this.render(false);
			}
			suspend() {
				if (this.suspended) return;
				this.suspended = true;
				this.render(false);
			}
			resume() {
				if (!this.suspended) return;
				this.suspended = false;
				this.render(false);
			}
			reapply() {
				this.render(true);
			}
			dispose() {
				if (this.disposed) return;
				this.disposed = true;
				this.unsubscribeScope();
				this.observer?.disconnect();
				this.restoreBackdrop();
				this.restoreArt();
				this.restoreOn(this.body, SCRIM_VAR, this.scrimOriginal);
				this.listeners.clear();
			}
			effectiveMode() {
				if (this.settings.mode === "custom" && (this.settings.imageRevision === void 0 || this.settings.imageRevision === this.missingRevision)) return "skin";
				return this.settings.mode;
			}
			desiredBackdrop(mode) {
				if (mode === "none") return /* @__PURE__ */ new Map([["background-image", "none"]]);
				const revision = this.settings.imageRevision;
				const image = `url("${API}/${revision}.webp")`;
				return /* @__PURE__ */ new Map([
					["background-image", `linear-gradient(rgba(0, 0, 0, var(${SCRIM_VAR})), rgba(0, 0, 0, var(${SCRIM_VAR}))), ${image}`],
					["background-position", "center"],
					["background-size", "cover"],
					["background-attachment", "fixed"],
					["background-repeat", "no-repeat"]
				]);
			}
			render(observed) {
				if (this.disposed) return;
				this.observer?.disconnect();
				try {
					if (this.suspended) {
						this.restoreBackdrop();
						this.restoreArt();
						this.restoreOn(this.body, SCRIM_VAR, this.scrimOriginal);
					} else {
						const mode = this.effectiveMode();
						if (mode === "skin") {
							this.restoreBackdrop();
							this.restoreArt();
							this.body.style.setProperty(SCRIM_VAR, String(this.settings.backgroundOpacity / 100));
						} else {
							const desired = this.desiredBackdrop(mode);
							if (this.backdropOriginals.size === 0) this.captureBackdrop();
							else if (observed) this.captureExternalBackdropWrites(desired);
							for (const [property, value] of desired) this.body.style.setProperty(property, value);
							if (mode === "custom") this.body.style.setProperty(SCRIM_VAR, String(this.settings.backgroundOpacity / 100));
							else this.restoreOn(this.body, SCRIM_VAR, this.scrimOriginal);
							this.hideArt();
						}
					}
				} finally {
					if (!this.disposed) this.observeBody();
				}
				this.snapshot = this.makeSnapshot();
				for (const listener of this.listeners) listener();
			}
			observeBody() {
				this.observer?.observe(this.body, {
					attributes: true,
					attributeFilter: ["style", "data-ds-dark-theme"],
					childList: true
				});
			}
			captureBackdrop() {
				for (const property of BACKDROP_PROPS) this.backdropOriginals.set(property, {
					value: this.body.style.getPropertyValue(property),
					priority: this.body.style.getPropertyPriority(property)
				});
			}
			captureExternalBackdropWrites(desired) {
				for (const [property, expected] of desired) {
					const current = this.body.style.getPropertyValue(property);
					if (current !== expected) this.backdropOriginals.set(property, {
						value: current,
						priority: this.body.style.getPropertyPriority(property)
					});
				}
			}
			restoreBackdrop() {
				for (const [property, original] of this.backdropOriginals) this.restoreOn(this.body, property, original);
				this.backdropOriginals.clear();
			}
			hideArt() {
				for (const element of this.body.querySelectorAll(ART_SELECTOR)) {
					if (!this.artOriginals.has(element)) this.artOriginals.set(element, {
						value: element.style.getPropertyValue("display"),
						priority: element.style.getPropertyPriority("display")
					});
					element.style.setProperty("display", "none", "important");
				}
			}
			restoreArt() {
				for (const [element, original] of this.artOriginals) this.restoreOn(element, "display", original);
				this.artOriginals.clear();
			}
			restoreOn(element, property, original) {
				if (original.value === "") element.style.removeProperty(property);
				else element.style.setProperty(property, original.value, original.priority);
			}
			async deleteAsset(revision, bestEffort) {
				try {
					if (!(await this.fetcher(`${API}/${revision}.webp`, { method: "DELETE" })).ok && !bestEffort) throw new Error("background-delete-failed");
				} catch {
					if (!bestEffort) throw new Error("background-delete-failed");
				}
			}
			async writeImageSettings(revision, mode) {
				if (revision === void 0) await this.scope.unset("imageRevision");
				else await this.scope.set("imageRevision", revision);
				await this.scope.set("mode", mode);
				return normalizeBackgroundSettings(this.scope.getSnapshot().value);
			}
			async rollbackImageSettings(previous, uploadedRevision) {
				try {
					await this.writeImageSettings(previous.imageRevision, previous.mode);
				} catch {}
				const rolledBack = normalizeBackgroundSettings(this.scope.getSnapshot().value);
				if (uploadedRevision !== void 0 && rolledBack.imageRevision !== uploadedRevision) await this.deleteAsset(uploadedRevision, true);
				this.settings = rolledBack;
				this.render(false);
			}
			makeSnapshot() {
				const scope = this.scope.getSnapshot();
				const status = scope.status === "ready" ? "ready" : scope.status === "unavailable" ? "unavailable" : "loading";
				return {
					settings: this.settings,
					status,
					writable: scope.writable,
					missingImage: this.settings.imageRevision !== void 0 && this.settings.imageRevision === this.missingRevision
				};
			}
		};
		//#endregion
		//#region src/client/custom-theme.ts
		function samePalette(left, right) {
			if (left === void 0 || right === void 0) return left === right;
			return left.accent === right.accent && left.background === right.background && left.foreground === right.foreground && left.contrast === right.contrast;
		}
		/** Owns every inline token it writes and restores the exact pre-controller values. */
		var CustomThemeController = class {
			scope;
			body;
			listeners = /* @__PURE__ */ new Set();
			originals = /* @__PURE__ */ new Map();
			canvasOriginal;
			unsubscribeScope;
			observer;
			settings;
			draft;
			trialMode;
			officialActive;
			suspended = false;
			disposed = false;
			snapshot;
			constructor(scope, body = document.body, officialActive = false) {
				this.scope = scope;
				this.body = body;
				this.officialActive = officialActive;
				this.settings = normalizeCustomThemeSettings(scope.getSnapshot().value);
				this.snapshot = this.makeSnapshot();
				this.unsubscribeScope = scope.subscribe(() => {
					this.settings = normalizeCustomThemeSettings(scope.getSnapshot().value);
					this.render();
				});
				const Observer = body.ownerDocument.defaultView?.MutationObserver;
				if (Observer !== void 0) {
					this.observer = new Observer(() => this.render());
					this.observer.observe(body, {
						attributes: true,
						attributeFilter: ["data-ds-dark-theme"]
					});
				}
				this.render();
			}
			getSnapshot() {
				return this.snapshot;
			}
			subscribe(listener) {
				this.listeners.add(listener);
				return () => {
					this.listeners.delete(listener);
				};
			}
			setOfficialActive(active) {
				if (this.officialActive === active) return;
				this.officialActive = active;
				this.render();
			}
			async setActive(active) {
				const previous = this.settings;
				try {
					await this.scope.set("version", 2);
					await this.scope.set("active", active);
				} catch {
					await this.rollback(previous);
					throw new Error("theme-settings-write-failed");
				}
				const published = normalizeCustomThemeSettings(this.scope.getSnapshot().value);
				if (published.active !== active) {
					await this.rollback(previous);
					throw new Error("theme-settings-write-failed");
				}
				this.settings = published;
				this.render();
			}
			startTrial(mode) {
				this.trialMode = mode;
				this.render();
			}
			endTrial() {
				if (this.trialMode === void 0 && this.draft === void 0) return;
				this.trialMode = void 0;
				this.draft = void 0;
				this.render();
			}
			preview(mode, palette) {
				const normalized = palette === void 0 ? void 0 : normalizePalette(palette);
				this.draft = normalized === void 0 ? void 0 : {
					mode,
					palette: normalized
				};
				if (this.trialMode !== void 0) this.trialMode = mode;
				this.render();
			}
			async save(mode, palette) {
				const normalized = normalizePalette(palette);
				if (normalized === void 0) throw new Error("invalid-palette");
				const previous = this.settings;
				try {
					await this.scope.set("version", 2);
					await this.scope.set("active", previous.active);
					await this.scope.set(mode, normalized);
				} catch {
					await this.rollback(previous);
					throw new Error("theme-settings-write-failed");
				}
				const published = normalizeCustomThemeSettings(this.scope.getSnapshot().value);
				if (!samePalette(published[mode], normalized)) {
					await this.rollback(previous);
					throw new Error("theme-settings-write-failed");
				}
				this.settings = published;
				this.draft = void 0;
				this.render();
			}
			async restoreDefaults() {
				const previous = this.settings;
				try {
					await this.scope.set("version", 2);
					await this.scope.set("active", previous.active);
					await this.scope.set("light", OFFICIAL_THEME_PRESETS.light);
					await this.scope.set("dark", OFFICIAL_THEME_PRESETS.dark);
				} catch {
					await this.rollback(previous);
					throw new Error("theme-settings-write-failed");
				}
				const published = normalizeCustomThemeSettings(this.scope.getSnapshot().value);
				if (!samePalette(published.light, OFFICIAL_THEME_PRESETS.light) || !samePalette(published.dark, OFFICIAL_THEME_PRESETS.dark)) {
					await this.rollback(previous);
					throw new Error("theme-settings-write-failed");
				}
				this.settings = published;
				this.draft = void 0;
				this.render();
			}
			suspend() {
				if (this.suspended) return;
				this.suspended = true;
				this.render();
			}
			resume() {
				if (!this.suspended) return;
				this.suspended = false;
				this.render();
			}
			dispose() {
				if (this.disposed) return;
				this.disposed = true;
				this.unsubscribeScope();
				this.observer?.disconnect();
				this.restore();
				this.listeners.clear();
			}
			mode() {
				return this.body.hasAttribute("data-ds-dark-theme") ? "dark" : "light";
			}
			palette() {
				const mode = this.mode();
				if (this.draft?.mode === mode) return this.draft.palette;
				if (this.settings.active || this.trialMode !== void 0) return this.settings[mode] ?? OFFICIAL_THEME_PRESETS[mode];
			}
			capture() {
				if (this.originals.size !== 0) return;
				this.canvasOriginal = {
					value: this.body.style.getPropertyValue("background-color"),
					priority: this.body.style.getPropertyPriority("background-color")
				};
				for (const token of THEME_TOKEN_ALLOWLIST) this.originals.set(token, {
					value: this.body.style.getPropertyValue(token),
					priority: this.body.style.getPropertyPriority(token)
				});
			}
			apply(palette) {
				this.capture();
				const tokens = deriveThemeTokens(palette);
				this.body.style.setProperty("background-color", palette.background);
				for (const token of THEME_TOKEN_ALLOWLIST) this.body.style.setProperty(token, tokens[token]);
			}
			restore() {
				if (this.canvasOriginal !== void 0) if (this.canvasOriginal.value === "") this.body.style.removeProperty("background-color");
				else this.body.style.setProperty("background-color", this.canvasOriginal.value, this.canvasOriginal.priority);
				for (const [token, original] of this.originals) if (original.value === "") this.body.style.removeProperty(token);
				else this.body.style.setProperty(token, original.value, original.priority);
			}
			async rollback(previous) {
				try {
					await this.scope.set("version", 2);
					await this.scope.set("active", previous.active);
					for (const mode of ["light", "dark"]) {
						const palette = previous[mode];
						if (palette === void 0) await this.scope.unset(mode);
						else await this.scope.set(mode, palette);
					}
				} catch {}
				this.settings = normalizeCustomThemeSettings(this.scope.getSnapshot().value);
				this.render();
			}
			render() {
				if (this.disposed) return;
				const palette = this.palette();
				if (this.officialActive && !this.suspended && palette !== void 0) this.apply(palette);
				else this.restore();
				this.snapshot = this.makeSnapshot();
				for (const listener of this.listeners) listener();
			}
			makeSnapshot() {
				const scope = this.scope.getSnapshot();
				return {
					status: scope.status === "ready" ? "ready" : scope.status === "unavailable" ? "unavailable" : "loading",
					settings: this.settings,
					...this.draft === void 0 ? {} : { draft: this.draft },
					officialActive: this.officialActive,
					suspended: this.suspended,
					writable: scope.writable
				};
			}
		};
		//#endregion
		//#region src/client/locales.ts
		const en = {
			title: "Skin Center",
			cardDescription: "Try on any installed skin live in the GUI — exit restores instantly, applying persists in one click.",
			expand: "Expand",
			collapse: "Collapse",
			intro: "Try on any skin live — it takes effect instantly, exit restores the current look. Apply persists it across restarts.",
			official: "Official default",
			officialTagline: "The stock DSH look with no skin applied.",
			active: "Active",
			tryingOn: "Trying on",
			tryOn: "Try on",
			exitTryOn: "Exit try-on",
			apply: "Apply",
			applying: "Applying…",
			restore: "Restore",
			applyFailed: "Apply failed",
			appliedUnconfirmed: "Applied, but the change has not been confirmed — refresh the page if the skin did not switch",
			theme: "Theme preview",
			themeLight: "Light",
			themeDark: "Dark",
			tryOnError: "Try-on failed — see console",
			customTheme: "Custom theme",
			customThemeTagline: "A personal theme with editable colors, contrast, and the shared background.",
			edit: "Edit",
			accent: "Accent",
			background: "Background",
			foreground: "Foreground",
			contrast: "Contrast",
			invalidColor: "Use a six-digit hexadecimal color.",
			contrastWarning: "Low text contrast (background / accent):",
			cancel: "Cancel",
			resetTheme: "Restore default parameters",
			saveAndApply: "Save and apply",
			themeSaveFailed: "The custom theme could not be saved.",
			backgroundTitle: "Background image",
			backgroundSkin: "Follow skin",
			backgroundCustom: "Custom",
			backgroundNone: "None",
			chooseImage: "Choose image",
			replaceImage: "Replace image",
			saveImage: "Save",
			deleteImage: "Delete",
			confirmDelete: "Delete the saved background image and follow the skin again?",
			backgroundPreview: "Background preview",
			backgroundMissing: "The saved image is missing. Upload a replacement or delete it.",
			imageInvalid: "Choose a valid JPEG, PNG, or WebP image within the dimension limits.",
			imageTooLarge: "The image is too large to save.",
			imageUploadFailed: "The image could not be processed or uploaded.",
			backgroundSaveFailed: "The background setting could not be saved.",
			backgroundDeleteFailed: "The saved background could not be deleted.",
			backgroundOpacity: "Background occlusion"
		};
		const zh = {
			title: "皮肤中心",
			cardDescription: "在 GUI 内即时试穿任意皮肤，退出即完全还原；应用一键完成并自动刷新。",
			expand: "展开",
			collapse: "收起",
			intro: "任意皮肤可即时试穿，退出即完全还原；「应用」一键持久化，页面自动刷新生效。",
			official: "官方默认",
			officialTagline: "还原 DSH 官方默认外观，不应用任何皮肤。",
			active: "当前激活",
			tryingOn: "试穿中",
			tryOn: "试穿",
			exitTryOn: "退出试穿",
			apply: "应用",
			applying: "应用中…",
			restore: "恢复默认",
			applyFailed: "应用失败",
			appliedUnconfirmed: "已写入配置但尚未确认生效——若皮肤未切换请手动刷新页面",
			theme: "主题预览",
			themeLight: "亮色",
			themeDark: "暗色",
			tryOnError: "试穿失败，详见控制台",
			customTheme: "自定义主题",
			customThemeTagline: "可编辑颜色与对比度，并使用全局背景图片。",
			edit: "编辑",
			accent: "强调色",
			background: "背景",
			foreground: "前景",
			contrast: "对比度",
			invalidColor: "请输入六位十六进制颜色。",
			contrastWarning: "文字对比度偏低（背景 / 强调色）：",
			cancel: "取消",
			resetTheme: "恢复默认参数",
			saveAndApply: "保存并应用",
			themeSaveFailed: "自定义主题保存失败。",
			backgroundTitle: "背景图片",
			backgroundSkin: "跟随皮肤",
			backgroundCustom: "自定义",
			backgroundNone: "无背景",
			chooseImage: "选择图片",
			replaceImage: "替换图片",
			saveImage: "保存",
			deleteImage: "删除",
			confirmDelete: "删除已保存的背景图片并切回跟随皮肤？",
			backgroundPreview: "背景预览",
			backgroundMissing: "已保存的图片不存在，请重新上传或删除引用。",
			imageInvalid: "请选择尺寸合规的 JPEG、PNG 或 WebP 图片。",
			imageTooLarge: "图片过大，无法保存。",
			imageUploadFailed: "图片处理或上传失败。",
			backgroundSaveFailed: "背景设置保存失败。",
			backgroundDeleteFailed: "已保存的背景删除失败。",
			backgroundOpacity: "背景遮挡"
		};
		//#endregion
		//#region src/client/index.ts
		/** Locale namespace owned by this plugin. */
		const NS = "skinCenter";
		/** Required services: slots + locale (plugin card), theme (preview toggle), and settingsScope + its transport (background scrim). */
		const inject = [
			"slots",
			"locale",
			"theme",
			"settingsScope",
			"connection",
			"remote"
		];
		/**
		* Register the skin-center dictionaries, the body scope attribute, and the
		* Skins plugin card inside the official rc.7 keyed settings slot.
		* @param ctx - client root context.
		*/
		function apply(ctx) {
			ctx.effect(() => ctx.locale.register(NS, {
				zh,
				en
			}), "ui-skin-center: dictionaries");
			ctx.effect(() => {
				document.body.dataset.dshSkinCenter = "";
				return () => {
					delete document.body.dataset.dshSkinCenter;
				};
			}, "ui-skin-center: body scope");
			const theme = ctx.get("theme");
			const backgroundScope = ctx.settingsScope.bind({ namespace: SKIN_BACKGROUND_NS });
			const customThemeScope = ctx.settingsScope.bind({ namespace: CUSTOM_THEME_NS });
			const background = new BackgroundController(backgroundScope);
			const customTheme = new CustomThemeController(customThemeScope, document.body, activeSkinEntry() === void 0);
			const controller = new TryOnController({ appearance: {
				beforeSurfaceChange: () => {
					customTheme.suspend();
					background.suspend();
				},
				afterSurfaceChange: () => {
					background.resume();
				},
				afterExit: () => {
					customTheme.resume();
					background.resume();
				}
			} });
			ctx.effect(() => () => {
				controller.exit();
				customTheme.dispose();
				background.dispose();
			}, "ui-skin-center: appearance controllers");
			const injected = () => ({
				controller,
				customTheme,
				theme: {
					getTheme: () => theme.getTheme(),
					subscribe: (listener) => ctx.on("theme/change", listener),
					setTheme: (id) => theme.setTheme(id)
				},
				background
			});
			ctx.slots.inject("settings.plugin.item", () => ctx.slots.register({
				name: "settings.plugin.item",
				key: SKIN_BACKGROUND_NS,
				locale: NS,
				inject: injected
			}, SkinCenter));
		}
		//#endregion
		exports.NS = NS;
		exports.TryOnController = TryOnController;
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map