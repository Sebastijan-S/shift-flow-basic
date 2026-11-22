"use client";

import { useEffect, useRef, useState } from "react";
import { dashboardActions, dashboardSources, dashboardValues, loadDashboard, scheduledToday, todayInBelgrade, type DashboardResults, type DashboardSource } from "@/lib/dashboard";
import { readBar, readHours, readNotes, readRevenue, saveNoteCommand } from "@/lib/module-data";
import type { ModuleSettings } from "@/lib/modules";
import type { Workspace } from "@/lib/scheduler";
import { money } from "@/lib/hours";
import { noteOverdue, type NoteEntry } from "@/lib/notes";
import { Button } from "./ui/button";

const readers = { hours: readHours, revenue: readRevenue, bar: readBar, notes: readNotes };
const dateLabel = (date: string) => new Date(date + "T12:00:00Z").toLocaleDateString("sr-Latn-RS", { timeZone: "Europe/Belgrade" });
type Target = ReturnType<typeof dashboardActions>[number]["page"];

/** Mounted only for the full-access overview; the parent key isolates user, company and module choices. */
export function DashboardPanel({ companyId, workspace, settings, readOnly, go }: {
  companyId: string | null; workspace: Workspace; settings: ModuleSettings; readOnly: boolean; go: (page: Target) => void;
}) {
  const [data, setData] = useState<DashboardResults>({});
  const [now, setNow] = useState(() => new Date());
  const [busy, setBusy] = useState(false), [status, setStatus] = useState("");
  const alive = useRef(false), revision = useRef(0), pending = useRef(false);
  const operation = useRef<{ key: string; request: string } | null>(null);
  const sources = dashboardSources(settings);
  const sourceKey = sources.join(":");
  const load = async () => {
    setNow(new Date());
    if (pending.current) return;
    const request = ++revision.current;
    const results = await loadDashboard(settings, false, companyId, readers);
    if (alive.current && revision.current === request && !pending.current) setData(results);
  };
  useEffect(() => {
    alive.current = true; void load();
    const refresh = () => { if (document.visibilityState !== "hidden") void load(); };
    window.addEventListener("focus", refresh); window.addEventListener("storage", refresh); document.addEventListener("visibilitychange", refresh);
    const timer = setInterval(refresh, 15000);
    return () => { alive.current = false; ++revision.current; clearInterval(timer); window.removeEventListener("focus", refresh); window.removeEventListener("storage", refresh); document.removeEventListener("visibilitychange", refresh); };
  }, [companyId, sourceKey]); // Parent remounts on identity/module changes.
  const finish = async (note: NoteEntry) => {
    if (pending.current || readOnly) return;
    const key = `${note.id}:${note.version}`;
    if (operation.current?.key !== key) operation.current = { key, request: crypto.randomUUID() };
    pending.current = true; ++revision.current; setBusy(true); setStatus("");
    try {
      const next = await saveNoteCommand(companyId, operation.current.request, { id: note.id, version: note.version, action: "save", values: { text: note.text, date: note.date, time: note.time, completed: true } });
      if (alive.current) { setData(old => ({ ...old, notes: { data: next } })); setStatus("Podsetnik je završen."); operation.current = null; }
    } catch {
      if (alive.current) setStatus("Završavanje nije potvrđeno. Osvežite pregled; ako je podsetnik još aktivan, pokušajte ponovo.");
    } finally { pending.current = false; if (alive.current) setBusy(false); }
  };
  const values = dashboardValues(data);
  const value = (id: DashboardSource, content: string) => data[id]?.error ? "Nedostupno" : !data[id]?.data ? "Učitavanje…" : content;
  const cards = [
    { id: "schedule", title: "Danas na rasporedu", value: String(scheduledToday(workspace, now)), detail: dateLabel(todayInBelgrade(now)) },
    ...(settings.hours ? [{ id: "hours", title: "Evidentirani sati", value: value("hours", values.minutes === null ? "Period nije otvoren" : `${Math.floor(values.minutes / 60)} h ${values.minutes % 60} min`), detail: "Otvoreni period" }] : []),
    ...(settings.revenue ? [{ id: "revenue", title: "Poslednji unos pazara", value: value("revenue", values.revenue ? money(values.revenue.total) : "Nema unosa"), detail: values.revenue ? `Datum prometa: ${dateLabel(values.revenue.date)}` : "Pojedinačni unos" }] : []),
    ...(settings.bar ? [{ id: "bar", title: "Poslednja završena knjiga", value: value("bar", values.bookDate ? dateLabel(values.bookDate) : "Nema završene knjige"), detail: "Knjiga šanka" }] : []),
  ];
  return <div className="operational-dashboard">
    <div className="stats-grid operational-cards">{cards.map(card => <div className="stat-card" key={card.id}><div><span>{card.title}</span></div><strong>{card.value}</strong><p>{card.detail}</p></div>)}</div>
    <section className="dashboard-actions" aria-label="Brze akcije">{dashboardActions(settings).map(action => <Button variant="outline" key={action.module} onClick={() => go(action.page)}>{action.label}</Button>)}<Button variant="ghost" disabled={busy} onClick={() => void load()}>Osveži pregled</Button></section>
    {sources.some(id => data[id]?.error) && <p className="form-error" role="alert">Deo podataka nije dostupan. Osvežite pregled.</p>}
    {settings.notes && <section className="panel dashboard-reminders" aria-label="Aktivni podsetnici" aria-busy={busy}>
      <div className="panel-heading"><h2>Aktivni podsetnici</h2><Button variant="ghost" onClick={() => go("Notes i podsetnici")}>Sve beleške i podsetnici</Button></div>
      {!data.notes?.data ? <p className="muted">{data.notes?.error ?? "Učitavanje podsetnika…"}</p> : !values.reminders.length ? <p className="muted">Nema aktivnih podsetnika.</p> : <ul>{values.reminders.slice(0, 3).map(note => <li key={note.id}>
        <div><p className="dashboard-note-text">{note.text}</p><small className={noteOverdue(note, now) ? "note-deadline" : "muted"}>{dateLabel(note.date!)}{note.time ? ` · ${note.time}` : " · do kraja dana"}{noteOverdue(note, now) ? " · Rok je prošao" : ""}</small></div>
        <Button size="sm" variant="outline" disabled={busy || readOnly} aria-label={`Završi podsetnik: ${note.text.slice(0, 80)}`} onClick={() => void finish(note)}>Završi</Button>
      </li>)}</ul>}
      {values.reminders.length > 3 && <p className="muted">Još {values.reminders.length - 3} u Notes modulu.</p>}
      <p role="status">{status}</p>
    </section>}
  </div>;
}
