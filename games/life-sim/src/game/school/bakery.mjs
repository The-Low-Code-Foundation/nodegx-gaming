// Maths at the bakery (after round 16, phase 6: the baker's dough table, work.mjs CAREERS.baker). The same school
// years' maths as Rocket School's, told with croissants, baguettes and tarts: counting trays (CP), baskets (CE1), batches
// and trays shared out (CE2), dough weights (CM1), what the bread costs (CM2), scaling a recipe (6e), what's left of a
// tart (5e). Only asked at the boulangerie (`place`), where its topic comes first. Each skill makes its own question
// (`make(random)` → { prompt, answer, options (the answer first), worked }), as stem.mjs's lab tasks do.
const int = (random, a, b) => a + Math.floor(random() * (b - a + 1));
const pick = (random, list) => list[Math.floor(random() * list.length)];
// The answer and three wrong ones near it (never the answer, never below `min`).
function near(answer, random, steps, min = 0, fmt = String) {
  const out = new Set([fmt(answer)]);
  for (let k = 0; out.size < 4 && k < 40; k++) {
    const v = answer + pick(random, steps) * (random() < 0.5 ? -1 : 1);
    if (v >= min && v !== answer) out.add(fmt(v));
  }
  return [...out];
}
const euros = (cents) => `€${(cents / 100).toFixed(2)}`;
const BAKES = ['croissants', 'pains au chocolat (chocolate croissants)', 'brioches', 'madeleines'];

export const BAKERY_TOPICS = [{ id: 'bakery', subject: 'maths', name: 'At the bakery', place: 'bakery' }];
const skill = (id, year, diff, name, strategy, make) => ({ id, year, subject: 'maths', topic: 'bakery', place: 'bakery', diff, name, strategy, make });

export const BAKERY_SKILLS = [
  skill('bk-trays', 'CP', 0.1, 'Counting the trays', 'Count on from the bigger tray.', (random) => {
    const a = int(random, 2, 6), b = int(random, 1, 4), what = pick(random, BAKES.slice(0, 3));
    return { prompt: `One tray has ${a} ${what}, another has ${b}. How many ${what.split(' (')[0]} altogether?`, answer: a + b, options: near(a + b, random, [1, 2], 1), worked: `${a} + ${b} = ${a + b}.` };
  }),
  skill('bk-baskets', 'CE1', 0.2, 'Baskets of baguettes', 'Count in fives: 5, 10, 15…', (random) => {
    const per = pick(random, [2, 5, 10]), n = int(random, 2, 5);
    return { prompt: `A basket holds ${per} baguettes (long French loaves). How many baguettes are in ${n} baskets?`, answer: per * n, options: near(per * n, random, [per, 1, 2], 1), worked: `${n} × ${per} = ${per * n}.` };
  }),
  skill('bk-batches', 'CE2', 0.35, 'Batches and trays', 'A batch is a times table: 4 batches of 6 is 4 × 6.', (random) => {
    const per = pick(random, [3, 4, 6, 8]), n = int(random, 2, 9), what = pick(random, BAKES);
    if (random() < 0.5) return { prompt: `One batch makes ${per} ${what}. How many in ${n} batches?`, answer: per * n, options: near(per * n, random, [per, 1, 2], 1), worked: `${n} × ${per} = ${per * n}.` };
    return { prompt: `There are ${per * n} ${what} to put on trays of ${per}. How many trays are needed?`, answer: n, options: near(n, random, [1, 2, 3], 1), worked: `${per * n} ÷ ${per} = ${n}.` };
  }),
  skill('bk-dough', 'CM1', 0.45, 'Weighing the dough', '1 kg is 1000 g: four pieces of 250 g make 1 kg.', (random) => {
    const per = pick(random, [150, 200, 250, 300]), n = int(random, 3, 8), g = (v) => `${v} g`;
    return { prompt: `Each baguette needs ${per} g of dough. How much dough for ${n} baguettes?`, answer: g(per * n), options: near(per * n, random, [per, 50, 100], per, g), worked: `${n} × ${per} g = ${per * n} g${per * n >= 1000 ? ` (${(per * n) / 1000} kg)` : ''}.` };
  }),
  skill('bk-money', 'CM2', 0.5, 'At the till', 'Work in cents: €1.20 is 120 cents.', (random) => {
    const [what, cents] = pick(random, [['baguette', 110], ['croissant', 120], ['pain au chocolat', 130], ['éclair (cream-filled pastry)', 250], ['fruit tart (tarte aux fruits)', 320]]), n = int(random, 2, 5);
    return { prompt: `One ${what} costs ${euros(cents)}. How much do ${n} cost?`, answer: euros(cents * n), options: near(cents * n, random, [cents, 10, 100], cents, euros), worked: `${n} × ${cents} cents = ${cents * n} cents = ${euros(cents * n)}.` };
  }),
  skill('bk-recipe', '6e', 0.55, 'Scaling a recipe', 'How many times bigger is the batch? Multiply everything by that.', (random) => {
    const [base, per] = pick(random, [[12, 60], [10, 40], [20, 150], [8, 30]]), k = int(random, 2, 4);
    return { prompt: `A recipe for ${base} macarons (almond biscuits) uses ${per} g of sugar. How much sugar for ${base * k} macarons?`, answer: `${per * k} g`, options: near(per * k, random, [per, per / 2, 10], 10, (v) => `${v} g`), worked: `${base * k} is ${k} × ${base}, so ${k} × ${per} g = ${per * k} g.` };
  }),
  skill('bk-tart', '5e', 0.6, 'What’s left of the tart', 'What’s left is the slices not sold, over all the slices.', (random) => {
    const of = pick(random, [6, 8, 10, 12]), sold = int(random, 1, of - 1), left = of - sold;
    const opts = new Set([`${left}/${of}`, `${sold}/${of}`, `${left}/${sold}`, `${of}/${left}`, `${left + 1}/${of}`]);
    return { prompt: `A tarte aux pommes (apple tart) is cut into ${of} slices. ${sold} are sold. What fraction of the tart is left?`, answer: `${left}/${of}`, options: [...opts].slice(0, 4), worked: `${of} − ${sold} = ${left} slices left, out of ${of}: ${left}/${of}.` };
  })
];
