
# Handoff: 3D Portfolio Site (Sun / Beach / Gems)

## ⚠️ How to use this (avoids the "prompt too long" error)
Do **not** paste the contents of `Portfolio Site.dc.html` into Claude Code — that file is ~640 lines of inline GLSL and is what blows past the prompt limit. Instead:
1. Put this whole folder inside your Claude Code project (or `cd` into it).
2. Give Claude Code only the short prompt at the bottom of this README. Let it **read the file from disk with its own file tools**, in pieces, one scene at a time.
3. If you must work in a chat box without file access, paste **this README only** (it is self-contained — the scene specs, colors, shader-layer descriptions, controls, and tokens below are enough to rebuild each scene without the raw shader source), and copy in a single scene's shader method only when Claude Code asks for that specific one.

## Overview
A single-page 3D portfolio with three full-screen WebGL scenes switched by a tab bar: **THE SUN** (a stylized star with surface turbulence, corona, and prominences), **THE SHORE** (a beach with animated waves, sky/clouds, and a day→night environment-light slider that reveals a starfield), and **THE GEMS** (seven colored gemstones with faceted, refractive materials). Each scene has a floating "Environment" control panel (sliders) in the bottom-right.

## About the Design Files
The bundled file(s) are **design references built in HTML/JS (Three.js r128, raw GLSL shaders, no React)** — prototypes proving out the visuals and interactions, not production code to import as-is. Your task is to **recreate this design inside the target codebase's actual stack** (Next.js + React Three Fiber, per the project brief) using that stack's conventions — not to `<iframe>` or copy-paste the HTML file directly.

Because this file is large (hand-written GLSL strings + scene-building JS, ~640 lines / many KB of shader source), pasting the whole file as a single Claude Code prompt will exceed prompt limits. Point Claude Code at the file **on disk** and ask it to read/port it in pieces (per scene) rather than inlining the full source into chat.

## Fidelity
**High-fidelity.** This is a working, tuned prototype — exact colors, shader math, animation timing, and control ranges below should be preserved. Treat the GLSL shader bodies in `Portfolio Site.dc.html` as the source of truth for visual math (noise functions, color ramps, wave functions) — port them into R3F `shaderMaterial`/`extend`-based materials with minimal changes, rather than re-deriving the look from scratch.

## Recommended porting approach (Next.js + React Three Fiber)
- One `<Canvas>` per scene (or one shared `<Canvas>` that swaps scene contents on tab change — simplest is to keep the three `<canvas>` layers approach: mount all three, toggle opacity/pointer-events, only the active one advances its animation loop to save GPU).
- Each scene's shader material → a small `THREE.ShaderMaterial` (or `@react-three/drei`'s `shaderMaterial` helper) with the same `uniforms`, vertex/fragment shader source copied verbatim from the corresponding method in the logic class (see **Files** below for exact method names/line ranges).
- Reuse the shared noise GLSL chunk (`this.NOISE` — simplex noise + `fbm`) as a common shader include across all three scenes' fragment shaders.
- Drive uniforms (`uTime`, `uBright`, `uFlare`, `uCorona`, `uAmb`, etc.) from `useFrame` instead of the hand-rolled `requestAnimationFrame` tick loop.
- The GUI sliders map directly to React state → uniform updates; no need for a separate GUI library, a simple controlled `<input type="range">` panel (as in the prototype) is fine, or swap in `leva`/`tweakpane` if the codebase already uses one.

## Screens / Scenes

### 1. THE SUN (Scene 01 — Solar)
- **Purpose**: hero visual, ambient/idle scene, draggable orbit camera, click to trigger a flare burst.
- **Sphere**: single `IcosahedronGeometry` (high subdivision) with a custom `ShaderMaterial` (`sunMaterial()`):
  - Fragment shader layers: ridged fbm turbulence (`rfbm`) warped by a slower fbm field → mapped through a 5-stop color ramp (`ramp()`: deep red `#280d03`→ ember `#850f14`→ orange `#ed4c05`→ amber `#ff9e1f`→ near-white `#ffeb99`), plus bright "active region" specks, dark filament streaks, faux limb-darkening via view-angle falloff, sunspot umbra/penumbra via a second noise field, and a Fresnel rim tinted orange added at the edge for corona bleed. Output run through an ACES-ish filmic tonemap curve before output.
  - Uniforms: `uTime`, `uBright` (0–3, from 光量/brightness slider), `uFlare` (fixed internal constant ~0.62 controlling turbulence speed — **not** user-exposed after latest revision), `uCorona` (driven by brightness slider, feeds Fresnel rim strength).
