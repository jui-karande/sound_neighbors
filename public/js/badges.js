// Stats and badges
//  These are calculated from hour logs and applications
export const MILESTONES = [5, 10, 25, 50, 100];
const SENIOR_WORDS = /senior|older|memory care|residents|70s|80s|retire/i;

export function computeStats(logs) {
  const hours = logs.reduce((sum, l) => sum + Number(l.hours || 0), 0);
  const venues = new Set(logs.map((l) => l.orgId)).size;
  const next = MILESTONES.find((m) => m > hours) || null;
  const prev = [...MILESTONES].reverse().find((m) => m <= hours) || 0;
  return { hours, gigs: logs.length, venues, next, prev };
}

// logs: hour logs; apps: my applications; gigs: { id: gig }; sets: { gigId: set }; me: my uid
export function computeBadges({ logs, apps, gigs, sets, me }) {
  const { hours } = computeStats(logs);
  const playedGigs = logs.map((l) => gigs[l.gigId]).filter(Boolean);
  const cancels = apps.filter((a) => a.response === "cancelled").length;
  const backups = apps.filter((a) => a.role === "backup" || a.wasBackup).length;
  const grantedRequest = logs.some((l) => {
    const gig = gigs[l.gigId];
    const set = sets[l.gigId];
    return gig && gig.request && set && set.items &&
      set.items.some((it) => it.songId === gig.request && (it.performerId === me || it.performerId === "together"));
  });
  const seniorGig = playedGigs.some((g) => SENIOR_WORDS.test(g.audience || ""));

  return [
    { name: "First Gig", note: "Played your first show", earned: logs.length >= 1, hint: "Play your first gig" },
    { name: "Bridge the Generations", note: "Performed for seniors", earned: seniorGig, hint: "Play at a senior venue" },
    { name: "Request Granted", note: "Played a special request", earned: grantedRequest, hint: "Include a special request" },
    { name: "Reliable", note: "5 gigs, no cancels", earned: logs.length >= 5 && cancels === 0,
      hint: cancels ? "5 gigs with no cancels" : `${Math.max(0, 5 - logs.length)} more gig(s), no cancels` },
    { name: "Ready Reserve", note: "Backup for 3 gigs", earned: backups >= 3, hint: `Be a backup ${Math.max(0, 3 - backups)} more time(s)` },
    ...[10, 25, 50, 100].map((m) => ({ name: `${m} Hours`, note: `${m} community hours`,
      earned: hours >= m, hint: `${(m - hours).toFixed(1).replace(/\.0$/, "")} hours to go` }))
  ];
}
