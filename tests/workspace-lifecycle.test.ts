import test from "node:test";
import assert from "node:assert/strict";
import { hookHarness } from "./helpers/hook-harness";
import { createWorkspace } from "../src/lib/demo";
import { companyStorageKey, type StoredState } from "../src/lib/storage";
import type { CloudWorkspace } from "../src/lib/supabase";
import { accessDenied } from "../src/lib/access";
import type { useWorkspace } from "../src/components/use-workspace";
import type { HoursData } from "../src/lib/hours";
import { EMPTY_HOURS } from "../src/lib/hours";
import { EMPTY_REVENUE } from "../src/lib/revenue";
import { EMPTY_NOTES } from "../src/lib/notes";
import { EMPTY_BAR } from "../src/lib/bar";
import { defaultModules } from "../src/lib/modules";
import { renderToStaticMarkup } from "react-dom/server";

const state = (name: string): StoredState => ({ schema: 2, revision: 0, current: createWorkspace(name), past: [], future: [] });
const cloud = (id = "first", user = "owner"): CloudWorkspace => ({ company_id: id, user_id: user, version: 0, state: state(id), role: "owner", access_status: "pilot", trial_ends_at: null });
function deferred<T>() { let resolve!: (value: T) => void, reject!: (e: Error) => void; const promise = new Promise<T>((r, j) => { resolve = r; reject = j; }); return { promise, resolve, reject }; }

function environment(t: any) {
  let hook: ReturnType<typeof hookHarness<ReturnType<typeof useWorkspace>>>;
  t.after(() => hook?.unmount());
  const storage = new Map<string, string>(), events = new Map<string, Set<(...args: any[]) => any>>();
  const globals: Record<string, unknown> = {
    localStorage: { get length() { return storage.size; }, key: (i: number) => [...storage.keys()][i] ?? null, getItem: (key: string) => storage.get(key) ?? null, setItem: (k: string, v: string) => storage.set(k, v), removeItem: (k: string) => storage.delete(k) },
    navigator: { onLine: true }, location: { search: "", pathname: "/" },
    document: { visibilityState: "visible", documentElement: { dataset: {} }, addEventListener() {}, removeEventListener() {} },
    window: { addEventListener: (name: string, fn: any) => { if (!events.has(name)) events.set(name, new Set()); events.get(name)!.add(fn); }, removeEventListener: (name: string, fn: any) => events.get(name)?.delete(fn) },
  };
  for (const [name, value] of Object.entries(globals)) {
    const original = Object.getOwnPropertyDescriptor(globalThis, name);
    Object.defineProperty(globalThis, name, { configurable: true, value });
    t.after(() => { if (original) Object.defineProperty(globalThis, name, original); else Reflect.deleteProperty(globalThis, name); });
  }
  t.mock.timers.enable({ apis: ["setTimeout", "setInterval"] });
  let auth: (event: string, session?: any) => void = () => {}, activeUser = "owner";
  const api = {
    getSupabase: () => ({ auth: { getSession: async () => ({ data: { session: { user: { id: activeUser, email: `${activeUser}@example.test` } } } }), onAuthStateChange: (fn: typeof auth) => { auth = fn; return { data: { subscription: { unsubscribe() {} } } }; } } }),
    loadCloud: async (id?: string) => cloud(id), loadPlanner: async () => cloud(), saveCloud: async () => 1, savePlanner: async () => 1,
  };
  hook = hookHarness<ReturnType<typeof useWorkspace>>("src/components/use-workspace.ts", "useWorkspace", { "@/lib/supabase": api });
  return { hook, storage, api, auth: (event: string, user?: string) => { if (user) activeUser = user; auth(event, user ? { user: { id: user } } : undefined); }, emit: async (name: string, event?: unknown) => { await Promise.all([...events.get(name) ?? []].map(fn => fn(event))); await hook.settle(); } };
}

test("workspace lifecycle: refresh stays on selected tenant and stale UI cannot write into another", async t => {
  const env = environment(t); await env.hook.settle();
  const oldChange = env.hook.value.setState;
  await env.hook.value.connect("second"); await env.hook.settle();
  const ids: (string | undefined)[] = [];
  env.api.loadCloud = async id => { ids.push(id); return cloud(id); };
  await env.emit("focus");
  assert.deepEqual(ids, ["second"]);
  oldChange(state("old tenant edit")); await env.hook.settle();
  assert.equal(env.hook.value.state!.current.name, "second");
  env.hook.value.setState(state("current edit")); await env.hook.settle();
  assert.equal(env.hook.value.state!.current.name, "current edit");
});

test("workspace lifecycle: remote changes update the same tenant with one read and preserve its UI scope", async t => {
  const env = environment(t); await env.hook.settle();
  const change = env.hook.value.setState;
  let reads = 0;
  env.api.loadCloud = async id => { reads++; return { ...cloud(id), version: 1, state: state("remote update") }; };
  await env.emit("focus");
  assert.equal(reads, 1); assert.equal(env.hook.value.state!.current.name, "remote update");
  assert.equal(env.hook.value.cloudId, "first");
  change(state("edit after refresh")); await env.hook.settle();
  assert.equal(env.hook.value.state!.current.name, "edit after refresh");
});