- **Halo/corona**: a separate transparent, additively-blended quad/sprite behind the sun (`haloMaterial()`) — radial noise-fringed corona shell, driven by `uMera` (炎のゆらめき / corona flicker slider, 0–1) and `uTime`.
- **Prominences**: a dedicated particle/ribbon system — thin flame filaments that spawn at a point on the sphere surface, grow upward/outward (arcing, not a static loop), flicker with layered noise for a turbulent (not flat-ribbon) look, then fade — one endpoint anchored at the surface ("shoots up from the surface" behavior), width varies along each strand (thicker near the base, thinning toward the tip), color ramps from white-hot base to deep red tip. Spawn frequency is intentionally low (a few active prominences at a time, staggered, not synchronized bursts).
- **Controls (right panel, `pSun`)**:
  - 光量 *brightness* — 0 to 3, step 0.05, default 1.5 → `uBright`.
  - 自動回転 *orbit* — 0 to 2, step 0.05, default 0.5 → idle auto-rotation speed of the camera/sun group.
  - 炎のゆらめき *corona* — 0 to 1, step 0.02, default 0.55 → `uMera` (corona/flicker intensity).
  - Note: an earlier "乱流" (turbulence) slider was **removed** per feedback — turbulence is now a fixed internal constant, not user-exposed.
- **Copy**: Eyebrow "SCENE 01 — SOLAR", Title "THE SUN", body "燃えつづける恒星。燃えさかる表面と、そこから噴き上がるプロミネンス。すべてリアルタイム描画。", hint "Drag to orbit · Click to flare".

