// Further away: the holidays (the Baltic and Czechoslovakia), and the same child ten years on, as a teenager.
'use strict';

room({
  id: 'ferien', de: 'In die Ferien', en: 'the Baltic Sea and Czechoslovakia',
  bg: r(0, 0, 1920, 620, '#a9d8ee') + c(260, 230, 70, '#ffe27a') + e(700, 200, 150, 36, '#fff', 'opacity=".8"') + e(1250, 170, 130, 34, '#fff', 'opacity=".8"') +
    // die Ostsee
    r(0, 430, 1000, 200, '#3f8fc0') + r(0, 430, 1000, 14, '#6fb3d9') + p('M60,500 q20,-14 40,0 q20,14 40,0', 'none', 'stroke="#cfeaf2" stroke-width="5"') + p('M380,540 q20,-14 40,0 q20,14 40,0', 'none', 'stroke="#cfeaf2" stroke-width="5"') + p('M800,490 q20,-14 40,0 q20,14 40,0', 'none', 'stroke="#cfeaf2" stroke-width="5"') +
    p('M0,610 q500,-40 1000,10 l60,470 h-1060 z', '#f0dca0') +
    // Böhmen
    p('M940,620 q200,-170 420,-60 q260,-190 560,-40 v560 h-900 z', '#8fc07a') + p('M1010,1080 q-90,-240 -40,-470 q200,-50 420,20 q300,-40 530,-20 v470 z', '#7ab368') +
    p('M1000,1080 q-60,-200 -30,-420 l70,-10 q-20,220 60,430 z', '#d9c9a0') +
    // Wegweiser
    r(954, 540, 14, 250, '#7a5a3a') + p('M960,560 h-170 l-30,26 l30,26 h170 z', '#fff6dd', 'stroke="#3b2b22" stroke-width="3"') + t('OSTSEE', 860, 597, 28, '#2f6f8a') + p('M962,630 h170 l30,26 l-30,26 h-170 z', '#fff6dd', 'stroke="#3b2b22" stroke-width="3"') + t('&#268;SSR', 1050, 667, 28, '#b3401a') +
    [[90, 870], [300, 960], [620, 1010], [880, 930]].map(function (q) { return p('M' + q[0] + ',' + q[1] + ' q6,-30 0,-50 M' + (q[0] + 10) + ',' + q[1] + ' q14,-24 18,-44 M' + (q[0] - 8) + ',' + q[1] + ' q-10,-22 -18,-36', 'none', 'stroke="#7fa05a" stroke-width="5"'); }).join(''),
  items: [
    {
      id: 'strandkorb', x: 110, y: 600, w: 250, h: 270, de: 'Der Strandkorb', en: 'the beach chair that is a little house',
      art: p('M20,130 q-10,-120 110,-126 q100,4 110,60 l-30,66 z', '#d9a55a') + [50, 80, 110, 140, 170].map(function (x) { return l(x, 20, x - 6, 128, '#b8793a', 3); }).join('') + p('M40,130 h170 l30,-66 v150 l-30,50 h-170 z', '#fff') + [58, 96, 134, 172].map(function (x) { return r(x, 132, 19, 130, '#3558c7', 0, 'stroke="none"'); }).join('') + r(30, 200, 190, 24, '#fff6dd', 6) + r(20, 262, 200, 8, '#b8793a'),
      text: "A wicker chair with a roof against the sun, walls against the wind and a drawer to rest your feet on. It was invented on this coast over a hundred years ago. The DDR's seaside was the Ostsee, the Baltic, with the islands of R&uuml;gen, Usedom and Hiddensee, and long white beaches.",
      ask: "Which beach was yours? R&uuml;gen? Usedom? Somewhere else?"
    },
    {
      id: 'neptun', x: 600, y: 330, w: 190, h: 230, de: 'Das Neptunfest', en: "King Neptune's party", sound: 'win',
      art: l(160, 0, 160, 200, '#e0b050', 6) + p('M140,36 v-30 M160,36 M180,36 v-30 M140,36 h40', 'none', 'stroke="#e0b050" stroke-width="6"') + p('M30,230 q0,-110 60,-110 q60,0 60,110 z', '#2f8a6a') + c(90, 96, 36, '#f6d2b0') + p('M58,70 l8,-34 l14,22 l10,-28 l10,28 l14,-22 l8,34 z', '#ffd45e') + p('M58,104 q32,80 64,0 q-32,14 -64,0 z', '#e9f3f5') + c(78, 92, 4, '#3b2b22') + c(102, 92, 4, '#3b2b22') + p('M0,214 q24,-18 48,0 q24,18 48,0 q24,-18 48,0 q24,18 46,0 v16 h-190 z', '#6fb3d9'),
      text: "At the holiday camp, King Neptune rises out of the water with his crown and trident. His helpers catch every child, give them a spoonful of terrible \"magic potion\", dunk them in the water and baptise them with a silly sea name like Wriggling Sprat. You even get a certificate.",
      ask: "Were you baptised by Neptune? What was your sea name?"
    },
    {
      id: 'zelt', x: 500, y: 640, w: 300, h: 200, de: 'Das Zelt', en: 'a whole summer under canvas',
      art: p('M10,180 L150,10 L290,180 z', '#e8742a') + p('M150,10 L110,180 h80 z', '#3b2b22') + p('M150,10 L128,180 h-18 z', '#f2a03e') + l(150, 10, 150, 0) + r(200, 176, 100, 20, '#3558c7', 10) + l(224, 176, 224, 196, '#22388a', 2) + l(250, 176, 250, 196, '#22388a', 2) + l(276, 176, 276, 196, '#22388a', 2),
      text: "A tent, air mattresses that smell of rubber, a little gas cooker and a whole summer outdoors. Camping was the DDR's favourite holiday. Families came back to the same spot by the sea or a lake every year, so the children next door were your holiday friends for life.",
      ask: "Did you sleep in a tent? Who snored?"
    },
    {
      id: 'fkk', x: 390, y: 720, w: 110, h: 190, de: 'FKK', en: 'swimming with nothing on',
      art: r(50, 50, 10, 140, '#7a5a3a') + r(0, 0, 110, 56, '#fff6dd', 6) + t('FKK', 55, 40, 32, '#2f6f8a') + p('M60,80 h44 v60 q-22,10 -44,0 z', '#d6312b') + l(64, 100, 100, 100, '#fff', 4) + l(64, 120, 100, 120, '#fff', 4),
      text: "FKK is short for a very long word that means \"bathing with no clothes on\". At lots of Baltic beaches, whole families swam, played volleyball and built sandcastles completely bare. Nobody stared and nobody minded. Your swimsuit stayed dry on the sign.",
      ask: "Swimsuit or no swimsuit?"
    },
    {
      id: 'bernstein', x: 180, y: 930, w: 140, h: 76, de: 'Der Bernstein', en: 'amber, the gold of the Baltic',
      art: p('M10,50 q0,-34 30,-36 q30,0 34,26 q0,26 -34,28 q-28,0 -30,-18 z', '#e8a020') + p('M84,56 q4,-22 24,-20 q22,4 20,22 q-6,16 -26,14 q-16,-2 -18,-16 z', '#f2b83e') + l(28, 30, 40, 26, '#ffe9a0', 4) + p('M60,70 q10,-14 20,0 z', '#fff6dd'),
      text: "After a storm, look in the seaweed at the water's edge. Honey-yellow stones lie there, warm in your hand and so light that they float in salty water. Amber is the sap of trees that grew forty million years ago. Sometimes a tiny insect is still inside.",
      ask: "Did you ever find a piece? Where is it now?"
    },
    {
      id: 'reise', x: 720, y: 850, w: 380, h: 200, s: 0.95, de: 'Koffer aufs Dach!', en: 'suitcases on the roof!', sound: 'honk',
      art: trabi('#f3e6c0', true),
      text: "Suitcases on the roof rack, children in the back between the pillows, and off before sunrise. In the bag: sandwiches, hard-boiled eggs and a flask of sweet tea for the picnic at the side of the road. After ten minutes, somebody in the back asks: \"Sind wir bald da?\" Are we nearly there?",
      ask: "What did you play in the back seat?"
    },
    {
      id: 'prag', x: 1110, y: 360, w: 380, h: 220, de: 'Prag', en: 'Prague, the golden city',
      art: p('M40,150 h300 v-40 h-30 v-30 h-20 v30 h-40 v-70 l-14,-40 l-14,40 v20 h-16 v-60 l-14,-44 l-14,44 v110 h-60 v-34 h-24 v34 h-54 z', '#c9a26a') + p('M176,150 v-110 l14,-40 l14,40 v110 z', '#b8894e') + r(0, 150, 380, 26, '#b8894e') + [20, 110, 200, 290].map(function (x) { return p('M' + x + ',220 v-20 q30,-36 60,0 v20 z', '#6fb3d9'); }).join('') + r(0, 176, 380, 24, '#d9c9a0'),
      text: "A castle on the hill, a stone bridge lined with statues, and an old clock where little figures march past a window every hour. Prague is only a few hours from Berlin by train. Czechoslovakia, the &#268;SSR, was the country next door, and families went there again and again.",
      ask: "What do you remember about Prague?"
    },
    {
      id: 'schneekoppe', x: 1540, y: 250, w: 320, h: 270, de: 'Das Riesengebirge', en: 'the Giant Mountains',
      art: p('M0,270 L130,40 L200,130 L240,90 L320,270 z', '#8a9aa8') + p('M130,40 L96,100 l24,-10 l14,16 l16,-18 l18,10 z', '#fff') + p('M240,90 l-18,40 l20,-8 l16,10 z', '#fff') + r(118, 22, 26, 18, '#b3401a') + p('M114,22 l17,-14 l17,14 z', '#7a3b1d') + p('M30,270 l30,-80 l30,80 z', '#2f6a44') + p('M70,270 l26,-66 l26,66 z', '#3a7d52'),
      text: "The Giant Mountains have snow on top, wooden huts with hot soup, and a ghost. He is R&uuml;bezahl, the grumpy mountain spirit with the enormous beard, who plays tricks on greedy people and helps kind ones. In summer you hike from hut to hut, and in winter you come back with a sledge.",
      ask: "How far did your little legs have to walk?"
    },
    {
      id: 'knoedel', x: 1330, y: 800, w: 290, h: 140, de: 'Kn&ouml;del, Oblaten und Kofola', en: 'dumplings, wafers and Czech cola',
      art: e(110, 104, 108, 34, '#fff') + e(110, 100, 84, 24, '#f3ecd8') + p('M50,100 q40,-30 80,0 q-40,20 -80,0 z', '#8a3a1a') + e(130, 86, 22, 14, '#fdf3c8') + e(160, 98, 22, 14, '#fdf3c8') + e(142, 108, 22, 14, '#fdf3c8') +
        p('M226,40 h50 l-6,96 h-38 z', '#4a2a18') + r(226, 40, 50, 14, '#f3ecd8') + c(218, 26, 30, '#f2d9a0', 'opacity=".95"') + c(218, 26, 20, 'none', 'stroke="#d9b870" stroke-width="2"'),
      text: "Czech dumplings come in slices, like bread, to soak up the gravy from the goulash. For afters there are warm wafers as big as a plate, filled with hazelnut or vanilla, eaten walking through a spa town. And to drink: Kofola, the Czech cola that tastes of herbs.",
      ask: "Kofola or Club Cola? And how many Kn&ouml;del could you eat?"
    },
    {
      id: 'maulwurf', x: 1680, y: 640, w: 180, h: 190, de: 'Der kleine Maulwurf', en: 'the Little Mole',
      art: p('M0,190 q90,-90 180,0 z', '#7a5a3a') + e(90, 110, 46, 56, '#3a3a40') + e(90, 126, 26, 32, '#e9e4d8') + c(74, 90, 9, '#fff') + c(106, 90, 9, '#fff') + c(76, 92, 4, '#3b2b22') + c(104, 92, 4, '#3b2b22') + c(90, 106, 8, '#d6312b') + l(84, 56, 78, 40) + l(90, 54, 90, 36) + l(96, 56, 102, 40) + e(42, 124, 14, 9, '#e9b8a0') + e(138, 124, 14, 9, '#e9b8a0') + p('M78,118 q12,10 24,0', 'none'),
      text: "The Little Mole comes from Prague, where he is called Krtek. He has three hairs on his head, a red nose and a giggle. He hardly ever speaks, he just laughs, squeaks and says \"Ahoj!\", so children in every country understand him. He has been digging since 1957.",
      ask: "Did you bring a Maulwurf home from Prague?"
    }
  ]
});

