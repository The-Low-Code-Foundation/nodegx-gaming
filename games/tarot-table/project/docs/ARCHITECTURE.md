# Architecture

## Page map

- **Home** (`Pages/Home`) — Pick a spread (one card, three cards, five cards), with a one-paragraph 'what is this' for newcomers.
- **Reading** (`Pages/Reading`) — One position at a time: the position's job and a prompt, a two-tap card picker (Major/Wands/Cups/Swords/Pentacles, then the card) with an upside-down toggle, then the card's meaning in that position and a question to ask. Ends with a summary of all cards drawn.
- **Deck** (`Pages/Deck`) — Browse every card: the suit grid, then one card's keywords, upright and reversed meanings and its question. Also lets the app draw for you when the deck isn't to hand.

## Data model

> TODO: No records were agreed during scoping.

## Backend contracts

Nothing stored. The 78 cards and the spreads are Static Data in the project; no history is kept.

## Decisions

Considered during scoping and deliberately not done:

- **A classic mystic voice** — Owner chose warm and plain: the reading is a prompt for reflection, like light therapy.
- **Reversals as an optional setting** — Owner chose always on: every card entry has an upside-down toggle.
- **Keeping a reading history on the phone** — Owner said no.

_Scoping record: `docs/decisions/000-initial-scope.md`._
