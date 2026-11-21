"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getSupabase } from "@/lib/supabase";
import { todayBelgrade } from "@/lib/hours";
import { DEMO_BAR_KEY, EMPTY_BAR, changeBarRow, demoBarCommand, parseQuantity, quantityInput, quantityLabel, readDemoBar, validateDraft, validateItem, validateRows, type BarAnchor, type BarBook, type BarCommand, type BarData, type BarDraft, type BarItem, type BarRow } from "@/lib/bar";
import { printBar } from "./bar-print";
import { Button } from "./ui/button";

type Field = "previous" | "acquired" | "total" | "closing" | "used";
const fields: [Field, string][] = [["previous", "Preneto / prethodno"], ["acquired", "Nabavljeno"], ["total", "Ukupno"], ["closing", "Novo stanje"], ["used", "Utrošeno"]];
interface RowForm { row: BarRow; invalid: Partial<Record<Field, string>>; typing?: Partial<Record<Field, string>> }
function errorText(e: unknown): string {
  const message = (e as Error).message ?? String(e);
  if (/VERSION_CONFLICT|DRAFT_CHANGED|REQUEST_CONFLICT/.test(message)) return "Podaci su promenjeni u drugom prozoru. Unos je zadržan. Osvežite pregled, pa ponovo otvorite važeći nacrt ili knjigu pre ponovnog čuvanja.";
  if (/INVALID_QUANTITY|INCONSISTENT_ROW/.test(message)) return "Proverite količine: nenegativne, do 2 decimale i dosledne formulama.";
  if (/BOOK_OUTSIDE_LAST_FIVE/.test(message)) return "Ova knjiga više nije među poslednjih pet. Podaci su zadržani u bazi.";
  if (/INVALID_DATE/.test(message)) return "Datum mora biti isti ili kasniji od poslednje završene knjige.";
  if (/MODULE_DISABLED/.test(message)) return "Knjiga šanka i inventar su isključeni u podešavanjima lokala.";
  if (/ACCESS_DENIED/.test(message)) return "Nemate pristup podacima ovog lokala.";
  if (/TRIAL_EXPIRED/.test(message)) return "Probni period je istekao. Izmene nisu sačuvane.";
  return message;
}

