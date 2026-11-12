// A Sim's life: needs that fall with time, moodlets, a to-do list, free will, and the body language that shows how
// they feel. Drives a Sim (sim.mjs) in a place (world.mjs); the page (life/) draws it and passes time in.
// Time is GAME minutes: `tick(minutes, seconds)` gets the game minutes that passed and the real seconds (for bubbles).
// Nothing here can harm a Sim. An empty bar is a problem the Sim solves (they drop everything for the loo), not a loss.
// Two Sims (round 7): one starts an interaction with the other (social.mjs); the other stops what they chose for
// themselves, turns and waits; the first walks over; they take turns talking (or one says something and the other
// reacts); and the bond between them changes. Both sides are a `doing` that points at the other (`other`); the one
// who started it (`role: 'lead'`) runs the clock, the talking turns and the outcome; ending either side ends both.
// A job (round 8, work.mjs): on a work day the Sim drops what they chose and heads out of the door at the career's
// time (`by: 'job'`). Round 9: they go to the office (a place you see; the page follows them), work there until the day
// ends (the needs falling at work's rates), and come home with the pay. The work stations ask the child questions
// (school/school.mjs): right answers pay at once and fill the promotion bar; a full bar at the end of the day promotes.
// Places (round 9): a Sim is in one place at a time (`place`: home, office, park); going somewhere is walking to that
// place's way out and coming in at the other's (`travel`). `homePlace` is where they live: null for a colleague, who
// comes to the office on work days and is somewhere we don't see otherwise (`present` false).
// Childcare (round 13, childcare.mjs): the last one out of a home with a baby goes only if someone will look after it
// (`mayLeave`, the page's); a nanny is a Life too (`carer`): her needs don't fall, and her free will is for the cot.
import * as THREE from 'three';
import { NEEDS, NEED_IDS, MOODLETS, EMOTIONS, moodOf, urge, needIcon } from './needs.mjs';
import { OFFERS, offersFor, offerById, offerIcon } from './actions.mjs';
import { INTERACTIONS, bondOf, lockOf, chanceOf, applyOutcome } from './social.mjs';
import { CAREERS, MOOD_AT_WORK, TASK, careerOf, levelOfJob, nextLevel, timeForWork } from './work.mjs';

// Game minutes a real second at each speed: paused, normal, fast, very fast.
export const SPEEDS = [0, 1, 4, 12];
// Science: game hours of study to reach each level (1–10). Each level takes a little longer than the last.
export const SKILL_LEVELS = [0, 1, 2.5, 4.5, 7, 10, 14, 19, 25, 32, 40];
export const skillLevel = (points) => SKILL_LEVELS.findLastIndex((p) => points >= p);
// Below this, the need cannot wait (the Sim stops what they are doing). Only the ones a body can't put off.
const CRITICAL = { bladder: 4, energy: 3, hunger: 3 };

export class Life {
  constructor(sim, place, { name = 'Sim', needs = null, random = Math.random, household = { money: 0 } } = {}) {
    this.sim = sim;
    this.place = place;
    this.name = name;
    this.random = random;
    this.needs = needs ?? Object.fromEntries(NEED_IDS.map((id) => [id, 55 + random() * 35]));
    this.timed = new Map(); // moodlet id → game minutes left
    this.moodlets = [];
    this.mood = { emotion: 'fine', strength: 0 };
    this.queue = []; // { offer, item, point, by: 'you' | 'self' }
    this.doing = null; // a queue entry, plus started / minutes / before (the needs when it began)
    this.skills = { science: 0 };
    this.freeWill = true;
    this.idleFor = 0;
    this.thought = null; // { icon, text, left (real seconds) } — the bubble over the head
    this.events = []; // messages for the page to show once
    this.fidgetIn = 3;
    this.cheerLeft = 0;
    this.critical = null;
    this.log = []; // what they did and why, for tests and the page: { at, what, by, why, with }
    this.everyone = []; // every Sim in the game (page.mjs); `others` are the ones here with them
    this.places = { home: place }; // every place, by name (page.mjs)
    this.homePlace = place; // where they live (null: a colleague, who lives somewhere we don't see)
    this.present = true; // false while a colleague is not at the office
    this.shift = null; // at work: { endsAt, minutes }
    this.date = null; // { with, after (straight after work), until (game minutes) }
    this.home = null; // their own bed: free will leaves the other one alone
    this.hearts = []; // { icon } to float over the head (the page takes them)
    this.household = household; // { money }: shared by everyone who lives here
    this.job = null; // { career, level, performance (0–100), lastDay (the day they last went) }
    this.card = null; // a card for the page to show: 'jobs' (the jobs going), { kind: 'station', station } (a task)
    this.today = { tasks: {}, coins: 0, right: 0 }; // what they did at work today, for the page
    this.carer = false; // a nanny (round 13): here only for the babies
    sim.freeWill = false;
  }

  // The others here with them, who can be talked to.
  get others() {
    return this.everyone.filter((o) => o !== this && o.present && o.place === this.place);
  }

