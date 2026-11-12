// Special ammo: what the portals give. Standard rounds never run out; these do, and when the last one goes the kind
// leaves the pack until another portal (or a cache, or a brute) gives more. Four tiers, Borderlands' colours. Each kind
// is a few settings read by the hand (weapons.mjs): how it leaves the barrel (`fire`) and what it does where it lands
// (`hit`). Round 4 gave the bow's place to the grappling hook; its special arrows are the multitool's bolts now (same
// ids, so a pack keeps them): quiet, arcing, and they stick where they land.
//   fire: ray (instant, with a range) or a projectile (speed, gravity, bounce, homing, fuse); bolt (an arcing bolt);
//         pellets and spread; dmg; beam (draw the ray); pierce (through creatures); burn (through blocks)
//   hit:  blast {r, dmg}, bore {len, w, h}, shaft {depth, w}, torch, blink, bridge, freeze {r, s}, burn (seconds),
//         chain {n, dmg}, lightning {n, r, dmg}, cluster {n, r, dmg}, singularity {s, r, then}, starfall {n, r, dmg}
export const TIERS = {
  common: { label: 'Common', color: '#e8e8e8' },
  rare: { label: 'Rare', color: '#4aa8ff' },
  epic: { label: 'Epic', color: '#c070ff' },
  legendary: { label: 'Legendary', color: '#ff9a2a' }
};

// The defaults with nothing special loaded.
export const STANDARD = {
  gun: { id: null, name: 'Standard', for: 'gun', color: '#6ad8ff', cool: 0.35, loud: 32, fire: { ray: 120, dmg: 10 }, hit: {} }
};

const A = [];
const gun = (tier, id, name, n, color, text, fire, hit = {}, o = {}) => A.push({ id, name, for: 'gun', tier, n, color, text, fire, hit, cool: 0.5, loud: 32, ...o });
const bolt = (tier, id, name, n, color, text, hit = {}, fire = {}, o = {}) => A.push({ id, name, for: 'gun', tier, n, color, text, fire: { bolt: true, dmg: 10, ...fire }, hit, cool: 0.45, loud: 6, ...o });

// ── the multitool ──
gun('common', 'hollow', 'Hollow-point', 24, '#f0d8a0', 'Opens up when it lands. Three times a standard round.', { ray: 120, dmg: 30 });
gun('common', 'buckshot', 'Buckshot', 16, '#d0b080', 'Nine pellets in a cone. Close up, nothing argues.', { ray: 40, dmg: 6, pellets: 9, spread: 0.07 }, {}, { cool: 0.8 });
gun('common', 'flare', 'Flare', 12, '#ffcf6a', 'Sticks where it lands and burns like a torch. Light a cavern from across it.', { speed: 40, gravity: 5, size: 0.12 }, { torch: true }, { loud: 8 });
gun('common', 'incendiary', 'Incendiary', 20, '#ff6a2a', 'Sets what it hits alight for six seconds.', { ray: 120, dmg: 10 }, { burn: 6 });
gun('common', 'drill', 'Drill bolt', 10, '#c8c0a0', 'Bores a tunnel ten blocks into the rock it hits, tall enough to walk.', { ray: 40, dmg: 10 }, { bore: { len: 10, w: 1, h: 2 } }, { loud: 18 });
gun('rare', 'rocket', 'Rocket', 12, '#ff5030', 'A rocket out of a rifle barrel. Blows a hole three blocks round.', { speed: 32, size: 0.14, trail: true }, { blast: { r: 3, dmg: 60 } }, { cool: 0.9, loud: 48 });
gun('rare', 'cryo', 'Cryo round', 16, '#9ae8ff', 'Freezes everything near where it lands for six seconds.', { ray: 120, dmg: 8 }, { freeze: { r: 2.5, s: 6 } });
gun('rare', 'arc', 'Arc round', 14, '#8ad0ff', 'Lightning that jumps from the one you hit to four more.', { ray: 120, dmg: 20, beam: true }, { chain: { n: 4, dmg: 20 } });
gun('rare', 'laser', 'Laser', 20, '#ff3a5a', 'Straight through every creature in line, and through three blocks of rock.', { ray: 80, dmg: 40, beam: true, pierce: true, burn: 3 }, {}, { cool: 0.25, loud: 14 });
gun('rare', 'blink', 'Blink round', 8, '#b98cff', 'Wherever it lands, you are. Mind the drop.', { speed: 50, size: 0.1 }, { blink: true }, { loud: 6 });
gun('rare', 'bridge', 'Bridge round', 8, '#d8c8a8', 'Lays a bridge of rubble from your feet to where it hits.', { ray: 48 }, { bridge: true }, { loud: 10 });
gun('rare', 'ricochet', 'Ricochet grenade', 10, '#a0ff60', 'Bounces four times, then goes off.', { speed: 22, gravity: 14, bounce: 4, fuse: 4, size: 0.13 }, { blast: { r: 2.5, dmg: 50 } }, { cool: 0.8, loud: 40 });
gun('epic', 'cluster', 'Cluster bomb', 6, '#ffb030', 'Goes off, then throws six smaller ones.', { speed: 20, gravity: 14, size: 0.16 }, { blast: { r: 3, dmg: 50 }, cluster: { n: 6, r: 2, dmg: 30 } }, { cool: 1.2, loud: 50 });
gun('epic', 'seeker', 'Seeker swarm', 6, '#ff70c0', 'Five little rockets that find their own way to something alive.', { speed: 16, pellets: 5, spread: 0.25, homing: 7, size: 0.08, trail: true }, { blast: { r: 1.6, dmg: 30 } }, { cool: 1.0, loud: 40 });
gun('epic', 'excavator', 'Excavator', 6, '#e0a040', 'A tunnel three by three, eighteen blocks deep, in a blink.', { ray: 60 }, { bore: { len: 18, w: 3, h: 3 } }, { cool: 1.0, loud: 24 });
gun('epic', 'singularity', 'Singularity', 4, '#7040ff', 'A small black hole. It pulls everything in, then lets go all at once.', { speed: 14, size: 0.2 }, { singularity: { s: 2.5, r: 12, then: { r: 4.5, dmg: 150 } } }, { cool: 2, loud: 50 });
gun('epic', 'storm', 'Storm caller', 6, '#c0e0ff', 'Calls six bolts of lightning down round where it lands.', { speed: 30, gravity: 8, size: 0.12 }, { lightning: { n: 6, r: 6, dmg: 45 } }, { cool: 1.2, loud: 50 });
gun('legendary', 'nuke', 'Pocket nuke', 2, '#fff070', 'Exactly what it says. Stand well back.', { speed: 16, gravity: 4, size: 0.22, trail: true }, { blast: { r: 9, dmg: 800 } }, { cool: 2, loud: 100 });
gun('legendary', 'shaft', 'Shaft charge', 3, '#ffd080', 'Bores straight down forty blocks, three wide, from wherever it lands. The fastest way into the deep.', { ray: 60 }, { shaft: { depth: 40, w: 3 } }, { cool: 1.5, loud: 30 });
gun('legendary', 'quarry', 'Quarry orb', 3, '#80ffd0', 'Quietly removes a ball of rock twelve blocks across. Nothing else is harmed.', { speed: 24, size: 0.18 }, { blast: { r: 6, dmg: 0, quiet: true } }, { cool: 1.5, loud: 8 });

