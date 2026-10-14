export class CombatFeedback {
  target = "";
  amount = 0;
  at = -1000;
  until = 0;
  kind = "hit";
  reset() {
    this.target = "";
    this.amount = 0;
    this.until = 0;
    this.at = -1000;
    this.kind = "hit";
  }
  confirm(target: string, damage: number, now: number) {
    if (!Number.isFinite(damage) || damage <= 0) return;
    this.amount =
      this.target === target && now - this.at < 140
        ? this.amount + damage
        : damage;
    this.target = target;
    this.at = now;
    this.until = now + 500;
    this.kind = "hit";
  }
  highlight(kind: "head" | "kill", now: number) {
    if (kind === "head" && this.kind === "kill" && now < this.until) return;
    this.kind = kind;
    this.until = now + 700;
  }
  label(now: number) {
    if (now >= this.until) return "";
    return this.kind === "kill"
      ? "ELIMINATED"
      : `${Math.round(this.amount)}${this.kind === "head" ? " · HEADSHOT" : " · HIT"}`;
  }
}
