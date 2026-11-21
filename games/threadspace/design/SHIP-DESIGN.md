# Designing ThreadSpace ships

What we worked out designing the capital ship (November 2026), and how to use the designer for the next one. The tool
is [`ship-designer.html`](ship-designer.html) in this folder; the chosen carrier is
[`carrier-v2.design.json`](carrier-v2.design.json).

## The designer

`ship-designer.html` is one self-contained page (three.js from a CDN). Serve the game folder and open it:

```bash
npx serve .          # then open /design/ship-designer.html
```

- A ship is a chain of **sections, bow to stern**: `bow`, `drum` (spin gravity), `hangar`, `arms` (spin pods on
  telescoping arms), `spine`, `stern`, plus one `ship` node for whole-ship settings (guns, drive, marines, lifts).
- The page computes, live: length, mass, drive acceleration, spin gravity per section, spin balance, a crew estimate
  and a room plan, what a shell meets on its way into the drum, getting about (lift ride, ladder, muster time,
  journeys), and recoil.
- **Copy JSON** gives the design as data. Paste it into a `*.design.json` file here to keep it.
- Inside claude.ai the page also saves designs to a shared store, so Claude can read what you saved. Opened from this
  folder it keeps unsaved edits in the browser only.
- To add a section type: an entry in `TYPES` (its settings drive the panel by themselves), a builder in `BUILDERS`, and
  its mass in `sectionMass`. Everything between `// ==LOGIC==` and `// ==/LOGIC==` has no DOM or three.js, so it runs
  in node for checking numbers:
  `sed -n '/\/\/ ==LOGIC==/,/\/\/ ==\/LOGIC==/p' ship-designer.html > /tmp/logic.mjs`.

