import { DAY_NAMES, type Position, type Requirement, type ShiftTemplate } from "./scheduler";

/** Replace the other days' editable requirements with an independent copy. */
export function copyDayRequirements(requirements: Requirement[], templates: ShiftTemplate[], positions: Position[], sourceDay: number): Requirement[] {
  if (!Number.isInteger(sourceDay) || sourceDay < 0 || sourceDay >= DAY_NAMES.length) throw new RangeError("Nepostojeći dan.");
  // Keep the source and records outside the current editor's scope intact.
  const next = requirements.filter(r => r.day === sourceDay || r.day < 0 || r.day >= DAY_NAMES.length || !templates.some(t => t.id === r.templateId) || !positions.includes(r.position));
  for (let day = 0; day < DAY_NAMES.length; day++) {
    if (day === sourceDay) continue;
    for (const template of templates) {
      if (template.days && !template.days.includes(day)) continue;
      for (const position of positions) {
        const sourceIsActive = !template.days || template.days.includes(sourceDay);
        const count = sourceIsActive ? requirements.find(r => r.day === sourceDay && r.templateId === template.id && r.position === position)?.count ?? 0 : 0;
        next.push({ day, templateId: template.id, position, count });
      }
    }
  }
  return next;
}
