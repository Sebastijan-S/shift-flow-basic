import test from "node:test";
import assert from "node:assert/strict";
import { createWorkspace } from "../src/lib/demo";
import { WorkspaceOutbox } from "../src/lib/outbox";
import { publishAfterFlush } from "../src/lib/publish";
import { cloudState, type StoredState } from "../src/lib/storage";
import { WorkspaceSync, type PendingSave } from "../src/lib/sync";
import { mergeWorkspace } from "../src/lib/workspace-merge";

function state(name = "Base"): StoredState { return { schema: 2, revision: 0, current: createWorkspace(name), past: [], future: [] }; }

class MemoryStorage {
  values = new Map<string, string>();
  get length() { return this.values.size; }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
}

function server(initial: StoredState) {
  let current = cloudState(initial), version = 0;
  const receipts = new Map<string, number>();
  return {
    load: async () => ({ state: structuredClone(current), version }),
    save: async (next: StoredState, expected: number, id: string) => {
      if (receipts.has(id)) return receipts.get(id)!;
      if (expected !== version) throw new Error("VERSION_CONFLICT");
      current = structuredClone(next); receipts.set(id, ++version); return version;
    },
    get current() { return current; },
    get version() { return version; }
  };
}

test("recovered offline operation keeps independent remote data after another edit", async () => {
  const original = state(); const remote = server(original);
  const offline = structuredClone(original); offline.current.rules.maxWeeklyHours = 36;
  const job: PendingSave = { id: crypto.randomUUID(), base: cloudState(original), state: cloudState(offline), version: 0 };
  const storage = new MemoryStorage();
  storage.setItem("company:outbox", JSON.stringify([job]));
  const outbox = new WorkspaceOutbox(storage, "company");
  const other = structuredClone(original); other.current.name = "Remote name";
  await remote.save(other, 0, crypto.randomUUID());
  const loaded = await remote.load();
  const pending = outbox.read();
  assert.equal(storage.getItem("company:outbox"), null, "legacy queue migrates without dropping operations");
  let ui = { ...loaded.state, current: mergeWorkspace(pending[0].base.current, pending[0].state.current, loaded.state.current) };
  const sync = new WorkspaceSync({ ...loaded, save: remote.save, load: remote.load,
    pending: jobs => outbox.write(jobs), acknowledged: id => outbox.acknowledge(id),
    acknowledge: (saved, base) => { ui = { ...ui, current: mergeWorkspace(base.current, ui.current, saved.current) }; }, status: () => {} });
  sync.restore(pending); await sync.flush();
  assert.equal(ui.current.name, "Remote name");
  assert.equal(ui.current.rules.maxWeeklyHours, 36);
  ui = { ...ui, current: { ...ui.current, rules: { ...ui.current.rules, minRestHours: 10 } } };
  sync.enqueue(ui); await sync.flush();
  assert.equal(remote.current.current.name, "Remote name");
  assert.equal(remote.current.current.rules.maxWeeklyHours, 36);
  assert.equal(remote.current.current.rules.minRestHours, 10);
  assert.deepEqual(ui.current, remote.current.current);
});