function BookEditor({ draft, minimum, historical, disabled, save, close }: { draft: BarDraft; minimum?: string; historical: boolean; disabled: boolean; save: (value: BarDraft, finish: boolean) => Promise<boolean>; close: () => void }) {
  const [date, setDate] = useState(draft.date), [shift, setShift] = useState(draft.shift);
  const [rows, setRows] = useState<RowForm[]>(() => draft.rows.map(row => ({ row: structuredClone(row), invalid: {} })));
  const [error, setError] = useState(""), [confirm, setConfirm] = useState(false), [dirty, setDirty] = useState(false);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => { if (dirty) { event.preventDefault(); event.returnValue = ""; } };
    window.addEventListener("beforeunload", warn); return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  const update = (index: number, field: Field, text: string) => {
    setDirty(true); setConfirm(false);
    setRows(old => old.map((entry, i) => {
      if (i !== index) return entry;
      try {
        const row = changeBarRow(entry.row, field, parseQuantity(text)), invalid = { ...entry.invalid }; delete invalid[field];
        // The opposite endpoint is now explicitly calculated by the chosen manual field.
        delete invalid[row.anchor === "closing" ? "used" : "closing"];
        if (field === "total") delete invalid.acquired;
        if (field === "previous" || field === "acquired") delete invalid.total;
        return { row, invalid, typing: { [field]: text } };
      } catch { return { ...entry, invalid: { ...entry.invalid, [field]: text } }; }
    }));
  };
  const invalid = rows.some(entry => {
    try { if (Object.keys(entry.invalid).length) return true; validateRows([entry.row], [entry.row]); return false; } catch { return true; }
  });
  const submit = async (finish: boolean) => {
    try {
      if (invalid) throw new Error("Ispravite označene redove. Negativna, prazna i nedosledna polja se ne čuvaju.");
      const value = { id: draft.id, date, shift, rows: rows.map(r => r.row) };
      validateDraft(value, draft.rows, historical ? undefined : minimum);
      if (await save(value, finish)) { setDirty(false); setConfirm(false); }
    } catch (e) { setError(errorText(e)); }
  };
  return <section className="bar-editor"><h3>{historical ? "Ispravka završene knjige" : "Otvorena knjiga"}</h3>
    <p className="muted">{historical ? "Ispravka menja samo ovu knjigu i njen PDF. Inventar, otvorena i kasnije knjige ostaju isti. Datum i redosled završavanja se čuvaju." : "Sačuvajte nacrt da nastavite posle osvežavanja. Završi knjigu potvrđuje stanje i prenos za sledeću knjigu."}</p>
    <fieldset disabled={disabled}><legend>Podaci knjige</legend><div className="form-columns settings-form"><label>Datum<input type="date" min={minimum ?? "0001-01-01"} max="9999-12-31" disabled={historical} value={date} onChange={e => { setDate(e.target.value); setDirty(true); setConfirm(false); }} /></label><label>Oznaka smene (opciono)<input maxLength={80} value={shift} onChange={e => { setShift(e.target.value); setDirty(true); setConfirm(false); }} /></label></div>
      <p className="muted">Najviše 2 decimale. Poslednji unos novog stanja ili utroška bira ručno polje. Promena ukupnog podešava nabavljeno = ukupno − prethodno.</p>
      <div className="bar-table-scroll" tabIndex={0} aria-label="Tabela knjige — horizontalni skrol"><table className="data-table bar-table"><thead><tr><th>Artikal / jedinica</th>{fields.map(([field, label]) => <th key={field}>{label}</th>)}<th>Zadrži ručno</th></tr></thead><tbody>{rows.map((entry, index) => {
        const { row } = entry; let rowError = "";
        try { if (Object.keys(entry.invalid).length) throw new Error("Neispravna količina: do 2 decimale, bez praznih polja."); validateRows([row], [row]); } catch (e) { rowError = errorText(e); }
        return <tr key={row.itemId}><th scope="row">{row.name}<small>{row.unit}</small>{rowError && <small className="form-error" role="alert">{rowError}</small>}</th>{fields.map(([field, label]) => <td key={field}><input aria-label={`${row.name} — ${label}`} aria-invalid={!!rowError} inputMode="decimal" value={entry.invalid[field] ?? entry.typing?.[field] ?? quantityInput(row[field])} onChange={e => update(index, field, e.target.value)} onBlur={() => setRows(old => old.map((r, i) => i === index ? { ...r, typing: {} } : r))} /><small>{field === row.anchor ? "Ručno · zadržava se" : field === "closing" || field === "used" ? "Izračunato" : field === "total" ? "Menja nabavljeno" : "Može se ispraviti"}</small></td>)}<td><select aria-label={`${row.name} — zadrži ručno`} value={row.anchor} onChange={e => { const anchor = e.target.value as BarAnchor; setRows(old => old.map((r, i) => i === index ? { ...r, row: { ...r.row, anchor } } : r)); setDirty(true); setConfirm(false); }}><option value="used">Utrošeno</option><option value="closing">Novo stanje</option></select></td></tr>;
      })}</tbody></table></div>
      {invalid && <p className="form-error" role="alert">Ispravite označene redove pre čuvanja.</p>}
      {error && <p className="form-error" role="alert">{error}</p>}
      <p role="status">{dirty ? "Imate nesačuvane izmene u obrascu." : "Prikazan je sačuvan unos."}</p>
      <div className="note-actions"><Button disabled={invalid} onClick={() => void submit(false)}>{historical ? "Sačuvaj ispravku" : "Sačuvaj nacrt"}</Button>{!historical && <Button disabled={invalid} onClick={() => setConfirm(true)}>Završi knjigu</Button>}</div>
      {confirm && <div className="hours-confirm"><p>Potvrditi knjigu za {date}? Završno stanje postaje inventar i osnova sledeće knjige.</p><Button disabled={invalid} onClick={() => void submit(true)}>Potvrdi završavanje</Button><Button variant="outline" onClick={() => setConfirm(false)}>Odustani</Button></div>}
    </fieldset><Button variant="outline" disabled={disabled} onClick={() => { if (!dirty || window.confirm("Odbaciti nesačuvane izmene obrasca?")) close(); }}>Zatvori obrazac</Button>
  </section>;
}

