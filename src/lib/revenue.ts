import { parseMoney, validDate } from "./hours";

export interface RevenueValues { date: string; shift: string; cash: number | null; cards: number | null }
export interface RevenueEntry extends RevenueValues { id: string; sequence: number; createdAt: string; updatedAt: string; version: number }
export interface RevenueData { entries: RevenueEntry[] }
export const EMPTY_REVENUE: RevenueData = { entries: [] };
export const DEMO_REVENUE_KEY = "shiftflow:demo:revenue:v1";

export function revenueValues(date: string, shift: string, cash: string, cards: string): RevenueValues {
  const values = { date, shift: shift.trim(), cash: cash.trim() === "" ? null : parseMoney(cash), cards: cards.trim() === "" ? null : parseMoney(cards) };
  validateRevenue(values);
  return values;
}
export function validateRevenue(values: RevenueValues) {
  if (!validDate(values.date) || values.date < "0001-01-01") throw new Error("Izaberite ispravan datum pazara.");
  if (typeof values.shift !== "string" || Array.from(values.shift).length > 80) throw new Error("Oznaka smene može imati najviše 80 znakova.");
  if (values.cash === null && values.cards === null) throw new Error("Unesite gotovinu, kartice ili oba iznosa. Nula je dozvoljena.");
  for (const value of [values.cash, values.cards]) if (value !== null && (!Number.isSafeInteger(value) || value < 0 || value > 99999999999)) throw new Error("Unesite nenegativan iznos sa najviše dve decimale.");
}
export function revenueTotal(entry: RevenueValues) { return (entry.cash ?? 0) + (entry.cards ?? 0); }
export function revenueOrder(entries: RevenueEntry[]) {
  return [...entries].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt) || b.sequence - a.sequence);
}
/** Prepared for B3 dashboard: exactly one record, regardless of its business date. */
export function latestRevenue(data: RevenueData) {
  const entry = revenueOrder(data.entries)[0];
  return entry ? { id: entry.id, date: entry.date, total: revenueTotal(entry) } : null;
}
export function revenueSummary(data: RevenueData) {
  const sum = (field: "cash" | "cards") => {
    const present = data.entries.filter(e => e[field] !== null);
    if (!present.length) return null;
    const result = present.reduce((n, e) => n + BigInt(e[field]!), 0n);
    if (result > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error("Zbir je izvan podržanog opsega.");
    return Number(result);
  };
  const cash = sum("cash"), cards = sum("cards");
  const total = data.entries.length ? (cash ?? 0) + (cards ?? 0) : null;
  if (total !== null && !Number.isSafeInteger(total)) throw new Error("Zbir je izvan podržanog opsega.");
  return { cash, cards, total, count: data.entries.length };
}
export function demoSaveRevenue(data: RevenueData, id: string, version: number | null, values: RevenueValues, now = new Date().toISOString()): RevenueData {
  validateRevenue(values);
  const next = structuredClone(data), entry = next.entries.find(e => e.id === id);
  if (version === null) {
    if (entry) {
      if (entry.version !== 0 || JSON.stringify({ date: entry.date, shift: entry.shift, cash: entry.cash, cards: entry.cards }) !== JSON.stringify(values)) throw new Error("VERSION_CONFLICT");
      return next;
    }
    next.entries.push({ ...values, id, sequence: Math.max(0, ...next.entries.map(e => e.sequence)) + 1, createdAt: now, updatedAt: now, version: 0 });
  } else {
    if (!entry || entry.version !== version) throw new Error("VERSION_CONFLICT");
    Object.assign(entry, values, { version: version + 1, updatedAt: now });
  }
  return next;
}
