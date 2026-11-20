# Content

What the game is made of that isn't a ship: one file per thing, in a folder per kind. A ship (`ships/<ship>/`) says
where things are aboard her; a file here says what a thing is wherever it turns up.

| folder | one file per | read by |
|---|---|---|
| `people/` | person: `id` (the file's name), `name`, `dept` (the uniform: `command`, `flight`, `engineering`, `crew`), `cast` (the recorded voice: `voiceId`, `design`, `gender`, `language`, `style`, `sample`; see "Voices" in ../CLAUDE.md) | `src/core/people.mjs`: the game joins each to their post on the ship (the career's `people`, the routine's section `leader`s); an announcement's `who` names the ones who only speak on the broadcast; `tools/voices.mjs` records their lines |
| `announcements/` | call the ship makes: who says it, its words as pieces, its subtitle, who it is for and by what (`to`: tannoy, headset, radio), its `priority`, `delay`, `again` and `alarm`. `index.json` lists them. The format is at the top of `src/core/announcer.mjs` | `src/core/announcer.mjs`: a system says `C.bus.emit('call', { id, … })` and the announcer decides whether it reaches you; `tools/voices.mjs` records every piece |
| `glossary.json` | the words the crew use (`use`) and the ones they don't (`avoid`, each with what to say instead): real modern joint-service military | `tools/check.mjs` checks every spoken line against `avoid`; phase 8's dialogue tool will too |

Still to come, each when the phase that needs it designs its format (`design/ROADMAP.md`): `dialogue/` and
`missions/` (phase 8: talking to people, the career as chapters).

## A new call

1. `announcements/<id>.json`, copying one that is there, and its id in `announcements/index.json`. Words the ship's
   automated voice says (`who: "ai"`) can name a place piece by piece (`{room}`, `{deck}`, `{section}`); a person's are
   best recorded whole, so give each slot its few `slots` values.
2. In the code, `this.C.bus?.emit('call', { id: '<id>', room, … })` where it happens. Put what the player must do on
   the card (`dc.say(null, text)`), not in the call.
3. `node tools/check.mjs` (the code's calls against the files, the glossary), then record it:
   `GEMINI_API_KEY=... node tools/voices.mjs`. Until it is recorded it shows as a subtitle with no sound.

## A new person

1. `people/<id>.json`, copying one that is there. Pick a `dept` for the uniform and write the `cast.design` from who
   they are (age, gender, timbre, accent; permanent traits only), leaving `voiceId` empty.
2. Put them aboard: an entry `{ "id", "room", "at", "yaw", "pose" }` in the ship's `career.json` `people`, or as a
   section's `leader` in `watches.json`.
3. `node tools/check.mjs` (every name resolves, every spot is inside its room), then `GEMINI_API_KEY=... node
   tools/voices.mjs --design --sample out` to make their voice, listen, and record.

Someone who only speaks on the broadcast (the captain) needs only step 1: an announcement's `who` puts them aboard.

## Checking

`node tools/check.mjs` checks every file here against the ships and the code. Run it after any change; the content
tools run it themselves.
