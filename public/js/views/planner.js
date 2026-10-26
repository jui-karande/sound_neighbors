// Set planner screen (teen) and the set view (everyone).
import { api } from "../db.js";
import { h, svg, act, fmtDate, backLink, empty } from "../ui.js";
import { planSet, formatTime } from "../planner.js";
import { eventLabel } from "../events.js";

const ACT_COLORS = ["#5B3FD1", "#0F6B6B", "#B7791F"];

export async function plannerView([gigId], ctx) {
  const u = ctx.user;
  const [gig, app, saved] = await Promise.all([api.getGig(gigId), api.getApp(gigId, u.id), api.getSet(gigId)]);
  const back = backLink("#/teen", "Home");
  if (!gig || !app || app.role !== "perform" || app.response === "cancelled") {
    return h("div", { class: "screen-stack" }, back, h("h1", {}, "Set planner"),
      h("p", { class: "notice" }, "You can plan a set once the organizer confirms you as a performer."));
  }

  const header = h("div", { class: "stack-tight" },
    h("p", { class: "eyebrow" }, "AI set planner"),
    h("h1", {}, gig.title),
    h("p", { class: "muted" }, `${gig.orgName} · ${fmtDate(gig.date)} · ${gig.time}`));

  // Two acts: the organizer builds one shared set for both.
  if (app.minutes < gig.lengthMin) {
    return h("div", { class: "screen-stack" }, back, header,
      h("p", { class: "notice" }, `You're one of two acts, playing ${app.minutes} of ${gig.lengthMin} minutes. Your organizer builds the shared set so nobody repeats a song.`),
      saved ? renderSet(saved, gig) : empty("The shared set isn't ready yet."));
  }

  let seed = 0;
  const removed = new Set();
  const area = h("div", { class: "stack" });
  const performer = () => ({ id: u.id, name: u.name, minutes: app.minutes,
    canPerform: (u.canPerform || []).filter((id) => !removed.has(id)) });

  const settings = h("section", { class: "card stack-tight" },
    settingRow("Set length", `${app.minutes} min (incl. 1:30 intro)`),
    gig.occasion ? settingRow("Occasion", eventLabel(gig.occasion)) : null,
    settingRow("Vibe", (gig.vibes || []).join(", ") || "Any"),
    settingRow("Venue", Object.entries(gig.equipment || {}).filter(([, v]) => v).map(([k]) => k).join(", ") || "Basic room"),
    gig.avoid ? settingRow("Avoid", gig.avoid) : null,
    settingRow("Your songs", `${(u.canPerform || []).length} on your list`));

  function showPlan() {
    const set = planSet({ gig, performer: performer(), songs: [...ctx.songs, ...(u.customSongs || [])], seed });
    const shareBtn = h("button", { class: "btn btn--primary btn--block", onClick: (e) =>
      act(e.currentTarget, async () => {
        await api.saveSet(gig.id, { items: set.items, totalSeconds: set.totalSeconds,
          targetSeconds: set.targetSeconds, acts: set.acts, notes: set.notes, requestIncluded: set.requestIncluded });
        ctx.go(`#/set/${gig.id}`);
      }, `Shared with ${gig.orgName}!`) }, `Share set with ${gig.orgName}`);
    area.replaceChildren(
      renderSet(set, gig, {
        onRemove: (songId) => { removed.add(songId); showPlan(); }
      }),
      h("div", { class: "row" },
        h("button", { class: "btn btn--secondary", onClick: () => { seed += 1; showPlan(); } }, "Rebuild"),
        removed.size ? h("button", { class: "btn btn--secondary", onClick: () => { removed.clear(); showPlan(); } }, "Undo removals") : null),
      set.items.length ? shareBtn : null);
  }

  if (saved && saved.builtBy === u.id) {
    area.replaceChildren(
      h("p", { class: `notice ${saved.approved ? "notice--success" : ""}` },
        saved.approved ? "Your set is approved by the organizer." : "Shared · waiting for the organizer to approve."),
      renderSet(saved, gig),
      h("button", { class: "btn btn--secondary", onClick: showPlan }, "Make a new plan"));
  } else {
    area.replaceChildren(h("button", { class: "btn btn--primary btn--block", onClick: showPlan }, "Build my set"));
  }

  return h("div", { class: "screen-stack" }, back, header, settings, area);
}

function settingRow(label, value) {
  return h("div", { class: "row row--between small" }, h("span", { class: "muted" }, label), h("strong", {}, value));
}

