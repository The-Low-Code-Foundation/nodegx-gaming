# Credits

| What | Author | Licence | Source | Where in this folder |
|---|---|---|---|---|
| The *C. elegans* connectome table (300 neurons, 3,689 weighted connections) | Timothy Busbice, Gabriel Garrett, Geoffrey Churchill (2014) | GPL-2.0 (as declared by the source repository) | https://github.com/Connectome/GoPiGo, file `connectome.py`, extracted unchanged to JSON | `src/connectome.js` |
| Cell-name glosses (what each class of nerve cell does) | written for this game from WormAtlas descriptions | as the game code | https://www.wormatlas.org | `src/gloss.js` |
| Fonts: Gluten, Atkinson Hyperlegible, IBM Plex Mono | Tyler Finck / Braille Institute / IBM | SIL Open Font License 1.1 | Google Fonts, loaded by a `<link>` in `index.html` (not vendored; without a network the page falls back to system fonts) | not in this folder |

Everything else is original to the NodeGX project (The Low Code Foundation), GPL-3.0:

- Every creature, the water drop, the leaf litter and the swarm are drawn with the 2D canvas from code; there are no
  image files.
- Every sound is synthesised at run time with the Web Audio API (`src/core.js`); there are no audio files.
- `src/engine.js` runs Busbice's firing rule, rewritten in JavaScript; it is the Worm Plate's engine with one fix (cells
  added by evolution now fire).

Science the game leans on, for reading further: Busbice et al. 2014 (the robot and its table); White et al. 1986, *The
structure of the nervous system of the nematode C. elegans*; Stanley and Miikkulainen 2002 (NEAT, the way new cells are
spliced in).
