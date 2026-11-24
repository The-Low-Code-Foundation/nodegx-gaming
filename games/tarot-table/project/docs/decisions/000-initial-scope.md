# 000 — Initial scope

_Recorded 2026-11-24T08:10:09.014Z, from the scoping conversation held before this project was created._

## What was asked for

> I've just got a tarot set for the first time, and I have no idea wtf to do with it. I know you're supposed to learn how to read them but it'll take forever, there's a million cards. I want to make one using NodeGX. Can you make it a PWA so I can add it to my phone and use it when we pull out the tarot cards? I don't believe in esoteric stuff but it's fun to make people think about their future, I see it as more like light therapy than spiritual.

## What was decided

**The app.** A phone companion for a real Rider-Waite-style tarot deck: choose a spread, tap in each card you draw (suit, then number, upright or reversed), and get a plain, warm reading of that card in that position plus a question to ask the person. Tarot as a conversation starter, not a prophecy.

**Who it is for.** A group around a table with a physical deck and nobody who knows tarot. One person holds the phone and reads aloud.

**Pages.**

- Home — Pick a spread (one card, three cards, five cards), with a one-paragraph 'what is this' for newcomers.
- Reading — One position at a time: the position's job and a prompt, a two-tap card picker (Major/Wands/Cups/Swords/Pentacles, then the card) with an upside-down toggle, then the card's meaning in that position and a question to ask. Ends with a summary of all cards drawn.
- Deck — Browse every card: the suit grid, then one card's keywords, upright and reversed meanings and its question. Also lets the app draw for you when the deck isn't to hand.

**Backend.** Nothing stored. The 78 cards and the spreads are Static Data in the project; no history is kept.

**Rules for this project.**

- Every card meaning is written in plain words and ends in a question for the person, never a prediction
- Colours and spacing as tokens, never raw hex in nodes

## What was considered and rejected

This is the section with the longest shelf life. It is what stops the next reader — or the next
assistant — helpfully rebuilding something that was deliberately left out.

- **A classic mystic voice** — rejected: Owner chose warm and plain: the reading is a prompt for reflection, like light therapy.
- **Reversals as an optional setting** — rejected: Owner chose always on: every card entry has an upside-down toggle.
- **Keeping a reading history on the phone** — rejected: Owner said no.

## Deliberately out of scope

- Predicting anything: the app never says what will happen, only what to talk about
- Saving a history of readings (ruled out by the owner)
- Card artwork: cards are typographic, so no images of the Rider-Waite deck are shipped
- Accounts, a backend, AI calls

## Still open

Nothing was left open in the conversation.

## Proposed build plan

Produced from the scope above and handed over unexecuted — no components were authored during
scoping. Review it before building.

1. **create `Pages/Reading`** — One position at a time: the position's job and a prompt, a two-tap card picker (Major/Wands/Cups/Swords/Pentacles, then the card) with an upside-down toggle, then the card's meaning in that position and a question to ask. Ends with a summary of all cards drawn. Sibling pages in this app: Home, Deck. Follow docs/CONVENTIONS.md; docs/BRIEF.md says what this app deliberately does not do.
2. **create `Pages/Deck`** — Browse every card: the suit grid, then one card's keywords, upright and reversed meanings and its question. Also lets the app draw for you when the deck isn't to hand. Sibling pages in this app: Home, Reading. Follow docs/CONVENTIONS.md; docs/BRIEF.md says what this app deliberately does not do.
3. **update `Pages/Home`** — Pick a spread (one card, three cards, five cards), with a one-paragraph 'what is this' for newcomers. Sibling pages in this app: Reading, Deck. Follow docs/CONVENTIONS.md; docs/BRIEF.md says what this app deliberately does not do.

<!-- The same plan, for the editor to read back if it is offered again. Safe to delete. -->

```json nodegx-plan
{
  "version": 1,
  "plan": {
    "request": "I've just got a tarot set for the first time, and I have no idea wtf to do with it. I know you're supposed to learn how to read them but it'll take forever, there's a million cards. I want to make one using NodeGX. Can you make it a PWA so I can add it to my phone and use it when we pull out the tarot cards? I don't believe in esoteric stuff but it's fun to make people think about their future, I see it as more like light therapy than spiritual.",
    "operations": [
      {
        "id": "op-2",
        "kind": "create",
        "target": "Pages/Reading",
        "intent": "One position at a time: the position's job and a prompt, a two-tap card picker (Major/Wands/Cups/Swords/Pentacles, then the card) with an upside-down toggle, then the card's meaning in that position and a question to ask. Ends with a summary of all cards drawn. Sibling pages in this app: Home, Deck. Follow docs/CONVENTIONS.md; docs/BRIEF.md says what this app deliberately does not do."
      },
      {
        "id": "op-3",
        "kind": "create",
        "target": "Pages/Deck",
        "intent": "Browse every card: the suit grid, then one card's keywords, upright and reversed meanings and its question. Also lets the app draw for you when the deck isn't to hand. Sibling pages in this app: Home, Reading. Follow docs/CONVENTIONS.md; docs/BRIEF.md says what this app deliberately does not do."
      },
      {
        "id": "op-1",
        "kind": "update",
        "target": "Pages/Home",
        "intent": "Pick a spread (one card, three cards, five cards), with a one-paragraph 'what is this' for newcomers. Sibling pages in this app: Reading, Deck. Follow docs/CONVENTIONS.md; docs/BRIEF.md says what this app deliberately does not do."
      }
    ],
    "scroll": "page"
  }
}
```

## Transcript

_(no transcript was captured)_
