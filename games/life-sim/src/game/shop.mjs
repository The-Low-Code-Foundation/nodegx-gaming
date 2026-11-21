// The buy menu (round 10): things for the flat, bought with the household's money and placed where you click (the game
// waits). Each one is data: what it is (a model from assets/furniture, or one made in world.mjs), how big, what a Sim
// can do with it (`use`, as world.mjs places things; `offers` names its offers in actions.mjs), what it costs, and
// how lovely it makes the flat (`beauty`: a flat lovely enough cheers up whoever is at home, the "Lovely home" moodlet).
// A bed goes first to whoever sleeps on the camp bed (round 9), and the camp bed is folded away.
//   id      its name in strings.mjs (`shop.<id>`, `shop.<id>.does`)
//   kind    its tab: sleep · sit · learn · fun · lovely
//   model   a furniture model's name, or `made`: one of world.mjs's MADE
//   fit     its height in metres, or { width }
//   use     as world.mjs places things; `decor`: nothing to do with it, but it can be clicked (to move or sell it);
//           `trim`: it stands on only the middle of its box (a plant's leaves spread wider than its pot)
//   need    round 14: what a home can't do without ('loo', 'food', 'wash'): the last one of these can't be sold or stored
export const SHOP_KINDS = ['sleep', 'sit', 'kitchen', 'bathroom', 'learn', 'fun', 'lovely'];
export const SHOP = [
  { id: 'bed', kind: 'sleep', icon: '🛏️', price: 120, model: 'Bed_Single', fit: 0.62, use: { act: 'sleep', label: 'Sleep', offers: 'Bed_Single' } },
  { id: 'nightstand', kind: 'sleep', icon: '🗄️', price: 25, model: 'NightStand_1', fit: 0.55, use: { decor: true }, beauty: 1 },
  { id: 'couch', kind: 'sit', icon: '🛋️', price: 90, model: 'Couch_Medium1', fit: 0.85, use: { act: 'sit', label: 'Sit', offers: 'Couch_Medium1' } },
  { id: 'bigCouch', kind: 'sit', icon: '🛋️', price: 140, model: 'Couch_Large1', fit: 0.85, use: { act: 'sit', label: 'Sit', offers: 'Couch_Medium1' }, beauty: 1 },
  { id: 'chair', kind: 'sit', icon: '🪑', price: 25, model: 'Chair_1', fit: 0.95, use: { act: 'sit', label: 'Sit', offers: 'Chair_1' } },
  { id: 'table', kind: 'sit', icon: '🍽️', price: 35, model: 'Table_RoundSmall', fit: 0.75, use: { decor: true } },
  { id: 'bookshelf', kind: 'learn', icon: '📚', price: 80, model: 'Bookshelf', fit: 1.9, use: { act: 'interact', label: 'Read a book', offers: 'Bookshelf' } },
  { id: 'telescope', kind: 'learn', icon: '🔭', price: 150, made: 'TELESCOPE', fit: 1.55, use: { act: 'interact', label: 'Telescope', offers: 'telescope' }, beauty: 1 },
  { id: 'rug', kind: 'fun', icon: '🟤', price: 45, model: 'Carpet_Round', fit: { width: 1.5 }, use: { act: 'dance', label: 'Dance', walkable: true, offers: 'Carpet_Round' }, beauty: 1 },
  { id: 'drawers', kind: 'fun', icon: '👗', price: 60, model: 'Drawer_3', fit: 0.8, use: { act: 'interact', label: 'Change your look', offers: 'drawers' } },
  { id: 'plant', kind: 'lovely', icon: '🪴', price: 20, model: 'Houseplant_6', fit: 1.1, use: { decor: true, trim: 0.5 }, beauty: 1 },
  { id: 'bigPlant', kind: 'lovely', icon: '🌿', price: 30, model: 'Houseplant_1', fit: 1.3, use: { decor: true, trim: 0.5 }, beauty: 1 },
  { id: 'palm', kind: 'lovely', icon: '🌴', price: 30, model: 'Houseplant_4', fit: 1.2, use: { decor: true, trim: 0.5 }, beauty: 1 },
  { id: 'lamp', kind: 'lovely', icon: '💡', price: 30, model: 'Light_Floor1', fit: 1.6, use: { decor: true, trim: 0.6 }, beauty: 1 },
  { id: 'shelf', kind: 'lovely', icon: '🧺', price: 40, model: 'Shelf_Large', fit: 1.8, use: { decor: true }, beauty: 1 },
  // Round 14 (the brief, 11-11: "be able to move, delete or add furniture … a furniture shop"): the flat's own things
  // are in the shop too (so anything in a home can be moved, sold or put away, and bought again), and more besides.
  // Round 15: the big bed is a double bed: two sides (world.mjs twinOf), one for each of a couple (page.mjs shareBeds).
  { id: 'bigBed', kind: 'sleep', icon: '🛏️', price: 200, model: 'Bed_King', fit: 0.7, use: { act: 'sleep', label: 'Sleep', offers: 'doubleBed', double: true }, beauty: 1 },
  { id: 'nightstand2', kind: 'sleep', icon: '🗄️', price: 25, model: 'NightStand_2', fit: 0.55, use: { decor: true }, beauty: 1 },
  { id: 'smallCouch', kind: 'sit', icon: '🛋️', price: 70, model: 'Couch_Small1', fit: 0.85, use: { act: 'sit', label: 'Sit', offers: 'Couch_Medium1' } },
  { id: 'cornerCouch', kind: 'sit', icon: '🛋️', price: 180, model: 'Couch_L', fit: 0.85, use: { act: 'sit', label: 'Sit', offers: 'Couch_Medium1' }, beauty: 1 },
  { id: 'chair2', kind: 'sit', icon: '🪑', price: 30, model: 'Chair_2', fit: 0.95, use: { act: 'sit', label: 'Sit', offers: 'Chair_1' } },
  { id: 'stool', kind: 'sit', icon: '🪑', price: 15, model: 'Stool', fit: 0.65, use: { act: 'sit', label: 'Sit', offers: 'Chair_1' } },
  { id: 'bigTable', kind: 'sit', icon: '🍽️', price: 70, model: 'Table_RoundLarge', fit: 0.75, use: { decor: true }, beauty: 1 },
  { id: 'fridge', kind: 'kitchen', icon: '🧊', price: 90, made: 'FRIDGE', fit: 1.9, use: { act: 'interact', label: 'Get food', offers: 'Kitchen_Fridge', moving: 'fridge' }, need: 'food' },
  { id: 'oven', kind: 'kitchen', icon: '🍳', price: 70, model: 'Kitchen_Oven', fit: 0.92, use: { act: 'interact', label: 'Cook', offers: 'Kitchen_Oven' } },
  { id: 'bigOven', kind: 'kitchen', icon: '🍳', price: 130, model: 'Kitchen_Oven_Large', fit: 0.92, use: { act: 'interact', label: 'Cook', offers: 'Kitchen_Oven' }, beauty: 1 },
  { id: 'kitchenSink', kind: 'kitchen', icon: '🚰', price: 50, model: 'Kitchen_Sink', fit: 0.92, use: { act: 'interact', label: 'Wash up', offers: 'Kitchen_Sink' } },
  { id: 'cupboard', kind: 'kitchen', icon: '🗄️', price: 35, model: 'Kitchen_2Drawers', fit: 0.92, use: { decor: true } },
  { id: 'cupboard3', kind: 'kitchen', icon: '🗄️', price: 40, model: 'Kitchen_3Drawers', fit: 0.92, use: { decor: true } },
  { id: 'toilet', kind: 'bathroom', icon: '🚽', price: 60, model: 'Bathroom_Toilet', fit: 0.8, use: { act: 'sit', label: 'Use the loo', offers: 'Bathroom_Toilet' }, need: 'loo' },
  { id: 'basin', kind: 'bathroom', icon: '🚰', price: 40, model: 'Bathroom_Sink', fit: 0.9, use: { act: 'interact', label: 'Wash hands', offers: 'Bathroom_Sink' } },
  { id: 'shower', kind: 'bathroom', icon: '🚿', price: 90, model: 'Bathroom_Shower1', fit: 2.0, use: { act: 'interact', label: 'Shower', inside: true, walkable: true, solid: true, offers: 'Bathroom_Shower1', moving: 'shower' }, need: 'wash' },
  { id: 'bath', kind: 'bathroom', icon: '🛁', price: 150, model: 'Bathroom_Bathtub', fit: 0.6, use: { act: 'interact', label: 'Have a bath', inside: true, walkable: true, solid: true, offers: 'bath' }, need: 'wash', beauty: 1 },
  { id: 'washer', kind: 'bathroom', icon: '🫧', price: 80, model: 'Bathroom_WashingMachine', fit: 0.85, use: { decor: true } },
  { id: 'tv', kind: 'fun', icon: '📺', price: 100, made: 'TV', fit: 1.28, use: { decor: true, moving: 'tv' } },
  { id: 'fireplace', kind: 'fun', icon: '🔥', price: 160, model: 'Fireplace', fit: 1.1, use: { act: 'interact', label: 'Warm up', offers: 'fireplace' }, beauty: 2 },
  { id: 'rug2', kind: 'fun', icon: '🟫', price: 50, model: 'Carpet_2', fit: { width: 2.0 }, use: { act: 'dance', label: 'Dance', walkable: true, offers: 'Carpet_Round' }, beauty: 1 },
  { id: 'rug3', kind: 'fun', icon: '🟧', price: 55, model: 'Carpet_1', fit: { width: 2.4 }, use: { act: 'dance', label: 'Dance', walkable: true, offers: 'Carpet_Round' }, beauty: 1 },
  { id: 'wideDrawers', kind: 'fun', icon: '👗', price: 70, model: 'Drawer_1', fit: 0.8, use: { act: 'interact', label: 'Change your look', offers: 'drawers' } },
  { id: 'smallPlant', kind: 'lovely', icon: '🌱', price: 15, model: 'Houseplant_3', fit: 0.9, use: { decor: true, trim: 0.5 }, beauty: 1 },
  { id: 'tallPlant', kind: 'lovely', icon: '🪴', price: 25, model: 'Houseplant_2', fit: 1.0, use: { decor: true, trim: 0.5 }, beauty: 1 },
  { id: 'bushyPlant', kind: 'lovely', icon: '🌿', price: 25, model: 'Houseplant_5', fit: 0.8, use: { decor: true, trim: 0.5 }, beauty: 1 },
  { id: 'flowerPot', kind: 'lovely', icon: '🌺', price: 25, model: 'Houseplant_7', fit: 0.7, use: { decor: true, trim: 0.5 }, beauty: 1 },
  { id: 'lamp2', kind: 'lovely', icon: '💡', price: 35, model: 'Light_Floor3', fit: 1.5, use: { decor: true, trim: 0.6 }, beauty: 1 },
  { id: 'lamp3', kind: 'lovely', icon: '🏮', price: 35, model: 'Light_Stand1', fit: 1.5, use: { decor: true, trim: 0.6 }, beauty: 1 }
];

