// DEMO MODE version of the data API: same function names as
// backend-firebase.js, but data lives in this browser's localStorage.
import { approvedToPerform } from "./age.js";

const KEY = "sound-neighbors-demo-v1";
let state = load();
const gigListeners = new Set();
const authListeners = new Set();

function isoDay(offset) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

function seed() {
  const maplewood = {
    title: "Afternoon Sing-Along", time: "2:00 PM", lengthMin: 25,
    vibes: ["Nostalgic", "Sing-along"],
    audience: "About 30 residents in their 70s and 80s who love to sing along.",
    equipment: { piano: true, sound: false, outlets: true, accessible: true },
    occasion: "classics", request: "when-irish-eyes-are-smiling", requestNote: "For Mrs. Alvarez's 90th birthday",
    avoid: "Sad or slow goodbye songs"
  };
  const now = Date.now();
  const s = {
    currentUid: null,
    users: {
      maya: { name: "Maya", role: "teen", instruments: ["Vocals", "Piano"], parentApproved: true,
        canPerform: ["shine-on-harvest-moon", "let-me-call-you-sweetheart", "down-by-the-old-mill-stream",
          "take-me-out-to-the-ball-game", "when-irish-eyes-are-smiling", "my-wild-irish-rose", "daisy-bell",
          "by-the-light-of-the-silvery-moon", "in-the-good-old-summertime", "its-a-long-way-to-tipperary",
          "bye-bye-blackbird", "home-on-the-range", "auld-lang-syne", "silent-night", "jingle-bells",
          "fur-elise", "maple-leaf-rag", "danny-boy", "sweet-caroline", "lean-on-me", "happy-birthday-to-you", "white-christmas", "what-a-wonderful-world", "you-are-my-sunshine", "at-last", "over-the-rainbow", "stand-by-me", "hello-dolly", "thats-amore", "let-it-snow", "rainbow-connection", "dont-stop-believin"],
        clips: [], reflections: {} },
      jt: { name: "Jordan & Theo", role: "teen", instruments: ["Guitar", "Vocals"], parentApproved: true,
        canPerform: ["down-by-the-old-mill-stream", "take-me-out-to-the-ball-game", "daisy-bell",
          "home-on-the-range", "five-foot-two", "pack-up-your-troubles", "aint-she-sweet", "take-me-home-country-roads", "let-it-be", "stand-by-me", "sweet-caroline", "happy", "three-little-birds", "here-comes-the-sun", "count-on-me", "hound-dog", "twist-and-shout"],
        clips: [], reflections: {} },
      sam: { name: "Sam", role: "teen", instruments: ["Violin"], parentApproved: true,
        canPerform: ["canon-in-d", "home-on-the-range", "shine-on-harvest-moon", "silent-night",
          "auld-lang-syne", "my-wild-irish-rose", "beautiful-dreamer", "danny-boy", "daisy-bell", "moon-river", "over-the-rainbow", "edelweiss", "a-whole-new-world", "white-christmas", "the-christmas-song", "at-last", "amazing-grace"],
        clips: [], reflections: {} },
      riley: { name: "Riley", role: "teen", adult: true, instruments: ["Guitar", "Vocals"], parentApproved: false,
        canPerform: ["take-me-home-country-roads", "let-it-be", "sweet-caroline", "what-a-wonderful-world", "stand-by-me",
          "you-are-my-sunshine", "daisy-bell", "my-girl"], clips: [], reflections: {} },
      maplewood: { name: "Ms. Patel", role: "organizer", orgName: "Maplewood Senior Center", verified: true },
      riverbend: { name: "Mr. Okafor", role: "organizer", orgName: "Riverbend Hospital", verified: true },
      library: { name: "Ms. Chen", role: "organizer", orgName: "Hudson Valley Library", verified: true },
      oakhill: { name: "Mr. Lee", role: "organizer", orgName: "Oak Hill Memory Care", verified: true },
      sunrise: { name: "Coach Rivera", role: "organizer", orgName: "Sunrise Youth Center", verified: false }
    },
    gigs: {
      g_maple: { ...maplewood, orgId: "maplewood", orgName: "Maplewood Senior Center", date: isoDay(13), status: "open" },
      g_library: { orgId: "library", orgName: "Hudson Valley Library", title: "Family Music Hour", occasion: "kids", date: isoDay(27),
        time: "4:00 PM", lengthMin: 20, vibes: ["Upbeat"], audience: "Families with young kids, all ages.",
        equipment: { piano: false, sound: true, outlets: true, accessible: true }, request: "", requestNote: "",
        avoid: "", status: "open" },
      g_river: { orgId: "riverbend", orgName: "Riverbend Hospital", title: "Holiday Lunch in the Lobby", occasion: "winter", date: isoDay(62),
        time: "12:00 PM", lengthMin: 30, vibes: ["Seasonal", "Soothing"], audience: "Patients, families, and staff passing through.",
        equipment: { piano: true, sound: false, outlets: true, accessible: true }, request: "silent-night",
        requestNote: "The night nurses' favorite", avoid: "Loud songs", status: "open" },
      g_oak: { orgId: "oakhill", orgName: "Oak Hill Memory Care", title: "Gentle Afternoon Music", occasion: "comfort", date: isoDay(20),
        time: "3:00 PM", lengthMin: 30, vibes: ["Nostalgic", "Soothing"], audience: "Residents in memory care, many in their 80s.",
        equipment: { piano: true, sound: false, outlets: true, accessible: true }, request: "", requestNote: "",
        avoid: "", status: "filled", backups: ["sam"] },
      g_past1: { orgId: "oakhill", orgName: "Oak Hill Memory Care", title: "Summer Sing-Along", date: isoDay(-30),
        time: "3:00 PM", lengthMin: 40, vibes: ["Sing-along"], audience: "Senior residents", equipment: { piano: true },
        request: "", requestNote: "", avoid: "", status: "done" },
      g_past2: { orgId: "library", orgName: "Hudson Valley Library", title: "Story Time Songs", date: isoDay(-20),
        time: "10:00 AM", lengthMin: 20, vibes: ["Upbeat"], audience: "Families", equipment: { piano: false },
        request: "", requestNote: "", avoid: "", status: "done" },
      g_past3: { orgId: "maplewood", orgName: "Maplewood Senior Center", title: "Tea & Tunes", date: isoDay(-9),
        time: "2:00 PM", lengthMin: 25, vibes: ["Nostalgic"], audience: "Seniors at the weekly tea", equipment: { piano: true },
        request: "daisy-bell", requestNote: "", avoid: "", status: "done" },
      g_past4: { orgId: "riverbend", orgName: "Riverbend Hospital", title: "Lobby Music Hour", date: isoDay(-2),
        time: "11:00 AM", lengthMin: 30, vibes: ["Soothing"], audience: "Patients and families", equipment: { piano: true },
        request: "", requestNote: "", avoid: "", status: "filled" }
    },
    applications: {},
    sets: {
      g_past3: { gigId: "g_past3", builtBy: "maya", approved: true, totalSeconds: 1450, targetSeconds: 1500,
        items: [{ songId: "daisy-bell", title: "Daisy Bell", seconds: 155, energy: 4, moods: ["sing-along"], performerId: "maya", performerName: "Maya" }],
        acts: [], notes: [] }
    },
    hourLogs: {
      g_past1_maya: { gigId: "g_past1", teenId: "maya", orgId: "oakhill", hours: 1.5, date: isoDay(-30) },
      g_past2_maya: { gigId: "g_past2", teenId: "maya", orgId: "library", hours: 1, date: isoDay(-20) },
      g_past3_maya: { gigId: "g_past3", teenId: "maya", orgId: "maplewood", hours: 1, date: isoDay(-9) }
    }
  };
  const addApp = (gigId, teenId, extra) => {
    s.applications[`${gigId}_${teenId}`] = { gigId, teenId, teenName: s.users[teenId].name,
      role: "pending", minutes: 0, response: "", wasBackup: false, createdAt: now + Object.keys(s.applications).length, ...extra };
  };
  addApp("g_maple", "maya");
  addApp("g_maple", "jt");
  addApp("g_oak", "maya", { role: "perform", minutes: 30 });
  addApp("g_oak", "sam", { role: "backup" });
  addApp("g_past1", "maya", { role: "perform", minutes: 40 });
  addApp("g_past2", "maya", { role: "perform", minutes: 20 });
  addApp("g_past3", "maya", { role: "perform", minutes: 25 });
  addApp("g_past4", "maya", { role: "perform", minutes: 30 });
  return s;
}

