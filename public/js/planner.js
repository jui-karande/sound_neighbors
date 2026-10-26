// Sound Neighbors  set planner Agent
//
// Logic:
// 1. FILTER: keep songs the performer can play, the venue can support
//    (equipment), and that don't match the "avoid" note.
// 2. SCORE: each song gets points for matching the gig's vibes, and more for
//    fitting the gig's occasion (birthday, wedding, hospital visit, ...).
// 3. FIT: choose the set of songs that best fills the time without going
//    over. This is a 0/1 knapsack problem, solved with dynamic programming:
//    weight = song length, value = song length + bonus for vibe matches.
//    The special request is reserved first so it is always included.
// 4. ORDER: arrange the chosen songs as an energy arc: gentle opener,
//    highest energy in the middle, sing-along finale.
// 5. EXPLAIN: build a short "why this set" message from what happened.

import { eventLabel } from "./events.js";

export const INTRO_SECONDS = 90;          // talking and setup time per act
const STEP = 5;                            // knapsack resolution in seconds
const VIBE_BONUS = 45;                     // seconds of "value" per vibe match
const OCCASION_BONUS = 60;                 // seconds of "value" when a song suits the gig's occasion
const STOP_WORDS = new Set(["or", "and", "the", "a", "an", "of", "any", "no", "please",
  "avoid", "song", "songs", "music", "about", "that", "are", "with", "too", "very"]);

