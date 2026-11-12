// Districts (DIG-007): a district file is data (which style, how big, how ruined, where near, what is carved where,
// which of their practices it holds, any secret, any tuning find), and this module turns it into a settlement in a
// cave and puts each text on a readable spot the settlement left standing. Deterministic: the same seed and the same
// file always give the same texts in the same places. No text is in this module; the files are in districts/ (the
// game's folder), listed in districts/index.json, and their styles are in districts/styles.json.
//
// The kinds of text and their lengths are KINDS below (CLAUDE.md describes the whole district format).

// Each kind of text: its length in characters (spaces counted), and the anchors it may sit
// on, best first. A reading-stone is one of their practices, told as theirs.
export const KINDS = {
  lintel: { len: [20, 80], on: ['lintel', 'song', 'statue', 'mural'] },
  mural: { len: [20, 120], on: ['mural', 'statue', 'lintel', 'song'] },
  statue: { len: [20, 120], on: ['statue', 'mural', 'lintel', 'song'] },
  song: { len: [40, 300], on: ['song', 'lintel', 'mural', 'statue', 'tablet', 'note'] },
  note: { len: [60, 400], on: ['note', 'tablet'] },
  tablet: { len: [150, 500], on: ['tablet', 'note'] },
  stone: { len: [200, 700], on: ['tablet', 'statue', 'note', 'mural'] }
};
export const TITLE_MAX = 40;
export const TEXTS = [20, 40]; // a district, all texts together (the secret's included)
export const SHELF = ['tablet', 'note']; // anchors that hold more than one text (a shelf of tablets)
export const MAX_PAGES = 4;
export const TUNING_REACH = [30, 60]; // the pulse's starting reach is 28
export const SIZES = ['few', 'village', 'town'];
export const WAYS = ['behind']; // how a secret is reached: sealed behind the wall a named text is carved on

const len = (s) => [...(s || '')].length;

// Which texts go where. Anchors in the engine's order; texts in the file's order. First each text takes the first free
// anchor of its own kind, then the first free one it may sit on; what is left goes onto the shelves as extra pages
// (round the shelves in turn, at most MAX_PAGES on one), then onto any anchor. Returns a Map anchor.n → [text ids]
// and the ids left over (none unless the settlement has no anchors at all).
export function assignTexts(anchors, texts) {
  const out = new Map();
  const list = anchors.filter((a) => !a.secret).slice().sort((a, b) => a.n - b.n);
  const free = new Set(list.map((a) => a.n));
  const left = [];
  const take = (t, kinds) => {
    for (const k of kinds)
      for (const a of list)
        if (free.has(a.n) && a.kind === k) {
          free.delete(a.n);
          out.set(a.n, [t.id]);
          return true;
        }
    return false;
  };
  const pass1 = texts.filter((t) => !take(t, [KINDS[t.kind]?.on[0] ?? t.kind]));
  for (const t of pass1) if (!take(t, KINDS[t.kind]?.on ?? [])) left.push(t);
  const spill = (pool, t) => {
    let best = null;
    for (const a of pool) {
      const n = out.get(a.n)?.length ?? 0;
      if (n < MAX_PAGES && (!best || n < best.n)) best = { a, n };
    }
    if (!best) return false;
    out.set(best.a.n, [...(out.get(best.a.n) ?? []), t.id]);
    return true;
  };
  const shelves = list.filter((a) => SHELF.includes(a.kind));
  const rest = [];
  for (const t of left) if (!spill(shelves, t) && !spill(list, t)) rest.push(t.id);
  return { at: out, left: rest };
}

