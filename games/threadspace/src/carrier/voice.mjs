// The voices aboard. A line the game has a recording of (assets/voice/, made with Gemini TTS by tools/voices.mjs) is
// played from its file; a line it has none of (a fire's call-out with its frame number, say) is spoken by the browser's
// own speech, local voices only, as before. The game never calls an AI service: the clips are plain mp3s.
//
// A line made of recorded lines ("Blue watch, all present… Apprentice: report to…") plays them one after another.
// Two channels: the ship's broadcast queues (one call after another, as a real tannoy would), and a person's new line
// cuts off their last one.

const BASE = new URL('../../assets/voice/', import.meta.url);

export class Voices {
  /** `on`: false keeps everyone quiet (`?voice=0`). `volume`: 0 to 1 for the clips. */
  constructor({ on = true, volume = 0.9 } = {}) {
    this.on = on;
    this.volume = volume;
    this.clips = new Map(); // speaker → [{ text, file }], longest first
    this.ready = fetch(new URL('index.json', BASE))
      .then((r) => (r.ok ? r.json() : { lines: {} }))
      .then((j) => {
        for (const [key, e] of Object.entries(j.lines ?? {})) {
          const bar = key.indexOf('|');
          const speaker = key.slice(0, bar), text = key.slice(bar + 1);
          if (!this.clips.has(speaker)) this.clips.set(speaker, []);
          this.clips.get(speaker).push({ text, file: e.file });
        }
        for (const list of this.clips.values()) list.sort((a, b) => b.text.length - a.text.length);
      })
      .catch(() => {});
    this.queue = []; // the broadcast's waiting calls
    this.playing = { ship: null, person: null };
  }

  /** The files that say `text` in `speaker`'s voice, in order, or null if some of it was never recorded. */
  pieces(speaker, text) {
    const list = this.clips.get(speaker);
    if (!list) return null;
    const files = [];
    let rest = text.trim();
    while (rest) {
      const c = list.find((c) => rest.startsWith(c.text) && (rest.length === c.text.length || rest[c.text.length] === ' '));
      if (!c) return null;
      files.push(new URL(c.file, BASE).href);
      rest = rest.slice(c.text.length).trim();
    }
    return files.length ? files : null;
  }

  /** `speaker` (an id in ships/carrier.voices.json: an officer, a leading hand, or `ship`) says `text`.
   *  `pitch` / `rate` are for the browser's speech when there is no clip. `clipOnly`: say nothing without one. */
  say(speaker, text, { delay = 0, pitch = 1, rate = 1, clipOnly = false } = {}) {
    if (!this.on || !text) return;
    const files = this.pieces(speaker, text);
    if (!files && clipOnly) return;
    const go = () => (files ? this.play(speaker === 'ship' ? 'ship' : 'person', files) : this.speak(speaker, text, pitch, rate));
    delay ? setTimeout(go, delay) : go();
  }

  play(channel, files) {
    if (channel === 'ship' && this.playing.ship) return void this.queue.push(files);
    this.playing[channel]?.pause();
    const next = (i) => {
      if (i >= files.length) {
        this.playing[channel] = null;
        if (channel === 'ship' && this.queue.length) this.play('ship', this.queue.shift());
        return;
      }
      const a = new Audio(files[i]);
      a.volume = this.volume;
      a.onended = a.onerror = () => this.playing[channel] === a && next(i + 1);
      this.playing[channel] = a;
      a.play().catch(() => this.playing[channel] === a && next(i + 1));
    };
    next(0);
  }

  /** No recording: the browser's speech, an English local voice (British if there is one). */
  speak(speaker, text, pitch, rate) {
    if (!window.speechSynthesis) return;
    const voices = speechSynthesis.getVoices().filter((v) => v.localService && v.lang.startsWith('en'));
    if (!voices.length) return;
    const u = new SpeechSynthesisUtterance(text);
    u.voice = voices.find((v) => v.lang === 'en-GB') ?? voices[0];
    u.pitch = pitch;
    u.rate = rate;
    if (speaker !== 'ship') speechSynthesis.cancel(); // a person's new line cuts off the last (the ship's queue)
    speechSynthesis.speak(u);
  }
}