test("two tabs persist separate operations and the second reload recovers its edit", async () => {
  const initial = state(), remote = server(initial), storage = new MemoryStorage();
  const firstOutbox = new WorkspaceOutbox(storage, "company");
  const secondOutbox = new WorkspaceOutbox(storage, "company");
  const first = new WorkspaceSync({ state: initial, version: 0, save: remote.save, load: remote.load,
    pending: jobs => firstOutbox.write(jobs), acknowledged: id => firstOutbox.acknowledge(id), acknowledge: () => {}, status: () => {} });
  const second = new WorkspaceSync({ state: initial, version: 0, save: remote.save, load: remote.load,
    pending: jobs => secondOutbox.write(jobs), acknowledged: id => secondOutbox.acknowledge(id), acknowledge: () => {}, status: () => {} });
  const firstEdit = structuredClone(initial); firstEdit.current.name = "First tab";
  const secondEdit = structuredClone(initial); secondEdit.current.rules.maxWeeklyHours = 35;
  first.enqueue(firstEdit); second.enqueue(secondEdit);
  const secondId = second.pendingJobs()[0].id;
  await first.flush();
  assert.deepEqual(secondOutbox.read().map(job => job.id), [secondId], "first tab only removes its receipt");
  second.dispose();
  const loaded = await remote.load(), pending = secondOutbox.read();
  let ui = { ...loaded.state, current: mergeWorkspace(pending[0].base.current, pending[0].state.current, loaded.state.current) };
  const reloaded = new WorkspaceSync({ ...loaded, save: remote.save, load: remote.load,
    pending: jobs => secondOutbox.write(jobs), acknowledged: id => secondOutbox.acknowledge(id),
    acknowledge: (saved, base) => { ui = { ...ui, current: mergeWorkspace(base.current, ui.current, saved.current) }; }, status: () => {} });
  reloaded.restore(pending); await reloaded.flush();
  assert.equal(remote.current.current.name, "First tab");
  assert.equal(remote.current.current.rules.maxWeeklyHours, 35);
  assert.deepEqual(ui.current, remote.current.current);
  assert.equal(secondOutbox.read().length, 0);
});

test("recurring availability merges different days and rejects conflicts or deletion versus edit", () => {
  const base = createWorkspace();
  base.employees.push({ id: "worker", name: "Worker", initials: "W", color: "mint", positions: ["Barista"], targetHours: 40, active: true, daysOff: [], availability: [
    { day: 0, start: "08:00", end: "16:00" }, { day: 1, start: "08:00", end: "16:00" }
  ] });
  const local = structuredClone(base), remote = structuredClone(base);
  local.employees[0].availability![0].start = "09:00";
  remote.employees[0].availability![1].end = "17:00";
  const merged = mergeWorkspace(base, local, remote).employees[0].availability!;
  assert.deepEqual(merged.find(v => v.day === 0), { day: 0, start: "09:00", end: "16:00" });
  assert.deepEqual(merged.find(v => v.day === 1), { day: 1, start: "08:00", end: "17:00" });
  remote.employees[0].availability![0].start = "10:00";
  assert.throws(() => mergeWorkspace(base, local, remote), /istu nedeljnu dostupnost/i);
  remote.employees[0].availability = remote.employees[0].availability!.filter(v => v.day !== 0);
  assert.throws(() => mergeWorkspace(base, local, remote), /obrisan/i);
  local.employees[0].availability = local.employees[0].availability!.filter(v => v.day !== 1);
  remote.employees[0].availability = structuredClone(base.employees[0].availability);
  remote.employees[0].availability![1].end = "18:00";
  assert.throws(() => mergeWorkspace(base, local, remote), /izmenjen/i);
});

test("publication reads the state synchronized during its initial flush", async () => {
  const week = "2027-01-04", otherWeek = "2027-01-11";
  let ui = state();
  ui.current.employees.push({ id: "worker", name: "Worker", initials: "W", color: "mint", positions: ["Barista"], targetHours: 40, active: true, daysOff: [] });
  ui.current.schedules[week] = { week, status: "draft", assignments: [] };
  ui.current.schedules[otherWeek] = { week: otherWeek, status: "draft", assignments: [] };
  let calls = 0;
  const flush = async () => {
    if (++calls === 1) {
      ui = { ...ui, current: { ...ui.current, name: "Remote name", schedules: { ...ui.current.schedules, [week]: {
        ...ui.current.schedules[week], assignments: [{ id: "remote-shift", employeeId: "worker", day: 0, templateId: "morning", position: "Barista", locked: false, note: "" }]
      } } } };
    }
    return true;
  };
  assert.equal(await publishAfterFlush(flush, () => ui, next => { ui = next; }, week, () => "2027-01-01T00:00:00Z"), true);
  assert.equal(ui.current.name, "Remote name");
  assert.equal(ui.current.schedules[week].assignments[0].id, "remote-shift");
  assert.equal(ui.current.schedules[week].status, "published");
  assert.equal(ui.current.schedules[otherWeek].status, "draft");
  assert.equal(calls, 2);
});
