# 2.16 — Lumen Fields

The world keeps its original cube silhouettes and destructible geometry. This pass adds detail and atmosphere through the existing batched materials, using original code-generated patterns rather than downloaded game assets.

## What changes

- A nearest-filtered 64 × 128 atlas contains 32 original 16px grayscale material tiles. Grass, foliage, soil, natural stone, timber, sand, snow, masonry and painted metal have distinct patterns. Grass side faces reveal soil beneath an uneven green edge. Coordinates repeat per voxel even on a large merged face; digging and building retain the same chunk update path. Screen derivatives fade fine detail at distance. Emissive neon tiles remain neutral to preserve team/objective readability.
- Characters and weapons gain fine model-local surface grain and roughness variation. Texture coordinates stay attached to articulated limbs and moving reload parts. Original class/infected silhouettes, muzzle attachments, bones, animation and authoritative combat remain intact.
- The sky has a deeper blue gradient, layered cloud crests/undersides, warm sun-facing rims, more pronounced dusk and controlled sun-disc brightness. Cloud texture samples increase from three to five in the existing sky draw. The same six-minute room clock drives every player's daylight; Lumen Quay stays at night.
- Lighting favors a warm key and cooler fill with conservative exposure. Snow exposure is 0.88, other daytime biomes 0.95, and Outbreak 0.92. The existing bounded sun shadow map and contact shadows remain; no extra shadow-casting lights are added.
- Optional sun shafts use one additive screen quad. Five voxel traces check sunlight periodically, so roofs, tunnels and terrain edits suppress the effect. It fades at the horizon, when turning away, and near screen edges; teleports and round changes refresh visibility. This is a stylized screen-space effect, not per-pixel volumetric lighting: nearby silhouette masking isn't exact.
- Water gains half-block ripple facets, sky reflection, sun glints and faint voxel-aligned crests. Fine shimmer fades at distance and on low effects. It still uses one transparent surface; no expensive mirrored-scene render or new fluid simulation is added.
- Intact city lamps receive a soft warm glow in one depth-tested instance batch, capped at eight and within 52 blocks. Destruction removes glows, and low effects disables them. The existing two nearby shadowless lamp lights stay capped at two.

## Settings and cost

**Terrain pixel detail** is on by default; turning it off restores flat terrain albedo while keeping cube seams and corner shading. **Sun rays** needs balanced/high graphics and high effects; new touch-device preferences start with it off. Choosing the mobile preset disables rays and lamp glows, limits resolution to device-pixel ratio 1, and keeps the existing contact-shadow option. Changing presets refreshes the displayed controls, and preferences remain local.

The atlas occupies 32 KiB of GPU-side RGBA data, generated once, with no external image requests. Material IDs add one float per terrain vertex; greedy face counts and chunk draw counts do not increase. Terrain uses one additional texture sample per fragment. Character/weapon grain adds no geometry, texture or rendering pass. Enabled sun rays and city glows add at most two draws, no intermediate render targets and no bloom/depth-copy passes. Sun visibility uses five traces at 160ms intervals plus immediate checks after activation, map changes or large camera moves. These are bounded costs, not a promise of 60 FPS on a physical phone.

## Verification

All 177 automated tests pass, including the two-peer WebSocket combat/building/death/respawn check, 32 actual WebSocket connections, hosted persistence and on-device practice. The production practice-worker harness starts sixteen-player CTF and acknowledges packed movement. New checks cover material tile identity/determinism, compact texture size, greedy face counts/material IDs across chunks, sunlight under roofs and after digging, map-edge sunlight, camera projection, occlusion fading, teleport resets, mobile/night gates, material-hook composition/skinning, program-cache variants, lamp destruction and shared water/sun phase. TypeScript and the hosted production build pass; the main JavaScript bundle is 172.68 kB gzipped, plus worker, CSS and HTML.

Native shader QA compiled and linked all ten GLSL ES 3.0 shader pairs on Mesa 25.2.8/llvmpipe. It expands the actual Three material hooks/chunks and covers terrain with/without shadow defines, skinned bodies, held equipment, fixed/moving first-person parts, sky, water, rays and instanced city glows. The optional reproducible check is:

```sh
node --import tsx scripts/shader-fixtures.mts /tmp/blockfront-shaders.json
python scripts/check-shaders.py /tmp/blockfront-shaders.json
```

This requires Linux surfaceless EGL/libGL and Python; it isn't a browser dependency or a requirement to run the game. Standard checks use `npm run check`, `npm run build:hosted`, `npm test` and `node --import tsx tests/practice-bundle.ts`.

Browser control is unavailable in this managed session. Native compilation and Node networking/simulation checks do not prove final browser scene appearance, physical Safari performance or iPad thermal stability; no new browser screenshots or physical-device playtest are claimed. Inspect bright snow, sunset, building interiors and the night city on your devices, starting with the mobile preset on phones. The existing hosted HTTP/SQL transport limits still apply.
