// Fear (round 4). Playtest: "Maybe an elevated heartbeat sound and animation when zombies lock onto you and are coming
// … waiting with the heartbeat sound and animation until they get confused and wander off."
// Every frame: how hunted she is. Each infected that has her (chasing, lunging, crawling at her) counts, more the closer
// it is; one searching near her counts a little; hidden, the one standing over her counts by how close it is to finding
// her. That becomes `level` (0 calm … 1 terror): it rises fast and calms slowly. The heart beats at 64 bpm calm and up
// to 180 (heard from level 0.12; louder as it climbs), the view and the vignette throb on every beat (`pulse`), her
// breath comes short and fast, and a sting plays when the first one locks on to her.
export class Fear {
  constructor(world) {
    this.world = world;
    this.level = 0;
    this.pulse = 0; // 1 on a beat, falling
    this.beatIn = 1;
    this.breathIn = 2;
    this.inhale = true;
    this.hunters = 0;
    this.closest = Infinity;
    this.noticed = 0; // the most any one of them has noticed her (hidden)
  }

  update(dt) {
    const w = this.world, p = w.player;
    if (!p) return;
    let threat = 0, hunters = 0, closest = Infinity, noticed = 0;
    for (const z of w.zombies) {
      if (!z.alive) continue;
      const d = Math.hypot(z.pos.x - p.pos.x, z.pos.z - p.pos.z);
      const hunting = z.target === p && (['chase', 'attack', 'stumble'].includes(z.state) || z.down);
      if (hunting) {
        hunters++;
        closest = Math.min(closest, d);
        threat += 0.3 + 0.7 * Math.max(0, 1 - d / 16);
      } else if (z.state === 'search' && d < 9) threat += 0.35 * (1 - d / 9);
      else if (d < 4) threat += 0.2 * (1 - d / 4);
      noticed = Math.max(noticed, z.notice ?? 0);
    }
    if (p.hidden) threat += noticed * 1.4;
    if (p.infected && p.turnIn < 45) threat = Math.max(threat, p.turnIn < 15 ? 1.6 : 1.0);
    const want = Math.min(1, threat / 1.5);
    this.level += (want - this.level) * (1 - Math.exp(-dt * (want > this.level ? 3 : 0.3)));
    // The first one to lock on: a sting.
    if (hunters > 0 && this.hunters === 0 && this.level < 0.45) w.audio?.play('sting');
    this.hunters = hunters;
    this.closest = closest;
    this.noticed = noticed;

    // The heart.
    const bpm = 64 + this.level * 116;
    this.beatIn -= dt;
    if (this.beatIn <= 0) {
      this.beatIn += 60 / bpm;
      if (this.beatIn < 0) this.beatIn = 60 / bpm;
      if (this.level > 0.12) {
        w.audio?.play('heart', null, { gain: 0.2 + this.level * 1.1 });
        this.pulse = 1;
      }
    }
    this.pulse = Math.max(0, this.pulse - dt * 6);

    // Her breath: short and fast when they come (none while she holds it).
    this.breathIn -= dt;
    if (this.breathIn <= 0) {
      const rate = 3.6 - this.level * 2.4;
      this.breathIn = (this.inhale ? 0.42 : 0.58) * rate;
      if (this.level > 0.3 && !p.breathHeld && p.alive) w.audio?.play(this.inhale ? 'breathIn' : 'breathOut', null, { gain: 0.35 + this.level * 0.65 });
      this.inhale = !this.inhale;
    }
  }
}
