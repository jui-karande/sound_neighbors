// Organizer screens: my gigs (with hour confirmation), post a gig, manage one gig.
import { api, today, activePerformers } from "../db.js";
import { h, act, toast, fmtDate, dateBlock, backLink, empty, VIBES, icon } from "../ui.js";
import { planShared, formatTime } from "../planner.js";
import { EVENTS, eventLabel } from "../events.js";
import { initials } from "./auth.js";

const STATUS_LABEL = { open: "Taking requests", filled: "Performers confirmed", done: "Done", cancelled: "Cancelled" };

// ---------- My gigs ----------
export async function orgHome(_, ctx) {
  const u = ctx.user;
  const gigs = await api.listGigsByOrg(u.id);
  const appsByGig = {};
  await Promise.all(gigs.map(async (g) => { appsByGig[g.id] = await api.listAppsForGig(g.id); }));
  const now = today();
  const needsHours = gigs.filter((g) => g.status === "filled" && g.date <= now);
  const upcoming = gigs.filter((g) => g.date >= now && g.status !== "done");
  const past = gigs.filter((g) => g.date < now && g.status === "done");

  return h("div", { class: "screen-stack" },
    h("div", {}, h("p", { class: "muted" }, u.orgName), h("h1", {}, "Your gigs")),
    !u.verified ? h("p", { class: "notice" },
      "You can post gigs now. Teens see \"Unverified organization\" until an admin verifies you. Verification also unlocks sample clips, teen records, and confirming service hours.") : null,
    h("a", { href: "#/org/new", class: "btn btn--primary btn--block" }, icon.plus(), "Request live music"),

    ...needsHours.map((g) => confirmHoursCard(g, activePerformers(appsByGig[g.id]), ctx)),

    h("section", { class: "stack" }, h("h2", {}, "Upcoming"),
      upcoming.length ? h("div", { class: "list" }, upcoming.map((g) => orgGigRow(g, appsByGig[g.id]))) : empty("No upcoming gigs yet.")),
    past.length ? h("section", { class: "stack" }, h("h2", {}, "Past"),
      h("div", { class: "list" }, past.map((g) => orgGigRow(g, appsByGig[g.id])))) : null);
}

function orgGigRow(g, apps) {
  const performers = activePerformers(apps);
  const pending = apps.filter((a) => a.role === "pending").length;
  return h("a", { href: `#/org/gig/${g.id}`, class: "card gig-row" },
    dateBlock(g.date),
    h("span", { class: "gig-row__text" },
      h("strong", {}, g.title),
      h("span", { class: "muted small" }, `${g.time} · ${g.lengthMin} min · ${STATUS_LABEL[g.status] || g.status}`),
      h("span", { class: "vibe-line" },
        performers.length ? `Performing: ${performers.map((p) => p.teenName).join(" & ")}` : `${pending} request(s) waiting`),
      g.cancelledBy && !g.backupTaken ? h("span", { class: "tag tag--warn" }, "A performer cancelled") : null));
}

function confirmHoursCard(g, performers, ctx) {
  if (!ctx.user.verified) return h("section", { class: "card card--alert stack" },
    h("p", { class: "eyebrow eyebrow--dark" }, "Confirm this gig happened"),
    h("h2", { class: "h3" }, `${g.title} · ${fmtDate(g.date)}`),
    h("p", { class: "small" }, "Service hours are confirmed by verified organizations only, so they can be trusted. This unlocks as soon as an admin verifies you."));
  const inputs = performers.map((p) => {
    const prefill = Math.min(4, Math.max(0.5, Math.ceil(p.minutes / 30) * 0.5));
    return { p, input: h("input", { id: `hrs-${p.teenId}`, type: "number", min: 0.5, max: 4, step: 0.5, value: String(prefill) }) };
  });
  return h("section", { class: "card card--alert stack" },
    h("p", { class: "eyebrow eyebrow--dark" }, "Confirm this gig happened"),
    h("h2", { class: "h3" }, `${g.title} · ${fmtDate(g.date)}`),
    h("p", { class: "small" }, "Confirming adds service hours for each performer. It can only be done once."),
    performers.length ? inputs.map(({ p, input }) =>
      h("div", { class: "field field--inline" }, h("label", { for: input.id }, `${p.teenName}: hours`), input))
      : h("p", {}, "No performers were confirmed for this gig."),
    h("button", { class: "btn btn--dark", disabled: !performers.length, onClick: (e) => {
      const entries = inputs.map(({ p, input }) => ({ teenId: p.teenId, hours: Number(input.value) }));
      if (entries.some((x) => !(x.hours >= 0.5 && x.hours <= 4))) { toast("Hours must be between 0.5 and 4.", "error"); return; }
      act(e.currentTarget, async () => { await api.confirmGig(g.id, entries, g.date); ctx.refresh(); }, "Hours confirmed. Thank you!");
    } }, "Confirm and log hours"));
}

