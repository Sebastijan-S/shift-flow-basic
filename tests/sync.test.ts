import test from "node:test";
import assert from "node:assert/strict";
import { createWorkspace } from "../src/lib/demo";
import { WorkspaceSync } from "../src/lib/sync";
import type { StoredState } from "../src/lib/storage";

function state(name: string, revision = 0): StoredState { return { schema: 2, revision, current: createWorkspace(name), past: [], future: [] }; }

test("sync: edits made during a slow save are saved in order", async () => {
  let resolve!: (version: number) => void; const saved: string[] = [];
  const sync = new WorkspaceSync({ state: state("Base"), version: 0, save: async s => { saved.push(s.current.name); if (saved.length === 1) return new Promise<number>(r => { resolve = r; }); return saved.length; }, load: async () => ({ state: state("Base"), version: 0 }), pending: () => {}, acknowledge: () => {}, status: () => {} });
  sync.enqueue(state("First", 1)); const running = sync.flush(); sync.enqueue(state("Second", 2)); resolve(1); await running;
  assert.deepEqual(saved, ["First", "Second"]); assert.equal(sync.isPending(), false);
});

test("sync: lost response retries the exact operation before newer edits", async () => {
  const calls: { id: string; name: string; version: number }[] = []; let fail = true;
  const sync = new WorkspaceSync({ state: state("Base"), version: 0, save: async (s, version, id) => { calls.push({ id, name: s.current.name, version }); if (fail) { fail = false; throw new Error("Network disconnected after commit"); } return calls.length - 1; }, load: async () => ({ state: state("Base"), version: 0 }), pending: () => {}, acknowledge: () => {}, status: () => {} });
  const first = state("First", 1); first.past = [{ label: "Private local history", time: "2026-11-14T10:00:00Z", snapshot: state("Old").current }];
  sync.enqueue(first); await sync.flush(); assert.equal(sync.isPending(), true);
  sync.enqueue(state("Second", 2)); await sync.flush();
  assert.equal(calls[0].id, calls[1].id); assert.equal(calls[0].name, calls[1].name);
  assert.equal(calls[2].name, "Second"); assert.equal(sync.isPending(), false);
});

test("sync: disposing a workspace during a delayed conflict stops reads and callbacks", async () => {
  let reject!: (error: Error) => void, loads = 0, callbacks = 0;
  const sync = new WorkspaceSync({ state: state("Base"), version: 0,
    save: () => new Promise<number>((_, fail) => { reject = fail; }),
    load: async () => { loads++; return { state: state("Remote"), version: 1 }; },
    pending: () => { callbacks++; }, acknowledge: () => { callbacks++; }, status: () => { callbacks++; },
  });
  sync.enqueue(state("Old tenant edit", 1)); const running = sync.flush();
  sync.dispose(); const before = callbacks; reject(new Error("VERSION_CONFLICT")); await running;
  assert.equal(loads, 0); assert.equal(callbacks, before);
  assert.equal(sync.pendingJobs().length, 1, "the original operation remains available for tenant-scoped recovery");
});
