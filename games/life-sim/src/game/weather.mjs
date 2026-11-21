// The weather (round 16, phase 3; the roadmap's 3.4): one a day, rolled at the start of the day. Data only; the page
// asks what is not on offer in it (`off`: offer ids, greyed in the menus with why, skipped by free will and by wishes),
// what is offered only in it (an offer's `weather` field, actions.mjs: a snowman in the snow, puddles in the rain), and
// events can ask for it (events.mjs `weather`). How it looks is dressing.mjs's (`weatherLook`): `look` here says how
// grey the sky goes (0 to 1), how much less sun there is, and what falls.
// Words: strings.mjs `weather.<id>` and `weather.<id>.off` (why something is greyed).
// Seasons come with the calendar (phase 6): until then, snow is just rare.
export const WEATHER = {
  sun: { icon: '☀️', chance: 0.6, off: [], look: { grey: 0, sun: 1, falls: null } },
  rain: { icon: '🌧️', chance: 0.3, off: ['feedDucks', 'sitBench', 'stargaze', 'busk'], look: { grey: 0.65, sun: 0.35, falls: 'rain' } },
  snow: { icon: '❄️', chance: 0.1, off: ['feedDucks', 'smellFlowers'], look: { grey: 0.45, sun: 0.6, falls: 'snow' } }
};
export const WEATHER_IDS = Object.keys(WEATHER);
// A day's weather, at random by `chance`.
export function rollWeather(random = Math.random) {
  let r = random();
  for (const id of WEATHER_IDS) if ((r -= WEATHER[id].chance) <= 0) return id;
  return 'sun';
}
