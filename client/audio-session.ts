// Safari's ambient Web Audio category can be silent with the ringer muted.
// Use only after a user gesture; normal game master/effects mute still applies.
// https://bugs.webkit.org/show_bug.cgi?id=237322#c6
type SessionNavigator = { audioSession?: { type: string } };
export function requestPlaybackSession(nav: SessionNavigator, refresh = false) {
  try {
    if (!nav.audioSession) return "unsupported";
    if (refresh) nav.audioSession.type = "auto";
    nav.audioSession.type = "playback";
    return nav.audioSession.type;
  } catch {
    return "unavailable";
  }
}
