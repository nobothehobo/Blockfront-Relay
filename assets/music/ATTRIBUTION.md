# Current soundtrack — 8-bit action

The active soundtrack replaces the dark synthwave playlists with four recordings by **Eric Skiff**. The artist's official [Resistor Anthems catalog](https://ericskiff.com/music/) labels them free 8-bit/chiptune music for games, videos and products and grants use under [Creative Commons Attribution 4.0 International](https://creativecommons.org/licenses/by/4.0/), with credit and a link back. The source and license were checked October 15, 2026. This permits redistribution and editing in the browser game; the recordings remain CC BY 4.0 and are excluded from the game's MIT source-code license. No endorsement is implied.

| Original title | Use | Shipped file | Cue length |
| --- | --- | --- | --- |
| A Night Of Dizzy Spells | menu | `music/a-night-of-dizzy-spells.mp3` | 112 seconds |
| Underclocked (underunderclocked mix) | menu | `music/underclocked.mp3` | 120 seconds |
| Chibi Ninja | gameplay | `music/chibi-ninja.mp3` | 120 seconds |
| Jumpshot | gameplay | `music/jumpshot.mp3` | 120 seconds |

## Current required credit lines

Music: Eric Skiff - A Night Of Dizzy Spells - Resistor Anthems - Available at http://EricSkiff.com/music

Music: Eric Skiff - Underclocked (underunderclocked mix) - Resistor Anthems - Available at http://EricSkiff.com/music

Music: Eric Skiff - Chibi Ninja - Resistor Anthems - Available at http://EricSkiff.com/music

Music: Eric Skiff - Jumpshot - Resistor Anthems - Available at http://EricSkiff.com/music

Source: <https://ericskiff.com/music/>. License: <https://creativecommons.org/licenses/by/4.0/>.

### Editing and provenance

All cues begin at 0 seconds of the original. Each was loudness-normalized using FFmpeg loudnorm (I=-18 LUFS, TP=-1.5 dBTP, LRA=9), given a 0.2-second onset and 2-second exit fade, and re-encoded as stereo 64 kbps MP3 at 44.1 kHz. Original song titles, artist and album metadata are retained; Jumpshot's original album tag is *Resistor Anthems II*. The credit lines above use the artist's requested site-wide catalog credit format. Runtime playback can fade, lower the level and rotate between tracks.

`chiptune-manifest.json` records exact official download URLs, original-master SHA-256 hashes, shipped-file hashes, byte sizes, credit lines and per-track modification notes. Source MP3s were downloaded directly from the official page, not a third-party "royalty-free" reupload. Shipped files total **3,778,604 bytes**. They contain non-silent decodable audio; subjective listening on target Safari devices is not part of source/license verification.

Current credits ship at `/music/ATTRIBUTION.txt` and should be shown in the game's main-menu and pause-menu credits. Video-description credits should include the applicable track credit(s), source and license links, and note that the game uses edited/faded cues. The artist invites a project notification, but this is not stated as a license condition; no message has been sent on the user's behalf.

## Legacy soundtrack credits — previous versions only

The following is retained as provenance for previous releases. Scott Buckley and Nihilore tracks are no longer part of the active playlist. Their previous recordings can be removed from the current build after integration, while preserving these historical credits and the original licenses in repository history.

The following recordings are by Scott Buckley and retain their **Creative Commons Attribution 4.0 International** license. They are not covered by the game's MIT license. Artist: <https://www.scottbuckley.com.au/>. License: <https://creativecommons.org/licenses/by/4.0/>. License terms and required credit format were checked on October 14, 2026 at <https://www.scottbuckley.com.au/library/using-this-music/> and the individual track pages.

## Required artist credits

'Neon' by Scott Buckley - released under CC-BY 4.0. www.scottbuckley.com.au

'Machina' by Scott Buckley - released under CC-BY 4.0. www.scottbuckley.com.au

| Track | Use | Track page | Original download |
| --- | --- | --- | --- |
| Neon | Main menu | https://www.scottbuckley.com.au/library/neon/ | https://www.scottbuckley.com.au/library/wp-content/uploads/2019/09/sb_neon.mp3 |
| Machina | In-game | https://www.scottbuckley.com.au/library/machina/ | https://www.scottbuckley.com.au/library/wp-content/uploads/2019/12/sb_machina.mp3 |

