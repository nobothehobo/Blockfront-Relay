import { PracticeSession } from "../server/practice.js";
import { TICK } from "../shared/game.js";

let session: PracticeSession | null = null;
let previous = performance.now(),
  accumulator = 0;
globalThis.onmessage = (event: MessageEvent) => {
  try {
    const data = event.data;
    if (data.type === "start") {
      session = new PracticeSession(
        data.options,
        data.name,
        data.classId,
        (message) => globalThis.postMessage(message),
      );
      previous = performance.now();
      accumulator = 0;
    } else if (data.type === "input") session?.input(data.commands, data.epoch);
  } catch (error) {
    globalThis.postMessage({
      type: "error",
      message: `On-device practice: ${(error as Error).message}`,
    });
  }
};
setInterval(() => {
  if (!session) return;
  const now = performance.now();
  // Never replay minutes of simulation after a suspended iPad tab.
  accumulator += Math.min(0.25, (now - previous) / 1000);
  previous = now;
  while (accumulator >= TICK) {
    session.tick();
    accumulator -= TICK;
  }
}, TICK * 1000);
