import test from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { dashboardActions, dashboardSources, dashboardValues, loadDashboard, recordedMinutes, scheduledToday, todayInBelgrade, type DashboardReaders } from "../src/lib/dashboard";
import { defaultModules, type ModuleSettings } from "../src/lib/modules";
import { EMPTY_HOURS, type HoursData } from "../src/lib/hours";
import { EMPTY_BAR } from "../src/lib/bar";
import { EMPTY_NOTES, DEMO_NOTES_KEY, noteValues, type NoteEntry } from "../src/lib/notes";
import { EMPTY_REVENUE, demoSaveRevenue, revenueValues } from "../src/lib/revenue";
import { createWorkspace } from "../src/lib/demo";
import { DashboardPanel } from "../src/components/dashboard-panel";
import { readBar, readHours, readNotes, readRevenue, saveNoteCommand } from "../src/lib/module-data";

const all: ModuleSettings = { schedule: true, overview: true, hours: true, revenue: true, notes: true, bar: true };
const readers: DashboardReaders = { hours: async () => EMPTY_HOURS, revenue: async () => EMPTY_REVENUE, bar: async () => EMPTY_BAR, notes: async () => EMPTY_NOTES };

test("dashboard: distinct employees today, independent of browsed week and browser zone, including DST/midnight", () => {
  const workspace = createWorkspace("Dashboard");
  const shift = { id: "a", employeeId: "one", day: 6, templateId: "any", position: "any", locked: false, note: "" };
  workspace.schedules = {
    "2026-11-16": { week: "2026-11-16", status: "draft", assignments: [shift, { ...shift, id: "b" }, { ...shift, id: "c", employeeId: "two" }, { ...shift, id: "d", day: 5, employeeId: "three" }] },
    "2026-11-23": { week: "2026-11-23", status: "draft", assignments: [{ ...shift, day: 0 }] },
  };
  assert.equal(scheduledToday(workspace, new Date("2026-11-21T23:00:00Z")), 2);
  assert.equal(scheduledToday(workspace, new Date("2026-11-22T22:59:59Z")), 2);
  assert.equal(scheduledToday(workspace, new Date("2026-11-22T23:00:00Z")), 1);
  assert.equal(scheduledToday(workspace, new Date("2026-11-24T12:00:00Z")), 0);
  assert.equal(todayInBelgrade(new Date("2026-03-29T22:00:00Z")), "2026-03-30");
  assert.equal(todayInBelgrade(new Date("2026-10-25T23:00:00Z")), "2026-10-26");
  assert.equal(scheduledToday({ schedules: {} }, new Date("2026-11-22T12:00:00Z")), 0);
});

test("dashboard: every module combination fetches only enabled sources, scoped to the current company; planner fetches none", async () => {
  for (let mask = 0; mask < 16; mask++) {
    const settings = { ...all };
    const ids = ["hours", "revenue", "bar", "notes"] as const;
    ids.forEach((id, i) => { settings[id] = !!(mask & (1 << i)); });
    const calls: string[] = [];
    const spies = Object.fromEntries(ids.map(id => [id, async (company: string | null) => { calls.push(`${company}:${id}`); return readers[id](company); }])) as DashboardReaders;
    for (const company of ["first", "second", null]) {
      calls.length = 0;
      const data = await loadDashboard(settings, false, company, spies);
      const expected = ids.filter(id => settings[id]);
      assert.deepEqual(Object.keys(data), expected);
      assert.deepEqual(calls, expected.map(id => `${company}:${id}`));
    }
    calls.length = 0;
    assert.deepEqual(await loadDashboard(settings, true, "planner", spies), {});
    assert.deepEqual(await loadDashboard({ ...settings, overview: false }, false, "first", spies), {});
    assert.deepEqual(calls, []);
    assert.deepEqual(dashboardActions(settings).map(a => a.module), ["schedule", ...["revenue", "bar", "notes"].filter(id => settings[id as keyof ModuleSettings])]);
  }
  assert.deepEqual(dashboardSources(defaultModules()), []);
});

test("dashboard: empty data, unopened/zero hours and individual revenue creation order preserve real zero", () => {
  assert.equal(recordedMinutes(EMPTY_HOURS), null);
  const hours: HoursData = { ...EMPTY_HOURS, open: { id: "open", start: "2026-11-01", end: null, version: 0, entries: [], extras: {} } };
  assert.equal(recordedMinutes(hours), 0);
  hours.open!.entries = [{ key: "a", employee: "one", date: "2026-11-01", minutes: 61, edited: true }, { key: "b", employee: "two", date: "2026-11-02", minutes: 30, edited: false }];
  assert.equal(recordedMinutes(hours), 91);
  assert.deepEqual(dashboardValues({}), { minutes: null, revenue: null, bookDate: null, reminders: [] });
  let revenue = demoSaveRevenue(EMPTY_REVENUE, "a", null, revenueValues("2026-11-22", "", "100", ""), "2026-11-22T10:00:00Z");
  revenue = demoSaveRevenue(revenue, "b", null, revenueValues("2026-11-22", "", "20", "30"), "2026-11-22T11:00:00Z");
  assert.deepEqual(dashboardValues({ revenue: { data: revenue } }).revenue, { id: "b", date: "2026-11-22", total: 5000 });
  revenue = demoSaveRevenue(revenue, "c", null, revenueValues("2026-11-01", "", "0", ""), "2026-11-22T11:00:00Z");
  revenue = demoSaveRevenue(revenue, "a", 0, revenueValues("2026-12-01", "", "999", ""), "2026-11-22T12:00:00Z");
  assert.deepEqual(dashboardValues({ revenue: { data: revenue } }).revenue, { id: "c", date: "2026-11-01", total: 0 });
  assert.equal(dashboardValues({ revenue: { data: EMPTY_REVENUE } }).revenue, null);
});

