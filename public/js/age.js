// Age check for sign-up. Performers give a birth month and year, the app works
// out "adult" or "minor", and only that yes/no is saved.
export const ADULT_AGE = 18;
export const MIN_AGE = 11;

// Returns "adult", "minor", or "too-young". 
export function ageGroup(month, year, now = new Date()) {
  month = Number(month); year = Number(year);
  const thisYear = now.getFullYear();
  if (!Number.isInteger(month) || month < 1 || month > 12) throw new Error("Pick your birth month.");
  if (!Number.isInteger(year) || year < thisYear - 110 || year > thisYear) throw new Error("Enter your birth year as four digits, like 2009.");
  const monthsSince = (thisYear * 12 + now.getMonth() + 1) - (year * 12 + month);
  if (monthsSince < 0) throw new Error("That birth date is in the future.");
  if (monthsSince > ADULT_AGE * 12) return "adult";
  if (monthsSince > MIN_AGE * 12) return "minor";
  return "too-young";
}

// Adults need no parent approval; everyone else needs parentApproved (set by the admin).
export const approvedToPerform = (user) => Boolean(user && (user.adult === true || user.parentApproved === true));
