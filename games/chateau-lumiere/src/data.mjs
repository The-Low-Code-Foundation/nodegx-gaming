// The rules as numbers (SCOPE.md §6): how hard each depth hits, what each room holds, what each reward does.
// Everything here is data so a playtest can retune it without touching the battle.

export const START = { maxHp: 100, maxMp: 30, power: 10, ward: 0 };
export const SPELL_COST = 5; // a Sparkle
export const BONK = 0.4; // with no magic left, the staff hits for this share of a spell
export const BRILLIANT = 1.5; // answered in the first third of the time
export const WAKE_HP = 0.3; // what a knockout leaves you with, back in the Hall

// The clock (a setting): seconds to answer, or 0 for none.
export const TIMERS = { relaxed: 45, normal: 30, brisk: 20, off: 0 };

// A depth's creatures: how hard one hit is before ward, and how much each can take.
export const DEPTHS = { 1: { hit: 20, hp: 30 }, 2: { hit: 34, hp: 30 }, 3: { hit: 50, hp: 60 }, 4: { hit: 100, hp: 120 }, 5: { hit: 150, hp: 200 } };

export const CREATURE_NAMES = {
  moth: 'Tatter Moth', soot: 'Soot Sprite', grimoire: 'Grumpy Grimoire',
  // Round 2, the Swan Wing: the same three kinds of curse, wearing that wing's colours (creatures.mjs VARIANTS).
  offkey: 'Off-Key Sprite', nibble: 'Nibble Moth', crumb: 'Crumb Sprite', queen: 'Midnight Moth Queen',
  // Round 3, the gardens and the first floor: the same three kinds again, in new colours.
  bramble: 'Bramble Moth', mudsprite: 'Mud Sprite', dustbunny: 'Dust Bunny', smudge: 'Smudge Sprite', sketchbook: 'Sulky Sketchbook',
  diary: 'The Locked Diary'
};
// What each one was before the curse, said when it is freed.
export const FREED = {
  moth: 'The Tatter Moth was a silk butterfly all along!',
  soot: 'The Soot Sprites were the hearth’s fire fairies!',
  grimoire: 'The Grumpy Grimoire was a storybook that nobody read any more!',
  offkey: 'The Off-Key Sprites were the piano’s little hammer fairies!',
  nibble: 'The Nibble Moth and the Crumb Sprite were the tea room’s sugar fairies!',
  crumb: 'The Nibble Moth and the Crumb Sprite were the tea room’s sugar fairies!',
  queen: 'The Midnight Moth Queen was Madame Lune, the moonlight butterfly who taught the château to dance!',
  bramble: 'The Bramble Moths were the garden’s bud fairies, who open the roses every morning!',
  mudsprite: 'The Mud Sprites were the stable’s grooming fairies, who make the ponies shine!',
  dustbunny: 'The Dust Bunnies were the nursery’s tidy-up fairies, who put every toy to bed!',
  smudge: 'The Smudge Sprite and the Sulky Sketchbook were the studio’s brush fairy and its favourite sketchbook!',
  sketchbook: 'The Smudge Sprite and the Sulky Sketchbook were the studio’s brush fairy and its favourite sketchbook!',
  diary: 'The Locked Diary was great-aunt’s own diary, and it remembers everything!'
};

