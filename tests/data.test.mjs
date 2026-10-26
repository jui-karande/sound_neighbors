// Spec checks on static data, security rules and project conventions (CLAUDE.md).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";

const root = new URL("../", import.meta.url).pathname;
const read = (p) => readFileSync(join(root, p), "utf8");
const songs = JSON.parse(read("public/data/songs.json"));
import { EVENTS } from "../public/js/events.js";
const MOODS = new Set(["nostalgic", "sing-along", "upbeat", "soothing", "festive", "seasonal", "sad"]);

function jsFiles(dir) {
  return readdirSync(join(root, dir), { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? jsFiles(join(dir, e.name)) : e.name.endsWith(".js") ? [join(dir, e.name)] : []);
}

test("songs.json: a big library of songs with the documented fields, each tagged with real occasions", () => {
  assert.ok(songs.length >= 100, `${songs.length} songs`);
  const ids = new Set();
  const events = new Set(EVENTS.map((e) => e.id));
  for (const s of songs) {
    assert.ok(!ids.has(s.id), `duplicate id ${s.id}`); ids.add(s.id);
    assert.ok(s.title && Number.isInteger(s.year) && s.seconds >= 30 && s.seconds <= 600, s.id);
    assert.ok(s.energy >= 1 && s.energy <= 5, s.id);
    assert.ok(Array.isArray(s.moods) && s.moods.length && s.moods.every((m) => MOODS.has(m)), `${s.id} moods`);
    assert.ok(Array.isArray(s.needs), `${s.id} needs`);
    assert.ok(Array.isArray(s.events) && s.events.length >= 1 && s.events.every((e) => events.has(e)), `${s.id} events`);
    assert.ok(!("lyrics" in s), `${s.id} stores lyrics`);
  }
});

test("songs.json: every occasion has enough songs, and modern decades are covered", () => {
  for (const e of EVENTS) assert.ok(songs.filter((s) => s.events.includes(e.id)).length >= 6, `${e.id} has too few songs`);
  const decades = new Set(songs.map((s) => Math.floor(s.year / 10) * 10));
  for (const d of [1950, 1960, 1970, 1980, 1990, 2000, 2010]) assert.ok(decades.has(d), `no songs from the ${d}s`);
});

test("songs.json: enough variety for the planner (sing-alongs, piano-only, low and high energy)", () => {
  assert.ok(songs.filter((s) => s.moods.includes("sing-along")).length >= 4);
  assert.ok(songs.some((s) => s.needs.includes("piano")));
  assert.ok(songs.some((s) => s.energy <= 2) && songs.some((s) => s.energy >= 5));
});

test("songs the demo accounts can perform exist in the library", () => {
  const src = read("public/js/backend-local.js");
  const ids = new Set(songs.map((s) => s.id));
  const canPerformBlocks = [...src.matchAll(/canPerform: \[([^\]]*)\]/g)].flatMap((m) => [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]));
  const missing = canPerformBlocks.filter((id) => !ids.has(id));
  assert.deepEqual(missing, [], "demo canPerform lists song ids missing from songs.json");
  const requests = [...src.matchAll(/request: "([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(requests.filter((id) => !ids.has(id)), [], "demo gig requests missing from songs.json");
});


test("index.html: mobile viewport, language, and accessible regions", () => {
  const html = read("public/index.html");
  assert.match(html, /<html[^>]*lang="en"/);
  assert.match(html, /name="viewport"[^>]*width=device-width/);
  assert.match(html, /id="view"/);
  assert.match(html, /id="toast"[^>]*(role="(status|alert)"|aria-live)/);
});

test("style.css: touch targets of at least 44px", () => {
  const css = read("public/css/style.css");
  assert.ok(Number.parseInt(css.match(/--tap:\s*(\d+)px/)[1], 10) >= 44, "--tap should be at least 44px");
  const small = [...css.matchAll(/([^{}]+)\{[^}]*min-height:\s*(\d+)px/g)].filter((m) => Number(m[2]) < 44).map((m) => `${m[1].trim()} (${m[2]}px)`);
  assert.deepEqual(small, [], "controls with min-height under 44px");
});

test("firestore.rules: protected fields and role checks (spec section 3, F2, DoD)", () => {
  const rules = read("firestore.rules");
  assert.match(rules, /get\('verified', false\) == false/, "sign-up can't self-verify");
  assert.match(rules, /parentApproved == false/, "sign-up starts unapproved");
  assert.match(rules, /hasAny\(\['role', 'verified', 'parentApproved', 'adult'\]\)/, "users can't edit protected fields");
  assert.match(rules, /match \/gigs\/\{gigId\}[\s\S]*?allow create: if isOrganizer\(\)/, "only organizers with a confirmed email post gigs");
  assert.match(rules, /function emailOk\(\)[^\n]*email_verified/, "rules check the email_verified claim");
  assert.match(rules, /match \/applications\/\{appId\}[\s\S]*?allow create: if signedIn\(\) && emailOk\(\)/, "applying needs a confirmed email");
  assert.match(rules, /match \/hourLogs\/\{logId\}[\s\S]*?allow create: if isVerifiedOrganizer\(\)[\s\S]*?hours > 0[\s\S]*?hours <= 4/, "hour logs: organizer only, 0 < h <= 4");
  assert.match(rules, /hourLogs[\s\S]*allow update, delete: if false/, "hour logs are immutable (confirm only once)");
});

test("firestore: queries that combine where() and orderBy() have a composite index", () => {
  const backend = read("public/js/backend-firebase.js");
  const idx = JSON.parse(read("firestore.indexes.json")).indexes;
  const combos = [...backend.matchAll(/where\("(\w+)",[^)]*\),\s*orderBy\("(\w+)"\)/g)].map((m) => [m[1], m[2]]);
  assert.ok(combos.length >= 1, "expected at least one where+orderBy query");
  for (const [field, order] of combos) {
    const found = idx.some((i) => i.collectionGroup === "gigs" && i.fields[0].fieldPath === field && i.fields[1].fieldPath === order);
    assert.ok(found, `firestore.indexes.json is missing a gigs (${field}, ${order}) index`);
  }
});

