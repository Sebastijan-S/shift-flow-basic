import { useId } from "react";
import { DAY_NAMES } from "@/lib/scheduler";
import { Button } from "./ui/button";

export function CopyRequirementsAction({ day, onCopy, disabled }: { day: number; onCopy: () => void; disabled?: boolean }) {
  const descriptionId = useId();
  return <div className="requirement-copy-action">
    <Button type="button" variant="outline" disabled={disabled} aria-label={`Kopiraj na ostale dane — ${DAY_NAMES[day]}`} aria-describedby={descriptionId} onClick={onCopy}>Kopiraj na ostale dane</Button>
    <small id={descriptionId}>Zamenjuje potrebe ostalih šest dana. Smene zadržavaju svoje dane korišćenja. Promenu možete poništiti u Istoriji izmena.</small>
  </div>;
}
