# Original assets

All terrain colors, terrain layout, characters, weapons, relay markers, interface styling and sounds are authored for Blockfront Relay. Meshes are built from geometry at runtime. `client/audio.ts` synthesizes sound with Web Audio oscillators and noise buffers. No third-party visual or audio asset files are used.

Three.js is MIT licensed. Dependency licenses remain with their packages; npm's lockfile pins the resolved dependency tree. The optional Chromium and Playwright development tools are only used for testing and are not shipped in the browser bundle.