// The rooms. `hub` is the place whose door leads in: the Grand Hall (round 1), the Swan Gallery (round 2), which
// opens with the key the Grumpy Grimoire was keeping, or (round 3) the Gardens, out of the front doors, and the
// Starlit Landing, up the Hall's staircase once the Ballroom is won. `hp` (optional) is each creature's health
// instead of its depth's.
export const ROOMS = [
  {
    id: 'dressing', name: 'The Dressing Room', depth: 1, creatures: ['moth'],
    blurb: 'Gowns and hats, eaten to rags by something with wings.',
    reward: 'wardrobe'
  },
  {
    id: 'kitchen', name: 'The Kitchen', depth: 2, creatures: ['soot', 'soot'],
    blurb: 'The ovens are cold, and the soot is moving.',
    reward: 'chef'
  },
  {
    id: 'library', name: 'The Library', depth: 4, creatures: ['grimoire'],
    blurb: 'Deep in the château. Something in there is very, very grumpy.',
    reward: 'staff'
  },
  {
    id: 'music', hub: 'gallery', name: 'The Music Room', depth: 3, creatures: ['offkey', 'offkey'],
    blurb: 'A grand piano that plays wrong notes all by itself.',
    reward: 'fig'
  },
  {
    id: 'tearoom', hub: 'gallery', name: 'The Tea Room', depth: 4, creatures: ['nibble', 'crumb'], hp: 70,
    blurb: 'Teacups rattling, and something nibbling in the cake stands.',
    reward: 'praline'
  },
  {
    id: 'ballroom', hub: 'gallery', name: 'The Ballroom', depth: 5, creatures: ['queen'],
    blurb: 'The biggest room in the château, dark as midnight. Something huge is waltzing in there.',
    reward: 'ball'
  },
  // Round 3, outside: the Gardens are open from the start, as gentle as the first rooms.
  {
    id: 'rosegarden', hub: 'garden', name: 'The Rose Garden', depth: 2, creatures: ['bramble', 'bramble'],
    blurb: 'The roses have gone grey, and the brambles are wriggling.',
    reward: 'basile'
  },
  {
    id: 'stables', hub: 'garden', name: 'The Stables', depth: 3, creatures: ['mudsprite', 'mudsprite'], hp: 45,
    blurb: 'Hay everywhere, a sad little whinny, and something squelching in the straw.',
    reward: 'etoile'
  },
  // Round 3, upstairs: the Starlit Landing, past the thorns on the Hall's staircase (they wither with the Ballroom).
  {
    id: 'nursery', hub: 'landing', name: 'The Nursery', depth: 4, creatures: ['dustbunny', 'dustbunny'], hp: 110,
    blurb: 'Toys everywhere, and the dust is hopping about on its own.',
    reward: 'buttons'
  },
  {
    id: 'studio', hub: 'landing', name: 'The Painting Studio', depth: 4, creatures: ['smudge', 'sketchbook'], hp: 120,
    blurb: 'Easels knocked over, paint up the walls, and something is scribbling on them.',
    reward: 'palette'
  },
  {
    id: 'bedchamber', hub: 'landing', name: 'The Royal Bedchamber', depth: 5, creatures: ['diary'], hp: 300,
    blurb: 'Great-aunt’s own room, shut for a hundred years. Something in there guards her secrets.',
    reward: 'locket'
  }
];
for (const r of ROOMS) r.hub ??= 'hall';
// The places with doors to rooms (no fight in them).
export const HUBS = { hall: 'The Grand Hall', gallery: 'The Swan Gallery', landing: 'The Starlit Landing', garden: 'The Gardens' };
// How the hubs join: each one off the Hall, by which of the Hall's doors (`door`), opened by winning which room
// (`opens`, none = always open). The Hall's front doors lead out to the Gardens; its staircase up to the Landing.
export const HUB_LINKS = {
  gallery: { from: 'hall', door: 'wing', opens: 'library' },
  landing: { from: 'hall', door: 'stairs', opens: 'ballroom' },
  garden: { from: 'hall', door: 'out' }
};
export const roomsIn = (hub) => ROOMS.filter((r) => r.hub === hub);
export const roomById = (id) => ROOMS.find((r) => r.id === id);

