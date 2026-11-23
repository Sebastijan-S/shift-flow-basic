"use client";

import { readNotes, saveNoteCommand } from "@/lib/module-data";

import { useCallback, useEffect, useRef, useState } from "react";
import { DEMO_NOTES_KEY, noteOverdue, notesOrder, noteValues, type NoteCommand, type NoteEntry, type NotesData } from "@/lib/notes";
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

export function NotesPanel({ companyId, readOnly }: { companyId: string | null; readOnly: boolean }) {
  const [data, setData] = useState<NotesData | null>(null), [error, setError] = useState(""), [status, setStatus] = useState(""), [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<NoteEntry | null>(null), [text, setText] = useState(""), [date, setDate] = useState(""), [time, setTime] = useState("");
  const [now, setNow] = useState(() => new Date()), [deleting, setDeleting] = useState<NoteEntry | null>(null), [editorOpen, setEditorOpen] = useState(false);
  const alive = useRef(false), pending = useRef(false), revision = useRef(0), draftId = useRef<string | null>(null);
  const editorRef = useRef<HTMLFormElement>(null), textRef = useRef<HTMLTextAreaElement>(null);
  // Retain the exact operation ID after an uncertain response; changed input gets a new ID.
  const operation = useRef<{ id: string; payload: string } | null>(null);
  const load = useCallback(async () => {
    if (pending.current) return;
    const request = ++revision.current;
    try {
      const next = await readNotes(companyId);
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
  const reset = () => { setEditing(null); setText(""); setDate(""); setTime(""); setEditorOpen(false); draftId.current = null; operation.current = null; };
  const showEditor = () => requestAnimationFrame(() => {
    editorRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    textRef.current?.focus({ preventScroll: true });
  });
  const startNew = () => { reset(); setError(""); setStatus(""); setEditorOpen(true); showEditor(); };
  const startEdit = (entry: NoteEntry) => {
    setEditing(entry); setText(entry.text); setDate(entry.date ?? ""); setTime(entry.time ?? "");
    setError(""); setStatus(""); setEditorOpen(true); showEditor();
  };
  const execute = async (command: NoteCommand, resetForm = false) => {
    if (pending.current || readOnly || !data) return;
    const payload = JSON.stringify(command);
    if (operation.current?.payload !== payload) operation.current = { id: crypto.randomUUID(), payload };
    const request = operation.current.id;
    pending.current = true; ++revision.current; setBusy(true); setError(""); setStatus("");
    try {
      const next = await saveNoteCommand(companyId, request, command);
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
    { title: "Aktivni podsetnici", empty: "Nema aktivnih podsetnika.", entries: ordered.filter(e => !e.completed && e.date) },
    { title: "Beleške bez roka", empty: "Nema beleški bez roka.", entries: ordered.filter(e => !e.completed && !e.date) },
    { title: "Završeno", empty: "Nema završenih zapisa.", entries: ordered.filter(e => e.completed) },
  ];
  return <section className="panel basic-panel notes-panel" aria-busy={busy}>
    <div className="panel-heading notes-heading"><div className="notes-heading-actions"><Button disabled={busy || readOnly || !data} onClick={startNew}>Nova beleška</Button><Button variant="outline" disabled={busy} onClick={() => void load()}>Osveži</Button></div></div>
    {error && <p className="form-error" role="alert">{error}</p>}{status && <p className="success-text" role="status">{status}</p>}
    {!data ? <p>{error ? "Podaci nisu dostupni. Pokušajte ponovo preko dugmeta Osveži." : "Učitavanje beleški…"}</p> : <>
      {editorOpen && <form ref={editorRef} className="settings-form notes-editor" onSubmit={e => { e.preventDefault(); save(); }}>
        <h2>{editing ? "Izmena zapisa" : "Nova beleška / podsetnik"}</h2>
        <fieldset disabled={busy || readOnly}>
          <textarea ref={textRef} aria-label="Sadržaj beleške ili podsetnika" required maxLength={10000} rows={4} value={text} onChange={e => setText(e.target.value)} />
          <div className="form-columns"><label>Datum<input type="date" min="0001-01-01" max="9999-12-31" value={date} onChange={e => { setDate(e.target.value); if (!e.target.value) setTime(""); }} /></label><label>Vreme<input type="time" step={60} disabled={!date} value={time} onChange={e => setTime(e.target.value)} /></label></div>
          <div className="notes-editor-actions"><Button type="submit">{busy ? "Čuvanje…" : editing ? "Sačuvaj izmenu" : "Sačuvaj zapis"}</Button><Button type="button" variant="outline" disabled={busy} onClick={() => { reset(); setError(""); }}>{editing ? "Otkaži izmenu" : "Otkaži"}</Button></div>
        </fieldset>
      </form>}
      {groups.map((group, index) => <section key={group.title} className={`notes-group ${index === 0 ? "notes-active" : ""}`}><div className="notes-group-heading"><h2>{group.title}</h2><span>{group.entries.length}</span></div>{!group.entries.length ? <p className="notes-empty">{group.empty}</p> : group.entries.map(entry => <article className={`note-card ${noteOverdue(entry, now) ? "note-overdue" : ""}`} key={entry.id}>
        <p className="note-text">{entry.text}</p>
        <div className="note-meta">{entry.date ? <time dateTime={`${entry.date}${entry.time ? `T${entry.time}` : ""}`}>{entry.date}{entry.time ? ` · ${entry.time}` : ""}</time> : <span>Bez roka</span>}{noteOverdue(entry, now) && <strong className="note-deadline">Prošao rok</strong>}{entry.completed && <strong className="note-completed">Završeno</strong>}</div>
        <div className="note-actions"><Button className={entry.completed ? "note-reopen-action" : "note-complete-action"} variant="outline" disabled={busy || readOnly} onClick={() => void execute({ id: entry.id, version: entry.version, action: "save", values: noteValues(entry.text, entry.date ?? "", entry.time ?? "", !entry.completed) })}>{entry.completed ? "Vrati u aktivne" : "Završi"}</Button><Button variant="outline" disabled={busy || readOnly} onClick={() => startEdit(entry)}>Izmeni</Button><Button className="note-delete-action" variant="outline" disabled={busy || readOnly} onClick={() => setDeleting(entry)}>Obriši</Button></div>
        {deleting?.id === entry.id && <div className="note-delete-confirm" role="group" aria-label="Potvrda brisanja"><p>Obrisati ovaj zapis?</p><div className="note-actions"><Button className="note-delete-action" variant="outline" disabled={busy || readOnly} onClick={() => void execute({ id: deleting.id, version: deleting.version, action: "delete", values: null })}>Potvrdi brisanje</Button><Button variant="outline" disabled={busy} onClick={() => setDeleting(null)}>Odustani</Button></div></div>}
      </article>)}</section>)}
    </>}
  </section>;
}
