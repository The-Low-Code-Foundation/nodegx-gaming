// The voices aboard. Every line the game says aloud is a recording (assets/voice/, made with Gemini TTS by
// tools/voices.mjs); a line with no recording is not spoken at all (the browser's own speech is gone: phase 3 of
// design/ROADMAP.md). The game never calls an AI service: the clips are plain mp3s.
//
// A line made of recorded lines ("Blue watch, all present… Apprentice: report to…") plays them one after another.
// Two channels: `broadcast` (the ship's calls, which the announcer, src/core/announcer.mjs, queues and cuts), and
// `person` (someone speaking to you), where a new line cuts off the last.

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
    this.playing = { broadcast: null, person: null };
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

  /** The files for a call's pieces, each its own recorded line: null if any is missing. */
  piecesOf(speaker, words) {
    const files = [];
    for (const w of words) {
      const f = this.pieces(speaker, w);
      if (!f) return null;
      files.push(...f);
    }
    return files.length ? files : null;
  }

  /** Whether `speaker` has a recording of `text`. */
  has(speaker, text) {
    return !!this.pieces(speaker, text);
  }

  /** `speaker` (a person's id) says `text` to you, if it was recorded. Returns whether it is said. */
  say(speaker, text, { delay = 0 } = {}) {
    if (!this.on || !text) return false;
    const files = this.pieces(speaker, text);
    if (!files) return false;
    const go = () => this.play('person', files);
    delay ? setTimeout(go, delay) : go();
    return true;
  }

  /** Plays `files` one after another on `channel`, cutting off what it was playing. `done()` when they end (or fail).
   *  Returns a handle: `stop()` cuts it off (without `done`). */
  play(channel, files, done = () => {}) {
    this.playing[channel]?.pause();
    const handle = { a: null, stopped: false, stop: () => ((handle.stopped = true), handle.a?.pause()) };
    const next = (i) => {
      if (handle.stopped) return;
      if (i >= files.length) {
        if (this.playing[channel] === handle.a) this.playing[channel] = null;
        return done();
      }
      const a = new Audio(files[i]);
      a.volume = this.volume;
      a.onended = a.onerror = () => handle.a === a && next(i + 1);
      handle.a = a;
      this.playing[channel] = a;
      a.play().catch(() => handle.a === a && next(i + 1));
    };
    next(0);
    return handle;
  }
}