  // ---- what the player does ----
  // `other`: the Life an interaction is with (social.mjs).
  command(offer, item = null, point = null, other = null) {
    this.queue.push({ offer, item, point, other, by: 'you' });
    // Your plans come before their own: whatever they chose for themselves stops (a nap is cut short, grumpily), and
    // so does a chat someone else started with them. Not work: your plans wait until they are home.
    if (this.doing && this.doing.by !== 'you' && this.doing.by !== 'job') this.stop('you');
  }
  // `i` = -1: what they are doing now; 0…: the waiting ones. A day at work can't be cancelled.
  cancel(i) {
    if (i < 0) this.doing?.by !== 'job' && this.stop('you');
    else if (this.queue[i]?.by !== 'job') this.queue.splice(i, 1);
  }

  // ---- a job (work.mjs) ----
  // Taken after today's leaving time, the first day is the next work day.
  takeJob(career) {
    const now = this.clock?.() ?? 0;
    this.job = { career, level: 0, performance: 0, lastDay: (now % 1440) >= CAREERS[career].leave ? Math.floor(now / 1440) : -1 };
    this.events.push({ key: 'ui.job.taken', vars: { name: this.name, job: `job.${career}.${levelOfJob(this.job).id}` } });
  }
  quitJob() {
    if (!this.job || this.shift || this.doing?.by === 'job') return;
    this.job = null;
    this.events.push({ key: 'ui.job.quit', vars: { name: this.name } });
  }

  // Time to go: once a work day, in its window. Whatever they chose stops (asleep: up they get, no grumbling, it is
  // the alarm); your plans wait in the to-do list until they get there. A colleague (no home we see) just arrives.
  goToWork() {
    const now = this.clock?.() ?? 0, day = Math.floor(now / 1440);
    if (!this.job || this.job.lastDay === day || !timeForWork(this.job, now) || this.shift) return;
    const office = this.places.office;
    if (!office) return;
    const c = careerOf(this.job);
    if (!this.homePlace && (now % 1440) < c.leave + (this.lateBy ?? 0)) return;
    this.job.lastDay = day;
    if (!this.homePlace) {
      // A colleague: in a little after the doors open (`lateBy`), rested and fed from a home we don't see.
      this.present = true;
      for (const id of NEED_IDS) this.needs[id] = Math.max(this.needs[id], 65 + this.random() * 30);
      this.arrive(office);
      return this.startShift(day * 1440 + c.ends);
    }
    if (this.doing) this.stop('work');
    this.queue.unshift({ offer: { id: 'goToWork', act: 'travel', travel: 'office', minutes: 1, gives: {}, icon: '💼', free: false }, by: 'job', endsAt: day * 1440 + c.ends });
    this.say('ui.work.off');
  }

  startShift(endsAt) {
    this.shift = { endsAt, minutes: 0, length: Math.max(10, endsAt - (this.clock?.() ?? 0)) };
    this.today = { tasks: {}, coins: 0, right: 0 };
  }

  // The end of the day at work: whatever they are doing stops, and off they go: home (or a colleague out of sight), or
  // to the park with their date.
  endShift() {
    const shift = this.shift;
    this.shift = null;
    if (this.doing && this.doing.by !== 'job') this.stop('work');
    this.queue = this.queue.filter((e) => e.by !== 'job');
    const date = this.date?.after && this.date.with.place === this.place ? this.date : null;
    const to = date ? 'park' : this.homePlace ? 'home' : 'away';
    this.queue.unshift({ offer: { id: to === 'park' ? 'goDate' : 'goHomeFromWork', act: 'travel', travel: to, minutes: 1, gives: {}, icon: to === 'park' ? '🌹' : '🏠', free: false }, by: 'job' });
    if (this.homePlace) this.payDay(shift);
  }

  // The day's pay (a late start pays the hours they did) and, with the bar full, a promotion.
  payDay(shift) {
    const job = this.job;
    if (!job) return;
    const c = careerOf(job);
    const pay = Math.round(levelOfJob(job).pay * Math.min(1, shift.minutes / (c.ends - c.starts) + 0.05));
    this.household.money += pay;
    this.events.push({ key: 'ui.work.done', vars: { name: this.name, pay } });
    if (nextLevel(job) && job.performance >= 100) this.promote();
  }

  promote() {
    const job = this.job;
    job.level++;
    job.performance = 0;
    this.addMoodlet('promoted');
    this.cheerLeft = 3;
    this.hearts.push({ icon: '🎉' });
    this.events.push({ key: 'ui.job.promoted', vars: { name: this.name, job: `job.${job.career}.${levelOfJob(job).id}`, pay: levelOfJob(job).pay } });
  }

