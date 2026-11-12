# Credits

The same list, for players, is `credits.html` (linked from the title screen).

## Creature models (`assets/creatures/`)

| Role in the game | Model | Artist | Licence | Source | Changes |
|---|---|---|---|---|---|
| Skitter | Xenohydro Roach (`xenohydro-roach.glb`) | SpiderBight [ArachnoBoy], https://sketchfab.com/vang807 | CC BY-SA 4.0, https://creativecommons.org/licenses/by-sa/4.0/ | https://sketchfab.com/3d-models/xenohydro-roach-6f0cc93653a14458b6920a18fcc21d55 | None (scaled in code). A changed version must stay CC BY-SA 4.0. |
| Tender | Opabinia (`opabinia.glb`) | Weird Animal Maker, https://sketchfab.com/garytparkosewich | CC BY 4.0, https://creativecommons.org/licenses/by/4.0/ | https://sketchfab.com/3d-models/opabinia-downloadable-449ee9b4b5bd45499fa38400641ba6f8 | Simplified from 344k to 45k triangles; given a skeleton and swim, tend, scream and death animations; tinted to glow in code. |
| Bulwark | Arang – Fantasy Creature (`arang.glb`) | Peter Nox, https://sketchfab.com/Peter.Nox | CC BY 4.0, https://creativecommons.org/licenses/by/4.0/ | https://sketchfab.com/3d-models/arang-fantasy-creature-213d8035d58e48c4826cba154ba0f72d | Given a skeleton and idle, walk, run, charge, bite, stagger and death animations; a glowing sac is added in code. |
| The growth on the bodies | Living Flesh Blob – Free Organic Horror Asset (`living-flesh-blob.glb`) | Yury Misiyuk, https://sketchfab.com/Tim0 | CC BY 4.0, https://creativecommons.org/licenses/by/4.0/ | https://sketchfab.com/3d-models/living-flesh-blob-free-organic-horror-asset-6357bbc094d54cf5ba150ef2951b3750 | None (scaled in code). |

If a model file is removed, that creature falls back to its procedural body (`src/models.mjs`), so the game still runs
with none of them.

## Libraries

| What | Where | Licence | Source |
|---|---|---|---|
| three.js 0.186.1 (core build; addons GLTFLoader, SkeletonUtils, BufferGeometryUtils, RoundedBoxGeometry, RoomEnvironment, EffectComposer, RenderPass, ShaderPass, UnrealBloomPass, OutputPass and the shaders they import) | `vendor/` | MIT (`vendor/three/LICENSE`) | https://github.com/mrdoob/three.js |

## Everything else

The level, the hands, the wrench, the SMG, the procedural creatures and people, every texture (drawn on canvases)
and every sound (synthesised in WebAudio) are made in code for this game and are MIT. The model adjustments above
were made with Blender (https://www.blender.org).
