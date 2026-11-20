# The opening: a dock hand, and the carrier that comes in

The next big piece of ThreadSpace after the carrier rebuild ([`CARRIER-REBUILD.md`](CARRIER-REBUILD.md)). Written
November 2026 as a set of tasks; none of it is started.

## The idea

You don't start as a captain. You start as a dock hand on a station, doing busywork for a shift foreman. One shift,
the berth lights go amber and the biggest ship you have ever seen comes in to dock: the carrier. By the end of the
scene she has hired you. She is the first ship you work on, and the career that follows (today's "first week aboard")
is where you learn every job on a warship.

Between the busywork, you can go and learn from the people at their posts: comms, sensors, navigation, tactical,
operations, engineering, flight control. Each post has its own **console**, a working interface you can try out under
the officer who runs it. These are not mini-games bolted on. They are the real tools of the ship, and when you have a
ship of your own later in the game you plan battles, talk to other ships and run her stores and power on the same
consoles.

## How it fits what is there

- `carrier.html`'s career already starts with "report to the coxswain". The dock scene goes in front of it and ends
  with you walking up the boarding tube to do exactly that. The first week stays as it is, as chapter two.
- The carrier is being rebuilt as the twin-drum design. The arrival needs her outside (phase 2 of the rebuild). The
  dock and the hiring can be grey-boxed against today's `assets/carrier/hull.glb` first and swapped when v2's hull
  lands.
- Animations between seats in the main game run on `src/sequence.mjs` (tracks over a span of seconds, a skip that
  lands in the same place as watching). The arrival and the hiring are built the same way.
- The officers already have recorded voices (`ships/carrier.voices.json`, `tools/voices.mjs`). New lines for the dock
  foreman, dock traffic control and the hiring conversation are recorded the same way and shipped as files. No AI call
  at play time.
- The ship's watch routine (`src/carrier/watch.mjs`) already has off-watch hours. Those are when you go and learn a
  console.

## The scene, beat by beat

1. **The shift.** You wake in a dock hands' bunkroom and clock on. The foreman gives you a shift card: a quota of
   small jobs on the berth. Some to choose from:
   - move cargo pallets to their marked bays with a powered loader;
   - read crate manifests and route each crate to the right ship's stack;
   - walk the berth's docking clamps and sign off each one's check;
   - couple a ship's water and propellant umbilicals and read the flow back to the foreman;
   - clear debris from an airlock seal before it is cycled.

   Each job is short, on its own clock, and counts towards the quota. The foreman notices if you are gone too long.
2. **She comes in.** Partway through the shift, dock traffic control clears the big berth on the speakers, the berth
   lamps go amber and a klaxon sounds. You keep control (no cutscene takes the camera): a gallery window runs the length
   of the berth, and a soft prompt draws you to it. The carrier comes in on her thrusters, tugs at her flanks, and
   keeps coming: she is far longer than the berth. Clamps close, umbilicals reach out, a boarding tube extends to her
   side.
3. **She is short of hands.** The coxswain (the Irish voice) comes down the tube looking for the foreman. The ship lost
   crew in a raid and has to sail short-handed unless she signs on hands here. She needs her resupply loaded first, and
   fast.
4. **You prove yourself.** The foreman hands the resupply to you. It is the same busywork, against the ship's clock,
   with the coxswain watching.
5. **The offer.** A short conversation with the coxswain. Your answers (honest, keen, cheeky) set a small starting
   trait and change how she talks to you in the first week. Every path ends in an offer. You sign on at the berth
   office and walk up the tube, and the first week's first order, "report to the coxswain", is on your duty card.

The ship has no name yet (the layout's `name` is "Carrier"). The dock board announces her, so this task needs one.

## The consoles

One console per post, each taught by the officer who stands it, each a panel you sit at with the mouse (the main game's
right-hand panel is the model). A console reads and writes the ship's real systems. For practice it runs against a
**drill**: a seeded made-up situation, the way the gunnery drill streams a target sled past instead of a raider.

| Console | What you do on it | Drills to qualify | On your own ship later | Built on |
|---|---|---|---|---|
| Navigation | Plot a burn: destination, burn, flip, coast, burn; see the Δv it costs and the time it takes; hand the plan to the helm. | Plot to a waypoint within a Δv budget; intercept a moving contact; line up a thread gate. | Course planning; routing a fleet. | `helmsight.mjs` (the nav plot, flip and burn), `plant.mjs` (Δv). |
| Sensors | Go passive or active; build tracks from returns; classify contacts by drive plume, heat and size; weigh what going active gives away. | Find and classify three contacts in clutter; hold a track through a burn. | Seeing before being seen. | The raider and target sled as contacts. |
| Comms | Hail, challenge and identify contacts by transponder; pick channels; work with light-lag at range; queue and pass message traffic by priority. | Challenge an unknown; pass a flash message in the right form; answer a distress call. | Talking to other ships, the station, your fleet. | The main game's radio (`src/comms.mjs`, its optional local model). |
| Tactical (CIC) | Make a fire plan: give turrets, point defence and torpedoes their targets; set weapons tight or free; time a salvo to saturate their point defence. | Beat a torpedo raid by sharing out the point defence; plan a salvo that gets through. | Planning battles. | `weapons.mjs`, the CIC's turning plot; the main game's command map (`src/command.mjs`). |
| Operations | Run the ship's budgets: power, heat, propellant, stores (food, water, spares, ammunition), who is posted where. | Bring her to action stations inside a heat budget; provision a 30-day patrol. | Running your ship's economy and cargo. | `plant.mjs`, the watch bill. |
| Engineering | Reactor output, switchboards, coolant loops; route power round a wrecked bus. | Bring the reactor up from cold; keep the drive lit through a damaged bus. | Keeping your ship alive. | `integrity.mjs`, the damage control switchboards. |
| Flight control | The launch and recovery queue, pad assignments, refuel and rearm turnaround, the lane. | Recover four fighters low on fuel in the right order. | Running your own fighters. | `approach.mjs`, the hangar pads. |

The helm already exists and stays where it is in the career.

A console's lessons are data (`ships/carrier.lessons.json`): who teaches it, the drills in order, each drill's seed
and its pass mark. Passing them earns a **qualification**, which goes in the career save, shows on your duty card,
and can open promotions and posts the first week doesn't (a sensors-qualified hand can be put on the sensor watch).

## Tasks, in order

Each ends playable.

1. **The console framework.** `src/consoles/`: a console as a panel over a small ship interface (the systems it may
   read and write), the drill runner (seed in, situation out, pass or fail), qualifications in the career save, and the
   lessons file. Sit at a seat → the panel opens; E stands up. Build **navigation** with it first: the nav plot and
   the rocket equation are already there. Done when the navigator teaches you the three nav drills and you hold the
   qualification.
2. **The rest of the consoles, one per session.** Suggested order: tactical (it uses the most of what is built), then
   sensors (tactical wants tracks), comms, operations, engineering, flight control. Each with its officer, its lessons,
   its drills.
3. **Learning on your off-watch hours.** In the first week, an instructor at a post will teach you during your off
   watch. The duty card lists the lessons open to you and where. Qualifications feed the career's promotions.
4. **The dock.** A station berth built as a set (the way `sets.mjs` builds rooms): the berth, the gallery window, the
   bunkroom, the berth office, the loader, cargo, clamps, umbilicals. The foreman and the shift card; the busywork jobs
   as data (`ships/dock.career.json`, or a chapter in the career file). Done when you can work a whole shift.
5. **The arrival.** The carrier's approach, the tugs, docking, the boarding tube, as a `Sequence` run in the world
   while you keep walking. Dock traffic control's lines recorded. Grey-box on the v1 hull if the v2 hull isn't ready.
6. **The hiring.** The coxswain's entrance, the timed resupply, the conversation (a small dialogue tree as data, its
   lines recorded), signing on, the walk up the tube into the first week. A start-screen entry: **Start on the dock**
   (and the first week stays reachable on its own for testing).
7. **Your own ship uses the same consoles.** In the main game (`index.html`), the Kestrel's panel tabs become the
   consoles. Its own task when the career reaches your first command.

## To decide before starting

- The carrier's name.
- Which station the dock is on. Haven Station from the main game would join the two halves of the game up.
- Whether a console is a 2D panel (quick, like the main game's) or drawn on the seat's screens in 3D (nicer, slower).
  Suggested: 2D panel first, the same panel later drawn on the screens.
- Whether failing a drill matters beyond doing it again.
