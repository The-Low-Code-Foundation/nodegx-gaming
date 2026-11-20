// The ship's event bus: a system says what happened, and whoever cares listens. Damage control does not call the
// career when a job ends; it says `job-end`, and the career (and the integrity, which mends the room) hear it. This is
// what keeps the systems from knowing each other, and `main.mjs` from wiring every one to every other
// (design/ROADMAP.md, phase 2).
//
// Listeners run at once, in the order they were added, inside `emit`: a system that emits can rely on everyone having
// heard before its next line. `C.bus` is the ship's bus (main.mjs makes it), so every system that has the ship has it.
//
// What is said today, and by whom (the payload in braces):
//
//   job        damage.mjs     a damage control job is raised            { job }
//   job-end    damage.mjs     it ended, done or lost                    { job, ok }
//   raid       integrity.mjs  action stations for a raider: send one    { from }   (weapons.mjs answers it)
//   condition  integrity.mjs  condition one set, or stood down          { on }
//   hit        integrity.mjs  a shell struck the ship                   { room, from, holed }
//   breach     integrity.mjs  a hole in the plating                     { room, area }
//   fire       weapons.mjs    a gun big enough to push her fired        { at, impulse }   (world position, N·s)
//   fighter-down weapons.mjs  your fighter is shot dead in space        {}
//   launch     fighter.mjs    a fighter starts her launch run           { pad }
//   landed     fighter.mjs    back on her pad, turned round             { pad, manual }
//   talk       career.mjs     you spoke to one of the officers          { who }
//
// Add a name here when you add one, with who says it. Requests that want an answer (`hooks.rescue(room, done)`, the
// layout's uses, `routine.onMuster` which says whether it spoke) stay as hooks: an event says what happened, it does
// not ask for anything back.

export class Bus {
  constructor() {
    this.map = new Map();
  }

  /** Listens for `type`. Returns a function that stops listening. */
  on(type, fn) {
    if (!this.map.has(type)) this.map.set(type, []);
    this.map.get(type).push(fn);
    return () => this.off(type, fn);
  }

  off(type, fn) {
    const l = this.map.get(type);
    const i = l ? l.indexOf(fn) : -1;
    if (i >= 0) l.splice(i, 1);
  }

  /** Listens for the next `type` only. */
  once(type, fn) {
    const off = this.on(type, (e) => {
      off();
      fn(e);
    });
    return off;
  }

  /** Whether anyone listens for `type`. */
  has(type) {
    return !!this.map.get(type)?.length;
  }

  emit(type, e = {}) {
    const l = this.map.get(type);
    if (l) for (const fn of [...l]) fn(e);
  }
}
