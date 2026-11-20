// A ship's files. A ship is a folder under ships/ (ships/carrier/): `index.json` names the files its layout is split
// into, and the layout is those files' top-level entries joined, in the order `index.json` lists them. Beside them,
// the ship's career, routine and cast (`career.json`, `watches.json`, `voices.json`). The game, the tools and the
// Blender scripts (shipkit.py `load_layout`) all join the same way, so any of them sees one layout object.
//
// `read(path)` is how to read a JSON file: `fetch` in the browser, `readFileSync` in node. `dir` has no trailing slash.

/** The layout of the ship in `dir`, joined from its files. */
export async function loadLayout(dir, read) {
  const index = await read(`${dir}/index.json`);
  const parts = await Promise.all(Object.keys(index.layout).map((f) => read(`${dir}/${f}.json`)));
  const L = {};
  parts.forEach((part, i) => {
    for (const [k, v] of Object.entries(part)) {
      if (k in L) throw new Error(`${dir}: "${k}" is in two of the layout's files`);
      L[k] = v;
    }
  });
  return L;
}

/** `L` cut into its files, by `index.layout` ({ file: [keys] }). Throws on an entry no file takes, so a generator that
 *  adds one says where it goes. */
export function splitLayout(L, index) {
  const files = {}, taken = new Set();
  for (const [f, keys] of Object.entries(index.layout)) {
    files[f] = {};
    for (const k of keys) if (k in L) (files[f][k] = L[k]), taken.add(k);
  }
  const left = Object.keys(L).filter((k) => !taken.has(k));
  if (left.length) throw new Error(`no file in index.json takes ${left.join(', ')}`);
  return files;
}

/** Reading in the browser. */
export const fetchJson = async (path) => {
  const r = await fetch(path);
  if (!r.ok) throw new Error(`${path}: ${r.status}`);
  return r.json();
};