function load() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY));
    if (saved && saved.users) return saved;
  } catch (e) { /* fall through to fresh demo data */ }
  return seed();
}

function save() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* storage may be blocked */ }
  const open = openGigs();
  gigListeners.forEach((cb) => cb(open));
}

const copy = (x) => (x == null ? null : JSON.parse(JSON.stringify(x)));
// Demo accounts have no email, so they count as confirmed.
const withId = (id, obj) => (obj ? { id, ...copy(obj), ...(obj.name && obj.role ? { emailVerified: true } : {}) } : null);
const me = () => state.currentUid;
function need(condition, message) { if (!condition) throw new Error(message); }

// ---------- Demo-only helpers ----------
export function demoUsers() {
  return Object.entries(state.users).map(([id, u]) => withId(id, u));
}
export function demoLogin(uid) {
  state.currentUid = uid;
  save();
  notifyAuth();
}
export function resetDemo() {
  state = seed();
  save();
  notifyAuth();
}
function notifyAuth() {
  const profile = me() ? withId(me(), state.users[me()]) : null;
  authListeners.forEach((cb) => cb(profile));
}

// ---------- Accounts ----------
export function onAuth(callback) {
  authListeners.add(callback);
  setTimeout(() => callback(me() ? withId(me(), state.users[me()]) : null), 0);
  return () => authListeners.delete(callback);
}

