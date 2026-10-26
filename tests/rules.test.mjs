// Firestore security rules, tested against the local emulator.
// Run with: npm run test:rules   (skipped by plain `npm test`, which has no emulator)
import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { initializeTestEnvironment, assertSucceeds, assertFails } from "@firebase/rules-unit-testing";
import { doc, setDoc, updateDoc, getDoc, getDocs, deleteDoc, collection, query, where, writeBatch } from "firebase/firestore";

const skip = !process.env.FIRESTORE_EMULATOR_HOST && "needs the Firestore emulator (npm run test:rules)";
let env;
// By default people have confirmed their email (the rules check the token's email_verified claim).
const as = (uid, token = { email_verified: true }) => env.authenticatedContext(uid, token).firestore();
const asUnconfirmed = (uid) => as(uid, { email_verified: false });

before(async () => {
  if (skip) return;
  const [host, port] = process.env.FIRESTORE_EMULATOR_HOST.split(":");
  env = await initializeTestEnvironment({
    projectId: "demo-sound-neighbors",
    firestore: { host, port: Number(port), rules: readFileSync(new URL("../firestore.rules", import.meta.url), "utf8") }
  });
});
after(async () => { if (env) await env.cleanup(); });

const app = (gigId, teenId, extra = {}) => ({ gigId, teenId, teenName: teenId, role: "pending", minutes: 0, response: "", wasBackup: false, ...extra });
const gig = (extra = {}) => ({ orgId: "org", orgName: "Org", title: "T", date: "2099-01-01", time: "2:00 PM", lengthMin: 30,
  vibes: ["Upbeat"], audience: "", equipment: {}, request: "", requestNote: "", avoid: "", status: "filled", backups: ["sam", "jt"], ...extra });

beforeEach(async () => {
  if (skip) return;
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, "users", "ada"), { name: "ada", role: "teen", parentApproved: false, adult: true, canPerform: [] });
    const teen = (name, ok = true) => setDoc(doc(db, "users", name), { name, role: "teen", parentApproved: ok, canPerform: [] });
    await Promise.all([teen("maya"), teen("sam"), teen("jt"), teen("newt", false)]);
    await setDoc(doc(db, "users", "org"), { name: "Org", role: "organizer", orgName: "Org", verified: true });
    await setDoc(doc(db, "users", "org2"), { name: "Org2", role: "organizer", orgName: "Org2", verified: true });
    await setDoc(doc(db, "users", "unver"), { name: "U", role: "organizer", orgName: "U" });
    await setDoc(doc(db, "gigs", "g1"), gig());
    await setDoc(doc(db, "applications", "g1_maya"), app("g1", "maya", { role: "perform", minutes: 30 }));
    await setDoc(doc(db, "applications", "g1_sam"), app("g1", "sam", { role: "backup" }));
    await setDoc(doc(db, "applications", "g1_jt"), app("g1", "jt", { role: "backup" }));
    await setDoc(doc(db, "hourLogs", "old_maya"), { gigId: "old", teenId: "maya", orgId: "org", hours: 1, date: "2020-01-01" });
  });
});

const t = (name, fn) => test(name, { skip }, fn);

// ---- F1 / F2: accounts ----
t("F1 sign-up: a user can create their own profile, unapproved and unverified", async () => {
  await assertSucceeds(setDoc(doc(as("new1"), "users", "new1"), { name: "N", role: "teen", parentApproved: false }));
  await assertFails(setDoc(doc(as("new2"), "users", "other"), { name: "N", role: "teen", parentApproved: false }));
});
t("F2 sign-up can't self-verify or self-approve", async () => {
  await assertSucceeds(setDoc(doc(as("n5"), "users", "n5"), { name: "N", role: "organizer", verified: false, parentApproved: false }));
  await assertFails(setDoc(doc(as("n3"), "users", "n3"), { name: "N", role: "organizer", verified: true, parentApproved: false }));
  await assertFails(setDoc(doc(as("n4"), "users", "n4"), { name: "N", role: "teen", parentApproved: true }));
});
t("F2 users can't change role, verified or parentApproved later; other edits are fine", async () => {
  await assertFails(updateDoc(doc(as("newt"), "users", "newt"), { parentApproved: true }));
  await assertFails(updateDoc(doc(as("unver"), "users", "unver"), { verified: true }));
  await assertFails(updateDoc(doc(as("maya"), "users", "maya"), { role: "organizer" }));
  await assertSucceeds(updateDoc(doc(as("maya"), "users", "maya"), { instruments: ["Piano"] }));
  await assertFails(updateDoc(doc(as("sam"), "users", "maya"), { instruments: ["Hacked"] }));
});
t("signed-out users can read nothing", async () => {
  await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), "gigs", "g1")));
});

