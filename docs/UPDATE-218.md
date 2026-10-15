# 2.18 — Field Radio

## Recorded sound effects

25 sourced recordings now drive rifles, SMGs, shotguns, marksman shots, four footstep surfaces, pickups, brief death grunts/body falls, and jetpack ignition/thrust/shutdown. Gunfire has separate captured-shot variants. Footsteps apply to the local player and moving nearby players/NPCs, with distance/pan attenuation. Nearby deaths play spatially; the local death cue triggers once on the transition. Jet loops reuse four bounded engines and change tone with fuel/load. Decode/load failures retain synthesized fallback cues rather than interrupting gameplay.

A 25-buffer sample bank loads after audio unlock, keeps failures bounded, and retries only missing files. Settings offers Test sound and Retry sounds plus load status. Master/effects controls still apply, and the 32-shot/four-engine limits remain. See [per-file provenance, licenses and edits](../assets/sfx/ATTRIBUTION.md). All effects are CC0 except the dklon jet-engine derivatives, which retain CC BY 3.0 and visible attribution/source/license/change notes.

## Soundtrack and Safari delivery

The soundtrack has four Scott Buckley tracks under CC BY 4.0: menu playlist Neon / Electric Dreams; gameplay playlist Machina / Twilight Echo. They use edited 150-second cues starting at 10 seconds, with brief edge fades and 64 kbps stereo encoding. Both modes retain their own playback position and rotate tracks naturally at cue end. Existing volume/mute preferences are preserved.

A live 2.17 static-asset probe returned 200/full-file data with no Accept-Ranges header despite a Range request, differing from the verified packaged Worker response. Music now requests `/api/audio/<track>.mp3` so the Worker handles range/HEAD responses instead of the hosting static layer. This addresses a plausible cause of silent native Safari playback; actual iOS listening remains unverified. Start music / loading / retry feedback replaces the ambiguous on/off indication, and tapping Start music enables playback without immediately muting it.

Every track and sound source is credited in the main/pause Music & credits screen. Track pages, licenses and edit notices are included. Copyable video credits cover all four songs plus dklon. Plain-text attribution ships with the assets; source docs include original archive paths and exact changes.

## Menu consistency and nearby NPC presentation

Setup, classes, settings, credits and pause panels now share the olive field-terminal styling, square controls and selection/focus accents. The approved logo is retained.

NPC/player labels are projected after the current frame's camera position/FOV/shake matrices are updated, removing a one-frame drift that is pronounced when passing nearby. Character bodies overlapping the first-person camera are hidden with separate enter/exit thresholds, avoiding interior-body clipping and threshold flicker. These are cosmetic fixes; authoritative movement, damage and NPC decision logic are unchanged. They address identified presentation defects, not a claim that every possible NPC navigation or network glitch is fixed.

## Verification

All 189 automated checks pass. New coverage verifies all cue files and individual credits, PCM format, decode/cache/retry containment, real sample-buffer selection in the sound graph, reused sampled jet loops, playlist advancement, near-body hysteresis and prior music/media-range lifecycle checks. The complete existing networking/simulation/hosted suite also passes. TypeScript and hosted production build pass.

The production artifact serves all 25 WAV files byte-for-byte with audio/wav MIME. All four music API routes return valid range and HEAD responses. There are 126 unique HTML IDs and all 103 literal UI references resolve. Main JavaScript is 176.13 kB gzipped; the full embedded Worker including audio/logo is 7.36 MB gzipped.

Browser control is unavailable in this managed session. Final rendered menu appearance, the exact user-observed NPC glitch, actual iPhone/iPad Safari playback and subjective sound balance need device confirmation. No new browser screenshot or physical listening test is claimed.