export async function signUp({ name, role, orgName, adult = false }) {
  const uid = "u" + Date.now();
  state.users[uid] = role === "organizer"
    ? { name, role, orgName: orgName || name, verified: false }
    : { name, role, instruments: [], canPerform: [], clips: [], reflections: {}, parentApproved: false, adult: adult === true };
  state.currentUid = uid;
  save();
  notifyAuth();
}
export async function logIn() {
  throw new Error("In demo mode, pick a demo user instead of logging in.");
}
export async function logOut() {
  state.currentUid = null;
  save();
  notifyAuth();
}
export async function getUser(uid) { return withId(uid, state.users[uid]); }
export async function updateMe(patch) {
  for (const k of ["role", "verified", "parentApproved", "adult"]) need(!(k in patch), `Can't change ${k}`);
  Object.assign(state.users[me()], copy(patch));
  save();
}

// ---------- Gigs ----------
function openGigs() {
  return Object.entries(state.gigs)
    .filter(([, g]) => g.status === "open")
    .map(([id, g]) => withId(id, g))
    .sort((a, b) => a.date.localeCompare(b.date));
}
export function watchOpenGigs(callback) {
  gigListeners.add(callback);
  setTimeout(() => callback(openGigs()), 0);
  return () => gigListeners.delete(callback);
}
export async function getGig(id) { return withId(id, state.gigs[id]); }
export async function listGigsByOrg(orgId) {
  return Object.entries(state.gigs).filter(([, g]) => g.orgId === orgId)
    .map(([id, g]) => withId(id, g)).sort((a, b) => a.date.localeCompare(b.date));
}
export async function postGig(data) {
  const u = state.users[me()];
  need(u.role === "organizer", "Only organizers can post gigs.");
  const id = "g" + Date.now();
  state.gigs[id] = { ...copy(data), orgId: me(), orgName: u.orgName, status: "open" };
  save();
  return id;
}
export async function updateGig(id, patch) {
  need(state.gigs[id].orgId === me(), "Only this gig's organizer can change it.");
  Object.assign(state.gigs[id], copy(patch));
  save();
}

// ---------- Applications ----------
export async function getApp(gigId, teenId) {
  const id = `${gigId}_${teenId}`;
  return withId(id, state.applications[id]);
}
export async function listMyApps(teenId) {
  return Object.entries(state.applications).filter(([, a]) => a.teenId === teenId).map(([id, a]) => withId(id, a));
}
export async function listAppsForGig(gigId) {
  return Object.entries(state.applications).filter(([, a]) => a.gigId === gigId)
    .map(([id, a]) => withId(id, a)).sort((a, b) => a.createdAt - b.createdAt);
}
export async function apply(gigId, teenName) {
  need(approvedToPerform(state.users[me()]), "A parent or guardian needs to approve your account first.");
  need(!state.applications[`${gigId}_${me()}`], "You already requested this gig.");
  state.applications[`${gigId}_${me()}`] = { gigId, teenId: me(), teenName, role: "pending",
    minutes: 0, response: "", wasBackup: false, createdAt: Date.now() };
  save();
}
export async function withdraw(gigId) {
  delete state.applications[`${gigId}_${me()}`];
  save();
}
export async function setAppRole(gigId, teenId, role, minutes = 0) {
  need(state.gigs[gigId].orgId === me(), "Only this gig's organizer can choose performers.");
  Object.assign(state.applications[`${gigId}_${teenId}`], { role, minutes });
  syncBackups(gigId);
  save();
}
// Backups are offered a cancelled spot oldest application first, so keep that order on the gig.
function syncBackups(gigId) {
  state.gigs[gigId].backups = Object.values(state.applications)
    .filter((a) => a.gigId === gigId && a.role === "backup")
    .sort((a, b) => a.createdAt - b.createdAt).map((a) => a.teenId);
}
export async function cancelPerformance(gigId) {
  const a = state.applications[`${gigId}_${me()}`];
  need(a && a.role === "perform" && a.response !== "cancelled", "Only a confirmed performer can cancel.");
  const gig = state.gigs[gigId];
  const next = (gig.backups || [])[0] || null;
  a.response = "cancelled";
  Object.assign(gig, { cancelledBy: me(), cancelledMinutes: a.minutes, backupTaken: false, offeredTo: next });
  if (!next) gig.status = "open";   // nobody to offer it to: back on the board
  save();
}
export async function acceptBackup(gigId) {
  const gig = state.gigs[gigId];
  const a = state.applications[`${gigId}_${me()}`];
  need(a && a.role === "backup" && gig.offeredTo === me() && !gig.backupTaken, "This spot is no longer open.");
  Object.assign(a, { role: "perform", minutes: gig.cancelledMinutes, response: "accepted", wasBackup: true });
  Object.assign(gig, { backupTaken: true, offeredTo: null });
  syncBackups(gigId);
  save();
}
// Passing never counts against reliability: the offer moves to the next backup, or the gig reopens.
export async function passBackup(gigId) {
  const gig = state.gigs[gigId];
  need(gig.offeredTo === me(), "This spot isn't offered to you.");
  state.applications[`${gigId}_${me()}`].response = "passed";
  const list = gig.backups || [];
  const next = list[list.indexOf(me()) + 1] || null;
  gig.offeredTo = next;
  if (!next) gig.status = "open";
  save();
}

