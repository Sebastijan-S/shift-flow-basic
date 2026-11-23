import test from "node:test";
import assert from "node:assert/strict";
import { copyDayRequirements } from "../src/lib/requirements";
import { createDemo } from "../src/lib/demo";
import { applyChange, redoState, undoState, type StoredState } from "../src/lib/storage";
import { effectiveRequirements, type Requirement, type ShiftTemplate } from "../src/lib/scheduler";

const templates: ShiftTemplate[] = [
  { id: "regular", name: "Redovna", start: "08:00", end: "16:00", color: "mint" },
  { id: "extra", name: "Dodatna", start: "10:00", end: "18:00", color: "blue" },
];
const positions = ["Barista", "Konobar", "Nova pozicija"];
const sorted = (rows: Requirement[]) => [...rows].sort((a, b) => `${a.day}:${a.templateId}:${a.position}`.localeCompare(`${b.day}:${b.templateId}:${b.position}`));

test("copy needs replaces all six days, including zero/missing values and custom positions, without linking days", () => {
  const rows: Requirement[] = [
    { day: 5, templateId: "regular", position: "Barista", count: 20 },
    { day: 5, templateId: "regular", position: "Konobar", count: 0 },
    { day: 5, templateId: "extra", position: "Nova pozicija", count: 3 },
    { day: 1, templateId: "regular", position: "Konobar", count: 8 },
    { day: 6, templateId: "extra", position: "Barista", count: 6 },
  ];
  const before = structuredClone(rows);
  const result = copyDayRequirements(rows, templates, positions, 5);
  assert.deepEqual(rows, before);
  assert.deepEqual(result.filter(r => r.day === 5), rows.filter(r => r.day === 5));
  for (let day = 0; day < 7; day++) {
    if (day === 5) continue;
    assert.equal(result.filter(r => r.day === day).length, 6);
    for (const t of templates) for (const position of positions) {
      assert.equal(result.find(r => r.day === day && r.templateId === t.id && r.position === position)?.count,
        rows.find(r => r.day === 5 && r.templateId === t.id && r.position === position)?.count ?? 0);
    }
  }
  result.find(r => r.day === 0 && r.templateId === "regular" && r.position === "Barista")!.count = 2;
  assert.equal(result.find(r => r.day === 1 && r.templateId === "regular" && r.position === "Barista")!.count, 20);
  assert.deepEqual(rows, before);
});

test("copy needs respects source and target shift days, and preserves records outside the editor", () => {
  const shifts = [templates[0], { ...templates[1], days: [0, 5] }];
  const rows: Requirement[] = [
    { day: 0, templateId: "extra", position: "Barista", count: 4 },
    { day: 2, templateId: "extra", position: "Barista", count: 9 },
    { day: 3, templateId: "removed", position: "Barista", count: 2 },
  ];
  const result = copyDayRequirements(rows, shifts, positions, 0);
  assert.equal(result.find(r => r.day === 5 && r.templateId === "extra" && r.position === "Barista")?.count, 4);
  assert.equal(result.some(r => r.day !== 0 && r.day !== 5 && r.templateId === "extra"), false);
  assert.deepEqual(result.find(r => r.templateId === "removed"), rows[2]);
  // A stale value on an inactive source day must not create active demand.
  const inactiveSource = copyDayRequirements(rows, shifts, positions, 2);
  assert.equal(inactiveSource.find(r => r.day === 0 && r.templateId === "extra" && r.position === "Barista")?.count, 0);
  assert.equal(inactiveSource.find(r => r.day === 2 && r.templateId === "extra")?.count, 9);
  assert.throws(() => copyDayRequirements(rows, shifts, positions, 7), RangeError);
});

test("base copy is one undoable change, persists, and leaves weekly overrides and generated schedules intact", () => {
  const w = createDemo(), week = Object.keys(w.schedules)[0];
  w.requirementOverrides = { [week]: [{ day: 0, templateId: w.templates[0].id, position: "Barista", count: 8 }] };
  const original = structuredClone(w);
  const state: StoredState = { schema: 2, revision: 0, current: w, past: [], future: [] };
  const copied = copyDayRequirements(w.requirements, w.templates, (w.positions ?? ["Barista", "Konobar", "Menadžer"]), 5);
  const next = applyChange(state, { ...w, requirements: copied }, "Kopiran osnovni obrazac potreba: Subota");
  assert.equal(next.past.length, 1);
  const reloaded: StoredState = JSON.parse(JSON.stringify(next));
  assert.deepEqual(reloaded.current.requirements, copied);
  assert.deepEqual(reloaded.current.schedules, original.schedules);
  assert.deepEqual(reloaded.current.requirementOverrides, original.requirementOverrides);
  const undone = undoState(reloaded);
  assert.deepEqual(sorted(undone.current.requirements), sorted(original.requirements));
  assert.deepEqual(sorted(redoState(undone).current.requirements), sorted(copied));
});

test("weekly copy uses that week's effective needs and undo restores inheritance or an existing override", () => {
  for (const hasOverride of [false, true]) {
    const w = createDemo(), week = Object.keys(w.schedules)[0];
    w.requirementOverrides = { "2099-01-05": [{ day: 0, templateId: w.templates[0].id, position: "Barista", count: 20 }] };
    if (hasOverride) w.requirementOverrides[week] = [{ day: 5, templateId: w.templates[0].id, position: "Barista", count: 4 }];
    const before = structuredClone(w);
    const copied = copyDayRequirements(effectiveRequirements(w, week), w.templates, (w.positions ?? ["Barista", "Konobar", "Menadžer"]), 5);
    const state: StoredState = { schema: 2, revision: 0, current: w, past: [], future: [] };
    const next = applyChange(state, { ...w, requirementOverrides: { ...w.requirementOverrides, [week]: copied } }, "Kopirane potrebe ove nedelje: Subota");
    assert.equal(next.past.length, 1);
    assert.deepEqual(next.current.requirements, before.requirements);
    assert.deepEqual(next.current.schedules, before.schedules);
    assert.deepEqual(next.current.requirementOverrides!["2099-01-05"], before.requirementOverrides!["2099-01-05"]);
    assert.deepEqual(undoState(next).current.requirementOverrides, before.requirementOverrides);
  }
});

