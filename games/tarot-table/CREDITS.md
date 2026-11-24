# Credits

Tarot Table was made in NodeGX (<https://nodegx.io>) by The Low Code Foundation. Every card meaning, question and
spread was written for it. The meanings follow the common reading of the Rider-Waite-Smith deck (1909); no card art
from any deck is included. The 78 card pictures in `project/cards/` are simple emblems and pips drawn by
`tools/draw-cards.mjs` for this app (each Major Arcana card shows the symbol it is known by, such as the Tower's
lightning or the Hermit's lantern; no deck's artwork was copied or traced).

## Code

| What | Where | Licence |
|---|---|---|
| The app (the NodeGX project) | `project/` | GPL-3.0, as in the NodeGX repository it came from |
| The PWA step (manifest, icons, service worker) | `pwa/` | GPL-3.0 |
| NodeGX runtime | `play/noodl.deploy.js`, `play/serve.js`, `play/load_terminator.js`, `play/noodl-app.png` | MIT (`play/NODEGX-LICENSE.txt`); bundled third-party code listed in `play/noodl.deploy.js.LICENSE.txt` |
| React | `play/react*.production.min.js` | MIT, Meta Platforms, Inc. and affiliates |

## Fonts

| What | Where | Licence |
|---|---|---|
| Inter | `project/noodl_modules/inter`, `play/noodl_modules/inter` | SIL Open Font License 1.1 (`LICENSE.txt` beside it) |

Headings use the system serif (Georgia where there is one).

## Pictures

`thumb.jpg`, the app icon (`pwa/icon.svg` and its PNGs) and the card pictures (`project/cards/`, made by
`tools/draw-cards.mjs`) were drawn for this app. Same licence as the project.
