// A Sim's look (round 10): who they are (one of the twelve people: the face stays theirs), rounder or thinner, taller
// or shorter, hair colour and style, and an outfit and its colours. The wardrobe (../wardrobe.mjs, rounds 4–5) does
// the dressing; this file makes the bodies the game uses and says which looks are safe to offer.
//
// Every Sim in the game is a CLONE of their person (sharing geometry and textures). The person's own base body is kept
// untouched, never drawn: it is what lends its hairstyle and outfit to whoever borrows them (the wardrobe reads the
// lender's own meshes, so a lender that had been dressed itself would lend the wrong pieces).
import { dress, describe, partsOf } from '../wardrobe.mjs';

// The colours on offer (the wardrobe page's, round 4).
export const HAIR_COLOURS = ['#17130f', '#3b2417', '#6b4428', '#8a3b1e', '#c2652a', '#d9b26a', '#efe3c8', '#9c9893', '#e87aa8', '#4f7fe0', '#8a58d0'];
export const CLOTH_COLOURS = ['#f4f1ea', '#202124', '#c8344a', '#e8873a', '#f2c94c', '#3f9b5a', '#2f6fd0', '#7a4fd1', '#e889b5', '#8a6a4a', '#5d6d7e'];
export const blankLook = () => ({ weight: 0, height: 1, hair: { style: null, colour: null }, outfit: { from: null, colours: [null, null, null] } });
export const isBlank = (look) => !look || JSON.stringify(look) === JSON.stringify(blankLook());

// The measured catalogue (round 5, `tools/holes-report.mjs --json`): every wearer with every lender's hairstyle and
// outfit, the holes counted. Over `max` pixels a combination is not offered. Missing: everything is offered.
let catalogue = null;
export const loadCatalogue = () => (catalogue ??= fetch('wardrobe/catalogue.json').then((r) => (r.ok ? r.json() : null)).catch(() => null));

export function people(template) {
  const cast = template.cast;
  const indexOf = (name) => cast.findIndex((c) => c.name === name);
  // A person's base, loaded once and kept aside (two asking at once share the one load).
  const loading = new Map();
  async function base(i) {
    if (!template.bases[i]) {
      if (!loading.has(i)) loading.set(i, template.spawn(i));
      await loading.get(i);
    }
    template.bases[i].used = true;
    return template.bases[i];
  }
  const donorOf = async (name) => ({ parts: partsOf((await base(indexOf(name))).body.outer) });
  // What a person lends, once loaded (null before).
  const lends = (i) => {
    const b = template.bases[i];
    return b ? describe(partsOf(b.body.outer)) : null;
  };
  return {
    cast, base, donorOf, indexOf,
    // A body for person `i`, dressed in `look`.
    async body(i, look = null) {
      await base(i);
      const body = await template.spawn(i);
      if (!isBlank(look)) await dress(body, look, donorOf);
      return body;
    },
    // Dress a body again (the chest of drawers at home): a clone's materials are its own, so nobody else changes.
    redress: (body, look) => dress(body, look, donorOf),
    // Can `wearer` (a person index) wear lender `j`'s hairstyle or outfit? Their own always; another's only when it
    // measured clean, and a hairstyle only from someone whose hair lifts off cleanly (not Man 16's light crop).
    async safe(kind, wearer, j) {
      if (j === wearer) return true;
      const c = await loadCatalogue();
      const t = c?.holes?.[kind]?.[cast[wearer].name]?.[cast[j].name];
      if (t && t[0] + t[2] > c.max) return false;
      if (kind === 'hair') return (lends(j) ?? describe(partsOf((await base(j)).body.outer))).lendsHair !== false;
      return true;
    },
    // The fabrics a body's outfit can be recoloured in (for the colour rows), from its last dress.
    fabrics: (result) => (result?.fabrics ?? []).slice().sort((a, b) => a.channel - b.channel)
  };
}

// A random look for person `name` (Surprise me): a lender of the same sex where one is safe.
export async function randomLook(folk, i, random = Math.random) {
  const pick = (list) => list[Math.floor(random() * list.length)];
  const woman = (n) => /^Female/.test(folk.cast[n].name);
  const same = [...folk.cast.keys()].filter((j) => j !== i && woman(j) === woman(i));
  const safeOnes = async (kind) => {
    const ok = [];
    for (const j of same) if (await folk.safe(kind, i, j)) ok.push(j);
    return ok;
  };
  const hairFrom = random() < 0.6 ? pick(await safeOnes('hair')) : null;
  const outfitFrom = random() < 0.6 ? pick(await safeOnes('outfit')) : null;
  return {
    weight: Math.round((random() * 1.6 - 0.8) * 100) / 100,
    height: Math.round((0.95 + random() * 0.1) * 100) / 100,
    hair: { style: hairFrom == null ? null : folk.cast[hairFrom].name, colour: random() < 0.7 ? pick(HAIR_COLOURS.slice(0, 8)) : null },
    outfit: { from: outfitFrom == null ? null : folk.cast[outfitFrom].name, colours: [0, 1, 2].map(() => (random() < 0.6 ? pick(CLOTH_COLOURS) : null)) }
  };
}
