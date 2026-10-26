// Sign-up age check: adults skip parent approval, minors don't, and the check errs on the side of caution.
import { test } from "node:test";
import assert from "node:assert/strict";
import { ageGroup, approvedToPerform, ADULT_AGE, MIN_AGE } from "../public/js/age.js";

const day = (y, m, d) => new Date(y, m - 1, d);   // m is 1-12
const now = day(2026, 10, 12);

test("born long ago is an adult; recent birth years are minors", () => {
  assert.equal(ageGroup(5, 1990, now), "adult");
  assert.equal(ageGroup(10, 2000, now), "adult");
  assert.equal(ageGroup(6, 2010, now), "minor");     // 16
  assert.equal(ageGroup(1, 2012, now), "minor");     // 14
});

test("exactly 18: counts as an adult only once the 18th-birthday month is over (cautious)", () => {
  assert.equal(ageGroup(10, 2008, now), "minor", "turns 18 sometime this month, unsure");
  assert.equal(ageGroup(11, 2008, now), "minor", "turns 18 next month");
  assert.equal(ageGroup(9, 2008, now), "adult", "turned 18 last month");
  assert.equal(ageGroup(10, 2007, now), "adult");
});

test("under 11 is too young, with the same caution at the edge", () => {
  assert.equal(ageGroup(10, 2015, now), "too-young", "turns 11 sometime this month, unsure");
  assert.equal(ageGroup(9, 2015, now), "minor");
  assert.equal(ageGroup(3, 2020, now), "too-young");
  assert.ok(MIN_AGE === 11 && ADULT_AGE === 18);
});

test("a minor is never reported as an adult for any month in the boundary year", () => {
  for (let m = 1; m <= 12; m++) {
    for (let d of [1, 15, 28]) {
      const today = day(2026, 3, d);
      const group = ageGroup(m, 2008, today);
      // the youngest possible person born in month m of 2008 (born on its last day)
      const youngest = new Date(2008, m, 0);
      let age = today.getFullYear() - youngest.getFullYear();
      if (today < new Date(today.getFullYear(), youngest.getMonth(), youngest.getDate())) age--;
      if (group === "adult") assert.ok(age >= 18, `month ${m}, today ${today.toDateString()}: youngest possible is ${age}`);
    }
  }
});

test("bad input is refused with a clear message", () => {
  assert.throws(() => ageGroup("", 2009, now), /month/i);
  assert.throws(() => ageGroup(13, 2009, now), /month/i);
  assert.throws(() => ageGroup(5, "", now), /year/i);
  assert.throws(() => ageGroup(5, 209, now), /four digits/i);
  assert.throws(() => ageGroup(5, 2030, now), /year/i);
  assert.throws(() => ageGroup(12, 2026, now), /future/i);
});

test("approvedToPerform: adults or parent-approved teens only", () => {
  assert.equal(approvedToPerform({ adult: true }), true);
  assert.equal(approvedToPerform({ parentApproved: true }), true);
  assert.equal(approvedToPerform({ adult: false, parentApproved: false }), false);
  assert.equal(approvedToPerform({}), false);
  assert.equal(approvedToPerform(null), false);
  assert.equal(approvedToPerform({ adult: "true" }), false, "only a real boolean counts");
});
