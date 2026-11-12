# ThreadSpace

A space game in three.js. You own a frigate, the **Kestrel**, and you can do everything on her yourself: walk her decks,
sit at her helm, climb into her turret, launch her one fighter (the **Wren**) from the bay, step out of her airlock in a
suit, and board a pirate corvette with a rifle. Two crew fly and shoot for you when you are not in the seat. Stations
have a mission board, a market, a shipyard and a bar. Three sectors are joined by **threads**, mapped wormholes with
one gate each.

The screen is split: the 3D view on the left, a panel on the right that changes with where you are (ship, nav, crew,
missions, fleet; a station's board, trade and yard; a mission's radio).

## How to play

From the title screen:

- **New captain**: the campaign. Dress your captain at the locker, walk to the helm, fly to Haven Station (J to dock),
  take a job, and go. One loop (bounty, trade, the Wren, a boarding, a space walk) takes 10 to 15 minutes. It saves to
  this browser when you dock or jump; **Continue** picks it up.
- **Drop-in mission**: about 15 minutes. Your ship, crew and credits are dealt to you and you arrive in the middle of a
  standoff: pirates hold a hauler and want a ransom before their thread opens. Pay, haggle on the radio, call the law,
  fight, or board her. Ends with a debrief and a grade. Each mission comes from a seed, so `?mission=5` is always the
  same one.
- **Shipyard**: change the Kestrel's hull, wings, drives, detail and the colours of every room. Save, go back to the
  game, and **Refit her now** on the Ship tab. Designs are kept in this browser; **Download** saves one as a file.

## Controls

| where | keys |
|---|---|
| anywhere | **Tab** pauses and opens the command map · **V** third person or your own eyes |
| walking | W A S D · mouse looks · **E** uses what you face |
| the helm / the Wren | mouse or arrows steer · A D roll · W S throttle · Space or click fires (Wren) · T targets · V chase view · **J** jumps a thread or docks · E stands up or lands |
| the turret | mouse aims · click or Space fires · T target · E climbs down |
| space walk | W S A D · R F up and down · Shift burns · E grabs a pod or goes back in |
| boarding | W A S D · mouse aims · click or Space fires · R reloads · hold E at the bridge console to take her |
| the command map | click a contact to give an order or a chain of orders · drag orbits · wheel zooms |

Click the view to take the mouse; Esc gives it back.

## State

Playable end to end on desktop with a keyboard and mouse. Not built: landing on planets, music, more than one drop-in
mission template, touch controls. Balance numbers are first guesses.

The drop-in mission's other captains talk from a script. If you run a local model with [Ollama](https://ollama.com),
they can answer in their own words instead: `node tools/llm-server.mjs`, then open `http://127.0.0.1:8787/?llm=on`.
It is off by default, and the game is complete without it.

## Run it locally

ES modules need a web server (opening `index.html` as a file will not work):

```bash
npx serve .            # or: python3 -m http.server 8000
```

Then open the address it prints. No install, no build.

## Make it yours

```bash
npx tiged The-Low-Code-Foundation/nodegx-gaming/games/threadspace my-game
```

`CLAUDE.md` is the map for an AI coder: where every system lives and how to add a sector, a mission, a crew member or a
ship.
