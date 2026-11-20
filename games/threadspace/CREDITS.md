# Credits

| What | Author | Licence | Source | Where in this folder |
|---|---|---|---|---|
| three.js r186 (`three.module.js`, `three.core.js`) | the three.js authors | MIT | https://github.com/mrdoob/three.js (npm `three@0.186.1`) | `vendor/three/` (licence: `vendor/three/LICENSE`) |
| three.js addons: `OrbitControls.js`, `BufferGeometryUtils.js`, `GLTFLoader.js`, `SkeletonUtils.js`, `CSS2DRenderer.js` (the ship designer's labels), and the post-processing used for the fighter's bloom (`postprocessing/`: `EffectComposer`, `RenderPass`, `ShaderPass`, `MaskPass`, `Pass`, `UnrealBloomPass`, `OutputPass`; `shaders/`: `CopyShader`, `LuminosityHighPassShader`, `OutputShader`) | the three.js authors | MIT | same package, `examples/jsm/` | `vendor/three-addons/` |
| Six realistic people (Rocketbox adults: Female 01, 05, 12; Male 01, 04, 08), converted to GLB with smaller textures (the same files as the Life Sim game in this repository) | Microsoft | MIT (`assets/people/LICENSE.md`) | https://github.com/microsoft/Microsoft-Rocketbox | `assets/people/` |
| Motion-capture clips (idle, walk, sitting, working at a table, talking, looking around; female and male), one GLB per clip | Microsoft (Rocketbox) | MIT (`assets/people/LICENSE.md`) | https://github.com/microsoft/Microsoft-Rocketbox | `assets/people/anims/` |

Everything else is original to the NodeGX project (The Low Code Foundation), GPL-3.0:

- The main game's ships, stations, rooms, people and rocks are built from code (three.js primitives).
- The carrier's hull (`assets/carrier/hull.glb`) is built by our own Blender script, `tools/blender/carrier_v2_build.py`,
  from `ships/carrier/` (the archived first carrier's by `archive/carrier-v1/carrier_build.py`); no third-party model is in it. The fighters and their cockpits
  (`assets/carrier/fighter.glb`) are built the same way, by `tools/blender/fighter_build.py`.
- `src/carrier/mocap.mjs` and `src/carrier/wardrobe.mjs` are copied from the Life Sim game in this repository (same
  project, same licence).
- Every sound effect is synthesised at run time with the Web Audio API (`src/sfx.mjs`, `src/carrier/flight-audio.mjs`).
- The carrier's spoken lines (`assets/voice/*.mp3`) were generated for this project with Google's Gemini text-to-speech
  (`gemini-3.8-flash-tts`, voices designed from the text descriptions in `ships/carrier/voices.json`) by
  `tools/voices.mjs`, from lines written for this game. Google's
  terms give the output to the person who generated it; we license the clips with the rest of the game. They carry
  Google's inaudible SynthID watermark, which marks them as AI-generated. No real person's voice was cloned or used.
- No web fonts: the page uses the system's sans-serif and monospace fonts.
- The optional AI voices (`?llm=on`, off by default) use a model you run yourself through Ollama; no model ships here.