test("F12: clip files referenced by the demo data exist in public/audio (or there are none)", () => {
  const clips = [...read("public/js/backend-local.js").matchAll(/file: "([^"]+)"/g)].map((m) => m[1]);
  for (const c of clips) assert.ok(existsSync(join(root, "public", c)), `${c} missing`);
});

test("style.css: [hidden] always wins, so the logged-out nav and toast stay hidden", () => {
  assert.match(read("public/css/style.css"), /\[hidden\]\s*\{\s*display:\s*none\s*!important/);
});

test("config.js: committed with placeholders only, exports what the backends import, and a local config (if present) matches .firebaserc", () => {
  const cfg = read("public/js/config.js");
  assert.match(cfg, /export const firebaseConfig\b/);
  assert.match(cfg, /export const SDK\b/);
  assert.match(cfg, /export const DEMO_MODE\b/);
  assert.ok(cfg.includes("PASTE-HERE") && !/AIza[0-9A-Za-z_-]{30,}/.test(cfg), "config.js must hold placeholders, not real keys");
  if (existsSync(join(root, "public/js/config.local.js")) && existsSync(join(root, ".firebaserc"))) {
    const local = read("public/js/config.local.js");
    for (const key of ["apiKey", "authDomain", "projectId", "appId"]) assert.match(local, new RegExp(`${key}:\\s*"[^"]+"`));
    const project = JSON.parse(read(".firebaserc")).projects.default;
    assert.match(local, new RegExp(`projectId:\\s*"${project}"`), "local config points at a different project than .firebaserc");
  }
});

test("open source: license, docs, and ignore rules are in place", () => {
  assert.match(read("LICENSE"), /^MIT License/);
  assert.equal(JSON.parse(read("package.json")).license, "MIT");
  for (const f of ["README.md", "CONTRIBUTING.md", "SECURITY.md", ".firebaserc.example", "docs/AI_ASSISTANCE.md"]) assert.ok(existsSync(join(root, f)), `${f} is missing`);
  const ignore = read(".gitignore");
  assert.match(ignore, /public\/js\/config\.local\.js/);
  assert.match(ignore, /node_modules/);
});

test("open source: no contest scheduling, and no real keys or private keys in tracked files", () => {
  let files;
  try { files = execFileSync("git", ["ls-files"], { cwd: root, encoding: "utf8" }).split("\n").filter(Boolean); }
  catch (e) { return; }   // not a git checkout (for example a downloaded zip)
  const textual = files.filter((f) => /\.(js|mjs|json|md|html|css|rules|example)$|LICENSE$/.test(f) && !f.endsWith("package-lock.json"));
  for (const f of textual) {
    if (!existsSync(join(root, f))) continue;
    const text = read(f);
    assert.ok(!/AIza[0-9A-Za-z_-]{30,}/.test(text), `${f} contains a Google API key`);
    assert.ok(!/-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(text), `${f} contains a private key`);
    if (!f.startsWith("tests/")) assert.ok(!/Congressional App Challenge|feature freeze|demo video/i.test(text), `${f} still has contest-specific wording`);
  }
});
