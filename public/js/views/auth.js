// Sign up / log in. In demo mode: pick a demo user instead.
import { api, isDemo } from "../db.js";
import { h, act, toast } from "../ui.js";
import { ageGroup, MIN_AGE, approvedToPerform } from "../age.js";

export async function authView() {
  if (isDemo) return demoPicker();

  let mode = "login";
  const wrap = h("div", { class: "screen-stack" });
  const draw = () => wrap.replaceChildren(
    h("h1", {}, mode === "login" ? "Welcome back" : "Create your account"),
    h("p", { class: "muted" }, "Teen musicians bringing live music to the community."),
    mode === "login" ? loginForm() : signupForm(),
    h("button", { class: "btn btn--link", onClick: () => { mode = mode === "login" ? "signup" : "login"; draw(); } },
      mode === "login" ? "New here? Create an account" : "Already have an account? Log in")
  );
  draw();
  return wrap;
}

function field(id, label, input) {
  return h("div", { class: "field" }, h("label", { for: id }, label), input);
}

function loginForm() {
  const email = h("input", { id: "email", type: "email", required: true, autocomplete: "email" });
  const password = h("input", { id: "password", type: "password", required: true, autocomplete: "current-password" });
  const submit = h("button", { class: "btn btn--primary btn--block", type: "submit" }, "Log in");
  return h("form", { class: "card form", onSubmit: (e) => {
    e.preventDefault();
    act(submit, () => api.logIn(email.value.trim(), password.value));
  } }, field("email", "Email", email), field("password", "Password", password), submit);
}

function signupForm() {
  const name = h("input", { id: "name", required: true, autocomplete: "given-name" });
  const email = h("input", { id: "email", type: "email", required: true, autocomplete: "email" });
  const password = h("input", { id: "password", type: "password", minlength: 6, required: true, autocomplete: "new-password" });
  const role = h("select", { id: "role" },
    h("option", { value: "teen" }, "Performer (teen or adult)"),
    h("option", { value: "organizer" }, "Organizer at a community venue"));
  const orgName = h("input", { id: "orgName" });
  const orgField = field("orgName", "Organization name", orgName);
  orgField.hidden = true;
  const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const birthMonth = h("select", { id: "birthMonth", required: true },
    h("option", { value: "" }, "Month"), months.map((m, i) => h("option", { value: i + 1 }, m)));
  const birthYear = h("input", { id: "birthYear", type: "number", inputmode: "numeric", min: 1900, max: new Date().getFullYear(),
    placeholder: "2009", required: true, autocomplete: "bday-year" });
  const ageBox = h("fieldset", { class: "stack-tight" },
    h("legend", {}, "Birth month and year"),
    h("div", { class: "grid-2" }, field("birthMonth", "Month", birthMonth), field("birthYear", "Year", birthYear)),
    h("p", { class: "muted small" }, "Used only to tell whether a parent or guardian needs to approve your account. We save just \"adult\" or not, never your birth date."));
  role.addEventListener("change", () => {
    const org = role.value === "organizer";
    orgField.hidden = !org;
    orgName.required = org;
    ageBox.hidden = org;
    birthMonth.required = birthYear.required = !org;
  });
  const submit = h("button", { class: "btn btn--primary btn--block", type: "submit" }, "Create account");
  return h("form", { class: "card form", onSubmit: (e) => {
    e.preventDefault();
    act(submit, async () => {
      let adult = false;
      if (role.value === "teen") {
        const group = ageGroup(birthMonth.value, birthYear.value);
        if (group === "too-young") throw new Error(`Sound Neighbors is for ages ${MIN_AGE} and up.`);
        adult = group === "adult";
      }
      await api.signUp({ name: name.value.trim(), email: email.value.trim(),
        password: password.value, role: role.value, orgName: orgName.value.trim(), adult });
    });
  } },
    field("name", "First name", name),
    field("email", "Email", email),
    field("password", "Password (6+ characters)", password),
    field("role", "I am a…", role),
    orgField,
    ageBox,
    h("p", { class: "muted small" }, "Under 18? A parent or guardian approves your account before you can request gigs. Adults can request gigs right away. Organizations are verified before posting."),
    submit);
}

function demoPicker() {
  const users = api.demoUsers();
  const row = (u) => h("button", { class: "user-row", onClick: () => api.demoLogin(u.id) },
    h("span", { class: "avatar", "aria-hidden": "true" }, initials(u.name)),
    h("span", { class: "user-row__text" },
      h("strong", {}, u.role === "organizer" ? u.orgName : u.name),
      h("span", { class: "muted small" }, u.role === "organizer"
        ? `${u.name} · organizer${u.verified ? "" : " · not verified yet"}`
        : `${(u.instruments || []).join(", ")} · ${u.adult ? "adult performer" : "teen"}${approvedToPerform(u) ? "" : " · awaiting parent approval"}`)));

  return h("div", { class: "screen-stack" },
    h("h1", {}, "Try Sound Neighbors"),
    h("p", { class: "muted" }, "Demo mode: fake data saved only in this browser. Pick someone to be."),
    h("h2", {}, "Teens"),
    h("div", { class: "list" }, users.filter((u) => u.role === "teen").map(row)),
    h("h2", {}, "Organizers"),
    h("div", { class: "list" }, users.filter((u) => u.role === "organizer").map(row)),
    h("button", { class: "btn btn--secondary", onClick: () => { api.resetDemo(); toast("Demo data reset.", "success"); } },
      "Reset demo data"),
    h("p", { class: "muted small" }, "To use a real Firebase project, paste your config into js/config.js."));
}

export function initials(name = "") {
  return name.split(/[\s&]+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join("");
}
