// Likes and dislikes (round 16, the roadmap's 1.6): each Sim's favourite food, colour and thing to do, and one thing
// they'd rather not. Data only. Life (life.mjs) reads it: free will is keener on their favourite thing to do and less
// on the one they dislike; talking about favourite things goes better when two share one; a present goes better from
// someone who knows them (friends: it is their favourite). Words: strings.mjs `like.<kind>.<id>`.
//
// `activity` and `dislike` are offer ids (actions.mjs): `KEEN` and `NOT_KEEN` are how much free will cares.
export const LIKES = {
  food: ['pizza', 'pasta', 'curry', 'pancakes', 'soup', 'tacos', 'sushi', 'strawberries', 'chips', 'cake'],
  colour: ['red', 'blue', 'green', 'yellow', 'purple', 'pink', 'orange', 'teal'],
  activity: ['tv', 'read', 'dance', 'feedDucks', 'stargaze', 'cook', 'phone', 'smellFlowers', 'bath', 'study'],
  dislike: ['washUp', 'tv', 'dance', 'read', 'study', 'stretch', 'cook', 'phone']
};
export const KEEN = 1.5;
export const NOT_KEEN = 0.6;
// What a gift does (social.mjs `gift`): from a friend who knows their favourites (`knows`: friendship at least), it is
// one of them, and the friendship grows by `extra` more.
export const GIFT = { knows: 25, extra: 12 };
// Talking about favourite things (social.mjs `talkLikes`), when they share one: the friendship grows by `extra` more.
export const SHARED = { extra: 10 };

// A Sim's likes, at random (`random`: the dice), the dislike never their favourite thing to do.
export function rollLikes(random = Math.random) {
  const pick = (list) => list[Math.floor(random() * list.length)];
  const activity = pick(LIKES.activity);
  return { food: pick(LIKES.food), colour: pick(LIKES.colour), activity, dislike: pick(LIKES.dislike.filter((d) => d !== activity)) };
}
// Only real ones (a save): null when anything is missing.
export const cleanLikes = (l) => (l && LIKES.food.includes(l.food) && LIKES.colour.includes(l.colour) && LIKES.activity.includes(l.activity) && LIKES.dislike.includes(l.dislike) ? { ...l } : null);
// How keen free will is on an offer.
export const keenOn = (likes, offerId) => (!likes ? 1 : likes.activity === offerId ? KEEN : likes.dislike === offerId ? NOT_KEEN : 1);
// What two Sims both love: [{ kind, id }].
export function shared(a, b) {
  if (!a || !b) return [];
  return ['food', 'colour', 'activity'].filter((k) => a[k] === b[k]).map((k) => ({ kind: k, id: a[k] }));
}
