// The HUD, the field notes, the terminal, and the title / pause / death / end screens. Plain DOM.

// The ten observations a scientist can make in this level. The game writes them down the first time you see the
// behaviour; the end card counts them.
export const NOTES = [
  { id: 'skitter-sound', who: 'Skitters', title: 'They hunt by sound', text: "They're blind. They turn to sound: footsteps, gunfire, anything that clatters. Crouched (C), I'm almost silent.", hint: 'What do they follow?' },
  { id: 'skitter-leap', who: 'Skitters', title: 'The chatter before the leap', text: 'They chatter, low and fast, just before they leap. That is my cue to step aside.', hint: 'Listen before they jump.' },
  { id: 'skitter-soft', who: 'Skitters', title: 'Soft bodies', text: 'One good swing of the wrench, or three rounds.', hint: 'Bring one down.' },
  { id: 'cans-lure', who: 'Skitters', title: 'A can draws them', text: 'A thrown can (G) pulls them off. They swarm whatever they hear.', hint: 'Something from the vending machine…' },
  { id: 'skitter-drag', who: 'Skitters', title: "They don't kill us. They take us", text: "When someone goes down, they don't eat them. They drag them, alive, to the crystals.", hint: 'What happens to the ones they catch?' },
  { id: 'tender-light', who: 'Tenders', title: "Skitters won't cross its light", text: "The tall drifting one, call it a Tender: the Skitters won't cross its light. Inside it, I'm safe from them. So is anyone I leave there.", hint: 'What are they afraid of?' },
  { id: 'tender-crystal', who: 'Tenders', title: 'A gardener', text: 'It tends the crystals. They brighten under its touch, and the Skitters feed at them. It is farming.', hint: 'Watch the tall one work.' },
  { id: 'tender-shard', who: 'Tenders', title: 'It follows a shard', text: 'Hold a crystal shard (3) and it drifts after me, light and all. Throw the shard and it goes to plant it, wherever it lands.', hint: 'What does a gardener want?' },
  { id: 'tender-killed', who: 'Tenders', title: 'I killed the gardener', text: 'The crystals dimmed. It screamed, and everything in the hold heard it.', hint: 'A choice, not a requirement.' },
  { id: 'bulwark-plates', who: 'Bulwarks', title: 'Plates turn bullets', text: 'Bullets glance off its front plates. Shooting it head-on is a waste.', hint: 'Try it head-on.' },
  { id: 'bulwark-stun', who: 'Bulwarks', title: 'It charges blind', text: "It charges in a straight line and can't stop. When it slams into something solid it's dazed, and the sac on its back is soft.", hint: 'Make it miss.' },
  { id: 'bulwark-anything', who: 'Bulwarks', title: 'It charges anything that moves', text: "Not just me. It went for a soldier the same way. Point it at them and get out of the line.", hint: 'Who else could it charge?' },
  { id: 'crystal-bodies', who: 'The Fold', title: 'The crystals grow out of the dead', text: 'The night shift is in the hold, and the crystals are growing up through them. The garden is planted in us.', hint: 'Look closer at the crystals.' },
  { id: 'crystal-song', who: 'The Fold', title: 'Every forty seconds, they sing', text: 'Every 40.3 seconds the crystals pulse and hum, and everything in the hold stops to listen. For those few seconds the Skitters hear nothing else. It is the Lantern interval. They are answering something.', hint: 'Wait in the hold, and listen.' },
  { id: 'sweep-orders', who: 'The Sweep', title: 'No witnesses', text: "The soldiers aren't a rescue. They shoot anyone from Sublevel C. They came for a seed crystal.", hint: 'Who is the lift bringing?' },
  { id: 'sweep-gunfire', who: 'The Sweep', title: 'Their gunfire draws the Skitters', text: 'The soldiers make more noise than I ever could, and the Skitters go for the noise. Stay quiet and let them find each other.', hint: 'Who is louder than you?' },
  { id: 'canister', who: 'The facility', title: 'Pressurised canisters', text: 'The red canisters vent, then burst. Hit one and get clear, or let something else hit it.', hint: 'Something in the room that bursts.' }
];

const $ = (id) => document.getElementById(id);

