// Who looks after the baby while every grown-up is out (round 13). The brief, 2026-10-31: "if both members of the
// household are at work… the baby is never left alone, but they'll have to contract a nanny or something and pay her,
// or if on a budget send the baby to a collective nursery… baby hungry and alone in the house is pretty scary".
//
// So a baby is never home alone. The household chooses once (a card the first time the last grown-up would go out of
// the door; changed any time from the baby's row in the panel), and the choice is remembered and saved:
//   nanny    comes to the flat as the last one leaves and looks after the babies there (you can watch her: she is a
//            person with free will for the cot only), paid by the hour when she goes. Any time of day or night.
//   nursery  the babies go with the last one out and come home with the first one back: cheaper, a flat price a day,
//            but only open in the day (`opens`–`closes`), so an evening out needs a nanny or someone at home.
// When the choice can't help right now (none made yet, the nursery shut), the one leaving is asked again, and can
// stay at home instead: a day off work costs that day's pay and nothing else. No debt: short of coins, the carer is
// paid what the purse holds.
export const CHILDCARE = {
  nanny: { icon: '👩‍🍼', perHour: 6 },
  nursery: { icon: '🏫', perDay: 15, opens: 7 * 60 + 30, closes: 18 * 60 + 30 }
};
// At the nursery the babies are fed, cuddled and put down for a nap: home again, every need at least this.
export const NURSERY_CARED = 75;

export const nurseryOpen = (minutes) => {
  const m = minutes % 1440, n = CHILDCARE.nursery;
  return m >= n.opens && m < n.closes;
};
// What can look after the babies now, by the household's choice: 'nanny', 'nursery', or null (ask).
export const careNow = (choice, minutes) => (choice === 'nanny' ? 'nanny' : choice === 'nursery' && nurseryOpen(minutes) ? 'nursery' : null);
// What a stint of care costs: the nanny by the hour begun (the first hour whole), the nursery its day.
export const careCost = (kind, from, to) => (kind === 'nanny' ? CHILDCARE.nanny.perHour * Math.max(1, Math.ceil((to - from) / 60)) : CHILDCARE.nursery.perDay);
