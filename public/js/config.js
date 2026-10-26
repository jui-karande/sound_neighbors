// Firebase settings
const placeholder = { apiKey: "PASTE-HERE", authDomain: "PASTE-HERE", projectId: "PASTE-HERE", appId: "PASTE-HERE" };

let local = {};
try {
  ({ firebaseConfig: local } = await import("./config.local.js"));
} catch (e) { /* no local config: stay in demo mode */ }

export const firebaseConfig = { ...placeholder, ...local };

export const SDK = "https://www.gstatic.com/firebasejs/13.0.0";

export const DEMO_MODE =
  firebaseConfig.apiKey === "PASTE-HERE" ||
  new URLSearchParams(location.search).has("demo");
