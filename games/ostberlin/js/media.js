// Real photos and films for the cards. A card works without either: take a line out and the drawing is back.
// Photos are files in ../img, all from Wikimedia Commons (who made each one, and its licence: CREDITS.md).
// Films are YouTube ids; they play inside the game's television and need the internet.
'use strict';

var MEDIA = {
  // a flip-through thing shows its films on a television, or as a sleeve with a record ('lp') or a CD ('lp cd')
  look: { fernseher: 'tv', platten: 'lp', anlage: 'lp cd', buecher: 'tv' },
  // the pile of photos on the first screen
  title: [
    { f: 't1.jpg', by: 'Bundesarchiv, Hirndorf, Heinz', lic: 'CC BY-SA 3.0 de', cap: 'Alexanderplatz, 1987' },
    { f: 't2.jpg', by: 'Bundesarchiv, Link, Hubert', lic: 'CC BY-SA 3.0 de', cap: 'Berlin, 1987' },
    { f: 't3.jpg', by: 'Bundesarchiv, Hubert Link', lic: 'CC BY-SA 3.0 de', cap: 'Berlin, 1987' },
    { f: 't4.jpg', by: 'Bundesarchiv, Gabriele Senft', lic: 'CC BY-SA 3.0 de', cap: 'Berlin, 1986' },
    { f: 't5.jpg', by: 'Bundesarchiv, Horst Sturm', lic: 'CC BY-SA 3.0 de', cap: 'Wuhlheide' },
    { f: 't6.jpg', by: 'Bundesarchiv, Zimmermann, Peter', lic: 'CC BY-SA 3.0 de', cap: 'Kulturpark, 1987' }
  ],
  // item id, or item id + ':' + the card or dish number
  photos: {
    vitrine: { f: 'vitrine.jpg', by: 'Dguendel', lic: 'CC BY 4.0' },
    kaffee: { f: 'kaffee.jpg', by: 'VSchagow', lic: 'CC BY-SA 4.0' },
    schwibbogen: { f: 'schwibbogen.jpg', by: 'Bergleute', lic: 'CC BY-SA 4.0' },
    mixer: { f: 'mixer.jpg', by: 'Nutzdatenbegleiter', lic: 'CC BY-SA 4.0' },
    eierbecher: { f: 'eierbecher.jpg', by: 'Maddl79', lic: 'CC BY-SA 3.0' },
    superfest: { f: 'superfest.jpg', by: 'Wikimedia Commons', lic: 'CC BY-SA 4.0' },
    'herd:0': { f: 'herd_0.jpg', by: 'Xipolis', lic: 'CC BY-SA 4.0' },
    'herd:1': { f: 'herd_1.jpg', by: 'Roland Geider', lic: 'Public domain' },
    'herd:2': { f: 'herd_2.jpg', by: 'Daniel Rentsch Danz', lic: 'Public domain' },
    'herd:3': { f: 'herd_3.jpg', by: 'Raboe001', lic: 'CC BY-SA 3.0 de' },
    sandmann: { f: 'sandmann.jpg', by: 'Radler22', lic: 'CC BY-SA 4.0' },
    triola: { f: 'triola.jpg', by: 'Toa7d6', lic: 'CC0' },
    pebe: { f: 'pebe.jpg', by: 'Aineias', lic: 'CC BY-SA 2.0 de' },
    dia: { f: 'dia.jpg', by: 'Ulfbastel', lic: 'Public domain' },
    poesie: { f: 'poesie.jpg', by: 'Thirunavukkarasye-Raveendran', lic: 'CC BY 4.0' },
    kreisel: { f: 'kreisel.jpg', by: 'Onderwijsgek', lic: 'CC BY-SA 3.0' },
    zettel: { f: 'zettel.jpg', by: 'Stefan Kühn', lic: 'CC BY-SA 3.0' },
    knusper: { f: 'knusper.jpg', by: 'MarketingZetti', lic: 'CC BY-SA 4.0' },
    vitacola: { f: 'vitacola.jpg', by: 'Eichis', lic: 'Public domain' },
    filinchen: { f: 'filinchen.jpg', by: 'Wiggum', lic: 'CC BY-SA 4.0' },
    nudossi: { f: 'nudossi.jpg', by: 'Jbergner', lic: 'CC BY-SA 4.0' },
    halloren: { f: 'halloren.jpg', by: 'Wikimedia Commons', lic: 'CC BY-SA 3.0' },
    beutel: { f: 'beutel.jpg', by: '123Alarm', lic: 'CC BY-SA 4.0' },
    sero: { f: 'sero.jpg', by: 'Radler22', lic: 'CC BY-SA 4.0' },
    zuckertuete: { f: 'zuckertuete.jpg', by: 'Deutsche Fotothek, Roger Rössing', lic: 'CC BY-SA 3.0 de' },
    polylux: { f: 'polylux.jpg', by: 'Maddl79', lic: 'CC BY-SA 4.0' },
    halstuch: { f: 'halstuch.jpg', by: 'Deutsche Fotothek, Roger Rössing', lic: 'CC BY-SA 3.0 de' },
    fernsehturm: { f: 'fernsehturm.jpg', by: 'Bundesarchiv, Schindler, Karl-Heinz', lic: 'CC BY-SA 3.0 de' },
    weltzeituhr: { f: 'weltzeituhr.jpg', by: 'Christian Wolf', lic: 'CC BY-SA 3.0 de' },
    ampel: { f: 'ampel.png', by: 'German Democratic Republic / Karl Peglau', lic: 'CC BY-SA 4.0' },
    ketwurst: { f: 'ketwurst.jpg', by: 'Martin Haase', lic: 'CC BY-SA 3.0' },
    tram: { f: 'tram_b.jpg', by: 'Frank Nowotny', lic: 'CC BY-SA 4.0' },
    trabant: { f: 'trabant.jpg', by: 'Lothar Spurzem', lic: 'CC BY-SA 2.0 de' },
    reise: { f: 'reise.jpg', by: 'Matti Blume', lic: 'CC BY-SA 4.0' },
    sez: { f: 'sez.jpg', by: 'Gerd Danigel', lic: 'CC BY-SA 4.0' },
    pionierpalast: { f: 'pionierpalast.jpg', by: 'Bundesarchiv, Richter', lic: 'CC BY-SA 3.0 de' },
    kulturpark: { f: 'kulturpark.jpg', by: 'Bundesarchiv, Roeske, Robert', lic: 'CC BY-SA 3.0 de', cap: 'Berlin, 1989' },
    tierpark: { f: 'tierpark.jpg', by: 'GodeNehler', lic: 'CC BY-SA 4.0' },
    strandkorb: { f: 'strandkorb.jpg', by: 'Tobias Luksch', lic: 'CC BY-SA 3.0', cap: 'Usedom' },
    neptun: { f: 'neptun.jpg', by: 'Bundesarchiv, Uhlemann, Thomas', lic: 'CC BY-SA 3.0 de', cap: '1985' },
    zelt: { f: 'zelt.jpg', by: 'Jörg Blobelt', lic: 'CC BY-SA 4.0', cap: 'Usedom, 1972' },
    prag: { f: 'prag.jpg', by: 'Dietmar Rabich', lic: 'CC BY-SA 4.0' },
    schneekoppe: { f: 'schneekoppe.jpg', by: 'Pudelek', lic: 'CC BY-SA 4.0' },
    knoedel: { f: 'knoedel.jpg', by: 'Jun Seita', lic: 'CC BY 2.0' },
    maulwurf: { f: 'maulwurf.jpg', by: 'El Nino', lic: 'CC BY-SA 3.0' },
    loveparade: { f: 'loveparade.jpg', by: 'Ago76', lic: 'CC BY-SA 4.0', cap: 'Berlin, 1998' },
    baustelle: { f: 'baustelle.jpg', by: 'O', lic: 'CC BY-SA 2.0', cap: 'Potsdamer Platz, 1996' },
    tamagotchi: { f: 'tamagotchi.jpg', by: 'Tomasz Sienicki (tsca)', lic: 'CC BY-SA 3.0' },
    discman: { f: 'discman.jpg', by: 'MiNe', lic: 'CC BY 2.0' },
    buffalos: { f: 'buffalos.jpg', by: 'ManuElaZ', lic: 'CC BY-SA 3.0' }
  },
  films: {
    'fernseher:0': '0Pp42bXXQZA', // Unser Sandmännchen (DDR) Intro und Outro (Gamaran)
    'fernseher:1': 'bnzHUNn1AL0', // SANDMÄNNCHEN: "Pittiplatsch will nicht ins Bett" (mit Schnatterinchen) (Unser Sandmännchen (rbb media))
    'fernseher:2': 'O1_EuFJPdzM', // Spuk im Hochhaus [1/7] Feuer und Wasser  (Serie, DDR 1982) (Michael Teschke)
    'fernseher:3': 'ACcNwFNjYwY', // Drei Haselnüsse für Aschenbrödel - Trailer (defa-filme.net)
    'fernseher:4': 'b9q9WeCSg7M', // Mach mit machs nach machs besser (pokitsch)
    'fernseher:5': 'XuybrDWzPwY', // Pan Tau - DAS ORIGINAL DIGITAL RESTAURIERT - Offizieller DVD-/Blu-ray- (Release Company)
    'fernseher:6': 'YYte2XncDdE', // Der kleine Maulwurf - Der Maulwurf als Gaertner (Der kleine Maulwurf)
    'fernseher:7': 'T82vyoRt3R4', // »Ich habe einen Plan« & »Mächtig gewaltig, Egon!« ... die Olsenbande! (videosissimo)
    'fernseher:8': 'fYXGUEbbQZc', // Friedrichstadtpalast Ballett-Eröffnung des Kessel Buntes (DerBellato)
    'platten:0': 'BeXHWIJJ0a8', // Nina Hagen - Du hast den Farbfilm vergessen 1974 (fritz51220)
    'platten:1': 'r4qllWerXb8', // Reinhard Lakomy: Der Traumzauberbaum (EUROPA Hörspiele)
    'platten:2': 'Z_DMRjt1bbI', // Karat - Über sieben Brücken mußt Du gehn (Ein Kessel Buntes, 03.03.197 (Karat)
    'platten:3': 'e6oDrXOLs8w', // CITY - Am Fenster (CityOstrockVEVO)
    'platten:4': '7y67CXIgNrw', // Silly - Bataillon d' amour (sillychannel)
    'platten:5': 'H80WDlfkZAA', // Feeling B - Mix mir einen Drink (Walduhu)
    'platten:6': 'lXgkuM2NhYI', // David Bowie - "Heroes" (Official Video) [HD] (David Bowie)
    'anlage:0': 'AFIzmOtTusg', // Lucilectric - Mädchen (Official Video) (Escanor A.)
    'anlage:1': 'DtPhK0-FEQU', // Tic Tac Toe - Ich find' dich scheiße (Official Video) (Tic Tac Toe)
    'anlage:2': 'gJLIiF15wjQ', // Spice Girls - Wannabe (Official Music Video) (Spice Girls)
    'anlage:3': '404oPn6tudE', // die ärzte - Männer sind Schweine (Offizielles Video - Refurbished 2025 (bademeisterTV)
    'anlage:4': 'hTWKbfoikeg', // Nirvana - Smells Like Teen Spirit (Official Music Video) (Nirvana)
    'anlage:5': 'x2rQzv8OWEY', // Rammstein - Engel (Official 4K Video) (Rammstein Official)
    'anlage:6': 'PHzOOQfhPFg', // No Doubt - Just A Girl (No Doubt)
    'anlage:7': 'Yam5uK6e-bQ', // The Cranberries - Dreams (Dir: Peter Scammell) (Official Music Video) (TheCranberriesTV)
    sandmann: 'T7z8Id9eJx0', // Unser Sandmännchen | Lied | Sandmann Titelmusik (DDR) 60 Jahre Sandmän (Emma Miller)
    kreisel: 'epWVP0FO_jM', // Brummkreisel "TschuTschu" - Humming Top "TschuTschu" (PM Science Toys)
    pebe: 'FjGyQftOOg4', // PEBE (DDR-Lego) Ausstellung Bad Kösen Romanisches Haus (BLKregionalTV)
    'buecher:2': 'w21ESzFm_eY', // "Mosaik": Ausstellung in Leipzig - 70 Jahre DDR-Kult-Comic (pro gress.insight)
    mixer: 'pR7ZK78fdPQ', // Küchenhelfer RG 28 DDR N-ostalgie Kitchen Accessoir (Sternschnuppen-Nächte-Live & nachhaltig-reparieren)
    superfest: 'HM6kBrXTeNM', // Superfeste Gläser, DDR-Design (DDR-Design.info)
    'herd:1': 'OJ6gjqGLsCI', // Das Original: DDR Soljanka wie früher kochen mit diesem leckeren DDR R (Ostdeutsch Kochen)
    'herd:2': 'QQcq9JNPDpo', // Beliebte Kekstorte Kalter Hund nach leckerem DDR Rezept einfach selber (Ostdeutsch Kochen)
    zettel: 'cs4CWeElpzk', // DDR-Alltag | Berlin-Friedrichshagen 1987 | Kaufhalle, Bölschestrasse,  (footage berlin - rbb media)
    halloren: 'nuuJsfgeutk', // Halloren Produktion (DieHallorenFabrik)
    sero: 'EOgNg2Cbx94', // Ham'se nicht noch Altpapier? Das beste aus der DDR. Sero Altpapier und (DDR Spielzeugmuseum Aschersleben e.V.)
    fernsehturm: 'uXeGHcxOKs4', // DDR: Bau und Eröffnung des Fernsehturms in Berlin | 1969 (footage berlin - rbb media)
    ampel: 'eV-QBauEexU', // Das Ost-Ampelmännchen - eine Erfolgsgeschichte | Euromaxx (DW Deutsch)
    ketwurst: 'Xm_7RofR2YE', // DDR-Eisgeschichte: So schmeckte der Sommer im Osten (Zapfhahn)
    tram: 'A7iS_FmvgCM', // Es war einmal: Tatra Straßenbahnen in Berlin (TheTraintv)
    trabant: 'P2FlgFvarcY', // Trabant Werbung (netz4)
    sez: 'UoRHZr3bAGY', // SEZ Berlin Wellenbad und Rollschuhbahn, 1982 (footage berlin - rbb media)
    tierpark: 'G-_HZHZ81ss', // Tierpark Berlin Sommer 1982 (motourer – Touren & Reiseberichte )
    pionierpalast: 'fvaYj5w__Es', // 40 Jahre FEZ & Pionierpalast (FEZ-Berlin)
    kulturpark: 'kZLU7SxwkHo', // Kulturpark Treptow 1982 | Plänterwald im Sommer 🌞🎡 (footage berlin - rbb media)
    reise: 'TsK0UTew8wQ', // DDR-Urlaub - Anreise zur Ostsee 70er Jahre (fritz51185)
    zelt: 'LVDUCNr-Sv8', // Autowäsche und Camping an der Ostsee – DDR-Privatfilm der frühen 1960e (Nostalgie Garage Sachsen )
    neptun: 'twzdIgsgMXw', // Neptuntaufe Sommerferienlager (gutshausthelkow)
    prag: '2t7l7EkbqiQ', // Prague 1980 - Socialist Capital on Super 8 (Christoryman)
    schneekoppe: 'PticW0624fc', // Sessellift Riesengebirge, Schneekoppe (Jürgen Hahn)
    maulwurf: 'ipx0jjHolzM', // Der kleine Maulwurf - Der Maulwurf im Urlaub (Der kleine Maulwurf)
    reichstag: 'nKNRleYToZY', // 25 Jahre Reichstagsverhüllung: Werkschau des Künstlerpaares Christo un (tagesschau)
    loveparade: 'RmW7IZUNefc', // Dr. Motte & Westbam - Sunshine, Love Parade 1997 (TinnitusGehoerschade)
    viva: 'RESu-kBs00s', // VIVA's erste offizielle Sendung | 24.12.1993 | 30 Jahre deutsches Musi (MTV Deutschland)
    tamagotchi: 'yhePudsDgJ8', // Tamagotchi (1997) | SRF Archiv (SRF Archiv)
    buffalos: 'mfo8uqHwHLc', // Weiße Buffalo Clogs - 90iger Reportage (Buffalo-Plateauschuh 👣 )
    baustelle: 'GiKL7KT0pmo', // Die Infobox am Potsdamer Platz (vergangenheitsverlag)
    diddl: '7YOl6hIYvMA', // Diddl-Maus - Ikone der 1990er und 2000er Jahre (Damals in Frankfurt)
  }
};
