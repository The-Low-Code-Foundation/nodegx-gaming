# Credits

## Libraries (vendored in `vendor/`, licence files beside them)

| Library | Version | Author | Licence | Source |
|---|---|---|---|---|
| three.js (core + the addons in `vendor/three-addons/`) | r186 (npm 0.186.1) | three.js authors | MIT (`vendor/three/LICENSE`) | https://github.com/mrdoob/three.js |
| @pixiv/three-vrm | 3.5.5 | pixiv Inc. | MIT (`vendor/three-vrm/LICENSE`) | https://github.com/pixiv/three-vrm |

## Models and animation

| Asset | File | Author | Licence | Source |
|---|---|---|---|---|
| The heroine: `VRM1_Constraint_Twist_Sample`, textures shrunk | `assets/vrm/sample-slim.vrm` | pixiv Inc. (c) 2022 | VRM Public License 1.0 (https://vrm.dev/licenses/1.0/). The model's own metadata says: avatar use by everyone, corporate commercial use, redistribution allowed, modification and redistribution of modifications allowed, credit not required. | https://github.com/pixiv/three-vrm/tree/dev/packages/three-vrm/examples/models |
| Universal Animation Library (Standard), Godot export | `assets/anim/AnimationLibrary_Godot_Standard.gltf` + `.bin` | Quaternius | CC0 1.0 | https://github.com/J-Ponzo/gltf-universal-animation-library (from https://quaternius.com) |

## Fonts (loaded from Google Fonts, not vendored)

| Font | Author | Licence |
|---|---|---|
| Cinzel, Cinzel Decorative | Natanael Gama | SIL Open Font License 1.1 |
| Nunito | Vernon Adams, Cyreal | SIL Open Font License 1.1 |

Offline, the page falls back to system serif / sans-serif fonts; nothing else breaks.

## Questions

The question banks in `src/school/` come from two other NodeGX templates, Rocket School and Star Class (same project,
same licence as this code). `src/school/france.mjs` and `src/school/stem.mjs` were written for this game.

## Everything else

The château, the creatures, the cakes, the piano, the sound effects (Web Audio) and the music are drawn or synthesised
in code.

## Left out

The full-size 10 MB VRM (`VRM1_Constraint_Twist_Sample.vrm`) is not shipped; the slimmed copy is the same model with
smaller textures.
