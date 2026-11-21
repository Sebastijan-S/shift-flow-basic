import { addDays, assignmentTemplate, duration, type Workspace } from "./scheduler";

export type PayMethod = "hourly" | "shift" | "monthly";
export const payLabels: Record<PayMethod, string> = { hourly: "Po satu", shift: "Po smeni", monthly: "Fiksna mesečna plata" };
export interface PayRate { method: PayMethod; cents: number }
export interface HoursEntry { key: string; employee: string; date: string; minutes: number; edited: boolean }
export interface PayExtra { overtime: number; monthly: number | null }
export interface PayRow { employee: string; name: string; minutes: number; hours: number; shifts: number; method: PayMethod; rate: number; base: number; overtime: number; total: number }
export interface HoursPeriod { id: string; start: string; end: string | null; version: number; entries: HoursEntry[]; extras: Record<string, PayExtra> }
export interface HoursSnapshot { id: string; start: string; end: string; company: string; closedAt: string; rows: PayRow[] }
export interface HoursData { open: HoursPeriod | null; rates: Record<string, PayRate>; history: HoursSnapshot[]; workspaceVersion?: number }
export const EMPTY_HOURS: HoursData = { open: null, rates: {}, history: [] };
export const defaultRate: PayRate = { method: "hourly", cents: 0 };
export function todayBelgrade() { return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Belgrade", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()); }
export function money(cents: number) { return (cents / 100).toLocaleString("sr-Latn-RS", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " RSD"; }
export function parseMoney(value: string): number {
  if (!/^\d{1,9}([.,]\d{1,2})?$/.test(value.trim())) throw new Error("Unesite nenegativan iznos sa najviše dve decimale.");
  const [whole, fraction = ""] = value.trim().replace(",", ".").split(".");
  return Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
}
export function validDate(value: string) { return /^\d{4}-\d{2}-\d{2}$/.test(value) && !isNaN(Date.parse(value)) && new Date(value + "T12:00:00Z").toISOString().slice(0, 10) === value; }
export function fullMonth(start: string, end: string) { return start.endsWith("-01") && addDays(end, 1).endsWith("-01") && start.slice(0, 7) === end.slice(0, 7); }
export function payRows(data: HoursData, w: Pick<Workspace, "employees">, end: string): PayRow[] {
  const p = data.open; if (!p) return [];
  return w.employees.filter(e => e.active || p.entries.some(a => a.employee === e.id) || p.extras[e.id]).map(e => {
    const entries = p.entries.filter(a => a.employee === e.id), minutes = entries.reduce((n, a) => n + a.minutes, 0), hours = Math.floor((minutes + 30) / 60);
    const rate = data.rates[e.id] ?? defaultRate, extra = p.extras[e.id] ?? { overtime: 0, monthly: null };
    const base = rate.method === "hourly" ? hours * rate.cents : rate.method === "shift" ? entries.filter(a => a.minutes > 0).length * rate.cents : fullMonth(p.start, end) ? rate.cents : extra.monthly;
    if (base === null) throw new Error(`Unesite iznos fiksne plate za nepotpun mesec: ${e.name}.`);
    return { employee: e.id, name: e.name, minutes, hours, shifts: entries.filter(a => a.minutes > 0).length, method: rate.method, rate: rate.cents, base, overtime: extra.overtime, total: base + extra.overtime };
  });
}
/** Explicit import only: a newly opened period always stays at zero until requested. */
export function plannedEntries(w: Workspace, from: string, to: string): HoursEntry[] {
  return Object.values(w.schedules).flatMap(s => s.assignments.map(a => ({ key: `${s.week}:${a.id}`, employee: a.employeeId, date: addDays(s.week, a.day), minutes: Math.round(duration(assignmentTemplate(a, w.templates)) * 60), edited: false }))).filter(a => a.date >= from && a.date <= to).sort((a, b) => a.date.localeCompare(b.date) || a.key.localeCompare(b.key));
}
export type HoursAction = "start" | "import" | "entry" | "rate" | "extra" | "close";
export function demoHoursCommand(data: HoursData, w: Workspace, action: HoursAction, payload: Record<string, unknown>, period: string | null, version: number): HoursData {
  const d = structuredClone(data), p = d.open;
  if (action === "close" && d.history.some(h => h.id === period)) return d;
  if (action === "start") {
    if (p || d.history.length || !validDate(String(payload.start)) || String(payload.start) > todayBelgrade()) throw new Error("Početak perioda nije dozvoljen.");
    d.open = { id: crypto.randomUUID(), start: String(payload.start), end: null, version: 0, entries: [], extras: {} }; return d;
  }
  if (!p || p.id !== period || p.version !== version) throw new Error("VERSION_CONFLICT: osvežite obračun.");
  const employee = String(payload.employee);
  if (["rate", "extra"].includes(action) && !w.employees.some(e => e.id === employee)) throw new Error("Zaposleni ne postoji.");
  if (action === "import") {
    const end = String(payload.end); if (!validDate(end) || end < p.start || end > todayBelgrade()) throw new Error("Neispravan period.");
    p.entries = [...p.entries.filter(a => a.edited), ...plannedEntries(w, p.start, end).filter(a => !p.entries.some(b => b.key === a.key && b.edited))];
  } else if (action === "entry") {
    const entry = p.entries.find(a => a.key === payload.key); const value = Number(payload.minutes);
    if (!entry || !Number.isInteger(value) || value < 0 || value > 1440) throw new Error("Neispravni sati.");
    entry.minutes = value; entry.edited = true;
  } else if (action === "rate") {
    const cents = Number(payload.cents), method = payload.method as PayMethod;
    if (!Object.hasOwn(payLabels, method) || !Number.isSafeInteger(cents) || cents < 0 || cents > 99999999999) throw new Error("Neispravna cena rada.");
    d.rates[employee] = { method, cents };
  } else if (action === "extra") {
    const overtime = Number(payload.overtime), monthly = payload.monthly === null ? null : Number(payload.monthly);
    if (![overtime, ...(monthly === null ? [] : [monthly])].every(v => Number.isSafeInteger(v) && v >= 0 && v <= 99999999999)) throw new Error("Neispravan iznos.");
    p.extras[employee] = { overtime, monthly };
  } else if (action === "close") {
    const end = String(payload.end);
    if (!validDate(end) || end < p.start || end > todayBelgrade() || p.entries.some(a => a.date > end)) throw new Error("Proverite kraj perioda i datume smena.");
    d.history.unshift({ id: p.id, start: p.start, end, company: w.name, closedAt: new Date().toISOString(), rows: payRows(d, w, end) });
    d.open = { id: crypto.randomUUID(), start: addDays(end, 1), end: null, version: 0, entries: [], extras: {} }; return d;
  }
  p.version++; return d;
}
