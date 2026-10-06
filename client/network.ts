import { Input } from "../shared/game.js";
import { packInput } from "../shared/prediction.js";

// The hosted endpoint and WebSocket server both reject bodies over 8 KiB.
// Bound bytes, not just command count: action flags and long floats vary in size.
export const MAX_PENDING_INPUTS = 90;
export function inputPacket(
  metadata: Record<string, unknown>,
  pending: Input[],
) {
  const commands: number[][] = [];
  let body = JSON.stringify({ ...metadata, commands });
  for (const command of pending.slice(0, 64)) {
    const compact = packInput(command);
    const candidate = JSON.stringify({
      ...metadata,
      commands: [...commands, compact],
    });
    if (new TextEncoder().encode(candidate).byteLength > 7000) break;
    commands.push(compact);
    body = candidate;
  }
  return { body, lastSeq: commands.at(-1)?.[0] };
}

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
export async function requestJson(
  url: string,
  options?: RequestInit,
  timeout = 5000,
) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new ApiError(
        data.error ?? `Server error ${response.status}`,
        response.status,
      );
    }
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}
