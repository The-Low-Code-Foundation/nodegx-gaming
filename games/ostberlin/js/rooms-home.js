// The flat in the Plattenbau: living room, kitchen, children's room.
// An item: where it sits in the 1920x1080 scene (x, y, scale s), the box its drawing fills (w, h),
// its German name, the English under it, two or three sentences, and a question for Mama or Papa.
'use strict';

function books(x, y, n, h, cols) {
  var s = '', i, w;
  for (i = 0; i < n; i++) { w = 18 + (i * 7) % 14; s += r(x, y - h + (i % 3) * 6, w, h - (i % 3) * 6, cols[i % cols.length]); x += w + 2; }
  return s;
}
var SPINES = ['#b3401a', '#2f6f8a', '#d9903a', '#4e7a3a', '#7a3b1d', '#c9b458', '#8a4f6a'];

// ---------------------------------------------------------------------------------------------
room({
  id: 'wohnzimmer', de: 'Das Wohnzimmer', en: 'the living room',
  bg: '<defs><pattern id="wp1" width="120" height="120" patternUnits="userSpaceOnUse">' + r(0, 0, 120, 120, '#e9c77b') + c(60, 60, 42, '#dd9a45') + c(60, 60, 26, '#b8672a') + c(60, 60, 11, '#e9c77b') + c(0, 0, 14, '#dd9a45') + c(120, 0, 14, '#dd9a45') + c(0, 120, 14, '#dd9a45') + c(120, 120, 14, '#dd9a45') + '</pattern></defs>' +
    r(0, 0, 1920, 770, 'url(#wp1)') + r(0, 750, 1920, 26, '#5a3a22') + r(0, 776, 1920, 304, '#9b6b43') +
    e(960, 960, 640, 105, '#b3401a') + e(960, 960, 540, 80, '#d9903a') + e(960, 960, 420, 55, '#b3401a') +
    // die Schrankwand
    r(70, 140, 1130, 630, '#6b4226', 6) + r(70, 140, 1130, 28, '#4f2f1a') +
    r(100, 190, 260, 300, '#3a2416') + r(100, 510, 260, 115, '#3a2416') +
    r(390, 190, 480, 150, '#3a2416') + books(400, 338, 14, 120, SPINES) + r(760, 250, 90, 88, '#d8c9a8') + c(805, 294, 28, '#7a3b1d') +
    r(390, 360, 480, 255, '#2c1a10') +
    r(900, 190, 270, 195, '#3a2416') +
    r(900, 405, 130, 210, '#7d5030') + r(1040, 405, 130, 210, '#7d5030') + c(1020, 510, 7, '#e0b050') + c(1050, 510, 7, '#e0b050') +
    r(100, 645, 260, 100, '#7d5030') + r(372, 645, 260, 100, '#7d5030') + r(644, 645, 260, 100, '#7d5030') + r(916, 645, 254, 100, '#7d5030') +
    c(230, 695, 8, '#e0b050') + c(502, 695, 8, '#e0b050') + c(774, 695, 8, '#e0b050') + c(1043, 695, 8, '#e0b050') +
    // das Fenster mit Gardinen
    r(1320, 150, 470, 420, '#fff6dd') + r(1340, 170, 430, 380, '#a9d8ee') +
    r(1500, 330, 10, 220, '#8fa3b0') + c(1505, 320, 18, '#8fa3b0') + r(1503, 230, 4, 90, '#8fa3b0') + r(1380, 430, 90, 120, '#c9c2b4') + r(1600, 400, 120, 150, '#c9c2b4') +
    r(1340, 170, 430, 380, '#ffffff', 0, 'opacity=".45"') + r(1550, 170, 10, 380, '#fff6dd') +
    p('M1300,140 h70 q-10,220 -30,440 h-40 z', '#d9742a') + p('M1810,140 h-70 q10,220 30,440 h40 z', '#d9742a') + r(1290, 130, 530, 20, '#5a3a22') +
    r(1300, 570, 510, 22, '#fff6dd') +
    // Stehlampe, Sofa, Couchtisch
    r(1216, 380, 8, 480, '#4f2f1a') + e(1220, 862, 46, 12, '#4f2f1a') + p('M1170,390 L1195,290 h50 L1270,390 z', '#f2b23e') +
    r(1265, 630, 580, 170, '#6f7f3a', 44) + r(1240, 740, 630, 130, '#86973f', 30) + r(1225, 700, 70, 180, '#6f7f3a', 30) + r(1815, 700, 70, 180, '#6f7f3a', 30) +
    r(1640, 660, 130, 110, '#d9742a', 18) + r(1280, 860, 22, 40, '#4f2f1a') + r(1810, 860, 22, 40, '#4f2f1a') +
    r(640, 885, 560, 34, '#5a3a22', 8) + r(670, 919, 22, 90, '#4f2f1a') + r(1148, 919, 22, 90, '#4f2f1a'),
  items: [
    {
      id: 'fernseher', x: 500, y: 378, w: 260, h: 220, de: 'Der Fernseher', en: 'the television', kind: 'flip', next: 'Umschalten', flipSound: 'tick', picBg: '#3a2416',
      art: r(0, 0, 260, 200, '#8a5a35', 14) + r(18, 18, 172, 152, '#bfe3e8', 22) + r(202, 18, 44, 152, '#d8c9a8', 6) + c(224, 48, 13, '#3b2b22') + c(224, 88, 13, '#3b2b22') + l(210, 120, 238, 120) + l(210, 134, 238, 134) + l(210, 148, 238, 148) + r(30, 200, 22, 18, '#4f2f1a') + r(208, 200, 22, 18, '#4f2f1a') +
        p('M70,140 q34,-70 68,0 z', '#b3401a') + c(104, 92, 26, '#f6d2b0') + p('M80,84 L104,28 L128,84 z', '#8a3a1a') + p('M88,104 q16,34 32,0 z', '#fff') + c(95, 90, 3, '#3b2b22') + c(113, 90, 3, '#3b2b22'),
      cards: [
        { de: 'Unser Sandm&auml;nnchen', en: 'Our little Sandman', bg: '#2f4f8a', by: 'jeden Abend, 18.50 Uhr', text: "Every evening at ten to seven. The Sandman arrived in a different vehicle each time: a rocket, a tram, a hot-air balloon, even a moon car. One short story, a pinch of sleepy sand, and off to bed.", ask: "Which Sandman vehicle did you like best?" },
        { de: 'Pittiplatsch', en: 'Pitti the kobold and his friends', bg: '#33241b', by: '&bdquo;Ach du meine Nase!&ldquo;', text: "Pitti is a small, round, cheeky kobold who gets into trouble and says \"Ach du meine Nase!\" (oh my nose!). His friends are Schnatterinchen the duck, who says \"nak nak\", and Moppi the dog.", ask: "Can you do Pitti's voice?" },
        { de: 'Spuk im Hochhaus', en: 'Ghosts in the tower block', bg: '#5b4a8a', by: '1982', text: "Two ghosts from 200 years ago wake up in a brand-new Berlin tower block, just like this one. They can only rest once they have done seven good deeds for the neighbours. Spooky and very funny.", ask: "Were you scared of the ghosts, or did you laugh?" },
        { de: 'Drei Haseln&uuml;sse f&uuml;r Aschenbr&ouml;del', en: 'Three Hazelnuts for Cinderella', bg: '#3f7fa8', by: '1973', text: "A Cinderella who rides, shoots a crossbow and teases the prince in the snow. Film studios in Czechoslovakia and the DDR made it together, and it has been on TV every single Christmas since.", ask: "Do you still watch it every Christmas?" },
        { de: 'Mach mit, mach\'s nach, mach\'s besser', en: "Join in, copy it, do it better", bg: '#d6312b', by: 'mit Adi', text: "Sunday morning sport. School classes raced each other over benches, through hoops and round cones, and a friendly presenter called Adi cheered everybody on. Children did the exercises along at home.", ask: "Did you jump around in front of the TV?" },
        { de: 'Pan Tau', en: 'Mr Tau', bg: '#33241b', by: 'aus Prag', text: "A smiling gentleman from Prague who never speaks. He taps his bowler hat, and magic happens: he shrinks to the size of a doll, or it snows indoors. Lots of the best children's shows came from next door in Czechoslovakia.", ask: "What would you magic up with that hat?" },
        { de: 'Trickfilme von nebenan', en: 'Cartoons from next door', bg: '#4e7a3a', by: 'Maulwurf, Lolek &amp; Bolek, Hase und Wolf', text: "The little Mole came from Prague, the brothers Lolek and Bolek from Poland, and the Hare and the Wolf from Moscow. The wolf always shouts \"Nu, pogodi!\" (just you wait!) and never, ever catches the hare.", ask: "Who did you want to win, the hare or the wolf?" },
        { de: 'Die Olsenbande', en: 'The Olsen Gang', bg: '#8a5a35', by: '&bdquo;Ich habe einen Plan!&ldquo;', text: "Three clumsy crooks from Denmark. Egon always has a brilliant plan, his friends shout \"M&auml;chtig gewaltig, Egon!\" (mighty tremendous!), and it always goes wrong. The whole DDR adored them.", ask: "Who in our family always \"has a plan\"?" },
        { de: 'Ein Kessel Buntes', en: 'A Kettle Full of Colour', bg: '#b3401a', by: 'Samstagabend', text: "The big Saturday-night show: singers, dancers, acrobats, comedians and stars from all over the world on one glittering stage in Berlin. The whole family squeezed onto the sofa in their pyjamas.", ask: "Were you allowed to stay up for it?" }
      ]
    },
    {
      id: 'vitrine', x: 115, y: 203, w: 230, h: 275, de: 'Die Schrankwand', en: 'the wall of cupboards',
      art: r(0, 0, 230, 275, '#8a5a35', 4) + r(12, 12, 206, 251, '#d6ecec') + l(12, 95, 218, 95) + l(12, 180, 218, 180) + l(115, 12, 115, 263) +
        p('M30,70 h36 q0,24 -18,24 q-18,0 -18,-24 z', '#fff') + l(30, 76, 66, 76, '#e0b050', 3) + p('M140,70 h36 q0,24 -18,24 q-18,0 -18,-24 z', '#fff') + l(140, 76, 176, 76, '#e0b050', 3) +
        p('M32,120 h22 l-4,58 h-14 z', '#bfe3f0') + p('M68,120 h22 l-4,58 h-14 z', '#bfe3f0') + p('M140,130 h56 l-10,48 h-36 z', '#f2d9a0') +
        e(60, 250, 34, 10, '#fff') + e(60, 244, 26, 8, '#f2d9a0') + r(140, 205, 60, 56, '#b3401a') + r(150, 215, 40, 12, '#f2d9a0'),
      text: "One wall, one giant cupboard. Books, the good glasses, the Sunday china, the record player and the TV all lived in it. Nearly every living room in the DDR had a Schrankwand, and lots of them were exactly the same model, so at a friend's flat you already knew where everything was.",
      ask: "What was hidden in yours that children were not supposed to find?"
    },
    {
      id: 'platten', x: 915, y: 218, w: 240, h: 165, de: 'Schallplatten von AMIGA', en: 'records from the AMIGA label', kind: 'flip', next: 'N&auml;chste Platte', picBg: '#6b4226',
      art: r(0, 100, 170, 60, '#d8c9a8', 8) + e(78, 104, 66, 20, '#222') + e(78, 104, 18, 6, '#d6312b') + l(150, 92, 100, 106, '#888', 5) + c(152, 92, 8, '#888') +
        r(172, 20, 50, 140, '#d6312b', 0, 'transform="rotate(8 197 90)"') + r(190, 24, 48, 136, '#2fa8c9', 0, 'transform="rotate(3 214 90)"') + c(214, 90, 14, '#ffd45e'),
      cards: [
        { de: 'Nina Hagen', en: 'You forgot the colour film (1974)', bg: '#d6247a', by: '&bdquo;Du hast den Farbfilm vergessen&ldquo;', text: "Nina was born in East Berlin. In her biggest hit she tells off her boyfriend Michael: they went to the island of Hiddensee and he only packed black-and-white film! A few years later she became the wild godmother of punk.", ask: "Can you still sing the chorus?" },
        { de: 'Der Traumzauberbaum', en: 'The dream magic tree (1980)', bg: '#2f8a3c', by: 'Reinhard Lakomy', text: "A record of songs and stories for children. Every leaf on the magic tree holds a dream, and two forest sprites called Moosmutzel and Waldwuffel look after it. Almost every child in the DDR knew it by heart.", ask: "Which song from the Traumzauberbaum can you still sing?" },
        { de: 'Karat', en: 'Over seven bridges you must go (1978)', bg: '#2f4f8a', by: '&bdquo;&Uuml;ber sieben Br&uuml;cken musst du gehn&ldquo;', text: "A slow, beautiful rock song about keeping going through seven dark years until the bright ones come. People on both sides of Germany loved it and sang it, and they still do.", ask: "Who played this one at home?" },
        { de: 'City', en: 'At the window (1977)', bg: '#8a5a35', by: '&bdquo;Am Fenster&ldquo;', text: "A rock song with a wild violin that goes on and on for many minutes. The band came from Berlin, and the record sold all over Europe.", ask: "Violin in a rock band: yes or no?" },
        { de: 'Silly', en: 'with Tamara Danz', bg: '#5b2f8a', by: 'Rock aus Berlin', text: "Tamara Danz had big hair, a huge rough voice and no fear of anybody. With her band Silly she was the queen of rock in the East, and she wrote songs that said what she really thought.", ask: "Was Tamara your kind of singer?" },
        { de: 'Feeling B', en: 'punk from East Berlin', bg: '#222222', by: 'die anderen Bands', text: "Loud, fast, silly and a bit wild: punk from Berlin, played in back yards, clubs and on beaches. Two of its musicians later started another band you may have heard of. It is called Rammstein.", ask: "Did you ever hear the punks play?" },
        { de: 'David Bowie', en: 'Heroes (1977)', bg: '#d9742a', by: 'drei Jahre in Berlin', text: "Bowie lived in Berlin for a while and recorded \"Heroes\" in a studio right beside the Wall. In 1987 he came back and sang it in the open air there, and people on the East side stood in the street to listen.", ask: "When did you first hear Bowie?" }
      ]
    },
    {
      id: 'rekorder', x: 125, y: 520, w: 210, h: 102, de: 'Der Kassettenrekorder', en: 'the cassette recorder',
      art: p('M40,12 q65,-22 130,0', 'none', 'stroke-width="6"') + r(0, 12, 210, 90, '#55524d', 8) + c(46, 58, 30, '#222') + c(46, 58, 12, '#666') + r(96, 24, 96, 46, '#cfe0e6', 6) + c(122, 47, 10, '#fff') + c(166, 47, 10, '#fff') +
        r(96, 78, 16, 16, '#d6312b') + r(116, 78, 16, 16, '#eee') + r(136, 78, 16, 16, '#eee') + r(156, 78, 16, 16, '#eee') + r(176, 78, 16, 16, '#eee'),
      text: "How to make your own tape: wait by the radio with one finger on the red button. Your song comes on, press record, and hope the presenter doesn't talk over the end! The youth station was called DT64, and in Berlin the dial picked up music from all over the city.",
      ask: "Which song did you wait hours for?"
    },
    {
      id: 'kaffee', x: 760, y: 768, w: 330, h: 122, de: 'Kaffee und Kuchen', en: 'coffee and cake at three',
      art: e(165, 112, 160, 10, '#fff', 'stroke="none" opacity=".5"') + p('M20,40 h70 l-8,74 h-54 z', '#fff') + p('M90,56 q34,6 6,40', 'none', 'stroke-width="7"') + p('M22,48 l-20,14 l22,6', '#fff') + r(40, 26, 30, 14, '#fff', 6) + c(55, 78, 12, '#d6312b') + c(40, 92, 6, '#2f8a3c') + c(70, 92, 6, '#2f8a3c') +
        r(130, 62, 130, 52, '#5a3320', 6) + l(134, 76, 256, 76, '#f2d9a0', 5) + l(134, 90, 256, 90, '#f2d9a0', 5) + l(134, 104, 256, 104, '#f2d9a0', 5) +
        p('M274,86 h44 q0,28 -22,28 q-22,0 -22,-28 z', '#fff') + e(296, 86, 20, 5, '#5a3320'),
      text: "Sunday, three o'clock: the good cups come out of the Schrankwand. On the table is Kalter Hund (\"cold dog\"), a cake nobody bakes: butter biscuits and chocolate stacked in layers and left to set. For birthdays there was Papageienkuchen, parrot cake, with a bright colour in every slice.",
      ask: "Who made the best cake in the family?"
    },
    {
      id: 'fotoalbum', x: 1440, y: 688, w: 150, h: 96, de: 'Das Fotoalbum', en: 'the photo album',
      art: r(0, 0, 150, 96, '#7a3b1d', 6) + r(8, 8, 134, 80, 'none', 4, 'stroke="#e0b050"') + r(40, 26, 70, 46, '#fff6dd') + r(46, 32, 58, 28, '#a9d8ee') + p('M46,60 l18,-16 l14,10 l12,-8 l14,14 z', '#4e7a3a'),
      text: "Photos were taken on ORWO film, made in the DDR. You got 36 pictures on a roll and had to wait for them to be developed before you saw a single one. Then they were stuck into the album with little paper corners, and somebody wrote the place and the year underneath in careful handwriting.",
      ask: "Where are your baby photos now? Can we look at them?"
    },
    {
      id: 'schwibbogen', x: 1445, y: 452, w: 230, h: 122, de: 'Der Schwibbogen', en: 'the candle arch',
      art: p('M12,108 A103,100 0 0 1 218,108 Z', '#d9a55a') + p('M40,108 A75,74 0 0 1 190,108 Z', '#fff6dd') + r(0, 108, 230, 14, '#b8672a', 4) +
        r(88, 74, 12, 34, '#b3401a') + c(94, 66, 9, '#f6d2b0') + r(126, 74, 12, 34, '#2f6f8a') + c(132, 66, 9, '#f6d2b0') + p('M104,108 l10,-30 l10,30 z', '#4e7a3a') +
        [[22, 70], [60, 30], [115, 10], [170, 30], [208, 70]].map(function (q) { return r(q[0] - 4, q[1] - 6, 8, 20, '#fff') + e(q[0], q[1] - 13, 4, 7, '#ffb52e', 'stroke="none"'); }).join(''),
      text: "In December every window in the street glowed. The wooden candle arch comes from the Erzgebirge mountains, like the little R&auml;ucherm&auml;nnchen who puffs real incense smoke out of his mouth, and the Christmas pyramid that turns by itself in the warm air above its candles.",
      ask: "What was on the table at Christmas when you were little?"
    }
  ]
});

