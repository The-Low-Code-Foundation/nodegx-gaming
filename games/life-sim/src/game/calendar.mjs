// The calendar (round 16, phase 6): seasons, birthdays, the town's events and weekends. Data only; the page keeps the
// date (`calendar.start`: which day of the year the game began on), asks what season it is, and makes the rest true
// (the weather's odds, the garden's colours in dressing.mjs `seasonLook`, the planter's crop in life.mjs, the events and
// wishes that come up, a birthday's cake and presents, a fair in the park). On in a game (and on a test URL with
// ?calendar=1, ?season=<id> or ?date=<day of the year>). Nobody gets older: a birthday is a day for cake, never a number.
// Words: strings.mjs `season.<id>`, `crop.<id>`, `townEvent.<id>…`, `birthday.…`.

// A season lasts a week of game days, so a change is felt within a week of play; a year is four weeks. Day 1 of a game
// is a Monday, and so is day 1 of every season.
export const CALENDAR = { seasonDays: 7 };
//   weather  the odds of the day's weather (weather.mjs): the 10% snow of phase 3 is now 40% in winter and none at
//            other times (still 10% over a year)
//   crop     what the planter grows (skills.mjs EARNING.veg): `grow` times as fast, sold for `worth` times as much
//   lean     free will a little keener on some things (an offer's id: ×n), as wishes are (wants.mjs `seasons`)
export const SEASONS = [
  { id: 'spring', icon: '🌸', weather: { sun: 0.55, rain: 0.45, snow: 0 }, crop: { id: 'peas', grow: 1.2, worth: 1 }, lean: { smellFlowers: 1.4, feedDucks: 1.2 } },
  { id: 'summer', icon: '🌞', weather: { sun: 0.8, rain: 0.2, snow: 0 }, crop: { id: 'strawberries', grow: 1.3, worth: 1.1 }, lean: { sitBench: 1.3, feedDucks: 1.3 } },
  { id: 'autumn', icon: '🍂', weather: { sun: 0.5, rain: 0.5, snow: 0 }, crop: { id: 'pumpkins', grow: 0.9, worth: 1.4 }, lean: { cook: 1.2, read: 1.2 } },
  { id: 'winter', icon: '❄️', weather: { sun: 0.45, rain: 0.15, snow: 0.4 }, crop: { id: 'kale', grow: 0.5, worth: 1 }, lean: { warmUp: 1.6, bath: 1.2, tv: 1.15 } }
];
export const SEASON_IDS = SEASONS.map((s) => s.id);
export const seasonById = (id) => SEASONS.find((s) => s.id === id) ?? SEASONS[0];
export const YEAR_DAYS = SEASONS.length * CALENDAR.seasonDays;

// The date on game day `day` (0: the first), for a game that began on day `start` of the year: the day of the year
// (0 to YEAR_DAYS − 1), the season, the day of the season (1 to 7) and the year (1, 2…).
export function dateOf(day, start = 0) {
  const n = day + start, yearDay = ((n % YEAR_DAYS) + YEAR_DAYS) % YEAR_DAYS;
  const k = Math.floor(yearDay / CALENDAR.seasonDays);
  return { yearDay, season: SEASON_IDS[k], dayOfSeason: (yearDay % CALENDAR.seasonDays) + 1, year: Math.floor(n / YEAR_DAYS) + 1 };
}
// A day of the year by season and day of the season (1 to 7).
export const yearDayOf = (season, dayOfSeason = 1) => Math.max(0, SEASON_IDS.indexOf(season)) * CALENDAR.seasonDays + Math.max(1, Math.min(CALENDAR.seasonDays, dayOfSeason)) - 1;
// Where a new game's year begins: the first day of a season, by the town's dice (each town its own).
export const rollStart = (random) => Math.floor(random() * SEASONS.length) * CALENDAR.seasonDays;
// The start that makes game day `day` the day of the year `yearDay` (a test URL's ?season= or ?date=; an old save:
// spring's first week the day it loads, on its weekday).
export const startFor = (day, yearDay) => (((yearDay - day) % YEAR_DAYS) + YEAR_DAYS) % YEAR_DAYS;

