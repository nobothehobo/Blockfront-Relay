# Blockfront Relay — Game Jolt downloads and automatic updates

This wraps the **existing complete Three.js/TypeScript 2.24 game** in a desktop program. The current gameplay, original assets, music, AI, lobby settings and authoritative server code are retained; it is not a Godot conversion.

## Game Jolt distribution

GitHub Actions → **Game Jolt desktop and update releases** builds:
- **Windows x64:** NSIS installer EXE. Install once; receive compatible auto-updates after new published desktop releases.
- **Linux x64 / Steam Deck:** AppImage for Desktop Mode. Linux/AppImage receives update checks and downloads, subject to device testing.
- **macOS Apple Silicon:** unsigned DMG/ZIP preview only. macOS automatic updates require Apple code signing and notarization.
- **iPhone / iPad:** the existing Safari Home Screen web app; it loads updates from the hosted web version, not from a Windows executable.

Upload the appropriate installer/AppImage as a downloadable build on your Game Jolt page. The installer and updater metadata are served by **GitHub Releases**. A Game Jolt download is a real copy of the game: it launches its own server and embeds the original client. A pure HTML upload cannot host Blockfront's Node multiplayer server on Game Jolt itself.

## Automatic update behavior

Electron updater checks the project's public GitHub Releases on startup (after 12 seconds), every six hours, and on manual request from the **Updates** menu. Compatible updates are downloaded in the background, then installed **only when the user normally exits the program**. No forced game restart during a match.

A new update is a **higher semantic version** with the installer/AppImage and matching update manifests attached to a published GitHub release. Changes pushed to the development branch alone are not silently sent to players. Versions in root package.json and desktop/package.json must be incremented together before tagging vVERSION.

The GitHub workflow builds candidates for testing on branch pushes. For a public tagged release it requires encrypted Windows code-signing secrets **WIN_CSC_LINK** and **WIN_CSC_KEY_PASSWORD**, checks the tag matches the version, and publishes Windows and Linux installers plus latest.yml and latest-linux.yml. Never commit signing keys or GitHub tokens. The macOS preview is not published in that auto-update release.

Because unsigned or improperly signed desktop binaries may prompt operating-system security warnings, obtain valid developer signing and complete physical-machine testing before distributing widely. Windows signing is mandatory in the public release workflow. Linux GitHub update metadata uses HTTPS and artifact hashes but does not carry Windows-style executable code-signature guarantees.

## Peer hosting and cross-platform LAN matches

Every desktop install serves its own authoritative game on **127.0.0.1:30740**, inaccessible to the local network by default. Users may choose **Hosting → Allow other devices on my LAN** and acknowledge a warning; this enables binding on port 30740 across the local network and displays a URL that other devices on trusted Wi-Fi may open in their browser.

Joining that displayed host URL in Safari on an iPhone/iPad or from a Steam Deck web browser connects to the same Node WebSocket server and gameplay protocol. The host's firewall and network must permit it. The host must keep their game open; changing host mode disconnects the current rooms.

This does **not** yet supply internet P2P matchmaking like Phasmophobia, NAT traversal, port forwarding, host migration, password-protected rooms, relay servers or DDoS protection. Do not expose your local game port directly to the public internet without a dedicated security pass. For internet play, retain the separately hosted public server. Visiting the LAN host URL directly is required; a public HTTPS game page cannot normally open an insecure WebSocket at a LAN address.

## Technical verification and remaining limits

- Desktop renderer has Node integration disabled, context isolation and sandbox enabled, and external navigation restricted. Updates come from the official GitHub release feed, not arbitrary in-game URLs.
- Bundled server is compiled from the current source with esbuild. CI launches it and checks health, room listing and real game HTML; package tests check the updater, distribution and LAN defaults.
- **Actual device launch, multiplayer cross-play, signing acceptance, first-to-second-version self-update and Steam Deck support have not been physically verified.** Those tests are required before making public compatibility claims.
- **Godot/Xogot source ZIP:** the existing Three.js game cannot become a native Godot game merely by repackaging it. A separate port is necessary. The iPhone/iPad web app remains the feature-complete mobile option today.
- Preserve original audio attribution and the game's license in all distributed packages.

### How to publish

1. Review/merge this packaging branch after green CI and hands-on game testing.
2. Configure the GitHub Actions encrypted Windows code-signing secrets.
3. Update both package versions, tag the reviewed main commit (for example v2.24.0), and push the tag.
4. The workflow generates a GitHub Release and its updater manifests; download/test the installer.
5. Upload the installer and AppImage to the Game Jolt game page. On subsequent published versions the installed desktop builds detect and apply the new release at normal exit.