// ---------- Post a gig ----------
export async function postGigView(_, ctx) {
  const u = ctx.user;
  if (!u.emailVerified) return h("div", { class: "screen-stack" }, backLink("#/org", "My gigs"), h("h1", {}, "Request live music"),
    h("p", { class: "notice notice--warn" }, "Confirm your email first. Use the link we emailed you, then tap \"I've confirmed it\" at the top of the screen."));

  const field = (id, label, input, hint) => h("div", { class: "field" }, h("label", { for: id }, label), input,
    hint ? h("span", { class: "muted small" }, hint) : null);
  const title = h("input", { id: "title", required: true, placeholder: "Afternoon Sing-Along" });
  const date = h("input", { id: "date", type: "date", required: true, min: today() });
  const time = h("input", { id: "time", type: "time", required: true, value: "14:00" });
  const length = h("input", { id: "length", type: "number", min: 10, max: 60, step: 5, value: "25", required: true });
  const audience = h("textarea", { id: "audience", rows: 2, placeholder: "About 30 residents who love to sing along." });
  const requestNote = h("input", { id: "requestNote", placeholder: "For Mrs. Alvarez's 90th birthday" });
  const occasion = h("select", { id: "occasion" }, h("option", { value: "" }, "Just good music"),
    EVENTS.map((e) => h("option", { value: e.id }, e.label)));
  const avoid = h("input", { id: "avoid", placeholder: "Sad or slow goodbye songs" });
  const request = h("select", { id: "request" }, h("option", { value: "" }, "No special request"),
    EVENTS.map((e) => h("optgroup", { label: e.label },
      ctx.songs.filter((s) => s.events[0] === e.id).map((s) => h("option", { value: s.id }, s.artist ? `${s.title} (${s.artist})` : s.title)))));

  let picked = [];
  const chipBox = h("div", { class: "chips" });
  const drawChips = () => chipBox.replaceChildren(...VIBES.map((v) =>
    h("button", { type: "button", class: "chip", "aria-pressed": picked.includes(v) ? "true" : "false", onClick: () => {
      if (picked.includes(v)) picked = picked.filter((x) => x !== v);
      else picked = [...picked, v].slice(-2);
      drawChips();
    } }, v)));
  drawChips();

  const equip = [["piano", "Piano"], ["sound", "Sound system"], ["outlets", "Outlets"], ["accessible", "Wheelchair access"]]
    .map(([key, label]) => ({ key, box: h("input", { type: "checkbox", id: `eq-${key}` }), label }));

  const submit = h("button", { class: "btn btn--primary btn--block", type: "submit" }, "Post gig");
  const form = h("form", { class: "stack", onSubmit: (e) => {
    e.preventDefault();
    const minutes = Number(length.value);
    if (!picked.length) { toast("Pick at least one vibe.", "error"); return; }
    if (minutes < 10 || minutes > 60) { toast("Set length must be 10 to 60 minutes.", "error"); return; }
    act(submit, async () => {
      const id = await api.postGig({
        title: title.value.trim(), date: date.value, time: to12h(time.value), lengthMin: minutes,
        vibes: picked, occasion: occasion.value, audience: audience.value.trim(),
        equipment: Object.fromEntries(equip.map((x) => [x.key, x.box.checked])),
        request: request.value, requestNote: requestNote.value.trim(), avoid: avoid.value.trim()
      });
      ctx.go(`#/org/gig/${id}`);
    }, "Gig posted! Teens can request it now.");
  } },
    field("title", "Event name", title),
    h("div", { class: "grid-3" }, field("date", "Date", date), field("time", "Time", time), field("length", "Minutes", length)),
    h("fieldset", { class: "stack-tight" }, h("legend", {}, "Vibe (pick up to 2)"), chipBox),
    field("occasion", "What's the occasion? (optional)", occasion, "The planner favors songs that suit it."),
    field("audience", "Who's in the audience?", audience),
    h("fieldset", {}, h("legend", {}, "What the venue has"),
      h("div", { class: "grid-2" }, equip.map((x) => h("label", { class: "check", for: x.box.id }, x.box, x.label)))),
    field("request", "Special request (optional)", request, "Pick a song from the library, grouped by occasion."),
    field("requestNote", "Who is it for? (optional)", requestNote),
    field("avoid", "Songs or themes to avoid", avoid),
    submit);

  return h("div", { class: "screen-stack" }, backLink("#/org", "My gigs"), h("h1", {}, "Request live music"), form);
}

function to12h(value) {
  const [hh, mm] = value.split(":").map(Number);
  const suffix = hh >= 12 ? "PM" : "AM";
  return `${((hh + 11) % 12) + 1}:${String(mm).padStart(2, "0")} ${suffix}`;
}

