"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createDemo } from "@/lib/demo";
import { getSupabase, loadCloud, loadPlanner, saveCloud, savePlanner, type CloudWorkspace, type PlannerWorkspace } from "@/lib/supabase";
import { companyStorageKey, migrateState, readState, STORAGE_KEY, writeState, type StoredState } from "@/lib/storage";
import { WorkspaceSync } from "@/lib/sync";
import { mergeWorkspace } from "@/lib/workspace-merge";
import { WorkspaceOutbox } from "@/lib/outbox";
import { accessReadOnly } from "@/lib/access";

export function useWorkspace() {
  const [state, setState] = useState<StoredState | null>(null);
  const [connection, setConnection] = useState<CloudWorkspace | PlannerWorkspace | null>(null);
  const [plannerMode, setPlannerMode] = useState(false);
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState("Učitavanje…");
  const [error, setError] = useState("");
  const [connectionError, setConnectionError] = useState("");
  const latest = useRef<StoredState | null>(null);
  const sync = useRef<WorkspaceSync | null>(null);
  const key = useRef(STORAGE_KEY);
  const alive = useRef(true);
  const loading = useRef(false);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const plannerToken = useRef<string | null>(null);
  const outbox = useRef<WorkspaceOutbox | null>(null);
  const outboxFailure = useRef(false);

  const flushPending = useCallback(async () => {
    const controller = sync.current;
    if (!controller) return;
    const run = async () => {
      if (!outboxFailure.current && outbox.current) {
        const persisted = new Set(outbox.current.read().map(job => job.id));
        controller.restore(controller.pendingJobs().filter(job => persisted.has(job.id)));
      }
      await controller.flush();
    };
    if (navigator.locks) await navigator.locks.request(`${key.current}:sync`, run);
    else await run();
  }, []);

  const connect = useCallback(async (companyId?: string) => {
    if (loading.current) return;
    loading.current = true; setConnectionError(""); setError("");
    try {
      const params = new URLSearchParams(location.search);
      const token = params.get("planner");
      const preview = process.env.NODE_ENV === "development" && params.has("planner-preview");
      plannerToken.current = token;
      setPlannerMode(!!token || preview);
      if (preview && !token) {
        sync.current?.dispose(); sync.current = null;
        key.current = "shiftflow:planner-preview";
        const demo = readState(key.current) ?? migrateState({ schema: 2, revision: 0, current: createDemo(), past: [], future: [] });
        if (!alive.current) return;
        latest.current = demo; setState(demo); setConnection(null); setEmail(""); setStatus("Lokalni pregled"); return;
      }
      const db = getSupabase();
      const { data } = !token && db ? await db.auth.getSession() : { data: { session: null } };
      if (!token && !data.session) {
        sync.current?.dispose(); sync.current = null; key.current = STORAGE_KEY;
        const demo = readState() ?? migrateState({ schema: 1, revision: 0, current: createDemo(), past: [], future: [] });
        if (!alive.current) return;
        latest.current = demo; setState(demo); setConnection(null); setEmail(""); setStatus("Sačuvano lokalno"); return;
      }
      const invitation = params.get("invite");
      if (invitation && db) {
        const accepted = await db.rpc("accept_manager_invitation", { p_token: invitation });
        if (accepted.error) throw accepted.error;
        companyId = accepted.data as string;
        history.replaceState(null, "", location.pathname);
      }
      const cloud = token ? await loadPlanner(token) : await loadCloud(companyId);
      if (!alive.current) return;
      sync.current?.dispose();
      key.current = token ? `shiftflow:planner:${token.slice(0, 24)}:${cloud.company_id}` : companyStorageKey((cloud as CloudWorkspace).user_id, cloud.company_id);
      outbox.current = new WorkspaceOutbox(localStorage, key.current);
      outboxFailure.current = false;
      const pending = outbox.current.read();
      const restored = pending.reduce((current, job) => ({ ...current, current: mergeWorkspace(job.base.current, job.state.current, current.current) }), cloud.state);
      const cached = readState(key.current);
      const initial = { ...restored, past: cached?.past ?? restored.past, future: cached?.future ?? restored.future };
      latest.current = initial; setState(initial); setEmail(data.session?.user.email || ""); setConnection(cloud);
      const controller = new WorkspaceSync({
        state: cloud.state, version: cloud.version,
        save: (s, v, id) => token ? savePlanner(token, s, v, id) : saveCloud(cloud.company_id, s, v, id),
        load: () => token ? loadPlanner(token) : loadCloud(cloud.company_id),
        pending: jobs => {
          try { outbox.current?.write(jobs); outboxFailure.current = false; }
          catch { outboxFailure.current = true; if (alive.current) setError("Lokalni oporavak nije dostupan. Ostavite stranicu otvorenu dok se podaci ne sinhronizuju."); }
        },
        acknowledged: id => outbox.current?.acknowledge(id),
        status: (s, e) => { if (alive.current) { setStatus(s); if (e) setError(e.message); else if (s === "Sinhronizovano") setError(""); } },
        acknowledge: (saved, base, version) => {
          if (!alive.current) return;
          const current = latest.current;
          if (current) {
            const next = { ...current, current: mergeWorkspace(base.current, current.current, saved.current) };
            latest.current = next; setState(next);
            try { writeState(next, key.current); } catch { /* The server receipt remains authoritative. */ }
          }
          setConnection(previous => previous ? { ...previous, version, state: saved } : previous);
        }
      });
      sync.current = controller;
      if (pending.length) { controller.restore(pending); void flushPending(); } else setStatus("Sinhronizovano");
    } catch (e) { if (alive.current) { if (plannerToken.current) { sync.current?.dispose(); sync.current = null; latest.current = null; setState(null); setConnection(null); } setConnectionError((e as Error).message); setStatus("Povezivanje nije uspelo"); } }
    finally { loading.current = false; }
  }, [flushPending]);

  useEffect(() => {
    alive.current = true;
    if (new URLSearchParams(location.search).has("share")) return;
    void connect();
    const db = getSupabase();
    const subscription = plannerToken.current ? null : db?.auth.onAuthStateChange(event => {
      // Supabase auth callbacks must return before another Auth request starts.
      if (event === "SIGNED_OUT") { sync.current?.dispose(); sync.current = null; latest.current = null; setState(null); setTimeout(() => void connect(), 0); }
      if (event === "SIGNED_IN" && !sync.current) setTimeout(() => void connect(), 0);
    });
    const onStorage = (event: StorageEvent) => {
      if (event.key !== key.current || !event.newValue || sync.current) return;
      try { const incoming = migrateState(JSON.parse(event.newValue)); latest.current = incoming; setState(incoming); } catch { /* Keep the valid state. */ }
    };
    const retry = () => { if (navigator.onLine) void flushPending(); };
    const refresh = async () => {
      if (sync.current?.isPending() && !plannerToken.current) { retry(); return; }
      if (key.current === STORAGE_KEY || key.current === "shiftflow:planner-preview") return;
      try {
        const cloud = plannerToken.current ? await loadPlanner(plannerToken.current) : await loadCloud();
        if (!alive.current) return;
        if (sync.current?.isPending()) { retry(); return; }
        if (JSON.stringify(cloud.state.current) !== JSON.stringify(latest.current?.current)) await connect(cloud.company_id);
        else setConnection(cloud); // Access changes must refresh even if the schedule is unchanged.
      } catch (e) { if (plannerToken.current) { sync.current?.dispose(); sync.current = null; latest.current = null; setState(null); setConnection(null); setConnectionError((e as Error).message); } else setError((e as Error).message); }
    };
    window.addEventListener("storage", onStorage); window.addEventListener("online", retry); window.addEventListener("focus", refresh);
    const timer = setInterval(refresh, 15000);
    return () => { alive.current = false; sync.current?.dispose(); subscription?.data.subscription.unsubscribe(); window.removeEventListener("storage", onStorage); window.removeEventListener("online", retry); window.removeEventListener("focus", refresh); clearInterval(timer); if (debounce.current) clearTimeout(debounce.current); };
  }, [connect, flushPending]);

  const change = useCallback((updater: StoredState | ((previous: StoredState | null) => StoredState | null)) => {
    const next = typeof updater === "function" ? updater(latest.current) : updater;
    if (!next) return;
    latest.current = next; setState(next);
    try { writeState(next, key.current); if (!sync.current) { setStatus("Sačuvano lokalno"); setError(""); } }
    catch { setError("Čuvanje na uređaju nije uspelo."); }
    if (sync.current) {
      sync.current.enqueue(next);
      if (debounce.current) clearTimeout(debounce.current);
      debounce.current = setTimeout(() => void flushPending(), 650);
    }
  }, [flushPending]);
  const flush = useCallback(async () => { if (debounce.current) clearTimeout(debounce.current); await flushPending(); return !sync.current?.isPending(); }, [flushPending]);
  const signOut = useCallback(async () => {
    if (!(await flush())) throw new Error("Izmene još nisu sačuvane u bazi. Pokušajte ponovo pre odjave.");
    if (plannerMode) { localStorage.removeItem(key.current); location.assign("/"); return; }
    const result = await getSupabase()?.auth.signOut(); if (result?.error) throw result.error;
    localStorage.removeItem(key.current);
    sync.current?.dispose(); sync.current = null; await connect();
  }, [connect, flush, plannerMode]);
  const readOnly = accessReadOnly(connection, Date.now());
  return { state, setState: change, getLatest: () => latest.current, cloudId: connection?.company_id ?? null, role: plannerMode ? "planner" as const : connection && "role" in connection ? connection.role : null, plannerMode, authUser: email, saveStatus: error || status, saveError: !!error, connectionError, connect, flush, signOut, readOnly };
}