// ---------------------------------------------------------------------------------------------
room({
  id: 'kueche', de: 'Die K&uuml;che', en: 'the kitchen',
  bg: '<defs><pattern id="tile1" width="64" height="64" patternUnits="userSpaceOnUse">' + r(0, 0, 64, 64, '#f6e7b8') + r(2, 2, 60, 60, '#fbf1cf') + c(32, 32, 9, '#e9a94a') + '</pattern>' +
    '<pattern id="lino" width="120" height="120" patternUnits="userSpaceOnUse">' + r(0, 0, 120, 120, '#d8b98a') + r(0, 0, 60, 60, '#a8703f') + r(60, 60, 60, 60, '#a8703f') + '</pattern></defs>' +
    r(0, 0, 1920, 830, '#f1dfae') + r(0, 330, 1920, 290, 'url(#tile1)') + r(0, 820, 1920, 260, 'url(#lino)') + r(0, 812, 1920, 14, '#7a5a3a') +
    // Hängeschränke
    r(110, 120, 900, 200, '#fbf7ea', 6) + r(110, 300, 900, 20, '#e2d8bf') + [0, 1, 2, 3].map(function (i) { return r(124 + i * 222, 134, 208, 160, '#f3ecd8', 4) + r(150 + i * 222, 262, 60, 12, '#e8862e', 6); }).join('') +
    // Unterschränke und Arbeitsplatte
    r(90, 640, 1100, 180, '#fbf7ea') + [0, 1, 2].map(function (i) { return r(104 + i * 222, 654, 208, 152, '#f3ecd8', 4) + r(180 + i * 222, 668, 60, 12, '#e8862e', 6); }).join('') +
    r(770, 640, 230, 180, '#fdfdf6') + r(790, 690, 190, 110, '#3a3530', 8) + r(790, 660, 190, 12, '#c9c2b4', 6) + c(805, 628, 9, '#333') + c(835, 628, 9, '#333') + c(945, 628, 9, '#333') + c(975, 628, 9, '#333') +
    r(1010, 654, 170, 152, '#f3ecd8', 4) + r(1065, 668, 60, 12, '#e8862e', 6) +
    r(80, 612, 1120, 30, '#c98d4b', 4) + r(770, 606, 230, 12, '#333', 4) +
    // Fenster, Tisch
    r(1550, 150, 320, 380, '#fff') + r(1568, 168, 284, 344, '#a9d8ee') + r(1704, 168, 12, 344, '#fff') + r(1620, 380, 60, 132, '#c9c2b4') + r(1760, 340, 70, 172, '#c9c2b4') +
    p('M1550,150 h320 v90 q-40,30 -80,0 q-40,30 -80,0 q-40,30 -80,0 q-40,30 -80,0 z', '#e8862e') + r(1540, 530, 340, 20, '#fff') +
    r(1500, 716, 420, 26, '#d6312b', 4) + r(1500, 742, 420, 40, '#e9584f') + r(1540, 782, 22, 190, '#7a5a3a') + r(1870, 782, 22, 190, '#7a5a3a') +
    r(1400, 880, 26, 110, '#7a5a3a') + r(1380, 860, 150, 24, '#c98d4b', 6) + r(1500, 880, 26, 110, '#7a5a3a') + r(1380, 720, 20, 150, '#7a5a3a'),
  items: [
    {
      id: 'mixer', x: 150, y: 492, w: 180, h: 122, de: 'Das R&uuml;hrger&auml;t RG 28', en: 'the RG 28 hand mixer',
      art: p('M10,20 q0,-18 22,-18 h110 q30,0 30,34 q0,30 -30,30 h-110 q-22,0 -22,-18 z', '#e8742a') + r(40, 16, 80, 16, '#3b2b22', 8) + r(136, 22, 22, 22, '#fff6dd', 4) +
        r(46, 66, 8, 30, '#bbb') + r(78, 66, 8, 30, '#bbb') + e(50, 106, 12, 16, 'none', 'stroke="#888" stroke-width="4"') + e(82, 106, 12, 16, 'none', 'stroke="#888" stroke-width="4"'),
      text: "Bright orange, loud as a moped, and impossible to break. The RG 28 beat cake batter and whipped cream in nearly every kitchen in the DDR. Thousands of them are still whirring away today, forty years later, in the kitchens of people who refuse to swap them for anything newer.",
      ask: "Does Oma still have hers?"
    },
    {
      id: 'eierbecher', x: 372, y: 528, w: 240, h: 88, de: 'Die H&uuml;hner-Eierbecher', en: 'the hen egg cups',
      art: [['#f2c82e', 0], ['#7ec8d8', 82], ['#f29bb0', 164]].map(function (h) {
        var x = h[1];
        return p('M' + (x + 6) + ',88 q-8,-44 30,-44 q38,0 30,44 z', h[0]) + e(x + 36, 40, 17, 22, '#fff8ea') + c(x + 66, 44, 10, h[0]) + p('M' + (x + 62) + ',34 l4,-9 l4,9 z', '#d6312b') + p('M' + (x + 75) + ',44 l8,3 l-8,3 z', '#e8862e') + c(x + 68, 42, 2, '#3b2b22');
      }).join(''),
      text: "Your breakfast egg sits in a little plastic hen. They came in yellow, blue, pink, orange and green, and every family had a flock. They have been made in the same small town since the 1970s, and they are still made there today.",
      ask: "Which colour hen was yours?"
    },
    {
      id: 'superfest', x: 646, y: 500, w: 100, h: 114, de: 'Superfest-Gl&auml;ser', en: 'the glasses that would not break',
      art: p('M14,60 h72 l-10,54 h-52 z', '#cfeaf2') + p('M12,32 h76 l-8,40 h-60 z', '#dff3f8') + p('M10,4 h80 l-8,40 h-64 z', '#eefafc') + l(26, 12, 30, 36, '#fff', 4),
      text: "\"Superfest\" means super-strong. These glasses were specially hardened, so you could drop one on the floor and it just bounced. They stack neatly into a tower, and every caf&eacute;, canteen and kitchen had them.",
      ask: "Did you ever drop one on purpose to see?"
    },
    {
      id: 'herd', x: 790, y: 458, w: 190, h: 150, de: 'Was gibt\'s heute?', en: "what's for dinner today?", kind: 'cook',
      art: p('M50,40 q-12,-14 0,-26 q12,-12 0,-24', 'none', 'stroke="#bbb" stroke-width="5"') + p('M95,40 q-12,-14 0,-26 q12,-12 0,-24', 'none', 'stroke="#bbb" stroke-width="5"') + p('M140,40 q-12,-14 0,-26', 'none', 'stroke="#bbb" stroke-width="5"') +
        r(20, 62, 150, 86, '#d6312b', 10) + r(10, 54, 170, 16, '#b3261f', 8) + r(0, 84, 22, 14, '#333', 6) + r(168, 84, 22, 14, '#333', 6) + c(60, 104, 9, '#fff') + c(95, 118, 9, '#fff') + c(130, 100, 9, '#fff'),
      text: "The red pot is on the stove. Pick a dish, then find the three things that go into it.",
      ask: "Which of these did you love, and which did you hide under the potatoes?",
      dishes: [
        { de: 'J&auml;gerschnitzel', en: "hunter's schnitzel, DDR style", good: [['Jagdwurst', 'a thick slice of sausage'], ['Semmelbr&ouml;sel', 'breadcrumbs'], ['Nudeln mit Tomatenso&szlig;e', 'noodles in tomato sauce']], bad: [['Zitrone', 'lemon'], ['Butterkekse', 'butter biscuits'], ['Kokosfett', 'coconut fat']], text: "No mushrooms and no veal here. In the DDR a J&auml;gerschnitzel is a thick slice of Jagdwurst sausage, breaded and fried until crisp, with noodles and sweet tomato sauce. It is a school-dinner legend.", ask: "Was this your favourite school dinner?" },
        { de: 'Soljanka', en: 'the tangy soup from the east', good: [['Gew&uuml;rzgurken', 'pickled gherkins'], ['Zitrone', 'a slice of lemon'], ['Saure Sahne', 'sour cream']], bad: [['Schokolade', 'chocolate'], ['Butterkekse', 'butter biscuits'], ['Erdbeeren', 'strawberries']], text: "A sour, spicy, bright red soup that travelled all the way from Russia and Ukraine: sausage, gherkins and peppers, with a slice of lemon and a spoon of sour cream floating on top. Every restaurant had it.", ask: "Soljanka: yum or yuck?" },
        { de: 'Kalter Hund', en: '"cold dog", the no-bake cake', good: [['Butterkekse', 'butter biscuits'], ['Kakao', 'cocoa'], ['Kokosfett', 'coconut fat']], bad: [['Senf', 'mustard'], ['Zwiebeln', 'onions'], ['Jagdwurst', 'sausage']], text: "Line a loaf tin, then stack: a layer of butter biscuits, a layer of melted chocolate, biscuits, chocolate, biscuits... Put it somewhere cold overnight. Next day, cut it into stripy slices. No oven needed.", ask: "Shall we make one together this weekend?" },
        { de: 'Senfeier', en: 'eggs in mustard sauce', good: [['Eier', 'boiled eggs'], ['Senf', 'mustard'], ['Kartoffeln', 'potatoes']], bad: [['Schokolade', 'chocolate'], ['Erdbeeren', 'strawberries'], ['Kokosfett', 'coconut fat']], text: "Hard-boiled eggs in a warm, creamy, yellow mustard sauce, with boiled potatoes to mop it up. Cheap, quick and cosy: the kind of dinner you get at Oma's kitchen table.", ask: "Who cooked this for you?" }
      ]
    },
    {
      id: 'trinkfix', x: 1040, y: 506, w: 96, h: 108, de: 'Trink fix', en: 'cocoa in a tin',
      art: r(6, 8, 84, 100, '#6a3a1e', 8) + e(48, 10, 42, 8, '#8a5a35') + r(6, 36, 84, 44, '#ffd45e') + t('Trink', 48, 56, 18, '#6a3a1e') + t('fix', 48, 74, 18, '#b3401a'),
      text: "Two spoons in a mug of warm milk, stir, and breakfast is ready. \"Trink fix\" just means \"drink quick\". The grown-ups had their own tins and jars beside it, with names like Rondo and Mocca Fix Gold, and the whole flat smelled of coffee on a Sunday.",
      ask: "What did you have for breakfast before Kindergarten?"
    },
    {
      id: 'kittel', x: 1062, y: 140, w: 150, h: 300, de: 'Die Kittelsch&uuml;rze', en: "Oma's flowery apron",
      art: c(75, 10, 8, '#888') + p('M40,24 q35,30 70,0 l10,40 l26,30 l-16,200 h-110 l-16,-200 l26,-30 z', '#4f7fc0') + l(75, 44, 75, 292, '#fff', 3) + r(22, 180, 40, 46, '#6f9bd6', 6) + r(90, 180, 40, 46, '#6f9bd6', 6) +
        [[45, 90], [105, 100], [50, 150], [100, 150], [40, 250], [110, 260], [75, 70]].map(function (q) { return c(q[0], q[1], 9, '#ffd45e') + c(q[0], q[1], 4, '#d6312b', 'stroke="none"'); }).join(''),
      text: "Every Oma had one: a sleeveless apron dress with buttons down the front, covered in flowers. It was made of Dederon, a shiny fabric invented in the DDR (the \"DDR\" is hidden in its name). You wiped it clean in a second, and the pockets always held a hanky and a sweet.",
      ask: "What did your Oma keep in her apron pockets?"
    },
    {
      id: 'kuehlschrank', x: 1250, y: 340, w: 230, h: 478, de: 'Im K&uuml;hlschrank', en: 'inside the fridge',
      art: r(0, 0, 230, 478, '#fbfbf4', 12) + l(0, 130, 230, 130) + r(196, 40, 14, 60, '#aaa', 6) + r(196, 160, 14, 90, '#aaa', 6) +
        r(26, 180, 170, 270, '#e3eef0', 6) + l(26, 270, 196, 270) + l(26, 360, 196, 360) +
        r(40, 216, 44, 52, '#fff', 4) + r(40, 232, 44, 20, '#d6247a') + r(96, 216, 44, 52, '#fff', 4) + r(96, 232, 44, 20, '#f2c82e') +
        r(48, 296, 56, 62, '#7fae5a', 6) + r(44, 288, 64, 12, '#e0b050', 4) + r(124, 306, 30, 52, '#f2c82e', 10) + r(132, 294, 14, 14, '#d6312b') +
        r(44, 392, 40, 56, '#fff', 4) + r(44, 384, 40, 12, '#3558c7') + r(100, 404, 80, 44, '#f2d9a0', 6),
      text: "Top shelf: Leckerm&auml;ulchen, a fluffy sweet quark that children ate straight from the tub. Below it a jar of crunchy gherkins from the Spreewald, a marshy forest full of canals near Berlin, and a tube of Bautz'ner mustard. All three are still in German shops, so you can taste {M}'s childhood.",
      ask: "Leckerm&auml;ulchen: which flavour? Shall we buy one next time?"
    },
    {
      id: 'brotbuechse', x: 1580, y: 640, w: 180, h: 78, de: 'Die Brotb&uuml;chse', en: 'the aluminium lunch box',
      art: r(0, 20, 180, 58, '#c9ced2', 14) + r(0, 12, 180, 28, '#dfe3e6', 12) + l(30, 26, 150, 26, '#aab', 3) + l(20, 56, 160, 56, '#aab', 3) + l(20, 66, 160, 66, '#aab', 3) + r(78, 34, 24, 12, '#999', 4),
      text: "A silver box made of aluminium, light as a feather. Every school bag had one, with sandwiches in it and maybe an apple. After a year it was covered in dents, and many children scratched their name into the lid so that nobody mixed them up.",
      ask: "What was in your Brotb&uuml;chse? And did you swap?"
    }
  ]
});

