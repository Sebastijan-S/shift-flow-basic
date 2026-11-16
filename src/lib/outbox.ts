import type { PendingSave } from "./sync";

type OutboxStorage = Pick<Storage, "length" | "key" | "getItem" | "setItem" | "removeItem">;

/** Each operation has its own key so one tab cannot replace another tab's queue. */
export class WorkspaceOutbox {
  private prefix: string;
  private legacy: string;
  constructor(private storage: OutboxStorage, key: string) {
    this.prefix = `${key}:outbox:operation:`;
    this.legacy = `${key}:outbox`;
  }
  owns(key: string | null) { return !!key && key.startsWith(this.prefix); }
  read(): PendingSave[] {
    const jobs = new Map<string, PendingSave>();
    for (let i = 0; i < this.storage.length; i++) {
      const key = this.storage.key(i);
      if (!this.owns(key)) continue;
      const raw = this.storage.getItem(key!);
      if (!raw) continue;
      const job = JSON.parse(raw) as PendingSave;
      if (job.id && key === this.prefix + job.id) jobs.set(job.id, job);
    }
    const legacy = this.storage.getItem(this.legacy);
    if (legacy) {
      const old = JSON.parse(legacy) as PendingSave[];
      if (!Array.isArray(old)) throw new Error("Invalid pending saves");
      old.forEach((job, index) => {
        if (!jobs.has(job.id)) {
          const migrated = { ...job, createdAt: job.createdAt ?? index };
          this.storage.setItem(this.prefix + job.id, JSON.stringify(migrated));
          jobs.set(job.id, migrated);
        }
      });
      this.storage.removeItem(this.legacy);
    }
    return [...jobs.values()].sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0) || a.id.localeCompare(b.id));
  }
  write(jobs: PendingSave[]) {
    for (const job of jobs) this.storage.setItem(this.prefix + job.id, JSON.stringify(job));
  }
  acknowledge(id: string) { this.storage.removeItem(this.prefix + id); }
}
