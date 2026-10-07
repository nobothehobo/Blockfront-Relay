# 2.13 — Objective Fieldcraft

## NPC movement and objectives

Bots track displacement from a progress anchor rather than only movement since the previous think. Repeated strafing in a small area now triggers a short escape toward a reachable forward/side/back candidate, invalidates the stale route, and replans. Invalid terrain steering is checked even when a route is cached. No teleport or terrain collision bypass is used.

Existing varied skill profiles, combat pressure, cover building, congestion-aware approaches, defense, flag recovery and carrier escort remain active. Objective-oriented Delvers, Sappers and flankers may cut a supported two-high passage through blocking terrain when there is no immediate close enemy. Delvers can use their existing Bore ability. These are normal authoritative tool commands: range, cooldown, foundations and edit replication still apply. Floors remain intact and protected foundations are excluded. Carriers prioritize escape over digging.

This is reactive short-distance breaching, not a complete underground route planner. It can produce tunnels through hills and base approaches, but does not guarantee every fortress is navigable. Strategic lanes remain planning hints; local choices respond to collisions, enemies, teammates and terrain. Complex player-built traps still need playtesting.

## Actual class loadouts

Default public rooms and newly created local/online practice use specialist weapon rules. The server initializes and resupplies only permitted ammunition and rejects unauthorized weapon selection. Mobile weapon pickers hide unavailable weapons; returning from building chooses an allowed gun even after a class change.

| Class      | Firearms          | Distinct equipment / perk              |
| ---------- | ----------------- | -------------------------------------- |
| Trailguard | Rifle, shotgun    | Rally and medbox                       |
| Skirmisher | SMG               | Surge, speed and class jetpack         |
| Sapper     | Shotgun, launcher | Resupply and larger block inventory    |
| Surveyor   | Marksman, rifle   | Focus                                  |
| Delver     | Shotgun           | Fast digging, Bore and lumen equipment |

Everyone retains digging and block tools. Class health, resources and cooldowns remain server-controlled. Changes are queued until respawn, preventing class switching from refilling equipment during combat. Practice uses class-owned jetpacks; explicit public-room jetpack settings can still enable everyone/pickups. Custom all-weapons sandbox rooms remain available intentionally.

## Verification

Regression tests cover stuck-motion escape decisions, all five restricted inventories and jetpack perks, and two-high breaches with replicated edits and standing-player clearance. The full automated suite includes real two-client/32-client Node WebSocket checks and hosted-room persistence tests; production builds and the bundled practice-worker harness are also checked before publishing.

The supported managed browser-testing capability is unavailable in this session, so no new browser or physical Safari/iPad playtest is claimed. Tests do not establish that all NPC movement glitches are eliminated. Refresh/rejoin and start a fresh practice match to use the new practice rules.