- It loads three.js from the game's `vendor/` folder. To publish it as a claude.ai artifact again, point its import
  map at `https://cdn.jsdelivr.net/npm/three@0.186.1/build/three.module.js` and `.../three@0.186.1/examples/jsm/`
  (artifacts can't reach `../vendor/`).

The numbers are for comparing designs, not engineering. Mass uses rough densities tuned so the old 400 m carrier
comes out near its 200,000 t; crew counts come from a per-system estimate (`crewEstimate`).

## Rules of the universe these ships follow

- **No shields.** Protection is armour, spacing, point defence and spreading the vital parts out.
- **Real flight physics.** No drag, no top speed. Turning a big ship is slow; stopping is flip and burn.
- **Gravity comes from spin, not thrust.** Thrust gives weight only while the drive burns. Crews live in spinning
  drums; everything that fights or flies sits in weightless, fixed hull.

## Spin gravity

- `g = ω²r`, measured at the floor. Comfort is set by rpm: up to 2 is comfortable, up to 4 most people adapt within
  days, 4 to 6 needs training, above 6 is sickening. 1 g at 2 rpm needs a 224 m radius.
- **Radius buys comfort.** Inside a 68 m hull you get about half a g at 4 rpm. The carrier's 65 m drum gives about
  1 g at 3.7 rpm.
- **Walking changes your weight.** Walking spinward makes you heavier by `2ωv`: about ±11% at 3.7 rpm and 65 m.
  Head to feet, you are ~3% lighter at the head.
- **Flat floors lean.** In a ring of flat-floored rooms the floor at a room's edge leans `180° ÷ rooms per ring`.
  Use 30 or more rooms per ring (about 10 m wide at 65 m), or curve the floors.
- **Spin in counter-rotating pairs.** One drum is a gyroscope that fights every turn. Two halves spinning opposite
  ways cancel, and inside one sleeve they look like one drum.
- **Thrust tips the floor aft** by `atan(drive ÷ spin g)`. Rooms on pivots could swing level; the carrier doesn't.
- **Damage unbalances a drum.** A hit that removes mass makes it wobble. Water tanks in the ring can be pumped to
  rebalance it, which is one reason the belt is water.

## Protecting a drum

Outside in, the carrier's drum is: a **fixed armoured sleeve** (0.5 m steel, carries the turrets), a **2.5 m gap**, a
**2 m belt of water tanks and stores** spinning with the drum, then **two 3 m decks** of rooms. This is the
battleship side-protection idea (empty and liquid-filled layers in front of the main armour): the sleeve breaks the
shell up, the gap lets it scatter, the belt catches the pieces. The water also shields the crew from radiation.
A 1 m solid steel belt instead would weigh about 360,000 t, nearly doubling the ship.

## Rooms and crew

- Size the drum from the crew, not the other way round. The first 1 g drum (112 m long) held about four times the
  crew; one 22 m ring per half was enough.
- The crew estimate: command 80, 10 a turret, 3 a torpedo tube, 2 a point defence gun, 9 a fighter, 27 a berthed
  medium ship (her two crews, her cradle and deck hands, her maintainers), 40 + 20 an
  engine for engineering, damage control 60, support 62. About 12% are officers. Marines on top.
- Rooms are about 90 m² (10 m round the ring × 9 m deep). A berth room holds 8 two-bunk cabins with heads and
  showers (16 people); officers get 6 single cabins.
- Placement rules: messes, the sick bay and ops beside the lifts; the sick bay on the outer deck (surgery wants full
  gravity); aircrew and ops at the end nearest the hangar; berths in the quiet stretches between lifts; heavy rooms
  (stores, gardens) in opposite pairs so the drum stays balanced. The combat CIC stays in the fixed, armoured hull.

## Getting about

- **Ring corridor.** Each deck has a 3 m corridor right round the ring, rooms fore and aft of it, so nobody walks
  through rooms. Seen from inside, it rises ahead and behind until it disappears overhead. Pressure doors every few
  rooms; it doubles as a running track.
- **Spokes.** Six per ring, each with two lifts and a ladder tube, from a **hub ring** that turns round the fixed spine
  corridor. At 6 m radius the hub moves at about walking pace (~2.3 m/s at 3.7 rpm): you catch a handhold and swing
  into the lift lobby. Stretchers and cargo use a slow car that spins up to match.
- **The lift ride** (55 m, about 45 s): you get heavier all the way down. The spin also pushes a moving car sideways
  (`2ωv`, about 0.16 g at 2 m/s), which beats "down" for the first few metres below the hub, so cars run slowly
  there, the seats face across the shaft and everyone holds a rail.
- **The ladder** is the backup: handholds near the hub, a real climb lower down. Up from the deck is like 9 storeys,
  getting easier as you go.
- **The hangar is airless**, so a **pressurised crew tunnel** runs along its top, carrying the spine from bow to stern,
  with boarding tubes down to the fighters. Pilots never need a suit. Without the tunnel every trip through the middle
  of the ship costs about 5 minutes of suiting up.
- **Action stations empty the drum.** Guns, tubes, the hangar, engineering and the bridge are all in the weightless
  hull, so ~530 off-watch crew and marines go up the spokes at once: about 4.6 minutes. The sick bay and damage
  control stay in the drum.
- Ideas not built yet: weightless ready rooms beside the hangar for pilots on alert (scramble under a minute); a moving
  tow-line along the spine, like a ski drag lift, to halve the long floats.

## Weapons and recoil

- A shell shoves the ship back with its own momentum. On a 300,000 t ship that is millimetres a second, which the RCS
  absorbs. **Where the gun sits matters more:** a top turret firing broadside rolls the ship, and a long ship rolls
  far more easily than it pitches. **Fire top and bottom together** and the roll cancels.
- **Turrets go on fixed hull** (bow, sleeve, hangar, stern), on the top and bottom centrelines like a dreadnought:
  space has no up, so both bear on either side.
- **Torpedoes are the long arm.** Launch cold (coil or gas), coast dark, light the motor late. Forward tubes in the bow,
  broadside tubes in the hangar walls. Fighters outrange guns, as carriers outranged battleships in 1942.
- Naval lessons worth reusing: line-of-battle broadsides, dreadnought centreline turrets, all-or-nothing armour (heavy
  armour over a citadel, almost none elsewhere), carrier over battleship, submarine torpedoes, missiles and point defence.

## The carrier as chosen ("Twin-drum carrier", v2)

| Section | What it is |
|---|---|
| Bow, 72 m | Weightless. 6 forward torpedo tubes, a turret top and bottom, 6 point defence guns, 0.5 m armour. |
| Drum, 2 × 22 m | Fixed 0.5 m armoured sleeve round two counter-rotating halves, inner radius 57.5 m, 8 m ring (2 m water/stores belt, two 3 m decks), 40 rooms round, ring corridor, 6 spokes, 3.7 rpm: 0.97 g outer deck, 0.93 g inner. |
| Hangar, 145 m | Airless, weightless, 38 m wide and 23 m high inside. 6 fighters (three a side) and berths for 2 medium ships (the cutters: each lies fore and aft on a cradle beside the gangway and is pushed out sideways). One launch door a side, 63 m long and 18 m high: its forward 19 m in front of the fighters' pads, the rest in front of the berth. 8 broadside tubes a side, 3 turrets top and 3 bottom, 6 point defence guns, a crew tunnel over it; you reach it through its airlock. |
| Stern, 53 m | Weightless. 3 engines (140 MN each), folding radiators, bridge tower, a turret top and bottom, 6 point defence guns. |

314 m long, about 336,000 t, 0.13 g on the main drive; about 612 crew plus 120 marines; 320 rooms, 94 spare.
(Until November 2026 she was 288 m, with a 119 m hangar for twelve fighters: `design/ROADMAP.md`, phase 11.)
Guns fire 1,000 kg shells at 5,300 m/s.
