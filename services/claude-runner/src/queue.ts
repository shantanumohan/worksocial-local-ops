/**
 * Bounded in-process job queue for Claude role runs.
 * Default concurrency: 4 (one slot reserved conceptually for customer-response).
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

export class BoundedQueue<T, R> {
  private readonly concurrency: number;
  private readonly pending: Waiter<T, R>[] = [];
  private active = 0;

  constructor(concurrency = 4) {
    if (concurrency < 1) {
      throw new Error("concurrency must be >= 1");
    }
    this.concurrency = concurrency;
  }

  get pendingCount(): number {
    return this.pending.length;
  }

  get activeCount(): number {
    return this.active;
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

  private pump(): void {
    while (this.active < this.concurrency && this.pending.length > 0) {
      const next = this.pending.shift();
      if (!next) {
        return;
      }
      this.active += 1;
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
          this.pump();
        });
    }
  }
}