// ---- 6.2: birthdays (no ageing) ----
// Everyone has a day of the year: rolled by the town's dice for the town's people (the same town, the same birthdays),
// chosen or rolled on the make-your-Sim screen, rolled for anyone else in the household and anyone an old save has.
export const rollBirthday = (random) => Math.floor(random() * YEAR_DAYS);
// On the day: the moodlet all day, a cake (baked at the oven, or bought by phone for `buy` coins), a party if wanted
// (the household's own party, round 15), presents from friends (from `friends` friendship, at most `most` of them),
// each one of the things they love (likes.mjs: their favourite food, colour or thing to do), the life story. Told at
// `at` o'clock (or when the game is opened later that day). The town's people's birthdays go on the notice board.
export const BIRTHDAY = { at: 8, buy: 25, friends: 25, most: 3, presentFriendship: 3, wish: 40 };
// What a present is, by the like it is about: strings.mjs `birthday.present.<kind>` with the like's own word.
export const PRESENT_KINDS = ['food', 'colour', 'activity'];

// ---- 6.3: the town's events ----
// One a season, on a day of it (`day`, 1 to 7), at a place with its hours. On the notice board `ahead` days before.
// Its stalls (world.mjs MADE STALL) stand at the place while it is on, each with its offers (actions.mjs `<offers>`),
// and the town's people go (`people` of them drawn while someone from the household is there, the rest as data). A
// contest (`contest`: a skill) gives a rosette and a prize by how good they are: `PRIZES`.
//   decor   what dresses the place (dressing.mjs `eventDecor`): bunting, fairy lights
export const TOWN_EVENTS = [
  { id: 'plantSale', icon: '🌱', season: 'spring', day: 3, place: 'park', hours: [10, 16], contest: 'gardening', stalls: ['plants', 'cakes', 'show'], decor: 'bunting' },
  { id: 'summerFair', icon: '🎡', season: 'summer', day: 6, place: 'park', hours: [10, 18], contest: 'painting', stalls: ['games', 'treats', 'show'], decor: 'bunting' },
  { id: 'bakeOff', icon: '🥧', season: 'autumn', day: 4, place: 'park', hours: [11, 17], contest: 'cooking', stalls: ['treats', 'cakes', 'show'], decor: 'bunting' },
  { id: 'winterLights', icon: '✨', season: 'winter', day: 5, place: 'street', hours: [16, 21], contest: 'music', stalls: ['cocoa', 'treats', 'show'], decor: 'lights' }
];
export const TOWN_EVENT = { ahead: 3, people: 6, before: 0.5 };
// The contest: points = the skill's level + 0 to `luck`; at least `places[k]` → place k + 1 (a rosette and coins).
export const PRIZES = { luck: 4, places: [8, 5.5, 3.5], coins: [60, 30, 15], points: [80, 50, 30] };
export function contestPlace(level, random) {
  const score = level + random() * PRIZES.luck;
  const k = PRIZES.places.findIndex((p) => score >= p);
  return k < 0 ? null : k + 1;
}
// The town's event on a date, or null.
export const townEventOn = (date) => TOWN_EVENTS.find((e) => e.season === date.season && e.day === date.dayOfSeason) ?? null;
// Is it on now (`hour` of its day)? A little before it opens (`before` hours), the stalls are up.
export const eventOpen = (e, hour) => hour >= e.hours[0] && hour < e.hours[1];

// ---- 6.4: weekends ----
// Saturday and Sunday: a lie-in (asleep until `lieIn` o'clock if they have nowhere to be), free will keener on some
// things (`lean`), an outing in the late morning (the park, or round to a friend's: `outing`), and the phone and the
// door busier (events.mjs DECK `weekend`). Careers keep their own days (work.mjs: the café and the vet work Saturdays).
export const WEEKEND = {
  days: [5, 6],
  lieIn: 10,
  lean: { nap: 1.3, tv: 1.2, read: 1.2, cook: 1.25, dance: 1.2, study: 0.6 },
  outing: { at: 11, park: 0.45, visit: 0.3, friends: 25 }
};
export const isWeekend = (weekday) => WEEKEND.days.includes(weekday);