// ---- F3: gigs ----
t("F3 any organizer with a confirmed email posts gigs, as themselves; admin approval isn't needed", async () => {
  const data = gig({ orgId: "org", status: "open" });
  await assertSucceeds(setDoc(doc(as("org"), "gigs", "new"), data));
  await assertSucceeds(setDoc(doc(as("unver"), "gigs", "n2"), { ...data, orgId: "unver" }), "not admin-verified yet");
  await assertFails(setDoc(doc(as("maya"), "gigs", "n3"), { ...data, orgId: "maya" }), "teens can't post");
  await assertFails(setDoc(doc(as("org2"), "gigs", "n4"), data), "can't post as another organizer");
});
t("spam: without a confirmed email nobody can post gigs, apply, or add clips", async () => {
  await assertFails(setDoc(doc(asUnconfirmed("org"), "gigs", "n5"), gig({ orgId: "org", status: "open" })));
  await assertFails(setDoc(doc(asUnconfirmed("sam"), "applications", "g2_sam"), app("g2", "sam")));
  await assertFails(setDoc(doc(asUnconfirmed("maya"), "users", "maya", "clips", "c9"), { title: "x", seconds: 5, mime: "audio/mpeg", data: "data:audio/mpeg;base64,AAAA" }));
  await assertFails(updateDoc(doc(asUnconfirmed("org"), "gigs", "g1"), { title: "Edit" }));
  await assertSucceeds(updateDoc(doc(as("org"), "gigs", "g1"), { title: "Edit" }));
});
t("spam: signing up and editing your own profile work before the email is confirmed", async () => {
  await assertSucceeds(setDoc(doc(asUnconfirmed("fresh"), "users", "fresh"), { name: "F", role: "teen", parentApproved: false, adult: false }));
  await assertSucceeds(updateDoc(doc(asUnconfirmed("fresh"), "users", "fresh"), { instruments: ["Flute"] }));
});
t("reports: a confirmed user can report a gig; nobody can read, change or delete reports", async () => {
  const report = { gigId: "g1", orgId: "org", reporterId: "maya", reason: "Looks fake" };
  await assertSucceeds(setDoc(doc(as("maya"), "reports", "r1"), report));
  await assertFails(setDoc(doc(as("sam"), "reports", "r2"), report), "can't file as someone else");
  await assertFails(setDoc(doc(asUnconfirmed("maya"), "reports", "r3"), report));
  await assertFails(setDoc(doc(as("maya"), "reports", "r4"), { ...report, reason: "x".repeat(501) }));
  await assertFails(getDoc(doc(as("maya"), "reports", "r1")));
  await assertFails(getDoc(doc(as("org"), "reports", "r1")));
  await assertFails(deleteDoc(doc(as("maya"), "reports", "r1")));
});
t("organizers: only an admin-verified organizer can listen to clips or see teens' records", async () => {
  await env.withSecurityRulesDisabled((ctx) => setDoc(doc(ctx.firestore(), "users", "maya", "clips", "c1"),
    { title: "x", seconds: 5, mime: "audio/mpeg", data: "data:audio/mpeg;base64,AAAA" }));
  await assertSucceeds(getDoc(doc(as("org"), "users", "maya", "clips", "c1")));
  await assertFails(getDoc(doc(as("unver"), "users", "maya", "clips", "c1")));
  await assertFails(getDocs(query(collection(as("unver"), "hourLogs"), where("teenId", "==", "maya"))));
  await assertSucceeds(getDocs(query(collection(as("org"), "hourLogs"), where("teenId", "==", "maya"))));
  await assertFails(getDocs(query(collection(as("unver"), "applications"), where("teenId", "==", "maya"))));
});
t("F3 only the owner edits a gig", async () => {
  await assertSucceeds(updateDoc(doc(as("org"), "gigs", "g1"), { title: "New" }));
  await assertFails(updateDoc(doc(as("org2"), "gigs", "g1"), { title: "Hijack" }));
  await assertFails(updateDoc(doc(as("maya"), "gigs", "g1"), { title: "Hijack" }));
});