  // ---- places ----
  // In at a place's way in (its door, the park's bus stop), standing about. `away`: a colleague going home, out of sight.
  arrive(place) {
    this.sim.release();
    this.place = place;
    this.sim.home = place;
    this.sim.path = [];
    // Two coming in together (a date, the end of the day) stand side by side, not inside each other.
    const here = this.everyone.filter((o) => o !== this && o.present && o.place === place).map((o) => o.sim.position);
    const spot = place.door.spot.clone();
    for (const [dx, dz] of [[0, 0], [0.7, 0], [-0.7, 0], [0, 0.7], [0, -0.7], [0.7, 0.7], [-0.7, -0.7]]) {
      const p = place.door.spot.clone().add(new THREE.Vector3(dx, 0, dz));
      if (place.grid.free(p) && here.every((h) => h.distanceTo(p) > 0.6)) {
        spot.copy(p);
        break;
      }
    }
    this.sim.position.copy(spot);
    this.sim.group.rotation.y = place.door.facing + Math.PI;
    this.sim.finish();
  }
  travel(to) {
    const d = this.doing;
    this.doing = null;
    // Out of the door at home: not when it would leave a baby on their own (round 13; the page asks who looks after it).
    if (this.place === this.homePlace && to !== 'home' && this.mayLeave && !this.mayLeave(this, d)) return this.sim.finish();
    if (to === 'away') {
      this.present = false;
      this.sim.group.visible = false;
      this.sim.finish();
      return;
    }
    const place = this.places[to];
    if (!place) return;
    this.arrive(place);
    if (d?.offer.travel === 'office') this.startShift(d.endsAt);
    // A date begins at the park: both have the moodlet, and three hours of it.
    if (to === 'park' && this.date) this.date.until ??= (this.clock?.() ?? 0) + 180;
    if (to === 'park' && this.date) this.addMoodlet('date');
    // Round 14: a house in the town has a name of its own (the page's `title`: "Dora's house", "Rose Cottage").
    const title = to !== 'home' && place.house ? this.titleOf?.(place) : null;
    this.events.push(title ? { key: 'ui.arrive.visit', vars: { name: this.name, place: title } } : { key: `ui.arrive.${to}`, vars: { name: this.name } });
    this.onArrive?.(this, place);
  }

  // ---- a work station's task (round 9) ----
  // The page asks the questions while the Sim stands at the station (the game waits). Each answer: a right one pays
  // coins at once, fills the promotion bar and gives the subject's skill. Nothing is lost for a wrong one.
  taskAnswer(station, right) {
    if (!right) return 0;
    const job = this.job;
    const coins = TASK.pay(job?.level ?? 0);
    this.household.money += coins;
    this.today.coins += coins;
    this.today.right++;
    if (job && nextLevel(job)) job.performance = Math.min(100, job.performance + TASK.bar);
    this.learn(station, TASK.skill);
    return coins;
  }
  // A round of questions finished (`asked` of them, `right` right). `more`: they stay at the station for another round.
  taskDone(station, right, asked, more = false) {
    if (asked) this.today.tasks[station] = (this.today.tasks[station] ?? 0) + 1;
    if (asked && right >= Math.ceil(asked * 0.66)) this.addMoodlet('goodWork');
    if (more) return;
    if (this.card?.kind === 'station') this.card = null;
    if (this.doing?.offer.task) this.complete();
  }

  // ---- a date and moving in (round 9) ----
  // A date: at the park, now; or, both at work, straight after it.
  planDate(other) {
    const both = { after: !!(this.shift && other.shift) };
    this.date = { ...both, with: other };
    other.date = { ...both, with: this };
    this.events.push({ key: both.after ? 'ui.date.later' : 'ui.date.now', vars: { name: this.name, other: other.name } });
    if (both.after) return;
    for (const l of [this, other]) l.queue.push({ offer: { id: 'goDate', act: 'travel', travel: 'park', minutes: 1, gives: {}, icon: '🌹', free: false }, by: 'you' });
  }
  endDate() {
    const other = this.date?.with;
    for (const l of [this, other]) {
      if (!l?.date) continue;
      l.date = null;
      if (l.place === l.places.park) {
        if (l.doing && l.doing.by !== 'job') l.stop('date');
        l.queue.push({ offer: { id: 'goHome', act: 'travel', travel: l.homePlace ? 'home' : 'away', minutes: 1, gives: {}, icon: '🏠', free: false }, by: 'self' });
      }
    }
    this.events.push({ key: 'ui.date.over', vars: { name: this.name, other: other?.name } });
  }
  // They come to live here: the page gives them a bed (onMoveIn) and a place in "Who lives here". A colleague keeps their
  // job at the office and now comes and goes from here.
  moveIn(other) {
    other.homePlace = this.homePlace;
    other.household = this.household;
    other.addMoodlet('movedIn');
    this.addMoodlet('movedIn');
    this.events.push({ key: 'ui.movedIn', vars: { name: this.name, other: other.name } });
    this.onMoveIn?.(other);
  }
  // Married (round 12): the bond says so from now on.
  marry(other) {
    bondOf(this, other).married = true;
    for (const l of [this, other]) l.addMoodlet('justMarried');
    this.events.push({ key: 'ui.married', vars: { name: this.name, other: other.name } });
  }
  // A baby (round 12, baby.mjs): the page puts a cot in the flat with the baby in it and asks the baby's name.
  haveBaby(other) {
    for (const l of [this, other]) l.addMoodlet('newBaby');
    this.onBaby?.(this, other);
  }

