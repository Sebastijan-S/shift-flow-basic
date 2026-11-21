/** Only shipped modules may create navigation or dashboard entries. */
export const MODULES = [
  { id: "schedule", name: "Raspored", description: "Zaposleni, smene, dostupnost, odsustva i pravila rada.", available: true, required: true, defaultEnabled: true },
  { id: "overview", name: "Pregled", description: "Postojeći pregled tima na smeni i planiranih sati.", available: true, required: false, defaultEnabled: true },
  { id: "hours", name: "Radni sati i obračun", description: "Evidencija sati, obračuni i PDF za potpis.", available: true, required: false, defaultEnabled: false },
  { id: "revenue", name: "Pazar", description: "Gotovina, kartice i pregled evidentiranog pazara.", available: false, required: false, defaultEnabled: false },
  { id: "notes", name: "Notes i podsetnici", description: "Beleške i podsetnici unutar aplikacije.", available: false, required: false, defaultEnabled: false },
  { id: "bar", name: "Knjiga šanka i inventar", description: "Popis, prenos stanja i potrošnja artikala.", available: false, required: false, defaultEnabled: false },
  { id: "reports", name: "Izveštaji", description: "Nedeljni i mesečni pregledi sačuvanih podataka.", available: false, required: false, defaultEnabled: false },
] as const;

export type ModuleId = typeof MODULES[number]["id"];
export type ModuleSettings = Record<ModuleId, boolean>;
export const DEMO_MODULES_KEY = "shiftflow:demo:modules:v1";

export function defaultModules(): ModuleSettings {
  return Object.fromEntries(MODULES.map(m => [m.id, m.defaultEnabled])) as ModuleSettings;
}

export function isModuleId(value: string): value is ModuleId {
  return MODULES.some(m => m.id === value);
}

export function parseModules(value: unknown): ModuleSettings {
  const result = defaultModules();
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Podešavanja modula nisu u podržanom formatu.");
  for (const [id, enabled] of Object.entries(value)) {
    if (!isModuleId(id) || typeof enabled !== "boolean" || (id === "schedule" && !enabled)) throw new Error("Neispravno podešavanje modula.");
    result[id] = enabled;
  }
  return result;
}

export function moduleVisible(id: ModuleId, settings: ModuleSettings, restricted = false): boolean {
  const module = MODULES.find(m => m.id === id)!;
  return module.available && settings[id] && (!restricted || id === "schedule");
}