// A district into a cave generator's settlement engine: added where it was placed before (`at`), else placed near the
// ship by its own rule. Then the texts go on, and the secret (if any) is sealed behind the anchor its way names.
// Returns { S, at, texts: Map anchor.n → [text objects], left: [ids], secret: anchor | null } or null if it found no
// place.
export function buildDistrict(cave, d, style, at = null) {
  const settle = cave.settle;
  let S;
  if (at) S = settle.add({ ...d, style, at });
  else {
    const b = cave.base();
    S = settle.place({ ...d, style }, { x: b.x, z: b.z }, { dist: d.place?.dist, depth: d.place?.depth });
  }
  if (!S) return null;
  S.district = d;
  const byId = new Map([...(d.texts ?? []), ...(d.secret?.texts ?? [])].map((t) => [t.id, t]));
  const { at: where, left } = assignTexts(S.anchors, d.texts ?? []);
  let secret = null;
  if (d.secret) {
    // The chamber goes by the anchor the way's text landed on. When the rock there will not hold one (a lintel between
    // two rooms has open space all round), the way's text trades places with the first text, in anchor order, whose
    // anchor will: the secret stays by its text, on every seed.
    const way = d.secret.way?.text;
    const home = [...where].find(([, ids]) => ids.includes(way))?.[0];
    if (home != null) {
      const order = [home, ...S.anchors.filter((a) => !a.secret && a.n !== home && where.get(a.n)?.length === 1).map((a) => a.n)];
      for (const n of order) {
        secret = settle.sealChamber(S, S.anchors.find((x) => x.n === n), { cache: !!d.secret.cache });
        if (!secret) continue;
        if (n !== home) {
          const there = where.get(n);
          where.set(n, [way]);
          where.set(home, where.get(home).map((id) => (id === way ? there[0] : id)));
        }
        break;
      }
    }
    if (secret) where.set(secret.n, d.secret.texts.map((t) => t.id));
  }
  const texts = new Map([...where].map(([n, ids]) => [n, ids.map((id) => byId.get(id))]));
  S.texts = texts;
  return { S, at: S.d.at, texts, left, secret };
}

// The texts at a readable cell, if a district put any there: { S, anchor, texts }.
export function textsAt(cave, x, y, z) {
  const hit = cave.settle.anchorAt(x, y, z);
  if (!hit || !hit.S.texts) return null;
  const texts = hit.S.texts.get(hit.a.n);
  return texts?.length ? { S: hit.S, anchor: hit.a, texts } : null;
}

// A fingerprint of a built district: where it is, which texts are on which cells, the chamber. Two loads, two
// machines, the browser and Node must print the same one (AC2).
export function fingerprint(built) {
  const { S } = built;
  const parts = [`at ${S.d.at.x},${S.d.at.y},${S.d.at.z}`, `box ${S.box.join(',')}`];
  for (const a of S.anchors.slice().sort((p, q) => p.n - q.n)) parts.push(`${a.n}:${a.kind}@${a.at.join(',')}=${(S.texts.get(a.n) ?? []).map((t) => t.id).join('+')}`);
  if (S.chamber) parts.push(`chamber ${S.chamber.box.join(',')} ${S.chamber.way}`);
  let h = 2166136261;
  for (const ch of parts.join('|')) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
  return h.toString(16).padStart(8, '0');
}

// A fingerprint of the blocks a district writes: its box (and its road's) stamped in 16-block chunks, hashed.
export function blockPrint(cave, S) {
  const U = S.roadBox ? S.box.map((v, i) => (i < 3 ? Math.min(v, S.roadBox[i]) : Math.max(v, S.roadBox[i]))) : S.box;
  const n = 16, data = new Uint8Array(n * n * n);
  let h = 2166136261;
  for (let oy = Math.floor(U[1] / n) * n; oy <= U[4]; oy += n)
    for (let oz = Math.floor(U[2] / n) * n; oz <= U[5]; oz += n)
      for (let ox = Math.floor(U[0] / n) * n; ox <= U[3]; ox += n) {
        data.fill(254);
        if (!cave.settle.stampChunk(data, ox, oy, oz, n)) continue;
        for (let i = 0; i < data.length; i++) h = Math.imul(h ^ data[i], 16777619) >>> 0;
      }
  return h.toString(16).padStart(8, '0');
}

export { len as textLength };
