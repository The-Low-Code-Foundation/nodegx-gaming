// Out of the flat: the Kaufhalle, the school, and the city.
'use strict';

// a Trabant, 380 wide; with a roof rack it is 200 tall, without 150
function trabi(col, rack) {
  var dy = rack ? 50 : 0;
  return (rack ? r(110, 44, 200, 6, '#777') + r(120, 44, 6, 14, '#777') + r(294, 44, 6, 14, '#777') + r(124, 8, 80, 36, '#8a5a35', 6) + r(210, 0, 90, 44, '#b3401a', 6) + l(255, 0, 255, 44, '#ffd45e', 4) + r(150, -8, 60, 18, '#2f6f8a', 8) : '') +
    '<g transform="translate(0,' + dy + ')">' +
    p('M8,112 v-38 q0,-12 14,-14 l66,-8 l40,-42 q5,-8 16,-8 h106 q12,0 18,8 l34,42 l52,8 q16,2 16,18 v34 q0,8 -10,8 h-342 q-10,0 -10,-8 z', col) +
    p('M134,54 l32,-34 h42 v34 z', '#d6eef5') + p('M220,20 h44 l28,34 h-72 z', '#d6eef5') + l(214, 56, 214, 112) +
    c(92, 118, 28, '#2a2420') + c(92, 118, 12, '#c9c2b4') + c(288, 118, 28, '#2a2420') + c(288, 118, 12, '#c9c2b4') +
    c(360, 80, 10, '#fff3a8') + r(346, 104, 34, 9, '#d8d8d8', 4) + r(0, 104, 26, 9, '#d8d8d8', 4) + r(150, 70, 20, 6, '#3b2b22', 3) + '</g>';
}
function tins(x, y, n, w, h, cols) {
  var s = '', i;
  for (i = 0; i < n; i++) s += r(x + i * (w + 8), y - h, w, h, cols[i % cols.length], 4) + r(x + i * (w + 8), y - h * 0.65, w, h * 0.3, '#f3ecd8');
  return s;
}
var MUTED = ['#c9b79a', '#b9c2a8', '#d2b9a0', '#a8b8c2'];

