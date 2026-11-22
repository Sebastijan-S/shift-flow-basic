"use client";

import { DEMO_HOURS_KEY as DEMO_KEY, readHours } from "@/lib/module-data";

import { useEffect, useRef, useState } from "react";
import { getSupabase } from "@/lib/supabase";
import { EMPTY_HOURS, defaultRate, demoHoursCommand, money, parseMoney, payLabels, payRows, todayBelgrade, fullMonth, type HoursAction, type HoursData, type HoursSnapshot } from "@/lib/hours";
import type { Workspace } from "@/lib/scheduler";
import { Button } from "./ui/button";

const errorText = (e: unknown) => {
  const message = (e as Error).message ?? String(e);
  if (message.includes("VERSION_CONFLICT")) return "Podaci su u međuvremenu promenjeni. Osvežite obračun i ponovite izmenu.";
  if (message.includes("MONTHLY_AMOUNT_REQUIRED")) return "Unesite iznos fiksne plate za nepotpun mesec za svakog zaposlenog.";
  if (message.includes("INVALID_PERIOD")) return "Proverite datume: period ne može završiti u budućnosti ili pre evidentiranih smena.";
  if (message.includes("MODULE_DISABLED")) return "Modul je isključen u podešavanjima lokala.";
  return message;
};

/** One isolated print document, built on demand from the immutable snapshot. */
export function printHours(snapshot: HoursSnapshot) {
  const frame = document.createElement("iframe");
  frame.title = "Potvrda sati i obračunatog iznosa";
  frame.style.cssText = "position:fixed;width:1px;height:1px;left:-10000px;top:0;border:0";
  document.body.appendChild(frame);
  const doc = frame.contentDocument!;
  const style = doc.createElement("style");
  style.textContent = "@page{size:A4;margin:18mm}body{font:14px Arial,sans-serif;color:#17202a}article{break-after:page}article:last-child{break-after:auto}h1{font-size:23px;margin-top:0}h2{margin-top:32px}dl{display:grid;grid-template-columns:1fr 1fr;gap:0}dt,dd{margin:0;padding:12px 0;border-bottom:1px solid #ddd}dd{text-align:right;font-weight:bold}.signature{margin-top:65px;border-top:1px solid #222;padding-top:12px;width:65%}footer{margin-top:35px;font-size:11px;color:#555}p{line-height:1.6}";
  doc.head.appendChild(style); doc.title = `ShiftFlow-obracun-${snapshot.start}-${snapshot.end}`;
  doc.documentElement.lang = "sr-Latn";
  for (const row of snapshot.rows) {
    const article = doc.createElement("article");
    const add = (tag: string, value: string, css?: string) => { const el = doc.createElement(tag); el.textContent = value; if (css) el.className = css; article.appendChild(el); };
    add("h1", "Potvrda radnih sati i obračuna"); add("p", snapshot.company); add("h2", row.name);
    add("p", `Period: ${snapshot.start} - ${snapshot.end}`);
    const dl = doc.createElement("dl");
    for (const [label, value] of [["Obračunati sati", `${row.hours} h`], ["Evidentirano pre zaokruživanja", `${Math.floor(row.minutes / 60)} h ${row.minutes % 60} min`], ["Metod", payLabels[row.method]], ["Cena rada", money(row.rate)], ["Odrađene smene", String(row.shifts)], ["Osnovni iznos", money(row.base)], ["Dodatni iznos za prekovremeni rad", money(row.overtime)], ["Ukupan obračunati iznos", money(row.total)]]) {
      const dt = doc.createElement("dt"), dd = doc.createElement("dd"); dt.textContent = label; dd.textContent = value; dl.append(dt, dd);
    }
    article.appendChild(dl);
    add("p", "Potpisom potvrđujem evidentirane sate i obračunati iznos. Potpis ne potvrđuje prijem novca.");
    add("p", "Potpis zaposlenog / datum", "signature");
    add("footer", `ShiftFlow · Zbir sati perioda zaokružen na najbliži ceo sat (30 min naviše). Obračun: ${snapshot.id}`);
    doc.body.appendChild(article);
  }
  const dispose = () => setTimeout(() => frame.remove(), 1000);
  frame.contentWindow!.addEventListener("afterprint", dispose, { once: true });
  setTimeout(() => { frame.contentWindow?.focus(); frame.contentWindow?.print(); }, 100);
}