// Legacy clips point at a file in public/audio; new ones are fetched only when the organizer asks to listen.
function clipPlayer(c, teenId) {
  const audio = (src, autoplay) => h("audio", { controls: true, src, autoplay, "aria-label": `Sample: ${c.title}` });
  const box = h("div", { class: "clip" }, h("span", { class: "small strong" }, c.title));
  if (c.file) { box.append(audio(c.file, false)); return box; }
  const btn = h("button", { type: "button", class: "btn btn--secondary", onClick: () =>
    act(btn, async () => { box.replaceChildren(h("span", { class: "small strong" }, c.title), audio(await api.getClipSrc(teenId, c.id), true)); }) },
    `Listen${c.seconds ? ` (${formatTime(c.seconds)})` : ""}`);
  box.append(btn);
  return box;
}

function recordText(r) {
  if (!r) return "Past gigs and cancellations show once your organization is verified";
  const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;
  return `${plural(r.pastGigs, "past gig")} · ${plural(r.cancellations, "cancellation")}`;
}

// ---------- Manage one gig: choose performers, split time, shared set ----------
export async function manageGigView([gigId], ctx) {
  const u = ctx.user;
  const gig = await api.getGig(gigId);
  if (!gig || gig.orgId !== u.id) return h("div", { class: "screen-stack" }, backLink("#/org", "My gigs"), h("h1", {}, "Gig not found"));
  const [apps, set] = await Promise.all([api.listAppsForGig(gigId), api.getSet(gigId)]);
  const profiles = {}, records = {};
  await Promise.all(apps.map(async (a) => {
    [profiles[a.teenId], records[a.teenId]] = await Promise.all([api.getUser(a.teenId), api.getTeenRecord(a.teenId).catch(() => null)]);
  }));
  const performers = activePerformers(apps);
  const locked = gig.status === "done";
  const len = gig.lengthMin;

  // Re-split minutes whenever the set of performers changes.
  async function applyRoles(changedTeen, role) {
    const next = apps.map((a) => (a.teenId === changedTeen ? { ...a, role } : a));
    const perf = activePerformers(next);
    if (perf.length > 2) { toast("Up to 2 acts per gig. Change someone else first.", "error"); return; }
    let minutes = {};
    if (perf.length === 1) minutes = { [perf[0].teenId]: len };
    if (perf.length === 2) {
      const first = Math.min(len - 5, Math.ceil(len / 2 / 5) * 5);
      minutes = { [perf[0].teenId]: first, [perf[1].teenId]: len - first };
    }
    await api.setAppRole(gigId, changedTeen, role, minutes[changedTeen] || 0);
    for (const p of perf) if (p.teenId !== changedTeen) await api.setAppRole(gigId, p.teenId, "perform", minutes[p.teenId]);
    ctx.refresh();
  }

  const card = (a) => {
    const p = profiles[a.teenId] || {};
    const cancelled = a.response === "cancelled";
    const roles = [["perform", "Perform"], ["backup", "Backup"], ["declined", "Not this time"]];
    const knowsRequest = gig.request && (p.canPerform || []).includes(gig.request);
    return h("article", { class: "card stack", "aria-label": `Applicant ${a.teenName}` },
      h("div", { class: "row" },
        h("span", { class: "avatar", "aria-hidden": "true" }, initials(a.teenName)),
        h("span", { class: "stack-tight grow" },
          h("strong", {}, a.teenName),
          h("span", { class: "muted small" }, `${(p.instruments || []).join(", ") || "Instruments not listed"} · ${(p.canPerform || []).length} songs`),
          h("span", { class: "muted small" }, recordText(records[a.teenId])),
          p.adult ? h("span", { class: "tag" }, "Adult performer") : null,
          knowsRequest ? h("span", { class: "small ok" }, "Can play your special request") : null),
        cancelled ? h("span", { class: "tag tag--warn" }, "Cancelled") : a.wasBackup ? h("span", { class: "tag tag--backup" }, "Backup, took the spot") : null),
      (p.clips || []).length ? (u.verified
        ? h("div", { class: "stack-tight" }, p.clips.map((c) => clipPlayer(c, a.teenId)))
        : h("p", { class: "muted small" }, `${p.clips.length} sample clip(s) available once your organization is verified.`)) : null,
      cancelled || locked ? null : h("div", { class: "segmented", role: "group", "aria-label": `Role for ${a.teenName}` },
        roles.map(([value, label]) => h("button", { type: "button", "aria-pressed": a.role === value ? "true" : "false",
          onClick: (e) => { if (a.role !== value) act(e.currentTarget, () => applyRoles(a.teenId, value)); } }, label))));
  };

  let split = null;
  if (performers.length === 2 && !locked) {
    const [p1, p2] = performers;
    const change = (delta) => (e) => {
      const m1 = p1.minutes + delta;
      if (m1 < 5 || len - m1 < 5) return;
      act(e.currentTarget, async () => {
        await api.setAppRole(gigId, p1.teenId, "perform", m1);
        await api.setAppRole(gigId, p2.teenId, "perform", len - m1);
        ctx.refresh();
      });
    };
    split = h("section", { class: "card card--dark stack" },
      h("p", { class: "eyebrow eyebrow--light" }, "Both perform"),
      h("h2", { class: "h3" }, `Split the ${len} minutes`),
      h("div", { class: "bar" },
        h("span", { style: { width: `${(p1.minutes / len) * 100}%`, background: "#C9BCFF" } }),
        h("span", { style: { width: `${(p2.minutes / len) * 100}%`, background: "#7FD6CF" } })),
      h("div", { class: "row row--between" },
        h("span", {}, p1.teenName),
        h("span", { class: "row" },
          h("button", { class: "btn btn--outline-light btn--square", "aria-label": `Give ${p1.teenName} 5 fewer minutes`, onClick: change(-5) }, "−"),
          h("strong", { class: "minutes" }, `${p1.minutes} min`),
          h("button", { class: "btn btn--outline-light btn--square", "aria-label": `Give ${p1.teenName} 5 more minutes`, onClick: change(5) }, "+"))),
      h("div", { class: "row row--between" }, h("span", {}, p2.teenName), h("strong", { class: "minutes" }, `${p2.minutes} min`)));
  }

  const backups = apps.filter((a) => a.role === "backup" && a.response !== "passed");
  const actions = [];
  if (gig.cancelledBy && !gig.backupTaken) {
    const who = apps.find((a) => a.teenId === gig.cancelledBy);
    actions.push(h("p", { class: "notice notice--warn" }, gig.offeredTo
      ? `${who ? who.teenName : "A performer"} cancelled. The backup has been offered the spot.`
      : `${who ? who.teenName : "A performer"} cancelled and no backup is available. Choose another applicant to perform.`));
  }
  if (gig.status === "open" && performers.length) {
    actions.push(h("button", { class: "btn btn--primary btn--block", onClick: (e) =>
      act(e.currentTarget, async () => { await api.updateGig(gigId, { status: "filled" }); ctx.refresh(); },
        "Performers confirmed. They can see it on their home screen.") },
      `Confirm ${performers.map((p) => p.teenName).join(" & ")}`));
  }
  if (gig.status === "filled" && performers.length === 2) {
    actions.push(h("button", { class: "btn btn--primary btn--block", onClick: (e) =>
      act(e.currentTarget, async () => {
        const acts = performers.map((p) => ({ id: p.teenId, name: p.teenName, minutes: p.minutes,
          canPerform: (profiles[p.teenId] || {}).canPerform || [] }));
        const own = performers.flatMap((p) => (profiles[p.teenId] || {}).customSongs || []);
        const shared = planShared({ gig, performers: acts, songs: [...ctx.songs, ...own] });
        await api.saveSet(gigId, { items: shared.items, totalSeconds: shared.totalSeconds, targetSeconds: shared.targetSeconds,
          acts: shared.acts, notes: shared.notes, requestIncluded: shared.requestIncluded });
        ctx.go(`#/set/${gigId}`);
      }, "Shared set built. Review and approve it.") }, set ? "Rebuild shared set" : "Build shared set"));
  }
  if (gig.status === "filled" && performers.length === 1 && !set) {
    actions.push(h("p", { class: "notice" }, `${performers[0].teenName} builds the set in their planner. You'll be able to approve it here.`));
  }
  if (set) {
    actions.push(h("a", { href: `#/set/${gigId}`, class: "btn btn--secondary btn--block" },
      `View set (${formatTime(set.totalSeconds)}) · ${set.approved ? "approved" : "needs your approval"}`));
  }

  return h("div", { class: "screen-stack" },
    backLink("#/org", "My gigs"),
    h("div", { class: "stack-tight" },
      h("p", { class: "eyebrow" }, STATUS_LABEL[gig.status] || gig.status),
      h("h1", {}, gig.title),
      h("p", { class: "muted" }, `${fmtDate(gig.date)} · ${gig.time} · ${len} min · ${(gig.vibes || []).join(", ")}`)),
    h("section", { class: "stack" },
      h("h2", {}, apps.length === 1 ? "1 performer applied" : `${apps.length} performers applied`),
      apps.length ? h("p", { class: "muted small" }, "Choose who performs (up to 2), who's the backup, or not this time. Samples are visible only to verified organizers.") : null,
      apps.length ? apps.map(card) : empty("No requests yet. Teens see your gig on their home screen.")),
    split,
    ...actions);
}