// ── bolts (the bow's arrows, before round 4): quiet, so the brute hardly hears them ──
bolt('common', 'fire_arrow', 'Fire bolt', 16, '#ff8a2a', 'Sets what it hits alight, and leaves a torch where it sticks.', { burn: 6, torch: true });
bolt('common', 'split_arrow', 'Split bolt', 16, '#e0e0e0', 'Three bolts at once.', {}, { pellets: 3, spread: 0.05 });
bolt('common', 'ice_arrow', 'Ice bolt', 16, '#a0e8ff', 'Freezes what it hits, and anything close, for six seconds.', { freeze: { r: 2, s: 6 } });
bolt('rare', 'bomb_arrow', 'Explosive bolt', 12, '#ff5030', 'Goes off where it lands.', { blast: { r: 2.5, dmg: 45 } }, {}, { loud: 40 });
bolt('rare', 'blink_arrow', 'Blink bolt', 8, '#b98cff', 'Wherever it lands, you are. Quieter than the blink round.', { blink: true });
bolt('rare', 'thunder_arrow', 'Thunder bolt', 10, '#c0e0ff', 'Lightning comes down where it lands.', { lightning: { n: 1, r: 0, dmg: 60 } }, {}, { loud: 40 });
bolt('rare', 'drill_arrow', 'Burrow bolt', 10, '#c8c0a0', 'Bores eight blocks into the rock it hits, quietly.', { bore: { len: 8, w: 1, h: 2 } });
bolt('epic', 'homing_arrow', 'Seeker bolt', 12, '#ff70c0', 'Bends towards the nearest creature in front of you.', {}, { homing: 9 });
bolt('epic', 'volley_arrow', 'Volley bolt', 8, '#f0f0a0', 'Seven bolts in a fan.', {}, { pellets: 7, spread: 0.12 });
bolt('legendary', 'starfall_arrow', 'Starfall bolt', 4, '#fff0a0', 'Where it lands, twelve small stars fall round it.', { starfall: { n: 12, r: 7, dmg: 40 } }, {}, { loud: 60 });

export const AMMO = A;
export const AMMO_BY_ID = Object.fromEntries(A.map((a) => [a.id, a]));

// Where ammo comes from, and how lucky each source is.
export const ODDS = {
  cache: { common: 75, rare: 22, epic: 3, legendary: 0 },
  portal: { common: 28, rare: 42, epic: 23, legendary: 7 },
  brute: { common: 0, rare: 45, epic: 40, legendary: 15 },
  robot: { common: 100, rare: 0, epic: 0, legendary: 0 }
};

// One find: a kind picked by tier (rand gives 0–1), and how many rounds of it.
export function roll(rand, odds) {
  const total = Object.values(odds).reduce((a, b) => a + b, 0);
  let t = rand() * total, tier = 'common';
  for (const [k, w] of Object.entries(odds)) if ((t -= w) < 0) {
    tier = k;
    break;
  }
  const pool = A.filter((a) => a.tier === tier);
  const a = pool[Math.floor(rand() * pool.length)];
  return { id: a.id, n: a.n };
}