test("workspace lifecycle: account change discards late connect response and late sync failure", async t => {
  const env = environment(t); await env.hook.settle();
  const slowSave = deferred<number>(); env.api.saveCloud = () => slowSave.promise;
  env.hook.value.setState(state("unsent old edit")); const saving = env.hook.value.flush();
  await env.hook.settle();
  const slowConnect = deferred<CloudWorkspace>(); env.api.loadCloud = () => slowConnect.promise;
  const connecting = env.hook.value.connect("slow"); await env.hook.settle();
  env.api.loadCloud = async () => cloud("new-company", "new-user");
  env.auth("SIGNED_IN", "new-user"); t.mock.timers.tick(0); await env.hook.settle();
  slowConnect.resolve(cloud("slow", "owner")); slowSave.reject(new Error("old network failure"));
  await Promise.all([connecting, saving]); await env.hook.settle();
  assert.equal(env.hook.value.cloudId, "new-company");
  assert.equal(env.hook.value.state!.current.name, "new-company");
  assert.equal(env.hook.value.saveError, false);
  assert.ok([...env.storage.keys()].some(key => key.startsWith(companyStorageKey("owner", "first") + ":outbox:")), "old recoverable queue remains in its original tenant");
});

test("workspace lifecycle: network errors preserve pending edits, revoked membership hides data even while pending", async t => {
  const env = environment(t); await env.hook.settle();
  env.api.saveCloud = async () => { throw new Error("Network offline"); };
  env.hook.value.setState(state("recoverable edit")); await env.hook.value.flush(); await env.hook.settle();
  env.api.loadCloud = async () => { throw new Error("Network offline"); };
  await env.emit("focus"); assert.equal(env.hook.value.state!.current.name, "recoverable edit");
  env.api.loadCloud = async () => { throw Object.assign(new Error("Removed"), { code: "ACCESS_DENIED" }); };
  await env.emit("focus");
  assert.equal(env.hook.value.state, null); assert.equal(env.hook.value.cloudId, null);
  assert.equal(env.hook.value.connectionError, "Removed");
  assert.ok([...env.storage.keys()].some(key => key.includes(":outbox:operation:")));
  await env.emit("storage", { key: companyStorageKey("owner", "first"), newValue: JSON.stringify(state("cached secret")) });
  assert.equal(env.hook.value.state, null, "storage events cannot reopen a revoked cloud workspace");
});

test("workspace lifecycle: corrupt recovery queue returns false without an unhandled rejection", async t => {
  const env = environment(t); await env.hook.settle();
  env.hook.value.setState(state("edit")); await env.hook.settle();
  const key = [...env.storage.keys()].find(key => key.includes(":outbox:operation:"))!;
  env.storage.set(key, "broken json");
  assert.equal(await env.hook.value.flush(), false);
  await env.hook.settle(); assert.equal(env.hook.value.saveError, true);
});

test("access failure classification distinguishes revoked sessions from temporary network failures", () => {
  for (const error of [{ code: "ACCESS_DENIED" }, { code: "42501" }, { status: 401 }, { name: "AuthSessionMissingError" }, { code: "PGRST116" }]) assert.equal(accessDenied(error), true);
  for (const error of [new Error("Failed to fetch"), { status: 503 }, { code: "PGRST000" }, null]) assert.equal(accessDenied(error), false);
});

test("hours lifecycle: denied refresh removes previously displayed salary history and recovers on retry", async t => {
  const env = environment(t); await env.hook.settle();
  let denied = false;
  const data: HoursData = { open: null, rates: {}, history: [{ id: "history", start: "2026-10-01", end: "2026-10-31", closedAt: "2026-11-01T00:00:00Z", company: "first", rows: [{ employee: "one", name: "Private worker", hours: 1, minutes: 60, shifts: 1, method: "hourly", rate: 10000, base: 10000, overtime: 0, total: 10000 }] }] };
  const panel = hookHarness<any>("src/components/hours-panel.tsx", "HoursPanel", { "@/lib/module-data": { readHours: async () => { if (denied) throw new Error("ACCESS_DENIED"); return data; } } }, [{ companyId: "first", workspace: createWorkspace("first"), readOnly: false, flush: async () => true }]);
  // Register this cleanup before the globals are restored by environment's cleanup.
  try {
    await panel.settle(); assert.ok(JSON.stringify(panel.value).includes("Private worker"));
    denied = true; await env.emit("focus"); await panel.settle();
    assert.ok(!JSON.stringify(panel.value).includes("Private worker"));
    assert.ok(JSON.stringify(panel.value).includes("Podaci nisu dostupni"));
    denied = false; await env.emit("focus"); await panel.settle();
    assert.ok(JSON.stringify(panel.value).includes("Private worker"));
  } finally { panel.unmount(); }
});

