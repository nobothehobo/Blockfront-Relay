# iPhone / iPad Home Screen app

Open the game in Safari, tap **Share → Add to Home Screen**, keep **Open as Web App** enabled if offered, and tap **Add**. Launch **Blockfront** from its Home Screen icon. It opens in standalone mode without Safari's address/tab bars. Landscape gives the widest view; portrait is also supported. iOS controls its status bar and home indicator; a web app cannot guarantee hiding every system overlay.

If you previously installed a plain shortcut, remove that icon and add it again after refreshing Safari. There is no App Store download or account requirement. Multiplayer requires an internet connection. No service worker caches matches or API responses, so new launches load the current game.

The manifest and Apple-specific metadata provide standalone launch and an original PNG icon. `viewport-fit=cover`, dynamic viewport sizing, and existing safe-area insets protect touch controls. App switching already clears held inputs and pauses controls; return to the app and tap Resume if the match remains connected. iOS may suspend or discard a background game, requiring rejoining.

Desktop and mobile browser checks cover metadata, icon responses, standalone detection and viewport resizing. Physical iPhone/iPad Home Screen installation still needs device verification; browser emulation cannot reproduce Apple's installation UI or system bars.