// Draws a planned or saved set: time bars, energy arc, song list, explanation.
export function renderSet(set, gig, { onRemove = null } = {}) {
  const items = set.items || [];
  const acts = (set.acts && set.acts.length) ? set.acts : [];
  const colorFor = (id) => {
    if (id === "together") return ACT_COLORS[2];
    const i = acts.findIndex((a) => a.performerId === id);
    return ACT_COLORS[Math.max(0, i)];
  };
  const target = set.targetSeconds || gig.lengthMin * 60;

  const timeCard = h("section", { class: "card card--dark stack-tight", "aria-label": "Time fit" },
    h("div", { class: "row row--between" },
      h("strong", {}, "Fits your time"),
      h("span", { class: "on-dark" }, h("strong", { class: "big" }, formatTime(set.totalSeconds)), ` of ${formatTime(target)}`)),
    h("div", { class: "bar", role: "img", "aria-label": `${formatTime(set.totalSeconds)} used of ${formatTime(target)}` },
      ...(acts.length > 1
        ? acts.map((a) => h("span", { style: { width: `${(a.usedSeconds / target) * 100}%`, background: colorFor(a.performerId) } }))
        : [h("span", { style: { width: `${(set.totalSeconds / target) * 100}%`, background: "#F6B23C" } })])),
    acts.length > 1 ? h("div", { class: "stack-tight small on-dark" }, acts.map((a) =>
      h("div", { class: "row row--between" },
        h("span", { class: "row" }, h("span", { class: "swatch", style: { background: colorFor(a.performerId) } }), a.performerName),
        h("span", {}, `${formatTime(a.usedSeconds)} of ${formatTime(a.targetSeconds)}`)))) : null);

  const list = h("ol", { class: "set-list" }, items.map((it) =>
    h("li", { class: "card set-item" },
      acts.length > 1 || it.performerId === "together"
        ? h("span", { class: "who", style: { borderColor: colorFor(it.performerId), color: colorFor(it.performerId) } },
          it.performerId === "together" ? "Both" : initialsOf(it.performerName))
        : null,
      h("span", { class: "set-item__text" },
        h("strong", {}, it.title),
        h("span", { class: "muted small" }, `Energy ${it.energy}/5 · ${it.moods.join(", ")}${gig.request === it.songId ? " · Request" : ""}`)),
      h("span", { class: "time" }, formatTime(it.seconds)),
      onRemove ? h("button", { class: "btn btn--icon", "aria-label": `Remove ${it.title}`, onClick: () => onRemove(it.songId) }, "×") : null)));

  return h("div", { class: "stack" },
    timeCard,
    items.length > 1 ? energyArc(items) : null,
    h("section", { class: "stack-tight" }, h("h2", {}, "Running order"), items.length ? list : empty("No songs yet.")),
    set.notes && set.notes.length ? h("section", { class: "card stack-tight" },
      h("h2", { class: "h3" }, "Why this set"),
      h("ul", { class: "notes" }, set.notes.map((n) => h("li", {}, n)))) : null);
}

function initialsOf(name = "") {
  return name.split(/[\s&]+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join("");
}

function energyArc(items) {
  const w = 320, ht = 96, pad = 14;
  const x = (i) => pad + (i * (w - pad * 2)) / Math.max(1, items.length - 1);
  const y = (e) => ht - 22 - ((e - 1) / 4) * (ht - 40);
  const d = items.map((it, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(it.energy).toFixed(1)}`).join(" ");
  const label = `Energy by song: ${items.map((it) => it.energy).join(", ")} out of 5`;
  return h("section", { class: "card stack-tight" },
    h("div", { class: "row row--between" }, h("strong", {}, "Energy arc"), h("span", { class: "muted small" }, "Calm start → peak → sing-along")),
    svg("svg", { viewBox: `0 0 ${w} ${ht}`, width: "100%", role: "img", "aria-label": label },
      svg("path", { d, fill: "none", stroke: "#5B3FD1", "stroke-width": 3, "stroke-linecap": "round", "stroke-linejoin": "round" }),
      ...items.map((it, i) => svg("circle", { cx: x(i), cy: y(it.energy), r: 5, fill: "#5B3FD1" })),
      ...items.map((_, i) => svg("text", { x: x(i), y: ht - 4, "text-anchor": "middle", "font-size": 11, fill: "#5A5670" }, String(i + 1)))));
}

// ---------- Set view (#/set/:gigId) ----------
export async function setView([gigId], ctx) {
  const u = ctx.user;
  const [gig, set] = await Promise.all([api.getGig(gigId), api.getSet(gigId)]);
  const back = backLink(u.role === "organizer" ? `#/org/gig/${gigId}` : "#/teen", "Back");
  if (!gig || !set) return h("div", { class: "screen-stack" }, back, h("h1", {}, "Set"), empty("No set has been shared yet."));
  const isOwner = u.role === "organizer" && gig.orgId === u.id;
  return h("div", { class: "screen-stack" }, back,
    h("div", { class: "stack-tight" },
      h("p", { class: "eyebrow" }, (set.acts || []).length > 1 ? "Shared set" : "Set list"),
      h("h1", {}, gig.title),
      h("p", { class: "muted" }, `${gig.orgName} · ${fmtDate(gig.date)} · ${gig.time}`)),
    renderSet(set, gig),
    set.approved
      ? h("p", { class: "notice notice--success" }, "Approved by the organizer.")
      : isOwner
        ? h("button", { class: "btn btn--primary btn--block", onClick: (e) =>
          act(e.currentTarget, async () => { await api.approveSet(gigId); ctx.refresh(); }, "Set approved. Performers can see it.") }, "Approve set")
        : h("p", { class: "notice" }, "Waiting for the organizer to approve."));
}
