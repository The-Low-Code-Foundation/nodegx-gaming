# Credits

| What | Author | Licence | Source | Where in this folder |
|---|---|---|---|---|
| three.js r186 (`three.module.js`, `three.core.js`) | the three.js authors | MIT | https://github.com/mrdoob/three.js (npm `three@0.186.1`) | `vendor/three/` (licence: `vendor/three/LICENSE`) |
| three.js addons: `OrbitControls.js`, `BufferGeometryUtils.js` | the three.js authors | MIT | same package, `examples/jsm/` | `vendor/three-addons/` |

Everything else is original to the NodeGX project (The Low Code Foundation), GPL-3.0:

- All ships, stations, rooms, people and rocks are built from code (three.js primitives); there are no model, texture or
  image files.
- Every sound is synthesised at run time with the Web Audio API (`src/sfx.mjs`); there are no audio files.
- No web fonts: the page uses the system's sans-serif and monospace fonts.
- The optional AI voices (`?llm=on`, off by default) use a model you run yourself through Ollama; no model ships here.