  // ---- time passes ----
  tick(min, seconds) {
    this.goToWork();
    if (!this.present) return;
    const now = this.clock?.() ?? 0;
    // At work: the needs fall at work's rates; the bar fills a little every hour there; the day ends at its time.
    const shift = this.shift;
    if (shift) {
      shift.minutes += min;
      if (this.job && nextLevel(this.job)) {
        const days = levelOfJob(this.job).days ?? 3, c = careerOf(this.job);
        this.job.performance = Math.min(100, this.job.performance + (100 / (days * (c.ends - c.starts))) * min * (MOOD_AT_WORK[this.mood.emotion] ?? 1));
      }
      if (now >= shift.endsAt) this.endShift();
    }
    if (this.date?.until && now >= this.date.until) this.endDate();
    const d = this.doing;
    const active = d?.started;
    const workSlows = this.shift && this.job ? careerOf(this.job).work.slows : null;
    if (!this.carer) for (const n of NEEDS) this.needs[n.id] -= (n.decay * (active ? d.offer.slows?.[n.id] ?? 1 : 1) * (workSlows?.[n.id] ?? 1) * min) / 60;
    if (d?.other) this.faceThem(d, min);
    if (active) {
      d.minutes += min;
      // An action in parts (round 10: open the fridge, then eat what came out of it): each its own clip.
      if (d.offer.steps) {
        const share = d.minutes / (d.length ?? d.offer.minutes);
        const k = Math.max(0, d.offer.steps.findIndex((st) => share < (st.upTo ?? Infinity)));
        if (k !== (d.step ?? 0)) {
          d.step = k;
          const st = d.offer.steps[k];
          if (st.turn) this.sim.turnTo(this.sim.group.rotation.y + st.turn, () => this.doing === d && this.sim.play(st.clip, { fade: 0.3 }));
          else this.sim.play(st.clip, { fade: 0.3 });
        }
      }
      for (const [id, rate] of Object.entries(d.gives ?? d.offer.gives ?? {})) this.needs[id] += (rate * min) / 60;
      for (const [id, rate] of Object.entries(d.offer.skill ?? {})) this.learn(id, (rate * min) / 60);
      // Seeing to the baby in the cot (round 12): the baby's needs, as `gives` is for their own.
      if (d.offer.baby && d.item?.baby && !d.item.baby.away) d.item.baby.care(d.offer.baby, min);
    } else if (d) {
      // On the way. A thing that can't be reached is given up after a while (not the way to work: they always get there).
      d.waiting += min;
      if (d.waiting > 120 && d.by !== 'job') this.stop('stuck');
    }
    for (const id of NEED_IDS) this.needs[id] = Math.max(0, Math.min(100, this.needs[id]));
    if (active && d.role === 'lead') this.converse(d, min);
    // The other side of an interaction ends when the one who started it does (complete / stop).
    const babyFull = d?.offer.babyUntil && d.item?.baby && d.item.baby.needs[d.offer.babyUntil] >= 99.5;
    if (active && d.role !== 'partner' && (d.minutes >= (d.length ?? d.offer.minutes) || (d.offer.until && this.needs[d.offer.until] >= 99.5) || babyFull)) this.complete();

    for (const [id, left] of [...this.timed]) left - min <= 0 ? this.timed.delete(id) : this.timed.set(id, left - min);
    const had = new Set(this.moodlets);
    this.moodlets = [...Object.keys(MOODLETS).filter((id) => MOODLETS[id].when?.(this.needs, had.has(id))), ...this.timed.keys()];
    for (const id of this.moodlets) if (!had.has(id) && MOODLETS[id].when) this.think(MOODLETS[id].icon, `moodlet.${id}.text`);
    this.mood = moodOf(this.moodlets);

    this.checkCritical();
    if (!this.doing && this.ready()) {
      if (this.queue.length) this.start(this.queue.shift());
      else if (this.freeWill) {
        this.idleFor += min;
        if (this.idleFor >= 3) this.choose();
      }
    }
    this.showFeelings(min, seconds);
  }

  // Standing about with nothing on: free to start something.
  ready() {
    return this.sim.state === 'idle' || this.sim.state === 'fidget';
  }

  // ---- doing things ----
  start(entry) {
    const { offer, item } = entry;
    this.idleFor = 0;
    const d = (this.doing = { ...entry, started: false, minutes: 0, waiting: 0, before: { ...this.needs } });
    this.log.push({ at: this.clock?.() ?? 0, what: offer.id, by: entry.by, why: entry.why ?? null, with: entry.other?.name ?? null });
    if (offer.act === 'social') return this.approach(d);
    // A thing that costs: paid now, or not done ("not enough coins").
    if (offer.cost) {
      if (this.household.money < offer.cost) {
        this.doing = null;
        return this.events.push({ key: 'ui.money.short', vars: { name: this.name, cost: offer.cost } });
      }
      this.household.money -= offer.cost;
    }
    const started = () => {
      if (this.doing !== d) return;
      d.started = true;
      d.before = { ...this.needs };
    };
    this.sim.walkClip = this.needs.energy < 20 || this.mood.emotion === 'sad' ? 'mc_walkSlow' : 'Walk_Loop';
    if (offer.act === 'walk') return this.sim.goTo(entry.point, () => this.doing === d && this.complete());
    // Somewhere else: to this place's way out, and in at the other's.
    if (offer.act === 'travel') return this.place.door ? this.sim.goTo(this.place.door.spot, () => this.doing === d && this.travel(offer.travel)) : this.travel(offer.travel);
    // A work station: the page asks its questions once they are there; it ends when they are answered (taskDone).
    if (offer.task)
      return this.sim.use(item, { act: offer.act, clip: offer.clip, started: () => {
        started();
        if (this.doing !== d) return;
        d.length = Infinity;
        this.card = { kind: 'station', station: item.use.station };
      } }) || ((this.doing = null), this.say('ui.taken'));
    if (offer.act === 'self') return this.sim.doHere(offer.clip, started);
    if (!this.sim.use(item, { act: offer.act, clip: offer.clip, started })) {
      this.doing = null;
      this.say('ui.taken');
    }
  }

