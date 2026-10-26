// Teen screens: home, gig details, and "My songs" profile.
import { api, today, activePerformers } from "../db.js";
import { h, act, toast, fmtDate, dateBlock, icon, backLink, empty, readClip, dropzone, CLIP_MAX_COUNT, CLIP_MAX_BYTES } from "../ui.js";
import { formatTime } from "../planner.js";
import { EVENTS, eventLabel } from "../events.js";
import { MOODS, MAX_CUSTOM_SONGS, makeCustomSong } from "../songs.js";
import { approvedToPerform } from "../age.js";

const songTitle = (ctx, id) => (ctx.songs.find((s) => s.id === id) || {}).title || "";

function gigRow(gig, extra, orgVerified = true) {
  return h("a", { href: `#/gig/${gig.id}`, class: "card gig-row" },
    dateBlock(gig.date),
    h("span", { class: "gig-row__text" },
      h("strong", {}, gig.orgName),
      h("span", { class: "muted small" }, `${gig.title} · ${gig.lengthMin} min`),
      h("span", { class: "vibe-line" }, (gig.vibes || []).join(" · ")),
      orgVerified ? null : h("span", { class: "tag" }, "Unverified organization"),
      extra || null));
}

// ---------- Home ----------
export async function teenHome(_, ctx) {
  const u = ctx.user;
  const apps = await api.listMyApps(u.id);
  const gigsById = {};
  await Promise.all(apps.map(async (a) => { gigsById[a.gigId] = await api.getGig(a.gigId); }));
  const now = today();
  const upcoming = (a) => gigsById[a.gigId] && gigsById[a.gigId].date >= now && gigsById[a.gigId].status !== "done";

  const offers = apps.filter((a) => {
    const g = gigsById[a.gigId];
    return a.role === "backup" && a.response !== "passed" && upcoming(a) && g.offeredTo === u.id && !g.backupTaken;
  });
  const confirmed = apps.filter((a) => a.role === "perform" && a.response !== "cancelled" && upcoming(a))
    .sort((a, b) => gigsById[a.gigId].date.localeCompare(gigsById[b.gigId].date));
  const waitingBackup = apps.filter((a) => a.role === "backup" && upcoming(a) && !offers.includes(a));
  const pending = apps.filter((a) => a.role === "pending" && upcoming(a));
  const declined = apps.filter((a) => a.role === "declined" && upcoming(a));
  const appliedIds = new Set(apps.map((a) => a.gigId));

  const openList = h("div", { class: "list", "aria-live": "polite" }, h("p", { class: "muted" }, "Loading gigs…"));
  const declinedBox = h("div", { class: "stack" });
  let openGigs = [];
  const kindNote = (a) => {
    const g = gigsById[a.gigId];
    const others = openGigs.filter((x) => !appliedIds.has(x.id)).slice(0, 3);
    return h("section", { class: "card" },
      h("h2", { class: "h3" }, `Not this time at ${g.orgName}`),
      h("p", { class: "muted" }, `Thanks for applying to "${g.title}". They picked another act this time. Here are gigs that could be a great fit:`),
      others.length ? h("div", { class: "list" }, others.map((x) => gigRow(x))) : empty("New gigs are posted often."));
  };

  const orgVerified = {};   // orgId -> admin-verified? (looked up once per organization)
  const unsubscribe = api.watchOpenGigs(async (gigs) => {
    openGigs = gigs.filter((g) => g.date >= now);
    await Promise.all([...new Set(openGigs.map((g) => g.orgId))].filter((id) => !(id in orgVerified)).map(async (id) => {
      try { orgVerified[id] = Boolean((await api.getUser(id) || {}).verified); } catch (e) { orgVerified[id] = false; }
    }));
    openList.replaceChildren(...(openGigs.length
      ? openGigs.map((g) => gigRow(g, appliedIds.has(g.id) ? h("span", { class: "tag" }, "Requested") : null, orgVerified[g.orgId]))
      : [empty("No open gigs right now. Check back soon.")]));
    declinedBox.replaceChildren(...declined.map(kindNote));
  }, (err) => { console.error(err); openList.replaceChildren(empty("Couldn't load gigs. See the console.")); });
  ctx.onCleanup(unsubscribe);

  return h("div", { class: "screen-stack" },
    h("div", {}, h("p", { class: "muted" }, `Hi, ${u.name}`), h("h1", {}, "Your gigs")),

    !approvedToPerform(u) ? h("p", { class: "notice notice--warn" },
      "A parent or guardian needs to approve your account before you can request gigs. You can still look around.") : null,
    !(u.canPerform || []).length ? h("a", { href: "#/profile", class: "notice notice--warn" },
      "Add the songs you can perform so the set planner can build your sets →") : null,

    ...offers.map((a) => {
      const g = gigsById[a.gigId];
      const accept = h("button", { class: "btn btn--dark", onClick: (e) =>
        act(e.currentTarget, async () => { await api.acceptBackup(g.id); ctx.go(`#/plan/${g.id}`); }, "You're in! Plan your set next.") }, "Accept the gig");
      const pass = h("button", { class: "btn btn--outline-dark", onClick: (e) =>
        act(e.currentTarget, async () => { await api.passBackup(g.id); ctx.refresh(); }, "No problem. Passing doesn't affect your Reliable badge.") }, "Pass");
      return h("section", { class: "card card--alert" },
        h("p", { class: "eyebrow eyebrow--dark" }, "A spot opened"),
        h("h2", {}, `${g.orgName}'s gig is yours if you want it`),
        h("p", {}, `${g.title} · ${fmtDate(g.date)} · ${g.time}. The performer can't make it. You'd play ${g.cancelledMinutes} minutes.`),
        h("div", { class: "row" }, pass, accept));
    }),

    ...confirmed.map((a, i) => {
      const g = gigsById[a.gigId];
      const cancel = h("button", { class: "btn btn--outline-light", onClick: (e) => {
        if (!confirm(`Cancel your performance at ${g.orgName}? Your backup will be offered the spot.`)) return;
        act(e.currentTarget, async () => { await api.cancelPerformance(g.id); ctx.refresh(); }, "Cancelled. The organizer and backup have been told.");
      } }, "Can't make it");
      return h("section", { class: "card card--dark" },
        h("div", { class: "row row--between" },
          h("p", { class: "eyebrow eyebrow--light" }, i === 0 ? "Your next gig" : "Upcoming gig"),
          h("span", { class: "tag tag--confirmed" }, "Confirmed")),
        h("h2", {}, g.orgName),
        h("p", { class: "on-dark" }, `${fmtDate(g.date)} · ${g.time} · ${a.minutes} min${a.minutes < g.lengthMin ? ` of ${g.lengthMin}` : ""}`),
        g.request ? h("p", { class: "on-dark small" }, `Special request: ${songTitle(ctx, g.request)}`) : null,
        h("div", { class: "row" },
          h("a", { href: `#/plan/${g.id}`, class: "btn btn--light grow" }, "Plan my set"),
          h("a", { href: `#/gig/${g.id}`, class: "btn btn--outline-light" }, "Details")),
        cancel);
    }),

    ...waitingBackup.map((a) => {
      const g = gigsById[a.gigId];
      return h("section", { class: "card card--teal" },
        h("p", { class: "eyebrow eyebrow--teal" }, "You're the backup"),
        h("h2", { class: "h3" }, `${g.orgName} · ${fmtDate(g.date)}`),
        h("p", { class: "muted" }, "If the performer can't make it, you'll get the first offer here. Keep two songs ready."));
    }),

    pending.length ? h("section", { class: "stack" },
      h("h2", {}, "Waiting to hear back"),
      h("div", { class: "list" }, pending.map((a) => gigRow(gigsById[a.gigId], h("span", { class: "tag" }, "Requested"))))) : null,

    declinedBox,

    h("section", { class: "stack" }, h("h2", {}, "Open gigs near you"), openList)
  );
}

