// Firebase version of the data API. Every function here has a twin in
// backend-local.js with the same name and behavior.
import { firebaseConfig, SDK } from "./config.js";

const { initializeApp } = await import(`${SDK}/firebase-app.js`);
const {
  getAuth, onAuthStateChanged, createUserWithEmailAndPassword,
  signInWithEmailAndPassword, signOut, sendEmailVerification
} = await import(`${SDK}/firebase-auth.js`);
const {
  getFirestore, doc, getDoc, setDoc, updateDoc, deleteDoc, collection, query,
  where, orderBy, getDocs, onSnapshot, writeBatch, serverTimestamp
} = await import(`${SDK}/firebase-firestore.js`);

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const withId = (snap) => (snap.exists() ? { id: snap.id, ...snap.data() } : null);
const all = (snap) => snap.docs.map((d) => ({ id: d.id, ...d.data() }));
const me = () => auth.currentUser && auth.currentUser.uid;
const appRef = (gigId, teenId) => doc(db, "applications", `${gigId}_${teenId}`);

// ---------- Accounts ----------
export function onAuth(callback) {
  return onAuthStateChanged(auth, async (user) => {
    if (!user) return callback(null);
    // Profile may take a moment to exist right after sign-up
    let profile = await getUser(user.uid);
    for (let i = 0; !profile && i < 5; i++) {
      await new Promise((r) => setTimeout(r, 400));
      profile = await getUser(user.uid);
    }
    // emailVerified lives on the sign-in account, not the profile document
    callback({ ...(profile || { id: user.uid, name: user.email, role: "teen", canPerform: [] }), emailVerified: user.emailVerified });
  });
}

export async function signUp({ name, email, password, role, orgName, adult = false }) {
  const cred = await createUserWithEmailAndPassword(auth, email, password);
  const profile = {
    name, role, instruments: [], canPerform: [], clips: [], reflections: {},
    parentApproved: false, adult: role === "teen" && adult === true, createdAt: serverTimestamp()
  };
  if (role === "organizer") Object.assign(profile, { orgName: orgName || name, verified: false });
  await setDoc(doc(db, "users", cred.user.uid), profile);
  // Spam protection: nobody can apply, post, or add clips until they click the link in this email.
  try { await sendEmailVerification(cred.user); } catch (e) { console.error("Couldn't send the verification email", e); }
}

export async function sendVerification() {
  await sendEmailVerification(auth.currentUser);
}

// After the person clicks the emailed link: reload the account and refresh the token the rules read.
export async function refreshAuth() {
  await auth.currentUser.reload();
  await auth.currentUser.getIdToken(true);
  return auth.currentUser.emailVerified;
}

export const logIn = (email, password) => signInWithEmailAndPassword(auth, email, password);
export const logOut = () => signOut(auth);

export async function getUser(uid) {
  const profile = withId(await getDoc(doc(db, "users", uid)));
  return profile && uid === me() ? { ...profile, emailVerified: auth.currentUser.emailVerified } : profile;
}

export async function updateMe(patch) {
  await updateDoc(doc(db, "users", me()), patch);
}

// ---------- Gigs ----------
export function watchOpenGigs(callback, onError) {
  const q = query(collection(db, "gigs"), where("status", "==", "open"), orderBy("date"));
  return onSnapshot(q, (snap) => callback(all(snap)), onError);
}

export async function getGig(id) {
  return withId(await getDoc(doc(db, "gigs", id)));
}

export async function listGigsByOrg(orgId) {
  const q = query(collection(db, "gigs"), where("orgId", "==", orgId), orderBy("date"));
  return all(await getDocs(q));
}

export async function postGig(data) {
  const profile = await getUser(me());
  const ref = doc(collection(db, "gigs"));
  await setDoc(ref, {
    ...data, orgId: me(), orgName: profile.orgName || profile.name,
    status: "open", createdAt: serverTimestamp()
  });
  return ref.id;
}

export async function updateGig(id, patch) {
  await updateDoc(doc(db, "gigs", id), patch);
}

// ---------- Applications ----------
export async function getApp(gigId, teenId) {
  return withId(await getDoc(appRef(gigId, teenId)));
}

export async function listMyApps(teenId) {
  return all(await getDocs(query(collection(db, "applications"), where("teenId", "==", teenId))));
}

export async function listAppsForGig(gigId) {
  const apps = all(await getDocs(query(collection(db, "applications"), where("gigId", "==", gigId))));
  return apps.sort((a, b) => (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0));
}

export async function apply(gigId, teenName) {
  await setDoc(appRef(gigId, me()), {
    gigId, teenId: me(), teenName, role: "pending", minutes: 0,
    response: "", wasBackup: false, createdAt: serverTimestamp()
  });
}