  complete() {
    const d = this.doing;
    if (d.other) return this.endTogether(d, 1);
    this.doing = null;
    const o = d.offer;
    if (o.opens) this.card = o.opens;
    if (o.moodlet && (!o.moodletIf || o.moodletIf(d.before))) this.addMoodlet(o.moodlet);
    if (o.babyAfter === 'sleep') d.item?.baby?.fallAsleep();
    if (o.then) {
      // Round 14: a stool or another chair will do, when there is no Chair_1 (anything that offers the same thing).
      const free = (i) => !i.user || i.user === this.sim;
      const item = this.place.items.find((i) => i.name === o.then.item && free(i)) ?? this.place.items.find((i) => !i.gone && free(i) && (i.use?.offers ?? i.name) === o.then.item);
      const next = offerById(o.then.item, o.then.id);
      if (item && next) this.queue.unshift({ offer: next, item, by: d.by, why: d.why });
    }
    this.sim.talkOverride = false;
    this.sim.leave(() => this.sim.finish());
  }

  stop(reason) {
    const d = this.doing;
    if (!d) return;
    // An interaction cut short: what they managed so far counts, and the other one is let go too.
    if (d.other) return this.endTogether(d, d.started ? d.minutes / d.offer.minutes : 0, reason);
    this.doing = null;
    // Woken before they had slept enough (not by the alarm for work).
    if (d.offer.act === 'sleep' && d.started && this.needs.energy < 70 && reason !== 'work') this.addMoodlet('wokenUp');
    // A station's task given up (the card closed by a need that can't wait): the card goes too.
    if (d.offer.task && this.card?.kind === 'station') this.card = null;
    this.sim.talkOverride = false;
    this.sim.leave(() => this.sim.finish());
  }

  // ---- together (social.mjs) ----
  // Why this Sim can't join `asker` right now ('asleep', 'busy'), or null when they can. Free to join: doing nothing,
  // or something they chose for themselves that isn't for a need running low. Your plans for them come first.
  busyFor(asker) {
    const d = this.doing;
    if (!this.present || this.place !== asker.place) return 'away';
    if (d?.offer.act === 'travel') return 'busy';
    if (this.critical || this.queue.some((e) => e.by === 'you' || e.by === 'job')) return 'busy';
    if (!d) return null;
    if (d.offer.act === 'sleep' && d.started) return 'asleep';
    if (d.other || d.by === 'you') return 'busy';
    if (d.why && this.needs[d.why] < 30) return 'busy';
    return null;
  }

  // The one who starts it: the other stops and waits, turned this way; this one walks over (close for a hug).
  approach(d) {
    const other = d.other;
    const busy = other.busyFor(this);
    if (busy) {
      this.doing = null;
      this.events.push({ key: `ui.busy.${busy}`, vars: { name: other.name } });
      return;
    }
    other.join(this, d);
    this.sim.walkClip = this.needs.energy < 20 || this.mood.emotion === 'sad' ? 'mc_walkSlow' : 'Walk_Loop';
    this.sim.goTo(this.besideThem(other, d.offer.close ?? 0.85), () => {
      if (this.doing !== d) return;
      d.arrived = true;
      this.sim.state = 'self';
      this.sim.play('Idle_Loop', { fade: 0.2 });
    });
  }

  // The other side: whatever they chose for themselves stops (and what it would have led on to), and they wait.
  join(lead, ld) {
    if (this.doing) this.stop('asked');
    this.queue = this.queue.filter((e) => e.by === 'you' || e.by === 'job');
    this.idleFor = 0;
    const d = (this.doing = { offer: ld.offer, other: lead, lead: ld, by: 'partner', role: 'partner', gives: ld.offer.partnerGives ?? ld.offer.gives, started: false, minutes: 0, waiting: 0, before: { ...this.needs } });
    ld.role = 'lead';
    ld.partner = d;
    this.log.push({ at: this.clock?.() ?? 0, what: ld.offer.id, by: 'partner', why: null, with: lead.name });
    this.sim.leave(() => {
      if (this.doing !== d) return;
      this.sim.state = 'self';
      this.sim.play('Idle_Loop', { fade: 0.3 });
    });
  }

