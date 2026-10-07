// Stable per-bot variety, independently mixed so team parity does not imply skill.
export function botHash(id: string, seed = 0) {
  let n = seed ^ 2166136261;
  for (const c of id) n = Math.imul(n ^ c.charCodeAt(0), 16777619);
  n = Math.imul(n ^ (n >>> 16), 0x85ebca6b);
  return (n ^ (n >>> 13)) >>> 0;
}
export function botProfile(id: string, seed = 0) {
  const hash = botHash(id, seed),
    skill = hash % 10;
  const tier = skill < 3 ? "rookie" : skill < 8 ? "regular" : "veteran";
  return {
    hash,
    tier,
    style: ["assault", "flanker", "support", "guard"][(hash >>> 4) % 4],
    lane: (hash >>> 8) % 3,
    reaction:
      (tier === "rookie" ? 0.65 : tier === "regular" ? 0.45 : 0.28) +
      ((hash >>> 12) % 8) * 0.025,
    error: tier === "rookie" ? 0.06 : tier === "regular" ? 0.035 : 0.018,
    tracking: tier === "rookie" ? 0.4 : tier === "regular" ? 0.28 : 0.18,
    turn: tier === "rookie" ? 2.4 : tier === "regular" ? 3.1 : 3.6,
    buildDelay: 8 + ((hash >>> 16) % 7),
  };
}