The source recordings were downloaded from those official MP3 URLs. For 2.18, four tracks use edited 150-second cues from 10 seconds into each recording, with a 0.3-second onset and 2-second exit fade, encoded as 64 kbps stereo MP3 at 44.1 kHz. These excerpts support a compact two-song menu playlist and two-song gameplay playlist. Playback loops, fades, lowers volume during combat and parks inactive songs. These technical changes are identified in the game's Music & credits screen. Embedded file metadata retains track title, artist and license notice.

All four tracks and license links are credited in the main menu and pause menu, with a copyable video-description credit block. A plain-text copy ships at `/music/ATTRIBUTION.txt`. Scott Buckley retains ownership; no endorsement is implied. The music is not registered in Content ID, sold separately or reuploaded to music streaming platforms. Gameplay-video makers should paste the supplied credits into the video description, as requested by the artist.

## Referenced track that is not included

The user referenced “Nightfall” by Panda Beats via https://youtu.be/sNwB_tYPEbo. Panda Beats' public policy at https://pandabeatsmusic.com/usage-policy/ expressly requires separate permission for developer use in games/apps; its free streaming/video permission is not a game license. No Panda Beats recordings are bundled or played by this game.

## Additional tracks in 2.18

'Electric Dreams' by Scott Buckley - released under CC-BY 4.0. www.scottbuckley.com.au

'Twilight Echo' by Scott Buckley - released under CC-BY 4.0. www.scottbuckley.com.au

| Track | Use | Track page | Original download |
| --- | --- | --- | --- |
| Electric Dreams | Main menu | https://www.scottbuckley.com.au/library/electric-dreams/ | https://www.scottbuckley.com.au/library/wp-content/uploads/2020/09/sb_electricdreams.mp3 |
| Twilight Echo | In-game | https://www.scottbuckley.com.au/library/twilight-echo/ | https://www.scottbuckley.com.au/library/wp-content/uploads/2020/04/sb_twilightecho.mp3 |

Track pages and license terms were verified on October 14, 2026. These recordings retain CC BY 4.0. The browser requests `/api/audio/<track>.mp3` so range/HEAD responses are generated by the Worker rather than bypassed by the hosting static-asset layer.

## Additional synthwave tracks in 2.19

"Motion Blur" by Nihilore — licensed under Creative Commons Attribution 4.0 International (CC BY 4.0).

"Moonlit Skyline" by Nihilore — licensed under Creative Commons Attribution 4.0 International (CC BY 4.0).

Artist and source catalog: https://www.nihilore.com/synthwave
Artist license terms: https://www.nihilore.com/license
License: https://creativecommons.org/licenses/by/4.0/

| Track | Shipped file | Original download |
| --- | --- | --- |
| Motion Blur | motion-blur.mp3 | https://www.nihilore.com/s/Motion-Blur.mp3 |
| Moonlit Skyline | moonlit-skyline.mp3 | https://www.nihilore.com/s/Moonlit-Skyline.mp3 |

The artist categorizes both recordings in the official "Synthwave / Chillwave / Outrun" catalog and explicitly offers Creative Commons music for video games. The CC BY 4.0 license permits redistribution and adaptation, including commercial games, with attribution, a license link and identification of changes. The artist additionally requests that original track names not be changed or censored; the original names are preserved here and in the game. This use is under the free CC BY license, not the separate paid non-exclusive resale agreement. No endorsement is implied.

Changes: each recording is excerpted as a 120-second game cue beginning 10 seconds into the original, with a 0.3-second fade in and a 2-second fade out, attenuated by 2 dB for headroom, and re-encoded as stereo 64 kbps MP3 at 44.1 kHz. Runtime playback may fade or lower the music during combat. Embedded metadata retains the original title, artist, license and edit/source notice. Source and shipped-file SHA-256 hashes, filenames, download URLs and verification date are recorded in `assets/music/synthwave-manifest.json`. Official catalog and license were checked October 15, 2026. These licensed recordings are excluded from the game's MIT source-code license.