// ---------- Sets ----------
export async function getSet(gigId) { return withId(gigId, state.sets[gigId]); }
export async function saveSet(gigId, set) {
  state.sets[gigId] = { ...copy(set), gigId, builtBy: me(), approved: false };
  save();
}
export async function approveSet(gigId) {
  need(state.gigs[gigId].orgId === me(), "Only the organizer can approve the set.");
  state.sets[gigId].approved = true;
  save();
}

// ---------- Hours ----------
export async function confirmGig(gigId, entries, date) {
  const gig = state.gigs[gigId];
  need(gig.orgId === me() && state.users[me()].verified, "Only this gig's organizer can confirm hours.");
  // Check everything first so a bad entry leaves no partial logs.
  for (const { teenId, hours } of entries) {
    need(!state.hourLogs[`${gigId}_${teenId}`], "Hours for this gig were already logged.");
    need(hours > 0 && hours <= 4, "Hours must be between 0.5 and 4.");
  }
  for (const { teenId, hours } of entries) {
    state.hourLogs[`${gigId}_${teenId}`] = { gigId, teenId, orgId: me(), hours, date };
  }
  gig.status = "done";
  save();
}
export async function listMyHourLogs(teenId) {
  return Object.entries(state.hourLogs).filter(([, l]) => l.teenId === teenId).map(([id, l]) => withId(id, l));
}

// For applicant cards: how many gigs a teen has played and how many times they cancelled.
export async function getTeenRecord(teenId) {
  const caller = state.users[me()];
  if (me() !== teenId && !(caller.role === "organizer" && caller.verified)) throw denied("Only verified organizers can see teen records.");
  return {
    pastGigs: Object.values(state.hourLogs).filter((l) => l.teenId === teenId).length,
    cancellations: Object.values(state.applications).filter((a) => a.teenId === teenId && a.response === "cancelled").length
  };
}

// ---------- Sample clips ----------
// Audio is kept apart from the profile so only organizers (and the owner) load it.
export async function addClip(clip) {
  const id = "c" + Date.now() + Math.floor(Math.random() * 1000);
  state.clipData = state.clipData || {};
  state.clipData[id] = { ...copy(clip), teenId: me() };
  save();
  return id;
}
export async function removeClip(id) {
  const clip = (state.clipData || {})[id];
  need(clip && clip.teenId === me(), "That clip isn't yours.");
  delete state.clipData[id];
  save();
}
function denied(message) { return Object.assign(new Error(message), { code: "permission-denied" }); }
export async function getClipSrc(teenId, id) {
  const clip = (state.clipData || {})[id];
  need(clip && clip.teenId === teenId, "Clip not found.");
  const caller = state.users[me()];
  if (me() !== teenId && !(caller.role === "organizer" && caller.verified)) throw denied("Only verified organizers can listen to clips.");
  return clip.data;
}

// ---------- Email confirmation and reports (demo versions) ----------
export async function sendVerification() { /* demo accounts have no email */ }
export async function refreshAuth() { return true; }
export async function reportGig(gig, reason) {
  state.reports = state.reports || [];
  state.reports.push({ gigId: gig.id, orgId: gig.orgId, reporterId: me(), reason: reason.trim().slice(0, 500) });
  save();
}
export function demoReports() { return copy(state.reports || []); }
