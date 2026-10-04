# 2.7 — Squad Update

## Changes

- Snow has a less reflective base palette, cooler horizon haze and a lower exposure. Reduced sun intensity with retained hemisphere/bounce fill keeps shaded characters readable without whitening the terrain. Mobile still uses the inexpensive contact-shadow preset.
- NPC navigation now recognizes a one-block step when physics has settled the feet fractionally below its nominal surface. Jump fallback requires grounded movement and has a 1.35-second retry interval. Squadmates gently steer apart using ordinary validated movement.
- Character gait follows rendered travel distance, stops when snapshots stop moving, eases between poses, interpolates look pitch and resets on respawn. Contact shadows follow interpolated character positions instead of newer snapshots.
- Solo choices include 11 NPCs (6 vs 6 with you) and 15 NPCs (8 vs 8 with you). Custom rooms offer the same larger squads. The hosted service remains capped at sixteen participants, and joining friends replace NPCs. Dedicated servers accept up to 31 requested NPCs within a configured 32-player ceiling.
- Short landscape touch viewports now put compact ammo below Scores/Pause and above the action pads. The match note is hidden to keep the timer readable; class and objective controls stay separated.

## Verification

105 automated checks cover authoritative gameplay, new NPC movement regressions, shadow alignment, larger team balance, slot replacement and hosted persistence. Two-browser banner tests run 8-v-8 solo practice and join a friend through production WebSocket and local hosted HTTP/SQL endpoints. WebGL tests inspect snow highlights, all character variants, shadows and short landscape layouts. Standard desktop/mobile controls and actual NPC animation/ordnance, including gait stopping during a stalled snapshot stream, are checked in browser suites.

The local simulation benchmark is documented in PERFORMANCE.md. Physical Safari/iPad hardware, weak cellular connections, prolonged thermal load and geographically separated full matches still require playtesting. More NPCs use additional CPU, bandwidth and character draws; smaller squads remain available. Bounded local navigation can still struggle with elaborate player-built structures. No new hosting service or paid plan is required.
