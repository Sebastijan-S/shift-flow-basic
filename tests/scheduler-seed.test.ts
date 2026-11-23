import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createDemo, createWorkspace } from "../src/lib/demo";
import { addDays, effectiveRequirements, generateSchedule, hoursFor, missingRequirements, validateSchedule, type Assignment, type Schedule, type Workspace } from "../src/lib/scheduler";

const week = "2026-11-23";
function quality(s: Schedule, w: Workspace) {
  return [
    missingRequirements(s.assignments, effectiveRequirements(w, week)).reduce((n, r) => n + r.missing, 0),
    validateSchedule(s, w).length,
    w.employees.filter(e => e.active).reduce((n, e) => n + (hoursFor(s.assignments, e.id, w.templates) / Math.max(e.targetHours, 8)) ** 2, 0),
    s.assignments.filter(a => { const e = w.employees.find(e => e.id === a.employeeId); return e?.preferredShift && e.preferredShift !== a.templateId; }).length,
  ];
}
function atLeastAsGood(result: Schedule, baseline: Schedule, w: Workspace) {
  const actual = quality(result, w), original = quality(baseline, w);
  const firstDifference = actual.findIndex((v, i) => v !== original[i]);
  assert.ok(firstDifference === -1 || actual[firstDifference] < original[firstDifference], `${actual} is worse than ${original}`);
  assert.equal(validateSchedule(result, w).filter(c => c.severity === "block").length, 0);
  assert.equal(new Set(result.assignments.map(a => a.id)).size, result.assignments.length);
}

test("seeded generator is repeatable (including zero); omitted seed retains the exact legacy result", t => {
  const w = createDemo(); w.schedules = {};
  const original = structuredClone(w);
  t.mock.method(Math, "random", () => { throw new Error("Global randomness must not affect the generator"); });
  const legacy = generateSchedule(w, week, false);
  assert.equal(createHash("sha256").update(JSON.stringify(legacy)).digest("hex"), "19f26bd4d262b83553c85aee68dffcd94f043757c6afb81696a3cd502c9aacca");
  assert.deepEqual(generateSchedule(w, week, false, undefined), legacy);
  for (const seed of [0, 1, 101, 0xffffffff]) assert.deepEqual(generateSchedule(w, week, false, seed), generateSchedule(w, week, false, seed));
  assert.deepEqual(w, original);
});

test("different fixed seeds produce multiple full, valid schedules without reducing quality", () => {
  const w = createDemo(); w.schedules = {};
  const baseline = generateSchedule(w, week, false), combinations = new Set<string>();
  for (let seed = 0; seed < 12; seed++) {
    const result = generateSchedule(w, week, false, seed);
    assert.equal(result.assignments.length, 42);
    atLeastAsGood(result, baseline, w);
    for (const e of w.employees) assert.ok(hoursFor(result.assignments, e.id, w.templates) <= 40);
    combinations.add(JSON.stringify(result.assignments.map(a => [a.day, a.templateId, a.position, a.employeeId]).sort()));
  }
  assert.ok(combinations.size > 1, "several equally eligible teams must not always receive the same schedule");
});

test("seeded runs preserve locks, availability, hours, overnight rest, shift days and neighboring weeks", () => {
  const w = createDemo(); w.schedules = {};
  w.employees[5].maxHours = 16;
  w.employees[4].availability = [{ day: 0, start: "10:00", end: "18:00" }];
  w.absences = [{ id: "absence", employeeId: "employee-1", from: addDays(week, 1), to: addDays(week, 4), kind: "absence", reason: "" }];
  w.dateAvailability = [{ id: "dated", employeeId: "employee-4", date: week, start: "08:00", end: "16:00" }];
  w.templates[1].days = [0, 1, 2, 3, 4];
  w.templates.push({ id: "night", name: "Noćna", start: "22:00", end: "08:00", days: [5], color: "blue" });
  w.requirementOverrides = { [week]: [...w.requirements, { day: 5, templateId: "night", position: "Barista", count: 1 }] };
  const assignment: Assignment = { id: "locked", employeeId: "employee-2", day: 2, templateId: "morning", position: "Barista", locked: true, note: "Dogovor", start: "07:00", end: "15:00" };
  w.schedules[week] = { week, status: "draft", assignments: [assignment] };
  for (const [offset, day, templateId, employeeId] of [[-7, 6, "evening", "employee-2"], [7, 0, "morning", "employee-3"]] as const) {
    const adjacentWeek = addDays(week, offset);
    w.schedules[adjacentWeek] = { week: adjacentWeek, status: "published", assignments: [{ id: `neighbor-${offset}`, employeeId, day, templateId, position: "Barista", locked: false, note: "" }] };
  }
  const original = structuredClone(w), baseline = generateSchedule(w, week);
  for (const seed of [0, 1, 2, 101, 202, 999]) {
    const result = generateSchedule(w, week, true, seed);
    atLeastAsGood(result, baseline, w);
    assert.deepEqual(result.assignments.find(a => a.id === assignment.id), assignment);
    assert.ok(!result.assignments.some(a => a.day === 0 && a.employeeId === "employee-2" && a.templateId === "morning"));
    assert.ok(!result.assignments.some(a => a.day >= 5 && a.templateId === "evening"));
    assert.ok(hoursFor(result.assignments, "employee-6", w.templates) <= 16);
    assert.deepEqual(result.requirements, effectiveRequirements(w, week));
    assert.equal(generateSchedule(w, week, false, seed).assignments.some(a => a.id === "locked" || a.locked), false);
  }
  assert.deepEqual(w, original);
});

test("a preferred shift remains a preference, and a lock does not become a future-week restriction", () => {
  const w = createWorkspace();
  w.employees = [{ id: "only", name: "Jedini", initials: "J", color: "mint", positions: ["Barista"], targetHours: 40, active: true, daysOff: [], preferredShift: "morning" }];
  w.requirements = [{ day: 0, templateId: "evening", position: "Barista", count: 1 }];
  w.schedules[week] = { week, status: "draft", assignments: [{ id: "manual", employeeId: "only", day: 2, templateId: "morning", position: "Barista", locked: true, note: "Only here" }] };
  const nextWeek = addDays(week, 7);
  const result = generateSchedule(w, nextWeek, true, 123);
  assert.equal(result.assignments.length, 1);
  assert.equal(result.assignments[0].templateId, "evening");
  assert.equal(result.assignments[0].locked, false);
  assert.equal(result.assignments.some(a => a.id === "manual"), false);
});

test("randomness cannot fill impossible demand by violating a ban or fabricate variety in a forced solution", () => {
  const w = createWorkspace();
  w.employees = [{ id: "only", name: "Jedini", initials: "J", color: "mint", positions: ["Barista"], targetHours: 40, active: true, daysOff: [1] }];
  w.requirements = [{ day: 0, templateId: "morning", position: "Barista", count: 1 }, { day: 1, templateId: "morning", position: "Barista", count: 1 }, { day: 0, templateId: "morning", position: "Konobar", count: 1 }];
  const baseline = generateSchedule(w, week), outputs: Schedule[] = [];
  for (const seed of [0, 1, 2, 123, 999]) {
    const result = generateSchedule(w, week, true, seed);
    atLeastAsGood(result, baseline, w);
    assert.equal(result.assignments.length, 1);
    assert.equal(missingRequirements(result.assignments, w.requirements).reduce((n, r) => n + r.missing, 0), 2);
    outputs.push(result);
  }
  outputs.forEach(result => assert.deepEqual(result, outputs[0]));
});
