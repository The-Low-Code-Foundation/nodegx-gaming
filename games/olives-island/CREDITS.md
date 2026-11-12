# Credits

Olive’s Island was made in NodeGX (<https://nodegx.io>) by The Low Code Foundation. The requests, the islanders, the
hints and every word in `project/components/Data/` were written for this game. Every sprite and block icon in the kits
is inline SVG drawn for it; there are no image or sound files.

## Code

| What | Where | Licence |
|---|---|---|
| The game (the NodeGX project and its scripts) | `project/` | GPL-3.0, as in the NodeGX repository it came from |
| NodeGX runtime | `play/noodl.deploy.js`, `play/serve.js`, `play/load_terminator.js`, `play/noodl-app.png` | MIT (`play/NODEGX-LICENSE.txt`); bundled third-party code listed in `play/noodl.deploy.js.LICENSE.txt` |
| React 18 | `play/react*.production.min.js` | MIT, Meta Platforms, Inc. and affiliates |
| `garden-kit` (block editor, flat garden), `garden-3d-kit` (3D island), `game-kit` (faces) | `project/noodl_modules/` | GPL-3.0, NodeGX library |
| Blockly 12.3.1, Google LLC and the Blockly authors (<https://github.com/google/blockly>) | `project/noodl_modules/garden-kit/blockly_compressed.js`, `blockly-msg-en.js`, `blockly-msg-fr.js`, unmodified | Apache-2.0 (`garden-kit/LICENSE.txt`) |
| three.js r158, the three.js authors (<https://threejs.org>) | `project/noodl_modules/garden-3d-kit/three.min.js` | MIT (`garden-3d-kit/LICENSE.txt`) |

## Faces (DiceBear, inside `game-kit`)

<https://www.dicebear.com>. `@dicebear/core`: MIT. Styles: pixel-art and thumbs by Florian Körner (MIT); fun-emoji by
Davis Uche, big-smile by Ashley Seo, adventurer by Lisa Wischofsky (artwork CC BY 4.0).

## Fonts (bundled, nothing fetched)

| Font | Folder | Licence |
|---|---|---|
| Fredoka (from `@fontsource-variable/fredoka` 5.2.8) | `project/noodl_modules/bot-garden-fonts` | SIL Open Font License 1.1 (`OFL-Fredoka.txt`) |
| Nunito, The Nunito Project Authors | `project/noodl_modules/preset-font-nunito` | SIL Open Font License 1.1 (`OFL.txt`) |

## Picture

`thumb.jpg` is a screenshot of the 3D island from development, with test robots at work.
