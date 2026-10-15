# Longer days, brighter Afterdark, fairer solo enemies

- Outdoor room-time day/night loops now last 12 minutes (previously 6). Noon, dusk, midnight and dawn remain synchronized for every player and late join. Lumen Quay stays at midnight.
- Neon terrain emission rises from 1.8 to 2.5. Streetlamps have stronger, wider illumination and larger halos. Two additional shadowless lights sample the nearest intact cyan/magenta marquees to illuminate nearby facades and streets. Total local light budget is four; mobile/low effects disables them. Destroying a source removes its light on the next 250 ms update.
- Enemy soldiers in on-device solo practice get 220 ms extra reaction delay, 140 ms extra observation delay, and 35% greater aim error. Skill tiers remain varied. Allied NPCs, online NPCs, zombie melee, damage and weapon stats retain existing behavior.

Verification: `npm run build:hosted` passes; all 199 Node tests pass. The Afterdark Chromium run rendered desktop/phone/tablet screenshots and passed initial sky/light checks, but timed out waiting for a late join to finish loading, before reaching outdoor cycle screenshots. That full browser check remains incomplete. Physical iPhone/iPad performance and subjective combat balance still need playtesting.
