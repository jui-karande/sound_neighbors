// Impact screen (hours, badges, reflection) and printable hours certificate.
import { api } from "../db.js";
import { h, act, fmtDate, progress, backLink, empty, icon } from "../ui.js";
import { computeStats, computeBadges } from "../badges.js";

async function loadHistory(u) {
  const [logs, apps] = await Promise.all([api.listMyHourLogs(u.id), api.listMyApps(u.id)]);
  const gigIds = [...new Set([...logs.map((l) => l.gigId), ...apps.map((a) => a.gigId)])];
  const gigs = {}, sets = {};
  await Promise.all(gigIds.map(async (id) => {
    gigs[id] = await api.getGig(id);
    if (logs.some((l) => l.gigId === id)) sets[id] = await api.getSet(id);
  }));
  logs.sort((a, b) => b.date.localeCompare(a.date));
  return { logs, apps, gigs, sets };
}

const fmtHours = (n) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

export async function impactView(_, ctx) {
  const u = ctx.user;
  const { logs, apps, gigs, sets } = await loadHistory(u);
  const stats = computeStats(logs);
  const badges = computeBadges({ logs, apps, gigs, sets, me: u.id });
  const reflections = { ...(u.reflections || {}) };
  const latest = logs[0];

  const milestone = stats.next
    ? h("section", { class: "card stack-tight" },
      h("div", { class: "row row--between" }, h("strong", {}, `Next milestone: ${stats.next} hours`),
        h("span", { class: "muted small" }, `${fmtHours(stats.next - stats.hours)} to go`)),
      progress((stats.hours - stats.prev) / (stats.next - stats.prev), "Progress to next milestone"))
    : h("p", { class: "notice notice--success" }, "You've passed 100 hours. Amazing!");

  let reflection = null;
  if (latest && gigs[latest.gigId]) {
    const g = gigs[latest.gigId];
    const box = h("textarea", { id: "reflect", rows: 3, placeholder: "Write a few sentences…" });
    box.value = reflections[latest.gigId] || "";
    reflection = h("section", { class: "card stack-tight" },
      h("label", { for: "reflect", class: "strong" }, `After ${g.orgName}: what did you learn about your community?`),
      box,
      h("button", { class: "btn btn--secondary", onClick: (e) =>
        act(e.currentTarget, async () => {
          reflections[latest.gigId] = box.value.trim();
          await api.updateMe({ reflections });
          await ctx.reloadUser();
        }, "Reflection saved.") }, "Save reflection"),
      h("p", { class: "muted small" }, "Saved with your hours, for service-learning write-ups."));
  }

  return h("div", { class: "screen-stack" },
    h("div", {}, h("h1", {}, "Your impact"), h("p", { class: "muted" }, "Every hour is confirmed by the organizer.")),
    h("div", { class: "stats" },
      stat(fmtHours(stats.hours), "Community hours", true), stat(stats.gigs, "Gigs played"),
      stat(stats.venues, "Venues served"), stat(apps.filter((a) => a.role === "backup" || a.wasBackup).length, "Times as backup")),
    milestone,
    h("section", { class: "stack-tight" },
      h("h2", {}, "Badges"),
      h("ul", { class: "badges" }, badges.map((b) =>
        h("li", { class: `badge ${b.earned ? "badge--earned" : ""}` },
          h("span", { class: "badge__icon" }, b.earned ? icon.star() : icon.lock()),
          h("strong", {}, b.name),
          h("span", { class: "muted small" }, b.earned ? b.note : b.hint),
          h("span", { class: "sr-only" }, b.earned ? "Earned" : "Not earned yet"))))),
    reflection,
    logs.length ? h("a", { href: "#/certificate", class: "btn btn--primary btn--block" }, "View hours certificate") : null,
    h("section", { class: "stack-tight" },
      h("h2", {}, "Hour log"),
      logs.length ? h("ul", { class: "list" }, logs.map((l) => {
        const g = gigs[l.gigId] || {};
        return h("li", { class: "card row row--between" },
          h("span", {}, h("strong", {}, g.orgName || "Gig"), h("span", { class: "muted small block" }, `${g.title || ""} · ${fmtDate(l.date)}`)),
          h("strong", {}, `${fmtHours(Number(l.hours))} h`));
      })) : empty("Hours appear here after an organizer confirms your gig.")));
}

function stat(value, label, dark = false) {
  return h("div", { class: `card stat ${dark ? "card--dark" : ""}` },
    h("span", { class: "stat__value" }, String(value)), h("span", { class: "stat__label" }, label));
}

export async function certificateView(_, ctx) {
  const u = ctx.user;
  const { logs, gigs } = await loadHistory(u);
  const stats = computeStats(logs);
  return h("div", { class: "screen-stack" },
    h("div", { class: "no-print" }, backLink("#/impact", "Impact")),
    h("article", { class: "certificate" },
      h("p", { class: "eyebrow" }, "Sound Neighbors"),
      h("h1", {}, "Community Service Hours"),
      h("p", {}, `This confirms that ${u.name} performed live music for the community, with each gig confirmed by the hosting organization.`),
      h("table", { class: "cert-table" },
        h("thead", {}, h("tr", {}, h("th", {}, "Date"), h("th", {}, "Organization"), h("th", {}, "Event"), h("th", { class: "num" }, "Hours"))),
        h("tbody", {}, logs.map((l) => {
          const g = gigs[l.gigId] || {};
          return h("tr", {}, h("td", {}, fmtDate(l.date, { month: "short", day: "numeric", year: "numeric" })),
            h("td", {}, g.orgName || ""), h("td", {}, g.title || ""), h("td", { class: "num" }, fmtHours(Number(l.hours))));
        })),
        h("tfoot", {}, h("tr", {}, h("th", { colspan: 3 }, "Total"), h("th", { class: "num" }, fmtHours(stats.hours))))),
      h("p", { class: "muted small" }, `Generated ${fmtDate(new Date().toISOString().slice(0, 10), { month: "long", day: "numeric", year: "numeric" })}. Confirmed by organizers on Sound Neighbors.`)),
    h("button", { class: "btn btn--primary btn--block no-print", onClick: () => window.print() }, "Print or save as PDF"));
}