// ---------------------------------------------------------------------------------------------
room({
  id: 'neunziger', de: 'Die 90er', en: 'ten years later, Berlin in the 1990s',
  bg: r(0, 0, 1920, 800, '#cdbde6') + r(0, 800, 1920, 280, '#6f7fa8') + r(0, 790, 1920, 14, '#55628a') +
    [[720, 200, '#ffd45e'], [800, 330, '#f29bb0'], [1140, 180, '#7ed8c0'], [1200, 420, '#ffd45e'], [60, 420, '#7ed8c0'], [1840, 300, '#f29bb0'], [960, 140, '#f29bb0']].map(function (q) { return star(q[0], q[1], 2.4, q[2]); }).join('') +
    // Fenster
    r(1290, 140, 480, 400, '#fff') + r(1308, 158, 444, 364, '#a9d8ee') + r(1524, 158, 12, 364, '#fff') + r(1620, 380, 120, 142, '#c9c2b4') + r(1640, 300, 6, 80, '#8fa3b0') + c(1643, 292, 12, '#8fa3b0') + r(1280, 540, 500, 22, '#fff') +
    // Schreibtisch
    r(90, 640, 690, 28, '#e9e4d8', 4) + r(110, 668, 20, 150, '#b9b2a6') + r(740, 668, 20, 150, '#b9b2a6') + r(110, 668, 200, 130, '#d9d2c4') + c(210, 734, 8, '#8a8f94') +
    // Hocker
    r(810, 704, 150, 20, '#f29bb0', 8) + r(826, 724, 14, 96, '#b9b2a6') + r(930, 724, 14, 96, '#b9b2a6') +
    // Bett
    r(1150, 760, 720, 100, '#e9e4d8', 10) + r(1160, 700, 700, 90, '#7a4fc0', 20) + [1200, 1320, 1440, 1560, 1680, 1800].map(function (x) { return star(x, 746, 1.8, '#ffd45e'); }).join('') + r(1700, 650, 150, 70, '#fff', 24) + r(1840, 600, 30, 260, '#e9e4d8', 8) +
    e(980, 960, 330, 80, '#f29bb0') + e(980, 960, 250, 56, '#ffd45e') +
    // Lavalampe
    p('M60,640 l14,-120 h32 l14,120 z', '#e8742a') + e(90, 560, 10, 16, '#ffd45e') + e(86, 606, 14, 12, '#ffd45e') + r(56, 628, 68, 14, '#8a8f94', 4),
  items: [
    {
      id: 'reichstag', x: 150, y: 140, w: 270, h: 200, de: 'Der verh&uuml;llte Reichstag', en: 'a parliament wrapped like a present',
      art: r(0, 0, 270, 200, '#8fc7e6') + r(0, 160, 270, 40, '#7ab368') + p('M30,160 v-90 h30 v-24 h30 v24 h20 q25,-40 50,0 h20 v-24 h30 v24 h30 v90 z', '#dfe6ea') + [50, 80, 110, 160, 190, 220].map(function (x) { return l(x, 60, x - 4, 160, '#b9c6ce', 2); }).join('') + l(30, 100, 240, 100, '#3558c7', 3) + l(30, 130, 240, 130, '#3558c7', 3),
      text: "In the summer of 1995 two artists, Christo and Jeanne-Claude, wrapped the whole Reichstag building in shining silver fabric and tied it up with blue rope, like a giant present. It stayed wrapped for two weeks. Five million people came to look and picnic on the grass in front of it.",
      ask: "Did you see it? Did you touch the fabric?"
    },
    {
      id: 'loveparade', x: 470, y: 140, w: 200, h: 270, de: 'Die Loveparade', en: 'a million people dancing', sound: 'hum',
      art: r(0, 0, 200, 270, '#f23e9a') + c(100, 110, 64, '#ffd45e') + c(78, 96, 8, '#3b2b22') + c(122, 96, 8, '#3b2b22') + p('M66,124 q34,40 68,0', 'none', 'stroke-width="6"') + [0, 45, 90, 135, 180, 225, 270, 315].map(function (a) { return l(100 + 74 * Math.cos(a * Math.PI / 180), 110 + 74 * Math.sin(a * Math.PI / 180), 100 + 92 * Math.cos(a * Math.PI / 180), 110 + 92 * Math.sin(a * Math.PI / 180), '#fff', 6); }).join('') + t('LOVE', 100, 236, 34, '#fff') + t('PARADE', 100, 262, 22, '#ffd45e'),
      text: "One Saturday every July, trucks with loudspeakers as big as wardrobes rolled slowly through the Tiergarten park. The first time, in 1989, 150 people danced behind them. Ten years later it was more than a million, with neon hair, whistles and sunflowers, and the whole city went boom-boom-boom.",
      ask: "Did you go? What did you wear?"
    },
    {
      id: 'anlage', x: 130, y: 462, w: 310, h: 178, de: 'Die Stereoanlage', en: "{M}'s mixtape: press play", kind: 'flip', next: 'N&auml;chster Song', flipSound: 'tick', picBg: '#55628a',
      art: r(60, 0, 190, 178, '#2a2420', 6) + r(72, 12, 166, 40, '#55524d') + r(84, 22, 90, 20, '#9ad27a') + c(206, 32, 12, '#888') + r(72, 62, 166, 46, '#55524d') + e(155, 85, 44, 14, '#cfd6dc') + r(72, 118, 166, 50, '#55524d') + r(84, 130, 60, 26, '#222') + r(166, 130, 60, 26, '#222') +
        r(0, 40, 54, 138, '#3a3530', 4) + c(27, 80, 18, '#222') + c(27, 136, 22, '#222') + r(256, 40, 54, 138, '#3a3530', 4) + c(283, 80, 18, '#222') + c(283, 136, 22, '#222'),
      cards: [
        { de: 'Lucilectric', en: 'Because I am a girl (1994)', bg: '#f23e9a', by: '&bdquo;M&auml;dchen&ldquo;', text: "A cheeky pop-rock song from Berlin about how brilliant it is to be a girl: \"Weil ich ein M&auml;dchen bin!\" It was on the radio all summer long, and every girl in every schoolyard sang the chorus at the top of her voice.", ask: "Sing it for us!" },
        { de: 'Tic Tac Toe', en: 'three girls who rapped in German (1996)', bg: '#222222', by: 'Girl-Power auf Deutsch', text: "Three young women from the Ruhr who rapped fast, funny and very rude things in German, and said exactly what they thought. Their first album sold millions, and parents everywhere raised their eyebrows.", ask: "Were you allowed to listen to them?" },
        { de: 'Spice Girls', en: 'Wannabe (1996)', bg: '#d6312b', by: 'Girl Power!', text: "Scary, Sporty, Baby, Ginger and Posh: five friends from England who shouted \"Girl Power!\" and wore shoes like bricks. Every girl had to choose which Spice Girl she was. It was a very serious decision.", ask: "Which Spice Girl was your favourite?" },
        { de: 'Die &Auml;rzte', en: 'the best band in the world (they say so themselves)', bg: '#2f4f8a', by: 'aus Berlin', text: "\"The Doctors\" are a punk rock band from Berlin who cannot stop making jokes. They are loud, fast and silly, and they call themselves the best band in the world. Thousands of fans know every single word.", ask: "Do you know a whole &Auml;rzte song by heart?" },
        { de: 'Nirvana', en: 'Smells Like Teen Spirit (1991)', bg: '#4e7a3a', by: 'Grunge', text: "Three musicians from America with ripped jeans, checked shirts, long hair and very loud guitars. Suddenly nobody wanted to look tidy any more. A whole generation of teenagers stopped combing their hair.", ask: "Did you have a checked shirt and ripped jeans?" },
        { de: 'Rammstein', en: 'fire on stage (1994)', bg: '#8a1a14', by: 'aus Ost-Berlin', text: "Six musicians from the East who met in Berlin. Two of them had played in the punk band Feeling B. Their concerts have more fire than a dragon, and today they fill the biggest stadiums in the world, singing in German.", ask: "Too loud, or just right?" },
        { de: 'No Doubt', en: 'Just a Girl (1995)', bg: '#e8742a', by: 'Gwen Stefani', text: "Gwen Stefani jumps around the stage in a vest and big boots and sings that she is tired of being told what a girl can and cannot do. It is fast and bouncy and a bit angry, which is perfect for a bedroom with the door shut.", ask: "What did you turn up loud with the door shut?" },
        { de: 'The Cranberries', en: 'Dreams (1992)', bg: '#2f8a6a', by: 'aus Irland', text: "A band from Limerick in Ireland. Their singer Dolores had a voice like nobody else, with a little flip in it, somewhere between singing and yodelling. Berlin teenagers loved them as much as Irish ones did.", ask: "Can you do Dolores's little yodel?" }
      ]
    },
    {
      id: 'viva', x: 500, y: 486, w: 230, h: 156, de: 'VIVA', en: 'music television, all day',
      art: r(0, 0, 230, 140, '#3a3530', 12) + r(14, 14, 170, 112, '#ffd45e', 8) + t('VIVA', 99, 86, 46, '#d6312b') + c(206, 40, 9, '#888') + c(206, 70, 9, '#888') + r(60, 140, 110, 14, '#2a2420'),
      text: "In December 1993 Germany got its own music channel, and it showed music videos from morning till night. The presenters were hardly older than the viewers, and they were funny. After school the bag landed in the corner and the TV went on: VIVA.",
      ask: "Which video did you wait for all afternoon?"
    },
    {
      id: 'tamagotchi', x: 834, y: 590, w: 104, h: 116, de: 'Das Tamagotchi', en: 'a pet in an egg', sound: 'tick',
      art: c(52, 8, 8, 'none', 'stroke-width="4"') + e(52, 68, 46, 50, '#7ed8c0') + r(26, 42, 52, 40, '#dfe8c8', 6) + r(44, 54, 16, 14, '#3b2b22', 4, 'stroke="none"') + r(40, 68, 24, 6, '#3b2b22', 0, 'stroke="none"') + c(34, 98, 5, '#f29bb0') + c(52, 102, 5, '#f29bb0') + c(70, 98, 5, '#f29bb0'),
      text: "In 1997 everybody had a tiny plastic egg with a pet inside the screen. It beeped when it was hungry, when it wanted to play and when it had done a poo. Forget it for one school day and it was very cross with you. Teachers collected whole drawers full of beeping eggs.",
      ask: "How long did your Tamagotchi live?"
    },
    {
      id: 'buffalos', x: 800, y: 860, w: 230, h: 130, de: 'Die Plateauschuhe', en: 'shoes like bricks',
      art: r(10, 80, 210, 50, '#fff', 10) + l(10, 104, 220, 104, '#bbb', 3) + p('M10,82 v-40 q0,-30 40,-30 h30 l40,40 q70,4 100,30 z', '#2a2420') + l(84, 22, 110, 48, '#fff', 4) + l(74, 30, 100, 56, '#fff', 4) + r(18, 20, 30, 12, '#f23e9a', 4),
      text: "Trainers with soles as thick as a loaf of bread. You were suddenly ten centimetres taller and could see over everybody at the concert. The Spice Girls wore them and so did half of Berlin. Walking down stairs in them took practice.",
      ask: "Did you have a pair? Did you ever fall off them?"
    },
    {
      id: 'discman', x: 1050, y: 900, w: 230, h: 120, de: 'Discman und Mixtape', en: 'music in your pocket',
      art: c(70, 62, 56, '#3558c7') + c(70, 62, 34, '#cfd6dc') + c(70, 62, 8, '#3558c7') + p('M118,40 q60,-50 100,10', 'none', 'stroke-width="5"') + r(140, 58, 90, 58, '#fff6dd', 6) + r(152, 70, 66, 24, '#55524d', 4) + c(170, 82, 7, '#fff') + c(200, 82, 7, '#fff') + l(150, 106, 220, 106, '#d6312b', 4),
      text: "The Discman played your CDs on the bus, and skipped every time the bus hit a bump. A mixtape was better anyway: a cassette you filled yourself, song by song, for your best friend or for somebody you liked, with a cover you drew by hand. It said more than a letter.",
      ask: "Who made you a mixtape? Who did you make one for?"
    },
    {
      id: 'bravo', x: 1230, y: 660, w: 170, h: 120, de: 'Die BRAVO', en: 'the magazine, every Thursday',
      art: r(0, 0, 170, 120, '#fff', 4, 'transform="rotate(-6 85 60)"') + r(4, 6, 80, 30, '#d6312b', 0, 'transform="rotate(-6 85 60)"') + '<g transform="rotate(-6 85 60)">' + t('BRAVO', 44, 29, 20, '#fff') + c(120, 66, 26, '#f6d2b0') + p('M94,60 q26,-40 52,0 q-26,-14 -52,0 z', '#7a3b1d') + r(12, 50, 60, 8, '#ccc', 0, 'stroke="none"') + r(12, 66, 60, 8, '#ccc', 0, 'stroke="none"') + r(12, 82, 60, 8, '#ccc', 0, 'stroke="none"') + '</g>',
      text: "Every Thursday, pocket money in hand, to the kiosk for the new BRAVO: posters to pull out, the words of the latest songs and all the news about the stars. Best of all was the Starschnitt, a life-size poster of a star that arrived in pieces, week by week, until it covered your door.",
      ask: "Whose posters were on your wall?"
    },
    {
      id: 'diddl', x: 1520, y: 560, w: 170, h: 200, de: 'Die Diddl-Maus', en: 'the mouse with the giant feet',
      art: e(34, 44, 34, 40, '#fff') + e(34, 46, 20, 26, '#f6c9d6') + e(136, 44, 34, 40, '#fff') + e(136, 46, 20, 26, '#f6c9d6') + e(85, 150, 40, 46, '#fff') + e(85, 80, 46, 42, '#fff') + c(70, 72, 7, '#3b2b22') + c(100, 72, 7, '#3b2b22') + e(85, 92, 10, 7, '#f29bb0') + p('M70,104 q15,12 30,0', 'none') + e(46, 192, 40, 12, '#f6c9d6') + e(124, 192, 40, 12, '#f6c9d6'),
      text: "Diddl is a white mouse with enormous ears and even bigger feet. In the late 1990s he was on everything: pencil cases, mugs, cuddly toys. Most of all he was on sheets of writing paper, the Diddl-Bl&auml;tter, which you collected in a folder and swapped in the schoolyard. Some of them even smelled of fruit.",
      ask: "How many Diddl-Bl&auml;tter did you have? Where are they?"
    },
    {
      id: 'baustelle', x: 1320, y: 190, w: 200, h: 330, de: 'Die gr&ouml;&szlig;te Baustelle Europas', en: "Europe's biggest building site",
      art: r(40, 40, 10, 290, '#f2c82e') + r(0, 40, 170, 10, '#f2c82e') + l(45, 20, 0, 44, '#f2c82e', 4) + l(45, 20, 170, 44, '#f2c82e', 4) + r(40, 20, 10, 20, '#f2c82e') + l(140, 50, 140, 150, '#555', 2) + r(126, 150, 28, 22, '#8a8f94') +
        r(130, 120, 8, 210, '#e8742a') + r(100, 120, 100, 8, '#e8742a') + r(90, 240, 90, 50, '#d6312b') + l(100, 290, 100, 330, '#555', 5) + l(170, 290, 170, 330, '#555', 5) + t('INFO', 135, 274, 20, '#fff'),
      text: "From the window: a forest of cranes. In the 1990s the middle of Berlin, Potsdamer Platz, was the biggest building site in Europe. A bright red box on stilts stood in the middle, and you could climb up it to watch a whole new piece of city grow. Divers even worked underwater in the giant pits.",
      ask: "Did you climb up the red Info-Box?"
    },
    {
      id: 'bleibt', x: 1590, y: 420, w: 100, h: 122, de: 'Was geblieben ist', en: 'what stayed',
      art: p('M14,122 q6,-66 36,-66 q30,0 36,66 z', '#b3401a') + c(50, 48, 22, '#f6d2b0') + p('M28,42 L50,0 L72,42 z', '#8a3a1a') + p('M38,58 q12,26 24,0 z', '#fff') + c(43, 46, 3, '#3b2b22') + c(57, 46, 3, '#3b2b22'),
      text: "In November 1989 the Wall opened, and a year later East and West were one country and Berlin was one big city, twice the size, with twice as much to explore. Lots of things from the East stayed: the Sandman is still on TV every evening, the Ampelm&auml;nnchen still shines, and the Spreewald gherkins never left.",
      ask: "What is the first thing you remember about the other half of Berlin?"
    }
  ]
});
