// Occasions a gig can be for. Songs are tagged with the occasions they suit, the
// "Post a gig" form lets organizers pick one, and the set planner favors songs that match.
export const EVENTS = [
  { id: "birthday", label: "Birthdays", blurb: "Happy, sing-along party songs" },
  { id: "winter", label: "Winter holidays", blurb: "Christmas, Hanukkah and winter favorites" },
  { id: "holiday", label: "Other holidays", blurb: "Halloween, Easter, Thanksgiving" },
  { id: "patriotic", label: "Patriotic days", blurb: "Fourth of July, Memorial Day, Veterans Day" },
  { id: "kids", label: "Kids & families", blurb: "Movie songs and playground favorites" },
  { id: "wedding", label: "Weddings & anniversaries", blurb: "Love songs everyone knows" },
  { id: "classics", label: "Golden oldies", blurb: "Hits from the 40s through the 70s, loved at senior centers" },
  { id: "comfort", label: "Comfort & get well", blurb: "Gentle, hopeful songs for hospitals and care homes" },
  { id: "celebration", label: "Celebrations & graduations", blurb: "Upbeat songs for big moments" }
];

export const eventLabel = (id) => (EVENTS.find((e) => e.id === id) || {}).label || "";
