export interface CompanyAccess { access_status: string; trial_ends_at: string | null }

export function accessReadOnly(company: CompanyAccess | null, now: number): boolean {
  return company?.access_status === "expired" || (company?.access_status === "trial" && !!company.trial_ends_at && Date.parse(company.trial_ends_at) <= now);
}

export function trialDays(company: CompanyAccess, now: number): number | null {
  return company.access_status === "trial" && company.trial_ends_at
    ? Math.max(0, Math.ceil((Date.parse(company.trial_ends_at) - now) / 86400000)) : null;
}