// ---------------------------------------------------------------------------------------------
room({
  id: 'kaufhalle', de: 'Die Kaufhalle', en: 'the supermarket',
  bg: r(0, 0, 1920, 780, '#f4ecd6') + r(0, 770, 1920, 310, '#b9c7b0') + [0, 1, 2, 3, 4, 5, 6, 7].map(function (i) { return r(i * 240, 770, 3, 310, '#a5b39c'); }).join('') + r(0, 900, 1920, 3, '#a5b39c') +
    r(0, 110, 1920, 62, '#d6312b') + t('OBST &middot; GEM&Uuml;SE &middot; BACKWAREN &middot; S&Uuml;SSWAREN &middot; GETR&Auml;NKE', 960, 153, 34, '#fff6dd') +
    r(70, 200, 1360, 580, '#e3dac4') + [340, 520, 700].map(function (y) { return r(70, y, 1360, 18, '#a8946e'); }).join('') + [70, 510, 960, 1416].map(function (x) { return r(x, 200, 14, 580, '#a8946e'); }).join('') +
    tins(290, 340, 3, 56, 90, MUTED) + tins(760, 340, 4, 50, 70, MUTED) + tins(1250, 340, 3, 44, 100, MUTED) +
    tins(100, 520, 1, 60, 80, MUTED) + tins(330, 520, 3, 48, 100, MUTED) + tins(540, 520, 1, 70, 60, MUTED) + tins(840, 520, 2, 50, 90, MUTED) + tins(1290, 520, 2, 50, 76, MUTED) +
    tins(100, 700, 1, 70, 90, MUTED) + tins(420, 700, 1, 60, 110, MUTED) + tins(540, 700, 6, 56, 84, MUTED) + tins(990, 700, 4, 60, 96, MUTED) +
    // die Kasse
    r(1480, 690, 400, 200, '#c98d4b') + r(1470, 672, 420, 24, '#8a5a35', 4) + r(1500, 720, 360, 150, '#b8793a') +
    r(1800, 330, 10, 345, '#888') + r(1730, 300, 150, 60, '#fff6dd', 6) + t('KASSE', 1805, 342, 30, '#b3401a'),
  items: [
    {
      id: 'zettel', x: 690, y: 815, w: 220, h: 190, de: 'Der Einkaufszettel', en: 'the shopping list', kind: 'list', want: ['knusper', 'vitacola', 'filinchen', 'nudossi'],
      art: p('M30,90 h170 l-18,96 h-134 z', '#d8d8d8') + l(60, 90, 70, 186, '#999', 3) + l(100, 90, 104, 186, '#999', 3) + l(140, 90, 136, 186, '#999', 3) + l(176, 90, 166, 186, '#999', 3) + l(38, 130, 192, 130, '#999', 3) + p('M40,90 q75,-90 150,0', 'none', 'stroke-width="7"') +
        r(70, 10, 100, 110, '#fffbe9', 0, 'transform="rotate(-6 120 60)"') + l(84, 44, 150, 38, '#3558c7', 4) + l(86, 62, 152, 56, '#3558c7', 4) + l(88, 80, 140, 75, '#3558c7', 4) + l(90, 98, 150, 92, '#3558c7', 4),
      text: "Mutti has written a list and sent you to the Kaufhalle with a basket. Four things are on it: <b>Knusperflocken, Vita Cola, Filinchen</b> and <b>Nudossi</b>. Find them on the shelves and click each one. The list stays at the top of the screen.",
      ask: "Were you sent shopping on your own? What for?"
    },
    {
      id: 'knusper', x: 128, y: 210, w: 130, h: 130, de: 'Knusperflocken', en: 'crunchy chocolate flakes',
      art: p('M14,14 h102 l10,116 h-122 z', '#f2c82e') + p('M14,14 l10,-12 h82 l10,12 z', '#e0a81e') + r(22, 40, 86, 40, '#7a3b1d', 6) + t('Knusper', 65, 58, 17, '#ffd45e') + t('flocken', 65, 75, 17, '#ffd45e') + c(40, 104, 10, '#7a3b1d') + c(66, 110, 10, '#7a3b1d') + c(92, 102, 10, '#7a3b1d'),
      text: "Little milk-chocolate drops with crumbs of crispbread inside, so every single one goes crunch. They come from the Zetti factory in the town of Zeitz, and one bag was never enough for a whole film. They are still made today.",
      ask: "Did you share them, or hide the bag?"
    },
    {
      id: 'vitacola', x: 596, y: 180, w: 130, h: 160, de: 'Vita Cola und Club Cola', en: 'the colas of the DDR',
      art: r(20, 0, 18, 16, '#e0b050') + p('M18,16 h22 q4,40 14,54 v82 q0,8 -8,8 h-34 q-8,0 -8,-8 v-82 q10,-14 14,-54 z', '#5a3320') + r(6, 84, 46, 44, '#ffd45e') + t('Vita', 29, 112, 17, '#b3401a') +
        r(90, 0, 18, 16, '#e0b050') + p('M88,16 h22 q4,40 14,54 v82 q0,8 -8,8 h-34 q-8,0 -8,-8 v-82 q10,-14 14,-54 z', '#5a3320') + r(76, 84, 46, 44, '#d6312b') + t('Club', 99, 112, 16, '#fff'),
      text: "The DDR mixed its own colas. Vita Cola, from 1958, tastes of lemon as well as cola. Club Cola, from 1967, was Berlin's own, and in summer children drank it ice cold from the glass bottle. Both are still bottled today.",
      ask: "Vita or Club: which side were you on?"
    },
    {
      id: 'filinchen', x: 1040, y: 232, w: 180, h: 108, de: 'Filinchen', en: 'the thinnest crispbread in the world',
      art: r(0, 0, 180, 108, '#f2a03e', 6) + r(0, 0, 180, 30, '#fff6dd', 6) + t('Filinchen', 90, 24, 22, '#b3401a') + r(40, 44, 100, 50, '#f6dfa8', 4) + l(52, 44, 52, 94, '#d9b870', 2) + l(72, 44, 72, 94, '#d9b870', 2) + l(92, 44, 92, 94, '#d9b870', 2) + l(112, 44, 112, 94, '#d9b870', 2) + l(40, 60, 140, 60, '#d9b870', 2) + l(40, 78, 140, 78, '#d9b870', 2),
      text: "Wafer-thin, pale gold and so light it nearly floats. Filinchen is baked like a waffle in the town of Apolda. Spread it very, very gently with butter and jam, or it shatters into a hundred pieces. Lots of children just ate it dry out of the packet.",
      ask: "How did you eat your Filinchen?"
    },
    {
      id: 'nudossi', x: 190, y: 396, w: 110, h: 124, de: 'Nudossi', en: 'hazelnut spread from Radebeul',
      art: r(4, 20, 102, 104, '#6a3a1e', 14) + r(10, 0, 90, 24, '#d6312b', 6) + r(4, 50, 102, 46, '#ffd45e') + t('Nudossi', 55, 80, 20, '#b3401a'),
      text: "A thick, sweet hazelnut-and-chocolate spread, made since 1970 near Dresden. It has an enormous amount of real nuts in it. When it arrived in the Kaufhalle the news went round the playground fast. It is still made today, and you can order a jar.",
      ask: "Spoon straight from the jar: did you?"
    },
    {
      id: 'halloren', x: 640, y: 420, w: 180, h: 100, de: 'Halloren-Kugeln', en: 'chocolate balls from Halle',
      art: r(0, 20, 180, 80, '#2f4f8a', 8) + t('Halloren', 90, 50, 22, '#ffd45e') + c(40, 76, 14, '#5a3320') + c(74, 76, 14, '#5a3320') + c(108, 76, 14, '#5a3320') + p('M128,76 a14,14 0 0 1 28,0 z', '#fff6dd') + p('M128,76 a14,14 0 0 0 28,0 z', '#8a5a35'),
      text: "Little chocolate balls with two creamy fillings inside, one light and one dark. They come from Halle, from the oldest chocolate factory in Germany. They are named after the town's salt workers, the Halloren, whose jackets had round silver buttons.",
      ask: "Bite it in half or all in one go?"
    },
    {
      id: 'pfeffi', x: 1060, y: 432, w: 190, h: 88, de: 'Pfeffi', en: 'peppermint sweets in a roll',
      art: r(0, 20, 150, 46, '#fff', 10) + r(26, 20, 98, 46, '#2f8a3c') + t('Pfeffi', 75, 52, 24, '#fff') + c(160, 30, 14, '#fff') + c(172, 62, 14, '#fff') + c(140, 76, 12, '#fff'),
      text: "A paper roll of small white peppermints that fizz a tiny bit on your tongue. There was a roll in every Oma's handbag, in every coat pocket and in the glove box of every Trabi. \"Willst du ein Pfeffi?\" was how a long car journey began.",
      ask: "Who always had Pfeffi in their pocket?"
    },
    {
      id: 'schlager', x: 196, y: 596, w: 190, h: 104, de: 'Schlager-S&uuml;&szlig;tafel', en: 'the "smash hit" sweet bar',
      art: r(0, 14, 190, 76, '#e8742a', 6) + r(0, 14, 34, 76, '#5a3320') + t('Schlager', 110, 46, 24, '#fff6dd') + t('S&uuml;&szlig;tafel', 110, 74, 22, '#5a3320'),
      text: "A \"Schlager\" is a hit song, so this is the hit bar. It looks like chocolate, snaps like chocolate and is full of crunchy peanut pieces. It went into school bags, onto birthday tables and into every parcel for the holiday camp.",
      ask: "What was your number one sweet?"
    },
    {
      id: 'beutel', x: 1290, y: 548, w: 110, h: 152, de: 'Der Dederon-Beutel', en: 'the shopping bag for "just in case"',
      art: p('M30,50 q25,-70 50,0', 'none', 'stroke-width="6"') + p('M6,50 h98 l6,96 q-55,12 -110,0 z', '#7a4fc0') + [[30, 80], [78, 76], [54, 108], [26, 130], [84, 128]].map(function (q) { return c(q[0], q[1], 11, '#ffd45e') + c(q[0], q[1], 5, '#e8742a', 'stroke="none"'); }).join(''),
      text: "A flowery bag made of Dederon that folds up as small as a hanky. Everybody had one in a pocket, always, just in case. Maybe today there are oranges, or bananas, or the first strawberries, and then you want something to carry them home in!",
      ask: "What was the best thing you ever found by surprise in the shop?"
    },
    {
      id: 'kasse', x: 1520, y: 510, w: 230, h: 165, de: 'Alu-Chips', en: 'money as light as a feather',
      art: r(20, 60, 190, 105, '#8a8f94', 10) + r(40, 0, 150, 66, '#55524d', 8) + r(54, 12, 122, 40, '#cfe8c8') + t('0,05 M', 115, 42, 26, '#2a2420') +
        [0, 1, 2, 3].map(function (i) { return r(40 + i * 40, 80, 30, 22, '#f3ecd8', 4) + r(40 + i * 40, 112, 30, 22, '#f3ecd8', 4); }).join('') + e(60, 152, 20, 7, '#e3e6e8') + e(100, 156, 20, 7, '#e3e6e8') + e(150, 152, 16, 6, '#e3e6e8'),
      text: "The money was the Mark, and one Mark was 100 Pfennig. Most coins were made of aluminium, so light that you could hardly feel them in your hand. People called them Alu-Chips. A bread roll cost 5 Pfennig, and the price stayed the same for decades.",
      ask: "How much pocket money did you get?"
    },
    {
      id: 'sero', x: 1180, y: 830, w: 270, h: 160, de: 'Flaschen und Altpapier', en: 'bottles and old paper for SERO',
      art: r(0, 70, 150, 90, '#d9a55a', 4) + l(0, 100, 150, 100) + l(0, 130, 150, 130) + [14, 48, 82, 116].map(function (x) { return r(x + 6, 24, 10, 20, '#4e7a3a') + r(x, 40, 22, 50, '#4e7a3a', 6); }).join('') +
        r(170, 96, 100, 64, '#f3ecd8') + l(170, 112, 270, 112, '#bbb', 2) + l(170, 128, 270, 128, '#bbb', 2) + l(170, 144, 270, 144, '#bbb', 2) + l(220, 96, 220, 160, '#b3401a', 4) + l(170, 128, 270, 128, '#b3401a', 4),
      text: "Nothing was thrown away. Children collected empty bottles, jam jars and bundles of old newspapers, at home and from all the neighbours, and pulled them to the SERO collection point in a handcart. There you got real coins for them. That was pocket money, earned!",
      ask: "What did you buy with your bottle money?"
    }
  ]
});