### 2. THE SHORE (Scene 02 — Beach)
- **Purpose**: calming scene; drag to orbit; a single slider crossfades the whole environment from bright midday to full night.
- **Sky dome**: procedural shader (`skyBase()` + `nightSky()`) — vivid deep-blue zenith → pale horizon by day; layered fbm-based cumulus clouds (coverage + shading + warm-tinted undersides at dusk); a smooth day→night blend; at night, 4 layered star fields at different angular scales/densities plus a stylized Milky Way band (dot against a fixed galactic-plane normal, dust-lane fbm masking) and a faint airglow gradient near the horizon. Star visibility is deliberately suppressed until well past dusk (so dusk isn't already full of stars) and the deep starfield only reaches full richness near minimum brightness.
- **Ocean/water**: time-based multi-octave noise displacement for swell, Fresnel-driven transparency (transparent turquoise shallows over a sand floor visible through the water), plus a dedicated **shoreline runup system**: waves visibly travel from offshore toward the camera/shore and then recede (a `runup` sine term keyed to depth-from-shoreline `sh`, animated by time, layered on top of the swell noise) rather than a static repeating ripple. Foam: a soft "lace" edge foam pattern at the waterline (fbm-modulated), plus whitecap foam on wave crests.
- **Sand**: bright, near-white sand (not tan/beige) matching reference photo, subtle fbm color variation, darker/wetter tint near the waterline, with the sky's color reflected into wet sand and into the water surface (specular glitter path toward the sun by day, moonlight streak by night).
- **Controls (right panel, `pOce`)**:
  - 環境光 *day/night* — 0 to 1, step 0.01, default 0.85 → drives the day/night blend (`uAmb`/`day` uniform across sky, water, sand).
  - 波の高さ *swell* — 0 to 1, step 0.02, default 0.5 → wave amplitude.
  - 速さ *speed* — 0 to 1, step 0.02, default 0.45 → wave/animation time speed.
- **Copy**: Eyebrow "SCENE 02 — BEACH", Title "THE SHORE", body "白い砂浜に、寄せては返す透きとおった波。環境光を落とせば夜が訪れ、満天の星が浮かびあがる。", hint "Drag to look around · Dim to night".

### 3. THE GEMS (Scene 03 — Gems)
- **Purpose**: showcase scene, seven distinct gemstones arranged in a static macro composition (per latest feedback: **no floating, no auto-rotation** — camera framing only, user can drag to orbit/tilt which eases back).
- **Gem types & colors** (exactly seven, no more): Ruby `#B50D3A`, Sapphire `#0F52BA`, Emerald `#11A15A`, Topaz `#F5A81C`, Cobalt `#1B3FE8`, Amethyst `#7A3BB8`, Amber `#C9660A` (each also has a matching "deep" darker shade for internal color falloff).
- **Geometry**: hand-built brilliant-cut-style gem meshes — a wide table facet on top, angled crown facets, a girdle, and a pavilion tapering to a culet underneath (parametrized per gem by facet-count, table ratio, crown height ratio, pavilion depth ratio, girdle ratio, and a flag for pointed vs. flat culet) — **not** primitive spheres/icosahedrons dressed up; the faceted silhouette is the main source of "gem-like" readability. ⚠️ Watch triangle winding order when porting — the crown/table faces must wind consistently with the rest of the hull or they'll cull/invert (this was a real bug hit during iteration).
- **Material**: `MeshPhysicalMaterial`-style setup — high clearcoat, low roughness, transmission/opacity for glassy depth, per-gem deep-color emissive/inner-glow layer for the "fire" look, environment map reflections, all against a dark violet/plum velvet-like backdrop (soft radial gradient, not flat black) with a couple of soft off-scene point-light-driven color washes (warm key + cool violet fill) so facets catch varied reflections instead of looking flat/toy-like.
- **Ground/setting**: a large, dark satin/velvet-toned surface beneath the gems, wide enough to show soft reflections, keeping the composition feeling like a jeweler's presentation rather than gems floating in a void.
- **Controls (right panel, `pGem`)**:
  - 光量 *light* — 0 to 3, step 0.05, default 1.4 → key light / env intensity.
  - きらめき *sparkle* — 0 to 1, step 0.02, default 0.6 → sparkle-particle opacity/size and a per-gem emissive/envMapIntensity boost; clicking the scene also triggers a temporary "burst" boost to this same set of properties.
- **Copy**: Eyebrow "SCENE 03 — GEMS", Title "THE GEMS", body "ルビーからアンバーまで、七つの宝石。光を閉じこめた切子面が、静かにきらめく。", hint "Drag to rotate · Click to sparkle".

## Interactions & Behavior
- **Tab bar** (top center, pill-shaped, 3 tabs: Sun / Beach / Gems): click switches `tab` state; the corresponding `<canvas>` layer fades in via `opacity` transition (0.7s ease) while others fade out and lose `pointer-events`; hero copy and the control panel swap with `sc-if` blocks keyed to the active tab. Last-selected tab persists to `localStorage` (`ra-scene-tab`) and is restored on load (falls back to a `defaultTab` prop, default `"sun"`).
- **Drag-to-orbit**: pointer-down + move on the active canvas rotates the camera/scene group around the subject; releasing lets rotation velocity ease out (damped). Implemented per-scene in each scene's own pointer handlers (not a shared OrbitControls instance) — check the `wire(s, canvas)` method and each scene's `tick` handling of `s.rotX/rotY/vx/vy`.
- **Click-to-flare / click-to-sparkle**: a plain click (not a drag) on Sun triggers an extra flare/prominence event; on Gems it triggers a temporary "burst" that boosts light/sparkle intensity briefly then decays.
- **Resize**: window resize listener updates renderer size and camera aspect for whichever scenes are built.
- **Render loop**: single shared `requestAnimationFrame` tick drives all three scenes' uniform updates each frame (only the active scene really needs to render — consider only calling `renderer.render()` for the active scene in the ported version to save GPU, while still advancing state for a smooth reveal on tab switch).

## State Management
- `tab`: `'sun' | 'oce' | 'gem'` — active scene.
- Per-scene slider state (mirrors the panel sliders above): `sunAmb, sunRot, sunMera`; `oceAmb, oceWave, oceSpeed`; `gemAmb, gemRot, gemSpark` (note: `gemRot` exists in state but auto-rotation is now disabled per latest feedback — treat as vestigial/remove).
- Each scene keeps its own Three.js objects (renderer, scene, camera, meshes, materials) in a plain (non-React-state) registry object so per-frame mutation doesn't trigger re-renders — in the R3F port this maps naturally to refs + `useFrame`, not React state, for anything animated every frame.

## Design Tokens
- **Background**: `#04060B` (app shell behind all canvases).
- **Text**: `#F6F5F1` (near-white) over scenes, with a soft radial vignette overlay (`rgba(0,0,0,.36)` at edges) for legibility.
- **Accent per scene** (used for that scene's slider thumb/value color and panel status dot): Sun `#FFC93C`, Beach `#66D9FF`, Gems `#E8B4FF`.
- **Fonts**: `Space Grotesk` (700, headlines), `Manrope` (400–800, body/UI), `Zen Kaku Gothic New` (400/500/700, Japanese body copy), `Space Mono` (400/700, labels/mono UI/eyebrows) — all via Google Fonts.
- **Panel chrome**: translucent dark glass — `rgba(9,10,16,.6)` background, `blur(16px)` backdrop-filter, `1px solid rgba(255,255,255,.16)` border, `18px` border radius, soft large drop shadow.
- **Type scale**: eyebrow 12px / letter-spacing .26em; title 76px / weight 700 / line-height .9 / letter-spacing -.03em; tagline 16px / line-height 1.7; hint/labels 11–13px mono.
- **Tab pill**: `999px` border radius, active tab = solid `#F6F5F1` background with `#0A0A12` text; inactive = transparent, `rgba(246,245,241,.6)` text.

## Assets
No external image/texture assets — all visuals are procedural (GLSL noise/shaders) or generated at runtime via `<canvas>` 2D gradients turned into `CanvasTexture` (soft glow sprites, star sprite, corona glow). No asset files to hand off; a developer re-implementing in R3F can either keep this procedural approach (recommended, matches "modern/wow" brief) or swap in HDRI env maps / photographed textures later without changing the shader math described above.

## Files
- `Portfolio Site.dc.html` — the full design reference (HTML shell + inline template + one JS class `Component extends DCLogic`). This is a proprietary component format (not plain HTML/React) used only for building the mockup — read it as reference source, don't import it into the target app. Structure inside:
  - Template markup (tab bar, hero copy per scene, control panels): near the top of the file, inside `<x-dc>...</x-dc>`.
  - Logic class `Component`: single `<script>` block after the template. Key methods to port scene-by-scene:
    - `buildSun()`, `sunMaterial()`, `haloMaterial()`, prominence particle setup/tick logic — Sun scene.
    - `buildOcean()` and its shader strings (`skyBase`, `nightSky`, water vertex/fragment shaders, sand shader) — Beach scene.
    - `buildGems()`, gem geometry builder (facet/table/crown/pavilion construction), gem material setup — Gems scene.
    - `tick()` — shared per-frame update loop (uniform updates, camera easing, per-scene `s.*` state).
    - `this.NOISE` — shared simplex-noise + fbm GLSL string reused across all shaders.
- `export-src.dc.html` / `Portfolio Site (standalone).html` — bundled/offline copies of the same design (for viewing in a browser only; not needed for implementation, safe to ignore for the port).

## Suggested prompt for Claude Code
> "Read `Portfolio Site.dc.html` in this handoff folder plus this README. Port the three WebGL scenes (Sun, Beach, Gems) into React Three Fiber components inside our Next.js app, matching the shader logic, colors, animation behavior, and GUI sliders described in the README as closely as possible. Do it one scene at a time — Sun first, then Beach, then Gems — and check in after each before continuing, since the source shader code is long."
