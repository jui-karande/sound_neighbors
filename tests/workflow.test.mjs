// End-to-end checks against the demo backend 

import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";

const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k)
};
const api = await import("../public/js/backend-local.js");
const active = (apps) => apps.filter((a) => a.role === "perform" && a.response !== "cancelled");

const iso = (offset) => {
  const d = new Date(); d.setDate(d.getDate() + offset);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};
const rejects = (fn, re) => assert.rejects(fn, re);
const login = (uid) => api.demoLogin(uid);
const gigData = (o = {}) => ({ title: "T", date: iso(10), time: "2:00 PM", lengthMin: 30, vibes: ["Upbeat"],
  audience: "", equipment: { piano: true }, request: "", requestNote: "", avoid: "", ...o });

beforeEach(() => api.resetDemo());

test("F1 sign up creates an unapproved teen and an organizer with verified: false", async () => {
  await api.signUp({ name: "Newt", role: "teen" });
  const teen = (await new Promise((res) => api.onAuth(res)));
  assert.equal(teen.role, "teen"); assert.equal(teen.parentApproved, false);
  await api.logOut();
  await api.signUp({ name: "Org", role: "organizer", orgName: "Test Hall" });
  const org = await new Promise((res) => api.onAuth(res));
  assert.equal(org.orgName, "Test Hall");
  assert.equal(org.verified, false, "organizers start unverified");
});

test("F1 log out clears the session", async () => {
  login("maya");
  await api.logOut();
  assert.equal(await new Promise((res) => api.onAuth(res)), null);
});

test("organizers: anyone signed up as an organizer can post gigs right away, admin-verified or not", async () => {
  login("sunrise");   // not admin-verified
  assert.ok(await api.postGig(gigData()));
  login("maplewood");
  assert.ok(await api.postGig(gigData()));
  login("maya");
  await rejects(() => api.postGig(gigData()), /organizers/i);
});
test("organizers: an unverified organizer can't confirm hours, listen to clips, or see teen records", async () => {
  login("maya");
  const id = await api.addClip({ title: "Daisy", seconds: 20, mime: "audio/mpeg", data: "data:audio/mpeg;base64,AAAA" });
  login("sunrise");
  await rejects(() => api.getClipSrc("maya", id), /verified/i);
  await rejects(() => api.getTeenRecord("maya"), /verified/i);
  await rejects(() => api.confirmGig("g_past4", [{ teenId: "maya", hours: 1 }], iso(-2)));
  login("maplewood");
  assert.ok(await api.getClipSrc("maya", id));
  assert.equal((await api.getTeenRecord("maya")).pastGigs, 3);
});
test("reports: a signed-in user can report a gig, and the report keeps who, which gig and why", async () => {
  login("maya");
  await api.reportGig({ id: "g_library", orgId: "library" }, "  Looks fake  ");
  assert.deepEqual(api.demoReports(), [{ gigId: "g_library", orgId: "library", reporterId: "maya", reason: "Looks fake" }]);
  await api.reportGig({ id: "g_library", orgId: "library" }, "x".repeat(900));
  assert.equal(api.demoReports()[1].reason.length, 500);
});
test("F2/DoD profile edits can't change role, verified, parentApproved", async () => {
  login("maya");
  for (const k of ["role", "verified", "parentApproved"]) await rejects(() => api.updateMe({ [k]: "x" }));
  await api.updateMe({ instruments: ["Flute"] });
});

test("F2 teens without parent approval can't apply", async () => {
  await api.signUp({ name: "Newt", role: "teen" });
  await rejects(() => api.apply("g_library", "Newt"), /parent/i);
});

test("F3 posted gig is open and listed under the organizer with applicant counts", async () => {
  login("library");
  const id = await api.postGig(gigData({ vibes: ["Upbeat", "Festive"] }));
  const gig = await api.getGig(id);
  assert.equal(gig.status, "open"); assert.equal(gig.orgId, "library");
  assert.ok((await api.listGigsByOrg("library")).some((g) => g.id === id));
  login("maya"); await api.apply(id, "Maya");
  login("library");
  assert.equal((await api.listAppsForGig(id)).length, 1);
});

test("F4 open gigs are sorted by date, only open, and update live", async () => {
  login("maya");
  const seen = [];
  const off = api.watchOpenGigs((g) => seen.push(g));
  await new Promise((r) => setTimeout(r, 5));
  const first = seen.at(-1);
  assert.ok(first.length > 0 && first.every((g) => g.status === "open"));
  assert.deepEqual(first.map((g) => g.date), [...first.map((g) => g.date)].sort());
  login("library");
  const id = await api.postGig(gigData({ date: iso(1) }));
  assert.equal(seen.at(-1)[0].id, id, "new gig appears live, sorted first");
  off();
});

