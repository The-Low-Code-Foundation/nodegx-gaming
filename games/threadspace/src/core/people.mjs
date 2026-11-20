// People, one file each: content/people/<id>.json. A person is who they are wherever they serve: `name`, `dept`
// (their uniform's colours: `UNIFORMS` in src/carrier/crew.mjs), `voice` (the browser's speech for a line with no
// recorded clip: `pitch`, `rate`) and `cast` (their recorded voice: tools/voices.mjs). Where they stand is the ship's:
// a ship's career names its officers in `people` ({ id, room, at, yaw, pose }) and its routine names each section's
// `leader` ({ id }), and `joinPeople` fills each in from the person's file. A person can move ships; the post stays.
//
// `read(path)` is how to read a JSON file (src/core/ship.mjs `fetchJson` in the browser, `readFileSync` in node).

export const PEOPLE = 'content/people';

/** The ids of everyone a ship's career `K` and routine `W` name. */
export const peopleNamed = (K, W) => [...new Set([...(K.people ?? []).map((p) => p.id), ...(W.sections ?? []).map((s) => s.leader.id)])];

/** Each person `ids` names, read from their file: a Map by id. */
export async function loadPeople(ids, read, dir = PEOPLE) {
  const people = await Promise.all(ids.map((id) => read(`${dir}/${id}.json`)));
  return new Map(people.map((p) => [p.id, p]));
}

/** The career's officers and the routine's leading hands, each their post with the person filled in (the post's own
 *  fields win). Changes `K` and `W` in place. */
export function joinPeople(K, W, people) {
  const join = (post) => {
    const p = people.get(post.id);
    if (!p) throw new Error(`no ${PEOPLE}/${post.id}.json`);
    return { ...p, ...post };
  };
  K.people = (K.people ?? []).map(join);
  for (const s of W.sections ?? []) s.leader = join(s.leader);
}
