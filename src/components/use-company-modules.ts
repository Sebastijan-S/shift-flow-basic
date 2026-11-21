"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { DEMO_MODULES_KEY, defaultModules, parseModules, type ModuleId, type ModuleSettings } from "@/lib/modules";
import { loadCompanyModules, saveCompanyModule } from "@/lib/supabase";

interface ModuleState { scope: string; settings: ModuleSettings; loading: boolean; saving: boolean; error: string }

export function useCompanyModules(companyId: string | null, restricted: boolean, user: string) {
  const scope = restricted ? "restricted" : companyId ? `${user}:${companyId}` : "demo";
  const [state, setState] = useState<ModuleState>({ scope: "", settings: defaultModules(), loading: true, saving: false, error: "" });
  const epoch = useRef(0);
  const pending = useRef(false);
  const request = useRef(0);

  useEffect(() => {
    const generation = ++epoch.current;
    pending.current = false;
    setState({ scope, settings: defaultModules(), loading: !restricted, saving: false, error: "" });
    if (restricted) return;
    const refresh = async () => {
      if (pending.current) return;
      const revision = ++request.current;
      try {
        const settings = companyId ? await loadCompanyModules(companyId) : parseModules(JSON.parse(localStorage.getItem(DEMO_MODULES_KEY) ?? "{}"));
        if (epoch.current === generation && request.current === revision && !pending.current) {
          setState({ scope, settings, loading: false, saving: false, error: "" });
        }
      } catch {
        if (epoch.current === generation && request.current === revision && !pending.current) {
          setState(s => ({ ...s, loading: false, error: "Podešavanja modula nisu učitana. Pokušajte ponovo." }));
        }
      }
    };
    void refresh();
    const storage = (event: StorageEvent) => { if (!companyId && event.key === DEMO_MODULES_KEY) void refresh(); };
    window.addEventListener("focus", refresh);
    window.addEventListener("storage", storage);
    const timer = companyId ? setInterval(refresh, 15000) : null;
    return () => { ++epoch.current; window.removeEventListener("focus", refresh); window.removeEventListener("storage", storage); if (timer) clearInterval(timer); };
  }, [companyId, restricted, scope]);

  const toggle = useCallback(async (id: ModuleId, enabled: boolean) => {
    if (restricted || state.scope !== scope || state.loading || pending.current || (id === "schedule" && !enabled)) return;
    const generation = epoch.current;
    ++request.current;
    pending.current = true;
    setState(s => ({ ...s, saving: true, error: "" }));
    try {
      if (companyId) await saveCompanyModule(companyId, id, enabled);
      else {
        const saved = parseModules(JSON.parse(localStorage.getItem(DEMO_MODULES_KEY) ?? "{}"));
        localStorage.setItem(DEMO_MODULES_KEY, JSON.stringify({ ...saved, [id]: enabled }));
      }
      if (epoch.current === generation) {
        const settings = companyId ? await loadCompanyModules(companyId) : parseModules(JSON.parse(localStorage.getItem(DEMO_MODULES_KEY) ?? "{}"));
        if (epoch.current === generation) setState({ scope, settings, loading: false, saving: false, error: "" });
      }
    } catch {
      if (epoch.current === generation) setState(s => ({ ...s, saving: false, error: "Promena modula nije potvrđena. Proverite vezu i pokušajte ponovo." }));
    } finally {
      if (epoch.current === generation) pending.current = false;
    }
  }, [companyId, restricted, scope, state.scope, state.loading]);

  if (state.scope !== scope) return { settings: defaultModules(), loading: true, saving: false, error: "", toggle };
  return { ...state, toggle };
}
