// How a card is read in depth, and how a whole table is read together.
// Pure functions: the Functions that use this file pass the cards, suits, ranks and spread in.
// Every function returns a list of sections, { id, heading, body, kind }, drawn by Cards/Section
// (kind 'text', 'ask' or 'tip').

const FIT = 'Try it another way. Could it be a person in your life? Something inside you rather than around you? ' +
  'Advice, rather than a description? Or the thing to watch out for? Read it next to the card before it. ' +
  'It doesn\'t have to be right; it has to get you talking.';

function push(list, prefix, key, heading, body, kind) {
  if (body) list.push({ id: prefix + key, heading: heading || '', body: body, kind: kind || 'text' });
}

function asks(list, prefix, key, qs) {
  (qs || []).forEach((q, i) => push(list, prefix, key + i, i === 0 ? 'More questions to try' : '', q, 'ask'));
}

// The deeper look at one card, the way it lies. opts.shared === false leaves out what is the same
// both ways up (the picture, why, the person, the tip), for a page that shows both sides.
exports.moreFor = function (c, down, prefix, opts) {
  const out = [];
  if (!c) return out;
  const p = prefix || '';
  const shared = !opts || opts.shared !== false;
  if (down) {
    push(out, p, 'flip', 'Upside down',
      'Right way up, ' + the(c) + ' is about ' + c.keywords + '. Upside down, that energy is blocked, turned inward, ' +
      'overdone, or only just starting' + (c.revKeywords ? ': here, ' + c.revKeywords + '.' : '.'), 'tip');
    push(out, p, 'deep', 'Going deeper', c.revMore);
    if (shared) {
      push(out, p, 'pic', 'On the card', c.picture);
      push(out, p, 'why', 'Why it means this', c.why);
    }
    push(out, p, 'love', 'In love, friends and family', c.loveRev);
    push(out, p, 'work', 'In work and money', c.workRev);
    push(out, p, 'self', 'Inside you', c.selfRev);
    if (shared) push(out, p, 'who', 'If it\'s a person', c.person);
    asks(out, p, 'ask', c.alsoAskRev);
  } else {
    if (shared) {
      push(out, p, 'pic', 'On the card', c.picture);
      push(out, p, 'why', 'Why it means this', c.why);
    }
    push(out, p, 'deep', 'Going deeper', c.more);
    push(out, p, 'love', 'In love, friends and family', c.love);
    push(out, p, 'work', 'In work and money', c.work);
    push(out, p, 'self', 'Inside you', c.self);
    if (shared) push(out, p, 'who', 'If it\'s a person', c.person);
    asks(out, p, 'ask', c.alsoAsk);
  }
  if (shared) push(out, p, 'fit', 'If it doesn\'t seem to fit', FIT, 'tip');
  return out;
};

// The keywords for the way the card lies.
exports.keywordsFor = function (c, down) {
  if (!c) return '';
  return down ? (c.revKeywords || c.keywords) : c.keywords;
};

function rankOf(c) {
  if (!c || c.suit === 'major') return 0;
  return parseInt(String(c.id).split('-')[1], 10) || 0;
}

function names(list) {
  if (list.length <= 1) return list.join('');
  return list.slice(0, -1).join(', ') + ' and ' + list[list.length - 1];
}

// "the Five of Cups", but "Death" and "The Star": a Major Arcana card's name is used as it is.
function the(c) {
  if (!c) return '';
  return c.suit === 'major' || /^The /.test(c.name) ? c.name : 'the ' + c.name;
}

const COUNT = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];

