// The arsenal, as data. Two hands: one two-handed gun (SMG, shotgun, rifle), one pistol, one melee weapon, and the
// knife she always has. Noise is how far a shot carries to the infected, in metres.
export const WEAPONS = {
  pistol: { name: 'Pistol', hands: 1, slot: 'pistol', mag: 12, reserve: 36, rate: 0.28, spread: 0.012, aimSpread: 0.004, pellets: 1, noise: 22, knock: 0.6, reload: 1.6, ammoType: 'pistol', clipName: 'Pistol' },
  smg: { name: 'SMG', hands: 2, slot: 'long', mag: 30, reserve: 60, rate: 0.085, spread: 0.03, aimSpread: 0.012, pellets: 1, noise: 24, knock: 0.5, reload: 2.2, ammoType: 'smg', auto: true, clipName: 'Pistol' },
  shotgun: { name: 'Pump shotgun', hands: 2, slot: 'long', mag: 6, reserve: 12, rate: 0.9, spread: 0.06, aimSpread: 0.045, pellets: 8, noise: 32, knock: 2.2, reload: 2.8, ammoType: 'shells', clipName: 'Pistol' },
  rifle: { name: 'M7 rifle', hands: 2, slot: 'long', mag: 20, reserve: 40, rate: 0.16, spread: 0.014, aimSpread: 0.003, pellets: 1, noise: 30, knock: 1.1, reload: 2.4, ammoType: 'rifle', clipName: 'Pistol' },
  bat: { name: 'Baseball bat', hands: 2, slot: 'melee', melee: true, reach: 1.7, swing: 0.8, stun: 1.6, noise: 6, clipName: 'Sword_Attack' },
  knife: { name: 'Knife', hands: 1, slot: 'knife', melee: true, reach: 1.1, swing: 0.5, stun: 0.6, noise: 3, clipName: 'Punch_Jab' }
};

// What a pickup on the floor is: the map letter → what it gives.
export const PICKUPS = {
  P: { kind: 'ammo', ammoType: 'pistol', amount: 12, label: 'Pistol clip' },
  A: { kind: 'ammo', ammoType: 'shells', amount: 6, label: 'Shells' },
  G: { kind: 'weapon', weapon: 'shotgun', label: 'Pump shotgun' },
  U: { kind: 'weapon', weapon: 'smg', label: 'SMG' },
  H: { kind: 'weapon', weapon: 'bat', label: 'Baseball bat' },
  M: { kind: 'medkit', amount: 50, label: 'Medkit' },
  K: { kind: 'ammo', ammoType: 'pistol', amount: 24, label: "Officer's spare clips" },
  Y: { kind: 'weapon', weapon: 'rifle', label: 'M7 rifle' }
};

// The skills, powered up between floors. Each level adds the step.
export const SKILLS = {
  stealth: { name: 'Stealth', what: 'The infected hear and see you from less far', step: 0.12 },
  resistance: { name: 'Resistance', what: 'A bite takes less off your time', step: 0.15 },
  health: { name: 'Health', what: '+20 health', step: 20 },
  oneHanded: { name: 'One-handed accuracy', what: 'A steadier pistol', step: 0.15 },
  twoHanded: { name: 'Two-handed accuracy', what: 'Steadier long guns', step: 0.15 },
  melee: { name: 'Melee strength', what: 'Harder swings, longer stuns', step: 0.2 }
};
