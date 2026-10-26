// App shell: watches login state, routes "#/..." addresses to screens,
// and draws the header and bottom navigation.
import { api, isDemo } from "./db.js";
import { h, act, icon, loadSongs, toast, friendlyError } from "./ui.js";
import { authView } from "./views/auth.js";
import { teenHome, gigDetail, profileView } from "./views/teen.js";
import { plannerView, setView } from "./views/planner.js";
import { impactView, certificateView } from "./views/impact.js";
import { orgHome, postGigView, manageGigView } from "./views/org.js";

const routes = [
  [/^#\/login$/, authView, null],
  [/^#\/teen$/, teenHome, "teen"],
  [/^#\/gig\/([\w-]+)$/, gigDetail, "teen"],
  [/^#\/plan\/([\w-]+)$/, plannerView, "teen"],
  [/^#\/impact$/, impactView, "teen"],
  [/^#\/certificate$/, certificateView, "teen"],
  [/^#\/profile$/, profileView, "teen"],
  [/^#\/org$/, orgHome, "organizer"],
  [/^#\/org\/new$/, postGigView, "organizer"],
  [/^#\/org\/gig\/([\w-]+)$/, manageGigView, "organizer"],
  [/^#\/set\/([\w-]+)$/, setView, null]
];

const main = document.getElementById("view");
let cleanups = [];
let authReady = false;
let renderCount = 0;

const ctx = {
  user: null,
  songs: [],
  isDemo,
  go(hash) { if (location.hash === hash) render(); else location.hash = hash; },
  refresh() { render(); },
  onCleanup(fn) { cleanups.push(fn); },
  async reloadUser() { ctx.user = await api.getUser(ctx.user.id); drawChrome(); }
};

function homeFor(user) {
  return user && user.role === "organizer" ? "#/org" : "#/teen";
}

async function render() {
  if (!authReady) return;
  const thisRender = ++renderCount;
  cleanups.forEach((fn) => { try { fn(); } catch (e) { /* ignore */ } });
  cleanups = [];

  let hash = location.hash || "";
  if (!ctx.user && hash !== "#/login") { location.replace("#/login"); return; }
  if (ctx.user && (hash === "" || hash === "#/" || hash === "#/login")) { location.replace(homeFor(ctx.user)); return; }

  const match = routes.map(([re, view, role]) => ({ m: hash.match(re), view, role })).find((r) => r.m);
  if (!match) { location.replace(homeFor(ctx.user)); return; }
  if (match.role && ctx.user && ctx.user.role !== match.role) { location.replace(homeFor(ctx.user)); return; }

  drawChrome();
  main.replaceChildren(h("p", { class: "loading", role: "status" }, "Loading…"));
  try {
    const node = await match.view(match.m.slice(1), ctx);
    if (thisRender !== renderCount) return; // a newer screen started loading
    main.replaceChildren(...(ctx.user && ctx.user.emailVerified === false ? [verifyBanner()] : []), node);
    const heading = main.querySelector("h1");
    if (heading) { heading.setAttribute("tabindex", "-1"); heading.focus({ preventScroll: true }); }
    window.scrollTo(0, 0);
  } catch (err) {
    console.error(err);
    main.replaceChildren(h("div", { class: "card" },
      h("h1", {}, "Something went wrong"),
      h("p", { class: "muted" }, friendlyError(err)),
      h("a", { href: homeFor(ctx.user), class: "btn btn--secondary" }, "Back to home")));
  }
}

// Spam protection: until the emailed link is clicked, people can browse but not apply, post, or add clips.
function verifyBanner() {
  const resend = h("button", { class: "btn btn--secondary", onClick: (e) =>
    act(e.currentTarget, () => api.sendVerification(), "Sent! Check your inbox and spam folder.") }, "Resend email");
  const done = h("button", { class: "btn btn--primary", onClick: (e) =>
    act(e.currentTarget, async () => {
      if (!(await api.refreshAuth())) throw new Error("Not confirmed yet. Click the link in the email first.");
      await ctx.reloadUser();
      ctx.refresh();
    }, "Email confirmed. Welcome!") }, "I've confirmed it");
  return h("section", { class: "card card--alert stack", role: "region", "aria-label": "Confirm your email" },
    h("h2", { class: "h3" }, "Confirm your email"),
    h("p", { class: "small" }, "We sent a link to your email. Click it to start requesting gigs, posting gigs, and adding clips."),
    h("div", { class: "row" }, resend, done));
}

function drawChrome() {
  const header = document.getElementById("header");
  const nav = document.getElementById("nav");
  const u = ctx.user;
  header.replaceChildren(...[
    h("a", { href: homeFor(u), class: "brand" }, "Sound Neighbors"),
    isDemo ? h("span", { class: "tag tag--demo" }, "Demo mode") : null,
    u ? h("div", { class: "header__user" },
      h("span", { class: "muted small" }, u.role === "organizer" ? (u.orgName || u.name) : u.name),
      h("button", { class: "btn btn--ghost", onClick: async () => {
        try { await api.logOut(); } catch (e) { toast(friendlyError(e), "error"); }
      } }, isDemo ? "Switch user" : "Log out")) : null
  ].filter(Boolean));

  nav.hidden = !u;
  if (!u) return;
  const items = u.role === "organizer"
    ? [["#/org", "My gigs", icon.calendar], ["#/org/new", "Post gig", icon.plus]]
    : [["#/teen", "Home", icon.home], ["#/profile", "My songs", icon.music], ["#/impact", "Impact", icon.award]];
  const current = location.hash;
  nav.replaceChildren(...items.map(([href, label, ic]) =>
    h("a", { href, "aria-current": current === href ? "page" : null }, ic(), label)));
}

window.addEventListener("hashchange", render);

ctx.songs = await loadSongs();
api.onAuth((profile) => {
  if (!ctx.user || !profile || ctx.user.id !== profile.id) document.getElementById("toast").hidden = true;
  ctx.user = profile;
  authReady = true;
  if (!profile) location.replace("#/login");
  render();
});
