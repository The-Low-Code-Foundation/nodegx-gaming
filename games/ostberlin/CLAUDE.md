# Es war einmal in Ost-Berlin: notes for an AI coder

A point-and-click museum for a family TV. A street with eight places; each place is a drawn room with things to click;
each thing opens a card (German name, English subtitle, a short text, a real photo, maybe a film, and a question for
the parent who grew up there). Finding a thing puts a sticker in the album.

## Run it

```bash
npx serve .          # or python3 -m http.server 8000
```

Plain scripts (no ES modules), so `file://` mostly works too. Everything is ES2015 on purpose: old smart-TV browsers
must run it. **Do not add modules, `let`/arrow-heavy syntax beyond ES2015, optional chaining, a build step or a
framework.** `node --check js/<file>.js` catches syntax errors. There is no test suite.

For checking without clicking, `window.__game` in the console: `stats()`, `room('kueche')`, `open('mixer')`,
`hub()`, `film('<youtube id>')`, `reset()`.

## Code map

| File | What it does |
|---|---|
| `index.html` | The stage and the script tags, in load order: `engine.js`, the three room files, `hub.js`, `media.js`, then `boot()`. |
| `style.css` | Layout (everything is sized in `rem`, and `fit()` sets 1rem = 1% of a 16:9 stage), cards, album, TV frame, all animation. |
| `js/engine.js` | Drawing helpers `r` (rect), `c` (circle), `e` (ellipse), `p` (path), `l` (line), `t` (text), `star`; the save `S` (`localStorage['ostberlin1']`); `room(def)` registers a place; `WHO` / `tx()` (the `{M}` placeholder); the title (`showTitle`), the street (`showHub`), a place (`showRoom`); cards (`openItem`, `flip`, `triola`, `cook`, `album`); films (`openFilm`); one click handler (`onClick`, by `data-act`). |
| `js/rooms-home.js` | The flat: `wohnzimmer`, `kueche`, `kinderzimmer`. |
| `js/rooms-out.js` | `kaufhalle`, `schule`, `berlin` (Alexanderplatz). Also the `trabi()` and `sign()` drawings. |
| `js/rooms-away.js` | `ferien` (Baltic and Czechoslovakia), `neunziger` (the 1990s). |
| `js/hub.js` | The street: `HUB.list` (where each place's clickable area and name plate are), `HUB.bg()` (the drawing), `HUB.spots()`. |
| `js/media.js` | `MEDIA.photos` (item id → photo file, author, licence, caption), `MEDIA.films` (item id → YouTube id), `MEDIA.title` (the photo pile on the first screen), `MEDIA.look` (TV / record sleeve style for flip cards). |
| `img/` | The 56 Wikimedia Commons photos. Credits in `CREDITS.md`. |

## Readiness: A

Places and things are data. A new thing is a new object in a room's `items`; a photo or a film is one line in
`media.js`. The engine never needs to change for content. A new place needs a drawing on the street (`hub.js`).

## The data

A place: `room({ id, de, en, bg, items: [...] })`. `bg` is an SVG string for the 1920×1080 background.

A thing:

```js
{
  id: 'kaffee',                       // unique across the whole game; also the key in media.js
  x: 760, y: 768, w: 330, h: 122,     // where it sits in the 1920x1080 scene, and the box its drawing fills
  s: 1,                               // optional scale
  de: 'Kaffee und Kuchen',            // the German name (card title, hover label, album)
  en: 'coffee and cake at three',     // the English subtitle
  art: r(0, 0, 150, 96, '#7a3b1d', 6) + c(55, 78, 12, '#d6312b'),   // the drawing, in its own w x h box
  text: "Sunday, three o'clock: ...", // two or three sentences
  ask: "Who made the best cake in the family?",   // shown as "Frag Mama: ..." / "Frag Papa: ..."
  sound: 'hum'                        // optional: pop, found, win, no, honk, hum, bell, tick (sfx in engine.js)
}
```

Special kinds (`kind`):
- `'flip'`: a card you leaf through. `cards: [{ de, en, bg, by, text, ask, art? }]`, `next` (button label),
  `flipSound`, `picBg`. Films and photos per card are keyed `'<id>:<card index>'` in `media.js`.
- `'cook'` (only `herd`): `dishes: [{ de, en, good: [[de, en] x3], bad: [[de, en] x3], text, ask }]`.
- `'triola'`: the little keyboard; the tune is `SONG` in `engine.js` (indexes into `KEYS`).
- `'list'` (the shopping list): `want: [item ids]` to find in the same place.

Text can hold HTML entities (`&auml;`) and `<b>`. `{M}` becomes "Mama" or "Papa" (what the player picked on the
title screen).

## How to add a thing

1. Pick the place's file (`js/rooms-*.js`) and copy an item in its `items` array.
2. Give it a new `id`, a free spot `x, y` in the 1920×1080 scene, its `w, h`, `de`, `en`, `text`, `ask`.
3. Draw `art` with the helpers, inside a `w`×`h` box starting at 0,0. Keep it simple: a few shapes read best on a TV.
   (Or leave the drawing minimal and rely on a photo.)
4. A photo: put the file in `img/`, add `id: { f: 'file.jpg', by: 'Author', lic: 'CC BY-SA 4.0', cap: 'optional' }`
   to `MEDIA.photos`, and a row to `CREDITS.md`. Use only photos whose licence allows reuse, and keep the credit: it
   is shown under the photo.
5. A film: add `id: '<YouTube video id>'` to `MEDIA.films` and a row to `CREDITS.md`. Embeds only; never ship video files.
6. Reload. The counters (7 / 8 / …) and the album count themselves.

## How to add a place

1. Add a `room({...})` call in one of the room files (or a new `js/rooms-x.js`, with a `<script>` tag in
   `index.html` before `hub.js`). Album order is the order `room()` is called.
2. In `js/hub.js`, add `{ room: '<id>', x, y, w, h, px, py }` to `HUB.list`: the clickable area on the street and
   where the name plate goes.
3. Draw it on the street in `HUB.bg()` (or reuse an existing building's area).

## How to make it about another city or decade

The engine knows nothing about Berlin. To make "Es war einmal in Glasgow, 1990s":

1. Title text: `showTitle()` in `js/engine.js` (the `<h1>` and the paragraph), and `<title>` in `index.html`.
2. The street's subtitle: `showHub()` ("our street, East Berlin, 1988").
3. Replace the items in each `rooms-*.js` (keep the ids unique), and redraw `bg` for each place.
4. Empty `MEDIA.photos`, `MEDIA.films` and `MEDIA.title` in `js/media.js`, then add your own (and their credits).
5. The UI words are German ("Zur Straße", "Tipp", "Weiter", "Fertig", "Frag"); they are in `engine.js` (`hud`,
   `openItem`, `flip`, `askBox`, toasts in `find` / `closeDlg`). Change them for another language.
6. Who the questions go to: the two buttons in `showTitle()` set `WHO` (`data-who`). Make it "Oma" / "Opa", a
   teacher, or anything else.

## Things to know

- The tone: things and the life around them, warm and curious, no judgement. Keep facts general and checkable.
- Every question is addressed to a parent; the texts never assume one person's birth year or biography. Keep it that
  way in a public copy: a family that wants personal details can add them in their own copy.
- Films need the internet and can disappear when their owner removes them; the card still works.
