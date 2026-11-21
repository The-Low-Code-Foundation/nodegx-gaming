// Pets (round 16, phase 5.4): a cat or a dog, one a household. Data and the pet's own needs; the page draws it (a
// Quaternius model, assets/animals/, CREDITS.md) and walks it round the home, and Life does the caring, as for a baby
// (baby.mjs): the pet's basket (`PET_BED`, shop.mjs `kindOf`) offers what can be done for it, each with `pet` (the
// pet's need points a game hour) and `petUntil` (stop once that need is full), and free will sees to a pet whose needs
// are low (life.mjs `score`). Nothing harms a pet: a need run low only makes it sulk (a bubble saying what it wants)
// until someone sees to it. It never grows old, runs away or gets ill.
// Adopted from the stray cat at the door (events.mjs `cat`, the "Keep it" choice), or by phone (`adoptPet`, the cat or
// the dog, for the shelter's fee). On in a game with skills (phase 5), and on a test URL with ?skills=1.
// Words: strings.mjs `pet.<kind>`, `pet.need.<id>`, `pet.wants.<id>`, `action.<offer id>`.
import { urge } from './needs.mjs';

//   model    the GLB (Idle and Walking clips); `height` its height in the room, metres (a little larger than life, to be
//            seen from the game's camera); `speed` its walk, m/s
//   names    the names the card suggests (any name can be typed)
export const PETS = {
  cat: { icon: '🐱', model: 'assets/animals/Cat.glb', height: 0.45, speed: 0.45, names: ['Mimi', 'Tigger', 'Luna', 'Pepper', 'Socks', 'Misty', 'Biscuit', 'Smudge'] },
  dog: { icon: '🐶', model: 'assets/animals/Dog.glb', height: 0.6, speed: 0.7, names: ['Rex', 'Buddy', 'Bella', 'Scout', 'Toffee', 'Max', 'Pickle', 'Daisy'] }
};
export const PET_KINDS = Object.keys(PETS);
// Each runs 0–100 (full) and falls by `decay` points a game hour: a meal twice a day, a game and a cuddle a day.
export const PET_NEEDS = [
  { id: 'hunger', icon: '🥣', decay: 6 },
  { id: 'play', icon: '🧶', decay: 5 },
  { id: 'love', icon: '💕', decay: 4 }
];
// Below this, the pet sulks (says what it wants).
const SULK = 25;
export const MAX_PETS = 1;
// The shelter's fee when adopting by phone (the stray cat is free).
export const ADOPT_FEE = 40;

// What can be done for the pet, at its basket; and the phone call to adopt one (the Sim's own, `self`).
export const PET_OFFERS = {
  petBed: [
    { id: 'feedPet', act: 'interact', clip: 'Interact', minutes: 8, gives: { fun: 5 }, pet: { hunger: 700 }, petUntil: 'hunger', icon: '🥣' },
    { id: 'playPet', act: 'interact', clip: 'mc_stretch', minutes: 20, gives: { fun: 45, energy: -4 }, pet: { play: 300 }, petUntil: 'play', moodlet: 'petPlay', icon: '🧶' },
    { id: 'strokePet', act: 'interact', clip: 'Interact', minutes: 10, gives: { social: 50, fun: 15 }, pet: { love: 600 }, petUntil: 'love', moodlet: 'petCuddle', icon: '💕' }
  ],
  self: [{ id: 'adoptPet', act: 'self', clip: 'mc_phone', hand: 'phone', minutes: 5, gives: {}, free: false, opens: 'pets', icon: '🐾' }]
};
export function addPets(OFFERS) {
  for (const [key, list] of Object.entries(PET_OFFERS)) OFFERS[key] = [...(OFFERS[key] ?? []), ...list.filter((o) => !(OFFERS[key] ?? []).some((x) => x.id === o.id))];
}

export class Pet {
  constructor({ kind = 'cat', name = '', needs = null, adopted = 0 } = {}) {
    Object.assign(this, { kind, name, adopted });
    this.needs = needs ?? { hunger: 80, play: 70, love: 75 };
    this.sulking = null; // the need it sulks for, or null
    this.bed = null; // its basket (page.mjs)
    this.cared = false; // someone is seeing to it this tick (Life `care`)
    this.events = []; // for the page to show once
  }
  get def() {
    return PETS[this.kind];
  }
  // `min` game minutes passed.
  tick(min) {
    for (const n of PET_NEEDS) this.needs[n.id] = Math.max(0, Math.min(100, this.needs[n.id] - (n.decay * min) / 60));
    this.cared = false;
    const low = PET_NEEDS.map((n) => n.id).filter((id) => this.needs[id] < SULK).sort((a, b) => this.needs[a] - this.needs[b])[0] ?? null;
    if (low && low !== this.sulking) this.events.push({ key: `pet.wants.${low}`, vars: { name: this.name } });
    this.sulking = low;
  }
  care(gives, min) {
    this.cared = true;
    for (const [id, rate] of Object.entries(gives)) this.needs[id] = Math.max(0, Math.min(100, this.needs[id] + (rate * min) / 60));
  }
  // How much `offer` would do for it, the way free will weighs a Sim's own needs.
  relief(offer) {
    let r = 0;
    for (const [id, rate] of Object.entries(offer.pet ?? {})) r += urge(this.needs[id]) - urge(Math.min(100, this.needs[id] + (rate * offer.minutes) / 60));
    return r;
  }
  get happy() {
    return PET_NEEDS.every((n) => this.needs[n.id] >= 60);
  }
  saved() {
    return { kind: this.kind, name: this.name, needs: { ...this.needs }, adopted: this.adopted };
  }
}