test("dashboard: failed reads are unavailable rather than zero; other sources remain usable", async () => {
  const data = await loadDashboard(all, false, "company", { ...readers, revenue: async () => { throw new Error("ACCESS_DENIED"); } });
  assert.ok(data.revenue?.error);
  assert.equal(data.revenue?.data, undefined);
  assert.deepEqual(data.hours?.data, EMPTY_HOURS);
  assert.deepEqual(data.notes?.data, EMPTY_NOTES);
});

test("dashboard: last completed book uses completion sequence, active reminders use existing Notes order", () => {
  const book = { id: "a", date: "2026-11-21", shift: "", rows: [], sequence: 1, revision: 0, completedAt: "2026-11-22T10:00:00Z" };
  const note = (id: string, date: string, completed = false): NoteEntry => ({ ...noteValues(id, date, "", completed), id, version: 0, createdAt: "2026-11-22T10:00:00Z", updatedAt: "2026-11-22T10:00:00Z" });
  const notes = [note("later", "2026-12-01"), note("done", "2026-11-01", true), note("plain", ""), note("earlier", "2026-11-01")];
  const result = dashboardValues({ bar: { data: { ...EMPTY_BAR, books: [book, { ...book, id: "b", sequence: 2, date: "2026-11-22" }] } }, notes: { data: { entries: notes } } });
  assert.equal(result.bookDate, "2026-11-22");
  assert.deepEqual(result.reminders.map(n => n.id), ["earlier", "later"]);
});

test("dashboard: rendered cards/actions follow module choices and do not expose payroll", () => {
  const html = (settings: ModuleSettings) => renderToStaticMarkup(createElement(DashboardPanel, { companyId: null, workspace: createWorkspace("Test"), settings, readOnly: false, go: () => {} }));
  const full = html(all);
  for (const label of ["Danas na rasporedu", "Evidentirani sati", "Poslednji unos pazara", "Poslednja završena knjiga", "Aktivni podsetnici", "Unesi pazar", "Beleška / podsetnik"]) assert.ok(full.includes(label));
  const scheduleOnly = html({ ...defaultModules(), overview: true });
  assert.ok(scheduleOnly.includes("Danas na rasporedu"));
  for (const label of ["Evidentirani sati", "pazara", "završena knjiga", "Aktivni podsetnici", "Unesi pazar", "Beleška / podsetnik", "RSD"]) assert.ok(!scheduleOnly.includes(label));
  for (const label of ["plata", "profit", "Izveštaj", "read_reports"]) assert.ok(!full.includes(label));
});

test("shared module service: demo reads, refresh and Notes completion/retry use the same persisted data", async () => {
  const originalStorage = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  const values = new Map<string, string>();
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: { getItem: (k: string) => values.get(k) ?? null, setItem: (k: string, v: string) => values.set(k, v) } });
  Object.defineProperty(globalThis, "navigator", { configurable: true, value: {} });
  try {
    assert.deepEqual(await readHours(null), EMPTY_HOURS); assert.deepEqual(await readRevenue(null), EMPTY_REVENUE); assert.deepEqual(await readBar(null), EMPTY_BAR);
    assert.deepEqual(await readNotes(null), EMPTY_NOTES);
    const note = { id: "reminder", version: null, action: "save" as const, values: noteValues("Remind", "2026-11-22") };
    const created = await saveNoteCommand(null, "create", note);
    const complete = { ...note, version: 0, values: { ...note.values, completed: true } };
    const completed = await saveNoteCommand(null, "finish", complete);
    assert.deepEqual(await saveNoteCommand(null, "finish", complete), completed);
    assert.deepEqual(await readNotes(null), completed);
    assert.equal(dashboardValues({ notes: { data: created } }).reminders.length, 1);
    assert.equal(dashboardValues({ notes: { data: completed } }).reminders.length, 0);
    await assert.rejects(saveNoteCommand(null, "stale", complete), /VERSION_CONFLICT/);
    assert.ok(values.has(DEMO_NOTES_KEY));
  } finally {
    if (originalStorage) Object.defineProperty(globalThis, "localStorage", originalStorage); else Reflect.deleteProperty(globalThis, "localStorage");
    if (originalNavigator) Object.defineProperty(globalThis, "navigator", originalNavigator); else Reflect.deleteProperty(globalThis, "navigator");
  }
});
