// The voices of the other captains. A party in a mission (mission.mjs) answers a hail in two layers:
//   1. the rules decide which moves are open to her right now (accept, counter, withdraw, attack…);
//   2. a voice picks one of those moves and says it in her own words.
// The voice is a local model (Gemma E4B through Ollama, behind tools/llm-server.mjs's /api/llm) when one answers and
// the page was opened with `?llm=on`; otherwise (the default, and any static host) the script below. The model never owns the game's state:
// it returns { say, effect, move, price } and mission.mjs checks every field against the rules before using it.

export const EFFECTS = ['insulted', 'unmoved', 'impressed', 'frightened'];
const DEFAULT_MODEL = 'gemma4:e4b-it-qat';

export class Voices {
  constructor({ model = null, off = false } = {}) {
    this.model = model || DEFAULT_MODEL;
    this.state = off ? 'off' : 'unknown'; // unknown → live | off
    this.why = off ? 'AI voices are off (see README to turn them on)' : '';
    this.queue = Promise.resolve();
    this.fails = 0;
    this.lastMs = null;
    this.calls = 0;
    this.answered = 0;
  }

  get live() {
    return this.state === 'live';
  }

  label() {
    if (this.state === 'live') return `Gemma · live${this.lastMs ? ` · ${(this.lastMs / 1000).toFixed(1)} s` : ''}`;
    if (this.state === 'unknown') return 'waking Gemma…';
    return `scripted${this.why ? ` · ${this.why}` : ''}`;
  }

  /** Is there a model behind the server, and will it answer inside `timeout`? The first call loads it into memory,
   *  which is the slow part (seconds on a quiet machine, minutes on a 16 GB one with another model loaded). */
  async wake(timeout = 60000) {
    if (this.state === 'off') return false;
    try {
      const r = await fetch('api/llm', { signal: AbortSignal.timeout(4000) });
      const info = r.ok ? await r.json() : null;
      if (!info?.ok) return this.turnOff(info?.error ?? 'no model server here');
      if (!info.models.includes(this.model)) return this.turnOff(`${this.model} is not installed`);
    } catch {
      return this.turnOff('no model server here');
    }
    const r = await this.raw({ system: 'Answer in JSON.', turns: [{ role: 'user', content: 'Radio check. Reply {"say":"ready"}.' }], schema: { type: 'object', properties: { say: { type: 'string' } }, required: ['say'] }, timeout, max: 12 });
    if (this.state === 'off') return false; // skipped while it was loading
    if (!r) return this.turnOff(`no answer in ${Math.round(timeout / 1000)} s`);
    this.state = 'live';
    return true;
  }

  turnOff(why) {
    this.state = 'off';
    this.why = why;
    return false;
  }

  /** One JSON answer from the model, or null (off, late, or not JSON). Calls run one at a time. */
  ask(opts) {
    if (this.state !== 'live') return Promise.resolve(null);
    const run = () => this.raw(opts);
    const p = this.queue.then(run, run);
    this.queue = p;
    return p;
  }

  async raw({ system, turns, schema, timeout = 20000, max = 140, temperature = 0.85 }) {
    const t0 = performance.now();
    this.calls++;
    try {
      const r = await fetch('api/llm', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        signal: AbortSignal.timeout(timeout),
        body: JSON.stringify({ model: this.model, stream: false, think: false, keep_alive: '30m', format: schema, options: { temperature, num_predict: max, num_ctx: 4096 }, messages: [{ role: 'system', content: system }, ...turns] })
      });
      if (!r.ok) throw new Error(`http ${r.status}`);
      const out = JSON.parse((await r.json()).message.content);
      this.lastMs = performance.now() - t0;
      this.fails = 0;
      this.answered++;
      return out;
    } catch {
      // Two in a row late or broken: the rest of the mission is scripted, so nobody waits on a voice that is not coming.
      if (this.state === 'live' && ++this.fails >= 2) this.turnOff('Gemma stopped answering');
      return null;
    }
  }
}

/** The schema a party's answer must fit: her words, how your message landed, one of the moves open to her. */
export function replySchema(moves) {
  return { type: 'object', properties: { say: { type: 'string' }, effect: { type: 'string', enum: EFFECTS }, move: { type: 'string', enum: moves }, price: { type: 'integer' } }, required: ['say', 'effect', 'move'] };
}

