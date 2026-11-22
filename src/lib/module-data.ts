import { getSupabase } from "./supabase";
import { EMPTY_HOURS, type HoursData } from "./hours";
import { DEMO_REVENUE_KEY, EMPTY_REVENUE, type RevenueData } from "./revenue";
import { DEMO_NOTES_KEY, EMPTY_NOTES, demoNotesCommand, type NoteCommand, type NotesData } from "./notes";
import { DEMO_BAR_KEY, EMPTY_BAR, readDemoBar, type BarData } from "./bar";

export const DEMO_HOURS_KEY = "shiftflow:demo:hours:v1";
async function read<T>(companyId: string | null, rpc: string, key: string, empty: T): Promise<T> {
  if (!companyId) return JSON.parse(localStorage.getItem(key) ?? JSON.stringify(empty));
  const result = await getSupabase()!.rpc(rpc, { p_company: companyId });
  if (result.error) throw result.error;
  return result.data;
}
export const readHours = (id: string | null) => read<HoursData>(id, "read_hours", DEMO_HOURS_KEY, EMPTY_HOURS);
export const readRevenue = (id: string | null) => read<RevenueData>(id, "read_revenue", DEMO_REVENUE_KEY, EMPTY_REVENUE);
export const readNotes = (id: string | null) => read<NotesData>(id, "read_notes", DEMO_NOTES_KEY, EMPTY_NOTES);
export async function readBar(id: string | null): Promise<BarData> {
  const data = await read<BarData>(id, "read_bar", DEMO_BAR_KEY, EMPTY_BAR);
  return id ? data : readDemoBar(data);
}

/** The Notes screen and dashboard use the same versioned, idempotent command. */
export async function saveNoteCommand(companyId: string | null, request: string, command: NoteCommand): Promise<NotesData> {
  if (companyId) {
    const result = await getSupabase()!.rpc("notes_command", { p_company: companyId, p_request: request, p_command: command });
    if (result.error) throw result.error;
    return result.data;
  }
  const write = async () => {
    const saved = JSON.parse(localStorage.getItem(DEMO_NOTES_KEY) ?? JSON.stringify(EMPTY_NOTES));
    const next = demoNotesCommand(saved, request, command);
    localStorage.setItem(DEMO_NOTES_KEY, JSON.stringify(next));
    return next;
  };
  return navigator.locks ? navigator.locks.request(DEMO_NOTES_KEY, write) : write();
}
