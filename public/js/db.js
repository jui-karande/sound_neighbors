// One data API for the whole app. Views import { api } from here and never
// talk to Firebase directly, so the same screens work in demo mode too.
import { DEMO_MODE } from "./config.js";

export const api = DEMO_MODE
  ? await import("./backend-local.js")
  : await import("./backend-firebase.js");

export const isDemo = DEMO_MODE;

export function appId(gigId, teenId) {
  return `${gigId}_${teenId}`;
}

// "YYYY-MM-DD" for today in the user's time zone
export function today() {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

export function addDays(dateStr, days) {
  const d = new Date(dateStr + "T12:00:00");
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

// Active performers = role "perform" and not cancelled
export function activePerformers(apps) {
  return apps.filter((a) => a.role === "perform" && a.response !== "cancelled");
}