export function BarPanel({ companyId, companyName, readOnly, settingsOnly = false }: { companyId: string | null; companyName: string; readOnly: boolean; settingsOnly?: boolean }) {
  const [data, setData] = useState<BarData | null>(null), [error, setError] = useState(""), [status, setStatus] = useState(""), [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<{ doc: BarDraft; version: number; historical: boolean; key: number } | null>(null);
  const [item, setItem] = useState<BarItem | null>(null), [deleting, setDeleting] = useState<BarItem | null>(null);
  const [itemVersion, setItemVersion] = useState<number | null>(null);
  const [newDate, setNewDate] = useState(todayBelgrade()), [itemKey, setItemKey] = useState(0);
  const alive = useRef(false), pending = useRef(false), revision = useRef(0);
  const operation = useRef<{ id: string; payload: string; command: BarCommand } | null>(null), newItemId = useRef<string | null>(null), newBookId = useRef<string | null>(null);
  const load = useCallback(async () => {
    if (pending.current) return; const request = ++revision.current;
    try {
      let next: BarData;
      if (companyId) { const r = await getSupabase()!.rpc("read_bar", { p_company: companyId }); if (r.error) throw r.error; next = r.data; }
      else next = readDemoBar(JSON.parse(localStorage.getItem(DEMO_BAR_KEY) ?? JSON.stringify(EMPTY_BAR)));
      if (alive.current && revision.current === request && !pending.current) setData(next);
    } catch (e) { if (alive.current && revision.current === request) { if (/ACCESS_DENIED|MODULE_DISABLED|JWT|session|token/i.test((e as Error).message ?? "")) setData(null); setError(errorText(e)); } }
  }, [companyId]);
  useEffect(() => {
    alive.current = true; void load();
    const storage = (e: StorageEvent) => { if (!companyId && e.key === DEMO_BAR_KEY) void load(); };
    window.addEventListener("focus", load); window.addEventListener("storage", storage);
    const timer = setInterval(() => { if (companyId) void load(); }, 15000);
    return () => { alive.current = false; ++revision.current; clearInterval(timer); window.removeEventListener("focus", load); window.removeEventListener("storage", storage); };
  }, [load, companyId]);
  const execute = async (command: BarCommand): Promise<BarData | null> => {
    if (pending.current || readOnly || !data) return null;
    const payload = JSON.stringify(command);
    if (operation.current?.payload !== payload) operation.current = { id: crypto.randomUUID(), payload, command: structuredClone(command) };
    const request = operation.current.id; pending.current = true; ++revision.current; setBusy(true); setError(""); setStatus("");
    try {
      let next: BarData;
      if (companyId) { const r = await getSupabase()!.rpc("bar_command", { p_company: companyId, p_request: request, p_command: command }); if (r.error) throw r.error; next = r.data; }
      else {
        const write = async () => { const d = demoBarCommand(JSON.parse(localStorage.getItem(DEMO_BAR_KEY) ?? JSON.stringify(EMPTY_BAR)), request, command); localStorage.setItem(DEMO_BAR_KEY, JSON.stringify(d)); return readDemoBar(d); };
        next = navigator.locks ? await navigator.locks.request(DEMO_BAR_KEY, write) : await write();
      }
      if (alive.current) { setData(next); setStatus(command.action === "finish" ? "Knjiga je završena. PDF je dostupan u istoriji." : "Podaci su sačuvani."); operation.current = null; return next; }
    } catch (e) { if (alive.current) setError(errorText(e)); }
    finally { pending.current = false; if (alive.current) setBusy(false); }
    return null;
  };
  const openEditor = (doc: BarDraft, historical: boolean) => { setEditing({ doc: structuredClone(doc), historical, version: data!.version, key: Date.now() }); setError(""); };
  const saveBook = async (doc: BarDraft, finish: boolean) => {
    if (!editing) return false;
    const next = await execute({ version: editing.version, action: editing.historical ? "edit" : finish ? "finish" : "draft", payload: doc });
    if (!next) return false;
    if (finish || editing.historical) setEditing(null);
    else setEditing(old => old ? { ...old, version: next.version } : null);
    return true;
  };
  return <section className="panel basic-panel bar-panel" aria-busy={busy}>
    <div className="panel-heading"><h2>{settingsOnly ? "Podešavanja knjige šanka — artikli" : "Knjiga šanka i inventar"}</h2><Button variant="outline" disabled={busy} onClick={() => void load()}>Osveži pregled</Button></div>
    {error && <p className="form-error" role="alert">{error}</p>}{error && data && operation.current && <Button disabled={busy || readOnly} variant="outline" onClick={async () => { const command = operation.current!.command; const next = await execute(command); if (next) { setEditing(null); setItem(null); setItemVersion(null); newItemId.current = null; newBookId.current = null; setItemKey(k => k + 1); } }}>Ponovi isti zahtev</Button>}<p role="status">{status}</p>
    {!data ? <p>{error ? "Podaci nisu dostupni. Pokušajte osvežavanje." : "Učitavanje knjige…"}</p> : settingsOnly ? <>
      <p className="muted">Svi neobrisani artikli ulaze u svaku novu knjigu, i sa nulom. Nazivi i jedinice otvorene i završenih knjiga ostaju sačuvani. Početno stanje važi kada artikal još nema potvrđeno stanje. Promena jedinice ne preračunava količinu; proverite preneto u sledećoj knjizi.</p>
      <form key={itemKey} className="settings-form bar-item-form" onSubmit={async e => {
        e.preventDefault(); const form = new FormData(e.currentTarget);
        try {
          newItemId.current ??= crypto.randomUUID();
          const value = { id: item?.id ?? newItemId.current, name: String(form.get("name")).trim(), unit: String(form.get("unit")).trim(), initial: parseQuantity(String(form.get("initial"))) }; validateItem(value);
          if (item && item.unit !== value.unit && !window.confirm("Promena jedinice ne preračunava postojeće količine. Nastaviti i ručno proveriti sledeći prenos?")) return;
          if (await execute({ version: itemVersion ?? data.version, action: "item", payload: value })) { setItem(null); setItemVersion(null); newItemId.current = null; setItemKey(k => k + 1); }
        } catch (e) { setError(errorText(e)); }
      }}><fieldset disabled={busy || readOnly}><legend>{item ? "Izmena artikla" : "Novi artikal"}</legend><label>Naziv<input name="name" required maxLength={120} defaultValue={item?.name ?? ""} /></label><div className="form-columns"><label>Jedinica mere<input name="unit" list="bar-units" required maxLength={20} defaultValue={item?.unit ?? "kom"} /><datalist id="bar-units">{["kom", "kg", "g", "l", "ml"].map(u => <option key={u} value={u} />)}</datalist></label><label>Početno stanje<input name="initial" inputMode="decimal" required defaultValue={quantityInput(item?.initial ?? 0)} /></label></div><Button type="submit">{item ? "Sačuvaj artikal" : "Dodaj artikal"}</Button></fieldset>{item && <Button type="button" variant="outline" disabled={busy} onClick={() => { setItem(null); setItemVersion(null); setItemKey(k => k + 1); }}>Otkaži</Button>}</form>
      {!data.items.length && <p>Nema artikala. Dodajte prvi artikal sa početnim stanjem.</p>}
      {data.items.map(i => <article className="note-card" key={i.id}><h3>{i.name} · {i.unit}</h3><p>Početno stanje: {quantityLabel(i.initial)}</p><div className="note-actions"><Button disabled={busy || readOnly} variant="outline" onClick={() => { setItem(i); setItemVersion(data.version); setItemKey(k => k + 1); }}>Izmeni</Button><Button disabled={busy || readOnly} variant="outline" onClick={() => setDeleting(i)}>Obriši iz budućih knjiga</Button></div>{deleting?.id === i.id && <div><p>Obrisati {i.name} iz budućih knjiga? Postojeći nacrt, istorija i poslednji potvrđeni inventar ostaju sačuvani.</p><div className="note-actions"><Button disabled={busy || readOnly} onClick={async () => { if (await execute({ version: data.version, action: "deleteItem", payload: { id: i.id } })) setDeleting(null); }}>Potvrdi brisanje</Button><Button disabled={busy} variant="outline" onClick={() => setDeleting(null)}>Odustani</Button></div></div>}</article>)}
    </> : <>
      <h3>Inventar — poslednje potvrđeno stanje</h3>
      {!data.inventory ? <p className="muted">Nema potvrđenog inventara. Dodajte artikle u Podešavanjima, pa završite prvu knjigu.</p> : <><p>Datum: {data.inventory.date} · Knjiga #{data.inventory.sequence}. Ovo je poslednje potvrđeno, a ne nužno trenutno fizičko stanje.</p><div className="bar-table-scroll" tabIndex={0} aria-label="Inventar — horizontalni skrol"><table className="data-table"><thead><tr><th>Artikal</th><th>Jedinica</th><th>Potvrđeno stanje</th></tr></thead><tbody>{data.inventory.rows.map(r => <tr key={r.itemId}><th scope="row">{r.name}</th><td>{r.unit}</td><td>{quantityLabel(r.closing)}</td></tr>)}</tbody></table></div></>}
      {!data.items.length && <p className="muted">Za novu knjigu prvo dodajte artikle: Podešavanja → Knjiga šanka.</p>}
      {!data.draft ? <div className="hours-controls"><label>Datum nove knjige<input type="date" value={newDate} min={data.inventory?.date ?? "0001-01-01"} max="9999-12-31" onChange={e => setNewDate(e.target.value)} /></label><Button disabled={busy || readOnly || !data.items.length} onClick={async () => {
        newBookId.current ??= crypto.randomUUID(); const id = newBookId.current; const next = await execute({ version: data.version, action: "open", payload: { id, date: newDate } });
        if (next?.draft) { newBookId.current = null; setEditing({ doc: next.draft, version: next.version, historical: false, key: Date.now() }); }
      }}>Otvori novu knjigu</Button></div> : <div className="note-card"><p>Sačuvan nacrt · {data.draft.date} · {data.draft.rows.length} artikala</p><div className="note-actions"><Button disabled={busy || !!editing} onClick={() => openEditor(data.draft!, false)}>Nastavi nacrt</Button><Button variant="outline" disabled={busy || readOnly || !!editing} onClick={async () => { if (window.confirm("Obrisati sačuvan nacrt? Potvrđene knjige i inventar ostaju.")) await execute({ version: data.version, action: "cancel", payload: { id: data.draft!.id } }); }}>Obriši nacrt</Button></div></div>}
      {editing && <><p className="muted">{data.version !== editing.version ? "Pregled se promenio posle otvaranja obrasca. Sačuvajte unos za pregled; za upis ponovo otvorite važeću knjigu." : ""}</p><BookEditor key={editing.key} draft={editing.doc} minimum={editing.historical ? undefined : data.inventory?.date} historical={editing.historical} disabled={busy || readOnly} save={saveBook} close={() => setEditing(null)} /></>}
      <h3>Poslednjih 5 završenih knjiga</h3><p className="muted">Redosled je po završavanju, uključujući knjige istog datuma. Starije knjige ostaju u bazi. Ispravke ne menjaju inventar niti druge knjige. PDF / štampa otvara dijalog: izaberite Sačuvaj kao PDF.</p>
      {!data.books.length && <p>Nema završenih knjiga.</p>}
      {data.books.map((b: BarBook) => <article className="note-card" key={b.id}><h3>#{b.sequence} · {b.date} · {b.shift || "Bez oznake smene"}</h3><p>Verzija {b.revision + 1} · {b.rows.length} artikala</p><div className="note-actions"><Button disabled={busy || readOnly || !!editing} variant="outline" onClick={() => openEditor({ id: b.id, date: b.date, shift: b.shift, rows: b.rows }, true)}>Izmeni knjigu</Button><Button disabled={busy} variant="outline" onClick={() => printBar(b, companyName)}>PDF / štampa</Button></div></article>)}
    </>}
  </section>;
}
