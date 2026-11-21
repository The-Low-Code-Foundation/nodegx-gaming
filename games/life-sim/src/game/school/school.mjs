// The questions at work (round 9): one place that knows every subject, topic and skill, and asks a question for what
// the child chose. The brief, 10-29: "let the kids choose what they want to practise, and make the menu level based like
// CE2 / 6eme … and within that the sub topics", and "copy the question architecture from the Rocket School".
//
// The skills come from three places, all in one shape ({ id, year, subject, topic, generator, params, name, strategy }):
//   rocket.mjs   Rocket School's maths, French, English and history, and Star Class's science and counting (generated
//                by tools/export-questions.mjs; Rocket School's own engine makes each question)
//   france.mjs   geography for a child in France (Star Class's is Africa's)
//   stem.mjs     round 8's lab questions, as the science topic "In the lab" (the only science for CP and CE1)
//   bakery.mjs   maths told with bread and pastries, asked only at the boulangerie (a skill's `place`)
// A year asks what that year and the two before it teach (Rocket School's rule, cut at two years), its own year most. Never the seeded
// dice: Math.random, as for every question (page.mjs).
import { YEARS, SKILLS as ROCKET_SKILLS, TOPICS as ROCKET_TOPICS, generate } from './rocket.mjs';
import { FRANCE_SKILLS, FRANCE_TOPICS } from './france.mjs';
import { KINDS, taskOfKind } from '../stem.mjs';
import { BAKERY_SKILLS, BAKERY_TOPICS } from './bakery.mjs';

export { YEARS };
export const DEFAULT_YEAR = 'CE2';
// The subjects, each with its station at work (world.mjs `station`), in the order the office shows them.
export const SUBJECTS = ['maths', 'science', 'geography', 'french', 'english', 'history'];

const LAB = KINDS.filter((k) => k.science).map((k) => ({ id: `lab-${k.id}`, year: k.known, subject: 'science', topic: 'lab', lab: k.id, name: k.id, strategy: '' }));
// Star Class's geography stays out for now: it is about Africa (its rivers and capitals), written for Nigerian
// classrooms. Its science stays in (what plants need is the same everywhere).
export const SKILLS = [...ROCKET_SKILLS.filter((s) => s.subject !== 'geography'), ...FRANCE_SKILLS, ...LAB, ...BAKERY_SKILLS];
export const TOPICS = [...BAKERY_TOPICS, ...ROCKET_TOPICS, ...FRANCE_TOPICS, { id: 'lab', subject: 'science', name: 'In the lab' }].filter((t) => SKILLS.some((s) => s.topic === t.id));
// A topic or skill that belongs to one workplace (`place`: the bakery's) is asked only there.
const here = (x, place) => !x.place || x.place === place;
const yi = (y) => YEARS.indexOf(y);
// What a year asks: its own work and the two years before (a 6e player is not asked to count goats).
const REACH = 2;
const inReach = (s, y) => yi(s.year) <= y && yi(s.year) >= y - REACH;

// The topics of a subject a year can choose from: the ones with something in reach (that year or the two before). A subject with
// nothing that young (history in CP) offers its youngest topics, marked with their year.
export function topicsFor(subject, year, place = null) {
  const y = yi(year);
  const rows = TOPICS.filter((t) => t.subject === subject && here(t, place)).map((t) => {
    const skills = SKILLS.filter((s) => s.topic === t.id);
    const first = skills.reduce((m, s) => Math.min(m, yi(s.year)), 99);
    return { id: t.id, name: t.name, count: skills.filter((s) => inReach(s, y)).length, from: YEARS[first] };
  });
  const open = rows.filter((r) => r.count > 0);
  if (open.length) return open;
  const youngest = Math.min(...rows.map((r) => yi(r.from)));
  return rows.filter((r) => yi(r.from) === youngest).map((r) => ({ ...r, above: true }));
}

// What the child has met (Rocket School's model: per skill, the list items they got right), so a list asks the ones
// not yet learned more often, and the same skill isn't asked twice running when there is another.
const model = { skills: {}, lastSkill: '' };

// A question: { skill, prompt, choices (at most four, shuffled), answer (its index), explain }.
export function ask({ subject, topic = null, year = DEFAULT_YEAR, place = null }, random = Math.random) {
  const y = yi(year);
  const all = SKILLS.filter((s) => s.subject === subject && (!topic || s.topic === topic) && here(s, place));
  let pool = all.filter((s) => inReach(s, y));
  if (!pool.length) {
    const youngest = Math.min(...all.map((s) => yi(s.year)));
    pool = all.filter((s) => yi(s.year) === youngest);
  }
  if (pool.length > 1) pool = pool.filter((s) => s.id !== model.lastSkill);
  // This year's work counts most (×3), last year's ×2, older ×1; a harder skill (diff) a little less often.
  const weight = (s) => [3, 2, 1][Math.min(2, Math.max(0, y - yi(s.year)))] * (1.2 - (s.diff ?? 0.5) * 0.4);
  let r = random() * pool.reduce((sum, s) => sum + weight(s), 0);
  const skill = pool.find((s) => (r -= weight(s)) <= 0) ?? pool[0];
  model.lastSkill = skill.id;
  if (skill.lab) {
    const task = taskOfKind(skill.lab, random);
    return { skill, prompt: task.text, choices: task.choices, answer: task.answer, explain: task.explain };
  }
  const q = skill.make ? skill.make(random) : generate(skill, model);
  // Rocket School's options: the answer first, then its distractors. Four at most, shuffled.
  const choices = [...new Set((q.options ?? []).map(String))].slice(0, 4);
  for (let i = choices.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [choices[i], choices[j]] = [choices[j], choices[i]];
  }
  return { skill, prompt: q.prompt, choices, answer: choices.indexOf(String(q.answer)), explain: q.worked || skill.strategy, itemKey: q.itemKey };
}

// After an answer: a list item got right is "learned", and asked less.
export function record(question, right) {
  if (!question.itemKey) return;
  const st = (model.skills[question.skill.id] ??= { items: {} });
  st.items[question.itemKey] = { ok: right };
  st.lastItem = question.itemKey;
}
