// Randomized checks of the planner rules across many gigs, seeds and song lists.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { planSet, planShared, INTRO_SECONDS } from "../public/js/planner.js";

const songs = JSON.parse(readFileSync(new URL("../public/data/songs.json", import.meta.url)));
const byId = Object.fromEntries(songs.map((s) => [s.id, s]));
const VIBES = ["Nostalgic", "Sing-along", "Upbeat", "Soothing", "Festive", "Seasonal"];

// Small deterministic generator so failures can be reproduced.
function rng(seed) {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6D2B79F5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}
const pick = (r, arr) => arr[Math.floor(r() * arr.length)];
const sample = (r, arr, n) => [...arr].sort(() => r() - 0.5).slice(0, n);

function randomCase(i) {
  const r = rng(i + 1);
  const lengthMin = 10 + 5 * Math.floor(r() * 11); // 10..60
  const canPerform = sample(r, songs.map((s) => s.id), 4 + Math.floor(r() * (songs.length - 3)));
  const gig = {
    id: `g${i}`, lengthMin,
    vibes: sample(r, VIBES, 1 + Math.floor(r() * 2)),
    equipment: { piano: r() < 0.5, sound: r() < 0.5 },
    request: r() < 0.7 ? pick(r, songs).id : "",
    avoid: pick(r, ["", "", "sad", "loud songs", "Sad or slow goodbye songs", "christmas"])
  };
  return { gig, performer: { id: "p", name: "P", canPerform, minutes: lengthMin }, seed: Math.floor(r() * 5) };
}

const CASES = 300;

test(`Rules hold across ${CASES} random gigs`, () => {
  for (let i = 0; i < CASES; i++) {
    const { gig, performer, seed } = randomCase(i);
    const set = planSet({ gig, performer, songs, seed });
    const ctx = `case ${i} ${JSON.stringify({ gig, seed, n: performer.canPerform.length })}`;
    const ids = set.items.map((it) => it.songId);

    assert.ok(set.totalSeconds <= performer.minutes * 60, `rule 2 over time: ${ctx}`);
    assert.equal(set.totalSeconds, set.items.reduce((n, it) => n + it.seconds, 0) + INTRO_SECONDS, `total math: ${ctx}`);
    assert.ok(ids.every((id) => performer.canPerform.includes(id)), `rule 1: ${ctx}`);
    assert.equal(new Set(ids).size, ids.length, `rule 9 repeats: ${ctx}`);
    assert.ok(ids.every((id) => (byId[id].needs || []).every((n) => gig.equipment[n])), `rule 4 equipment: ${ctx}`);
    if (/sad/i.test(gig.avoid)) assert.ok(set.items.every((it) => !it.moods.includes("sad")), `rule 5 avoid: ${ctx}`);

    if (set.items.length === 0) continue;
    const n = set.items.length;
    // rule 8: gentle start, sing-along finale when the set has one
    // (unless every other song is louder: the request sits mid-set, so it can't be the opener)
    const openerPool = set.items.slice(0, -1).filter((it) => it.songId !== gig.request);
    if (openerPool.length === 0 || openerPool.some((it) => it.energy <= 3)) {
      assert.ok(set.items[0].energy <= 3 || set.items.length === 1, `rule 8 opener: ${ctx}`);
    }
    // (the request stays mid-set, so it can't double as the finale unless the set is tiny)
    const hasSing = set.items.some((it) => it.moods.includes("sing-along") && (it.songId !== gig.request || n <= 2));
    if (hasSing && set.items.length > 1) {
      assert.ok(set.items.at(-1).moods.includes("sing-along"), `rule 8 finale: ${ctx}`);
    }
    // rule 6: a request on the list (and fitting) is included, in the middle third
    const idx = ids.indexOf(gig.request);
    if (idx >= 0 && n >= 3) {
      assert.ok(idx >= Math.floor(n / 3) && idx < Math.ceil((2 * n) / 3), `rule 6 middle third (idx ${idx}/${n}): ${ctx}`);
    }
    const reqSong = byId[gig.request];
    const reqEligible = reqSong && performer.canPerform.includes(gig.request)
      && (reqSong.needs || []).every((x) => gig.equipment[x])
      && !(/sad/i.test(gig.avoid) && reqSong.moods.includes("sad"))
      && reqSong.seconds <= performer.minutes * 60 - INTRO_SECONDS;
    if (reqEligible && !/loud|christmas|slow/i.test(gig.avoid)) {
      assert.ok(idx >= 0, `rule 6 request missing: ${ctx}`);
    }
  }
});

