// The background music, as data: four little pieces, two 'bright' (a won room, a hub won back) and two 'dark' (a room
// still cursed, the battles). src/music.mjs plays them: it picks a piece, plays its `form` section by section, gives
// every section a fresh arrangement (which instrument has the tune, how the chords are played, a counter-melody or
// not), takes a breath, then moves on to the next piece of the same kind. Nothing is a file; it is all synthesised.
//
// A piece:
//   beats   beats in a bar (3 for a waltz, 4 otherwise)
//   bpm     speed
//   scale   the notes of the key (pitch classes 0–11, C = 0), for grace notes
//   form    the order the sections play in. `I` (intro) and `Z` (coda) are chords only or have their own tune.
//   arrs    the arrangements to draw from (see ARRANGE in music.mjs): `lead` instrument, `acc` (how the chords are
//           played), `counter` (an instrument holding a second line, or none), `sparkle`, `orn` (how often a long
//           note gets a grace note), `vol`.
//   sections  { A: { chords, tune }, … }. `chords` is one chord per bar, separated by `|`; two in a bar share it
//           ("Gm7 C7"). Symbols: C, Cm, C7, Cm7, Cmaj7, C6, Cm6, Cdim, Cdim7, Csus4, and a bass note after a slash
//           ("F/C"). `tune` is notes per bar, `|` between bars: name+octave, a colon, the length in beats
//           ("A5:1.5"); `r:1` is a rest. Each bar's lengths must add up to `beats` (tools: node src/music.mjs check).
//
// To add a piece: copy one below, write new sections, add it to its kind in TUNES. Keep the tune between about C4
// and E6; the player moves it up or down an octave to suit each instrument.

const MAJOR = [0, 2, 4, 5, 7, 9, 11];
const MINOR = [0, 2, 3, 5, 7, 8, 10, 11]; // natural and harmonic minor together

// 1. "La Valse du Château": a waltz in F major, the tune for the rooms won back.
const valse = {
  name: 'La Valse du Château',
  beats: 3,
  bpm: 138,
  scale: MAJOR.map((n) => (n + 5) % 12),
  form: ['I', 'A', 'A', 'B', 'A', 'C', 'C', 'B', 'A', 'Z'],
  arrs: ['box', 'flute', 'celesta', 'harpTune', 'strings'],
  sections: {
    I: { chords: 'F | Bb/F | F | C7' },
    A: {
      chords: 'F | F | Gm7 | C7 | Dm | Bb | Gm7 | C7 | F | F7 | Bb | Bbm | F/C | D7 | C7 | F',
      tune: 'C5:1 F5:1 G5:1 | A5:2 F5:1 | Bb5:1.5 A5:0.5 G5:1 | E5:2 C5:1 | D5:1 F5:1 A5:1 | D6:2 C6:0.5 Bb5:0.5 | A5:1 G5:1 F5:1 | G5:3 |' +
        ' C5:1 F5:1 G5:1 | A5:2 Eb5:1 | D5:1 F5:1 Bb5:1 | Db6:2 Bb5:1 | C6:1 A5:1 F5:1 | F#5:1.5 G5:0.5 A5:1 | G5:1.5 Bb5:0.5 E5:1 | F5:3'
    },
    B: {
      chords: 'Dm | Dm | Gm | Gm | A7 | A7 | Dm | Dm | Bb | Bb | Gm | C7 | F | Dm | Gm7 C7 | C7',
      tune: 'A5:3 | A5:1 Bb5:1 A5:1 | G5:3 | G5:1 A5:1 Bb5:1 | A5:1.5 G5:0.5 E5:1 | C#5:2 E5:1 | D5:2 F5:1 | A5:3 |' +
        ' D6:2 C6:1 | Bb5:2 A5:1 | G5:2 F5:1 | E5:2 G5:1 | F5:2 A5:1 | D6:2 A5:1 | Bb5:1 G5:1 E5:1 | G5:2 r:1'
    },
    C: {
      chords: 'Bb | F7 | Eb | Ebmaj7 | Cm7 | F7 | Bb | F7 | Bb | G7 | Cm | Ebm | Bb | F7 | Bb | C7',
      tune: 'D5:1 F5:1 Bb5:1 | A5:2 Bb5:1 | G5:1 Bb5:1 Eb6:1 | D6:2 C6:1 | C6:1.5 Bb5:0.5 G5:1 | A5:1 C6:1 Eb6:1 | D6:2 Bb5:1 | C6:3 |' +
        ' D5:1 F5:1 Bb5:1 | B5:2 D6:1 | Eb6:2 C6:1 | Eb6:1 Gb5:1 Bb5:1 | D6:1 Bb5:1 F5:1 | Eb6:1 C6:1 A5:1 | Bb5:2 F5:1 | E5:1 G5:1 Bb5:1'
    },
    Z: { chords: 'F | Bb | F/C C7 | F', tune: 'A5:2 C6:1 | D6:2 Bb5:1 | A5:1.5 G5:0.5 E5:1 | F5:3' }
  }
};

