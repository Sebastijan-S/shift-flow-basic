"use client";

import { readRevenue } from "@/lib/module-data";

import { useCallback, useEffect, useRef, useState } from "react";
import { getSupabase } from "@/lib/supabase";
import { money, todayBelgrade } from "@/lib/hours";
import { DEMO_REVENUE_KEY, EMPTY_REVENUE, demoSaveRevenue, latestRevenue, revenueOrder, revenueSummary, revenueTotal, revenueValues, type RevenueData, type RevenueEntry } from "@/lib/revenue";
import { Button } from "./ui/button";

function errorText(e: unknown) {
  const message = (e as Error).message ?? String(e);
  if (message.includes("VERSION_CONFLICT")) return "Zapis je u međuvremenu promenjen. Osvežite pregled i ponovo otvorite izmenu; vaši uneti iznosi ostaju u obrascu.";
  if (message.includes("MODULE_DISABLED")) return "Modul Pazar je isključen u podešavanjima lokala.";
  if (message.includes("ACCESS_DENIED")) return "Nemate pristup pazaru ovog lokala.";
  if (message.includes("TRIAL_EXPIRED")) return "Probni period je istekao. Unos nije sačuvan.";
  return message;
}
const amountInput = (value: number | null) => value === null ? "" : `${Math.floor(value / 100)}.${String(value % 100).padStart(2, "0")}`;
const displayAmount = (value: number | null) => value === null ? "Nije uneto" : money(value);