export function HoursPanel({ companyId, workspace, readOnly, flush, settingsOnly = false }: { companyId: string | null; workspace: Workspace; readOnly: boolean; flush: () => Promise<unknown>; settingsOnly?: boolean }) {
  const [data, setData] = useState<HoursData | null>(null), [error, setError] = useState(""), [busy, setBusy] = useState(false);
  const [end, setEnd] = useState(todayBelgrade()), [start, setStart] = useState(todayBelgrade().slice(0, 8) + "01"), [confirm, setConfirm] = useState(false);
  const pending = useRef(false), scope = useRef(companyId);
  const alive = useRef(false);
  const request = useRef(0);
  scope.current = companyId;
  const load = async () => {
    if (pending.current) return;
    const revision = ++request.current;
    const selected = companyId;
    try {
      const next = await readHours(companyId);
      if (alive.current && scope.current === selected && revision === request.current && !pending.current) { setData(next); setError(""); }
    } catch (e) { if (alive.current && scope.current === selected && revision === request.current) { setData(null); setError(errorText(e)); } }
  };
  useEffect(() => {
    alive.current = true; setData(null); void load();
    const refresh = () => { if (document.visibilityState !== "hidden") void load(); };
    window.addEventListener("focus", refresh);
    return () => { alive.current = false; ++request.current; window.removeEventListener("focus", refresh); };
  }, [companyId]); // eslint-disable-line react-hooks/exhaustive-deps
  const command = async (action: HoursAction, payload: Record<string, unknown>) => {
    if (pending.current || readOnly || !data) return;
    pending.current = true; ++request.current; setBusy(true); setError(""); const selected = companyId;
    try {
      const period = data.open?.id ?? null, version = data.open?.version ?? 0;
      let next: HoursData;
      if (companyId) {
        if ((action === "import" || action === "close" || action === "rate") && (await flush()) === false) throw new Error("Raspored još nije sačuvan. Sačekajte sinhronizaciju pa pokušajte ponovo.");
        const result = await getSupabase()!.rpc("hours_command", { p_company: companyId, p_action: action, p_period: period, p_version: version, p_payload: { ...payload, workspaceVersion: data.workspaceVersion } });
        if (result.error) throw result.error; next = result.data;
      } else {
        const writeDemo = async () => {
          const saved = JSON.parse(localStorage.getItem(DEMO_KEY) ?? JSON.stringify(EMPTY_HOURS)) as HoursData;
          const result = demoHoursCommand(saved, workspace, action, payload, period, version); localStorage.setItem(DEMO_KEY, JSON.stringify(result)); return result;
        };
        next = navigator.locks ? await navigator.locks.request(DEMO_KEY, writeDemo) : await writeDemo();
      }
      if (alive.current && scope.current === selected) { setData(next); setConfirm(false); }
    } catch (e) { if (alive.current && scope.current === selected) setError(errorText(e)); }
    finally { pending.current = false; if (alive.current && scope.current === selected) setBusy(false); }
  };
  const submit = (action: HoursAction, values: () => Record<string, unknown>) => { try { void command(action, values()); } catch (e) { setError(errorText(e)); } };
  const p = data?.open;
  let rows: ReturnType<typeof payRows> = [], previewError = "";
  if (data && p) for (const employee of workspace.employees) {
    try { rows.push(...payRows(data, { employees: [employee] }, end)); } catch (e) { previewError ||= errorText(e); }
  }
  const employees = workspace.employees.filter(e => e.active || p?.entries.some(a => a.employee === e.id) || p?.extras[e.id]);
  return <section className="panel basic-panel hours-panel" aria-busy={busy}>
    <div className="panel-heading hours-heading"><h2>{settingsOnly ? "Podešavanja radnih sati i obračuna" : "Obračun tima"}</h2><Button variant="outline" disabled={busy} onClick={() => void load()}>Osveži obračun</Button></div>
    {error && <p className="form-error" role="alert">{error}</p>}
    {!data ? <p>{error ? "Podaci nisu dostupni. Osvežite obračun." : "Učitavanje obračuna…"}</p> : !p ? <section className="hours-start"><h3>Otvorite prvi period</h3><p>Izaberite početni datum. Sati ostaju na nuli dok ne preuzmete smene iz rasporeda.</p><form className="settings-form" onSubmit={e => { e.preventDefault(); void command("start", { start }); }}><label>Početak prvog perioda<input type="date" required max={todayBelgrade()} value={start} onChange={e => setStart(e.target.value)} /></label><Button type="submit" disabled={busy || readOnly}>Otvori prvi period</Button></form></section> : <>
      {settingsOnly ? <><p className="muted">Početak otvorenog perioda: {p.start}. Izaberite metod i cenu rada za svakog zaposlenog.</p><div className="hours-settings">{employees.map(e => { const rate = data.rates[e.id] ?? defaultRate; return <form className="settings-form hours-rate" key={`${p.version}:${e.id}`} onSubmit={event => { event.preventDefault(); const f = new FormData(event.currentTarget); submit("rate", () => ({ employee: e.id, method: f.get("method"), cents: parseMoney(String(f.get("amount"))) })); }}><h3>{e.name}</h3><label>Metod<select name="method" defaultValue={rate.method}>{Object.entries(payLabels).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label><label>Iznos (RSD)<input name="amount" inputMode="decimal" required defaultValue={(rate.cents / 100).toFixed(2)} /></label><Button type="submit" disabled={busy || readOnly}>Sačuvaj cenu rada</Button></form>; })}</div></> : <>
        <section className="hours-period"><div className="hours-section-heading"><div><h3>Period i uvoz</h3></div></div><div className="hours-controls"><label>Kraj perioda / uvoz do datuma<input type="date" required min={p.start} max={todayBelgrade()} value={end} onChange={e => { setEnd(e.target.value); setConfirm(false); }} /></label><Button variant="outline" disabled={busy || readOnly || end < p.start} onClick={() => void command("import", { end })}>Preuzmi / osveži iz rasporeda</Button></div></section>
        <section className="hours-team"><div className="hours-section-heading"><div><h3>Pregled tima</h3><p>Uporedite sate i iznose, pa otvorite zaposlenog za ispravke.</p></div></div>{previewError && <p className="form-error" role="alert">{previewError}</p>}
          <div className="hours-team-head" aria-hidden="true"><span>Zaposleni</span><span>Sati</span><span>Metod / cena</span><span>Ukupni iznos</span></div>
          <div className="hours-team-list">{employees.map(e => { const row = rows.find(r => r.employee === e.id), rate = data.rates[e.id] ?? defaultRate, extra = p.extras[e.id], entries = p.entries.filter(a => a.employee === e.id), mins = entries.reduce((n, a) => n + a.minutes, 0); return <article className="hours-person" key={`${p.version}:${e.id}`}>
            <div className="hours-person-main"><div className="hours-person-name"><h4>{e.name}</h4></div><div><span className="hours-mobile-label">Sati</span><strong>{Math.floor((mins + 30) / 60)} h</strong><small>{Math.floor(mins / 60)} h {mins % 60} min</small></div><div><span className="hours-mobile-label">Metod / cena</span><span>{payLabels[rate.method]}</span><small>{money(rate.cents)}</small></div><div><span className="hours-mobile-label">Ukupni iznos</span><strong>{row ? money(row.total) : "Dopunite iznose"}</strong></div></div>
            <details className="hours-person-details"><summary>Ispravi iznose i smene <span>({entries.length})</span></summary><div className="hours-person-editors"><form className="settings-form hours-extra-form" onSubmit={event => { event.preventDefault(); const f = new FormData(event.currentTarget); submit("extra", () => ({ employee: e.id, overtime: parseMoney(String(f.get("overtime"))), monthly: f.get("monthly") === null || f.get("monthly") === "" ? null : parseMoney(String(f.get("monthly"))) })); }}><h5>Ručni iznosi (RSD)</h5><label>Dodatak za prekovremeni rad<input name="overtime" inputMode="decimal" required defaultValue={((extra?.overtime ?? 0) / 100).toFixed(2)} /></label>{rate.method === "monthly" && !fullMonth(p.start, end) && <label>Fiksni iznos za nepotpun mesec<input name="monthly" inputMode="decimal" required defaultValue={extra?.monthly === null || extra?.monthly === undefined ? "" : (extra.monthly / 100).toFixed(2)} /></label>}<Button type="submit" variant="outline" disabled={busy || readOnly}>Sačuvaj iznose</Button></form>
              <div className="hours-shift-list"><h5>Evidentirane smene</h5>{!entries.length ? <p className="muted">Još nema preuzetih smena.</p> : entries.map(a => <div className="hours-shift-row" key={`${p.version}:${a.key}`}><div><strong>{a.date}</strong><small>{a.edited ? "Ručno ispravljeno" : "Iz rasporeda"}</small></div><form onSubmit={event => { event.preventDefault(); const f = new FormData(event.currentTarget); const hours = Number(f.get("hours")); const minutes = Math.round(hours * 60); if (!Number.isFinite(hours) || Math.abs(minutes / 60 - hours) > 0.00001) { setError("Unesite sate sa preciznošću do jednog minuta."); return; } void command("entry", { key: a.key, minutes }); }}><label>Odrađeno (h)<input aria-label={`Sati: ${a.date}, ${e.name}`} name="hours" type="number" min="0" max="24" step="any" required defaultValue={Number((a.minutes / 60).toFixed(6))} /></label><Button type="submit" disabled={busy || readOnly} variant="outline">Sačuvaj sate</Button></form></div>)}</div></div></details>
          </article>; })}</div>
        </section>
        <section className="hours-close-section"><div><h3>Zaključavanje celog tima</h3><p>{end < p.start ? `Novi period počinje ${p.start}. Zaključavanje će biti dostupno kada period počne.` : `Period ${p.start} – ${end}. Zaključeni obračun ostaje u istoriji, a novi period počinje sa nula sati.`}</p></div>{!confirm ? <Button className="hours-close-button" variant="outline" disabled={busy || readOnly || !!previewError || end < p.start} onClick={() => setConfirm(true)}>Pregledaj zaključavanje</Button> : <div className="hours-confirm" role="group" aria-label="Potvrda celog tima"><p>Potvrđujem da je plata isplaćena i da su sati i iznosi za ceo tim provereni za {p.start} – {end}. Zaključavanje je trajno; zaključeni period se više ne uređuje. Novi period počinje sa nula sati za sve.</p><div><Button disabled={busy || readOnly} onClick={() => void command("close", { end })}>Potvrdi i zaključi ceo tim</Button><Button variant="outline" disabled={busy} onClick={() => setConfirm(false)}>Odustani</Button></div></div>}</section>
      </>}
    </>}
    {!settingsOnly && data && <section className="hours-history"><div className="hours-section-heading"><div><h3>Zaključeni obračuni</h3><p>Sačuvani iznosi su zaključani i spremni za štampu.</p></div></div>{!data.history.length && <p className="hours-empty">Još nema zaključenih obračuna.</p>}{data.history.map(h => <div className="hours-history-item" key={h.id}><details><summary><strong>{h.start} – {h.end}</strong><span>{h.rows.length} zaposlenih · Pregledaj iznose</span></summary><div className="data-table-scroll"><table className="data-table"><thead><tr><th>Zaposleni</th><th>Sati</th><th>Metod</th><th>Osnovno</th><th>Prekovremeni dodatak</th><th>Ukupno</th></tr></thead><tbody>{h.rows.map(r => <tr key={r.employee}><td>{r.name}</td><td>{r.hours} h</td><td>{payLabels[r.method]}</td><td>{money(r.base)}</td><td>{money(r.overtime)}</td><td>{money(r.total)}</td></tr>)}</tbody></table></div></details><Button variant="outline" disabled={!h.rows.length} onClick={() => printHours(h)}>PDF za potpis / štampa</Button></div>)}</section>}
  </section>;
}