// ---------------------------------------------------------------------------------------------
room({
  id: 'schule', de: 'Die Schule', en: 'first class at school',
  bg: r(0, 0, 1920, 800, '#f1e6c4') + r(0, 600, 1920, 200, '#b9cfa8') + r(0, 592, 1920, 10, '#8fa880') + r(0, 800, 1920, 280, '#b08a55') + r(0, 790, 1920, 14, '#7a5a3a') +
    // die Tafel
    r(400, 160, 800, 380, '#8a5a35', 6) + r(416, 176, 768, 348, '#2f5f44') + r(400, 540, 800, 18, '#8a5a35') + r(1040, 528, 60, 12, '#fff') + r(960, 528, 40, 12, '#f2c82e') +
    t('M m &nbsp; A a &nbsp; O o', 800, 270, 72, '#f3f3e8', 'font-family="Georgia, serif"') + t('Mama &nbsp; Oma &nbsp; Mimi', 800, 380, 66, '#f3f3e8', 'font-family="Georgia, serif" font-style="italic"') + l(450, 300, 1150, 300, '#7fa08a', 2) + l(450, 410, 1150, 410, '#7fa08a', 2) + t('1 + 2 = 3', 800, 480, 54, '#f2c82e') +
    // Schulbänke
    [[250, 640], [720, 1130]].map(function (q) { return r(q[0], 862, q[1] - q[0], 26, '#c99a5e', 4) + r(q[0] + 16, 888, 18, 150, '#6f7f8a') + r(q[1] - 34, 888, 18, 150, '#6f7f8a') + r(q[0] + 16, 960, q[1] - q[0] - 32, 12, '#6f7f8a'); }).join('') +
    // Garderobe
    r(1690, 220, 220, 18, '#8a5a35', 4) + c(1730, 240, 8, '#555') + c(1800, 240, 8, '#555') + c(1870, 240, 8, '#555') +
    p('M1850,244 q-30,90 -4,150 h60 q10,-70 -20,-150 z', '#d6312b') + l(1870, 244, 1870, 280, '#fff6dd', 3),
  items: [
    {
      id: 'zuckertuete', x: 1480, y: 300, w: 190, h: 480, de: 'Die Zuckert&uuml;te', en: 'the sugar cone for your first school day',
      art: p('M30,120 L95,480 L160,120 z', '#3558c7') + [[70, 180], [110, 230], [84, 290], [100, 350], [94, 410], [128, 170]].map(function (q) { return star(q[0], q[1], 1.4, '#ffd45e'); }).join('') +
        p('M20,124 q-30,-70 20,-100 q10,-34 55,-22 q45,-12 55,22 q50,30 20,100 z', '#f29bb0') + p('M40,120 q55,24 110,0', 'none', 'stroke="#d6312b" stroke-width="10"') + p('M95,128 l-40,34 l10,-40 z', '#d6312b') + p('M95,128 l40,34 l-10,-40 z', '#d6312b') + c(60, 50, 12, '#d6312b') + r(100, 20, 14, 50, '#f2c82e', 4) + c(132, 66, 12, '#2f8a3c'),
      text: "On your very first day of school you get a paper cone nearly as tall as you are, stuffed with sweets, pencils and little presents. In the East it is called a Zuckert&uuml;te. Children are told that they grow on a tree in the school cellar, and are picked when they are ripe.",
      ask: "What was in your Zuckert&uuml;te? Is there a photo?"
    },
    {
      id: 'ranzen', x: 1240, y: 810, w: 200, h: 190, de: 'Der Ranzen', en: 'the school satchel',
      art: p('M50,30 q50,-50 100,0', 'none', 'stroke-width="8"') + r(10, 30, 180, 160, '#b3401a', 16) + p('M10,46 q0,-16 16,-16 h148 q16,0 16,16 v60 q-90,30 -180,0 z', '#d6562a') + r(40, 100, 26, 40, '#e0b050', 4) + r(134, 100, 26, 40, '#e0b050', 4) + c(53, 68, 9, '#ffd45e') + c(147, 68, 9, '#ffd45e') + r(60, 150, 80, 28, '#fff6dd', 4),
      text: "A square, sturdy satchel worn on your back, with two metal buckles that go click. Inside: the Federmappe (a pencil case that opens like a book), exercise books in coloured covers, the Brotb&uuml;chse, and house shoes for the classroom. Your name went on the label.",
      ask: "What colour was your Ranzen?"
    },
    {
      id: 'heft', x: 290, y: 772, w: 200, h: 92, de: 'Das Bienchen', en: 'a little bee for good work',
      art: p('M0,10 l100,10 v72 l-100,-10 z', '#fff') + p('M200,10 l-100,10 v72 l100,-10 z', '#fff') + l(14, 30, 86, 37, '#9cc0e0', 2) + l(14, 44, 86, 51, '#9cc0e0', 2) + l(14, 58, 86, 65, '#9cc0e0', 2) + l(114, 37, 150, 33, '#9cc0e0', 2) + l(114, 51, 150, 47, '#9cc0e0', 2) +
        e(168, 54, 16, 12, '#f2c82e') + l(162, 44, 162, 64, '#3b2b22', 3) + l(172, 43, 172, 65, '#3b2b22', 3) + e(160, 38, 9, 6, '#dff3f8') + e(176, 38, 9, 6, '#dff3f8'),
      text: "When your writing was neat and every sum was right, the teacher pressed a tiny stamp of a bee into your exercise book: a Bienchen, for a busy little bee. Children counted their bees and showed them at home. Marks went from 1, the best, down to 5.",
      ask: "How many Bienchen did you get? And for what?"
    },
    {
      id: 'schulmilch', x: 530, y: 752, w: 90, h: 112, de: 'Die Schulmilch', en: 'milk at break time',
      art: r(34, 0, 22, 14, '#d6312b') + p('M32,14 h26 q2,24 14,36 v52 q0,8 -8,8 h-38 q-8,0 -8,-8 v-52 q12,-12 14,-36 z', '#fff5f7') + r(20, 62, 50, 32, '#f29bb0') + c(45, 78, 9, '#d6312b'),
      text: "At the big break the milk monitors carried in the crate. You could choose: plain, strawberry, vanilla or chocolate. And at midday there was a hot lunch in the dining hall for every child, every day. After lessons, lots of children stayed on in the Hort to play and do homework.",
      ask: "Strawberry, vanilla or chocolate?"
    },
    {
      id: 'fibel', x: 760, y: 752, w: 150, h: 112, de: 'Unsere Fibel', en: 'our first reading book',
      art: r(0, 0, 150, 112, '#f2c82e', 6) + r(0, 0, 16, 112, '#b3401a') + t('Unsere', 84, 32, 20, '#b3401a') + t('Fibel', 84, 54, 22, '#b3401a') + c(64, 82, 13, '#f6d2b0') + c(104, 82, 13, '#f6d2b0') + p('M51,78 q13,-22 26,0 z', '#7a3b1d') + p('M91,78 q13,-24 26,0 z', '#e0b050'),
      text: "\"Unsere Fibel\" means \"our primer\". Every child in the DDR learned to read from the same book, letter by letter: first M, then A, and soon you could read MAMA. The pictures showed children playing, shopping and helping at home, in a world that looked just like yours.",
      ask: "What was the first word you could read?"
    },
    {
      id: 'fueller', x: 930, y: 800, w: 190, h: 62, de: 'Der F&uuml;ller', en: 'the fountain pen',
      art: r(110, 4, 80, 58, '#f6c9d6') + r(0, 30, 120, 18, '#3558c7', 8, 'transform="rotate(-10 60 39)"') + p('M118,24 l26,-2 l-24,14 z', '#e0b050') + r(20, 34, 30, 18, '#22388a', 8, 'transform="rotate(-10 60 39)"') + c(160, 40, 9, '#3558c7', 'stroke="none"') + c(172, 28, 4, '#3558c7', 'stroke="none"'),
      text: "After the pencil came the fountain pen, a \"Heiko\", filled with royal blue ink. Now you wrote in joined-up letters, and handwriting got its own mark. The pink sheet is blotting paper, for the blots. Blue fingers were the sign of a real schoolchild.",
      ask: "Was your handwriting neat? Show us how you wrote your name!"
    },
    {
      id: 'polylux', x: 110, y: 540, w: 250, h: 440, de: 'Der Polylux', en: 'the overhead projector',
      art: p('M150,60 L250,0 L250,150 z', '#fff6c8', 'stroke="none" opacity=".7"') + r(108, 60, 14, 180, '#777') + r(96, 40, 70, 44, '#55524d', 8) + c(160, 62, 14, '#bfe3f0') + r(20, 230, 190, 80, '#8a8f94', 8) + r(40, 222, 150, 14, '#eef6f8') +
        r(10, 310, 210, 14, '#7a5a3a') + r(24, 324, 12, 100, '#777') + r(194, 324, 12, 100, '#777') + c(30, 430, 10, '#333') + c(200, 430, 10, '#333') + r(24, 380, 182, 10, '#777'),
      text: "The teacher writes on a clear sheet with a felt pen, the lamp hums, and the writing appears huge on the wall. The machine was called Polylux, which means \"lots of light\". People from the East still call every projector a Polylux today, and nobody else knows what they mean.",
      ask: "Were you ever allowed to write on the Polylux?"
    },
    {
      id: 'kindertag', x: 1210, y: 150, w: 180, h: 300, de: 'Der Kindertag', en: "Children's Day, the first of June",
      art: p('M90,300 q-20,-80 -40,-140', 'none') + p('M90,300 q0,-90 10,-180', 'none') + p('M90,300 q30,-70 50,-130', 'none') + e(44, 110, 42, 52, '#d6312b') + e(104, 62, 44, 56, '#f2c82e') + e(146, 128, 38, 48, '#2fa8c9') + l(30, 90, 40, 76, '#fff', 4) + l(88, 40, 98, 26, '#fff', 4),
      text: "The first of June was Kindertag, a day just for children. School was decorated with balloons, there were games and races in the yard instead of lessons, cake, and a small present from your parents. Families in the East still keep it today.",
      ask: "What did you do on Kindertag? Shall we celebrate it too?"
    },
    {
      id: 'halstuch', x: 1690, y: 250, w: 130, h: 220, de: 'Das Halstuch', en: "the Pioneers' neckerchief",
      art: p('M10,10 q55,40 110,0 l-20,70 q-35,20 -70,0 z', '#3558c7') + c(65, 86, 13, '#22388a') + p('M58,96 l-22,110 l34,-20 z', '#3558c7') + p('M72,96 l26,104 l-30,-22 z', '#4a6ed6'),
      text: "From first class, children joined the Young Pioneers and wore a blue neckerchief on special days. The big ones wore red. Pioneer afternoons meant crafts, games, sports days, collecting for SERO and summer camps, a bit like Scouts. In 1990 all of that came to an end.",
      ask: "Did you ever get a blue Halstuch? Can you still tie the knot?"
    }
  ]
});

