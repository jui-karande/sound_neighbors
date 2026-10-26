// F10 stats and F11 badges are calculated, never stored.
import { test } from "node:test";
import assert from "node:assert/strict";
import { computeStats, computeBadges, MILESTONES } from "../public/js/badges.js";

const log = (gigId, hours, orgId = "o1") => ({ gigId, teenId: "me", orgId, hours, date: "2026-01-01" });
const earned = (b) => b.filter((x) => x.earned).map((x) => x.name);

test("F10 stats: total hours, gigs played, venues served", () => {
  const s = computeStats([log("a", 1.5, "o1"), log("b", 1, "o1"), log("c", 2, "o2")]);
  assert.equal(s.hours, 4.5); assert.equal(s.gigs, 3); assert.equal(s.venues, 2);
});

test("F10 milestones are 5, 10, 25, 50, 100 and progress brackets the hours", () => {
  assert.deepEqual(MILESTONES, [5, 10, 25, 50, 100]);
  assert.deepEqual([computeStats([]).prev, computeStats([]).next], [0, 5]);
  const s = computeStats([log("a", 4), log("b", 4)]);
  assert.deepEqual([s.prev, s.next], [5, 10]);
  assert.equal(computeStats([log("a", 4)]).next, 5);
  assert.equal(computeStats(Array.from({ length: 30 }, (_, i) => log(`g${i}`, 4))).next, null);
});

const badges = (o) => computeBadges({ logs: [], apps: [], gigs: {}, sets: {}, me: "me", ...o });

test("F11 nothing is earned with no activity; locked badges say what's needed", () => {
  const b = badges({});
  assert.deepEqual(earned(b), []);
  assert.ok(b.every((x) => x.hint && x.hint.length > 0));
});

test("F11 First Gig = one hour log", () => {
  assert.ok(earned(badges({ logs: [log("a", 1)] })).includes("First Gig"));
});

test("F11 Bridge the Generations = audience mentions seniors", () => {
  const mk = (audience, orgName = "Somewhere") => badges({ logs: [log("a", 1)], gigs: { a: { audience, orgName } } });
  assert.ok(earned(mk("About 30 senior residents")).includes("Bridge the Generations"));
  assert.ok(!earned(mk("Families with kids")).includes("Bridge the Generations"));
});

test("F11 Request Granted = performed a set that included the request", () => {
  const gigs = { a: { request: "daisy-bell", audience: "" } };
  const set = (performerId) => ({ a: { items: [{ songId: "daisy-bell", performerId }] } });
  assert.ok(earned(badges({ logs: [log("a", 1)], gigs, sets: set("me") })).includes("Request Granted"));
  assert.ok(earned(badges({ logs: [log("a", 1)], gigs, sets: set("together") })).includes("Request Granted"));
  assert.ok(!earned(badges({ logs: [log("a", 1)], gigs, sets: set("someone-else") })).includes("Request Granted"));
  assert.ok(!earned(badges({ logs: [log("a", 1)], gigs, sets: {} })).includes("Request Granted"));
});

test("F11 Reliable = 5 gigs, no cancellations", () => {
  const logs = Array.from({ length: 5 }, (_, i) => log(`g${i}`, 1));
  assert.ok(earned(badges({ logs })).includes("Reliable"));
  assert.ok(!earned(badges({ logs: logs.slice(0, 4) })).includes("Reliable"));
  assert.ok(!earned(badges({ logs, apps: [{ response: "cancelled" }] })).includes("Reliable"));
});

test("F9/F11 passing never counts against Reliable; Ready Reserve = backup for 3 gigs", () => {
  const logs = Array.from({ length: 5 }, (_, i) => log(`g${i}`, 1));
  assert.ok(earned(badges({ logs, apps: [{ role: "backup", response: "passed" }] })).includes("Reliable"));
  const apps = (n) => Array.from({ length: n }, () => ({ role: "backup" }));
  assert.ok(earned(badges({ apps: apps(3) })).includes("Ready Reserve"));
  assert.ok(!earned(badges({ apps: apps(2) })).includes("Ready Reserve"));
});

test("F11 hour milestone badges at 10, 25, 50, 100 hours", () => {
  const hours = (h) => earned(badges({ logs: [log("a", h)] })).filter((n) => n.endsWith("Hours"));
  assert.deepEqual(hours(9.5), []);
  assert.deepEqual(hours(10), ["10 Hours"]);
  assert.deepEqual(hours(60), ["10 Hours", "25 Hours", "50 Hours"]);
  assert.deepEqual(hours(100), ["10 Hours", "25 Hours", "50 Hours", "100 Hours"]);
});
