# 2.3 — Strongholds

An original next step toward the class-based, construction-heavy voxel FPS experience. No source or assets from another game are used.

## Play

Server browser → **Stronghold Demolition**. Each team defends a destructible stronghold near its base. Remove 85% of the opposing structure to win; the timer uses destruction percentage if neither side finishes. Rebuilding original cells with the defending team's blocks restores integrity. Next round generates a new seed and resets the structures.

Sapper's existing Resupply ability also opens a 3×3×3 breach around terrain within eight blocks of the authoritative aim ray. It respects protected foundations, boundaries and cooldowns. The bridge construction kit creates an eight-block, four-wide crossing with rails, costing 48 blocks; B or touch KIT cycles to it.

Hitscan firearms now use hit height to distinguish head and torso damage. Head hits deal 1.5× base damage (shotgun pellets 1.15×). Precision head hits can eliminate a full-health ordinary player; cover, teammate protection, ammo and fire rate remain server-owned. This is not articulated limb hit detection or lag compensation.

## Terrain and graphics

Four original foundry buildings add windows, two entrances, interior roof-access stairs and roof cover. All are voxel terrain and editable. Desktop shadow setting enables a 512px nearby terrain/character shadow map refreshed at most four times per second. Touch devices retain optional contact shadows; no terrain shadow-map cost is added on mobile.

After digs, breaches and explosions, one queued component per tick is checked for ground connectivity. Detached components of up to 2,048 visited cells are removed by the server, broadcast as terrain edits, and shown with bounded cosmetic debris. Components exceeding the search budget conservatively remain intact. This is deliberately bounded collapse, not physical falling structures, crushing damage, or complete structural simulation. Pending checks survive hosted room restoration. Collapsed blocks do not grant inventory.

## Reliability and limits

NPC routes distinguish vertical levels, and Frontline bots favor nearby uncaptured sectors. The capture test now isolates navigation/capture from random cross-map combat. Demolition bots approach the enemy structure, but they do not yet have a coordinated siege planner.

Hosted room format 6 starts fresh rounds on upgrade because generated geometry changed. Reload/rejoin after deployment. Base-map cache remains mode-independent; strongholds are stamped per room before persisted edits are restored.

The public host still uses the HTTP/SQL transport. A persistent publicly hosted WebSocket service has not been provisioned by this release; the existing Docker/Node deployment is the preferred transport. Rewind, accounts, progression, recording-based audio and fully authored map families remain future work. This release does not claim exact historical timings or visual parity with the reference game.

Checks include bounded collapse/anchor preservation and late join, replicated terrain batches, demolition victory/reset, breach range/cooldown and head/torso authority, plus two real browser peers showing collapse and victory. Physical iOS/cellular and sustained crowded-combat validation remain outstanding.