// ---- F5: applications ----
t("F5 a teen applies as pending, for themselves only", async () => {
  await assertSucceeds(setDoc(doc(as("sam"), "applications", "g2_sam"), app("g2", "sam")));
  await assertFails(setDoc(doc(as("sam"), "applications", "g1_x"), app("g1", "maya")));
  await assertFails(setDoc(doc(as("sam"), "applications", "g3_sam"), app("g3", "sam", { role: "perform" })));
});
t("F2 a teen without parent approval can't apply (enforced by rules, not only the UI)", async () => {
  await assertFails(setDoc(doc(as("newt"), "applications", "g1_newt"), app("g1", "newt")));
});
t("F5 a teen can't pick their own role or minutes, and can't re-apply over an existing application", async () => {
  await assertFails(updateDoc(doc(as("sam"), "applications", "g1_sam"), { role: "perform", minutes: 30 }));
  await assertFails(setDoc(doc(as("maya"), "applications", "g1_maya"), app("g1", "maya")));
});
t("F5 a teen can withdraw their own request", async () => {
  await assertSucceeds(deleteDoc(doc(as("sam"), "applications", "g1_sam")));
  await assertFails(deleteDoc(doc(as("maya"), "applications", "g1_sam")));
});
t("F6 the gig's organizer sets roles; another organizer can't", async () => {
  await assertSucceeds(updateDoc(doc(as("org"), "applications", "g1_sam"), { role: "declined" }));
  await assertFails(updateDoc(doc(as("org2"), "applications", "g1_sam"), { role: "declined" }));
});
t("F6 organizers can list a gig's applicants and a teen's record; teens can't read each other's", async () => {
  const apps = collection(as("org"), "applications");
  await assertSucceeds(getDocs(query(apps, where("gigId", "==", "g1"))));
  await assertSucceeds(getDocs(query(apps, where("teenId", "==", "maya"))));
  await assertSucceeds(getDocs(query(collection(as("org"), "hourLogs"), where("teenId", "==", "maya"))));
  await assertFails(getDocs(query(collection(as("sam"), "applications"), where("teenId", "==", "maya"))));
  await assertSucceeds(getDocs(query(collection(as("maya"), "applications"), where("teenId", "==", "maya"))));
});

// ---- F9: cancel / accept / pass ----
t("F9 a confirmed performer cancels and offers the spot to the first backup", async () => {
  const db = as("maya"), b = writeBatch(db);
  b.update(doc(db, "applications", "g1_maya"), { response: "cancelled" });
  b.update(doc(db, "gigs", "g1"), { cancelledBy: "maya", cancelledMinutes: 30, backupTaken: false, offeredTo: "sam" });
  await assertSucceeds(b.commit());
});
t("F9 someone who isn't performing can't cancel a gig", async () => {
  await assertFails(updateDoc(doc(as("sam"), "gigs", "g1"), { cancelledBy: "sam", cancelledMinutes: 30, backupTaken: false, offeredTo: "jt" }));
});
t("F9 a performer can't use the cancel path to mark the gig done", async () => {
  await assertFails(updateDoc(doc(as("maya"), "gigs", "g1"), { status: "done" }));
});

