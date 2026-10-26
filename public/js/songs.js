// Songs teens add to their own list. A custom song has the same shape as a library song
// (so the set planner treats them alike) plus custom: true. Only facts about the song are
// stored (title, artist, length, feel), never lyrics. No DOM or Firebase here.
import { EVENTS } from "./events.js";

export const MOODS = ["nostalgic", "sing-along", "upbeat", "soothing", "festive", "seasonal", "sad"];
export const MAX_CUSTOM_SONGS = 30;

// Validates what the form collected and returns a song, or throws an Error with a friendly message.
export function makeCustomSong({ title, artist = "", minutes = 0, seconds = 0, energy, moods = [], events = [], needsPiano = false }, id) {
  title = String(title || "").trim();
  artist = String(artist || "").trim();
  const length = Math.round(Number(minutes) * 60 + Number(seconds));
  if (!title) throw new Error("Give the song a title.");
  if (title.length > 60 || artist.length > 60) throw new Error("Keep the title and artist under 60 characters.");
  if (!Number.isFinite(length) || length < 30 || length > 600) throw new Error("Song length should be between 0:30 and 10:00.");
  energy = Number(energy);
  if (!(energy >= 1 && energy <= 5)) throw new Error("Pick how lively the song is, from 1 to 5.");
  moods = [...new Set(moods)].filter((m) => MOODS.includes(m));
  if (moods.length < 1 || moods.length > 3) throw new Error("Pick 1 to 3 moods so the planner knows where it fits.");
  const eventIds = EVENTS.map((e) => e.id);
  return {
    id, title, ...(artist ? { artist } : {}), seconds: length, energy, moods,
    needs: needsPiano ? ["piano"] : [], events: events.filter((e) => eventIds.includes(e)), custom: true
  };
}

// Library plus a teen's own songs, as the planner wants them.
export const allSongs = (library, customSongs = []) => [...library, ...customSongs];