// Reading the whole table together: the story in order, what stands out, the pairs this spread
// compares, and the question asked again.
// spread: { name, positions, together: [{ a, b, ask }] }; drawn: [{ step, cardId, reversed }].
exports.together = function (spread, drawn, cards, suits, ranks) {
  const out = [];
  if (!spread) return out;
  const rows = (drawn || []).slice().sort((x, y) => x.step - y.step).map(d => ({
    d: d,
    c: (cards || []).find(x => x.id === d.cardId),
    p: spread.positions[d.step] || {}
  })).filter(r => r.c);
  const n = rows.length;
  if (!n) return out;
  const label = r => the(r.c) + (r.d.reversed ? ', upside down' : '');
  const kw = r => exports.keywordsFor(r.c, r.d.reversed);

  push(out, 't-', 'how', 'Now read it all together',
    n === 1
      ? 'With one card there is nothing to combine, so go deeper instead. Tap the card on the table, open “More about this card”, and try each angle on your question in turn. Then ask the question again.'
      : 'You\'ve thought about each card on its own. Now ask your question again, out loud, with the whole table in front of you, and go through what follows. You\'re not looking for the right answer: you\'re looking for the story that fits.',
    'tip');

  if (n > 1) {
    push(out, 't-', 'story', 'The story in one breath',
      rows.map(r => (r.p.name || 'Card ' + (r.d.step + 1)) + ': ' + label(r) + ' (' + kw(r) + ').').join(' ') +
      ' Read it out in order, as one story. Where does it turn?');
  }

  // What stands out across the table. Only patterns that mean something at this size.
  const notes = [];
  const majors = rows.filter(r => r.c.suit === 'major');
  if (n >= 3) {
    if (majors.length === 0) {
      notes.push('No Major Arcana at all. This looks like everyday life, things that are in your hands, rather than a big turning point.');
    } else if (majors.length * 2 >= n) {
      notes.push(COUNT[majors.length] + ' of the ' + COUNT[n] + ' cards are Major Arcana (' + names(majors.map(r => the(r.c))) +
        '). That\'s a lot of big cards: this is about something that matters, maybe a turning point, not a passing worry.');
    } else if (majors.length === 1) {
      notes.push(the(majors[0].c) + ' is the only Major Arcana card here. It\'s the big theme the rest of the reading sits around: start with it.');
    }
  }
  const minors = rows.filter(r => r.c.suit !== 'major');
  const bySuit = {};
  minors.forEach(r => { bySuit[r.c.suit] = (bySuit[r.c.suit] || 0) + 1; });
  const suitOf = id => (suits || []).find(s => s.id === id) || { name: id, theme: '' };
  const top = Object.keys(bySuit).sort((a, b) => bySuit[b] - bySuit[a]);
  if (top.length && bySuit[top[0]] >= 2 && (top.length === 1 || bySuit[top[0]] > bySuit[top[1]]) && bySuit[top[0]] * 5 >= n * 2) {
    const s = suitOf(top[0]);
    notes.push('Mostly ' + s.name + ': ' + COUNT[bySuit[top[0]]] + ' of them. ' + s.name + ' are ' + (s.element ? 'the ' + s.element + ' suit: ' : '') +
      (s.theme || s.about || '').replace(/\.$/, '').toLowerCase() + '. Whatever the question was, the cards keep coming back to that.');
  }
  if (n >= 5) {
    const missing = ['wands', 'cups', 'swords', 'pentacles'].filter(id => !bySuit[id]).map(suitOf);
    if (missing.length && missing.length < 4) {
      notes.push('No ' + names(missing.map(s => s.name)) + '. ' + missing.map(s => s.name + ' are ' + (s.theme || s.about || '').replace(/\.$/, '').toLowerCase()).join('; ') +
        '. Is that not where the answer is, or is it being left out?');
    }
  }
  const down = rows.filter(r => r.d.reversed).length;
  if (n >= 3) {
    if (down === 0) notes.push('Every card is the right way up. Things are flowing; not much is pushing back.');
    else if (down * 2 >= n) notes.push(COUNT[down] + ' of the ' + COUNT[n] + ' cards are upside down. A lot here is blocked, held in, or not ready yet. What\'s being held back, and by whom?');
  }
  const byRank = {};
  minors.forEach(r => { const k = rankOf(r.c); byRank[k] = (byRank[k] || []).concat([r]); });
  Object.keys(byRank).forEach(k => {
    const same = byRank[k];
    if (same.length < 2) return;
    const rk = (ranks || []).find(x => x.rank === Number(k)) || {};
    notes.push(COUNT[same.length].replace(/^./, m => m.toUpperCase()) + ' ' + (rk.plural || 'cards of the same number') + ' (' + names(same.map(r => the(r.c))) + '). ' +
      (rk.meaning ? rk.plural + ' are about ' + rk.meaning.replace(/\.$/, '') + '. ' : '') + 'When a number repeats, its theme is loud in this reading.');
  });
  const courts = minors.filter(r => rankOf(r.c) >= 11);
  if (courts.length) {
    notes.push((courts.length === 1 ? 'There\'s a person in this reading: ' : 'There are people in this reading: ') + names(courts.map(r => the(r.c))) +
      '. Court cards are often someone real, or a side of you that\'s showing up. Who might ' + (courts.length === 1 ? 'it' : 'they') + ' be?');
  }
  if (n > 1) {
    if (!notes.length) notes.push('Nothing jumps out: a good mix of cards. Let the story above do the work.');
    notes.forEach((t, i) => push(out, 't-', 'note' + i, i === 0 ? 'What stands out' : '', t));
  }

  // The pairs this spread compares: two places read side by side.
  (spread.together || []).forEach((t, i) => {
    const a = rows.find(r => r.d.step === t.a);
    const b = rows.find(r => r.d.step === t.b);
    if (!a || !b) return;
    push(out, 't-', 'pair' + i, a.p.name + ', with ' + b.p.name.replace(/^./, m => m.toLowerCase()),
      label(a).replace(/^./, m => m.toUpperCase()) + ', and ' + label(b) + '. ' + t.ask, 'ask');
  });

  push(out, 't-', 'again', 'Ask it again',
    'With everything on the table, ask your question once more. What answer would you give yourself now?', 'ask');
  push(out, 't-', 'take', '', 'What\'s one small thing you could do this week because of this reading?', 'ask');
  if (n > 1) {
    push(out, 't-', 'clash', 'If the cards seem to disagree',
      'Cards that pull against each other are often the most useful part: they show a tension that\'s really there. Ask which one feels truer, and why. And if nothing fits at all, that\'s worth saying too: maybe the question you asked isn\'t the real question.',
      'tip');
  }
  return out;
};
