# 2.17 — Frontline Edition

## Menu and logo

- Original extruded voxel title artwork with ivory block lettering, orange relay plate and hazard accents.
- A full-screen field-terminal menu with solid olive panels, stacked play/practice/browser buttons, callsign header, restrained footer and contextual class-kit label. Existing match, class, settings and connection workflows retain their action IDs.
- A display-only preview of the selected class and its actual held weapon over the rendered voxel battlefield. Portrait menus hide the display model; reduced-motion preferences disable idle movement. Small landscape menus use a compact layout and remain scrollable.

See [design and original image brief](MENU-DESIGN.md).

## Quiet soundtrack and credit

Menu: **Neon**. Gameplay: **Machina**. Both are by Scott Buckley under CC BY 4.0. See [required attribution, source downloads and modifications](../assets/music/ATTRIBUTION.md). The music is separate from the game's MIT license.

The music volume defaults to 0.14 times master volume; gameplay lowers it further. Transitions fade, local firing/damage/confirmed hits duck the soundtrack, paused matches reduce it, and hidden tabs stop it. A separate volume slider and music toggle save on the device. A trusted tap/key gesture starts audio; rejected playback is contained and retried on later gestures. Native streaming avoids large decoded music buffers. Both hosted and Node transports serve proper audio MIME and byte-range responses for native media playback.

Required credits, track pages, artist website, license links and modification notes are visible in Music & credits from the main menu and pause menu. A copyable video-description credit block and shipped `/music/ATTRIBUTION.txt` support attribution in gameplay videos. The Panda Beats reference is not included because its free usage policy does not authorize developer game/app use.

## Verification limits

All **184 automated tests pass**, including the existing multiplayer/hosted simulation checks and seven new music/media-range checks. TypeScript and the hosted production build pass. The main JavaScript is 174.32 kB gzipped; the complete Worker with the logo and both compressed music files is 7.38 MB gzipped. Both audio files are verified byte-for-byte against their packaged responses, including full, partial, suffix, HEAD and invalid-range responses; the PNG asset is also byte-identical. All 122 HTML IDs are unique and all 99 literal UI references resolve.

Music tests exercise quiet volume/mute, no pre-gesture preload/play, two-element priming, menu/game transitions, hidden tabs, autoplay denial/retry and native media-range boundaries. Production checks verify binary asset fidelity and serving separately from gameplay authority.

Browser control is unavailable in this managed environment; no new browser screenshot or physical Safari playtest is claimed. Final responsive appearance, Safari audio start/resume, actual speaker/headphone balance and device frame rate still require a real device check.