test("rule 3: leaves under 4 minutes unused when the library allows", () => {
  let checked = 0;
  for (let i = 0; i < CASES; i++) {
    const { gig, performer, seed } = randomCase(i);
    const set = planSet({ gig, performer, songs, seed });
    if (set.notes.some((nt) => nt.includes("Add more songs")) || set.items.length === 0) continue;
    checked++;
    assert.ok(performer.minutes * 60 - set.totalSeconds <= 240,
      `case ${i}: unused ${performer.minutes * 60 - set.totalSeconds}s of ${performer.minutes * 60}s`);
  }
  assert.ok(checked > 100);
});

test(" energy arc: the highest-energy song is in the middle third", () => {
  for (let i = 0; i < CASES; i++) {
    const { gig, performer, seed } = randomCase(i);
    const items = planSet({ gig, performer, songs, seed }).items;
    if (items.length < 5) continue;
    const body = items.at(-1).moods.includes("sing-along") ? items.slice(0, -1) : items;
    const peak = Math.max(...body.map((it) => it.energy));
    const n = items.length;
    const inMiddle = body.some((it, k) => it.energy === peak && k >= Math.floor(n / 3) && k < Math.ceil((2 * n) / 3));
    assert.ok(inMiddle, `case ${i}: peak ${peak} not in middle: ${items.map((x) => x.energy).join(",")}`);
  }
});

test("'Rebuild' is deterministic per seed", () => {
  const { gig, performer } = randomCase(7);
  const a = planSet({ gig, performer, songs, seed: 3 }).items.map((i) => i.songId);
  const b = planSet({ gig, performer, songs, seed: 3 }).items.map((i) => i.songId);
  assert.deepEqual(a, b);
});

test(`two-act rules hold across ${CASES} random gigs`, () => {
  for (let i = 0; i < CASES; i++) {
    const r = rng(1000 + i);
    const lengthMin = 15 + 5 * Math.floor(r() * 10);
    const m1 = 5 * (1 + Math.floor(r() * ((lengthMin - 10) / 5 + 1)));
    const ids = songs.map((s) => s.id);
    const p1 = { id: "a", name: "A", minutes: m1, canPerform: sample(r, ids, 6 + Math.floor(r() * 20)) };
    const p2 = { id: "b", name: "B", minutes: lengthMin - m1, canPerform: sample(r, ids, 6 + Math.floor(r() * 20)) };
    const gig = { id: "g", lengthMin, vibes: sample(r, VIBES, 2), equipment: { piano: r() < 0.5 },
      request: r() < 0.7 ? pick(r, songs).id : "", avoid: "" };
    const set = planShared({ gig, performers: [p1, p2], songs, seed: Math.floor(r() * 3) });
    const ctx = `case ${i} ${JSON.stringify({ lengthMin, m1, request: gig.request, a: p1.canPerform.length, b: p2.canPerform.length })}`;

    for (const a of set.acts) assert.ok(a.usedSeconds <= a.targetSeconds, `act over its minutes (${a.performerName} ${a.usedSeconds}>${a.targetSeconds}): ${ctx}`);
    assert.ok(set.totalSeconds <= lengthMin * 60, `total over gig: ${ctx}`);
    const sids = set.items.map((it) => it.songId);
    assert.equal(new Set(sids).size, sids.length, `repeat across acts: ${ctx}`);
    for (const it of set.items) {
      if (it.performerId === "together") {
        assert.ok(p1.canPerform.includes(it.songId) && p2.canPerform.includes(it.songId), `finale not known by both: ${ctx}`);
      } else {
        const p = it.performerId === "a" ? p1 : p2;
        assert.ok(p.canPerform.includes(it.songId), `song not on performer list: ${ctx}`);
      }
    }
    if (gig.request) {
      const item = set.items.find((it) => it.songId === gig.request);
      if (item && item.performerId !== "together") {
        const owners = [p1, p2].filter((p) => p.canPerform.includes(gig.request));
        assert.ok(owners.some((p) => p.id === item.performerId), `request given to act that doesn't know it: ${ctx}`);
      }
    }
  }
});
