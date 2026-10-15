# 2.20 — Signal Check

## Nearby motion

The previous proximity fix addressed clipping/labels, not motion cadence. The local camera followed fixed 30 Hz prediction directly while remote characters used interpolated snapshots, creating alternating stationary/moving camera frames at 60/120 Hz. A render-only copy now advances the unsimulated fraction of the local tick through terrain-aware movement. It does not alter accepted simulation, fuel, commands, hit validation or NPC decisions. Jumps are not retriggered and speculative stair climbs are suppressed. Regression checks demonstrate continuous camera progress beside a stationary NPC at 120 Hz and preserve collision/state behavior. This addresses an identified presentation defect; it is not a claim that all possible frame-rate/network/NPC navigation stutter is fixed.

## Recorded audio reliability and evidence

All 46 existing licensed WAV recordings remain unchanged with their original credits. SFX requests now use `/api/sfx/<name>.wav?v=220`, giving the game explicit Worker-owned delivery rather than relying on the hosting static layer. PCM16 WAV chunks are parsed into AudioBuffers directly, avoiding platform-dependent codec decoding. The loader uses a portable AbortController timeout, contains per-file failures, exposes their messages and retries failed clips on subsequent gestures after a cooldown. These changes harden plausible failure paths; we do not have the user's device logs and cannot claim which one caused the reported silence.

The old Test sound could play synthesized fallback before recordings finished downloading. The new test waits for the selected recording and reports its filename or an explicit load/mute/suspended-context error. Preview options now include jets, death grunts and footsteps. Settings shows ready/total recordings, played-recording/fallback counts and last cue, also included in copied diagnostics. A completely full one-shot budget previously dropped every new cue; loud local effects now replace quieter distant recorded tails without exceeding 32 voices. Shot and explosion samples have a quiet 140 ms echo through the existing effects bus/master mute; no new third-party assets were added.

## Validation and limits

194 automated tests pass, including every sample's PCM output being non-silent, load/cache/retry handling, preview waiting/failure, sample-buffer routing and voice-budget priority. TypeScript and hosted build pass. Production-artifact and live endpoint checks verify exact WAV responses. Browser control and physical Safari listening are unavailable in this session. Device playback, subjective volume/echo mix and the exact reported NPC stutter still need confirmation; server file existence is not presented as proof of audible playback.