/** A model's words made safe to show: one line, no stage directions, no quotes round it, not a novel. */
export function cleanSay(s) {
  if (typeof s !== 'string') return '';
  let t = s.replace(/\*[^*]*\*/g, ' ').replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim();
  t = t.replace(/^["'“”]+|["'“”]+$/g, '').trim();
  if (t.length > 260) {
    const cut = t.slice(0, 260);
    t = cut.slice(0, Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('! '), cut.lastIndexOf('? ')) + 1) || cut + '…';
  }
  return t;
}

// --- the script ----------------------------------------------------------------------------------------------------
// What each party says for each move when no model is answering. `{price}`, `{ship}`, `{you}`, `{hauler}`, `{left}`
// are filled from the mission. Three lines a move, picked by the mission's own seeded dice.

const LINES = {
  rook: {
    open: [
      '{you}. This is {me} of the {ship}. The {hauler} is mine, and so is everyone aboard her. {price} credits and you can have them back. My thread opens in {left}.',
      'Kestrel, {me}, {ship}. You are late. The {hauler} has a new owner and a price: {price} credits. When my thread opens in {left}, the price is gone and so is she.',
      'I see you, Kestrel. {me} speaking. {price} credits buys the {hauler} and her crew. You have {left}. Do not waste it shouting at me.'
    ],
    openHot: [
      'You came in shooting, {you}, so we are shooting. Call your guns off and we can still talk about {price} credits.',
      'That was a mistake, Kestrel. My raiders will take you apart, or you can stand down and pay {price} for the {hauler}.',
      '{me}, {ship}. You started this. Stop firing and I might stop too.'
    ],
    hold: ['The price is {price}. It was {price} a minute ago too.', 'I have heard nothing that changes anything. {price} credits.', 'Words, {you}. I am still here, and so is my price: {price}.'],
    threaten: [
      'Careful. My prize crew has orders about the {hauler}’s airlocks if this goes badly.',
      'Keep talking like that and I stop talking. {price} credits, or you can watch her go through the thread.',
      'One more like that and my raiders come for you. {price}.'
    ],
    counter: ['You are a long way short. {price} credits, and that is me being kind.', 'No. But I can do {price}, because I would rather be paid than shoot.', '{price}. That is as far as I come today.'],
    accept: ['Done. Send the credits and my people come off the {hauler}. A pleasure, {you}.', 'Paid is paid. The {hauler} is yours. Do not follow us.', 'We have a deal. My prize crew is coming out now. Keep your guns cold.'],
    withdraw: ['Not worth the hull. Take your hauler, {you}. The {ship} is leaving.', 'Enough. She is yours. I know when a prize costs more than it pays.', 'Fine. Fine! Keep her. We are gone.'],
    attack: ['I am done talking. All ships: weapons free on the Kestrel.', 'You have used up my patience, {you}. Raiders, take her.', 'Then we do it the loud way.'],
    taunt: ['You wanted a fight, {you}. Here it is.', 'Talk to my turrets.', 'Too late for words. Unless they are "I surrender".'],
    ceasefire: ['Hold fire. Hold fire! All right, Kestrel: talk.', 'Guns cold, everyone. You have my attention, {you}.', 'Stop. We both lose ships this way. Say what you came to say.'],
    escort: ['That was one of mine. You will pay for that one way or another.', 'You killed my wing. The price just went wrong for both of us.', 'I felt that. Do not think it makes me softer.'],
    concord: ['Concord. You called Concord. That changes the mathematics.', 'Patrol ships on my scope. You brought the law into this, {you}.', 'So that is your play. Concord on the thread.'],
    half: ['Half your time is gone, {you}. {price} credits. I am not getting more patient.', 'Clock is running, Kestrel. {left} until my thread. {price}.', 'Still waiting on {price} credits. {left}.'],
    final: ['Two minutes. After that the {hauler} comes with me and nobody pays anybody.', 'Last call, {you}. {price} or goodbye.', 'My thread is spinning up. Decide.'],
    broken: ['We had a deal! All ships, turn and burn: kill the Kestrel.', 'You shoot at a paid captain? Then die a cheat.', 'Deal breaker. Raiders, on her!'],
    boarded: ['You are aboard my prize. Bold. Stupid, but bold.', 'Get off the {hauler}, {you}, or I open fire on your frigate.', 'So you would rather steal her back. Then we are done talking.'],
    leaving: ['We are leaving. Stay out of my wake.', 'Business is finished, {you}.', 'Nothing more to say. Fly safe, or do not.']
  },
  master: {
    plead: ['Kestrel, this is {me} on the {hauler}. There are {souls} of us in the mess with guns on us. Whatever you are going to do, do it soon.', 'Still here, Kestrel. Still alive. They are jumpy. Please hurry.', 'I cannot say much, they are listening. Just get us out.'],
    tell: ['Kestrel, {me}, {hauler}. Quickly, before they cut this: {secret}', 'Listen. I overheard them. {secret}', 'They think I cannot hear the bridge from here. {secret}'],
    free: ['They are gone. They are really gone. Kestrel, we are making for the Haven thread. Thank you.', 'The {hauler} is ours again. Running for the thread now. I owe you a drink and a ship.', 'Engines up. We are leaving. Bless you, Kestrel.'],
    run: ['We are under way but they are shooting at us! Keep them off, Kestrel!', 'Running for the thread. Cover us!', 'We are free and they are furious. Stay close!']
  },
  concord: {
    refuse: ['Kestrel, Concord patrol {ship}. Negative. I have no orders for Cinder Reach and no ships to spare.', 'I hear you, Kestrel. I cannot help you. Concord out.', 'Not our lane today, Kestrel. You took the contract.'],
    absent: ['Kestrel, this is Concord relay. The nearest patrol is forty minutes from you. You are on your own.', 'Relay here. Nothing within reach of you, Kestrel. Sorry.', 'No patrol can reach you before that thread opens.'],
    stall: ['Say again, Kestrel. Who is holding the hauler, and with what?', 'I need more than that to move a patrol. What exactly is out there?', 'Convince me it is worth burning the fuel, Kestrel.'],
    come: ['Understood, Kestrel. {ship} is coming through the Haven thread. {eta} out. Do not start without us.', 'A Rook corvette holding Guild crew: that I can move for. {eta}, Kestrel. Hold on.', 'On our way. {eta}. Keep them talking.'],
    inbound: ['Still inbound, Kestrel. {eta}.', 'We are burning as fast as she goes. {eta}.', 'Hold on. {eta}.'],
    arrive: ['Concord patrol on station. Rook vessels: cut your drives and release the hauler.', '{ship} through the thread. Weapons hot. Kestrel, we have your flank.', 'This is Concord. Rooks, you are done here.'],
    here: ['We are here, Kestrel. Point us at them.', 'On station. Your call.', 'In the fight with you, Kestrel.']
  }
};

/** A scripted line for `party` making `move`. `rnd` is the mission's dice. */
export function scriptedLine(party, move, vars, rnd = Math.random) {
  const set = LINES[party]?.[move] ?? LINES[party]?.hold ?? ['…'];
  return set[Math.floor(rnd() * set.length)].replace(/\{(\w+)\}/g, (m, k) => (vars[k] !== undefined ? String(vars[k]) : m));
}

/** How a message lands on a party with no model to judge it: a few words that read as a threat, an insult or reason,
 *  weighed by her temperament and a roll. Deliberately crude: the model is the one that listens properly. */
export function scriptedEffect(text, temper, rnd = Math.random) {
  const t = text.toLowerCase();
  if (/\b(coward|scum|idiot|fool|filth|trash|bitch|bastard|pathetic|stupid)\b/.test(t)) return 'insulted';
  const scare = { proud: 0.3, greedy: 0.45, desperate: 0.65, cold: 0.2, weary: 0.5, 'by the book': 0.4, frightened: 0.7, stubborn: 0.3 }[temper] ?? 0.4;
  if (/\b(destroy|blow|kill|fire on|guns|board|boarding|concord|patrol|navy|bounty|fuel|fumes|outgunned|last chance)\b/.test(t)) return rnd() < scare ? 'frightened' : 'unmoved';
  if (/\b(please|deal|fair|both|walk away|nobody|no one|respect|reasonable|honou?r|word)\b/.test(t)) return rnd() < 0.55 ? 'impressed' : 'unmoved';
  return 'unmoved';
}