test("F5 apply creates a pending request, withdraw removes it, can't double-apply by UI state", async () => {
  login("sam");
  await api.apply("g_library", "Sam");
  const a = await api.getApp("g_library", "sam");
  assert.equal(a.role, "pending"); assert.equal(a.response, "");
  await api.withdraw("g_library");
  assert.equal(await api.getApp("g_library", "sam"), null);
});

test("F5 applying twice never resets an existing decision", async () => {
  login("maya");
  const before = await api.getApp("g_oak", "maya");
  assert.equal(before.role, "perform");
  await api.apply("g_oak", "Maya").catch(() => {});
  assert.equal((await api.getApp("g_oak", "maya")).role, "perform", "second apply must not overwrite a confirmed performer");
});

test("F6 only the gig's organizer can choose performers", async () => {
  login("library");
  await rejects(() => api.setAppRole("g_maple", "maya", "perform", 25), /organizer/i);
});

test("F6 role changes persist on applications", async () => {
  login("maplewood");
  await api.setAppRole("g_maple", "maya", "perform", 25);
  await api.setAppRole("g_maple", "jt", "backup", 0);
  const apps = await api.listAppsForGig("g_maple");
  assert.deepEqual(apps.map((a) => [a.teenId, a.role]).sort(), [["jt", "backup"], ["maya", "perform"]]);
  assert.equal(active(apps).length, 1);
});

test("F6 applicant cards expose the data they need (instruments, songs, past gigs, cancellations)", async () => {
  login("maplewood");
  const maya = await api.getUser("maya");
  assert.ok(maya.instruments.length && maya.canPerform.length && Array.isArray(maya.clips));
  const apps = await api.listMyApps("maya");
  const pastGigs = (await api.listMyHourLogs("maya")).length;
  assert.equal(pastGigs, 3);
  assert.equal(apps.filter((a) => a.response === "cancelled").length, 0);
});

test("F8/F9 cancel -> backup is offered the spot and takes the cancelled minutes", async () => {
  login("maya");
  await api.cancelPerformance("g_oak");
  assert.equal((await api.getApp("g_oak", "maya")).response, "cancelled");
  login("sam");
  const gig = await api.getGig("g_oak");
  assert.equal(gig.cancelledBy, "maya");
  await api.acceptBackup("g_oak");
  const sam = await api.getApp("g_oak", "sam");
  assert.deepEqual([sam.role, sam.minutes, sam.wasBackup], ["perform", 30, true]);
});

test("F9 only a confirmed performer can cancel; the spot can be taken once", async () => {
  login("jt");
  await rejects(() => api.cancelPerformance("g_maple"), /confirmed performer/i);
  login("maya"); await api.cancelPerformance("g_oak");
  login("sam"); await api.acceptBackup("g_oak");
  await rejects(() => api.acceptBackup("g_oak"), /no longer open/i);
});

test("F9 passing the spot offers it to the next backup, or reopens the gig when none is left", async () => {
  login("maya"); await api.cancelPerformance("g_oak");
  login("sam"); await api.passBackup("g_oak");
  assert.equal((await api.getApp("g_oak", "sam")).response, "passed");
  const gig = await api.getGig("g_oak");
  assert.equal(gig.status, "open", "no backups left -> gig goes back to open");
});

test("F10 confirming a gig logs hours for each performer once and marks the gig done", async () => {
  login("riverbend");
  await api.confirmGig("g_past4", [{ teenId: "maya", hours: 1.5 }], iso(-2));
  assert.equal((await api.getGig("g_past4")).status, "done");
  assert.ok((await api.listMyHourLogs("maya")).some((l) => l.gigId === "g_past4" && l.hours === 1.5));
  await rejects(() => api.confirmGig("g_past4", [{ teenId: "maya", hours: 1 }], iso(-2)), /already/i);
});

test("F10 hours must be 0 < h <= 4 and only the gig's organizer may confirm", async () => {
  login("riverbend");
  await rejects(() => api.confirmGig("g_past4", [{ teenId: "maya", hours: 5 }], iso(-2)));
  await rejects(() => api.confirmGig("g_past4", [{ teenId: "maya", hours: 0 }], iso(-2)));
  login("library");
  await rejects(() => api.confirmGig("g_past4", [{ teenId: "maya", hours: 1 }], iso(-2)), /organizer/i);
});

