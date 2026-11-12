# Credits

## Libraries

| What | Author | Licence | Source |
|---|---|---|---|
| three.js 0.186.1 (`vendor/three/`) | three.js authors | MIT (`vendor/three/LICENSE`) | https://threejs.org, https://github.com/mrdoob/three.js |

## Sounds (`assets/sfx/`)

All CC0 (public domain): no attribution needed, given anyway. Each file was cut to its first hit, faded out, made
mono at 32 kHz and loudness-normalised (ffmpeg); the cave's reverb is added in the game.

| Files | Source | Licence |
|---|---|---|
| `shot-1/2/3.wav` (AK-47), `shot-heavy.wav` (SKS), `shot-light.wav` (AR-15), `shotgun.wav` (Mossberg 190) | The Free Firearm Sound Library ("Prepared SFX Library"), https://opengameart.org/content/the-free-firearm-sound-library | CC0 |
| `boom-0…4.wav` (explosionCrunch), `boom-big.wav` (lowFrequency_explosion), `laser.wav` (laserLarge), `zap.wav` (laserSmall), `launch.wav` (forceField) | Kenney, Sci-fi Sounds, https://kenney.nl/assets/sci-fi-sounds | CC0 |
| `roar-*`, `grunt-*`, `hurt-*`, `howl`, `weird-*`, `bug-*`, `monster-*`, `scream-02` | "80 CC0 creature SFX", https://opengameart.org/content/80-cc0-creature-sfx | CC0 |
| `brute-roar.wav` | "CC0 Deep Monster Roar", https://opengameart.org/content/cc0-deep-monster-roar | CC0 |

Every other sound in the game is synthesised in code (`src/audio.mjs`).

## Everything else

The block textures, the models (ship, tools, crawlers) and the icon are drawn in code or by hand for this game and are
under the game's own licence (see `game.json`).