export function formatTime(totalSeconds) {
  const s = Math.max(0, Math.round(totalSeconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

// Small seeded random generator so "Rebuild" gives a different but repeatable set.
function seededRandom(seed) {
  let t = (seed * 2654435761) >>> 0;
  return () => {
    t = (t + 0x6D2B79F5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function avoidWords(avoidText) {
  return (avoidText || "")
    .toLowerCase()
    .split(/[^a-z-]+/)
    .filter((w) => w.length >= 3 && !STOP_WORDS.has(w));
}

function matchesAvoid(song, words) {
  const title = song.title.toLowerCase();
  return words.some((w) =>
    song.moods.includes(w) ||
    title.includes(w) ||
    (w === "slow" && song.energy <= 1)
  );
}

function venueSupports(song, equipment = {}) {
  return (song.needs || []).every((need) => equipment[need] === true);
}

function occasionMatch(song, occasion) {
  return Boolean(occasion) && (song.events || []).includes(occasion);
}

function vibeMatches(song, vibes = []) {
  const wanted = vibes.map((v) => v.toLowerCase());
  return song.moods.filter((m) => wanted.includes(m)).length;
}

// Which songs can this performer use at this gig? Also says why others were skipped.
export function eligibleSongs({ gig, canPerform, songs, exclude = new Set() }) {
  const words = avoidWords(gig.avoid);
  const known = new Set(canPerform || []);
  const skipped = { equipment: 0, avoid: 0 };
  const eligible = [];
  for (const song of songs) {
    if (!known.has(song.id) || exclude.has(song.id)) continue;
    if (!venueSupports(song, gig.equipment)) { skipped.equipment++; continue; }
    if (matchesAvoid(song, words)) { skipped.avoid++; continue; }
    eligible.push(song);
  }
  return { eligible, skipped };
}

// 0/1 knapsack: pick songs whose total length fits in `budget` seconds,
// maximizing length + vibe bonus.
function fitSongs(candidates, budget, gig, random) {
  const capacity = Math.floor(budget / STEP);
  if (capacity <= 0 || candidates.length === 0) return [];
  const items = candidates.map((song) => ({
    song,
    weight: Math.ceil(song.seconds / STEP),
    value: song.seconds + VIBE_BONUS * vibeMatches(song, gig.vibes) + (occasionMatch(song, gig.occasion) ? OCCASION_BONUS : 0) + random() * 30
  }));
  // best[c] = best value using capacity c; keep[i][c] = was item i used
  const best = new Array(capacity + 1).fill(0);
  const keep = items.map(() => new Uint8Array(capacity + 1));
  items.forEach((item, i) => {
    for (let c = capacity; c >= item.weight; c--) {
      const withItem = best[c - item.weight] + item.value;
      if (withItem > best[c]) { best[c] = withItem; keep[i][c] = 1; }
    }
  });
  // Walk back through the table to find which songs were picked
  const chosen = [];
  let c = capacity;
  for (let i = items.length - 1; i >= 0; i--) {
    if (keep[i][c]) { chosen.push(items[i].song); c -= items[i].weight; }
  }
  return chosen;
}

// Arrange songs: gentle start, peak in the middle, sing-along finale,
// and the special request placed in the middle third.
export function orderByEnergyArc(chosen, { requestId = null, useFinale = true } = {}) {
  if (chosen.length <= 1) return [...chosen];
  let rest = [...chosen];
  let finale = null;
  if (useFinale) {
    const singAlongs = rest
      .filter((s) => s.moods.includes("sing-along") && (s.id !== requestId || rest.length <= 2))
      .sort((a, b) => b.energy - a.energy);
    if (singAlongs.length) {
      finale = singAlongs[0];
      rest = rest.filter((s) => s !== finale);
    }
  }
  // The request is placed separately (middle third), so it must not take part in the energy sort:
  // otherwise a calm request would use up the opener slot and a lively song would start the set.
  const request = rest.find((s) => s.id === requestId) || null;
  const ascending = rest.filter((s) => s !== request).sort((a, b) => a.energy - b.energy || a.seconds - b.seconds);
  const left = ascending.filter((_, i) => i % 2 === 0);
  const right = ascending.filter((_, i) => i % 2 === 1).reverse();
  let arc = [...left, ...right];
  if (request) {
    const total = arc.length + 1 + (finale ? 1 : 0);
    arc.splice(Math.floor(total / 2) - (finale && total % 2 === 0 ? 1 : 0), 0, request);
  }
  return finale ? [...arc, finale] : arc;
}

// Plan one performer's songs. Returns the songs plus timing and notes.
export function planPerformer({ gig, performer, songs, exclude = new Set(),
  reserveSeconds = 0, includeRequest = true, useFinale = true, seed = 0 }) {
  const random = seed ? seededRandom(seed) : () => 0;
  const target = Math.round(performer.minutes * 60);
  const budget = target - INTRO_SECONDS - reserveSeconds;
  const { eligible, skipped } = eligibleSongs({
    gig, canPerform: performer.canPerform, songs, exclude
  });

  let request = null;
  if (includeRequest && gig.request) {
    request = eligible.find((s) => s.id === gig.request && s.seconds <= budget) || null;
  }
  const others = eligible.filter((s) => s !== request);
  const fitted = fitSongs(others, budget - (request ? request.seconds : 0), gig, random);
  const chosen = request ? [request, ...fitted] : fitted;
  const ordered = orderByEnergyArc(chosen, { requestId: request ? request.id : null, useFinale });

  const songSeconds = ordered.reduce((sum, s) => sum + s.seconds, 0);
  return {
    performerId: performer.id,
    performerName: performer.name,
    songs: ordered,
    songSeconds,
    introSeconds: INTRO_SECONDS,
    usedSeconds: songSeconds + INTRO_SECONDS,
    targetSeconds: target,
    eligibleCount: eligible.length,
    usedAllEligible: ordered.length === eligible.length,
    requestIncluded: Boolean(request),
    skipped
  };
}

function toSetItems(plan) {
  return plan.songs.map((s) => ({
    songId: s.id, title: s.title, seconds: s.seconds, energy: s.energy,
    moods: s.moods, events: s.events || [], performerId: plan.performerId, performerName: plan.performerName
  }));
}

function explain({ gig, songs, items, plans, totalSeconds, targetSeconds, requestOwner }) {
  const notes = [];
  notes.push(`Fits ${formatTime(totalSeconds)} of ${formatTime(targetSeconds)}, including ${formatTime(INTRO_SECONDS)} of intros per act.`);
  const vibeHits = items.filter((it) => vibeMatches(it, gig.vibes) > 0).length;
  if (gig.vibes && gig.vibes.length && items.length) {
    notes.push(`${vibeHits} of ${items.length} songs match ${gig.vibes.join(" or ")}.`);
  }
  if (gig.occasion && items.length) {
    const fits = items.filter((it) => (it.events || []).includes(gig.occasion)).length;
    notes.push(`${fits} of ${items.length} songs suit ${eventLabel(gig.occasion).toLowerCase()}.`);
  }
  const equipSkipped = plans.reduce((n, p) => n + p.skipped.equipment, 0);
  if (equipSkipped) notes.push(`Skipped ${equipSkipped} song(s) that need equipment the venue doesn't have.`);
  const avoidSkipped = plans.reduce((n, p) => n + p.skipped.avoid, 0);
  if (avoidSkipped) notes.push(`Left out ${avoidSkipped} song(s) that match "${gig.avoid}".`);
  if (gig.request) {
    const reqSong = songs.find((s) => s.id === gig.request);
    const title = reqSong ? reqSong.title : "the special request";
    if (items.some((it) => it.songId === gig.request)) {
      notes.push(requestOwner
        ? `The request "${title}" goes to ${requestOwner}.`
        : `Includes the request "${title}" in the middle of the set.`);
    } else {
      notes.push(`Couldn't include the request "${title}": it isn't on the performer's song list or doesn't fit.`);
    }
  }
  const last = items[items.length - 1];
  if (last && last.moods.includes("sing-along")) notes.push(`Ends on a sing-along: "${last.title}".`);
  if (items.length === 0) {
    notes.push("No songs could be planned. Add songs you can perform to your profile.");
  } else if (plans.some((p) => p.usedAllEligible && p.targetSeconds - p.usedSeconds > 60)) {
    notes.push("Add more songs to your list to fill the time.");
  }
  return notes;
}

// One performer gets the whole gig.
export function planSet({ gig, performer, songs, seed = 0 }) {
  const plan = planPerformer({ gig, performer, songs, seed });
  const items = toSetItems(plan);
  const totalSeconds = plan.usedSeconds;
  return {
    gigId: gig.id || null,
    items,
    totalSeconds,
    targetSeconds: plan.targetSeconds,
    acts: [{ performerId: plan.performerId, performerName: plan.performerName,
      usedSeconds: plan.usedSeconds, targetSeconds: plan.targetSeconds }],
    requestIncluded: plan.requestIncluded,
    notes: explain({ gig, songs, items, plans: [plan], totalSeconds, targetSeconds: plan.targetSeconds })
  };
}

// Two performers split the time. No song is used twice; the request goes to
// an act that knows it; a sing-along both know can close the set together.
export function planShared({ gig, performers, songs, seed = 0 }) {
  if (performers.length === 1) return planSet({ gig, performer: performers[0], songs, seed });
  const [p1, p2] = performers;
  const knows = (p, id) => (p.canPerform || []).includes(id);

  // Who gets the request: an act that knows it; if both do, the one with more time.
  let requestOwner = null;
  if (gig.request) {
    const owners = performers.filter((p) => knows(p, gig.request));
    if (owners.length) requestOwner = owners.sort((a, b) => b.minutes - a.minutes)[0];
  }
  const first = requestOwner || [...performers].sort((a, b) => b.minutes - a.minutes)[0];
  const second = first === p1 ? p2 : p1;

  // Shared finale: a sing-along both know, counted against the act with more time.
  const shared = eligibleSongs({ gig, canPerform: p1.canPerform, songs }).eligible
    .filter((s) => knows(p2, s.id) && s.moods.includes("sing-along") && s.id !== gig.request)
    .sort((a, b) => b.energy - a.energy);
  const finale = shared[0] || null;
  const finaleOwner = finale ? [...performers].sort((a, b) => b.minutes - a.minutes)[0] : null;
  const exclude = new Set(finale ? [finale.id] : []);

  const planA = planPerformer({ gig, performer: first, songs, exclude, seed,
    reserveSeconds: finale && finaleOwner === first ? finale.seconds : 0,
    includeRequest: first === requestOwner, useFinale: false });
  planA.songs.forEach((s) => exclude.add(s.id));
  const planB = planPerformer({ gig, performer: second, songs, exclude, seed: seed ? seed + 1 : 0,
    reserveSeconds: finale && finaleOwner === second ? finale.seconds : 0,
    includeRequest: false, useFinale: false });

  const items = [...toSetItems(planA), ...toSetItems(planB)];
  if (finale) {
    items.push({ songId: finale.id, title: finale.title, seconds: finale.seconds,
      energy: finale.energy, moods: finale.moods, events: finale.events || [], performerId: "together",
      performerName: "Together", countedFor: finaleOwner.id });
  }
  const actUsed = (plan) => plan.usedSeconds + (finale && finaleOwner.id === plan.performerId ? finale.seconds : 0);
  const acts = [planA, planB].map((p) => ({ performerId: p.performerId, performerName: p.performerName,
    usedSeconds: actUsed(p), targetSeconds: p.targetSeconds }));
  const totalSeconds = acts.reduce((n, a) => n + a.usedSeconds, 0);
  const targetSeconds = Math.round(gig.lengthMin * 60);
  const notes = explain({ gig, songs, items, plans: [planA, planB], totalSeconds, targetSeconds,
    requestOwner: requestOwner ? requestOwner.name : null });
  notes.push("No song appears twice, and each act only plays songs from its own list.");
  if (finale) notes.push(`Both acts know "${finale.title}", so they close it together.`);
  return { gigId: gig.id || null, items, totalSeconds, targetSeconds, acts,
    requestIncluded: items.some((it) => it.songId === gig.request), notes };
}