test("module panels: loaded empty states and settings render without errors", async t => {
  const env = environment(t); await env.hook.settle();
  const services = { readHours: async () => EMPTY_HOURS, readRevenue: async () => EMPTY_REVENUE, readNotes: async () => EMPTY_NOTES, readBar: async () => EMPTY_BAR };
  const cases = [
    ["hours", "HoursPanel", {}, "Otvori prvi period"],
    ["revenue", "RevenuePanel", {}, "Još nema evidentiranog pazara."],
    ["notes", "NotesPanel", {}, "Nema aktivnih podsetnika."],
    ["bar", "BarPanel", {}, "Nema završenih knjiga."],
    ["bar", "BarPanel", { settingsOnly: true }, "Dodajte prvi artikal"],
  ] as const;
  for (const [file, name, props, expected] of cases) {
    const panel = hookHarness<any>(`src/components/${file}-panel.tsx`, name, { "@/lib/module-data": services }, [{ companyId: null, companyName: "Test", workspace: createWorkspace("Test"), readOnly: false, flush: async () => true, ...props }]);
    try { await panel.settle(); const html = renderToStaticMarkup(panel.value); assert.ok(html.includes(expected), name); assert.ok(!html.includes("Učitavanje"), name); }
    finally { panel.unmount(); }
  }
});

test("main screen smoke: all existing navigation destinations render; planner only exposes scheduling", async t => {
  const env = environment(t); await env.hook.settle();
  const settings = { ...defaultModules(), hours: true, revenue: true, notes: true, bar: true };
  const workspace = { ...env.hook.value, cloudId: null, authUser: "", state: state("Smoke"), plannerMode: false, readOnly: false };
  const panel = hookHarness<any>("src/components/shiftflow.tsx", "default", {
    "./use-workspace": { useWorkspace: () => workspace },
    "./use-company-modules": { useCompanyModules: () => ({ settings, loading: false, saving: false, error: "", toggle() {} }) },
  });
  const text = (node: any): string => Array.isArray(node) ? node.map(text).join("") : node?.props ? text(node.props.children) : typeof node === "string" ? node : "";
  const walk = (node: any): any[] => Array.isArray(node) ? node.flatMap(walk) : node?.props ? [node, ...walk(node.props.children)] : [];
  try {
    await panel.settle();
    for (const destination of ["Pregled", "Raspored", "Zaposleni", "Dostupnost", "Pravila rada", "Istorija izmena", "Podešavanja", "Radni sati i obračun", "Pazar", "Notes i podsetnici", "Knjiga šanka i inventar"]) {
      const nav = walk(panel.value).find(node => node.props.className?.includes("nav-link") && text(node).startsWith(destination));
      assert.ok(nav, destination); nav.props.onClick(); await panel.settle();
      const html = renderToStaticMarkup(panel.value); assert.ok(html.includes("Smoke"), destination);
      if (destination === "Pregled") { assert.ok(html.includes("Danas na rasporedu")); assert.ok(html.includes("schedule-section")); }
    }
  } finally { panel.unmount(); }
  const planner = hookHarness<any>("src/components/shiftflow.tsx", "default", {
    "./use-workspace": { useWorkspace: () => ({ ...workspace, plannerMode: true }) },
    "./use-company-modules": { useCompanyModules: () => ({ settings, loading: false, saving: false, error: "", toggle() {} }) },
  });
  try {
    await planner.settle();
    const links = walk(planner.value).filter(node => node.props.className?.includes("nav-link")).map(text);
    assert.deepEqual(links, ["Raspored", "Dostupnost"]);
    const html = renderToStaticMarkup(planner.value);
    for (const label of ["Poslednji unos pazara", "Radni sati i obračun", "Aktivni podsetnici", "Knjiga šanka i inventar"]) assert.ok(!html.includes(label));
  } finally { planner.unmount(); }
});

test("account control: duplicate sign-out is blocked and a failed flush remains visible and retryable", async t => {
  const env = environment(t); await env.hook.settle();
  const rejected = deferred<void>();
  let operation = rejected.promise, calls = 0;
  const errors: string[] = [];
  const panel = hookHarness<any>("src/components/account-control.tsx", "AccountControl", {}, [{
    signedIn: true, label: "Test account", onSignIn() {},
    onSignOut: () => { calls++; return operation; },
    onError: (error: string) => errors.push(error),
  }]);
  const walk = (node: any): any[] => Array.isArray(node) ? node.flatMap(walk) : node?.props ? [node, ...walk(node.props.children)] : [];
  const button = () => walk(panel.value).find(node => node.props.onClick);
  try {
    const first = button().props.onClick();
    await panel.settle(); assert.equal(button().props.disabled, true);
    await button().props.onClick(); assert.equal(calls, 1);
    rejected.reject(new Error("Sačekajte da se izmene sačuvaju."));
    await first; await panel.settle();
    assert.deepEqual(errors, ["Sačekajte da se izmene sačuvaju."]);
    assert.equal(button().props.disabled, false);
    operation = Promise.resolve();
    await button().props.onClick(); await panel.settle();
    assert.equal(calls, 2); assert.equal(button().props.disabled, false);
  } finally { panel.unmount(); }
});
