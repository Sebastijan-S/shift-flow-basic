"use client";

import { MODULES, type ModuleId, type ModuleSettings } from "@/lib/modules";

export function ModuleSettingsPanel({ settings, loading, saving, error, readOnly, toggle }: {
  settings: ModuleSettings; loading: boolean; saving: boolean; error: string; readOnly: boolean;
  toggle: (id: ModuleId, enabled: boolean) => Promise<void>;
}) {
  return <section className="panel basic-panel module-settings" aria-labelledby="module-settings-title" aria-busy={loading || saving}>
    <h2 id="module-settings-title">Moduli lokala</h2>
    <p className="muted">Izaberite module za ovaj lokal. Isključivanje skriva modul i čuva njegove podatke.</p>
    <p className="muted">Za module u pripremi možete sačuvati izbor. Pojaviće se u meniju kada budu dostupni; svaki će imati svoja podešavanja.</p>
    <div className="module-list">{MODULES.map(module => <label className="module-option" key={module.id}>
      <span><strong>{module.name}</strong><span className="module-description">{module.description}</span>
        <span className="module-status">{module.required ? "Osnovni modul · uvek uključen" : !module.available ? "U pripremi" : settings[module.id] ? "Uključen" : "Isključen"}</span></span>
      <input type="checkbox" role="switch" aria-label={module.name} checked={settings[module.id]}
        disabled={module.required || loading || saving || readOnly || !!error}
        onChange={event => void toggle(module.id, event.target.checked)} />
    </label>)}</div>
    <p className="module-save-status" role="status">{loading ? "Učitavanje modula…" : saving ? "Čuvanje izbora…" : error || "Izbor se čuva automatski za ovaj lokal."}</p>
    {error && <button type="button" className="today-button" onClick={() => window.dispatchEvent(new Event("focus"))}>Pokušaj ponovo</button>}
  </section>;
}