// ---------------------------------------------------------------------------------------------
room({
  id: 'kinderzimmer', de: 'Das Kinderzimmer', en: "the children's room",
  bg: '<defs><pattern id="wp2" width="80" height="80" patternUnits="userSpaceOnUse">' + r(0, 0, 80, 80, '#d8e8cf') + c(20, 20, 7, '#f2c98a') + c(60, 60, 7, '#f2a0a0') + c(60, 20, 3, '#9cc7a0') + c(20, 60, 3, '#9cc7a0') + '</pattern>' +
    '<pattern id="karo" width="40" height="40" patternUnits="userSpaceOnUse">' + r(0, 0, 40, 40, '#fff') + r(0, 0, 20, 20, '#7fa6d9') + r(20, 20, 20, 20, '#7fa6d9') + '</pattern></defs>' +
    r(0, 0, 1920, 790, 'url(#wp2)') + r(0, 780, 1920, 300, '#c9a26a') + r(0, 772, 1920, 16, '#8a6a42') +
    [840, 900, 960, 1020].map(function (y) { return r(0, y, 1920, 3, '#b08a55'); }).join('') +
    e(960, 950, 420, 95, '#d6312b') + e(960, 950, 340, 72, '#f2c82e') + e(960, 950, 250, 50, '#2f8a3c') +
    // Fenster über dem Schreibtisch
    r(740, 140, 440, 350, '#fff') + r(758, 158, 404, 314, '#a9d8ee') + r(954, 158, 12, 314, '#fff') +
    r(780, 250, 150, 222, '#d9d2c4') + [0, 1, 2, 3].map(function (i) { return r(792, 264 + i * 50, 30, 30, '#8fb6c9') + r(838, 264 + i * 50, 30, 30, '#f2d98a') + r(884, 264 + i * 50, 30, 30, '#8fb6c9'); }).join('') +
    r(1000, 300, 140, 172, '#d9d2c4') + [0, 1, 2].map(function (i) { return r(1012, 314 + i * 50, 30, 30, '#f2d98a') + r(1058, 314 + i * 50, 30, 30, '#8fb6c9') + r(1100, 314 + i * 50, 30, 30, '#8fb6c9'); }).join('') +
    p('M740,140 h60 q-6,160 -30,350 h-30 z', '#f2a03e') + p('M1180,140 h-60 q6,160 30,350 h30 z', '#f2a03e') + r(726, 126, 468, 18, '#8a6a42') +
    // Schreibtisch
    r(700, 612, 520, 26, '#b8894e', 4) + r(716, 638, 22, 180, '#8a6a42') + r(1182, 638, 22, 180, '#8a6a42') + r(1030, 638, 152, 110, '#c99a5e') + c(1106, 692, 8, '#8a6a42') +
    // Bett
    r(60, 520, 30, 340, '#b8894e', 6) + r(650, 600, 30, 260, '#b8894e', 6) + r(80, 720, 580, 120, '#b8894e') + r(86, 640, 568, 110, 'url(#karo)', 16) + r(96, 596, 190, 70, '#fff', 26) +
    // Regal
    r(1250, 150, 580, 640, '#c99a5e', 6) + r(1270, 170, 540, 180, '#a67a44') + r(1270, 370, 540, 180, '#a67a44') + r(1270, 570, 540, 200, '#a67a44') +
    r(1640, 250, 70, 100, '#2f6f8a') + r(1716, 230, 70, 120, '#d6312b') + c(1751, 290, 22, '#fff') +
    r(1300, 640, 160, 130, '#e8862e', 8) + r(1480, 660, 120, 110, '#4e7a3a', 8) + c(1700, 710, 60, '#f2c82e') + p('M1648,690 q52,60 104,0', 'none', 'stroke="#d6312b" stroke-width="10"') +
    // Lampe
    r(958, 0, 4, 70, '#555') + p('M900,120 q60,-90 120,0 z', '#e8862e'),
  items: [
    {
      id: 'sandmann', x: 110, y: 440, w: 250, h: 200, de: 'Sandmann und Pittiplatsch', en: 'the Sandman and Pitti',
      art: p('M20,200 q10,-110 55,-110 q45,0 55,110 z', '#b3401a') + c(75, 80, 34, '#f6d2b0') + p('M42,72 L75,0 L108,72 z', '#8a3a1a') + p('M55,96 q20,46 40,0 z', '#fff') + c(63, 78, 4, '#3b2b22') + c(87, 78, 4, '#3b2b22') + c(75, 88, 4, '#e8a08a') +
        e(190, 150, 52, 50, '#2a2420') + p('M170,104 l6,-24 l10,18 l8,-26 l8,26 l10,-18 l4,26 z', '#2a2420') + c(174, 136, 14, '#fff') + c(206, 136, 14, '#fff') + c(176, 138, 6, '#3b2b22') + c(204, 138, 6, '#3b2b22') + e(190, 160, 9, 6, '#d6312b') + e(165, 198, 18, 8, '#d6312b') + e(215, 198, 18, 8, '#d6312b'),
      text: "The Sandman has a white goatee and a pointed cap, and Pittiplatsch is the round, black, cheeky kobold with the wild hair. The Sandman has come to children's bedrooms every evening since 1959, and he still comes today. German children now watch the very same Sandman that {M} watched.",
      ask: "Did you have a Sandmann or a Pitti to cuddle?"
    },
    {
      id: 'triola', x: 742, y: 544, w: 270, h: 68, de: 'Die Triola', en: 'the Triola (play it!)', kind: 'triola',
      art: r(0, 22, 40, 24, '#fff', 8) + r(30, 6, 240, 56, '#fdfdf6', 12) + KEYS.map(function (k, i) { return r(44 + i * 27, 14, 22, 40, k[2], 4); }).join(''),
      text: "You blow into one end and press the coloured keys. The song books had coloured dots instead of notes, so even a four-year-old could play a real tune. Try it: this is \"Alle meine Entchen\" (all my little ducklings).",
    },
    {
      id: 'pebe', x: 800, y: 850, w: 260, h: 130, de: 'PEBE-Bausteine', en: 'PEBE building bricks',
      art: r(20, 60, 150, 70, '#d6312b') + r(20, 60, 150, 4, '#fff', 0, 'stroke="none"') + r(20, 94, 150, 4, '#fff', 0, 'stroke="none"') + r(40, 80, 40, 50, '#2f6f8a') + r(110, 76, 40, 30, '#fff') + p('M10,60 L95,8 L180,60 z', '#f2c82e') +
        [30, 60, 90, 120, 150].map(function (x) { return r(x - 2, 52, 14, 8, '#b3261f'); }).join('') +
        r(196, 100, 60, 30, '#2f8a3c') + r(204, 92, 14, 8, '#2f8a3c') + r(232, 92, 14, 8, '#2f8a3c') + r(206, 70, 30, 22, '#f2c82e') + r(214, 62, 14, 8, '#f2c82e'),
      text: "Little plastic bricks with studs on top that click together, made in the town of Bad K&ouml;sen. A whole box of red, white, blue and yellow ones could become a house, a ship, a garage for the toy cars, or a tower as tall as your little brother.",
      ask: "What was the biggest thing you ever built?"
    },
    {
      id: 'buecher', x: 1290, y: 196, w: 320, h: 154, de: 'B&uuml;cher und Hefte', en: 'books and comics', kind: 'flip', next: 'N&auml;chstes Buch', picBg: '#a67a44',
      art: books(0, 154, 7, 140, SPINES) + r(190, 24, 110, 130, '#ffd45e') + c(245, 70, 26, '#f29bb0') + p('M228,52 l-8,-26 l18,16 z', '#f29bb0') + p('M262,52 l8,-26 l-18,16 z', '#f29bb0') + c(237, 68, 3, '#3b2b22') + c(253, 68, 3, '#3b2b22') + r(206, 112, 78, 12, '#b3401a'),
      cards: [
        { de: 'Der kleine Angsthase', en: 'The Timid Rabbit (1963)', bg: '#e8862e', by: 'Elizabeth Shaw', text: "A little rabbit is scared of everything: dogs, water, the dark. Then one day a fox grabs his small friend, and he is the only one there to help. The woman who wrote and drew it, Elizabeth Shaw, was born in Belfast in Ireland and lived in East Berlin.", ask: "What were you scared of when you were small?" },
        { de: 'Alfons Zitterbacke', en: 'Alfons Quiver-cheek', bg: '#2f6f8a', by: 'Gerhard Holtz-Baumert', text: "Alfons is a boy who means well, and everything goes wrong anyway. He wants to be a cosmonaut, so he trains by eating food from tubes and spinning on the roundabout until he is green. Children laughed at him for forty years.", ask: "Which of Alfons's disasters do you remember?" },
        { de: 'Mosaik', en: 'the Abrafaxe comic', bg: '#d6312b', by: 'jeden Monat neu', text: "Three tiny adventurers called Abrax, Brabax and Califax travel through time and all around the world. A new comic came out every month, and it was sold out in hours. It still comes out every month today.", ask: "Did you have a pile of Mosaik comics?" },
        { de: 'Bummi', en: 'the magazine with the yellow bear', bg: '#f2b23e', by: 'f&uuml;r Kindergartenkinder', text: "Bummi is a yellow teddy bear, and his magazine was for children who could not read yet: pictures, rhymes, things to cut out and make. When you got bigger you moved on to the ABC-Zeitung, and then to Fr&ouml;si.", ask: "Do you remember the Bummi song?" }
      ]
    },
    {
      id: 'dia', x: 1300, y: 400, w: 240, h: 150, de: 'Der Dia-Projektor', en: 'cinema on the bedroom wall',
      art: p('M150,70 L240,10 L240,140 Z', '#fff6c8', 'stroke="none" opacity=".8"') + r(20, 50, 110, 80, '#2a2420', 12) + r(126, 68, 34, 40, '#555', 6) + e(160, 88, 8, 20, '#bfe3f0') + r(40, 130, 16, 20, '#2a2420') + r(96, 130, 16, 20, '#2a2420') + r(50, 36, 50, 16, '#555', 4) + c(52, 28, 14, '#8a5a35') + c(98, 28, 14, '#8a5a35'),
      text: "Close the curtains! The little black projector threw fairy tales onto the wall, one picture at a time, from a roll of film in a tiny tin. Somebody turned the knob and read the words out loud, and children lay on the carpet and watched. It was the family's own cinema.",
      ask: "Who read the story, and which film did you ask for again and again?"
    },
    {
      id: 'poesie', x: 1600, y: 420, w: 150, h: 128, de: 'Das Poesiealbum', en: 'the friendship book',
      art: r(0, 0, 150, 128, '#c0398a', 8) + r(10, 10, 130, 108, 'none', 6, 'stroke="#ffd45e"') + r(140, 50, 16, 28, '#e0b050', 4) + c(75, 56, 20, '#f29bb0') + c(75, 56, 9, '#d6312b') + p('M75,76 q-4,24 -20,34', 'none', 'stroke="#2f8a3c" stroke-width="5"') + e(52, 96, 12, 6, '#2f8a3c'),
      text: "A little book with a lock. You hand it to your friends, your teacher and your Oma, and each one writes a verse in their best handwriting and sticks in a shiny picture. A favourite verse: \"Rosen, Tulpen, Nelken, alle Blumen welken, nur die eine nicht, und die hei&szlig;t Vergissmeinnicht.\"",
      ask: "Do you still have yours? Who wrote in it?"
    },
    {
      id: 'kreisel', x: 1160, y: 850, w: 130, h: 150, de: 'Der Brummkreisel', en: 'the humming top', sound: 'hum',
      art: r(60, 0, 10, 50, '#888') + c(65, 6, 12, '#d6312b') + p('M5,70 q60,-50 120,0 q-30,60 -60,78 q-30,-18 -60,-78 z', '#f2c82e') + p('M5,70 q60,-50 120,0 q-60,24 -120,0 z', '#d6312b') + p('M22,92 q43,16 86,0', 'none', 'stroke="#2f6f8a" stroke-width="7"') + p('M38,114 q27,10 54,0', 'none', 'stroke="#2f8a3c" stroke-width="7"'),
      text: "Pump the handle up and down, faster and faster, then let go. The tin top spins on its point, the colours melt into stripes, and it hums like a swarm of bees. The faster it goes, the higher it sings.",
      ask: "Who could keep it spinning longest?"
    }
  ]
});
