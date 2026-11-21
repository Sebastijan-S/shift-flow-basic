"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getSupabase } from "@/lib/supabase";
import { DEMO_NOTES_KEY, EMPTY_NOTES, demoNotesCommand, noteOverdue, notesOrder, noteValues, type NoteCommand, type NoteEntry, type NotesData } from "@/lib/notes";
import { Button } from "./ui/button";

function errorText(error: unknown) {
  const message = (error as Error).message ?? String(error);
  if (/VERSION_CONFLICT|REQUEST_CONFLICT/.test(message)) return "Zapis je u međuvremenu promenjen. Osvežite pregled i ponovo otvorite izmenu. Uneti tekst ostaje u obrascu.";
  if (message.includes("MODULE_DISABLED")) return "Notes i podsetnici su isključeni u podešavanjima lokala.";
  if (message.includes("ACCESS_DENIED")) return "Nemate pristup beleškama ovog lokala.";
  if (message.includes("TRIAL_EXPIRED")) return "Probni period je istekao. Promena nije sačuvana.";
  if (message.includes("INVALID_DST_TIME")) return "To vreme ne postoji zbog prolećne promene sata. Izaberite drugo vreme.";
  return message;
}
export function NotesSettings() {
  return <section className="panel basic-panel"><h2>Podešavanja Notes i podsetnika</h2><p>Vremenska zona: Europe/Belgrade. Obaveštenja se prikazuju samo u ovom modulu.</p><p className="muted">Datum bez vremena važi do kraja izabranog dana. Nepostojeće vreme pri prolećnoj promeni sata se odbija; ponovljeni jesenji sat znači drugo pojavljivanje (zimsko vreme). Isključivanje modula čuva podatke.</p></section>;
}
export function NotesPanel({ companyId, readOnly }: { companyId: string | null; readOnly: boolean }) {
  const [data, setData] = useState<NotesData | null>(null), [error, setError] = useState(""), [status, setStatus] = useState(""), [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<NoteEntry | null>(null), [text, setText] = useState(""), [date, setDate] = useState(""), [time, setTime] = useState("");
  const [now, setNow] = useState(() => new Date()), [deleting, setDeleting] = useState<NoteEntry | null>(null);
  const alive = useRef(false), pending = useRef(false), revision = useRef(0), draftId = useRef<string | null>(null);
  // Retain the exact operation ID after an uncertain response; changed input gets a new ID.
  const operation = useRef<{ id: string; payload: string } | null>(null);
  const load = useCallback(async () => {
    if (pending.current) return;
    const request = ++revision.current;
    try {
      let next: NotesData;
      if (companyId) {
        const result = await getSupabase()!.rpc("read_notes", { p_company: companyId });
        if (result.error) throw result.error; next = result.data;
      } else next = JSON.parse(localStorage.getItem(DEMO_NOTES_KEY) ?? JSON.stringify(EMPTY_NOTES));
      if (alive.current && revision.current === request && !pending.current) { setData(next); setError(""); }
    } catch (e) { if (alive.current && revision.current === request) { setData(null); setError(errorText(e)); } }
  }, [companyId]);
  useEffect(() => {
    alive.current = true; void load();
    const storage = (e: StorageEvent) => { if (!companyId && e.key === DEMO_NOTES_KEY) void load(); };
    window.addEventListener("focus", load); window.addEventListener("storage", storage);
    const timer = setInterval(() => { setNow(new Date()); if (companyId) void load(); }, 15000);
    return () => { alive.current = false; ++revision.current; clearInterval(timer); window.removeEventListener("focus", load); window.removeEventListener("storage", storage); };
  }, [load, companyId]);
  const reset = () => { setEditing(null); setText(""); setDate(""); setTime(""); draftId.current = null; operation.current = null; };
  const execute = async (command: NoteCommand, resetForm = false) => {
    if (pending.current || readOnly || !data) return;
    const payload = JSON.stringify(command);
    if (operation.current?.payload !== payload) operation.current = { id: crypto.randomUUID(), payload };
    const request = operation.current.id;
    pending.current = true; ++revision.current; setBusy(true); setError(""); setStatus("");
    try {
      let next: NotesData;
      if (companyId) {
        const result = await getSupabase()!.rpc("notes_command", { p_company: companyId, p_request: request, p_command: command });
        if (result.error) throw result.error; next = result.data;
      } else {
        const write = async () => {
          const saved = JSON.parse(localStorage.getItem(DEMO_NOTES_KEY) ?? JSON.stringify(EMPTY_NOTES));
          const result = demoNotesCommand(saved, request, command); localStorage.setItem(DEMO_NOTES_KEY, JSON.stringify(result)); return result;
        };
        next = navigator.locks ? await navigator.locks.request(DEMO_NOTES_KEY, write) : await write();
      }
      if (alive.current) {
        setData(next); setNow(new Date()); setDeleting(null);
        if (resetForm || (command.action === "delete" && editing?.id === command.id)) reset();
        else operation.current = null;
        setStatus(command.action === "delete" ? "Zapis je obrisan." : "Zapis je sačuvan.");
      }
    } catch (e) { if (alive.current) setError(errorText(e)); }
    finally { pending.current = false; if (alive.current) setBusy(false); }
  };
  const save = () => {
    try {
      const values = noteValues(text, date, time, editing?.completed ?? false);
      draftId.current ??= crypto.randomUUID();
      void execute({ id: editing?.id ?? draftId.current, version: editing?.version ?? null, action: "save", values }, true);
    } catch (e) { setError(errorText(e)); }
  };
  const ordered = notesOrder(data?.entries ?? []);
  const groups = [
    { title: "Aktivni podsetnici", entries: ordered.filter(e => !e.completed && e.date) },
    { title: "Beleške", entries: ordered.filter(e => !e.completed && !e.date) },
    { title: "Završeno", entries: ordered.filter(e => e.completed) },
  ];
  return <section className="panel basic-panel notes-panel" aria-busy={busy}>
    <div className="panel-heading"><h2>Notes i podsetnici</h2><Button variant="outline" disabled={busy} onClick={() => void load()}>Osveži beleške</Button></div>
    <p className="muted">Slobodan tekst bez datuma je beleška. Dodajte datum za podsetnik; vreme je opciono. Sve ostaje unutar aplikacije.</p>
    {error && <p className="form-error" role="alert">{error}</p>}<p role="status">{status}</p>
    {!data ? <p>{error ? "Podaci nisu dostupni. Osvežite pregled." : "Učitavanje beleški…"}</p> : <>
      <h3>{editing ? "Izmena beleške / podsetnika" : "Nova beleška / podsetnik"}</h3>
      <form className="settings-form" onSubmit={e => { e.preventDefault(); save(); }}>
        <fieldset disabled={busy || readOnly}><legend>Tekst i opcioni rok</legend>
          <label>Tekst<textarea required maxLength={10000} rows={4} value={text} onChange={e => setText(e.target.value)} /></label>
          <div className="form-columns"><label>Datum (opciono)<input type="date" min="0001-01-01" max="9999-12-31" value={date} onChange={e => { setDate(e.target.value); if (!e.target.value) setTime(""); }} /></label><label>Vreme (opciono, Beograd)<input type="time" step={60} disabled={!date} value={time} onChange={e => setTime(e.target.value)} /></label></div>
          <p className="muted">Bez vremena: rok je kraj izabranog dana u Beogradu. Prošli rok se označava, a zapis ostaje aktivan dok ga ne završite.</p>
          <Button type="submit">{busy ? "Čuvanje…" : editing ? "Sačuvaj izmenu" : "Sačuvaj belešku"}</Button>
        </fieldset>
        {editing && <Button type="button" variant="outline" disabled={busy} onClick={() => { reset(); setError(""); }}>Otkaži izmenu</Button>}
      </form>
      <p className="muted">Podsetnici: najraniji rok prvi, bez vremena na kraju dana. Isti rok: ranije kreiran prvi, zatim ID. Beleške: najnovije prve. Završeni zapisi su izdvojeni i prate isti redosled.</p>
      {groups.map(group => <section key={group.title} className="notes-group"><h3>{group.title} ({group.entries.length})</h3>{!group.entries.length ? <p className="muted">Nema zapisa.</p> : group.entries.map(entry => <article className={`note-card ${noteOverdue(entry, now) ? "note-overdue" : ""}`} key={entry.id}>
        <p className="note-text">{entry.text}</p>
        <p>{entry.date ? <time dateTime={`${entry.date}${entry.time ? `T${entry.time}` : ""}`}>{entry.date} · {entry.time ? `${entry.time} (Beograd)` : "Bez vremena · do kraja dana"}</time> : "Beleška bez roka"}{noteOverdue(entry, now) && <strong className="note-deadline"> · Prošao rok</strong>}{entry.completed && <strong> · Završeno</strong>}</p>
        <div className="note-actions"><Button variant="outline" disabled={busy || readOnly} onClick={() => { setEditing(entry); setText(entry.text); setDate(entry.date ?? ""); setTime(entry.time ?? ""); setError(""); setStatus(""); }}>Izmeni</Button><Button variant="outline" disabled={busy || readOnly} onClick={() => void execute({ id: entry.id, version: entry.version, action: "save", values: noteValues(entry.text, entry.date ?? "", entry.time ?? "", !entry.completed) })}>{entry.completed ? "Vrati u aktivne" : "Označi završenim"}</Button><Button variant="outline" disabled={busy || readOnly} onClick={() => setDeleting(entry)}>Obriši</Button></div>
        {deleting?.id === entry.id && <div role="group" aria-label="Potvrda brisanja"><p>Obrisati ovaj zapis?</p><div className="note-actions"><Button disabled={busy || readOnly} onClick={() => void execute({ id: deleting.id, version: deleting.version, action: "delete", values: null })}>Potvrdi brisanje</Button><Button variant="outline" disabled={busy} onClick={() => setDeleting(null)}>Odustani</Button></div></div>}
      </article>)}</section>)}
    </>}
  </section>;
}