export class HUD {
  constructor(world) {
    this.w = world;
    this.el = {
      hud: $('hud'), hp: $('hp'), hpbar: $('hpbar'), weapon: $('weapon'), mag: $('mag'), cans: $('cans'), prompt: $('prompt'),
      subtitle: $('subtitle'), toasts: $('toasts'), timer: $('timer'), place: $('place'), notes: $('notes'), terminal: $('terminal'),
      screen: $('screen'), hurt: $('hurt'), fade: $('fade'), hitdir: $('hitdir'), cross: $('crosshair')
    };
    this.subT = 0;
    this.placeT = 0;
    this.hitT = 0;
  }
  show(on) {
    this.el.hud.hidden = !on;
  }
  health() {
    const p = this.w.player;
    this.el.hp.textContent = Math.ceil(p.hp);
    this.el.hpbar.style.width = `${p.hp}%`;
    this.el.hud.classList.toggle('low', p.hp <= 30);
  }
  ammo() {
    const p = this.w.player;
    const names = { wrench: 'PIPE WRENCH', smg: 'SMG', shard: 'CRYSTAL SHARD · LMB throw', null: 'EMPTY HANDS' };
    this.el.weapon.textContent = names[p.weapon];
    this.el.mag.innerHTML = p.weapon === 'smg' ? `<b>${p.mag}</b><span>/ ${p.reserve}</span>` : '';
    this.el.cans.textContent = p.cans ? `cans ${p.cans} · G` : '';
  }
  prompt(text) {
    if (this.lastPrompt === text) return;
    this.lastPrompt = text;
    this.el.prompt.textContent = text ?? '';
    this.el.prompt.classList.toggle('on', !!text);
  }
  toast(html, cls = '') {
    const d = document.createElement('div');
    d.className = 'toast ' + cls;
    d.innerHTML = html;
    this.el.toasts.appendChild(d);
    setTimeout(() => d.classList.add('out'), cls === 'note' ? 5200 : 3800);
    setTimeout(() => d.remove(), cls === 'note' ? 6000 : 4600);
  }
  subtitle(text, dur, who) {
    this.el.subtitle.textContent = text;
    this.el.subtitle.dataset.who = who ?? 'pa';
    this.el.subtitle.classList.add('on');
    this.subT = dur;
  }
  place(name) {
    this.el.place.textContent = name;
    this.el.place.classList.add('on');
    this.placeT = 3.5;
  }
  timer(sec) {
    if (sec == null) {
      this.el.timer.hidden = true;
      return;
    }
    this.el.timer.hidden = false;
    this.el.timer.textContent = sec > 0 ? `FREIGHT LIFT  ${sec.toFixed(1)}` : 'FREIGHT LIFT  ARRIVED';
  }
  hitFrom(from) {
    const p = this.w.player;
    const a = Math.atan2(from.x - p.pos.x, from.z - p.pos.z); // world angle to the source
    const view = Math.atan2(-Math.sin(p.yaw), -Math.cos(p.yaw));
    this.el.hitdir.style.transform = `translate(-50%,-50%) rotate(${-(a - view)}rad)`;
    this.hitT = 1;
  }
  update(dt) {
    const p = this.w.player;
    this.el.hurt.style.opacity = Math.min(0.85, p.flashT * 0.9 + (p.hp <= 30 && p.alive ? 0.18 + Math.sin(this.w.time * 4) * 0.06 : 0));
    if (this.subT > 0) {
      this.subT -= dt;
      if (this.subT <= 0) this.el.subtitle.classList.remove('on');
    }
    if (this.placeT > 0) {
      this.placeT -= dt;
      if (this.placeT <= 0) this.el.place.classList.remove('on');
    }
    this.hitT = Math.max(0, this.hitT - dt * 1.5);
    this.el.hitdir.style.opacity = this.hitT;
    this.el.cross.classList.toggle('hidden', !p.alive || !p.weapon);
  }
  notesHTML(withHints) {
    const seen = this.w.notes;
    const groups = {};
    for (const n of NOTES) (groups[n.who] ??= []).push(n);
    let html = '';
    for (const [who, list] of Object.entries(groups)) {
      html += `<h3>${who}</h3><ul>`;
      for (const n of list) {
        if (seen.has(n.id)) html += `<li class="seen"><b>${n.title}.</b> ${n.text}</li>`;
        else html += `<li class="unseen">${withHints ? `<i>${n.hint}</i>` : '· · ·'}</li>`;
      }
      html += '</ul>';
    }
    return html;
  }
  showNotes(on) {
    const el = this.el.notes;
    el.hidden = !on;
    if (on) el.innerHTML = `<div class="page"><h2>Field notes <span>${this.w.notes.size} / ${NOTES.length}</span></h2><p class="sub">Kestrel Deep, Sublevel C. Things I've seen that might keep me alive.</p>${this.notesHTML(false)}<p class="close">Tab to close</p></div>`;
  }
  showTerminal(on, file) {
    const el = this.el.terminal;
    el.hidden = !on;
    if (on && file === 'lantern')
      el.innerHTML = `<pre>KESTREL DEEP RESEARCH ANNEX — PROJECT LANTERN
DIRECTOR'S NOTES · R. Hale · RESTRICTED
────────────────────────────────────────────
Day 1    The array has a signal. Not noise: a pulse,
         out of the Fold, every 40.3 seconds.

Day 9    There is structure inside each pulse.
         Bell says it is counting. Counting what?

Day 30   Aperture opened: 11 cm, 4 seconds.
         Recovered: one crystalline seed, three
         organisms. Bell calls the seed "the bulb".

Day 31   The seed grows in the dark. It grows faster
         near anything that has died.

Day 44   The seed pulses every 40.3 seconds, in step
         with the signal. It is not listening to the
         Fold. It is answering it.

Day 45   The Ministry liaison visited. The seed is now
         Ministry property. In the event of a breach,
         SWEEP protocol applies. Staff are not to be
         told what that means.

────────────────────────────────────────────
                                   [E] close</pre>`;
    else if (on)
      el.innerHTML = `<pre>KESTREL DEEP RESEARCH ANNEX — HOLD C
NIGHT LOG · Dr A. Okafor · specimen care
────────────────────────────────────────────
23:10  The specimens from the Fold are restless again.
       The small ones keep turning toward the generator
       whine. Never toward the lamps. I am now fairly
       sure they have no eyes at all.

00:42  The tall one stopped at crystal 4 for six minutes.
       The crystal brightened while it was there. The
       small ones would not come near it while it glowed.
       I keep wanting to call it a gardener.

01:30  Moved the big one into the loading bay pen. Plates
       like a riot shield on the front. It charges whatever
       moves and does not seem to steer once it starts.
       Kowalski says it put a dent in the pen wall and sat
       there looking stupid for a good while afterwards.

02:15  Gate control for the bay is in the hold, far corner.
       If anything goes wrong down here, do NOT go through
       the hold making noise.

02:41  something is wrong with the

────────────────────────────────────────────
                                   [E] close</pre>`;
  }
  screen(html, cls = '') {
    const el = this.el.screen;
    el.className = cls;
    el.innerHTML = html;
    el.hidden = !html;
  }
  fade(v, secs = 1) {
    this.el.fade.style.transition = `opacity ${secs}s`;
    this.el.fade.style.opacity = v;
  }
}
