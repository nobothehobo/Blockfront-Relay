# iPad keyboard and trackpad — 2.12

The former client treated every touch-capable device as touchscreen-only: WASD was discarded in favor of joystick values, mouse firing required pointer lock, and lock requests were skipped on iPad. Input mode is now separate from the mobile graphics preset.

## Play

1. Refresh the game and join a room. Press WASD, or click **KEYBOARD** in the HUD.
2. Click the game surface. Move the trackpad pointer to look; near a screen edge the camera keeps turning. Click fires and secondary click aims.
3. Use WASD, Shift sprint, Space jump (keep holding once airborne for jetpack thrust), R reload, F dedicated jetpack, 1–7 weapons, Q dig and E place. Hold Z to aim or Enter to fire. Arrow keys also turn/look. P pauses on keyboards without Escape. Thrust still requires an equipped pack and fuel; releasing Space stops its thrust.
4. Click **TOUCH** to restore the joystick and finger controls. Physical keyboard movement still works in this mode, allowing keyboard movement with touchscreen aiming.

Settings → Input offers **auto**, **touch**, and **keyboard** and saves locally. Auto switches to hardware input on gameplay keys or a genuine mouse/trackpad press, and restores finger controls on a touch gesture. Switching input does not raise the iPad graphics settings.

## Safari fallback

When pointer lock is unavailable or rejected, camera look uses ordinary cursor coordinates, with bounded edge turning. The system cursor stays visible and can reach browser controls; this is a practical fallback, not unlimited raw relative mouse capture. Moving over game UI or leaving the play surface stops edge turning and clears the old coordinates. Pause, blur, hidden tabs and pointer cancellation stop appropriate input. Desktop browsers retain normal pointer lock.

Menus and text fields do not take gameplay keys. Game keys prevent browser scrolling or accidental activation of the previously focused join button. Missing keyboard event codes fall back to the key value. All actions still use the existing authoritative server input protocol; clients do not gain movement, damage or inventory authority.

## Tests and device limits

`tests/controls-view.test.ts` covers touch-independent keyboard movement, fallback key codes, bounded cursor jumps, edge turning and coordinate resets. `npm run test:keyboard` opens a touch-capable iPad-sized Chromium view with pointer lock removed, then checks keyboard movement replication to a real desktop peer, ordinary trackpad look, continuous edge turns, shooting/aiming/reload/jump/jet, arrow look, pause cleanup and touch restoration. It also installs a rejecting pointer-lock method and checks that rejection is handled. `BR_TRANSPORT=http npm run test:keyboard` runs the same checks against the hosted SQL-backed adapter. The test changes browser capabilities only; no debug endpoint or client-state mutation is deployed.

2.12 also accepts compatibility mouse-move events from pointing devices that do not send pointer moves. Death ignores look input and clears held controls on respawn. Earlier browser checks simulate input capabilities; they do not constitute physical Magic Keyboard or iPad Safari testing. Browser QA could not be rerun in the current managed environment because the supported browser-control skill was unavailable. Actual trackpad gestures, browser-edge behavior and fullscreen Home Screen operation still need testing on the user's iPad.