// ---------- Gig details ----------
export async function gigDetail([gigId], ctx) {
  const u = ctx.user;
  const [gig, app] = await Promise.all([api.getGig(gigId), api.getApp(gigId, u.id)]);
  if (!gig) return h("div", { class: "screen-stack" }, backLink("#/teen", "Back"), h("h1", {}, "Gig not found"));
  const org = await api.getUser(gig.orgId).catch(() => null);
  const orgVerified = Boolean(org && org.verified);

  const eq = gig.equipment || {};
  const equipItem = (has, label) => h("li", { class: has ? "has" : "lacks" },
    h("span", { class: "sr-only" }, has ? "Has: " : "Doesn't have: "), label);

  let action;
  if (!app) {
    if (gig.status !== "open") action = h("p", { class: "notice" }, "This gig is no longer taking requests.");
    else if (!u.emailVerified) action = h("p", { class: "notice notice--warn" }, "Confirm your email first. Use the link we emailed you, then tap \"I've confirmed it\" at the top of the screen.");
    else if (!approvedToPerform(u)) action = h("p", { class: "notice notice--warn" }, "A parent or guardian needs to approve your account before you can request gigs.");
    else action = h("button", { class: "btn btn--primary btn--block", onClick: (e) =>
      act(e.currentTarget, async () => { await api.apply(gig.id, u.name); ctx.refresh(); }, "Request sent! The organizer will choose performers soon.") },
      "Request this gig");
  } else if (app.role === "pending") {
    action = h("div", { class: "stack" },
      h("p", { class: "notice notice--success" }, "Requested · waiting for the organizer"),
      h("button", { class: "btn btn--secondary", onClick: (e) =>
        act(e.currentTarget, async () => { await api.withdraw(gig.id); ctx.refresh(); }, "Request withdrawn.") }, "Withdraw request"));
  } else if (app.role === "perform" && app.response !== "cancelled") {
    action = h("a", { href: `#/plan/${gig.id}`, class: "btn btn--primary btn--block" }, `You're performing (${app.minutes} min) · Plan my set`);
  } else if (app.role === "backup") {
    action = h("p", { class: "notice" }, "You're the backup for this gig. If a spot opens, you'll see it on your home screen.");
  } else if (app.role === "declined") {
    action = h("p", { class: "notice" }, "Not this time. Thanks for applying! Check your home screen for other gigs.");
  } else {
    action = h("p", { class: "notice" }, "You cancelled this gig.");
  }

  return h("div", { class: "screen-stack" },
    backLink("#/teen", "Back"),
    h("div", { class: "stack-tight" },
      orgVerified ? h("span", { class: "tag tag--verified" }, icon.shield(), "Verified organization")
        : h("span", { class: "tag" }, "Unverified organization"),
      h("h1", {}, gig.title),
      h("p", { class: "muted" }, gig.orgName)),
    h("div", { class: "facts" },
      fact("Date", fmtDate(gig.date)), fact("Time", gig.time), fact("Set length", `${gig.lengthMin} min`)),
    h("section", { class: "card stack" },
      h("h2", { class: "h3" }, "Audience & vibe"),
      h("p", {}, gig.audience || "No details given."),
      h("div", { class: "chips" }, gig.occasion ? h("span", { class: "tag tag--verified" }, eventLabel(gig.occasion)) : null,
        (gig.vibes || []).map((v) => h("span", { class: "tag" }, v))),
      gig.avoid ? h("p", { class: "notice notice--warn" }, `Please avoid: ${gig.avoid}`) : null),
    gig.request ? h("section", { class: "card card--dark" },
      h("p", { class: "eyebrow eyebrow--light" }, "Special request"),
      h("h2", { class: "h3" }, `"${songTitle(ctx, gig.request)}"`),
      gig.requestNote ? h("p", { class: "on-dark" }, gig.requestNote) : null) : null,
    h("section", { class: "card stack" },
      h("h2", { class: "h3" }, "Venue details"),
      h("ul", { class: "equip" },
        equipItem(eq.piano, "Piano"), equipItem(eq.sound, "Sound system"),
        equipItem(eq.outlets, "Outlets nearby"), equipItem(eq.accessible, "Wheelchair access"))),
    action,
    reportBox(gig, ctx));
}