export function RevenuePanel({ companyId, readOnly }: { companyId: string | null; readOnly: boolean }) {
  const [data, setData] = useState<RevenueData | null>(null), [error, setError] = useState(""), [busy, setBusy] = useState(false), [status, setStatus] = useState("");
  const [editing, setEditing] = useState<RevenueEntry | null>(null);
  const [date, setDate] = useState(todayBelgrade), [shift, setShift] = useState(""), [cash, setCash] = useState(""), [cards, setCards] = useState("");
  const pending = useRef(false), alive = useRef(false), revision = useRef(0), draftId = useRef<string | null>(null);
  const editorRef = useRef<HTMLFormElement>(null), dateRef = useRef<HTMLInputElement>(null), cashRef = useRef<HTMLInputElement>(null);
  const load = useCallback(async () => {
    if (pending.current) return;
    const request = ++revision.current;
    try {
      const next = await readRevenue(companyId);
      if (alive.current && revision.current === request && !pending.current) { setData(next); setError(""); }
    } catch (e) {
      if (alive.current && revision.current === request) { setData(null); setError(errorText(e)); }
    }
  }, [companyId]);
  useEffect(() => {
    alive.current = true; void load();
    const storage = (e: StorageEvent) => { if (!companyId && e.key === DEMO_REVENUE_KEY) void load(); };
    window.addEventListener("focus", load); window.addEventListener("storage", storage);
    const timer = companyId ? setInterval(load, 15000) : null;
    return () => { alive.current = false; ++revision.current; window.removeEventListener("focus", load); window.removeEventListener("storage", storage); if (timer) clearInterval(timer); };
  }, [load, companyId]);
  const reset = () => { setEditing(null); draftId.current = null; setDate(todayBelgrade()); setShift(""); setCash(""); setCards(""); };
  const showEditor = (focus: HTMLInputElement | null) => {
    requestAnimationFrame(() => { editorRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }); focus?.focus({ preventScroll: true }); });
  };
  const startEdit = (entry: RevenueEntry) => {
    setEditing(entry); setDate(entry.date); setShift(entry.shift); setCash(amountInput(entry.cash)); setCards(amountInput(entry.cards)); setError(""); setStatus("");
    showEditor(dateRef.current);
  };
  const save = async () => {
    if (pending.current || readOnly || !data) return;
    try {
      const values = revenueValues(date, shift, cash, cards);
      draftId.current ??= crypto.randomUUID();
      const id = editing?.id ?? draftId.current, version = editing?.version ?? null;
      pending.current = true; ++revision.current; setBusy(true); setError(""); setStatus("");
      let next: RevenueData;
      if (companyId) {
        const result = await getSupabase()!.rpc("save_revenue", { p_company: companyId, p_id: id, p_version: version, p_values: values });
        if (result.error) throw result.error;
        next = result.data;
      } else {
        const write = async () => {
          const saved: RevenueData = JSON.parse(localStorage.getItem(DEMO_REVENUE_KEY) ?? JSON.stringify(EMPTY_REVENUE));
          const result = demoSaveRevenue(saved, id, version, values);
          localStorage.setItem(DEMO_REVENUE_KEY, JSON.stringify(result)); return result;
        };
        next = navigator.locks ? await navigator.locks.request(DEMO_REVENUE_KEY, write) : await write();
      }
      if (alive.current) { setData(next); reset(); setStatus(editing ? "Izmena je sačuvana." : "Novi unos je sačuvan."); }
    } catch (e) { if (alive.current) setError(errorText(e)); }
    finally { pending.current = false; if (alive.current) setBusy(false); }
  };
  let preview: string = "Unesite bar jedan iznos.";
  try { preview = money(revenueTotal(revenueValues(date, shift, cash, cards))); } catch { /* Validation is shown on submit. */ }
  const latest = data ? latestRevenue(data) : null;
  let summary: ReturnType<typeof revenueSummary> | null = null, summaryError = "";
  try { if (data) summary = revenueSummary(data); } catch (e) { summaryError = errorText(e); }
  return <section className="panel basic-panel revenue-panel" aria-busy={busy}>
    <div className="panel-heading revenue-heading"><h2>Evidencija pazara</h2><Button disabled={busy || readOnly || !data} onClick={() => { reset(); setError(""); setStatus(""); showEditor(cashRef.current); }}>Novi unos</Button></div>
    {error && <p className="form-error" role="alert">{error}</p>}
    {status && <p className="success-text" role="status">{status}</p>}
    {!data ? <div className="revenue-unavailable"><p>{error ? "Podaci nisu dostupni. Pokušajte ponovo." : "Učitavanje pazara…"}</p>{error && <Button variant="outline" disabled={busy} onClick={() => void load()}>Osveži pazar</Button>}</div> : <>
      <form ref={editorRef} className="settings-form revenue-form" onSubmit={e => { e.preventDefault(); void save(); }}>
        <fieldset disabled={busy || readOnly}><legend>{editing ? `Izmena zapisa · ${editing.date}` : "Novi unos"}</legend>
          <div className="revenue-fields"><label className="revenue-date">Datum pazara<input ref={dateRef} type="date" required min="0001-01-01" max="9999-12-31" value={date} onChange={e => setDate(e.target.value)} /></label><label className="revenue-cash">Gotovina (RSD)<input ref={cashRef} inputMode="decimal" value={cash} onChange={e => setCash(e.target.value)} placeholder="Nije uneto" /></label><label className="revenue-cards">Kartice (RSD)<input inputMode="decimal" value={cards} onChange={e => setCards(e.target.value)} placeholder="Nije uneto" /></label><label className="revenue-shift">Oznaka smene (opciono)<input maxLength={80} value={shift} onChange={e => setShift(e.target.value)} placeholder="npr. Jutarnja" /></label></div>
          <div className="revenue-total">Ukupno <output>{preview}</output></div>
          <div className="revenue-actions"><Button type="submit">{busy ? "Čuvanje…" : editing ? "Sačuvaj izmenu" : "Sačuvaj unos"}</Button>{editing && <Button type="button" variant="outline" disabled={busy} onClick={() => { reset(); setError(""); }}>Otkaži izmenu</Button>}</div>
        </fieldset>
      </form>
      <div className="revenue-summary" aria-label="Pregled pazara">
        <div><h3>Ukupno · svi datumi</h3><strong className={summary && summary.total !== null ? "revenue-highlight-value" : ""}>{summaryError ? "—" : summary && summary.total !== null ? money(summary.total) : "Još nema unosa"}</strong>{summaryError ? <p className="form-error" role="alert">{summaryError}</p> : <p>Gotovina: {displayAmount(summary?.cash ?? null)}<br />Kartice: {displayAmount(summary?.cards ?? null)}</p>}</div>
        <div><h3>Poslednji unos · po kreiranju</h3>{latest ? <><strong className="revenue-highlight-value">{money(latest.total)}</strong><p>Datum pazara: <time dateTime={latest.date}>{latest.date}</time></p></> : <p>Još nema unosa.</p>}</div>
      </div>
      <div className="panel-heading revenue-records-heading"><h3>Sačuvani zapisi</h3><Button variant="outline" disabled={busy} onClick={() => void load()}>Osveži zapise</Button></div>
      {!data.entries.length ? <p>Još nema evidentiranog pazara.</p> : <div className="data-table-scroll"><table className="data-table"><thead><tr><th>Datum pazara</th><th>Oznaka smene</th><th>Gotovina</th><th>Kartice</th><th>Ukupno</th><th>Kreirano (Beograd)</th><th>Izmena</th></tr></thead><tbody>{revenueOrder(data.entries).map(entry => <tr key={entry.id}><td><span className="revenue-cell-label" aria-hidden="true">Datum</span>{entry.date}</td><td><span className="revenue-cell-label" aria-hidden="true">Smena</span>{entry.shift || "Bez oznake"}</td><td><span className="revenue-cell-label" aria-hidden="true">Gotovina</span>{displayAmount(entry.cash)}</td><td><span className="revenue-cell-label" aria-hidden="true">Kartice</span>{displayAmount(entry.cards)}</td><td><span className="revenue-cell-label" aria-hidden="true">Ukupno</span>{money(revenueTotal(entry))}</td><td><span className="revenue-cell-label" aria-hidden="true">Kreirano</span>{new Date(entry.createdAt).toLocaleString("sr-Latn-RS", { timeZone: "Europe/Belgrade" })}</td><td><Button variant="outline" disabled={busy || readOnly} onClick={() => startEdit(entry)} aria-label={`Izmeni zapis za ${entry.date}${entry.shift ? `, ${entry.shift}` : ""}`}>Izmeni</Button></td></tr>)}</tbody></table></div>}
    </>}
  </section>;
}
