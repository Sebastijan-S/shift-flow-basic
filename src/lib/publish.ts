import { missingRequirements, scheduleRequirements, validateSchedule, type Workspace } from "./scheduler";
import { applyChange, type StoredState } from "./storage";

export function preparePublication(workspace: Workspace, week: string, publishedAt: string): Workspace {
  const schedule = workspace.schedules[week] ?? { week, status: "draft" as const, assignments: [] };
  const requirements = scheduleRequirements(workspace, schedule);
  if (missingRequirements(schedule.assignments, requirements).some(item => item.missing > 0) ||
      validateSchedule(schedule, workspace).some(item => item.severity === "block")) {
    throw new Error("Raspored se promenio i sada ima nepopunjena mesta ili kršenja pravila. Pregledajte ga ponovo.");
  }
  return { ...workspace, schedules: { ...workspace.schedules, [week]: {
    ...schedule, rules: { ...workspace.rules }, requirements,
    status: "published", publishedAt
  } } };
}

export async function publishAfterFlush(
  flush: () => Promise<boolean>, getLatest: () => StoredState | null,
  change: (state: StoredState) => void, week: string, publishedAt = () => new Date().toISOString()
): Promise<boolean> {
  if (!(await flush())) return false;
  const state = getLatest();
  if (!state) throw new Error("Radni prostor nije dostupan.");
  change(applyChange(state, preparePublication(state.current, week, publishedAt()), "Objavljen raspored"));
  return flush();
}
