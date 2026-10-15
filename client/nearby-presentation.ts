import type { Vec } from "../shared/game.js";
// Hysteresis prevents a near-plane/interior-body flicker while passing a player.
export function insideCharacter(
  eye: Vec,
  feet: Vec,
  previouslyInside: boolean,
) {
  const height = eye.y - feet.y;
  return (
    height > -0.2 &&
    height < 2.2 &&
    Math.hypot(eye.x - feet.x, eye.z - feet.z) < (previouslyInside ? 0.8 : 0.6)
  );
}
