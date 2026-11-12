# Credits

| What | Where in this folder | Author | Licence | Source |
|---|---|---|---|---|
| three.js 0.186.1 (core build and the addons used: GLTFLoader, OrbitControls, RoomEnvironment, SkeletonUtils, BufferGeometryUtils) | `vendor/three/`, `vendor/three-addons/` | three.js authors | MIT (`vendor/three/LICENSE`) | https://github.com/mrdoob/three.js |
| three-vrm 3.5.5 (imported by the character loader; no VRM model is shipped) | `vendor/three-vrm/` | pixiv Inc. | MIT (`vendor/three-vrm/LICENSE`) | https://github.com/pixiv/three-vrm |
| Twelve realistic people (Rocketbox adults: Female 01, 03, 05, 08, 12, 14; Male 01, 04, 06, 08, 10, 16, facial versions), converted to GLB with smaller textures | `assets/people/` | Microsoft | MIT (`assets/rocketbox/LICENSE.md`) | https://github.com/microsoft/Microsoft-Rocketbox |
| Motion-capture clips (idles, walks, talking, sitting, dancing, waving, phone, drinking…), converted to one GLB per clip | `assets/anims/` | Microsoft (Rocketbox) | MIT (`assets/rocketbox/LICENSE.md`) | https://github.com/microsoft/Microsoft-Rocketbox |
| Universal Animation Library (Standard), glTF conversion | `assets/anim/` | Quaternius; glTF by J-Ponzo | CC0 | https://github.com/J-Ponzo/gltf-universal-animation-library |
| Furniture (House Interior pack) | `assets/furniture/` | Quaternius | CC0 | https://quaternius.com, via https://github.com/trebeljahr/quaternius-showcase |
| Trees, plants, rocks, street light, buildings, TV (Nature, Street, Buildings 3, Cyberpunk packs) | `assets/scenery/` | Quaternius | CC0 | https://quaternius.com, via https://github.com/trebeljahr/quaternius-showcase |
| Work-station question banks | `src/game/school/rocket.mjs` | NodeGX project (Rocket School and Star Class templates) | MIT, as the code | https://nodegx.io |

Everything else (the code, the textures painted at run time, the made-in-code fridge, TV, telescope, cot and signs) is
part of this game and MIT.

Not shipped: the anime (VRM) sample and the Quaternius "Casual" woman used in early character tests; the raw
Rocketbox FBX and TGA sources.
