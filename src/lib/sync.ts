import { cloudState, type StoredState } from "./storage";
import { mergeWorkspace } from "./workspace-merge";

export interface PendingSave { id: string; base: StoredState; state: StoredState; version: number; uiBase?: StoredState; createdAt?: number }
interface SyncOptions {
  version: number; state: StoredState;
  save: (state: StoredState, version: number, id: string) => Promise<number>;
  load: () => Promise<{ state: StoredState; version: number }>;
  pending: (saves: PendingSave[]) => void;
  acknowledged?: (id: string) => void;
  acknowledge: (saved: StoredState, previous: StoredState, version: number) => void;
  status: (status: string, error?: Error) => void;
}

/** Single-flight saves with a retained, idempotent retry and field-level rebasing. */
export class WorkspaceSync {
  private base: StoredState;
  private version: number;
  private queue: PendingSave[] = [];
  private attempted = new Set<string>();
  private running: Promise<void> | null = null;
  private stopped = false;
  constructor(private options: SyncOptions) { this.base = cloudState(options.state); this.version = options.version; }
  enqueue(state: StoredState) {
    if (this.stopped || (!this.queue.length && JSON.stringify(state.current) === JSON.stringify(this.base.current))) return;
    const job: PendingSave = { id: crypto.randomUUID(), base: this.base, uiBase: this.base, state: cloudState(state), version: this.version, createdAt: Date.now() };
    this.queue.push(job);
    this.options.pending([...this.queue]); this.options.status("Čeka slanje");
  }
  restore(pending: PendingSave[]) { this.queue = pending; this.attempted = new Set(pending.map(p => p.id)); }
  pendingJobs() { return [...this.queue]; }
  flush(): Promise<void> {
    if (this.running) return this.running;
    this.running = this.drain().finally(() => { this.running = null; });
    return this.running;
  }
  private async drain() {
    while (this.queue.length && !this.stopped) {
      const job = this.queue[0]; this.attempted.add(job.id);
      this.options.status("Čuvanje…");
      try {
        // Only retry optimistic conflicts here. Network retries retain the original operation ID.
        let version: number | undefined;
        for (let attempt = 0; attempt < 3; attempt++) {
          try { version = await this.options.save(job.state, job.version, job.id); break; }
          catch (error) {
            if (!(error instanceof Error) || !error.message.includes("VERSION_CONFLICT") || attempt === 2) throw error;
            const remote = await this.options.load();
            job.state = { ...job.state, current: mergeWorkspace(job.base.current, job.state.current, remote.state.current) };
            job.base = remote.state; job.version = remote.version;
            this.options.pending([...this.queue]);
          }
        }
        if (version === undefined) throw new Error("Nije potvrđena verzija upisa.");
        if (this.stopped) return;
        this.base = job.state; this.version = version;
        this.queue.shift(); this.attempted.delete(job.id);
        for (const queued of this.queue) {
          queued.state = { ...queued.state, current: mergeWorkspace(queued.base.current, queued.state.current, this.base.current) };
          queued.base = this.base; queued.version = version;
        }
        this.options.pending([...this.queue]);
        this.options.acknowledged?.(job.id);
        this.options.acknowledge(job.state, job.uiBase ?? job.base, version);
        this.options.status(this.queue.length ? "Čeka slanje" : "Sinhronizovano");
      } catch (error) {
        // The attempted request stays first with its exact ID/payload, even if newer edits exist.
        this.options.pending([...this.queue]);
        this.options.status("Pokušaj ponovo", error instanceof Error ? error : new Error(String(error)));
        return;
      }
    }
  }
  isPending() { return !!this.queue.length || !!this.running; }
  dispose() { this.stopped = true; }
}