export async function withdraw(gigId) {
  await deleteDoc(appRef(gigId, me()));
}

export async function setAppRole(gigId, teenId, role, minutes = 0) {
  await updateDoc(appRef(gigId, teenId), { role, minutes });
  await syncBackups(gigId);
}

// Backups are offered a cancelled spot oldest application first, so keep that order on the gig.
// (A teen can read the gig but not other teens' applications, so the gig carries the list.)
async function syncBackups(gigId) {
  const apps = await listAppsForGig(gigId);
  await updateDoc(doc(db, "gigs", gigId), { backups: apps.filter((a) => a.role === "backup").map((a) => a.teenId) });
}

// Performer cancels: the first backup is offered the spot; with no backup the gig reopens.
export async function cancelPerformance(gigId) {
  const [mine, gig] = await Promise.all([getApp(gigId, me()), getGig(gigId)]);
  const next = (gig.backups || [])[0] || null;
  const batch = writeBatch(db);
  batch.update(appRef(gigId, me()), { response: "cancelled" });
  batch.update(doc(db, "gigs", gigId), {
    cancelledBy: me(), cancelledMinutes: mine.minutes, backupTaken: false, offeredTo: next,
    ...(next ? {} : { status: "open" })
  });
  await batch.commit();
}

// Backup accepts: becomes a performer with the cancelled act's minutes.
export async function acceptBackup(gigId) {
  const gig = await getGig(gigId);
  const batch = writeBatch(db);
  batch.update(appRef(gigId, me()), {
    role: "perform", minutes: gig.cancelledMinutes, response: "accepted", wasBackup: true
  });
  batch.update(doc(db, "gigs", gigId), { backupTaken: true, offeredTo: null });
  await batch.commit();
}

// Passing never counts against reliability: the offer moves on, or the gig reopens.
export async function passBackup(gigId) {
  const gig = await getGig(gigId);
  const list = gig.backups || [];
  const next = list[list.indexOf(me()) + 1] || null;
  const batch = writeBatch(db);
  batch.update(appRef(gigId, me()), { response: "passed" });
  batch.update(doc(db, "gigs", gigId), { offeredTo: next, ...(next ? {} : { status: "open" }) });
  await batch.commit();
}

// ---------- Sets ----------
export async function getSet(gigId) {
  return withId(await getDoc(doc(db, "sets", gigId)));
}

export async function saveSet(gigId, set) {
  await setDoc(doc(db, "sets", gigId), {
    ...set, gigId, builtBy: me(), approved: false, savedAt: serverTimestamp()
  });
}

export async function approveSet(gigId) {
  await updateDoc(doc(db, "sets", gigId), { approved: true });
}

// ---------- Hours ----------
// entries: [{ teenId, hours }]. One log per performer per gig, can't be edited.
export async function confirmGig(gigId, entries, date) {
  const batch = writeBatch(db);
  for (const { teenId, hours } of entries) {
    batch.set(doc(db, "hourLogs", `${gigId}_${teenId}`), {
      gigId, teenId, orgId: me(), hours, date, createdAt: serverTimestamp()
    });
  }
  batch.update(doc(db, "gigs", gigId), { status: "done" });
  await batch.commit();
}

export async function listMyHourLogs(teenId) {
  return all(await getDocs(query(collection(db, "hourLogs"), where("teenId", "==", teenId))));
}

// For applicant cards: gigs played and cancellations.
export async function getTeenRecord(teenId) {
  const [logs, apps] = await Promise.all([
    getDocs(query(collection(db, "hourLogs"), where("teenId", "==", teenId))),
    getDocs(query(collection(db, "applications"), where("teenId", "==", teenId)))
  ]);
  return { pastGigs: logs.size, cancellations: apps.docs.filter((d) => d.data().response === "cancelled").length };
}

// ---------- Sample clips (F12) ----------
// Audio lives in users/{uid}/clips so the rules can limit who reads it.
export async function addClip(clip) {
  const ref = doc(collection(db, "users", me(), "clips"));
  await setDoc(ref, { ...clip, createdAt: serverTimestamp() });
  return ref.id;
}
export async function removeClip(id) {
  await deleteDoc(doc(db, "users", me(), "clips", id));
}
export async function getClipSrc(teenId, id) {
  const snap = await getDoc(doc(db, "users", teenId, "clips", id));
  if (!snap.exists()) throw new Error("Clip not found.");
  return snap.data().data;
}

// ---------- Reports ----------
// Anyone with a confirmed email can report a gig; only the admin reads them (in the console).
export async function reportGig(gig, reason) {
  await setDoc(doc(collection(db, "reports")), {
    gigId: gig.id, orgId: gig.orgId, reporterId: me(), reason: reason.trim().slice(0, 500), createdAt: serverTimestamp()
  });
}
