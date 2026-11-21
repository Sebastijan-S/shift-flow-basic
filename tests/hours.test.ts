import test from "node:test";
import assert from "node:assert/strict";
import { createWorkspace } from "../src/lib/demo";
import { demoHoursCommand, EMPTY_HOURS, fullMonth, parseMoney, payRows, type HoursData } from "../src/lib/hours";
import type { Workspace } from "../src/lib/scheduler";

export function hoursWorkspace(): Workspace {
  const w = createWorkspace("Obračun <lokal>");
  w.employees = ["Ana", "Marko", "Jelena", "Luka"].map((name, i) => ({ id: `e${i}`, name, initials: name[0], color: "mint", positions: ["Barista"], targetHours: 40, active: true, daysOff: [] }));
  w.schedules["2026-10-05"] = { week: "2026-10-05", status: "draft", assignments: [
    { id: "a", employeeId: "e0", day: 0, templateId: "morning", position: "Barista", locked: false, note: "", start: "07:00", end: "14:20" },
    { id: "b", employeeId: "e0", day: 1, templateId: "morning", position: "Barista", locked: false, note: "", start: "07:00", end: "14:20" },
    { id: "c", employeeId: "e1", day: 0, templateId: "morning", position: "Barista", locked: false, note: "", start: "07:00", end: "14:29" },
    { id: "d", employeeId: "e2", day: 0, templateId: "morning", position: "Barista", locked: false, note: "", start: "07:00", end: "14:30" },
  ] };
  return w;
}
test("hours: exact money validation, calendar boundaries and aggregate hour rounding", () => {
  assert.equal(parseMoney("100,25"), 10025); assert.equal(parseMoney("0"), 0);
  for (const value of ["", "-1", "1.234", "NaN", "1e2", "Infinity"]) assert.throws(() => parseMoney(value));
  assert.ok(fullMonth("2024-02-01", "2024-02-29")); assert.ok(!fullMonth("2024-02-02", "2024-02-29"));
  const w = hoursWorkspace();
  let d = demoHoursCommand(EMPTY_HOURS, w, "start", { start: "2026-10-01" }, null, 0);
  const run = (action: Parameters<typeof demoHoursCommand>[2], payload: Record<string, unknown>) => { d = demoHoursCommand(d, w, action, payload, d.open!.id, d.open!.version); };
  run("import", { end: "2026-10-15" });
  run("rate", { employee: "e0", method: "hourly", cents: 10025 });
  run("rate", { employee: "e1", method: "hourly", cents: 20000 });
  run("rate", { employee: "e2", method: "shift", cents: 30000 });
  run("extra", { employee: "e0", overtime: 12345, monthly: null });
  let rows = payRows(d, w, "2026-10-15");
  assert.equal(rows[0].hours, 15, "two 7:20 shifts round once to 15h");
  assert.equal(rows[0].total, 15 * 10025 + 12345); assert.equal(rows[1].hours, 7); assert.equal(rows[2].hours, 8); assert.equal(rows[2].base, 30000); assert.equal(rows[3].hours, 0);
  run("entry", { key: "2026-10-05:a", minutes: 60 });
  w.schedules["2026-10-05"].assignments = []; run("import", { end: "2026-10-15" });
  assert.equal(d.open!.entries.length, 1, "manual corrections survive schedule deletion");
  assert.equal(d.open!.entries[0].minutes, 60);
  run("rate", { employee: "e3", method: "monthly", cents: 6000000 });
  assert.throws(() => payRows(d, w, "2026-10-15"), /nepotpun/);
  run("extra", { employee: "e3", monthly: 3000000, overtime: 50000 });
  rows = payRows(d, w, "2026-10-15"); assert.equal(rows[3].total, 3050000);
  const old = structuredClone(d); run("close", { end: "2026-10-15" });
  assert.equal(d.history[0].rows.length, 4); assert.equal(d.open!.entries.length, 0); assert.equal(d.open!.start, "2026-10-16");
  assert.ok(w.employees.every(e => d.open!.entries.filter(a => a.employee === e.id).length === 0));
  assert.deepEqual(demoHoursCommand(d, w, "close", { end: "2026-10-15" }, old.open!.id, old.open!.version), d);
  const snapshot = structuredClone(d.history);
  run("rate", { employee: "e0", method: "hourly", cents: 999 }); w.employees[0].name = "Novo ime";
  assert.deepEqual(d.history, snapshot);
  assert.throws(() => demoHoursCommand(d, w, "rate", { employee: "e0", method: "hourly", cents: -1 }, d.open!.id, d.open!.version));
});