async function cancelled() {
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await updateDoc(doc(db, "applications", "g1_maya"), { response: "cancelled" });
    await updateDoc(doc(db, "gigs", "g1"), { cancelledBy: "maya", cancelledMinutes: 30, backupTaken: false, offeredTo: "sam" });
  });
}
t("F9 the backup holding the offer accepts and takes the cancelled minutes", async () => {
  await cancelled();
  const db = as("sam"), b = writeBatch(db);
  b.update(doc(db, "applications", "g1_sam"), { role: "perform", minutes: 30, response: "accepted", wasBackup: true });
  b.update(doc(db, "gigs", "g1"), { backupTaken: true, offeredTo: null });
  await assertSucceeds(b.commit());
});
t("F9 a backup who wasn't offered the spot can't take it", async () => {
  await cancelled();
  const db = as("jt"), b = writeBatch(db);
  b.update(doc(db, "applications", "g1_jt"), { role: "perform", minutes: 30, response: "accepted", wasBackup: true });
  b.update(doc(db, "gigs", "g1"), { backupTaken: true, offeredTo: null });
  await assertFails(b.commit());
});
t("F9 the accepting backup can't claim extra minutes", async () => {
  await cancelled();
  const db = as("sam"), b = writeBatch(db);
  b.update(doc(db, "applications", "g1_sam"), { role: "perform", minutes: 60, response: "accepted", wasBackup: true });
  b.update(doc(db, "gigs", "g1"), { backupTaken: true, offeredTo: null });
  await assertFails(b.commit());
});
t("F9 passing hands the offer to the next backup", async () => {
  await cancelled();
  const db = as("sam"), b = writeBatch(db);
  b.update(doc(db, "applications", "g1_sam"), { response: "passed" });
  b.update(doc(db, "gigs", "g1"), { offeredTo: "jt" });
  await assertSucceeds(b.commit());
});
t("F9 the last pass reopens the gig", async () => {
  await cancelled();
  await env.withSecurityRulesDisabled((ctx) => updateDoc(doc(ctx.firestore(), "gigs", "g1"), { offeredTo: "jt" }));
  const db = as("jt"), b = writeBatch(db);
  b.update(doc(db, "applications", "g1_jt"), { response: "passed" });
  b.update(doc(db, "gigs", "g1"), { offeredTo: null, status: "open" });
  await assertSucceeds(b.commit());
});

// ---- F7 / F8: sets ----
t("F7 a performing teen shares a set but can't approve it; only the organizer approves", async () => {
  const set = { gigId: "g1", builtBy: "maya", items: [], totalSeconds: 0, approved: false };
  await assertSucceeds(setDoc(doc(as("maya"), "sets", "g1"), set));
  await assertFails(setDoc(doc(as("maya"), "sets", "g1"), { ...set, approved: true }));
  await assertSucceeds(updateDoc(doc(as("org"), "sets", "g1"), { approved: true }));
  await assertFails(updateDoc(doc(as("org2"), "sets", "g1"), { approved: true }));
});

// ---- F10: hours ----
t("F10/DoD a teen can't log hours; the gig's verified organizer can, within 0 < h <= 4", async () => {
  const log = { gigId: "g1", teenId: "maya", orgId: "org", hours: 1.5, date: "2099-01-01" };
  await assertFails(setDoc(doc(as("maya"), "hourLogs", "g1_maya"), { ...log, orgId: "maya" }));
  await assertSucceeds(setDoc(doc(as("org"), "hourLogs", "g1_maya"), log));
  await assertFails(setDoc(doc(as("org"), "hourLogs", "g1_sam"), { ...log, teenId: "sam", hours: 5 }));
  await assertFails(setDoc(doc(as("org"), "hourLogs", "g1_jt"), { ...log, teenId: "jt", hours: 0 }));
  await assertFails(setDoc(doc(as("org2"), "hourLogs", "g1_jt"), { ...log, teenId: "jt", orgId: "org2" }), "organizer doesn't own the gig");
  await assertFails(setDoc(doc(as("unver"), "hourLogs", "g1_jt"), { ...log, teenId: "jt", orgId: "unver" }));
});
t("F10 hour logs can't be edited or deleted, and teens read only their own", async () => {
  await assertFails(updateDoc(doc(as("org"), "hourLogs", "old_maya"), { hours: 4 }));
  await assertFails(deleteDoc(doc(as("maya"), "hourLogs", "old_maya")));
  await assertSucceeds(getDocs(query(collection(as("maya"), "hourLogs"), where("teenId", "==", "maya"))));
  await assertFails(getDocs(query(collection(as("sam"), "hourLogs"), where("teenId", "==", "maya"))));
});