// The surprises. `gives` changes the heroine's numbers; `opens` is the room's feature once it is won.
export const REWARDS = {
  wardrobe: {
    title: 'The Enchanted Wardrobe',
    text: 'The wardrobe sighs open: gowns, capes and hats, all yours. And on the hook, the Starlight Cloak: creatures’ hits now hurt half as much.',
    gives: { ward: 1 }, item: 'Starlight Cloak', opens: 'wardrobe', icon: '👗'
  },
  chef: {
    title: 'Chef Mirabelle',
    text: '“Finally! Someone to bake with!” The castle chef is back, with her spoon-wand. Bake a Magic Cake with her: a cake heals you completely, even in a fight.',
    gives: {}, opens: 'cakes', icon: '🎂'
  },
  staff: {
    title: 'The Moonlit Staff',
    text: 'On the reading desk, glowing: the Moonlit Staff. Your spells now hit twice as hard.<br><br>Tucked in the Grimoire’s pages: a <b>silver swan key</b>. The Swan Wing is open! And Archivist Hoot the owl is back at the desk, with books to read.',
    gives: { power: 20 }, item: 'Moonlit Staff', opens: 'books', icon: '🌙'
  },
  fig: {
    title: 'Maestro Fig',
    text: 'A little frog in a tailcoat hops onto the piano. “Bravo! It is in tune again!” He teaches you the Song of Courage: <b>+50 health</b>. Play the piano with him!',
    gives: { maxHp: 50 }, opens: 'piano', icon: '🎹'
  },
  praline: {
    title: 'Chef Praline',
    text: '“Mirabelle is my big sister!” The tea room’s pastry chef is back, and she bakes biscuits. And on the cake stand, the <b>Sugar-Glass Charm</b>: creatures’ hits now hurt only a third as much.',
    gives: { ward: 1 }, item: 'Sugar-Glass Charm', opens: 'biscuits', icon: '🍪'
  },
  ball: {
    title: 'The Ball',
    text: 'The chandeliers light one by one. Madame Lune, the moonlight butterfly, gives you the <b>Dawn Staff</b>: spells hit harder than ever. Ballgowns and a moon crown wait in the Dressing Room’s wardrobe. Now: shall we dance?',
    gives: { power: 30 }, item: 'Dawn Staff', opens: 'dance', icon: '👑'
  },
  basile: {
    title: 'Basile the Gnome',
    text: '“My roses! My beautiful roses!” A little gnome in a red hat pops out of a flowerpot. Basile is the château’s gardener. He gives you a flask of <b>Rose Water</b>: <b>+10 magic</b>. Help him grow magic flowers! A rose crown and petal dresses wait in the wardrobe.',
    gives: { maxMp: 10 }, item: 'Rose Water', opens: 'flowers', icon: '🌹'
  },
  etoile: {
    title: 'Étoile the Pegasus Foal',
    text: 'A little white horse with wings peeks out of her stall. It’s Étoile, a pegasus foal! She nuzzles your hand and drops a silver <b>Lucky Horseshoe</b> into it: <b>+30 health</b>. She’s very muddy, though… Will you groom her?',
    gives: { maxHp: 30 }, item: 'Lucky Horseshoe', opens: 'pony', icon: '🐴'
  },
  buttons: {
    title: 'Captain Buttons',
    text: 'Rat-a-tat! A tin soldier marches out of the toy box and salutes. “Captain Buttons, at your service!” The toys have sewn you a <b>Patchwork Shield</b>: creatures’ hits now hurt only a quarter as much. Fancy a game of pairs?',
    gives: { ward: 1 }, item: 'Patchwork Shield', opens: 'toys', icon: '🧸'
  },
  palette: {
    title: 'Madame Palette',
    text: '“Magnifique!” The lady in the great portrait steps right out of her frame, brush in hand. Madame Palette gives you her <b>Rainbow Brush</b>: <b>+15 magic</b>, and new hair colours for the wardrobe. Shall we paint?',
    gives: { maxMp: 15 }, item: 'Rainbow Brush', opens: 'paint', icon: '🎨'
  },
  locket: {
    title: 'The Heart Locket',
    text: 'Great-aunt’s diary flutters open and sighs: “At last, someone kind.” Inside its cover, the <b>Heart Locket</b> (<b>+50 health</b>) and her own <b>Star Staff</b>: your spells are the strongest yet. A starlight gown and a star crown wait in the wardrobe. And the diary has a star map to show you…',
    gives: { maxHp: 50, power: 40 }, item: 'Heart Locket', opens: 'stars', icon: '💖'
  }
};

// The heroine's numbers from what she has won.
export function stats(save) {
  const s = { ...START };
  for (const id of save.won) {
    const g = REWARDS[roomById(id)?.reward]?.gives ?? {};
    if (g.ward) s.ward += g.ward;
    if (g.power) s.power = Math.max(s.power, g.power);
    if (g.maxHp) s.maxHp += g.maxHp;
    if (g.maxMp) s.maxMp += g.maxMp;
  }
  // Hoot's Owl Quill, for a star in every book (the Library's reading nook).
  if (save.quill) s.maxMp += 10;
  return s;
}

// What one hit from a creature of this depth costs her now.
export const hitFor = (depth, st) => Math.round(DEPTHS[depth].hit / (1 + st.ward));
// How many hits from full health knock her out in there.
export const hitsToKnockOut = (depth, st) => Math.ceil(st.maxHp / hitFor(depth, st));

// The bag: potions found in the Hall, cakes from the kitchen.
export const ITEMS = {
  heart: { name: 'Heart Potion', icon: '💗', text: 'Gives back 50 health.', hp: 50, mp: 0, max: 3 },
  star: { name: 'Star Potion', icon: '💙', text: 'Gives back 15 magic.', hp: 0, mp: 15, max: 3 },
  cake: { name: 'Magic Cake', icon: '🍰', text: 'Fills your health and magic right up.', hp: 999, mp: 999, max: 2 },
  biscuit: { name: 'Biscuit', icon: '🍪', text: 'Gives back 40 health and 10 magic.', hp: 40, mp: 10, max: 4 }
};
// Which room's reward puts an item in the bag (until then it is not shown).
export const ITEM_FROM = { cake: 'kitchen', biscuit: 'tearoom' };
export const POTION_RESPAWN = 45; // seconds

