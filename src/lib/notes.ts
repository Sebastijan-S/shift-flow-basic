import { validDate } from "./hours";

export interface NoteValues { text: string; date: string | null; time: string | null; completed: boolean }
export interface NoteEntry extends NoteValues { id: string; version: number; createdAt: string; updatedAt: string }
export interface NoteCommand { id: string; version: number | null; action: "save" | "delete"; values: NoteValues | null }
export interface NotesData { entries: NoteEntry[] }
interface DemoNotes extends NotesData { receipts?: Record<string, string>; deleted?: string[] }
export const DEMO_NOTES_KEY = "shiftflow:demo:notes:v1";
export const EMPTY_NOTES: NotesData = { entries: [] };
const localFormat = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Belgrade", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" });
const wallTime = (ms: number) => localFormat.format(new Date(ms)).replace(" ", "T");

/** Resolve wall time without depending on the browser zone. A fold uses the later instant, like PostgreSQL. */
export function noteInstant(date: string, time: string): number {
  const target = `${date}T${time}:00`, base = Date.parse(`${target}Z`);
  const offsets = new Set<number>();
  for (const hours of [-36, 0, 36]) {
    const sample = base + hours * 3600000;
    offsets.add(Date.parse(`${wallTime(sample)}Z`) - sample);
  }
  const matches = [...offsets].map(offset => base - offset).filter(ms => wallTime(ms) === target);
  if (!matches.length) throw new Error("Izabrano vreme ne postoji u Europe/Belgrade zbog promene sata. Izaberite drugo vreme.");
  return Math.max(...matches);
}
export function noteValues(text: string, date = "", time = "", completed = false): NoteValues {
  const values = { text: text.trim(), date: date || null, time: time || null, completed };
  validateNote(values); return values;
}
export function validateNote(v: NoteValues) {
  if (typeof v.text !== "string" || !v.text.trim() || Array.from(v.text).length > 10000) throw new Error("Unesite tekst beleške (najviše 10.000 znakova).");
  if (typeof v.completed !== "boolean") throw new Error("Neispravan status beleške.");
  if (v.date !== null && (!validDate(v.date) || v.date < "0001-01-01")) throw new Error("Izaberite ispravan datum.");
  if (v.time !== null && (!v.date || !/^([01]\d|2[0-3]):[0-5]\d$/.test(v.time))) throw new Error("Vreme zahteva datum i format HH:mm.");
  if (v.date && v.time) noteInstant(v.date, v.time);
}
export function noteOverdue(entry: NoteValues, now = new Date()): boolean {
  return !entry.completed && !!entry.date && (entry.time ? noteInstant(entry.date, entry.time) < now.getTime() : entry.date < new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Belgrade", year: "numeric", month: "2-digit", day: "2-digit" }).format(now));
}
const compare = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;
/** Reminder deadlines ascending, date-only last within that day; ties: creation ascending then ID. Notes: newest first. */
export function notesOrder(entries: NoteEntry[]): NoteEntry[] {
  return [...entries].sort((a, b) => Number(a.completed) - Number(b.completed)
    || (a.date && b.date ? compare(a.date, b.date) || compare(a.time ?? "24:00", b.time ?? "24:00") : Number(!a.date) - Number(!b.date))
    || (a.date ? compare(a.createdAt, b.createdAt) : compare(b.createdAt, a.createdAt)) || compare(a.id, b.id));
}
export function demoNotesCommand(data: DemoNotes, request: string, command: NoteCommand, now = new Date().toISOString()): DemoNotes {
  const next = structuredClone(data), payload = JSON.stringify(command);
  if (next.receipts?.[request]) {
    if (next.receipts[request] !== payload) throw new Error("REQUEST_CONFLICT");
    return next;
  }
  const entry = next.entries.find(e => e.id === command.id);
  if (command.action === "save" && command.values) validateNote(command.values);
  else if (command.action !== "delete" || command.values !== null || command.version === null) throw new Error("INVALID_NOTE");
  if (command.version === null) {
    if (entry || next.deleted?.includes(command.id)) throw new Error("VERSION_CONFLICT");
    next.entries.push({ ...command.values!, id: command.id, version: 0, createdAt: now, updatedAt: now });
  } else {
    if (!entry || entry.version !== command.version) throw new Error("VERSION_CONFLICT");
    if (command.action === "delete") {
      next.entries = next.entries.filter(e => e.id !== command.id); (next.deleted ??= []).push(command.id);
    } else Object.assign(entry, command.values, { version: entry.version + 1, updatedAt: now });
  }
  (next.receipts ??= {})[request] = payload; return next;
}