// ---------------------------------------------------------------------------------------------
function sign(col, word, icon) { return p('M0,0 h220 l40,42 l-40,42 h-220 z', col) + '<text x="76" y="52" font-size="26" fill="#fff" font-weight="bold" stroke="none">' + word + '</text>' + icon; }
room({
  id: 'berlin', de: 'In der Stadt', en: 'out in the city, at Alexanderplatz',
  bg: r(0, 0, 1920, 820, '#a9d8ee') + e(300, 220, 150, 40, '#fff', 'opacity=".8"') + e(400, 190, 110, 40, '#fff', 'opacity=".8"') + e(1350, 260, 170, 44, '#fff', 'opacity=".8"') +
    r(0, 560, 300, 260, '#c9c2b4') + r(140, 420, 240, 400, '#d9d2c4') + [0, 1, 2, 3, 4, 5].map(function (i) { return r(160, 440 + i * 60, 200, 30, '#8fb6c9'); }).join('') +
    r(640, 330, 360, 490, '#cfc8ba') + [0, 1, 2, 3, 4, 5, 6, 7].map(function (i) { return r(656, 350 + i * 58, 328, 28, '#8fb6c9'); }).join('') +
    r(1000, 610, 560, 210, '#d9d2c4') + r(1000, 590, 560, 22, '#b3401a') +
    r(0, 820, 1920, 260, '#8f8a82') + r(0, 820, 1920, 46, '#c9c2b4') + [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(function (i) { return r(i * 200 + 20, 1030, 100, 10, '#e9e4d8'); }).join('') +
    r(0, 990, 1920, 6, '#5f5a54') + r(0, 1006, 1920, 6, '#5f5a54') + r(0, 786, 1920, 4, '#444') +
    r(1752, 170, 16, 660, '#6f6a64') + c(1760, 166, 14, '#6f6a64'),
  items: [
    {
      id: 'fernsehturm', x: 440, y: 112, w: 170, h: 700, de: 'Der Fernsehturm', en: 'the TV tower',
      art: r(81, 0, 8, 150, '#fff') + r(81, 20, 8, 22, '#d6312b', 0, 'stroke="none"') + r(81, 64, 8, 22, '#d6312b', 0, 'stroke="none"') + r(81, 108, 8, 22, '#d6312b', 0, 'stroke="none"') + p('M74,150 h22 l14,548 h-50 z', '#d9d2c4') + c(85, 250, 58, '#c9d3da') + r(28, 240, 114, 20, '#6f8a9a') + p('M52,210 q33,-20 66,0', 'none', 'stroke="#fff" stroke-width="5"') + r(40, 690, 90, 10, '#b9b2a6'),
      text: "You can see it from nearly everywhere in Berlin, so nobody can ever really get lost. The tower was finished in 1969 and is 368 metres tall, the tallest building in Germany. Inside the silver ball there is a caf&eacute; that slowly turns, so the whole city glides past your cake.",
      ask: "Did you go up? Who did you go with?"
    },
    {
      id: 'weltzeituhr', x: 740, y: 500, w: 240, h: 320, de: 'Die Weltzeituhr', en: 'the World Clock',
      art: e(120, 44, 60, 22, 'none', 'stroke="#777" stroke-width="4"') + e(120, 44, 22, 44, 'none', 'stroke="#777" stroke-width="4"') + c(120, 44, 9, '#ffd45e') + c(62, 40, 7, '#d6312b') + c(176, 52, 7, '#3558c7') + c(128, 4, 7, '#2f8a3c') +
        r(0, 96, 240, 80, '#55606a', 10) + r(0, 120, 240, 34, '#e9e4d8') + t('12 &middot; 13 &middot; 14 &middot; 15', 120, 146, 22, '#33241b') + r(100, 176, 40, 134, '#8a8f94') + e(120, 312, 70, 10, '#6f6a64'),
      text: "\"Wir treffen uns an der Weltzeituhr!\" Since 1969 everybody in Berlin has met their friends under this clock at Alexanderplatz. It turns all day and shows what time it is right now in 148 cities around the world. On top, the planets circle on their rings.",
      ask: "Who did you meet under the clock?"
    },
    {
      id: 'ampel', x: 1070, y: 440, w: 120, h: 380, de: 'Das Ampelm&auml;nnchen', en: 'the little traffic-light man', sound: 'tick',
      art: r(52, 200, 16, 180, '#555') + r(10, 0, 100, 204, '#2a2420', 12) + c(60, 54, 40, '#3a0d0b') + c(60, 150, 40, '#0d2a12') +
        c(60, 34, 9, '#ff4a3d', 'stroke="none"') + r(48, 26, 24, 5, '#ff4a3d', 0, 'stroke="none"') + r(54, 44, 12, 34, '#ff4a3d', 0, 'stroke="none"') + r(30, 48, 60, 8, '#ff4a3d', 0, 'stroke="none"') +
        c(64, 128, 9, '#57e06a', 'stroke="none"') + r(52, 120, 24, 5, '#57e06a', 0, 'stroke="none"') + p('M58,138 l10,0 l4,20 l12,16 l-8,5 l-14,-16 l-8,18 l-10,-4 l10,-22 z', '#57e06a', 'stroke="none"') + p('M56,144 l-14,10 l4,6 l12,-8 z', '#57e06a', 'stroke="none"'),
      text: "East Berlin's traffic-light man has a hat and a round tummy. On red he spreads his arms wide. On green he strides off like he is late for the tram. He was invented in 1961. People loved him so much that today he shines on crossings all over Berlin, and on T-shirts, mugs and gummy sweets.",
      ask: "Can you stand like the red one and walk like the green one?"
    },
    {
      id: 'ketwurst', x: 1230, y: 500, w: 290, h: 320, de: 'Ketwurst, Grilletta und Softeis', en: 'East Berlin street food',
      art: r(10, 90, 270, 230, '#fff6dd') + p('M0,90 h290 l-20,-60 h-250 z', '#d6312b') + [50, 110, 170, 230].map(function (x) { return p('M' + x + ',30 h30 l6,60 h-42 z', '#fff', 'stroke="none"'); }).join('') + r(40, 130, 210, 100, '#8fb6c9') + r(30, 230, 230, 14, '#b8793a') + t('KETWURST', 145, 284, 34, '#b3401a') +
        r(70, 176, 90, 26, '#e0a868', 13) + r(60, 184, 30, 10, '#b3401a', 5) + p('M196,180 l18,46 l18,-46 z', '#e0a868') + c(214, 170, 16, '#fff') + c(214, 152, 11, '#fff'),
      text: "A Ketwurst is a hot sausage pushed into a long roll with a hole down the middle, filled up with ketchup, so nothing drips on your coat. It was invented right here in East Berlin. Its cousin the Grilletta is a burger. For afters: Softeis, a tall swirl of soft ice cream.",
      ask: "Ketwurst or Grilletta? And vanilla or chocolate Softeis?"
    },
    {
      id: 'tram', x: 40, y: 800, w: 540, h: 200, de: 'Die Stra&szlig;enbahn', en: 'the tram', sound: 'bell',
      art: l(200, 30, 250, 0, '#555', 4) + l(250, 0, 300, 30, '#555', 4) + r(0, 30, 540, 150, '#f3e6c0', 18) + r(0, 110, 540, 40, '#e8742a') + [20, 120, 220, 320, 420].map(function (x) { return r(x, 46, 86, 56, '#cfeaf2', 6); }).join('') + r(480, 46, 50, 56, '#cfeaf2', 6) +
        r(70, 120, 50, 60, '#d9c9a0') + r(280, 120, 50, 60, '#d9c9a0') + c(110, 186, 16, '#2a2420') + c(430, 186, 16, '#2a2420') + c(528, 130, 8, '#fff3a8'),
      text: "The trams came from Prague and squealed round every corner. A ride cost 20 Pfennig. There was no ticket inspector at the door: you dropped your coins into a little box, pulled the lever, and tore off your own paper ticket. Everybody could see that you had paid.",
      ask: "Where did the tram take you? To Oma? To the Tierpark?"
    },
    {
      id: 'trabant', x: 1180, y: 850, w: 380, h: 150, de: 'Der Trabi', en: 'the Trabant', sound: 'honk',
      art: trabi('#9cc7d8', false),
      text: "The Trabant is small, round and goes \"reng-deng-deng-deng\" with a little blue cloud behind it. Its body is not metal but Duroplast, a hard plastic made with cotton. The colours had lovely names like papyrus white and Panama green. A family kept its Trabi for many, many years, and often gave it a name.",
      ask: "Did our family have a car? What was it called?"
    },
    { id: 'sez', x: 1640, y: 200, w: 260, h: 84, de: 'Das SEZ', en: 'the pool with real waves', art: sign('#2fa8c9', 'SEZ', p('M20,54 q12,-16 24,0 q12,16 24,0', 'none', 'stroke="#fff" stroke-width="6"')),
      text: "The Sport- und Erholungszentrum opened in 1981: a swimming pool where a horn sounds and real waves roll in, plus slides, an ice rink, roller skating and bowling, all under one roof. People came from all over the country, and the queue went round the corner.",
      ask: "Did you jump in the waves at the SEZ?" },
    { id: 'tierpark', x: 1640, y: 320, w: 260, h: 84, de: 'Der Tierpark', en: 'the East Berlin zoo', art: sign('#2f8a3c', 'Tierpark', c(42, 46, 12, '#fff', 'stroke="none"') + c(26, 30, 6, '#fff', 'stroke="none"') + c(42, 24, 6, '#fff', 'stroke="none"') + c(58, 30, 6, '#fff', 'stroke="none"')),
      text: "The Tierpark in Friedrichsfelde is so huge that you need a whole day and good shoes. It opened in 1955 in the park of an old palace. There are elephants and polar bears, and a giant warm hall where tigers live and birds fly free over your head through a jungle.",
      ask: "Which animal did you always visit first?" },
    { id: 'pionierpalast', x: 1640, y: 440, w: 260, h: 84, de: 'Der Pionierpalast', en: 'a palace just for children', art: sign('#d6312b', 'Wuhlheide', r(18, 30, 44, 26, '#fff', 4, 'stroke="none"') + c(28, 60, 6, '#fff', 'stroke="none"') + c(52, 60, 6, '#fff', 'stroke="none"')),
      text: "In the woods of the Wuhlheide stands a palace built for children, with a swimming pool, a theatre, workshops and even a training centre for little cosmonauts. Outside runs a real small railway where children are the conductors and station masters. Both are still there today, and the trains still run.",
      ask: "Did you ride the Pioniereisenbahn? Shall we go?" },
    { id: 'kulturpark', x: 1640, y: 560, w: 260, h: 84, de: 'Der Kulturpark', en: 'the funfair in the Pl&auml;nterwald', art: sign('#8a4fc7', 'Kulturpark', c(40, 42, 20, 'none', 'stroke="#fff" stroke-width="5"') + l(40, 22, 40, 62, '#fff', 3) + l(20, 42, 60, 42, '#fff', 3)),
      text: "Beside the river Spree, in the Pl&auml;nterwald, was the only funfair in the DDR that never packed up and left. It opened in 1969. The giant Ferris wheel lifted you high above the treetops, and there were rollercoasters, dodgems, and candyfloss as big as your head.",
      ask: "Were you brave enough for the big wheel?" }
  ]
});
