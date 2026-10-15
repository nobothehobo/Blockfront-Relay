# Original assets

All terrain colors, terrain layout, characters, weapons, relay markers, interface styling and sounds are authored for Blockfront Relay. Meshes are built from geometry at runtime. `client/audio.ts` synthesizes sound with Web Audio oscillators and noise buffers. The title logo is original artwork generated for this game using the built-in image generator (see [design brief](../docs/MENU-DESIGN.md)). Four licensed soundtrack recordings by Scott Buckley are included separately from the original synthesized sound effects; see [music attribution](music/ATTRIBUTION.md). No visual or audio assets from Ace of Spades are used.

Three.js is MIT licensed. Dependency licenses remain with their packages; npm's lockfile pins the resolved dependency tree. The optional Chromium and Playwright development tools are only used for testing and are not shipped in the browser bundle.

25 sourced recorded sound effects are licensed separately; per-file creators, URLs, licenses and edits are in [sound effect credits](sfx/ATTRIBUTION.md). Jet engine derivatives require dklon attribution under CC BY 3.0; other recordings use CC0.
