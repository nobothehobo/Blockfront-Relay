# 2.6 — Fieldcraft

## Graphics and characters

Terrain, characters and first-person equipment now use rough physically based materials, a directional sun, cool hemisphere fill and a weaker opposing bounce light. Reduced exposure and lighter baked face shading preserve material colors while sun shadows define depth. Procedural clouds have warmer rims and darker cores; Outbreak uses a cooler twilight sky and softer light. All geometry, colors and shaders are original.

Class anatomy is explicitly attached to seven bones and batched into one skinned mesh. Armor, headgear, packs, belts and tools stay attached to the correct limb. Trailguard has field armor and medical gear; Skirmisher has a flight harness and tanks; Sapper has heavier protection and demolition supplies; Surveyor has a precision kit and camouflage; Delver has overalls, a headlamp and excavation gear. The elimination camera uses these same models.

Infected characters have three deterministic cosmetic variants with torn clothing, bare limbs, uneven faces, teeth and claws, glowing eyes and a hunched gait. They retain the existing server-owned melee, health, movement and infection rules. Appearance does not change hitboxes or secretly increase health.

## Roles and equipment

| Class      | Primary in specialist rooms | Ability                                                  | Field gear (K / named touch button)                                           |
| ---------- | --------------------------- | -------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Trailguard | Rifle                       | Rally healing                                            | 2 medboxes: a living injured teammate collects up to 30 HP                    |
| Skirmisher | SMG                         | Surge movement burst                                     | 3 lumen beacons: mark and illuminate tunnels for 45 seconds                   |
| Sapper     | Blast launcher              | Resupply and short terrain breach                        | 2 timed charges: visible 3-second fuse, cover-aware damage and terrain crater |
| Surveyor   | Marksman                    | Focus                                                    | 2 mines: arm in 2 seconds, trigger on nearby enemies with clear sight         |
| Delver     | Shotgun                     | Bore: short two-wide/two-high tunnel, 12-second cooldown | 3 lumen beacons; faster manual digging and animated bore-drill model          |

The Delver has 105 HP, a 4% movement bonus, 120 starting blocks and 2 grenades. The existing sandbox arsenal remains available. Choose a class before joining or queue a change from the class badge; changes apply on respawn.

Equipment is placed two blocks ahead on nearby ground; jumping, blocked locations and occupied cells are rejected without spending inventory. The server selects the equipment kind from the class and owns inventory, cooldowns, lifetimes, sight checks, healing and explosions. Medboxes cannot heal through walls or help infected/enemy/dead players. Mines ignore friendly players and enemies behind solid cover. Charges share the existing explosion rules, including self-damage and protected foundations. Equipment is bounded to 32 objects per room, loses support when its floor is destroyed, expires, and is removed when its owner disconnects. Team supply stations refill gear after the existing safe dwell/cooldown. NPCs choose gear and Delver boring through normal authoritative inputs.

## Graphics settings and hosting

Mobile preset retains inexpensive contact shadows and removes sun shadow maps and beacon point lights. Balanced/high presets enable nearby sun shadows when Shadows is on: 512px on touch devices, 1024px desktop balanced, 2048px desktop high. Shadow updates are capped and cover a local region rather than the entire map. High effects enable at most two nearest beacon lights; low effects keep the visible markers. Field equipment is batched into two draw calls.

No new hosting account or payment plan is required for this update. The existing public test uses the authoritative HTTP/SQL adapter; a dedicated Node WebSocket server is still the smoother option for larger internet matches. Capacity remains 16 hosted / up to 32 dedicated. Hosted format 7 remains compatible; old players receive bounded initial gear when restored. Reload the page or relaunch the Home Screen app to receive the new client.

## Reference and scope

The [official May 14, 2013 build 3067 notes](https://store.steampowered.com/oldnews/10606) describe the Commando, Marksman, Engineer and Miner roles, Engineer jetpacks, prefabs and marksman mines. These informed broad combat, traversal, precision and excavation roles. Later specialist/medic additions appear in [the official 2015 announcements](https://store.steampowered.com/news/?appgroupname=Ace+of+Spades+Complete&appids=224540%2C231970&feed=steam_community_announcements&headlines=0); they are not presented as the 2013 roster. No referenced art, character model, weapon model, sound, map or code is included.

This is a substantial visual and role pass on the playable game. It does not implement another game's complete class catalog, abilities, missions or balance. The charges are timed rather than remotely detonated; mines are proximity devices rather than remotely controlled items. Human balance testing, physical Safari/GPU frame rates and real internet load testing remain necessary.

## Verification

99 automated checks pass, including 32 real WebSocket connections and two-peer authoritative gameplay. The Fieldcraft WebGL browser suite verifies five class rigs, three infected variants, shader compilation, 1024px desktop and 512px touch sun shadows, mobile shadow disabling, two-client beacon/Bore replication, keyboard drill selection, touch equipment deployment and portrait/tablet layouts. Screenshots were inspected and beacon/waist details refined. The elimination and NPC/ordnance polish suites pass with the rebuilt characters. Standard desktop, phone landscape/portrait and tablet controls, including two-browser movement, shooting, building, digging, reload and jetpacks, pass on both Node WebSockets and the local hosted HTTP/SQL adapter. Physical Safari, hardware frame rates and balance remain unverified here.
