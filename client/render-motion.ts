import {
  move,
  TICK,
  type Body,
  type Input,
  type World,
} from "../shared/game.js";

// Render the unsimulated fraction of a tick on a copy. This removes the 30 Hz
// camera staircase without changing commands, authoritative state or collisions.
export function renderBody(
  body: Body & { zombie?: boolean; jetpack?: boolean },
  input: Input,
  world: World,
  remainder: number,
): Body {
  const presented = { ...body };
  const dt = Math.max(0, Math.min(TICK, remainder));
  if (dt > 0) {
    move(
      presented,
      { ...input, jump: false },
      world,
      dt,
      body.zombie,
      body.jetpack,
    );
    // Stair climbing belongs to accepted simulation, not fractional presentation.
    if (presented.y - body.y > 0.5) {
      presented.x = body.x;
      presented.y = body.y;
      presented.z = body.z;
    }
  }
  return presented;
}
