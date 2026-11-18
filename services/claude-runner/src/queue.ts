/**
 * Bounded in-process job queue for Claude role runs.
 * Default concurrency: 4 with one slot reserved for urgent P0/P1 work
 * (lost-lead / inbound customer) so bulk P3/P4 cannot starve it.
 */

export type QueueJob<T> = {
  id: string;
  /** Lower number = higher priority (P0=0 … P4=4). */
  priority: number;
  payload: T;
};

export type QueueResult<R> = {
  id: string;
  ok: boolean;
  result?: R;
  error?: string;
};

type Waiter<T, R> = {
  job: QueueJob<T>;
  worker: (payload: T) => Promise<R>;
  resolve: (value: QueueResult<R>) => void;
};

export type BoundedQueueOptions = {
  concurrency?: number;
  /** Number of slots that only P0/P1 (priority <= urgentMaxPriority) may use when contended. */
  reservedUrgentSlots?: number;
  /** Priorities at or below this value are "urgent" (default 1 = P0/P1). */
  urgentMaxPriority?: number;
};

export class BoundedQueue<T, R> {
  private readonly concurrency: number;
  private readonly reservedUrgentSlots: number;
  private readonly urgentMaxPriority: number;
  private readonly pending: Waiter<T, R>[] = [];
  private active = 0;
  private activeNonUrgent = 0;

  constructor(concurrencyOrOptions: number | BoundedQueueOptions = 4) {
    const options =
      typeof concurrencyOrOptions === "number"
        ? { concurrency: concurrencyOrOptions }
        : concurrencyOrOptions;
    const concurrency = options.concurrency ?? 4;
    if (concurrency < 1) {
      throw new Error("concurrency must be >= 1");
    }
    const reserved = options.reservedUrgentSlots ?? 1;
    if (reserved < 0 || reserved >= concurrency) {
      throw new Error("reservedUrgentSlots must be in [0, concurrency)");
    }
    this.concurrency = concurrency;
    this.reservedUrgentSlots = reserved;
    this.urgentMaxPriority = options.urgentMaxPriority ?? 1;
  }

  get pendingCount(): number {
    return this.pending.length;
  }

  get activeCount(): number {
    return this.active;
  }

  get activeNonUrgentCount(): number {
    return this.activeNonUrgent;
  }

  isUrgent(priority: number): boolean {
    return priority <= this.urgentMaxPriority;
  }

  /** Max concurrent non-urgent jobs = concurrency - reserved. */
  private nonUrgentCap(): number {
    return this.concurrency - this.reservedUrgentSlots;
  }

  run(
    job: QueueJob<T>,
    worker: (payload: T) => Promise<R>,
  ): Promise<QueueResult<R>> {
    return new Promise((resolve) => {
      this.pending.push({ job, worker, resolve });
      this.pending.sort((a, b) => a.job.priority - b.job.priority);
      this.pump();
    });
  }

  private canStart(waiter: Waiter<T, R>): boolean {
    if (this.active >= this.concurrency) {
      return false;
    }
    if (this.isUrgent(waiter.job.priority)) {
      return true;
    }
    // Non-urgent jobs cannot consume reserved urgent slots.
    return this.activeNonUrgent < this.nonUrgentCap();
  }

  private pickNext(): Waiter<T, R> | undefined {
    // Prefer highest-priority job that is allowed to start under reservation rules.
    for (let i = 0; i < this.pending.length; i += 1) {
      const candidate = this.pending[i];
      if (candidate && this.canStart(candidate)) {
        this.pending.splice(i, 1);
        return candidate;
      }
    }
    return undefined;
  }

  private pump(): void {
    while (this.active < this.concurrency) {
      const next = this.pickNext();
      if (!next) {
        return;
      }
      const urgent = this.isUrgent(next.job.priority);
      this.active += 1;
      if (!urgent) {
        this.activeNonUrgent += 1;
      }
      void next
        .worker(next.job.payload)
        .then((result) => {
          next.resolve({ id: next.job.id, ok: true, result });
        })
        .catch((err: unknown) => {
          next.resolve({
            id: next.job.id,
            ok: false,
            error: err instanceof Error ? err.message : String(err),
          });
        })
        .finally(() => {
          this.active -= 1;
          if (!urgent) {
            this.activeNonUrgent -= 1;
          }
          this.pump();
        });
    }
  }
}
