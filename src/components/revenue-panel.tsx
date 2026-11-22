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

export function RevenueSettings() {
  return <section className="panel basic-panel"><h2>Podešavanja pazara</h2><p>Valuta: RSD · Preciznost: dve decimale · Vremenska zona: Europe/Belgrade.</p><p className="muted">Dnevni i smenski unosi koriste isti obrazac. Oznaka smene je opciona; datum i iznose možete naknadno menjati. Prazno polje nije nula. Isključivanje modula u izboru iznad čuva sve zapise.</p></section>;
}

export function RevenuePanel({ companyId, readOnly }: { companyId: string | null; readOnly: boolean }) {
  const [data, setData] = useState<RevenueData | null>(null), [error, setError] = useState(""), [busy, setBusy] = useState(false), [status, setStatus] = useState("");
  const [editing, setEditing] = useState<RevenueEntry | null>(null);
  const [date, setDate] = useState(todayBelgrade), [shift, setShift] = useState(""), [cash, setCash] = useState(""), [cards, setCards] = useState("");
  const pending = useRef(false), alive = useRef(false), revision = useRef(0), draftId = useRef<string | null>(null);
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
    <div className="panel-heading"><h2>Evidencija pazara</h2><Button variant="outline" disabled={busy} onClick={() => void load()}>Osveži pazar</Button></div>
    <p className="muted">Unesite dnevni pazar ili pazar smene za izabrani datum. Više zapisa istog datuma je dozvoljeno.</p>
    {error && <p className="form-error" role="alert">{error}</p>}
    <p role="status">{status}</p>
    {!data ? <p>{error ? "Podaci nisu dostupni. Pokušajte ponovo preko dugmeta Osveži pazar." : "Učitavanje pazara…"}</p> : <>
      <div className="revenue-summary">
        <div><h3>Zbir svih evidentiranih zapisa</h3><p className="muted">Opseg: svi sačuvani datumi · {data.entries.length} zapisa. Dani bez zapisa nisu uključeni.</p>{summaryError ? <p role="alert">{summaryError}</p> : summary && <><strong>{displayAmount(summary.total)}</strong><p>Gotovina: {displayAmount(summary.cash)}<br />Kartice: {displayAmount(summary.cards)}</p></>}</div>
        <div><h3>Poslednji pojedinačni unos</h3>{latest ? <><strong>{money(latest.total)}</strong><p>Datum pazara: <time dateTime={latest.date}>{latest.date}</time></p></> : <p>Još nema unosa.</p>}<p className="muted">Poslednji dodat zapis, prema vremenu kreiranja. Izmena ne menja redosled.</p></div>
      </div>
      <h3>{editing ? "Izmena zapisa" : "Novi unos"}</h3>
      <form className="settings-form revenue-form" onSubmit={e => { e.preventDefault(); void save(); }}>
        <fieldset disabled={busy || readOnly}><legend>{editing ? `Zapis za ${editing.date}` : "Podaci pazara"}</legend>
          <div className="form-columns"><label>Datum pazara<input type="date" required min="0001-01-01" max="9999-12-31" value={date} onChange={e => setDate(e.target.value)} /></label><label>Oznaka smene (opciono)<input maxLength={80} value={shift} onChange={e => setShift(e.target.value)} placeholder="npr. Jutarnja" /></label></div>
          <div className="form-columns"><label>Gotovina (RSD)<input inputMode="decimal" value={cash} onChange={e => setCash(e.target.value)} placeholder="Nije uneto" /></label><label>Kartice (RSD)<input inputMode="decimal" value={cards} onChange={e => setCards(e.target.value)} placeholder="Nije uneto" /></label></div>
          <p>Ukupno: <output>{preview}</output></p><p className="muted">Popunite jedno ili oba polja. Prazno znači „nije uneto“, a 0 je evidentiran nulti iznos. Najviše dve decimale, bez razdvajanja hiljada.</p>
          <Button type="submit">{busy ? "Čuvanje…" : editing ? "Sačuvaj izmenu" : "Sačuvaj unos"}</Button>
        </fieldset>
        {editing && <Button type="button" variant="outline" disabled={busy} onClick={() => { reset(); setError(""); }}>Otkaži izmenu</Button>}
      </form>
      <h3>Sačuvani zapisi</h3><p className="muted">Od poslednjeg kreiranog ka najstarijem. Bez automatskih zapisa za prazne dane.</p>
      {!data.entries.length ? <p>Još nema evidentiranog pazara.</p> : <div className="data-table-scroll"><table className="data-table"><thead><tr><th>Datum pazara</th><th>Oznaka smene</th><th>Gotovina</th><th>Kartice</th><th>Ukupno</th><th>Kreirano (Beograd)</th><th>Izmena</th></tr></thead><tbody>{revenueOrder(data.entries).map(entry => <tr key={entry.id}><td>{entry.date}</td><td>{entry.shift || "Bez oznake"}</td><td>{displayAmount(entry.cash)}</td><td>{displayAmount(entry.cards)}</td><td>{money(revenueTotal(entry))}</td><td>{new Date(entry.createdAt).toLocaleString("sr-Latn-RS", { timeZone: "Europe/Belgrade" })}</td><td><Button variant="outline" disabled={busy || readOnly} onClick={() => { setEditing(entry); setDate(entry.date); setShift(entry.shift); setCash(amountInput(entry.cash)); setCards(amountInput(entry.cards)); setError(""); setStatus(""); }}>Izmeni</Button></td></tr>)}</tbody></table></div>}
    </>}
  </section>;
}
