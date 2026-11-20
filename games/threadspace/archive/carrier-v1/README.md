# The first carrier (archived)

The carrier ThreadSpace's carrier prototype started with: 400 m long, three decks, a railgun down her keel, four
fighters, and gravity only while her drive burns. The spin-drum carrier (`ships/carrier.*.json`) replaced her and is
what `carrier.html` plays. She is kept here, out of the game, for now.

| File | What it is |
|---|---|
| `carrier-v1.layout.json` | Her layout. `tools/carrier-v2.mjs` still reads it: the spin-drum carrier's weapons, damage control, integrity, plant, routes and fighter numbers start from hers. Don't delete it. |
| `carrier-v1.career.json`, `carrier-v1.watches.json` | Her first week and her ship's routine. `tools/voices.mjs` still lists their lines, so `--prune` keeps her clips. |
| `hull-v1.glb` | Her outside, built by `carrier_build.py`. |
| `carrier_build.py` | `blender -b --factory-startup --python archive/carrier-v1/carrier_build.py`, from the game's folder. It writes `hull-v1.glb` here, using `tools/blender/shipkit.py`. |

The game's code still handles a layout like hers: a ship without drums walks on plain decks, a `weapons.railgun` is
fired from the helm in place of a broadside, and the career saves under `Career.key`.

## Bringing her back

1. Move the three JSON files back to `ships/` and `hull-v1.glb` to `assets/carrier/`. Point `tools/carrier-v2.mjs`,
   `tools/voices.mjs` and `carrier_build.py` back at those paths.
2. In `src/carrier/main.mjs`, choose the ship from the address again, so that `carrier.html?ship=v1` plays her:
   - `const SHIP = new URLSearchParams(location.search).get('ship') === 'v1' ? 'carrier-v1' : 'carrier';`
   - fetch `ships/${SHIP}.layout.json`, `.career.json` and `.watches.json`;
   - `loadHull(C, SHIP === 'carrier' ? undefined : 'assets/carrier/hull-v1.glb')`;
   - before `new Career`: ``if (SHIP !== 'carrier') Career.key = `threadspace.${SHIP}.career`;`` (both careers have
     28 steps, so they must not share a save);
   - give her her own start-screen text in `#c-about`.

## How her main deck is laid out

Deck 2 follows how a warship is planned, not a single long corridor:

- Two fore-and-aft passages, port (`p1`…`p7`, x -5.6 to -4.0) and starboard (`s1`…`s7`, x 4.0 to 5.6), with a centre block of rooms between them and the outboard rooms beyond.
- Transverse pressure bulkheads at z -108, -76, -46, -12, 22, 56, 84 and 112 split the deck into seven zones. Each passage segment ends at a bulkhead with a pressure door into the next one.
- A cross passage (`x2`, `x3`, `x5`, `x6`) in most zones joins the two sides, with the one-way stencils.
- Each zone groups rooms that work together. From forward: command (CIC deep in the hull, comms, wardroom); berthing (quarters beside the washrooms and laundry); messing (galley between the messes, its stores and scullery); flight and medical (hangar trunk and ladder, damage control, aircrew, medbay); security and welfare (armoury beside the brig); workshops; and engineering support aft. Each zone has a repair locker.

A new room belongs in the zone it works with, opening off that zone's passage or cross passage, never through a bulkhead.