// ---- F12: clips ----
const clipDoc = (extra = {}) => ({ title: "Daisy", seconds: 20, mime: "audio/mpeg", data: "data:audio/mpeg;base64,AAAA", ...extra });
t("F12 a teen adds audio clips to their own profile only; non-audio and oversized data are refused", async () => {
  await assertSucceeds(setDoc(doc(as("maya"), "users", "maya", "clips", "c1"), clipDoc()));
  await assertFails(setDoc(doc(as("sam"), "users", "maya", "clips", "c2"), clipDoc()), "someone else's profile");
  await assertFails(setDoc(doc(as("maya"), "users", "maya", "clips", "c3"), clipDoc({ mime: "text/html" })));
  await assertFails(setDoc(doc(as("maya"), "users", "maya", "clips", "c4"), clipDoc({ data: "A".repeat(960000) })));
});
t("F12 only the teen and verified organizers can read a clip; the teen can delete it", async () => {
  await env.withSecurityRulesDisabled((ctx) => setDoc(doc(ctx.firestore(), "users", "maya", "clips", "c1"), clipDoc()));
  await assertSucceeds(getDoc(doc(as("org"), "users", "maya", "clips", "c1")));
  await assertSucceeds(getDoc(doc(as("maya"), "users", "maya", "clips", "c1")));
  await assertFails(getDoc(doc(as("sam"), "users", "maya", "clips", "c1")));
  await assertFails(getDoc(doc(as("unver"), "users", "maya", "clips", "c1")));
  await assertFails(deleteDoc(doc(as("sam"), "users", "maya", "clips", "c1")));
  await assertSucceeds(deleteDoc(doc(as("maya"), "users", "maya", "clips", "c1")));
});

t("F5 a teen can look up their own application before it exists (Gig Details does this); not someone else's", async () => {
  const snap = await assertSucceeds(getDoc(doc(as("sam"), "applications", "g99_sam")));
  assert.equal(snap.exists(), false);
  await assertFails(getDoc(doc(as("sam"), "applications", "g99_maya")));
  await assertSucceeds(getDoc(doc(as("org"), "applications", "g1_maya")));
});

// ---- adults ----
t("adults: sign-up may record adult yes/no (a real boolean), still never self-approved", async () => {
  await assertSucceeds(setDoc(doc(as("a1"), "users", "a1"), { name: "A", role: "teen", parentApproved: false, adult: true }));
  await assertSucceeds(setDoc(doc(as("a2"), "users", "a2"), { name: "A", role: "teen", parentApproved: false, adult: false }));
  await assertFails(setDoc(doc(as("a3"), "users", "a3"), { name: "A", role: "teen", parentApproved: false, adult: "yes" }));
  await assertFails(setDoc(doc(as("a4"), "users", "a4"), { name: "A", role: "teen", parentApproved: true, adult: true }));
});
t("adults: the adult flag can't be added or flipped after sign-up", async () => {
  await assertFails(updateDoc(doc(as("newt"), "users", "newt"), { adult: true }));
  await assertFails(updateDoc(doc(as("ada"), "users", "ada"), { adult: false }));
  await assertSucceeds(updateDoc(doc(as("ada"), "users", "ada"), { instruments: ["Guitar"] }));
});
t("adults: an adult can apply without parent approval; an unapproved teen still can't", async () => {
  await assertSucceeds(setDoc(doc(as("ada"), "applications", "g1_ada"), app("g1", "ada")));
  await assertFails(setDoc(doc(as("newt"), "applications", "g1_newt"), app("g1", "newt")));
});
