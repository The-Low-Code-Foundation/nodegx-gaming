# Credits

| What | Where in this folder | Author | Licence | Source |
|---|---|---|---|---|
| three.js 0.186.1 (core build and the addons used: GLTFLoader, OrbitControls, RoomEnvironment, SkeletonUtils, BufferGeometryUtils) | `vendor/three/`, `vendor/three-addons/` | three.js authors | MIT (`vendor/three/LICENSE`) | https://github.com/mrdoob/three.js |
| three-vrm 3.5.5 (imported by the character loader; no VRM model is shipped) | `vendor/three-vrm/` | pixiv Inc. | MIT (`vendor/three-vrm/LICENSE`) | https://github.com/pixiv/three-vrm |
| Twelve realistic people (Rocketbox adults: Female 01, 03, 05, 08, 12, 14; Male 01, 04, 06, 08, 10, 16, facial versions), converted to GLB with smaller textures | `assets/people/` | Microsoft | MIT (`assets/rocketbox/LICENSE.md`) | https://github.com/microsoft/Microsoft-Rocketbox |
| Motion-capture clips (idles, walks, talking, sitting, dancing, waving, phone, drinking…), converted to one GLB per clip | `assets/anims/` | Microsoft (Rocketbox) | MIT (`assets/rocketbox/LICENSE.md`) | https://github.com/microsoft/Microsoft-Rocketbox |
| Universal Animation Library (Standard), glTF conversion | `assets/anim/` | Quaternius; glTF by J-Ponzo | CC0 | https://github.com/J-Ponzo/gltf-universal-animation-library |
| Furniture: all 45 models (Ultimate House Interior Pack) | `assets/furniture/` | Quaternius | CC0 (the pack page states CC0, checked 2026-11-21) | https://quaternius.com/packs/ultimatehomeinterior.html, copied from https://github.com/trebeljahr/quaternius-showcase (`house_interior_pack`) |
| Trees, bushes, plants, flowers, grass, rocks, a stump, a lily pad (Ultimate Nature Pack) | `assets/scenery/` | Quaternius | CC0 (the pack page states CC0, checked 2026-11-21) | https://quaternius.com/packs/ultimatenature.html, via the showcase (`nature_pack`) |
| The street light, `Streetlight_Single` (Modular Streets Pack) | `assets/scenery/` | Quaternius | CC0 (the pack page states CC0, checked 2026-11-21) | https://quaternius.com/packs/modularstreets.html, via the showcase (`street_pack`) |
| The six buildings, `2Story_*`, `3Story_*`, `4Story_Mat` (Ultimate Buildings Pack) | `assets/scenery/` | Quaternius | CC0 (the pack page states CC0, checked 2026-11-21) | https://quaternius.com/packs/ultimatetexturedbuildings.html, via the showcase (folder `buildings_pack_3`, pack `buildings_pack_2`) |
| The TV, `TV_1` (Cyberpunk Game Kit) | `assets/scenery/` | Quaternius | CC0 (the pack page states CC0, checked 2026-11-21) | https://quaternius.com/packs/cyberpunkgamekit.html, via the showcase (`cyberpunk_pack`) |
| A cat and a dog (Animated Animales Low Poly, "Animal Pack Vol.2"; each with its Idle and Walking animations), converted from the .blend files to GLB with Blender, the colours moved onto glTF materials; the pack's other animals and the zip are not shipped | `assets/animals/` | Quaternius | CC0, as the OpenGameArt page stated when the pack was published there in 2017 (downloaded 2026-11-21). quaternius.com now has a newer licence of its own (Quaternius Asset License v1.0, updated 2026-08-28) | https://opengameart.org/content/animated-animales-low-poly |
| Work-station question banks | `src/game/school/rocket.mjs` | NodeGX project (Rocket School and Star Class templates) | MIT, as the code | https://nodegx.io |

Which pack each Quaternius file is from: matched by name against the showcase's `public/glb/` folders, and byte for
byte where a name is in more than one pack (`BushBerries_1`, `Grass`, `Rock_1`: the Ultimate Nature Pack's). The
showcase's [LICENSES.md](https://github.com/trebeljahr/quaternius-showcase/blob/main/LICENSES.md) lists each of these
packs as CC0-1.0 (checked there against quaternius.com on 2026-10-10).

Quaternius's newer releases use the Quaternius Asset License (QAL) v1.0 (https://quaternius.com/license.html, last
updated 2026-08-28). Its section 7 says the version in effect when the assets were obtained governs them, so it does
not change the CC0 packs above. The QAL allows the assets in a game, and forbids passing them on as assets in
themselves. For a pet from quaternius.com today: the Ultimate Animated Animal Pack
(https://quaternius.com/packs/ultimateanimatedanimals.html, CC0 on its page, checked 2026-11-21) has two dogs (a husky
and a shiba inu) but no cat, so the cat and dog above stay.

Everything else (the code, the textures painted at run time, the made-in-code fridge, TV, telescope, cot, easel, keyboard,
planter, workbench, till, menu board, pet basket, exam table, kennels and signs) is
part of this game and MIT.

Not shipped: the anime (VRM) sample and the Quaternius "Casual" woman used in early character tests; the raw
Rocketbox FBX and TGA sources.