  // A free spot `dist` from them, on our side if it can be.
  besideThem(other, dist) {
    const from = other.sim.position;
    const dir = this.sim.position.clone().sub(from).setY(0);
    if (dir.lengthSq() < 1e-4) dir.set(0, 0, 1);
    dir.normalize();
    for (const turn of [0, 0.5, -0.5, 1, -1, 1.6, -1.6, 2.3, -2.3, Math.PI]) {
      const p = from.clone().addScaledVector(dir.clone().applyAxisAngle(UP, turn), dist);
      if (this.place.grid.free(p)) return p;
    }
    return from.clone().addScaledVector(dir, dist);
  }

  // Every tick of an interaction, either side: turn to face them; the one who started it begins once both stand there.
  faceThem(d, min) {
    const me = this.sim, them = d.other.sim;
    if (me.state === 'self') me.faceToward(Math.atan2(them.position.x - me.position.x, them.position.z - me.position.z), min);
    if (d.role === 'lead' && !d.started && d.arrived && them.state === 'self' && d.other.doing === d.partner) this.begin(d);
  }

  begin(d) {
    const p = d.partner;
    d.started = p.started = true;
    d.before = { ...this.needs };
    p.before = { ...d.other.needs };
    d.ok = this.random() < chanceOf(d.offer, bondOf(this, d.other), d.other.mood.emotion);
    // Wedding clothes on (round 12), for as long as it goes on.
    if (d.offer.dressUp) this.onDressUp?.([this, d.other], true);
    d.beat = 0;
    d.turn = false;
  }

  // What their bodies do while it goes on. A conversation: turns of 3–6 game minutes, whoever has the turn talks
  // (mouth and hands), the other listens. Anything else: this one says or does it, then (the last 45%) the other reacts.
  converse(d, min) {
    const o = d.offer, p = d.partner, them = d.other;
    if (o.talk) {
      if ((d.beat -= min) > 0) return;
      d.beat = 3 + this.random() * 3;
      d.turn = !d.turn;
      const [speaker, listener] = d.turn ? [this, them] : [them, this];
      speaker.doing.speaking = true;
      listener.doing.speaking = false;
      speaker.sim.play(speaker.talkClip(), { fade: 0.4 });
      listener.sim.play('Idle_Loop', { fade: 0.4 });
      return;
    }
    if (!d.phase) {
      d.phase = 'say';
      d.speaking = o.clip !== 'Idle_Loop';
      p.speaking = false;
      this.sim.play(o.clip ?? this.talkClip(), { fade: 0.3 });
      if (o.react === o.clip) them.sim.play(o.react, { fade: 0.3 }); // a wave back
    } else if (d.phase === 'say' && d.minutes >= o.minutes * 0.55) {
      d.phase = 'react';
      d.speaking = false;
      const clip = d.ok ? o.react : o.failReact ?? 'mc_lookAround';
      p.speaking = !!clip?.startsWith('mc_talk');
      if (clip && clip !== o.clip) them.sim.play(clip, { fade: 0.3 });
      them.think(d.ok ? o.hearts ?? (o.partnerMoodlet ? MOODLETS[o.partnerMoodlet].icon : '🙂') : '😬', `react.${o.id}.${d.ok ? 'ok' : 'fail'}`);
    }
  }

  talkClip() {
    const e = this.mood.emotion;
    return e === 'happy' || e === 'veryHappy' ? 'mc_talkHappy' : e === 'sad' ? 'mc_talkSad' : 'mc_talk';
  }

  // Ends both sides. `done` (0–1): how much of it happened, which is how much it changes the bond; the moodlets and
  // hearts only for one that was finished.
  endTogether(d, done, reason = 'done') {
    const lead = d.role === 'partner' ? d.other : this;
    const ld = d.role === 'partner' ? d.lead : d;
    const partner = ld.other;
    const pd = ld.partner;
    for (const [life, x] of [[lead, ld], [partner, pd]]) {
      if (!x || life.doing !== x) continue;
      life.doing = null;
      life.sim.talkOverride = false;
      life.sim.leave(() => life.sim.finish());
    }
    // Wedding clothes off: a moment after "married!" (they are still in them for the hearts), at once if cut short.
    if (ld.started && ld.offer.dressUp) lead.onDressUp?.([lead, partner], false, ld.ok && done >= 0.999);
    if (!ld.started || done <= 0) return;
    const ix = ld.offer, ok = ld.ok;
    // On a date in the park, a romance grows half as fast again.
    const dating = lead.date?.with === partner && lead.place === lead.places.park;
    const { was, now } = applyOutcome(ix, bondOf(lead, partner), ok, done * (dating && ix.romance ? 1.5 : 1));
    if (done >= 0.999) {
      const mine = ok ? ix.moodlet : 'failMoodlet' in ix ? ix.failMoodlet : 'awkward';
      const theirs = ok ? ix.partnerMoodlet : ix.partnerFailMoodlet;
      if (mine) lead.addMoodlet(mine);
      if (theirs) partner.addMoodlet(theirs);
      if (ok && ix.hearts) for (const life of [lead, partner]) life.hearts.push({ icon: ix.hearts });
      if (!ok) lead.events.push({ key: `ui.fail.${ix.id}`, vars: { name: lead.name, other: partner.name } });
      if (ok && ix.after === 'date') lead.planDate(partner);
      if (ok && ix.after === 'moveIn') lead.moveIn(partner);
      if (ok && ix.after === 'baby') lead.haveBaby(partner);
      if (ok && ix.after === 'marry') lead.marry(partner);
    }
    for (const kind of ['friendship', 'romance'])
      if (now[kind] !== was[kind]) lead.events.push({ key: `ui.bond.${kind}`, vars: { a: lead.name, b: partner.name, level: `${kind}.${now[kind]}` } });
  }

