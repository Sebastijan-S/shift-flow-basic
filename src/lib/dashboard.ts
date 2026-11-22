import { addDays, monday, type Workspace } from "./scheduler";
import { moduleVisible, type ModuleSettings } from "./modules";
import type { HoursData } from "./hours";
import { latestRevenue, type RevenueData } from "./revenue";
import { notesOrder, type NotesData } from "./notes";
import type { BarData } from "./bar";

export function todayInBelgrade(now: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Belgrade", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const part = (name: string) => parts.find(p => p.type === name)!.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}
export function scheduledToday(workspace: Pick<Workspace, "schedules">, now: Date): number {
  const today = todayInBelgrade(now), week = monday(now);
  return new Set((workspace.schedules[week]?.assignments ?? []).filter(a => addDays(week, a.day) === today).map(a => a.employeeId)).size;
}
export const dashboardSources = (settings: ModuleSettings, restricted = false) =>
  (["hours", "revenue", "bar", "notes"] as const).filter(id => moduleVisible("overview", settings, restricted) && moduleVisible(id, settings, restricted));
export type DashboardSource = ReturnType<typeof dashboardSources>[number];
export interface DashboardData { hours: HoursData; revenue: RevenueData; bar: BarData; notes: NotesData }
export type DashboardResults = { [K in keyof DashboardData]?: { data?: DashboardData[K]; error?: string } };
export type DashboardReaders = { [K in keyof DashboardData]: (companyId: string | null) => Promise<DashboardData[K]> };
export async function loadDashboard(settings: ModuleSettings, restricted: boolean, companyId: string | null, readers: DashboardReaders): Promise<DashboardResults> {
  const results = await Promise.all(dashboardSources(settings, restricted).map(async id => {
    try { return [id, { data: await readers[id](companyId) }] as const; }
    catch { return [id, { error: "Podaci nisu dostupni. Pokušajte osvežavanje." }] as const; }
  }));
  return Object.fromEntries(results) as DashboardResults;
}
export function recordedMinutes(data: HoursData): number | null {
  return data.open ? data.open.entries.reduce((sum, entry) => sum + entry.minutes, 0) : null;
}
export function dashboardValues(data: DashboardResults) {
  const minutes = data.hours?.data ? recordedMinutes(data.hours.data) : null;
  const revenue = data.revenue?.data ? latestRevenue(data.revenue.data) : null;
  const book = data.bar?.data?.books.reduce<BarData["books"][number] | null>((last, book) => !last || book.sequence > last.sequence ? book : last, null);
  const reminders = notesOrder(data.notes?.data?.entries ?? []).filter(e => e.date && !e.completed);
  return { minutes, revenue, bookDate: book?.date ?? null, reminders };
}
export const dashboardActions = (settings: ModuleSettings) => [
  { module: "schedule" as const, label: "Otvori raspored", page: "Raspored" as const },
  { module: "revenue" as const, label: "Unesi pazar", page: "Pazar" as const },
  { module: "bar" as const, label: "Knjiga šanka", page: "Knjiga šanka i inventar" as const },
  { module: "notes" as const, label: "Beleška / podsetnik", page: "Notes i podsetnici" as const },
].filter(action => moduleVisible(action.module, settings));
