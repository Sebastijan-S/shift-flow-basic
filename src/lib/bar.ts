import { validDate } from "./hours";

// All quantities are integer hundredths, in storage and over the wire.
export const MAX_QUANTITY = 999999999;
export const DEMO_BAR_KEY = "shiftflow:demo:bar:v1";
export type BarAnchor = "closing" | "used";
export interface BarItem { id: string; name: string; unit: string; initial: number }
export interface BarRow { itemId: string; name: string; unit: string; previous: number; acquired: number; total: number; closing: number; used: number; anchor: BarAnchor }
export interface BarDraft { id: string; date: string; shift: string; rows: BarRow[] }
export interface BarBook extends BarDraft { sequence: number; revision: number; completedAt: string }
export interface BarInventory { bookId: string; date: string; sequence: number; rows: BarRow[] }
export interface BarData { version: number; sequence: number; items: BarItem[]; draft: BarDraft | null; books: BarBook[]; inventory: BarInventory | null }
export interface BarCommand { version: number; action: "item" | "deleteItem" | "open" | "draft" | "finish" | "cancel" | "edit"; payload: unknown }
interface DemoBar extends BarData { receipts?: Record<string, string>; deletedIds?: string[] }
export const EMPTY_BAR: BarData = { version: 0, sequence: 0, items: [], draft: null, books: [], inventory: null };
export function parseQuantity(input: string): number {
  const value = input.trim().replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(value)) throw new Error("Unesite nenegativnu količinu sa najviše 2 decimale.");
  const [whole, fraction = ""] = value.split(".");
  const quantity = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  checkQuantity(quantity); return quantity;
}
export const quantityInput = (value: number) => (value / 100).toFixed(2);
export const quantityLabel = (value: number) => new Intl.NumberFormat("sr-Latn-RS", { maximumFractionDigits: 2 }).format(value / 100);
export function checkQuantity(value: number) {
  if (!Number.isSafeInteger(value) || value < 0 || value > MAX_QUANTITY) throw new Error("Količina mora biti između 0 i 9.999.999,99, sa najviše 2 decimale.");
}
export function validateItem(item: BarItem) {
  if (!item.id || typeof item.name !== "string" || !item.name.trim() || Array.from(item.name).length > 120 || typeof item.unit !== "string" || !item.unit.trim() || Array.from(item.unit).length > 20) throw new Error("Unesite naziv artikla (do 120 znakova) i jedinicu mere (do 20 znakova).");
  checkQuantity(item.initial);
}
/** Preserve the selected manual endpoint; editing total explicitly adjusts acquired. */
export function changeBarRow(row: BarRow, field: "previous" | "acquired" | "total" | "closing" | "used", value: number): BarRow {
  checkQuantity(value);
  const next = { ...row, [field]: value };
  if (field === "closing" || field === "used") next.anchor = field;
  if (field === "total") next.acquired = value - next.previous;
  else next.total = next.previous + next.acquired;
  if (next.anchor === "closing") next.used = next.total - next.closing;
  else next.closing = next.total - next.used;
  return next; // Invalid derived values remain visible until corrected; saving is blocked.
}
export function validateRows(rows: BarRow[], template: BarRow[]) {
  if (!Array.isArray(rows) || rows.length !== template.length || new Set(rows.map(r => r.itemId)).size !== rows.length) throw new Error("INVALID_ROWS");
  for (const row of rows) {
    const source = template.find(r => r.itemId === row.itemId);
    if (!source || row.name !== source.name || row.unit !== source.unit || !["closing", "used"].includes(row.anchor)) throw new Error("INVALID_ROWS");
    for (const field of ["previous", "acquired", "total", "closing", "used"] as const) checkQuantity(row[field]);
    if (row.total !== row.previous + row.acquired || row.closing !== row.total - row.used) throw new Error("Nedosledan red: proverite količine i izabrano ručno polje.");
  }
}
export function validateDraft(draft: BarDraft, template: BarRow[], minimum?: string) {
  if (!draft.id || !validDate(draft.date) || draft.date < "0001-01-01" || (minimum && draft.date < minimum)) throw new Error("Datum ne može biti raniji od poslednje završene knjige.");
  if (typeof draft.shift !== "string" || Array.from(draft.shift).length > 80) throw new Error("Oznaka smene može imati do 80 znakova.");
  validateRows(draft.rows, template);
}
export function newBarDraft(data: BarData, id: string, date: string): BarDraft {
  const rows = data.items.map(item => {
    const previous = data.inventory?.rows.find(r => r.itemId === item.id)?.closing ?? item.initial;
    return { itemId: item.id, name: item.name, unit: item.unit, previous, acquired: 0, total: previous, closing: previous, used: 0, anchor: "used" as const };
  });
  const draft = { id, date, shift: "", rows }; validateDraft(draft, rows, data.inventory?.date); return draft;
}
/** Demo mirrors the transactional RPC. Retains older books; only readBar exposes five. */
export function demoBarCommand(data: DemoBar, request: string, command: BarCommand, now = new Date().toISOString()): DemoBar {
  const d = structuredClone(data), serialized = JSON.stringify(command);
  if (d.receipts?.[request]) { if (d.receipts[request] !== serialized) throw new Error("REQUEST_CONFLICT"); return d; }
  if (command.version !== d.version) throw new Error("VERSION_CONFLICT");
  const p = command.payload as BarDraft & BarItem & { id: string };
  switch (command.action) {
    case "item": {
      if (d.deletedIds?.includes(p.id)) throw new Error("ITEM_DELETED");
      validateItem(p); const item = d.items.find(i => i.id === p.id);
      if (item) Object.assign(item, { name: p.name.trim(), unit: p.unit.trim(), initial: p.initial });
      else d.items.push({ id: p.id, name: p.name.trim(), unit: p.unit.trim(), initial: p.initial }); break;
    }
    case "deleteItem": if (!d.items.some(i => i.id === p.id)) throw new Error("ITEM_NOT_FOUND"); d.items = d.items.filter(i => i.id !== p.id); (d.deletedIds ??= []).push(p.id); break;
    case "open": if (d.draft || !d.items.length || d.books.some(b => b.id === p.id)) throw new Error("DRAFT_EXISTS_OR_EMPTY"); d.draft = newBarDraft(d, p.id, p.date); break;
    case "draft": case "finish": {
      if (!d.draft || p.id !== d.draft.id) throw new Error("DRAFT_CHANGED");
      validateDraft(p, d.draft.rows, d.inventory?.date); d.draft = structuredClone(p);
      if (command.action === "finish") {
        const book = { ...d.draft, sequence: ++d.sequence, revision: 0, completedAt: now };
        d.books.unshift(book); d.inventory = { bookId: book.id, date: book.date, sequence: book.sequence, rows: structuredClone(book.rows) }; d.draft = null;
      } break;
    }
    case "cancel": if (!d.draft || p.id !== d.draft.id) throw new Error("DRAFT_CHANGED"); d.draft = null; break;
    case "edit": {
      const book = d.books.find(b => b.id === p.id);
      if (!book || book.sequence <= d.sequence - 5) throw new Error("BOOK_OUTSIDE_LAST_FIVE");
      if (p.date !== book.date) throw new Error("HISTORICAL_DATE_LOCKED");
      validateDraft(p, book.rows); Object.assign(book, { shift: p.shift, rows: structuredClone(p.rows), revision: book.revision + 1 }); break;
    }
    default: throw new Error("INVALID_ACTION");
  }
  d.version++; (d.receipts ??= {})[request] = serialized; return d;
}
export function readDemoBar(data: DemoBar): BarData {
  return { version: data.version, sequence: data.sequence, items: data.items, draft: data.draft, inventory: data.inventory, books: [...data.books].sort((a, b) => b.sequence - a.sequence).slice(0, 5) };
}