// The wardrobe: what she can wear. `from` = the room that gives it (null = from the start).
export const WARDROBE = {
  hat: [
    { id: 'none', name: 'No hat', from: null },
    { id: 'witch', name: 'Sorceress hat', from: null },
    { id: 'tiara', name: 'Star tiara', from: 'dressing' },
    { id: 'bow', name: 'Big bow', from: 'dressing' },
    { id: 'crown', name: 'Moon crown', from: 'ballroom' },
    { id: 'roses', name: 'Rose crown', from: 'rosegarden' },
    { id: 'starcrown', name: 'Star crown', from: 'bedchamber' }
  ],
  cape: [
    { id: 'none', name: 'No cape', from: null },
    { id: 'starlight', name: 'Starlight Cloak', from: 'dressing' },
    { id: 'rose', name: 'Rose cape', from: 'dressing' },
    { id: 'midnight', name: 'Midnight cape', from: 'ballroom' },
    { id: 'riding', name: 'Riding cape', from: 'stables' },
    { id: 'stars', name: 'Cape of stars', from: 'bedchamber' }
  ],
  dress: [
    { id: 'violet', name: 'Violet', top: '#b9a3ff', skirt: '#6b4bc9', from: null },
    { id: 'rose', name: 'Rose', top: '#ffd0e4', skirt: '#e0558f', from: 'dressing' },
    { id: 'mint', name: 'Mint', top: '#d6fff0', skirt: '#3fb59a', from: 'dressing' },
    { id: 'midnight', name: 'Midnight', top: '#9fb4ff', skirt: '#232a6b', from: 'dressing' },
    { id: 'sunny', name: 'Sunshine', top: '#fff2b8', skirt: '#f0a92e', from: 'dressing' },
    { id: 'moonlight', name: 'Moonlight ballgown', top: '#eef2ff', skirt: '#9aa8e8', from: 'ballroom' },
    { id: 'royal', name: 'Royal blue ballgown', top: '#c9d6ff', skirt: '#2f4bc4', from: 'ballroom' },
    { id: 'rosegold', name: 'Rose-gold ballgown', top: '#ffe2d0', skirt: '#e08a78', from: 'ballroom' },
    { id: 'starry', name: 'Starry-night ballgown', top: '#8f80e0', skirt: '#1a1450', from: 'ballroom' },
    { id: 'petal', name: 'Rose petal', top: '#ffe0ea', skirt: '#f0607a', from: 'rosegarden' },
    { id: 'buttercup', name: 'Buttercup', top: '#fff8d0', skirt: '#ffd23a', from: 'rosegarden' },
    { id: 'meadow', name: 'Meadow', top: '#e8ffd8', skirt: '#5ab84a', from: 'rosegarden' },
    { id: 'riding', name: 'Riding habit', top: '#f6f0e4', skirt: '#2f6b4a', from: 'stables' },
    { id: 'sailor', name: 'Sailor', top: '#ffffff', skirt: '#2a4a9a', from: 'nursery' },
    { id: 'goldgown', name: 'Starlight ballgown', top: '#fff6d8', skirt: '#d8a93a', from: 'bedchamber' }
  ],
  hair: [
    { id: 'chestnut', name: 'Chestnut', color: '#ffffff', from: null },
    { id: 'gold', name: 'Golden', color: '#ffe08a', from: 'dressing' },
    { id: 'pink', name: 'Candy pink', color: '#ffb3d1', from: 'dressing' },
    { id: 'silver', name: 'Moon silver', color: '#e6ecff', from: 'dressing' },
    { id: 'blue', name: 'Night blue', color: '#8fa8ff', from: 'dressing' },
    { id: 'lilac', name: 'Lilac', color: '#d9b8ff', from: 'music' },
    { id: 'caramel', name: 'Caramel', color: '#ffd2a0', from: 'tearoom' },
    { id: 'coral', name: 'Coral', color: '#ff9a8a', from: 'studio' },
    { id: 'mint', name: 'Mint', color: '#b8ffe0', from: 'studio' },
    { id: 'sunset', name: 'Sunset', color: '#ffb070', from: 'studio' }
  ]
};
export const DEFAULT_LOOK = { hat: 'witch', cape: 'none', dress: 'violet', hair: 'chestnut' };