// Spam or safety concern? Anyone can report a gig; the admin reads reports in the Firebase console.
function reportBox(gig, ctx) {
  const reason = h("textarea", { id: "reportReason", rows: 3, maxlength: 500, placeholder: "What looks wrong?" });
  const send = h("button", { class: "btn btn--secondary", onClick: (e) => act(e.currentTarget, async () => {
    if (!reason.value.trim()) throw new Error("Tell us what looks wrong.");
    if (!ctx.user.emailVerified) throw new Error("Confirm your email first, then you can send reports.");
    await api.reportGig(gig, reason.value);
    reason.value = "";
  }, "Thanks. We'll take a look.") }, "Send report");
  return h("details", { class: "card report" },
    h("summary", {}, "Report this gig"),
    h("div", { class: "stack" },
      h("div", { class: "field" }, h("label", { for: "reportReason" }, "Why are you reporting it?"), reason), send));
}

function fact(label, value) {
  return h("div", { class: "card fact" }, h("span", { class: "muted small" }, label), h("strong", {}, value));
}

// ---------- My songs (profile) ----------
export async function profileView(_, ctx) {
  const u = ctx.user;
  const chosen = new Set(u.canPerform || []);
  const customSongs = [...(u.customSongs || [])];
  const clips = [...(u.clips || [])];
  const instruments = h("input", { id: "instruments", value: (u.instruments || []).join(", ") });
  const count = h("span", { class: "muted small", "aria-live": "polite" });
  const updateCount = () => { count.textContent = `${chosen.size} songs selected`; };

  // ----- song library: grouped by occasion, filterable, with the teen's own songs -----
  let filter = "all";
  let search = "";
  const filterBox = h("div", { class: "chips", role: "group", "aria-label": "Show songs for" });
  const songBox = h("div", { class: "stack" });
  const searchInput = h("input", { id: "songSearch", type: "search", placeholder: "Title or artist",
    onInput: (e) => { search = e.target.value.trim().toLowerCase(); drawSongs(); } });

  const songRow = (s) => {
    const box = h("input", { type: "checkbox", id: `song-${s.id}`, checked: chosen.has(s.id),
      onChange: (e) => { e.target.checked ? chosen.add(s.id) : chosen.delete(s.id); updateCount(); } });
    const detail = [s.artist, s.year, formatTime(s.seconds), s.moods.join(", "), s.needs.length ? `needs ${s.needs.join(", ")}` : ""]
      .filter(Boolean).join(" · ");
    return h("div", { class: "song-row" },
      h("label", { class: "song-check", for: `song-${s.id}` }, box,
        h("span", { class: "song-check__text" }, h("strong", {}, s.title), h("span", { class: "muted small" }, detail))),
      s.custom ? h("button", { type: "button", class: "btn btn--secondary", "aria-label": `Delete ${s.title}`, onClick: (e) =>
        act(e.currentTarget, async () => {
          customSongs.splice(customSongs.findIndex((c) => c.id === s.id), 1);
          chosen.delete(s.id);
          await api.updateMe({ customSongs, canPerform: [...chosen] });
          await ctx.reloadUser();
          drawSongs(); updateCount();
        }) }, "Delete") : null);
  };

  const matches = (s) => !search || `${s.title} ${s.artist || ""}`.toLowerCase().includes(search);
  function drawSongs() {
    const everything = [...ctx.songs, ...customSongs];
    let groups;
    if (filter === "all" && !search) {
      // each song is listed once, under its first (main) occasion
      groups = EVENTS.map((e) => ({ title: e.label, blurb: e.blurb, songs: everything.filter((s) => !s.custom && (s.events || [])[0] === e.id) }));
      groups.push({ title: "My own songs", blurb: "Songs you added yourself", songs: customSongs });
    } else {
      const list = everything.filter((s) => matches(s) && (filter === "all" || (filter === "mine" ? s.custom : (s.events || []).includes(filter))));
      const ev = EVENTS.find((e) => e.id === filter);
      groups = [{ title: ev ? ev.label : filter === "mine" ? "My own songs" : "Search results", blurb: ev ? ev.blurb : "", songs: list }];
    }
    songBox.replaceChildren(...groups.filter((g) => g.songs.length || filter !== "all" || search).map((g) =>
      h("section", { class: "stack-tight" },
        h("h3", { class: "h3" }, g.title, h("span", { class: "muted small block" }, g.blurb)),
        g.songs.length ? h("div", { class: "song-checks" }, g.songs.map(songRow)) : empty("No songs here yet."))));
  }
  function drawFilters() {
    const chips = [["all", "All"], ...EVENTS.map((e) => [e.id, e.label]), ["mine", "My songs"]];
    filterBox.replaceChildren(...chips.map(([id, label]) =>
      h("button", { type: "button", class: "chip", "aria-pressed": filter === id ? "true" : "false",
        onClick: () => { filter = id; drawFilters(); drawSongs(); } }, label)));
  }
  drawFilters(); drawSongs(); updateCount();

  // ----- add your own song -----
  let pickedMoods = [];
  const moodBox = h("div", { class: "chips" });
  const drawMoods = () => moodBox.replaceChildren(...MOODS.map((m) =>
    h("button", { type: "button", class: "chip", "aria-pressed": pickedMoods.includes(m) ? "true" : "false", onClick: () => {
      pickedMoods = pickedMoods.includes(m) ? pickedMoods.filter((x) => x !== m) : [...pickedMoods, m].slice(-3);
      drawMoods();
    } }, m)));
  drawMoods();
  const f = {
    title: h("input", { id: "newTitle", maxlength: 60 }),
    artist: h("input", { id: "newArtist", maxlength: 60 }),
    minutes: h("input", { id: "newMin", type: "number", min: 0, max: 10, value: "3" }),
    seconds: h("input", { id: "newSec", type: "number", min: 0, max: 59, value: "30" }),
    energy: h("select", { id: "newEnergy" },
      ["1 · very calm", "2 · gentle", "3 · medium", "4 · lively", "5 · high energy"].map((t, i) => h("option", { value: i + 1, selected: i === 2 }, t))),
    event: h("select", { id: "newEvent" }, h("option", { value: "" }, "Not sure"), EVENTS.map((e) => h("option", { value: e.id }, e.label))),
    piano: h("input", { type: "checkbox", id: "newPiano" })
  };
  const addBtn = h("button", { type: "button", class: "btn btn--secondary", onClick: (e) =>
    act(e.currentTarget, async () => {
      if (customSongs.length >= MAX_CUSTOM_SONGS) throw new Error(`You can add up to ${MAX_CUSTOM_SONGS} songs of your own.`);
      const song = makeCustomSong({
        title: f.title.value, artist: f.artist.value, minutes: f.minutes.value, seconds: f.seconds.value,
        energy: f.energy.value, moods: pickedMoods, events: f.event.value ? [f.event.value] : [], needsPiano: f.piano.checked
      }, `my-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`);
      customSongs.push(song);
      chosen.add(song.id);
      await api.updateMe({ customSongs, canPerform: [...chosen] });
      await ctx.reloadUser();
      f.title.value = ""; f.artist.value = ""; pickedMoods = []; drawMoods();
      filter = "mine"; drawFilters(); drawSongs(); updateCount();
    }, "Song added to your list.") }, "Add to my list");
  const field = (id, label, input) => h("div", { class: "field" }, h("label", { for: id }, label), input);
  const addSong = h("section", { class: "card stack" },
    h("h2", { class: "h3" }, "Add your own song"),
    h("p", { class: "muted small" }, "Songs you add are only on your list. Only the title, artist, and length are saved, never lyrics."),
    field("newTitle", "Song title", f.title), field("newArtist", "Artist (optional)", f.artist),
    h("div", { class: "grid-2" }, field("newMin", "Minutes", f.minutes), field("newSec", "Seconds", f.seconds)),
    field("newEnergy", "How lively is it?", f.energy),
    h("fieldset", { class: "stack-tight" }, h("legend", {}, "Mood (pick 1 to 3)"), moodBox),
    field("newEvent", "Best for (optional)", f.event),
    h("label", { class: "check", for: "newPiano" }, f.piano, "Needs a piano at the venue"),
    addBtn);

  const clipList = h("ul", { class: "list" });
  const drawClips = () => clipList.replaceChildren(...(clips.length ? clips.map((c, i) =>
    h("li", { class: "card row row--between" },
      h("span", {}, h("strong", {}, c.title), h("span", { class: "muted small block" }, c.seconds ? formatTime(c.seconds) : c.file || "")),
      h("button", { class: "btn btn--secondary", "aria-label": `Remove ${c.title}`, onClick: (e) =>
        act(e.currentTarget, async () => {
          if (c.id) await api.removeClip(c.id);
          clips.splice(i, 1);
          await api.updateMe({ clips });
          await ctx.reloadUser();
          drawClips();
        }) }, "Remove")))
    : [empty("No sample clips yet.")]));
  drawClips();
  const clipTitle = h("input", { id: "clipTitle", placeholder: "Shine On, Harvest Moon" });
  const clipStatus = h("p", { class: "muted small", role: "status", "aria-live": "polite" });
  const drop = dropzone({
    id: "clipFile", label: "Drop a recording here, or tap to choose one",
    hint: `MP3, M4A or WAV, up to ${CLIP_MAX_BYTES / 1000} KB`,
    onFile: (file) => act(null, async () => {
      if (!u.emailVerified) throw new Error("Confirm your email first, then you can add clips.");
      if (clips.length >= CLIP_MAX_COUNT) throw new Error(`Up to ${CLIP_MAX_COUNT} clips. Remove one first.`);
      clipStatus.textContent = `Adding ${file.name}…`;
      try {
        const clip = await readClip(file, clipTitle.value);
        const id = await api.addClip(clip);
        clips.push({ id, title: clip.title, seconds: clip.seconds });
        await api.updateMe({ clips });
        await ctx.reloadUser();
        clipTitle.value = "";
        drawClips();
      } finally { clipStatus.textContent = ""; }
    }, "Clip added.")
  });

  const saveBtn = h("button", { class: "btn btn--primary btn--block", onClick: (e) =>
    act(e.currentTarget, async () => {
      await api.updateMe({
        instruments: instruments.value.split(",").map((x) => x.trim()).filter(Boolean),
        canPerform: [...chosen], customSongs, clips
      });
      await ctx.reloadUser();
    }, "Saved!") }, "Save my songs");

  return h("div", { class: "screen-stack" },
    h("h1", {}, "My songs"),
    h("p", { class: "muted" }, "The set planner only picks songs you check here."),
    h("div", { class: "field" }, h("label", { for: "instruments" }, "Instruments (comma separated)"), instruments),
    h("section", { class: "stack" },
      h("div", { class: "row row--between" }, h("h2", {}, "Songs I can perform"), count),
      h("p", { class: "muted small" }, "Browse by occasion, then check what you can play."),
      filterBox,
      h("div", { class: "field" }, h("label", { for: "songSearch" }, "Search songs"), searchInput),
      songBox),
    addSong,
    h("section", { class: "stack" },
      h("h2", {}, "Sample clips"),
      h("p", { class: "muted small" }, "Only verified organizers can listen to these. Use your own recordings only."),
      clipList,
      h("div", { class: "card stack" },
        h("div", { class: "field" }, h("label", { for: "clipTitle" }, "Clip title (optional)"), clipTitle),
        drop, clipStatus)),
    saveBtn);
}