export const shopItem = (id) => SHOP.find((s) => s.id === id);
// What a home must keep one of (round 14): the last loo, the last fridge, the last shower or bath.
export const NEEDED = ['loo', 'food', 'wash'];

// The flat as it comes (round 14): everything world.mjs's lifeHome used to build into it, as shop things, in the order
// it was built (a save's beds and cot are counted in that order). Built like this, each one can be moved, sold or put
// in the boxes. The front door is the flat's own and stays where it is.
const Q = Math.PI / 2;
export const FLAT_FURNITURE = [
  ['bed', -2.55, -1.9, 0], ['nightstand', -1.55, -2.65, 0], ['bookshelf', -0.4, -2.75, 0], ['plant', 0.55, -2.7, 0],
  ['oven', 2.25, -2.65, 0], ['kitchenSink', 1.45, -2.65, 0], ['table', 1.9, -0.2, 0], ['chair', 1.9, 0.55, 2 * Q],
  ['couch', -1.6, 1.9, 2 * Q], ['rug', 0.35, 1.55, 0, 2.2], ['lamp', -2.9, 2.5, 0], ['basin', 3.15, 0.5, 3 * Q],
  ['fridge', 3.1, -2.62, 0], ['toilet', 3.05, 1.35, 3 * Q], ['shower', 2.95, 2.45, 3 * Q], ['tv', -1.35, -0.25, 0],
  ['bed', -2.55, 0.35, 2 * Q]
].map(([id, x, z, turn, width]) => ({ id, x, z, turn, ...(width ? { width } : {}) }));
// The camp bed (round 9) is placed the same way when someone moves in, and saved with what was bought, but never sold.
export const CAMP_BED = { id: 'campBed', made: 'CAMP_BED', fit: 0.53, use: { act: 'sleep', label: 'Sleep', offers: 'Bed_Single' } };
// A cot comes with a baby (round 12, baby.mjs): placed by itself, saved with what was bought, moved like it, never sold.
export const COT = { id: 'cot', icon: '👶', made: 'COT', fit: 1.55, use: { act: 'interact', label: 'Baby', offers: 'cot' } };
// Any thing a home can hold, by its id: the shop's, the camp bed, a cot.
export const kindOf = (id) => (id === 'campBed' ? CAMP_BED : id === 'cot' ? COT : shopItem(id));
// Sold back for half.
export const sellPrice = (s) => Math.floor(s.price / 2);
// A new look at the chest of drawers (clothes and hair; the body is chosen once, when the Sim is made).
export const LOOK_COST = 20;
// How lovely the flat must be (the sum of what is bought) to cheer up whoever is at home.
export const LOVELY = 3;
