# Original assets

Terrain colors, terrain layout, characters, weapons, relay markers and interface styling are authored for Blockfront Relay. Meshes are built from geometry at runtime. `client/audio.ts` plays licensed recorded effects with original Web Audio fallback cues. The title logo is original artwork generated for this game using the built-in image generator (see [design brief](../docs/MENU-DESIGN.md)). Four Kevin MacLeod recordings are included under CC BY 4.0; see [music attribution](music/ATTRIBUTION.md). No visual or audio assets from Ace of Spades are used.

Three.js is MIT licensed. Dependency licenses remain with their packages; npm's lockfile pins the resolved dependency tree. The optional Chromium and Playwright development tools are only used for testing and are not shipped in the browser bundle.

46 sourced recorded sound effects use CC0; per-file creators, URLs, licenses and edits are in [sound effect credits](sfx/ATTRIBUTION.md). Jetpack cues adapt qubodup’s jet-engine test recording; death cues use Ephisus nonvocal thuds. Prior music, grunts and jet recordings are no longer shipped; historical credits remain in Git history and source documents.
