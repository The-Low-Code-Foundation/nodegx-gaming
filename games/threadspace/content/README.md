# Content

What the game is made of that isn't a ship: one file per thing, in a folder per kind. A ship (`ships/<ship>/`) says
where things are aboard her; a file here says what a thing is wherever it turns up.

| folder | one file per | read by |
|---|---|---|
| `people/` | person: `id` (the file's name), `name`, `dept` (the uniform: `command`, `flight`, `engineering`, `crew`), `voice` (the browser's speech for a line with no clip: `pitch`, `rate`), `cast` (the recorded voice: `voiceId`, `design`, `gender`, `language`, `style`, `sample`; see "Voices" in ../CLAUDE.md) | `src/core/people.mjs`: the game joins each to their post on the ship (the career's `people`, the routine's section `leader`s); `tools/voices.mjs` records their lines |

Still to come, each when the phase that needs it designs its format (`design/ROADMAP.md`): `announcements/` (phase 3:
the ship's calls and who hears them), `dialogue/` and `missions/` (phase 8: talking to people, the career as chapters).

## A new person

1. `people/<id>.json`, copying one that is there. Pick a `dept` for the uniform and write the `cast.design` from who
   they are (age, gender, timbre, accent; permanent traits only), leaving `voiceId` empty.
2. Put them aboard: an entry `{ "id", "room", "at", "yaw", "pose" }` in the ship's `career.json` `people`, or as a
   section's `leader` in `watches.json`.
3. `node tools/check.mjs` (every name resolves, every spot is inside its room), then `GEMINI_API_KEY=... node
   tools/voices.mjs --design --sample out` to make their voice, listen, and record.

## Checking

`node tools/check.mjs` checks every file here against the ships and the code. Run it after any change; the content
tools run it themselves.
