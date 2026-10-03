# 2.1 — Fieldwork

This additive pass follows the Jagex-era **Battle Builder** direction, not the original indie build. Everything implemented here is original geometry, rules, code and UI. Reference images and footage are used for research only; no commercial assets are bundled.

## Reference review and its limits

Primary period sources:

- [Official May 14, 2013 build 3067 notes](https://store.steampowered.com/oldnews/10606): the four period roles, an Engineer jetpack, class-specific prefabs, weapon changes and custom lobby rules. These informed differentiated traversal/building roles rather than treating classes as stat skins.
- [Official June 2013 announcements](https://store.steampowered.com/news/posts/?appids=224540&enddate=1380726219&feed=steam_community_announcements): destruction/network performance, balance changes and invalid-placement ghost feedback. These reinforced bounded effects and server-owned atomic construction.
- [Official October 8, 2013 trailer](https://www.youtube.com/watch?v=G6EMMZJNP5w) was identified as a period reference.
- [January 1, 2014 gameplay recording by Throneful](https://www.youtube.com/watch?v=ApfJagb1AM4) was located but could not be played directly in this environment. It was **not** inspected frame by frame and is not evidence for movement/weapon timing claims.

Frames from the official Steam-hosted **How to Build your Battleground** construction video were visually inspected. It shows large urban voxel structures, bold lighting, whole-structure previews and rapid prefab placement. It is construction/editor footage, not a multiplayer-match recording, and its exact release date was not established. The current [Steam listing](https://store.steampowered.com/app/224540/) describes later content, including seven classes; it is not treated as proof of the 2013 class roster.

Our design inference: bring construction into normal combat, make roles change available tools/traversal, and make weapons visibly respond without expensive rendering. This is not a claim that our balance or movement matches the historical game.

## Play this pass

Choose **Server browser → Create a match**. The new form defaults to **Specialist class loadouts** and **Jetpacks: Skirmisher class**. Add NPCs if desired. Existing default rooms and Scout Practice stay sandbox-compatible; their weapon/jetpack rules do not silently change.

| Original role | Specialist weapons (plus spade/blocks) | Distinction                                                  |
| ------------- | -------------------------------------- | ------------------------------------------------------------ |
| Trailguard    | Rifle, shotgun                         | Rally heals nearby teammates                                 |
| Skirmisher    | SMG                                    | Fast movement/Surge; jetpack when class jetpacks are enabled |
| Sapper        | Shotgun, blast launcher                | 140 starting blocks, Resupply, 0.10s digging interval        |
| Surveyor      | Marksman, rifle                        | Focus accuracy ability and scoped optic                      |

Sandbox rooms keep every firearm and Sapper's previous launcher starting loadout. Specialist Sappers spawn with the shotgun. Class selection still applies on respawn; zombies retain melee-only rules and receive no class jetpacks. NPCs obey the same specialist weapon rules.

## Construction

| Kit           | Block cost | Shape                                                      |
| ------------- | ---------- | ---------------------------------------------------------- |
| Single block  | 1          | Existing precision placement                               |
| Field cover   | 6          | Three wide, two high                                       |
| Assault ramp  | 30         | Three-wide solid staircase, four steps                     |
| Field shelter | 50         | Five-wide roofed shelter, three-high doorway, firing ports |

Select Blocks (desktop 6, mobile weapon picker or BUILD), then cycle with B / KIT. B also selects Blocks. Aim at terrain within six blocks; the footprint rotates to the nearest quarter-turn of your heading. PLACE / left click / E builds the selected kit. Single-block mode keeps the old placement behavior.

Larger kits have green/red footprint ghosts and a failure reason. All cells must be empty, in bounds, outside protected objective foundations and living players, within 12 blocks of the player's eye, and the connected structure must touch existing terrain. The server independently raycasts the anchor within six blocks, validates the complete footprint, charges its exact cost and broadcasts one accepted edit batch. No partial placement or partial resource charge occurs. A 0.65s cooldown bounds repeated kits. Structures are ordinary destructible voxels, so firearms/tools/explosions and late-join map encoding work as before. Shelters have a reachable doorway; ramps have no missing step cells. Zombies can breach them.

The preview is one bounded instanced draw call (at most 50 cubes), refreshed around 15 Hz. Terrain remains greedily chunk-meshed. No image textures, prefab downloads or dynamic shadow maps are added.

## Weapon presentation

Per-weapon shoulder recoil, movement bob and reload tilt are cosmetic and settle within 180 ms. Aim FOV transitions smoothly. Marksman aiming displays an original circular field optic while hiding the first-person weapon. Hit detection/spread remain authoritative; bullet streaks remain cosmetic representations of server hitscan endpoints. Camera/physics are not displaced by recoil animations, avoiding a new prediction discrepancy.

## Scope still remaining

This is a reference-informed iteration, not a complete reproduction of the commercial game. Larger urban/desert landmark maps, more tactical AI around constructed shelters, additional equipment/roles and an in-game map editor remain future work. No physical iPhone/iPad Safari, cross-country internet session, or real 32-player internet load has been verified here. Public large matches should still use the dedicated Node/WebSocket server; the private hosted SQL/HTTP fallback has higher latency and stays capped at 16.
