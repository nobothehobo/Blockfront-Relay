# Original retro combat audio

All sounds are synthesized in Web Audio. No Ace of Spades or other game's samples are downloaded, reproduced or bundled. The design direction is dry, punchy voxel combat, with quieter melodic HUD feedback.

Rifle, SMG, shotgun and marksman use distinct filtered noise reports, low-frequency bodies and short mechanical tails. The launcher has its own lower whoosh. Reloads use a timed three-click mechanical sequence; digging/placement use crunchy impacts and thumps. Footsteps and jumps are subdued. Explosions combine a short crack, low rumble and bass decay; damage, hit/kill, objective, pickup and infection have distinct cues.

Jetpacks use a cached two-second noise loop plus a low engine tone. Thrust fades in/out rather than creating a new burst every frame. Fuel changes the filter and tone gently. Local thrust responds immediately to held F/JET, equipment and usable fuel. Other players use an authoritative `thrusting` snapshot flag, filtered by life/equipment/fuel. Up to three nearby remote engines within 40 blocks are mixed with quadratic distance falloff and heading-relative stereo pan, plus one local engine. Audio omits the last 1% of fuel to prevent rapid ignition/shutdown chatter at the empty-fuel recharge boundary. Physics/fuel rules are unchanged.

Loops stop on release, depleted fuel, death, leaving, pausing, hidden tabs and muting. Master/effects levels update the shared bus while playing. Original startup/shutdown transients accompany engine transitions. One-shots are capped at 32 simultaneous source nodes; engine voices at four. Two reusable noise buffers avoid repeated large allocations. Short gain envelopes and a shared compressor control clicks and busy-match peaks; ended nodes disconnect.

AudioContext unlocks/resumes from the existing Play/Join or touch gesture. Modern Safari is supported by standard Web Audio, with a prefixed context fallback, but physical iPhone/iPad speaker/headphone and silent-mode behavior still need device testing. Browser audio/PCM and desktop/touch lifecycle tests are automated; sound balance and subjective tone require listening on actual hardware.
