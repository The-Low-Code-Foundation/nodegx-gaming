// The street: a Plattenbau cut open like a doll's house, the Kaufhalle, the school, the TV tower
// and a packed Trabi. Each one is a way into a room.
'use strict';

var HUB = {
  // x, y, w, h = the part of the picture you click; px, py = where its name plate sits
  list: [
    { room: 'wohnzimmer', x: 160, y: 180, w: 380, h: 250, px: 350, py: 452 },
    { room: 'kueche', x: 580, y: 180, w: 380, h: 250, px: 770, py: 452 },
    { room: 'kinderzimmer', x: 160, y: 500, w: 380, h: 250, px: 350, py: 772 },
    { room: 'neunziger', x: 580, y: 500, w: 380, h: 250, px: 770, py: 772 },
    { room: 'kaufhalle', x: 1070, y: 560, w: 440, h: 270, px: 1290, py: 800 },
    { room: 'schule', x: 1550, y: 380, w: 350, h: 450, px: 1725, py: 722 },
    { room: 'berlin', x: 1180, y: 110, w: 220, h: 400, px: 1290, py: 470 },
    { room: 'ferien', x: 620, y: 850, w: 420, h: 215, px: 1190, py: 960 }
  ],
  find: function (id) { for (var i = 0; i < HUB.list.length; i++) if (HUB.list[i].room === id) return HUB.list[i]; return null; },
  // what moves in the sky: the sun's rays turn, three clouds and two birds drift across
  sky: function () {
    var rays = '', i;
    for (i = 0; i < 12; i++) rays += '<rect x="1694" y="92" width="12" height="34" rx="6" fill="#ffe27a" transform="rotate(' + i * 30 + ' 1700 200)"/>';
    function cloud(y, sc, dur, delay) {
      return '<g transform="translate(0,' + y + ') scale(' + sc + ')"><g class="cloud" opacity=".92" style="animation-duration:' + dur + 's;animation-delay:-' + delay + 's">' +
        e(0, 0, 90, 30, '#fff') + e(-52, 10, 60, 22, '#fff') + e(56, 12, 70, 24, '#fff') + e(8, -18, 52, 26, '#fff') + '</g></g>';
    }
    function bird(y, dur, delay) {
      return '<g transform="translate(0,' + y + ')"><g class="cloud" style="animation-duration:' + dur + 's;animation-delay:-' + delay + 's"><path class="flap" d="M-16,0 q8,-12 16,0 q8,-12 16,0" fill="none" stroke="#33241b" stroke-width="4" stroke-linecap="round"/></g></g>';
    }
    return '<g class="rays" style="transform-origin:1700px 200px">' + rays + '</g>' + cloud(92, 1, 95, 12) + cloud(215, 0.7, 130, 80) + cloud(58, 0.55, 170, 40) + bird(130, 46, 5) + bird(170, 46, 3.6);
  },
  // arrive = the Trabi drives in from the left; without it the street is simply there
  bg: function (arrive) {
    var s = '<g' + NS + '>' + r(0, 0, 1920, 840, '#a9d8ee') + HUB.sky() + c(1700, 200, 60, '#ffe27a') + e(330, 90, 0, 0, '#fff') + e(1500, 150, 0, 0, '#fff') +
      e(1560, 250, 120, 30, '#fff', 'opacity=".85"') + e(1100, 170, 100, 28, '#fff', 'opacity=".85"') +
      // der Fernsehturm
      r(1286, 120, 8, 140, '#fff') + c(1290, 116, 7, '#ff3b30', 'class="blink"') + r(1286, 140, 8, 20, '#d6312b') + r(1286, 190, 8, 20, '#d6312b') + p('M1280,260 h20 l10,330 h-40 z', '#d9d2c4') + c(1290, 330, 44, '#c9d3da') + r(1246, 322, 88, 16, '#6f8a9a') +
      // die Platte
      r(100, 150, 920, 690, '#ddd6c6') + r(86, 132, 948, 22, '#8a8378') +
      [150, 440, 730].map(function (y) { return r(100, y, 920, 5, '#bdb5a3'); }).join('') + [100, 560, 1015].map(function (x) { return r(x, 150, 5, 690, '#bdb5a3'); }).join('') +
      // vier Zimmer
      r(170, 190, 360, 230, '#e9c77b') + [0, 1, 2].map(function (i) { return c(230 + i * 120, 250, 26, '#dd9a45') + c(230 + i * 120, 250, 12, '#b8672a'); }).join('') + r(190, 330, 200, 90, '#6f7f3a', 24) + r(420, 250, 8, 170, '#4f2f1a') + p('M394,260 l14,-50 h32 l14,50 z', '#f2b23e') +
      r(590, 190, 360, 230, '#fbf1cf') + r(590, 290, 360, 60, '#f2d98a') + r(610, 350, 320, 70, '#fbf7ea') + r(600, 342, 340, 12, '#c98d4b') + r(700, 290, 90, 52, '#d6312b', 8) + r(690, 284, 110, 12, '#b3261f', 6) + r(840, 210, 80, 60, '#e8742a', 6) +
      r(170, 510, 360, 230, '#d8e8cf') + r(190, 660, 220, 80, '#7fa6d9', 12) + r(196, 640, 80, 40, '#fff', 14) + c(450, 640, 34, '#c98d4b') + c(426, 612, 13, '#c98d4b') + c(474, 612, 13, '#c98d4b') + e(450, 700, 40, 44, '#c98d4b') + c(440, 634, 4, '#33241b') + c(460, 634, 4, '#33241b') +
      r(590, 510, 360, 230, '#cdbde6') + r(620, 540, 90, 120, '#f23e9a') + c(665, 596, 28, '#ffd45e') + r(740, 560, 180, 100, '#2a2420', 6) + e(830, 610, 40, 14, '#cfd6dc') + star(900, 540, 2, '#ffd45e') + star(725, 700, 2, '#7ed8c0') +
      [[170, 190], [590, 190], [170, 510], [590, 510]].map(function (q) { return r(q[0], q[1], 360, 230, 'none', 0, 'stroke="#fff6dd" stroke-width="12"') + r(q[0] + 30, q[1] + 242, 300, 26, '#e8742a', 4); }).join('') +
      r(530, 760, 60, 80, '#7a5a3a') + r(540, 770, 40, 40, '#a9d8ee') + t('7', 560, 752, 22, '#33241b') +
      // die Kaufhalle
      r(1090, 610, 420, 230, '#f3ecd8') + r(1075, 594, 450, 22, '#b3401a') + r(1110, 660, 250, 150, '#a9d8ee') + r(1230, 660, 8, 150, '#f3ecd8') + r(1390, 680, 90, 160, '#7a5a3a') + r(1400, 690, 70, 70, '#a9d8ee') +
      r(1120, 530, 360, 64, '#d6312b', 6) + t('KAUFHALLE', 1300, 578, 46, '#fff6dd') +
      // die Schule
      r(1560, 410, 340, 430, '#e8c98a') + p('M1545,410 L1730,330 L1915,410 z', '#b3401a') + c(1730, 380, 24, '#fff6dd') + r(1728, 364, 4, 18, '#33241b') + r(1728, 378, 14, 4, '#33241b') +
      [0, 1, 2].map(function (i) { return [0, 1, 2].map(function (j) { return r(1590 + j * 100, 450 + i * 96, 76, 66, '#a9d8ee') + r(1626, 450 + i * 96, 0, 0, '#fff'); }).join(''); }).join('') +
      r(1690, 740, 80, 100, '#7a5a3a') + r(1640, 696, 180, 38, '#fff6dd', 4) + t('SCHULE', 1730, 726, 28, '#b3401a') +
      // die Straße
      r(0, 840, 1920, 240, '#77726b') + r(0, 840, 1920, 36, '#c9c2b4') + [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(function (i) { return r(i * 200 + 40, 1040, 100, 10, '#e9e4d8'); }).join('') +
      r(60, 640, 10, 200, '#555') + c(65, 620, 34, '#2f8a3c') + c(40, 650, 26, '#3a9a48') + c(92, 652, 26, '#3a9a48') + '</g>' +
      '<g transform="translate(640,860)"><g' + (arrive ? ' class="drivein"' : '') + '>' +
      [0, 1, 2].map(function (i) { return '<circle class="puff" cx="-6" cy="156" r="15" fill="#fff" stroke="none" style="transform-origin:-6px 156px;animation-delay:' + (i * 0.55) + 's"/>'; }).join('') +
      '<g class="putter">' + INK + trabi('#9cc7d8', true) + '</g></g></g></g>';
    return s;
  },
  spots: function () {
    return HUB.list.map(function (h) {
      var rm = G.rooms[h.room]; if (!rm) return '';
      var k = count(h.room), full = k.n === k.of, w = 300;
      return '<g class="hot" data-act="room" data-id="' + h.room + '" data-de="' + rm.de + '" data-en="' + rm.en + '">' +
        '<rect class="halo" x="' + h.x + '" y="' + h.y + '" width="' + h.w + '" height="' + h.h + '" rx="16" style="fill-opacity:.35"/>' +
        r(h.px - w / 2, h.py - 30, w, 52, full ? '#ffd45e' : '#fff6dd', 10, 'stroke="#33241b" stroke-width="4"') +
        t(rm.de.replace(/^(Das|Die|Der) /, '') + ' &nbsp;' + k.n + '/' + k.of, h.px + (full ? 20 : 0), h.py + 6, 24, '#33241b') +
        (full ? star(h.px - w / 2 + 26, h.py - 4, 1.6, '#e8742a') : '') +
        r(h.x, h.y, h.w, h.h, '#000', 0, 'fill-opacity="0" pointer-events="all"') +
        r(h.px - w / 2, h.py - 30, w, 52, '#000', 0, 'fill-opacity="0" pointer-events="all"') + '</g>';
    }).join('');
  }
};
