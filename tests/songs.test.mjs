// Songs teens add themselves, and occasions in the planner.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { makeCustomSong, MAX_CUSTOM_SONGS } from "../public/js/songs.js";
import { planSet } from "../public/js/planner.js";
import { EVENTS, eventLabel } from "../public/js/events.js";

const songs = JSON.parse(readFileSync(new URL("../public/data/songs.json", import.meta.url)));
const good = { title: "My Song", artist: "Me", minutes: 3, seconds: 20, energy: 3, moods: ["upbeat"], events: ["birthday"], needsPiano: false };

test("custom song: valid input becomes a planner-ready song", () => {
  const s = makeCustomSong(good, "my-1");
  assert.deepEqual([s.id, s.title, s.artist, s.seconds, s.energy, s.custom], ["my-1", "My Song", "Me", 200, 3, true]);
  assert.deepEqual(s.needs, []); assert.deepEqual(s.events, ["birthday"]);
  assert.deepEqual(makeCustomSong({ ...good, needsPiano: true }, "x").needs, ["piano"]);
});
test("custom song: bad input is refused with a friendly message", () => {
  const bad = (patch, re) => assert.throws(() => makeCustomSong({ ...good, ...patch }, "x"), re);
  bad({ title: "  " }, /title/i);
  bad({ title: "x".repeat(61) }, /60/);
  bad({ minutes: 0, seconds: 10 }, /0:30/);
  bad({ minutes: 11, seconds: 0 }, /10:00/);
  bad({ energy: 9 }, /lively/i);
  bad({ moods: [] }, /mood/i);
  bad({ moods: ["upbeat", "soothing", "nostalgic", "festive"] }, /mood/i);
  bad({ moods: ["angry"] }, /mood/i);
});
test("custom song: unknown events are dropped, duplicate moods collapse, and the cap is sane", () => {
  const s = makeCustomSong({ ...good, events: ["nope", "wedding"], moods: ["upbeat", "upbeat"] }, "x");
  assert.deepEqual(s.events, ["wedding"]); assert.deepEqual(s.moods, ["upbeat"]);
  assert.ok(MAX_CUSTOM_SONGS >= 10);
});
test("custom song titles are plain data (rendered with textContent elsewhere), never markup-parsed here", () => {
  assert.equal(makeCustomSong({ ...good, title: "<img src=x onerror=alert(1)>" }, "x").title, "<img src=x onerror=alert(1)>");
});

test("planner uses a teen's own songs alongside the library", () => {
  const own = makeCustomSong({ ...good, title: "Original Tune", minutes: 4, seconds: 0, moods: ["nostalgic", "sing-along"], energy: 2 }, "my-orig");
  const performer = { id: "p", name: "P", minutes: 10, canPerform: ["my-orig"] };
  const set = planSet({ gig: { id: "g", lengthMin: 10, vibes: ["Nostalgic"], equipment: {}, request: "", avoid: "" }, performer, songs: [...songs, own] });
  assert.deepEqual(set.items.map((i) => i.songId), ["my-orig"]);
});

test("occasion: songs that suit the gig's occasion are favored", () => {
  for (const occasion of ["birthday", "winter", "wedding", "comfort"]) {
    const gig = { id: "g", lengthMin: 20, vibes: [], equipment: { piano: true }, request: "", avoid: "", occasion };
    const performer = { id: "p", name: "P", minutes: 20, canPerform: songs.map((s) => s.id) };
    const set = planSet({ gig, performer, songs });
    const fit = set.items.filter((i) => i.events.includes(occasion)).length;
    assert.ok(fit / set.items.length >= 0.8, `${occasion}: only ${fit}/${set.items.length} songs fit`);
    assert.ok(set.notes.some((n) => n.includes(eventLabel(occasion).toLowerCase())), `${occasion}: explanation mentions the occasion`);
  }
});
test("occasion: without one, behavior is unchanged and no occasion note appears", () => {
  const gig = { id: "g", lengthMin: 20, vibes: ["Upbeat"], equipment: { piano: true }, request: "", avoid: "" };
  const set = planSet({ gig, performer: { id: "p", name: "P", minutes: 20, canPerform: songs.map((s) => s.id) }, songs });
  assert.ok(set.items.length > 0 && !set.notes.some((n) => /suit/.test(n)));
});
test("every occasion has a label", () => assert.ok(EVENTS.every((e) => e.label && e.blurb)));