  // ---- free will ----
  // Every offer of every free thing (and the Sim's own), scored by what it would do for the needs: each need's
  // urge now minus its urge after (urge() is steep near empty, so the emptiest bar counts most), a little less the
  // further away it is. One of the best three is picked, the best most often: a Sim is not a machine.
  // `only`: a need that cannot wait; only offers that help it.
  score(only = null) {
    const options = [];
    const hour = ((this.clock?.() ?? 0) % 1440) / 60;
    for (const item of [...this.place.items.filter((i) => i.spot && offersFor(i).length), null]) {
      if (item?.user && item.user !== this.sim) continue;
      if (item && item.owner && item.owner !== this) continue;
      for (const offer of offersFor(item)) {
        if (offer.offered === false || offer.free === false || offer.cost || offer.travel || offer.task) continue;
        if (this.carer && !offer.baby) continue;
        const gives = offer.advertises ?? offer.gives;
        if (only && !(gives[only] > 0)) continue;
        if (!only && offer.when && !offer.when(this.needs, hour)) continue;
        let score = offer.bonus?.(this.needs, hour) ?? 0;
        // The baby's cot (round 12): only for a baby who needs it (awake, and what this does for them counts more than
        // what it does for the Sim: a crying baby comes first).
        if (offer.baby) {
          const care = item?.baby && !item.baby.asleep ? item.baby.relief(offer) : 0;
          if (care < 0.05) continue;
          score += care * 1.5;
        }
        for (const [id, rate] of Object.entries(gives)) {
          const v = this.needs[id];
          score += urge(v) - urge(Math.min(100, v + (rate * offer.minutes) / 60));
        }
        // Studying gives nothing a body needs; a Sim in a good mood with nothing pressing likes to.
        if (offer.skill && this.mood.emotion.endsWith('appy')) score += 0.04;
        const far = item ? item.spot.distanceTo(this.sim.position) : 0;
        options.push({ offer, item, score: score / (1 + far / 8) });
      }
    }
    // The others in the place: the friendly things to do with someone who is free for it.
    for (const other of this.carer ? [] : this.others) {
      if (other.busyFor(this) || other.carer) continue;
      const bond = bondOf(this, other);
      for (const ix of INTERACTIONS) {
        if (!ix.free || (ix.free === 'romance' && bond.romance < 15) || lockOf(ix, bond)) continue;
        if (only && !(ix.gives[only] > 0)) continue;
        let score = 0;
        for (const [id, rate] of Object.entries(ix.gives)) {
          const v = this.needs[id];
          score += urge(v) - urge(Math.min(100, v + (rate * ix.minutes) / 60));
        }
        // Better with someone they like (and worth it however long it takes: a chat is not "far"); on a date, with them.
        score *= 1 + Math.max(0, bond.friendship) / 100;
        if (this.date?.with === other) score *= 2;
        options.push({ offer: ix, other, score: score / (1 + other.sim.position.distanceTo(this.sim.position) / 8) });
      }
    }
    return options.sort((a, b) => b.score - a.score);
  }

  choose(only = null) {
    this.idleFor = 0;
    const top = this.score(only).filter((o) => o.score > 0.01).slice(0, 3);
    if (!top.length) return;
    let r = this.random() * top.reduce((s, o) => s + o.score ** 2, 0);
    const pick = top.find((o) => (r -= o.score ** 2) <= 0) ?? top[0];
    // Why, in one need: the one it does most for, by how much better that need would feel (not by the points: a joke
    // gives more Fun points than Social ones, but a lonely Sim tells one for the company).
    const relief = ([id, rate]) => urge(this.needs[id]) - urge(Math.min(100, this.needs[id] + (rate * pick.offer.minutes) / 60));
    // Work at the desk helps no need (round 9): no reason but the job, and its own icon.
    const why = only ?? Object.entries(pick.offer.advertises ?? pick.offer.gives).sort((a, b) => relief(b) - relief(a))[0]?.[0] ?? null;
    this.think(pick.offer.skill ? '🔬' : why ? needIcon(why) : pick.offer.icon ?? '💭', `action.${pick.offer.id}`);
    this.start({ offer: pick.offer, item: pick.item, other: pick.other, by: 'self', why });
  }

