export interface CompanyAccess { access_status: string; trial_ends_at: string | null }

/** Network failures preserve recoverable edits; revoked membership/session hides the workspace. */
export function accessDenied(error: unknown): boolean {
  const e = error as { code?: string; message?: string; name?: string; status?: number } | null;
  return !!e && (e.status === 401 || e.status === 403 || e.name === "AuthSessionMissingError"
    || /^(ACCESS_DENIED|42501|PGRST30[123]|PGRST116|bad_jwt|session_not_found|refresh_token_not_found|refresh_token_already_used)$/.test(e.code ?? "")
    || /ACCESS_DENIED|JWT expired|invalid JWT|link je opozvan/i.test(e.message ?? ""));
}

export function accessReadOnly(company: CompanyAccess | null, now: number): boolean {
  return company?.access_status === "expired" || (company?.access_status === "trial" && !!company.trial_ends_at && Date.parse(company.trial_ends_at) <= now);
}

export function trialDays(company: CompanyAccess, now: number): number | null {
  return company.access_status === "trial" && company.trial_ends_at
    ? Math.max(0, Math.ceil((Date.parse(company.trial_ends_at) - now) / 86400000)) : null;
}