test("F10 a failed confirmation leaves no partial hour logs", async () => {
  login("riverbend");
  await rejects(() => api.confirmGig("g_past4", [{ teenId: "maya", hours: 1 }, { teenId: "sam", hours: 9 }], iso(-2)));
  assert.equal((await api.listMyHourLogs("maya")).filter((l) => l.gigId === "g_past4").length, 0);
});

test("F7/F8 sets: performer shares, only the gig's organizer approves", async () => {
  login("maya");
  await api.saveSet("g_oak", { items: [], totalSeconds: 0, targetSeconds: 1800, acts: [], notes: [] });
  const set = await api.getSet("g_oak");
  assert.equal(set.approved, false); assert.equal(set.builtBy, "maya");
  await rejects(() => api.approveSet("g_oak"), /organizer/i);
  login("oakhill"); await api.approveSet("g_oak");
  assert.equal((await api.getSet("g_oak")).approved, true);
});

test("F9 two backups: only the oldest holds the offer; passing hands it on; the last pass reopens the gig", async () => {
  await new Promise((r) => setTimeout(r, 20)); // later than the seeded application
  login("jt"); await api.apply("g_oak", "Jordan & Theo");
  login("oakhill"); await api.setAppRole("g_oak", "jt", "backup", 0);
  assert.deepEqual((await api.getGig("g_oak")).backups, ["sam", "jt"]);
  login("maya"); await api.cancelPerformance("g_oak");
  assert.equal((await api.getGig("g_oak")).offeredTo, "sam");
  login("jt"); await rejects(() => api.acceptBackup("g_oak"), /no longer open/i);
  login("sam"); await api.passBackup("g_oak");
  assert.equal((await api.getGig("g_oak")).offeredTo, "jt");
  assert.equal((await api.getGig("g_oak")).status, "filled");
  login("jt"); await api.passBackup("g_oak");
  assert.equal((await api.getGig("g_oak")).status, "open");
});

test("F6 teen record counts past gigs and cancellations for applicant cards", async () => {
  login("maya"); await api.cancelPerformance("g_oak");
  assert.deepEqual(await api.getTeenRecord("maya"), { pastGigs: 3, cancellations: 1 });
});

test("F9 a gig with no backup reopens when the performer cancels", async () => {
  login("maplewood"); await api.setAppRole("g_maple", "maya", "perform", 25);
  login("maya"); await api.cancelPerformance("g_maple");
  assert.equal((await api.getGig("g_maple")).status, "open");
});

test("F12 clips: a teen adds a clip, organizers can load it, the teen can remove it", async () => {
  login("maya");
  const clip = { title: "Daisy", seconds: 20, mime: "audio/mpeg", data: "data:audio/mpeg;base64,AAAA" };
  const id = await api.addClip(clip);
  assert.equal(await api.getClipSrc("maya", id), clip.data);
  login("maplewood");
  assert.equal(await api.getClipSrc("maya", id), clip.data);
  login("jt");
  await rejects(() => api.getClipSrc("maya", id), /organizer/i);
  await rejects(() => api.removeClip(id), /isn't yours/i);
  login("maya"); await api.removeClip(id);
  await rejects(() => api.getClipSrc("maya", id), /not found/i);
});

test("adults: sign-up as an adult can apply with no parent approval; a teen still can't", async () => {
  await api.signUp({ name: "Ada", role: "teen", adult: true });
  const ada = await new Promise((res) => api.onAuth(res));
  assert.equal(ada.adult, true); assert.equal(ada.parentApproved, false);
  await api.apply("g_library", "Ada");
  assert.equal((await api.getApp("g_library", ada.id)).role, "pending");
  await api.logOut();
  await api.signUp({ name: "Teen", role: "teen", adult: false });
  await rejects(() => api.apply("g_library", "Teen"), /parent/i);
});
test("adults: the demo adult performer can apply, and 'adult' can't be changed afterwards", async () => {
  login("riley");
  await api.apply("g_library", "Riley");
  await rejects(() => api.updateMe({ adult: false }), /Can't change adult/);
  login("maya");
  await rejects(() => api.updateMe({ adult: true }), /Can't change adult/);
});
test("adults: organizers never get an adult flag from sign-up", async () => {
  await api.signUp({ name: "Org", role: "organizer", orgName: "Hall", adult: true });
  const org = await new Promise((res) => api.onAuth(res));
  assert.ok(!org.adult);
});
