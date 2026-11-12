# Es war einmal in Ost-Berlin

*Once upon a time in East Berlin.* A point-and-click museum of growing up in East Berlin in the 1980s and in
reunified Berlin in the 1990s, made to be played together on the family TV.

Mama or Papa was born in East Berlin. The children walk down "our street" (a Plattenbau cut open like a doll's
house, the Kaufhalle, the school, the TV tower, a Trabi packed for the holidays) and click on everything. Each find is
a sticker for the album, a card about the thing (Sandmännchen, Halloren-Kugeln, the Ampelmännchen, the SEZ wave pool,
Tamagotchis…), a real photo, often a film clip, and a question: **"Frag Mama"** or **"Frag Papa"**. The game brings
the object; the parent brings the memory. Pick who grew up there on the first screen.

*Mama oder Papa ist in Ost-Berlin geboren. Die Kinder klicken sich durch die Wohnung, die Kaufhalle, die Schule, die
Stadt, die Ferien und die 90er: 73 Dinge, jedes ein Sticker fürs Album, mit Foto, oft mit Film, und mit einer Frage:
„Frag Mama“ oder „Frag Papa“.*

The names of things are German, the stories are in English (written for a family that speaks both).

## Play it

At https://games.nodegx.io/ostberlin/, or on your own machine:

```bash
npx tiged The-Low-Code-Foundation/nodegx-gaming/games/ostberlin my-museum
cd my-museum
npx serve .            # or: python3 -m http.server 8000
```

Then open the address it prints. Plain scripts, no modules, so old TV browsers run it. Opening `index.html` straight
from the disk mostly works too, but YouTube refuses to play its films in a `file://` page: serve it.

**On a smart TV:** serve it on your local network (`python3 -m http.server 8000 --bind 0.0.0.0`) and type
`http://<your-computer's-address>:8000/` into the TV's web browser. A pointer remote (like LG's Magic Remote) is a
mouse: point and click.

## What is in it

| Place | German | Things | Something to do |
| --- | --- | --- | --- |
| Living room | Das Wohnzimmer | 7 | flip through 9 TV channels and 7 records |
| Kitchen | Die Küche | 8 | cook 4 dishes by picking what goes in |
| Children's room | Das Kinderzimmer | 7 | play "Alle meine Entchen" on the Triola; 4 books |
| Supermarket | Die Kaufhalle | 11 | a shopping list of 4 to find |
| School | Die Schule | 9 | |
| The city | In der Stadt | 10 | |
| Holidays | In die Ferien | 10 | |
| The 1990s | Die 90er | 11 | an 8-song mixtape |

"Tipp" makes the things you have not found yet glow. Progress is kept in the browser.

## Needs the internet for

The films (57 of them) play from YouTube inside a drawn television. Without the internet everything else works:
photos, drawings, stickers, the little games.

## State

Complete and playable. The texts were written from general knowledge of the period; if your family remembers a
detail differently, change it (see `CLAUDE.md`). Photos are from Wikimedia Commons, credited under every photo and in
`CREDITS.md`.
