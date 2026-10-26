// Run with: node tests/planner.test.mjs
import { readFileSync } from "node:fs";
import { planSet, planShared, formatTime, INTRO_SECONDS } from "../public/js/planner.js";

const songs = JSON.parse(readFileSync(new URL("../public/data/songs.json", import.meta.url)));
const byId = Object.fromEntries(songs.map((s) => [s.id, s]));
const allIds = songs.map((s) => s.id);
const vocalIds = songs.filter((s) => !s.title.includes("instrumental")).map((s) => s.id);

let failures = 0;
function check(name, condition, detail = "") {
  console.log(`${condition ? "PASS" : "FAIL"}  ${name}${detail ? "  (" + detail + ")" : ""}`);
  if (!condition) failures++;
}
const inMiddleThird = (index, n) => index >= Math.floor(n / 3) && index < Math.ceil((2 * n) / 3);
const noRepeats = (items) => new Set(items.map((i) => i.songId)).size === items.length;

const baseGig = {
  id: "g1", lengthMin: 25, vibes: ["Nostalgic", "Sing-along"],
  equipment: { piano: true, sound: false }, request: "daisy-bell", avoid: ""
};
const maya = { id: "maya", name: "Maya", canPerform: allIds, minutes: 25 };

// T1
{
  const set = planSet({ gig: baseGig, performer: maya, songs });
  const idx = set.items.findIndex((i) => i.songId === "daisy-bell");
  const last = set.items[set.items.length - 1];
  check("T1 total within 25:00", set.totalSeconds <= 1500, formatTime(set.totalSeconds));
  check("T1 close to target (≤ 4 min unused)", 1500 - set.totalSeconds <= 240);
  check("T1 request in middle third", idx >= 0 && inMiddleThird(idx, set.items.length), `index ${idx} of ${set.items.length}`);
  check("T1 ends on sing-along", last.moods.includes("sing-along"), last.title);
  check("T1 opener energy ≤ 3", set.items[0].energy <= 3, set.items[0].title);
  check("T1 no repeats", noRepeats(set.items));
  console.log("     " + set.items.map((i) => `${i.title} [${i.energy}]`).join(" → "));
  console.log("     " + set.notes.join(" "));
}
// T2
{
  const gig = { ...baseGig, equipment: { piano: false } };
  const set = planSet({ gig, performer: maya, songs });
  check("T2 no piano songs without a piano", set.items.every((i) => !(byId[i.songId].needs || []).includes("piano")));
}
// T3
{
  const performer = { ...maya, canPerform: allIds.filter((id) => id !== "daisy-bell") };
  const set = planSet({ gig: baseGig, performer, songs });
  check("T3 set still builds", set.items.length > 0);
  check("T3 explains missing request", set.notes.some((n) => n.startsWith("Couldn't include the request")));
}
// T4
{
  const performer = { id: "p", name: "P", canPerform: ["take-me-out-to-the-ball-game", "aint-she-sweet"], minutes: 10 };
  const set = planSet({ gig: { ...baseGig, lengthMin: 10, request: "" }, performer, songs });
  check("T4 uses what fits", set.items.length === 2 && set.totalSeconds <= 600, formatTime(set.totalSeconds));
  check("T4 suggests adding songs", set.notes.some((n) => n.includes("Add more songs")));
}
// T5
{
  const set = planSet({ gig: baseGig, performer: { ...maya, canPerform: [] }, songs });
  check("T5 empty list, no crash", set.items.length === 0 && set.notes.some((n) => n.includes("Add songs")));
}
// T6
{
  const gig = { ...baseGig, avoid: "Sad or slow goodbye songs" };
  const set = planSet({ gig, performer: maya, songs });
  check("T6 no sad songs", set.items.every((i) => !i.moods.includes("sad")));
  check("T6 no very slow songs", set.items.every((i) => i.energy > 1));
}
// Rebuild gives a different valid set
{
  const a = planSet({ gig: baseGig, performer: maya, songs, seed: 1 });
  const b = planSet({ gig: baseGig, performer: maya, songs, seed: 2 });
  check("Rebuild varies the set", a.items.map((i) => i.songId).join() !== b.items.map((i) => i.songId).join());
  check("Rebuild still fits", a.totalSeconds <= 1500 && b.totalSeconds <= 1500);
}
// Shared set
{
  const mayaShare = { id: "maya", name: "Maya", canPerform: vocalIds, minutes: 15 };
  const duo = { id: "jt", name: "Jordan & Theo",
    canPerform: ["down-by-the-old-mill-stream", "take-me-out-to-the-ball-game", "daisy-bell",
      "home-on-the-range", "five-foot-two"], minutes: 10 };
  const gig = { ...baseGig, request: "when-irish-eyes-are-smiling" };
  const set = planShared({ gig, performers: [mayaShare, duo], songs });
  const actOk = set.acts.every((a) => a.usedSeconds <= a.targetSeconds);
  check("Shared set each act within its minutes", actOk, set.acts.map((a) => `${a.performerName} ${formatTime(a.usedSeconds)}/${formatTime(a.targetSeconds)}`).join(", "));
  check("Shared set no repeats across acts", noRepeats(set.items));
  check("Shared set each act plays its own songs", set.items.every((i) =>
    i.performerId === "together" || [mayaShare, duo].find((p) => p.id === i.performerId).canPerform.includes(i.songId)));
  const req = set.items.find((i) => i.songId === gig.request);
  check("request goes to the act that knows it", req && req.performerId === "maya");
  const fin = set.items[set.items.length - 1];
  check("F8 together finale both know", fin.performerId === "together"
    && mayaShare.canPerform.includes(fin.songId) && duo.canPerform.includes(fin.songId), fin.title);
  check("F8 total within gig", set.totalSeconds <= 1500, formatTime(set.totalSeconds));
  console.log("     " + set.items.map((i) => `${i.performerName}: ${i.title}`).join(" | "));
}

console.log(failures ? `\n${failures} check(s) failed` : "\nAll checks passed");
process.exit(failures ? 1 : 0);