  checkCritical() {
    if (this.carer) return;
    if (this.critical && this.needs[this.critical] > 30) this.critical = null;
    // One at a time: a second need at the bottom waits for the first to be seen to. Without this, two at once took turns
    // cancelling each other every frame, and the Sim never did either (round 8: parked-lifesim-r8-critflap).
    if (this.critical) return;
    for (const [id, low] of Object.entries(CRITICAL)) {
      if (this.needs[id] > low || this.critical === id) continue;
      const o = this.doing?.offer;
      if (o && ((o.advertises ?? o.gives)[id] > 0 || o.then)) continue;
      // At work (or on the way) they see to it there.
      if (this.doing?.by === 'job') continue;
      this.critical = id;
      this.say('ui.critical');
      this.think(needIcon(id), `moodlet.${MOODLET_FOR[id]}.text`);
      // Your plans wait; they come back to them after.
      this.queue = this.queue.filter((e) => e.by === 'you' || e.by === 'job');
      this.stop('critical');
      const best = this.score(id)[0];
      if (best) this.queue.unshift({ offer: best.offer, item: best.item, other: best.other, by: 'self', why: id });
      // Nothing here for it (the park has no loo and no bed): home.
      else if (this.place !== this.homePlace && !this.shift) {
        if (this.date) this.endDate();
        this.queue.unshift({ offer: { id: 'goHome', act: 'travel', travel: this.homePlace ? 'home' : 'away', minutes: 1, gives: {}, icon: '🏠', free: false }, by: 'self', why: id });
      }
      return;
    }
  }

  // ---- feelings ----
  addMoodlet(id) {
    this.timed.set(id, MOODLETS[id].minutes);
    this.think(MOODLETS[id].icon, `moodlet.${id}.text`);
    if (MOODLETS[id].emotion === 'happy' && MOODLETS[id].weight >= 2) this.cheerLeft = 3;
  }

  learn(skill, points) {
    const was = skillLevel(this.skills[skill] ?? 0);
    this.skills[skill] = (this.skills[skill] ?? 0) + points;
    const now = skillLevel(this.skills[skill]);
    if (now > was) {
      this.addMoodlet('learned');
      this.events.push({ key: 'ui.levelUp', vars: { name: this.name, level: now, skill: `skill.${skill}` } });
      this.cheerLeft = 3;
    }
  }

  think(icon, key) {
    this.thought = { icon, key, left: 3.5 };
  }
  say(key) {
    this.events.push({ key, vars: { name: this.name } });
  }

  // The face, the walk, and what they do with themselves standing about: yawning when tired, looking round when
  // bored, a cheer when something good happens.
  showFeelings(min, seconds) {
    const sim = this.sim;
    const d = this.doing;
    sim.moodOverride = d?.started && d.offer.act === 'sleep' ? 'asleep' : EMOTIONS[this.mood.emotion].face;
    sim.talkOverride = !!(d?.started && (d.other ? d.speaking : d.offer.talk));
    if (this.thought && (this.thought.left -= seconds) <= 0) this.thought = null;
    if (!this.ready() || d || this.queue.length) return;
    if (this.cheerLeft > 0) {
      if (sim.state === 'idle') sim.play('mc_cheer', { fade: 0.3 });
      sim.state = 'fidget';
      this.cheerLeft -= seconds;
      if (this.cheerLeft <= 0) (sim.state = 'idle'), sim.play('Idle_Loop', { fade: 0.4 });
      return;
    }
    if (sim.state !== 'idle' || (this.fidgetIn -= min) > 0) return;
    this.fidgetIn = 6 + this.random() * 8;
    const clip = this.needs.energy < 35 ? 'mc_yawn' : this.needs.fun < 35 ? 'mc_lookAround' : this.random() < 0.5 ? 'mc_idle2' : 'mc_lookAround';
    if (!sim.body.clips[clip]) return;
    sim.state = 'fidget';
    sim.play(clip, { once: true, fade: 0.4, then: () => sim.state === 'fidget' && ((sim.state = 'idle'), sim.play('Idle_Loop', { fade: 0.4 })) });
  }

  // What shows while they do it (round 10, props.mjs): what is in their hand, on the table, whether a fridge door is
  // open. Null when they are doing nothing that shows (or are on their way to it).
  get showing() {
    const d = this.doing;
    if (!d?.started || !this.present || d.other) return null;
    const o = d.offer, step = o.steps?.[d.step ?? 0];
    // The baby in their arms is that baby, in their own blanket (round 12).
    const hand = o.hand === 'baby' ? (d.item?.baby ? `baby:${d.item.baby.colour}` : null) : (step ? step.hand : o.hand) ?? null;
    return { offer: o.id, item: d.item ?? null, hand, table: o.table ?? null, open: !!step?.open, sits: o.act === 'sit' };
  }

  // For the page: the to-do list as shown (now first).
  get plan() {
    return [...(this.doing ? [{ ...this.doing, now: true }] : []), ...this.queue].map((e) => ({ ...e, icon: offerIcon(e.offer, needIcon) }));
  }
}

const MOODLET_FOR = { bladder: 'loo', energy: 'sleepy', hunger: 'starving' };
const UP = new THREE.Vector3(0, 1, 0);
