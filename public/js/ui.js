// UI helpers. 

//h() builds elements safely: strings become text nodes,
export function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  setProps(el, props);
  appendAll(el, children);
  return el;
}

const SVG_NS = "http://www.w3.org/2000/svg";
export function svg(tag, props = {}, ...children) {
  const el = document.createElementNS(SVG_NS, tag);
  setProps(el, props);
  appendAll(el, children);
  return el;
}

function setProps(el, props) {
  for (const [key, value] of Object.entries(props || {})) {
    if (value == null || value === false) continue;
    if (key.startsWith("on") && typeof value === "function") {
      el.addEventListener(key.slice(2).toLowerCase(), value);
    } else if (key === "class") {
      el.setAttribute("class", value);
    } else if (key === "style" && typeof value === "object") {
      Object.assign(el.style, value);
    } else if (key === "checked" || key === "value" || key === "selected" || key === "disabled") {
      el[key] = value;
      if (key === "disabled" || key === "checked") el.toggleAttribute(key, Boolean(value));
    } else {
      el.setAttribute(key, value === true ? "" : value);
    }
  }
}

function appendAll(el, children) {
  for (const child of children.flat(Infinity)) {
    if (child == null || child === false) continue;
    el.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
}

export function fmtDate(dateStr, opts = { weekday: "short", month: "short", day: "numeric" }) {
  return new Date(dateStr + "T12:00:00").toLocaleDateString("en-US", opts);
}

export function dateBlock(dateStr) {
  const d = new Date(dateStr + "T12:00:00");
  return h("div", { class: "date-block", "aria-hidden": "true" },
    h("span", { class: "date-block__mon" }, d.toLocaleDateString("en-US", { month: "short" }).toUpperCase()),
    h("span", { class: "date-block__day" }, String(d.getDate())));
}

// message banner at the top of the screen
export function toast(message, kind = "info") {
  const region = document.getElementById("toast");
  region.className = `toast toast--${kind}`;
  region.textContent = message;
  region.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => { region.hidden = true; }, 4500);
}

export function friendlyError(err) {
  const code = (err && err.code) || "";
  const map = {
    "auth/email-already-in-use": "That email already has an account. Try logging in.",
    "auth/weak-password": "Passwords need at least 6 characters.",
    "auth/invalid-email": "That email address doesn't look right.",
    "auth/invalid-credential": "Check your email and password and try again.",
    "auth/wrong-password": "Check your email and password and try again.",
    "auth/user-not-found": "Check your email and password and try again.",
    "auth/too-many-requests": "Too many tries. Wait a minute and try again.",
    "permission-denied": "You don't have permission to do that.",
    "failed-precondition": "The database needs an index. Open the browser console for the link to create it."
  };
  return map[code] || (err && err.message) || "Something went wrong. Please try again.";
}

// Run an async action from a button: disables it, shows errors kindly.
export async function act(button, fn, successMessage) {
  if (button) button.disabled = true;
  try {
    await fn();
    if (successMessage) toast(successMessage, "success");
  } catch (err) {
    console.error(err);
    toast(friendlyError(err), "error");
  } finally {
    if (button && button.isConnected) button.disabled = false;
  }
}

let songsCache = null;
export async function loadSongs() {
  if (!songsCache) {
    const res = await fetch("data/songs.json");
    songsCache = await res.json();
  }
  return songsCache;
}

export const VIBES = ["Nostalgic", "Sing-along", "Upbeat", "Soothing", "Festive", "Seasonal"];

export const icon = {
  home: () => iconSvg("M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"),
  calendar: () => iconSvg("M3 4h18v17H3zM8 2v4M16 2v4M3 10h18"),
  music: () => iconSvg("M9 18V5l11-2v13M6 21a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM17 19a3 3 0 1 0 0-6 3 3 0 0 0 0 6z"),
  award: () => iconSvg("M12 15a6 6 0 1 0 0-12 6 6 0 0 0 0 12zM8.5 14 7 22l5-3 5 3-1.5-8"),
  user: () => iconSvg("M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0"),
  plus: () => iconSvg("M12 5v14M5 12h14"),
  back: () => iconSvg("m15 18-6-6 6-6"),
  check: () => iconSvg("M20 6 9 17l-5-5"),
  shield: () => iconSvg("M12 2 4 5v6c0 5 3.5 9 8 11 4.5-2 8-6 8-11V5zM9 12l2 2 4-4"),
  star: () => iconSvg("m12 2 3 6.5 7 .8-5.2 4.8 1.4 7L12 17.6 5.8 21l1.4-7L2 9.3l7-.8z"),
  lock: () => iconSvg("M4 11h16v10H4zM8 11V7a4 4 0 0 1 8 0v4")
};

function iconSvg(d) {
  return svg("svg", { width: 22, height: 22, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor",
    "stroke-width": 2, "stroke-linecap": "round", "stroke-linejoin": "round", "aria-hidden": "true" },
    svg("path", { d }));
}

export function backLink(href, label) {
  return h("a", { href, class: "back-link" }, icon.back(), label);
}

export function progress(fraction, label) {
  const pct = Math.max(0, Math.min(100, Math.round(fraction * 100)));
  return h("div", { class: "progress", role: "progressbar", "aria-valuemin": 0, "aria-valuemax": 100,
    "aria-valuenow": pct, "aria-label": label },
    h("div", { class: "progress__fill", style: { width: pct + "%" } }));
}

export function empty(text) {
  return h("p", { class: "empty" }, text);
}

// ---------- Sample clips ----------
// A clip is stored inside a Firestore document (1 MiB limit)
export const CLIP_MAX_BYTES = 700000;
export const CLIP_MAX_COUNT = 3;

// Validates an audio file and returns { title, seconds, mime, data } where data is a data: URL.
export async function readClip(file, title = "") {
  if (!file.type.startsWith("audio/")) throw new Error("That isn't an audio file. Try an MP3, M4A, or WAV.");
  if (file.size > CLIP_MAX_BYTES) {
    throw new Error(`That clip is ${(file.size / 1000).toFixed(0)} KB. Clips can be up to ${CLIP_MAX_BYTES / 1000} KB (about 40 seconds of MP3). Try trimming it.`);
  }
  const data = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("Couldn't read that file."));
    reader.readAsDataURL(file);
  });
  const seconds = await new Promise((resolve) => {
    const probe = new Audio();
    probe.preload = "metadata";
    probe.onloadedmetadata = () => resolve(Number.isFinite(probe.duration) ? Math.round(probe.duration) : 0);
    probe.onerror = () => resolve(0);
    probe.src = data;
  });
  return { title: title.trim() || file.name.replace(/\.[^.]+$/, ""), seconds, mime: file.type, data };
}

// A drag-and-drop target
export function dropzone({ id, label, hint, onFile }) {
  const input = h("input", { id, type: "file", accept: "audio/*", class: "dropzone__input" });
  const zone = h("label", { class: "dropzone", for: id },
    h("strong", {}, label), h("span", { class: "muted small" }, hint), input);
  const take = (file) => { if (file) onFile(file); };
  input.addEventListener("change", () => { take(input.files[0]); input.value = ""; });
  ["dragenter", "dragover"].forEach((ev) => zone.addEventListener(ev, (e) => {
    e.preventDefault(); zone.classList.add("dropzone--over");
  }));
  ["dragleave", "drop"].forEach((ev) => zone.addEventListener(ev, (e) => {
    e.preventDefault(); zone.classList.remove("dropzone--over");
  }));
  zone.addEventListener("drop", (e) => take(e.dataTransfer && e.dataTransfer.files[0]));
  return zone;
}