// 2. "Promenade": a gentle walk in G major, four in a bar.
const promenade = {
  name: 'Promenade',
  beats: 4,
  bpm: 96,
  scale: MAJOR.map((n) => (n + 7) % 12),
  form: ['I', 'A', 'B', 'A', 'B', 'A', 'Z'],
  arrs: ['flute', 'box', 'celesta', 'strings', 'harpTune'],
  sections: {
    I: { chords: 'G | Em | C | D7' },
    A: {
      chords: 'G | Em | C | D | G | Bm | Am7 | D7 | G | E7 | Am | Cm | G/D | D7 | G | G',
      tune: 'B4:1 D5:1 G5:1.5 F#5:0.5 | E5:2 B4:2 | C5:1 E5:1 G5:1 A5:1 | F#5:3 r:1 | G5:1 B5:1 D6:1.5 C6:0.5 | B5:2 F#5:2 | A5:1 C6:1 B5:1 G5:1 | A5:3 r:1 |' +
        ' B4:1 D5:1 G5:1.5 F#5:0.5 | E5:1 G#5:1 B5:1.5 D6:0.5 | C6:2 A5:2 | Eb6:2 C6:1 G5:1 | B5:1.5 A5:0.5 G5:1 D5:1 | F#5:1 A5:1 C6:1 F#5:1 | G5:4 | r:2 D5:1 F#5:1'
    },
    B: {
      chords: 'C | C | Am | Am | F | C | D | D7',
      tune: 'E5:2 G5:2 | C6:3 B5:1 | A5:2 E5:2 | A5:1 B5:1 C6:1 E6:1 | F6:2 E6:1 D6:1 | E6:2 C6:2 | D6:1 C6:1 B5:1 A5:1 | F#5:2 A5:1 C6:1'
    },
    Z: { chords: 'C | Cm | G/D D7 | G', tune: 'E6:2 C6:2 | Eb6:2 C6:2 | B5:2 A5:2 | G5:4' }
  }
};

// 3. "Le Mystère": slow and hushed, D minor. Played while the room is still cursed (and under the fights).
const mystere = {
  name: 'Le Mystère',
  beats: 4,
  bpm: 72,
  scale: MINOR.map((n) => (n + 2) % 12),
  form: ['I', 'A', 'A', 'B', 'A', 'B', 'A', 'Z'],
  arrs: ['glass', 'reed', 'glassPad', 'reedPizz'],
  dark: true,
  sections: {
    I: { chords: 'Dm | Dm | Bb | A7' },
    A: {
      chords: 'Dm | Bb | Gm | A7 | Dm | Bb | Gm | A7',
      tune: 'A5:3 G5:0.5 F5:0.5 | F5:2 D5:2 | G5:1.5 A5:0.5 Bb5:2 | A5:4 | D5:1 F5:1 A5:1 D6:1 | D6:2 C6:1 Bb5:1 | Bb5:1.5 A5:0.5 G5:1 E5:1 | C#5:2 E5:2'
    },
    B: {
      chords: 'Gm | Dm | Eb | A7 | Gm | Dm | Bbmaj7 | A7',
      tune: 'D5:2 Bb4:1 G4:1 | A4:3 r:1 | G4:1 Bb4:1 Eb5:2 | C#5:3 r:1 | D5:1 Eb5:1 D5:1 Bb4:1 | A4:2 F4:2 | A4:1 Bb4:1 D5:1 F5:1 | E5:2 C#5:2'
    },
    Z: { chords: 'Gm | A7 | Dm | Dm', tune: 'Bb5:2 G5:2 | E5:2 C#5:2 | D5:4 | r:4' }
  }
};

// 4. "La Ronde des Ombres": a shadowy little waltz in E minor, like a music box in an empty room.
const ronde = {
  name: 'La Ronde des Ombres',
  beats: 3,
  bpm: 108,
  scale: MINOR.map((n) => (n + 4) % 12),
  form: ['I', 'A', 'B', 'A', 'B', 'A', 'Z'],
  arrs: ['glass', 'reed', 'glassPad', 'reedPizz'],
  dark: true,
  sections: {
    I: { chords: 'Em | Em | Am | B7' },
    A: {
      chords: 'Em | Em | Am | B7 | Em | C | Am | B7 | C | G | Am | Em | C | Am | B7 | Em',
      tune: 'B4:1 E5:1 G5:1 | B5:2 A5:0.5 G5:0.5 | C6:2 A5:1 | D#5:2 F#5:1 | E5:1 G5:1 B5:1 | E6:2 D6:0.5 C6:0.5 | C6:1 B5:1 A5:1 | A5:1 F#5:1 D#5:1 |' +
        ' E5:1 G5:1 C6:1 | B5:2 D6:1 | C6:1.5 B5:0.5 A5:1 | G5:2 E5:1 | E5:1 G5:1 C6:1 | A5:2 C6:1 | B5:1 A5:1 D#5:1 | E5:3'
    },
    B: {
      chords: 'C | C | Am | B7 | C | Am | F#dim | B7',
      tune: 'G5:2 E5:1 | C6:2 B5:1 | A5:2 E5:1 | F#5:2 D#5:1 | E5:1 G5:1 C6:1 | E6:2 C6:1 | C6:1 A5:1 F#5:1 | D#5:3'
    },
    Z: { chords: 'Am | B7 | Em | Em', tune: 'C6:2 A5:1 | B5:2 D#5:1 | E5:3 | r:3' }
  }
};

export const TUNES = { bright: [valse, promenade], dark: [mystere, ronde] };
