"use client";

import { MODULES, type ModuleId, type ModuleSettings } from "@/lib/modules";

export function ModuleSettingsPanel({ settings, loading, saving, error, readOnly, toggle }: {
  settings: ModuleSettings; loading: boolean; saving: boolean; error: string; readOnly: boolean;
  toggle: (id: ModuleId, enabled: boolean) => Promise<void>;
}) {
  return <section id="settings-modules" className="panel basic-panel module-settings settings-index-target" tabIndex={-1} aria-labelledby="module-settings-title" aria-busy={loading || saving}>
    <div className="settings-section-heading"><h2 id="module-settings-title">Izbor modula</h2><span className="settings-save-mode">Čuva se automatski</span></div>
    <p className="muted">Isključivanje skriva modul; podaci ostaju sačuvani.</p>
    <div className="module-list">{MODULES.filter(module => !module.required).map(module => <label className="module-option" key={module.id}>
      <span><strong>{module.name}</strong><span className="module-description">{module.description}</span>
        <span className="module-status">{!module.available ? "U pripremi" : settings[module.id] ? "Uključen" : "Isključen"}</span></span>
      <input type="checkbox" role="switch" aria-label={module.name} checked={settings[module.id]}
        disabled={module.required || loading || saving || readOnly || !!error}
        onChange={event => void toggle(module.id, event.target.checked)} />
    </label>)}</div>
    {(loading || saving || error) && <p className="module-save-status" role="status">{loading ? "Učitavanje modula…" : saving ? "Čuvanje izbora…" : error}</p>}
    {error && <button type="button" className="today-button" onClick={() => window.dispatchEvent(new Event("focus"))}>Pokušaj ponovo</button>}
  </section>;
}
